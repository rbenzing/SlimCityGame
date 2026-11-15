/**
 * Bridge structure: what holds an elevated road up and what keeps traffic on
 * it. The deck surface itself is drawn by RoadMeshRenderer, which samples a
 * deck-aware height function — this file adds only what a deck needs and a
 * road on the ground does not:
 *   GIRDER — a slab under the road, so the deck reads as a structure with
 *            thickness rather than a floating ribbon of tarmac.
 *   PIERS  — tapered columns dropped at intervals from the girder underside to
 *            whatever is below, ground or riverbed, each with a wider footing.
 *   PARAPET— a wall down both edges, standing in for the curb and sidewalk an
 *            at-grade tile draws.
 *   TRUSS  — for rail only: lattice sides rising ABOVE the deck with cross
 *            bracing over it, the through-truss every railway bridge is.
 *
 * What a span looks like follows the road it carries, the same way the road
 * tiers themselves differ: a farm track gets bare planking, a street gets a
 * concrete beam, a motorway gets a deep box girder on heavy piers, and rail
 * gets steel. See {@link bridgeStyleFor}.
 *
 * Everything is instanced, one draw call per part PER STYLE — a city with a
 * timber footbridge and a motorway viaduct pays for two, not for every span.
 */
import * as THREE from 'three';
import { PIER_SPACING_TILES, TILE_METERS, tileToWorld, worldToTile } from '../shared/constants';
import { bridgeStyleFor, GIRDER_DEPTH_M } from '../shared/bridgestyle';
import type { BridgeStyle } from '../shared/bridgestyle';
import type { RoadTier } from '../shared/types';
import { carriagewayHalfWidthMeters, curbWidthMeters, ROAD_Y_OFFSET } from './roadsmesh';
import { carriagewayHalfWidthOf, carriagewayShiftOf, kerbWidthOf } from '../shared/roadprofile';
import type { RoadProfile } from '../shared/types';
import { setInstanceCount } from './groundquad';

/** A deck tile as the renderer needs it: where it is, how high, how wide. */
export interface BridgeDeckTile {
  x: number;
  z: number;
  tier: RoadTier;
  /** The tile's own cross-section when it carries a composed one. */
  profile?: RoadProfile;
  mask: number; // neighbor bitmask, +N=1 +E=2 +S=4 +W=8
  /** Deck world height (terrain + elevation), in metres. */
  deckY: number;
  /** Ground world height under the tile, in metres. */
  groundY: number;
  /**
   * The road passing over a crossing tile, spanning the road beneath it: it
   * rests on the piers either side, and no pier stands in the road below.
   */
  crossing?: boolean;
}

/** Everything that differs between one bridge family and the next. */
interface StyleSpec {
  /** Depth of the slab under the road. */
  girderDepth: number;
  girderColor: number;
  /** How far the structure oversails the carriageway on each side. */
  overhang: number;
  parapetHeight: number;
  parapetThickness: number;
  parapetColor: number;
  pierRadiusTop: number;
  pierRadiusBottom: number;
  /** Round columns, or a squared-off pile — concrete piers read square. */
  pierSquare: boolean;
  pierColor: number;
  footingRadius: number;
  /** Steel lattice sides rising above the deck, for a through-truss. */
  truss: boolean;
}

