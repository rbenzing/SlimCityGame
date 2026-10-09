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
 * The kits:
 *  - wind-turbine: tapered mast + nacelle ("turbineTower"), a separate
 *    "turbineRotor" InstancedMesh whose per-instance rotation advances every
 *    update(tMs) (slow spin, phase offset hashed from the building id so
 *    turbines don't sync), and a small "turbineBeacon" that only glows at
 *    night (setNightFactor) — the ONE kit part in this whole file that reacts
 *    to night at all — kits stay unlit except a small red turbine
 *    nacelle beacon at night.
 *  - water-tower: braced legs, balcony and riser ("waterSteel") + a white
 *    ellipsoid-ended tank ("waterTank").
 *  - coal-plant: a dark boiler hall ("coalHall") covering ~3x4 of its 4x4
 *    footprint, 2 striped smokestacks ("coalSmokestack", chimney
 *    language), and a low coal-heap wedge ("coalHeap") in the strip beside
 *    the hall.
 *  - incinerator: a low concrete processing hall ("incineratorHall")
 *    covering ~3x4 of its 4x4 footprint, ONE thick tall flue
 *    ("incineratorStack" — single/unstriped, unlike the coal plant's 2
 *    striped stacks), and a low tipping-bay box ("incineratorBay") in the
 *    strip beside the hall.
 *  - recycling-depot: a paved yard slab over the whole lot ("recyclingYard"),
 *    a maintenance shed with two tall bay doors
 *    ("recyclingShed"), a small office block ("recyclingOffice"), and a row of
 *    four parked side-loaders ("recyclingTruck", the service fleet's recycling
 *    body at its real size) in the yard, all facing local +Z — the street side
 *    once the player turns the lot to face the road.
 *  - materials-recovery-facility: the same yard slab ("mrfYard"), a long
 *    clear-span sorting hall with three tipping-floor bay doors on the street
 *    side ("mrfHall"), a bale yard of stacked cubes ("mrfBales", one merged
 *    geometry), an office at the street corner ("mrfOffice") and four parked
 *    recycling trucks on the apron ("mrfTruck").
 *  - transfer-station: the same yard slab ("transferYard"), an enclosed
 *    tipping hall under a low-pitched roof with three roll-up doors on the
 *    street side and a sunken load-out bay along its flank ("transferHall"),
 *    a scale house beside the weighbridge at the entry ("transferScale"), two
 *    tractor-and-trailer transfer rigs, one sunk in the bay and one waiting
 *    ("transferRig"), and two refuse packers on the apron ("transferPacker").
 *  The paving kits stand on the highest ground under their lot (pavesLot),
 *  so the instancer's plinth never shows through their yard on a slope.
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
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  VehicleKind,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { maxHeightOverRect } from './footprint';
import { InstancedSlotPool } from './massing';
import { buildServiceVehicleGeometry, type ServiceVehicleKind } from './servicevehicles';
import { sizeForKind } from './vehicles';

// ---------------------------------------------------------------------------
// Registry: acts ONLY on catalog ids in its registry —
// mirrors landmarks.ts's LANDMARK_CATALOG_IDS convention exactly.
// ---------------------------------------------------------------------------

export const UTILITY_KIT_CATALOG_IDS: readonly string[] = [
  'wind-turbine',
  'water-tower',
  'water-pump',
  'water-drain',
  'sewage-works',
  'coal-plant',
  'incinerator',
  'recycling-depot',
  'materials-recovery-facility',
  'transfer-station',
  'small-park',
];

export type UtilityKitPartKind =
  | 'turbineTower'
  | 'turbineRotor'
  | 'turbineBeacon'
  | 'waterSteel'
  | 'waterTank'
  | 'pumpHouse'
  | 'pumpIntake'
  | 'drainHeadwall'
  | 'drainOutfall'
  | 'worksBody'
  | 'worksOutfall'
  | 'coalHall'
  | 'coalSmokestack'
  | 'coalHeap'
  | 'incineratorHall'
  | 'incineratorStack'
  | 'incineratorBay'
  | 'recyclingYard'
  | 'recyclingShed'
  | 'recyclingOffice'
  | 'recyclingTruck'
  | 'mrfYard'
  | 'mrfHall'
  | 'mrfBales'
  | 'mrfOffice'
  | 'mrfTruck'
  | 'transferYard'
  | 'transferHall'
  | 'transferScale'
  | 'transferRig'
  | 'transferPacker'
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

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A straight round rod from `a` to `b`, local Y=0 at world ground — the water
 * tower's legs, struts and tie rods. Built as a vertical cylinder, then
 * rotated from +Y onto the a->b direction and translated into place.
 */
function buildRodGeometry(a: Vec3, b: Vec3, radius: number, sides: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(a.x, a.y, a.z);
  const to = new THREE.Vector3(b.x, b.y, b.z);
  const delta = new THREE.Vector3().subVectors(to, from);
  const length = delta.length();

  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides);
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

/**
 * A real distributed-wind machine, the class a town or a works puts up for
 * itself rather than a wind farm's: the EWT DW61, 1 MW on a 61 m rotor at a
 * 69 m hub. The tallest building in the catalog stands 32 m; a turbine still
 * stands over a town, as a real one does, but its blades sweep a tile and a
 * half either side rather than three. The nacelle and the tower base are
 * read off the machine's proportions, not a published drawing.
 */
export const TURBINE_HUB_HEIGHT = 69;
export const TURBINE_ROTOR_DIAMETER = 61;
const TURBINE_NACELLE_SIZE = { w: 3, h: 3, d: 7 };
export const TURBINE_MAST_HEIGHT = TURBINE_HUB_HEIGHT - TURBINE_NACELLE_SIZE.h / 2;
const TURBINE_MAST_RADIUS_BOTTOM = 1.65; // a 3.3 m base
const TURBINE_MAST_RADIUS_TOP = 1.1;
const TURBINE_NACELLE_Z_OFFSET = -1.5; // nacelle center sits ahead of the mast centerline
const TURBINE_ROTOR_FORWARD_GAP = 0.8; // hub sits this far past the nacelle's own front face
const TURBINE_HUB_RADIUS = 1.2;
export const TURBINE_BLADE_COUNT = 3; // "3-blade rotor"
/** Root to tip, so that the tip sweeps the rotor's radius from the hub's centre. */
const TURBINE_BLADE_LENGTH = TURBINE_ROTOR_DIAMETER / 2 - TURBINE_HUB_RADIUS * 0.6;
const TURBINE_BLADE_ROOT_WIDTH = 2.2;
const TURBINE_BLADE_TIP_WIDTH = 0.5;
const TURBINE_BLADE_THICKNESS = 0.9;
const TURBINE_BEACON_RADIUS = 0.5;

/** Pale bone white — same values as facade.ts's ROOF_PALETTE off-white/bone entry, duplicated locally per this subsystem's convention. */
const TURBINE_BODY_RGB: RGB = [0.93, 0.91, 0.87];
const TURBINE_ROTOR_RGB: RGB = [0.85, 0.83, 0.79];
const TURBINE_BEACON_COLOR = 0xff2a2a;

/** About 6 rpm, the slow end of a 3 MW-class rotor's 6–16 rpm; a 134 m rotor any faster reads as frantic from the air. */
export const TURBINE_ROTOR_ANGULAR_SPEED = 0.65;
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
// water-tower: a multi-leg elevated tank — ellipsoidal bottom, cylindrical
// shell, ellipsoidal roof with a vent — on a balcony ring, four braced legs
// and a central wet riser. Sizes are absolute metres on a one-tile footprint.
// ---------------------------------------------------------------------------

export const WATER_LEG_COUNT = 4;
export const WATER_PANEL_COUNT = 3;
export const WATER_TANK_RADIUS = 4.55;
export const WATER_TANK_BOTTOM_Y = 27;
export const WATER_TANK_BOTTOM_DEPTH = 2.3;
export const WATER_TANK_SHELL_HEIGHT = 4.25;
export const WATER_TANK_ROOF_HEIGHT = 2.3;
export const WATER_BALCONY_Y = WATER_TANK_BOTTOM_Y + WATER_TANK_BOTTOM_DEPTH;
export const WATER_SHELL_TOP_Y = WATER_BALCONY_Y + WATER_TANK_SHELL_HEIGHT;
export const WATER_CROWN_Y = WATER_SHELL_TOP_Y + WATER_TANK_ROOF_HEIGHT;
export const WATER_BALCONY_OUTER_RADIUS = 5.55;
export const WATER_LEG_TOP_RADIUS = 4.6;
export const WATER_LEG_BASE_RADIUS = 6;
const WATER_BALCONY_THICKNESS = 0.15;
const WATER_HANDRAIL_HEIGHT = 1.07;
const WATER_HANDRAIL_RADIUS = WATER_BALCONY_OUTER_RADIUS - 0.1;
const WATER_HANDRAIL_POSTS = 12;
const WATER_VENT_RADIUS = 0.4;
const WATER_VENT_HEIGHT = 0.3;
const WATER_LEG_RADIUS = 0.3;
const WATER_STRUT_RADIUS = 0.15;
const WATER_TIE_ROD_RADIUS = 0.05;
const WATER_RISER_RADIUS = 0.6;
export const WATER_TANK_SEGMENTS = 32;

const WATER_STEEL_RGB: RGB = [0.62, 0.64, 0.67];
const WATER_TANK_RGB: RGB = [0.94, 0.94, 0.92];

export interface LegPlacement {
  base: Vec2;
  top: Vec2;
}

/** 4 legs at 45 degrees + k * 90, battered: wide at the ground, drawn in to the balcony ring. Pure; fixed. */
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

/** A point on leg `leg` at height y, on the straight line from its base to its top. */
function legPointAt(leg: LegPlacement, y: number): Vec3 {
  const t = y / WATER_BALCONY_Y;
  return {
    x: lerpNum(leg.base.x, leg.top.x, t),
    y,
    z: lerpNum(leg.base.z, leg.top.z, t),
  };
}

/**
 * The silver-grey steel, merged; local Y=0 is the GROUND plane: the balcony
 * and its handrail, the legs, a ring of struts and four faces of crossed tie
 * rods in each panel, and the wet riser.
 */
function buildWaterSteelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Balcony floor: a closed rectangular profile lathed into a ring.
  const rim = [
    new THREE.Vector2(WATER_TANK_RADIUS, WATER_BALCONY_Y - WATER_BALCONY_THICKNESS),
    new THREE.Vector2(WATER_BALCONY_OUTER_RADIUS, WATER_BALCONY_Y - WATER_BALCONY_THICKNESS),
    new THREE.Vector2(WATER_BALCONY_OUTER_RADIUS, WATER_BALCONY_Y),
    new THREE.Vector2(WATER_TANK_RADIUS, WATER_BALCONY_Y),
    new THREE.Vector2(WATER_TANK_RADIUS, WATER_BALCONY_Y - WATER_BALCONY_THICKNESS),
  ];
  parts.push(new THREE.LatheGeometry(rim, WATER_TANK_SEGMENTS));

  // Handrail: a top rail ring held up by evenly spaced posts.
  const rail = new THREE.TorusGeometry(WATER_HANDRAIL_RADIUS, 0.06, 5, WATER_TANK_SEGMENTS);
  rail.rotateX(Math.PI / 2);
  rail.translate(0, WATER_BALCONY_Y + WATER_HANDRAIL_HEIGHT, 0);
  parts.push(rail);
  for (let i = 0; i < WATER_HANDRAIL_POSTS; i++) {
    const angle = (i / WATER_HANDRAIL_POSTS) * Math.PI * 2;
    const x = Math.cos(angle) * WATER_HANDRAIL_RADIUS;
    const z = Math.sin(angle) * WATER_HANDRAIL_RADIUS;
    parts.push(
      buildRodGeometry(
        { x, y: WATER_BALCONY_Y, z },
        { x, y: WATER_BALCONY_Y + WATER_HANDRAIL_HEIGHT, z },
        0.04,
        4,
      ),
    );
  }

  // Legs, then the bracing: at every panel boundary a strut joins each pair of
  // neighbouring legs, and each panel face carries a crossed pair of tie rods.
  const legs = computeWaterLegPlacements();
  for (const leg of legs) {
    parts.push(
      buildRodGeometry(
        { x: leg.base.x, y: 0, z: leg.base.z },
        { x: leg.top.x, y: WATER_BALCONY_Y, z: leg.top.z },
        WATER_LEG_RADIUS,
        6,
      ),
    );
  }
  const panelHeight = WATER_BALCONY_Y / WATER_PANEL_COUNT;
  for (let panel = 0; panel < WATER_PANEL_COUNT; panel++) {
    const lowY = panel * panelHeight;
    const highY = (panel + 1) * panelHeight;
    for (let i = 0; i < legs.length; i++) {
      const a = legs[i]!;
      const b = legs[(i + 1) % legs.length]!;
      if (panel > 0) {
        parts.push(
          buildRodGeometry(legPointAt(a, lowY), legPointAt(b, lowY), WATER_STRUT_RADIUS, 4),
        );
      }
      parts.push(
        buildRodGeometry(legPointAt(a, lowY), legPointAt(b, highY), WATER_TIE_ROD_RADIUS, 4),
        buildRodGeometry(legPointAt(b, lowY), legPointAt(a, highY), WATER_TIE_ROD_RADIUS, 4),
      );
    }
  }

  // The wet riser: ground to the tank's lowest point.
  parts.push(
    buildRodGeometry(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: WATER_TANK_BOTTOM_Y, z: 0 },
      WATER_RISER_RADIUS,
      10,
    ),
  );

  for (const part of parts) paintVertexColor(part, hexFromRgb(WATER_STEEL_RGB));
  return mergeParts(parts);
}

