/**
 * Draws the grounds plan (src/shared/lotgrounds.ts) of every commercial and
 * industrial lot from instanced pools: a coloured box for each pole, sign,
 * seat, wall, bar and fence run; hedge runs for the strips and beds; the
 * broadleaf tree for the frontage; and a lit head for each pole light. The
 * plan decides what stands where; this only turns it into instances, in the
 * same frame the lot's car park is drawn in.
 *
 * Fed the same BuildingDelta stream as the other lot renderers.
 */
import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { nightBodyMaterial } from './nightlook';
import { BuildingState } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import type { KerbSurroundings } from '../shared/kerblayout';
import type { LotRect } from '../shared/lotlayout';
import {
  BENCH_M,
  BIKE_SPACE_M,
  BIN_M,
  BIKE_SPACES,
  ENTRANCE_BED_DEPTH_M,
  planLotGrounds,
  REFUSE_ENCLOSURE_M,
  SHRUB_FOOTPRINT_M,
  type GroundsFacing,
  type GroundsPiece,
  type HomeSide,
  type LotGroundsPlan,
} from '../shared/lotgrounds';
import { materialHex, type MaterialName } from './palette';
import { InstancedSlotPool } from './massing';
import { mergeGeometryParts, paintVertexColor } from './trees';
import {
  groundsFactsFor,
  lotPlanAt,
  lotPointToWorld,
  type KerbCreditOf,
  type LotPlan,
} from './lotplan';

/** Residents' side of a lot line is looked for this far out and this often along it. */
const HOME_PROBE_OUT_M = 2;
const HOME_PROBE_STEP_M = TILE_METERS / 2;
/** The ground a piece stands on: the lot pad's offset from the terrain. */
const GROUND_Y_OFFSET = 0.1;
/** A frontage tree is planted young, as the car park's island trees are. */
const FRONTAGE_TREE_SCALE = 0.5;
const INITIAL_CAPACITY = 64;

/** A walk lies this far over the drive's paving. */
const WALK_Y_M = 0.01;
const CROSSING_BAR_M = 0.4;
const CROSSING_PITCH_M = 0.8;
const POLE_WIDTH_M = 0.14;
const LIGHT_HEAD_M = { along: 0.7, height: 0.12, across: 0.35 } as const;
const FENCE_THICKNESS_M = 0.05;
const FENCE_POST_M = 0.12;
const SIGN_FACE_HEIGHT_M = 1.15;
const PYLON_POLE_M = 0.4;
const DUMPSTER_M = { across: 1.8, depth: 1.8, height: 1.4 } as const;
const BED_PLANTING_HEIGHT_M = 0.6;

const SHRUB_HEIGHT_M = 0.8;
/** What each boxy part is made of. */
const BOX_COLOR = {
  pole: 'metalPlates',
  walk: 'cleanConcrete',
  stripe: 'sidingWhite',
  monumentBase: 'stoneBrick',
  monumentFace: 'sidingWhite',
  pylonPole: 'metalPlates',
  pylonCabinet: 'sidingWhite',
  benchSeat: 'brightWood',
  benchFrame: 'metalPlates',
  bin: 'metalPlates',
  bike: 'galvanised',
  enclosure: 'concreteBlock',
  dumpster: 'rustedMetal',
  mulch: 'woodChip',
  fence: 'galvanised',
  gate: 'galvanised',
} as const satisfies Record<string, MaterialName>;
type BoxRole = keyof typeof BOX_COLOR;
const HEDGE_COLOR: MaterialName = 'darkVegetation';
const BED_PLANTING_COLOR: MaterialName = 'brightVegetation';
const LIGHT_HEAD_COLOR = 0xfff1c4;

/** The pools a lot's grounds are drawn from. */
export type GroundsPool = 'box' | 'flat' | 'head' | 'hedge' | 'tree';

const emptyCounts = (): Record<GroundsPool, number> => ({
  box: 0,
  flat: 0,
  head: 0,
  hedge: 0,
  tree: 0,
});

