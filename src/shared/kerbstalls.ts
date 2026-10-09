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
 * Where a parking lane's stall ticks fall along a run from `lo` to `hi`
 * (offsets from the tile centre, `origin` the centre's world coordinate along
 * the run). Every stall is 6.1–7.9 m (20–26 ft). Interior stalls are pitched
 * 6.7 m from world metre 0, so they run on across every seam. At an end that
 * meets a junction the lane's last stall is the end stall, marked from the
 * edge of the junction's no-parking zone; where the pitch leaves an odd length
 * beside it, the end stall takes up as much as keeps it within 7.9 m, and
 * beyond that the zone grows instead, so the end stall ends on a pitch tick.
 * Where two zones leave too little room for that, as many legal stalls as fit
 * are marked from the low zone's edge. `setLo` and `setHi` are null at an end
 * that meets no junction; either may lie past the tile's own end, when the
 * junction is a tile further on.
 */
export function parkingTickPositions(
  origin: number,
  lo: number,
  hi: number,
  setLo: number | null,
  setHi: number | null,
): number[] {
  const EPS = 1e-9;
  const pitch = PARKING_STALL_LENGTH_M;
  const end = PARKING_END_STALL_M;
  const longest = PARKING_STALL_MAX_M;
  /** The pitch ticks at or after / at or before a local offset. */
  const pitchAtOrAfter = (a: number): number =>
    Math.ceil((origin + a) / pitch - EPS) * pitch - origin;
  const pitchAtOrBefore = (a: number): number =>
    Math.floor((origin + a) / pitch + EPS) * pitch - origin;
  // Each end stall, as [near tick, far tick] in run order.
  let loStall: [number, number] | null = null;
  let hiStall: [number, number] | null = null;
  const zoneLo = setLo === null ? null : -TILE_HALF + setLo;
  const zoneHi = setHi === null ? null : TILE_HALF - setHi;
  if (zoneLo !== null) {
    const far = pitchAtOrAfter(zoneLo + end);
    loStall = far - zoneLo <= longest + EPS ? [zoneLo, far] : [far - end, far];
  }
  if (zoneHi !== null) {
    const near = pitchAtOrBefore(zoneHi - end);
    hiStall = zoneHi - near <= longest + EPS ? [near, zoneHi] : [near, near + end];
  }
  const ticks: number[] = [];
  if (zoneLo !== null && zoneHi !== null && loStall![1] > hiStall![0] + EPS) {
    // The two end stalls would overlap: as many stalls as the room between
    // the zones holds, each as long as it can be up to the longest.
    const room = zoneHi - zoneLo;
    const count = Math.floor(room / end + EPS);
    const length = count > 0 ? Math.min(longest, room / count) : 0;
    for (let k = 0; k <= count && count > 0; k++) ticks.push(zoneLo + k * length);
  } else {
    if (loStall) ticks.push(...loStall);
    if (hiStall) ticks.push(...hiStall);
    const from = loStall ? loStall[1] : lo;
    const to = hiStall ? hiStall[0] : hi;
    for (let a = pitchAtOrAfter(from); a <= to + EPS; a += pitch) ticks.push(a);
  }
  return ticks
    .filter((a) => a >= lo - EPS && a <= hi + EPS && clearOfNoParking(a, 0, setLo, setHi))
    .sort((a, b) => a - b)
    .filter((a, i, all) => i === 0 || a - all[i - 1]! > 1e-6);
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
  /** The ticks a parallel lane's tiles mark, world metres, as `parkingTickPositions` lays them. */
  ticks?: readonly number[];
  /** Whether the lane is its full depth all the way from `from` to `to`; omitted, everywhere. */
  fullDepth?: (from: number, to: number) => boolean;
  /** Which end of the face its accessible stalls stand at. */
  accessibleEnd: 'lo' | 'hi';
}

function sortedUnique(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1]! > EPS);
}

/** Consecutive ticks no further apart than the longest stall, as stalls. */
function stallsBetween(ticks: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < ticks.length; i++) {
    const from = ticks[i - 1]!;
    const to = ticks[i]!;
    // Two ticks further apart than any stall is laid are a gap in the lane.
    if (to - from <= PARKING_STALL_MAX_M + EPS) out.push([from, to]);
  }
  return out;
}

/**
 * The accessible stalls of a parallel face laid from `start` upward: `count`
 * stalls of 7.3 m end to end, and the ticks they leave. The stall after them
 * keeps the 6.1–7.9 m rule: where it would be shorter the group moves up to
 * end on the next tick and the zone grows, and where there is no room for the
 * group at all it is null.
 */
function parallelGroupFrom(
  ticks: readonly number[],
  count: number,
  start: number,
  limit: number,
): { ticks: number[]; group: [number, number][] } | null {
  const length = count * ACCESSIBLE_PARALLEL_STALL_M;
  if (start + length > limit + EPS) return null;
  const after = ticks.filter((t) => t >= start + length - EPS);
  const next = after[0];
  const gap = next === undefined ? 0 : next - (start + length);
  // A stall beside the group too short to be one: the group ends on the tick instead.
  const from = gap > EPS && gap < PARKING_END_STALL_M - EPS ? next! - length : start;
  const group: [number, number][] = Array.from({ length: count }, (_, k) => [
    from + k * ACCESSIBLE_PARALLEL_STALL_M,
    from + (k + 1) * ACCESSIBLE_PARALLEL_STALL_M,
  ]);
  return { ticks: sortedUnique([...group.flat(), ...after]), group };
}

function layParallelFace(input: KerbFaceInput): KerbFace {
  const ticks = sortedUnique(input.ticks ?? []);
  const wanted = accessibleStallCount(stallsBetween(ticks).length);
  // Laid from the low end; the high end is the same with the road turned round.
  const flip = input.accessibleEnd === 'hi' ? -1 : 1;
  const turned = sortedUnique(ticks.map((t) => t * flip));
  const start = flip === 1 ? input.lo : -input.hi;
  const limit = flip === 1 ? input.hi : -input.lo;
  let laid: { ticks: number[]; group: [number, number][] } | null = null;
  for (let n = wanted; n > 0 && !laid; n--) laid = parallelGroupFrom(turned, n, start, limit);
  const lines = laid ? sortedUnique(laid.ticks.map((t) => t * flip)) : ticks;
  const accessible = (laid?.group ?? []).map(([a, b]) =>
    flip === 1 ? ([a, b] as const) : ([-b, -a] as const),
  );
  const stalls = stallsBetween(lines).map(([from, to]): KerbStall => ({
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