/** White tank, merged; local Y=0 is the GROUND plane: ellipsoidal bottom, cylindrical shell, ellipsoidal roof and the vent at its crown. */
function buildWaterTankGeometry(): THREE.BufferGeometry {
  const half = Math.PI / 2;

  // Sphere halves scaled to ellipsoids: thetaStart = PI/2 sweeps equator to
  // south pole (the bottom), thetaLength = PI/2 from the pole to the equator
  // (the roof).
  const bottom = new THREE.SphereGeometry(1, WATER_TANK_SEGMENTS, 8, 0, Math.PI * 2, half, half);
  bottom.scale(WATER_TANK_RADIUS, WATER_TANK_BOTTOM_DEPTH, WATER_TANK_RADIUS);
  bottom.translate(0, WATER_BALCONY_Y, 0);

  const shell = new THREE.CylinderGeometry(
    WATER_TANK_RADIUS,
    WATER_TANK_RADIUS,
    WATER_TANK_SHELL_HEIGHT,
    WATER_TANK_SEGMENTS,
    1,
    true,
  );
  shell.translate(0, WATER_BALCONY_Y + WATER_TANK_SHELL_HEIGHT / 2, 0);

  const roof = new THREE.SphereGeometry(1, WATER_TANK_SEGMENTS, 8, 0, Math.PI * 2, 0, half);
  roof.scale(WATER_TANK_RADIUS, WATER_TANK_ROOF_HEIGHT, WATER_TANK_RADIUS);
  roof.translate(0, WATER_SHELL_TOP_Y, 0);

  const vent = new THREE.CylinderGeometry(
    WATER_VENT_RADIUS,
    WATER_VENT_RADIUS,
    WATER_VENT_HEIGHT,
    8,
  );
  vent.translate(0, WATER_CROWN_Y - 0.1 + WATER_VENT_HEIGHT / 2, 0);

  const parts = [bottom, shell, roof, vent];
  for (const part of parts) paintVertexColor(part, hexFromRgb(WATER_TANK_RGB));
  return mergeParts(parts);
}

/** The two merged parts of the water tower, local Y=0 at the ground. Exposed so the drawn shapes can be measured. */
export function buildWaterTowerGeometry(): {
  steel: THREE.BufferGeometry;
  tank: THREE.BufferGeometry;
} {
  return { steel: buildWaterSteelGeometry(), tank: buildWaterTankGeometry() };
}

// ---------------------------------------------------------------------------
// water-pump and water-drain: the two buildings that stand on a shore. Each
// kit is built in a local frame whose +Z points at the water, and the
// instance is turned so that +Z faces the water tile its footprint touches.
// ---------------------------------------------------------------------------

/** A pump house with a plant room on its roof, and the intake pipe running out of its water-facing wall. */
const PUMP_HOUSE_SIZE = { w: 18, h: 7, d: 12 };
const PUMP_PLANT_ROOM_SIZE = { w: 7, h: 2.2, d: 6 };
export const PUMP_INTAKE_RADIUS = 0.9;
/** The intake runs from the house wall to this far past the footprint's water-side edge. */
export const PUMP_INTAKE_OVERHANG = 6;
/** A drain's headwall at the water's edge, and the outfall pipe through it. */
const DRAIN_HEADWALL_SIZE = { w: 6, h: 2.4, d: 1.6 };
export const DRAIN_OUTFALL_RADIUS = 0.8;
export const DRAIN_OUTFALL_OVERHANG = 4;
const DRAIN_OUTFALL_BACK = 3;
/** A works' two round clarifiers, side by side on the land side, and its control house by the outfall. */
export const WORKS_CLARIFIER_RADIUS = 6;
const WORKS_CLARIFIER_HEIGHT = 3;
const WORKS_CLARIFIER_SPACING = 18;
const WORKS_CLARIFIER_SETBACK = -7;
const WORKS_HOUSE_SIZE = { w: 10, h: 5, d: 7 };
const WORKS_HOUSE_OFFSET = { x: 11, z: 9 };

const PUMP_HOUSE_RGB: RGB = [0.78, 0.78, 0.76];
const CLARIFIER_RGB: RGB = [0.7, 0.71, 0.7];
const CLARIFIER_WATER_RGB: RGB = [0.3, 0.42, 0.45];
const PUMP_PLANT_ROOM_RGB: RGB = [0.5, 0.52, 0.55];
const PIPE_STEEL_RGB: RGB = [0.33, 0.36, 0.4];
const HEADWALL_RGB: RGB = [0.6, 0.6, 0.58];

