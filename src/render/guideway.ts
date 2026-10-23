/**
 * The elevated tram guideway: where a street gives its trams a reservation,
 * they run on two concrete beams above it instead of in its lanes, and the
 * road below keeps its traffic. Three instanced parts, all unit boxes:
 *   BEAMS      — one per beam per run through a tile, continuous along the
 *                guideway, turning where the road turns and sloping down the
 *                ramp to where the trams meet the street at grade.
 *   STEMS      — the column standing in the median the road draws in the
 *                reservation's place.
 *   CROSSHEADS — the T on top of each stem the two beams rest on.
 *
 * Everything is measured from the road surface, so a guideway on a deck
 * stands on the deck. Placement is a pure function of the road tiles and the
 * surface sampler (`computeGuideway`); the renderer only turns it into
 * instances, and hands trams the seat on the beam they ride.
 */
import * as THREE from 'three';
import { OVERPASS_CLEARANCE_M, TILE_METERS, tileToWorld, worldToTile } from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  carriesGuideway,
  isTramTrack,
  presetProfileForTier,
} from '../shared/roadprofile';
import { isStreetTier, RoadTier, tramCrossingAxes, tramCrossingRoad } from '../shared/types';
import type { RoadProfile, TramCrossingRoad } from '../shared/types';
import { markingPlan } from './roadmarkings';
import { buildTileSet, hasCrossingRoad, joins, lateralAxis, tileKey } from './roadfurniture';
import type { FurnitureRoadTile, RoadTileIndex } from './roadfurniture';
import { seamShift } from './roadsmesh';

/** A beam's width and depth. */
export const GUIDEWAY_BEAM_WIDTH_M = 0.66;
export const GUIDEWAY_BEAM_DEPTH_M = 1.22;
/** Each beam's centre, either side of the guideway's centre line. */
export const GUIDEWAY_BEAM_OFFSET_M = 1.83;
/** The crosshead: its depth, how far it reaches past each beam's outer face, and its length along the run. */
export const GUIDEWAY_CROSSHEAD_DEPTH_M = 1.0;
export const GUIDEWAY_CROSSHEAD_OVERHANG_M = 0.2;
export const GUIDEWAY_CROSSHEAD_ALONG_M = 1.2;
export const GUIDEWAY_CROSSHEAD_ACROSS_M =
  2 * (GUIDEWAY_BEAM_OFFSET_M + GUIDEWAY_BEAM_WIDTH_M / 2 + GUIDEWAY_CROSSHEAD_OVERHANG_M);
/** The column stem, square in plan. */
export const GUIDEWAY_STEM_M = 0.9;
/** Columns stand this far apart along the run, phase anchored at world-metre zero. */
export const GUIDEWAY_COLUMN_SPACING_M = 30;
/**
 * The beam top above the road surface at full height: the crosshead's
 * underside clears the street by an overpass's clearance, the crosshead and
 * the beam stack on that.
 */
export const GUIDEWAY_BEAM_TOP_M =
  OVERPASS_CLEARANCE_M + GUIDEWAY_CROSSHEAD_DEPTH_M + GUIDEWAY_BEAM_DEPTH_M;
/** The guideway climbs from the street to full height over this many tiles. */
export const GUIDEWAY_RAMP_TILES = 5;
/** No column is drawn where its crosshead would stand less than this clear of the road. */
export const GUIDEWAY_MIN_CROSSHEAD_CLEARANCE_M = 0.5;
/** A tram on the guideway has its floor this far above the beam top. */
export const TRAM_FLOOR_ABOVE_BEAM_M = 0.45;
/** Pale precast concrete, the beams a shade lighter than the columns under them. */
export const GUIDEWAY_BEAM_COLOR = 0xc9cbc8;
export const GUIDEWAY_COLUMN_COLOR = 0xb7bab8;

export interface GuidewayPoint {
  x: number;
  y: number;
  z: number;
}

/** One beam through one tile: its top at each end, in world metres. */
export interface GuidewayBeam {
  from: GuidewayPoint;
  to: GuidewayPoint;
  /** The beam runs along world x; otherwise along z. */
  alongX: boolean;
  /** The side of the guideway's centre line it stands on: +z for a beam along x, +x for one along z. */
  side: 1 | -1;
  tileX: number;
  tileZ: number;
}

