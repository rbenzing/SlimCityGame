/**
 * Utility & service silhouette kits. Ploppables whose real-world silhouette
 * *is* their identity get a detail kit instead of the generic facade box:
 * merged low-poly geometry per kit
 * part, instanced across every instance of that catalog id, built once per
 * kit and cheap per instance thereafter — the same architecture as
 * landmarks.ts's LandmarkRenderer (read that file first; this one mirrors its
 * idioms exactly): a kit renderer beside BuildingInstancer, fed the SAME
 * BuildingDelta stream, acting ONLY on a fixed registry of catalog ids
 * (UTILITY_KIT_CATALOG_IDS) — every other catalog id is ignored entirely,
 * BuildingInstancer still draws that instance's own box/plinth.
 *
 * For kit-owned ids, BuildingInstancer (see buildings.ts)
 * renders a low PLINTH instead of the full facade box: picking/outline/
 * bulldoze keep working through that existing path while this file carries
 * the actual visual identity.
 *
 * Four kits today:
 *  - wind-turbine: tapered mast + nacelle ("turbineTower"), a separate
 *    "turbineRotor" InstancedMesh whose per-instance rotation advances every
 *    update(tMs) (slow spin, phase offset hashed from the building id so
 *    turbines don't sync), and a small "turbineBeacon" that only glows at
 *    night (setNightFactor) — the ONE kit part in this whole file that reacts
 *    to night at all — kits stay unlit except a small red turbine
 *    nacelle beacon at night.
 *  - water-tower: 4 splayed legs ("waterLegs") + a banded cylindrical tank
 *    with a domed cap ("waterTank").
 *  - coal-plant: a dark boiler hall ("coalHall") covering ~3x4 of its 4x4
 *    footprint, 2 striped smokestacks ("coalSmokestack", chimney
 *    language), and a low coal-heap wedge ("coalHeap") in the strip beside
 *    the hall.
 *  - small-park: a flat lawn plate + path cross ("parkGround"), 2-3
 *    self-contained trees ("parkTree" — trunk+canopy built locally; this file
 *    deliberately does NOT import trees.ts), and 2 benches ("parkBench").
 *
 * Every placement is a PURE function of (catalog footprint[, buildingId]) —
 * no THREE/DOM dependency, no Math.random/Date.now anywhere — mirroring
 * landmarks.ts's/props.ts's convention so positions/counts are directly
 * unit-testable without a scene. Removal zero-scales + frees every slot an
 * instance owned via massing.ts's InstancedSlotPool (the codebase's shared
 * capacity-doubling instanced-mesh allocator), exactly like every sibling
 * renderer's swap/free convention.
 */
import * as THREE from 'three';
import { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { InstancedSlotPool } from './massing';

// ---------------------------------------------------------------------------
// Registry: acts ONLY on catalog ids in its registry —
// mirrors landmarks.ts's LANDMARK_CATALOG_IDS convention exactly.
// ---------------------------------------------------------------------------

export const UTILITY_KIT_CATALOG_IDS: readonly string[] = [
  'wind-turbine',
  'water-tower',
  'coal-plant',
  'small-park',
];

export type UtilityKitPartKind =
  | 'turbineTower'
  | 'turbineRotor'
  | 'turbineBeacon'
  | 'waterLegs'
  | 'waterTank'
  | 'coalHall'
  | 'coalSmokestack'
  | 'coalHeap'
  | 'parkGround'
  | 'parkTree'
  | 'parkBench';

// ---------------------------------------------------------------------------
// Shared pure helpers (each render/*.ts file keeps its own local copy of
// these tiny recipes rather than importing them — see landmarks.ts's/
// props.ts's/massing.ts's identical convention).
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number];
export interface Vec2 {
  x: number;
  z: number;
}
interface FootprintSize {
  w: number;
  d: number;
}

/**
 * 32-bit avalanche mix ("triple32", public domain) -> [0,1). Deterministic;
 * never Math.random/Date.now.
 */
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Rotates a LOCAL (unrotated footprint-frame) offset by rotation*90 degrees
 * about Y, matching buildings.ts's/landmarks.ts's own
 * `setFromAxisAngle(yAxis, rotation * PI/2)` convention exactly (cross-
 * checked against THREE.Vector3.applyQuaternion in utilitykits.test.ts) — so
 * a kit part scattered in the footprint-local frame stays put on the
 * footprint regardless of the ploppable's own rotation.
 */