/**
 * Which way a shore building faces: the rotation (as rotateLocalXZ counts it,
 * so local +Z lands on the water) toward the first water tile orthogonally
 * beside the footprint, south first; 0 when none is beside it. Pure.
 */
export function waterSideOf(
  x: number,
  z: number,
  footprint: FootprintSize,
  waterAt: (tx: number, tz: number) => boolean,
): 0 | 1 | 2 | 3 {
  const { w, d } = footprint;
  for (let dx = 0; dx < w; dx++) if (waterAt(x + dx, z + d)) return 0; // south: +Z
  for (let dz = 0; dz < d; dz++) if (waterAt(x + w, z + dz)) return 1; // east: +X
  for (let dx = 0; dx < w; dx++) if (waterAt(x + dx, z - 1)) return 2; // north: -Z
  for (let dz = 0; dz < d; dz++) if (waterAt(x - 1, z + dz)) return 3; // west: -X
  return 0;
}

/** A horizontal pipe along local +Z from z0 to z1, resting at `y`. */
function buildPipeAlongZ(radius: number, z0: number, z1: number, y: number): THREE.BufferGeometry {
  const length = z1 - z0;
  const pipe = new THREE.CylinderGeometry(radius, radius, length, 10);
  pipe.rotateX(Math.PI / 2);
  pipe.translate(0, y, z0 + length / 2);
  paintVertexColor(pipe, hexFromRgb(PIPE_STEEL_RGB));
  return pipe;
}

function buildPumpHouseGeometry(): THREE.BufferGeometry {
  const { w, h, d } = PUMP_HOUSE_SIZE;
  const house = new THREE.BoxGeometry(w, h, d);
  house.translate(0, h / 2, 0);
  paintVertexColor(house, hexFromRgb(PUMP_HOUSE_RGB));
  const room = new THREE.BoxGeometry(
    PUMP_PLANT_ROOM_SIZE.w,
    PUMP_PLANT_ROOM_SIZE.h,
    PUMP_PLANT_ROOM_SIZE.d,
  );
  room.translate(-w / 4, h + PUMP_PLANT_ROOM_SIZE.h / 2, 0);
  paintVertexColor(room, hexFromRgb(PUMP_PLANT_ROOM_RGB));
  return mergeParts([house, room]);
}

/** The intake: from the house's water-facing wall to the overhang past the footprint's edge. */
function buildPumpIntakeGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfD } = footprintHalfExtents(footprint);
  return buildPipeAlongZ(
    PUMP_INTAKE_RADIUS,
    PUMP_HOUSE_SIZE.d / 2,
    halfD + PUMP_INTAKE_OVERHANG,
    PUMP_INTAKE_RADIUS,
  );
}

function buildDrainHeadwallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfD } = footprintHalfExtents(footprint);
  const { w, h, d } = DRAIN_HEADWALL_SIZE;
  const wall = new THREE.BoxGeometry(w, h, d);
  wall.translate(0, h / 2, halfD - d / 2);
  paintVertexColor(wall, hexFromRgb(HEADWALL_RGB));
  return wall;
}

/** The outfall: through the headwall and out over the water. */
function buildDrainOutfallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfD } = footprintHalfExtents(footprint);
  return buildPipeAlongZ(
    DRAIN_OUTFALL_RADIUS,
    halfD - DRAIN_OUTFALL_BACK,
    halfD + DRAIN_OUTFALL_OVERHANG,
    DRAIN_OUTFALL_RADIUS,
  );
}

/**
 * The works: two round clarifier tanks side by side toward the land, each a
 * concrete ring with a disc of settled water inside, and a control house by
 * the water, in the pumping station's pale concrete.
 */
function buildWorksBodyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const x = (sx * WORKS_CLARIFIER_SPACING) / 2;
    const ring = new THREE.CylinderGeometry(
      WORKS_CLARIFIER_RADIUS,
      WORKS_CLARIFIER_RADIUS,
      WORKS_CLARIFIER_HEIGHT,
      20,
    );
    ring.translate(x, WORKS_CLARIFIER_HEIGHT / 2, WORKS_CLARIFIER_SETBACK);
    paintVertexColor(ring, hexFromRgb(CLARIFIER_RGB));
    parts.push(ring);
    const pool = new THREE.CylinderGeometry(
      WORKS_CLARIFIER_RADIUS - 0.6,
      WORKS_CLARIFIER_RADIUS - 0.6,
      0.2,
      20,
    );
    pool.translate(x, WORKS_CLARIFIER_HEIGHT + 0.1, WORKS_CLARIFIER_SETBACK);
    paintVertexColor(pool, hexFromRgb(CLARIFIER_WATER_RGB));
    parts.push(pool);
  }
  const { w, h, d } = WORKS_HOUSE_SIZE;
  const house = new THREE.BoxGeometry(w, h, d);
  house.translate(WORKS_HOUSE_OFFSET.x, h / 2, WORKS_HOUSE_OFFSET.z);
  paintVertexColor(house, hexFromRgb(PUMP_HOUSE_RGB));
  parts.push(house);
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
// incinerator: low concrete processing hall (~3x4 of its 4x4 footprint),
// ONE thick tall flue (single/unstriped, unlike the coal plant's 2 striped
// stacks), a low tipping-bay box in the strip beside the hall.
// ---------------------------------------------------------------------------

const INCINERATOR_HALL_INSET_TILES = 1; // hall width = footprint.w - this, in tiles ("3x4 of its 4x4")
const INCINERATOR_HALL_HEIGHT = 11; // lower & boxier than the coal hall
const INCINERATOR_ROOF_CAP_HEIGHT = 1.0;
const INCINERATOR_STACK_HEIGHT = 30; // taller than the coal stacks
const INCINERATOR_STACK_RADIUS_BOTTOM = 2.9; // one thick flue vs. the coal plant's thinner pair
const INCINERATOR_STACK_RADIUS_TOP = 2.4;
const INCINERATOR_STACK_RIM_HEIGHT = 1.6;
const INCINERATOR_STACK_RIM_RADIUS_BONUS = 0.25;
const INCINERATOR_STACK_Z_FRACTION = -0.25; // of hallHalfD, from hall center
const INCINERATOR_BAY_WIDTH = 6;
const INCINERATOR_BAY_HEIGHT = 6;
const INCINERATOR_BAY_DEPTH = 10;
const INCINERATOR_BAY_CAP_HEIGHT = 0.8;
const INCINERATOR_BAY_Z_FRACTION = 0.15; // of hallHalfD

const INCINERATOR_HALL_RGB: RGB = [0.42, 0.435, 0.447]; // industrial concrete grey (catalog 0x6b6f72)
const INCINERATOR_ROOF_CAP_RGB: RGB = [0.3, 0.31, 0.32];
const INCINERATOR_STACK_RGB: RGB = [0.52, 0.53, 0.55];
const INCINERATOR_STACK_RIM_RGB: RGB = [0.32, 0.33, 0.34];
const INCINERATOR_BAY_RGB: RGB = [0.5, 0.515, 0.525];
const INCINERATOR_BAY_CAP_RGB: RGB = [0.33, 0.34, 0.35];

export interface IncineratorHallLayout {
  hallHalfW: number;
  hallHalfD: number;
  hallCenterX: number;
  bayCenterX: number;
  bayHalfW: number;
}

/**
 * Low concrete processing hall covering ~3x4 of its 4x4 footprint: the hall
 * spans the full depth but only footprint.w - INCINERATOR_HALL_INSET_TILES
 * tiles of width, flush against the local -X edge, leaving a strip along +X
 * for the tipping bay. Pure; deterministic per footprint.
 */
export function computeIncineratorHallLayout(footprint: FootprintSize): IncineratorHallLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const hallWidthTiles = Math.max(1, footprint.w - INCINERATOR_HALL_INSET_TILES);
  const hallHalfW = (hallWidthTiles * TILE_METERS) / 2;
  const hallCenterX = -halfW + hallHalfW;
  const bayHalfW = halfW - hallHalfW;
  // Algebra (see computeCoalHallLayout): bayCenterX = hallHalfW.
  const bayCenterX = hallHalfW;
  return { hallHalfW, hallHalfD: halfD, hallCenterX, bayCenterX, bayHalfW };
}

/** The single flue rises over the hall roof, offset toward the -Z end. Pure; fixed (no per-instance variation is called for). */
export function computeIncineratorStackLocalPlacement(footprint: FootprintSize): Vec2 {
  const { hallCenterX, hallHalfD } = computeIncineratorHallLayout(footprint);
  return { x: hallCenterX, z: hallHalfD * INCINERATOR_STACK_Z_FRACTION };
}

/** The tipping bay sits in the free strip beside the hall. Pure; fixed. */
export function computeIncineratorBayLocalPlacement(footprint: FootprintSize): Vec2 {
  const { bayCenterX, hallHalfD } = computeIncineratorHallLayout(footprint);
  return { x: bayCenterX, z: hallHalfD * INCINERATOR_BAY_Z_FRACTION };
}

