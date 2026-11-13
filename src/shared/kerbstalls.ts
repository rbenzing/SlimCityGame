/**
 * Where a parking lane marks its stalls: the parallel ticks along a tile, and
 * the block face — one kerb's parking along a straight run — laid as regular
 * stalls in the lane's style plus the accessible stalls its count earns. Pure
 * numbers along the road; the road mesh paints from them, the parked cars
 * stand in them and the sim counts them, so none of the three can disagree.
 */
import { TILE_METERS } from './constants';
import {
  isOneWayProfile,
  PARKING_STALL_WIDTH_M,
  PARKING_STYLES,
  runsAgainstDrawing,
} from './roadprofile';
import { flowDirection, RoadFlow } from './types';
import type { ParkingStyle, RoadProfile } from './types';

const TILE_HALF = TILE_METERS / 2;
const EPS = 1e-6;

/**
 * A parking lane's interior stall: 22 ft, the short end of the 22–26 ft the
 * 2009 MUTCD's parallel-parking layout gives (Figure 3B-21).
 */
export const PARKING_STALL_LENGTH_M = PARKING_STYLES.parallel.pitch;
/** The stall nearest a junction: 20 ft in the same figure. */
export const PARKING_END_STALL_M = 6.1;
/** The longest stall the figure marks: 26 ft. No stall is longer. */
export const PARKING_STALL_MAX_M = 7.9;
/** How far short of the edge of the pavement a stall tick stops, inside the lane. */
export const PARKING_TICK_KERB_CLEARANCE_M = 0.3;
/** No standing within 30 ft on the approach to a stop sign or a signal (UVC §11-1003). */
export const NO_PARKING_BEFORE_STOP_M = 9.1;
/** No standing within 20 ft of a crosswalk at an intersection (UVC §11-1003). */
export const NO_PARKING_FROM_CROSSWALK_M = 6.1;
/** No standing in front of a driveway, nor within 5 ft either side of its dropped kerb (UVC §11-1003; the common state figure). */
export const NO_PARKING_BESIDE_DRIVE_M = 1.5;

/** A stretch of kerb, world metres along the road, where no stall is marked and no car parks. */
export interface NoParkingZone {
  from: number;
  to: number;
}

/** A driveway's dropped kerb, `from` to `to` along the road, as the no-parking zone it makes. */
export function driveZone(from: number, to: number): NoParkingZone {
  return { from: from - NO_PARKING_BESIDE_DRIVE_M, to: to + NO_PARKING_BESIDE_DRIVE_M };
}

/** Zones sorted low to high, those that overlap or touch joined into one. */
export function mergeZones(zones: readonly NoParkingZone[]): NoParkingZone[] {
  const out: NoParkingZone[] = [];
  for (const z of [...zones].sort((a, b) => a.from - b.from)) {
    const last = out[out.length - 1];
    if (last && z.from <= last.to + EPS) last.to = Math.max(last.to, z.to);
    else out.push({ from: z.from, to: z.to });
  }
  return out;
}

/** Whether something spanning `from` to `to` lies across any zone. */
export function crossesZone(from: number, to: number, zones: readonly NoParkingZone[]): boolean {
  return zones.some((z) => from < z.to - EPS && to > z.from + EPS);
}

/** A parallel accessible space is 24 ft long (PROWAG R310.2.1). */
export const ACCESSIBLE_PARALLEL_STALL_M = 7.3;
/**
 * An accessible space's width across the stall: 11 ft at an angle (PROWAG
 * R310.4), and the ordinary stall's head-in, whose aisle carries the room.
 */
export const ACCESSIBLE_STALL_WIDTH_M: Readonly<Record<'angled' | 'headIn', number>> = {
  angled: 3.35,
  headIn: PARKING_STALL_WIDTH_M,
};
/** Its access aisle, across the stall: 5 ft at an angle (R310.4), 8 ft head-in (R310.3). */
export const ACCESSIBLE_AISLE_WIDTH_M: Readonly<Record<'angled' | 'headIn', number>> = {
  angled: 1.5,
  headIn: 2.4,
};

/**
 * How many accessible spaces a block face of `marked` stalls marks, from
 * PROWAG Table R211: one per 25 up to 100, one per 50 up to 200, and 4% of
 * the total, rounded up, beyond that.
 */
