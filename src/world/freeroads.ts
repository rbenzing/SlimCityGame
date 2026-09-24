/**
 * Roads off the grid: what may be laid, laying it, taking it away, and the
 * footprint it holds on the tiles. The rules are road-network.md's geometry
 * rules; this is the one place the world checks them, whatever sent the
 * command.
 */

import { TILE_METERS } from '../shared/constants';
import {
  MAX_ARMS,
  MIN_CURVE_RADIUS_M,
  MIN_SEGMENT_M,
  centreLinesCross,
  closestApproachM,
  footprintTiles,
  isGridSegment,
  isTileCentre,
  leavingDirection,
  onMap,
  pointAt,
  sampleCentreLine,
  segmentLengthM,
  tightestRadiusM,
  tileCentreCm,
  tileOfCm,
  tooSteep,
  wideEnoughApart,
  withinMergeAngle,
} from '../shared/roadgeom';
import type { CmPoint, MPoint, SegmentGeom } from '../shared/roadgeom';
import { joinRefusal, presetProfileForTier, profileWidth } from '../shared/roadprofile';
import type { GridState, RoadClassId, RoadNet, RoadProfile, RoadTier } from '../shared/types';
import {
  addNode,
  addSegment,
  decodeRoadNetwork,
  dropNode,
  dropSegment,
  encodeRoadNetwork,
  isFreeSegment,
  segmentGeom,
  segmentsAt,
} from './roadnet';

/** Resolves a stored profile id to the cross-section it names, or null. */
export type ProfileLookup = (id: number) => RoadProfile | null;

/**
 * The grid layers planning a road off the grid reads: the ground, what stands
 * on it, and the grid's own roads. The world's grid has them, and so does the
 * render thread's mirror of it, so the tool's preview plans exactly as the
 * command will.
 */
export type SegmentGround = Pick<
  GridState,
  | 'size'
  | 'height'
  | 'water'
  | 'buildingId'
  | 'roadTier'
  | 'roadMask'
  | 'roadProfile'
  | 'roadElevation'
  | 'overTier'
>;

/** What a `buildSegment` asks for. */
export interface SegmentRequest {
  tier: RoadTier;
  profileId: number;
  a: CmPoint;
  b: CmPoint;
  control: CmPoint | null;
  /** 0 both ways; 1 one-way from `a` to `b`. */
  flow: number;
}

/** What one end of a new segment becomes. */
type EndPlan = { kind: 'node'; slot: number } | { kind: 'grid'; idx: number } | { kind: 'new' };

export type SegmentPlan =
  | {
      ok: true;
      geom: SegmentGeom;
      lengthM: number;
      ends: [EndPlan, EndPlan];
    }
  | { ok: false; reason: string };

/** The half width of a road's whole cross-section, footways included, metres. */
export const halfWidthOf = (profile: RoadProfile): number => profileWidth(profile) / 2;

/** The cross-section a stored profile id names: the lookup's, else its tier's preset. */
function profileOf(id: number, lookup: ProfileLookup): RoadProfile {
  return lookup(id) ?? presetProfileForTier(id as RoadTier);
}