interface Slot {
  pool: GroundsPool;
  slot: number;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _quarterTurn = new THREE.Quaternion().setFromAxisAngle(_up, Math.PI / 2);

/** A unit box standing on its base, its underside left out as nothing sees it, so a scale of (w, h, d) sets its size. */
export function buildGroundsBoxGeometry(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  // Each face is six indices: +x, -x, +y, -y, +z, -z; the fourth is the underside.
  const index = Array.from(box.getIndex()!.array);
  box.setIndex([...index.slice(0, 18), ...index.slice(24)]);
  return box;
}

/** A unit square lying flat, facing up: a walk and the bars of a painted crossing. */
export function buildGroundsFlatGeometry(): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  return plane;
}

/**
 * A hedge run: a ridge 1 m across and 1 m high, extruded 1 m along z and
 * centred on it, so scale sets its width, height and length.
 */
export function buildHedgeGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  const hedge = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 });
  hedge.translate(0, 0, -0.5);
  return hedge;
}

const TREE_TRUNK_HEIGHT_M = 1.8;
const TREE_TRUNK_COLOR = 0x6b4a2f;
const TREE_CANOPY_COLOR = 0x2f6b3a;
const TREE_CANOPY_RADIUS_M = 1.3;

/** A frontage tree in sixteen triangles: a four-sided trunk under one faceted crown. */
export function buildLotTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, TREE_TRUNK_HEIGHT_M, 4, 1, true);
  trunk.translate(0, TREE_TRUNK_HEIGHT_M / 2, 0);
  paintVertexColor(trunk, TREE_TRUNK_COLOR);
  const crown = new THREE.OctahedronGeometry(TREE_CANOPY_RADIUS_M, 0);
  crown.translate(0, TREE_TRUNK_HEIGHT_M + TREE_CANOPY_RADIUS_M * 0.8, 0);
  paintVertexColor(crown, TREE_CANOPY_COLOR);
  return mergeGeometryParts([trunk, crown]);
}

/** A tree's world scale for its footprint: the frontage tree is the island tree's size. */
export const GROUNDS_TREE_SCALE = FRONTAGE_TREE_SCALE;