export function rotateLocalXZ(x: number, z: number, rotation: 0 | 1 | 2 | 3): Vec2 {
  const theta = rotation * (Math.PI / 2);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/** Half-extents of a catalog footprint, in world meters (local X = w, local Z = d). */
export function footprintHalfExtents(footprint: FootprintSize): { halfW: number; halfD: number } {
  return { halfW: (footprint.w * TILE_METERS) / 2, halfD: (footprint.d * TILE_METERS) / 2 };
}

function hexFromRgb(rgb: RGB): number {
  return new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex();
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Paints every vertex of `geometry` the same absolute color (RGB baked in, not a multiplier) — mirrors trees.ts's paintVertexColor exactly. */
function paintVertexColor(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const position = geometry.getAttribute('position');
  const count = position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Merges several BufferGeometries (each already given local position via
 * .translate()/.scale()/.rotateZ()/.applyQuaternion() and a baked 'color'
 * attribute) into one indexed BufferGeometry carrying position/normal/color
 * through unchanged. A self-contained copy of trees.ts's mergeGeometryParts
 * minus the uv channel (no textures here) — same "each file stays dependency-
 * free" convention as this whole subsystem.
 */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    if (!position) throw new Error('utilitykits: geometry part missing a position attribute');
    vertexCount += position.count;
    const index = part.getIndex();
    indexCount += index ? index.count : position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3).fill(1);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    const color = part.getAttribute('color');
    const index = part.getIndex();
    const count = position.count;

    for (let i = 0; i < count; i++) {
      const vi = vertexOffset + i;
      positions[vi * 3] = position.getX(i);
      positions[vi * 3 + 1] = position.getY(i);
      positions[vi * 3 + 2] = position.getZ(i);
      if (normal) {
        normals[vi * 3] = normal.getX(i);
        normals[vi * 3 + 1] = normal.getY(i);
        normals[vi * 3 + 2] = normal.getZ(i);
      }
      if (color) {
        colors[vi * 3] = color.getX(i);
        colors[vi * 3 + 1] = color.getY(i);
        colors[vi * 3 + 2] = color.getZ(i);
      }
    }

    if (index) {
      for (let i = 0; i < index.count; i++) indices[indexOffset + i] = vertexOffset + index.getX(i);
      indexOffset += index.count;
    } else {
      for (let i = 0; i < count; i++) indices[indexOffset + i] = vertexOffset + i;
      indexOffset += count;
    }

    vertexOffset += count;
    part.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * A tapered "strut" geometry running from `base`(baseY) to `top`(topY), local
 * Y=0 at world ground — used by the water-tower's splayed legs. A real
 * (non-stub) technique: build a vertical tapered cylinder, then rotate it
 * from +Y onto the base->top direction and translate it into place.
 */
function buildStrutGeometry(
  base: Vec2,
  top: Vec2,
  baseY: number,
  topY: number,
  radius: number,
): THREE.BufferGeometry {
  const from = new THREE.Vector3(base.x, baseY, base.z);
  const to = new THREE.Vector3(top.x, topY, top.z);
  const delta = new THREE.Vector3().subVectors(to, from);
  const length = delta.length();

  const geometry = new THREE.CylinderGeometry(radius * 0.6, radius, length, 6);
  geometry.translate(0, length / 2, 0);
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP_AXIS, direction);
  geometry.applyQuaternion(quaternion);
  geometry.translate(from.x, from.y, from.z);
  return geometry;
}

// ---------------------------------------------------------------------------
// wind-turbine: tapered mast -> nacelle -> 3-blade rotor
// spinning slowly, pale bone white; a small red nacelle beacon at night.
// ---------------------------------------------------------------------------

export const TURBINE_MAST_HEIGHT = 34; // "~34m"
const TURBINE_MAST_RADIUS_BOTTOM = 2; // "~2m base"
const TURBINE_MAST_RADIUS_TOP = 1; // "-> 1m top"
const TURBINE_NACELLE_SIZE = { w: 2.4, h: 2.2, d: 5.5 };
const TURBINE_NACELLE_Z_OFFSET = -1.4; // nacelle center sits slightly ahead of the mast centerline
const TURBINE_ROTOR_FORWARD_GAP = 0.6; // hub sits this far past the nacelle's own front face
const TURBINE_HUB_RADIUS = 0.7;
export const TURBINE_BLADE_COUNT = 3; // "3-blade rotor"
const TURBINE_BLADE_LENGTH = 8.5;
const TURBINE_BLADE_ROOT_WIDTH = 0.9;
const TURBINE_BLADE_TIP_WIDTH = 0.3;
const TURBINE_BLADE_THICKNESS = 0.28;
const TURBINE_BEACON_RADIUS = 0.5;

/** Pale bone white — same values as facade.ts's ROOF_PALETTE off-white/bone entry, duplicated locally per this subsystem's convention. */
const TURBINE_BODY_RGB: RGB = [0.93, 0.91, 0.87];
const TURBINE_ROTOR_RGB: RGB = [0.85, 0.83, 0.79];
const TURBINE_BEACON_COLOR = 0xff2a2a;

/** Slow ~0.5 rad/s. */
export const TURBINE_ROTOR_ANGULAR_SPEED = 0.5;
const TURBINE_HASH_MULT = 4096;
const TURBINE_HASH_SLOT_PHASE = 1;

/** Deterministic per-turbine phase offset in [0, 2*PI) so turbines don't spin in sync. Pure. */
export function turbineRotorPhase(buildingId: number): number {
  return hash1(buildingId * TURBINE_HASH_MULT + TURBINE_HASH_SLOT_PHASE) * Math.PI * 2;
}

/** Rotor spin angle (radians) at a given elapsed visual time; phase-offset + constant angular speed. Pure. */
export function turbineRotorAngle(buildingId: number, tMs: number): number {
  return turbineRotorPhase(buildingId) + (tMs / 1000) * TURBINE_ROTOR_ANGULAR_SPEED;
}

/** Local (footprint-frame) hub position, local Y=0 at ground — the rotor mounts here, projecting past the nacelle's front face (negative local Z). Pure. */
export function turbineHubLocal(): { x: number; y: number; z: number } {
  return {
    x: 0,
    y: TURBINE_MAST_HEIGHT + TURBINE_NACELLE_SIZE.h / 2,
    z: TURBINE_NACELLE_Z_OFFSET - TURBINE_NACELLE_SIZE.d / 2 - TURBINE_ROTOR_FORWARD_GAP,
  };
}

/** Local nacelle-top beacon position, local Y=0 at ground. Pure. */
export function turbineBeaconLocal(): { x: number; y: number; z: number } {
  return {
    x: 0,
    y: TURBINE_MAST_HEIGHT + TURBINE_NACELLE_SIZE.h + TURBINE_BEACON_RADIUS,
    z: TURBINE_NACELLE_Z_OFFSET,
  };
}

/** Tapered mast + nacelle box, merged; local Y=0 is the GROUND plane. */
function buildTurbineTowerGeometry(): THREE.BufferGeometry {
  const mast = new THREE.CylinderGeometry(
    TURBINE_MAST_RADIUS_TOP,
    TURBINE_MAST_RADIUS_BOTTOM,
    TURBINE_MAST_HEIGHT,
    10,
  );
  mast.translate(0, TURBINE_MAST_HEIGHT / 2, 0);
  paintVertexColor(mast, hexFromRgb(TURBINE_BODY_RGB));

  const nacelle = new THREE.BoxGeometry(
    TURBINE_NACELLE_SIZE.w,
    TURBINE_NACELLE_SIZE.h,
    TURBINE_NACELLE_SIZE.d,
  );
  nacelle.translate(0, TURBINE_MAST_HEIGHT + TURBINE_NACELLE_SIZE.h / 2, TURBINE_NACELLE_Z_OFFSET);
  paintVertexColor(nacelle, hexFromRgb(TURBINE_ROTOR_RGB));

  return mergeParts([mast, nacelle]);
}

/** A single tapered blade, root at the hub, pointing +Y before being swept around the spin (Z) axis. */
function buildTurbineBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    TURBINE_BLADE_TIP_WIDTH / 2,
    TURBINE_BLADE_ROOT_WIDTH / 2,
    TURBINE_BLADE_LENGTH,
    4,
  );
  geometry.scale(1, 1, TURBINE_BLADE_THICKNESS / TURBINE_BLADE_ROOT_WIDTH);
  geometry.translate(0, TURBINE_BLADE_LENGTH / 2 + TURBINE_HUB_RADIUS * 0.6, 0);
  return geometry;
}