/** Hall body + a darker roof-cap band, merged; local Y=0 is the GROUND plane. */
function buildIncineratorHallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { hallHalfW, hallHalfD, hallCenterX } = computeIncineratorHallLayout(footprint);
  const width = hallHalfW * 2;
  const depth = hallHalfD * 2;

  const body = new THREE.BoxGeometry(width, INCINERATOR_HALL_HEIGHT, depth);
  body.translate(hallCenterX, INCINERATOR_HALL_HEIGHT / 2, 0);
  paintVertexColor(body, hexFromRgb(INCINERATOR_HALL_RGB));

  const cap = new THREE.BoxGeometry(width * 1.02, INCINERATOR_ROOF_CAP_HEIGHT, depth * 1.02);
  cap.translate(hallCenterX, INCINERATOR_HALL_HEIGHT + INCINERATOR_ROOF_CAP_HEIGHT / 2, 0);
  paintVertexColor(cap, hexFromRgb(INCINERATOR_ROOF_CAP_RGB));

  return mergeParts([body, cap]);
}

/** One thick tapered flue + a dark rim at the mouth, merged; local Y=0 is the GROUND plane. */
function buildIncineratorStackGeometry(): THREE.BufferGeometry {
  const flue = new THREE.CylinderGeometry(
    INCINERATOR_STACK_RADIUS_TOP,
    INCINERATOR_STACK_RADIUS_BOTTOM,
    INCINERATOR_STACK_HEIGHT,
    12,
  );
  flue.translate(0, INCINERATOR_STACK_HEIGHT / 2, 0);
  paintVertexColor(flue, hexFromRgb(INCINERATOR_STACK_RGB));

  const rimRadius = INCINERATOR_STACK_RADIUS_TOP + INCINERATOR_STACK_RIM_RADIUS_BONUS;
  const rim = new THREE.CylinderGeometry(rimRadius, rimRadius, INCINERATOR_STACK_RIM_HEIGHT, 12);
  rim.translate(0, INCINERATOR_STACK_HEIGHT - INCINERATOR_STACK_RIM_HEIGHT / 2, 0);
  paintVertexColor(rim, hexFromRgb(INCINERATOR_STACK_RIM_RGB));

  return mergeParts([flue, rim]);
}

/** Low tipping-bay box + a flat overhanging roof cap, merged; local Y=0 is the GROUND plane. */
function buildIncineratorBayGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(
    INCINERATOR_BAY_WIDTH,
    INCINERATOR_BAY_HEIGHT,
    INCINERATOR_BAY_DEPTH,
  );
  body.translate(0, INCINERATOR_BAY_HEIGHT / 2, 0);
  paintVertexColor(body, hexFromRgb(INCINERATOR_BAY_RGB));

  const cap = new THREE.BoxGeometry(
    INCINERATOR_BAY_WIDTH * 1.08,
    INCINERATOR_BAY_CAP_HEIGHT,
    INCINERATOR_BAY_DEPTH * 1.08,
  );
  cap.translate(0, INCINERATOR_BAY_HEIGHT + INCINERATOR_BAY_CAP_HEIGHT / 2, 0);
  paintVertexColor(cap, hexFromRgb(INCINERATOR_BAY_CAP_RGB));

  return mergeParts([body, cap]);
}

// ---------------------------------------------------------------------------
// recycling-depot: a maintenance shed + office on the back of a paved yard,
// four side-loaders parked in a row in front of the bay doors. Local +Z is the
// street side; the ground plinth under the whole lot is the yard's pavement.
// ---------------------------------------------------------------------------

export const RECYCLING_TRUCK_COUNT = 4;
export const RECYCLING_SHED_SIZE = { w: 30, d: 20, h: 8 };
export const RECYCLING_OFFICE_SIZE = { w: 6, d: 10, h: 3.8 };
const RECYCLING_EDGE_MARGIN = 3;
const RECYCLING_ROOF_CAP_HEIGHT = 0.5;
const RECYCLING_DOOR_SIZE = { w: 5, h: 5.5 };
const RECYCLING_DOOR_THICKNESS = 0.3;
const RECYCLING_DOOR_COUNT = 2;
const RECYCLING_TRUCK_SPACING = 6.5;
/** Clear yard between the bay doors and the row of parked trucks, so a truck can pull in. */
const RECYCLING_DOOR_APRON = 6;

/** The paved yard is a slab over the whole lot, standing just proud of the ground plinth so the two never z-fight. */
export const RECYCLING_YARD_HEIGHT = 0.3;
/** How far a yard's footing reaches below the highest ground under its lot. */
export const YARD_FOOTING_DEPTH = 8;

const RECYCLING_YARD_RGB: RGB = [0.3, 0.32, 0.33];
const RECYCLING_SHED_RGB: RGB = [0.62, 0.64, 0.64];
const RECYCLING_ROOF_RGB: RGB = [0.36, 0.4, 0.42];
const RECYCLING_DOOR_RGB: RGB = [0.2, 0.46, 0.55];
const RECYCLING_OFFICE_RGB: RGB = [0.78, 0.76, 0.7];
const RECYCLING_OFFICE_ROOF_RGB: RGB = [0.4, 0.42, 0.44];

export interface RecyclingDepotLayout {
  /** Footprint-frame centre of the shed and of the office, on the ground. */
  shed: Vec2;
  office: Vec2;
  /** Footprint-frame centre of each parked truck; every truck's nose points to local +Z. */
  trucks: Vec2[];
}

/**
 * Shed hard against the back-left corner (margin inside the lot), office
 * beside it, and the trucks in a row one apron in front of the bay doors.
 * Pure; fixed per footprint.
 */
export function computeRecyclingDepotLayout(footprint: FootprintSize): RecyclingDepotLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const shedX = -halfW + RECYCLING_EDGE_MARGIN + RECYCLING_SHED_SIZE.w / 2;
  const shedZ = -halfD + RECYCLING_EDGE_MARGIN + RECYCLING_SHED_SIZE.d / 2;
  const office: Vec2 = {
    x: shedX + RECYCLING_SHED_SIZE.w / 2 + RECYCLING_OFFICE_SIZE.w / 2 + 0.5,
    z: -halfD + RECYCLING_EDGE_MARGIN + RECYCLING_OFFICE_SIZE.d / 2,
  };
  const truckLength = sizeForKind(VehicleKind.Recycling)[2];
  const truckZ = shedZ + RECYCLING_SHED_SIZE.d / 2 + RECYCLING_DOOR_APRON + truckLength / 2;
  const firstTruckX = -halfW + RECYCLING_EDGE_MARGIN + sizeForKind(VehicleKind.Recycling)[0] / 2;
  const trucks: Vec2[] = [];
  for (let i = 0; i < RECYCLING_TRUCK_COUNT; i++) {
    trucks.push({ x: firstTruckX + i * RECYCLING_TRUCK_SPACING, z: truckZ });
  }
  return { shed: { x: shedX, z: shedZ }, office, trucks };
}

/**
 * The paved yard: one slab over the whole lot, local Y=0 the highest ground
 * under it, with a footing below that meets the ground on the low side of a
 * slope (and lies buried on the flat).
 */
function buildRecyclingYardGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const depth = RECYCLING_YARD_HEIGHT + YARD_FOOTING_DEPTH;
  const yard = new THREE.BoxGeometry(halfW * 2, depth, halfD * 2);
  yard.translate(0, RECYCLING_YARD_HEIGHT - depth / 2, 0);
  return paintVertexColor(yard, hexFromRgb(RECYCLING_YARD_RGB));
}

/** Shed box + eaves cap + two bay doors proud of the street-side wall, merged; local Y=0 is the GROUND plane. */
function buildRecyclingShedGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { shed } = computeRecyclingDepotLayout(footprint);
  const { w, d, h } = RECYCLING_SHED_SIZE;

  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(shed.x, h / 2, shed.z);
  paintVertexColor(body, hexFromRgb(RECYCLING_SHED_RGB));

  const cap = new THREE.BoxGeometry(w, RECYCLING_ROOF_CAP_HEIGHT, d);
  cap.translate(shed.x, h + RECYCLING_ROOF_CAP_HEIGHT / 2, shed.z);
  paintVertexColor(cap, hexFromRgb(RECYCLING_ROOF_RGB));

  const parts: THREE.BufferGeometry[] = [body, cap];
  for (let i = 0; i < RECYCLING_DOOR_COUNT; i++) {
    const door = new THREE.BoxGeometry(
      RECYCLING_DOOR_SIZE.w,
      RECYCLING_DOOR_SIZE.h,
      RECYCLING_DOOR_THICKNESS,
    );
    const x = shed.x + (i - (RECYCLING_DOOR_COUNT - 1) / 2) * (w / RECYCLING_DOOR_COUNT);
    door.translate(x, RECYCLING_DOOR_SIZE.h / 2, shed.z + d / 2 + RECYCLING_DOOR_THICKNESS / 2);
    paintVertexColor(door, hexFromRgb(RECYCLING_DOOR_RGB));
    parts.push(door);
  }
  return mergeParts(parts);
}

