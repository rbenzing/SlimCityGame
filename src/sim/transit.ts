/**
 * SlimCity transit system.
 *
 * Player-built lines — bus, rail or tram — each carried by whichever network its
 * mode names. This module owns the
 * authoritative in-worker line list (create/update/delete), route
 * computation (A* stop-to-stop concatenation over an INJECTED
 * RoadNetworkApi — never a direct import of src/world/roads.ts, per the
 * sim/render firewall), a statistical ridership estimate (population/jobs
 * near stops + route length — explicitly NO per-agent simulation), and a
 * modest congestion-relief hook that feeds
 * ridership back into the road network's assigned volume.
 *
 * Deterministic: no Math.random, no Date.now. Line ids come from a simple
 * monotonic counter (never reused within a session, matching the
 * BuildingInstance.id convention in src/world/buildings.ts), and every
 * numeric formula below is a pure function of its inputs.
 */
import {
  pathRoute,
  type GraphEdge,
  type PathResult,
  type RoadNetworkApi,
  type TilePoint,
  type TransitFleetSnapshot,
  type TransitLine,
  type TransitMode,
} from '../shared/types';
import { TICK_RATE } from '../shared/constants';
import {
  allocate,
  defaultFleet,
  headwayMin,
  runningCost,
  SERVICE_END_HOUR,
  SERVICE_START_HOUR,
} from '../shared/transitfleet';
import type { DeadRunStart } from './deadruns';
import { dayHourFromTick } from './traffic';
import type { StopRegistry } from './stops';

// ---------------------------------------------------------------------------
// Registry access (injected — this module never touches GridState/BuildingInstance
// directly, so it stays decoupled from the world/economy modules' shapes).
// ---------------------------------------------------------------------------

/**
 * Statistical demand accessor injected by the worker wiring: given a tile
 * coordinate and a search radius (tiles), returns the total nearby
 * population + jobs (whatever the caller considers "nearby" — e.g. a
 * road-BFS or euclidean scan over BuildingInstance/catalog data). Kept as a
 * single numeric callback so this module never imports world/economy types.
 */
export interface PopulationJobsAccessor {
  nearbyPopulationJobs(x: number, z: number, radiusTiles: number): number;
}

/** A line's computed road-network route: concatenated stop->stop A* paths. */
export interface TransitRoute {
  /** World-space tile centers along the whole route, in stop order. */
  points: TilePoint[];
  /** Every road-graph edge id traversed (may repeat if the route backtracks). */
  edges: number[];
  /** Approximate route length in tiles (points.length). */
  lengthTiles: number;
}

// ---------------------------------------------------------------------------
// Tunables (documented, not magic — mirrors src/sim/traffic.ts's convention).
// ---------------------------------------------------------------------------

/** A line needs at least 2 stops to have a route at all. */
export const MIN_STOPS_FOR_ROUTE = 2;

/** Search radius (tiles) around each stop for nearby population/jobs. */
export const RIDERSHIP_STOP_RADIUS_TILES = 8;

/** Riders per unit of nearby population+jobs, summed across every stop. */
export const RIDERSHIP_PER_DEMAND_UNIT = 0.15;

/**
 * A longer route serves more distinct neighborhoods end-to-end, so it earns
 * a modest ridership bonus per route tile -- capped so an extremely long
 * line doesn't scale ridership without bound.
 */
export const RIDERSHIP_LENGTH_BONUS_PER_TILE = 0.01;
export const RIDERSHIP_LENGTH_BONUS_CAP = 2; // multiplier caps at 1 + this = 3x

/**
 * Riders relieved off each traversed road edge's assigned volume, per rider.
 * A "modest" feedback: intentionally small relative to
 * TrafficSystem's own +1-per-trip volume additions.
 */
export const CONGESTION_RELIEF_PER_RIDER = 0.02;