/**
 * Hub + TURBINE_BLADE_COUNT blades, merged; built with the spin axis along
 * local Z (so a runtime rotation about Z is the whole rotor's spin) and
 * blades swept in the local XY plane — local origin IS the hub center (this
 * part's own placement anchor is the hub world position, not the ground).
 */
function buildTurbineRotorGeometry(): THREE.BufferGeometry {
  const hub = new THREE.SphereGeometry(TURBINE_HUB_RADIUS, 8, 6);
  paintVertexColor(hub, hexFromRgb(TURBINE_ROTOR_RGB));

  const parts: THREE.BufferGeometry[] = [hub];
  for (let i = 0; i < TURBINE_BLADE_COUNT; i++) {
    const angle = (i / TURBINE_BLADE_COUNT) * Math.PI * 2;
    const blade = buildTurbineBladeGeometry();
    blade.rotateZ(angle);
    paintVertexColor(blade, hexFromRgb(TURBINE_ROTOR_RGB));
    parts.push(blade);
  }
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------
// water-tower: 4 splayed legs + banded cylindrical tank +
// domed cap, ~22m.
// ---------------------------------------------------------------------------

export const WATER_LEG_COUNT = 4;
const WATER_LEG_HEIGHT = 15;
const WATER_LEG_BASE_RADIUS = 5.4;
const WATER_LEG_TOP_RADIUS = 1.9;
const WATER_LEG_THICKNESS = 0.55;
const WATER_TANK_RADIUS = 6.2;
const WATER_TANK_HEIGHT = 5.4;
const WATER_TANK_BAND_COUNT = 3;
const WATER_TANK_BAND_HEIGHT = 0.4;
const WATER_TANK_BAND_RADIUS_BONUS = 0.15;
const WATER_CAP_HEIGHT = 2.4;

const WATER_LEG_RGB: RGB = [0.5, 0.51, 0.52];
const WATER_TANK_RGB: RGB = [0.84, 0.82, 0.76];
const WATER_TANK_BAND_RGB: RGB = [0.58, 0.57, 0.54];
const WATER_CAP_RGB: RGB = [0.76, 0.74, 0.68];

export interface LegPlacement {
  base: Vec2;
  top: Vec2;
}

/** 4 legs splayed at the ground, converging (but not meeting) near the center under the tank. Pure; fixed (no per-instance variation is called for). */
export function computeWaterLegPlacements(): readonly LegPlacement[] {
  const placements: LegPlacement[] = [];
  for (let i = 0; i < WATER_LEG_COUNT; i++) {
    const angle = (i / WATER_LEG_COUNT) * Math.PI * 2 + Math.PI / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    placements.push({
      base: { x: cos * WATER_LEG_BASE_RADIUS, z: sin * WATER_LEG_BASE_RADIUS },
      top: { x: cos * WATER_LEG_TOP_RADIUS, z: sin * WATER_LEG_TOP_RADIUS },
    });
  }
  return placements;
}

/** 4 splayed struts, merged; local Y=0 is the GROUND plane. */
function buildWaterLegsGeometry(): THREE.BufferGeometry {
  const parts = computeWaterLegPlacements().map(({ base, top }) => {
    const leg = buildStrutGeometry(base, top, 0, WATER_LEG_HEIGHT, WATER_LEG_THICKNESS);
    paintVertexColor(leg, hexFromRgb(WATER_LEG_RGB));
    return leg;
  });
  return mergeParts(parts);
}

/** Banded cylinder body + a domed cap, merged; local Y=0 is the GROUND plane (the tank sits atop WATER_LEG_HEIGHT). */
function buildWaterTankGeometry(): THREE.BufferGeometry {
  const bodyBottomY = WATER_LEG_HEIGHT;

  const body = new THREE.CylinderGeometry(
    WATER_TANK_RADIUS,
    WATER_TANK_RADIUS,
    WATER_TANK_HEIGHT,
    14,
  );
  body.translate(0, bodyBottomY + WATER_TANK_HEIGHT / 2, 0);
  paintVertexColor(body, hexFromRgb(WATER_TANK_RGB));

  const parts: THREE.BufferGeometry[] = [body];
  for (let i = 0; i < WATER_TANK_BAND_COUNT; i++) {
    const t = (i + 1) / (WATER_TANK_BAND_COUNT + 1);
    const band = new THREE.CylinderGeometry(
      WATER_TANK_RADIUS + WATER_TANK_BAND_RADIUS_BONUS,
      WATER_TANK_RADIUS + WATER_TANK_BAND_RADIUS_BONUS,
      WATER_TANK_BAND_HEIGHT,
      14,
    );
    band.translate(0, bodyBottomY + WATER_TANK_HEIGHT * t, 0);
    paintVertexColor(band, hexFromRgb(WATER_TANK_BAND_RGB));
    parts.push(band);
  }

  // thetaLength = PI/2 sweeps from the pole to the equator: a dome bulging
  // upward with a flat (always tank-hidden) base — same technique as
  // landmarks.ts's roof dome.
  const cap = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(WATER_TANK_RADIUS, WATER_CAP_HEIGHT, WATER_TANK_RADIUS);
  cap.translate(0, bodyBottomY + WATER_TANK_HEIGHT, 0);
  paintVertexColor(cap, hexFromRgb(WATER_CAP_RGB));
  parts.push(cap);

  return mergeParts(parts);
}

// ---------------------------------------------------------------------------
// coal-plant: dark boiler hall (~3x4 of its 4x4 footprint),
// 2 striped smokestacks (chimney language), low coal-heap wedge.
// ---------------------------------------------------------------------------

const COAL_HALL_INSET_TILES = 1; // hall width = footprint.w - this, in tiles ("3x4 of its 4x4")
const COAL_HALL_HEIGHT = 14;
const COAL_ROOF_CAP_HEIGHT = 1.0;
export const COAL_SMOKESTACK_COUNT = 2;
const COAL_STACK_HEIGHT = 26; // "~26m"
const COAL_STACK_RADIUS_BOTTOM = 1.8;
const COAL_STACK_RADIUS_TOP = 1.3;
const COAL_STACK_BAND_COUNT = 6;
const COAL_STACK_SEPARATION_FRACTION = 0.22; // of hallHalfD, from hall center to each stack
const COAL_HEAP_HEIGHT = 4.5;
const COAL_HEAP_RADIUS = 4.5;
const COAL_HEAP_Z_FRACTION = 0.3; // of hallHalfD

const COAL_HALL_RGB: RGB = [0.13, 0.13, 0.14];
const COAL_ROOF_CAP_RGB: RGB = [0.09, 0.09, 0.1];
/** Chimney language: alternating bands, off-white/bone vs. a muted warning red (same values as facade.ts's ACCENT_RED, duplicated locally). */
const COAL_STACK_LIGHT_RGB: RGB = [0.85, 0.83, 0.79];
const COAL_STACK_ACCENT_RGB: RGB = [0.72, 0.2, 0.18];
const COAL_HEAP_RGB: RGB = [0.12, 0.1, 0.09];

export interface CoalHallLayout {
  hallHalfW: number;
  hallHalfD: number;
  hallCenterX: number;
  heapCenterX: number;
  heapHalfW: number;
}

/**
 * Dark boiler hall covering ~3x4 of its 4x4 footprint: the
 * hall spans the full depth but only footprint.w - COAL_HALL_INSET_TILES
 * tiles of width, flush against the local -X edge, leaving a strip along +X
 * for the coal heap. Pure; deterministic per footprint (no buildingId
 * needed — nothing about this layout is meant to vary per instance).
 */
export function computeCoalHallLayout(footprint: FootprintSize): CoalHallLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const hallWidthTiles = Math.max(1, footprint.w - COAL_HALL_INSET_TILES);
  const hallHalfW = (hallWidthTiles * TILE_METERS) / 2;
  const hallCenterX = -halfW + hallHalfW;
  const heapHalfW = halfW - hallHalfW;
  // Algebra: heapCenterX = ((-halfW + 2*hallHalfW) + halfW) / 2 = hallHalfW.
  const heapCenterX = hallHalfW;
  return { hallHalfW, hallHalfD: halfD, hallCenterX, heapCenterX, heapHalfW };
}