/** One T-column: where it stands, which way the run goes, and its two heights. */
export interface GuidewayColumn {
  x: number;
  z: number;
  alongX: boolean;
  /** The road surface it stands on. */
  surfaceY: number;
  /** The underside of its crosshead. */
  crossheadY: number;
}

/**
 * The seat of a tram facing `heading` (yaw, +Z nosed, atan2(dx, dz)) at a
 * point: on the beam to the right of its travel, at its floor height. Null
 * off the guideway. Written into `out` when one is given.
 */
export type GuidewaySeatSampler = (
  x: number,
  z: number,
  heading: number,
  out?: GuidewayPoint,
) => GuidewayPoint | null;

export interface Guideway {
  beams: GuidewayBeam[];
  columns: GuidewayColumn[];
  seatAt: GuidewaySeatSampler;
}

type Role = 'guideway' | 'grade' | 'street' | 'none';

interface Dir {
  dx: number;
  dz: number;
}

const DIRS: readonly Dir[] = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];

/** A tile the guideway runs over: a reserved street, or a street it spans at a crossing. */
interface GuidewayNode {
  tile: FurnitureRoadTile;
  key: number;
  /** The directions the guideway leaves this tile in. */
  arms: Dir[];
  /** For a street the guideway spans, the axis it spans it along. */
  spannedAlongX?: boolean;
}

function profileOf(tile: FurnitureRoadTile): RoadProfile {
  return tile.profile ?? presetProfileForTier(tile.tier ?? RoadTier.TwoLane);
}

/** What a road tile is to the guideway: its own reservation, tram track at grade, a street, or neither. */
function roleOf(tile: FurnitureRoadTile): Role {
  const tier = tile.tier ?? RoadTier.TwoLane;
  if (!isStreetTier(tier)) return 'none';
  const profile = profileOf(tile);
  if (carriesGuideway(profile)) return 'guideway';
  return isTramTrack(tier, profile) ? 'grade' : 'street';
}

/**
 * Where the guideway's centre lies across the tile's road, from the road's
 * centre: midway between the reservation's two tracks. On half of a corridor
 * the reservation is split over the two tiles, so its centre is the edge the
 * halves share.
 */
function reservationCentre(profile: RoadProfile, flow: number): number {
  if (profile.seam) return profile.seam.side * carriagewayHalfWidthOf(profile);
  const tram = markingPlan(profile, flow).bands.filter((b) => b.kind === 'tram');
  if (tram.length === 0) return 0;
  return tram.reduce((sum, b) => sum + (b.from + b.to) / 2, 0) / tram.length;
}

/** The world coordinate across the run of a guideway tile's centre line, for a run along x (a z) or along z (an x). */
function ownLine(tile: FurnitureRoadTile, alongX: boolean): number {
  const profile = profileOf(tile);
  const flow = tile.flow ?? 0;
  const { shiftX, shiftZ } = seamShift(profile, flow);
  const base = alongX ? tileToWorld(tile.z) + shiftZ : tileToWorld(tile.x) + shiftX;
  return base + reservationCentre(profile, flow);
}

/** Half of a corridor carries half the reservation; the guideway is drawn once, from the low half. */
function drawsGuideway(tile: FurnitureRoadTile): boolean {
  const seam = profileOf(tile).seam;
  return !seam || seam.side === 1;
}