/** From a point in centimetres to one in metres, metres. */
function distanceM(p: CmPoint, q: MPoint): number {
  const dx = p.x / 100 - q.x;
  const dz = p.z / 100 - q.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * How far from a junction two roads leaving it in directions `u` and `v` may
 * still be closer than kerb to kerb: until they have spread apart by their
 * two half widths, which takes longer the narrower the angle between them —
 * a merge lane runs alongside its motorway for a long way.
 */
function junctionReach(halfA: number, halfB: number, u: MPoint, v: MPoint): number {
  const cos = u.x * v.x + u.z * v.z;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  return (halfA + halfB) / Math.max(sin, MIN_SPREAD_SIN) + TILE_METERS / 4;
}

/** The sine below which two roads count as running side by side: about 3°. */
const MIN_SPREAD_SIN = 0.05;

/**
 * Ground height at a point, metres, read between the four nearest tile
 * centres, since the terrain is one height per tile.
 */
export function groundAt(g: Pick<GridState, 'size' | 'height'>, x: number, z: number): number {
  const fx = x / TILE_METERS - 0.5;
  const fz = z / TILE_METERS - 0.5;
  const x0 = Math.max(0, Math.min(g.size - 1, Math.floor(fx)));
  const z0 = Math.max(0, Math.min(g.size - 1, Math.floor(fz)));
  const x1 = Math.min(g.size - 1, x0 + 1);
  const z1 = Math.min(g.size - 1, z0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const tz = Math.max(0, Math.min(1, fz - z0));
  const h = (px: number, pz: number): number => g.height[pz * g.size + px] ?? 0;
  const top = h(x0, z0) * (1 - tx) + h(x1, z0) * tx;
  const bottom = h(x0, z1) * (1 - tx) + h(x1, z1) * tx;
  return top * (1 - tz) + bottom * tz;
}

/** A live node standing exactly at `p`, or -1. */
function nodeAt(net: RoadNet, p: CmPoint): number {
  for (let s = 0; s < net.nodeSlots; s++) {
    if (net.nodeLive[s] === 1 && net.nodeX[s] === p.x && net.nodeZ[s] === p.z) return s;
  }
  return -1;
}

/** One road leaving a node: which way, and what class of road. */
interface Arm {
  dir: MPoint;
  cls: RoadClassId;
}

const GRID_STEPS: readonly { bit: number; dx: number; dz: number }[] = [
  { bit: 1, dx: 0, dz: -1 },
  { bit: 2, dx: 1, dz: 0 },
  { bit: 4, dx: 0, dz: 1 },
  { bit: 8, dx: -1, dz: 0 },
];

/** The roads already leaving the place an end of the new segment lands on. */
function armsAt(g: SegmentGround, net: RoadNet, p: CmPoint, lookup: ProfileLookup): Arm[] {
  const arms: Arm[] = [];
  const slot = nodeAt(net, p);
  if (slot >= 0) {
    for (const seg of segmentsAt(net, slot)) {
      if (!isFreeSegment(net, seg)) continue;
      const geom = segmentGeom(net, seg);
      const end = net.segA[seg] === slot ? 'a' : 'b';
      arms.push({
        dir: leavingDirection(geom, end),
        cls: profileOf(net.segProfile[seg]!, lookup).class,
      });
    }
  }
  if (isTileCentre(p)) {
    const tx = tileOfCm(p.x);
    const tz = tileOfCm(p.z);
    const idx = tz * g.size + tx;
    const mask = g.roadTier[idx] ? (g.roadMask[idx] ?? 0) : 0;
    for (const step of GRID_STEPS) {
      if ((mask & step.bit) === 0) continue;
      const n = (tz + step.dz) * g.size + tx + step.dx;
      arms.push({
        dir: { x: step.dx, z: step.dz },
        cls: profileOf(g.roadProfile[n] ?? 0, lookup).class,
      });
    }
  }
  return arms;
}

/** Why a new road leaving in `dir` cannot join these arms, or null. */
function armRefusal(arms: readonly Arm[], mine: Arm): string | null {
  if (arms.length + 1 > MAX_ARMS) return `At most ${MAX_ARMS} roads meet at one junction`;
  for (const arm of arms) {
    const refusal = joinRefusal(mine.cls, arm.cls);
    if (refusal) return refusal;
  }
  const all = [...arms, mine];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const p = all[i]!;
      const q = all[j]!;
      const merge =
        ((p.cls === 'ramp' && q.cls === 'highway') || (p.cls === 'highway' && q.cls === 'ramp')) &&
        withinMergeAngle(p.dir, q.dir);
      if (!merge && !wideEnoughApart(p.dir, q.dir)) {
        return 'Too narrow an angle where it meets another road: at least 30°';
      }
    }
  }
  // A ramp meets a motorway alongside it: within the merge angle of one of
  // the motorway's arms, never across it.
  const motorway = all.filter((a) => a.cls === 'highway');
  if (motorway.length > 0) {
    for (const ramp of all.filter((a) => a.cls === 'ramp')) {
      if (!motorway.some((m) => withinMergeAngle(m.dir, ramp.dir))) {
        return 'A ramp meets a motorway alongside it, within 20°';
      }
    }
  }
  return null;
}

/**
 * Everything `buildSegment` checks, before anything is laid: the shape, the
 * ground, both ends, and every road nearby. A plan that comes back ok can be
 * laid exactly as it is.
 */
