/**
 * SlimCity scalar-field simulation.
 *
 * Nine Uint8 layers per tile (see FieldId in shared/types.ts) that emit,
 * diffuse and decay each tick - the classic diffusing-field trick. All math is
 * integer/fixed-point so the sim stays deterministic across machines.
 *
 * ---- Fixed-point constants (numerator over 256; applied as `(x * N) >> 8`) ----
 *
 * Neighbor blend (same for every diffusing field):
 *   self     0.6  -> SELF_NUM = 154/256 (0.60156)
 *   neighbor 0.4  -> NEI_NUM  = 102/256 (0.39844)
 *   (154 + 102 = 256 exactly, so the blend step alone conserves total mass;
 *   only the decay multiply below actually removes mass from the system.)
 *
 * Per-field decay (tick() stagger schedule):
 *   Pollution  0.97  -> 248/256 (0.96875)
 *   Noise      0.90  -> 230/256 (0.89844)
 *   Traffic    0.92  -> 236/256 (0.92188)
 *   Crime      0.985 -> 252/256 (0.98438)
 *   FireRisk   0.99  -> 253/256 (0.98828)
 *   LandValue  0.995 -> 255/256 (0.99609)
 *   Education  0.99  -> 253/256 (0.98828)
 *   Health     0.99  -> 253/256 (0.98828)
 *
 * Neighbor averaging is 4-neighbor (von Neumann: N/E/S/W, no corners) so the
 * divide is an exact `>> 2`. Map-edge tiles substitute self for a missing
 * neighbor (Neumann/reflective boundary) - this keeps every tile's neighbor
 * count exactly 4 and keeps the blend mass-preserving at the edges too,
 * instead of artificially dragging border tiles toward zero.
 *
 * LandValue additionally applies a proximity formula on top of its own
 * diffusion pass (documented on applyLandValueDecay below), and Happiness is
 * not diffused at all - it's a pure per-tile recompute of the other fields
 * each time its slot comes up (documented on computeHappiness below).
 */

import { FieldId, type GraphEdge, type GridState } from '../shared/types';
import { MAP_SIZE, MAP_TILES, inBounds, tileIndex } from '../shared/constants';

// --- shared blend weights (numerator / 256) ---------------------------------
const SELF_NUM = 154;
const NEI_NUM = 102;

// --- traffic emission normalizer (edge.tier * 800) --------------------------
const TRAFFIC_CAPACITY_PER_TIER = 800;

/** Clamp to a valid byte, truncating any fractional part. Never wraps. */
function clampByte(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return v | 0;
}

interface DiffusingFieldSchedule {
  readonly field: FieldId;
  readonly period: number;
  readonly offset: number;
  readonly decayNum: number;
}

/**
 * Stagger schedule: each field only runs on its own modulo
 * slot so a single tick never diffuses everything. Offsets within a period
 * are all distinct, so at most one field per period-group updates on any
 * given tick.
 *
 * LandValue is listed first (rather than grouped with the other period-8
 * fields in field-id order) because on ticks where its period-8 slot
 * coincides with Pollution's period-4 slot (every 8 ticks: both are offset
 * 0), LandValue's pass reads Pollution/Noise/Crime as inputs - listing it
 * first guarantees it always reads last tick's settled values rather than a
 * value Pollution's own pass just mutated earlier in the same tick() call.
 */
const DIFFUSING_FIELDS: readonly DiffusingFieldSchedule[] = [
  { field: FieldId.LandValue, period: 8, offset: 0, decayNum: 255 },
  { field: FieldId.Crime, period: 8, offset: 1, decayNum: 252 },
  { field: FieldId.FireRisk, period: 8, offset: 2, decayNum: 253 },
  { field: FieldId.Education, period: 8, offset: 3, decayNum: 253 },
  { field: FieldId.Health, period: 8, offset: 4, decayNum: 253 },
  { field: FieldId.Pollution, period: 4, offset: 0, decayNum: 248 },
  { field: FieldId.Noise, period: 4, offset: 1, decayNum: 230 },
  { field: FieldId.Traffic, period: 4, offset: 2, decayNum: 236 },
];

const HAPPINESS_PERIOD = 8;
const HAPPINESS_OFFSET = 5;

export class FieldSim {
  /** Reusable double-buffer for diffusion passes; sized once, never reallocated. */
  private readonly scratch: Uint8Array;

  constructor() {
    this.scratch = new Uint8Array(MAP_TILES);
  }

  /** Saturating add at the source tile. No-op if (x, z) is out of bounds. */
  emit(g: GridState, field: FieldId, x: number, z: number, amount: number): void {
    if (!inBounds(x, z)) return;
    const arr = g.fields[field]!;
    const i = tileIndex(x, z);
    arr[i] = clampByte(arr[i]! + amount);
  }

  /**
   * Advances the fields by one tick. Only the fields/happiness pass whose
   * stagger slot matches `tickNo` actually run (see DIFFUSING_FIELDS above).
   */
  tick(g: GridState, tickNo: number): void {
    for (const sched of DIFFUSING_FIELDS) {
      if (tickNo % sched.period !== sched.offset) continue;
      if (sched.field === FieldId.LandValue) {
        this.applyLandValueDecay(g, sched.decayNum);
      } else {
        this.applyPlainDecay(g.fields[sched.field]!, sched.decayNum);
      }
    }
    if (tickNo % HAPPINESS_PERIOD === HAPPINESS_OFFSET) {
      this.computeHappiness(g);
    }
  }