/** 2 smokestacks centered over the hall in X, spread along Z. Pure; fixed (no per-instance variation is called for). */
export function computeCoalSmokestackLocalPlacements(footprint: FootprintSize): Vec2[] {
  const { hallCenterX, hallHalfD } = computeCoalHallLayout(footprint);
  const zOffset = hallHalfD * COAL_STACK_SEPARATION_FRACTION;
  return [
    { x: hallCenterX, z: -zOffset },
    { x: hallCenterX, z: zOffset },
  ];
}

/** The coal heap sits in the free strip beside the hall. Pure; fixed. */
export function computeCoalHeapLocalPlacement(footprint: FootprintSize): Vec2 {
  const { heapCenterX, hallHalfD } = computeCoalHallLayout(footprint);
  return { x: heapCenterX, z: hallHalfD * COAL_HEAP_Z_FRACTION };
}

/** Hall body + a darker roof-cap band ("bevel illusion" language), merged; local Y=0 is the GROUND plane. */
function buildCoalHallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { hallHalfW, hallHalfD, hallCenterX } = computeCoalHallLayout(footprint);
  const width = hallHalfW * 2;
  const depth = hallHalfD * 2;

  const body = new THREE.BoxGeometry(width, COAL_HALL_HEIGHT, depth);
  body.translate(hallCenterX, COAL_HALL_HEIGHT / 2, 0);
  paintVertexColor(body, hexFromRgb(COAL_HALL_RGB));

  const cap = new THREE.BoxGeometry(width * 1.02, COAL_ROOF_CAP_HEIGHT, depth * 1.02);
  cap.translate(hallCenterX, COAL_HALL_HEIGHT + COAL_ROOF_CAP_HEIGHT / 2, 0);
  paintVertexColor(cap, hexFromRgb(COAL_ROOF_CAP_RGB));

  return mergeParts([body, cap]);
}