export function accessibleStallCount(marked: number): number {
  if (marked <= 0) return 0;
  const upTo = [25, 50, 75, 100, 150, 200];
  const at = upTo.findIndex((n) => marked <= n);
  return at >= 0 ? at + 1 : Math.ceil(marked * 0.04);
}

/**
 * How far each end of a road tile's kerbs is kept clear of parking: `lo` the
 * end at the low coordinate along the road and `hi` the high one, each as
 * metres for the parking on the road's low-offset side and on its high side.
 * Null at an end that meets no junction; zero at one whose zone ends inside
 * the junction's own tile, where parking runs to the tile's edge.
 */
export interface ParkingSetbacks {
  /** Whether the road runs along x (east-west) rather than along z. */
  alongX: boolean;
  lo: readonly [number, number] | null;
  hi: readonly [number, number] | null;
}

/**
 * Whether something lying from `along − halfLength` to `along + halfLength`
 * down a tile, measured from its centre, stands clear of the no-parking zone
 * at both of the tile's ends — `setLo` and `setHi`, null where an end meets no
 * junction. The one test a stall mark and a parked car both answer to.
 */
export function clearOfNoParking(
  along: number,
  halfLength: number,
  setLo: number | null,
  setHi: number | null,
): boolean {
  return (
    (setLo === null || along - halfLength >= -TILE_HALF + setLo - EPS) &&
    (setHi === null || along + halfLength <= TILE_HALF - setHi + EPS)
  );
}

/**
 * The ticks of one run of kerb, `from` to `to`, laid as a row of whole stalls
 * from its upstream end (`upstreamLow`: the low end): the stall at each end
 * 6.1 m, the ones between 6.7 m, and where the run leaves an odd length the
 * downstream end stall takes it up to 7.9 m. Only what is left after that
 * stays unmarked, at the downstream end. A run shorter than 6.1 m marks none.
 */
export function parkingRunTicksOf(from: number, to: number, upstreamLow: boolean): number[] {
  const room = to - from;
  if (room < PARKING_END_STALL_M - EPS) return [];
  const count =
    room < 2 * PARKING_END_STALL_M - EPS
      ? 1
      : 2 + Math.floor((room - 2 * PARKING_END_STALL_M) / PARKING_STALL_LENGTH_M + EPS);
  const lengths =
    count === 1
      ? [PARKING_END_STALL_M]
      : [
          PARKING_END_STALL_M,
          ...Array.from({ length: count - 2 }, () => PARKING_STALL_LENGTH_M),
          PARKING_END_STALL_M,
        ];
  const spare = room - lengths.reduce((sum, l) => sum + l, 0);
  lengths[lengths.length - 1]! += Math.min(spare, PARKING_STALL_MAX_M - PARKING_END_STALL_M);
  const ticks = [upstreamLow ? from : to];
  for (const length of lengths) {
    ticks.push(ticks[ticks.length - 1]! + (upstreamLow ? length : -length));
  }
  return ticks.sort((a, b) => a - b);
}

/**
 * The ticks of a whole kerb between `lo` and `hi`: every stretch between the
 * no-parking `zones` is a run of its own, laid by `parkingRunTicksOf`.
 */
export function parkingRunTicks(
  lo: number,
  hi: number,
  zones: readonly NoParkingZone[],
  upstreamLow: boolean,
): number[] {
  const ticks: number[] = [];
  let from = lo;
  for (const zone of mergeZones(zones)) {
    if (zone.to <= from + EPS) continue;
    if (zone.from >= hi - EPS) break;
    if (zone.from > from) ticks.push(...parkingRunTicksOf(from, zone.from, upstreamLow));
    from = Math.max(from, zone.to);
  }
  if (from < hi) ticks.push(...parkingRunTicksOf(from, hi, upstreamLow));
  return ticks;
}

/**
 * Which way, along the road, the traffic beside one kerb's parking lane runs:
 * +1 toward the higher coordinate. On a one-way road it is the way the road
 * was drawn, read from its stored flow (masked), or against it on the half of
 * a corridor whose lanes run back. On a two-way road it is the near side's
 * direction of travel, keeping right: the high side runs east along x and
 * north along z. A road that never recorded a direction is two-way.
 */
