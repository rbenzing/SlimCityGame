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
import { PIER_SPACING_TILES, TILE_METERS, tileToWorld } from '../shared/constants';
import { RoadTier } from '../shared/types';
import { carriagewayHalfWidthMeters, curbWidthMeters, ROAD_Y_OFFSET } from './roadsmesh';
import { setInstanceCount } from './groundquad';

/** A deck tile as the renderer needs it: where it is, how high, how wide. */
export interface BridgeDeckTile {
  x: number;
  z: number;
  tier: RoadTier;
  mask: number; // neighbor bitmask, +N=1 +E=2 +S=4 +W=8
  /** Deck world height (terrain + elevation), in metres. */
  deckY: number;
  /** Ground world height under the tile, in metres. */
  groundY: number;
}

/**
 * The structural families a span can be built in. Deliberately a short list of
 * clearly different silhouettes rather than one per tier — the point is that a
 * player reads what a bridge carries from across the map.
 */
export type BridgeStyle = 'plank' | 'beam' | 'box' | 'truss';

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
    girderDepth: 0.3,
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
    girderDepth: 0.75,
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
    girderDepth: 1.5,
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
    girderDepth: 0.55,
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

/** Which family a road tier's spans are built in. */
export function bridgeStyleFor(tier: RoadTier): BridgeStyle {
  switch (tier) {
    case RoadTier.RailTrack:
      return 'truss';
    case RoadTier.Highway:
    case RoadTier.Avenue:
      return 'box';
    case RoadTier.Gravel:
    case RoadTier.Alley:
    case RoadTier.BikeLane:
      return 'plank';
    default:
      return 'beam';
  }
}

const PIER_RADIAL_SEGMENTS = 8;
const FOOTING_HEIGHT = 0.5;
/** Sink the footing a little so it reads as bedded into the ground, not set on it. */
const FOOTING_EMBED = 0.25;
/** Slightly over a tile, so neighbouring spans meet without a seam. */
const TILE_SPAN = TILE_METERS * 1.02;