/** One shared smokestack geometry (alternating striped bands, tapered), instanced at both stack positions; local Y=0 is the GROUND plane. */
function buildCoalSmokestackGeometry(): THREE.BufferGeometry {
  const segmentHeight = COAL_STACK_HEIGHT / COAL_STACK_BAND_COUNT;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < COAL_STACK_BAND_COUNT; i++) {
    const t0 = i / COAL_STACK_BAND_COUNT;
    const t1 = (i + 1) / COAL_STACK_BAND_COUNT;
    const rBottom = lerpNum(COAL_STACK_RADIUS_BOTTOM, COAL_STACK_RADIUS_TOP, t0);
    const rTop = lerpNum(COAL_STACK_RADIUS_BOTTOM, COAL_STACK_RADIUS_TOP, t1);
    const segment = new THREE.CylinderGeometry(rTop, rBottom, segmentHeight, 10);
    segment.translate(0, i * segmentHeight + segmentHeight / 2, 0);
    paintVertexColor(
      segment,
      hexFromRgb(i % 2 === 0 ? COAL_STACK_LIGHT_RGB : COAL_STACK_ACCENT_RGB),
    );
    parts.push(segment);
  }
  return mergeParts(parts);
}

/** A low heap silhouette (a squat, few-sided pyramid reads as "a pile" at RTS distance). */
function buildCoalHeapGeometry(): THREE.BufferGeometry {
  const heap = new THREE.ConeGeometry(COAL_HEAP_RADIUS, COAL_HEAP_HEIGHT, 5);
  heap.translate(0, COAL_HEAP_HEIGHT / 2, 0);
  paintVertexColor(heap, hexFromRgb(COAL_HEAP_RGB));
  return heap;
}

// ---------------------------------------------------------------------------
// small-park: flat lawn plate (lush green), a light
// path cross, 2-3 simple trees (self-contained), 2 benches.
// ---------------------------------------------------------------------------

const PARK_LAWN_HEIGHT = 0.15; // "~0.15m"
const PARK_PATH_WIDTH_FRACTION = 0.16; // of the tile's shorter side
const PARK_PATH_Y_OFFSET = 0.03;
const PARK_PATH_HEIGHT = PARK_LAWN_HEIGHT * 0.6;

const PARK_LAWN_RGB: RGB = [0.16, 0.42, 0.2]; // lush green
const PARK_PATH_RGB: RGB = [0.81, 0.78, 0.67];

export const PARK_TREE_MIN = 2; // "2-3 simple trees"
export const PARK_TREE_MAX = 3;
const PARK_TREE_HASH_MULT = 4096;
const PARK_TREE_HASH_SLOT_COUNT = 40;
const PARK_TREE_HASH_SLOT_BASE = 41; // + i*2 (x), +1 (z)
const PARK_TREE_MARGIN_FRACTION = 0.68; // keeps trees inside the tile

const PARK_TREE_TRUNK_HEIGHT = 1.6;
const PARK_TREE_TRUNK_RADIUS_TOP = 0.14;
const PARK_TREE_TRUNK_RADIUS_BOTTOM = 0.2;
const PARK_TREE_CANOPY_RADIUS = 1.1;
const PARK_TRUNK_RGB: RGB = [0.42, 0.29, 0.18];
const PARK_CANOPY_RGB: RGB = [0.18, 0.42, 0.23];

export const PARK_BENCH_COUNT = 2; // "2 benches"
const PARK_BENCH_OFFSET_FRACTION = 0.55; // of halfD, from center
const BENCH_SEAT: { w: number; d: number; h: number } = { w: 1.2, d: 0.45, h: 0.12 };
const BENCH_LEG_HEIGHT = 0.35;
const BENCH_BACK_HEIGHT = 0.5;
const BENCH_SEAT_RGB: RGB = [0.42, 0.29, 0.18];
const BENCH_LEG_RGB: RGB = [0.2, 0.2, 0.21];

/** Deterministic 2-3 from buildingId. Pure. */
export function computeParkTreeCount(buildingId: number): number {
  const seed = buildingId * PARK_TREE_HASH_MULT + PARK_TREE_HASH_SLOT_COUNT;
  return PARK_TREE_MIN + Math.floor(hash1(seed) * (PARK_TREE_MAX - PARK_TREE_MIN + 1));
}

/** computeParkTreeCount(id) scattered placements, deterministic per (buildingId, footprint). Pure. */
export function computeParkTreePlacements(buildingId: number, footprint: FootprintSize): Vec2[] {
  const count = computeParkTreeCount(buildingId);
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const placements: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const seedX = buildingId * PARK_TREE_HASH_MULT + PARK_TREE_HASH_SLOT_BASE + i * 2;
    const seedZ = seedX + 1;
    const fx = (hash1(seedX) * 2 - 1) * halfW * PARK_TREE_MARGIN_FRACTION;
    const fz = (hash1(seedZ) * 2 - 1) * halfD * PARK_TREE_MARGIN_FRACTION;
    placements.push({ x: fx, z: fz });
  }
  return placements;
}

export interface BenchPlacement extends Vec2 {
  rotation: 0 | 1 | 2 | 3;
}

/** Exactly PARK_BENCH_COUNT (2) benches along the path, facing each other. Pure; fixed (no per-instance variation is called for). */
export function computeParkBenchPlacements(footprint: FootprintSize): BenchPlacement[] {
  const { halfD } = footprintHalfExtents(footprint);
  const offset = halfD * PARK_BENCH_OFFSET_FRACTION;
  return [
    { x: 0, z: -offset, rotation: 0 },
    { x: 0, z: offset, rotation: 2 },
  ];
}