export function downstreamBeside(
  drawn: RoadProfile,
  stored: number,
  alongX: boolean,
  side: 'low' | 'high',
): 1 | -1 {
  const direction = flowDirection(stored);
  const ahead: 1 | -1 | 0 =
    direction === (alongX ? RoadFlow.East : RoadFlow.South)
      ? 1
      : direction === (alongX ? RoadFlow.West : RoadFlow.North)
        ? -1
        : 0;
  if (ahead !== 0 && isOneWayProfile(drawn)) {
    return (runsAgainstDrawing(drawn) ? -ahead : ahead) as 1 | -1;
  }
  const sigma = side === 'high' ? 1 : -1;
  return (alongX ? sigma : -sigma) as 1 | -1;
}

/** How a parking lane's stalls and the cars in them lie, for one kerb. */
export interface KerbOrientation {
  /** Along the road, the way the traffic beside the lane runs. */
  downstream: 1 | -1;
  /**
   * How far along the road a stall line's kerb end lies from its travel end,
   * per metre toward the kerb: upstream on an angled lane, 0 on the others.
   */
  slant: number;
  /** Along the road, the side of a parked car its passenger door is on. */
  passenger: 1 | -1;
  /** World yaw of a parked car's nose, atan2(dx, dz); null on a parallel lane. */
  yaw: number | null;
}

/**
 * The orientation of one kerb's stalls. A car backed into an angled stall
 * points out at the travel lane and along the traffic, so it leaves
 * nose-first with the flow; one nosed into a head-in stall faces the kerb.
 * Its passenger door is on its right.
 */
export function kerbOrientation(
  style: ParkingStyle,
  alongX: boolean,
  side: 'low' | 'high',
  downstream: 1 | -1,
): KerbOrientation {
  if (style === 'parallel') return { downstream, slant: 0, passenger: downstream, yaw: null };
  const sigma = side === 'high' ? 1 : -1;
  const angle = (PARKING_STYLES[style].angleDeg * Math.PI) / 180;
  const along = style === 'angled' ? downstream * Math.cos(angle) : 0;
  const across = style === 'angled' ? -sigma * Math.sin(angle) : sigma;
  const [dx, dz] = alongX ? [along, across] : [across, along];
  // A car's right, looking down its nose (dx, dz), is (−dz, dx).
  const rightAlong = alongX ? -dz : dx;
  return {
    downstream,
    slant: style === 'angled' ? -downstream / Math.tan(angle) : 0,
    passenger: rightAlong >= 0 ? 1 : -1,
    yaw: Math.atan2(dx, dz),
  };
}

/** One marked stall, as world metres along the road. */
export interface KerbStall {
  /** Where the stall meets the lane's travel edge, low end and high end. */
  from: number;
  to: number;
  /** The middle of the stall, where a car stands and the symbol is painted. */
  centre: number;
  accessible: boolean;
  /** An accessible stall's access aisle, along the travel edge; null for the rest. */
  aisle: { from: number; to: number } | null;
  /** World yaw of a car's nose in it, atan2(dx, dz); null on a parallel lane. */
  yaw: number | null;
}

/** One kerb's marked parking along a straight run. */
export interface KerbFace {
  style: ParkingStyle;
  /** Along-road offset of a stall line's kerb end from its travel end, per metre of depth. */
  slant: number;
  /** Every stall line's travel end, world metres along the road, low to high. */
  lines: number[];
  /** Every marked stall, low to high. */
  stalls: KerbStall[];
}

export interface KerbFaceInput {
  style: ParkingStyle;
  orientation: KerbOrientation;
  /** The lane's depth, travel edge to kerb, metres. */
  depth: number;
  /**
   * Where a stall may stand, world metres along the road: from the edge of
   * the no-parking zone at a junction end, else from where the lane's own
   * marking begins, to the same at the other end.
   */
  lo: number;
  hi: number;
  /** The ticks a parallel lane marks, world metres, as `parkingRunTicks` lays them. */
  ticks?: readonly number[];
  /** Whether traffic beside the lane arrives from its low end, so its runs are laid from there. */
  upstreamLow?: boolean;
  /** Whether the lane is its full depth all the way from `from` to `to`; omitted, everywhere. */
  fullDepth?: (from: number, to: number) => boolean;
  /** Stretches no stall may cross, such as the mouth of a driveway; merged, low to high. */
  zones?: readonly NoParkingZone[];
  /** Which end of the face its accessible stalls stand at. */
  accessibleEnd: 'lo' | 'hi';
}