/** Office box + flat roof slab, merged; local Y=0 is the GROUND plane. */
function buildRecyclingOfficeGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { office } = computeRecyclingDepotLayout(footprint);
  const { w, d, h } = RECYCLING_OFFICE_SIZE;
  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(office.x, h / 2, office.z);
  paintVertexColor(body, hexFromRgb(RECYCLING_OFFICE_RGB));
  const roof = new THREE.BoxGeometry(w, RECYCLING_ROOF_CAP_HEIGHT, d);
  roof.translate(office.x, h + RECYCLING_ROOF_CAP_HEIGHT / 2, office.z);
  paintVertexColor(roof, hexFromRgb(RECYCLING_OFFICE_ROOF_RGB));
  return mergeParts([body, roof]);
}

/** One parked service-fleet truck of `kind` at its real size, nose to local +Z, centred on its own origin on the ground. */
function buildParkedTruckGeometry(kind: ServiceVehicleKind): THREE.BufferGeometry {
  const [sx, sy, sz] = sizeForKind(kind);
  const truck = buildServiceVehicleGeometry(kind);
  truck.scale(sx, sy, sz);
  truck.translate(0, sy / 2, 0);
  return truck;
}

// ---------------------------------------------------------------------------
// materials-recovery-facility: a clear-span sorting hall on the back-left of a
// paved yard, its tipping-floor bay doors facing the street (local +Z), a bale
// yard of stacked cubes beside it, an office at the street corner and its
// recycling trucks parked on the apron in front of the doors.
// ---------------------------------------------------------------------------

/** The hall: 54 × 46.5 m is 2,511 m², 27,000 sq ft, 11 m over the tipping floor and balers. */
export const MRF_HALL_SIZE = { w: 54, d: 46.5, h: 11 };
export const MRF_OFFICE_SIZE = { w: 12, d: 8, h: 4 };
/** A baled cube: 1.1 m wide, 0.75 m tall, 1.5 m long. */
export const MRF_BALE_SIZE = { w: 1.1, h: 0.75, l: 1.5 };
export const MRF_TRUCK_COUNT = 4;
/** Bale blocks across and deep in the bale yard, and bales across, deep and high in each block. */
const MRF_BALE_BLOCKS = { across: 4, deep: 3 };
const MRF_BALES_PER_BLOCK = { across: 5, deep: 3, high: 3 };
const MRF_BALE_GAP = 0.12;
const MRF_BALE_AISLE = 3;
const MRF_EDGE_MARGIN = 3;
/** Clear yard between the hall and the bale yard. */
const MRF_YARD_GAP = 6;
const MRF_ROOF_CAP_HEIGHT = 0.6;
const MRF_DOOR_SIZE = { w: 6, h: 7.5 };
const MRF_DOOR_THICKNESS = 0.3;
const MRF_DOOR_COUNT = 3;
const MRF_TRUCK_SPACING = 6.5;
/** The tipping apron: clear yard in front of the bay doors for a truck to turn and back in. */
const MRF_DOOR_APRON = 14;

const MRF_HALL_RGB: RGB = [0.58, 0.63, 0.6];
const MRF_ROOF_RGB: RGB = [0.36, 0.4, 0.41];
const MRF_DOOR_RGB: RGB = [0.22, 0.28, 0.31];
const MRF_OFFICE_RGB: RGB = [0.78, 0.76, 0.7];
const MRF_OFFICE_ROOF_RGB: RGB = [0.4, 0.42, 0.44];
/** One bale colour per block: cardboard, mixed paper, PET, HDPE, aluminium, steel cans. */
const MRF_BALE_RGBS: readonly RGB[] = [
  [0.6, 0.46, 0.3],
  [0.8, 0.78, 0.72],
  [0.52, 0.66, 0.78],
  [0.78, 0.72, 0.5],
  [0.76, 0.78, 0.8],
  [0.5, 0.48, 0.46],
];

export interface MrfLayout {
  /** Footprint-frame centres on the ground. */
  hall: Vec2;
  office: Vec2;
  /** Footprint-frame centre of every bale, the height of its underside and its block. */
  bales: { x: number; z: number; y: number; block: number }[];
  /** Footprint-frame centre of each parked truck; every truck's nose points to local +Z. */
  trucks: Vec2[];
}

/**
 * Hall hard against the back-left corner (margin inside the lot), the bale
 * yard beside it to the right, the office at the front-right corner, and the
 * trucks in a row one apron in front of the bay doors. A block's back corner
 * stack is one bale shorter, so the stacks read as stacks. Pure; fixed per
 * footprint.
 */
export function computeMrfLayout(footprint: FootprintSize): MrfLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const hall: Vec2 = {
    x: -halfW + MRF_EDGE_MARGIN + MRF_HALL_SIZE.w / 2,
    z: -halfD + MRF_EDGE_MARGIN + MRF_HALL_SIZE.d / 2,
  };
  const office: Vec2 = {
    x: halfW - MRF_EDGE_MARGIN - MRF_OFFICE_SIZE.w / 2,
    z: halfD - MRF_EDGE_MARGIN - MRF_OFFICE_SIZE.d / 2,
  };
  const pitchX = MRF_BALE_SIZE.w + MRF_BALE_GAP;
  const pitchZ = MRF_BALE_SIZE.l + MRF_BALE_GAP;
  const blockW = MRF_BALES_PER_BLOCK.across * pitchX;
  const blockD = MRF_BALES_PER_BLOCK.deep * pitchZ;
  const yardX = hall.x + MRF_HALL_SIZE.w / 2 + MRF_YARD_GAP;
  const yardZ = -halfD + MRF_EDGE_MARGIN;
  const bales: MrfLayout['bales'] = [];
  for (let bz = 0; bz < MRF_BALE_BLOCKS.deep; bz++) {
    for (let bx = 0; bx < MRF_BALE_BLOCKS.across; bx++) {
      const block = bz * MRF_BALE_BLOCKS.across + bx;
      const x0 = yardX + bx * (blockW + MRF_BALE_AISLE);
      const z0 = yardZ + bz * (blockD + MRF_BALE_AISLE);
      for (let k = 0; k < MRF_BALES_PER_BLOCK.deep; k++) {
        for (let i = 0; i < MRF_BALES_PER_BLOCK.across; i++) {
          const corner = i === MRF_BALES_PER_BLOCK.across - 1 && k === 0;
          const high = MRF_BALES_PER_BLOCK.high - (corner ? 1 : 0);
          for (let j = 0; j < high; j++) {
            bales.push({
              x: x0 + i * pitchX + MRF_BALE_SIZE.w / 2,
              z: z0 + k * pitchZ + MRF_BALE_SIZE.l / 2,
              y: RECYCLING_YARD_HEIGHT + j * MRF_BALE_SIZE.h,
              block,
            });
          }
        }
      }
    }
  }
  const [truckW, , truckL] = sizeForKind(VehicleKind.Recycling);
  const truckZ = hall.z + MRF_HALL_SIZE.d / 2 + MRF_DOOR_APRON + truckL / 2;
  const firstTruckX = -halfW + MRF_EDGE_MARGIN + truckW / 2;
  const trucks: Vec2[] = [];
  for (let i = 0; i < MRF_TRUCK_COUNT; i++) {
    trucks.push({ x: firstTruckX + i * MRF_TRUCK_SPACING, z: truckZ });
  }
  return { hall, office, bales, trucks };
}

/** Hall box + roof cap + the tipping-floor bay doors proud of the street-side wall, merged; local Y=0 is the GROUND plane. */
function buildMrfHallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { hall } = computeMrfLayout(footprint);
  const { w, d, h } = MRF_HALL_SIZE;

  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(hall.x, h / 2, hall.z);
  paintVertexColor(body, hexFromRgb(MRF_HALL_RGB));

  const cap = new THREE.BoxGeometry(w, MRF_ROOF_CAP_HEIGHT, d);
  cap.translate(hall.x, h + MRF_ROOF_CAP_HEIGHT / 2, hall.z);
  paintVertexColor(cap, hexFromRgb(MRF_ROOF_RGB));

  const parts: THREE.BufferGeometry[] = [body, cap];
  for (let i = 0; i < MRF_DOOR_COUNT; i++) {
    const door = new THREE.BoxGeometry(MRF_DOOR_SIZE.w, MRF_DOOR_SIZE.h, MRF_DOOR_THICKNESS);
    const x = hall.x + (i - (MRF_DOOR_COUNT - 1) / 2) * (w / MRF_DOOR_COUNT);
    door.translate(x, MRF_DOOR_SIZE.h / 2, hall.z + d / 2 + MRF_DOOR_THICKNESS / 2);
    paintVertexColor(door, hexFromRgb(MRF_DOOR_RGB));
    parts.push(door);
  }
  return mergeParts(parts);
}

/** Every bale in the yard as one merged geometry, coloured by its block's material; local Y=0 is the GROUND plane. */
function buildMrfBalesGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { bales } = computeMrfLayout(footprint);
  return mergeParts(
    bales.map((b) => {
      const bale = new THREE.BoxGeometry(MRF_BALE_SIZE.w, MRF_BALE_SIZE.h, MRF_BALE_SIZE.l);
      bale.translate(b.x, b.y + MRF_BALE_SIZE.h / 2, b.z);
      return paintVertexColor(bale, hexFromRgb(MRF_BALE_RGBS[b.block % MRF_BALE_RGBS.length]!));
    }),
  );
}