/** Lawn plate + a raised path cross, merged; local Y=0 is the GROUND plane. */
function buildParkGroundGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);

  const lawn = new THREE.BoxGeometry(halfW * 2, PARK_LAWN_HEIGHT, halfD * 2);
  lawn.translate(0, PARK_LAWN_HEIGHT / 2, 0);
  paintVertexColor(lawn, hexFromRgb(PARK_LAWN_RGB));

  const pathWidth = Math.min(halfW, halfD) * 2 * PARK_PATH_WIDTH_FRACTION;
  const pathY = PARK_LAWN_HEIGHT + PARK_PATH_Y_OFFSET;

  const pathX = new THREE.BoxGeometry(halfW * 2, PARK_PATH_HEIGHT, pathWidth);
  pathX.translate(0, pathY, 0);
  paintVertexColor(pathX, hexFromRgb(PARK_PATH_RGB));

  const pathZ = new THREE.BoxGeometry(pathWidth, PARK_PATH_HEIGHT, halfD * 2);
  pathZ.translate(0, pathY, 0);
  paintVertexColor(pathZ, hexFromRgb(PARK_PATH_RGB));

  return mergeParts([lawn, pathX, pathZ]);
}

/** Trunk + canopy, merged; self-contained (does NOT import trees.ts). Local Y=0 is the GROUND plane. */
function buildParkTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(
    PARK_TREE_TRUNK_RADIUS_TOP,
    PARK_TREE_TRUNK_RADIUS_BOTTOM,
    PARK_TREE_TRUNK_HEIGHT,
    6,
  );
  trunk.translate(0, PARK_TREE_TRUNK_HEIGHT / 2, 0);
  paintVertexColor(trunk, hexFromRgb(PARK_TRUNK_RGB));

  const canopy = new THREE.SphereGeometry(PARK_TREE_CANOPY_RADIUS, 7, 5);
  canopy.translate(0, PARK_TREE_TRUNK_HEIGHT + PARK_TREE_CANOPY_RADIUS * 0.7, 0);
  paintVertexColor(canopy, hexFromRgb(PARK_CANOPY_RGB));

  return mergeParts([trunk, canopy]);
}

/** Seat + backrest + 2 legs, merged; local Y=0 is the GROUND plane, faces local -Z. */
function buildParkBenchGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(BENCH_SEAT.w, BENCH_SEAT.h, BENCH_SEAT.d);
  seat.translate(0, BENCH_LEG_HEIGHT + BENCH_SEAT.h / 2, 0);
  paintVertexColor(seat, hexFromRgb(BENCH_SEAT_RGB));

  const back = new THREE.BoxGeometry(BENCH_SEAT.w, BENCH_BACK_HEIGHT, BENCH_SEAT.d * 0.2);
  back.translate(
    0,
    BENCH_LEG_HEIGHT + BENCH_SEAT.h + BENCH_BACK_HEIGHT / 2,
    -BENCH_SEAT.d / 2 + BENCH_SEAT.d * 0.1,
  );
  paintVertexColor(back, hexFromRgb(BENCH_SEAT_RGB));

  const legOffsetX = BENCH_SEAT.w / 2 - 0.1;
  const legs = [-1, 1].map((sx) => {
    const leg = new THREE.BoxGeometry(0.08, BENCH_LEG_HEIGHT, BENCH_SEAT.d * 0.8);
    leg.translate(sx * legOffsetX, BENCH_LEG_HEIGHT / 2, 0);
    paintVertexColor(leg, hexFromRgb(BENCH_LEG_RGB));
    return leg;
  });

  return mergeParts([seat, back, ...legs]);
}

// ---------------------------------------------------------------------------
// UtilityKitRenderer
// ---------------------------------------------------------------------------

interface KitDefinition {
  entry: BuildingCatalogEntry;
  pools: Partial<Record<UtilityKitPartKind, InstancedSlotPool>>;
}

interface InstanceRecord {
  catalogId: string;
  slots: Partial<Record<UtilityKitPartKind, number[]>>;
}

interface TurbineAnim {
  buildingId: number;
  rotorSlot: number;
  hubX: number;
  hubY: number;
  hubZ: number;
  rotation: 0 | 1 | 2 | 3;
}

const INITIAL_KIT_CAPACITY = 4;
const INITIAL_MULTI_PART_CAPACITY = 16;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _unitScale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);