function sortedUnique(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1]! > EPS);
}

/** Consecutive ticks no further apart than the longest stall, and clear of every zone, as stalls. */
function stallsBetween(
  ticks: readonly number[],
  zones: readonly NoParkingZone[] = [],
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < ticks.length; i++) {
    const from = ticks[i - 1]!;
    const to = ticks[i]!;
    // Two ticks further apart than any stall is laid, or closer than the
    // shortest, are a gap in the lane: the odd length a run leaves over.
    const length = to - from;
    if (
      length <= PARKING_STALL_MAX_M + EPS &&
      length >= PARKING_END_STALL_M - EPS &&
      !crossesZone(from, to, zones)
    ) {
      out.push([from, to]);
    }
  }
  return out;
}

/** The runs of stalls a face's ticks make: stalls that meet end to end, each run as its first and last tick. */
function runsOf(ticks: readonly number[], zones: readonly NoParkingZone[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const [from, to] of stallsBetween(ticks, zones)) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[1] - from) < EPS) last[1] = to;
    else runs.push([from, to]);
  }
  return runs;
}

/**
 * The accessible stalls of a parallel face: `wanted` stalls of 7.3 m end to end
 * (fewer where no run is long enough), flush to the end of the nearest run
 * that holds them, nearest the face's `accessibleEnd`. The rest of that run is
 * laid again from its upstream end beside them. Returns the face's ticks and
 * the group, or null where no run holds even one.
 */
function placeAccessible(
  ticks: readonly number[],
  zones: readonly NoParkingZone[],
  wanted: number,
  accessibleEnd: 'lo' | 'hi',
  upstreamLow: boolean,
): { ticks: number[]; group: [number, number][] } | null {
  const runs = runsOf(ticks, zones);
  if (accessibleEnd === 'hi') runs.reverse();
  for (let count = wanted; count > 0; count--) {
    const length = count * ACCESSIBLE_PARALLEL_STALL_M;
    const run = runs.find(([a, b]) => b - a >= length - EPS);
    if (!run) continue;
    const [a, b] = run;
    const groupFrom = accessibleEnd === 'lo' ? a : b - length;
    const rest = accessibleEnd === 'lo' ? [groupFrom + length, b] : [a, groupFrom];
    const group: [number, number][] = Array.from({ length: count }, (_, k) => [
      groupFrom + k * ACCESSIBLE_PARALLEL_STALL_M,
      groupFrom + (k + 1) * ACCESSIBLE_PARALLEL_STALL_M,
    ]);
    const kept = ticks.filter((t) => t < a - EPS || t > b + EPS);
    return {
      ticks: sortedUnique([
        ...kept,
        ...group.flat(),
        ...parkingRunTicksOf(rest[0]!, rest[1]!, upstreamLow),
      ]),
      group,
    };
  }
  return null;
}

function layParallelFace(input: KerbFaceInput): KerbFace {
  const ticks = sortedUnique(input.ticks ?? []);
  const zones = input.zones ?? [];
  const wanted = accessibleStallCount(stallsBetween(ticks, zones).length);
  const laid = placeAccessible(
    ticks,
    zones,
    wanted,
    input.accessibleEnd,
    input.upstreamLow ?? true,
  );
  const lines = laid ? laid.ticks : ticks;
  const accessible = laid?.group ?? [];
  const stalls = stallsBetween(lines, zones).map(([from, to]): KerbStall => ({
    from,
    to,
    centre: (from + to) / 2,
    accessible: accessible.some(([a, b]) => Math.abs(a - from) < EPS && Math.abs(b - to) < EPS),
    aisle: null,
    yaw: null,
  }));
  return { style: 'parallel', slant: 0, lines, stalls };
}