/**
 * What differs between the modes, and nothing else does. People walk further to
 * a train than to a bus stop and a train carries more of them, so rail draws on
 * a wider catchment at a higher rate; a tram sits between the two, because a
 * fixed visible route earns a longer walk than a bus stop but not a station's.
 * It is the same statistical estimate throughout, not a model per mode.
 */
export const MODE_RATES: Record<TransitMode, { stopRadiusTiles: number; perDemandUnit: number }> = {
  bus: { stopRadiusTiles: RIDERSHIP_STOP_RADIUS_TILES, perDemandUnit: RIDERSHIP_PER_DEMAND_UNIT },
  rail: { stopRadiusTiles: 14, perDemandUnit: 0.28 },
  tram: { stopRadiusTiles: 10, perDemandUnit: 0.2 },
};

/** A line with no mode is a bus line — see TransitLine.mode. */
export function modeOf(line: TransitLine): TransitMode {
  return line.mode ?? 'bus';
}

const MODES: readonly TransitMode[] = ['bus', 'rail', 'tram'];

/** A depot fielding vehicles this tick, as the assignment needs it (a ConnectedDepot fits). */
export interface FleetDepot {
  id: number;
  mode: TransitMode;
  /** The vehicles it fields. */
  fields: number;
  /** The tiles of its footprint; its gate is the one nearest the network. */
  tiles: readonly TilePoint[];
}

/**
 * A depot's gate: the footprint tile nearest the network, measured to the node
 * the network snaps the tile to. The first tile stands in where nothing snaps.
 */
export function gateOf(depot: FleetDepot, network: RoadNetworkApi): TilePoint {
  const nodesById = new Map(network.getNodes().map((n) => [n.id, n] as const));
  let best = depot.tiles[0] ?? { x: 0, z: 0 };
  let bestDist = Infinity;
  for (const tile of depot.tiles) {
    const id = network.nearestNode(tile.x, tile.z);
    if (id === null) continue;
    const node = nodesById.get(id);
    if (!node) continue;
    const d = Math.abs(node.x - tile.x) + Math.abs(node.z - tile.z);
    if (d < bestDist) {
      bestDist = d;
      best = tile;
    }
  }
  return best;
}

/** Ticks between the buses a line releases on a dead run: its headway, never under a tick. */
export function deadRunHeadwayTicks(headway: number): number {
  return Math.max(1, Math.round(headway * 60 * TICK_RATE));
}

/** True when the clock passed `hour` between the last tick and this one. */
function crossed(prevHour: number, hour: number, at: number): boolean {
  return prevHour < at && hour >= at;
}

/**
 * A line's dead-run paths, one per connected depot of its mode from the
 * depot's gate to the line's first stop, with what they were found against:
 * the route and the depots as they stood, and the graph's own edge objects,
 * since a rebuilt graph hands out new ones under the same ids.
 */
interface DeadRunPaths {
  routeKey: string;
  depotKey: string;
  byDepot: Map<number, PathResult | null>;
  edgeRefs: Map<number, GraphEdge>;
}

// ---------------------------------------------------------------------------
// Route computation (pure, given an injected RoadNetworkApi).
// ---------------------------------------------------------------------------

/**
 * Concatenates each consecutive stop pair's A* path (via the injected
 * network's own findPath) into one whole-line route. Returns null if the
 * line has fewer than MIN_STOPS_FOR_ROUTE stops, or if any leg is
 * unreachable. Junction tiles shared between consecutive legs (leg i's last
 * point === leg i+1's first point, since both resolve to the same nearest
 * graph node) are de-duplicated, exactly like src/world/pathfind.ts dedupes
 * edge-to-edge seams within a single findPath call.
 */
export function routeLine(network: RoadNetworkApi, line: TransitLine): TransitRoute | null {
  const stops = line.stops;
  if (stops.length < MIN_STOPS_FOR_ROUTE) return null;

  const points: TilePoint[] = [];
  const edges: number[] = [];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    const leg = network.findPath(from, to);
    if (!leg) return null;

    edges.push(...leg.edges);
    const start = i === 0 ? 0 : 1; // skip the point shared with the previous leg's end
    for (let k = start; k < leg.points.length; k += 1) {
      points.push(leg.points[k]!);
    }
  }

  return { points, edges, lengthTiles: points.length };
}