export function planSegment(
  g: SegmentGround,
  net: RoadNet,
  req: SegmentRequest,
  lookup: ProfileLookup,
): SegmentPlan {
  const refuse = (reason: string): SegmentPlan => ({ ok: false, reason });
  const geom: SegmentGeom = { a: req.a, b: req.b, control: req.control };
  const profile = profileOf(req.profileId, lookup);
  const half = halfWidthOf(profile);

  if (req.flow !== 0 && req.flow !== 1) return refuse('invalid');
  if (req.a.x === req.b.x && req.a.z === req.b.z) return refuse('A road needs two ends');
  if (isGridSegment(geom))
    return refuse('A straight road along the grid is laid with the grid tools');
  if (!onMap(geom, g.size)) return refuse('The road runs off the map');
  const lengthM = segmentLengthM(geom);
  if (lengthM < MIN_SEGMENT_M) return refuse(`A road is at least ${MIN_SEGMENT_M} m long`);
  const needed = MIN_CURVE_RADIUS_M[profile.class];
  if (tightestRadiusM(geom) < needed)
    return refuse(`Too tight for this road: it needs a ${needed} m radius`);
  if (tooSteep(geom, (x, z) => groundAt(g, x, z))) return refuse('Too steep for a road');

  // Each end: a node already there, a grid road's tile centre, or open ground.
  const ends: EndPlan[] = [];
  for (const [p, end] of [
    [req.a, 'a'],
    [req.b, 'b'],
  ] as const) {
    const slot = nodeAt(net, p);
    const tx = tileOfCm(p.x);
    const tz = tileOfCm(p.z);
    const idx = tz * g.size + tx;
    if (slot >= 0) {
      if ((net.nodeHeight[slot] ?? 0) !== 0)
        return refuse('A road off the grid meets another on the ground');
      ends.push({ kind: 'node', slot });
    } else if ((g.roadTier[idx] ?? 0) !== 0) {
      if (!isTileCentre(p))
        return refuse('A road meets a grid road at the centre of one of its tiles');
      if ((g.roadElevation[idx] ?? 0) !== 0)
        return refuse('A road off the grid meets another on the ground');
      ends.push({ kind: 'grid', idx });
    } else {
      ends.push({ kind: 'new' });
    }
    const refusal = armRefusal(armsAt(g, net, p, lookup), {
      dir: leavingDirection(geom, end),
      cls: profile.class,
    });
    if (refusal) return refuse(refusal);
  }

  // The ground it covers: dry, unbuilt, and clear of the grid's roads except
  // where it meets one.
  const gridJunctions = ([req.a, req.b] as const).flatMap((p, i) => {
    if (ends[i]!.kind !== 'grid' && !(ends[i]!.kind === 'node' && isTileCentre(p))) return [];
    const mine = leavingDirection(geom, i === 0 ? 'a' : 'b');
    const gridArms = armsAt(g, net, p, lookup);
    const reach = Math.max(
      half + TILE_METERS / 2 + TILE_METERS / 4,
      ...gridArms.map((arm) => junctionReach(half, TILE_METERS / 2, mine, arm.dir)),
    );
    return [{ p, reach }];
  });
  for (const idx of footprintTiles(geom, half, g.size)) {
    if (g.water[idx]) return refuse('The road runs into water');
    if (g.buildingId[idx]) return refuse('The road runs into a building');
    if (g.roadTier[idx] || g.overTier[idx]) {
      const centre = {
        x: (idx % g.size) * TILE_METERS + TILE_METERS / 2,
        z: Math.floor(idx / g.size) * TILE_METERS + TILE_METERS / 2,
      };
      const nearJunction = gridJunctions.some((j) => distanceM(j.p, centre) <= j.reach);
      if (!nearJunction) return refuse('The road runs into a road on the grid');
    }
  }

  // Every other free road: never crossed but at a node, never crowded.
  const mine = sampleCentreLine(geom);
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1 || !isFreeSegment(net, s)) continue;
    const other = segmentGeom(net, s);
    const otherHalf = halfWidthOf(profileOf(net.segProfile[s]!, lookup));
    const theirs = sampleCentreLine(other);
    const same = (p: CmPoint, q: CmPoint): boolean => p.x === q.x && p.z === q.z;
    const shared: { p: CmPoint; reach: number }[] = [];
    for (const theirEnd of ['a', 'b'] as const) {
      const p = other[theirEnd];
      const myEnd = same(p, req.a) ? 'a' : same(p, req.b) ? 'b' : null;
      if (myEnd === null) continue;
      const u = leavingDirection(geom, myEnd);
      const v = leavingDirection(other, theirEnd);
      shared.push({ p, reach: junctionReach(half, otherHalf, u, v) });
    }
    const away = (samples: readonly MPoint[]): MPoint[] =>
      samples.filter((q) => shared.every((j) => distanceM(j.p, q) > j.reach));
    const mineAway = away(mine);
    const theirsAway = away(theirs);
    if (centreLinesCross(mineAway, theirsAway))
      return refuse('It crosses another road where there is no junction');
    if (closestApproachM(mineAway, theirsAway) < half + otherHalf)
      return refuse('Too close to another road');
  }

  return { ok: true, geom, lengthM, ends: [ends[0]!, ends[1]!] };
}