function layAngledFace(input: KerbFaceInput, style: 'angled' | 'headIn'): KerbFace {
  const { pitch, angleDeg } = PARKING_STYLES[style];
  const { orientation, lo, hi } = input;
  const reach = orientation.slant * input.depth;
  const below = Math.min(0, reach);
  const above = Math.max(0, reach);
  /** Whether a stall meeting the travel edge from a0 to a1 stands wholly where a stall may. */
  const fits = (a0: number, a1: number): boolean =>
    a0 + below >= lo - EPS &&
    a1 + above <= hi + EPS &&
    !crossesZone(a0 + below, a1 + above, input.zones ?? []) &&
    (input.fullDepth?.(a0 + below, a1 + above) ?? true);

  const regular: [number, number][] = [];
  for (let k = Math.ceil((lo - below) / pitch - EPS); (k + 1) * pitch + above <= hi + EPS; k++) {
    if (fits(k * pitch, (k + 1) * pitch)) regular.push([k * pitch, (k + 1) * pitch]);
  }

  // An accessible unit is the wider stall and its aisle, their widths across
  // the stall taken along the kerb at the stall's angle.
  const sine = Math.sin((angleDeg * Math.PI) / 180);
  const stallLength = ACCESSIBLE_STALL_WIDTH_M[style] / sine;
  const aisleLength = ACCESSIBLE_AISLE_WIDTH_M[style] / sine;
  const unit = stallLength + aisleLength;
  let group: [number, number] | null = null;
  let count = accessibleStallCount(regular.length);
  for (; count > 0 && !group; count--) {
    const length = count * unit;
    // The group ends on a pitch tick, so the regular stalls run on from it
    // unbroken; from the face's end it moves inward until it fits.
    if (input.accessibleEnd === 'lo') {
      for (
        let k = Math.ceil((lo - below + length) / pitch - EPS);
        k * pitch + above <= hi + EPS;
        k++
      ) {
        if (fits(k * pitch - length, k * pitch)) {
          group = [k * pitch - length, k * pitch];
          break;
        }
      }
    } else {
      for (
        let k = Math.floor((hi - above - length) / pitch + EPS);
        k * pitch + below >= lo - EPS;
        k--
      ) {
        if (fits(k * pitch, k * pitch + length)) {
          group = [k * pitch, k * pitch + length];
          break;
        }
      }
    }
    if (group) break;
  }

  const stall = (from: number, to: number, aisle: KerbStall['aisle']): KerbStall => ({
    from,
    to,
    centre: (from + to) / 2 + reach / 2,
    accessible: aisle !== null,
    aisle,
    yaw: orientation.yaw,
  });
  const stalls: KerbStall[] = regular
    .filter(([a0, a1]) => !group || a1 <= group[0] + EPS || a0 >= group[1] - EPS)
    .map(([a0, a1]) => stall(a0, a1, null));
  if (group) {
    for (let i = 0; i < count; i++) {
      const u0 = group[0] + i * unit;
      // The aisle opens on the passenger side of the car in the stall.
      if (orientation.passenger > 0) {
        stalls.push(stall(u0, u0 + stallLength, { from: u0 + stallLength, to: u0 + unit }));
      } else {
        stalls.push(stall(u0 + aisleLength, u0 + unit, { from: u0, to: u0 + aisleLength }));
      }
    }
  }
  stalls.sort((a, b) => a.from - b.from);
  const lines = sortedUnique(
    stalls.flatMap((s) => [s.from, s.to, ...(s.aisle ? [s.aisle.from, s.aisle.to] : [])]),
  );
  return { style, slant: orientation.slant, lines, stalls };
}

/**
 * Lays one block face: its regular stalls in the lane's style, and the
 * accessible stalls PROWAG R211 asks of that many, together at
 * `accessibleEnd`. A parallel face keeps its tiles' own ticks and lengthens
 * the stall at that end to 7.3 m; an angled or head-in face pitches its
 * stalls from world metre 0, marks only those whose whole footprint fits, and
 * puts the accessible stalls, each with its aisle on the passenger side, at
 * the end before the regular ones resume.
 */
export function layKerbFace(input: KerbFaceInput): KerbFace {
  return input.style === 'parallel' ? layParallelFace(input) : layAngledFace(input, input.style);
}
