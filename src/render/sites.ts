/**
 * The building site: what stands on a lot while a building goes up, chosen by
 * how far the sim says it has got. A cleared earth pad (laid by lots.ts) behind
 * a temporary fence, then a concrete foundation, then the building's own frame
 * rising a storey at a time, then sheathed walls with scaffolding on a tall
 * body's one face and a tower crane on the tallest. The finished building
 * replaces the site. Every part is a unit box in one instanced pool per part;
 * nothing here emits light.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { BuildingDelta, BuildingInstance, BuildingState } from '../shared/types';
import {
  ENCLOSED_FROM,
  FOUNDATION_FROM,
  FRAME_FROM,
  frameLift,
  frameLifts,
} from '../shared/constructionstages';
import { FLOOR_HEIGHT_METERS } from './facade';
import { InstancedSlotPool, type SetbackBox } from './massing';
import { materialUnit, saturatedUnit, type MaterialName } from './palette';
import { nightTintNode } from './nightlook';

export { ENCLOSED_FROM, FOUNDATION_FROM, FRAME_FROM };

/** Timber studs carry a building up to this many storeys; above it the frame is steel or concrete. */
export const TIMBER_FRAME_MAX_STOREYS = 4;
/** A body over this many storeys is wrapped in scaffolding on one face. */
export const SCAFFOLD_ABOVE_STOREYS = 2;
/** A body over this many storeys has a tower crane beside it. */
export const CRANE_ABOVE_STOREYS = 8;
/** Temporary site fencing: a chain-link panel stands 6 ft (1.8 m) high. */
export const FENCE_HEIGHT_M = 1.8;

export const SiteStage = { Earth: 0, Foundation: 1, Frame: 2, Enclosed: 3 } as const;
export type SiteStage = (typeof SiteStage)[keyof typeof SiteStage];

export interface SitePlan {
  stage: SiteStage;
  /** Storeys of frame standing: 0 before the frame, all of them once enclosed. */
  storeysBuilt: number;
  scaffold: boolean;
  crane: boolean;
}

/** The stage a building of `storeys` storeys is at when it is `progress` (0..1) done. */
export function siteStage(progress: number, storeys: number): SitePlan {
  const p = Math.min(1, Math.max(0, progress));
  const stage: SiteStage =
    p < FOUNDATION_FROM
      ? SiteStage.Earth
      : p < FRAME_FROM
        ? SiteStage.Foundation
        : p < ENCLOSED_FROM
          ? SiteStage.Frame
          : SiteStage.Enclosed;
  // The frame rises in at most MAX_FRAME_LIFTS lifts, each a whole number of storeys.
  const storeysBuilt =
    stage === SiteStage.Frame
      ? Math.ceil((frameLift(p, storeys) * storeys) / frameLifts(storeys))
      : stage === SiteStage.Enclosed
        ? storeys
        : 0;
  return {
    stage,
    storeysBuilt,
    scaffold: stage === SiteStage.Enclosed && storeys > SCAFFOLD_ABOVE_STOREYS,
    crane: stage >= SiteStage.Frame && storeys > CRANE_ABOVE_STOREYS,
  };
}

/** The storeys a stack of tiers rises: its height over a storey, at least one. */
export function storeysOf(boxes: readonly SetbackBox[]): number {
  return Math.max(1, Math.round(heightOf(boxes) / FLOOR_HEIGHT_METERS));
}

function heightOf(boxes: readonly SetbackBox[]): number {
  let top = 0;
  for (const box of boxes) top = Math.max(top, box.yOffset + box.h);
  return top;
}

export type SitePart = 'fence' | 'slab' | 'frame' | 'wall' | 'scaffold' | 'crane';
const PARTS: readonly SitePart[] = ['fence', 'slab', 'frame', 'wall', 'scaffold', 'crane'];