/** Lays a planned segment and returns its slot. */
export function laySegment(
  g: GridState,
  net: RoadNet,
  plan: SegmentPlan & { ok: true },
  req: SegmentRequest,
): number {
  const slotFor = (end: EndPlan, p: CmPoint): number => {
    if (end.kind === 'node') return end.slot;
    if (end.kind === 'grid') {
      return addNode(net, {
        x: p.x,
        z: p.z,
        height: 0,
        tier: g.roadTier[end.idx] ?? 0,
        profile: g.roadProfile[end.idx] ?? 0,
        flow: g.roadFlow[end.idx] ?? 0,
      });
    }
    return addNode(net, { x: p.x, z: p.z, height: 0, tier: 0, profile: 0, flow: 0 });
  };
  const a = slotFor(plan.ends[0], req.a);
  const b = slotFor(plan.ends[1], req.b);
  return addSegment(net, {
    a,
    b,
    tier: req.tier,
    profile: req.profileId,
    flow: req.flow,
    h0: 0,
    h1: 0,
    control: req.control,
  });
}

/** What a removed segment carried, so it can be put back exactly. */
export interface RemovedSegment {
  tier: RoadTier;
  profileId: number;
  flow: number;
}

/**
 * Takes away the free segment between `a` and `b` with control point
 * `control`, and each end node that no road meets any more and that carries
 * no grid road. Null where there is no such segment.
 */
export function removeSegmentAt(
  net: RoadNet,
  a: CmPoint,
  b: CmPoint,
  control: CmPoint | null,
): RemovedSegment | null {
  const same = (p: CmPoint, q: CmPoint | null): boolean => q !== null && p.x === q.x && p.z === q.z;
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1 || !isFreeSegment(net, s)) continue;
    const geom = segmentGeom(net, s);
    if (!same(a, geom.a) || !same(b, geom.b)) continue;
    if (control === null ? geom.control !== null : !same(control, geom.control)) continue;
    const removed = {
      tier: net.segTier[s] as RoadTier,
      profileId: net.segProfile[s]!,
      flow: net.segFlow[s]!,
    };
    const ends = [net.segA[s]!, net.segB[s]!];
    dropSegment(net, s);
    for (const end of ends) {
      if (net.nodeTier[end] === 0 && segmentsAt(net, end).length === 0) dropNode(net, end);
    }
    return removed;
  }
  return null;
}

/** A point on a free road's centre line: its segment, how far along it (0..1), and where. */
export interface RoadPoint {
  seg: number;
  t: number;
  at: CmPoint;
}

const lerpCm = (p: CmPoint, q: CmPoint, t: number): CmPoint => ({
  x: Math.round(p.x + (q.x - p.x) * t),
  z: Math.round(p.z + (q.z - p.z) * t),
});

/**
 * The point on a free road's centre line nearest `p`, if one lies within
 * `reachM`: found on the metre samples, then narrowed between the samples
 * either side, so every machine finds the same one.
 */
export function nearestRoadPoint(net: RoadNet, p: CmPoint, reachM: number): RoadPoint | null {
  const pm = { x: p.x / 100, z: p.z / 100 };
  const dist = (q: MPoint): number => Math.sqrt((q.x - pm.x) ** 2 + (q.z - pm.z) ** 2);
  let best: { seg: number; t: number; d: number } | null = null;
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1 || !isFreeSegment(net, s)) continue;
    const geom = segmentGeom(net, s);
    const samples = sampleCentreLine(geom);
    let k = 0;
    for (let i = 1; i < samples.length; i++) if (dist(samples[i]!) < dist(samples[k]!)) k = i;
    let lo = samples[Math.max(0, k - 1)]!.t;
    let hi = samples[Math.min(samples.length - 1, k + 1)]!.t;
    for (let i = 0; i < 40; i++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (dist(pointAt(geom, m1)) <= dist(pointAt(geom, m2))) hi = m2;
      else lo = m1;
    }
    const t = (lo + hi) / 2;
    const d = dist(pointAt(geom, t));
    if (d <= reachM && (best === null || d < best.d)) best = { seg: s, t, d };
  }
  if (!best) return null;
  const q = pointAt(segmentGeom(net, best.seg), best.t);
  return { seg: best.seg, t: best.t, at: { x: Math.round(q.x * 100), z: Math.round(q.z * 100) } };
}