// ---------------------------------------------------------------------------
// Ridership estimate (pure, statistical -- no per-agent sim).
// ---------------------------------------------------------------------------

/**
 * Statistical ridership estimate: sums nearby population+jobs across every
 * stop (via the injected accessor), scaled by a per-demand-unit rate and a
 * modest, capped route-length bonus. Returns 0 for a null route (unrouteable
 * line) or a line with no stops. Monotonic non-decreasing in every stop's
 * nearby population/jobs figure, holding the route fixed.
 */
export function estimateRidership(
  line: TransitLine,
  route: TransitRoute | null,
  accessor: PopulationJobsAccessor,
): number {
  return ridershipOf(ridershipTerms(line, route, accessor));
}

/** What a line's ridership is made of: each stop's nearby demand, and the factors that scale it. */
interface RidershipTerms {
  /** Nearby population + jobs at each stop, in stop order. */
  demand: number[];
  perDemandUnit: number;
  lengthMultiplier: number;
}

function ridershipTerms(
  line: TransitLine,
  route: TransitRoute | null,
  accessor: PopulationJobsAccessor,
): RidershipTerms | null {
  if (!route || line.stops.length === 0) return null;
  const rates = MODE_RATES[modeOf(line)];
  const demand = line.stops.map((stop) =>
    accessor.nearbyPopulationJobs(stop.x, stop.z, rates.stopRadiusTiles),
  );
  const lengthMultiplier =
    1 + Math.min(RIDERSHIP_LENGTH_BONUS_CAP, route.lengthTiles * RIDERSHIP_LENGTH_BONUS_PER_TILE);
  return { demand, perDemandUnit: rates.perDemandUnit, lengthMultiplier };
}

function ridershipOf(terms: RidershipTerms | null): number {
  if (!terms) return 0;
  let nearbyTotal = 0;
  for (const d of terms.demand) nearbyTotal += d;
  if (nearbyTotal <= 0) return 0;
  return nearbyTotal * terms.perDemandUnit * terms.lengthMultiplier;
}

// ---------------------------------------------------------------------------
// Congestion relief hook (pure function the worker tick calls).
// ---------------------------------------------------------------------------

/**
 * Reduces assigned road volume along `route`'s traversed edges,
 * proportional to `ridership` -- riders diverted off the road onto the bus.
 * Each distinct edge (de-duplicated, in case the route revisits one) is
 * relieved independently and clamped so it never goes negative (this
 * function only ever calls network.addVolume with a per-edge amount bounded
 * by that edge's own current volume, read via network.getEdges()). A no-op
 * for a null route or non-positive ridership.
 */
export function applyRidershipRelief(
  network: RoadNetworkApi,
  route: TransitRoute | null,
  ridership: number,
): void {
  if (!route || ridership <= 0 || route.edges.length === 0) return;

  const relief = ridership * CONGESTION_RELIEF_PER_RIDER;
  if (relief <= 0) return;

  const edgesById = new Map(network.getEdges().map((e) => [e.id, e] as const));
  for (const edgeId of new Set(route.edges)) {
    const edge = edgesById.get(edgeId);
    if (!edge || edge.volume <= 0) continue;
    const amount = -Math.min(relief, edge.volume);
    network.addVolume([edgeId], amount);
  }
}

/**
 * Rail's version of the relief above, and the one formula in the epic that is
 * not the bus one reused.
 *
 * A bus relieves the road edges it drives over, which is right because those
 * are the streets its riders would otherwise have driven. A train drives over
 * no road edge at all, so that rule would relieve nothing. Its riders' car
 * trips would instead have STARTED or ENDED at a station, so the relief lands
 * on the streets meeting each station's door — the road nodes nearest the
 * stops, and the edges incident to them.
 *
 * A station with no street within reach relieves nothing, which is correct: it
 * has taken no car off any road, because nobody could drive there anyway.
 */