/** A box in world metres: centre, size, and turn about Y. */
export interface SiteBox {
  part: SitePart;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  color: readonly [number, number, number];
}

/** Where a body stands: its tiers, the seat they share, and the lot's world rectangle where it is axis-aligned. */
export interface SiteBody {
  boxes: readonly SetbackBox[];
  seat: { centerX: number; centerZ: number; groundY: number; yaw: number };
  lot: { x0: number; z0: number; x1: number; z1: number } | null;
}

const FENCE_INSET_M = 0.5;
/** Without a lot rectangle (a parcel on a curve) the fence stands this far outside the body. */
const FENCE_MARGIN_M = 1.5;
/** A temporary fence panel is 12 ft (3.66 m) wide; a post stands at each panel joint. */
const FENCE_PANEL_M = 3.66;
/** A long perimeter spaces its posts out so a site stays a few dozen boxes. */
const FENCE_MAX_POSTS = 40;
const FENCE_RAIL_M = 0.08;
const FENCE_POST_M = 0.14;
const FOUNDATION_M = 0.3;
/** Stud centres are drawn a bay apart, wider than real studs so a frame reads from the camera. */
const STUD_BAY_M = 3;
const STUD_M = 0.25;
/** The plate that ties the top of a timber frame, and the deck at each floor. */
const PLATE_M = 0.2;
const COLUMN_BAY_M = 6;
const COLUMN_M = 0.5;
const DECK_M = 0.2;
const SCAFFOLD_DEPTH_M = 1.5;
const SCAFFOLD_POST_M = 0.18;
const SCAFFOLD_POST_BAY_M = 3;
const SCAFFOLD_PLANK_M = 0.15;
const CRANE_MAST_M = 1.8;
const CRANE_CLEAR_M = 8;
const CRANE_JIB_M = 1.2;
const CRANE_COUNTER_JIB_M = 8;
const CRANE_WEIGHT_M = 2.4;

/** The local `hash1` every render file copies: a number in [0, 1) from an id. */
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const unit = (name: MaterialName): readonly [number, number, number] => materialUnit(name);