export class UtilityKitRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly registryIds = new Set(UTILITY_KIT_CATALOG_IDS);
  private readonly kits = new Map<string, KitDefinition>();
  private readonly instances = new Map<number, InstanceRecord>();
  private readonly turbineAnims = new Map<number, TurbineAnim>();
  private readonly beaconMaterial = new THREE.MeshLambertMaterial({
    color: TURBINE_BEACON_COLOR,
    emissive: TURBINE_BEACON_COLOR,
    emissiveIntensity: 0,
  });

  private nightFactorValue = 0;
  private lastTMs = 0;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    for (const entry of catalog) {
      if (this.registryIds.has(entry.id)) this.kits.set(entry.id, this.buildKit(entry));
    }
  }

  /** Consumes one BuildingDelta: non-registry catalog ids are ignored entirely (BuildingInstancer still draws their plinth/box). */
  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.freeInstance(id);
    for (const building of delta.added) this.applyOne(building);
    for (const building of delta.updated) this.applyOne(building);

    for (const kit of this.kits.values()) {
      for (const pool of Object.values(kit.pools)) pool?.commit();
    }
  }

  /** 0 (day) .. 1 (night): only the turbine beacon reacts (kits stay unlit except a small red turbine nacelle beacon). */
  setNightFactor(nightFactor: number): void {
    this.nightFactorValue = Math.min(1, Math.max(0, nightFactor));
    this.beaconMaterial.emissiveIntensity = this.nightFactorValue;
  }

  /** Advances the wind-turbine rotor spin; call every frame with elapsed visual time in ms (never Date.now — the caller owns a deterministic clock, exactly like landmarks.ts/water.ts/clouds.ts). */
  update(tMs: number): void {
    this.lastTMs = tMs;
    const rotorPool = this.kits.get('wind-turbine')?.pools.turbineRotor;
    if (!rotorPool) return;
    for (const anim of this.turbineAnims.values()) this.writeRotorMatrix(rotorPool, anim);
    rotorPool.commit();
  }

  /** The set of catalog ids this renderer actually built kits for (registry ids present in the given catalog). */
  kitIds(): Set<string> {
    return new Set(this.kits.keys());
  }

  // --- introspection (tests + future picking/debug) --------------------------

  /** Whether a catalog id is acted on by this renderer at all (in its registry), regardless of what catalog was actually supplied. */
  isUtilityKitCatalogId(catalogId: string): boolean {
    return this.registryIds.has(catalogId);
  }

  hasInstance(buildingId: number): boolean {
    return this.instances.has(buildingId);
  }

  /** Slot indices of one kit-part kind currently owned by an instance (empty if it has none / is unknown). */
  partSlotsFor(buildingId: number, kind: UtilityKitPartKind): readonly number[] {
    return this.instances.get(buildingId)?.slots[kind] ?? [];
  }

  getPartMatrix(
    catalogId: string,
    kind: UtilityKitPartKind,
    slot: number,
    out: THREE.Matrix4,
  ): void {
    this.kits.get(catalogId)?.pools[kind]?.getMatrixAt(slot, out);
  }

  instanceCount(catalogId: string, kind: UtilityKitPartKind): number {
    return this.kits.get(catalogId)?.pools[kind]?.instanceCount() ?? 0;
  }

  /** The material's absolute emissive color as a hex, or null if that (catalogId, kind) has no pool — used to prove non-turbine kits carry no emissive color at all. */
  partEmissiveHex(catalogId: string, kind: UtilityKitPartKind): number | null {
    const pool = this.kits.get(catalogId)?.pools[kind];
    if (!pool) return null;
    const material = pool.getMesh().material as THREE.MeshLambertMaterial;
    return material.emissive ? material.emissive.getHex() : null;
  }

  nightFactor(): number {
    return this.nightFactorValue;
  }

  beaconIntensity(): number {
    return this.beaconMaterial.emissiveIntensity;
  }

  // --- internals ---------------------------------------------------------------

  private buildKit(entry: BuildingCatalogEntry): KitDefinition {
    switch (entry.id) {
      case 'wind-turbine':
        return this.buildTurbineKit(entry);
      case 'water-tower':
        return this.buildWaterTowerKit(entry);
      case 'coal-plant':
        return this.buildCoalPlantKit(entry);
      case 'small-park':
        return this.buildSmallParkKit(entry);
      default:
        // Unreachable: the constructor only calls buildKit() for ids already
        // filtered through this.registryIds, which is exactly this switch's
        // case list.
        throw new RangeError(`utilitykits: unknown registry id "${entry.id}"`);
    }
  }

  private buildTurbineKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        turbineTower: new InstancedSlotPool(
          this.scene,
          buildTurbineTowerGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        turbineRotor: new InstancedSlotPool(
          this.scene,
          buildTurbineRotorGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        turbineBeacon: new InstancedSlotPool(
          this.scene,
          new THREE.SphereGeometry(TURBINE_BEACON_RADIUS, 8, 6),
          this.beaconMaterial,
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildWaterTowerKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        waterLegs: new InstancedSlotPool(
          this.scene,
          buildWaterLegsGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        waterTank: new InstancedSlotPool(
          this.scene,
          buildWaterTankGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildCoalPlantKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        coalHall: new InstancedSlotPool(
          this.scene,
          buildCoalHallGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        coalSmokestack: new InstancedSlotPool(
          this.scene,
          buildCoalSmokestackGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY * COAL_SMOKESTACK_COUNT,
        ),
        coalHeap: new InstancedSlotPool(
          this.scene,
          buildCoalHeapGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildSmallParkKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        parkGround: new InstancedSlotPool(
          this.scene,
          buildParkGroundGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        parkTree: new InstancedSlotPool(
          this.scene,
          buildParkTreeGeometry(),
          lambert(),
          INITIAL_MULTI_PART_CAPACITY,
        ),
        parkBench: new InstancedSlotPool(
          this.scene,
          buildParkBenchGeometry(),
          lambert(),
          INITIAL_MULTI_PART_CAPACITY,
        ),
      },
    };
  }

  private placeAt(
    pool: InstancedSlotPool,
    x: number,
    y: number,
    z: number,
    rotation: 0 | 1 | 2 | 3,
  ): number {
    const slot = pool.allocate();
    _position.set(x, y, z);
    _quaternion.setFromAxisAngle(_yAxis, rotation * (Math.PI / 2));
    _matrix.compose(_position, _quaternion, _unitScale);
    pool.setMatrixAt(slot, _matrix);
    return slot;
  }

  private writeRotorMatrix(pool: InstancedSlotPool, anim: TurbineAnim): void {
    const angle = turbineRotorAngle(anim.buildingId, this.lastTMs);
    _position.set(anim.hubX, anim.hubY, anim.hubZ);
    _yawQuat.setFromAxisAngle(_yAxis, anim.rotation * (Math.PI / 2));
    _spinQuat.setFromAxisAngle(_zAxis, angle);
    _quaternion.multiplyQuaternions(_yawQuat, _spinQuat);
    _matrix.compose(_position, _quaternion, _unitScale);
    pool.setMatrixAt(anim.rotorSlot, _matrix);
  }

  private applyOne(building: BuildingInstance): void {
    if (!this.registryIds.has(building.catalogId)) return; // registry filter: every other catalog id is ignored
    this.freeInstance(building.id);

    const kit = this.kits.get(building.catalogId);
    if (!kit) return; // registry says kit-owned, but no matching catalog entry was provided — nothing to build

    const entry = kit.entry;
    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    const groundY = this.heightAt(centerX, centerZ);
    const rotation = building.rotation;

    switch (entry.id) {
      case 'wind-turbine':
        this.applyTurbine(kit, building, centerX, groundY, centerZ, rotation);
        return;
      case 'water-tower':
        this.applyWaterTower(kit, building, centerX, groundY, centerZ, rotation);
        return;
      case 'coal-plant':
        this.applyCoalPlant(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'small-park':
        this.applySmallPark(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      default:
        // Unreachable: kit is only non-null for entry.ids covered above (see buildKit's switch).
        throw new RangeError(`utilitykits: unknown registry id "${entry.id}"`);
    }
  }

  private applyTurbine(
    kit: KitDefinition,
    building: BuildingInstance,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const towerPool = kit.pools.turbineTower;
    const rotorPool = kit.pools.turbineRotor;
    const beaconPool = kit.pools.turbineBeacon;
    if (!towerPool || !rotorPool || !beaconPool) return;

    const towerSlot = this.placeAt(towerPool, centerX, groundY, centerZ, rotation);

    const hub = turbineHubLocal();
    const hubRotated = rotateLocalXZ(hub.x, hub.z, rotation);
    const rotorSlot = rotorPool.allocate();
    const anim: TurbineAnim = {
      buildingId: building.id,
      rotorSlot,
      hubX: centerX + hubRotated.x,
      hubY: groundY + hub.y,
      hubZ: centerZ + hubRotated.z,
      rotation,
    };
    this.turbineAnims.set(building.id, anim);
    this.writeRotorMatrix(rotorPool, anim);

    const beacon = turbineBeaconLocal();
    const beaconRotated = rotateLocalXZ(beacon.x, beacon.z, rotation);
    const beaconSlot = this.placeAt(
      beaconPool,
      centerX + beaconRotated.x,
      groundY + beacon.y,
      centerZ + beaconRotated.z,
      rotation,
    );

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: { turbineTower: [towerSlot], turbineRotor: [rotorSlot], turbineBeacon: [beaconSlot] },
    });
  }

  private applyWaterTower(
    kit: KitDefinition,
    building: BuildingInstance,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const legsPool = kit.pools.waterLegs;
    const tankPool = kit.pools.waterTank;
    if (!legsPool || !tankPool) return;

    const legsSlot = this.placeAt(legsPool, centerX, groundY, centerZ, rotation);
    const tankSlot = this.placeAt(tankPool, centerX, groundY, centerZ, rotation);

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: { waterLegs: [legsSlot], waterTank: [tankSlot] },
    });
  }

  private applyCoalPlant(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const hallPool = kit.pools.coalHall;
    const stackPool = kit.pools.coalSmokestack;
    const heapPool = kit.pools.coalHeap;
    if (!hallPool || !stackPool || !heapPool) return;

    const hallSlot = this.placeAt(hallPool, centerX, groundY, centerZ, rotation);

    const stackSlots = computeCoalSmokestackLocalPlacements(entry.footprint).map((local) => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(stackPool, centerX + rotated.x, groundY, centerZ + rotated.z, rotation);
    });

    const heapLocal = computeCoalHeapLocalPlacement(entry.footprint);
    const heapRotated = rotateLocalXZ(heapLocal.x, heapLocal.z, rotation);
    const heapSlot = this.placeAt(
      heapPool,
      centerX + heapRotated.x,
      groundY,
      centerZ + heapRotated.z,
      rotation,
    );

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: { coalHall: [hallSlot], coalSmokestack: stackSlots, coalHeap: [heapSlot] },
    });
  }

  private applySmallPark(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const groundPool = kit.pools.parkGround;
    const treePool = kit.pools.parkTree;
    const benchPool = kit.pools.parkBench;
    if (!groundPool || !treePool || !benchPool) return;

    const groundSlot = this.placeAt(groundPool, centerX, groundY, centerZ, rotation);

    const treeSlots = computeParkTreePlacements(building.id, entry.footprint).map((local) => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(treePool, centerX + rotated.x, groundY, centerZ + rotated.z, rotation);
    });

    const benchSlots = computeParkBenchPlacements(entry.footprint).map((local) => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      const benchRotation = ((rotation + local.rotation) % 4) as 0 | 1 | 2 | 3;
      return this.placeAt(
        benchPool,
        centerX + rotated.x,
        groundY,
        centerZ + rotated.z,
        benchRotation,
      );
    });

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: { parkGround: [groundSlot], parkTree: treeSlots, parkBench: benchSlots },
    });
  }

  private freeInstance(buildingId: number): void {
    const record = this.instances.get(buildingId);
    if (record) {
      const kit = this.kits.get(record.catalogId);
      if (kit) {
        for (const kindKey of Object.keys(record.slots) as UtilityKitPartKind[]) {
          const pool = kit.pools[kindKey];
          const slots = record.slots[kindKey];
          if (pool && slots) for (const slot of slots) pool.free(slot);
        }
      }
      this.instances.delete(buildingId);
    }
    this.turbineAnims.delete(buildingId);
  }
}