export function applyStationRelief(
  roadNetwork: RoadNetworkApi,
  line: TransitLine,
  ridership: number,
): void {
  if (ridership <= 0 || line.stops.length === 0) return;
  const relief = ridership * CONGESTION_RELIEF_PER_RIDER;
  if (relief <= 0) return;

  const nodesById = new Map(roadNetwork.getNodes().map((n) => [n.id, n] as const));
  const edgesById = new Map(roadNetwork.getEdges().map((e) => [e.id, e] as const));

  // Deduplicated: two stops sharing a doorstep street relieve it once, not
  // twice, exactly as a bus route revisiting an edge relieves it once.
  const doorstep = new Set<number>();
  for (const stop of line.stops) {
    const nodeId = roadNetwork.nearestNode(stop.x, stop.z);
    if (nodeId === null) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;
    for (const edgeId of node.edges) doorstep.add(edgeId);
  }

  for (const edgeId of doorstep) {
    const edge = edgesById.get(edgeId);
    if (!edge || edge.volume <= 0) continue;
    roadNetwork.addVolume([edgeId], -Math.min(relief, edge.volume));
  }
}

// ---------------------------------------------------------------------------
// TransitSystem -- the worker's authoritative line list.
// ---------------------------------------------------------------------------

/** Snapshot payload shape matching SimSnapshot.transit (shared/types.ts). */
export interface TransitTickResult extends TransitFleetSnapshot {
  lines: TransitLine[];
  /** Daily boardings each line carries, index-aligned with `lines`: the estimate scaled by served over requested. */
  ridership: number[];
  /** The depot fielding most of each line, by building id; null where none does. */
  depotId: (number | null)[];
  /** The vehicles each depot has out on the lines, by building id. */
  inService: Map<number, number>;
  /** The dead runs starting this tick: the bus lines' pull-out at 05:00 and pull-in at 23:00. */
  deadRuns: DeadRunStart[];
}

/** The vehicles each mode's connected depots field this tick. */
export type TransitPools = Record<TransitMode, number>;

export const EMPTY_POOLS: Readonly<TransitPools> = { bus: 0, rail: 0, tram: 0 };

/** A tick with no lines, and no pools: what every system starts from. */
export function emptyTransitResult(): TransitTickResult {
  return {
    lines: [],
    ridership: [],
    served: [],
    requested: [],
    headwayMin: [],
    runningCost: [],
    pools: { ...EMPTY_POOLS },
    depotId: [],
    inService: new Map(),
    deadRuns: [],
  };
}

/**
 * The fleet a line runs by default, held steady across small moves in its
 * ridership. A fresh derivation one vehicle under the standing figure keeps
 * the standing figure; any larger fall, and any rise, takes the fresh one. So a
 * line whose ridership sits on the edge between n and n + 1 buses settles on
 * n + 1 rather than adding and shedding a bus every tick.
 */
export function settleDefault(previous: number | undefined, fresh: number): number {
  if (previous === undefined) return fresh;
  if (fresh > previous) return fresh;
  if (fresh === previous - 1) return previous;
  return fresh;
}

/** The vehicles a line asks for: the player's figure, or the settled default. */
function requestedOf(line: TransitLine, settled: number): number {
  if (line.vehicles !== undefined) return Math.max(0, Math.floor(line.vehicles));
  return settled;
}