/** Why a free road cannot be split at a point: a piece would be shorter than a road may be. */
export function splitRefusal(net: RoadNet, rp: RoadPoint): string | null {
  const geom = segmentGeom(net, rp.seg);
  const [left, right] = splitGeom(geom, rp.t, rp.at);
  if (segmentLengthM(left) < MIN_SEGMENT_M || segmentLengthM(right) < MIN_SEGMENT_M) {
    return 'Too near the end of that road: join it at its end';
  }
  return null;
}

/** A centre line cut in two at `t`, meeting at `at` (de Casteljau for a curve). */
function splitGeom(g: SegmentGeom, t: number, at: CmPoint): [SegmentGeom, SegmentGeom] {
  if (g.control === null) {
    return [
      { a: g.a, b: at, control: null },
      { a: at, b: g.b, control: null },
    ];
  }
  return [
    { a: g.a, b: at, control: lerpCm(g.a, g.control, t) },
    { a: at, b: g.b, control: lerpCm(g.control, g.b, t) },
  ];
}

/**
 * Cuts a free road in two at a point on it, which becomes a node both pieces
 * meet at. Each piece keeps the road's tier, profile, flow and the way it
 * runs, so a one-way road still runs from its first end to its last.
 */
export function splitSegment(net: RoadNet, rp: RoadPoint): void {
  const s = rp.seg;
  const [left, right] = splitGeom(segmentGeom(net, s), rp.t, rp.at);
  const facts = { tier: net.segTier[s]!, profile: net.segProfile[s]!, flow: net.segFlow[s]! };
  const a = net.segA[s]!;
  const b = net.segB[s]!;
  dropSegment(net, s);
  const mid = addNode(net, { x: rp.at.x, z: rp.at.z, height: 0, tier: 0, profile: 0, flow: 0 });
  addSegment(net, { ...facts, a, b: mid, h0: 0, h1: 0, control: left.control });
  addSegment(net, { ...facts, a: mid, b, h0: 0, h1: 0, control: right.control });
}

/**
 * Joins the two free roads meeting at `at` back into one with control point
 * `control`, taking the node away: the inverse of a split. Null unless
 * exactly two free roads of the same kind meet there, running on through it.
 */
export function joinSegmentsAt(net: RoadNet, at: CmPoint, control: CmPoint | null): boolean {
  const node = nodeAt(net, at);
  if (node < 0 || net.nodeTier[node] !== 0) return false;
  const segs = segmentsAt(net, node);
  if (segs.length !== 2 || !segs.every((s) => isFreeSegment(net, s))) return false;
  const inbound = segs.find((s) => net.segB[s] === node);
  const outbound = segs.find((s) => net.segA[s] === node);
  if (inbound === undefined || outbound === undefined || inbound === outbound) return false;
  const same =
    net.segTier[inbound] === net.segTier[outbound] &&
    net.segProfile[inbound] === net.segProfile[outbound] &&
    net.segFlow[inbound] === net.segFlow[outbound];
  if (!same) return false;
  const facts = {
    tier: net.segTier[inbound]!,
    profile: net.segProfile[inbound]!,
    flow: net.segFlow[inbound]!,
  };
  const a = net.segA[inbound]!;
  const b = net.segB[outbound]!;
  dropSegment(net, inbound);
  dropSegment(net, outbound);
  dropNode(net, node);
  addSegment(net, { ...facts, a, b, h0: 0, h1: 0, control });
  return true;
}

/** Rewrites the footprint layer: every tile a free road's full cross-section covers. */
export function deriveRoadFootprint(
  g: Pick<GridState, 'size' | 'roadFootprint'>,
  net: RoadNet,
  lookup: ProfileLookup,
): void {
  g.roadFootprint.fill(0);
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1 || !isFreeSegment(net, s)) continue;
    const half = halfWidthOf(profileOf(net.segProfile[s]!, lookup));
    for (const idx of footprintTiles(segmentGeom(net, s), half, g.size)) g.roadFootprint[idx] = 1;
  }
}