/** The beam top above the surface at an edge, `d` tiles along the guideway from grade. */
function rampTop(d: number): number {
  return GUIDEWAY_BEAM_TOP_M * Math.min(1, d / GUIDEWAY_RAMP_TILES);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Every beam and column of the guideway over `roadTiles`, and the sampler a
 * tram reads its seat from. Pure: the same tiles and surface give the same
 * structure.
 */
export function computeGuideway(
  roadTiles: readonly FurnitureRoadTile[],
  surfaceAt: (wx: number, wz: number) => number,
): Guideway {
  const tileSet = buildTileSet(roadTiles);
  const roles = new Map<number, Role>();
  for (const tile of roadTiles) roles.set(tileKey(tile.x, tile.z), roleOf(tile));
  const roleAt = (x: number, z: number): Role => roles.get(tileKey(x, z)) ?? 'none';

  const crossings = crossingsOf(roadTiles, tileSet, roleAt);
  const isNode = (x: number, z: number, alongX: boolean): boolean => {
    if (roleAt(x, z) === 'guideway') return true;
    const c = crossings.get(tileKey(x, z));
    return c !== undefined && c.spanned && c.alongX === alongX;
  };
  const isGrade = (x: number, z: number, alongX: boolean): boolean => {
    if (roleAt(x, z) === 'grade') return true;
    const c = crossings.get(tileKey(x, z));
    return c !== undefined && !c.spanned && c.alongX === alongX;
  };

  const nodes = new Map<number, GuidewayNode>();
  for (const tile of roadTiles) {
    const key = tileKey(tile.x, tile.z);
    const crossing = crossings.get(key);
    const spanned = crossing?.spanned ? crossing.alongX : undefined;
    if (roles.get(key) !== 'guideway' && spanned === undefined) continue;
    const arms = DIRS.filter((d) => {
      const alongX = d.dx !== 0;
      if (spanned !== undefined && spanned !== alongX) return false;
      const nx = tile.x + d.dx;
      const nz = tile.z + d.dz;
      if (!joins(tileSet, tile.x, tile.z, nx, nz)) return false;
      return isNode(nx, nz, alongX) || isGrade(nx, nz, alongX);
    });
    nodes.set(key, {
      tile,
      key,
      arms,
      ...(spanned === undefined ? {} : { spannedAlongX: spanned }),
    });
  }

  // Tiles along the guideway from tram track at grade, breadth first.
  const dist = new Map<number, number>();
  const queue: GuidewayNode[] = [];
  for (const node of nodes.values()) {
    const { x, z } = node.tile;
    if (node.arms.some((d) => isGrade(x + d.dx, z + d.dz, d.dx !== 0))) {
      dist.set(node.key, 1);
      queue.push(node);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    const d = dist.get(node.key)!;
    for (const arm of node.arms) {
      const next = nodes.get(tileKey(node.tile.x + arm.dx, node.tile.z + arm.dz));
      if (!next || dist.has(next.key)) continue;
      dist.set(next.key, d + 1);
      queue.push(next);
    }
  }
  const distOf = (node: GuidewayNode): number => dist.get(node.key) ?? Infinity;
  /** Beam top above the surface where `node` meets the tile in direction `d`. */
  const edgeTop = (node: GuidewayNode, d: Dir): number => {
    const own = distOf(node);
    if (!node.arms.includes(d)) return rampTop(own);
    const nx = node.tile.x + d.dx;
    const nz = node.tile.z + d.dz;
    const next = nodes.get(tileKey(nx, nz));
    const there = next ? distOf(next) : isGrade(nx, nz, d.dx !== 0) ? 0 : own;
    return rampTop(Math.min(own, there));
  };

  /** The axis a node's beams run straight along, or null at a turn or a junction. */
  const straightAxis = (node: GuidewayNode): boolean | null => {
    if (node.spannedAlongX !== undefined) return node.spannedAlongX;
    const ax = node.arms.filter((d) => d.dx !== 0).length;
    const az = node.arms.length - ax;
    if (ax === 0 && az === 0) return lateralAxis(tileSet, node.tile.x, node.tile.z) === 'z';
    if (az === 0) return true;
    if (ax === 0) return false;
    return null;
  };
  /**
   * The guideway's centre line across a run along `alongX` through `node`:
   * its own on a straight reserved tile, else the one the straight tiles it
   * joins along that axis carry, so the beams meet at every edge.
   */
  const lineAlong = (node: GuidewayNode, alongX: boolean, depth: number): number | null => {
    if (roleAt(node.tile.x, node.tile.z) === 'guideway' && straightAxis(node) === alongX) {
      return ownLine(node.tile, alongX);
    }
    if (depth === 0) return null;
    for (const d of node.arms) {
      if ((d.dx !== 0) !== alongX) continue;
      const next = nodes.get(tileKey(node.tile.x + d.dx, node.tile.z + d.dz));
      const line = next ? lineAlong(next, alongX, depth - 1) : null;
      if (line !== null) return line;
    }
    return null;
  };
  const lineOf = (node: GuidewayNode, alongX: boolean): number =>
    lineAlong(node, alongX, 2) ??
    (roleAt(node.tile.x, node.tile.z) === 'guideway'
      ? ownLine(node.tile, alongX)
      : alongX
        ? tileToWorld(node.tile.z)
        : tileToWorld(node.tile.x));

  const beams: GuidewayBeam[] = [];
  const columns: GuidewayColumn[] = [];
  const point = (alongX: boolean, along: number, across: number, top: number): GuidewayPoint => {
    const x = alongX ? along : across;
    const z = alongX ? across : along;
    return { x, y: surfaceAt(x, z) + top, z };
  };
  /** Both beams of a straight run from `lo` to `hi` along the axis, centred on `line`. */
  const run = (
    node: GuidewayNode,
    alongX: boolean,
    line: number,
    lo: number,
    hi: number,
    topLo: number,
    topHi: number,
  ): void => {
    for (const side of [-1, 1] as const) {
      const across = line + side * GUIDEWAY_BEAM_OFFSET_M;
      beams.push({
        from: point(alongX, lo, across, topLo),
        to: point(alongX, hi, across, topHi),
        alongX,
        side,
        tileX: node.tile.x,
        tileZ: node.tile.z,
      });
    }
  };
  const edgeOf = (node: GuidewayNode, d: Dir): number => {
    const t = d.dx !== 0 ? node.tile.x : node.tile.z;
    return (t + ((d.dx || d.dz) > 0 ? 1 : 0)) * TILE_METERS;
  };
  const LOW_X: Dir = DIRS[3]!;
  const HIGH_X: Dir = DIRS[1]!;
  const LOW_Z: Dir = DIRS[0]!;
  const HIGH_Z: Dir = DIRS[2]!;
  const through = (node: GuidewayNode, alongX: boolean): void => {
    const lo = alongX ? LOW_X : LOW_Z;
    const hi = alongX ? HIGH_X : HIGH_Z;
    run(
      node,
      alongX,
      lineOf(node, alongX),
      edgeOf(node, lo),
      edgeOf(node, hi),
      edgeTop(node, lo),
      edgeTop(node, hi),
    );
  };

  for (const node of nodes.values()) {
    const reserved = roleAt(node.tile.x, node.tile.z) === 'guideway';
    if (reserved && !drawsGuideway(node.tile)) continue;
    const axis = straightAxis(node);
    if (axis !== null) {
      through(node, axis);
      if (reserved) placeColumns(node, axis);
      continue;
    }
    const xArms = node.arms.filter((d) => d.dx !== 0);
    const zArms = node.arms.filter((d) => d.dz !== 0);
    if (xArms.length === 1 && zArms.length === 1) {
      turn(node, xArms[0]!, zArms[0]!);
      continue;
    }
    // A junction: straight through along each axis with an arm both ways, and
    // a stub from a lone arm in to the through run's centre line.
    for (const alongX of [true, false]) {
      const arms = alongX ? xArms : zArms;
      const crossArms = alongX ? zArms : xArms;
      if (arms.length === 2) through(node, alongX);
      else if (arms.length === 1 && crossArms.length === 2) {
        const arm = arms[0]!;
        const centreTop = (edgeTop(node, crossArms[0]!) + edgeTop(node, crossArms[1]!)) / 2;
        run(
          node,
          alongX,
          lineOf(node, alongX),
          edgeOf(node, arm),
          lineOf(node, !alongX),
          edgeTop(node, arm),
          centreTop,
        );
      }
    }
  }

  /**
   * A turn: each arm's two beams run in from the edge to meet the other arm's
   * at the corner, the outer pair past the centre and the inner pair short of
   * it, each reaching on by half its width so the corner closes.
   */
  function turn(node: GuidewayNode, xArm: Dir, zArm: Dir): void {
    const px = lineOf(node, false);
    const pz = lineOf(node, true);
    const cornerTop = (edgeTop(node, xArm) + edgeTop(node, zArm)) / 2;
    for (const [u, w] of [
      [xArm, zArm],
      [zArm, xArm],
    ] as const) {
      const alongX = u.dx !== 0;
      const edgeTopU = edgeTop(node, u);
      const edge = edgeOf(node, u);
      for (const a of [GUIDEWAY_BEAM_OFFSET_M, -GUIDEWAY_BEAM_OFFSET_M]) {
        const reach = a - GUIDEWAY_BEAM_WIDTH_M / 2;
        const sx = alongX ? edge : px + a * w.dx;
        const sz = alongX ? pz + a * w.dz : edge;
        const ex = px + a * w.dx + reach * u.dx;
        const ez = pz + a * w.dz + reach * u.dz;
        const lateral = alongX ? a * w.dz : a * w.dx;
        beams.push({
          from: { x: sx, y: surfaceAt(sx, sz) + edgeTopU, z: sz },
          to: { x: ex, y: surfaceAt(ex, ez) + cornerTop, z: ez },
          alongX,
          side: lateral > 0 ? 1 : -1,
          tileX: node.tile.x,
          tileZ: node.tile.z,
        });
      }
    }
  }

  /**
   * The columns down a straight reserved tile, one every
   * GUIDEWAY_COLUMN_SPACING_M of world metres along its run. None where road
   * crosses the tile, on a roundabout, or where the ramp has brought the
   * crosshead too near the road to stand one.
   */
  function placeColumns(node: GuidewayNode, alongX: boolean): void {
    const { tile } = node;
    if (tile.ring || hasCrossingRoad(tileSet, tile.x, tile.z)) return;
    const lo = alongX ? LOW_X : LOW_Z;
    const hi = alongX ? HIGH_X : HIGH_Z;
    const start = edgeOf(node, lo);
    const line = lineOf(node, alongX);
    const loAt = point(alongX, start, line, edgeTop(node, lo));
    const hiAt = point(alongX, start + TILE_METERS, line, edgeTop(node, hi));
    for (
      let k = Math.ceil(start / GUIDEWAY_COLUMN_SPACING_M);
      k * GUIDEWAY_COLUMN_SPACING_M < start + TILE_METERS;
      k++
    ) {
      const along = k * GUIDEWAY_COLUMN_SPACING_M;
      const t = (along - start) / TILE_METERS;
      const x = alongX ? along : line;
      const z = alongX ? line : along;
      const surfaceY = surfaceAt(x, z);
      const crossheadY =
        lerp(loAt.y, hiAt.y, t) - GUIDEWAY_BEAM_DEPTH_M - GUIDEWAY_CROSSHEAD_DEPTH_M;
      if (crossheadY - surfaceY < GUIDEWAY_MIN_CROSSHEAD_CLEARANCE_M) continue;
      columns.push({ x, z, alongX, surfaceY, crossheadY });
    }
  }

  return { beams, columns, seatAt: seatSampler(beams) };
}

interface Crossing {
  alongX: boolean;
  /** Reserved track at both ends: the guideway passes over, and nothing crosses at grade. */
  spanned: boolean;
}

/**
 * The streets a tramway crosses (`tramCrossingAxes`) next to a guideway, and
 * whether the guideway spans each: it does where the track at both ends is a
 * reservation. Where one end is street track the crossing is at grade, and
 * the guideway ramps down to it.
 */
function crossingsOf(
  roadTiles: readonly FurnitureRoadTile[],
  tileSet: RoadTileIndex,
  roleAt: (x: number, z: number) => Role,
): Map<number, Crossing> {
  const out = new Map<number, Crossing>();
  const roadOf = (x: number, z: number): TramCrossingRoad => {
    const role = roleAt(x, z);
    if (role === 'none') return 'none';
    return tramCrossingRoad(
      tileSet.get(tileKey(x, z))?.tier ?? RoadTier.TwoLane,
      role !== 'street',
    );
  };
  for (const tile of roadTiles) {
    if (roleAt(tile.x, tile.z) !== 'street') continue;
    const nearGuideway = DIRS.some(
      (d) =>
        roleAt(tile.x + d.dx, tile.z + d.dz) === 'guideway' ||
        roleAt(tile.x + 2 * d.dx, tile.z + 2 * d.dz) === 'guideway',
    );
    if (!nearGuideway) continue;
    const reach = (dx: number, dz: number, steps: 1 | 2): { x: number; z: number } | null => {
      let x = tile.x;
      let z = tile.z;
      for (let s = 0; s < steps; s++) {
        if (!joins(tileSet, x, z, x + dx, z + dz)) return null;
        x += dx;
        z += dz;
      }
      return { x, z };
    };
    const axes = tramCrossingAxes(roadOf(tile.x, tile.z), (dx, dz, steps) => {
      const at = reach(dx, dz, steps);
      return at ? roadOf(at.x, at.z) : 'none';
    });
    /** The tram track the crossing meets going (dx, dz): the next tile, or the one beyond. */
    const endRole = (dx: number, dz: number): Role => {
      const one = reach(dx, dz, 1);
      if (one && roadOf(one.x, one.z) === 'track') return roleAt(one.x, one.z);
      const two = reach(dx, dz, 2);
      return two ? roleAt(two.x, two.z) : 'none';
    };
    for (const alongX of [true, false]) {
      if (!(alongX ? axes.alongX : axes.alongZ)) continue;
      const dx = alongX ? 1 : 0;
      const dz = alongX ? 0 : 1;
      const spanned = endRole(dx, dz) === 'guideway' && endRole(-dx, -dz) === 'guideway';
      out.set(tileKey(tile.x, tile.z), { alongX, spanned });
      break;
    }
  }
  return out;
}

/**
 * The seat sampler over a set of beams: on the tile under the point, the beam
 * to the right of travel, preferring one that runs the way the tram faces and
 * then the nearest; the seat is the point on it beside the tram, at floor
 * height.
 */
function seatSampler(beams: readonly GuidewayBeam[]): GuidewaySeatSampler {
  const byTile = new Map<number, GuidewayBeam[]>();
  for (const beam of beams) {
    const key = tileKey(beam.tileX, beam.tileZ);
    const list = byTile.get(key);
    if (list) list.push(beam);
    else byTile.set(key, [beam]);
  }
  return (x, z, heading, out) => {
    const list = byTile.get(tileKey(worldToTile(x), worldToTile(z)));
    if (!list) return null;
    const hx = Math.sin(heading);
    const hz = Math.cos(heading);
    let best: GuidewayBeam | null = null;
    let bestAligned = false;
    let bestDist = Infinity;
    let bestT = 0;
    for (const beam of list) {
      const along = beam.alongX ? hx : hz;
      if (Math.abs(along) < 1e-6) continue;
      // The right of travel is (-hz, hx); the beam stands `side` across its run.
      const right = beam.alongX ? beam.side * hx : -beam.side * hz;
      if (right <= 0) continue;
      const aligned = Math.abs(along) >= Math.SQRT1_2 - 1e-9;
      const ax = beam.to.x - beam.from.x;
      const az = beam.to.z - beam.from.z;
      const len2 = ax * ax + az * az;
      const t =
        len2 > 0
          ? Math.min(1, Math.max(0, ((x - beam.from.x) * ax + (z - beam.from.z) * az) / len2))
          : 0;
      const d = Math.hypot(beam.from.x + ax * t - x, beam.from.z + az * t - z);
      if (best && bestAligned && !aligned) continue;
      if (best && aligned === bestAligned && d >= bestDist) continue;
      best = beam;
      bestAligned = aligned;
      bestDist = d;
      bestT = t;
    }
    if (!best) return null;
    const seat = out ?? { x: 0, y: 0, z: 0 };
    seat.x = lerp(best.from.x, best.to.x, bestT);
    seat.y = lerp(best.from.y, best.to.y, bestT) + TRAM_FLOOR_ABOVE_BEAM_M;
    seat.z = lerp(best.from.z, best.to.z, bestT);
    return seat;
  };
}

/** The guideway as instanced concrete: beams, stems and crossheads, one draw each. */
export class GuidewayRenderer {
  private readonly scene: THREE.Scene;
  private readonly surfaceAt: (wx: number, wz: number) => number;
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly beamMaterial = new THREE.MeshLambertMaterial({ color: GUIDEWAY_BEAM_COLOR });
  private readonly columnMaterial = new THREE.MeshLambertMaterial({ color: GUIDEWAY_COLUMN_COLOR });
  private meshes: THREE.InstancedMesh[] = [];
  private current: Guideway | null = null;

  /**
   * The seat of a tram on the guideway as last rebuilt; stable across
   * rebuilds, so a consumer is handed it once.
   */
  readonly seatAt: GuidewaySeatSampler = (x, z, heading, out) =>
    this.current ? this.current.seatAt(x, z, heading, out) : null;

  /** `surfaceAt` is the road surface the road mesh is laid on: the deck where there is one. */
  constructor(scene: THREE.Scene, surfaceAt: (wx: number, wz: number) => number) {
    this.scene = scene;
    this.surfaceAt = surfaceAt;
  }

  /** Replaces the whole guideway from the current road tiles. */
  rebuild(roadTiles: readonly FurnitureRoadTile[]): void {
    this.clearMeshes();
    const guideway = computeGuideway(roadTiles, this.surfaceAt);
    this.current = guideway;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    if (guideway.beams.length > 0) {
      const mesh = this.addMesh(this.beamMaterial, guideway.beams.length);
      guideway.beams.forEach((beam, i) => {
        const dx = beam.to.x - beam.from.x;
        const dy = beam.to.y - beam.from.y;
        const dz = beam.to.z - beam.from.z;
        const level = Math.hypot(dx, dz);
        // Yawed down the run, then pitched to the ramp's grade, never rolled:
        // the beam's top stays level across it.
        euler.set(-Math.atan2(dy, level), Math.atan2(dx, dz), 0);
        q.setFromEuler(euler);
        pos.set(
          (beam.from.x + beam.to.x) / 2,
          (beam.from.y + beam.to.y) / 2 - GUIDEWAY_BEAM_DEPTH_M / 2,
          (beam.from.z + beam.to.z) / 2,
        );
        scale.set(GUIDEWAY_BEAM_WIDTH_M, GUIDEWAY_BEAM_DEPTH_M, Math.hypot(level, dy));
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (guideway.columns.length > 0) {
      const stems = this.addMesh(this.columnMaterial, guideway.columns.length);
      const heads = this.addMesh(this.columnMaterial, guideway.columns.length);
      q.identity();
      guideway.columns.forEach((column, i) => {
        const height = column.crossheadY - column.surfaceY;
        pos.set(column.x, column.surfaceY + height / 2, column.z);
        scale.set(GUIDEWAY_STEM_M, height, GUIDEWAY_STEM_M);
        m.compose(pos, q, scale);
        stems.setMatrixAt(i, m);

        pos.set(column.x, column.crossheadY + GUIDEWAY_CROSSHEAD_DEPTH_M / 2, column.z);
        scale.set(
          column.alongX ? GUIDEWAY_CROSSHEAD_ALONG_M : GUIDEWAY_CROSSHEAD_ACROSS_M,
          GUIDEWAY_CROSSHEAD_DEPTH_M,
          column.alongX ? GUIDEWAY_CROSSHEAD_ACROSS_M : GUIDEWAY_CROSSHEAD_ALONG_M,
        );
        m.compose(pos, q, scale);
        heads.setMatrixAt(i, m);
      });
      stems.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    }
  }

  /** Beam segments drawn, for a test or a frame report. */
  beamCount(): number {
    return this.current?.beams.length ?? 0;
  }

  /** Columns drawn, each one stem and one crosshead. */
  columnCount(): number {
    return this.current?.columns.length ?? 0;
  }

  /** The instanced meshes, beams first, then stems, then crossheads. */
  meshList(): readonly THREE.InstancedMesh[] {
    return this.meshes;
  }

  private addMesh(material: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.box, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['underground'] = 'road';
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  private clearMeshes(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      // The unit box is the renderer's, which dispose() on an instance leaves alone.
      mesh.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clearMeshes();
    this.current = null;
    this.box.dispose();
    this.beamMaterial.dispose();
    this.columnMaterial.dispose();
  }
}
