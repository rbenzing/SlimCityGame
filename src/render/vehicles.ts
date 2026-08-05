/**
 * Cosmetic vehicle rendering: one fixed-capacity InstancedMesh PER KIND
 * (MAX_VEHICLES slots each), interpolated each frame between the
 * previous and current sim snapshot buffers. `lerpVehicle`
 * is the pure per-slot helper; the class owns buffer bookkeeping, per-kind
 * mesh routing, and matrix/color/night-light writes.
 *
 * "toy kit" visual language:
 *  - Multi-part merged geometry per kind (body slab + darker inset cabin/
 *    window mass + wheel cylinders + headlight/taillight quads), tagged with
 *    a per-vertex `vehicleRegion` mask so `instanceColor` only tints BODY
 *    vertices -- cabin/wheels/lights keep their own baked colors regardless
 *    of the instance's palette color.
 *  - Silhouette variants (sedan/wagon/hatch, box-truck/pickup) are expressed
 *    as per-instance scale/section tweaks on top of the one shared per-kind
 *    geometry -- an InstancedMesh cannot vary its own vertex topology per
 *    instance, so "variant" is a deterministic slot-hash scale multiplier,
 *    keeping one InstancedMesh per kind and the buffer protocol untouched.
 *  - A curated saturated ~10-color palette is picked by a slot hash that also
 *    folds in a per-slot "generation" counter, bumped only when a slot is
 *    observed transitioning from inactive to active (i.e. reused for a new
 *    vehicle) -- stable while the same vehicle occupies the slot, re-rolled
 *    on reuse.
 *  - Night headlight/taillight emissive quads are switched by a shared
 *    nightFactor uniform crossing a fixed threshold (setNightFactor(f)).
 */
import * as THREE from 'three';
import { MeshLambertNodeMaterial, type MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  diffuseColor,
  equal,
  float,
  mix,
  mul,
  select,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_VEHICLES, VEHICLE_STRIDE, INACTIVE_VEHICLE_X, VehicleKind } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const TWO_PI = Math.PI * 2;

/**
 * Squared prev→curr jump (m²) beyond which a slot's two consecutive snapshots
 * are a cosmetic-pool HANDOFF to a brand-new vehicle, not real motion, so the
 * mesh must snap to curr rather than slide across the terrain between an old
 * route's end and a new route's start. A real vehicle covers under ~0.4 tiles
 * per tick (TICK_RATE 20), so 2 tiles cleanly separates motion from a handoff.
 */
const TELEPORT_SNAP_DIST_SQ = (2 * TILE_METERS) * (2 * TILE_METERS);

/** Wraps b-a into (-PI, PI] so lerping heading always takes the shortest arc. */
function shortestAngleDelta(a: number, b: number): number {
  let diff = (b - a) % TWO_PI;
  if (diff > Math.PI) diff -= TWO_PI;
  if (diff < -Math.PI) diff += TWO_PI;
  return diff;
}

function req(arr: number[], i: number, label: string): number {
  const v = arr[i];
  if (v === undefined)
    throw new RangeError(`${label}: index ${i} out of range (length ${arr.length})`);
  return v;
}

/**
 * Interpolates one vehicle slot's [x, z, heading, speed, kind] between the
 * previous and current snapshot. If either endpoint is the inactive marker,
 * snaps to `curr` instead of lerping (no comet trail from/to -1e9, and a
 * despawned slot still resolves to the inactive marker so callers can hide
 * it). Heading always takes the shortest angular path.
 */
export function lerpVehicle(
  prev: number[],
  curr: number[],
  alpha: number,
): { x: number; z: number; heading: number } {
  const currX = req(curr, 0, 'lerpVehicle curr');
  const currZ = req(curr, 1, 'lerpVehicle curr');
  const currHeading = req(curr, 2, 'lerpVehicle curr');

  if (currX === INACTIVE_VEHICLE_X) {
    return { x: currX, z: currZ, heading: currHeading };
  }

  const prevX = req(prev, 0, 'lerpVehicle prev');
  if (prevX === INACTIVE_VEHICLE_X) {
    return { x: currX, z: currZ, heading: currHeading };
  }

  const prevZ = req(prev, 1, 'lerpVehicle prev');
  const prevHeading = req(prev, 2, 'lerpVehicle prev');

  // Slot-handoff guard: the fixed cosmetic pool frees an arrived vehicle's slot
  // and can reallocate it to a new vehicle (elsewhere on the map) as early as
  // the same tick, so a slot's prev/curr can be two unrelated routes. Snap to
  // curr on an implausibly large jump so the mesh doesn't streak across grass
  // between the old destination and the new origin.
  const jumpX = currX - prevX;
  const jumpZ = currZ - prevZ;
  if (jumpX * jumpX + jumpZ * jumpZ > TELEPORT_SNAP_DIST_SQ) {
    return { x: currX, z: currZ, heading: currHeading };
  }

  const x = prevX + (currX - prevX) * alpha;
  const z = prevZ + (currZ - prevZ) * alpha;
  const heading = prevHeading + shortestAngleDelta(prevHeading, currHeading) * alpha;
  return { x, z, heading };
}