/** Every box of the site for a building `progress` done: pure, so a test reads it without a scene. */
export function layoutSite(body: SiteBody, id: number, progress: number): SiteBox[] {
  const { boxes, seat } = body;
  const totalH = heightOf(boxes);
  const storeys = storeysOf(boxes);
  const storeyM = totalH / storeys;
  const plan = siteStage(progress, storeys);
  const out: SiteBox[] = [];
  const cos = Math.cos(seat.yaw);
  const sin = Math.sin(seat.yaw);
  /** A box set by its local centre and size from the seat, `y0` metres above ground. */
  const local = (
    part: SitePart,
    lx: number,
    lz: number,
    y0: number,
    w: number,
    h: number,
    d: number,
    color: readonly [number, number, number],
    yawExtra = 0,
  ): void => {
    out.push({
      part,
      x: seat.centerX + lx * cos + lz * sin,
      y: seat.groundY + y0 + h / 2,
      z: seat.centerZ - lx * sin + lz * cos,
      w,
      h,
      d,
      yaw: seat.yaw + yawExtra,
      color,
    });
  };

  layFence(body, out);

  if (plan.stage < SiteStage.Foundation) return out;
  const base = boxes[0]!;
  local('slab', 0, 0, 0, base.w, FOUNDATION_M, base.d, unit('cleanConcrete'));

  if (plan.stage === SiteStage.Frame) {
    const timber = storeys <= TIMBER_FRAME_MAX_STOREYS;
    const frameColor = timber
      ? unit('brightestWood')
      : hash1(id) < 0.5
        ? unit('oxideRed')
        : unit('precastGrey');
    const post = timber ? STUD_M : COLUMN_M;
    const bay = timber ? STUD_BAY_M : COLUMN_BAY_M;
    const built = plan.storeysBuilt * storeyM;
    for (const tier of boxes) {
      const lo = Math.max(tier.yOffset, FOUNDATION_M);
      const hi = Math.min(tier.yOffset + tier.h, built);
      if (hi <= lo) continue;
      const nx = Math.max(1, Math.ceil(tier.w / bay));
      const nz = Math.max(1, Math.ceil(tier.d / bay));
      for (let i = 0; i <= nx; i++) {
        const lx = -tier.w / 2 + (tier.w * i) / nx;
        local('frame', lx, -tier.d / 2, lo, post, hi - lo, post, frameColor);
        local('frame', lx, tier.d / 2, lo, post, hi - lo, post, frameColor);
      }
      for (let i = 1; i < nz; i++) {
        const lz = -tier.d / 2 + (tier.d * i) / nz;
        local('frame', -tier.w / 2, lz, lo, post, hi - lo, post, frameColor);
        local('frame', tier.w / 2, lz, lo, post, hi - lo, post, frameColor);
      }
      // The plate (or the edge beam) that ties the heads of the posts together.
      const tie = timber ? PLATE_M : DECK_M;
      local('frame', 0, -tier.d / 2, hi - tie, tier.w, tie, post, frameColor);
      local('frame', 0, tier.d / 2, hi - tie, tier.w, tie, post, frameColor);
      local('frame', -tier.w / 2, 0, hi - tie, post, tie, tier.d, frameColor);
      local('frame', tier.w / 2, 0, hi - tie, post, tie, tier.d, frameColor);
    }
    // A floor deck at the top of every storey but the one still being framed.
    for (let k = 1; k < plan.storeysBuilt; k++) {
      const level = k * storeyM;
      const tier = tierAt(boxes, level - 0.01);
      local('frame', 0, 0, level - DECK_M, tier.w, DECK_M, tier.d, frameColor);
    }
  }

  if (plan.stage === SiteStage.Enclosed) {
    const timber = storeys <= TIMBER_FRAME_MAX_STOREYS;
    const skin = timber ? unit('sidingWhite') : unit('tiltUpWhite');
    for (const tier of boxes) {
      const lo = Math.max(tier.yOffset, FOUNDATION_M);
      local('wall', 0, 0, lo, tier.w, tier.yOffset + tier.h - lo, tier.d, skin);
    }
    if (plan.scaffold) layScaffold(boxes[0]!, storeyM, hash1(id + 1), local);
  }

  if (plan.crane) {
    // The mast stands at a corner of the body and its jib turns to a heading chosen from the id.
    const mx = base.w / 2 - 1.5;
    const mz = base.d / 2 - 1.5;
    const top = totalH + CRANE_CLEAR_M;
    const yellow = saturatedUnit('yellow');
    local('crane', mx, mz, 0, CRANE_MAST_M, top, CRANE_MAST_M, yellow);
    const reach = Math.max(base.w, base.d) + 4;
    const jibYaw = hash1(id + 2) * Math.PI;
    const jibLen = reach + CRANE_COUNTER_JIB_M;
    const mid = (reach - CRANE_COUNTER_JIB_M) / 2;
    local(
      'crane',
      mx + mid * Math.cos(jibYaw),
      mz - mid * Math.sin(jibYaw),
      top,
      jibLen,
      CRANE_JIB_M,
      CRANE_JIB_M,
      yellow,
      jibYaw,
    );
    const back = -(CRANE_COUNTER_JIB_M - CRANE_WEIGHT_M / 2);
    local(
      'crane',
      mx + back * Math.cos(jibYaw),
      mz - back * Math.sin(jibYaw),
      top - CRANE_WEIGHT_M,
      CRANE_WEIGHT_M,
      CRANE_WEIGHT_M,
      CRANE_WEIGHT_M,
      unit('concreteBlock'),
      jibYaw,
    );
  }
  return out;
}