/** Tile centres where a free road meets the grid: the only footprint tiles a grid drag may enter. */
export function freeJunctionTiles(net: RoadNet, size: number): Set<number> {
  const tiles = new Set<number>();
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1 || !isFreeSegment(net, s)) continue;
    for (const end of [net.segA[s]!, net.segB[s]!]) {
      const p = { x: net.nodeX[end]!, z: net.nodeZ[end]! };
      if (isTileCentre(p)) tiles.add(tileOfCm(p.z) * size + tileOfCm(p.x));
    }
  }
  return tiles;
}

/** How close to a road node a dropped road end is pulled onto it, metres. */
export const NODE_SNAP_M = 4;
/** How close to a free road's centre line a dropped road end lands on it, metres. */
export const ROAD_SNAP_M = 4;

/** Where a dropped road end lands, and whether it lands partway along a free road. */
export interface RoadEnd {
  at: CmPoint;
  /** It lands on a free road away from its nodes, which is split there to meet it. */
  splits: boolean;
}

/**
 * Where a road end dropped at `p` lands: on the nearest road node within
 * `NODE_SNAP_M`; else on the nearest free road's centre line within
 * `ROAD_SNAP_M`, splitting it; else at the centre of the grid road tile under
 * it, the only place a road off the grid may meet one; else at `p` itself.
 */
export function snapRoadEnd(
  g: Pick<GridState, 'size' | 'roadTier'> & { roads?: RoadNet },
  p: CmPoint,
): RoadEnd {
  const net = g.roads;
  if (net) {
    let best: CmPoint | null = null;
    let bestD = NODE_SNAP_M * 100;
    for (let s = 0; s < net.nodeSlots; s++) {
      if (net.nodeLive[s] !== 1) continue;
      const dx = net.nodeX[s]! - p.x;
      const dz = net.nodeZ[s]! - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= bestD) {
        bestD = d;
        best = { x: net.nodeX[s]!, z: net.nodeZ[s]! };
      }
    }
    if (best) return { at: best, splits: false };
    const onRoad = nearestRoadPoint(net, p, ROAD_SNAP_M);
    if (onRoad) return { at: onRoad.at, splits: true };
  }
  const tx = tileOfCm(p.x);
  const tz = tileOfCm(p.z);
  if (tx >= 0 && tz >= 0 && tx < g.size && tz < g.size && g.roadTier[tz * g.size + tx]) {
    return { at: tileCentrePoint(tx, tz), splits: false };
  }
  return { at: p, splits: false };
}

/**
 * Plans a road off the grid whose ends at `splits` land partway along free
 * roads: on a copy of the network with those roads split there first, as the
 * split commands sent ahead of it will leave the real one.
 */
export function planWithSplits(
  g: SegmentGround,
  net: RoadNet,
  req: SegmentRequest,
  splits: readonly CmPoint[],
  lookup: ProfileLookup,
): SegmentPlan {
  if (splits.length === 0) return planSegment(g, net, req, lookup);
  const copy = decodeRoadNetwork(encodeRoadNetwork(net));
  for (const at of splits) {
    const rp = nearestRoadPoint(copy, at, SPLIT_MATCH_M);
    if (!rp) return { ok: false, reason: 'invalid' };
    const refusal = splitRefusal(copy, { ...rp, at });
    if (refusal) return { ok: false, reason: refusal };
    splitSegment(copy, { ...rp, at });
  }
  return planSegment(g, copy, req, lookup);
}

/**
 * How near a road's centre line a split point must be, metres: a point
 * snapped onto the line, rounded to the centimetre.
 */
export const SPLIT_MATCH_M = 0.1;

/**
 * The way a road carries on from its end at `p`: the direction out of a node
 * that exactly one road leaves, pointing away from that road. Null where no
 * road ends there, or more than one meets.
 */
export function roadEndDirection(
  g: SegmentGround,
  net: RoadNet,
  p: CmPoint,
  lookup: ProfileLookup,
): MPoint | null {
  const arms = armsAt(g, net, p, lookup);
  if (arms.length !== 1) return null;
  const d = arms[0]!.dir;
  return { x: -d.x, z: -d.z };
}

/** A tile's centre in world centimetres. */
export const tileCentrePoint = (x: number, z: number): CmPoint => ({
  x: tileCentreCm(x),
  z: tileCentreCm(z),
});