// ---------------------------------------------------------------------------
// "drive on the right": perpendicular lane offset, applied here at
// RENDER time (this file owns the offset — traffic.ts's vehicleBuffer keeps
// storing the raw route CENTERLINE, so its own tests, and any other future
// consumer of the buffer, keep working off the true path position).
//
// `heading` is the same Y-axis yaw traffic.ts stores: rotationY(heading)
// maps a +Z-nosed mesh's local +Z to world (sin heading, cos heading), i.e.
// the direction of travel. "Right" relative to that travel direction (viewed
// from above, +Y up) is the standard right-hand-rule vector
// right = normalize(forward) × up, which on this (x, z) plane resolves to
// (-cos(heading), sin(heading)):
//   heading 0   -> travel +Z ("south") -> right = -X ("west")
//   heading PI  -> travel -Z ("north") -> right = +X ("east")
// i.e. exactly opposite offsets for opposite travel directions, so opposing
// flows land on opposite sides of the road centerline.
//
// LANE_OFFSET_METERS puts a vehicle in the CENTER of its lane: half a lane off
// the centerline. Lanes are 3.75m (roadsmesh LANE_WIDTH_M = 1.5× the widest
// vehicle), so the offset is 1.875m — on a two-lane road opposing flows sit
// 3.75m apart, each dead-center in its 3.75m lane. Wider tiers have the same
// lane width, so this centers the near lane there too; the narrowest single-
// lane tiers (Alley/Gravel) carry negligible cosmetic traffic and read fine.
// ---------------------------------------------------------------------------

export const LANE_OFFSET_METERS = 1.875; // half a 3.75m lane (roadsmesh LANE_WIDTH_M / 2)

/** Perpendicular "drive on the right" world-space (x, z) offset for a vehicle facing `heading`. */
export function laneOffset(heading: number): { dx: number; dz: number } {
  return {
    dx: -Math.cos(heading) * LANE_OFFSET_METERS,
    dz: Math.sin(heading) * LANE_OFFSET_METERS,
  };
}

function sizeForKind(kind: number): readonly [number, number, number] {
  switch (kind) {
    case VehicleKind.Truck:
      return [2.2, 2.6, 7.0];
    case VehicleKind.Bus:
      return [2.5, 3.0, 10.0];
    case VehicleKind.Car:
    default:
      return [1.8, 1.5, 4.0];
  }
}

const ALL_KINDS = [VehicleKind.Car, VehicleKind.Truck, VehicleKind.Bus] as const;

// ---------------------------------------------------------------------------
// Region mask: which vertices `instanceColor` is allowed to tint.
// ---------------------------------------------------------------------------

export const VEHICLE_REGION = {
  /** Cabin/window mass + wheels: keep their own baked color always. */
  FIXED: 0,
  /** Body slab: tinted by the instance's palette color. */
  BODY: 1,
  /** Front light quads: warm emissive above the night threshold. */
  HEADLIGHT: 2,
  /** Rear light quads: red emissive above the night threshold. */
  TAILLIGHT: 3,
} as const;