/** The tier whose height range holds `y`; the top tier above the stack. */
function tierAt(boxes: readonly SetbackBox[], y: number): SetbackBox {
  for (const box of boxes) if (y < box.yOffset + box.h) return box;
  return boxes[boxes.length - 1]!;
}

/** Chain-link panels round the lot, or round the body where the lot is turned: a panel a side and a post at each corner. */
function layFence(body: SiteBody, out: SiteBox[]): void {
  const { seat, boxes, lot } = body;
  let cx: number;
  let cz: number;
  let w: number;
  let d: number;
  let yaw: number;
  if (lot) {
    w = lot.x1 - lot.x0 - 2 * FENCE_INSET_M;
    d = lot.z1 - lot.z0 - 2 * FENCE_INSET_M;
    cx = (lot.x0 + lot.x1) / 2;
    cz = (lot.z0 + lot.z1) / 2;
    yaw = 0;
  } else {
    w = boxes[0]!.w + 2 * FENCE_MARGIN_M;
    d = boxes[0]!.d + 2 * FENCE_MARGIN_M;
    cx = seat.centerX;
    cz = seat.centerZ;
    yaw = seat.yaw;
  }
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const color = unit('galvanised');
  const put = (lx: number, lz: number, bw: number, bd: number, y0: number, h: number): void => {
    out.push({
      part: 'fence',
      x: cx + lx * cos + lz * sin,
      y: seat.groundY + y0 + h / 2,
      z: cz - lx * sin + lz * cos,
      w: bw,
      h,
      d: bd,
      yaw,
      color,
    });
  };
  // The panels are chain link, which is seen through: a top rail, a foot rail and a post at each joint.
  const topY = FENCE_HEIGHT_M - FENCE_RAIL_M;
  put(0, -d / 2, w, FENCE_RAIL_M, topY, FENCE_RAIL_M);
  put(0, d / 2, w, FENCE_RAIL_M, topY, FENCE_RAIL_M);
  put(-w / 2, 0, FENCE_RAIL_M, d, topY, FENCE_RAIL_M);
  put(w / 2, 0, FENCE_RAIL_M, d, topY, FENCE_RAIL_M);
  put(0, -d / 2, w, FENCE_RAIL_M, 0, FENCE_RAIL_M);
  put(0, d / 2, w, FENCE_RAIL_M, 0, FENCE_RAIL_M);
  put(-w / 2, 0, FENCE_RAIL_M, d, 0, FENCE_RAIL_M);
  put(w / 2, 0, FENCE_RAIL_M, d, 0, FENCE_RAIL_M);
  // Each side's posts start at its first corner, so every corner is posted once.
  const bay = Math.max(FENCE_PANEL_M, (2 * (w + d)) / FENCE_MAX_POSTS);
  const along = (length: number, at: (t: number) => [number, number]): void => {
    const n = Math.max(1, Math.ceil(length / bay));
    for (let i = 0; i < n; i++) {
      const [lx, lz] = at(-length / 2 + (length * i) / n);
      put(lx, lz, FENCE_POST_M, FENCE_POST_M, 0, FENCE_HEIGHT_M);
    }
  };
  along(w, (t) => [t, -d / 2]);
  along(d, (t) => [w / 2, t]);
  along(w, (t) => [-t, d / 2]);
  along(d, (t) => [-w / 2, -t]);
}

type LocalBox = (
  part: SitePart,
  lx: number,
  lz: number,
  y0: number,
  w: number,
  h: number,
  d: number,
  color: readonly [number, number, number],
  yawExtra?: number,
) => void;