const STYLES: Record<BridgeStyle, StyleSpec> = {
  // A farm track over a creek: planking on light posts, no parapet worth the
  // name, just a rail to stop you going over the side.
  plank: {
    girderDepth: GIRDER_DEPTH_M.plank,
    girderColor: 0x8a7c64,
    overhang: 0.1,
    parapetHeight: 0.75,
    parapetThickness: 0.1,
    parapetColor: 0x7d6a4f,
    pierRadiusTop: 0.22,
    pierRadiusBottom: 0.26,
    pierSquare: true,
    pierColor: 0x6f5c43,
    footingRadius: 0.4,
    truss: false,
  },
  // The ordinary street bridge: a concrete beam on round columns.
  beam: {
    girderDepth: GIRDER_DEPTH_M.beam,
    girderColor: 0x8a8f96,
    overhang: 0.25,
    parapetHeight: 1.0,
    parapetThickness: 0.28,
    parapetColor: 0xb9bec4,
    pierRadiusTop: 0.55,
    pierRadiusBottom: 0.75,
    pierSquare: false,
    pierColor: 0x9aa0a6,
    footingRadius: 1.1,
    truss: false,
  },
  // Motorway viaduct: a deep box girder on heavy squared piers. The depth is
  // the whole silhouette — this is what a big road crossing looks like from a
  // distance.
  box: {
    girderDepth: GIRDER_DEPTH_M.box,
    girderColor: 0xa9aeb4,
    overhang: 0.45,
    parapetHeight: 1.15,
    parapetThickness: 0.34,
    parapetColor: 0xc3c8ce,
    pierRadiusTop: 0.95,
    pierRadiusBottom: 1.2,
    pierSquare: true,
    pierColor: 0xa2a8ae,
    footingRadius: 1.7,
    truss: false,
  },
  // Railway through-truss: a shallow deck carried inside steel lattice sides.
  truss: {
    girderDepth: GIRDER_DEPTH_M.truss,
    girderColor: 0x5d6a63,
    overhang: 0.2,
    parapetHeight: 0,
    parapetThickness: 0,
    parapetColor: 0x000000,
    pierRadiusTop: 0.7,
    pierRadiusBottom: 0.9,
    pierSquare: true,
    pierColor: 0x8f8a80,
    footingRadius: 1.3,
    truss: true,
  },
};

const PIER_RADIAL_SEGMENTS = 8;
const FOOTING_HEIGHT = 0.5;
/** Sink the footing a little so it reads as bedded into the ground, not set on it. */
const FOOTING_EMBED = 0.25;
/** Longest stretch of structure sampled against the deck and the ground as one piece. */
const SEGMENT_M = 5;
/** A girder is drawn only where the deck stands this far above the ground, over its own depth. */
const GIRDER_CLEARANCE_M = 0.3;
/** How far a retaining wall is sunk below the ground at each end, so it never floats. */
const FILL_EMBED = 0.15;
/** Straight pieces a dead end's rounded cap is drawn in. */
const CAP_ARC_STEPS = 8;

// --- Through-truss ------------------------------------------------------------
const TRUSS_HEIGHT = 4.2; // top chord well above a train's roof
const TRUSS_MEMBER = 0.16;
const TRUSS_COLOR = 0x4f5f57;
/** Panels per tile — the lattice pitch; a vertical stands at every panel point. */
const TRUSS_BAYS_PER_TILE = 2;
/** Members one tile of truss draws: chords, verticals and diagonals each side, and the braces between. */
const TRUSS_MEMBERS_PER_TILE =
  2 * (2 + (TRUSS_BAYS_PER_TILE + 1) + TRUSS_BAYS_PER_TILE) + (TRUSS_BAYS_PER_TILE - 1);

/** True on the tiles a pier drops from — deterministic, so it never flickers. */
export function isPierTile(x: number, z: number): boolean {
  return (x + z) % PIER_SPACING_TILES === 0;
}

/**
 * Which way the road runs through a tile, from its neighbour mask: true when it
 * runs along Z (north-south), so the parapets step out along X. A tile with no
 * clear axis falls back to the same answer as a north-south run.
 */
export function runsAlongZ(mask: number): boolean {
  const ns = (mask & 1) !== 0 || (mask & 4) !== 0;
  const ew = (mask & 2) !== 0 || (mask & 8) !== 0;
  if (ew && !ns) return false;
  return true;
}

/**
 * Half-width of the structure under a tile: carriageway, whatever curb the tier
 * actually draws, and the style's overhang. A deck is built to the road it
 * carries — a motorway's curb is half a metre, so its span hugs the
 * carriageway rather than fanning out into empty tarmac either side.
 */
export function structureHalfWidth(
  tier: RoadTier,
  style: BridgeStyle,
  /** The deck's own cross-section when it carries a composed one; the span is built to it. */
  profile?: RoadProfile,
): number {
  const half = profile ? carriagewayHalfWidthOf(profile) : carriagewayHalfWidthMeters(tier);
  const kerb = profile ? kerbWidthOf(profile) : curbWidthMeters(tier);
  return half + kerb + STYLES[style].overhang;
}

interface StyleGroup {
  style: BridgeStyle;
  tiles: BridgeDeckTile[];
}

/** A corner of a tile's structure footprint, in world XZ. */
type Corner = readonly [number, number];

