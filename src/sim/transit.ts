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
import type {
  RoadNetworkApi,
  TilePoint,
  TransitFleetSnapshot,
  TransitLine,
  TransitMode,
} from '../shared/types';
import { allocate, defaultFleet, headwayMin, runningCost } from '../shared/transitfleet';

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
  if (!route || line.stops.length === 0) return 0;

  const rates = MODE_RATES[modeOf(line)];

  let nearbyTotal = 0;
  for (const stop of line.stops) {
    nearbyTotal += accessor.nearbyPopulationJobs(stop.x, stop.z, rates.stopRadiusTiles);
  }
  if (nearbyTotal <= 0) return 0;

  const lengthMultiplier =
    1 + Math.min(RIDERSHIP_LENGTH_BONUS_CAP, route.lengthTiles * RIDERSHIP_LENGTH_BONUS_PER_TILE);

  return nearbyTotal * rates.perDemandUnit * lengthMultiplier;
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
  private readonly lines = new Map<number, TransitLine>();
  /** Each line's settled default fleet, by id — see settleDefault. */
  private readonly defaults = new Map<number, number>();
  private nextId = 1;

  constructor(
    network: RoadNetworkApi,
    railNetwork: RoadNetworkApi | null = null,
    tramNetwork: RoadNetworkApi | null = null,
  ) {
    this.network = network;
    this.railNetwork = railNetwork;
    this.tramNetwork = tramNetwork;
  }

  /** The network that carries a line: the streets, the track, or the tram track. */
  private networkFor(line: TransitLine): RoadNetworkApi | null {
    const mode = modeOf(line);
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
    let maxId = 0;
    for (const line of lines) {
      this.lines.set(line.id, { ...line, stops: [...line.stops] });
      maxId = Math.max(maxId, line.id);
    }
    this.nextId = maxId + 1;
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
   */
  tick(
    accessor: PopulationJobsAccessor,
    pools: Readonly<TransitPools> = EMPTY_POOLS,
  ): TransitTickResult {
    const lines = Array.from(this.lines.values()).sort((a, b) => a.id - b.id);
    const routes: (TransitRoute | null)[] = [];
    const demand: number[] = [];
    const requested: number[] = [];

    for (const line of lines) {
      const network = this.networkFor(line);
      const route = network ? routeLine(network, line) : null;
      const riders = estimateRidership(line, route, accessor);
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

    return {
      lines,
      ridership,
      served,
      requested,
      headwayMin: headway,
      runningCost: cost,
      pools: { ...pools },
    };
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