  /**
   * Traffic emission: zero the Traffic field, then for every
   * edge write a saturating `min(255, 255 * volume / capacity)` level along
   * its tiles, where capacity = edge.tier * 800 (avoids importing RoadSpec).
   * A zero-tier edge with positive volume is treated as fully congested
   * rather than dividing by zero. Writes are additive/saturating so tiles
   * shared by two edges (e.g. an intersection) combine sensibly instead of
   * one overwriting the other. Meant to be called once per traffic
   * assignment cycle, before the next scheduled Traffic diffusion pass.
   */
  applyTraffic(g: GridState, edges: readonly GraphEdge[]): void {
    const traffic = g.fields[FieldId.Traffic]!;
    traffic.fill(0);
    for (const edge of edges) {
      const capacity = edge.tier * TRAFFIC_CAPACITY_PER_TIER;
      const level =
        capacity > 0
          ? clampByte(Math.floor((255 * edge.volume) / capacity))
          : edge.volume > 0
            ? 255
            : 0;
      if (level === 0) continue;
      for (const tile of edge.tiles) {
        if (!inBounds(tile.x, tile.z)) continue;
        const i = tileIndex(tile.x, tile.z);
        traffic[i] = clampByte(traffic[i]! + level);
      }
    }
  }

  /**
   * Core diffusion kernel, shared by every diffusing field: writes
   * `decay * (0.6*self + 0.4*neighborAvg)` for every tile of `src` into the
   * scratch double-buffer (never mutates `src` itself - callers copy/read
   * scratch back out once the whole pass has been computed from a stable
   * snapshot).
   */
  private diffuseIntoScratch(src: Uint8Array, decayNum: number): void {
    const scratch = this.scratch;
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const i = tileIndex(x, z);
        const self = src[i]!;
        const west = x > 0 ? src[tileIndex(x - 1, z)]! : self;
        const east = x < MAP_SIZE - 1 ? src[tileIndex(x + 1, z)]! : self;
        const north = z > 0 ? src[tileIndex(x, z - 1)]! : self;
        const south = z < MAP_SIZE - 1 ? src[tileIndex(x, z + 1)]! : self;
        const neighborAvg = (west + east + north + south) >> 2;
        const blended = (SELF_NUM * self + NEI_NUM * neighborAvg) >> 8;
        scratch[i] = clampByte((blended * decayNum) >> 8);
      }
    }
  }

  /** Plain diffuse-and-decay: run the kernel, then copy the result back. */
  private applyPlainDecay(field: Uint8Array, decayNum: number): void {
    this.diffuseIntoScratch(field, decayNum);
    field.set(this.scratch);
  }

  /**
   * LandValue's pass: the generic diffusion result, then a
   * proximity formula applied on top each pass:
   *   gain = (255 - pollution) >> 5      : rewards low ambient pollution, max +7
   *        + 6 if any of the 4 neighbor tiles is water
   *        + trees >> 4                  : tree density / 16, max +15
   *   loss = pollution >> 3              : -pollution/8
   *        + floor(noise / 12)           : -noise/12
   *        + floor(crime / 10)           : -crime/10
   *   next = clamp(diffused + gain - loss)
   * Pollution/noise/crime are read at their pre-this-tick values (see the
   * DIFFUSING_FIELDS ordering note above), so this pass never observes a
   * partially-updated neighbor field.
   */
  private applyLandValueDecay(g: GridState, decayNum: number): void {
    const lv = g.fields[FieldId.LandValue]!;
    this.diffuseIntoScratch(lv, decayNum);
    const scratch = this.scratch;
    const pollution = g.fields[FieldId.Pollution]!;
    const noise = g.fields[FieldId.Noise]!;
    const crime = g.fields[FieldId.Crime]!;
    const { trees, water } = g;

    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const i = tileIndex(x, z);
        const adjacentWater =
          (x > 0 && water[tileIndex(x - 1, z)] === 1) ||
          (x < MAP_SIZE - 1 && water[tileIndex(x + 1, z)] === 1) ||
          (z > 0 && water[tileIndex(x, z - 1)] === 1) ||
          (z < MAP_SIZE - 1 && water[tileIndex(x, z + 1)] === 1);

        const p = pollution[i]!;
        const gain = ((255 - p) >> 5) + (adjacentWater ? 6 : 0) + (trees[i]! >> 4);
        const loss = (p >> 3) + ((noise[i]! / 12) | 0) + ((crime[i]! / 10) | 0);
        lv[i] = clampByte(scratch[i]! + gain - loss);
      }
    }
  }

  /**
   * Happiness: not a diffusing field - a pure per-tile
   * recompute from the other fields' current values each time its slot
   * comes up:
   *   clamp(120 + edu/6 + health/6 + landValue/8 - pollution/4 - crime/4
   *         - min(traffic, 180)/6)
   * All divisions are integer floor (Uint8 inputs are always >= 0).
   */
  private computeHappiness(g: GridState): void {
    const happiness = g.fields[FieldId.Happiness]!;
    const education = g.fields[FieldId.Education]!;
    const health = g.fields[FieldId.Health]!;
    const landValue = g.fields[FieldId.LandValue]!;
    const pollution = g.fields[FieldId.Pollution]!;
    const crime = g.fields[FieldId.Crime]!;
    const traffic = g.fields[FieldId.Traffic]!;

    for (let i = 0; i < MAP_TILES; i++) {
      const trafficCapped = Math.min(traffic[i]!, 180);
      const value =
        120 +
        ((education[i]! / 6) | 0) +
        ((health[i]! / 6) | 0) +
        (landValue[i]! >> 3) -
        (pollution[i]! >> 2) -
        (crime[i]! >> 2) -
        ((trafficCapped / 6) | 0);
      happiness[i] = clampByte(value);
    }
  }
}