/**
 * Emits one prism into `positions`: four corners in world XZ, each with its own
 * top height, extruded down by `depth`. The sides and the underside are drawn;
 * the top is not, because the road surface covers it.
 *
 * Corner heights come from the SAME sampler the road surface uses, so two
 * neighbouring tiles evaluate their shared edge to the same pair of heights and
 * the structure runs continuously across it. Giving each tile one flat height
 * instead is what makes a span read as a stack of separate slabs.
 */
export function emitPrism(
  positions: number[],
  corners: readonly [Corner, Corner, Corner, Corner],
  topY: readonly [number, number, number, number],
  depth: number,
): void {
  const push = (i: number, y: number): void => {
    positions.push(corners[i]![0], y, corners[i]![1]);
  };
  const quad = (a: number, b: number, c: number, d: number, ys: readonly number[]): void => {
    push(a, ys[0]!);
    push(b, ys[1]!);
    push(c, ys[2]!);
    push(a, ys[0]!);
    push(c, ys[2]!);
    push(d, ys[3]!);
  };

  const bot = topY.map((y) => y - depth);
  // Sides, wound outward-facing for a corner list running counter-clockwise.
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(i, j, j, i, [topY[i]!, topY[j]!, bot[j]!, bot[i]!]);
  }
  // Underside, wound to face down.
  quad(0, 2, 1, 0, [bot[0]!, bot[2]!, bot[1]!, bot[0]!]);
  quad(0, 3, 2, 0, [bot[0]!, bot[3]!, bot[2]!, bot[0]!]);
}

/**
 * Emits one wall face from edge a-b: its top at the given heights, its foot at
 * the given heights. Wound outward-facing for a counter-clockwise footprint.
 */
export function emitWall(
  positions: number[],
  a: Corner,
  b: Corner,
  topA: number,
  topB: number,
  botA: number,
  botB: number,
): void {
  positions.push(a[0], topA, a[1], b[0], topB, b[1], b[0], botB, b[1]);
  positions.push(a[0], topA, a[1], b[0], botB, b[1], a[0], botA, a[1]);
}

/**
 * The four corners of a stretch of structure, in world XZ, listed
 * counter-clockwise: lateral offsets `l0`..`l1` across the run, `a0`..`a1`
 * along it, from the point (wx, wz). Edges 1 and 3 are the lateral ones.
 */
export function segmentCorners(
  wx: number,
  wz: number,
  alongZ: boolean,
  a0: number,
  a1: number,
  l0: number,
  l1: number,
): [Corner, Corner, Corner, Corner] {
  return alongZ
    ? [
        [wx + l0, wz + a0],
        [wx + l1, wz + a0],
        [wx + l1, wz + a1],
        [wx + l0, wz + a1],
      ]
    : [
        [wx + a0, wz + l0],
        [wx + a0, wz + l1],
        [wx + a1, wz + l1],
        [wx + a1, wz + l0],
      ];
}

/** Buckets deck tiles by the family their road is bridged in. */
export function groupByStyle(tiles: readonly BridgeDeckTile[]): StyleGroup[] {
  const byStyle = new Map<BridgeStyle, BridgeDeckTile[]>();
  for (const tile of tiles) {
    const style = bridgeStyleFor(tile.tier);
    const list = byStyle.get(style);
    if (list) list.push(tile);
    else byStyle.set(style, [tile]);
  }
  return [...byStyle.entries()].map(([style, group]) => ({ style, tiles: group }));
}

export class BridgeRenderer {
  private readonly scene: THREE.Scene;

  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly columnGeometry = new THREE.CylinderGeometry(1, 1, 1, PIER_RADIAL_SEGMENTS);
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();
  private meshes: (THREE.InstancedMesh | THREE.Mesh)[] = [];
  private readonly deckHeightAt: (wx: number, wz: number) => number;
  private readonly crossingDeckAt: (wx: number, wz: number, cx: number, cz: number) => number;
  private readonly groundAt: ((wx: number, wz: number) => number) | undefined;

  /**
   * `deckHeightAt` must be the SAME sampler the road mesh uses, or the
   * structure and the surface it carries will disagree about where the deck is.
   */
  constructor(
    scene: THREE.Scene,
    deckHeightAt: (wx: number, wz: number) => number,
    /**
     * The deck of the road passing over crossing tile (cx, cz). A point on a
     * crossing tile is on two roads at once, and the ordinary sampler answers
     * for the one beneath. Omitted, it is the ordinary sampler.
     */
    crossingDeckAt: (wx: number, wz: number, cx: number, cz: number) => number = (wx, wz) =>
      deckHeightAt(wx, wz),
    /**
     * The terrain under a world point. Walls and footings follow it; omitted,
     * the ground is level at each tile's own `groundY`.
     */
    groundAt?: (wx: number, wz: number) => number,
  ) {
    this.scene = scene;
    this.deckHeightAt = deckHeightAt;
    this.crossingDeckAt = crossingDeckAt;
    this.groundAt = groundAt;
  }