export class TransitSystem {
  private readonly network: RoadNetworkApi;
  /**
   * The train network. Null in a context that has no rail (existing callers and
   * tests), in which case a rail line simply has no route — the same answer as
   * a bus line whose stops nothing connects.
   */
  private readonly railNetwork: RoadNetworkApi | null;
  /**
   * The tram network — the tram tiles alone, a subset of the streets rather
   * than a world apart like the rail one. Null where there is no tram track, in
   * which case a tram line has no route, exactly as for rail.
   */
  private readonly tramNetwork: RoadNetworkApi | null;
  /**
   * The bus stops standing. Null in a context with none (existing callers and
   * tests), in which case a bus line's stops are unchecked points.
   */
  private readonly stops: StopRegistry | null;
  private readonly lines = new Map<number, TransitLine>();
  /** Each line's settled default fleet, by id — see settleDefault. */
  private readonly defaults = new Map<number, number>();
  /** Each line's dead-run paths, by id — see DeadRunPaths. */
  private readonly deadRunPaths = new Map<number, DeadRunPaths>();
  /** The last tick ticked, for telling when the clock crosses the service span's ends. */
  private lastTick: number | null = null;
  private nextId = 1;

  constructor(
    network: RoadNetworkApi,
    railNetwork: RoadNetworkApi | null = null,
    tramNetwork: RoadNetworkApi | null = null,
    stops: StopRegistry | null = null,
  ) {
    this.network = network;
    this.railNetwork = railNetwork;
    this.tramNetwork = tramNetwork;
    this.stops = stops;
  }

  /** The network that carries a line: the streets, the track, or the tram track. */
  private networkFor(line: TransitLine): RoadNetworkApi | null {
    return this.networkOf(modeOf(line));
  }

  private networkOf(mode: TransitMode): RoadNetworkApi | null {
    if (mode === 'rail') return this.railNetwork;
    if (mode === 'tram') return this.tramNetwork;
    return this.network;
  }

  /** Creates a new line; the worker always assigns the id (ignores any caller-supplied id). */
  createLine(
    stops: TilePoint[],
    color: number,
    mode: TransitMode = 'bus',
    vehicles?: number,
  ): TransitLine {
    const line: TransitLine = { id: this.nextId, stops: [...stops], color, mode };
    if (vehicles !== undefined) line.vehicles = vehicles;
    this.lines.set(line.id, line);
    this.nextId += 1;
    return line;
  }

  /**
   * Replaces an existing line's stops, colour and requested fleet. Returns
   * null if `id` doesn't exist. A `vehicles` left out puts the line back on
   * its derived default.
   */
  updateLine(
    id: number,
    stops: TilePoint[],
    color: number,
    mode?: TransitMode,
    vehicles?: number,
  ): TransitLine | null {
    const prev = this.lines.get(id);
    if (!prev) return null;
    // A line does not change what carries it on an edit: an update that omits
    // the mode keeps the one the line was created with.
    const line: TransitLine = { id, stops: [...stops], color, mode: mode ?? modeOf(prev) };
    if (vehicles !== undefined) line.vehicles = vehicles;
    this.lines.set(id, line);
    return line;
  }

  /** Removes the line with `id`. Returns whether a line was actually removed. */
  deleteLine(id: number): boolean {
    this.defaults.delete(id);
    this.deadRunPaths.delete(id);
    return this.lines.delete(id);
  }

  getLines(): readonly TransitLine[] {
    return Array.from(this.lines.values());
  }

  /**
   * Replaces the line list from a save. `nextId` resumes past the highest id
   * restored, so a line created after loading can never collide with one that
   * came out of the save — the same never-reuse rule createLine follows within
   * a session.
   */
  restore(lines: readonly TransitLine[]): void {
    this.lines.clear();
    this.defaults.clear();
    this.deadRunPaths.clear();
    this.lastTick = null;
    let maxId = 0;
    for (const line of lines) {
      // A bus line keeps only the stops that stand; the rest are dropped.
      const stops = this.mustHoldStop(modeOf(line))
        ? line.stops.filter((s) => this.stops!.hasStop(s.x, s.z))
        : line.stops;
      this.lines.set(line.id, { ...line, stops: [...stops] });
      maxId = Math.max(maxId, line.id);
    }
    this.nextId = maxId + 1;
  }