/** Scaffolding on one face of the lowest tier: a plank deck at every storey and standards along its outer edge. */
function layScaffold(base: SetbackBox, storeyM: number, pick: number, local: LocalBox): void {
  const face = Math.floor(pick * 4);
  const alongX = face < 2; // faces facing +/-x run along Z
  const sign = face % 2 === 0 ? 1 : -1;
  const length = alongX ? base.d : base.w;
  const wall = (alongX ? base.w : base.d) / 2;
  const at = (t: number, o: number): [number, number] => (alongX ? [sign * o, t] : [t, sign * o]);
  const planks = Math.max(1, Math.round(base.h / storeyM));
  const planksColor = unit('brightestWood');
  const poleColor = unit('galvanised');
  for (let k = 1; k <= planks; k++) {
    const [lx, lz] = at(0, wall + SCAFFOLD_DEPTH_M / 2);
    const y0 = Math.min(k * storeyM, base.h) - SCAFFOLD_PLANK_M;
    local(
      'scaffold',
      lx,
      lz,
      y0,
      alongX ? SCAFFOLD_DEPTH_M : length,
      SCAFFOLD_PLANK_M,
      alongX ? length : SCAFFOLD_DEPTH_M,
      planksColor,
    );
  }
  const bays = Math.max(1, Math.ceil(length / SCAFFOLD_POST_BAY_M));
  for (let i = 0; i <= bays; i++) {
    const [lx, lz] = at(-length / 2 + (length * i) / bays, wall + SCAFFOLD_DEPTH_M);
    local('scaffold', lx, lz, 0, SCAFFOLD_POST_M, base.h + 1, SCAFFOLD_POST_M, poleColor);
  }
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

const INITIAL_SITE_CAPACITY = 64;

/** Draws a site for every building under construction, and takes it down when the building is finished or gone. */
export class SiteRenderer {
  private readonly bodyOf: (building: BuildingInstance) => SiteBody | null;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material: MeshStandardNodeMaterial;
  private readonly nightFactorUniform = uniform(0);
  private readonly pools = new Map<SitePart, InstancedSlotPool>();
  /** Building id -> the pool slots its site holds. */
  private readonly owned = new Map<number, { part: SitePart; slot: number }[]>();

  constructor(scene: THREE.Scene, bodyOf: (building: BuildingInstance) => SiteBody | null) {
    this.bodyOf = bodyOf;
    this.material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    this.material.colorNode = nightTintNode(this.nightFactorUniform);
    for (const part of PARTS) {
      this.pools.set(
        part,
        new InstancedSlotPool(scene, this.geometry, this.material, INITIAL_SITE_CAPACITY),
      );
    }
  }

  /** Only the buildings the delta names are redrawn. */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.release(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);
    for (const pool of this.pools.values()) pool.commit();
  }

  /** 0 (day) .. 1 (night), the same tint every sunlit surface carries. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  /** Instances live across every part. */
  instanceCount(): number {
    let n = 0;
    for (const slots of this.owned.values()) n += slots.length;
    return n;
  }

  /** Instances a building's site holds. */
  siteInstances(buildingId: number): number {
    return this.owned.get(buildingId)?.length ?? 0;
  }

  private applyOne(building: BuildingInstance): void {
    this.release(building.id);
    if (building.state !== BuildingState.Constructing) return;
    const body = this.bodyOf(building);
    if (!body) return;
    const slots: { part: SitePart; slot: number }[] = [];
    for (const box of layoutSite(body, building.id, building.progress ?? 0)) {
      const pool = this.pools.get(box.part)!;
      const slot = pool.allocate();
      _position.set(box.x, box.y, box.z);
      _quaternion.setFromAxisAngle(_yAxis, box.yaw);
      _scale.set(box.w, box.h, box.d);
      _matrix.compose(_position, _quaternion, _scale);
      pool.setMatrixAt(slot, _matrix);
      _color.setRGB(box.color[0], box.color[1], box.color[2]);
      pool.setColorAt(slot, _color);
      slots.push({ part: box.part, slot });
    }
    this.owned.set(building.id, slots);
  }

  private release(id: number): void {
    const slots = this.owned.get(id);
    if (!slots) return;
    for (const { part, slot } of slots) this.pools.get(part)!.free(slot);
    this.owned.delete(id);
  }
}