  /** Replaces the whole structure from the current set of deck tiles. */
  rebuild(tiles: readonly BridgeDeckTile[]): void {
    this.clearMeshes();
    if (tiles.length === 0) return;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    const crossings = new Set(tiles.filter((t) => t.crossing).map((t) => `${t.x},${t.z}`));
    const crossingAt = (x: number, z: number): { x: number; z: number } | null =>
      crossings.has(`${x},${z}`) ? { x, z } : null;
    const decks = new Set(tiles.map((t) => `${t.x},${t.z}`));
    const ground = (tile: BridgeDeckTile, wx: number, wz: number): number =>
      this.groundAt ? this.groundAt(wx, wz) : tile.groundY;

    for (const { style, tiles: group } of groupByStyle(tiles)) {
      const spec = STYLES[style];
      // A pier drops only where the deck is high enough to carry a girder.
      const piers = group.filter(
        (t) =>
          !t.crossing &&
          isPierTile(t.x, t.z) &&
          t.deckY - ground(t, tileToWorld(t.x), tileToWorld(t.z)) >=
            spec.girderDepth + GIRDER_CLEARANCE_M,
      );

      // Girder and parapets are MERGED, deck-conforming geometry rather than
      // one box per tile: they sample the same smooth deck profile the road
      // surface does, so neighbouring tiles meet exactly and a span reads as
      // one continuous paved road instead of a row of stacked slabs.
      const girderPositions: number[] = [];
      const parapetPositions: number[] = [];
      const columns =
        piers.length > 0
          ? this.addMesh(
              spec.pierSquare ? this.boxGeometry : this.columnGeometry,
              spec.pierColor,
              piers.length,
            )
          : null;
      const footings =
        piers.length > 0 ? this.addMesh(this.boxGeometry, spec.pierColor, piers.length) : null;
      // A through-truss carries two lattice sides plus overhead bracing; each
      // tile contributes both chords, its diagonals, and one cross brace.
      const trussParts = spec.truss
        ? this.addMesh(this.boxGeometry, TRUSS_COLOR, group.length * TRUSS_MEMBERS_PER_TILE)
        : null;
      let trussSlot = 0;

      group.forEach((tile) => {
        const half = structureHalfWidth(tile.tier, style, tile.profile);
        const alongZ = runsAlongZ(tile.mask);
        // Half of a motorway laid across two tiles is pushed against the edge
        // the halves share, and its deck goes with it: one deck, both tiles wide.
        const shift = tile.profile ? carriagewayShiftOf(tile.profile) : 0;
        const wx = tileToWorld(tile.x) + (alongZ ? shift : 0);
        const wz = tileToWorld(tile.z) + (alongZ ? 0 : shift);
        const seamSide = tile.profile?.seam?.side;
        const deckTop = tile.deckY + ROAD_Y_OFFSET;
        const span = TILE_METERS;

        /** Deck top at a world point, from the shared smooth profile. */
        // A span reaches past its tile where the deck runs on, down to the
        // ground. Where it runs onto a crossing,
        // the corners that land in the crossing tile are on the overpass deck:
        // the ordinary sampler would answer for the road beneath and hang the
        // end of the girder down to it.
        const topAt = (c: Corner): number => {
          const tx = worldToTile(c[0]);
          const tz = worldToTile(c[1]);
          const onCrossing = tile.crossing ? { x: tile.x, z: tile.z } : crossingAt(tx, tz);
          const deck = onCrossing
            ? this.crossingDeckAt(c[0], c[1], onCrossing.x, onCrossing.z)
            : this.deckHeightAt(c[0], c[1]);
          return deck + ROAD_Y_OFFSET;
        };
        const topsOf = (
          corners: readonly [Corner, Corner, Corner, Corner],
        ): [number, number, number, number] => [
          topAt(corners[0]),
          topAt(corners[1]),
          topAt(corners[2]),
          topAt(corners[3]),
        ];

        const groundOf = (c: Corner): number => ground(tile, c[0], c[1]);

        // The structure is the road's own width, edge to edge. Along the edge
        // where the deck carries on onto the other half it stops at the road's
        // edge, since the other half's structure carries on from there.
        const roadHalf = tile.profile ? carriagewayHalfWidthOf(tile.profile) : half;
        const deckEdge = half - spec.overhang;
        const lateral = (side: -1 | 1, reach: number): number =>
          side * (side === seamSide ? roadHalf : reach);

        // Where the deck runs on past the tile's edge. A deck meeting the
        // ground without a deck beyond it slopes down over the next half tile,
        // so the structure follows it down; a dead end rounds off in a cap.
        const alongBits = alongZ ? ([1, 4] as const) : ([8, 2] as const);
        const alongStep = alongZ ? ([0, -1, 0, 1] as const) : ([-1, 0, 1, 0] as const);
        const connections = [1, 2, 4, 8].filter((bit) => (tile.mask & bit) !== 0).length;
        const endKind = (end: 0 | 1): 'deck' | 'ground' | 'cap' => {
          if (decks.has(`${tile.x + alongStep[end * 2]!},${tile.z + alongStep[end * 2 + 1]!}`)) {
            return 'deck';
          }
          if ((tile.mask & alongBits[end]) !== 0) return 'ground';
          return connections === 1 ? 'cap' : 'deck';
        };
        const lowEnd = endKind(0);
        const highEnd = endKind(1);
        const a0 = -span / 2 - (lowEnd === 'ground' ? span / 2 : 0);
        const a1 = span / 2 + (highEnd === 'ground' ? span / 2 : 0);

        const parapetOn = spec.parapetHeight > 0;
        const needs = spec.girderDepth + GIRDER_CLEARANCE_M;
        /**
         * One stretch of structure over `corners` (counter-clockwise; edges 1
         * and 3 the outer ones): a girder with a parapet along each outer edge
         * where the deck stands clear of the ground, else a wall dropped from
         * each outer edge to the ground under it.
         */
        const emitStretch = (
          girderCorners: readonly [Corner, Corner, Corner, Corner],
          wallCorners: readonly [Corner, Corner, Corner, Corner],
          parapets: readonly (readonly [Corner, Corner, Corner, Corner])[],
          outer: readonly number[],
        ): void => {
          const tops = topsOf(girderCorners);
          const clear = Math.min(
            ...girderCorners.map((c, i) => tops[i]! - ROAD_Y_OFFSET - groundOf(c)),
          );
          if (clear >= needs) {
            emitPrism(girderPositions, girderCorners, tops, spec.girderDepth);
            if (!parapetOn) return;
            // A parapet is the same conforming prism, inverted: it stands ON the
            // deck, so its "depth" runs upward from a top placed a parapet-height
            // above the surface.
            for (const corners of parapets) {
              const up = topsOf(corners).map((y) => y + spec.parapetHeight) as [
                number,
                number,
                number,
                number,
              ];
              emitPrism(parapetPositions, corners, up, spec.parapetHeight);
            }
            return;
          }
          const wallTops = topsOf(wallCorners);
          for (const e of outer) {
            const f = (e + 1) % 4;
            const p = wallCorners[e]!;
            const r = wallCorners[f]!;
            const foot = (i: number, c: Corner): number =>
              Math.min(groundOf(c), wallTops[i]!) - FILL_EMBED;
            const dropP = wallTops[e]! - groundOf(p);
            const dropR = wallTops[f]! - groundOf(r);
            // The road's own thickness is no wall: a deck on the ground has none.
            if (Math.max(dropP, dropR) <= ROAD_Y_OFFSET + 1e-3) continue;
            emitWall(girderPositions, p, r, wallTops[e]!, wallTops[f]!, foot(e, p), foot(f, r));
          }
        };

        const sideOf = (e: number): -1 | 1 => (e === 1 ? 1 : -1);
        const stretches = Math.max(1, Math.ceil((a1 - a0) / SEGMENT_M));
        for (let k = 0; k < stretches; k++) {
          const s0 = a0 + ((a1 - a0) * k) / stretches;
          const s1 = a0 + ((a1 - a0) * (k + 1)) / stretches;
          const girder = segmentCorners(
            wx,
            wz,
            alongZ,
            s0,
            s1,
            lateral(-1, half),
            lateral(1, half),
          );
          const wall = segmentCorners(
            wx,
            wz,
            alongZ,
            s0,
            s1,
            lateral(-1, deckEdge),
            lateral(1, deckEdge),
          );
          const parapets = ([-1, 1] as const)
            // No parapet along the edge where the deck carries on onto the other half.
            .filter((side) => side !== seamSide)
            .map((side) =>
              segmentCorners(
                wx,
                wz,
                alongZ,
                s0,
                s1,
                side === -1 ? -half : half - spec.parapetThickness,
                side === -1 ? -half + spec.parapetThickness : half,
              ),
            );
          const outer = [1, 3].filter((e) => sideOf(e) !== seamSide);
          emitStretch(girder, wall, parapets, outer);
        }

        // A dead end's rounded cap: the structure and its parapet run round it.
        for (const end of [0, 1] as const) {
          if ((end === 0 ? lowEnd : highEnd) !== 'cap') continue;
          const outward = end === 0 ? -1 : 1;
          const edge = outward * (span / 2);
          const cx = alongZ ? wx : wx + edge;
          const cz = alongZ ? wz + edge : wz;
          const arc = (radius: number): Corner[] => {
            const pts: Corner[] = [];
            for (let i = 0; i <= CAP_ARC_STEPS; i++) {
              const t = (Math.PI * i) / CAP_ARC_STEPS;
              const across = radius * Math.cos(t);
              const beyond = outward * radius * Math.sin(t);
              pts.push(alongZ ? [cx + across, cz + beyond] : [cx + beyond, cz + across]);
            }
            return pts;
          };
          const centre: Corner = [cx, cz];
          const girderArc = arc(half);
          const wallArc = arc(deckEdge);
          const ringIn = arc(half - spec.parapetThickness);
          // Wind the fan counter-clockwise seen from above, whichever way this end faces.
          const wedge = (a: Corner, b: Corner): [Corner, Corner, Corner, Corner] => [
            centre,
            a,
            b,
            centre,
          ];
          const area = (c: readonly Corner[]): number =>
            c.reduce((sum, p, i) => {
              const n = c[(i + 1) % c.length]!;
              return sum + p[0] * n[1] - n[0] * p[1];
            }, 0);
          const flip = area(wedge(girderArc[0]!, girderArc[1]!)) < 0;
          const order = <T>(list: T[]): T[] => (flip ? [...list].reverse() : list);
          const g = order(girderArc);
          const w = order(wallArc);
          const rin = order(ringIn);
          for (let i = 0; i < CAP_ARC_STEPS; i++) {
            const ring: [Corner, Corner, Corner, Corner] = [rin[i]!, g[i]!, g[i + 1]!, rin[i + 1]!];
            emitStretch(wedge(g[i]!, g[i + 1]!), wedge(w[i]!, w[i + 1]!), [ring], [1]);
          }
        }

        if (trussParts) {
          trussSlot = this.writeTruss(trussParts, trussSlot, {
            wx,
            wz,
            deckTop,
            half,
            alongZ,
            span,
            m,
            q,
            yAxis,
            pos,
            scale,
          });
        }
      });

      piers.forEach((tile, i) => {
        if (!columns || !footings) return;
        const wx = tileToWorld(tile.x);
        const wz = tileToWorld(tile.z);
        // The footing is seated on the ground under all four of its corners: its
        // foot is sunk to the lowest and its top stands clear of the highest.
        const reach = spec.footingRadius;
        const under = [-reach, reach].flatMap((dx) =>
          [-reach, reach].map((dz) => ground(tile, wx + dx, wz + dz)),
        );
        const footingBottom = Math.min(...under) - FOOTING_EMBED;
        const footingTop = Math.max(...under) + FOOTING_HEIGHT - FOOTING_EMBED;
        const columnTop = tile.deckY + ROAD_Y_OFFSET - spec.girderDepth;
        const height = Math.max(0.1, columnTop - footingTop);

        pos.set(wx, footingTop + height / 2, wz);
        // A cylinder's unit geometry is radius 1; a box's is width 1. Scale each
        // to the same finished thickness.
        const thickness = spec.pierSquare ? spec.pierRadiusBottom * 2 : spec.pierRadiusBottom;
        scale.set(thickness, height, thickness);
        m.compose(pos, q, scale);
        columns.setMatrixAt(i, m);

        pos.set(wx, (footingBottom + footingTop) / 2, wz);
        scale.set(spec.footingRadius * 2, footingTop - footingBottom, spec.footingRadius * 2);
        m.compose(pos, q, scale);
        footings.setMatrixAt(i, m);
      });

      this.addMergedMesh(girderPositions, spec.girderColor);
      this.addMergedMesh(parapetPositions, spec.parapetColor);

      for (const mesh of [columns, footings, trussParts]) {
        if (!mesh) continue;
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (trussParts) setInstanceCount(trussParts, trussSlot);
    }
  }

  /**
   * One tile's worth of through-truss: a bottom and top chord down each side,
   * the diagonals webbing between them, and a brace carrying over the deck.
   */
  private writeTruss(
    mesh: THREE.InstancedMesh,
    startSlot: number,
    ctx: {
      wx: number;
      wz: number;
      deckTop: number;
      half: number;
      alongZ: boolean;
      span: number;
      m: THREE.Matrix4;
      q: THREE.Quaternion;
      yAxis: THREE.Vector3;
      pos: THREE.Vector3;
      scale: THREE.Vector3;
    },
  ): number {
    const { wx, wz, deckTop, half, alongZ, span, m, q, yAxis, pos, scale } = ctx;
    let slot = startSlot;
    const sideOffset = half - TRUSS_MEMBER;
    const topY = deckTop + TRUSS_HEIGHT;

    const put = (
      px: number,
      py: number,
      pz: number,
      sx: number,
      sy: number,
      sz: number,
      direction?: THREE.Vector3,
    ): void => {
      pos.set(px, py, pz);
      scale.set(sx, sy, sz);
      if (direction) q.setFromUnitVectors(yAxis, direction);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(slot++, m);
      q.identity();
    };

    // Chords run the tile's whole length, so neighbouring tiles' chords abut.
    // Every web member runs between two panel points, one on each chord.
    const bottomY = deckTop + TRUSS_MEMBER / 2;
    const panel = TILE_METERS / TRUSS_BAYS_PER_TILE;
    const at = (side: number, t: number, y: number): THREE.Vector3 =>
      new THREE.Vector3(
        wx + (alongZ ? side * sideOffset : t),
        y,
        wz + (alongZ ? t : side * sideOffset),
      );
    /** One member from `from` to `to`, a box scaled to the distance between them. */
    const member = (from: THREE.Vector3, to: THREE.Vector3): void => {
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const along = to.clone().sub(from);
      put(
        mid.x,
        mid.y,
        mid.z,
        TRUSS_MEMBER,
        along.length(),
        TRUSS_MEMBER,
        along.clone().normalize(),
      );
    };

    for (const side of [-1, 1]) {
      for (const y of [bottomY, topY]) {
        put(
          wx + (alongZ ? side * sideOffset : 0),
          y,
          wz + (alongZ ? 0 : side * sideOffset),
          alongZ ? TRUSS_MEMBER : span,
          TRUSS_MEMBER,
          alongZ ? span : TRUSS_MEMBER,
        );
      }
      for (let b = 0; b <= TRUSS_BAYS_PER_TILE; b++) {
        const t = -span / 2 + panel * b;
        member(at(side, t, bottomY), at(side, t, topY));
      }
      // Diagonals alternate their lean, so each panel point meets one of each.
      for (let b = 0; b < TRUSS_BAYS_PER_TILE; b++) {
        const t0 = -span / 2 + panel * b;
        const rising = b % 2 === 0;
        member(
          at(side, t0, rising ? bottomY : topY),
          at(side, t0 + panel, rising ? topY : bottomY),
        );
      }
    }

    // Overhead braces tying the two top chords together at the inner panel points.
    for (let b = 1; b < TRUSS_BAYS_PER_TILE; b++) {
      const t = -span / 2 + panel * b;
      member(at(-1, t, topY), at(1, t, topY));
    }
    return slot;
  }

  private material(color: number): THREE.MeshLambertMaterial {
    let material = this.materials.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      this.materials.set(color, material);
    }
    return material;
  }

  private addMesh(
    geometry: THREE.BufferGeometry,
    color: number,
    count: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.material(color), count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['underground'] = 'road';
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  /** Adds one merged, deck-conforming layer. No-op for an empty position list. */
  private addMergedMesh(positions: number[], color: number): THREE.Mesh | null {
    if (positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material(color));
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
      // Merged layers own their geometry outright; instanced ones share the
      // renderer's unit box/cylinder, which dispose() leaves alone.
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      else mesh.geometry.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clearMeshes();
    this.boxGeometry.dispose();
    this.columnGeometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