  /** Bus stops are street tiles holding a stop, where a registry is wired. */
  private mustHoldStop(mode: TransitMode): boolean {
    return mode === 'bus' && this.stops !== null;
  }

  /** Whether `stops` may carry a line of `mode`: a bus line names only tiles that hold a stop. */
  acceptsStops(mode: TransitMode, stops: readonly TilePoint[]): boolean {
    return !this.mustHoldStop(mode) || stops.every((s) => this.stops!.hasStop(s.x, s.z));
  }

  /**
   * Takes the tile off every bus line that names it, for when its last stop is
   * gone. Returns each edited line as it stood before, so the edit can be undone.
   */
  dropStopTile(x: number, z: number): TransitLine[] {
    const before: TransitLine[] = [];
    for (const line of this.lines.values()) {
      if (modeOf(line) !== 'bus' || !line.stops.some((s) => s.x === x && s.z === z)) continue;
      before.push({ ...line, stops: [...line.stops] });
      line.stops = line.stops.filter((s) => s.x !== x || s.z !== z);
    }
    return before;
  }

  getLine(id: number): TransitLine | undefined {
    return this.lines.get(id);
  }

  /** This line's current route over whichever network carries it, or null. */
  route(id: number): TransitRoute | null {
    const line = this.lines.get(id);
    if (!line) return null;
    const network = this.networkFor(line);
    return network ? routeLine(network, line) : null;
  }

  /** This line's current statistical ridership estimate, or 0 (see estimateRidership). */
  ridership(id: number, accessor: PopulationJobsAccessor): number {
    const line = this.lines.get(id);
    if (!line) return 0;
    return estimateRidership(line, this.route(id), accessor);
  }

  /**
   * One sim-tick's worth of work for every line, in ascending id: recompute
   * its route and ridership, ask the vehicles it needs, share each mode's
   * pool out over its lines, scale what each line carries by the share it got,
   * apply the congestion-relief hook, and return the SimSnapshot.transit-shaped
   * result (lines[i] <-> ridership[i] <-> served[i]). A mode whose pool is
   * zero serves nothing on every line of it, which is the plain case of the
   * allocation and not a rule beside it.
   *
   * With `depots`, each line's served vehicles are taken from the nearest
   * depot of its mode with vehicles left, nearest by path cost from the depot's
   * gate to the line's first stop, spilling to the next; and with `tickNo`,
   * the tick the clock crosses 05:00 sends every bus line's vehicles out along
   * that path (its volume on the road graph, its buses in `deadRuns`) and the
   * tick it crosses 23:00 sends them back, once each per day.
   */
  tick(
    accessor: PopulationJobsAccessor,
    pools: Readonly<TransitPools> = EMPTY_POOLS,
    depots: readonly FleetDepot[] = [],
    tickNo?: number,
  ): TransitTickResult {
    const lines = Array.from(this.lines.values()).sort((a, b) => a.id - b.id);
    const routes: (TransitRoute | null)[] = [];
    const demand: number[] = [];
    const requested: number[] = [];
    this.stops?.clearBoardings();

    for (const line of lines) {
      const network = this.networkFor(line);
      const route = network ? routeLine(network, line) : null;
      const terms = ridershipTerms(line, route, accessor);
      const riders = ridershipOf(terms);
      // A bus stop's boardings are its own demand through the same rate and
      // length bonus as the line's ridership, before the fleet's share is taken.
      if (terms && this.stops && modeOf(line) === 'bus') {
        line.stops.forEach((stop, k) => {
          this.stops!.addBoardings(
            stop,
            terms.demand[k]! * terms.perDemandUnit * terms.lengthMultiplier,
          );
        });
      }
      const lengthTiles = route?.lengthTiles ?? 0;
      const settled = settleDefault(
        this.defaults.get(line.id),
        defaultFleet(modeOf(line), riders, lengthTiles),
      );
      this.defaults.set(line.id, settled);
      routes.push(route);
      demand.push(riders);
      requested.push(requestedOf(line, settled));
    }

    const served = new Array<number>(lines.length).fill(0);
    for (const mode of ['bus', 'rail', 'tram'] as const) {
      const members = lines.flatMap((line, i) => (modeOf(line) === mode ? [i] : []));
      const share = allocate(
        members.map((i) => requested[i]!),
        pools[mode],
      );
      members.forEach((i, k) => {
        served[i] = share[k]!;
      });
    }

    const ridership: number[] = [];
    const headway: number[] = [];
    const cost: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const mode = modeOf(line);
      const want = requested[i]!;
      const got = served[i]!;
      const riders = want > 0 ? (demand[i]! * got) / want : 0;
      this.relieve(line, routes[i]!, riders);
      ridership.push(riders);
      headway.push(headwayMin(mode, routes[i]?.lengthTiles ?? 0, got));
      cost.push(runningCost(mode, got));
    }