// --- Through-truss ------------------------------------------------------------
const TRUSS_HEIGHT = 4.2; // top chord well above a train's roof
const TRUSS_MEMBER = 0.16;
const TRUSS_COLOR = 0x4f5f57;
/** Diagonals per tile — the lattice pitch. */
const TRUSS_BAYS_PER_TILE = 2;

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
export function structureHalfWidth(tier: RoadTier, style: BridgeStyle): number {
  return carriagewayHalfWidthMeters(tier) + curbWidthMeters(tier) + STYLES[style].overhang;
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
 * The four corners of a tile's structure footprint, in world XZ, listed
 * counter-clockwise. `half` is the structure's half-width; the run direction
 * decides which axis it spreads along.
 */
export function footprintCorners(
  wx: number,
  wz: number,
  half: number,
  alongZ: boolean,
  span: number,
  lateralFrom = -1,
  lateralTo = 1,
): [Corner, Corner, Corner, Corner] {
  const a = span / 2;
  const l0 = half * lateralFrom;
  const l1 = half * lateralTo;
  return alongZ
    ? [
        [wx + l0, wz - a],
        [wx + l1, wz - a],
        [wx + l1, wz + a],
        [wx + l0, wz + a],
      ]
    : [
        [wx - a, wz + l0],
        [wx - a, wz + l1],
        [wx + a, wz + l1],
        [wx + a, wz + l0],
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

  /**
   * `deckHeightAt` must be the SAME sampler the road mesh uses, or the
   * structure and the surface it carries will disagree about where the deck is.
   */
  constructor(scene: THREE.Scene, deckHeightAt: (wx: number, wz: number) => number) {
    this.scene = scene;
    this.deckHeightAt = deckHeightAt;
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

    for (const { style, tiles: group } of groupByStyle(tiles)) {
      const spec = STYLES[style];
      const piers = group.filter(
        (t) => isPierTile(t.x, t.z) && t.deckY - t.groundY > FOOTING_HEIGHT,
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
        ? this.addMesh(this.boxGeometry, TRUSS_COLOR, group.length * (5 + 2 * TRUSS_BAYS_PER_TILE))
        : null;
      let trussSlot = 0;

      group.forEach((tile) => {
        const wx = tileToWorld(tile.x);
        const wz = tileToWorld(tile.z);
        const half = structureHalfWidth(tile.tier, style);
        const alongZ = runsAlongZ(tile.mask);
        const deckTop = tile.deckY + ROAD_Y_OFFSET;
        const span = TILE_SPAN;

        /** Deck top at a world point, from the shared smooth profile. */
        const topAt = (c: Corner): number => this.deckHeightAt(c[0], c[1]) + ROAD_Y_OFFSET;
        const topsOf = (corners: readonly [Corner, Corner, Corner, Corner]): [
          number,
          number,
          number,
          number,
        ] => [topAt(corners[0]), topAt(corners[1]), topAt(corners[2]), topAt(corners[3])];

        // Girder: the slab under the whole road width, following the deck.
        const girderCorners = footprintCorners(wx, wz, half, alongZ, span);
        emitPrism(girderPositions, girderCorners, topsOf(girderCorners), spec.girderDepth);

        if (spec.parapetHeight > 0) {
          // A parapet is the same conforming prism, inverted: it stands ON the
          // deck, so its "depth" runs upward from a top placed a parapet-height
          // above the surface.
          const t = spec.parapetThickness / half;
          for (const [from, to] of [
            [-1, -1 + t],
            [1 - t, 1],
          ] as const) {
            const corners = footprintCorners(wx, wz, half, alongZ, span, from, to);
            const tops = topsOf(corners).map((y) => y + spec.parapetHeight) as [
              number,
              number,
              number,
              number,
            ];
            emitPrism(parapetPositions, corners, tops, spec.parapetHeight);
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
        const footingTop = tile.groundY + FOOTING_HEIGHT - FOOTING_EMBED;
        const columnTop = tile.deckY + ROAD_Y_OFFSET - spec.girderDepth;
        const height = Math.max(0.1, columnTop - footingTop);

        pos.set(wx, footingTop + height / 2, wz);
        // A cylinder's unit geometry is radius 1; a box's is width 1. Scale each
        // to the same finished thickness.
        const thickness = spec.pierSquare ? spec.pierRadiusBottom * 2 : spec.pierRadiusBottom;
        scale.set(thickness, height, thickness);
        m.compose(pos, q, scale);
        columns.setMatrixAt(i, m);

        pos.set(wx, tile.groundY + FOOTING_HEIGHT / 2 - FOOTING_EMBED, wz);
        scale.set(spec.footingRadius * 2, FOOTING_HEIGHT, spec.footingRadius * 2);
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
      yaw = 0,
    ): void => {
      pos.set(px, py, pz);
      scale.set(sx, sy, sz);
      q.setFromAxisAngle(yAxis, yaw);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(slot++, m);
      q.identity();
    };

    for (const side of [-1, 1]) {
      const ox = alongZ ? side * sideOffset : 0;
      const oz = alongZ ? 0 : side * sideOffset;
      // Top chord, and the diagonals webbing down to the deck.
      put(
        wx + ox,
        topY,
        wz + oz,
        alongZ ? TRUSS_MEMBER : span,
        TRUSS_MEMBER,
        alongZ ? span : TRUSS_MEMBER,
      );

      const bay = span / TRUSS_BAYS_PER_TILE;
      const diagonal = Math.hypot(bay, TRUSS_HEIGHT);
      for (let b = 0; b < TRUSS_BAYS_PER_TILE; b++) {
        const t = -span / 2 + bay * (b + 0.5);
        // Diagonals lean along the run; approximating them as uprights of the
        // full diagonal length keeps this to one instanced box per member
        // without a per-member rotation axis that changes with the road's run.
        put(
          wx + ox + (alongZ ? 0 : t),
          deckTop + TRUSS_HEIGHT / 2,
          wz + oz + (alongZ ? t : 0),
          TRUSS_MEMBER,
          diagonal,
          TRUSS_MEMBER,
        );
      }
    }

    // Overhead cross brace tying the two top chords together.
    put(
      wx,
      topY,
      wz,
      alongZ ? sideOffset * 2 : TRUSS_MEMBER,
      TRUSS_MEMBER,
      alongZ ? TRUSS_MEMBER : sideOffset * 2,
    );
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