/** Which pieces one lot is drawn from, by pool, for a plan: what a renderer will instance. */
export function groundsInstanceCounts(plan: LotGroundsPlan): Record<GroundsPool, number> {
  const counts = emptyCounts();
  for (const part of partsOf(plan)) counts[part.pool] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Parts: each piece as the instances it is drawn from, in lot metres
// ---------------------------------------------------------------------------

/** One instance in the lot frame: its centre, its size along u / up / along v, its colour. */
interface Part {
  pool: GroundsPool;
  u: number;
  v: number;
  /** Height of the part's base over the ground. */
  y: number;
  /** Size along u, up and along v. */
  w: number;
  h: number;
  d: number;
  color: number;
}

const hex = (name: MaterialName): number => materialHex(name);

const centre = (r: LotRect): { u: number; v: number; w: number; d: number } => ({
  u: (r.u0 + r.u1) / 2,
  v: (r.v0 + r.v1) / 2,
  w: r.u1 - r.u0,
  d: r.v1 - r.v0,
});

const box = (
  u: number,
  v: number,
  y: number,
  w: number,
  h: number,
  d: number,
  role: BoxRole,
): Part => ({ pool: 'box', u, v, y, w, h, d, color: hex(BOX_COLOR[role]) });

/** A flat square on the ground at height `y`, in the colour of a boxy part's material. */
const flat = (u: number, v: number, y: number, w: number, d: number, role: BoxRole): Part => ({
  pool: 'flat',
  u,
  v,
  y,
  w,
  h: 1,
  d,
  color: hex(BOX_COLOR[role]),
});

/** The unit vector of a facing in the lot frame. */
const FACING: Readonly<Record<GroundsFacing, { u: number; v: number }>> = {
  'u+': { u: 1, v: 0 },
  'u-': { u: -1, v: 0 },
  'v+': { u: 0, v: 1 },
  'v-': { u: 0, v: -1 },
};

/** A part placed `across` the piece's face and `toward` the way it faces, from its centre. */
function placed(
  c: { u: number; v: number },
  facing: GroundsFacing,
  across: number,
  toward: number,
): { u: number; v: number } {
  const f = FACING[facing];
  return { u: c.u + f.u * toward - f.v * across, v: c.v + f.v * toward + f.u * across };
}

/** A box whose `a` size is across the piece's face and `b` size is along the way it faces. */
function faced(
  c: { u: number; v: number },
  facing: GroundsFacing,
  across: number,
  toward: number,
  y: number,
  a: number,
  height: number,
  b: number,
  role: BoxRole,
): Part {
  const p = placed(c, facing, across, toward);
  const alongV = facing === 'u+' || facing === 'u-';
  return box(p.u, p.v, y, alongV ? b : a, height, alongV ? a : b, role);
}

function partsOfPiece(piece: GroundsPiece): Part[] {
  const c = centre(piece.rect);
  const f = piece.facing;
  switch (piece.kind) {
    case 'light': {
      const head = { u: c.u, v: c.v };
      return [
        box(c.u, c.v, 0, POLE_WIDTH_M, piece.height, POLE_WIDTH_M, 'pole'),
        {
          pool: 'head',
          u: head.u,
          v: head.v,
          y: piece.height,
          w: LIGHT_HEAD_M.along,
          h: LIGHT_HEAD_M.height,
          d: LIGHT_HEAD_M.across,
          color: LIGHT_HEAD_COLOR,
        },
      ];
    }
    case 'monument':
      return [
        box(c.u, c.v, 0, c.w, piece.height - SIGN_FACE_HEIGHT_M, c.d, 'monumentBase'),
        box(
          c.u,
          c.v,
          piece.height - SIGN_FACE_HEIGHT_M,
          c.w,
          SIGN_FACE_HEIGHT_M,
          c.d * 0.75,
          'monumentFace',
        ),
      ];
    case 'pylon': {
      const cabinetHeight = 4;
      return [
        box(c.u, c.v, 0, PYLON_POLE_M, piece.height - cabinetHeight, PYLON_POLE_M, 'pylonPole'),
        box(c.u, c.v, piece.height - cabinetHeight, c.w, cabinetHeight, c.d, 'pylonCabinet'),
      ];
    }
    case 'tree':
      return [
        {
          pool: 'tree',
          u: c.u,
          v: c.v,
          y: 0,
          w: FRONTAGE_TREE_SCALE,
          h: FRONTAGE_TREE_SCALE,
          d: FRONTAGE_TREE_SCALE,
          color: 0xffffff,
        },
      ];
    case 'shrub':
      return [
        {
          pool: 'hedge',
          u: c.u,
          v: c.v,
          y: 0,
          w: c.w,
          h: SHRUB_HEIGHT_M,
          d: c.d,
          color: hex(HEDGE_COLOR),
        },
      ];
    case 'bed':
      return [
        flat(c.u, c.v, WALK_Y_M, c.w, c.d, 'mulch'),
        {
          pool: 'hedge',
          u: c.u,
          v: c.v,
          y: WALK_Y_M,
          w: c.w - 0.2,
          h: BED_PLANTING_HEIGHT_M,
          d: Math.min(c.d, ENTRANCE_BED_DEPTH_M) - 0.2,
          color: hex(BED_PLANTING_COLOR),
        },
      ];
    case 'walk':
      return piece.laid ? [] : [flat(c.u, c.v, WALK_Y_M, c.w, c.d, 'walk')];
    case 'crossing': {
      const bars = Math.max(1, Math.floor(c.d / CROSSING_PITCH_M));
      const out: Part[] = [];
      for (let i = 0; i < bars; i++) {
        const v = piece.rect.v0 + ((i + 0.5) * c.d) / bars;
        out.push(flat(c.u, v, WALK_Y_M + 0.02, c.w, CROSSING_BAR_M, 'stripe'));
      }
      return out;
    }
    case 'bench':
      return [
        faced(c, f, 0, 0.05, 0, BENCH_M.along * 0.9, 0.45, BENCH_M.depth * 0.7, 'benchFrame'),
        faced(c, f, 0, -BENCH_M.depth / 2 + 0.03, 0.45, BENCH_M.along, 0.45, 0.06, 'benchSeat'),
      ];
    case 'bin':
      return [box(c.u, c.v, 0, BIN_M.along, BIN_M.height, BIN_M.depth, 'bin')];
    case 'bikeRack': {
      const out: Part[] = [];
      for (let i = 0; i < BIKE_SPACES; i++) {
        const along = (i - (BIKE_SPACES - 1) / 2) * BIKE_SPACE_M.length;
        out.push(faced(c, f, along, 0, 0.15, BIKE_SPACE_M.length * 0.9, 0.7, 0.05, 'bike'));
      }
      return out;
    }
    case 'refuse': {
      const t = REFUSE_ENCLOSURE_M.wall;
      const h = REFUSE_ENCLOSURE_M.wallHeight;
      const sideways = f === 'u+' || f === 'u-';
      const outerAcross = sideways ? c.d : c.w;
      const outerDepth = sideways ? c.w : c.d;
      return [
        faced(c, f, 0, -(outerDepth - t) / 2, 0, outerAcross, h, t, 'enclosure'),
        faced(c, f, -(outerAcross - t) / 2, -t / 2, 0, t, h, outerDepth - t, 'enclosure'),
        faced(c, f, (outerAcross - t) / 2, -t / 2, 0, t, h, outerDepth - t, 'enclosure'),
        faced(
          c,
          f,
          0,
          -t / 2,
          0,
          DUMPSTER_M.across,
          DUMPSTER_M.height,
          DUMPSTER_M.depth,
          'dumpster',
        ),
      ];
    }
    case 'fence': {
      const length = Math.max(c.w, c.d);
      const alongU = c.w >= c.d;
      return [
        box(
          c.u,
          c.v,
          0,
          alongU ? length : FENCE_THICKNESS_M,
          piece.height,
          alongU ? FENCE_THICKNESS_M : length,
          'fence',
        ),
      ];
    }
    case 'gate': {
      const alongU = c.w >= c.d;
      const length = Math.max(c.w, c.d);
      const post = (du: number, dv: number): Part =>
        box(c.u + du, c.v + dv, 0, FENCE_POST_M, piece.height, FENCE_POST_M, 'gate');
      return [
        post(alongU ? -length / 2 : 0, alongU ? 0 : -length / 2),
        post(alongU ? length / 2 : 0, alongU ? 0 : length / 2),
        box(
          c.u,
          c.v,
          piece.height - FENCE_POST_M,
          alongU ? length : FENCE_POST_M,
          FENCE_POST_M,
          alongU ? FENCE_POST_M : length,
          'gate',
        ),
      ];
    }
  }
}

/** Neighbouring shrubs along a line are one hedge run, a single instance as long as the row. */
function mergeShrubs(pieces: readonly GroundsPiece[]): GroundsPiece[] {
  const shrubs = pieces.filter((p) => p.kind === 'shrub');
  const rest = pieces.filter((p) => p.kind !== 'shrub');
  const runs: GroundsPiece[] = [];
  const used = new Set<GroundsPiece>();
  const join = (alongU: boolean): void => {
    const lineOf = (p: GroundsPiece): number => (alongU ? p.rect.v0 : p.rect.u0);
    const startOf = (p: GroundsPiece): number => (alongU ? p.rect.u0 : p.rect.v0);
    const endOf = (p: GroundsPiece): number => (alongU ? p.rect.u1 : p.rect.v1);
    const free = shrubs.filter((p) => !used.has(p));
    free.sort((a, b) => lineOf(a) - lineOf(b) || startOf(a) - startOf(b));
    let group: GroundsPiece[] = [];
    const close = (): void => {
      const first = group[0];
      const last = group[group.length - 1];
      if (first && last && group.length >= 2) {
        for (const g of group) used.add(g);
        const rect = alongU
          ? { ...first.rect, u1: last.rect.u1 }
          : { ...first.rect, v1: last.rect.v1 };
        runs.push({ ...first, rect });
      }
      group = [];
    };
    for (const p of free) {
      const last = group[group.length - 1];
      const adjacent =
        last !== undefined &&
        Math.abs(lineOf(last) - lineOf(p)) < 1e-6 &&
        startOf(p) - endOf(last) < SHRUB_FOOTPRINT_M;
      if (!adjacent) close();
      group.push(p);
    }
    close();
  };
  join(true);
  join(false);
  const singles = shrubs.filter((p) => !used.has(p));
  return [...rest, ...runs, ...singles];
}

/** Every instance a plan is drawn from. */
function partsOf(plan: LotGroundsPlan): Part[] {
  return mergeShrubs(plan.pieces).flatMap(partsOfPiece);
}

/** Triangles a plan's pieces draw, given each pool's geometry size. */
export function groundsTriangles(
  plan: LotGroundsPlan,
  triangles: Readonly<Record<GroundsPool, number>>,
): number {
  const counts = groundsInstanceCounts(plan);
  return (Object.keys(counts) as GroundsPool[]).reduce((n, k) => n + counts[k] * triangles[k], 0);
}

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

const RESIDENTIAL_PROBE_SIDES: readonly HomeSide[] = ['u-', 'u+', 'v+'];

export class LotGroundsRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly roadAt: (tileX: number, tileZ: number) => boolean;
  private readonly kerb: KerbSurroundings | null;
  private readonly kerbCreditOf: KerbCreditOf | null;
  private readonly homesAt: (tileX: number, tileZ: number) => boolean;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly nightFactorUniform = uniform(0);
  private readonly pools: Record<GroundsPool, InstancedSlotPool>;
  private readonly slots = new Map<number, Slot[]>();

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (tileX: number, tileZ: number) => boolean,
    kerb: KerbSurroundings | null = null,
    kerbCreditOf: KerbCreditOf | null = null,
    /** Whether a grid tile is zoned for homes; omitted, no lot has a residential neighbour. */
    homesAt: (tileX: number, tileZ: number) => boolean = () => false,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;
    this.kerb = kerb;
    this.kerbCreditOf = kerbCreditOf;
    this.homesAt = homesAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    const lit = (): THREE.Material =>
      nightBodyMaterial(this.nightFactorUniform, { vertexColors: false, flatShading: true });
    this.pools = {
      box: new InstancedSlotPool(this.scene, buildGroundsBoxGeometry(), lit(), INITIAL_CAPACITY),
      flat: new InstancedSlotPool(this.scene, buildGroundsFlatGeometry(), lit(), INITIAL_CAPACITY),
      hedge: new InstancedSlotPool(this.scene, buildHedgeGeometry(), lit(), INITIAL_CAPACITY),
      tree: new InstancedSlotPool(
        this.scene,
        buildLotTreeGeometry(),
        nightBodyMaterial(this.nightFactorUniform, { vertexColors: true, flatShading: true }),
        INITIAL_CAPACITY,
      ),
      // A pole light's head is the one lit thing here: night does not tint it.
      head: new InstancedSlotPool(
        this.scene,
        buildGroundsBoxGeometry(),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        INITIAL_CAPACITY,
      ),
    };
  }

  /** 0 (day) .. 1 (night): how far the grounds shade toward the night tint. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.free(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
    for (const pool of Object.values(this.pools)) pool.commit();
  }

  /** Instances a building's grounds hold in each pool; zero for a building with none. */
  instancesOf(buildingId: number): Record<GroundsPool, number> {
    const counts = emptyCounts();
    for (const s of this.slots.get(buildingId) ?? []) counts[s.pool] += 1;
    return counts;
  }

  /** Total instances in a pool, hidden recycled slots excepted. */
  poolInstanceCount(pool: GroundsPool): number {
    return this.pools[pool].instanceCount();
  }

  /** The plan a building's lot is drawn from where it stands, or null when it has none. */
  planOf(building: BuildingInstance): { plan: LotGroundsPlan; lot: LotPlan } | null {
    const entry = this.catalogById.get(building.catalogId);
    if (!entry || (entry.category !== 'com' && entry.category !== 'ind')) return null;
    const lot = lotPlanAt(entry, building, this.roadAt, this.kerb, this.kerbCreditOf);
    if (!lot) return null;
    const homes = this.homeSidesOf(lot);
    return { plan: planLotGrounds(lot.layout, groundsFactsFor(entry, homes)), lot };
  }

  private applyOne(building: BuildingInstance): void {
    this.free(building.id);
    if (building.state !== BuildingState.Active) return;
    const found = this.planOf(building);
    if (!found) return;
    const { plan, lot } = found;
    const held: Slot[] = [];
    for (const part of partsOf(plan)) held.push(this.place(part, lot));
    if (held.length > 0) this.slots.set(building.id, held);
  }

  /** The sides of the lot with a residential tile just beyond the lot line. */
  private homeSidesOf(lot: LotPlan): HomeSide[] {
    const { along, depth } = { along: lot.layout.lot.u1, depth: lot.layout.lot.v1 };
    const sides: HomeSide[] = [];
    for (const side of RESIDENTIAL_PROBE_SIDES) {
      const length = side === 'v+' ? along : depth;
      let found = false;
      for (let s = HOME_PROBE_STEP_M / 2; s < length && !found; s += HOME_PROBE_STEP_M) {
        const u = side === 'u-' ? -HOME_PROBE_OUT_M : side === 'u+' ? along + HOME_PROBE_OUT_M : s;
        const v = side === 'v+' ? depth + HOME_PROBE_OUT_M : s;
        const at = lotPointToWorld(lot.frame, u, v);
        found = this.homesAt(Math.floor(at.x / TILE_METERS), Math.floor(at.z / TILE_METERS));
      }
      if (found) sides.push(side);
    }
    return sides;
  }

  private place(part: Part, lot: LotPlan): Slot {
    const at = lotPointToWorld(lot.frame, part.u, part.v);
    const eu = lotPointToWorld(lot.frame, part.u + 1, part.v);
    // The lot's u axis in the world turns the box; a mirrored frame leaves the symmetric box as it was.
    const yaw = -Math.atan2(eu.z - at.z, eu.x - at.x);
    _quaternion.setFromAxisAngle(_up, yaw);
    _position.set(at.x, this.heightAt(at.x, at.z) + GROUND_Y_OFFSET + part.y, at.z);
    if (part.pool === 'tree') {
      _scale.setScalar(part.w);
    } else if (part.pool === 'hedge') {
      // The hedge profile is across x and runs along z.
      const alongV = part.d > part.w;
      _scale.set(alongV ? part.w : part.d, part.h, alongV ? part.d : part.w);
      if (!alongV) _quaternion.multiply(_quarterTurn);
    } else {
      _scale.set(part.w, part.h, part.d);
    }
    _matrix.compose(_position, _quaternion, _scale);
    const pool = this.pools[part.pool];
    const slot = pool.allocate();
    pool.setMatrixAt(slot, _matrix);
    if (part.pool !== 'tree') pool.setColorAt(slot, _color.setHex(part.color));
    return { pool: part.pool, slot };
  }

  private free(buildingId: number): void {
    const held = this.slots.get(buildingId);
    if (!held) return;
    for (const s of held) this.pools[s.pool].free(s.slot);
    this.slots.delete(buildingId);
  }
}