    const { depotId, inService, paths } = this.assign(lines, routes, served, depots);
    const deadRuns = this.crossings(lines, paths, served, headway, tickNo);

    return {
      lines,
      ridership,
      served,
      requested,
      headwayMin: headway,
      runningCost: cost,
      pools: { ...pools },
      depotId,
      inService,
      deadRuns,
    };
  }

  /**
   * Which depot each line's vehicles come from. Per mode, the lines in id
   * order take their served vehicles from the nearest connected depot with
   * vehicles left — nearest by path cost from the depot's gate to the line's
   * first stop, ties by depot id — and spill to the next nearest when it runs
   * dry. A line's depot is the one fielding most of it, the nearer on a tie,
   * and its dead-run path is that depot's. A depot no path reaches fields
   * nothing for the line.
   */
  private assign(
    lines: readonly TransitLine[],
    routes: readonly (TransitRoute | null)[],
    served: readonly number[],
    depots: readonly FleetDepot[],
  ): {
    depotId: (number | null)[];
    inService: Map<number, number>;
    paths: (PathResult | null)[];
  } {
    const depotId: (number | null)[] = new Array<number | null>(lines.length).fill(null);
    const paths: (PathResult | null)[] = new Array<PathResult | null>(lines.length).fill(null);
    const inService = new Map<number, number>();

    for (const mode of MODES) {
      const fleet = depots.filter((d) => d.mode === mode).sort((a, b) => a.id - b.id);
      const network = this.networkOf(mode);
      const left = new Map(fleet.map((d) => [d.id, d.fields] as const));
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]!;
        if (modeOf(line) !== mode) continue;
        const route = routes[i];
        if (!route || !network || fleet.length === 0) {
          this.deadRunPaths.delete(line.id);
          continue;
        }
        const byDepot = this.deadRunPathsFor(line, route, fleet, network);
        if (served[i]! <= 0) continue;

        const reachable = fleet
          .filter((d) => byDepot.get(d.id))
          .sort((a, b) => byDepot.get(a.id)!.cost - byDepot.get(b.id)!.cost || a.id - b.id);
        let need = served[i]!;
        let best: { id: number; took: number } | null = null;
        for (const depot of reachable) {
          const take = Math.min(need, left.get(depot.id) ?? 0);
          if (take <= 0) continue;
          left.set(depot.id, (left.get(depot.id) ?? 0) - take);
          inService.set(depot.id, (inService.get(depot.id) ?? 0) + take);
          need -= take;
          if (!best || take > best.took) best = { id: depot.id, took: take };
          if (need === 0) break;
        }
        if (best) {
          depotId[i] = best.id;
          paths[i] = byDepot.get(best.id) ?? null;
        }
      }
    }
    return { depotId, inService, paths };
  }

  /**
   * A line's dead-run paths, cached and found again only when its route or
   * the mode's depots changed since, or the graph was rebuilt under them.
   */
  private deadRunPathsFor(
    line: TransitLine,
    route: TransitRoute,
    fleet: readonly FleetDepot[],
    network: RoadNetworkApi,
  ): Map<number, PathResult | null> {
    const first = line.stops[0]!;
    const routeKey = `${first.x},${first.z}:${route.edges.join(',')}`;
    const depotKey = fleet.map((d) => d.id).join(',');
    const edgesById = new Map(network.getEdges().map((e) => [e.id, e] as const));
    const cached = this.deadRunPaths.get(line.id);
    if (cached && cached.routeKey === routeKey && cached.depotKey === depotKey) {
      let fresh = true;
      for (const [id, edge] of cached.edgeRefs) {
        if (edgesById.get(id) !== edge) {
          fresh = false;
          break;
        }
      }
      if (fresh) return cached.byDepot;
    }

    const byDepot = new Map<number, PathResult | null>();
    const edgeRefs = new Map<number, GraphEdge>();
    for (const depot of fleet) {
      const path = network.findPath(gateOf(depot, network), first);
      byDepot.set(depot.id, path);
      for (const id of path?.edges ?? []) {
        const edge = edgesById.get(id);
        if (edge) edgeRefs.set(id, edge);
      }
    }
    this.deadRunPaths.set(line.id, { routeKey, depotKey, byDepot, edgeRefs });
    return byDepot;
  }

  /**
   * The dead runs the clock starts this tick. When it crosses 05:00 every bus
   * line with a path loads its served vehicles onto each edge of it, the
   * pull-out, and its buses leave the gate for the first stop; when it crosses
   * 23:00 the same again the other way, the pull-in. A tram or a train
   * dead-runs over its own graph, which carries no traffic, and no vehicle
   * kind draws it, so neither loads or animates anything here.
   */
  private crossings(
    lines: readonly TransitLine[],
    paths: readonly (PathResult | null)[],
    served: readonly number[],
    headway: readonly number[],
    tickNo: number | undefined,
  ): DeadRunStart[] {
    if (tickNo === undefined) return [];
    const prevHour = dayHourFromTick(this.lastTick ?? tickNo - 1);
    const hour = dayHourFromTick(tickNo);
    this.lastTick = tickNo;
    const pullOut = crossed(prevHour, hour, SERVICE_START_HOUR);
    const pullIn = crossed(prevHour, hour, SERVICE_END_HOUR);
    if (!pullOut && !pullIn) return [];

    const runs: DeadRunStart[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const path = paths[i];
      const count = served[i]!;
      if (modeOf(line) !== 'bus' || !path || count <= 0) continue;
      this.network.addVolume(path.edges, count);
      // A copy: the path's own route is cached, and the pull-in drives it backwards.
      const route = [...pathRoute(path)];
      if (pullIn) route.reverse();
      runs.push({
        lineId: line.id,
        route,
        count,
        headwayTicks: deadRunHeadwayTicks(headway[i]!),
      });
    }
    return runs;
  }

  /**
   * Feeds a line's riders back into the road network as relieved volume.
   *
   * A bus relieves the streets it drives, and its route is already a road-graph
   * route. A train relieves the streets at its stations' doors, because it
   * drives none of them. A tram drives streets like the bus — but its route came
   * off the TRAM graph, whose edge ids are its own numbering, so the same
   * integer names a different street in the road graph. Relieving by those ids
   * would quietly improve traffic somewhere else in the city, so a tram's relief
   * route is recomputed against the roads, which can carry it because tram track
   * is a street.
   */
  private relieve(line: TransitLine, route: TransitRoute | null, riders: number): void {
    if (riders <= 0) return;
    const mode = modeOf(line);
    if (mode === 'rail') {
      applyStationRelief(this.network, line, riders);
      return;
    }
    applyRidershipRelief(
      this.network,
      mode === 'tram' ? routeLine(this.network, line) : route,
      riders,
    );
  }
}