/** Office box + flat roof slab, merged; local Y=0 is the GROUND plane. */
function buildMrfOfficeGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { office } = computeMrfLayout(footprint);
  const { w, d, h } = MRF_OFFICE_SIZE;
  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(office.x, h / 2, office.z);
  paintVertexColor(body, hexFromRgb(MRF_OFFICE_RGB));
  const roof = new THREE.BoxGeometry(w, MRF_ROOF_CAP_HEIGHT, d);
  roof.translate(office.x, h + MRF_ROOF_CAP_HEIGHT / 2, office.z);
  paintVertexColor(roof, hexFromRgb(MRF_OFFICE_ROOF_RGB));
  return mergeParts([body, roof]);
}

// ---------------------------------------------------------------------------
// transfer-station: an enclosed tipping hall on the back-left of a paved yard,
// its roll-up doors facing the street (local +Z), a sunken load-out bay along
// its right-hand wall with one transfer rig in it and another waiting beside
// it, two refuse packers on the apron and a scale house beside the weighbridge
// at the entry.
// ---------------------------------------------------------------------------

/** The tipping hall: 30 × 50 m is 1,500 m², 10 m to the eaves. */
export const TRANSFER_HALL_SIZE = { w: 30, d: 50, h: 10 };
/** The low-pitched roof's rise from the eaves to the ridge. */
export const TRANSFER_ROOF_RISE = 1;
/** A 53 ft open-top transfer trailer: 16.15 m long, 2.6 m wide, its rim 4.1 m up. */
export const TRANSFER_TRAILER_SIZE = { w: 2.6, h: 4.1, l: 16.15 };
/** A day-cab tractor; its fifth wheel sits under the trailer's front. */
export const TRANSFER_TRACTOR_SIZE = { w: 2.5, h: 3.4, l: 6.5 };
const TRANSFER_KINGPIN_OVERLAP = 1.3;
/** A whole rig, nose to tail: about 70 ft. */
export const TRANSFER_RIG_LENGTH =
  TRANSFER_TRACTOR_SIZE.l + TRANSFER_TRAILER_SIZE.l - TRANSFER_KINGPIN_OVERLAP;
/** The load-out bay along the hall: a rig drops into it to be loaded from the tipping floor. */
export const TRANSFER_BAY_SIZE = { w: 4.9, l: 26, depth: 2.4 };
/** A 70 ft truck scale, 11 ft wide, standing proud of the yard. */
export const TRANSFER_WEIGHBRIDGE_SIZE = { w: 3.4, l: 21.3, h: 0.15 };
export const TRANSFER_SCALE_HOUSE_SIZE = { w: 4, d: 6, h: 3.2 };
export const TRANSFER_RIG_COUNT = 2;
export const TRANSFER_PACKER_COUNT = 2;
const TRANSFER_EDGE_MARGIN = 3;
const TRANSFER_ROOF_OVERHANG = 0.4;
const TRANSFER_ROOF_SKIN = 0.3;
const TRANSFER_DOOR_SIZE = { w: 6, h: 7.5 };
const TRANSFER_DOOR_THICKNESS = 0.3;
const TRANSFER_DOOR_COUNT = 3;
/** The tipping apron: clear yard in front of the doors for a packer to turn and back in. */
const TRANSFER_DOOR_APRON = 14;
const TRANSFER_BAY_WALL = { thickness: 0.3, height: 1.1 };
/** Clear yard between the bay's outer wall and the waiting rig. */
const TRANSFER_RIG_GAP = 3;
/** Gap between the weighbridge and the scale house's window wall. */
const TRANSFER_SCALE_GAP = 1.5;

const TRANSFER_HALL_RGB: RGB = [0.55, 0.53, 0.45];
const TRANSFER_ROOF_RGB: RGB = [0.34, 0.37, 0.38];
const TRANSFER_DOOR_RGB: RGB = [0.25, 0.3, 0.33];
const TRANSFER_BAY_FLOOR_RGB: RGB = [0.12, 0.12, 0.13];
const TRANSFER_BAY_WALL_RGB: RGB = [0.5, 0.5, 0.48];
const TRANSFER_SCALE_HOUSE_RGB: RGB = [0.7, 0.68, 0.6];
const TRANSFER_SCALE_ROOF_RGB: RGB = [0.4, 0.42, 0.44];
const TRANSFER_WEIGHBRIDGE_RGB: RGB = [0.42, 0.44, 0.45];
const TRANSFER_TRACTOR_RGB: RGB = [0.48, 0.16, 0.12];
const TRANSFER_TRAILER_RGB: RGB = [0.5, 0.52, 0.53];
const TRANSFER_LOAD_RGB: RGB = [0.33, 0.3, 0.26];
const TRANSFER_TYRE_RGB: RGB = [0.08, 0.08, 0.09];

export interface TransferLayout {
  /** Footprint-frame centres on the ground. */
  hall: Vec2;
  bay: Vec2;
  weighbridge: Vec2;
  scaleHouse: Vec2;
  /** Footprint-frame centre of each rig and how far below the yard it stands; every nose points to local +Z. */
  rigs: { x: number; z: number; sunk: number }[];
  /** Footprint-frame centre of each parked packer; every nose points to local +Z. */
  packers: Vec2[];
}

/**
 * Hall hard against the back-left corner (margin inside the lot), the bay
 * along its right-hand wall with a rig sunk in it, the waiting rig beside the
 * bay, the packers one apron in front of the first two doors, and the
 * weighbridge with its scale house at the front-right corner, on the way in.
 * Pure; fixed per footprint.
 */
export function computeTransferLayout(footprint: FootprintSize): TransferLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const hall: Vec2 = {
    x: -halfW + TRANSFER_EDGE_MARGIN + TRANSFER_HALL_SIZE.w / 2,
    z: -halfD + TRANSFER_EDGE_MARGIN + TRANSFER_HALL_SIZE.d / 2,
  };
  const bay: Vec2 = { x: hall.x + TRANSFER_HALL_SIZE.w / 2 + TRANSFER_BAY_SIZE.w / 2, z: hall.z };
  const waitingX =
    bay.x +
    TRANSFER_BAY_SIZE.w / 2 +
    TRANSFER_BAY_WALL.thickness +
    TRANSFER_RIG_GAP +
    TRANSFER_TRAILER_SIZE.w / 2;
  const weighbridge: Vec2 = {
    x:
      halfW -
      TRANSFER_EDGE_MARGIN -
      TRANSFER_SCALE_HOUSE_SIZE.w -
      TRANSFER_SCALE_GAP -
      TRANSFER_WEIGHBRIDGE_SIZE.w / 2,
    z: halfD - TRANSFER_EDGE_MARGIN - TRANSFER_WEIGHBRIDGE_SIZE.l / 2,
  };
  const scaleHouse: Vec2 = {
    x: halfW - TRANSFER_EDGE_MARGIN - TRANSFER_SCALE_HOUSE_SIZE.w / 2,
    z: weighbridge.z,
  };
  const packerL = sizeForKind(VehicleKind.Garbage)[2];
  const packerZ = hall.z + TRANSFER_HALL_SIZE.d / 2 + TRANSFER_DOOR_APRON + packerL / 2;
  const packers: Vec2[] = [];
  for (let i = 0; i < TRANSFER_PACKER_COUNT; i++) {
    packers.push({ x: transferDoorX(hall, i), z: packerZ });
  }
  return {
    hall,
    bay,
    weighbridge,
    scaleHouse,
    rigs: [
      { x: bay.x, z: bay.z, sunk: TRANSFER_BAY_SIZE.depth },
      { x: waitingX, z: bay.z, sunk: 0 },
    ],
    packers,
  };
}

/** The local X of the hall's `i`th door, the doors spread evenly across its street wall. */
function transferDoorX(hall: Vec2, i: number): number {
  return (
    hall.x + (i - (TRANSFER_DOOR_COUNT - 1) / 2) * (TRANSFER_HALL_SIZE.w / TRANSFER_DOOR_COUNT)
  );
}

/** A box `w` × `h` × `l` standing on `y0`, centred on (x, z), painted one colour. */
function transferBox(
  w: number,
  h: number,
  l: number,
  x: number,
  y0: number,
  z: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, l);
  box.translate(x, y0 + h / 2, z);
  return paintVertexColor(box, hexFromRgb(rgb));
}

/**
 * The hall box, its low-pitched gable roof (ridge along the hall), the roll-up
 * doors proud of the street-side wall, and the load-out bay along its right
 * wall: a dark floor flush with the yard behind a low wall on its outer side
 * and its back end, open to the street end for the rig to pull out. Local Y=0
 * is the GROUND plane.
 */
function buildTransferHallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { hall, bay } = computeTransferLayout(footprint);
  const { w, d, h } = TRANSFER_HALL_SIZE;
  const parts: THREE.BufferGeometry[] = [
    transferBox(w, h, d, hall.x, 0, hall.z, TRANSFER_HALL_RGB),
  ];

  const halfSpan = w / 2 + TRANSFER_ROOF_OVERHANG;
  const profile = new THREE.Shape();
  profile.moveTo(-halfSpan, 0);
  profile.lineTo(halfSpan, 0);
  profile.lineTo(0, TRANSFER_ROOF_RISE);
  profile.closePath();
  const roofLength = d + 2 * TRANSFER_ROOF_OVERHANG;
  const roof = new THREE.ExtrudeGeometry(profile, { depth: roofLength, bevelEnabled: false });
  roof.translate(hall.x, h, hall.z - roofLength / 2);
  parts.push(paintVertexColor(roof, hexFromRgb(TRANSFER_ROOF_RGB)));
  // The roof's skin under the eaves, so the overhang reads from below.
  parts.push(
    transferBox(
      2 * halfSpan,
      TRANSFER_ROOF_SKIN,
      roofLength,
      hall.x,
      h - TRANSFER_ROOF_SKIN,
      hall.z,
      TRANSFER_ROOF_RGB,
    ),
  );

  for (let i = 0; i < TRANSFER_DOOR_COUNT; i++) {
    parts.push(
      transferBox(
        TRANSFER_DOOR_SIZE.w,
        TRANSFER_DOOR_SIZE.h,
        TRANSFER_DOOR_THICKNESS,
        transferDoorX(hall, i),
        0,
        hall.z + d / 2 + TRANSFER_DOOR_THICKNESS / 2,
        TRANSFER_DOOR_RGB,
      ),
    );
  }

  const { w: bayW, l: bayL } = TRANSFER_BAY_SIZE;
  const wall = TRANSFER_BAY_WALL;
  parts.push(
    transferBox(bayW, 0.02, bayL, bay.x, RECYCLING_YARD_HEIGHT, bay.z, TRANSFER_BAY_FLOOR_RGB),
    transferBox(
      wall.thickness,
      RECYCLING_YARD_HEIGHT + wall.height,
      bayL,
      bay.x + bayW / 2 + wall.thickness / 2,
      0,
      bay.z,
      TRANSFER_BAY_WALL_RGB,
    ),
    transferBox(
      bayW + wall.thickness,
      RECYCLING_YARD_HEIGHT + wall.height,
      wall.thickness,
      bay.x + wall.thickness / 2,
      0,
      bay.z - bayL / 2 - wall.thickness / 2,
      TRANSFER_BAY_WALL_RGB,
    ),
  );
  return mergeParts(parts);
}

/** The scale house (box + roof slab) and the weighbridge beside it, merged; local Y=0 is the GROUND plane. */
function buildTransferScaleGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { scaleHouse, weighbridge } = computeTransferLayout(footprint);
  const { w, d, h } = TRANSFER_SCALE_HOUSE_SIZE;
  const bridge = TRANSFER_WEIGHBRIDGE_SIZE;
  return mergeParts([
    transferBox(w, h, d, scaleHouse.x, 0, scaleHouse.z, TRANSFER_SCALE_HOUSE_RGB),
    transferBox(w + 0.4, 0.3, d + 0.4, scaleHouse.x, h, scaleHouse.z, TRANSFER_SCALE_ROOF_RGB),
    transferBox(
      bridge.w,
      RECYCLING_YARD_HEIGHT + bridge.h,
      bridge.l,
      weighbridge.x,
      0,
      weighbridge.z,
      TRANSFER_WEIGHBRIDGE_RGB,
    ),
  ]);
}

/**
 * One transfer rig, nose to local +Z, centred on its own origin on the ground:
 * a day-cab tractor whose fifth wheel sits under the front of a 53 ft open-top
 * trailer, the trailer's walls round a load of rubbish, and the tyres as
 * blocks under each axle.
 */
