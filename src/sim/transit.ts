/**
 * SlimCity bus transit system.
 *
 * Player-built bus lines over the existing road graph. This module owns the
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
import type { RoadNetworkApi, TilePoint, TransitLine } from '../shared/types';

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

  let nearbyTotal = 0;
  for (const stop of line.stops) {
    nearbyTotal += accessor.nearbyPopulationJobs(stop.x, stop.z, RIDERSHIP_STOP_RADIUS_TILES);
  }
  if (nearbyTotal <= 0) return 0;

  const lengthMultiplier =
    1 + Math.min(RIDERSHIP_LENGTH_BONUS_CAP, route.lengthTiles * RIDERSHIP_LENGTH_BONUS_PER_TILE);

  return nearbyTotal * RIDERSHIP_PER_DEMAND_UNIT * lengthMultiplier;
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

// ---------------------------------------------------------------------------
// TransitSystem -- the worker's authoritative line list.
// ---------------------------------------------------------------------------

/** Snapshot payload shape matching SimSnapshot.transit (shared/types.ts). */
export interface TransitTickResult {
  lines: TransitLine[];
  ridership: number[];
}

export class TransitSystem {
  private readonly network: RoadNetworkApi;
  private readonly lines = new Map<number, TransitLine>();
  private nextId = 1;

  constructor(network: RoadNetworkApi) {
    this.network = network;
  }

  /** Creates a new line; the worker always assigns the id (ignores any caller-supplied id). */
  createLine(stops: TilePoint[], color: number): TransitLine {
    const line: TransitLine = { id: this.nextId, stops: [...stops], color };
    this.lines.set(line.id, line);
    this.nextId += 1;
    return line;
  }

  /** Replaces an existing line's stops/color. Returns null if `id` doesn't exist. */
  updateLine(id: number, stops: TilePoint[], color: number): TransitLine | null {
    if (!this.lines.has(id)) return null;
    const line: TransitLine = { id, stops: [...stops], color };
    this.lines.set(id, line);
    return line;
  }

  /** Removes the line with `id`. Returns whether a line was actually removed. */
  deleteLine(id: number): boolean {
    return this.lines.delete(id);
  }

  getLines(): readonly TransitLine[] {
    return Array.from(this.lines.values());
  }

  getLine(id: number): TransitLine | undefined {
    return this.lines.get(id);
  }

  /** This line's current road-network route, or null (see routeLine). */
  route(id: number): TransitRoute | null {
    const line = this.lines.get(id);
    return line ? routeLine(this.network, line) : null;
  }

  /** This line's current statistical ridership estimate, or 0 (see estimateRidership). */
  ridership(id: number, accessor: PopulationJobsAccessor): number {
    const line = this.lines.get(id);
    if (!line) return 0;
    return estimateRidership(line, routeLine(this.network, line), accessor);
  }

  /**
   * One sim-tick's worth of work for every line: recompute its route +
   * ridership, apply the congestion-relief hook, and return the
   * SimSnapshot.transit-shaped result (lines[i] <-> ridership[i]).
   */
  tick(accessor: PopulationJobsAccessor): TransitTickResult {
    const lines: TransitLine[] = [];
    const ridership: number[] = [];

    for (const line of this.lines.values()) {
      const route = routeLine(this.network, line);
      const riders = estimateRidership(line, route, accessor);
      applyRidershipRelief(this.network, route, riders);
      lines.push(line);
      ridership.push(riders);
    }

    return { lines, ridership };
  }
}