function hexToRGB(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

const WHITE = hexToRGB(0xffffff);
const CABIN_COLOR = hexToRGB(0x1a1f26);
const WHEEL_COLOR = hexToRGB(0x0d0e10);
const HEADLIGHT_BASE_COLOR = hexToRGB(0xd9d3bf);
const TAILLIGHT_BASE_COLOR = hexToRGB(0x4d1414);
const HEADLIGHT_EMISSIVE_COLOR = hexToRGB(0xffd9a0); // matches the warm window emissive
const TAILLIGHT_EMISSIVE_COLOR = hexToRGB(0xff2a20);

/** Hard on/off threshold for headlight/taillight emissive, switched by nightFactor. */
export const VEHICLE_NIGHT_LIGHT_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Saturated ~10-color palette (red, blue, teal, green, magenta, pink,
// yellow, orange, white, charcoal) -- deliberately saturated against the
// desaturated city palette.
// ---------------------------------------------------------------------------

export const VEHICLE_PALETTE: readonly (readonly [number, number, number])[] = [
  hexToRGB(0xd9362c), // red
  hexToRGB(0x2f6fd6), // blue
  hexToRGB(0x1aa39c), // teal
  hexToRGB(0x3fae55), // green
  hexToRGB(0xb03bab), // magenta
  hexToRGB(0xf06fa0), // pink
  hexToRGB(0xf2c230), // yellow -- reads as taxi, no livery system needed
  hexToRGB(0xe8792b), // orange
  hexToRGB(0xe9edf0), // white
  hexToRGB(0x2b2e33), // charcoal
];

/** Deterministic 32-bit integer bit-mixer (Thomas Wang style) -- no Math.random/Date.now. */
function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

/** Deterministic combine of two integers into one hash. */
function hash2(a: number, b: number): number {
  return hash32(Math.imul(a + 1, 0x9e3779b1) ^ hash32(b));
}

function variantCountForKind(kind: number): number {
  switch (kind) {
    case VehicleKind.Car:
      return 3; // sedan, wagon, hatch
    case VehicleKind.Truck:
      return 2; // box-truck, pickup
    case VehicleKind.Bus:
    default:
      return 1; // one long window-band silhouette
  }
}

/**
 * Deterministic silhouette variant index for a slot, by slot-index hash:
 * Car -> sedan/wagon/hatch, Truck -> box-truck/pickup, Bus -> its one
 * long window-band silhouette. Stable regardless of slot reuse -- only the
 * palette color re-rolls on reuse.
 */
export function variantIndexForSlot(slot: number, kind: number): number {
  const count = variantCountForKind(kind);
  if (count <= 1) return 0;
  return hash2(slot, kind) % count;
}

// Per-variant scale/section tweaks applied on top of the kind's base size
// (sizeForKind). An InstancedMesh shares one geometry per kind, so variants
// are expressed as instance-level scale tweaks rather than distinct meshes.
const CAR_VARIANT_SCALE: readonly (readonly [number, number, number])[] = [
  [1.0, 1.0, 1.0], // sedan (baseline)
  [1.0, 1.12, 1.15], // wagon: taller roofline, longer
  [0.97, 0.94, 0.82], // hatch: shorter, slightly lower
];
const TRUCK_VARIANT_SCALE: readonly (readonly [number, number, number])[] = [
  [1.05, 1.45, 1.15], // box-truck: tall boxy cargo body
  [1.0, 0.85, 1.0], // pickup: low profile
];
const BUS_VARIANT_SCALE: readonly (readonly [number, number, number])[] = [[1.0, 1.0, 1.0]];

function variantScaleForKind(
  kind: number,
  variantIndex: number,
): readonly [number, number, number] {
  const table =
    kind === VehicleKind.Truck
      ? TRUCK_VARIANT_SCALE
      : kind === VehicleKind.Bus
        ? BUS_VARIANT_SCALE
        : CAR_VARIANT_SCALE;
  return table[variantIndex] ?? table[0] ?? [1, 1, 1];
}

/**
 * Deterministic palette index for a slot at a given "generation" (a private
 * render-side counter bumped only on an inactive->active transition -- see
 * VehicleRenderer.setBuffer). Rotating by +1 per generation guarantees the
 * color actually changes every reuse (never just "probably different"),
 * while staying fixed for as long as the same vehicle occupies the slot.
 */
export function paletteIndexForSlot(slot: number, generation: number): number {
  const n = VEHICLE_PALETTE.length;
  const base = hash32(slot) % n;
  return (base + (generation % n) + n) % n;
}

export function paletteColorForSlot(
  slot: number,
  generation: number,
): readonly [number, number, number] {
  const idx = paletteIndexForSlot(slot, generation);
  return VEHICLE_PALETTE[idx] ?? VEHICLE_PALETTE[0] ?? [1, 1, 1];
}

// ---------------------------------------------------------------------------
// Multi-part merged geometry per kind.
// ---------------------------------------------------------------------------

/** Tags every vertex of `geo` with a fixed baked color and region code, in place. */
function tagGeometry(
  geo: THREE.BufferGeometry,
  colorRGB: readonly [number, number, number],
  region: number,
): THREE.BufferGeometry {
  const position = geo.getAttribute('position');
  const count = position ? position.count : 0;
  const colors = new Float32Array(count * 3);
  const regions = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = colorRGB[0];
    colors[i * 3 + 1] = colorRGB[1];
    colors[i * 3 + 2] = colorRGB[2];
    regions[i] = region;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('vehicleRegion', new THREE.Float32BufferAttribute(regions, 1));
  return geo;
}

function box(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  colorRGB: readonly [number, number, number],
  region: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(cx, cy, cz);
  return tagGeometry(geo, colorRGB, region);
}

interface KindLayout {
  bodySize: readonly [number, number, number];
  bodyCenter: readonly [number, number, number];
  cabinSize: readonly [number, number, number];
  cabinCenter: readonly [number, number, number];
}

// All dimensions are in the same local unit-cube space BoxGeometry(1,1,1)
// already used by the box-only predecessor: X/Z span roughly [-0.5, 0.5]
// (scaled per-instance by sizeForKind's [sx, sy, sz]), Y bottom at -0.5 so
// `groundY + sy/2` still places the whole mesh on the ground exactly as
// before. Cabin sits flush on top of the body for every kind; only the
// cabin's shape/position differs, giving each kind a distinct silhouette
// from the SAME shared per-kind geometry.
const KIND_LAYOUT: Record<number, KindLayout> = {
  [VehicleKind.Car]: {
    bodySize: [0.94, 0.56, 0.92],
    bodyCenter: [0, -0.22, 0],
    cabinSize: [0.7, 0.32, 0.5],
    cabinCenter: [0, 0.22, 0.02], // centered, slightly rear -- sedan-like greenhouse
  },
  [VehicleKind.Truck]: {
    bodySize: [0.92, 0.5, 0.95],
    bodyCenter: [0, -0.25, 0],
    cabinSize: [0.82, 0.4, 0.22],
    cabinCenter: [0, 0.2, 0.37], // small front cab, leaving a long bare cargo body behind
  },
  [VehicleKind.Bus]: {
    bodySize: [0.94, 0.6, 0.97],
    bodyCenter: [0, -0.2, 0],
    cabinSize: [0.86, 0.34, 0.86],
    cabinCenter: [0, 0.27, 0], // near-full-length window band
  },
};

function wheelSpecForKind(kind: number): { worldRadius: number; worldThickness: number } {
  switch (kind) {
    case VehicleKind.Truck:
    case VehicleKind.Bus:
      return { worldRadius: 0.42, worldThickness: 0.28 };
    case VehicleKind.Car:
    default:
      return { worldRadius: 0.32, worldThickness: 0.22 };
  }
}

/**
 * Builds the 4 wheel cylinders for `kind`, pre-distorting each cylinder's
 * local cross-section so that after the kind's non-uniform per-instance
 * scale [sx, sy, sz] is applied, the wheel reads circular in world space
 * (sy and sz differ a lot -- e.g. a bus is 10/3 times longer than it is
 * tall -- so an uncompensated cylinder would render as a squashed ellipse).
 */
function buildWheelParts(kind: number): THREE.BufferGeometry[] {
  const [sx, sy, sz] = sizeForKind(kind);
  const { worldRadius, worldThickness } = wheelSpecForKind(kind);

  // A cylinder is built with its axis along local Y (circular cross-section
  // in local X/Z); rotateZ(90deg) maps local X -> new Y and leaves Z as Z, so
  // pre-scaling local X by worldRadius/sy and local Z by worldRadius/sz means
  // the POST-rotation, POST-instance-scale cross-section is a true circle of
  // radius `worldRadius` in world space. Height (the axle length along the
  // eventual X/width axis) is likewise pre-divided by sx.
  const scaleForLocalX = worldRadius / sy;
  const scaleForLocalZ = worldRadius / sz;
  const localThickness = worldThickness / sx;
  const localCy = -0.5 + worldRadius / sy; // bottom of wheel touches local y=-0.5 (ground)

  const cxAbs = 0.47;
  const czFront = 0.32;
  const czRear = -0.32;
  const centers: ReadonlyArray<readonly [number, number, number]> = [
    [cxAbs, localCy, czFront],
    [cxAbs, localCy, czRear],
    [-cxAbs, localCy, czFront],
    [-cxAbs, localCy, czRear],
  ];

  return centers.map(([wx, wy, wz]) => {
    const geo = new THREE.CylinderGeometry(1, 1, localThickness, 8, 1);
    geo.scale(scaleForLocalX, 1, scaleForLocalZ);
    geo.rotateZ(Math.PI / 2);
    geo.translate(wx, wy, wz);
    return tagGeometry(geo, WHEEL_COLOR, VEHICLE_REGION.FIXED);
  });
}

/** Builds the front headlight and rear taillight quads (thin boxes), symmetric left/right. */
function buildLightParts(): THREE.BufferGeometry[] {
  const cy = -0.28;
  return [
    box(0.16, 0.12, 0.04, 0.28, cy, 0.49, HEADLIGHT_BASE_COLOR, VEHICLE_REGION.HEADLIGHT),
    box(0.16, 0.12, 0.04, -0.28, cy, 0.49, HEADLIGHT_BASE_COLOR, VEHICLE_REGION.HEADLIGHT),
    box(0.14, 0.1, 0.04, 0.3, cy, -0.49, TAILLIGHT_BASE_COLOR, VEHICLE_REGION.TAILLIGHT),
    box(0.14, 0.1, 0.04, -0.3, cy, -0.49, TAILLIGHT_BASE_COLOR, VEHICLE_REGION.TAILLIGHT),
  ];
}

/**
 * Builds the merged multi-part geometry for one vehicle kind: body
 * slab (region=BODY, baked white so instanceColor reproduces the palette
 * color exactly) + darker inset cabin/window mass + wheel cylinders (both
 * region=FIXED, baked colors untouched by instanceColor) + headlight/
 * taillight quads (region=HEADLIGHT/TAILLIGHT, emissive above the night
 * threshold). Built once per kind; instances share it via InstancedMesh.
 */
export function buildVehicleGeometry(kind: number): THREE.BufferGeometry {
  const layout = KIND_LAYOUT[kind] ?? KIND_LAYOUT[VehicleKind.Car];
  if (!layout) throw new RangeError(`buildVehicleGeometry: no layout for kind ${kind}`);

  const parts: THREE.BufferGeometry[] = [
    box(
      layout.bodySize[0],
      layout.bodySize[1],
      layout.bodySize[2],
      layout.bodyCenter[0],
      layout.bodyCenter[1],
      layout.bodyCenter[2],
      WHITE,
      VEHICLE_REGION.BODY,
    ),
    box(
      layout.cabinSize[0],
      layout.cabinSize[1],
      layout.cabinSize[2],
      layout.cabinCenter[0],
      layout.cabinCenter[1],
      layout.cabinCenter[2],
      CABIN_COLOR,
      VEHICLE_REGION.FIXED,
    ),
    ...buildWheelParts(kind),
    ...buildLightParts(),
  ];

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`buildVehicleGeometry: mergeGeometries failed for kind ${kind}`);
  return merged;
}

// ---------------------------------------------------------------------------
// Material: region-masked instance tint + night emissive lights.
// ---------------------------------------------------------------------------

/**
 * A NodeMaterial that tints ONLY region===BODY vertices by instanceColor.
 * NodeMaterial's base `setupDiffuseColor` unconditionally multiplies the
 * WHOLE diffuse color by instanceColor whenever `object.instanceColor` is
 * set (so cabin/wheels/lights would get tinted too). We suppress that one
 * automatic step (temporarily hiding instanceColor from the base
 * implementation, restoring it immediately after), then re-apply the same
 * multiply ourselves, gated by the per-vertex region mask via `mix()`.
 *
 * The instance tint is read back through a SEPARATE, plain, named geometry
 * attribute (`vehicleInstanceTint`) that aliases the exact same
 * InstancedBufferAttribute object driving `instanceColor`/setColorAt/
 * getColorAt -- so it carries live, per-instance data via the ordinary
 * public `attribute()` accessor, independent of the automatic pipeline we
 * just suppressed.
 */
type DiffuseColorBuilder = Parameters<MeshLambertNodeMaterial['setupDiffuseColor']>[0];

class VehiclePartMaterial extends MeshLambertNodeMaterial {
  // NodeMaterial's shared lighting setup reads `this.emissiveNode` generically
  // (used by MeshStandardNodeMaterial et al.), but MeshLambertNodeMaterial's
  // own type doesn't declare it -- add it here with the same type so
  // `material.emissiveNode = ...` type-checks; the runtime already supports it.
  emissiveNode: MeshStandardNodeMaterial['emissiveNode'] = null;

  setupDiffuseColor(builder: DiffuseColorBuilder) {
    const object = builder.object as THREE.InstancedMesh;
    const realInstanceColor = object.instanceColor;
    object.instanceColor = null;
    super.setupDiffuseColor(builder);
    object.instanceColor = realInstanceColor;

    if (realInstanceColor) {
      const tint = attribute<'vec3'>('vehicleInstanceTint', 'vec3');
      const isBody = equal(
        attribute<'float'>('vehicleRegion', 'float'),
        float(VEHICLE_REGION.BODY),
      );
      diffuseColor.rgb = mix(diffuseColor.rgb, mul(diffuseColor.rgb, tint), float(isBody));
    }
  }
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class VehicleRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly nightFactorUniform = uniform(0);
  private readonly meshes: THREE.InstancedMesh[] = [];
  private prevBuffer: Float32Array | null = null;
  private currBuffer: Float32Array | null = null;
  /** Bumped per-slot only on an observed inactive->active transition (palette re-roll). */
  private readonly slotGeneration = new Uint32Array(MAX_VEHICLES);

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.heightAt = heightAt;

    // Shared emissive graph for all 3 kinds: warm headlight / red taillight,
    // hard-switched by nightFactor crossing VEHICLE_NIGHT_LIGHT_THRESHOLD.
    const region = attribute<'float'>('vehicleRegion', 'float');
    const isHeadlight = equal(region, float(VEHICLE_REGION.HEADLIGHT));
    const isTaillight = equal(region, float(VEHICLE_REGION.TAILLIGHT));
    const on = step(VEHICLE_NIGHT_LIGHT_THRESHOLD, this.nightFactorUniform);
    const emissiveNode = select(
      isHeadlight,
      mul(vec3(...HEADLIGHT_EMISSIVE_COLOR), on),
      select(isTaillight, mul(vec3(...TAILLIGHT_EMISSIVE_COLOR), on), vec3(0, 0, 0)),
    );

    for (const kind of ALL_KINDS) {
      const geometry = buildVehicleGeometry(kind);
      const material = new VehiclePartMaterial();
      material.vertexColors = true;
      material.emissiveNode = emissiveNode;

      const mesh = new THREE.InstancedMesh(geometry, material, MAX_VEHICLES);
      mesh.castShadow = true; // shadow sweep: cosmetic cars cast onto the road
      // Vehicles span the whole road network and move every frame; per-frame
      // bounding-sphere maintenance would cost more than culling saves, and
      // three.js's cached sphere (computed once, while all slots were still
      // hidden at the origin) would wrongly cull them all otherwise.
      mesh.frustumCulled = false;
      const tintArray = new Float32Array(MAX_VEHICLES * 3).fill(1);
      const tintAttribute = new THREE.InstancedBufferAttribute(tintArray, 3);
      mesh.instanceColor = tintAttribute;
      geometry.setAttribute('vehicleInstanceTint', tintAttribute);
      mesh.userData.vehicleKind = kind;

      for (let i = 0; i < MAX_VEHICLES; i++) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.count = MAX_VEHICLES;
      mesh.instanceMatrix.needsUpdate = true;

      scene.add(mesh);
      this.meshes[kind] = mesh;
    }
  }

  private meshFor(kind: number): THREE.InstancedMesh {
    const mesh = this.meshes[kind];
    if (!mesh) throw new RangeError(`VehicleRenderer: no mesh for kind ${kind}`);
    return mesh;
  }

  /**
   * Promotes the previous "current" buffer to "previous" and stores the new
   * one. Also detects, per slot, an inactive->active transition relative to
   * the snapshot this replaces -- that's a slot being reused for a new
   * vehicle, so its palette "generation" is bumped (reuse re-roll).
   */
  setBuffer(buf: Float32Array): void {
    const previousCurr = this.currBuffer;
    for (let slot = 0; slot < MAX_VEHICLES; slot++) {
      const base = slot * VEHICLE_STRIDE;
      const wasActive = previousCurr
        ? (previousCurr[base] ?? INACTIVE_VEHICLE_X) !== INACTIVE_VEHICLE_X
        : false;
      const isActiveNow = (buf[base] ?? INACTIVE_VEHICLE_X) !== INACTIVE_VEHICLE_X;
      if (!wasActive && isActiveNow) {
        this.slotGeneration[slot] = (this.slotGeneration[slot] ?? 0) + 1;
      }
    }

    this.prevBuffer = this.currBuffer ?? buf;
    this.currBuffer = buf;
  }

  /**
   * Speed scaling: `alphaToNext` is taken as-is, un-clamped and
   * un-scaled by any internal notion of frame rate or real time -- this
   * class has no fixed-timestep assumption of its own. The caller (main.ts's
   * frame loop) derives it from real elapsed ms since the last snapshot
   * arrived; because the worker's snapshot cadence rides the same
   * TICK_MS / SPEED_MULTIPLIERS[speed] pacing as every other sim tick (see
   * shared/constants.ts), snapshots land more often in real time at 2x/4x and
   * less often at pause/1x, so alpha already sweeps 0..1 at the right real-
   * time rate for every playback speed without this method doing anything
   * speed-aware itself. Passing any alpha in [0, 1] (or slightly beyond, for
   * an equally-un-clamped extrapolation) always yields a proportional
   * position between prev/curr -- see lerpVehicle, which performs no
   * clamping either.
   */
  update(alphaToNext: number): void {
    const curr = this.currBuffer;
    if (!curr) return;
    const prev = this.prevBuffer ?? curr;

    for (let slot = 0; slot < MAX_VEHICLES; slot++) {
      const base = slot * VEHICLE_STRIDE;
      const prevSlot = [
        prev[base] ?? INACTIVE_VEHICLE_X,
        prev[base + 1] ?? 0,
        prev[base + 2] ?? 0,
        prev[base + 3] ?? 0,
        prev[base + 4] ?? 0,
      ];
      const currSlot = [
        curr[base] ?? INACTIVE_VEHICLE_X,
        curr[base + 1] ?? 0,
        curr[base + 2] ?? 0,
        curr[base + 3] ?? 0,
        curr[base + 4] ?? 0,
      ];

      const { x, z, heading } = lerpVehicle(prevSlot, currSlot, alphaToNext);

      if (x === INACTIVE_VEHICLE_X) {
        for (const kind of ALL_KINDS) this.meshFor(kind).setMatrixAt(slot, HIDDEN_MATRIX);
        continue;
      }

      const kind = currSlot[4] ?? VehicleKind.Car;
      const variantIdx = variantIndexForSlot(slot, kind);
      const [baseSx, baseSy, baseSz] = sizeForKind(kind);
      const [mx, my, mz] = variantScaleForKind(kind, variantIdx);
      const sx = baseSx * mx;
      const sy = baseSy * my;
      const sz = baseSz * mz;

      // Shift onto the right-hand lane before placing/sampling
      // ground height, so the vehicle actually sits on the carriageway (not
      // straddling the painted centerline) at its rendered position.
      const offset = laneOffset(heading);
      const renderX = x + offset.dx;
      const renderZ = z + offset.dz;

      const groundY = this.heightAt(renderX, renderZ);
      _position.set(renderX, groundY + sy / 2, renderZ);
      _quaternion.setFromAxisAngle(_yAxis, heading);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);

      const generation = this.slotGeneration[slot] ?? 0;
      const [cr, cg, cb] = paletteColorForSlot(slot, generation);
      _color.setRGB(cr, cg, cb);

      for (const meshKind of ALL_KINDS) {
        const mesh = this.meshFor(meshKind);
        if (meshKind === kind) {
          mesh.setMatrixAt(slot, _matrix);
          mesh.setColorAt(slot, _color);
        } else {
          mesh.setMatrixAt(slot, HIDDEN_MATRIX);
        }
      }
    }

    for (const kind of ALL_KINDS) {
      const mesh = this.meshFor(kind);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** 0 (day, lights off) .. 1 (night, lights on above VEHICLE_NIGHT_LIGHT_THRESHOLD). */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  /** Current nightFactor, for tests/introspection. */
  nightFactor(): number {
    return this.nightFactorUniform.value;
  }
}