function buildTransferRigGeometry(): THREE.BufferGeometry {
  const half = TRANSFER_RIG_LENGTH / 2;
  const trailer = TRANSFER_TRAILER_SIZE;
  const tractor = TRANSFER_TRACTOR_SIZE;
  const deck = 1.0;
  const skin = 0.08;
  const tail = -half;
  const trailerZ = tail + trailer.l / 2;
  const wallH = trailer.h - deck;
  const nose = half;
  const tractorZ = nose - tractor.l / 2;
  const tyre = (z: number, width: number): THREE.BufferGeometry =>
    transferBox(width, 1.0, 1.0, 0, 0, z, TRANSFER_TYRE_RGB);
  return mergeParts([
    transferBox(trailer.w, 0.25, trailer.l, 0, deck, trailerZ, TRANSFER_TRAILER_RGB),
    transferBox(
      skin,
      wallH,
      trailer.l,
      -trailer.w / 2 + skin / 2,
      deck,
      trailerZ,
      TRANSFER_TRAILER_RGB,
    ),
    transferBox(
      skin,
      wallH,
      trailer.l,
      trailer.w / 2 - skin / 2,
      deck,
      trailerZ,
      TRANSFER_TRAILER_RGB,
    ),
    transferBox(trailer.w, wallH, skin, 0, deck, tail + skin / 2, TRANSFER_TRAILER_RGB),
    transferBox(trailer.w, wallH, skin, 0, deck, tail + trailer.l - skin / 2, TRANSFER_TRAILER_RGB),
    transferBox(
      trailer.w - 2 * skin,
      1.6,
      trailer.l - 2 * skin,
      0,
      deck + 0.25,
      trailerZ,
      TRANSFER_LOAD_RGB,
    ),
    tyre(tail + 2.0, trailer.w),
    tyre(tail + 3.3, trailer.w),
    transferBox(1.0, 0.4, tractor.l, 0, 0.7, tractorZ, TRANSFER_TYRE_RGB),
    transferBox(tractor.w - 0.2, 1.2, 1.8, 0, 0.9, nose - 0.9, TRANSFER_TRACTOR_RGB),
    transferBox(tractor.w, tractor.h - 0.9, 2.4, 0, 0.9, nose - 1.8 - 1.2, TRANSFER_TRACTOR_RGB),
    tyre(nose - 1.3, tractor.w),
    tyre(nose - tractor.l + 1.0, tractor.w),
    tyre(nose - tractor.l + 2.3, tractor.w),
  ]);
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
  /**
   * The kit paves its whole lot, so it stands on the highest ground under the
   * lot rather than at its centre: the instancer's body-sized plinth, seated on
   * the highest ground under the body, then always lies under the yard, and the
   * yard's footing reaches down to the ground on the low side of a slope.
   */
  pavesLot?: boolean;
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
  /** Whether a tile is water, so a shore building turns to face it; the default sees none. */
  private readonly waterAt: (x: number, z: number) => boolean;
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
    waterAt?: (x: number, z: number) => boolean,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.waterAt = waterAt ?? ((): boolean => false);
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

  /** The shared geometry one kit part is instanced from, or null if that (catalogId, kind) has no pool. */
  partGeometry(catalogId: string, kind: UtilityKitPartKind): THREE.BufferGeometry | null {
    return this.kits.get(catalogId)?.pools[kind]?.getMesh().geometry ?? null;
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
      case 'water-pump':
        return this.buildPumpKit(entry);
      case 'water-drain':
        return this.buildDrainKit(entry);
      case 'sewage-works':
        return this.buildWorksKit(entry);
      case 'coal-plant':
        return this.buildCoalPlantKit(entry);
      case 'incinerator':
        return this.buildIncineratorKit(entry);
      case 'recycling-depot':
        return this.buildRecyclingDepotKit(entry);
      case 'materials-recovery-facility':
        return this.buildMrfKit(entry);
      case 'transfer-station':
        return this.buildTransferKit(entry);
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
        waterSteel: new InstancedSlotPool(
          this.scene,
          buildWaterSteelGeometry(),
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

  private buildPumpKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        pumpHouse: new InstancedSlotPool(
          this.scene,
          buildPumpHouseGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        pumpIntake: new InstancedSlotPool(
          this.scene,
          buildPumpIntakeGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildDrainKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        drainHeadwall: new InstancedSlotPool(
          this.scene,
          buildDrainHeadwallGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        drainOutfall: new InstancedSlotPool(
          this.scene,
          buildDrainOutfallGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildWorksKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        worksBody: new InstancedSlotPool(
          this.scene,
          buildWorksBodyGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        worksOutfall: new InstancedSlotPool(
          this.scene,
          buildDrainOutfallGeometry(entry.footprint),
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

  private buildIncineratorKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pools: {
        incineratorHall: new InstancedSlotPool(
          this.scene,
          buildIncineratorHallGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        incineratorStack: new InstancedSlotPool(
          this.scene,
          buildIncineratorStackGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        incineratorBay: new InstancedSlotPool(
          this.scene,
          buildIncineratorBayGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildRecyclingDepotKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    return {
      entry,
      pavesLot: true,
      pools: {
        recyclingYard: new InstancedSlotPool(
          this.scene,
          buildRecyclingYardGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        recyclingShed: new InstancedSlotPool(
          this.scene,
          buildRecyclingShedGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        recyclingOffice: new InstancedSlotPool(
          this.scene,
          buildRecyclingOfficeGeometry(entry.footprint),
          lambert(),
          INITIAL_KIT_CAPACITY,
        ),
        recyclingTruck: new InstancedSlotPool(
          this.scene,
          buildParkedTruckGeometry(VehicleKind.Recycling),
          lambert(),
          INITIAL_KIT_CAPACITY * RECYCLING_TRUCK_COUNT,
        ),
      },
    };
  }

  private buildMrfKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, lambert(), capacity);
    return {
      entry,
      pavesLot: true,
      pools: {
        mrfYard: pool(buildRecyclingYardGeometry(entry.footprint)),
        mrfHall: pool(buildMrfHallGeometry(entry.footprint)),
        mrfBales: pool(buildMrfBalesGeometry(entry.footprint)),
        mrfOffice: pool(buildMrfOfficeGeometry(entry.footprint)),
        mrfTruck: pool(
          buildParkedTruckGeometry(VehicleKind.Recycling),
          INITIAL_KIT_CAPACITY * MRF_TRUCK_COUNT,
        ),
      },
    };
  }

  private buildTransferKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ vertexColors: true });
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, lambert(), capacity);
    return {
      entry,
      pavesLot: true,
      pools: {
        transferYard: pool(buildRecyclingYardGeometry(entry.footprint)),
        transferHall: pool(buildTransferHallGeometry(entry.footprint)),
        transferScale: pool(buildTransferScaleGeometry(entry.footprint)),
        transferRig: pool(buildTransferRigGeometry(), INITIAL_KIT_CAPACITY * TRANSFER_RIG_COUNT),
        transferPacker: pool(
          buildParkedTruckGeometry(VehicleKind.Garbage),
          INITIAL_KIT_CAPACITY * TRANSFER_PACKER_COUNT,
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
    const rotation = building.rotation;
    const lot = footprintForRotation(entry, rotation);
    const centerX = (building.x + lot.w / 2) * TILE_METERS;
    const centerZ = (building.z + lot.d / 2) * TILE_METERS;
    const groundY = kit.pavesLot
      ? maxHeightOverRect(
          this.heightAt,
          building.x * TILE_METERS,
          building.z * TILE_METERS,
          (building.x + lot.w) * TILE_METERS,
          (building.z + lot.d) * TILE_METERS,
        )
      : this.heightAt(centerX, centerZ);

    switch (entry.id) {
      case 'wind-turbine':
        this.applyTurbine(kit, building, centerX, groundY, centerZ, rotation);
        return;
      case 'water-tower':
        this.applyWaterTower(kit, building, centerX, groundY, centerZ, rotation);
        return;
      case 'water-pump':
        this.applyShorePair(
          kit,
          building,
          entry,
          'pumpHouse',
          'pumpIntake',
          centerX,
          groundY,
          centerZ,
        );
        return;
      case 'water-drain':
        this.applyShorePair(
          kit,
          building,
          entry,
          'drainHeadwall',
          'drainOutfall',
          centerX,
          groundY,
          centerZ,
        );
        return;
      case 'sewage-works':
        this.applyShorePair(
          kit,
          building,
          entry,
          'worksBody',
          'worksOutfall',
          centerX,
          groundY,
          centerZ,
        );
        return;
      case 'coal-plant':
        this.applyCoalPlant(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'incinerator':
        this.applyIncinerator(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'recycling-depot':
        this.applyRecyclingDepot(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'materials-recovery-facility':
        this.applyMrf(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'transfer-station':
        this.applyTransfer(kit, building, entry, centerX, groundY, centerZ, rotation);
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
    const steelPool = kit.pools.waterSteel;
    const tankPool = kit.pools.waterTank;
    if (!steelPool || !tankPool) return;

    const steelSlot = this.placeAt(steelPool, centerX, groundY, centerZ, rotation);
    const tankSlot = this.placeAt(tankPool, centerX, groundY, centerZ, rotation);

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: { waterSteel: [steelSlot], waterTank: [tankSlot] },
    });
  }

  /**
   * A shore building's two parts, both turned so the kit's local +Z faces the
   * water beside the footprint — never the rotation the player placed it at,
   * since an intake pointing inland would draw from nothing.
   */
  private applyShorePair(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    bodyKind: UtilityKitPartKind,
    pipeKind: UtilityKitPartKind,
    centerX: number,
    groundY: number,
    centerZ: number,
  ): void {
    const bodyPool = kit.pools[bodyKind];
    const pipePool = kit.pools[pipeKind];
    if (!bodyPool || !pipePool) return;
    const lot = footprintForRotation(entry, building.rotation);
    const facing = waterSideOf(building.x, building.z, lot, this.waterAt);
    const bodySlot = this.placeAt(bodyPool, centerX, groundY, centerZ, facing);
    const pipeSlot = this.placeAt(pipePool, centerX, groundY, centerZ, facing);
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: { [bodyKind]: [bodySlot], [pipeKind]: [pipeSlot] },
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

  private applyIncinerator(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const hallPool = kit.pools.incineratorHall;
    const stackPool = kit.pools.incineratorStack;
    const bayPool = kit.pools.incineratorBay;
    if (!hallPool || !stackPool || !bayPool) return;

    const hallSlot = this.placeAt(hallPool, centerX, groundY, centerZ, rotation);

    const stackLocal = computeIncineratorStackLocalPlacement(entry.footprint);
    const stackRotated = rotateLocalXZ(stackLocal.x, stackLocal.z, rotation);
    const stackSlot = this.placeAt(
      stackPool,
      centerX + stackRotated.x,
      groundY,
      centerZ + stackRotated.z,
      rotation,
    );

    const bayLocal = computeIncineratorBayLocalPlacement(entry.footprint);
    const bayRotated = rotateLocalXZ(bayLocal.x, bayLocal.z, rotation);
    const baySlot = this.placeAt(
      bayPool,
      centerX + bayRotated.x,
      groundY,
      centerZ + bayRotated.z,
      rotation,
    );

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        incineratorHall: [hallSlot],
        incineratorStack: [stackSlot],
        incineratorBay: [baySlot],
      },
    });
  }

  private applyRecyclingDepot(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const yardPool = kit.pools.recyclingYard;
    const shedPool = kit.pools.recyclingShed;
    const officePool = kit.pools.recyclingOffice;
    const truckPool = kit.pools.recyclingTruck;
    if (!yardPool || !shedPool || !officePool || !truckPool) return;

    const yardSlot = this.placeAt(yardPool, centerX, groundY, centerZ, rotation);
    const shedSlot = this.placeAt(shedPool, centerX, groundY, centerZ, rotation);
    const officeSlot = this.placeAt(officePool, centerX, groundY, centerZ, rotation);

    // The trucks stand on the yard slab, not in it.
    const truckY = groundY + RECYCLING_YARD_HEIGHT;
    const truckSlots = computeRecyclingDepotLayout(entry.footprint).trucks.map((local) => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(truckPool, centerX + rotated.x, truckY, centerZ + rotated.z, rotation);
    });

    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        recyclingYard: [yardSlot],
        recyclingShed: [shedSlot],
        recyclingOffice: [officeSlot],
        recyclingTruck: truckSlots,
      },
    });
  }

  private applyMrf(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { mrfYard, mrfHall, mrfBales, mrfOffice, mrfTruck } = kit.pools;
    if (!mrfYard || !mrfHall || !mrfBales || !mrfOffice || !mrfTruck) return;

    const slots = {
      mrfYard: [this.placeAt(mrfYard, centerX, groundY, centerZ, rotation)],
      mrfHall: [this.placeAt(mrfHall, centerX, groundY, centerZ, rotation)],
      mrfBales: [this.placeAt(mrfBales, centerX, groundY, centerZ, rotation)],
      mrfOffice: [this.placeAt(mrfOffice, centerX, groundY, centerZ, rotation)],
      // The trucks stand on the yard slab, not in it.
      mrfTruck: computeMrfLayout(entry.footprint).trucks.map((local) => {
        const rotated = rotateLocalXZ(local.x, local.z, rotation);
        return this.placeAt(
          mrfTruck,
          centerX + rotated.x,
          groundY + RECYCLING_YARD_HEIGHT,
          centerZ + rotated.z,
          rotation,
        );
      }),
    };
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
  }

  private applyTransfer(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { transferYard, transferHall, transferScale, transferRig, transferPacker } = kit.pools;
    if (!transferYard || !transferHall || !transferScale || !transferRig || !transferPacker) return;

    const layout = computeTransferLayout(entry.footprint);
    const placeLocal = (pool: InstancedSlotPool, local: Vec2, y: number): number => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(pool, centerX + rotated.x, y, centerZ + rotated.z, rotation);
    };
    const slots = {
      transferYard: [this.placeAt(transferYard, centerX, groundY, centerZ, rotation)],
      transferHall: [this.placeAt(transferHall, centerX, groundY, centerZ, rotation)],
      transferScale: [this.placeAt(transferScale, centerX, groundY, centerZ, rotation)],
      // One rig stands in the sunken bay, below the yard; the other and the packers stand on it.
      transferRig: layout.rigs.map((rig) =>
        placeLocal(transferRig, rig, groundY + RECYCLING_YARD_HEIGHT - rig.sunk),
      ),
      transferPacker: layout.packers.map((packer) =>
        placeLocal(transferPacker, packer, groundY + RECYCLING_YARD_HEIGHT),
      ),
    };
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
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
