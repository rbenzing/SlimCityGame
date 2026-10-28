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
 *    night (setNightFactor); apart from the stations' lit panes, the only kit
 *    part in this file that reacts to night.
 *  - water-tower: braced legs, balcony and riser ("waterSteel") + a white
 *    ellipsoid-ended tank ("waterTank").
 *  - water-pump, water-drain, sewage-works: the shore kits, each built in a
 *    frame whose +Z is the water and turned to the water tile beside it. A
 *    plate over the lot ("pumpGrounds", "drainGrounds", "worksGrounds"); the
 *    pump house, screen house, wet well, surge tank, main, transformer and
 *    fence ("pumpStation") with the intake pipe on its crib ("pumpIntake");
 *    the headwall, wingwalls, guard rail and riprap apron ("drainHeadwall")
 *    with the outfall pipe ("drainOutfall"); the works' inlet, basin, blower
 *    house, digester, contact tank and control house ("worksPlant"), one
 *    clarifier instanced three times ("worksClarifier") and its outfall
 *    ("worksOutfall").
 *  - coal-plant: a gravel plate with the apron, coal yard and drive
 *    ("coalGrounds"), the boiler house, turbine hall, precipitator, flue,
 *    crusher house, conveyor gallery on its bents, cooling tower, ash silo,
 *    switchyard and fence merged ("coalPlant"), 2 striped smokestacks
 *    ("coalSmokestack", chimney language) and the stockpile as one faceted
 *    heap ("coalHeap").
 *  - incinerator: the plate with the apron and queue lane
 *    ("incineratorGrounds"), the tipping hall with its doors, boiler hall,
 *    baghouse, flue, turbine hall, truck scale and fence merged
 *    ("incineratorPlant"), and the one stack ("incineratorStack").
 *  - recycling-depot: a paved yard slab over the whole lot ("recyclingYard"),
 *    the sorting shed open to the yard, the office, the stall paint and the
 *    fence ("recyclingDepot"), six roll-offs along the back
 *    ("recyclingRollOff") and four parked side-loaders ("recyclingTruck", the
 *    service fleet's recycling body at its real size), all facing local +Z —
 *    the street side once the player turns the lot to face the road.
 *  - materials-recovery-facility: the same yard slab ("mrfYard"), a long
 *    clear-span sorting hall under its wainscot with three tipping-floor bay
 *    doors on the street side, two bale docks on the yard side and its roof
 *    fans ("mrfHall"), a bale yard of stacked bales ("mrfBales", one merged
 *    geometry), an office at the street corner ("mrfOffice"), the truck scale
 *    on the way in ("mrfScale") and four parked recycling trucks on the apron
 *    ("mrfTruck").
 *  - transfer-station: the same yard slab ("transferYard"), a hollow tipping
 *    hall under a low-pitched roof, its three roll-up doors on the street
 *    side drawn open over the push walls inside, and a sunken load-out bay
 *    along its flank behind a guard wall ("transferHall"), a scale house
 *    beside the weighbridge at the entry ("transferScale"), two
 *    tractor-and-trailer transfer rigs, one sunk in the bay and one waiting
 *    ("transferRig"), and two refuse packers on the apron ("transferPacker").
 *  - hospital: the same yard slab ("hospitalYard"), a six-storey block with
 *    a glass ribbon on every 4.5 m floor, its main entrance and ambulance
 *    canopy on the street side ("hospitalBlock"), a two-level parking deck
 *    with its ramp, spandrel band, cores and stall lines ("hospitalDeck"),
 *    the accessible spaces' paint by the entrance ("hospitalPaint"), cars
 *    in the deck's stalls ("hospitalCar") and an ambulance under its canopy
 *    ("hospitalAmbulance").
 *  - cemetery: one lawn plate over the lot with the drive, the forecourt and a
 *    turf patch on every grave space ("cemeteryGrounds"), a gabled gatehouse
 *    ("cemeteryGatehouse"), the perimeter fence and its gate piers
 *    ("cemeteryFence"), a few trees ("cemeteryTree", the park's tree) and one
 *    headstone per interment ("cemeteryStone"): a single InstancedMesh for every
 *    cemetery's stones, whose count follows setInterments, not the building delta.
 *  - crematorium: the same lawn plate with a paved forecourt
 *    ("crematoriumGrounds"), a gabled chapel, a flat-roofed cremator hall with
 *    its exhaust duct, a foyer and an office, merged ("crematoriumBuilding"),
 *    and the one 7.6 m flue ("crematoriumFlue").
 *  - fire-station, fire-station-district, police-station,
 *    police-station-district: the paved lot ("stationYard", with the apron or
 *    sally drive and the stall lines), the building under its parapet with its
 *    framed bay doors or its entrance, canopy and sally port ("stationBuilding"),
 *    the lit panes and door glazing ("stationLit", the one kit material besides
 *    the turbine beacon that follows setNightFactor), a hose tower or radio pole
 *    ("stationMast"), the appliance parked before the doors ("stationApparatus")
 *    and staff cars in the stalls ("stationCar").
 *  - school, middle-school, high-school, college, library: a lawn plate with the
 *    paving, courts, quad and stall paint ("schoolGrounds"), the classroom wings,
 *    gym, canopy or portico and doors ("schoolBuilding"), the flagpole, play
 *    structure, tennis nets and book drop ("schoolProps"), every window, gym band,
 *    clerestory and door pane as one lit part on the stations' night material
 *    ("schoolLit"), the park's tree on the quad ("schoolTree"), staff cars in the
 *    stalls ("schoolCar") and a school bus in the pull-in ("schoolBus").
 *  - solar-farm: a scrub plate with the gravel track and the skid's pad
 *    ("solarGrounds"), one instance per row of tilted panels ("solarRow", world-
 *    aligned: every row faces the sun's noon side at every rotation of the lot),
 *    and the inverter skid with the chain-link fence ("solarSite").
 *  - gas-turbine, combined-cycle: a gravel plate with the paved pad and drive
 *    ("gasGrounds", "combinedGrounds"), the package, inlet house, boiler, hall,
 *    cooling tower, transformers and fence merged ("gasPlant", "combinedPlant"),
 *    and the one tall stack ("gasStack", "combinedStack").
 *  - nuclear-plant: the plate with its apron and drive ("nuclearGrounds"), the
 *    reactor and turbine buildings, switchyard, guard house and the double
 *    security fence ("nuclearPlant"), and the cooling-water intake on the edge
 *    that touches the water ("nuclearIntake").
 *  The paving kits stand on the highest ground under their lot (pavesLot),
 *  so the instancer's plinth never shows through their yard on a slope.
 *  - small-park: a flat lawn plate + path cross ("parkGround"), 2-3
 *    self-contained trees ("parkTree" — trunk+canopy built locally; this file
 *    deliberately does NOT import trees.ts), and 2 benches ("parkBench").
 *  - clinic: a lawn plate with the drop-off loop, the stalls and their paint
 *    ("clinicGrounds"), the block under its parapet with the porte-cochère,
 *    rooftop units and monument sign ("clinicBuilding"), the entry glazing,
 *    windows and sign panels on the stations' lit material ("clinicLit") and
 *    cars in the stalls ("clinicCar").
 *  - rail-station: the lot in its track frame, one of two per lot orientation,
 *    with the platform, tactile strip and car park ("depotGrounds" or
 *    "depotGroundsLong"), the platform canopy on its posts ("depotCanopy" or
 *    "depotCanopyLong"), the combination depot ("depotBuilding"), its doors and
 *    windows on the lit material ("depotLit") and cars ("depotCar").
 *  - bus-depot, bus-garage: one recipe at two sizes. The paved yard with the
 *    drive, the stall paint and the fuel pads ("busBaseYard"), the shop hall
 *    with its framed bay doors, the wash lane's gantry, the office, the fuel
 *    canopies and the fence ("busBaseShop"), the door and office panes on the
 *    lit material ("busBaseLit") and a bus on every stall the fleet has at
 *    home ("busBaseBus": one InstancedMesh for every bus base's buses, whose
 *    count follows setDepotFleets, not the building delta).
 *  - tram-depot: the lot in its track frame, the lead off the long edge or
 *    off the end, with the concrete apron and fence ("tramDepotYard" or
 *    "tramDepotYardEnd"), the lead, ladder and stabling roads as one merged
 *    pair of rails ("tramDepotTrack" or "tramDepotTrackEnd"), the catenary
 *    poles and crossarms ("tramDepotPoles"), the shop hall and office
 *    ("tramDepotShop"), their panes ("tramDepotLit") and the stabled sets'
 *    cars ("tramDepotCar", refit by setDepotFleets).
 *  - rail-yard: the same in the railway's frame with ballast under every
 *    road and the drive and fuelling stand ("railYardYard" or
 *    "railYardYardEnd", "railYardTrack" or "railYardTrackEnd"), the shop and
 *    office ("railYardShop"), their panes ("railYardLit") and the train sets'
 *    cars ("railYardCar").
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
import { uniform } from 'three/tsl';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  VehicleKind,
} from '../shared/types';
import { nightBodyMaterial } from './nightlook';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { maxHeightOverRect } from './footprint';
import { InstancedSlotPool } from './massing';
import { sunDirection } from './sun';
import { SHALLOW_WATER_COLOR } from './water';
import { buildServiceVehicleGeometry, type ServiceVehicleKind } from './servicevehicles';
import { buildVehicleGeometry, sizeForKind, VEHICLE_PALETTE_HEX } from './vehicles';
import {
  ACCESSIBLE_AISLE_M,
  ACCESSIBLE_CAR_WIDTH_M,
  ACCESSIBLE_VAN_WIDTH_M,
  adaAccessibleSpaces,
  adaVanSpaces,
} from '../shared/parkingcode';
import {
  ACCESSIBLE_SYMBOL_M,
  accessibilitySymbolPaint,
  MARKING_COLOR,
  ROAD_Y_OFFSET,
  YELLOW_MARKING_COLOR,
} from './roadsmesh';
import { UNIT_HEIGHT_M, UNIT_LENGTH_M, UNIT_WIDTH_M } from './buildingkit';
import {
  buildTrainCarGeometry,
  buildTramCarGeometry,
  TRAIN_CAR_PITCH,
  TRAIN_CAR_SIZE,
  TRAIN_CARS_PER_SET,
  TRAM_CAR_PITCH,
  TRAM_CAR_SIZE,
  TRAM_CARS_PER_SET,
} from './transit';

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
  'hospital',
  'cemetery',
  'crematorium',
  'fire-station',
  'fire-station-district',
  'police-station',
  'police-station-district',
  'school',
  'middle-school',
  'high-school',
  'college',
  'library',
  'solar-farm',
  'gas-turbine',
  'combined-cycle',
  'nuclear-plant',
  'small-park',
  'civic-plaza',
  'neighbourhood-park',
  'district-park',
  'sports-ground',
  'clinic',
  'rail-station',
  'bus-depot',
  'bus-garage',
  'tram-depot',
  'rail-yard',
];

export type UtilityKitPartKind =
  | 'turbineTower'
  | 'turbineRotor'
  | 'turbineBeacon'
  | 'waterSteel'
  | 'waterTank'
  | 'pumpGrounds'
  | 'pumpStation'
  | 'pumpIntake'
  | 'drainGrounds'
  | 'drainHeadwall'
  | 'drainOutfall'
  | 'worksGrounds'
  | 'worksPlant'
  | 'worksClarifier'
  | 'worksOutfall'
  | 'coalGrounds'
  | 'coalPlant'
  | 'coalSmokestack'
  | 'coalHeap'
  | 'incineratorGrounds'
  | 'incineratorPlant'
  | 'incineratorStack'
  | 'recyclingYard'
  | 'recyclingDepot'
  | 'recyclingRollOff'
  | 'recyclingTruck'
  | 'mrfYard'
  | 'mrfHall'
  | 'mrfBales'
  | 'mrfOffice'
  | 'mrfScale'
  | 'mrfTruck'
  | 'transferYard'
  | 'transferHall'
  | 'transferScale'
  | 'transferRig'
  | 'transferPacker'
  | 'hospitalYard'
  | 'hospitalBlock'
  | 'hospitalDeck'
  | 'hospitalPaint'
  | 'hospitalCar'
  | 'hospitalAmbulance'
  | 'cemeteryGrounds'
  | 'cemeteryGatehouse'
  | 'cemeteryFence'
  | 'cemeteryTree'
  | 'cemeteryStone'
  | 'crematoriumGrounds'
  | 'crematoriumBuilding'
  | 'crematoriumFlue'
  | 'stationYard'
  | 'stationBuilding'
  | 'stationLit'
  | 'stationMast'
  | 'stationApparatus'
  | 'stationCar'
  | 'schoolGrounds'
  | 'schoolBuilding'
  | 'schoolProps'
  | 'schoolLit'
  | 'schoolTree'
  | 'schoolCar'
  | 'schoolBus'
  | 'solarGrounds'
  | 'solarRow'
  | 'solarSite'
  | 'gasGrounds'
  | 'gasPlant'
  | 'gasStack'
  | 'combinedGrounds'
  | 'combinedPlant'
  | 'combinedStack'
  | 'nuclearGrounds'
  | 'nuclearPlant'
  | 'nuclearIntake'
  | 'parkGround'
  | 'parkTree'
  | 'parkBench'
  | 'plazaGround'
  | 'sportsGround'
  | 'playFrame'
  | 'pitchGoal'
  | 'pavilionBlock'
  | 'clinicGrounds'
  | 'clinicBuilding'
  | 'clinicLit'
  | 'clinicCar'
  | 'depotGrounds'
  | 'depotGroundsLong'
  | 'depotCanopy'
  | 'depotCanopyLong'
  | 'depotBuilding'
  | 'depotLit'
  | 'depotCar'
  | 'busBaseYard'
  | 'busBaseShop'
  | 'busBaseLit'
  | 'busBaseBus'
  | 'tramDepotYard'
  | 'tramDepotYardEnd'
  | 'tramDepotTrack'
  | 'tramDepotTrackEnd'
  | 'tramDepotPoles'
  | 'tramDepotShop'
  | 'tramDepotLit'
  | 'tramDepotCar'
  | 'railYardYard'
  | 'railYardYardEnd'
  | 'railYardTrack'
  | 'railYardTrackEnd'
  | 'railYardShop'
  | 'railYardLit'
  | 'railYardCar';

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
// water-pump, water-drain and sewage-works: the three buildings that stand on
// a shore. Each kit is built in a local frame whose +Z points at the water,
// and the instance is turned so that +Z faces the water tile its footprint
// touches; the land side (-Z) is where the street is taken to be.
// ---------------------------------------------------------------------------

/** The pump house: 13 × 12 m of masonry under a gable, 6 m to the eave and the catalog's 8 m at the ridge. */
export const PUMP_HOUSE = { w: 13, d: 12, eave: 6, ridge: 8 };
/** The screen house at the water line, with two travelling-screen frames on its water face. */
export const PUMP_SCREEN_HOUSE = { w: 6, d: 6, h: 5, setback: 1 };
export const PUMP_SCREEN = { w: 1.8, h: 4.2, depth: 0.5, count: 2 };
/** A 1.2 m intake pipe, resting on the ground and on its crib over the water. */
export const PUMP_INTAKE_RADIUS = 0.6;
/** The intake runs from the screen house to this far past the footprint's water-side edge. */
export const PUMP_INTAKE_OVERHANG = 6;
const PUMP_CRIB = { w: 2.4, d: 2.4, depth: 3 };
/** A 35 ft wet well as a concrete ring 1 m above grade, with a hatch on its lid. */
export const PUMP_WET_WELL = { radius: 5.35, rim: 1.0, hatch: 1.2 };
export const PUMP_SURGE_TANK = { radius: 1.5, h: 8 };
/** The 0.9 m discharge main, out of the land face to a valve vault. */
export const PUMP_MAIN = { radius: 0.45, vault: { w: 2.4, d: 2.4, h: 0.6 } };
const PUMP_TRACK_W = 4;

/** A drain's headwall 4 m wide and 2.4 m tall, with 2 m wingwalls flared at 45°, over a 6 × 4 m riprap apron. */
export const DRAIN_HEADWALL = { w: 4, h: 2.4, t: 0.5 };
export const DRAIN_WINGWALL = { length: 2, h: 2.0, t: 0.4, angle: Math.PI / 4 };
export const DRAIN_APRON = { w: 6, d: 4 };
export const DRAIN_GUARD_RAIL_M = 1.07;
/** A 60 in outfall pipe, through the headwall and out over the water. */
export const DRAIN_OUTFALL_RADIUS = 0.75;
export const DRAIN_OUTFALL_OVERHANG = 4;
/** How far behind the footprint's water edge the drain's pipe begins: just behind its headwall, the rest buried. */
const DRAIN_OUTFALL_BACK = 5;
/** The works' outfall begins at its contact tank, nearer the edge. */
const WORKS_OUTFALL_BACK = 3;

/** The works: an activated-sludge plant in the open on a 40 m square. */
export const WORKS_SCREEN_HOUSE = { w: 8, d: 6, h: 5 };
export const WORKS_GRIT_CHAMBER = { w: 6, d: 3, wall: 1.0 };
/** A 45 ft clarifier, its wall 1.2 m above grade, a 1 m bridge from rim to centre under a 1.07 m handrail. */
export const WORKS_CLARIFIER = { radius: 6.85, wall: 1.2, bridgeW: 1, rail: 1.07 };
export const WORKS_CLARIFIER_COUNT = 3;
export const WORKS_BASIN = { w: 20, d: 8, wall: 1.5, walkW: 1 };
export const WORKS_BLOWER_HOUSE = { w: 10, d: 6, h: 5 };
export const WORKS_DIGESTER = { radius: 6, h: 8, dome: 2.4 };
export const WORKS_CONTACT_TANK = { w: 6, d: 3.7, wall: 1.0, baffles: 2 };
export const WORKS_HOUSE = { w: 10, d: 5, h: 5 };

const PUMP_HOUSE_RGB: RGB = [0.78, 0.78, 0.76];
const MASONRY_RGB: RGB = [0.6, 0.5, 0.42];
const MASONRY_ROOF_RGB: RGB = [0.3, 0.31, 0.33];
const CLARIFIER_RGB: RGB = [0.7, 0.71, 0.7];
const CLARIFIER_WATER_RGB: RGB = [0.3, 0.42, 0.45];
const SLUDGE_RGB: RGB = [0.36, 0.33, 0.28];
const PIPE_STEEL_RGB: RGB = [0.33, 0.36, 0.4];
const HEADWALL_RGB: RGB = [0.6, 0.6, 0.58];
const RIPRAP_RGBS: readonly RGB[] = [
  [0.5, 0.49, 0.46],
  [0.42, 0.42, 0.4],
  [0.56, 0.54, 0.5],
];
const SCREEN_RGB: RGB = [0.22, 0.25, 0.27];
const TIMBER_RGB: RGB = [0.4, 0.3, 0.2];

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

/** An open concrete tank: four walls `wall` tall round `r`, and the liquid's surface just under the rim. */
function openTank(r: Rect, wall: number, liquid: RGB, t = 0.3): THREE.BufferGeometry[] {
  const c = rectCentre(r);
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  return [
    standingBox(w, wall, t, c.x, 0, r.z0 + t / 2, CLARIFIER_RGB),
    standingBox(w, wall, t, c.x, 0, r.z1 - t / 2, CLARIFIER_RGB),
    standingBox(t, wall, d - 2 * t, r.x0 + t / 2, 0, c.z, CLARIFIER_RGB),
    standingBox(t, wall, d - 2 * t, r.x1 - t / 2, 0, c.z, CLARIFIER_RGB),
    standingBox(w - 2 * t, 0.1, d - 2 * t, c.x, wall - 0.3, c.z, liquid),
  ];
}

/** A handrail along X or Z: two rails and a post every `pitch`, on a walkway whose top is `y0`. */
function handrail(
  parts: THREE.BufferGeometry[],
  a: number,
  b: number,
  fixed: number,
  alongX: boolean,
  y0: number,
  height: number,
  pitch = 1.8,
): void {
  const length = b - a;
  const mid = (a + b) / 2;
  const at = (along: number, w: number, h: number, y: number): void => {
    parts.push(
      alongX
        ? standingBox(w, h, 0.05, along, y, fixed, GEN_STEEL_RGB)
        : standingBox(0.05, h, w, fixed, y, along, GEN_STEEL_RGB),
    );
  };
  at(mid, length, 0.05, y0 + height - 0.05);
  at(mid, length, 0.04, y0 + height / 2);
  const posts = Math.max(1, Math.round(length / pitch));
  for (let i = 0; i <= posts; i++) at(a + (i * length) / posts, 0.06, height, y0);
}

/** A chain-link fence round `r` open to the water (+Z), with a gate on the land side (-Z) where `gate` is given. */
function shoreFence(parts: THREE.BufferGeometry[], r: Rect, gate: Gap | null): void {
  const h = GEN_FENCE_HEIGHT_M;
  const pitch = GEN_FENCE_POST_SPACING_M;
  fenceRun(parts, r.z0, r.z1, r.x0, false, h, pitch);
  fenceRun(parts, r.z0, r.z1, r.x1, false, h, pitch);
  if (!gate) {
    fenceRun(parts, r.x0, r.x1, r.z0, true, h, pitch);
    return;
  }
  fenceRun(parts, r.x0, gate.x0, r.z0, true, h, pitch);
  fenceRun(parts, gate.x1, r.x1, r.z0, true, h, pitch);
  for (const x of [gate.x0, gate.x1]) {
    parts.push(standingBox(0.25, h + 0.15, 0.25, x, 0, r.z0, GEN_FENCE_RGB));
  }
}

export interface PumpLayout {
  house: Rect;
  screenHouse: Rect;
  /** The travelling-screen frames, centred on the screen house's water face. */
  screens: Vec2[];
  wetWell: Vec2;
  surgeTank: Vec2;
  /** The discharge main runs along Z at `x`, from the vault to the house's land face. */
  main: { x: number; z0: number; z1: number };
  vault: Rect;
  transformer: Rect;
  pad: Rect;
  track: Rect;
  apron: Rect;
  fence: Rect;
  gate: Gap;
}

/** The pumping station in its 2×2, in the frame whose +Z is the water: the screen house at the water line, the pump house behind it, the wet well and tanks beside, the track in from the land side. Pure. */
export function computePumpLayout(footprint: FootprintSize): PumpLayout {
  const { halfD } = footprintHalfExtents(footprint);
  const house: Rect = {
    x0: -PUMP_HOUSE.w / 2,
    x1: PUMP_HOUSE.w / 2,
    z0: -2,
    z1: -2 + PUMP_HOUSE.d,
  };
  const sh = PUMP_SCREEN_HOUSE;
  const screenHouse: Rect = {
    x0: -sh.w / 2,
    x1: sh.w / 2,
    z0: halfD - sh.setback - sh.d,
    z1: halfD - sh.setback,
  };
  const vaultZ1 = -12;
  const main = { x: -3, z0: vaultZ1, z1: house.z0 };
  const transformer: Rect = {
    x0: 9,
    x1: 9 + GAS_TRANSFORMER.w,
    z0: -12,
    z1: -12 + GAS_TRANSFORMER.d,
  };
  const track: Rect = { x0: 2, x1: 2 + PUMP_TRACK_W, z0: -halfD, z1: house.z0 };
  return {
    house,
    screenHouse,
    screens: [-1, 1].map((s) => ({ x: s * 1.5, z: screenHouse.z1 })),
    wetWell: { x: -13, z: 8 },
    surgeTank: { x: 12, z: 6 },
    main,
    vault: {
      x0: main.x - PUMP_MAIN.vault.w / 2,
      x1: main.x + PUMP_MAIN.vault.w / 2,
      z0: vaultZ1 - PUMP_MAIN.vault.d,
      z1: vaultZ1,
    },
    transformer,
    pad: {
      x0: transformer.x0 - 1,
      x1: transformer.x1 + 1,
      z0: transformer.z0 - 1,
      z1: transformer.z1 + 1,
    },
    track,
    apron: { x0: house.x0 - 1.5, x1: house.x1 + 1.5, z0: house.z0 - 1.5, z1: screenHouse.z1 },
    fence: lotRect(footprint, GEN_FENCE_INSET_M),
    gate: { x0: track.x0 - 0.5, x1: track.x1 + 0.5 },
  };
}

function buildPumpGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { track, apron, pad } = computePumpLayout(footprint);
  return buildGeneratorGroundsGeometry(footprint, GEN_SCRUB_RGB, [
    { rect: apron, rgb: GEN_CONCRETE_RGB },
    { rect: pad, rgb: GEN_CONCRETE_RGB },
    { rect: track, rgb: GEN_DRIVE_RGB },
  ]);
}

/** The pump house under its gable, the screen house with its screens, the wet well, the surge tank, the main and its vault, the transformer and the fence; local Y=0 is the plate's top. */
function buildPumpStationGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computePumpLayout(footprint);
  const { house, screenHouse } = layout;
  const hc = rectCentre(house);
  const sc = rectCentre(screenHouse);
  const parts: THREE.BufferGeometry[] = [
    rectBox(house, 0, PUMP_HOUSE.eave, MASONRY_RGB),
    gableRoof(
      PUMP_HOUSE.w + 0.6,
      PUMP_HOUSE.ridge - PUMP_HOUSE.eave,
      PUMP_HOUSE.d + 0.6,
      hc.x,
      PUMP_HOUSE.eave,
      hc.z,
      MASONRY_ROOF_RGB,
    ),
    // The door on the land face, and a louvre on each gable end.
    standingBox(2.4, 3, 0.1, hc.x + 3, 0, house.z0 - 0.05, GEN_LOUVRE_RGB),
    standingBox(0.1, 1.2, 2, house.x0 - 0.05, 4, hc.z, GEN_LOUVRE_RGB),
    standingBox(0.1, 1.2, 2, house.x1 + 0.05, 4, hc.z, GEN_LOUVRE_RGB),
    ...cappedBox(screenHouse, PUMP_SCREEN_HOUSE.h, PUMP_HOUSE_RGB),
    standingBox(
      PUMP_WET_WELL.hatch,
      0.15,
      PUMP_WET_WELL.hatch,
      layout.wetWell.x,
      PUMP_WET_WELL.rim,
      layout.wetWell.z + 2,
      GEN_STEEL_RGB,
    ),
    rectBox(layout.vault, 0, PUMP_MAIN.vault.h, GEN_CONCRETE_RGB),
    ...transformerParts(layout.transformer, GAS_TRANSFORMER.h),
  ];
  for (const s of layout.screens) {
    parts.push(
      standingBox(
        PUMP_SCREEN.w,
        PUMP_SCREEN.h,
        PUMP_SCREEN.depth,
        s.x,
        0.4,
        sc.z + PUMP_SCREEN_HOUSE.d / 2 + PUMP_SCREEN.depth / 2,
        SCREEN_RGB,
      ),
      standingBox(
        PUMP_SCREEN.w + 0.3,
        0.3,
        PUMP_SCREEN.depth + 0.1,
        s.x,
        0.4 + PUMP_SCREEN.h,
        s.z + PUMP_SCREEN.depth / 2,
        GEN_STEEL_RGB,
      ),
    );
  }
  const well = new THREE.CylinderGeometry(
    PUMP_WET_WELL.radius,
    PUMP_WET_WELL.radius,
    PUMP_WET_WELL.rim,
    24,
  );
  well.translate(layout.wetWell.x, PUMP_WET_WELL.rim / 2, layout.wetWell.z);
  parts.push(paintVertexColor(well, hexFromRgb(CLARIFIER_RGB)));
  const tank = new THREE.CylinderGeometry(
    PUMP_SURGE_TANK.radius,
    PUMP_SURGE_TANK.radius,
    PUMP_SURGE_TANK.h,
    16,
  );
  tank.translate(layout.surgeTank.x, PUMP_SURGE_TANK.h / 2, layout.surgeTank.z);
  parts.push(paintVertexColor(tank, hexFromRgb(PUMP_HOUSE_RGB)));
  const main = buildPipeAlongZ(PUMP_MAIN.radius, layout.main.z0, layout.main.z1, PUMP_MAIN.radius);
  main.translate(layout.main.x, 0, 0);
  parts.push(main);
  shoreFence(parts, layout.fence, layout.gate);
  return mergeParts(parts);
}

/** The intake: from the screen house out past the footprint's edge, resting on its timber crib over the water. */
function buildPumpIntakeGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfD } = footprintHalfExtents(footprint);
  const { screenHouse } = computePumpLayout(footprint);
  const end = halfD + PUMP_INTAKE_OVERHANG;
  const crib = new THREE.BoxGeometry(PUMP_CRIB.w, PUMP_CRIB.depth, PUMP_CRIB.d);
  crib.translate(0, -PUMP_CRIB.depth / 2, end - PUMP_CRIB.d / 2);
  return mergeParts([
    buildPipeAlongZ(PUMP_INTAKE_RADIUS, screenHouse.z0, end, PUMP_INTAKE_RADIUS),
    paintVertexColor(crib, hexFromRgb(TIMBER_RGB)),
  ]);
}

export interface DrainLayout {
  headwall: Rect;
  /** Each wingwall's centre and its yaw off the headwall's line. */
  wingwalls: { x: number; z: number; yaw: number }[];
  apron: Rect;
}

/** The outfall in its 1×1, in the frame whose +Z is the water: the apron at the water's edge, the headwall behind it, the wingwalls flared toward the water. Pure. */
export function computeDrainLayout(footprint: FootprintSize): DrainLayout {
  const { halfD } = footprintHalfExtents(footprint);
  const apron: Rect = {
    x0: -DRAIN_APRON.w / 2,
    x1: DRAIN_APRON.w / 2,
    z0: halfD - DRAIN_APRON.d,
    z1: halfD,
  };
  const headwall: Rect = {
    x0: -DRAIN_HEADWALL.w / 2,
    x1: DRAIN_HEADWALL.w / 2,
    z0: apron.z0 - DRAIN_HEADWALL.t,
    z1: apron.z0,
  };
  const reach = (DRAIN_WINGWALL.length / 2) * Math.cos(DRAIN_WINGWALL.angle);
  return {
    headwall,
    wingwalls: [-1, 1].map((s) => ({
      x: s * (DRAIN_HEADWALL.w / 2 + reach),
      z: headwall.z1 + reach,
      yaw: -s * DRAIN_WINGWALL.angle,
    })),
    apron,
  };
}

/** The headwall with its wingwalls and guard rail, over the riprap apron as one rubble geometry; local Y=0 is the plate's top. */
function buildDrainHeadwallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { headwall, wingwalls, apron } = computeDrainLayout(footprint);
  const hc = rectCentre(headwall);
  const parts: THREE.BufferGeometry[] = [rectBox(headwall, 0, DRAIN_HEADWALL.h, HEADWALL_RGB)];
  for (const w of wingwalls) {
    const wall = new THREE.BoxGeometry(DRAIN_WINGWALL.length, DRAIN_WINGWALL.h, DRAIN_WINGWALL.t);
    wall.translate(0, DRAIN_WINGWALL.h / 2, 0);
    wall.rotateY(w.yaw);
    wall.translate(w.x, 0, w.z);
    parts.push(paintVertexColor(wall, hexFromRgb(HEADWALL_RGB)));
  }
  handrail(parts, headwall.x0, headwall.x1, hc.z, true, DRAIN_HEADWALL.h, DRAIN_GUARD_RAIL_M);
  // The apron: a bed of stones on a grid, each turned and sized by its place.
  const cell = 0.75;
  const across = Math.floor((apron.x1 - apron.x0) / cell);
  const deep = Math.floor((apron.z1 - apron.z0) / cell);
  for (let i = 0; i < across; i++) {
    for (let k = 0; k < deep; k++) {
      const n = i * 7 + k * 13;
      const size = 0.5 + hash1(n) * 0.3;
      const height = 0.2 + hash1(n + 1) * 0.25;
      const stone = new THREE.BoxGeometry(size, height, size * (0.7 + hash1(n + 2) * 0.5));
      stone.translate(0, height / 2, 0);
      stone.rotateY(hash1(n + 3) * Math.PI);
      stone.translate(apron.x0 + (i + 0.5) * cell, 0, apron.z0 + (k + 0.5) * cell);
      parts.push(paintVertexColor(stone, hexFromRgb(RIPRAP_RGBS[n % RIPRAP_RGBS.length]!)));
    }
  }
  return mergeParts(parts);
}

/** An outfall pipe: from `back` behind the footprint's water edge out over the water, its centre `y` up. */
function buildOutfallGeometry(
  footprint: FootprintSize,
  back: number,
  y: number,
): THREE.BufferGeometry {
  const { halfD } = footprintHalfExtents(footprint);
  return buildPipeAlongZ(DRAIN_OUTFALL_RADIUS, halfD - back, halfD + DRAIN_OUTFALL_OVERHANG, y);
}

/** The drain's outfall: through the headwall, over the apron's stones and out over the water. */
function buildDrainOutfallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  return buildOutfallGeometry(footprint, DRAIN_OUTFALL_BACK, DRAIN_OUTFALL_RADIUS + 0.45);
}

export interface WorksLayout {
  screenHouse: Rect;
  grit: Rect;
  /** The two primary clarifiers, then the secondary. */
  clarifiers: Vec2[];
  basin: Rect;
  walkway: Rect;
  blower: Rect;
  digester: Vec2;
  contact: Rect;
  house: Rect;
  apron: Rect;
}

/** The works in its 2×2, in the frame whose +Z is the water: the inlet works on the land side, the primaries beside them, the basin and secondary across the middle, the digester, contact tank and control house by the outfall. Pure. */
export function computeWorksLayout(footprint: FootprintSize): WorksLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const sh = WORKS_SCREEN_HOUSE;
  const grit = WORKS_GRIT_CHAMBER;
  const basin: Rect = { x0: -19, x1: -19 + WORKS_BASIN.w, z0: -3, z1: -3 + WORKS_BASIN.d };
  const house: Rect = { x0: 9, x1: 9 + WORKS_HOUSE.w, z0: 14, z1: 14 + WORKS_HOUSE.d };
  return {
    screenHouse: { x0: 11, x1: 11 + sh.w, z0: -19, z1: -19 + sh.d },
    grit: { x0: 11, x1: 11 + grit.w, z0: -12.5, z1: -12.5 + grit.d },
    clarifiers: [
      { x: -12.5, z: -11.5 },
      { x: 1.5, z: -11.5 },
      { x: 12, z: 7 },
    ],
    basin,
    walkway: { x0: basin.x0, x1: basin.x1, z0: basin.z1, z1: basin.z1 + WORKS_BASIN.walkW },
    blower: { x0: 9, x1: 9 + WORKS_BLOWER_HOUSE.w, z0: -7, z1: -7 + WORKS_BLOWER_HOUSE.d },
    digester: { x: -13, z: 13 },
    contact: { x0: 2, x1: 2 + WORKS_CONTACT_TANK.w, z0: 14, z1: 14 + WORKS_CONTACT_TANK.d },
    house,
    apron: { x0: -halfW + 1, x1: halfW - 1, z0: -halfD + 1, z1: halfD - 1 },
  };
}

function buildWorksGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { apron, screenHouse } = computeWorksLayout(footprint);
  const { halfD } = footprintHalfExtents(footprint);
  // The inlet works' way in runs from the apron out to the land edge.
  const inlet: Rect = { x0: screenHouse.x0, x1: screenHouse.x1, z0: -halfD, z1: apron.z0 };
  return buildGeneratorGroundsGeometry(footprint, GEN_SCRUB_RGB, [
    { rect: apron, rgb: GEN_CONCRETE_RGB },
    { rect: inlet, rgb: GEN_CONCRETE_RGB },
  ]);
}

/** One clarifier at its own origin: the concrete ring, the settled water, the centre mechanism and the radial bridge with its handrail from the rim (-Z) to the centre. */
function buildWorksClarifierGeometry(): THREE.BufferGeometry {
  const { radius, wall, bridgeW, rail } = WORKS_CLARIFIER;
  const ring = new THREE.CylinderGeometry(radius, radius, wall, 28);
  ring.translate(0, wall / 2, 0);
  // The water lies just over the ring's cap, so the rim reads 0.4 m wide round it.
  const water = new THREE.CylinderGeometry(radius - 0.4, radius - 0.4, 0.1, 28);
  water.translate(0, wall + 0.05, 0);
  const drive = new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12);
  drive.translate(0, wall + 0.8, 0);
  const parts: THREE.BufferGeometry[] = [
    paintVertexColor(ring, hexFromRgb(CLARIFIER_RGB)),
    paintVertexColor(water, hexFromRgb(CLARIFIER_WATER_RGB)),
    paintVertexColor(drive, hexFromRgb(GEN_STEEL_RGB)),
    standingBox(bridgeW, 0.15, radius, 0, wall, -radius / 2, GEN_STEEL_RGB),
  ];
  for (const s of [-1, 1]) {
    handrail(parts, -radius, -0.9, (s * bridgeW) / 2, false, wall + 0.15, rail);
  }
  return mergeParts(parts);
}

/** Everything of the works but the clarifiers and the outfall: the inlet works, the basin and its walkway, the blower house, the digester under its dome, the contact tank with its baffles and the control house; local Y=0 is the plate's top. */
function buildWorksPlantGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeWorksLayout(footprint);
  const { basin, contact, walkway } = layout;
  const parts: THREE.BufferGeometry[] = [
    ...cappedBox(layout.screenHouse, WORKS_SCREEN_HOUSE.h, PUMP_HOUSE_RGB),
    ...openTank(layout.grit, WORKS_GRIT_CHAMBER.wall, CLARIFIER_WATER_RGB),
    ...openTank(basin, WORKS_BASIN.wall, SLUDGE_RGB),
    rectBox(walkway, WORKS_BASIN.wall - 0.15, 0.15, GEN_STEEL_RGB),
    ...cappedBox(layout.blower, WORKS_BLOWER_HOUSE.h, GEN_ENCLOSURE_RGB),
    ...openTank(contact, WORKS_CONTACT_TANK.wall, CLARIFIER_WATER_RGB, 0.2),
    ...cappedBox(layout.house, WORKS_HOUSE.h, PUMP_HOUSE_RGB),
    // The contact tank's outlet into the outfall.
    standingBox(
      contact.x0 + 0.2,
      0.4,
      0.4,
      contact.x0 / 2,
      0.3,
      (contact.z0 + contact.z1) / 2,
      PIPE_STEEL_RGB,
    ),
  ];
  handrail(
    parts,
    walkway.x0,
    walkway.x1,
    walkway.z1 - 0.03,
    true,
    WORKS_BASIN.wall,
    WORKS_CLARIFIER.rail,
  );
  for (let i = 1; i <= WORKS_CONTACT_TANK.baffles; i++) {
    const x = contact.x0 + ((contact.x1 - contact.x0) * i) / (WORKS_CONTACT_TANK.baffles + 1);
    const span = contact.z1 - contact.z0 - 0.2;
    parts.push(
      standingBox(
        0.15,
        WORKS_CONTACT_TANK.wall,
        span - 0.6,
        x,
        0,
        (contact.z0 + contact.z1) / 2 + (i % 2 ? 0.3 : -0.3),
        CLARIFIER_RGB,
      ),
    );
  }
  const { radius, h, dome } = WORKS_DIGESTER;
  const tank = new THREE.CylinderGeometry(radius, radius, h, 24);
  tank.translate(layout.digester.x, h / 2, layout.digester.z);
  parts.push(paintVertexColor(tank, hexFromRgb(CLARIFIER_RGB)));
  const cover = new THREE.SphereGeometry(radius, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cover.scale(1, dome / radius, 1);
  cover.translate(layout.digester.x, h, layout.digester.z);
  parts.push(paintVertexColor(cover, hexFromRgb(GEN_STEEL_RGB)));
  return mergeParts(parts);
}

/** The works' outfall: out of the contact tank and over the water. */
function buildWorksOutfallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  return buildOutfallGeometry(footprint, WORKS_OUTFALL_BACK, DRAIN_OUTFALL_RADIUS);
}

// ---------------------------------------------------------------------------
// coal-plant: a two-unit plant on its 80 m square, local +Z the street side.
// The boiler house and turbine hall on the left, the precipitator and the two
// striped stacks behind them, the stockpile and its crusher house across the
// back, the conveyor gallery climbing from the crusher to the boiler house,
// the cooling tower along the right side, the switchyard on the street, and
// a chain-link fence round it all with a gate on the drive.
// ---------------------------------------------------------------------------

export const COAL_BOILER_HOUSE = { w: 24, d: 18, h: 32 };
export const COAL_TURBINE_HALL = { w: 36, d: 16, h: 15 };
/** The electrostatic precipitator: a box on 2 m legs. */
export const COAL_ESP = { w: 12, d: 10, h: 14, legs: 2 };
export const COAL_SMOKESTACK_COUNT = 2;
/** 250 ft stacks, 4.5 m across at the base, in the striped chimney language. */
export const COAL_STACK = { h: 76, radiusBottom: 2.25, radiusTop: 1.9, bands: 8 };
const COAL_FLUE = { size: 2.4, y: 9 };
/** The stockpile: 40 m long and 12 m high at a 37° angle of repose, which sets its width. */
export const COAL_HEAP = { length: 40, height: 12, repose: (37 * Math.PI) / 180 };
export const COAL_HEAP_WIDTH = (2 * COAL_HEAP.height) / Math.tan(COAL_HEAP.repose);
export const COAL_CRUSHER_HOUSE = { w: 6, d: 6, h: 8 };
/** The enclosed conveyor gallery: a 2.4 m box at 18° on a bent every 12 m. */
export const COAL_GALLERY = { size: 2.4, pitch: (18 * Math.PI) / 180, bentSpacing: 12 };
/** A four-cell mechanical-draft cooling tower, 36.8 × 13.7 × 9.4 m, laid along Z. */
export const COAL_TOWER = { long: 36.8, wide: 13.7, h: 9.4, cells: 4 };
/** The ash silo: 8 m across and 15 m to its top, on legs under its cone. */
export const COAL_ASH_SILO = { radius: 4, h: 15, legs: 3, cone: 3 };
const COAL_GANTRY = { span: 8, h: 12 };

const COAL_HALL_RGB: RGB = [0.13, 0.13, 0.14];
const COAL_ROOF_CAP_RGB: RGB = [0.09, 0.09, 0.1];
/** Chimney language: alternating bands, off-white/bone vs. a muted warning red (same values as facade.ts's ACCENT_RED, duplicated locally). */
const COAL_STACK_LIGHT_RGB: RGB = [0.85, 0.83, 0.79];
const COAL_STACK_ACCENT_RGB: RGB = [0.72, 0.2, 0.18];
const COAL_HEAP_RGB: RGB = [0.12, 0.1, 0.09];
const COAL_YARD_RGB: RGB = [0.22, 0.2, 0.19];
const COAL_GALLERY_RGB: RGB = [0.46, 0.48, 0.5];

export interface CoalPlantLayout {
  boiler: Rect;
  hall: Rect;
  esp: Rect;
  stacks: Vec2[];
  flue: Rect;
  heap: Rect;
  crusher: Rect;
  /** The gallery's lower end on the crusher house's roof and its upper end at the boiler house's wall. */
  gallery: { from: Vec3; to: Vec3 };
  /** Where each bent stands under the gallery, and the gallery's underside there. */
  bents: Vec3[];
  tower: Rect;
  fans: Vec2[];
  silo: Vec2;
  transformers: Rect[];
  gantries: Vec2[];
  apron: Rect;
  yard: Rect;
  drive: Rect;
  fence: Rect;
  gate: Gap;
}

/** The plant in its 4×4, in the footprint frame. Pure; fixed per footprint. */
export function computeCoalPlantLayout(footprint: FootprintSize): CoalPlantLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const boiler: Rect = {
    x0: -38,
    x1: -38 + COAL_BOILER_HOUSE.w,
    z0: -14,
    z1: -14 + COAL_BOILER_HOUSE.d,
  };
  const hall: Rect = {
    x0: -38,
    x1: -38 + COAL_TURBINE_HALL.w,
    z0: boiler.z1,
    z1: boiler.z1 + COAL_TURBINE_HALL.d,
  };
  const esp: Rect = { x0: -38, x1: -38 + COAL_ESP.w, z0: -26, z1: -26 + COAL_ESP.d };
  const stackZ = (esp.z0 + esp.z1) / 2;
  const stacks = [-16, -6].map((x) => ({ x, z: stackZ }));
  const heap: Rect = {
    x0: -1,
    x1: -1 + COAL_HEAP.length,
    z0: -halfD + 1,
    z1: -halfD + 1 + COAL_HEAP_WIDTH,
  };
  const crusher: Rect = { x0: 33, x1: 33 + COAL_CRUSHER_HOUSE.w, z0: -6, z1: 0 };
  const cc = rectCentre(crusher);
  const from: Vec3 = { x: cc.x, y: COAL_CRUSHER_HOUSE.h, z: cc.z };
  const toX = boiler.x1;
  const toZ = (boiler.z0 + boiler.z1) / 2;
  const run = Math.hypot(toX - from.x, toZ - from.z);
  const to: Vec3 = { x: toX, y: from.y + run * Math.tan(COAL_GALLERY.pitch), z: toZ };
  const bents: Vec3[] = [];
  for (let s = COAL_GALLERY.bentSpacing; s < run - 2; s += COAL_GALLERY.bentSpacing) {
    const t = s / run;
    bents.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - COAL_GALLERY.size / 2,
      z: from.z + (to.z - from.z) * t,
    });
  }
  const tower: Rect = { x0: 24, x1: 24 + COAL_TOWER.wide, z0: 2, z1: 2 + COAL_TOWER.long };
  const cell = COAL_TOWER.long / COAL_TOWER.cells;
  const transformerZ0 = 26;
  const gantryZ = 34;
  const gateX0 = 1;
  return {
    boiler,
    hall,
    esp,
    stacks,
    flue: {
      x0: esp.x1,
      x1: stacks[stacks.length - 1]!.x,
      z0: stackZ - COAL_FLUE.size / 2,
      z1: stackZ + COAL_FLUE.size / 2,
    },
    heap,
    crusher,
    gallery: { from, to },
    bents,
    tower,
    fans: Array.from({ length: COAL_TOWER.cells }, (_, i) => ({
      x: (tower.x0 + tower.x1) / 2,
      z: tower.z0 + cell / 2 + i * cell,
    })),
    silo: { x: -32, z: -33 },
    transformers: [-30, -18, -6].map((x) => ({
      x0: x - CC_TRANSFORMER.w / 2,
      x1: x + CC_TRANSFORMER.w / 2,
      z0: transformerZ0,
      z1: transformerZ0 + CC_TRANSFORMER.d,
    })),
    gantries: [-30, -18, -6].map((x) => ({ x, z: gantryZ })),
    apron: { x0: -halfW + 1, x1: 22, z0: -15, z1: 22 },
    yard: { x0: -2, x1: halfW - GEN_FENCE_INSET_M, z0: -halfD + GEN_FENCE_INSET_M, z1: -6 },
    drive: { x0: gateX0 + 0.5, x1: gateX0 + GEN_GATE_M + 1 - 0.5, z0: 22, z1: halfD },
    fence: lotRect(footprint, GEN_FENCE_INSET_M),
    gate: { x0: gateX0, x1: gateX0 + GEN_GATE_M + 1 },
  };
}

/** The 2 smokestacks' footprint-frame centres. Pure. */
export function computeCoalSmokestackLocalPlacements(footprint: FootprintSize): Vec2[] {
  return computeCoalPlantLayout(footprint).stacks;
}

/** A transmission gantry: two posts and a crossbar, centred on `g`. */
function gantryParts(g: Vec2, span: number, h: number): THREE.BufferGeometry[] {
  return [
    standingBox(0.6, h, 0.6, g.x - span / 2, 0, g.z, GEN_STEEL_RGB),
    standingBox(0.6, h, 0.6, g.x + span / 2, 0, g.z, GEN_STEEL_RGB),
    standingBox(span + 0.6, 0.6, 0.6, g.x, h - 0.6, g.z, GEN_STEEL_RGB),
  ];
}

/** A box `size` square and `length` long, lying along +Z from its origin, tilted up by `pitch` and turned to `yaw`. */
function tiltedBox(
  size: number,
  length: number,
  pitch: number,
  yaw: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(size, size, length);
  box.translate(0, 0, length / 2);
  box.rotateX(-pitch);
  box.rotateY(yaw);
  return paintVertexColor(box, hexFromRgb(rgb));
}

function buildCoalGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { apron, yard, drive } = computeCoalPlantLayout(footprint);
  return buildGeneratorGroundsGeometry(footprint, GEN_GRAVEL_RGB, [
    { rect: apron, rgb: GEN_CONCRETE_RGB },
    { rect: yard, rgb: COAL_YARD_RGB },
    { rect: drive, rgb: GEN_DRIVE_RGB },
  ]);
}

/** Everything of the plant but the stacks and the stockpile, merged; local Y=0 is the plate's top. */
function buildCoalPlantGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeCoalPlantLayout(footprint);
  const { boiler, hall, esp, crusher, tower, gallery } = layout;
  const hc = rectCentre(hall);
  const ec = rectCentre(esp);
  const parts: THREE.BufferGeometry[] = [
    ...cappedBox(boiler, COAL_BOILER_HOUSE.h, COAL_HALL_RGB, 0.6, COAL_ROOF_CAP_RGB),
    ...cappedBox(hall, COAL_TURBINE_HALL.h, GEN_ENCLOSURE_RGB, 0.5),
    // The darker band round the hall's cladding, proud of every face.
    standingBox(
      COAL_TURBINE_HALL.w + 0.2,
      1.5,
      COAL_TURBINE_HALL.d + 0.2,
      hc.x,
      8,
      hc.z,
      NUCLEAR_CLADDING_BAND_RGB,
    ),
    rectBox(esp, COAL_ESP.legs, COAL_ESP.h, GEN_STEEL_RGB),
    rectBox(layout.flue, COAL_FLUE.y - COAL_FLUE.size / 2, COAL_FLUE.size, GEN_STEEL_RGB),
    // The duct from the boiler house into the precipitator.
    standingBox(
      COAL_FLUE.size,
      COAL_FLUE.size,
      boiler.z0 - esp.z1 + 0.4,
      ec.x,
      COAL_FLUE.y - COAL_FLUE.size / 2,
      (boiler.z0 + esp.z1) / 2,
      GEN_STEEL_RGB,
    ),
    ...cappedBox(crusher, COAL_CRUSHER_HOUSE.h, GEN_ENCLOSURE_RGB),
    rectBox(tower, 0, COAL_TOWER.h, GEN_ENCLOSURE_RGB),
  ];
  for (const x of [esp.x0 + 1, esp.x1 - 1]) {
    for (const z of [esp.z0 + 1, esp.z1 - 1]) {
      parts.push(standingBox(0.6, COAL_ESP.legs, 0.6, x, 0, z, GEN_STEEL_RGB));
    }
  }
  // The gallery from the crusher house up to the boiler house, and a bent under it every 12 m.
  const dx = gallery.to.x - gallery.from.x;
  const dz = gallery.to.z - gallery.from.z;
  const run = Math.hypot(dx, dz);
  const length = Math.hypot(run, gallery.to.y - gallery.from.y);
  const yaw = Math.atan2(dx, dz);
  const box = tiltedBox(COAL_GALLERY.size, length, COAL_GALLERY.pitch, yaw, COAL_GALLERY_RGB);
  box.translate(gallery.from.x, gallery.from.y, gallery.from.z);
  parts.push(box);
  const across = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  for (const b of layout.bents) {
    for (const s of [-1, 1]) {
      parts.push(
        standingBox(
          0.4,
          b.y,
          0.4,
          b.x + s * across.x * 1.4,
          0,
          b.z + s * across.z * 1.4,
          GEN_STEEL_RGB,
        ),
      );
    }
    const bar = new THREE.BoxGeometry(3.2, 0.4, 0.4);
    bar.rotateY(yaw);
    bar.translate(b.x, b.y - 0.2, b.z);
    parts.push(paintVertexColor(bar, hexFromRgb(GEN_STEEL_RGB)));
  }
  // The tower's louvres on both long faces, and a fan stack on each cell.
  const tc = rectCentre(tower);
  for (const x of [tower.x0 - 0.06, tower.x1 + 0.06]) {
    parts.push(standingBox(0.12, 5, COAL_TOWER.long - 2, x, 1.5, tc.z, GEN_LOUVRE_RGB));
  }
  for (const fan of layout.fans) {
    const ring = new THREE.CylinderGeometry(CC_FAN.radius, CC_FAN.radius, CC_FAN.h, 16);
    ring.translate(fan.x, COAL_TOWER.h + CC_FAN.h / 2, fan.z);
    parts.push(paintVertexColor(ring, hexFromRgb(GEN_STEEL_RGB)));
    const mouth = new THREE.CylinderGeometry(CC_FAN.radius - 0.4, CC_FAN.radius - 0.4, 0.1, 16);
    mouth.translate(fan.x, COAL_TOWER.h + CC_FAN.h + 0.02, fan.z);
    parts.push(paintVertexColor(mouth, hexFromRgb(GEN_STACK_RIM_RGB)));
  }
  // The ash silo: a cone under a drum, on legs.
  const { radius, h, legs, cone } = COAL_ASH_SILO;
  const drum = new THREE.CylinderGeometry(radius, radius, h - legs - cone, 16);
  drum.translate(layout.silo.x, legs + cone + (h - legs - cone) / 2, layout.silo.z);
  parts.push(paintVertexColor(drum, hexFromRgb(GEN_FILTER_RGB)));
  const hopper = new THREE.CylinderGeometry(radius, 0.6, cone, 16);
  hopper.translate(layout.silo.x, legs + cone / 2, layout.silo.z);
  parts.push(paintVertexColor(hopper, hexFromRgb(GEN_STEEL_RGB)));
  for (const a of [0, 1, 2, 3]) {
    const angle = (a * Math.PI) / 2 + Math.PI / 4;
    parts.push(
      standingBox(
        0.5,
        legs + cone,
        0.5,
        layout.silo.x + Math.cos(angle) * (radius - 0.5),
        0,
        layout.silo.z + Math.sin(angle) * (radius - 0.5),
        GEN_STEEL_RGB,
      ),
    );
  }
  for (const t of layout.transformers) parts.push(...transformerParts(t, CC_TRANSFORMER.h));
  for (const g of layout.gantries) parts.push(...gantryParts(g, COAL_GANTRY.span, COAL_GANTRY.h));
  fenceLoop(parts, layout.fence, GEN_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

/** One shared smokestack geometry (alternating striped bands, tapered), instanced at both stack positions; local Y=0 is the plate's top. */
function buildCoalSmokestackGeometry(): THREE.BufferGeometry {
  const segmentHeight = COAL_STACK.h / COAL_STACK.bands;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < COAL_STACK.bands; i++) {
    const t0 = i / COAL_STACK.bands;
    const t1 = (i + 1) / COAL_STACK.bands;
    const rBottom = lerpNum(COAL_STACK.radiusBottom, COAL_STACK.radiusTop, t0);
    const rTop = lerpNum(COAL_STACK.radiusBottom, COAL_STACK.radiusTop, t1);
    const segment = new THREE.CylinderGeometry(rTop, rBottom, segmentHeight, 12);
    segment.translate(0, i * segmentHeight + segmentHeight / 2, 0);
    paintVertexColor(
      segment,
      hexFromRgb(i % 2 === 0 ? COAL_STACK_LIGHT_RGB : COAL_STACK_ACCENT_RGB),
    );
    parts.push(segment);
  }
  return mergeParts(parts);
}

/** The stockpile as one faceted heap: a box whose top is drawn in to a crest along X at the angle of repose on every side; local Y=0 is the plate's top. */
function buildCoalHeapGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { heap } = computeCoalPlantLayout(footprint);
  const c = rectCentre(heap);
  const length = heap.x1 - heap.x0;
  const width = heap.z1 - heap.z0;
  const inset = width / 2;
  const pile = new THREE.BoxGeometry(length, COAL_HEAP.height, width);
  const position = pile.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) {
      position.setX(i, Math.sign(position.getX(i)) * (length / 2 - inset));
      position.setZ(i, 0);
    }
  }
  pile.computeVertexNormals();
  pile.translate(c.x, COAL_HEAP.height / 2, c.z);
  return paintVertexColor(pile, hexFromRgb(COAL_HEAP_RGB));
}

// ---------------------------------------------------------------------------
// incinerator: a mass-burn waste-to-energy plant on its 80 m square, local +Z
// the street side. The tipping hall with its three doors on the street, the
// boiler hall behind it, the baghouse and the one stack beside that, the
// turbine hall at the back, the truck scale at the gate with a queue lane to
// the doors, and the fence.
// ---------------------------------------------------------------------------

export const INCINERATOR_TIPPING_HALL = { w: 50, d: 25, h: 15 };
export const INCINERATOR_DOOR = { w: 6, h: 7, count: 3 };
export const INCINERATOR_BOILER_HALL = { w: 30, d: 25, h: 40 };
export const INCINERATOR_BAGHOUSE = { w: 15, d: 10, h: 18 };
/** The 240 ft stack, 3 m across. */
export const INCINERATOR_STACK = { h: 73, radius: 1.5 };
export const INCINERATOR_TURBINE_HALL = { w: 25, d: 12, h: 12 };
const INCINERATOR_FLUE = { size: 2.4, y: 12 };
const INCINERATOR_LANE_W = 6;

const INCINERATOR_HALL_RGB: RGB = [0.42, 0.435, 0.447];
const INCINERATOR_ROOF_CAP_RGB: RGB = [0.3, 0.31, 0.32];
const INCINERATOR_BOILER_RGB: RGB = [0.62, 0.64, 0.64];
const INCINERATOR_DOOR_RGB: RGB = [0.22, 0.28, 0.31];

export interface IncineratorLayout {
  tipping: Rect;
  /** The doors' centres along the tipping hall's street face. */
  doors: Vec2[];
  boiler: Rect;
  baghouse: Rect;
  stack: Vec2;
  turbine: Rect;
  weighbridge: Vec2;
  scaleHouse: Vec2;
  lane: Rect;
  apron: Rect;
  fence: Rect;
  gate: Gap;
}

/** The plant in its 4×4, in the footprint frame. Pure; fixed per footprint. */
export function computeIncineratorLayout(footprint: FootprintSize): IncineratorLayout {
  const { halfD } = footprintHalfExtents(footprint);
  const tipping: Rect = {
    x0: -38,
    x1: -38 + INCINERATOR_TIPPING_HALL.w,
    z0: 0,
    z1: INCINERATOR_TIPPING_HALL.d,
  };
  const tc = rectCentre(tipping);
  const boiler: Rect = {
    x0: -30,
    x1: -30 + INCINERATOR_BOILER_HALL.w,
    z0: -INCINERATOR_BOILER_HALL.d,
    z1: 0,
  };
  const baghouse: Rect = {
    x0: 2,
    x1: 2 + INCINERATOR_BAGHOUSE.w,
    z0: -25,
    z1: -25 + INCINERATOR_BAGHOUSE.d,
  };
  const gateX0 = 26;
  // The queue lane runs from the gate past the tipping hall's front, the scale on it just inside the gate.
  const lane: Rect = { x0: gateX0, x1: gateX0 + INCINERATOR_LANE_W, z0: 12, z1: halfD };
  const bridge = TRANSFER_WEIGHBRIDGE_SIZE;
  const weighbridge: Vec2 = { x: (lane.x0 + lane.x1) / 2, z: halfD - 2 - bridge.l / 2 };
  return {
    tipping,
    doors: Array.from({ length: INCINERATOR_DOOR.count }, (_, i) => ({
      x:
        tc.x +
        (i - (INCINERATOR_DOOR.count - 1) / 2) *
          (INCINERATOR_TIPPING_HALL.w / (INCINERATOR_DOOR.count + 0.5)),
      z: tipping.z1,
    })),
    boiler,
    baghouse,
    stack: { x: 24, z: (baghouse.z0 + baghouse.z1) / 2 },
    turbine: {
      x0: -30,
      x1: -30 + INCINERATOR_TURBINE_HALL.w,
      z0: -38,
      z1: -38 + INCINERATOR_TURBINE_HALL.d,
    },
    weighbridge,
    scaleHouse: {
      x: lane.x1 + TRANSFER_SCALE_GAP + TRANSFER_SCALE_HOUSE_SIZE.w / 2,
      z: weighbridge.z,
    },
    lane,
    apron: { x0: tipping.x0, x1: lane.x1, z0: tipping.z1, z1: tipping.z1 + 9 },
    fence: lotRect(footprint, GEN_FENCE_INSET_M),
    gate: { x0: gateX0, x1: gateX0 + INCINERATOR_LANE_W },
  };
}

/** The stack's footprint-frame centre. Pure. */
export function computeIncineratorStackLocalPlacement(footprint: FootprintSize): Vec2 {
  return computeIncineratorLayout(footprint).stack;
}

function buildIncineratorGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { apron, lane } = computeIncineratorLayout(footprint);
  return buildGeneratorGroundsGeometry(footprint, GEN_GRAVEL_RGB, [
    { rect: apron, rgb: GEN_CONCRETE_RGB },
    { rect: lane, rgb: GEN_DRIVE_RGB },
  ]);
}

/** Everything of the plant but the stack, merged; local Y=0 is the plate's top. */
function buildIncineratorPlantGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeIncineratorLayout(footprint);
  const { tipping, boiler, baghouse } = layout;
  const flueY = INCINERATOR_FLUE.y - INCINERATOR_FLUE.size / 2;
  const bc = rectCentre(baghouse);
  const parts: THREE.BufferGeometry[] = [
    ...cappedBox(
      tipping,
      INCINERATOR_TIPPING_HALL.h,
      INCINERATOR_HALL_RGB,
      0.6,
      INCINERATOR_ROOF_CAP_RGB,
    ),
    ...cappedBox(
      boiler,
      INCINERATOR_BOILER_HALL.h,
      INCINERATOR_BOILER_RGB,
      0.6,
      INCINERATOR_ROOF_CAP_RGB,
    ),
    ...cappedBox(baghouse, INCINERATOR_BAGHOUSE.h, GEN_FILTER_RGB, 0.4),
    ...cappedBox(layout.turbine, INCINERATOR_TURBINE_HALL.h, GEN_ENCLOSURE_RGB, 0.4),
    // The flue from the boiler hall through the baghouse to the stack.
    standingBox(
      baghouse.x0 - boiler.x1 + 0.4,
      INCINERATOR_FLUE.size,
      INCINERATOR_FLUE.size,
      (boiler.x1 + baghouse.x0) / 2,
      flueY,
      bc.z,
      GEN_STEEL_RGB,
    ),
    standingBox(
      layout.stack.x - baghouse.x1 + 0.4,
      INCINERATOR_FLUE.size,
      INCINERATOR_FLUE.size,
      (baghouse.x1 + layout.stack.x) / 2,
      flueY,
      bc.z,
      GEN_STEEL_RGB,
    ),
    ...scaleParts(layout.weighbridge, layout.scaleHouse),
  ];
  for (const door of layout.doors) {
    parts.push(
      standingBox(
        INCINERATOR_DOOR.w,
        INCINERATOR_DOOR.h,
        0.3,
        door.x,
        0,
        door.z + 0.15,
        INCINERATOR_DOOR_RGB,
      ),
    );
  }
  fenceLoop(parts, layout.fence, GEN_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

/** The one stack at its own origin, with a dark rim at its mouth; local Y=0 is the plate's top. */
function buildIncineratorStackGeometry(): THREE.BufferGeometry {
  return buildStackGeometry(
    0,
    0,
    0,
    INCINERATOR_STACK.h,
    INCINERATOR_STACK.radius + 0.15,
    INCINERATOR_STACK.radius,
  );
}

// ---------------------------------------------------------------------------
// recycling-depot: a maintenance shed + office on the back of a paved yard,
// four side-loaders parked in a row in front of the bay doors. Local +Z is the
// street side; the ground plinth under the whole lot is the yard's pavement.
// ---------------------------------------------------------------------------

export const RECYCLING_TRUCK_COUNT = 4;
/** A 30 yd³ roll-off: 22 × 8 ft in plan and 5 ft tall. */
export const RECYCLING_ROLL_OFF = { w: 2.4, l: 6.7, h: 1.5 };
export const RECYCLING_ROLL_OFF_COUNT = 6;
const RECYCLING_ROLL_OFF_PITCH = 3;
/** The aisle before the roll-offs, and the pull clearance a hook-lift needs in front of one. */
export const RECYCLING_AISLE_M = 7.3;
export const RECYCLING_PULL_M = 12;
/** The drop-off stalls along the aisle. */
export const RECYCLING_STALL = { w: 2.7, l: 5.5 };
export const RECYCLING_STALL_COUNT = 8;
/** The sorting shed, 6 m to the eave and open on the yard side. */
export const RECYCLING_SHED_SIZE = { w: 12, d: 8, h: 6 };
export const RECYCLING_OFFICE_SIZE = { w: 4, d: 3, h: 3.2 };
const RECYCLING_ROOF_CAP_HEIGHT = 0.4;
const RECYCLING_TRUCK_SPACING = 6.5;

/** The paved yard is a slab over the whole lot, standing just proud of the ground plinth so the two never z-fight. */
export const RECYCLING_YARD_HEIGHT = 0.3;
/** How far a yard's footing reaches below the highest ground under its lot. */
export const YARD_FOOTING_DEPTH = 8;

const RECYCLING_YARD_RGB: RGB = [0.3, 0.32, 0.33];
const RECYCLING_SHED_RGB: RGB = [0.62, 0.64, 0.64];
const RECYCLING_ROOF_RGB: RGB = [0.36, 0.4, 0.42];
const RECYCLING_OFFICE_RGB: RGB = [0.78, 0.76, 0.7];
const RECYCLING_OFFICE_ROOF_RGB: RGB = [0.4, 0.42, 0.44];
const RECYCLING_ROLL_OFF_RGB: RGB = [0.2, 0.42, 0.3];

export interface RecyclingDepotLayout {
  shed: Rect;
  office: Rect;
  /** Footprint-frame centre of each roll-off, long side along Z, in a row along the yard's back. */
  rollOffs: Vec2[];
  /** The stalls along the aisle, head-in toward the roll-offs. */
  stalls: Rect[];
  /** Footprint-frame centre of each parked truck; every truck's nose points to local +Z. */
  trucks: Vec2[];
  fence: Rect;
  gate: Gap;
}

/**
 * The roll-offs in a row along the back, the aisle and the hook-lift's pull
 * clearance before them, the stalls along the aisle's far side, the shed at
 * the back-right, the office by the gate and the trucks on their apron.
 * Pure; fixed per footprint.
 */
export function computeRecyclingDepotLayout(footprint: FootprintSize): RecyclingDepotLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const back = -halfD + 1;
  const rollOffZ = back + RECYCLING_ROLL_OFF.l / 2;
  const rollOffs: Vec2[] = [];
  for (let i = 0; i < RECYCLING_ROLL_OFF_COUNT; i++) {
    rollOffs.push({
      x: -halfW + 2 + RECYCLING_ROLL_OFF.w / 2 + i * RECYCLING_ROLL_OFF_PITCH,
      z: rollOffZ,
    });
  }
  const stallZ0 = back + RECYCLING_ROLL_OFF.l + Math.max(RECYCLING_AISLE_M, RECYCLING_PULL_M);
  const stallsX0 = -(RECYCLING_STALL_COUNT * RECYCLING_STALL.w) / 2;
  const stalls: Rect[] = [];
  for (let i = 0; i < RECYCLING_STALL_COUNT; i++) {
    const x0 = stallsX0 + i * RECYCLING_STALL.w;
    stalls.push({ x0, x1: x0 + RECYCLING_STALL.w, z0: stallZ0, z1: stallZ0 + RECYCLING_STALL.l });
  }
  const gateX0 = 7;
  const truckW = sizeForKind(VehicleKind.Recycling)[0];
  const trucks: Vec2[] = [];
  for (let i = 0; i < RECYCLING_TRUCK_COUNT; i++) {
    trucks.push({ x: -halfW + 2 + truckW / 2 + i * RECYCLING_TRUCK_SPACING, z: 14.5 });
  }
  return {
    shed: { x0: 3, x1: 3 + RECYCLING_SHED_SIZE.w, z0: back, z1: back + RECYCLING_SHED_SIZE.d },
    office: {
      x0: 14,
      x1: 14 + RECYCLING_OFFICE_SIZE.w,
      z0: halfD - 6,
      z1: halfD - 6 + RECYCLING_OFFICE_SIZE.d,
    },
    rollOffs,
    stalls,
    trucks,
    fence: lotRect(footprint, GEN_FENCE_INSET_M),
    gate: { x0: gateX0, x1: gateX0 + GEN_GATE_M + 1 },
  };
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

/** The shed open to the yard (back and side walls, a roof on two posts at the open face), the office, the stall paint and the fence, merged; local Y=0 is the yard slab's top. */
function buildRecyclingDepotGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeRecyclingDepotLayout(footprint);
  const { shed, office } = layout;
  const sc = rectCentre(shed);
  const { w, d, h } = RECYCLING_SHED_SIZE;
  const t = 0.25;
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, h, t, sc.x, 0, shed.z0 + t / 2, RECYCLING_SHED_RGB),
    standingBox(t, h, d, shed.x0 + t / 2, 0, sc.z, RECYCLING_SHED_RGB),
    standingBox(t, h, d, shed.x1 - t / 2, 0, sc.z, RECYCLING_SHED_RGB),
    standingBox(w + 0.4, RECYCLING_ROOF_CAP_HEIGHT, d + 0.4, sc.x, h, sc.z, RECYCLING_ROOF_RGB),
    standingBox(0.3, h, 0.3, shed.x0 + 0.15, 0, shed.z1 - 0.15, GEN_STEEL_RGB),
    standingBox(0.3, h, 0.3, shed.x1 - 0.15, 0, shed.z1 - 0.15, GEN_STEEL_RGB),
    ...cappedBox(
      office,
      RECYCLING_OFFICE_SIZE.h,
      RECYCLING_OFFICE_RGB,
      RECYCLING_ROOF_CAP_HEIGHT,
      RECYCLING_OFFICE_ROOF_RGB,
    ),
  ];
  // The stall lines: one at each stall edge, and a head line across them.
  const first = layout.stalls[0]!;
  const last = layout.stalls[layout.stalls.length - 1]!;
  for (const x of [first.x0, ...layout.stalls.map((s) => s.x1)]) {
    parts.push(
      standingBox(0.1, 0.01, RECYCLING_STALL.l, x, 0, (first.z0 + first.z1) / 2, MARKING_COLOR),
    );
  }
  parts.push(
    standingBox(
      last.x1 - first.x0,
      0.01,
      0.1,
      (first.x0 + last.x1) / 2,
      0,
      first.z0,
      MARKING_COLOR,
    ),
  );
  fenceLoop(parts, layout.fence, GEN_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

/** One roll-off at its own origin: an open-top box with a hook bar at its front, long side along Z. */
function buildRecyclingRollOffGeometry(): THREE.BufferGeometry {
  const { w, l, h } = RECYCLING_ROLL_OFF;
  const skin = 0.08;
  return mergeParts([
    standingBox(w, 0.2, l, 0, 0, 0, RECYCLING_ROLL_OFF_RGB),
    standingBox(skin, h, l, -w / 2 + skin / 2, 0, 0, RECYCLING_ROLL_OFF_RGB),
    standingBox(skin, h, l, w / 2 - skin / 2, 0, 0, RECYCLING_ROLL_OFF_RGB),
    standingBox(w, h, skin, 0, 0, -l / 2 + skin / 2, RECYCLING_ROLL_OFF_RGB),
    standingBox(w, h, skin, 0, 0, l / 2 - skin / 2, RECYCLING_ROLL_OFF_RGB),
    standingBox(0.3, 0.3, 0.3, 0, h - 0.5, l / 2 + 0.15, GEN_STEEL_RGB),
  ]);
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
/** A 60 × 48 × 30 in bale, 1.52 m long, 1.22 m wide and 0.76 m tall. */
export const MRF_BALE_SIZE = { w: 1.22, h: 0.76, l: 1.52 };
/** Bales stack three high, and an outdoor stack never passes 6 m. */
export const MRF_BALE_STACK = { high: 3, capM: 6 };
export const MRF_TRUCK_COUNT = 4;
/** Bale blocks across and deep in the bale yard, and bales across and deep in each block. */
const MRF_BALE_BLOCKS = { across: 4, deep: 3 };
const MRF_BALES_PER_BLOCK = { across: 5, deep: 3 };
const MRF_BALE_GAP = 0.12;
const MRF_BALE_AISLE = 3;
const MRF_EDGE_MARGIN = 3;
/** Clear yard between the hall and the bale yard. */
const MRF_YARD_GAP = 6;
const MRF_ROOF_CAP_HEIGHT = 0.6;
/** The 18 × 26 ft tipping-floor doors. */
export const MRF_DOOR_SIZE = { w: 5.5, h: 7.9 };
const MRF_DOOR_THICKNESS = 0.3;
const MRF_DOOR_COUNT = 3;
/** The 10 ft wainscot band round the hall. */
export const MRF_WAINSCOT_M = 3;
/** Two bale docks on the yard side: a 1.2 m dock, 9 × 10 ft doors at 14 ft centres, as the industrial kit draws them. */
export const MRF_DOCK = { doors: 2, h: 1.2, depth: 2.6, doorW: 2.74, doorH: 3.05, centres: 4.3 };
/** A 6 × 8 ft dock leveller plate in the dock's top at each door. */
export const MRF_LEVELLER = { w: 1.8, d: 2.4 };
export const MRF_FAN = { radius: 0.6, h: 0.8, count: 4 };
const MRF_TRUCK_SPACING = 6.5;
/** The tipping apron: clear yard in front of the bay doors for a truck to turn and back in. */
const MRF_DOOR_APRON = 14;

const MRF_HALL_RGB: RGB = [0.58, 0.63, 0.6];
const MRF_WAINSCOT_RGB: RGB = [0.4, 0.43, 0.42];
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
  /** The bale dock platform on the hall's yard side (+X), and its doors' centres along that wall. */
  dock: Rect;
  dockDoors: Vec2[];
  /** The roof exhaust fans. */
  fans: Vec2[];
  weighbridge: Vec2;
  scaleHouse: Vec2;
}

/**
 * Hall hard against the back-left corner (margin inside the lot), the bale
 * docks on its yard side, the bale yard beside it to the right, the office at
 * the front-right corner, the scale on the way in beside it, and the trucks
 * in a row one apron in front of the bay doors. A block's back corner stack
 * is one bale shorter, so the stacks read as stacks. Pure; fixed per
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
  const hallX1 = hall.x + MRF_HALL_SIZE.w / 2;
  const yardX = hallX1 + MRF_YARD_GAP;
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
          const high = MRF_BALE_STACK.high - (corner ? 1 : 0);
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
  const dockLength = MRF_DOCK.doors * MRF_DOCK.centres;
  const dock: Rect = {
    x0: hallX1,
    x1: hallX1 + MRF_DOCK.depth,
    z0: hall.z - dockLength / 2,
    z1: hall.z + dockLength / 2,
  };
  const dockDoors = Array.from({ length: MRF_DOCK.doors }, (_, i) => ({
    x: hallX1,
    z: hall.z + (i - (MRF_DOCK.doors - 1) / 2) * MRF_DOCK.centres,
  }));
  const fans: Vec2[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) fans.push({ x: hall.x + sx * 15, z: hall.z + sz * 12 });
  const bridge = TRANSFER_WEIGHBRIDGE_SIZE;
  const weighbridge: Vec2 = {
    x: office.x - MRF_OFFICE_SIZE.w / 2 - 8,
    z: halfD - 8 - bridge.l / 2,
  };
  return {
    hall,
    office,
    bales,
    trucks,
    dock,
    dockDoors,
    fans,
    weighbridge,
    scaleHouse: {
      x: weighbridge.x + bridge.w / 2 + TRANSFER_SCALE_GAP + TRANSFER_SCALE_HOUSE_SIZE.w / 2,
      z: weighbridge.z,
    },
  };
}

/** Hall box + roof cap, the wainscot band round it, the tipping-floor doors proud of the street-side wall, the bale docks on the yard side and the roof fans, merged; local Y=0 is the GROUND plane. */
function buildMrfHallGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { hall, dock, dockDoors, fans } = computeMrfLayout(footprint);
  const { w, d, h } = MRF_HALL_SIZE;

  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(hall.x, h / 2, hall.z);
  paintVertexColor(body, hexFromRgb(MRF_HALL_RGB));

  const cap = new THREE.BoxGeometry(w, MRF_ROOF_CAP_HEIGHT, d);
  cap.translate(hall.x, h + MRF_ROOF_CAP_HEIGHT / 2, hall.z);
  paintVertexColor(cap, hexFromRgb(MRF_ROOF_RGB));

  const parts: THREE.BufferGeometry[] = [
    body,
    cap,
    standingBox(w + 0.12, MRF_WAINSCOT_M, d + 0.12, hall.x, 0, hall.z, MRF_WAINSCOT_RGB),
  ];
  for (let i = 0; i < MRF_DOOR_COUNT; i++) {
    const door = new THREE.BoxGeometry(MRF_DOOR_SIZE.w, MRF_DOOR_SIZE.h, MRF_DOOR_THICKNESS);
    const x = hall.x + (i - (MRF_DOOR_COUNT - 1) / 2) * (w / MRF_DOOR_COUNT);
    door.translate(x, MRF_DOOR_SIZE.h / 2, hall.z + d / 2 + MRF_DOOR_THICKNESS / 2 + 0.06);
    paintVertexColor(door, hexFromRgb(MRF_DOOR_RGB));
    parts.push(door);
  }
  // The bale docks: the platform, and at each door the door, its shelter frame, two bumpers and a leveller plate.
  parts.push(rectBox(dock, 0, RECYCLING_YARD_HEIGHT + MRF_DOCK.h, GEN_CONCRETE_RGB));
  const dockTop = RECYCLING_YARD_HEIGHT + MRF_DOCK.h;
  const frame = 0.3;
  const proud = 0.3;
  for (const door of dockDoors) {
    const face = door.x + 0.06;
    parts.push(
      standingBox(0.12, MRF_DOCK.doorH, MRF_DOCK.doorW, face, dockTop, door.z, MRF_DOOR_RGB),
      standingBox(
        proud,
        frame,
        MRF_DOCK.doorW + 2 * frame,
        door.x + 0.06 + proud / 2,
        dockTop + MRF_DOCK.doorH,
        door.z,
        GEN_LOUVRE_RGB,
      ),
      standingBox(
        proud,
        MRF_DOCK.doorH + frame,
        frame,
        door.x + 0.06 + proud / 2,
        dockTop,
        door.z - (MRF_DOCK.doorW + frame) / 2,
        GEN_LOUVRE_RGB,
      ),
      standingBox(
        proud,
        MRF_DOCK.doorH + frame,
        frame,
        door.x + 0.06 + proud / 2,
        dockTop,
        door.z + (MRF_DOCK.doorW + frame) / 2,
        GEN_LOUVRE_RGB,
      ),
      standingBox(
        MRF_LEVELLER.d,
        0.03,
        MRF_LEVELLER.w,
        dock.x0 + MRF_LEVELLER.d / 2 + 0.1,
        dockTop,
        door.z,
        GEN_STEEL_RGB,
      ),
    );
    for (const k of [-1, 1]) {
      parts.push(
        standingBox(
          0.11,
          0.25,
          0.3,
          dock.x1 + 0.055,
          dockTop - 0.3,
          door.z + k * 0.9,
          GEN_STACK_RIM_RGB,
        ),
      );
    }
  }
  for (const fan of fans) {
    const drum = new THREE.CylinderGeometry(MRF_FAN.radius, MRF_FAN.radius, MRF_FAN.h, 12);
    drum.translate(fan.x, h + MRF_ROOF_CAP_HEIGHT + MRF_FAN.h / 2, fan.z);
    parts.push(paintVertexColor(drum, hexFromRgb(GEN_STEEL_RGB)));
    const hood = new THREE.CylinderGeometry(MRF_FAN.radius + 0.2, MRF_FAN.radius + 0.2, 0.15, 12);
    hood.translate(fan.x, h + MRF_ROOF_CAP_HEIGHT + MRF_FAN.h + 0.075, fan.z);
    parts.push(paintVertexColor(hood, hexFromRgb(GEN_STACK_RIM_RGB)));
  }
  return mergeParts(parts);
}

/** The scale house and the weighbridge on the way in; local Y=0 is the GROUND plane. */
function buildMrfScaleGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { weighbridge, scaleHouse } = computeMrfLayout(footprint);
  return mergeParts(scaleParts(weighbridge, scaleHouse));
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
/** The roll-up doors, drawn open at 24 ft clear so the floor reads through them. */
export const TRANSFER_DOOR = { w: 6, clear: 7.3, count: 3 };
const TRANSFER_WALL_T = 0.3;
/** The 14 ft concrete push walls along the hall's three closed sides. */
export const TRANSFER_PUSH_WALL = { h: 4.3, t: 0.3 };
/** The 42 in guard wall along the sunken bay's edge. */
export const TRANSFER_GUARD_WALL_M = 1.07;
/** The tipping apron: clear yard in front of the doors for a packer to turn and back in. */
const TRANSFER_DOOR_APRON = 14;
const TRANSFER_BAY_WALL = { thickness: 0.3, height: TRANSFER_GUARD_WALL_M };
/** Clear yard between the bay's outer wall and the waiting rig. */
const TRANSFER_RIG_GAP = 3;
/** Gap between the weighbridge and the scale house's window wall. */
const TRANSFER_SCALE_GAP = 1.5;

const TRANSFER_HALL_RGB: RGB = [0.55, 0.53, 0.45];
const TRANSFER_ROOF_RGB: RGB = [0.34, 0.37, 0.38];
const TRANSFER_DOOR_RGB: RGB = [0.25, 0.3, 0.33];
const TRANSFER_INTERIOR_RGB: RGB = [0.28, 0.27, 0.24];
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
  /** The open doors' centres along the hall's street wall. */
  doors: Vec2[];
  /** The push walls inside the hall's back, left and right walls. */
  pushWalls: Rect[];
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
  const { w, d } = TRANSFER_HALL_SIZE;
  const t = TRANSFER_WALL_T;
  const p = TRANSFER_PUSH_WALL.t;
  const inner = {
    x0: hall.x - w / 2 + t,
    x1: hall.x + w / 2 - t,
    z0: hall.z - d / 2 + t,
    z1: hall.z + d / 2 - t,
  };
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
    doors: Array.from({ length: TRANSFER_DOOR.count }, (_, i) => ({
      x: transferDoorX(hall, i),
      z: hall.z + d / 2,
    })),
    pushWalls: [
      { x0: inner.x0, x1: inner.x1, z0: inner.z0, z1: inner.z0 + p },
      { x0: inner.x0, x1: inner.x0 + p, z0: inner.z0 + p, z1: inner.z1 },
      { x0: inner.x1 - p, x1: inner.x1, z0: inner.z0 + p, z1: inner.z1 },
    ],
  };
}

/** The local X of the hall's `i`th door, the doors spread evenly across its street wall. */
function transferDoorX(hall: Vec2, i: number): number {
  return (
    hall.x + (i - (TRANSFER_DOOR.count - 1) / 2) * (TRANSFER_HALL_SIZE.w / TRANSFER_DOOR.count)
  );
}

/** A box `w` × `h` × `l` standing on `y0`, centred on (x, z), painted one colour. */
function standingBox(
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
  const { hall, bay, doors, pushWalls } = computeTransferLayout(footprint);
  const { w, d, h } = TRANSFER_HALL_SIZE;
  const t = TRANSFER_WALL_T;
  const front = hall.z + d / 2;
  // The hall is hollow, so the floor and the push walls read through its open
  // doors; its inside faces are lined darker, so the openings read as shade.
  const lining = 0.05;
  const inner = { w: w - 2 * t, d: d - 2 * t };
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, h, t, hall.x, 0, hall.z - d / 2 + t / 2, TRANSFER_HALL_RGB),
    standingBox(t, h, d, hall.x - w / 2 + t / 2, 0, hall.z, TRANSFER_HALL_RGB),
    standingBox(t, h, d, hall.x + w / 2 - t / 2, 0, hall.z, TRANSFER_HALL_RGB),
    standingBox(
      inner.w,
      h,
      lining,
      hall.x,
      0,
      hall.z - d / 2 + t + lining / 2,
      TRANSFER_INTERIOR_RGB,
    ),
    standingBox(
      lining,
      h,
      inner.d,
      hall.x - w / 2 + t + lining / 2,
      0,
      hall.z,
      TRANSFER_INTERIOR_RGB,
    ),
    standingBox(
      lining,
      h,
      inner.d,
      hall.x + w / 2 - t - lining / 2,
      0,
      hall.z,
      TRANSFER_INTERIOR_RGB,
    ),
    standingBox(inner.w, 0.02, inner.d, hall.x, RECYCLING_YARD_HEIGHT, hall.z, GEN_CONCRETE_RGB),
  ];
  // The street wall: piers between the openings and a lintel over each, the door's coil raised under it.
  const edges = [
    hall.x - w / 2,
    ...doors.flatMap((door) => [door.x - TRANSFER_DOOR.w / 2, door.x + TRANSFER_DOOR.w / 2]),
    hall.x + w / 2,
  ];
  for (let i = 0; i < edges.length; i += 2) {
    const x0 = edges[i]!;
    const x1 = edges[i + 1]!;
    parts.push(standingBox(x1 - x0, h, t, (x0 + x1) / 2, 0, front - t / 2, TRANSFER_HALL_RGB));
  }
  for (const door of doors) {
    parts.push(
      standingBox(
        TRANSFER_DOOR.w,
        h - TRANSFER_DOOR.clear,
        t,
        door.x,
        TRANSFER_DOOR.clear,
        front - t / 2,
        TRANSFER_HALL_RGB,
      ),
    );
    const coil = new THREE.CylinderGeometry(0.35, 0.35, TRANSFER_DOOR.w + 0.2, 10);
    coil.rotateZ(Math.PI / 2);
    coil.translate(door.x, TRANSFER_DOOR.clear + 0.35, front - t - 0.4);
    parts.push(paintVertexColor(coil, hexFromRgb(TRANSFER_DOOR_RGB)));
  }
  for (const wall of pushWalls) {
    parts.push(rectBox(wall, RECYCLING_YARD_HEIGHT, TRANSFER_PUSH_WALL.h, GEN_CONCRETE_RGB));
  }

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
    standingBox(
      2 * halfSpan,
      TRANSFER_ROOF_SKIN,
      roofLength,
      hall.x,
      h - TRANSFER_ROOF_SKIN,
      hall.z,
      TRANSFER_ROOF_RGB,
    ),
  );

  const { w: bayW, l: bayL } = TRANSFER_BAY_SIZE;
  const wall = TRANSFER_BAY_WALL;
  parts.push(
    standingBox(bayW, 0.02, bayL, bay.x, RECYCLING_YARD_HEIGHT, bay.z, TRANSFER_BAY_FLOOR_RGB),
    standingBox(
      wall.thickness,
      RECYCLING_YARD_HEIGHT + wall.height,
      bayL,
      bay.x + bayW / 2 + wall.thickness / 2,
      0,
      bay.z,
      TRANSFER_BAY_WALL_RGB,
    ),
    standingBox(
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

/** The scale house (box + roof slab) and the weighbridge beside it, standing on the ground at local Y=0; shared by every kit with a truck scale at its gate. */
function scaleParts(weighbridge: Vec2, scaleHouse: Vec2): THREE.BufferGeometry[] {
  const { w, d, h } = TRANSFER_SCALE_HOUSE_SIZE;
  const bridge = TRANSFER_WEIGHBRIDGE_SIZE;
  return [
    standingBox(w, h, d, scaleHouse.x, 0, scaleHouse.z, TRANSFER_SCALE_HOUSE_RGB),
    standingBox(w + 0.4, 0.3, d + 0.4, scaleHouse.x, h, scaleHouse.z, TRANSFER_SCALE_ROOF_RGB),
    standingBox(
      bridge.w,
      RECYCLING_YARD_HEIGHT + bridge.h,
      bridge.l,
      weighbridge.x,
      0,
      weighbridge.z,
      TRANSFER_WEIGHBRIDGE_RGB,
    ),
  ];
}

/** The transfer station's scale, merged; local Y=0 is the GROUND plane. */
function buildTransferScaleGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { scaleHouse, weighbridge } = computeTransferLayout(footprint);
  return mergeParts(scaleParts(weighbridge, scaleHouse));
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
    standingBox(width, 1.0, 1.0, 0, 0, z, TRANSFER_TYRE_RGB);
  return mergeParts([
    standingBox(trailer.w, 0.25, trailer.l, 0, deck, trailerZ, TRANSFER_TRAILER_RGB),
    standingBox(
      skin,
      wallH,
      trailer.l,
      -trailer.w / 2 + skin / 2,
      deck,
      trailerZ,
      TRANSFER_TRAILER_RGB,
    ),
    standingBox(
      skin,
      wallH,
      trailer.l,
      trailer.w / 2 - skin / 2,
      deck,
      trailerZ,
      TRANSFER_TRAILER_RGB,
    ),
    standingBox(trailer.w, wallH, skin, 0, deck, tail + skin / 2, TRANSFER_TRAILER_RGB),
    standingBox(trailer.w, wallH, skin, 0, deck, tail + trailer.l - skin / 2, TRANSFER_TRAILER_RGB),
    standingBox(
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
    standingBox(1.0, 0.4, tractor.l, 0, 0.7, tractorZ, TRANSFER_TYRE_RGB),
    standingBox(tractor.w - 0.2, 1.2, 1.8, 0, 0.9, nose - 0.9, TRANSFER_TRACTOR_RGB),
    standingBox(tractor.w, tractor.h - 0.9, 2.4, 0, 0.9, nose - 1.8 - 1.2, TRANSFER_TRACTOR_RGB),
    tyre(nose - 1.3, tractor.w),
    tyre(nose - tractor.l + 1.0, tractor.w),
    tyre(nose - tractor.l + 2.3, tractor.w),
  ]);
}

// ---------------------------------------------------------------------------
// hospital: a six-storey block on the lot's building tiles, its main entrance
// and ambulance canopy on the street side (local +Z), a two-level parking deck
// on the other tiles, and the accessible spaces on the surface between the
// entrance and the deck. The yard paves the whole lot.
// ---------------------------------------------------------------------------

export const HOSPITAL_BEDS = 72;
/** The common US zoning minimum for a hospital. */
export const HOSPITAL_SPACES_PER_BED = 2;
/** 58 × 48 m is 2,784 m² a floor: 16,704 m² over six storeys, 72 beds at 2,500 sf. */
export const HOSPITAL_BLOCK_SIZE = { w: 58, d: 48 };
export const HOSPITAL_STOREYS = 6;
export const HOSPITAL_STOREY_M = 4.5;
const HOSPITAL_EDGE_MARGIN = 1;
const HOSPITAL_ROOF_CAP_M = 0.4;
/** A ribbon of glass on every floor: its sill above the floor, its height, and how far it stands proud of the wall. */
const HOSPITAL_WINDOW = { sill: 1.1, h: 2, proud: 0.06 };
/** The main entrance's glazed doors and the canopy over them, centred `x` from the block's centre. */
const HOSPITAL_ENTRANCE = { x: 2, doorW: 6, doorH: 3, canopyW: 10, canopyD: 4, canopyY: 3.6 };
/** The ambulance canopy: over an ambulance with its rear doors open, clear of its roof lights; its west edge `inset` from the block's. */
export const AMBULANCE_CANOPY = { inset: 4, w: 16, d: 9, clear: 4.3, slab: 0.5 };
/** The walk along the facade, between the block and the accessible spaces' heads. */
const HOSPITAL_FACADE_WALK_M = 0.5;

/** The deck: ground and roof, 11 ft floor to floor. */
export const DECK_LEVELS = 2;
export const DECK_STOREY_M = 3.35;
export const DECK_SLAB_M = 0.3;
/** ADA 2010 §502.5: 98 in clear along a van's route. */
export const VAN_CLEARANCE_M = 2.49;
const FOOT_M = 0.3048;
/** A 9 × 18 ft stall and a 24 ft two-way aisle, the 60 ft module of 90° parking; the stalls stand square to the aisle. */
export const DECK_STALL = { w: 9 * FOOT_M, l: 18 * FOOT_M };
export const DECK_AISLE_M = 24 * FOOT_M;
/** Two double-loaded aisles across the deck, each a row of stalls either side. */
const DECK_MODULES = 2;
/** The ramp's grade, a dial; it runs along the deck's far side from the street up to the roof. */
const DECK_RAMP_GRADE = 0.125;
/** The ramp's one-way lane, 12 ft, a dial. */
export const DECK_RAMP_MIN_M = 12 * FOOT_M;
/** The perimeter wall the front row of stalls stands back from, and the roof's spandrel band. */
const DECK_WALL_M = 0.3;
export const DECK_SPANDREL = { below: 0.6, above: 1.07, t: 0.25 };
/**
 * The deck's width across the lot: two modules and the ramp beside its
 * parapet. It reaches half a metre past its two tiles toward the block.
 */
export const DECK_WIDTH_M =
  DECK_MODULES * (2 * DECK_STALL.l + DECK_AISLE_M) + DECK_RAMP_MIN_M + DECK_SPANDREL.t;
/** A stair-and-lift core takes this many stalls of an outer row at the street end, on both levels; it rises this far above the roof. */
const DECK_CORE_STALLS = 2;
const DECK_CORE_RISE_M = 3;
const DECK_COLUMN_M = 0.6;
/** Columns stand on every third stall line. */
const DECK_COLUMN_EVERY_STALLS = 3;
/** The share of stalls a car stands in, by a hash of the building and the stall. */
const DECK_OCCUPANCY = 0.75;

/** ADA 2010 §502.2: a car space 96 in wide, a van space 132 in, each beside a 60 in access aisle. */
export const ACCESSIBLE_SPACE_M = {
  car: ACCESSIBLE_CAR_WIDTH_M,
  van: ACCESSIBLE_VAN_WIDTH_M,
  aisle: ACCESSIBLE_AISLE_M,
};
const PAINT_LINE_M = 0.1;
const PAINT_HATCH_SPACING_M = 0.6;

const HOSPITAL_CLADDING_RGB: RGB = [0.8, 0.79, 0.75];
const HOSPITAL_GLASS_RGB: RGB = [0.2, 0.27, 0.33];
const HOSPITAL_ROOF_RGB: RGB = [0.45, 0.46, 0.47];
const HOSPITAL_DOOR_RGB: RGB = [0.14, 0.19, 0.23];
const HOSPITAL_CANOPY_RGB: RGB = [0.84, 0.84, 0.82];
const HOSPITAL_POST_RGB: RGB = [0.5, 0.52, 0.54];
const HOSPITAL_SIGN_RGB: RGB = [0.86, 0.86, 0.86];
const HOSPITAL_CROSS_RGB: RGB = [0.4, 0.05, 0.05];
const DECK_SLAB_RGB: RGB = [0.56, 0.56, 0.54];
const DECK_FLOOR_RGB: RGB = [0.4, 0.41, 0.42];
const DECK_SPANDREL_RGB: RGB = [0.72, 0.71, 0.67];
const DECK_CORE_RGB: RGB = [0.6, 0.62, 0.65];

/** A rectangle in the footprint frame, by its low and high edges. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** One deck stall: its centre, its level (0 ground, 1 roof) and which way along X a car in it points. */
export interface DeckStall {
  x: number;
  z: number;
  level: number;
  noseX: 1 | -1;
}

/** One piece of the accessible row, west to east: a space, or the hatched aisle beside one. */
export interface AccessiblePiece {
  kind: 'car' | 'van' | 'aisle';
  x0: number;
  x1: number;
}

export interface HospitalLayout {
  /** The block's centre, on the ground. */
  block: Vec2;
  /** The main entrance's centre, on the facade. */
  entrance: Vec2;
  ambulanceCanopy: Rect;
  /** Where the ambulance stands under its canopy, nose to the street. */
  ambulance: Vec2;
  deck: Rect;
  ramp: Rect;
  cores: Rect[];
  columns: Vec2[];
  stalls: DeckStall[];
  /** The accessible row's pieces, and the band of depth they share. */
  accessible: AccessiblePiece[];
  accessibleZ: { z0: number; z1: number };
}

function stallsInDeckRow(deck: Rect): number {
  return Math.floor((deck.z1 - deck.z0 - DECK_WALL_M - DECK_AISLE_M) / DECK_STALL.w);
}

/**
 * How many accessible spaces a facility of `deckSpaces` other spaces needs once
 * its accessible spaces are counted in the total it provides, and how many of
 * them are vans.
 */
export function hospitalAccessibleSpaces(deckSpaces: number): { total: number; vans: number } {
  let total = adaAccessibleSpaces(deckSpaces);
  while (adaAccessibleSpaces(deckSpaces + total) > total) {
    total = adaAccessibleSpaces(deckSpaces + total);
  }
  return { total, vans: adaVanSpaces(total) };
}

/** The deck's spaces at every level: four rows a level, less the cores. */
export function hospitalDeckSpaces(footprint: FootprintSize): number {
  return computeHospitalLayout(footprint).stalls.length;
}

/**
 * The block hard against the back-left corner of the building tiles, its
 * street front along local +Z; the ambulance canopy at the facade's west end
 * and the main entrance near its middle; the accessible row between the
 * entrance and the deck; the deck over the remaining tiles, its aisles open to
 * the street, a cross-aisle at the back and the ramp along the far side. Pure;
 * fixed per footprint.
 */
export function computeHospitalLayout(footprint: FootprintSize): HospitalLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const { w: blockW, d: blockD } = HOSPITAL_BLOCK_SIZE;
  const block: Vec2 = {
    x: -halfW + HOSPITAL_EDGE_MARGIN + blockW / 2,
    z: -halfD + HOSPITAL_EDGE_MARGIN + blockD / 2,
  };
  const front = block.z + blockD / 2;
  const blockX0 = block.x - blockW / 2;
  const blockX1 = block.x + blockW / 2;

  const canopyX0 = blockX0 + AMBULANCE_CANOPY.inset;
  const ambulanceCanopy: Rect = {
    x0: canopyX0,
    x1: canopyX0 + AMBULANCE_CANOPY.w,
    z0: front,
    z1: front + AMBULANCE_CANOPY.d,
  };
  const ambulanceLength = sizeForKind(VehicleKind.Ambulance)[2];
  const ambulance: Vec2 = {
    x: (ambulanceCanopy.x0 + ambulanceCanopy.x1) / 2,
    z: front + 1 + ambulanceLength / 2,
  };
  const entrance: Vec2 = { x: block.x + HOSPITAL_ENTRANCE.x, z: front };

  const deck: Rect = { x0: halfW - DECK_WIDTH_M, x1: halfW, z0: -halfD, z1: halfD };
  const deckLayout = layDeck(deck);

  // The accessible row, west to east: car pairs sharing an aisle, a single
  // car with its own, then each van space with its aisle; its east end at the
  // block's.
  const { total, vans } = hospitalAccessibleSpaces(deckLayout.stalls.length);
  const cars = total - vans;
  const kinds: AccessiblePiece['kind'][] = [];
  for (let i = 0; i + 1 < cars; i += 2) kinds.push('car', 'aisle', 'car');
  if (cars % 2 === 1) kinds.push('car', 'aisle');
  for (let i = 0; i < vans; i++) kinds.push('van', 'aisle');
  const widthOf = (kind: AccessiblePiece['kind']): number => ACCESSIBLE_SPACE_M[kind];
  const rowWidth = kinds.reduce((sum, kind) => sum + widthOf(kind), 0);
  let x = blockX1 - rowWidth;
  const accessible: AccessiblePiece[] = kinds.map((kind) => {
    const piece = { kind, x0: x, x1: x + widthOf(kind) };
    x = piece.x1;
    return piece;
  });
  const accessibleZ = {
    z0: front + HOSPITAL_FACADE_WALK_M,
    z1: front + HOSPITAL_FACADE_WALK_M + DECK_STALL.l,
  };

  return {
    block,
    entrance,
    ambulanceCanopy,
    ambulance,
    deck,
    ...deckLayout,
    accessible,
    accessibleZ,
  };
}

function layDeck(deck: Rect): Pick<HospitalLayout, 'ramp' | 'cores' | 'columns' | 'stalls'> {
  const perRow = stallsInDeckRow(deck);
  const stallsZ1 = deck.z1 - DECK_WALL_M;
  const moduleW = 2 * DECK_STALL.l + DECK_AISLE_M;
  const rampX0 = deck.x0 + DECK_MODULES * moduleW;
  const rise = DECK_STOREY_M * (DECK_LEVELS - 1);
  const ramp: Rect = { x0: rampX0, x1: deck.x1, z0: deck.z1 - rise / DECK_RAMP_GRADE, z1: deck.z1 };

  // Each row: its low X edge and which way along X a car in it points (nose
  // away from its aisle).
  const rows: { x0: number; noseX: 1 | -1 }[] = [];
  for (let m = 0; m < DECK_MODULES; m++) {
    const x0 = deck.x0 + m * moduleW;
    rows.push({ x0, noseX: -1 }, { x0: x0 + DECK_STALL.l + DECK_AISLE_M, noseX: 1 });
  }
  const outer = new Set([0, rows.length - 1]);
  const cores: Rect[] = [...outer].map((r) => ({
    x0: rows[r]!.x0,
    x1: rows[r]!.x0 + DECK_STALL.l,
    z0: stallsZ1 - DECK_CORE_STALLS * DECK_STALL.w,
    z1: stallsZ1,
  }));

  const stalls: DeckStall[] = [];
  for (let level = 0; level < DECK_LEVELS; level++) {
    rows.forEach((row, r) => {
      for (let i = 0; i < perRow; i++) {
        if (outer.has(r) && i < DECK_CORE_STALLS) continue;
        stalls.push({
          x: row.x0 + DECK_STALL.l / 2,
          z: stallsZ1 - (i + 0.5) * DECK_STALL.w,
          level,
          noseX: row.noseX,
        });
      }
    });
  }

  const columnXs = [
    deck.x0 + DECK_COLUMN_M / 2,
    deck.x0 + moduleW,
    rampX0 - DECK_COLUMN_M / 2,
    deck.x1 - DECK_COLUMN_M / 2,
  ];
  const columns: Vec2[] = [];
  for (let i = 0; i <= perRow; i += DECK_COLUMN_EVERY_STALLS) {
    const z = stallsZ1 - i * DECK_STALL.w;
    for (const cx of columnXs) {
      // The far wall's columns stand only where the roof does, behind the ramp.
      if (cx > rampX0 && z > ramp.z0) continue;
      columns.push({ x: cx, z });
    }
  }
  for (const cx of columnXs) columns.push({ x: cx, z: deck.z0 + DECK_COLUMN_M / 2 });
  return { ramp, cores, columns, stalls };
}

/** The six-storey block, its glass ribbons, roof cap, entrance and emergency doors, the red cross over the ambulance bay, and both canopies; local Y=0 is the GROUND plane. */
function buildHospitalBlockGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeHospitalLayout(footprint);
  const { block, entrance, ambulanceCanopy: bay } = layout;
  const { w, d } = HOSPITAL_BLOCK_SIZE;
  const height = HOSPITAL_STOREYS * HOSPITAL_STOREY_M;
  const y0 = RECYCLING_YARD_HEIGHT;
  const front = block.z + d / 2;
  // The block stands on the ground through the yard slab; what stands on the
  // yard (doors, canopies, posts) starts at its top.
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, height - HOSPITAL_ROOF_CAP_M, d, block.x, 0, block.z, HOSPITAL_CLADDING_RGB),
    standingBox(
      w,
      HOSPITAL_ROOF_CAP_M,
      d,
      block.x,
      height - HOSPITAL_ROOF_CAP_M,
      block.z,
      HOSPITAL_ROOF_RGB,
    ),
  ];
  for (let k = 0; k < HOSPITAL_STOREYS; k++) {
    const p = HOSPITAL_WINDOW.proud;
    parts.push(
      standingBox(
        w + 2 * p,
        HOSPITAL_WINDOW.h,
        d + 2 * p,
        block.x,
        k * HOSPITAL_STOREY_M + HOSPITAL_WINDOW.sill,
        block.z,
        HOSPITAL_GLASS_RGB,
      ),
    );
  }
  const bayX = (bay.x0 + bay.x1) / 2;
  const doorT = 0.3;
  for (const x of [entrance.x, bayX]) {
    parts.push(
      standingBox(
        HOSPITAL_ENTRANCE.doorW,
        HOSPITAL_ENTRANCE.doorH,
        doorT,
        x,
        y0,
        front + doorT / 2,
        HOSPITAL_DOOR_RGB,
      ),
    );
  }

  // The main entrance's canopy on two posts.
  const { canopyW, canopyD, canopyY } = HOSPITAL_ENTRANCE;
  const canopySlab = 0.35;
  parts.push(
    standingBox(
      canopyW,
      canopySlab,
      canopyD,
      entrance.x,
      y0 + canopyY,
      front + canopyD / 2,
      HOSPITAL_CANOPY_RGB,
    ),
  );
  for (const side of [-1, 1]) {
    parts.push(
      standingBox(
        0.25,
        canopyY,
        0.25,
        entrance.x + side * (canopyW / 2 - 0.3),
        y0,
        front + canopyD - 0.3,
        HOSPITAL_POST_RGB,
      ),
    );
  }

  // The ambulance canopy on two columns at its street corners.
  const { clear, slab } = AMBULANCE_CANOPY;
  parts.push(
    standingBox(
      bay.x1 - bay.x0,
      slab,
      bay.z1 - bay.z0,
      bayX,
      y0 + clear,
      (bay.z0 + bay.z1) / 2,
      HOSPITAL_CANOPY_RGB,
    ),
  );
  for (const x of [bay.x0 + 0.4, bay.x1 - 0.4]) {
    parts.push(standingBox(0.5, clear, 0.5, x, y0, bay.z1 - 0.4, HOSPITAL_POST_RGB));
  }

  // A red cross on a white panel over the ambulance bay.
  const signY = y0 + clear + slab + 1.2;
  parts.push(standingBox(3, 3, 0.15, bayX, signY, front + 0.2, HOSPITAL_SIGN_RGB));
  parts.push(standingBox(2.2, 0.7, 0.1, bayX, signY + 1.15, front + 0.32, HOSPITAL_CROSS_RGB));
  parts.push(standingBox(0.7, 2.2, 0.1, bayX, signY + 0.4, front + 0.32, HOSPITAL_CROSS_RGB));
  return mergeParts(parts);
}

/**
 * The deck: its roof slab (open over the ramp), columns, the roof's spandrel
 * band, the ramp with its parapet, the two stair-and-lift cores and the stall
 * lines on both levels; local Y=0 is the GROUND plane.
 */
function buildHospitalDeckGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { deck, ramp, cores, columns, stalls } = computeHospitalLayout(footprint);
  const y0 = RECYCLING_YARD_HEIGHT;
  const roofTop = y0 + DECK_STOREY_M;
  const slabY = roofTop - DECK_SLAB_M;
  const box = (r: Rect, yA: number, yB: number, rgb: RGB): THREE.BufferGeometry =>
    standingBox(r.x1 - r.x0, yB - yA, r.z1 - r.z0, (r.x0 + r.x1) / 2, yA, (r.z0 + r.z1) / 2, rgb);
  const parts: THREE.BufferGeometry[] = [
    box({ ...deck, x1: ramp.x0 }, slabY, roofTop, DECK_FLOOR_RGB),
    box({ ...ramp, z0: deck.z0, z1: ramp.z0 }, slabY, roofTop, DECK_FLOOR_RGB),
  ];
  for (const c of columns) {
    const half = DECK_COLUMN_M / 2;
    parts.push(
      box(
        { x0: c.x - half, x1: c.x + half, z0: c.z - half, z1: c.z + half },
        y0,
        slabY,
        DECK_SLAB_RGB,
      ),
    );
  }

  // The spandrel band round the roof's edge, open where the ramp comes up.
  const { below, above, t } = DECK_SPANDREL;
  const bandA = roofTop - below;
  const bandB = roofTop + above;
  for (const edge of [
    { x0: deck.x0, x1: deck.x0 + t, z0: deck.z0, z1: deck.z1 },
    { x0: deck.x0, x1: deck.x1, z0: deck.z0, z1: deck.z0 + t },
    { x0: deck.x1 - t, x1: deck.x1, z0: deck.z0, z1: ramp.z0 },
    { x0: deck.x0, x1: ramp.x0, z0: deck.z1 - t, z1: deck.z1 },
  ]) {
    parts.push(box(edge, bandA, bandB, DECK_SPANDREL_RGB));
  }

  // The ramp: a slab rising from the street to the roof, a parapet on its outer edge.
  const run = ramp.z1 - ramp.z0;
  const rise = DECK_STOREY_M * (DECK_LEVELS - 1);
  // Each is a box over the ramp's plan, sheared so it climbs toward -Z: it
  // keeps the plan's edges exactly, where a turned box would overhang them.
  const climbing = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      position.setY(i, position.getY(i) - position.getZ(i) * (rise / run));
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  const rampSlab = new THREE.BoxGeometry(ramp.x1 - ramp.x0 - t, DECK_SLAB_M, run);
  rampSlab.translate(0, -DECK_SLAB_M / 2, 0);
  climbing(rampSlab).translate((ramp.x0 + ramp.x1 - t) / 2, y0 + rise / 2, (ramp.z0 + ramp.z1) / 2);
  parts.push(paintVertexColor(rampSlab, hexFromRgb(DECK_SLAB_RGB)));
  const parapet = new THREE.BoxGeometry(t, above, run);
  parapet.translate(0, above / 2, 0);
  climbing(parapet).translate(ramp.x1 - t / 2, y0 + rise / 2, (ramp.z0 + ramp.z1) / 2);
  parts.push(paintVertexColor(parapet, hexFromRgb(DECK_SPANDREL_RGB)));

  for (const core of cores) parts.push(box(core, y0, roofTop + DECK_CORE_RISE_M, DECK_CORE_RGB));

  // Stall lines on both levels, either side of every stall, each line once.
  const drawn = new Set<string>();
  for (const s of stalls) {
    const floor = y0 + s.level * DECK_STOREY_M + 0.005;
    for (const side of [-1, 1]) {
      const z = s.z + (side * DECK_STALL.w) / 2;
      const key = `${s.level}:${s.x.toFixed(2)}:${z.toFixed(2)}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const half = PAINT_LINE_M / 2;
      const along = { x0: s.x - DECK_STALL.l / 2, x1: s.x + DECK_STALL.l / 2 };
      parts.push(box({ ...along, z0: z - half, z1: z + half }, floor, floor + 0.01, MARKING_COLOR));
    }
  }
  return mergeParts(parts);
}

/** The accessible row's paint: the spaces' lines, the hatched aisles and the accessibility symbol in each space. */
function buildHospitalPaintGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { accessible, accessibleZ } = computeHospitalLayout(footprint);
  const top = RECYCLING_YARD_HEIGHT;
  const paintY = top + 0.005;
  const line = (x0: number, x1: number, z0: number, z1: number): THREE.BufferGeometry =>
    standingBox(x1 - x0, 0.01, z1 - z0, (x0 + x1) / 2, paintY, (z0 + z1) / 2, MARKING_COLOR);
  const { z0, z1 } = accessibleZ;
  const parts: THREE.BufferGeometry[] = [];
  const edges = new Set<number>();
  for (const piece of accessible) edges.add(piece.x0).add(piece.x1);
  for (const x of edges) parts.push(line(x - PAINT_LINE_M / 2, x + PAINT_LINE_M / 2, z0, z1));
  for (const piece of accessible) {
    const cx = (piece.x0 + piece.x1) / 2;
    if (piece.kind === 'aisle') {
      const w = piece.x1 - piece.x0;
      const hatch = Math.hypot(w, w);
      for (let z = z0 + w / 2; z <= z1 - w / 2 + 1e-9; z += PAINT_HATCH_SPACING_M) {
        const bar = new THREE.BoxGeometry(PAINT_LINE_M, 0.01, hatch - PAINT_LINE_M);
        bar.rotateY(Math.PI / 4);
        bar.translate(cx, paintY + 0.005, z);
        parts.push(paintVertexColor(bar, hexFromRgb(MARKING_COLOR)));
      }
      continue;
    }
    const { positions, colors } = accessibilitySymbolPaint(ACCESSIBLE_SYMBOL_M);
    const symbol = new THREE.BufferGeometry();
    symbol.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    symbol.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    symbol.computeVertexNormals();
    // Upright to a driver pulling in toward the building.
    symbol.rotateY(Math.PI);
    symbol.translate(cx, top - ROAD_Y_OFFSET + 0.01, (z0 + z1) / 2);
    parts.push(symbol);
  }
  return mergeParts(parts);
}

/** One parked car at its real size, nose to local +Z, centred on its own origin on the ground. */
function buildParkedCarGeometry(): THREE.BufferGeometry {
  const [sx, sy, sz] = sizeForKind(VehicleKind.Car);
  const car = buildVehicleGeometry(VehicleKind.Car);
  car.scale(sx, sy, sz);
  car.translate(0, sy / 2, 0);
  return car;
}

/** Whether stall `i` of a hospital's deck has a car in it: a fixed share, by a hash of the building and the stall. */
export function deckStallTaken(buildingId: number, i: number): boolean {
  return hash1(buildingId * 977 + i * 131 + 7) < DECK_OCCUPANCY;
}

// ---------------------------------------------------------------------------
// cemetery: a lawn of burial sections cut by a two-way drive from the street,
// a gatehouse and forecourt on the street side of the lot, an ornamental
// fence round the lot with a gap for the drive, a few trees, and a headstone
// at the head of each grave that holds an interment. The grounds are one lawn
// plate on the highest ground under the lot, so the headstones, fence and
// buildings all stand on one level on a slope.
// ---------------------------------------------------------------------------

const INCH_M = 0.0254;
/** The least a grave space may be: 42 × 96 in (Florida Statutes 497.274), rounded up to the centimetre. */
export const GRAVE_SPACE = { w: 1.07, l: 2.44 };
/** A private interior road of two lanes: 20 ft (Montgomery County, MD). */
export const CEMETERY_DRIVE_M = 20 * FOOT_M;
/** Cemetery fences run 4-6 ft (Roslyn WA caps them at 6 ft); this is the game's 1.5 m, a little under 5 ft. */
export const CEMETERY_FENCE_HEIGHT_M = 1.5;
/** The gatehouse: one storey, 128 m² on the floor, under the catalog's 3.2 m. */
export const CEMETERY_GATEHOUSE = { w: 12, d: 10.67, h: 3.2, wall: 2.6, eave: 0.4 };
/** The paved forecourt between the gatehouse door and the lot's front fence. */
const CEMETERY_FORECOURT_DEPTH_M = 6;
/** An upright headstone of the common US single-upright range (24-36 in tall, 20-30 in wide, 6-8 in thick). */
export const HEADSTONE = {
  w: 24 * INCH_M,
  t: 8 * INCH_M,
  h: 30 * INCH_M,
  baseW: 24 * INCH_M + 0.1,
  baseT: 8 * INCH_M + 0.1,
  baseH: 0.1,
};
/** Graves in one burial tile, and how they are laid in it: columns across, rows deep, the gap between neighbours and between rows. */
export const GRAVES_PER_SECTION = 98;
const SECTION_GRAVE_COLS = 14;
const SECTION_GRAVE_ROWS = GRAVES_PER_SECTION / SECTION_GRAVE_COLS;
const GRAVE_GAP_M = 0.08;
const GRAVE_AISLE_M = 0.3;
/** The fence stands this far in from the lot's edge; graves keep this much clear of it. */
const CEMETERY_FENCE_INSET_M = 0.25;
const CEMETERY_FENCE_CLEAR_M = 0.4;
/** Headstone sits this far along its grave space from the head end. */
const HEADSTONE_HEAD_SETBACK_M = 0.2;
export const CEMETERY_LAWN_HEIGHT = 0.3;
const CEMETERY_PAVING_PROUD_M = 0.02;
const CEMETERY_PATCH_PROUD_M = 0.012;
const CEMETERY_FENCE_POST_SPACING_M = 2.5;
const CEMETERY_PICKET_SPACING_M = 0.5;
const CEMETERY_GATE_PIER_M = 0.45;

const CEMETERY_LAWN_RGB: RGB = [0.2, 0.46, 0.2];
const CEMETERY_PATCH_RGB: RGB = [0.15, 0.38, 0.17];
const CEMETERY_DRIVE_RGB: RGB = [0.27, 0.28, 0.3];
const CEMETERY_FORECOURT_RGB: RGB = [0.62, 0.6, 0.55];
const CEMETERY_FENCE_RGB: RGB = [0.1, 0.11, 0.12];
const CEMETERY_PIER_RGB: RGB = [0.56, 0.56, 0.54];
const GATEHOUSE_WALL_RGB: RGB = [0.8, 0.74, 0.62];
const GATEHOUSE_ROOF_RGB: RGB = [0.3, 0.33, 0.37];
const GATEHOUSE_DOOR_RGB: RGB = [0.22, 0.14, 0.1];
const GATEHOUSE_GLASS_RGB: RGB = [0.22, 0.3, 0.36];
const HEADSTONE_RGB: RGB = [0.58, 0.59, 0.61];
const HEADSTONE_BASE_RGB: RGB = [0.46, 0.47, 0.49];

/** One grave space in the footprint frame: its centre and the burial section (tile) it lies in. */
export interface GraveSpace extends Vec2 {
  section: number;
}

/** The plots a cemetery draws: its catalog count, or a full 98 on every burial tile when the entry carries none. */
export function cemeteryPlots(entry: BuildingCatalogEntry): number {
  return entry.deathCare?.plots ?? (entry.footprint.w * entry.footprint.d - 1) * GRAVES_PER_SECTION;
}

export interface CemeteryLayout {
  /** The drive's rectangle, street edge to the back fence. */
  drive: Rect;
  gatehouse: Rect;
  forecourt: Rect;
  /** The gap the fence leaves for the drive. */
  gate: { x0: number; x1: number };
  /** Every grave space, in the order interments fill them: front section first. */
  graves: GraveSpace[];
  trees: Vec2[];
}

/**
 * The drive runs the depth of the lot along the line between the last two
 * columns of tiles, the gatehouse and its forecourt fill the street-side tile
 * of the last column beside it, and the other tiles are burial sections:
 * 14 × 7 graves centred in the tile's clear ground. Sections fill front row
 * first, left to right, and each fills front row to back, left to right.
 * Pure; fixed per footprint; `plots` clips the last section.
 */
export function computeCemeteryLayout(footprint: FootprintSize, plots: number): CemeteryLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const tile = TILE_METERS;
  const driveX = halfW - tile;
  const drive: Rect = {
    x0: driveX - CEMETERY_DRIVE_M / 2,
    x1: driveX + CEMETERY_DRIVE_M / 2,
    z0: -halfD + CEMETERY_FENCE_INSET_M,
    z1: halfD,
  };

  const sections: { c: number; r: number; rect: Rect }[] = [];
  for (let r = footprint.d - 1; r >= 0; r--) {
    for (let c = 0; c < footprint.w; c++) {
      if (c === footprint.w - 1 && r === footprint.d - 1) continue;
      const rect: Rect = {
        x0: -halfW + c * tile,
        x1: -halfW + (c + 1) * tile,
        z0: -halfD + r * tile,
        z1: -halfD + (r + 1) * tile,
      };
      if (c === 0) rect.x0 += CEMETERY_FENCE_CLEAR_M;
      if (c === footprint.w - 1) rect.x1 -= CEMETERY_FENCE_CLEAR_M;
      if (r === 0) rect.z0 += CEMETERY_FENCE_CLEAR_M;
      if (r === footprint.d - 1) rect.z1 -= CEMETERY_FENCE_CLEAR_M;
      if (c === footprint.w - 2) rect.x1 = drive.x0;
      if (c === footprint.w - 1) rect.x0 = drive.x1;
      sections.push({ c, r, rect });
    }
  }

  const spanX = SECTION_GRAVE_COLS * GRAVE_SPACE.w + (SECTION_GRAVE_COLS - 1) * GRAVE_GAP_M;
  const spanZ = SECTION_GRAVE_ROWS * GRAVE_SPACE.l + (SECTION_GRAVE_ROWS - 1) * GRAVE_AISLE_M;
  const graves: GraveSpace[] = [];
  sections.forEach(({ rect }, section) => {
    const x0 = (rect.x0 + rect.x1) / 2 - spanX / 2;
    const z1 = (rect.z0 + rect.z1) / 2 + spanZ / 2;
    for (let row = 0; row < SECTION_GRAVE_ROWS; row++) {
      for (let col = 0; col < SECTION_GRAVE_COLS; col++) {
        graves.push({
          section,
          x: x0 + GRAVE_SPACE.w / 2 + col * (GRAVE_SPACE.w + GRAVE_GAP_M),
          z: z1 - GRAVE_SPACE.l / 2 - row * (GRAVE_SPACE.l + GRAVE_AISLE_M),
        });
      }
    }
  });

  // The gatehouse hard against the drive's side of its tile, its back a metre in from the tile's.
  const lotX1 = halfW - CEMETERY_FENCE_CLEAR_M;
  const gx0 = drive.x1 + 0.9;
  const gz0 = halfD - tile + 1;
  const gatehouse: Rect = {
    x0: gx0,
    x1: gx0 + CEMETERY_GATEHOUSE.w,
    z0: gz0,
    z1: gz0 + CEMETERY_GATEHOUSE.d,
  };
  const forecourt: Rect = {
    x0: drive.x1,
    x1: gatehouse.x1 + 1,
    z0: gatehouse.z1,
    z1: gatehouse.z1 + CEMETERY_FORECOURT_DEPTH_M,
  };
  const treeX = (gatehouse.x1 + lotX1) / 2;
  // Between the first two columns of burial sections the grids leave a clear lane.
  const gridEdge = (c: number, side: 'x0' | 'x1'): number => {
    const rect = sections.find((s) => s.c === c)!.rect;
    const centre = (rect.x0 + rect.x1) / 2;
    return side === 'x0' ? centre - spanX / 2 : centre + spanX / 2;
  };
  const gapX = (gridEdge(0, 'x1') + gridEdge(1, 'x0')) / 2;
  const trees: Vec2[] = [
    { x: treeX, z: gatehouse.z0 + 3 },
    { x: treeX, z: gatehouse.z0 + 8 },
    ...[-1, 0, 1].map((k) => ({ x: gapX, z: k * tile })),
  ];

  return {
    drive,
    gatehouse,
    forecourt,
    gate: { x0: drive.x0, x1: drive.x1 },
    graves: graves.slice(0, plots),
    trees,
  };
}

/** A box `w` long on X, `rise` tall, `d` deep, its top drawn in to a ridge along X: a gabled roof from the eaves up. */
function gableRoof(
  w: number,
  rise: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const roof = new THREE.BoxGeometry(w, rise, d);
  const position = roof.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) position.setZ(i, 0);
  }
  roof.computeVertexNormals();
  roof.translate(x, y0 + rise / 2, z);
  return paintVertexColor(roof, hexFromRgb(rgb));
}

/** One flat quad of a grave patch, `w` × `l`, `y` above the ground. */
function flatQuad(
  w: number,
  l: number,
  x: number,
  y: number,
  z: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const quad = new THREE.PlaneGeometry(w, l);
  quad.rotateX(-Math.PI / 2);
  quad.translate(x, y, z);
  return paintVertexColor(quad, hexFromRgb(rgb));
}

/** The lawn over the whole lot with its footing, the drive, the forecourt and a patch of darker turf on every grave space; local Y=0 is the highest ground under the lot. */
function buildCemeteryGroundsGeometry(
  footprint: FootprintSize,
  plots: number,
): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const { drive, forecourt, graves } = computeCemeteryLayout(footprint, plots);
  const top = CEMETERY_LAWN_HEIGHT;
  const depth = top + YARD_FOOTING_DEPTH;
  const lawn = new THREE.BoxGeometry(halfW * 2, depth, halfD * 2);
  lawn.translate(0, top - depth / 2, 0);
  const box = (r: Rect, rgb: RGB): THREE.BufferGeometry =>
    standingBox(
      r.x1 - r.x0,
      CEMETERY_PAVING_PROUD_M,
      r.z1 - r.z0,
      (r.x0 + r.x1) / 2,
      top,
      (r.z0 + r.z1) / 2,
      rgb,
    );
  const parts: THREE.BufferGeometry[] = [
    paintVertexColor(lawn, hexFromRgb(CEMETERY_LAWN_RGB)),
    box(drive, CEMETERY_DRIVE_RGB),
    box(forecourt, CEMETERY_FORECOURT_RGB),
  ];
  for (const g of graves) {
    parts.push(
      flatQuad(
        GRAVE_SPACE.w - 0.1,
        GRAVE_SPACE.l - 0.1,
        g.x,
        top + CEMETERY_PATCH_PROUD_M,
        g.z,
        CEMETERY_PATCH_RGB,
      ),
    );
  }
  return mergeParts(parts);
}

/** The gatehouse: walls, gabled roof with eaves, a door and windows on the forecourt side; local Y=0 is the lawn plate's top. */
function buildCemeteryGatehouseGeometry(
  footprint: FootprintSize,
  plots: number,
): THREE.BufferGeometry {
  const { gatehouse } = computeCemeteryLayout(footprint, plots);
  const { w, d, h, wall, eave } = CEMETERY_GATEHOUSE;
  const y0 = CEMETERY_LAWN_HEIGHT;
  const cx = (gatehouse.x0 + gatehouse.x1) / 2;
  const cz = (gatehouse.z0 + gatehouse.z1) / 2;
  const front = gatehouse.z1;
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, wall, d, cx, y0, cz, GATEHOUSE_WALL_RGB),
    gableRoof(w + 2 * eave, h - wall, d + 2 * eave, cx, y0 + wall, cz, GATEHOUSE_ROOF_RGB),
    standingBox(1.1, 2.1, 0.1, cx, y0, front + 0.05, GATEHOUSE_DOOR_RGB),
  ];
  for (const dx of [-4.6, -2.6, 2.6, 4.6]) {
    parts.push(standingBox(1.5, 1.2, 0.1, cx + dx, y0 + 0.9, front + 0.05, GATEHOUSE_GLASS_RGB));
  }
  return mergeParts(parts);
}

/**
 * The fence round the lot: posts every 2.5 m, two rails and pickets between,
 * all 1.5 m, open for the drive where two stone piers stand each side of it;
 * local Y=0 is the lawn plate's top.
 */
function buildCemeteryFenceGeometry(footprint: FootprintSize, plots: number): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const { gate } = computeCemeteryLayout(footprint, plots);
  const y0 = CEMETERY_LAWN_HEIGHT;
  const edge = CEMETERY_FENCE_INSET_M;
  const x0 = -halfW + edge;
  const x1 = halfW - edge;
  const zBack = -halfD + edge;
  const zFront = halfD - edge;
  const height = CEMETERY_FENCE_HEIGHT_M;
  const rail = 0.06;
  const parts: THREE.BufferGeometry[] = [];

  // One run along X or Z from `a` to `b` at a fixed cross coordinate.
  const run = (a: number, b: number, fixed: number, alongX: boolean): void => {
    const length = b - a;
    const mid = (a + b) / 2;
    const at = (along: number, w: number, hgt: number, y: number, thick: number): void => {
      parts.push(
        alongX
          ? standingBox(w, hgt, thick, along, y0 + y, fixed, CEMETERY_FENCE_RGB)
          : standingBox(thick, hgt, w, fixed, y0 + y, along, CEMETERY_FENCE_RGB),
      );
    };
    at(mid, length, rail, height - rail, rail);
    at(mid, length, rail, 0.25, rail);
    const posts = Math.max(1, Math.round(length / CEMETERY_FENCE_POST_SPACING_M));
    for (let i = 0; i <= posts; i++) at(a + (i * length) / posts, 0.1, height, 0, 0.1);
    const pickets = Math.floor(length / CEMETERY_PICKET_SPACING_M);
    for (let i = 1; i < pickets; i++) {
      at(a + (i * length) / pickets, 0.03, height - 0.2, 0.1, 0.03);
    }
  };
  run(x0, gate.x0 - CEMETERY_GATE_PIER_M, zFront, true);
  run(gate.x1 + CEMETERY_GATE_PIER_M, x1, zFront, true);
  run(x0, x1, zBack, true);
  run(zBack, zFront, x0, false);
  run(zBack, zFront, x1, false);

  for (const px of [gate.x0 - CEMETERY_GATE_PIER_M / 2, gate.x1 + CEMETERY_GATE_PIER_M / 2]) {
    parts.push(
      standingBox(
        CEMETERY_GATE_PIER_M,
        height,
        CEMETERY_GATE_PIER_M,
        px,
        y0,
        zFront,
        CEMETERY_PIER_RGB,
      ),
    );
  }
  return mergeParts(parts);
}

/** One upright headstone on its base, its foot at local Y=0 and its centre on the origin; the stone faces +Z. */
function buildHeadstoneGeometry(): THREE.BufferGeometry {
  return mergeParts([
    standingBox(HEADSTONE.baseW, HEADSTONE.baseH, HEADSTONE.baseT, 0, 0, 0, HEADSTONE_BASE_RGB),
    standingBox(HEADSTONE.w, HEADSTONE.h, HEADSTONE.t, 0, HEADSTONE.baseH, 0, HEADSTONE_RGB),
  ]);
}

/** Where the headstone of grave `g` stands: at the head (back) end of its space, in the footprint frame. */
export function headstoneAt(g: Vec2): Vec2 {
  return { x: g.x, z: g.z - GRAVE_SPACE.l / 2 + HEADSTONE_HEAD_SETBACK_M };
}

// ---------------------------------------------------------------------------
// crematorium: a chapel with a gabled roof, a flat-roofed cremator hall with
// its one flue, a foyer and an office, on a lawn plate with a paved forecourt
// on the street side (local +Z). The plate is on the highest ground under the
// lot, like the cemetery's, so the buildings stand on one level on a slope.
// ---------------------------------------------------------------------------

/**
 * The rooms' floor areas, m²: the chapel (100 seats at 1.4 m² net over 0.65),
 * the office, the foyer and the cremator hall with its plant and body store.
 * The hall's 240 m² is assumed, at 6 × 10 m for each of two retorts plus 120 m²
 * of plant; no published figure stands behind it.
 */
export const CREMATORIUM_ROOMS = {
  chapel: { w: 15, d: 14.33 },
  office: { w: 12, d: 9.25 },
  foyer: { w: 8, d: 7.5 },
  hall: { w: 16, d: 15 },
};
/** The flue stands 7.6 m (25 ft) above grade: inside the 18-25 ft of US crematory air permits, over 3 ft above the roof. */
export const CREMATORIUM_FLUE_HEIGHT_M = 7.6;
/** An 8-sided stack about 0.9 m (36 in) across at its mouth: the game's own choice of diameter. */
const CREMATORIUM_FLUE_RADIUS = { bottom: 0.5, top: 0.45 };
const CREMATORIUM_FLUE_SIDES = 8;
const CREMATORIUM_FLUE_RIM = { height: 0.4, bonus: 0.12 };
const CREMATORIUM_DUCT = { w: 5, h: 0.9, d: 0.9 };
const CREMATORIUM_EDGE_MARGIN_M = 3;
const CREMATORIUM_ROOM_GAP_M = 2;
/** The chapel's ridge is the building's 6.4 m: one tall storey, counted as two floors. */
export const CREMATORIUM_RIDGE_M = 6.4;
const CREMATORIUM_CHAPEL_EAVE_M = 3.6;
/** The flat-roofed cremator hall is 4.5 m (15 ft), the game's own height: enough to clear a retort and its breeching duct. */
export const CREMATORIUM_HALL_HEIGHT_M = 4.5;
const CREMATORIUM_FOYER_HEIGHT_M = 3.6;
const CREMATORIUM_OFFICE_HEIGHT_M = 3.2;
export const CREMATORIUM_ROOF_CAP_M = 0.3;
const CREMATORIUM_FORECOURT_WIDTH_M = 9;

const CREMATORIUM_CHAPEL_WALL_RGB: RGB = [0.8, 0.76, 0.68];
const CREMATORIUM_CHAPEL_ROOF_RGB: RGB = [0.3, 0.33, 0.37];
const CREMATORIUM_HALL_RGB: RGB = [0.5, 0.5, 0.52];
const CREMATORIUM_CAP_RGB: RGB = [0.28, 0.29, 0.31];
const CREMATORIUM_FOYER_RGB: RGB = [0.72, 0.68, 0.6];
const CREMATORIUM_OFFICE_RGB: RGB = [0.66, 0.62, 0.56];
const CREMATORIUM_GLASS_RGB: RGB = [0.22, 0.3, 0.36];
const CREMATORIUM_DOOR_RGB: RGB = [0.22, 0.14, 0.1];
const CREMATORIUM_FLUE_RGB: RGB = [0.62, 0.64, 0.67];
const CREMATORIUM_FLUE_RIM_RGB: RGB = [0.18, 0.18, 0.2];
const CREMATORIUM_DUCT_RGB: RGB = [0.36, 0.37, 0.4];
const CREMATORIUM_FORECOURT_RGB: RGB = [0.62, 0.6, 0.55];

export interface CrematoriumLayout {
  chapel: Rect;
  hall: Rect;
  foyer: Rect;
  office: Rect;
  forecourt: Rect;
  /** The flue's centre, over the back of the cremator hall. */
  flue: Vec2;
}

/**
 * The hall at the back left and the chapel beside it share a front line; the
 * foyer joins them between and the office stands before the hall. Pure; fixed
 * per footprint, in the footprint frame with +Z toward the street.
 */
export function computeCrematoriumLayout(footprint: FootprintSize): CrematoriumLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const { chapel, office, foyer, hall } = CREMATORIUM_ROOMS;
  const hallX0 = -halfW + CREMATORIUM_EDGE_MARGIN_M;
  const back = -halfD + CREMATORIUM_EDGE_MARGIN_M;
  const front = back + hall.d;
  const chapelX0 = hallX0 + hall.w + CREMATORIUM_ROOM_GAP_M;
  const foyerX0 = (hallX0 + hall.w + chapelX0) / 2 - foyer.w / 2;
  const foyerZ1 = front + foyer.d;
  return {
    hall: { x0: hallX0, x1: hallX0 + hall.w, z0: back, z1: front },
    chapel: { x0: chapelX0, x1: chapelX0 + chapel.w, z0: front - chapel.d, z1: front },
    foyer: { x0: foyerX0, x1: foyerX0 + foyer.w, z0: front, z1: foyerZ1 },
    office: { x0: hallX0, x1: hallX0 + office.w, z0: front, z1: front + office.d },
    forecourt: {
      x0: foyerX0 + foyer.w / 2 - CREMATORIUM_FORECOURT_WIDTH_M / 2,
      x1: foyerX0 + foyer.w / 2 + CREMATORIUM_FORECOURT_WIDTH_M / 2,
      z0: foyerZ1,
      z1: halfD,
    },
    flue: { x: hallX0 + hall.w - 2, z: front - 1.5 },
  };
}

/** The lawn plate with its footing and the paved forecourt; local Y=0 is the highest ground under the lot. */
function buildCrematoriumGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const { forecourt } = computeCrematoriumLayout(footprint);
  const top = CEMETERY_LAWN_HEIGHT;
  const depth = top + YARD_FOOTING_DEPTH;
  const lawn = new THREE.BoxGeometry(halfW * 2, depth, halfD * 2);
  lawn.translate(0, top - depth / 2, 0);
  return mergeParts([
    paintVertexColor(lawn, hexFromRgb(CEMETERY_LAWN_RGB)),
    standingBox(
      forecourt.x1 - forecourt.x0,
      CEMETERY_PAVING_PROUD_M,
      forecourt.z1 - forecourt.z0,
      (forecourt.x0 + forecourt.x1) / 2,
      top,
      (forecourt.z0 + forecourt.z1) / 2,
      CREMATORIUM_FORECOURT_RGB,
    ),
  ]);
}

/** A room's box on the lawn plate, from its rect. */
function roomBox(r: Rect, height: number, rgb: RGB): THREE.BufferGeometry {
  return standingBox(
    r.x1 - r.x0,
    height,
    r.z1 - r.z0,
    (r.x0 + r.x1) / 2,
    CEMETERY_LAWN_HEIGHT,
    (r.z0 + r.z1) / 2,
    rgb,
  );
}

/**
 * The chapel under its gable (ridge along X, at the catalog's 6.4 m), the
 * cremator hall under a flat roof with its duct to the flue, the foyer with
 * its glass and door on the street side, and the office; local Y=0 is the
 * ground, the rooms standing on the lawn plate.
 */
function buildCrematoriumBuildingGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { chapel, hall, foyer, office, flue } = computeCrematoriumLayout(footprint);
  const y0 = CEMETERY_LAWN_HEIGHT;
  const cx = (chapel.x0 + chapel.x1) / 2;
  const cz = (chapel.z0 + chapel.z1) / 2;
  const parts: THREE.BufferGeometry[] = [
    roomBox(chapel, CREMATORIUM_CHAPEL_EAVE_M, CREMATORIUM_CHAPEL_WALL_RGB),
    gableRoof(
      chapel.x1 - chapel.x0,
      CREMATORIUM_RIDGE_M - CREMATORIUM_CHAPEL_EAVE_M,
      chapel.z1 - chapel.z0,
      cx,
      y0 + CREMATORIUM_CHAPEL_EAVE_M,
      cz,
      CREMATORIUM_CHAPEL_ROOF_RGB,
    ),
    roomBox(hall, CREMATORIUM_HALL_HEIGHT_M, CREMATORIUM_HALL_RGB),
    standingBox(
      hall.x1 - hall.x0,
      CREMATORIUM_ROOF_CAP_M,
      hall.z1 - hall.z0,
      (hall.x0 + hall.x1) / 2,
      y0 + CREMATORIUM_HALL_HEIGHT_M,
      (hall.z0 + hall.z1) / 2,
      CREMATORIUM_CAP_RGB,
    ),
    // The duct that carries the retorts' exhaust along the roof to the flue.
    standingBox(
      CREMATORIUM_DUCT.w,
      CREMATORIUM_DUCT.h,
      CREMATORIUM_DUCT.d,
      flue.x - CREMATORIUM_DUCT.w / 2,
      y0 + CREMATORIUM_HALL_HEIGHT_M + CREMATORIUM_ROOF_CAP_M,
      flue.z,
      CREMATORIUM_DUCT_RGB,
    ),
    roomBox(foyer, CREMATORIUM_FOYER_HEIGHT_M, CREMATORIUM_FOYER_RGB),
    standingBox(
      1.8,
      2.4,
      0.1,
      (foyer.x0 + foyer.x1) / 2,
      y0,
      foyer.z1 + 0.05,
      CREMATORIUM_DOOR_RGB,
    ),
    roomBox(office, CREMATORIUM_OFFICE_HEIGHT_M, CREMATORIUM_OFFICE_RGB),
  ];
  for (const dx of [-3, 3]) {
    parts.push(
      standingBox(
        1.4,
        1.2,
        0.1,
        (foyer.x0 + foyer.x1) / 2 + dx,
        y0 + 1,
        foyer.z1 + 0.05,
        CREMATORIUM_GLASS_RGB,
      ),
    );
  }
  for (const dx of [-3.5, 0, 3.5]) {
    parts.push(
      standingBox(
        1.5,
        1.2,
        0.1,
        (office.x0 + office.x1) / 2 + dx,
        y0 + 0.9,
        office.z1 + 0.05,
        CREMATORIUM_GLASS_RGB,
      ),
    );
  }
  return mergeParts(parts);
}

/** The flue: a tapered steel stack with a dark rim at its mouth, 7.6 m from its base on the lawn plate. */
function buildCrematoriumFlueGeometry(): THREE.BufferGeometry {
  const y0 = CEMETERY_LAWN_HEIGHT;
  const flue = new THREE.CylinderGeometry(
    CREMATORIUM_FLUE_RADIUS.top,
    CREMATORIUM_FLUE_RADIUS.bottom,
    CREMATORIUM_FLUE_HEIGHT_M,
    CREMATORIUM_FLUE_SIDES,
  );
  flue.translate(0, y0 + CREMATORIUM_FLUE_HEIGHT_M / 2, 0);
  paintVertexColor(flue, hexFromRgb(CREMATORIUM_FLUE_RGB));
  const rimRadius = CREMATORIUM_FLUE_RADIUS.top + CREMATORIUM_FLUE_RIM.bonus;
  const rim = new THREE.CylinderGeometry(
    rimRadius,
    rimRadius,
    CREMATORIUM_FLUE_RIM.height,
    CREMATORIUM_FLUE_SIDES,
  );
  rim.translate(0, y0 + CREMATORIUM_FLUE_HEIGHT_M - CREMATORIUM_FLUE_RIM.height / 2, 0);
  paintVertexColor(rim, hexFromRgb(CREMATORIUM_FLUE_RIM_RGB));
  return mergeParts([flue, rim]);
}

// ---------------------------------------------------------------------------
// fire and police stations: one building on a paved lot, local +Z the street
// side. A fire station is read by its bay doors and the apron before them, a
// police station by its entrance and its sally port. The windows and the
// glazing of the doors are the one lit part, on a material that follows the
// night factor.
// ---------------------------------------------------------------------------

/** A bay is 18 ft (5.49 m) from door to door: the width preferred, never under 14 ft. */
export const STATION_BAY_PITCH_M = 18 * FOOT_M;
/** The doors of an apparatus bay, 16 ft wide and 15 ft high: over the 14 × 14 ft least. */
export const STATION_BAY_DOOR = { w: 16 * FOOT_M, h: 15 * FOOT_M };
/** A sally port's vehicle door: 14 ft wide, 12 ft high, a patrol car being 1.6 m. */
export const STATION_SALLY_DOOR = { w: 14 * FOOT_M, h: 12 * FOOT_M };
const STATION_ENTRANCE = { w: 2.4, h: 2.4 };
/** The lot's margin round the building, and the roof's parapet. */
const STATION_EDGE_M = 3;
const STATION_CAP_M = 0.4;
/** How far a door's frame shows beyond its leaf, and how far each stands proud of the wall. */
const STATION_FRAME_M = 0.35;
const STATION_FRAME_PROUD_M = 0.1;
const STATION_LEAF_PROUD_M = 0.2;
const STATION_WINDOW = { w: 2, h: 1.4, pitch: 4.2 };
const STATION_STOREY_M = 3.2;
/** A hose tower of four storeys, 4 m square: the game's own choice. */
export const STATION_TOWER = { size: 4, height: 12.8 };
const STATION_POLE_M = 5;
const STATION_WALK_M = 2.44;
const STATION_SALLY_CLEAR_M = 1;

const STATION_FIRE_WALL_RGB: RGB = [0.58, 0.27, 0.22];
const STATION_POLICE_WALL_RGB: RGB = [0.56, 0.6, 0.66];
const STATION_CAP_RGB: RGB = [0.42, 0.4, 0.38];
const STATION_BAND_RGB: RGB = [0.18, 0.3, 0.55];
const STATION_BELT_RGB: RGB = [0.72, 0.72, 0.7];
const STATION_FRAME_RGB: RGB = [0.2, 0.2, 0.22];
const STATION_FIRE_DOOR_RGB: RGB = [0.9, 0.9, 0.86];
const STATION_SALLY_DOOR_RGB: RGB = [0.82, 0.84, 0.86];
const STATION_GROOVE_RGB: RGB = [0.62, 0.63, 0.62];
const STATION_ENTRANCE_RGB: RGB = [0.2, 0.2, 0.24];
const STATION_PAVING_RGB: RGB = [0.62, 0.62, 0.6];
const STATION_LINE_RGB: RGB = [0.88, 0.88, 0.84];
const STATION_TOWER_RGB: RGB = [0.5, 0.23, 0.19];
const STATION_POLE_RGB: RGB = [0.45, 0.47, 0.5];
const STATION_GLASS_COLOR = 0x2c3d4a;
const STATION_LIGHT_COLOR = 0xffd98a;

export type StationService = 'fire' | 'police';

/** A door on the street face of the building: its centre along X, width and clear height. */
export interface StationDoor {
  x: number;
  w: number;
  h: number;
}

/** A lit pane on the street face: centre along X, height of its underside above the floor, size, and how far it stands out of the wall. */
export interface StationPane {
  x: number;
  y: number;
  w: number;
  h: number;
  out: number;
}

/** One car stall: its centre, and which way a car in it turns (0 nose to +Z, 2 nose to -Z). */
export interface StationStall extends Vec2 {
  turn: 0 | 2;
}

interface StallRow {
  x0: number;
  x1: number;
  z0: number;
  turn: 0 | 2;
  gaps: readonly (readonly [number, number])[];
}

export interface StationLayout {
  service: StationService;
  plate: Rect;
  height: number;
  bayDoors: StationDoor[];
  entrance: StationDoor;
  sallyPort: StationDoor | null;
  /** Concrete before the doors: the apron, the sally drive and the entrance walk. */
  paving: Rect[];
  panes: StationPane[];
  /** Centres of the appliances or patrol cars parked before the doors, nose to +Z. */
  apparatus: Vec2[];
  stalls: StationStall[];
  tower: Rect | null;
  pole: Vec2 | null;
}

interface StationPlan {
  service: StationService;
  /** The building's plate on the ground, metres: the floor over its storeys. */
  plate: { w: number; d: number };
  bays: number;
  apparatus: number;
  /** Police only: how far in from the plate's right end the sally port stands. */
  sallyInset: number;
  tower: boolean;
  rows: (plate: Rect, gaps: StallRow['gaps']) => StallRow[];
}

/**
 * The plates are each building's stated floor over its storeys: fire ~500 m² and
 * 1,420 m² for the first rungs (two storeys: 252 and 714 m²), 1,462 m² and 3,530 m²
 * for the district rungs (two storeys: 732 m², three: 1,177 m²). The plate sits
 * 3 m inside the lot's back and left edges; the bays, the apron and the car
 * park take the ground that is left.
 */
const STATION_PLANS: Readonly<Record<string, StationPlan>> = {
  'fire-station': {
    service: 'fire',
    plate: { w: 18, d: 14 },
    bays: 2,
    apparatus: 1,
    sallyInset: 0,
    tower: false,
    rows: (plate) => [
      { x0: plate.x1 + 2, x1: plate.x1 + 2 + 5 * DECK_STALL.w, z0: plate.z0, turn: 0, gaps: [] },
    ],
  },
  'fire-station-district': {
    service: 'fire',
    plate: { w: 36.6, d: 20 },
    bays: 3,
    apparatus: 2,
    sallyInset: 0,
    tower: true,
    rows: (plate) => {
      const x0 = plate.x1 + 1.8;
      const x1 = x0 + 6 * DECK_STALL.w;
      const second = plate.z0 + DECK_STALL.l + DECK_AISLE_M;
      return [
        { x0, x1, z0: plate.z0, turn: 2, gaps: [] },
        { x0, x1, z0: second, turn: 0, gaps: [] },
        { x0, x1, z0: second + DECK_STALL.l, turn: 2, gaps: [] },
      ];
    },
  },
  'police-station': {
    service: 'police',
    plate: { w: 34, d: 21 },
    bays: 0,
    apparatus: 1,
    sallyInset: 6,
    tower: false,
    rows: (plate, gaps) => [{ x0: plate.x0, x1: plate.x1, z0: plate.z1 + 3.2, turn: 2, gaps }],
  },
  'police-station-district': {
    service: 'police',
    plate: { w: 54, d: 21.8 },
    bays: 0,
    apparatus: 2,
    sallyInset: 7,
    tower: false,
    rows: (plate, gaps) => [
      { x0: plate.x0, x1: plate.x1, z0: plate.z1 + 6, turn: 2, gaps },
      {
        x0: plate.x0,
        x1: plate.x1,
        z0: plate.z1 + 6 + DECK_STALL.l + DECK_AISLE_M,
        turn: 0,
        gaps,
      },
    ],
  },
};

/** The stalls of a row: whole stalls along X, none over a gap. */
function stallsOfRow(row: StallRow): StationStall[] {
  const stalls: StationStall[] = [];
  for (let x = row.x0; x + DECK_STALL.w <= row.x1 + 1e-9; x += DECK_STALL.w) {
    if (row.gaps.some(([a, b]) => x < b && x + DECK_STALL.w > a)) continue;
    stalls.push({ x: x + DECK_STALL.w / 2, z: row.z0 + DECK_STALL.l / 2, turn: row.turn });
  }
  return stalls;
}

/**
 * Where everything stands on a station's lot, in the footprint frame with +Z to
 * the street. A fire station's bays run along the front from the left, the wing
 * of quarters beside them, the apron before the doors out to the street and the
 * staff stalls to the right. A police station is one plate across the back with
 * its entrance at the middle, its sally port at the right and a car park before
 * it. Pure; fixed per catalog entry.
 */
export function computeStationLayout(entry: BuildingCatalogEntry): StationLayout {
  const plan = STATION_PLANS[entry.id];
  if (!plan) throw new RangeError(`utilitykits: no station plan for "${entry.id}"`);
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const plate: Rect = {
    x0: -halfW + STATION_EDGE_M,
    x1: -halfW + STATION_EDGE_M + plan.plate.w,
    z0: -halfD + STATION_EDGE_M,
    z1: -halfD + STATION_EDGE_M + plan.plate.d,
  };
  const front = plate.z1;
  const bayDoors: StationDoor[] = [];
  for (let i = 0; i < plan.bays; i++) {
    bayDoors.push({
      x: plate.x0 + (i + 0.5) * STATION_BAY_PITCH_M,
      w: STATION_BAY_DOOR.w,
      h: STATION_BAY_DOOR.h,
    });
  }
  const bayBlockEnd = plate.x0 + plan.bays * STATION_BAY_PITCH_M;
  const fire = plan.service === 'fire';
  const entrance: StationDoor = {
    x: fire ? (bayBlockEnd + plate.x1) / 2 : (plate.x0 + plate.x1) / 2,
    ...STATION_ENTRANCE,
  };
  const sallyPort: StationDoor | null =
    plan.sallyInset > 0 ? { x: plate.x1 - plan.sallyInset, ...STATION_SALLY_DOOR } : null;

  const walk: Rect = {
    x0: entrance.x - STATION_WALK_M / 2,
    x1: entrance.x + STATION_WALK_M / 2,
    z0: front,
    z1: halfD,
  };
  const paving: Rect[] = [walk];
  if (fire) paving.push({ x0: plate.x0, x1: bayBlockEnd + 1, z0: front, z1: halfD });
  if (sallyPort) {
    paving.push({
      x0: sallyPort.x - sallyPort.w / 2 - 1,
      x1: sallyPort.x + sallyPort.w / 2 + 1,
      z0: front,
      z1: halfD,
    });
  }

  const gaps: [number, number][] = [];
  if (sallyPort) {
    const reach = sallyPort.w / 2 + 1 + STATION_SALLY_CLEAR_M;
    gaps.push([entrance.x - STATION_WALK_M / 2 - 0.3, entrance.x + STATION_WALK_M / 2 + 0.3]);
    gaps.push([sallyPort.x - reach, sallyPort.x + reach]);
  }
  const stalls = plan.rows(plate, gaps).flatMap(stallsOfRow);

  const panes: StationPane[] = [];
  for (const door of bayDoors) {
    for (let k = 0; k < 4; k++) {
      panes.push({ x: door.x + (k - 1.5) * 1.1, y: door.h - 1, w: 0.95, h: 0.55, out: 0.3 });
    }
  }
  for (const dx of [-0.6, 0.6]) {
    panes.push({ x: entrance.x + dx, y: 0.4, w: 1, h: 1.7, out: 0.2 });
  }
  const storeys = Math.round(entry.height / STATION_STOREY_M);
  const wallFrom = fire ? bayBlockEnd + 1.6 : plate.x0 + 2.2;
  const wallTo = fire ? plate.x1 - 1.6 : plate.x1 - 2.2;
  for (let f = 0; f < storeys; f++) {
    for (let x = wallFrom + 1; x + 1 <= wallTo + 1e-9; x += STATION_WINDOW.pitch) {
      const clear = (door: StationDoor, margin: number): boolean =>
        Math.abs(x - door.x) > door.w / 2 + margin + STATION_WINDOW.w / 2;
      if (f === 0 && !clear(entrance, 1.5)) continue;
      if (f === 0 && sallyPort && !clear(sallyPort, 1)) continue;
      panes.push({
        x,
        y: f * STATION_STOREY_M + 1.2,
        w: STATION_WINDOW.w,
        h: STATION_WINDOW.h,
        out: 0.05,
      });
    }
  }

  const apparatus: Vec2[] = [];
  for (let i = 0; i < plan.apparatus; i++) {
    apparatus.push(
      fire
        ? { x: bayDoors[i]!.x, z: front + 1.5 + sizeForKind(VehicleKind.Fire)[2] / 2 }
        : { x: sallyPort!.x, z: front + 3 + i * 7 + sizeForKind(VehicleKind.Police)[2] / 2 },
    );
  }

  return {
    service: plan.service,
    plate,
    height: entry.height,
    bayDoors,
    entrance,
    sallyPort,
    paving,
    panes,
    apparatus,
    stalls,
    tower: plan.tower
      ? {
          x0: plate.x1 - STATION_TOWER.size,
          x1: plate.x1,
          z0: plate.z0,
          z1: plate.z0 + STATION_TOWER.size,
        }
      : null,
    pole: fire ? null : { x: plate.x0 + 3, z: plate.z0 + 3 },
  };
}

/** The paved lot: the asphalt slab, the concrete before the doors and the white lines of every stall. */
function buildStationYardGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const layout = computeStationLayout(entry);
  const top = RECYCLING_YARD_HEIGHT;
  const parts: THREE.BufferGeometry[] = [buildRecyclingYardGeometry(entry.footprint)];
  for (const r of layout.paving) {
    parts.push(
      standingBox(
        r.x1 - r.x0,
        0.03,
        r.z1 - r.z0,
        (r.x0 + r.x1) / 2,
        top,
        (r.z0 + r.z1) / 2,
        STATION_PAVING_RGB,
      ),
    );
  }
  for (const stall of layout.stalls) {
    for (const side of [-1, 1]) {
      parts.push(
        standingBox(
          0.1,
          0.04,
          DECK_STALL.l,
          stall.x + (side * DECK_STALL.w) / 2,
          top,
          stall.z,
          STATION_LINE_RGB,
        ),
      );
    }
  }
  return mergeParts(parts);
}

/** A door on the street face: a dark frame, a lighter leaf proud of it and, for a bay, the panel seams across the leaf. */
function stationDoorParts(
  door: StationDoor,
  front: number,
  y0: number,
  leafRgb: RGB,
  seams: boolean,
): THREE.BufferGeometry[] {
  const parts = [
    standingBox(
      door.w + 2 * STATION_FRAME_M,
      door.h + STATION_FRAME_M,
      0.2,
      door.x,
      y0,
      front + STATION_FRAME_PROUD_M,
      STATION_FRAME_RGB,
    ),
    standingBox(door.w, door.h, 0.12, door.x, y0, front + STATION_LEAF_PROUD_M, leafRgb),
  ];
  if (seams) {
    for (let k = 1; k <= 5; k++) {
      parts.push(
        standingBox(
          door.w,
          0.06,
          0.04,
          door.x,
          y0 + (door.h * k) / 6,
          front + STATION_LEAF_PROUD_M + 0.07,
          STATION_GROOVE_RGB,
        ),
      );
    }
  }
  return parts;
}

/** The building: walls to the catalog height under a parapet, the doors, and for a police station the belt courses, the blue band and the entrance canopy. */
function buildStationBuildingGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const layout = computeStationLayout(entry);
  const { plate, height } = layout;
  const fire = layout.service === 'fire';
  const y0 = RECYCLING_YARD_HEIGHT;
  const cx = (plate.x0 + plate.x1) / 2;
  const cz = (plate.z0 + plate.z1) / 2;
  const w = plate.x1 - plate.x0;
  const d = plate.z1 - plate.z0;
  const front = plate.z1;
  const parts: THREE.BufferGeometry[] = [
    standingBox(
      w,
      height - STATION_CAP_M,
      d,
      cx,
      y0,
      cz,
      fire ? STATION_FIRE_WALL_RGB : STATION_POLICE_WALL_RGB,
    ),
    standingBox(
      w + 0.4,
      STATION_CAP_M,
      d + 0.4,
      cx,
      y0 + height - STATION_CAP_M,
      cz,
      STATION_CAP_RGB,
    ),
  ];
  for (const door of layout.bayDoors) {
    parts.push(...stationDoorParts(door, front, y0, STATION_FIRE_DOOR_RGB, true));
  }
  if (layout.sallyPort) {
    parts.push(...stationDoorParts(layout.sallyPort, front, y0, STATION_SALLY_DOOR_RGB, true));
  }
  const { entrance } = layout;
  parts.push(
    standingBox(entrance.w, entrance.h, 0.12, entrance.x, y0, front + 0.1, STATION_ENTRANCE_RGB),
  );
  if (!fire) {
    const storeys = Math.round(height / STATION_STOREY_M);
    for (let f = 1; f < storeys; f++) {
      parts.push(
        standingBox(
          w + 0.1,
          0.2,
          d + 0.1,
          cx,
          y0 + f * STATION_STOREY_M - 0.1,
          cz,
          STATION_BELT_RGB,
        ),
      );
    }
    parts.push(
      standingBox(
        w + 0.1,
        0.9,
        d + 0.1,
        cx,
        y0 + height - STATION_CAP_M - 1.3,
        cz,
        STATION_BAND_RGB,
      ),
      standingBox(5, 0.25, 3, entrance.x, y0 + 3, front + 1.5, STATION_CAP_RGB),
    );
    for (const sx of [-1, 1]) {
      parts.push(
        standingBox(0.25, 3, 0.25, entrance.x + sx * 2.4, y0, front + 2.8, STATION_POLE_RGB),
      );
    }
  }
  return mergeParts(parts);
}

/** Every lit pane on the street face, one geometry for the one emissive material. */
function buildStationLitGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const { plate, panes } = computeStationLayout(entry);
  return mergeParts(
    panes.map((pane) =>
      standingBox(
        pane.w,
        pane.h,
        0.06,
        pane.x,
        RECYCLING_YARD_HEIGHT + pane.y,
        plate.z1 + pane.out,
        STATION_POLE_RGB,
      ),
    ),
  );
}

/** The hose tower of a fire station, or the radio pole on a police station's roof. */
function buildStationMastGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const { tower, pole, height } = computeStationLayout(entry);
  const y0 = RECYCLING_YARD_HEIGHT;
  if (tower) {
    return mergeParts([
      standingBox(
        tower.x1 - tower.x0,
        STATION_TOWER.height,
        tower.z1 - tower.z0,
        (tower.x0 + tower.x1) / 2,
        y0,
        (tower.z0 + tower.z1) / 2,
        STATION_TOWER_RGB,
      ),
      standingBox(
        tower.x1 - tower.x0 + 0.4,
        STATION_CAP_M,
        tower.z1 - tower.z0 + 0.4,
        (tower.x0 + tower.x1) / 2,
        y0 + STATION_TOWER.height,
        (tower.z0 + tower.z1) / 2,
        STATION_CAP_RGB,
      ),
    ]);
  }
  if (!pole) throw new RangeError('utilitykits: a station mast needs a tower or a pole');
  const roof = y0 + height;
  return mergeParts([
    standingBox(0.3, STATION_POLE_M, 0.3, pole.x, roof, pole.z, STATION_POLE_RGB),
    standingBox(2.2, 0.15, 0.15, pole.x, roof + STATION_POLE_M - 1, pole.z, STATION_POLE_RGB),
    standingBox(1.4, 0.15, 0.15, pole.x, roof + STATION_POLE_M - 2, pole.z, STATION_POLE_RGB),
  ]);
}

/** Whether a station kit has a tower or a pole to draw. */
export function stationHasMast(entry: BuildingCatalogEntry): boolean {
  const layout = computeStationLayout(entry);
  return layout.tower !== null || layout.pole !== null;
}

// ---------------------------------------------------------------------------
// the schools, the college and the library: double-loaded classroom wings round
// a courtyard, a gym, and the grounds the lot is read by: a playground, a bus
// pull-in with its bus, tennis courts, a quad, a car park. Each turns with the
// lot, local +Z the street side, and stands on a lawn plate on the highest
// ground under the lot. Every window, the gyms' high bands, the library's
// clerestory and the door panes are the one lit part, on the stations' night
// material.
// ---------------------------------------------------------------------------

/** A classroom wing is 20.7 m (68 ft) deep: two 30 ft bays either side of an 8 ft corridor. */
export const EDU_WING_DEPTH_M = 20.7;
export const EDU_STOREY_M = 3.2;
export const EDU_WING_STOREYS = 3;
/** A gym is one storey of 7.3 m (24 ft), counted as two floors. */
export const EDU_GYM = { height: 7.3, floors: 2 };
/** Every building keeps this far clear of the lot's edge. */
export const EDU_EDGE_M = 2;
/** A bus pull-in is 9.1 m (30 ft) deep along the frontage. */
export const EDU_PULL_IN_M = 9.1;
/** Two paired tennis courts, each 78 × 36 ft with its run-back: 36.6 × 32.9 m together. */
export const EDU_TENNIS_PAIR = { w: 36.6, d: 32.9 };
/** A flagpole stands 9.1 m (30 ft) from the ground. */
export const FLAGPOLE_HEIGHT_M = 9.1;
/** A Type C school bus, 36 ft conventional. */
export const SCHOOL_BUS_SIZE = { w: 2.44, h: 3.2, l: 11 };
/** The library's plate and the reading room's share of its length. */
export const EDU_LIBRARY = { w: 42, d: 27.2, reading: 24, readingHeight: 6 };

const EDU_PARAPET_M = 0.4;
const EDU_CAP_M = 0.2;
const EDU_BACK_CLEAR_M = 3;
const EDU_WALK_M = 2.44;
const EDU_CANOPY = { w: 6, d: 3, y: 3, slab: 0.25 };
const EDU_PORTICO = { w: 14, d: 4, columns: 6, columnY: 6, entablature: 0.9, rise: 2.2 };
const EDU_WINDOW = { w: 2.2, h: 1.6, sill: 1, pitch: 3.05, end: 1.5, margin: 0.3 };
const EDU_GYM_BAND = { y: 5, h: 1.2, end: 1 };
const EDU_PANE_T = 0.12;
const EDU_DOOR_SKIP_M = 4.2;
const EDU_ASPHALT_M = 0.03;
const EDU_CONCRETE_M = 0.045;
const EDU_PATCH_M = 0.02;
const EDU_LINE_M = 0.015;
const EDU_LINE_W = 0.1;
const EDU_TREE_CLEAR_M = 3.4;

const EDU_BRICK_RGB: RGB = [0.5, 0.3, 0.23];
const EDU_LIMESTONE_RGB: RGB = [0.84, 0.78, 0.64];
const EDU_LIBRARY_RGB: RGB = [0.74, 0.62, 0.45];
const EDU_COLUMN_RGB: RGB = [0.88, 0.86, 0.8];
const EDU_CAP_RGB: RGB = [0.42, 0.4, 0.38];
const EDU_BELT_RGB: RGB = [0.72, 0.7, 0.64];
const EDU_CANOPY_RGB: RGB = [0.84, 0.84, 0.82];
const EDU_FRAME_RGB: RGB = [0.2, 0.2, 0.22];
const EDU_DOOR_RGB: RGB = [0.16, 0.18, 0.24];
const EDU_ASPHALT_RGB: RGB = [0.24, 0.25, 0.27];
const EDU_CONCRETE_RGB: RGB = [0.66, 0.64, 0.6];
const EDU_FIELD_RGB: RGB = [0.26, 0.52, 0.24];
const EDU_COURT_RGB: RGB = [0.18, 0.44, 0.3];
const EDU_LINE_RGB: RGB = [0.9, 0.9, 0.86];
const EDU_MULCH_RGB: RGB = [0.45, 0.3, 0.18];
const EDU_PATH_RGB: RGB = [0.74, 0.7, 0.62];
const EDU_POLE_RGB: RGB = [0.85, 0.85, 0.88];
const EDU_FLAG_RGBS: readonly RGB[] = [
  [0.75, 0.12, 0.14],
  [0.92, 0.92, 0.9],
  [0.15, 0.22, 0.55],
];
const EDU_PLAY_RED_RGB: RGB = [0.8, 0.15, 0.12];
const EDU_PLAY_BLUE_RGB: RGB = [0.15, 0.3, 0.75];
const EDU_PLAY_YELLOW_RGB: RGB = [0.95, 0.75, 0.1];
const EDU_NET_RGB: RGB = [0.92, 0.92, 0.9];
const EDU_BOOK_DROP_RGB: RGB = [0.15, 0.25, 0.5];
const BUS_YELLOW_RGB: RGB = [0.96, 0.72, 0.06];
const BUS_BLACK_RGB: RGB = [0.08, 0.08, 0.09];
const BUS_GLASS_RGB: RGB = [0.12, 0.16, 0.2];
const BUS_AMBER_RGB: RGB = [0.95, 0.6, 0.1];
const BUS_RED_RGB: RGB = [0.75, 0.1, 0.1];
const BUS_LAMP_RGB: RGB = [0.9, 0.88, 0.7];

export type EducationKind = 'elementary' | 'middle' | 'high' | 'college' | 'library';

/** A solid building mass on the ground: its plan, its height and the floors it counts for. */
export interface EducationMass {
  rect: Rect;
  height: number;
  floors: number;
}

/** One car stall: its centre, which way a car in it turns (0 nose to +Z, 1 to +X, 2 to -Z, 3 to -X), its width across and whether it is the accessible one. */
export interface EducationStall extends Vec2 {
  turn: 0 | 1 | 2 | 3;
  across: number;
  accessible: boolean;
}

/** A lit pane: its centre on the plan, its size on the plan, the height of its underside above the floor, and its height. */
export interface EducationPane {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  h: number;
}

/** A path from `a` to `b`, `w` wide. */
export interface EducationPath {
  a: Vec2;
  b: Vec2;
  w: number;
}

/** A door on a wall: its centre on the wall and the wall's outward normal. */
export interface EducationDoor extends Vec2 {
  nx: -1 | 0 | 1;
  nz: -1 | 0 | 1;
}

export interface EducationLayout {
  kind: EducationKind;
  masses: EducationMass[];
  /** The ground the wings and the gym enclose, open to the street; null on a library. */
  courtyard: Rect | null;
  door: EducationDoor;
  /** The canopy over the door, or the college's portico. */
  canopy: Rect;
  asphalt: Rect[];
  concrete: Rect[];
  mulch: Rect | null;
  playStructure: Vec2 | null;
  field: Rect | null;
  tennis: Rect[];
  quad: Rect | null;
  paths: EducationPath[];
  pullIn: Rect | null;
  /** The parked school bus, its nose turned like a stall's. */
  bus: (Vec2 & { turn: 0 | 1 | 2 | 3 }) | null;
  stalls: EducationStall[];
  /** The hatched access aisle beside the accessible stall. */
  accessibleAisle: Rect | null;
  flagpole: Vec2 | null;
  bookDrop: Rect | null;
  trees: Vec2[];
  panes: EducationPane[];
}

interface EducationPlan {
  kind: EducationKind;
  sideLength: number;
  gym: { w: number; d: number } | null;
}

/** Side wings and gyms from the table of stated floors: the plate each building's floor over its storeys asks. */
const EDUCATION_PLANS: Readonly<Record<string, EducationPlan>> = {
  school: { kind: 'elementary', sideLength: 16, gym: { w: 16, d: 23 } },
  'middle-school': { kind: 'middle', sideLength: 42.6, gym: { w: 24, d: 32 } },
  'high-school': { kind: 'high', sideLength: 54.6, gym: { w: 32, d: 40 } },
  college: { kind: 'college', sideLength: 72.7, gym: null },
};

type Face = 'x0' | 'x1' | 'z0' | 'z1';
const FACES: readonly Face[] = ['x0', 'x1', 'z0', 'z1'];

interface FaceFrame {
  a0: number;
  a1: number;
  coord: number;
  nx: -1 | 0 | 1;
  nz: -1 | 0 | 1;
}

function faceFrame(r: Rect, face: Face): FaceFrame {
  switch (face) {
    case 'z0':
      return { a0: r.x0, a1: r.x1, coord: r.z0, nx: 0, nz: -1 };
    case 'z1':
      return { a0: r.x0, a1: r.x1, coord: r.z1, nx: 0, nz: 1 };
    case 'x0':
      return { a0: r.z0, a1: r.z1, coord: r.x0, nx: -1, nz: 0 };
    case 'x1':
      return { a0: r.z0, a1: r.z1, coord: r.x1, nx: 1, nz: 0 };
  }
}

/** Whether another mass stands against `m`'s face over [lo, hi] and rises above height `y`, so a window there would be walled in. */
function walledIn(
  masses: readonly EducationMass[],
  m: EducationMass,
  face: Face,
  lo: number,
  hi: number,
  y: number,
): boolean {
  const f = faceFrame(m.rect, face);
  return masses.some((o) => {
    if (o === m || o.height - 0.05 <= y) return false;
    const r = o.rect;
    const against = { z0: r.z1, z1: r.z0, x0: r.x1, x1: r.x0 }[face];
    if (Math.abs(against - f.coord) > 1e-6) return false;
    const [o0, o1] = f.nz !== 0 ? [r.x0, r.x1] : [r.z0, r.z1];
    return lo < o1 && hi > o0;
  });
}

function paneOnFace(f: FaceFrame, along: number, w: number, y: number, h: number): EducationPane {
  return f.nz !== 0
    ? { x: along, z: f.coord, w, d: EDU_PANE_T, y, h }
    : { x: f.coord, z: along, w: EDU_PANE_T, d: w, y, h };
}

/** A box on a door's wall, `a` along the wall from the door's centre and `proud` out of it: its plan centre and size. */
function wallPlan(
  door: EducationDoor,
  a: number,
  w: number,
  thick: number,
  proud: number,
): { x: number; z: number; w: number; d: number } {
  const alongX = door.nz !== 0;
  return {
    x: door.x + (alongX ? a : proud * door.nx),
    z: door.z + (alongX ? proud * door.nz : a),
    w: alongX ? w : thick,
    d: alongX ? thick : w,
  };
}

/** A row of window bays along one face at one height, none where another mass walls the face in nor by the door at ground. */
function faceBays(
  masses: readonly EducationMass[],
  m: EducationMass,
  face: Face,
  y: number,
  h: number,
  door: EducationDoor,
): EducationPane[] {
  const f = faceFrame(m.rect, face);
  const len = f.a1 - f.a0;
  const count = Math.floor((len - 2 * EDU_WINDOW.end) / EDU_WINDOW.pitch) + 1;
  const start = f.a0 + (len - (count - 1) * EDU_WINDOW.pitch) / 2;
  const onDoorWall =
    door.nx === f.nx &&
    door.nz === f.nz &&
    Math.abs((door.nx !== 0 ? door.x : door.z) - f.coord) < 1e-6;
  const doorAlong = door.nx !== 0 ? door.z : door.x;
  const panes: EducationPane[] = [];
  for (let k = 0; k < count; k++) {
    const c = start + k * EDU_WINDOW.pitch;
    const reach = EDU_WINDOW.w / 2 + EDU_WINDOW.margin;
    if (walledIn(masses, m, face, c - reach, c + reach, y)) continue;
    if (onDoorWall && y < EDU_STOREY_M && Math.abs(c - doorAlong) < EDU_DOOR_SKIP_M) continue;
    panes.push(paneOnFace(f, c, EDU_WINDOW.w, y, h));
  }
  return panes;
}

/** One continuous band of high windows along a free face of a gym. */
function faceBand(masses: readonly EducationMass[], m: EducationMass, face: Face): EducationPane[] {
  const f = faceFrame(m.rect, face);
  const lo = f.a0 + EDU_GYM_BAND.end;
  const hi = f.a1 - EDU_GYM_BAND.end;
  if (walledIn(masses, m, face, lo, hi, EDU_GYM_BAND.y)) return [];
  return [paneOnFace(f, (lo + hi) / 2, hi - lo, EDU_GYM_BAND.y, EDU_GYM_BAND.h)];
}

/**
 * Every lit pane: a ribbon of windows on each storey of both long faces of a
 * wing, a band of high windows on a gym's free faces, windows and a clerestory
 * on the library, and the glazing of the door.
 */
function educationPanes(masses: readonly EducationMass[], door: EducationDoor): EducationPane[] {
  const panes: EducationPane[] = [];
  for (const m of masses) {
    const r = m.rect;
    if (m.floors === EDU_WING_STOREYS) {
      const faces: Face[] = r.x1 - r.x0 >= r.z1 - r.z0 ? ['z0', 'z1'] : ['x0', 'x1'];
      for (const face of faces) {
        for (let f = 0; f < EDU_WING_STOREYS; f++) {
          const y = f * EDU_STOREY_M + EDU_WINDOW.sill;
          panes.push(...faceBays(masses, m, face, y, EDU_WINDOW.h, door));
        }
      }
    } else if (m.floors === EDU_GYM.floors) {
      for (const face of FACES) panes.push(...faceBand(masses, m, face));
    } else {
      const clerestory = m.height - EDU_STOREY_M - 0.9;
      for (const face of FACES) {
        panes.push(...faceBays(masses, m, face, 0.9, EDU_WINDOW.h, door));
        if (clerestory > 0) {
          panes.push(...faceBays(masses, m, face, EDU_STOREY_M + 0.4, clerestory, door));
        }
      }
    }
  }
  for (const side of [-1, 1]) {
    const p = wallPlan(door, side * 0.7, 1.1, 0.4, 0.2);
    panes.push({ ...p, y: 0.2, h: 2 });
  }
  return panes;
}

function stallsAlongX(x0: number, count: number, z0: number, turn: 0 | 2): EducationStall[] {
  return Array.from({ length: count }, (_, i) => ({
    x: x0 + (i + 0.5) * DECK_STALL.w,
    z: z0 + DECK_STALL.l / 2,
    turn,
    across: DECK_STALL.w,
    accessible: false,
  }));
}

/** A stall's plan: its width across its length. */
export function educationStallRect(s: EducationStall): Rect {
  const nosesAlongX = s.turn % 2 === 1;
  const hx = (nosesAlongX ? DECK_STALL.l : s.across) / 2;
  const hz = (nosesAlongX ? s.across : DECK_STALL.l) / 2;
  return { x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz };
}

function distanceToPath(p: Vec2, path: EducationPath): number {
  const dx = path.b.x - path.a.x;
  const dz = path.b.z - path.a.z;
  const t = Math.min(
    1,
    Math.max(0, ((p.x - path.a.x) * dx + (p.z - path.a.z) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(p.x - (path.a.x + t * dx), p.z - (path.a.z + t * dz));
}

/**
 * Where everything stands on a school's, the college's or the library's lot, in
 * the footprint frame with +Z to the street. Each building's wings are drawn to
 * the floor its design states, a back wing across the lot and side wings
 * forward from it; the courtyard they enclose opens to the street. Pure; fixed
 * per catalog entry.
 */
export function computeEducationLayout(entry: BuildingCatalogEntry): EducationLayout {
  if (entry.id === 'library') return computeLibraryLayout(entry);
  const plan = EDUCATION_PLANS[entry.id];
  if (!plan) throw new RangeError(`utilitykits: no education plan for "${entry.id}"`);
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const W = halfW - EDU_EDGE_M;
  const D = halfD - EDU_EDGE_M;
  const backZ1 = -D + EDU_WING_DEPTH_M;
  const wing = (x0: number, x1: number, z0: number, z1: number): EducationMass => ({
    rect: { x0, x1, z0, z1 },
    height: entry.height,
    floors: EDU_WING_STOREYS,
  });
  const leftWing = wing(-W, -W + EDU_WING_DEPTH_M, backZ1, backZ1 + plan.sideLength);
  const masses: EducationMass[] = [wing(-W, W, -D, backZ1), leftWing];
  const college = plan.kind === 'college';
  if (college) {
    masses.push(wing(W - EDU_WING_DEPTH_M, W, backZ1, backZ1 + plan.sideLength));
  }
  const gym: EducationMass | null = plan.gym
    ? {
        rect: { x0: W - plan.gym.w, x1: W, z0: backZ1, z1: backZ1 + plan.gym.d },
        height: EDU_GYM.height,
        floors: EDU_GYM.floors,
      }
    : null;
  if (gym) masses.push(gym);
  const courtyard: Rect = {
    x0: leftWing.rect.x1,
    x1: gym ? gym.rect.x0 : W - EDU_WING_DEPTH_M,
    z0: backZ1,
    z1: halfD,
  };
  const midX = (courtyard.x0 + courtyard.x1) / 2;
  const layout: EducationLayout = {
    kind: plan.kind,
    masses,
    courtyard,
    door: { x: midX, z: backZ1, nx: 0, nz: 1 },
    canopy: {
      x0: midX - EDU_CANOPY.w / 2,
      x1: midX + EDU_CANOPY.w / 2,
      z0: backZ1,
      z1: backZ1 + EDU_CANOPY.d,
    },
    asphalt: [],
    concrete: [],
    mulch: null,
    playStructure: null,
    field: null,
    tennis: [],
    quad: null,
    paths: [],
    pullIn: null,
    bus: null,
    stalls: [],
    accessibleAisle: null,
    flagpole: null,
    bookDrop: null,
    trees: [],
    panes: [],
  };

  if (plan.kind === 'elementary') {
    const side = leftWing.rect;
    layout.concrete.push({
      x0: midX - EDU_WALK_M / 2,
      x1: midX + EDU_WALK_M / 2,
      z0: backZ1,
      z1: halfD,
    });
    layout.asphalt.push({
      x0: -W,
      x1: layout.canopy.x0 - 0.5,
      z0: side.z1 + 1.3,
      z1: halfD,
    });
    const mulchZ0 = side.z1 + 6.3;
    layout.mulch = { x0: -W + 3, x1: -W + 13, z0: mulchZ0, z1: mulchZ0 + 10.5 };
    layout.playStructure = { x: -W + 8, z: mulchZ0 + 4.5 };
    layout.flagpole = { x: midX + 5, z: backZ1 + 14 };
  } else if (plan.kind === 'middle' || plan.kind === 'high') {
    const g = gym!.rect;
    const pullIn: Rect = {
      x0: courtyard.x0,
      x1: courtyard.x1,
      z0: D - EDU_PULL_IN_M,
      z1: halfD,
    };
    const fieldZ0 = backZ1 + EDU_BACK_CLEAR_M;
    const plaza: Rect = {
      x0: courtyard.x0,
      x1: courtyard.x1,
      z0: fieldZ0 + EDU_TENNIS_PAIR.d,
      z1: pullIn.z0,
    };
    layout.pullIn = pullIn;
    layout.asphalt.push(pullIn);
    layout.concrete.push(plaza);
    layout.bus = { x: midX, z: pullIn.z0 + 2.5, turn: 1 };
    layout.door = { x: courtyard.x0, z: plaza.z0 + 3.7, nx: 1, nz: 0 };
    layout.canopy = {
      x0: courtyard.x0,
      x1: courtyard.x0 + EDU_CANOPY.d,
      z0: layout.door.z - EDU_CANOPY.w / 2,
      z1: layout.door.z + EDU_CANOPY.w / 2,
    };
    layout.flagpole = { x: courtyard.x0 + 12, z: plaza.z0 + 6.6 };
    if (plan.kind === 'middle') {
      layout.field = {
        x0: courtyard.x0 + 1.5,
        x1: courtyard.x1 - 1.5,
        z0: fieldZ0,
        z1: plaza.z0 - 1.5,
      };
    } else {
      const x0 = midX - EDU_TENNIS_PAIR.w / 2;
      for (let i = 0; i < 2; i++) {
        layout.tennis.push({
          x0,
          x1: x0 + EDU_TENNIS_PAIR.w,
          z0: fieldZ0 + (i * EDU_TENNIS_PAIR.d) / 2,
          z1: fieldZ0 + ((i + 1) * EDU_TENNIS_PAIR.d) / 2,
        });
      }
    }
    // The staff car park before the gym: a row of 90° stalls on a 24 ft aisle, two rows in a deep lot.
    const count = Math.floor((g.x1 - g.x0 - 1) / DECK_STALL.w);
    const row1 = g.z1 + 2;
    layout.stalls.push(...stallsAlongX(g.x0 + 1, count, row1, 2));
    if (plan.kind === 'middle') {
      layout.stalls.push(...stallsAlongX(g.x0 + 1, count, row1 + DECK_STALL.l + DECK_AISLE_M, 0));
    }
    layout.asphalt.push({ x0: g.x0 + 0.5, x1: g.x1, z0: g.z1 + 0.5, z1: halfD });
  } else {
    const quad: Rect = { ...courtyard, z1: backZ1 + plan.sideLength };
    const cross = (quad.z0 + quad.z1) / 2;
    layout.quad = quad;
    layout.canopy = {
      x0: -EDU_PORTICO.w / 2,
      x1: EDU_PORTICO.w / 2,
      z0: backZ1,
      z1: backZ1 + EDU_PORTICO.d,
    };
    layout.concrete.push(layout.canopy);
    layout.paths.push(
      { a: { x: 0, z: layout.canopy.z1 }, b: { x: 0, z: halfD }, w: 3 },
      { a: { x: quad.x0, z: cross }, b: { x: quad.x1, z: cross }, w: 3 },
      { a: { x: quad.x0 + 3, z: quad.z0 + 3 }, b: { x: quad.x1 - 3, z: quad.z1 - 3 }, w: 2.4 },
      { a: { x: quad.x1 - 3, z: quad.z0 + 3 }, b: { x: quad.x0 + 3, z: quad.z1 - 3 }, w: 2.4 },
    );
    const pole: Vec2 = { x: 11, z: backZ1 + 8 };
    layout.flagpole = pole;
    const along = 4.8;
    const candidates: Vec2[] = [];
    for (let z = backZ1 + 8; z <= halfD - 2.5; z += 9) {
      candidates.push({ x: -along, z }, { x: along, z });
    }
    for (let x = quad.x0 + 8; x <= quad.x1 - 8 + 1e-9; x += 9) {
      candidates.push({ x, z: cross - along }, { x, z: cross + along });
    }
    layout.trees = candidates.filter(
      (t) =>
        layout.paths.every((p) => distanceToPath(t, p) >= EDU_TREE_CLEAR_M) &&
        Math.hypot(t.x - pole.x, t.z - pole.z) >= EDU_TREE_CLEAR_M,
    );
  }
  layout.panes = educationPanes(masses, layout.door);
  return layout;
}

/**
 * The library: one storey on a 42 × 27.2 m plate across the back of the lot, its
 * reading room raised under a clerestory between two flat flanks, the car park
 * of one aisle beside it. The accessible space is a van space with its access
 * aisle, so the column of stalls holds whole stalls after it.
 */
function computeLibraryLayout(entry: BuildingCatalogEntry): EducationLayout {
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const W = halfW - EDU_EDGE_M;
  const D = halfD - EDU_EDGE_M;
  const z0 = -D;
  const z1 = z0 + EDU_LIBRARY.d;
  const flank = (EDU_LIBRARY.w - EDU_LIBRARY.reading) / 2;
  const mass = (x0: number, x1: number, height: number): EducationMass => ({
    rect: { x0, x1, z0, z1 },
    height,
    floors: 1,
  });
  const masses = [
    mass(-W, -W + flank, entry.height),
    mass(-W + flank, -W + flank + EDU_LIBRARY.reading, EDU_LIBRARY.readingHeight),
    mass(-W + flank + EDU_LIBRARY.reading, -W + EDU_LIBRARY.w, entry.height),
  ];
  const door: EducationDoor = { x: -W + flank + EDU_LIBRARY.reading / 2, z: z1, nx: 0, nz: 1 };
  const plateX1 = -W + EDU_LIBRARY.w;

  const van = ACCESSIBLE_VAN_WIDTH_M;
  const regular = Math.floor((2 * D - van - ACCESSIBLE_AISLE_M) / DECK_STALL.w);
  const stallX = W - DECK_STALL.l / 2;
  const stalls: EducationStall[] = Array.from({ length: regular }, (_, i) => ({
    x: stallX,
    z: z0 + (i + 0.5) * DECK_STALL.w,
    turn: 3,
    across: DECK_STALL.w,
    accessible: false,
  }));
  const vanZ0 = z0 + regular * DECK_STALL.w;
  stalls.push({ x: stallX, z: vanZ0 + van / 2, turn: 3, across: van, accessible: true });

  const layout: EducationLayout = {
    kind: 'library',
    masses,
    courtyard: null,
    door,
    canopy: {
      x0: door.x - 4,
      x1: door.x + 4,
      z0: z1,
      z1: z1 + EDU_CANOPY.d,
    },
    asphalt: [{ x0: plateX1 + 0.5, x1: W, z0, z1: halfD }],
    concrete: [{ x0: door.x - EDU_WALK_M / 2, x1: door.x + EDU_WALK_M / 2, z0: z1, z1: halfD }],
    mulch: null,
    playStructure: null,
    field: null,
    tennis: [],
    quad: null,
    paths: [],
    pullIn: null,
    bus: null,
    stalls,
    accessibleAisle: {
      x0: W - DECK_STALL.l,
      x1: W,
      z0: vanZ0 + van,
      z1: vanZ0 + van + ACCESSIBLE_AISLE_M,
    },
    flagpole: { x: door.x - 9, z: z1 + 5.5 },
    bookDrop: { x0: door.x + 7.5, x1: door.x + 8.5, z0: z1, z1: z1 + 0.7 },
    trees: [],
    panes: [],
  };
  layout.panes = educationPanes(masses, door);
  return layout;
}

/** The floor of a layout as drawn, m²: each mass's plan over the floors it counts for. */
export function educationFloorArea(layout: EducationLayout): number {
  return layout.masses.reduce(
    (sum, m) => sum + (m.rect.x1 - m.rect.x0) * (m.rect.z1 - m.rect.z0) * m.floors,
    0,
  );
}

/** A flat patch of ground on the lawn plate: `rise` above the lawn, `thick` deep. */
function groundPatch(r: Rect, rise: number, thick: number, rgb: RGB): THREE.BufferGeometry {
  return standingBox(
    r.x1 - r.x0,
    thick,
    r.z1 - r.z0,
    (r.x0 + r.x1) / 2,
    RECYCLING_YARD_HEIGHT + rise,
    (r.z0 + r.z1) / 2,
    rgb,
  );
}

/** The white lines of a rectangle, on top of a patch: its four edges, `w` wide. */
function outlineLines(r: Rect, rise: number, w: number): THREE.BufferGeometry[] {
  const line = (x0: number, x1: number, z0: number, z1: number): THREE.BufferGeometry =>
    groundPatch({ x0, x1, z0, z1 }, rise, EDU_LINE_M, EDU_LINE_RGB);
  return [
    line(r.x0, r.x1, r.z0, r.z0 + w),
    line(r.x0, r.x1, r.z1 - w, r.z1),
    line(r.x0, r.x0 + w, r.z0, r.z1),
    line(r.x1 - w, r.x1, r.z0, r.z1),
  ];
}

/** The markings of one tennis court inside its rect: baselines, singles and doubles sidelines, service lines and the centre mark. */
function tennisLines(court: Rect): THREE.BufferGeometry[] {
  const cx = (court.x0 + court.x1) / 2;
  const cz = (court.z0 + court.z1) / 2;
  const rise = EDU_ASPHALT_M;
  const line = (x0: number, x1: number, z0: number, z1: number): THREE.BufferGeometry =>
    groundPatch({ x0, x1, z0, z1 }, rise, EDU_LINE_M, EDU_LINE_RGB);
  const hl = 11.885;
  const hw = 5.485;
  const hs = 4.115;
  const service = 6.4;
  const t = 0.05;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(
      line(cx + s * hl - t, cx + s * hl + t, cz - hw, cz + hw),
      line(cx - hl, cx + hl, cz + s * hw - t, cz + s * hw + t),
      line(cx - hl, cx + hl, cz + s * hs - t, cz + s * hs + t),
      line(cx + s * service - t, cx + s * service + t, cz - hs, cz + hs),
    );
  }
  parts.push(line(cx - service, cx + service, cz - t, cz + t));
  return parts;
}

/** The stall lines of every stall, one line a shared edge, and the library's hatched aisle and symbol. */
function stallPaint(layout: EducationLayout): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const seen = new Set<string>();
  const rise = EDU_ASPHALT_M;
  for (const s of layout.stalls) {
    const r = educationStallRect(s);
    const alongX = s.turn % 2 === 1;
    const edges = alongX ? [r.z0, r.z1] : [r.x0, r.x1];
    for (const e of edges) {
      const key = `${alongX}:${e.toFixed(3)}:${(alongX ? s.x : s.z).toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(
        alongX
          ? groundPatch(
              { x0: r.x0, x1: r.x1, z0: e - EDU_LINE_W / 2, z1: e + EDU_LINE_W / 2 },
              rise,
              EDU_LINE_M,
              EDU_LINE_RGB,
            )
          : groundPatch(
              { x0: e - EDU_LINE_W / 2, x1: e + EDU_LINE_W / 2, z0: r.z0, z1: r.z1 },
              rise,
              EDU_LINE_M,
              EDU_LINE_RGB,
            ),
      );
    }
  }
  const top = RECYCLING_YARD_HEIGHT + EDU_ASPHALT_M;
  const aisle = layout.accessibleAisle;
  const accessible = layout.stalls.find((s) => s.accessible);
  if (aisle) {
    const depth = aisle.z1 - aisle.z0;
    const bar = depth * Math.SQRT2 - EDU_LINE_W;
    for (
      let x = aisle.x0 + depth / 2;
      x <= aisle.x1 - depth / 2 + 1e-9;
      x += PAINT_HATCH_SPACING_M
    ) {
      const hatch = new THREE.BoxGeometry(bar, 0.01, EDU_LINE_W);
      hatch.rotateY(Math.PI / 4);
      hatch.translate(x, top + 0.005, (aisle.z0 + aisle.z1) / 2);
      parts.push(paintVertexColor(hatch, hexFromRgb(MARKING_COLOR)));
    }
  }
  if (accessible) {
    const { positions, colors } = accessibilitySymbolPaint(ACCESSIBLE_SYMBOL_M);
    const symbol = new THREE.BufferGeometry();
    symbol.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    symbol.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    symbol.computeVertexNormals();
    // Upright to a driver pulling in nose to -X.
    symbol.rotateY((3 * Math.PI) / 2);
    symbol.translate(accessible.x, top - ROAD_Y_OFFSET + 0.01, accessible.z);
    parts.push(symbol);
  }
  return parts;
}

/** The lawn plate with its footing, the paving, courts, field, quad, paths and every stall's paint; local Y=0 is the highest ground under the lot. */
function buildEducationGroundsGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const layout = computeEducationLayout(entry);
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const top = RECYCLING_YARD_HEIGHT;
  const depth = top + YARD_FOOTING_DEPTH;
  const lawn = new THREE.BoxGeometry(halfW * 2, depth, halfD * 2);
  lawn.translate(0, top - depth / 2, 0);
  const parts: THREE.BufferGeometry[] = [paintVertexColor(lawn, hexFromRgb(CEMETERY_LAWN_RGB))];
  if (layout.quad) parts.push(groundPatch(layout.quad, 0, EDU_PATCH_M, EDU_FIELD_RGB));
  for (const r of layout.asphalt) parts.push(groundPatch(r, 0, EDU_ASPHALT_M, EDU_ASPHALT_RGB));
  for (const r of layout.concrete) parts.push(groundPatch(r, 0, EDU_CONCRETE_M, EDU_CONCRETE_RGB));
  if (layout.mulch) parts.push(groundPatch(layout.mulch, EDU_ASPHALT_M, EDU_LINE_M, EDU_MULCH_RGB));
  if (layout.field) {
    parts.push(groundPatch(layout.field, 0, EDU_PATCH_M, EDU_FIELD_RGB));
    parts.push(...outlineLines(layout.field, EDU_PATCH_M, EDU_LINE_W));
  }
  for (const court of layout.tennis) {
    parts.push(groundPatch(court, 0, EDU_ASPHALT_M, EDU_COURT_RGB), ...tennisLines(court));
  }
  for (const path of layout.paths) {
    const dx = path.b.x - path.a.x;
    const dz = path.b.z - path.a.z;
    const slab = new THREE.BoxGeometry(path.w, EDU_ASPHALT_M, Math.hypot(dx, dz));
    slab.rotateY(Math.atan2(dx, dz));
    slab.translate(
      (path.a.x + path.b.x) / 2,
      top + EDU_PATCH_M + EDU_ASPHALT_M / 2,
      (path.a.z + path.b.z) / 2,
    );
    parts.push(paintVertexColor(slab, hexFromRgb(EDU_PATH_RGB)));
  }
  parts.push(...stallPaint(layout));
  return mergeParts(parts);
}

/** The roof cap of a mass: a parapet over the elementary's three storeys, a thin slab otherwise. */
function educationCap(m: EducationMass): number {
  return m.height > EDU_WING_STOREYS * EDU_STOREY_M + 1e-9 ? EDU_PARAPET_M : EDU_CAP_M;
}

/** The masses with their caps and belt courses, the door and its canopy or portico; local Y=0 is the ground, the floor 0.3 m up on the lawn plate. */
function buildEducationBuildingGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const layout = computeEducationLayout(entry);
  const y0 = RECYCLING_YARD_HEIGHT;
  const wall =
    layout.kind === 'college'
      ? EDU_LIMESTONE_RGB
      : layout.kind === 'library'
        ? EDU_LIBRARY_RGB
        : EDU_BRICK_RGB;
  const parts: THREE.BufferGeometry[] = [];
  for (const m of layout.masses) {
    const r = m.rect;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const cap = educationCap(m);
    parts.push(
      standingBox(w, m.height - cap, d, cx, y0, cz, wall),
      standingBox(w + 0.4, cap, d + 0.4, cx, y0 + m.height - cap, cz, EDU_CAP_RGB),
    );
    if (m.floors === EDU_WING_STOREYS) {
      for (let f = 1; f < EDU_WING_STOREYS; f++) {
        parts.push(
          standingBox(w + 0.1, 0.2, d + 0.1, cx, y0 + f * EDU_STOREY_M - 0.1, cz, EDU_BELT_RGB),
        );
      }
    }
  }

  const { door, canopy } = layout;
  const frame = wallPlan(door, 0, 3.2, 0.3, 0.15);
  const leaf = wallPlan(door, 0, 2.8, 0.34, 0.17);
  parts.push(
    standingBox(frame.w, 2.7, frame.d, frame.x, y0, frame.z, EDU_FRAME_RGB),
    standingBox(leaf.w, 2.5, leaf.d, leaf.x, y0, leaf.z, EDU_DOOR_RGB),
  );
  const cx = (canopy.x0 + canopy.x1) / 2;
  const cz = (canopy.z0 + canopy.z1) / 2;
  if (layout.kind === 'college') {
    const { w, d, columns, columnY, entablature, rise } = EDU_PORTICO;
    for (let k = 0; k < columns; k++) {
      const column = new THREE.CylinderGeometry(0.35, 0.4, columnY, 10);
      column.translate(cx + (k - (columns - 1) / 2) * 2.4, y0 + columnY / 2, canopy.z1 - 0.8);
      parts.push(paintVertexColor(column, hexFromRgb(EDU_COLUMN_RGB)));
    }
    parts.push(standingBox(w, entablature, d, cx, y0 + columnY, cz, EDU_COLUMN_RGB));
    // The pediment is a gable whose ridge runs front to back.
    const pediment = gableRoof(d, rise, w, 0, 0, 0, EDU_COLUMN_RGB);
    pediment.rotateY(Math.PI / 2);
    pediment.translate(cx, y0 + columnY + entablature, cz);
    parts.push(pediment);
  } else {
    parts.push(
      standingBox(
        canopy.x1 - canopy.x0,
        EDU_CANOPY.slab,
        canopy.z1 - canopy.z0,
        cx,
        y0 + EDU_CANOPY.y,
        cz,
        EDU_CANOPY_RGB,
      ),
    );
    const outerX = door.nx > 0 ? canopy.x1 : canopy.x0;
    const outerZ = door.nz > 0 ? canopy.z1 : canopy.z0;
    const posts: Vec2[] =
      door.nz !== 0
        ? [
            { x: canopy.x0 + 0.3, z: outerZ - door.nz * 0.3 },
            { x: canopy.x1 - 0.3, z: outerZ - door.nz * 0.3 },
          ]
        : [
            { x: outerX - door.nx * 0.3, z: canopy.z0 + 0.3 },
            { x: outerX - door.nx * 0.3, z: canopy.z1 - 0.3 },
          ];
    for (const p of posts) {
      parts.push(standingBox(0.25, EDU_CANOPY.y, 0.25, p.x, y0, p.z, EDU_POLE_RGB));
    }
  }
  return mergeParts(parts);
}

/** The flagpole, the play structure, the tennis nets and the book drop, each on the ground it stands on. */
function buildEducationPropsGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  const layout = computeEducationLayout(entry);
  const y0 = RECYCLING_YARD_HEIGHT;
  const parts: THREE.BufferGeometry[] = [];
  if (layout.flagpole) {
    const { x, z } = layout.flagpole;
    const finial = 0.14;
    const shaft = FLAGPOLE_HEIGHT_M - finial;
    const pole = new THREE.CylinderGeometry(0.07, 0.1, shaft, 8);
    pole.translate(x, y0 + shaft / 2, z);
    const ball = new THREE.SphereGeometry(finial, 8, 6);
    ball.translate(x, y0 + shaft, z);
    parts.push(
      paintVertexColor(pole, hexFromRgb(EDU_POLE_RGB)),
      paintVertexColor(ball, hexFromRgb(EDU_PLAY_YELLOW_RGB)),
    );
    EDU_FLAG_RGBS.forEach((rgb, i) => {
      parts.push(standingBox(1.5, 0.3, 0.03, x + 0.78, y0 + shaft - 1.1 + i * 0.3, z, rgb));
    });
  }
  if (layout.playStructure) {
    const { x, z } = layout.playStructure;
    const base = y0 + EDU_ASPHALT_M + EDU_LINE_M;
    const deckY = 1.5;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(
          standingBox(0.12, deckY, 0.12, x + sx * 1.85, base, z + sz * 1.35, EDU_PLAY_BLUE_RGB),
        );
      }
    }
    parts.push(
      standingBox(4, 0.1, 3, x, base + deckY, z, EDU_PLAY_RED_RGB),
      standingBox(4, 0.9, 0.06, x, base + deckY + 0.1, z - 1.47, EDU_PLAY_BLUE_RGB),
      standingBox(0.06, 0.9, 3, x - 1.97, base + deckY + 0.1, z, EDU_PLAY_BLUE_RGB),
      standingBox(0.06, 0.9, 3, x + 1.97, base + deckY + 0.1, z, EDU_PLAY_BLUE_RGB),
    );
    const run = 2.6;
    const drop = deckY + 0.1 - 0.15;
    const slide = new THREE.BoxGeometry(0.7, 0.08, Math.hypot(run, drop));
    slide.rotateX(Math.atan2(drop, run));
    slide.translate(x, base + 0.15 + drop / 2, z + 1.5 + run / 2);
    parts.push(paintVertexColor(slide, hexFromRgb(EDU_PLAY_YELLOW_RGB)));
  }
  for (const court of layout.tennis) {
    const cx = (court.x0 + court.x1) / 2;
    const cz = (court.z0 + court.z1) / 2;
    const base = y0 + EDU_ASPHALT_M;
    parts.push(standingBox(0.03, 0.9, 10.97, cx, base, cz, EDU_NET_RGB));
    for (const s of [-1, 1]) {
      parts.push(standingBox(0.1, 1.07, 0.1, cx, base, cz + s * 5.935, EDU_FRAME_RGB));
    }
  }
  if (layout.bookDrop) {
    const b = layout.bookDrop;
    parts.push(
      standingBox(
        b.x1 - b.x0,
        1.2,
        b.z1 - b.z0,
        (b.x0 + b.x1) / 2,
        y0,
        (b.z0 + b.z1) / 2,
        EDU_BOOK_DROP_RGB,
      ),
      standingBox(0.6, 0.12, 0.06, (b.x0 + b.x1) / 2, y0 + 0.8, b.z1 + 0.01, EDU_FRAME_RGB),
    );
  }
  return mergeParts(parts);
}

/** Every lit pane, one geometry for the one emissive material. */
function buildEducationLitGeometry(entry: BuildingCatalogEntry): THREE.BufferGeometry {
  return mergeParts(
    computeEducationLayout(entry).panes.map((p) =>
      standingBox(p.w, p.h, p.d, p.x, RECYCLING_YARD_HEIGHT + p.y, p.z, EDU_POLE_RGB),
    ),
  );
}

/**
 * A Type C school bus, nose to local +Z, centred on its own origin on the
 * ground: a flat-fronted body in school-bus yellow behind a lower hood, black
 * rub rails and skirt, a row of side windows, a door at the front on the right,
 * and the amber and red warning lamps over the glass.
 */
function buildSchoolBusGeometry(): THREE.BufferGeometry {
  const { w, h, l } = SCHOOL_BUS_SIZE;
  const hl = l / 2;
  const hood = 2.3;
  const frontBody = hl - hood;
  const bodyLen = l - hood;
  const bodyCz = (-hl + frontBody) / 2;
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, h - 0.6, bodyLen, 0, 0.6, bodyCz, BUS_YELLOW_RGB),
    standingBox(w - 0.04, 0.3, bodyLen - 0.2, 0, 0.3, bodyCz, BUS_BLACK_RGB),
    standingBox(2.1, 1.25, hood, 0, 0.65, frontBody + hood / 2, BUS_YELLOW_RGB),
    standingBox(2.2, 1.05, 0.08, 0, 1.95, frontBody + 0.02, BUS_GLASS_RGB),
    standingBox(w, 0.3, 0.3, 0, 0.35, hl - 0.15, BUS_BLACK_RGB),
    standingBox(w, 0.3, 0.3, 0, 0.4, -hl + 0.15, BUS_BLACK_RGB),
    standingBox(1.2, 0.6, 0.06, 0, 0.7, hl - 0.03, BUS_BLACK_RGB),
  ];
  for (const s of [-1, 1]) {
    parts.push(
      standingBox(0.3, 0.15, 0.06, s * 0.9, 3, frontBody + 0.03, BUS_AMBER_RGB),
      standingBox(0.3, 0.15, 0.06, s * 0.9, 3, -hl + 0.03, BUS_RED_RGB),
      standingBox(0.3, 0.25, 0.06, s * 0.75, 0.8, hl - 0.03, BUS_LAMP_RGB),
      standingBox(0.1, 0.08, hood, s * (1.05 - 0.05), 1.15, frontBody + hood / 2, BUS_BLACK_RGB),
      standingBox(0.32, 1, 1, s * 1.04, 0, hl - 1.6, BUS_BLACK_RGB),
      standingBox(0.32, 1, 1, s * 1.04, 0, -hl + 2.3, BUS_BLACK_RGB),
    );
    for (const y of [0.75, 1.2, 1.75]) {
      parts.push(standingBox(0.1, 0.08, bodyLen, s * (w / 2 - 0.05), y, bodyCz, BUS_BLACK_RGB));
    }
    const windows = s > 0 ? 6 : 8;
    for (let k = 0; k < windows; k++) {
      parts.push(
        standingBox(0.06, 0.8, 0.85, s * (w / 2 - 0.03), 1.85, -hl + 0.6 + 0.5 + k, BUS_GLASS_RGB),
      );
    }
  }
  parts.push(standingBox(0.07, 2, 1, w / 2 - 0.035, 0.7, frontBody - 0.9, BUS_GLASS_RGB));
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------
// The generators: a solar farm, a gas turbine, a combined-cycle station and a
// reactor. Each stands on a plate over the whole lot, on the highest ground
// under it, local +Z the street side; every part but the plate has its local
// Y=0 on the plate's top. None of them lights at night. The farm's rows are
// world-aligned, not lot-aligned: they face the sun's noon side of the scene
// at every rotation of the lot.
// ---------------------------------------------------------------------------

/** The plate's top over the highest ground under the lot. */
export const GEN_PLATE_M = RECYCLING_YARD_HEIGHT;
const GEN_PROUD_M = 0.03;
export const GEN_FENCE_HEIGHT_M = 2.1;
export const GEN_SECURITY_FENCE_HEIGHT_M = 2.4;
const GEN_FENCE_INSET_M = 0.6;
const GEN_FENCE_POST_SPACING_M = 4;
const GEN_FENCE_RAIL_M = 0.06;
const GEN_FENCE_POST_M = 0.12;
const GEN_GATE_M = 5;

const GEN_GRAVEL_RGB: RGB = [0.4, 0.4, 0.36];
const GEN_SCRUB_RGB: RGB = [0.34, 0.4, 0.27];
const GEN_CONCRETE_RGB: RGB = [0.5, 0.5, 0.49];
const GEN_DRIVE_RGB: RGB = [0.5, 0.47, 0.4];
const GEN_FENCE_RGB: RGB = [0.5, 0.52, 0.54];
const GEN_STEEL_RGB: RGB = [0.4, 0.42, 0.45];
const GEN_ENCLOSURE_RGB: RGB = [0.52, 0.54, 0.53];
const GEN_GENERATOR_RGB: RGB = [0.46, 0.5, 0.5];
const GEN_FILTER_RGB: RGB = [0.47, 0.5, 0.52];
const GEN_LOUVRE_RGB: RGB = [0.3, 0.33, 0.36];
const GEN_STACK_RGB: RGB = [0.52, 0.53, 0.55];
const GEN_STACK_RIM_RGB: RGB = [0.18, 0.18, 0.2];
const GEN_TRANSFORMER_RGB: RGB = [0.36, 0.4, 0.38];
const GEN_BUSHING_RGB: RGB = [0.5, 0.42, 0.34];
const GEN_CAP_RGB: RGB = [0.3, 0.31, 0.33];
const GEN_GLASS_RGB: RGB = [0.22, 0.3, 0.36];

/** A stretch of the lot's local X, where a gate stands. */
interface Gap {
  x0: number;
  x1: number;
}

/** The lot in the footprint frame, drawn in `inset` metres on every side. */
function lotRect(footprint: FootprintSize, inset = 0): Rect {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  return { x0: -halfW + inset, x1: halfW - inset, z0: -halfD + inset, z1: halfD - inset };
}

const rectCentre = (r: Rect): Vec2 => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

/** A room's box from its rect, standing on `y0` (the plate's top is 0). */
function rectBox(r: Rect, y0: number, height: number, rgb: RGB): THREE.BufferGeometry {
  const c = rectCentre(r);
  return standingBox(r.x1 - r.x0, height, r.z1 - r.z0, c.x, y0, c.z, rgb);
}

/** A flat patch laid on the plate, `GEN_PROUD_M` proud of it. */
function platePatch(r: Rect, rgb: RGB): THREE.BufferGeometry {
  return rectBox(r, GEN_PLATE_M, GEN_PROUD_M, rgb);
}

/** The roof slab of a flat-roofed building: its top is `height`. */
function cappedBox(
  r: Rect,
  height: number,
  rgb: RGB,
  cap = 0.3,
  capRgb: RGB = GEN_CAP_RGB,
): THREE.BufferGeometry[] {
  return [rectBox(r, 0, height - cap, rgb), rectBox(r, height - cap, cap, capRgb)];
}

/** The plate over the whole lot with its footing, and the paved patches on it; local Y=0 is the highest ground under the lot. */
function buildGeneratorGroundsGeometry(
  footprint: FootprintSize,
  base: RGB,
  patches: readonly { rect: Rect; rgb: RGB }[],
): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const depth = GEN_PLATE_M + YARD_FOOTING_DEPTH;
  const plate = new THREE.BoxGeometry(halfW * 2, depth, halfD * 2);
  plate.translate(0, GEN_PLATE_M - depth / 2, 0);
  const parts = [paintVertexColor(plate, hexFromRgb(base))];
  for (const p of patches) parts.push(platePatch(p.rect, p.rgb));
  return mergeParts(parts);
}

/** One run of chain-link along X or Z: posts every `postSpacing`, and a top, middle and bottom rail. */
function fenceRun(
  parts: THREE.BufferGeometry[],
  a: number,
  b: number,
  fixed: number,
  alongX: boolean,
  height: number,
  postSpacing: number,
): void {
  const length = b - a;
  if (length <= 0) return;
  const mid = (a + b) / 2;
  const at = (along: number, w: number, h: number, y: number, thick: number): void => {
    parts.push(
      alongX
        ? standingBox(w, h, thick, along, y, fixed, GEN_FENCE_RGB)
        : standingBox(thick, h, w, fixed, y, along, GEN_FENCE_RGB),
    );
  };
  for (const y of [height - GEN_FENCE_RAIL_M, height / 2, 0.15]) {
    at(mid, length, GEN_FENCE_RAIL_M, y, GEN_FENCE_RAIL_M);
  }
  const posts = Math.max(1, Math.ceil(length / postSpacing));
  for (let i = 0; i <= posts; i++) {
    at(a + (i * length) / posts, GEN_FENCE_POST_M, height, 0, GEN_FENCE_POST_M);
  }
}

/** A fence round `r`, open for a gate on its +Z (street) side where `gate` is given. */
function fenceLoop(
  parts: THREE.BufferGeometry[],
  r: Rect,
  height: number,
  gate: Gap | null,
  postSpacing = GEN_FENCE_POST_SPACING_M,
): void {
  fenceRun(parts, r.x0, r.x1, r.z0, true, height, postSpacing);
  fenceRun(parts, r.z0, r.z1, r.x0, false, height, postSpacing);
  fenceRun(parts, r.z0, r.z1, r.x1, false, height, postSpacing);
  if (!gate) {
    fenceRun(parts, r.x0, r.x1, r.z1, true, height, postSpacing);
    return;
  }
  fenceRun(parts, r.x0, gate.x0, r.z1, true, height, postSpacing);
  fenceRun(parts, gate.x1, r.x1, r.z1, true, height, postSpacing);
  for (const x of [gate.x0, gate.x1]) {
    parts.push(standingBox(0.25, height + 0.15, 0.25, x, 0, r.z1, GEN_FENCE_RGB));
  }
}

/** A tapered stack standing on `y0` to `top`, a dark rim at its mouth, centred on (x, z). */
function buildStackGeometry(
  x: number,
  z: number,
  y0: number,
  top: number,
  radiusBottom: number,
  radiusTop: number,
): THREE.BufferGeometry {
  const rim = 0.6;
  const shaftHeight = top - y0 - rim;
  const shaft = new THREE.CylinderGeometry(radiusTop, radiusBottom, shaftHeight, 20);
  shaft.translate(x, y0 + shaftHeight / 2, z);
  const band = new THREE.CylinderGeometry(radiusTop + 0.12, radiusTop + 0.12, rim, 20);
  band.translate(x, top - rim / 2, z);
  return mergeParts([
    paintVertexColor(shaft, hexFromRgb(GEN_STACK_RGB)),
    paintVertexColor(band, hexFromRgb(GEN_STACK_RIM_RGB)),
  ]);
}

/** A transformer: tank, radiator bank on its +X end, and three bushings on the lid. */
function transformerParts(r: Rect, height: number): THREE.BufferGeometry[] {
  const c = rectCentre(r);
  const parts = [
    rectBox({ ...r, x1: r.x1 - 0.8 }, 0, height, GEN_TRANSFORMER_RGB),
    standingBox(0.8, height * 0.75, r.z1 - r.z0 - 0.6, r.x1 - 0.4, 0.2, c.z, GEN_STEEL_RGB),
  ];
  for (const dz of [-1, 0, 1]) {
    const bushing = new THREE.CylinderGeometry(0.18, 0.18, 1.1, 8);
    bushing.translate((r.x0 + r.x1 - 0.8) / 2, height + 0.55, c.z + dz * ((r.z1 - r.z0) / 4));
    parts.push(paintVertexColor(bushing, hexFromRgb(GEN_BUSHING_RGB)));
  }
  return parts;
}

// --- solar farm -------------------------------------------------------------

/** A 2.28 × 1.13 m module, two high in portrait: 4.56 m of panel on the slope. */
export const SOLAR_MODULE_M = { long: 2.28, wide: 1.13 };
export const SOLAR_MODULES_HIGH = 2;
export const SOLAR_TILT = (20 * Math.PI) / 180;
export const SOLAR_SLOPE_M = SOLAR_MODULE_M.long * SOLAR_MODULES_HIGH;
/** A low fixed-tilt rack's low edge, 24 in off the ground. */
export const SOLAR_LOW_EDGE_M = 0.6;
export const SOLAR_TOP_EDGE_M = SOLAR_LOW_EDGE_M + SOLAR_SLOPE_M * Math.sin(SOLAR_TILT);
/** What a row covers in plan, 4.29 m, pitched at 9.5 m for a 45% ground coverage ratio. */
export const SOLAR_PLAN_M = SOLAR_SLOPE_M * Math.cos(SOLAR_TILT);
export const SOLAR_PITCH_M = 9.5;
export const SOLAR_ROW_MODULES = 88;
export const SOLAR_ROW_LENGTH_M = SOLAR_ROW_MODULES * SOLAR_MODULE_M.wide;
/** The band at the street end of the farm that holds the track and the inverter skid. */
const SOLAR_END_MARGIN_M = 5.5;
const SOLAR_TRACK = { w: 4, depth: SOLAR_END_MARGIN_M - 0.5 };
/** An SMA medium-voltage station on a 20 ft skid. */
export const SOLAR_SKID = { w: 6.06, d: 2.44, h: 2.9 };
const SOLAR_SKID_GAP_M = 1.2;
const SOLAR_FRAME_M = 0.05;
const SOLAR_SLAB_M = 0.04;
const SOLAR_SEAM_PROUD_M = 0.012;
/** The panel quad rides this far over the slab's top face, which is the frame's band. */
const SOLAR_PANEL_LIFT_M = 0.008;
const SOLAR_SUPPORT_SPACING_M = 6;
const SOLAR_POST_M = 0.1;
/** A solar farm's fence runs round a 120 m lot: its rails carry it, and a post every 10 m holds them. */
const SOLAR_FENCE_POST_SPACING_M = 10;

const SOLAR_PANEL_RGB: RGB = [0.06, 0.09, 0.17];
const SOLAR_FRAME_RGB: RGB = [0.5, 0.54, 0.58];
const SOLAR_POST_RGB: RGB = [0.45, 0.47, 0.5];
const SOLAR_SKID_RGB: RGB = [0.5, 0.52, 0.5];
const SOLAR_SKID_DOOR_RGB: RGB = [0.26, 0.3, 0.32];

/**
 * The horizontal direction of the sun at noon, as an axis of the scene: the way
 * the array faces, as a real one faces south. Read from the scene's own sun, so
 * the rows and the light cannot disagree.
 */
const NOON_SUN = sunDirection(0.5);
export const SOLAR_NOON_FACING: Vec2 =
  Math.abs(NOON_SUN.x) > Math.abs(NOON_SUN.z)
    ? { x: Math.sign(NOON_SUN.x), z: 0 }
    : { x: 0, z: Math.sign(NOON_SUN.z) };

/** The quarter turn, as rotateLocalXZ counts, that carries a local +Z onto an axis-aligned direction. */
function turnToFace(facing: Vec2): 0 | 1 | 2 | 3 {
  if (facing.z > 0) return 0;
  if (facing.x > 0) return 1;
  if (facing.z < 0) return 2;
  return 3;
}

export interface SolarLayout {
  /** Row centres as offsets from the lot's centre, in WORLD axes: a lot's rotation never moves them. */
  rows: Vec2[];
  /** The quarter turn that points each row's local +Z (its panels' face) along the facing. */
  turn: 0 | 1 | 2 | 3;
  /** The track from the street, the skid beside its end and the fence's gate, in the lot's own frame. */
  track: Rect;
  skid: Rect;
  gate: Gap;
}

/**
 * Rows stand pitched along the facing axis and run across it, as many as fit
 * between the street-end bands, centred on the lot. Pure; `rotation` only
 * swaps the lot's width and depth, and the facing is an input.
 */
export function computeSolarLayout(
  footprint: FootprintSize,
  rotation: 0 | 1 | 2 | 3,
  facing: Vec2 = SOLAR_NOON_FACING,
): SolarLayout {
  const turned = rotation % 2 === 1 ? { w: footprint.d, d: footprint.w } : footprint;
  const { halfW, halfD } = footprintHalfExtents(turned);
  const alongZ = facing.z !== 0;
  const span = (alongZ ? halfD : halfW) * 2 - 2 * SOLAR_END_MARGIN_M;
  const count = Math.max(0, Math.floor((span - SOLAR_PLAN_M) / SOLAR_PITCH_M) + 1);
  const rows: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const s = (i - (count - 1) / 2) * SOLAR_PITCH_M;
    rows.push(alongZ ? { x: 0, z: s } : { x: s, z: 0 });
  }
  const local = footprintHalfExtents(footprint);
  const skidX0 = SOLAR_TRACK.w / 2 + SOLAR_SKID_GAP_M;
  const skidZ0 = local.halfD - SOLAR_END_MARGIN_M + 0.9;
  return {
    rows,
    turn: turnToFace(facing),
    track: {
      x0: -SOLAR_TRACK.w / 2,
      x1: SOLAR_TRACK.w / 2,
      z0: local.halfD - SOLAR_TRACK.depth,
      z1: local.halfD,
    },
    skid: { x0: skidX0, x1: skidX0 + SOLAR_SKID.w, z0: skidZ0, z1: skidZ0 + SOLAR_SKID.d },
    gate: { x0: -GEN_GATE_M / 2, x1: GEN_GATE_M / 2 },
  };
}

/** The ground: scrub over the plate, the gravel track and the skid's concrete pad. */
function buildSolarGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { track, skid } = computeSolarLayout(footprint, 0);
  const pad = { x0: skid.x0 - 0.4, x1: skid.x1 + 0.4, z0: skid.z0 - 0.4, z1: skid.z1 + 0.4 };
  return buildGeneratorGroundsGeometry(footprint, GEN_SCRUB_RGB, [
    { rect: track, rgb: GEN_DRIVE_RGB },
    { rect: pad, rgb: GEN_CONCRETE_RGB },
  ]);
}

/** The inverter skid with its doors and roof vent, and the chain-link fence with its gate. */
function buildSolarSiteGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { skid, gate } = computeSolarLayout(footprint, 0);
  const c = rectCentre(skid);
  const parts: THREE.BufferGeometry[] = [
    rectBox(skid, 0, SOLAR_SKID.h, SOLAR_SKID_RGB),
    standingBox(1.4, 0.35, 1.2, c.x - 1.2, SOLAR_SKID.h, c.z, GEN_STEEL_RGB),
  ];
  for (const dx of [-1.4, 1.4]) {
    parts.push(standingBox(1.6, 2.2, 0.1, c.x + dx, 0, skid.z1 + 0.05, SOLAR_SKID_DOOR_RGB));
  }
  fenceLoop(
    parts,
    lotRect(footprint, GEN_FENCE_INSET_M),
    GEN_FENCE_HEIGHT_M,
    gate,
    SOLAR_FENCE_POST_SPACING_M,
  );
  return mergeParts(parts);
}

/**
 * One row, drawn for 100 m: a frame-coloured slab of two modules' height tilted
 * to the facing (+Z) with its low edge at `SOLAR_LOW_EDGE_M`, the panel a quad
 * laid on it inside the frame's band, the seam between the two modules a quad
 * in the frame's colour (the module seams along the row are not geometry), on a
 * line of posts every `SOLAR_SUPPORT_SPACING_M`
 * under the slab's middle, each a two-sided strip. Local Y=0 is the plate's top,
 * the row's centre on the origin, panels facing +Z.
 */
function buildSolarRowGeometry(length: number): THREE.BufferGeometry {
  const mid = SOLAR_LOW_EDGE_M + (SOLAR_SLOPE_M / 2) * Math.sin(SOLAR_TILT);
  const half = SOLAR_SLOPE_M / 2;
  const hl = length / 2;
  const f = SOLAR_FRAME_M;
  // Both on the panel's plane: `s` runs down the slope (negative toward the high, back edge), `p` off its surface.
  const onPlane = (geometry: THREE.BufferGeometry, rgb: RGB): THREE.BufferGeometry => {
    geometry.rotateX(SOLAR_TILT);
    geometry.translate(0, mid, 0);
    return paintVertexColor(geometry, hexFromRgb(rgb));
  };
  const slab = new THREE.BoxGeometry(2 * hl, SOLAR_SLAB_M, 2 * half);
  slab.translate(0, -SOLAR_SLAB_M / 2, 0);
  const quad = (
    x0: number,
    x1: number,
    s0: number,
    s1: number,
    p: number,
  ): THREE.BufferGeometry => {
    const plane = new THREE.PlaneGeometry(x1 - x0, s1 - s0);
    plane.rotateX(-Math.PI / 2);
    plane.translate((x0 + x1) / 2, p, (s0 + s1) / 2);
    return plane;
  };
  const parts: THREE.BufferGeometry[] = [
    onPlane(slab, SOLAR_FRAME_RGB),
    onPlane(quad(-hl + f, hl - f, -half + f, half - f, SOLAR_PANEL_LIFT_M), SOLAR_PANEL_RGB),
    onPlane(
      quad(-hl + f, hl - f, -0.03, 0.03, SOLAR_PANEL_LIFT_M + SOLAR_SEAM_PROUD_M),
      SOLAR_FRAME_RGB,
    ),
  ];
  // The slab's underside at the middle line, where each post stops.
  const top = mid - SOLAR_SLAB_M / Math.cos(SOLAR_TILT) + 0.02;
  for (let x = -hl + SOLAR_SUPPORT_SPACING_M / 2; x < hl; x += SOLAR_SUPPORT_SPACING_M) {
    const post = new THREE.CylinderGeometry(SOLAR_POST_M / 2, SOLAR_POST_M / 2, top, 2, 1, true);
    post.rotateY(Math.PI / 2);
    post.translate(x, top / 2, 0);
    parts.push(paintVertexColor(post, hexFromRgb(SOLAR_POST_RGB)));
  }
  return mergeParts(parts);
}

// --- gas turbine and combined cycle ------------------------------------------

/** The LM6000's package, 20 × 5 m, enclosed to 5 m (an assumption). */
export const GAS_PACKAGE = { w: 20, d: 5, h: 5 };
/** The inlet filter house over the intake end, rising to the catalog's 14 m. */
export const GAS_INLET = { w: 6.5, d: 6, h: 14 };
const GAS_GENERATOR = { w: 7.4, d: 5.8, h: 5.8 };
const GAS_CATALYST = { w: 6, d: 6, h: 8 };
const GAS_DUCT = { d: 2, y0: 2.2, h: 2 };
const GAS_TRANSFORMER = { w: 5.5, d: 3.5, h: 3.8 };
/** Wallingford's 100 ft minimum stack, 3 m across. */
export const GAS_STACK_HEIGHT_M = 30.5;
export const GAS_STACK_RADIUS_M = 1.5;
export const GAS_PLATE = { w: 40, d: 18 };

/** The boiler casing, 25 × 10 m, to the catalog's 24 m, and its 40 m, 5 m wide stack. */
export const CC_BOILER = { w: 25, d: 10, h: 24 };
export const CC_STACK_HEIGHT_M = 40;
export const CC_STACK_RADIUS_M = 2.5;
export const CC_HALL = { w: 30, d: 20, h: 15 };
/** Three mechanical-draft cells, 36 × 12 × 12 m, a fan stack on each. */
export const CC_TOWER = { w: 36, d: 12, h: 12, cells: 3 };
const CC_FAN = { radius: 3.4, h: 2.4 };
const CC_TRANSFORMER = { w: 5, d: 4, h: 4.2 };
const CC_RIB = { w: 0.5, d: 0.3, y0: 1, h: 22 };

/** The gas package, its inlet house over the intake end and its generator enclosure, in the footprint frame. */
export interface GasSet {
  package: Rect;
  inlet: Rect;
  generator: Rect;
}

/** The set with the package's west (intake) end at `x0`, its axis along X at `zc`. */
function gasSet(x0: number, zc: number): GasSet {
  const across = (d: number): { z0: number; z1: number } => ({ z0: zc - d / 2, z1: zc + d / 2 });
  return {
    package: { x0, x1: x0 + GAS_PACKAGE.w, ...across(GAS_PACKAGE.d) },
    inlet: { x0: x0 - 0.5, x1: x0 - 0.5 + GAS_INLET.w, ...across(GAS_INLET.d) },
    generator: {
      x0: x0 + GAS_PACKAGE.w - GAS_GENERATOR.w + 0.4,
      x1: x0 + GAS_PACKAGE.w + 0.4,
      ...across(GAS_GENERATOR.d),
    },
  };
}

function gasSetParts(set: GasSet): THREE.BufferGeometry[] {
  const inlet = rectCentre(set.inlet);
  const parts: THREE.BufferGeometry[] = [
    rectBox(set.package, 0, GAS_PACKAGE.h, GEN_ENCLOSURE_RGB),
    rectBox(set.generator, 0, GAS_GENERATOR.h, GEN_GENERATOR_RGB),
    rectBox(set.inlet, 0, GAS_INLET.h, GEN_FILTER_RGB),
  ];
  for (const z of [set.inlet.z0 - 0.06, set.inlet.z1 + 0.06]) {
    parts.push(standingBox(4.5, 5, 0.12, inlet.x, 6, z, GEN_LOUVRE_RGB));
  }
  const pc = rectCentre(set.package);
  for (const dx of [-3, 0]) {
    parts.push(standingBox(1.6, 0.9, 1.6, pc.x + dx, GAS_PACKAGE.h, pc.z, GEN_STEEL_RGB));
  }
  return parts;
}

export interface GasTurbineLayout {
  set: GasSet;
  duct: Rect;
  catalyst: Rect;
  stack: Vec2;
  transformer: Rect;
  /** The 40 × 18 m paved plate under the package. */
  plate: Rect;
  drive: Rect;
  fence: Rect;
  gate: Gap;
}

/** The gas turbine in its 2×2, in the footprint frame: the package at the back, the transformer before it. Pure. */
export function computeGasTurbineLayout(footprint: FootprintSize): GasTurbineLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const plateZ0 = -halfD + 7;
  const zc = plateZ0 + 9;
  const set = gasSet(-halfW + 6, zc);
  const catalyst = {
    x0: set.generator.x1 + 1.6,
    x1: set.generator.x1 + 1.6 + GAS_CATALYST.w,
    z0: zc - GAS_CATALYST.d / 2,
    z1: zc + GAS_CATALYST.d / 2,
  };
  const plate = { x0: -halfW, x1: -halfW + GAS_PLATE.w, z0: plateZ0, z1: plateZ0 + GAS_PLATE.d };
  return {
    set,
    duct: {
      x0: set.generator.x1 - 0.2,
      x1: catalyst.x0 + 0.2,
      z0: zc - GAS_DUCT.d / 2,
      z1: zc + GAS_DUCT.d / 2,
    },
    catalyst,
    stack: { x: (catalyst.x0 + catalyst.x1) / 2, z: zc },
    transformer: {
      x0: catalyst.x0 + 1,
      x1: catalyst.x0 + 1 + GAS_TRANSFORMER.w,
      z0: plate.z1 - 0.2 - GAS_TRANSFORMER.d,
      z1: plate.z1 - 0.2,
    },
    plate,
    drive: { x0: -GEN_GATE_M / 2, x1: GEN_GATE_M / 2, z0: plate.z1, z1: halfD },
    fence: lotRect(footprint, GEN_FENCE_INSET_M),
    gate: { x0: -GEN_GATE_M / 2, x1: GEN_GATE_M / 2 },
  };
}

function buildGasTurbineGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { plate, drive } = computeGasTurbineLayout(footprint);
  return buildGeneratorGroundsGeometry(footprint, GEN_GRAVEL_RGB, [
    { rect: plate, rgb: GEN_CONCRETE_RGB },
    { rect: drive, rgb: GEN_DRIVE_RGB },
  ]);
}

function buildGasTurbinePlantGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeGasTurbineLayout(footprint);
  const parts = [
    ...gasSetParts(layout.set),
    rectBox(layout.duct, GAS_DUCT.y0, GAS_DUCT.h, GEN_STEEL_RGB),
    rectBox(layout.catalyst, 0, GAS_CATALYST.h, GEN_STEEL_RGB),
    ...transformerParts(layout.transformer, GAS_TRANSFORMER.h),
  ];
  fenceLoop(parts, layout.fence, GEN_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

function buildGasTurbineStackGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { stack } = computeGasTurbineLayout(footprint);
  return buildStackGeometry(
    stack.x,
    stack.z,
    GAS_CATALYST.h - 0.2,
    GAS_STACK_HEIGHT_M,
    GAS_STACK_RADIUS_M + 0.1,
    GAS_STACK_RADIUS_M,
  );
}

export interface CombinedCycleLayout {
  set: GasSet;
  boiler: Rect;
  stack: Vec2;
  hall: Rect;
  /** The steam line from the boiler to the hall. */
  pipe: Rect;
  tower: Rect;
  fans: Vec2[];
  transformers: Rect[];
  plate: Rect;
  basin: Rect;
  drive: Rect;
  fence: Rect;
  gate: Gap;
}

/** The combined-cycle station in its 4×3, in the footprint frame: gas set and boiler along the middle, the hall beside, the tower behind, the transformers on the street. Pure. */
export function computeCombinedCycleLayout(footprint: FootprintSize): CombinedCycleLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const zc = -halfD + 22;
  const set = gasSet(-halfW + 1.5, zc);
  const boilerX0 = set.generator.x1 - 0.3;
  const boiler = {
    x0: boilerX0,
    x1: boilerX0 + CC_BOILER.w,
    z0: zc - CC_BOILER.d / 2,
    z1: zc + CC_BOILER.d / 2,
  };
  const hallX0 = boiler.x1 + 1.4;
  const hall = { x0: hallX0, x1: hallX0 + CC_HALL.w, z0: zc - 10, z1: zc - 10 + CC_HALL.d };
  const towerZ0 = -halfD + 1.5;
  const tower = {
    x0: -halfW + 2,
    x1: -halfW + 2 + CC_TOWER.w,
    z0: towerZ0,
    z1: towerZ0 + CC_TOWER.d,
  };
  const cell = CC_TOWER.w / CC_TOWER.cells;
  const gateX0 = 16;
  return {
    set,
    boiler,
    stack: { x: boiler.x1 - 3, z: zc },
    hall,
    pipe: { x0: boiler.x1 - 0.2, x1: hall.x0 + 0.2, z0: zc - 1, z1: zc + 1 },
    tower,
    fans: Array.from({ length: CC_TOWER.cells }, (_, i) => ({
      x: tower.x0 + cell / 2 + i * cell,
      z: (tower.z0 + tower.z1) / 2,
    })),
    transformers: [-16, -6, 4].map((x) => ({
      x0: x - CC_TRANSFORMER.w / 2,
      x1: x + CC_TRANSFORMER.w / 2,
      z0: 9,
      z1: 9 + CC_TRANSFORMER.d,
    })),
    plate: { x0: -halfW + 1, x1: halfW - 1, z0: -19, z1: 15 },
    basin: { x0: tower.x0 - 0.5, x1: tower.x1 + 0.5, z0: -halfD + 0.8, z1: -19 },
    drive: { x0: gateX0 + 0.5, x1: gateX0 + GEN_GATE_M + 1 - 0.5, z0: 15, z1: halfD },
    fence: lotRect(footprint, GEN_FENCE_INSET_M),
    gate: { x0: gateX0, x1: gateX0 + GEN_GATE_M + 1 },
  };
}

function buildCombinedCycleGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { plate, basin, drive } = computeCombinedCycleLayout(footprint);
  return buildGeneratorGroundsGeometry(footprint, GEN_GRAVEL_RGB, [
    { rect: plate, rgb: GEN_CONCRETE_RGB },
    { rect: basin, rgb: GEN_CONCRETE_RGB },
    { rect: drive, rgb: GEN_DRIVE_RGB },
  ]);
}

function buildCombinedCyclePlantGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeCombinedCycleLayout(footprint);
  const { boiler, hall, tower } = layout;
  const parts: THREE.BufferGeometry[] = [
    ...gasSetParts(layout.set),
    rectBox(boiler, 0, CC_BOILER.h, GEN_FILTER_RGB),
    rectBox(layout.pipe, 8, 1.4, GEN_STEEL_RGB),
    ...cappedBox(hall, CC_HALL.h, GEN_ENCLOSURE_RGB, 0.4),
    standingBox(6, 7, 0.2, (hall.x0 + hall.x1) / 2, 0, hall.z1 + 0.1, GEN_LOUVRE_RGB),
    standingBox(
      CC_HALL.w - 4,
      1.2,
      0.1,
      (hall.x0 + hall.x1) / 2,
      10,
      hall.z1 + 0.05,
      GEN_GLASS_RGB,
    ),
    rectBox(tower, 0, CC_TOWER.h, GEN_ENCLOSURE_RGB),
  ];
  // Stiffening ribs up the boiler's two long faces.
  for (let i = 0; i < 5; i++) {
    const x = boiler.x0 + 2.5 + i * 5;
    for (const z of [boiler.z0 - CC_RIB.d / 2, boiler.z1 + CC_RIB.d / 2]) {
      parts.push(standingBox(CC_RIB.w, CC_RIB.h, CC_RIB.d, x, CC_RIB.y0, z, GEN_STEEL_RGB));
    }
  }
  // The tower's louvres on both long faces, and a fan stack on each cell.
  const tc = rectCentre(tower);
  for (const z of [tower.z0 - 0.06, tower.z1 + 0.06]) {
    parts.push(standingBox(CC_TOWER.w - 2, 5, 0.12, tc.x, 1.5, z, GEN_LOUVRE_RGB));
  }
  for (const fan of layout.fans) {
    const ring = new THREE.CylinderGeometry(CC_FAN.radius, CC_FAN.radius, CC_FAN.h, 16);
    ring.translate(fan.x, CC_TOWER.h + CC_FAN.h / 2, fan.z);
    parts.push(paintVertexColor(ring, hexFromRgb(GEN_STEEL_RGB)));
    const mouth = new THREE.CylinderGeometry(CC_FAN.radius - 0.4, CC_FAN.radius - 0.4, 0.1, 16);
    mouth.translate(fan.x, CC_TOWER.h + CC_FAN.h + 0.02, fan.z);
    parts.push(paintVertexColor(mouth, hexFromRgb(GEN_STACK_RIM_RGB)));
  }
  for (const t of layout.transformers) parts.push(...transformerParts(t, CC_TRANSFORMER.h));
  fenceLoop(parts, layout.fence, GEN_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

function buildCombinedCycleStackGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { stack } = computeCombinedCycleLayout(footprint);
  return buildStackGeometry(
    stack.x,
    stack.z,
    CC_BOILER.h - 0.2,
    CC_STACK_HEIGHT_M,
    CC_STACK_RADIUS_M + 0.1,
    CC_STACK_RADIUS_M,
  );
}

// --- nuclear station ---------------------------------------------------------

/** The flat-roofed reactor building, 40 × 30 m, its main roof at 19 m, with no dome; a narrower crane hall along its long axis rises to the catalog's 24 m. */
export const NUCLEAR_REACTOR = { w: 40, d: 30, h: 24, mainH: 19, craneW: 36, craneD: 14 };
export const NUCLEAR_TURBINE = { w: 40, d: 20, h: 15 };
const NUCLEAR_TRANSFORMER = { w: 7, d: 4.5, h: 5 };
const NUCLEAR_GANTRY = { span: 8, h: 12 };
/** The two security lines, 8 and 14 m in from the lot edge: a 6 m isolation zone between. */
const NUCLEAR_OUTER_INSET_M = 8;
const NUCLEAR_INNER_INSET_M = 14;
const NUCLEAR_GATE_M = 10;
/** The cooling-water intake: its house, the screens on its water face and the conduit running inland. */
export const NUCLEAR_INTAKE = {
  along: 30,
  house: { w: 8, d: 6, h: 4.5, setback: 1 },
  screen: { w: 3, h: 3.2, depth: 0.6 },
  conduit: { w: 2.6, h: 1.4, reach: 15 },
};

const NUCLEAR_WALL_RGB: RGB = [0.5, 0.5, 0.48];
/** The reactor building is the lightest mass on the site; the turbine hall is blue-grey metal under a darker band. */
const NUCLEAR_REACTOR_RGB: RGB = [0.9, 0.89, 0.85];
const NUCLEAR_REACTOR_CAP_RGB: RGB = [0.72, 0.72, 0.7];
const NUCLEAR_CLADDING_RGB: RGB = [0.3, 0.4, 0.52];
const NUCLEAR_CLADDING_BAND_RGB: RGB = [0.14, 0.2, 0.28];
const NUCLEAR_PLINTH_RGB: RGB = [0.4, 0.4, 0.4];
const NUCLEAR_SCREEN_RGB: RGB = [0.22, 0.25, 0.27];

export interface NuclearLayout {
  reactor: Rect;
  crane: Rect;
  turbine: Rect;
  pipe: Rect;
  /** The gantries' centres and the transformers between them. */
  gantries: Vec2[];
  transformers: Rect[];
  switchyard: Rect;
  guard: Rect;
  apron: Rect;
  drive: Rect;
  outer: Rect;
  inner: Rect;
  gate: Gap;
}

/** The station in its 6×5, in the footprint frame: the buildings at the back, the switchyard before them inside the fences, the guard house at the gate. Pure. */
export function computeNuclearLayout(footprint: FootprintSize): NuclearLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const rx0 = -halfW + 16;
  const rz0 = -halfD + 18;
  const reactor = { x0: rx0, x1: rx0 + NUCLEAR_REACTOR.w, z0: rz0, z1: rz0 + NUCLEAR_REACTOR.d };
  const turbine = {
    x0: reactor.x1 + 4,
    x1: reactor.x1 + 4 + NUCLEAR_TURBINE.w,
    z0: rz0 + 5,
    z1: rz0 + 5 + NUCLEAR_TURBINE.d,
  };
  const gantryZ = reactor.z1 + 18;
  const transformerZ0 = gantryZ + 6;
  const transformers = [-27, -9, 9, 27].map((x) => ({
    x0: x - NUCLEAR_TRANSFORMER.w / 2,
    x1: x + NUCLEAR_TRANSFORMER.w / 2,
    z0: transformerZ0,
    z1: transformerZ0 + NUCLEAR_TRANSFORMER.d,
  }));
  const gantries = [-30, -20, 20, 30].map((x) => ({ x, z: gantryZ }));
  const inner = lotRect(footprint, NUCLEAR_INNER_INSET_M);
  return {
    reactor,
    crane: {
      x0: rectCentre(reactor).x - NUCLEAR_REACTOR.craneW / 2,
      x1: rectCentre(reactor).x + NUCLEAR_REACTOR.craneW / 2,
      z0: rectCentre(reactor).z - NUCLEAR_REACTOR.craneD / 2,
      z1: rectCentre(reactor).z + NUCLEAR_REACTOR.craneD / 2,
    },
    turbine,
    pipe: { x0: reactor.x1 - 0.2, x1: turbine.x0 + 0.2, z0: rz0 + 12, z1: rz0 + 14 },
    gantries,
    transformers,
    switchyard: {
      x0: -30 - NUCLEAR_GANTRY.span / 2 - 0.5,
      x1: 30 + NUCLEAR_GANTRY.span / 2 + 0.5,
      z0: gantryZ - 0.5,
      z1: transformerZ0 + NUCLEAR_TRANSFORMER.d,
    },
    guard: { x0: 7, x1: 12, z0: halfD - 6.5, z1: halfD - 2.5 },
    apron: { x0: inner.x0, x1: inner.x1, z0: inner.z0, z1: -1 },
    drive: { x0: -4, x1: 4, z0: -1, z1: halfD },
    outer: lotRect(footprint, NUCLEAR_OUTER_INSET_M),
    inner,
    gate: { x0: -NUCLEAR_GATE_M / 2, x1: NUCLEAR_GATE_M / 2 },
  };
}

function buildNuclearGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { apron, drive } = computeNuclearLayout(footprint);
  return buildGeneratorGroundsGeometry(footprint, GEN_GRAVEL_RGB, [
    { rect: apron, rgb: GEN_CONCRETE_RGB },
    { rect: drive, rgb: GEN_DRIVE_RGB },
  ]);
}

function buildNuclearPlantGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeNuclearLayout(footprint);
  const { reactor, crane, turbine } = layout;
  const parts: THREE.BufferGeometry[] = [
    ...cappedBox(reactor, NUCLEAR_REACTOR.mainH, NUCLEAR_REACTOR_RGB, 0.3, NUCLEAR_REACTOR_CAP_RGB),
    rectBox(
      crane,
      NUCLEAR_REACTOR.mainH,
      NUCLEAR_REACTOR.h - NUCLEAR_REACTOR.mainH - 0.3,
      NUCLEAR_REACTOR_RGB,
    ),
    rectBox(crane, NUCLEAR_REACTOR.h - 0.3, 0.3, NUCLEAR_REACTOR_CAP_RGB),
    standingBox(
      reactor.x1 - reactor.x0 + 0.2,
      4,
      reactor.z1 - reactor.z0 + 0.2,
      rectCentre(reactor).x,
      0,
      rectCentre(reactor).z,
      NUCLEAR_PLINTH_RGB,
    ),
    ...cappedBox(turbine, NUCLEAR_TURBINE.h, NUCLEAR_CLADDING_RGB, 0.4),
    // A darker band round the cladding, proud of every face.
    standingBox(
      NUCLEAR_TURBINE.w + 0.2,
      2,
      NUCLEAR_TURBINE.d + 0.2,
      rectCentre(turbine).x,
      7,
      rectCentre(turbine).z,
      NUCLEAR_CLADDING_BAND_RGB,
    ),
    rectBox(layout.pipe, 6, 1.4, GEN_STEEL_RGB),
    standingBox(
      layout.guard.x1 - layout.guard.x0,
      3.2,
      layout.guard.z1 - layout.guard.z0,
      rectCentre(layout.guard).x,
      0,
      rectCentre(layout.guard).z,
      GEN_ENCLOSURE_RGB,
    ),
  ];
  for (const g of layout.gantries)
    parts.push(...gantryParts(g, NUCLEAR_GANTRY.span, NUCLEAR_GANTRY.h));
  for (const t of layout.transformers) parts.push(...transformerParts(t, NUCLEAR_TRANSFORMER.h));
  fenceLoop(parts, layout.outer, GEN_SECURITY_FENCE_HEIGHT_M, layout.gate);
  fenceLoop(parts, layout.inner, GEN_SECURITY_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

/**
 * The cooling-water intake in a frame whose +Z is the water: the lot's edge is
 * z = 0, the house stands just inside it with its screens on the water face,
 * and a low conduit runs inland under the security lines. Placed on the edge
 * that touches the water, turned the way a shore building is.
 */
function buildNuclearIntakeGeometry(): THREE.BufferGeometry {
  const { along, house, screen, conduit } = NUCLEAR_INTAKE;
  const front = -house.setback;
  const back = front - house.d;
  const parts: THREE.BufferGeometry[] = [
    standingBox(house.w, house.h - 0.3, house.d, along, 0, (front + back) / 2, NUCLEAR_WALL_RGB),
    standingBox(house.w, 0.3, house.d, along, house.h - 0.3, (front + back) / 2, GEN_CAP_RGB),
    standingBox(
      conduit.w,
      conduit.h,
      conduit.reach - house.setback - house.d + 0.2,
      along,
      0,
      back - (conduit.reach - house.setback - house.d) / 2 + 0.1,
      NUCLEAR_PLINTH_RGB,
    ),
  ];
  for (const s of [-1, 1]) {
    parts.push(
      standingBox(
        screen.w,
        screen.h,
        screen.depth,
        along + s * (screen.w / 2 + 0.3),
        0.5,
        front + screen.depth / 2 - 0.05,
        NUCLEAR_SCREEN_RGB,
      ),
    );
  }
  return mergeParts(parts);
}

/** The parts of each generator that stand on the lot as it was built, turned with it; the plate is the one whose Y=0 is the ground. */
const GENERATOR_LOT_PARTS: Readonly<Record<string, readonly UtilityKitPartKind[]>> = {
  'solar-farm': ['solarGrounds', 'solarSite'],
  'gas-turbine': ['gasGrounds', 'gasPlant', 'gasStack'],
  'combined-cycle': ['combinedGrounds', 'combinedPlant', 'combinedStack'],
  'nuclear-plant': ['nuclearGrounds', 'nuclearPlant'],
};

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
// The larger park rungs. A civic plaza and a sports ground stand on a flat
// instanced plate like the pocket park; a neighbourhood park and a district
// park are draped over the terrain, one merged mesh each. Trees and benches
// are one pool across every rung; counts follow the perimeter and the paths.
// ---------------------------------------------------------------------------

export const PARK_TREE_SPACING_M = 24;
export const PARK_TREE_INSET_M = 3;
export const PARK_BENCH_SPACING_M = 50;
export const PARK_BENCH_MIN = 2;
export const PARK_RING_PATH_WIDTH_M = 3.2;
/** A tree or bench keeps this far from where a path meets the edge or the ring. */
export const PARK_MOUTH_CLEARANCE_M = 4;
/** A bench stands this far inside the ring path's centre line. */
const PARK_BENCH_RING_OFFSET_M = 2;
/** A strip laid on a plate stands this proud of it. */
const PARK_MARK_HEIGHT_M = 0.02;
export const PARK_DRAPE_STEP_M = 4;
/** The district park's 400 m lawn is coarsened to a half tile to stay inside the kit budget. */
const DISTRICT_DRAPE_STEP_M = TILE_METERS / 2;
export const PARK_SKIRT_DEPTH_M = 0.6;

export const SCUFFED_EARTH_RGB: RGB = [0.55, 0.45, 0.3];
const PLAZA_PAVING_RGB: RGB = [0.72, 0.7, 0.64];
const PLAZA_BAND_RGB: RGB = [0.56, 0.54, 0.49];
const PLAY_SURFACE_RGB: RGB = [0.78, 0.63, 0.42];
const PLAY_FRAME_RGB: RGB = [0.9, 0.3, 0.1];
const PITCH_RGB: RGB = [0.13, 0.38, 0.17];
const PITCH_LINE_RGB: RGB = [0.95, 0.95, 0.93];
const POND_BANK_RGB: RGB = [0.44, 0.35, 0.24];
const PAVILION_WALL_RGB: RGB = [0.8, 0.78, 0.72];
const PAVILION_ROOF_RGB: RGB = [0.38, 0.38, 0.4];
const FENCE_RGB: RGB = [0.45, 0.47, 0.5];

export const PLAZA_BAND_PITCH_M = 10;
export const PLAZA_BAND_WIDTH_M = 0.6;
export const PLAZA_FEATURE_M = 12;
export const PLAZA_PLANTER = { size: 2, height: 0.45 } as const;

export const NEIGHBOURHOOD_RING_INSET_M = 6;
export const PLAY_ZONE_M = 30;
export const PLAY_FRAME = { post: 0.1, height: 2.4, deckW: 3, deckD: 2, deckY: 1.2 } as const;
const PLAY_FRAME_GAP_M = 8;

export const DISTRICT_RING_INSET_M = 10;
/**
 * The pond's water lies `lift` above the highest ground under it, under the
 * lawn's own lift: the terrain cannot be cut, so a surface sunk below the
 * ground would be hidden by it.
 */
export const DISTRICT_POND = { w: 40, d: 30, lift: 0.08 } as const;
const POND_LATTICE_M = 10;
/** How finely the ground under the pond is sampled for its highest point. */
const POND_SAMPLE_M = 5;
const POND_MARGIN_M = 4;
export const DISTRICT_SPECIMEN = { count: 8, radius: 60, scale: 1.3 } as const;
export const DISTRICT_PAVILION = { w: 12, d: 8 } as const;
export const PAVILION_HEIGHT_M = 3.2;
const PAVILION_ROOF_M = 0.3;
const PAVILION_FOOTING_M = 0.6;

export const PITCH = {
  length: 105,
  width: 68,
  runOff: 3,
  line: 0.12,
  centreRadius: 9.15,
  centreSegments: 24,
  penaltyDepth: 16.5,
  penaltyWidth: 40.32,
  goalDepth: 5.5,
  goalWidth: 18.32,
  goalMouth: 7.32,
  goalHeight: 2.44,
  goalPost: 0.12,
} as const;
/**
 * The changing pavilion: two tiles along the street edge (local +Z), as deep
 * as the strip beyond the pitch's run-off allows — a 6×4 site holds a FIFA
 * pitch with its run-off and 6 m to spare across, so a full tile's depth
 * would stand on the pitch.
 */
export const SPORTS_PAVILION = { w: 2 * TILE_METERS, d: 6 } as const;
const SPORTS_BENCH_GAP_M = 4;
const FENCE = { post: 0.1, height: 0.9, pitch: 4, rail: 0.06, railYs: [0.45, 0.85] } as const;

export interface Strip {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

interface PathPoint extends Vec2 {
  segment: number;
}

export interface PlacedBlock extends Vec2 {
  w: number;
  d: number;
}

function footprintRect(footprint: FootprintSize): Rect {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  return { x0: -halfW, x1: halfW, z0: -halfD, z1: halfD };
}

function insetRect(r: Rect, by: number): Rect {
  return { x0: r.x0 + by, x1: r.x1 - by, z0: r.z0 + by, z1: r.z1 - by };
}

function squareAt(x: number, z: number, side: number): Rect {
  return { x0: x - side / 2, x1: x + side / 2, z0: z - side / 2, z1: z + side / 2 };
}

function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.z0 < b.z1 + margin && a.z1 > b.z0 - margin
  );
}

function blockRect(block: PlacedBlock): Rect {
  return {
    x0: block.x - block.w / 2,
    x1: block.x + block.w / 2,
    z0: block.z - block.d / 2,
    z1: block.z + block.d / 2,
  };
}

/** The four edges of a rect as a loop: the −Z edge left to right, the +X side, the +Z edge right to left, the −X side. */
function rectLoop(r: Rect): Strip[] {
  return [
    { ax: r.x0, az: r.z0, bx: r.x1, bz: r.z0 },
    { ax: r.x1, az: r.z0, bx: r.x1, bz: r.z1 },
    { ax: r.x1, az: r.z1, bx: r.x0, bz: r.z1 },
    { ax: r.x0, az: r.z1, bx: r.x0, bz: r.z0 },
  ];
}

/** The midpoints of a rect's edges, in loop order: where a path cross meets them. */
function rectMidpoints(r: Rect): Vec2[] {
  const c = rectCentre(r);
  return [
    { x: c.x, z: r.z0 },
    { x: r.x1, z: c.z },
    { x: c.x, z: r.z1 },
    { x: r.x0, z: c.z },
  ];
}

/**
 * `count` points spread evenly along a run of segments, each nudged along its
 * segment until it clears every mouth by `clearance`. Pure.
 */
function distributeAlong(
  segments: readonly Strip[],
  count: number,
  mouths: readonly Vec2[],
  clearance: number,
): PathPoint[] {
  const lengths = segments.map((s) => Math.hypot(s.bx - s.ax, s.bz - s.az));
  const total = lengths.reduce((a, b) => a + b, 0);
  const points: PathPoint[] = [];
  if (count <= 0 || total <= 0) return points;
  const step = total / count;
  let segment = 0;
  let start = 0;
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * step;
    while (segment < segments.length - 1 && s > start + lengths[segment]!) {
      start += lengths[segment]!;
      segment++;
    }
    const seg = segments[segment]!;
    const len = lengths[segment]!;
    const dx = (seg.bx - seg.ax) / len;
    const dz = (seg.bz - seg.az) / len;
    let t = s - start;
    for (const mouth of mouths) {
      const along = (mouth.x - seg.ax) * dx + (mouth.z - seg.az) * dz;
      const across = Math.abs((mouth.x - seg.ax) * -dz + (mouth.z - seg.az) * dx);
      if (across > clearance) continue;
      const gap = t - along;
      if (Math.abs(gap) >= clearance) continue;
      t = along + (gap < 0 ? -clearance : clearance);
    }
    t = Math.min(len, Math.max(0, t));
    points.push({ x: seg.ax + dx * t, z: seg.az + dz * t, segment });
  }
  return points;
}

export interface EdgeTreeOptions {
  /** Metres in from the footprint edge the trees stand; 3 by default. */
  inset?: number;
  /** One tree per this many metres of the footprint's perimeter; 24 by default. */
  spacing?: number;
  /** Which edges carry trees: the whole ring, the two edges along X, or the two along Z. */
  sides?: 'ring' | 'x' | 'z';
  /** Local points the trees keep clear of, where paths meet the edge. */
  mouths?: readonly Vec2[];
  clearance?: number;
}

/** Trees = perimeter ÷ spacing, rounded. Pure. */
export function computeParkEdgeTreeCount(
  footprint: FootprintSize,
  spacing = PARK_TREE_SPACING_M,
): number {
  return Math.round((2 * (footprint.w + footprint.d) * TILE_METERS) / spacing);
}

/**
 * The trees along a park's edge: one per 24 m of perimeter, evenly along the
 * inset edge (or along two opposite edges, split between them), each clear of
 * every path mouth. Pure.
 */
export function computeParkEdgeTrees(
  footprint: FootprintSize,
  options: EdgeTreeOptions = {},
): Vec2[] {
  const {
    inset = PARK_TREE_INSET_M,
    spacing = PARK_TREE_SPACING_M,
    sides = 'ring',
    mouths = [],
    clearance = PARK_MOUTH_CLEARANCE_M,
  } = options;
  const loop = rectLoop(insetRect(footprintRect(footprint), inset));
  const count = computeParkEdgeTreeCount(footprint, spacing);
  const strip = (p: PathPoint): Vec2 => ({ x: p.x, z: p.z });
  if (sides === 'ring') return distributeAlong(loop, count, mouths, clearance).map(strip);
  const [first, second] = sides === 'x' ? [loop[0]!, loop[2]!] : [loop[1]!, loop[3]!];
  return [
    ...distributeAlong([first], Math.ceil(count / 2), mouths, clearance),
    ...distributeAlong([second], Math.floor(count / 2), mouths, clearance),
  ].map(strip);
}

/** Benches = path length ÷ 50 m, floored at two. Pure. */
export function computePathBenchCount(pathLengthM: number): number {
  return Math.max(PARK_BENCH_MIN, Math.floor(pathLengthM / PARK_BENCH_SPACING_M));
}

/** The quarter turn that points a bench on each loop side (−Z edge, +X side, +Z edge, −X side) at the centre. */
const RING_BENCH_ROTATION: readonly (0 | 1 | 2 | 3)[] = [2, 1, 0, 3];

/** `count` benches evenly along a rectangular line, facing its centre, clear of every mouth. Pure. */
export function computeRingBenches(
  line: Rect,
  count: number,
  mouths: readonly Vec2[] = [],
  clearance = PARK_MOUTH_CLEARANCE_M,
): BenchPlacement[] {
  return distributeAlong(rectLoop(line), count, mouths, clearance).map((p) => ({
    x: p.x,
    z: p.z,
    rotation: RING_BENCH_ROTATION[p.segment]!,
  }));
}

/** The four strips of a ring path centred on `ring`, the X sides stopping short of the corners the Z edges fill. */
function ringPaths(ring: Rect): Rect[] {
  const h = PARK_RING_PATH_WIDTH_M / 2;
  return [
    { x0: ring.x0 - h, x1: ring.x1 + h, z0: ring.z0 - h, z1: ring.z0 + h },
    { x0: ring.x0 - h, x1: ring.x1 + h, z0: ring.z1 - h, z1: ring.z1 + h },
    { x0: ring.x0 - h, x1: ring.x0 + h, z0: ring.z0 + h, z1: ring.z1 - h },
    { x0: ring.x1 - h, x1: ring.x1 + h, z0: ring.z0 + h, z1: ring.z1 - h },
  ];
}

/** A path cross through the centre of `lawn`, cut where it meets the ring and where its arms meet, so no two strips overlap. */
function crossPaths(lawn: Rect, ring: Rect): Rect[] {
  const h = PARK_RING_PATH_WIDTH_M / 2;
  return [
    { x0: -h, x1: h, z0: lawn.z0, z1: ring.z0 - h },
    { x0: -h, x1: h, z0: ring.z0 + h, z1: ring.z1 - h },
    { x0: -h, x1: h, z0: ring.z1 + h, z1: lawn.z1 },
    { x0: lawn.x0, x1: ring.x0 - h, z0: -h, z1: h },
    { x0: ring.x0 + h, x1: -h, z0: -h, z1: h },
    { x0: h, x1: ring.x1 - h, z0: -h, z1: h },
    { x0: ring.x1 + h, x1: lawn.x1, z0: -h, z1: h },
  ];
}

function crossLength(lawn: Rect): number {
  return lawn.x1 - lawn.x0 + (lawn.z1 - lawn.z0);
}

export interface PlazaLayout {
  plate: Rect;
  bands: Rect[];
  feature: Rect;
  /** The raised planters, one tree in each, along the two side edges. */
  planters: Vec2[];
  benches: BenchPlacement[];
}

/** Paving the whole footprint, a band every 10 m both ways, a 12 m feature square, 17 planters and 8 benches about it. Pure. */
export function computePlazaLayout(footprint: FootprintSize): PlazaLayout {
  const plate = footprintRect(footprint);
  const half = PLAZA_BAND_WIDTH_M / 2;
  const bands: Rect[] = [];
  const nx = Math.floor((plate.x1 - half) / PLAZA_BAND_PITCH_M);
  for (let k = -nx; k <= nx; k++) {
    const x = k * PLAZA_BAND_PITCH_M;
    bands.push({ x0: x - half, x1: x + half, z0: plate.z0, z1: plate.z1 });
  }
  const nz = Math.floor((plate.z1 - half) / PLAZA_BAND_PITCH_M);
  for (let k = -nz; k <= nz; k++) {
    const z = k * PLAZA_BAND_PITCH_M;
    bands.push({ x0: plate.x0, x1: plate.x1, z0: z - half, z1: z + half });
  }
  const feature = squareAt(0, 0, PLAZA_FEATURE_M);
  const planters = computeParkEdgeTrees(footprint, { sides: 'z' });
  const benchLine = squareAt(0, 0, PLAZA_FEATURE_M + 2 * BENCH_SEAT.d + 2);
  const benches = computeRingBenches(
    benchLine,
    computePathBenchCount(2 * (plate.x1 - plate.x0 + (plate.z1 - plate.z0))),
  );
  return { plate, bands, feature, planters, benches };
}

export interface NeighbourhoodParkLayout {
  lawn: Rect;
  paths: Rect[];
  playZone: Rect;
  playFrames: Vec2[];
  trees: Vec2[];
  benches: BenchPlacement[];
}

/** A lawn with a path cross and a ring 6 m in, 30 trees outside the ring, 7 benches on it, a play zone in the +X/+Z quadrant. Pure. */
export function computeNeighbourhoodParkLayout(footprint: FootprintSize): NeighbourhoodParkLayout {
  const lawn = footprintRect(footprint);
  const ring = insetRect(lawn, NEIGHBOURHOOD_RING_INSET_M);
  const paths = [...ringPaths(ring), ...crossPaths(lawn, ring)];
  const trees = computeParkEdgeTrees(footprint, {
    mouths: rectMidpoints(insetRect(lawn, PARK_TREE_INSET_M)),
  });
  const benchLine = insetRect(ring, PARK_BENCH_RING_OFFSET_M);
  const benches = computeRingBenches(
    benchLine,
    computePathBenchCount(crossLength(lawn)),
    rectMidpoints(benchLine),
  );
  const cx = ring.x1 / 2;
  const cz = ring.z1 / 2;
  const playZone = squareAt(cx, cz, PLAY_ZONE_M);
  const playFrames = [
    { x: cx - PLAY_FRAME_GAP_M / 2, z: cz },
    { x: cx + PLAY_FRAME_GAP_M / 2, z: cz },
  ];
  return { lawn, paths, playZone, playFrames, trees, benches };
}

export interface DistrictParkLayout {
  lawn: Rect;
  /** The lawn in four rects about the pond. */
  lawnPieces: Rect[];
  paths: Rect[];
  pond: Rect;
  /** The lowest ground sampled inside the ring, where the pond is centred. */
  pondLowest: number;
  /** The highest ground sampled under the pond itself. */
  pondHighest: number;
  /** The pond's flat surface: just above the highest ground under it, below the lawn there. */
  pondY: number;
  specimens: Vec2[];
  trees: Vec2[];
  benches: BenchPlacement[];
  pavilion: PlacedBlock;
}

/**
 * Open ground ringed with 67 trees, 8 specimens on an inner ring, a path ring
 * 10 m in with two crossing paths, 16 benches, a pond where the ground is
 * lowest and a pavilion inside the ring on the street side (local +Z).
 * `heightAtLocal` samples the terrain in the park's own frame. Pure.
 */
export function computeDistrictParkLayout(
  footprint: FootprintSize,
  heightAtLocal: (x: number, z: number) => number,
): DistrictParkLayout {
  const lawn = footprintRect(footprint);
  const ring = insetRect(lawn, DISTRICT_RING_INSET_M);
  const h = PARK_RING_PATH_WIDTH_M / 2;
  const paths = [...ringPaths(ring), ...crossPaths(lawn, ring)];
  const specimens: Vec2[] = [];
  for (let i = 0; i < DISTRICT_SPECIMEN.count; i++) {
    const angle = ((i + 0.5) * 2 * Math.PI) / DISTRICT_SPECIMEN.count;
    specimens.push({
      x: DISTRICT_SPECIMEN.radius * Math.cos(angle),
      z: DISTRICT_SPECIMEN.radius * Math.sin(angle),
    });
  }
  const pavilion: PlacedBlock = {
    x: ring.x1 / 2,
    z: ring.z1 - h - DISTRICT_PAVILION.d / 2,
    w: DISTRICT_PAVILION.w,
    d: DISTRICT_PAVILION.d,
  };

  // The pond: a 10 m lattice inside the ring, clear of the crossing paths, the
  // specimens and the pavilion; the lowest sample wins, ties going to the
  // quadrant away from the street so flat ground reads the same every time.
  const inner = insetRect(ring, h + POND_MARGIN_M);
  const halfPondW = DISTRICT_POND.w / 2;
  const halfPondD = DISTRICT_POND.d / 2;
  const preferred = { x: ring.x1 / 2, z: ring.z0 / 2 };
  const specimenMargin = PARK_TREE_CANOPY_RADIUS * 2;
  let best: { x: number; z: number; height: number; distance: number } | null = null;
  for (
    let cz = Math.ceil((inner.z0 + halfPondD) / POND_LATTICE_M) * POND_LATTICE_M;
    cz + halfPondD <= inner.z1;
    cz += POND_LATTICE_M
  ) {
    for (
      let cx = Math.ceil((inner.x0 + halfPondW) / POND_LATTICE_M) * POND_LATTICE_M;
      cx + halfPondW <= inner.x1;
      cx += POND_LATTICE_M
    ) {
      if (Math.abs(cx) < halfPondW + h + POND_MARGIN_M) continue;
      if (Math.abs(cz) < halfPondD + h + POND_MARGIN_M) continue;
      const rect = {
        x0: cx - halfPondW,
        x1: cx + halfPondW,
        z0: cz - halfPondD,
        z1: cz + halfPondD,
      };
      if (rectsOverlap(rect, blockRect(pavilion), POND_MARGIN_M)) continue;
      if (specimens.some((s) => rectsOverlap(rect, squareAt(s.x, s.z, 0), specimenMargin)))
        continue;
      const height = heightAtLocal(cx, cz);
      const distance = Math.hypot(cx - preferred.x, cz - preferred.z);
      if (!best || height < best.height || (height === best.height && distance < best.distance)) {
        best = { x: cx, z: cz, height, distance };
      }
    }
  }
  const centre = best ?? {
    x: preferred.x,
    z: preferred.z,
    height: heightAtLocal(preferred.x, preferred.z),
    distance: 0,
  };
  const pond = {
    x0: centre.x - halfPondW,
    x1: centre.x + halfPondW,
    z0: centre.z - halfPondD,
    z1: centre.z + halfPondD,
  };
  let pondHighest = -Infinity;
  const nx = Math.ceil(DISTRICT_POND.w / POND_SAMPLE_M);
  const nz = Math.ceil(DISTRICT_POND.d / POND_SAMPLE_M);
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++) {
      const ground = heightAtLocal(
        pond.x0 + (DISTRICT_POND.w * ix) / nx,
        pond.z0 + (DISTRICT_POND.d * iz) / nz,
      );
      if (ground > pondHighest) pondHighest = ground;
    }
  }
  const lawnPieces: Rect[] = [
    { x0: lawn.x0, x1: pond.x0, z0: lawn.z0, z1: lawn.z1 },
    { x0: pond.x1, x1: lawn.x1, z0: lawn.z0, z1: lawn.z1 },
    { x0: pond.x0, x1: pond.x1, z0: lawn.z0, z1: pond.z0 },
    { x0: pond.x0, x1: pond.x1, z0: pond.z1, z1: lawn.z1 },
  ];

  const trees = computeParkEdgeTrees(footprint, {
    mouths: rectMidpoints(insetRect(lawn, PARK_TREE_INSET_M)),
  });
  const benchLine = insetRect(ring, PARK_BENCH_RING_OFFSET_M);
  const benches = computeRingBenches(
    benchLine,
    computePathBenchCount(crossLength(lawn)),
    [...rectMidpoints(benchLine), pavilion],
    DISTRICT_PAVILION.w / 2 + PARK_MOUTH_CLEARANCE_M,
  );
  return {
    lawn,
    lawnPieces,
    paths,
    pond,
    pondLowest: centre.height,
    pondHighest,
    pondY: pondHighest + DISTRICT_POND.lift,
    specimens,
    trees,
    benches,
    pavilion,
  };
}

export interface SportsGroundLayout {
  plate: Rect;
  pitch: Rect;
  /** Every white line, as a run from a to b. */
  lines: Strip[];
  goals: BenchPlacement[];
  trees: Vec2[];
  benches: BenchPlacement[];
  pavilion: PlacedBlock;
  fencePosts: Vec2[];
  fenceLine: Strip;
}

/** A FIFA pitch behind the street-side strip (local +Z) the changing pavilion takes, its lines and goals, a fenced apron and two benches on the street-side touchline, trees along the long sides. Pure. */
export function computeSportsGroundLayout(footprint: FootprintSize): SportsGroundLayout {
  const plate = footprintRect(footprint);
  const pavilion: PlacedBlock = {
    x: 0,
    z: plate.z1 - SPORTS_PAVILION.d / 2,
    w: SPORTS_PAVILION.w,
    d: SPORTS_PAVILION.d,
  };
  const pitchZ1 = plate.z1 - SPORTS_PAVILION.d - PITCH.runOff;
  const pitch: Rect = {
    x0: -PITCH.length / 2,
    x1: PITCH.length / 2,
    z0: pitchZ1 - PITCH.width,
    z1: pitchZ1,
  };
  const cz = (pitch.z0 + pitch.z1) / 2;

  const lines: Strip[] = [
    { ax: pitch.x0, az: pitch.z0, bx: pitch.x1, bz: pitch.z0 },
    { ax: pitch.x0, az: pitch.z1, bx: pitch.x1, bz: pitch.z1 },
    { ax: pitch.x0, az: pitch.z0, bx: pitch.x0, bz: pitch.z1 },
    { ax: pitch.x1, az: pitch.z0, bx: pitch.x1, bz: pitch.z1 },
    { ax: 0, az: pitch.z0, bx: 0, bz: pitch.z1 },
  ];
  for (let i = 0; i < PITCH.centreSegments; i++) {
    const a0 = (i * 2 * Math.PI) / PITCH.centreSegments;
    const a1 = ((i + 1) * 2 * Math.PI) / PITCH.centreSegments;
    lines.push({
      ax: PITCH.centreRadius * Math.cos(a0),
      az: cz + PITCH.centreRadius * Math.sin(a0),
      bx: PITCH.centreRadius * Math.cos(a1),
      bz: cz + PITCH.centreRadius * Math.sin(a1),
    });
  }
  const box = (goalLineX: number, depth: number, width: number): void => {
    const inward = goalLineX < 0 ? 1 : -1;
    const inner = goalLineX + inward * depth;
    lines.push(
      { ax: goalLineX, az: cz - width / 2, bx: inner, bz: cz - width / 2 },
      { ax: goalLineX, az: cz + width / 2, bx: inner, bz: cz + width / 2 },
      { ax: inner, az: cz - width / 2, bx: inner, bz: cz + width / 2 },
    );
  };
  for (const goalLineX of [pitch.x0, pitch.x1]) {
    box(goalLineX, PITCH.penaltyDepth, PITCH.penaltyWidth);
    box(goalLineX, PITCH.goalDepth, PITCH.goalWidth);
  }

  const goals: BenchPlacement[] = [
    { x: pitch.x0, z: cz, rotation: 1 },
    { x: pitch.x1, z: cz, rotation: 1 },
  ];
  const trees = computeParkEdgeTrees(footprint, { sides: 'x' });
  const benchZ = pitch.z1 + PITCH.runOff / 2;
  const benches: BenchPlacement[] = [
    { x: -SPORTS_BENCH_GAP_M / 2, z: benchZ, rotation: 0 },
    { x: SPORTS_BENCH_GAP_M / 2, z: benchZ, rotation: 0 },
  ];
  const fenceZ = pitch.z1 + PITCH.runOff - 0.5;
  const fencePosts: Vec2[] = [];
  const intervals = Math.floor(PITCH.length / FENCE.pitch);
  for (let i = 0; i <= intervals; i++) {
    fencePosts.push({ x: pitch.x0 + (i * PITCH.length) / intervals, z: fenceZ });
  }
  const fenceLine: Strip = { ax: pitch.x0, az: fenceZ, bx: pitch.x1, bz: fenceZ };
  return { plate, pitch, lines, goals, trees, benches, pavilion, fencePosts, fenceLine };
}

/** A box laid along a strip from a to b, `width` across, standing on `y0`. */
function stripBox(s: Strip, width: number, y0: number, h: number, rgb: RGB): THREE.BufferGeometry {
  const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const box = new THREE.BoxGeometry(len, h, width);
  box.rotateY(-Math.atan2(s.bz - s.az, s.bx - s.ax));
  box.translate((s.ax + s.bx) / 2, y0 + h / 2, (s.az + s.bz) / 2);
  return paintVertexColor(box, hexFromRgb(rgb));
}

/** The plaza's plate: paving, its bands and feature square, and the planters merged in. Local Y=0 is the GROUND plane. */
function buildPlazaGroundGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computePlazaLayout(footprint);
  return mergeParts([
    rectBox(layout.plate, 0, PARK_LAWN_HEIGHT, PLAZA_PAVING_RGB),
    ...layout.bands.map((b) => rectBox(b, PARK_LAWN_HEIGHT, PARK_MARK_HEIGHT_M, PLAZA_BAND_RGB)),
    rectBox(layout.feature, PARK_LAWN_HEIGHT, PARK_MARK_HEIGHT_M * 1.5, PLAZA_BAND_RGB),
    ...layout.planters.map((p) =>
      standingBox(
        PLAZA_PLANTER.size,
        PLAZA_PLANTER.height,
        PLAZA_PLANTER.size,
        p.x,
        0,
        p.z,
        PLAZA_BAND_RGB,
      ),
    ),
  ]);
}

/** The sports ground's plate: lawn, the pitch and its lines, the fence posts and rails merged in. Local Y=0 is the GROUND plane. */
function buildSportsGroundGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeSportsGroundLayout(footprint);
  const pitchTop = PARK_LAWN_HEIGHT + PARK_MARK_HEIGHT_M;
  return mergeParts([
    rectBox(layout.plate, 0, PARK_LAWN_HEIGHT, PARK_LAWN_RGB),
    rectBox(layout.pitch, PARK_LAWN_HEIGHT, PARK_MARK_HEIGHT_M, PITCH_RGB),
    ...layout.lines.map((l) =>
      stripBox(l, PITCH.line, pitchTop, PARK_MARK_HEIGHT_M, PITCH_LINE_RGB),
    ),
    ...layout.fencePosts.map((p) =>
      standingBox(FENCE.post, FENCE.height, FENCE.post, p.x, PARK_LAWN_HEIGHT, p.z, FENCE_RGB),
    ),
    ...FENCE.railYs.map((y) =>
      stripBox(
        layout.fenceLine,
        FENCE.rail,
        PARK_LAWN_HEIGHT + y - FENCE.rail / 2,
        FENCE.rail,
        FENCE_RGB,
      ),
    ),
  ]);
}

/** Two posts and a crossbar, white; the mouth runs along local X. Local Y=0 is the GROUND plane. */
function buildPitchGoalGeometry(): THREE.BufferGeometry {
  const p = PITCH.goalPost;
  const halfMouth = PITCH.goalMouth / 2;
  return mergeParts([
    standingBox(p, PITCH.goalHeight, p, -halfMouth, 0, 0, PITCH_LINE_RGB),
    standingBox(p, PITCH.goalHeight, p, halfMouth, 0, 0, PITCH_LINE_RGB),
    standingBox(PITCH.goalMouth + p, p, p, 0, PITCH.goalHeight - p, 0, PITCH_LINE_RGB),
  ]);
}

/** A box-and-post play frame: four posts and a deck, in one bright colour. Local Y=0 is the surface it stands on. */
function buildPlayFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const px = PLAY_FRAME.deckW / 2 - PLAY_FRAME.post / 2;
  const pz = PLAY_FRAME.deckD / 2 - PLAY_FRAME.post / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        standingBox(
          PLAY_FRAME.post,
          PLAY_FRAME.height,
          PLAY_FRAME.post,
          sx * px,
          0,
          sz * pz,
          PLAY_FRAME_RGB,
        ),
      );
    }
  }
  parts.push(
    standingBox(
      PLAY_FRAME.deckW,
      PLAY_FRAME.post,
      PLAY_FRAME.deckD,
      0,
      PLAY_FRAME.deckY - PLAY_FRAME.post / 2,
      0,
      PLAY_FRAME_RGB,
    ),
  );
  return mergeParts(parts);
}

/**
 * A unit pavilion: a 1×1 m block, PAVILION_HEIGHT_M tall with a darker roof
 * slab and a footing below ground, scaled to its footprint where it is placed.
 */
function buildPavilionBlockGeometry(): THREE.BufferGeometry {
  const wallTop = PAVILION_HEIGHT_M - PAVILION_ROOF_M;
  return mergeParts([
    standingBox(1, wallTop + PAVILION_FOOTING_M, 1, 0, -PAVILION_FOOTING_M, 0, PAVILION_WALL_RGB),
    standingBox(1, PAVILION_ROOF_M, 1, 0, wallTop, 0, PAVILION_ROOF_RGB),
  ]);
}

export interface DrapeOptions {
  /** A cell is at most this long on either axis. */
  step?: number;
  /** Metres above the sampled ground the surface lies. */
  lift: number;
  rgb: RGB;
  /** World-metre ground sampler. */
  heightAt: (x: number, z: number) => number;
}

/**
 * A plane over a world rect subdivided into cells no longer than `step`,
 * every vertex at the ground under it plus `lift`, in one colour. Pure.
 */
export function drapedQuad(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  options: DrapeOptions,
): THREE.BufferGeometry {
  const { step = PARK_DRAPE_STEP_M, lift, rgb, heightAt } = options;
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let iz = 0; iz <= nz; iz++) {
    const z = z0 + ((z1 - z0) * iz) / nz;
    for (let ix = 0; ix <= nx; ix++) {
      const x = x0 + ((x1 - x0) * ix) / nx;
      const v = (iz * (nx + 1) + ix) * 3;
      positions[v] = x;
      positions[v + 1] = heightAt(x, z) + lift;
      positions[v + 2] = z;
    }
  }
  const indices = new Uint32Array(nx * nz * 6);
  let n = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return paintVertexColor(geometry, hexFromRgb(rgb));
}

interface WallOptions {
  step?: number;
  rgb: RGB;
  topAt: (x: number, z: number) => number;
  bottomAt: (x: number, z: number, top: number) => number;
}

/**
 * A vertical band along a strip from a to b, its top and bottom sampled per
 * vertex; the face looks to the right of the a→b direction seen from above,
 * so a clockwise loop faces outward and an anticlockwise one inward.
 */
function drapedWall(s: Strip, options: WallOptions): THREE.BufferGeometry {
  const { step = PARK_DRAPE_STEP_M, rgb, topAt, bottomAt } = options;
  const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const n = Math.max(1, Math.ceil(len / step));
  const positions = new Float32Array((n + 1) * 2 * 3);
  for (let i = 0; i <= n; i++) {
    const x = s.ax + ((s.bx - s.ax) * i) / n;
    const z = s.az + ((s.bz - s.az) * i) / n;
    const top = topAt(x, z);
    const bottom = bottomAt(x, z, top);
    positions.set([x, top, z], i * 6);
    positions.set([x, bottom, z], i * 6 + 3);
  }
  const indices = new Uint32Array(n * 6);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const aBottom = a + 1;
    const b = a + 2;
    const bBottom = b + 1;
    indices[k++] = a;
    indices[k++] = b;
    indices[k++] = aBottom;
    indices[k++] = b;
    indices[k++] = bBottom;
    indices[k++] = aBottom;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return paintVertexColor(geometry, hexFromRgb(rgb));
}

/** The skirt below a draped lawn's outer edge, in the lawn colour, so a slope shows no gap under it. */
function drapedSkirt(r: Rect, options: DrapeOptions): THREE.BufferGeometry[] {
  const { step, lift, rgb, heightAt } = options;
  return rectLoop(r).map((s) =>
    drapedWall(s, {
      step,
      rgb,
      topAt: (x, z) => heightAt(x, z) + lift,
      bottomAt: (_x, _z, top) => top - PARK_SKIRT_DEPTH_M,
    }),
  );
}

/** A local rect carried into the world: turned with the park and moved to its centre. */
export function worldRect(
  r: Rect,
  centerX: number,
  centerZ: number,
  rotation: 0 | 1 | 2 | 3,
): Rect {
  const a = rotateLocalXZ(r.x0, r.z0, rotation);
  const b = rotateLocalXZ(r.x1, r.z1, rotation);
  return {
    x0: centerX + Math.min(a.x, b.x),
    x1: centerX + Math.max(a.x, b.x),
    z0: centerZ + Math.min(a.z, b.z),
    z1: centerZ + Math.max(a.z, b.z),
  };
}

/** How far toward bare earth a park's lawn is worn: nothing to a load of 1, fully at 3. Pure. */
export function parkWear(load: number): number {
  return Math.min(1, Math.max(0, (load - 1) / 2));
}

// ---------------------------------------------------------------------------
// the clinic, the rail station and the bus stop: the last ploppables without
// a kit. The clinic is read by its covered drop-off, the station by its
// platform, the bus stop by its shelter. Each stands on a lawn plate on the
// highest ground under its lot; the clinic's glazing and sign face and the
// depot's doors and windows are the lit parts, on the stations' material.
// ---------------------------------------------------------------------------

/** The clinic's block: one storey, 17 × 20 m, its wall to the top of a 42 in parapet over a 1.0 m brick base. */
export const CLINIC_BODY = { w: 17, d: 20, wall: 5.5, parapet: 1.07, base: 1.0 };
/** The entry's storefront glazing: 6 m wide, 3.0 m to its head. */
export const CLINIC_ENTRY = { w: 6, h: 3.0 };
/** The porte-cochère over the drop-off: 4.0 m along the facade, 6.1 m out over the lane, 2.9 m clear on two 0.3 m columns. */
export const CLINIC_CANOPY = { w: 4.0, d: 6.1, clear: 2.9, slab: 0.3, column: 0.3 };
/** The one-way drop-off lane, the 20 ft fire lane. */
export const CLINIC_LANE_M = 6.1;
/** A stall of the clinic's car park, 9 × 18 ft. */
export const CLINIC_STALL = { w: 2.74, l: 5.5 };
/** The monument sign at the street: a 2.4 × 0.4 m masonry block 1.83 m tall with a lit panel on each face. */
export const CLINIC_SIGN = { w: 2.4, t: 0.4, h: 1.83, panel: { w: 1.9, h: 0.7, y: 0.85 } };
/** A rooftop unit on its curb, the storefront kit's size. */
const CLINIC_UNIT = { w: UNIT_WIDTH_M, l: UNIT_LENGTH_M, h: UNIT_HEIGHT_M, curb: 0.3 };
const CLINIC_WINDOW = { w: 1.5, h: 1.4, sill: 1.2, pitch: 3 };
/** The roof cap stands this far proud of the wall all round. */
const CLINIC_CAP_OVERHANG_M = 0.15;

const CLINIC_WALL_RGB: RGB = [0.78, 0.76, 0.7];
const CLINIC_BRICK_RGB: RGB = [0.5, 0.3, 0.24];
const CLINIC_PARAPET_RGB: RGB = [0.6, 0.58, 0.54];
const CLINIC_CAP_RGB: RGB = [0.42, 0.4, 0.38];
const CLINIC_CANOPY_RGB: RGB = [0.84, 0.84, 0.82];
const CLINIC_COLUMN_RGB: RGB = [0.5, 0.52, 0.54];
const CLINIC_MULLION_RGB: RGB = [0.2, 0.2, 0.22];
const CLINIC_UNIT_RGB: RGB = [0.82, 0.81, 0.78];
const CLINIC_SIGN_RGB: RGB = [0.56, 0.5, 0.42];
const CLINIC_SIGN_CAP_RGB: RGB = [0.4, 0.36, 0.32];

/** One stall of the clinic's car park: its centre, which way a car in it turns, its width across and whether it is the van space. */
export interface ClinicStall extends Vec2 {
  turn: 0 | 1 | 2 | 3;
  across: number;
  van: boolean;
}

export interface ClinicLayout {
  body: Rect;
  /** The entry glazing's centre on the street face. */
  entrance: Vec2;
  canopy: Rect;
  columns: Vec2[];
  /** The loop: a leg in from the street, the lane under the canopy, a leg back out. */
  lane: Rect[];
  stalls: ClinicStall[];
  /** The van space's hatched access aisle. */
  aisle: Rect;
  /** The monument sign's plan, its long axis along Z beside the way out. */
  sign: Rect;
  /** The rooftop units' plans. */
  units: Rect[];
  /** Punched windows on the street and side faces: centre on the plan, the wall's outward normal, width. */
  windows: { x: number; z: number; nx: -1 | 0 | 1; nz: -1 | 0 | 1; w: number }[];
}

/**
 * The block on the back half of the lot, the entry centred on its street face
 * under the porte-cochère; the one-way loop down the lot's left side, across
 * the facade under the canopy and back up the right; the stalls on the island
 * the loop encloses, the van space and its aisle at the head nearest the
 * entrance; the sign at the way out. Pure; fixed per footprint.
 */
export function computeClinicLayout(footprint: FootprintSize): ClinicLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  // The block keeps just its roof cap's overhang off the back lot line: every
  // metre of the front half is the loop, the stalls and the sign.
  const body: Rect = {
    x0: -CLINIC_BODY.w / 2,
    x1: CLINIC_BODY.w / 2,
    z0: -halfD + CLINIC_CAP_OVERHANG_M,
    z1: -halfD + CLINIC_CAP_OVERHANG_M + CLINIC_BODY.d,
  };
  const front = body.z1;
  const entrance: Vec2 = { x: 0, z: front };
  const canopy: Rect = {
    x0: -CLINIC_CANOPY.w / 2,
    x1: CLINIC_CANOPY.w / 2,
    z0: front,
    z1: front + CLINIC_CANOPY.d,
  };
  const columnIn = CLINIC_CANOPY.column / 2 + 0.1;
  const columns: Vec2[] = [-1, 1].map((s) => ({
    x: s * (canopy.x1 - columnIn),
    z: canopy.z1 - columnIn,
  }));
  const cross: Rect = { x0: -halfW, x1: halfW, z0: front, z1: front + CLINIC_LANE_M };
  const left: Rect = { x0: -halfW, x1: -halfW + CLINIC_LANE_M, z0: cross.z1, z1: halfD };
  const right: Rect = { x0: halfW - CLINIC_LANE_M, x1: halfW, z0: cross.z1, z1: halfD };

  // The head row faces the lane under the canopy: the van space first, its
  // aisle on its passenger side, then a car. The rest stand nose to the way in.
  const stalls: ClinicStall[] = [];
  const headZ = cross.z1 + CLINIC_STALL.l / 2;
  let x = left.x1;
  stalls.push({
    x: x + ACCESSIBLE_VAN_WIDTH_M / 2,
    z: headZ,
    turn: 2,
    across: ACCESSIBLE_VAN_WIDTH_M,
    van: true,
  });
  x += ACCESSIBLE_VAN_WIDTH_M;
  const aisle: Rect = {
    x0: x,
    x1: x + ACCESSIBLE_AISLE_M,
    z0: cross.z1,
    z1: cross.z1 + CLINIC_STALL.l,
  };
  x = aisle.x1;
  stalls.push({ x: x + CLINIC_STALL.w / 2, z: headZ, turn: 2, across: CLINIC_STALL.w, van: false });
  const alongX = left.x1 + CLINIC_STALL.l / 2;
  for (let z = cross.z1 + CLINIC_STALL.l; z + CLINIC_STALL.w <= halfD + 1e-9; z += CLINIC_STALL.w) {
    stalls.push({
      x: alongX,
      z: z + CLINIC_STALL.w / 2,
      turn: 3,
      across: CLINIC_STALL.w,
      van: false,
    });
  }

  const signX = (left.x1 + CLINIC_STALL.l + right.x0) / 2;
  const sign: Rect = {
    x0: signX - CLINIC_SIGN.t / 2,
    x1: signX + CLINIC_SIGN.t / 2,
    z0: halfD - 0.6 - CLINIC_SIGN.w,
    z1: halfD - 0.6,
  };

  const units: Rect[] = [-1, 1].map((s) => ({
    x0: s * 4 - CLINIC_UNIT.l / 2,
    x1: s * 4 + CLINIC_UNIT.l / 2,
    z0: body.z0 + 6 - CLINIC_UNIT.w / 2,
    z1: body.z0 + 6 + CLINIC_UNIT.w / 2,
  }));

  const windows: ClinicLayout['windows'] = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      windows.push({
        x: s * (CLINIC_ENTRY.w / 2 + 1.5 + k * CLINIC_WINDOW.pitch),
        z: front,
        nx: 0,
        nz: 1,
        w: CLINIC_WINDOW.w,
      });
    }
    for (let z = body.z0 + 2.5; z + CLINIC_WINDOW.w / 2 <= front - 1; z += CLINIC_WINDOW.pitch) {
      windows.push({ x: s * body.x1, z, nx: s as -1 | 1, nz: 0, w: CLINIC_WINDOW.w });
    }
  }

  return {
    body,
    entrance,
    canopy,
    columns,
    lane: [left, cross, right],
    stalls,
    aisle,
    sign,
    units,
    windows,
  };
}

/** A clinic stall's plan. */
export function clinicStallRect(s: ClinicStall): Rect {
  const alongX = s.turn % 2 === 1;
  const hx = (alongX ? CLINIC_STALL.l : s.across) / 2;
  const hz = (alongX ? s.across : CLINIC_STALL.l) / 2;
  return { x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz };
}

/** The lawn plate with its footing, and the paving laid on it; local Y=0 is the highest ground under the lot. */
function lawnPlate(footprint: FootprintSize): THREE.BufferGeometry {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const top = RECYCLING_YARD_HEIGHT;
  const depth = top + YARD_FOOTING_DEPTH;
  const lawn = new THREE.BoxGeometry(halfW * 2, depth, halfD * 2);
  lawn.translate(0, top - depth / 2, 0);
  return paintVertexColor(lawn, hexFromRgb(CEMETERY_LAWN_RGB));
}

/** The accessibility symbol painted on a space, upright to a driver pulling in with their nose along `turn`. */
function accessibilitySymbol(
  x: number,
  z: number,
  top: number,
  turn: 0 | 1 | 2 | 3,
): THREE.BufferGeometry {
  const { positions, colors } = accessibilitySymbolPaint(ACCESSIBLE_SYMBOL_M);
  const symbol = new THREE.BufferGeometry();
  symbol.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  symbol.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  symbol.computeVertexNormals();
  symbol.rotateY((turn * Math.PI) / 2);
  symbol.translate(x, top - ROAD_Y_OFFSET + 0.01, z);
  return symbol;
}

/** White hatching across an access aisle, bars at 45° every 0.6 m. */
function hatchedAisle(aisle: Rect, top: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const w = aisle.x1 - aisle.x0;
  const bar = w * Math.SQRT2 - PAINT_LINE_M;
  const cx = (aisle.x0 + aisle.x1) / 2;
  for (let z = aisle.z0 + w / 2; z <= aisle.z1 - w / 2 + 1e-9; z += PAINT_HATCH_SPACING_M) {
    const hatch = new THREE.BoxGeometry(PAINT_LINE_M, 0.01, bar);
    hatch.rotateY(Math.PI / 4);
    hatch.translate(cx, top + 0.005, z);
    parts.push(paintVertexColor(hatch, hexFromRgb(MARKING_COLOR)));
  }
  return parts;
}

/** The white line between two stalls of a row, or at a row's end. */
function stallLine(r: Rect, alongX: boolean, at: number, top: number): THREE.BufferGeometry {
  return alongX
    ? standingBox(r.x1 - r.x0, 0.01, PAINT_LINE_M, (r.x0 + r.x1) / 2, top, at, EDU_LINE_RGB)
    : standingBox(PAINT_LINE_M, 0.01, r.z1 - r.z0, at, top, (r.z0 + r.z1) / 2, EDU_LINE_RGB);
}

/** The clinic's lawn, the loop and stalls in asphalt, the stall lines, the van aisle's hatching and symbol. */
function buildClinicGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeClinicLayout(footprint);
  const parts: THREE.BufferGeometry[] = [lawnPlate(footprint)];
  for (const r of layout.lane) parts.push(groundPatch(r, 0, EDU_ASPHALT_M, EDU_ASPHALT_RGB));
  const paved = layout.stalls.map(clinicStallRect);
  paved.push(layout.aisle);
  for (const r of paved) parts.push(groundPatch(r, 0, EDU_ASPHALT_M, EDU_ASPHALT_RGB));
  const top = RECYCLING_YARD_HEIGHT + EDU_ASPHALT_M;
  const { halfD } = footprintHalfExtents(footprint);
  const seen = new Set<string>();
  for (const s of layout.stalls) {
    const r = clinicStallRect(s);
    const alongX = s.turn % 2 === 1;
    for (const at of alongX ? [r.z0, r.z1] : [r.x0, r.x1]) {
      const key = `${alongX}:${at.toFixed(3)}:${(alongX ? s.x : s.z).toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // The last stall's line at the street edge stays inside the lot.
      const kept = alongX ? Math.min(at, halfD - PAINT_LINE_M / 2) : at;
      parts.push(stallLine(r, alongX, kept, top));
    }
  }
  parts.push(...hatchedAisle(layout.aisle, top));
  const van = layout.stalls.find((s) => s.van)!;
  parts.push(accessibilitySymbol(van.x, van.z, top, van.turn));
  return mergeParts(parts);
}

/** The block under its parapet over its brick base, the entry's mullions, the porte-cochère on its columns, the rooftop units and the monument sign; local Y=0 is the lawn plate's top. */
function buildClinicBuildingGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { body, canopy, columns, units, sign } = computeClinicLayout(footprint);
  const y0 = RECYCLING_YARD_HEIGHT;
  const c = rectCentre(body);
  const w = body.x1 - body.x0;
  const d = body.z1 - body.z0;
  const { wall, parapet, base } = CLINIC_BODY;
  const roof = wall - parapet;
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, roof - base, d, c.x, y0 + base, c.z, CLINIC_WALL_RGB),
    standingBox(w + 0.06, base, d + 0.06, c.x, y0, c.z, CLINIC_BRICK_RGB),
    standingBox(w + 0.1, parapet, d + 0.1, c.x, y0 + roof, c.z, CLINIC_PARAPET_RGB),
    standingBox(
      w + 2 * CLINIC_CAP_OVERHANG_M,
      0.12,
      d + 2 * CLINIC_CAP_OVERHANG_M,
      c.x,
      y0 + wall - 0.12,
      c.z,
      CLINIC_CAP_RGB,
    ),
  ];
  const front = body.z1;
  for (const sx of [-1, 1]) {
    parts.push(
      standingBox(0.12, CLINIC_ENTRY.h, 0.1, sx * 1.0, y0, front + 0.1, CLINIC_MULLION_RGB),
    );
    parts.push(
      standingBox(
        0.12,
        CLINIC_ENTRY.h,
        0.1,
        sx * (CLINIC_ENTRY.w / 2 + 0.06),
        y0,
        front + 0.1,
        CLINIC_MULLION_RGB,
      ),
    );
  }
  parts.push(
    standingBox(
      CLINIC_ENTRY.w + 0.24,
      0.12,
      0.1,
      0,
      y0 + CLINIC_ENTRY.h,
      front + 0.1,
      CLINIC_MULLION_RGB,
    ),
  );
  const cc = rectCentre(canopy);
  parts.push(
    standingBox(
      canopy.x1 - canopy.x0,
      CLINIC_CANOPY.slab,
      canopy.z1 - canopy.z0,
      cc.x,
      y0 + CLINIC_CANOPY.clear,
      cc.z,
      CLINIC_CANOPY_RGB,
    ),
  );
  for (const col of columns) {
    parts.push(
      standingBox(
        CLINIC_CANOPY.column,
        CLINIC_CANOPY.clear,
        CLINIC_CANOPY.column,
        col.x,
        y0,
        col.z,
        CLINIC_COLUMN_RGB,
      ),
    );
  }
  for (const u of units) {
    const uc = rectCentre(u);
    parts.push(
      standingBox(
        u.x1 - u.x0 + 0.1,
        CLINIC_UNIT.curb,
        u.z1 - u.z0 + 0.1,
        uc.x,
        y0 + roof,
        uc.z,
        CLINIC_CAP_RGB,
      ),
    );
    parts.push(
      standingBox(
        u.x1 - u.x0,
        CLINIC_UNIT.h,
        u.z1 - u.z0,
        uc.x,
        y0 + roof + CLINIC_UNIT.curb,
        uc.z,
        CLINIC_UNIT_RGB,
      ),
    );
  }
  const sc = rectCentre(sign);
  parts.push(
    standingBox(
      sign.x1 - sign.x0,
      CLINIC_SIGN.h - 0.1,
      sign.z1 - sign.z0,
      sc.x,
      y0,
      sc.z,
      CLINIC_SIGN_RGB,
    ),
  );
  parts.push(
    standingBox(
      sign.x1 - sign.x0 + 0.1,
      0.1,
      sign.z1 - sign.z0 + 0.1,
      sc.x,
      y0 + CLINIC_SIGN.h - 0.1,
      sc.z,
      CLINIC_SIGN_CAP_RGB,
    ),
  );
  return mergeParts(parts);
}

/** The entry glazing, the windows and the sign's two panels, one geometry for the one emissive material. */
function buildClinicLitGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { body, entrance, windows, sign } = computeClinicLayout(footprint);
  const y0 = RECYCLING_YARD_HEIGHT;
  const parts: THREE.BufferGeometry[] = [
    standingBox(
      CLINIC_ENTRY.w,
      CLINIC_ENTRY.h,
      0.06,
      entrance.x,
      y0,
      body.z1 + 0.03,
      STATION_POLE_RGB,
    ),
  ];
  for (const win of windows) {
    const proud = 0.06;
    parts.push(
      win.nz !== 0
        ? standingBox(
            win.w,
            CLINIC_WINDOW.h,
            proud,
            win.x,
            y0 + CLINIC_WINDOW.sill,
            win.z + (win.nz * proud) / 2,
            STATION_POLE_RGB,
          )
        : standingBox(
            proud,
            CLINIC_WINDOW.h,
            win.w,
            win.x + (win.nx * proud) / 2,
            y0 + CLINIC_WINDOW.sill,
            win.z,
            STATION_POLE_RGB,
          ),
    );
  }
  const sc = rectCentre(sign);
  const { panel } = CLINIC_SIGN;
  for (const sx of [-1, 1]) {
    parts.push(
      standingBox(
        0.04,
        panel.h,
        panel.w,
        sx === -1 ? sign.x0 - 0.02 : sign.x1 + 0.02,
        y0 + panel.y,
        sc.z,
        STATION_POLE_RGB,
      ),
    );
  }
  return mergeParts(parts);
}

// --- the rail station ---------------------------------------------------------

/** The Great Northern standard combination depot: 30 × 64 ft, a 12 ft wall plate under a 9:12 gable, eaves on knee braces, board-and-batten over a plank wainscot. */
export const DEPOT_BODY = {
  w: 19.5,
  d: 9.1,
  plate: 3.66,
  pitch: 9 / 12,
  eave: 1.2,
  wainscot: 1.0,
  batten: 0.05,
  battenPitch: 0.3,
  bracePitch: 2.4,
};
/** The three-sided operator's bay on the track face: 12 ft wide, 3 ft proud, under its own shallow hip. */
export const DEPOT_BAY = { w: 3.66, proud: 1.0, h: 2.7, hip: 0.3 };
/** The low-level platform: 8 in above the rail, 12 ft wide, 2 m short of the lot at each end, with a 24 in tactile strip along its edge. */
export const DEPOT_PLATFORM = { w: 3.66, h: 0.2, end: 2, tactile: 0.61 };
/** The platform canopy: 12 ft wide at 10 ft clear on posts every 4.6 m, the depot's length and 45 ft beyond it each way. */
export const DEPOT_CANOPY = {
  w: 3.66,
  clear: 3.05,
  slab: 0.15,
  postPitch: 4.6,
  beyond: 13.7,
  post: 0.15,
};
/** The depot stands this far back from the platform, so the canopy passes clear under its eaves; the apron between is at platform height. */
export const DEPOT_SETBACK_M = 2.3;
/** The drop-off lane at the depot's street door, the 20 ft fire lane, and the walk between. */
const DEPOT_DROP_OFF = { lane: 6.1, walk: 2 };
export const DEPOT_STALLS = 20;
const DEPOT_DOOR = { w: 1.0, h: 2.2 };
const DEPOT_FREIGHT_DOOR = { w: 2.4, h: 2.4 };
const DEPOT_WINDOW = { w: 1.0, h: 1.4, sill: 1.1, pitch: 2.4 };
const DEPOT_CHIMNEY = { size: 0.6, above: 0.6 };

const DEPOT_WALL_RGB: RGB = [0.72, 0.58, 0.36];
const DEPOT_TRIM_RGB: RGB = [0.5, 0.26, 0.18];
const DEPOT_ROOF_RGB: RGB = [0.3, 0.32, 0.35];
const DEPOT_BRICK_RGB: RGB = [0.46, 0.27, 0.22];
const DEPOT_PLATFORM_RGB: RGB = [0.66, 0.65, 0.62];
const DEPOT_CANOPY_RGB: RGB = [0.36, 0.38, 0.4];
const DEPOT_POST_RGB: RGB = [0.3, 0.3, 0.32];
const DEPOT_FREIGHT_RGB: RGB = [0.4, 0.22, 0.16];

/** A depot stall: its centre and which way a car in it turns. */
export interface DepotStall extends Vec2 {
  turn: 0 | 1 | 2 | 3;
}

/** A lit pane on the depot: its centre on the plan, the wall's outward normal, its width along the wall, its sill and its height. */
export interface DepotPane extends Vec2 {
  nx: -1 | 0 | 1;
  nz: -1 | 0 | 1;
  w: number;
  y: number;
  h: number;
}

/**
 * The station's lot in its track frame: the track along the lot's -Z edge
 * and the street beyond +Z, whichever world edges those are. The depot's own
 * parts are in the depot frame, centred on the depot's plan.
 */
export interface DepotLayout {
  platform: Rect;
  tactile: Rect;
  /** The concrete between the platform and the depot, at platform height. */
  apron: Rect;
  canopy: Rect;
  posts: Vec2[];
  depot: Rect;
  bay: Rect;
  walk: Rect;
  dropOff: Rect;
  /** The car park's asphalt: each module from the drop-off to the street. */
  asphalt: Rect[];
  aisles: Rect[];
  stalls: DepotStall[];
  /** Doors and windows in the depot frame. */
  panes: DepotPane[];
  /** The freight door on each face, in the depot frame. */
  freight: DepotPane[];
  chimney: Vec2;
}

/**
 * Where everything stands on the station's lot, in the track frame. The
 * platform along the track edge under its canopy; the depot a setback behind
 * it, its long axis along the track; the walk, the drop-off lane and the car
 * park between the depot and the street, each module of head-in stalls on an
 * aisle open to the street. Pure; fixed per track-frame footprint.
 */
export function computeDepotLayout(footprint: FootprintSize): DepotLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const platform: Rect = {
    x0: -halfW + DEPOT_PLATFORM.end,
    x1: halfW - DEPOT_PLATFORM.end,
    z0: -halfD,
    z1: -halfD + DEPOT_PLATFORM.w,
  };
  const tactile: Rect = { ...platform, z1: platform.z0 + DEPOT_PLATFORM.tactile };
  const depot: Rect = {
    x0: -DEPOT_BODY.w / 2,
    x1: DEPOT_BODY.w / 2,
    z0: platform.z1 + DEPOT_SETBACK_M,
    z1: platform.z1 + DEPOT_SETBACK_M + DEPOT_BODY.d,
  };
  const apron: Rect = { x0: depot.x0 - 2, x1: depot.x1 + 2, z0: platform.z1, z1: depot.z1 };
  const bay: Rect = {
    x0: -DEPOT_BAY.w / 2,
    x1: DEPOT_BAY.w / 2,
    z0: depot.z0 - DEPOT_BAY.proud,
    z1: depot.z0,
  };
  const canopyHalf = Math.min(DEPOT_BODY.w / 2 + DEPOT_CANOPY.beyond, platform.x1);
  const canopy: Rect = { x0: -canopyHalf, x1: canopyHalf, z0: platform.z0, z1: platform.z1 };
  const posts: Vec2[] = [];
  for (
    let x = DEPOT_CANOPY.postPitch / 2;
    x + DEPOT_CANOPY.post / 2 <= canopyHalf;
    x += DEPOT_CANOPY.postPitch
  ) {
    for (const s of [-1, 1]) posts.push({ x: s * x, z: platform.z1 - DEPOT_CANOPY.post / 2 - 0.3 });
  }

  const walk: Rect = {
    x0: depot.x0 - 1,
    x1: depot.x1 + 1,
    z0: depot.z1,
    z1: depot.z1 + DEPOT_DROP_OFF.walk,
  };
  const dropOff: Rect = {
    x0: Math.max(-halfW + 2, depot.x0 - 6),
    x1: Math.min(halfW - 2, depot.x1 + 6),
    z0: walk.z1,
    z1: walk.z1 + DEPOT_DROP_OFF.lane,
  };

  // Head-in stalls either side of an aisle running from the drop-off to the
  // street: one module of ten a side on a deep lot, two of five on a shallow one.
  const moduleW = 2 * DECK_STALL.l + DECK_AISLE_M;
  const perSide = Math.floor((halfD - dropOff.z1) / DECK_STALL.w);
  const modules = Math.max(1, Math.ceil(DEPOT_STALLS / 2 / perSide));
  const gap = 2;
  const centres = Array.from(
    { length: modules },
    (_, i) => (i - (modules - 1) / 2) * (moduleW + gap),
  );
  const asphalt: Rect[] = [];
  const aisles: Rect[] = [];
  const stalls: DepotStall[] = [];
  let left = DEPOT_STALLS;
  for (const cx of centres) {
    asphalt.push({ x0: cx - moduleW / 2, x1: cx + moduleW / 2, z0: dropOff.z1, z1: halfD });
    aisles.push({
      x0: cx - DECK_AISLE_M / 2,
      x1: cx + DECK_AISLE_M / 2,
      z0: dropOff.z1,
      z1: halfD,
    });
    const rowOf = Math.min(perSide, Math.ceil(left / 2));
    for (const s of [-1, 1] as const) {
      for (let i = 0; i < rowOf && left > 0; i++) {
        stalls.push({
          x: cx + s * (DECK_AISLE_M / 2 + DECK_STALL.l / 2),
          z: dropOff.z1 + (i + 0.5) * DECK_STALL.w,
          turn: s === 1 ? 1 : 3,
        });
        left--;
      }
    }
  }

  // Doors and windows in the depot frame: the passenger door on each long
  // face, a window band round every face clear of the doors, the bay and the
  // freight door.
  const hw = DEPOT_BODY.w / 2;
  const hd = DEPOT_BODY.d / 2;
  const panes: DepotPane[] = [
    { x: 4, z: -hd, nx: 0, nz: -1, w: DEPOT_DOOR.w, y: 0, h: DEPOT_DOOR.h },
    { x: 0, z: hd, nx: 0, nz: 1, w: DEPOT_DOOR.w, y: 0, h: DEPOT_DOOR.h },
  ];
  const freight: DepotPane[] = [-1, 1].map((s) => ({
    x: -6,
    z: s * hd,
    nx: 0,
    nz: s as -1 | 1,
    w: DEPOT_FREIGHT_DOOR.w,
    y: 0,
    h: DEPOT_FREIGHT_DOOR.h,
  }));
  const clearOf = (x: number, at: number, w: number): boolean =>
    Math.abs(x - at) > (w + DEPOT_WINDOW.w) / 2 + 0.4;
  for (const s of [-1, 1] as const) {
    for (let x = -hw + 1.6; x + DEPOT_WINDOW.w / 2 <= hw - 1; x += DEPOT_WINDOW.pitch) {
      const door = panes.find((p) => p.nz === s)!;
      if (!clearOf(x, door.x, door.w) || !clearOf(x, -6, DEPOT_FREIGHT_DOOR.w)) continue;
      if (s === -1 && !clearOf(x, 0, DEPOT_BAY.w)) continue;
      panes.push({
        x,
        z: s * hd,
        nx: 0,
        nz: s,
        w: DEPOT_WINDOW.w,
        y: DEPOT_WINDOW.sill,
        h: DEPOT_WINDOW.h,
      });
    }
    for (const z of [-2, 2]) {
      panes.push({
        x: s * hw,
        z,
        nx: s,
        nz: 0,
        w: DEPOT_WINDOW.w,
        y: DEPOT_WINDOW.sill,
        h: DEPOT_WINDOW.h,
      });
    }
  }
  // The bay's three sides, in the depot frame.
  const bayZ0 = -hd - DEPOT_BAY.proud;
  panes.push({ x: 0, z: bayZ0, nx: 0, nz: -1, w: 2.4, y: 1.0, h: 1.3 });
  for (const s of [-1, 1] as const) {
    panes.push({
      x: s * (DEPOT_BAY.w / 2),
      z: bayZ0 + DEPOT_BAY.proud / 2,
      nx: s,
      nz: 0,
      w: 0.7,
      y: 1.0,
      h: 1.3,
    });
  }

  return {
    platform,
    tactile,
    apron,
    canopy,
    posts,
    depot,
    bay,
    walk,
    dropOff,
    asphalt,
    aisles,
    stalls,
    panes,
    freight,
    chimney: { x: 5, z: 1.6 },
  };
}

/** A depot stall's plan. */
export function depotStallRect(s: DepotStall): Rect {
  const alongX = s.turn % 2 === 1;
  const hx = (alongX ? DECK_STALL.l : DECK_STALL.w) / 2;
  const hz = (alongX ? DECK_STALL.w : DECK_STALL.l) / 2;
  return { x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz };
}

/** The station's lawn with the car park's asphalt, the walk, the drop-off, the platform, its apron and tactile strip, and every stall's lines. */
function buildDepotGroundsGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeDepotLayout(footprint);
  const top = RECYCLING_YARD_HEIGHT;
  const parts: THREE.BufferGeometry[] = [lawnPlate(footprint)];
  for (const r of layout.asphalt) parts.push(groundPatch(r, 0, EDU_ASPHALT_M, EDU_ASPHALT_RGB));
  parts.push(groundPatch(layout.dropOff, 0, EDU_ASPHALT_M, EDU_ASPHALT_RGB));
  parts.push(groundPatch(layout.walk, 0, EDU_CONCRETE_M, EDU_CONCRETE_RGB));
  parts.push(groundPatch(layout.platform, 0, DEPOT_PLATFORM.h, DEPOT_PLATFORM_RGB));
  parts.push(groundPatch(layout.apron, 0, DEPOT_PLATFORM.h, DEPOT_PLATFORM_RGB));
  const t = layout.tactile;
  parts.push(
    flatQuad(
      t.x1 - t.x0,
      t.z1 - t.z0,
      (t.x0 + t.x1) / 2,
      top + DEPOT_PLATFORM.h + 0.005,
      (t.z0 + t.z1) / 2,
      YELLOW_MARKING_COLOR,
    ),
  );
  const paint = top + EDU_ASPHALT_M;
  const seen = new Set<string>();
  for (const s of layout.stalls) {
    const r = depotStallRect(s);
    for (const at of [r.z0, r.z1]) {
      const key = `${at.toFixed(3)}:${s.x.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(stallLine(r, true, at, paint));
    }
  }
  // The kerb line of the drop-off, along the walk.
  parts.push(stallLine(layout.dropOff, true, layout.dropOff.z0 + PAINT_LINE_M, paint));
  return mergeParts(parts);
}

/** The canopy over the platform: its slab at the clear height above the platform, on its posts. */
function buildDepotCanopyGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const { canopy, posts } = computeDepotLayout(footprint);
  const floor = RECYCLING_YARD_HEIGHT + DEPOT_PLATFORM.h;
  const c = rectCentre(canopy);
  const parts: THREE.BufferGeometry[] = [
    standingBox(
      canopy.x1 - canopy.x0,
      DEPOT_CANOPY.slab,
      canopy.z1 - canopy.z0,
      c.x,
      floor + DEPOT_CANOPY.clear,
      c.z,
      DEPOT_CANOPY_RGB,
    ),
    standingBox(
      canopy.x1 - canopy.x0,
      0.2,
      0.08,
      c.x,
      floor + DEPOT_CANOPY.clear - 0.2,
      canopy.z0 + 0.04,
      DEPOT_CANOPY_RGB,
    ),
  ];
  for (const p of posts) {
    parts.push(
      standingBox(
        DEPOT_CANOPY.post,
        DEPOT_CANOPY.clear,
        DEPOT_CANOPY.post,
        p.x,
        floor,
        p.z,
        DEPOT_POST_RGB,
      ),
    );
  }
  return mergeParts(parts);
}

/** A sloped roof plane: a slab `w` along X whose far edge is `rise` above its near edge over `run` along Z, on the side `s` of the ridge. */
function roofPlane(
  w: number,
  run: number,
  rise: number,
  t: number,
  x: number,
  ridgeY: number,
  z: number,
  s: -1 | 1,
  rgb: RGB,
): THREE.BufferGeometry {
  const length = Math.hypot(run, rise);
  const slab = new THREE.BoxGeometry(w, t, length);
  slab.rotateX(s * Math.atan2(rise, run));
  slab.translate(x, ridgeY - rise / 2, z + (s * run) / 2);
  return paintVertexColor(slab, hexFromRgb(rgb));
}

/** A knee brace under an eave: a strut from the wall down and out to the eave's edge. */
function kneeBrace(
  x: number,
  z: number,
  y: number,
  nx: number,
  nz: number,
  reach: number,
): THREE.BufferGeometry {
  const drop = reach;
  const strut = new THREE.BoxGeometry(0.1, 0.1, Math.hypot(reach, drop));
  strut.rotateX(-Math.PI / 4);
  strut.rotateY(Math.atan2(nx, nz));
  strut.translate(x + (nx * reach) / 2, y - drop / 2, z + (nz * reach) / 2);
  return paintVertexColor(strut, hexFromRgb(DEPOT_TRIM_RGB));
}

/** The depot in its own frame: walls, wainscot, battens as one merged run, the gable roof on its knee braces, the operator's bay, the freight doors and the chimney; local Y=0 is the plate's top. */
function buildDepotBuildingGeometry(): THREE.BufferGeometry {
  const { w, d, plate, pitch, eave, wainscot, batten, battenPitch, bracePitch } = DEPOT_BODY;
  const { freight } = computeDepotLayout({ w: 2, d: 3 });
  const hw = w / 2;
  const hd = d / 2;
  const rise = pitch * hd;
  const y0 = 0;
  const parts: THREE.BufferGeometry[] = [
    standingBox(w, plate, d, 0, y0, 0, DEPOT_WALL_RGB),
    standingBox(w + 0.06, wainscot, d + 0.06, 0, y0, 0, DEPOT_TRIM_RGB),
    gableRoof(w, rise, d, 0, y0 + plate, 0, DEPOT_WALL_RGB),
  ];
  // Battens on every face from the wainscot to the plate, and up the gables.
  for (let x = -hw + battenPitch / 2; x < hw; x += battenPitch) {
    for (const s of [-1, 1]) {
      parts.push(
        standingBox(
          batten,
          plate - wainscot,
          0.04,
          x,
          y0 + wainscot,
          s * (hd + 0.02),
          DEPOT_TRIM_RGB,
        ),
      );
    }
  }
  for (let z = -hd + battenPitch / 2; z < hd; z += battenPitch) {
    const h = plate - wainscot + pitch * (hd - Math.abs(z));
    for (const s of [-1, 1]) {
      parts.push(standingBox(0.04, h, batten, s * (hw + 0.02), y0 + wainscot, z, DEPOT_TRIM_RGB));
    }
  }
  const ridgeY = y0 + plate + rise + 0.05;
  for (const s of [-1, 1] as const) {
    parts.push(
      roofPlane(
        w + 2 * eave,
        hd + eave,
        pitch * (hd + eave),
        0.12,
        0,
        ridgeY,
        0,
        s,
        DEPOT_ROOF_RGB,
      ),
    );
  }
  parts.push(standingBox(w + 2 * eave, 0.12, 0.3, 0, ridgeY - 0.02, 0, DEPOT_ROOF_RGB));
  // Each brace reaches up and out to the roof's underside at the eave's edge.
  const reach = eave - 0.1;
  for (const s of [-1, 1]) {
    for (let x = -hw + bracePitch / 2; x < hw; x += bracePitch) {
      parts.push(kneeBrace(x, s * hd, y0 + plate - pitch * reach - 0.08, 0, s, reach));
    }
    for (const z of [-hd + 1.2, hd - 1.2]) {
      parts.push(kneeBrace(s * hw, z, y0 + plate + pitch * (hd - Math.abs(z)) - 0.08, s, 0, reach));
    }
  }
  // The operator's bay: three walls proud of the track face under a shallow hip.
  const bayZ = -hd - DEPOT_BAY.proud / 2;
  parts.push(standingBox(DEPOT_BAY.w, DEPOT_BAY.h, DEPOT_BAY.proud, 0, y0, bayZ, DEPOT_WALL_RGB));
  parts.push(
    standingBox(
      DEPOT_BAY.w + 0.06,
      wainscot,
      DEPOT_BAY.proud + 0.03,
      0,
      y0,
      bayZ - 0.015,
      DEPOT_TRIM_RGB,
    ),
  );
  const hip = new THREE.BoxGeometry(DEPOT_BAY.w + 0.4, 0.1, DEPOT_BAY.proud + 0.3);
  hip.rotateX(-Math.atan2(DEPOT_BAY.hip, DEPOT_BAY.proud));
  hip.translate(0, y0 + DEPOT_BAY.h + DEPOT_BAY.hip / 2, bayZ - 0.1);
  parts.push(paintVertexColor(hip, hexFromRgb(DEPOT_ROOF_RGB)));
  for (const f of freight) {
    parts.push(standingBox(f.w, f.h, 0.1, f.x, y0, f.z + f.nz * 0.05, DEPOT_FREIGHT_RGB));
  }
  const { chimney } = computeDepotLayout({ w: 2, d: 3 });
  const chimneyTop = ridgeY + DEPOT_CHIMNEY.above;
  parts.push(
    standingBox(
      DEPOT_CHIMNEY.size,
      chimneyTop - plate,
      DEPOT_CHIMNEY.size,
      chimney.x,
      y0 + plate,
      chimney.z,
      DEPOT_BRICK_RGB,
    ),
  );
  return mergeParts(parts);
}

/** The depot's doors and windows and the bay's panes, in the depot frame, one geometry for the one emissive material. */
function buildDepotLitGeometry(): THREE.BufferGeometry {
  const { panes } = computeDepotLayout({ w: 2, d: 3 });
  const proud = 0.06;
  return mergeParts(
    panes.map((p) =>
      p.nz !== 0
        ? standingBox(p.w, p.h, proud, p.x, p.y, p.z + (p.nz * proud) / 2, STATION_POLE_RGB)
        : standingBox(proud, p.h, p.w, p.x + (p.nx * proud) / 2, p.y, p.z, STATION_POLE_RGB),
    ),
  );
}

/**
 * Which edge of a footprint the rail runs along, as the side its track-frame
 * -Z faces: 0 south (+Z), 1 east (+X), 2 north (-Z), 3 west (-X). The edge
 * with the most rail tiles, ties north, east, south, west; null when no rail
 * touches the lot.
 */
export function railSideOf(
  x: number,
  z: number,
  lot: FootprintSize,
  railAt: (tx: number, tz: number) => boolean,
): 0 | 1 | 2 | 3 | null {
  const { w, d } = lot;
  const count = (tiles: [number, number][]): number =>
    tiles.filter(([tx, tz]) => railAt(tx, tz)).length;
  const row = (tz: number): [number, number][] => Array.from({ length: w }, (_, i) => [x + i, tz]);
  const col = (tx: number): [number, number][] => Array.from({ length: d }, (_, i) => [tx, z + i]);
  const sides: [0 | 1 | 2 | 3, number][] = [
    [2, count(row(z - 1))],
    [1, count(col(x + w))],
    [0, count(row(z + d))],
    [3, count(col(x - 1))],
  ];
  let best: 0 | 1 | 2 | 3 | null = null;
  let most = 0;
  for (const [side, n] of sides) {
    if (n > most) {
      most = n;
      best = side;
    }
  }
  return best;
}

/**
 * The station's track frame for a lot: the footprint with its width along
 * the track, and the turn that lays that frame's -Z edge on the track's side.
 * `long` says the track runs along the lot's longer edge.
 */
export function depotFrame(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
  facing: 0 | 1 | 2 | 3,
): { footprint: FootprintSize; turn: 0 | 1 | 2 | 3; long: boolean } {
  const lot = footprintForRotation(entry, rotation);
  const alongX = facing % 2 === 0;
  const footprint = alongX ? { w: lot.w, d: lot.d } : { w: lot.d, d: lot.w };
  return { footprint, turn: ((facing + 2) % 4) as 0 | 1 | 2 | 3, long: footprint.w > footprint.d };
}

/** The two track frames a station's lot can take: the track along its catalog width, or along its depth. */
export function depotFrames(entry: BuildingCatalogEntry): {
  short: FootprintSize;
  long: FootprintSize;
} {
  const { w, d } = entry.footprint;
  return w <= d
    ? { short: { w, d }, long: { w: d, d: w } }
    : { short: { w: d, d: w }, long: { w, d } };
}

// ---------------------------------------------------------------------------
// the depots: a bus base at two sizes, a tram depot and a rail yard, each
// read by its bay doors and the fleet on its apron. The bus base takes local
// +Z as the street side. The tram depot and the rail yard are laid out in a
// yard frame: the lot's long side along X, the track along the frame's -Z
// edge, or off its -X end where the track runs along a short edge of the
// lot. The vehicles parked are what the depot holds less what is out on the
// lines, refit by setDepotFleets. Only the shops' door panes light, on the
// stations' material.
// ---------------------------------------------------------------------------

/** A bus stall for a 10 m bus, and the aisle it swings out through. */
export const BUS_BASE_STALL = { w: 3.6, l: 11.5 };
export const BUS_BASE_AISLE_M = 12.2;
/** The drive from the street, through a gate in the 2.1 m fence. */
export const BUS_BASE_DRIVE_M = 7.2;
/** A drive-through bay: 4.9 m wide under a 4.1 m clear door, 60 ft long where the lot has the room. */
export const BUS_BASE_BAY = { w: 4.9, l: 18.3, clear: 4.1 };
/** The roof over the bays' clear height, up to the depot's 5.5 m. */
export const BUS_BASE_ROOF_M = 1.4;
/** A fuelling island: a 1.2 × 4 m canopy on two posts over a dispenser, clear of a 3 m bus. */
export const BUS_BASE_FUEL = { w: 1.2, l: 4, clear: 4.27, post: 0.2, slab: 0.25 };
/** The office floor at the shop's street end; the garage stacks two. */
export const BUS_BASE_OFFICE_M2 = 125;
const BUS_BASE_STOREY_M = 3.2;
const BUS_BASE_WALL_M = 0.3;
const BUS_BASE_DOOR_PIER_M = 0.3;
const BUS_BASE_OFFICE_DEPTH_M = 9.8;
const BUS_BASE_FUEL_PITCH_M = 12;
const BUS_BASE_GANTRY = { t: 0.35, out: 1.2 };
const BUS_BASE_WINDOW = { w: 2, h: 1.4, pitch: 4.2 };

const BUS_BASE_HALL_RGB: RGB = [0.6, 0.62, 0.62];
const BUS_BASE_OFFICE_RGB: RGB = [0.72, 0.7, 0.65];
const BUS_BASE_DOOR_RGB: RGB = [0.86, 0.87, 0.84];
const BUS_BASE_MOUTH_RGB: RGB = [0.14, 0.15, 0.16];
const BUS_BASE_CANOPY_RGB: RGB = [0.82, 0.82, 0.8];
const BUS_BASE_DISPENSER_RGB: RGB = [0.5, 0.18, 0.14];
/** The fleets' liveries: vehicle paint, outside the surface channel cap. */
const BUS_LIVERY_HEX = 0xe8e4da;
const TRAM_LIVERY_HEX = 0xd6dde4;
const TRAIN_LIVERY_HEX = 0xc6ccd2;

/** A bus stall: its centre and which way the bus in it noses (0 to +Z, 2 to -Z). */
export interface BusBaseStall extends Vec2 {
  turn: 0 | 2;
}

/** A door in a wall: where its centre stands on the plan, the wall's outward normal, its width along the wall and its clear height. */
export interface YardDoor extends Vec2 {
  nx: -1 | 0 | 1;
  nz: -1 | 0 | 1;
  w: number;
  h: number;
}

interface BusBasePlan {
  perRow: number;
  modules: number;
  bays: number;
  fuel: number;
  officeStoreys: number;
}

/** Two rows of five about one aisle for the depot; four rows of nine about two for the garage. */
function busBasePlan(footprint: FootprintSize): BusBasePlan {
  return footprint.w * footprint.d >= 12
    ? { perRow: 9, modules: 2, bays: 4, fuel: 2, officeStoreys: 2 }
    : { perRow: 5, modules: 1, bays: 1, fuel: 1, officeStoreys: 1 };
}

export interface BusBaseLayout {
  rows: Rect[];
  aisles: Rect[];
  /** In fill order: the first stalls hold the first buses at home. */
  stalls: BusBaseStall[];
  drive: Rect;
  gate: Gap;
  fence: Rect;
  hall: Rect;
  office: Rect;
  hallHeight: number;
  officeHeight: number;
  officeStoreys: number;
  /** The maintenance bays' doors on the hall's yard face, nearest the office first. */
  bayDoors: YardDoor[];
  /** The wash lane's open mouth at the hall's far end, and the gantry posts before it. */
  washMouth: YardDoor;
  gantry: Vec2[];
  officeDoor: YardDoor;
  panes: DepotPane[];
  /** Each fuelling island's centre, its canopy's long axis along Z. */
  fuel: Vec2[];
}

/**
 * Where everything stands on a bus base, in the footprint frame with +Z to
 * the street. The stall rows along the lot's left side about their aisles,
 * each entered from the drive that runs down their right from the gate; the
 * shop to the right of the drive at the street end, its bays stacked behind
 * the office and opening onto the drive; the fuelling islands in the strip
 * behind the shop. Pure; fixed per footprint.
 */
export function computeBusBaseLayout(footprint: FootprintSize): BusBaseLayout {
  const plan = busBasePlan(footprint);
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const inset = GEN_FENCE_INSET_M;
  const x0 = -halfW + inset;
  const rowW = plan.perRow * BUS_BASE_STALL.w;
  const moduleD = 2 * BUS_BASE_STALL.l + BUS_BASE_AISLE_M;
  const rows: Rect[] = [];
  const aisles: Rect[] = [];
  const stalls: BusBaseStall[] = [];
  for (let m = 0; m < plan.modules; m++) {
    const base = -halfD + inset + m * moduleD;
    const a: Rect = { x0, x1: x0 + rowW, z0: base, z1: base + BUS_BASE_STALL.l };
    const aisle: Rect = { x0, x1: x0 + rowW, z0: a.z1, z1: a.z1 + BUS_BASE_AISLE_M };
    const b: Rect = { x0, x1: x0 + rowW, z0: aisle.z1, z1: aisle.z1 + BUS_BASE_STALL.l };
    rows.push(a, b);
    aisles.push(aisle);
    for (const [row, turn] of [
      [a, 2],
      [b, 0],
    ] as const) {
      for (let i = 0; i < plan.perRow; i++) {
        stalls.push({ x: x0 + (i + 0.5) * BUS_BASE_STALL.w, z: (row.z0 + row.z1) / 2, turn });
      }
    }
  }
  const drive: Rect = {
    x0: x0 + rowW,
    x1: x0 + rowW + BUS_BASE_DRIVE_M,
    z0: aisles[0]!.z0,
    z1: halfD,
  };
  const hallX0 = drive.x1 + 0.6;
  const hallX1 = halfW - inset - BUS_BASE_WALL_M;
  const officeD = Math.min(BUS_BASE_OFFICE_DEPTH_M, BUS_BASE_OFFICE_M2 / (hallX1 - hallX0));
  const office: Rect = {
    x0: hallX0,
    x1: hallX1,
    z0: halfD - inset - BUS_BASE_WALL_M - officeD,
    z1: halfD - inset - BUS_BASE_WALL_M,
  };
  const hallD = (plan.bays + 1) * BUS_BASE_BAY.w + 2 * BUS_BASE_WALL_M;
  const hall: Rect = { x0: hallX0, x1: hallX1, z0: office.z0 - hallD, z1: office.z0 };
  const hallHeight = BUS_BASE_BAY.clear + BUS_BASE_ROOF_M;
  const officeHeight =
    plan.officeStoreys === 1 ? hallHeight : plan.officeStoreys * BUS_BASE_STOREY_M;
  const doorW = BUS_BASE_BAY.w - 2 * BUS_BASE_DOOR_PIER_M;
  const bayDoors: YardDoor[] = [];
  for (let k = 0; k < plan.bays; k++) {
    bayDoors.push({
      x: hall.x0,
      z: hall.z1 - BUS_BASE_WALL_M - (k + 0.5) * BUS_BASE_BAY.w,
      nx: -1,
      nz: 0,
      w: doorW,
      h: BUS_BASE_BAY.clear,
    });
  }
  const washMouth: YardDoor = {
    x: hall.x0,
    z: hall.z0 + BUS_BASE_WALL_M + BUS_BASE_BAY.w / 2,
    nx: -1,
    nz: 0,
    w: doorW,
    h: BUS_BASE_BAY.clear,
  };
  const gantry: Vec2[] = [-1, 1].map((s) => ({
    x: hall.x0 - BUS_BASE_GANTRY.out,
    z: washMouth.z + s * (doorW / 2 + 0.3),
  }));
  const officeDoor: YardDoor = {
    x: (office.x0 + office.x1) / 2,
    z: office.z1,
    nx: 0,
    nz: 1,
    ...STATION_ENTRANCE,
  };

  const panes: DepotPane[] = [];
  for (const door of bayDoors) {
    for (let k = 0; k < 4; k++) {
      panes.push({
        x: door.x,
        z: door.z + (k - 1.5) * 1.1,
        nx: -1,
        nz: 0,
        w: 0.95,
        y: door.h - 1,
        h: 0.55,
      });
    }
  }
  for (const dx of [-0.6, 0.6]) {
    panes.push({ x: officeDoor.x + dx, z: office.z1, nx: 0, nz: 1, w: 1, y: 0.4, h: 1.7 });
  }
  const clearOfDoor = (x: number): boolean =>
    Math.abs(x - officeDoor.x) > officeDoor.w / 2 + 1.5 + BUS_BASE_WINDOW.w / 2;
  for (let f = 0; f < plan.officeStoreys; f++) {
    const y = f * BUS_BASE_STOREY_M + 1.2;
    for (
      let x = office.x0 + 1.6;
      x + BUS_BASE_WINDOW.w / 2 <= office.x1 - 1;
      x += BUS_BASE_WINDOW.pitch
    ) {
      if (f === 0 && !clearOfDoor(x)) continue;
      panes.push({ x, z: office.z1, nx: 0, nz: 1, w: BUS_BASE_WINDOW.w, y, h: BUS_BASE_WINDOW.h });
    }
    for (
      let z = office.z0 + 1.6;
      z + BUS_BASE_WINDOW.w / 2 <= office.z1 - 1;
      z += BUS_BASE_WINDOW.pitch
    ) {
      panes.push({ x: office.x0, z, nx: -1, nz: 0, w: BUS_BASE_WINDOW.w, y, h: BUS_BASE_WINDOW.h });
    }
  }

  const fuel: Vec2[] = [];
  for (let i = 0; i < plan.fuel; i++) {
    fuel.push({
      x: (hall.x0 + hall.x1) / 2,
      z: hall.z0 - BUS_BASE_FUEL.l - 2 - i * BUS_BASE_FUEL_PITCH_M,
    });
  }

  return {
    rows,
    aisles,
    stalls,
    drive,
    gate: { x0: drive.x0, x1: drive.x1 },
    fence: lotRect(footprint, inset),
    hall,
    office,
    hallHeight,
    officeHeight,
    officeStoreys: plan.officeStoreys,
    bayDoors,
    washMouth,
    gantry,
    officeDoor,
    panes,
    fuel,
  };
}

/** A bus stall's plan. */
export function busBaseStallRect(s: BusBaseStall): Rect {
  return {
    x0: s.x - BUS_BASE_STALL.w / 2,
    x1: s.x + BUS_BASE_STALL.w / 2,
    z0: s.z - BUS_BASE_STALL.l / 2,
    z1: s.z + BUS_BASE_STALL.l / 2,
  };
}

/** A box in a wall: `w` along the wall, `h` tall, `t` thick, its wall face at (x, z) and standing `proud` of it along the normal. */
function wallBox(
  w: number,
  h: number,
  t: number,
  x: number,
  y0: number,
  z: number,
  nx: number,
  nz: number,
  proud: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const out = proud + t / 2;
  return nz !== 0
    ? standingBox(w, h, t, x, y0, z + nz * out, rgb)
    : standingBox(t, h, w, x + nx * out, y0, z, rgb);
}

/** A vehicle door framed as the fire station's: a dark frame round a lighter leaf proud of it, with the panel seams across the leaf. */
function yardDoorParts(door: YardDoor, y0: number, leafRgb: RGB): THREE.BufferGeometry[] {
  const { x, z, nx, nz } = door;
  const parts = [
    wallBox(
      door.w + 2 * STATION_FRAME_M,
      door.h + STATION_FRAME_M,
      0.2,
      x,
      y0,
      z,
      nx,
      nz,
      STATION_FRAME_PROUD_M - 0.1,
      STATION_FRAME_RGB,
    ),
    wallBox(door.w, door.h, 0.12, x, y0, z, nx, nz, STATION_LEAF_PROUD_M - 0.06, leafRgb),
  ];
  for (let k = 1; k <= 5; k++) {
    parts.push(
      wallBox(
        door.w,
        0.06,
        0.04,
        x,
        y0 + (door.h * k) / 6,
        z,
        nx,
        nz,
        STATION_LEAF_PROUD_M + 0.05,
        STATION_GROOVE_RGB,
      ),
    );
  }
  return parts;
}

/** The lit panes of a depot, standing just proud of their walls, one geometry for the one emissive material. */
function paneParts(panes: readonly DepotPane[], y0: number): THREE.BufferGeometry[] {
  return panes.map((p) =>
    wallBox(p.w, p.h, 0.06, p.x, y0 + p.y, p.z, p.nx, p.nz, 0, STATION_POLE_RGB),
  );
}

/** A fuelling island: the canopy slab on its two posts over the dispenser; local Y=0 is the ground it stands on. */
function fuelIslandParts(at: Vec2): THREE.BufferGeometry[] {
  const { w, l, clear, post, slab } = BUS_BASE_FUEL;
  const parts = [
    standingBox(w + 0.6, slab, l, at.x, clear, at.z, BUS_BASE_CANOPY_RGB),
    standingBox(0.6, 1.6, 0.5, at.x, 0, at.z, BUS_BASE_DISPENSER_RGB),
    standingBox(0.9, 0.15, l - 0.4, at.x, 0, at.z, GEN_CONCRETE_RGB),
  ];
  for (const s of [-1, 1]) {
    parts.push(standingBox(post, clear, post, at.x, 0, at.z + s * (l / 2 - 0.5), GEN_STEEL_RGB));
  }
  return parts;
}

/** The paved yard with the drive's concrete, the stall lines and the fuel pads; local Y=0 is the highest ground under the lot. */
function buildBusBaseYardGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeBusBaseLayout(footprint);
  const top = RECYCLING_YARD_HEIGHT;
  const parts: THREE.BufferGeometry[] = [buildRecyclingYardGeometry(footprint)];
  parts.push(groundPatch(layout.drive, 0, EDU_CONCRETE_M, STATION_PAVING_RGB));
  const paint = top + EDU_ASPHALT_M;
  const seen = new Set<string>();
  for (const s of layout.stalls) {
    const r = busBaseStallRect(s);
    for (const at of [r.x0, r.x1]) {
      const key = `${at.toFixed(3)}:${s.z.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(stallLine(r, false, at, paint));
    }
  }
  return mergeParts(parts);
}

/** The shop hall under its roof with the framed bay doors, the wash lane's mouth and gantry, the office with its belt courses and door, the fuelling islands and the fence; local Y=0 is the yard slab's top. */
function buildBusBaseShopGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  const layout = computeBusBaseLayout(footprint);
  const { hall, office, hallHeight, officeHeight } = layout;
  const parts: THREE.BufferGeometry[] = [
    ...cappedBox(hall, hallHeight, BUS_BASE_HALL_RGB, STATION_CAP_M, STATION_CAP_RGB),
    ...cappedBox(office, officeHeight, BUS_BASE_OFFICE_RGB, STATION_CAP_M, STATION_CAP_RGB),
  ];
  for (let f = 1; f < layout.officeStoreys; f++) {
    parts.push(
      standingBox(
        office.x1 - office.x0 + 0.1,
        0.2,
        office.z1 - office.z0 + 0.1,
        (office.x0 + office.x1) / 2,
        f * BUS_BASE_STOREY_M - 0.1,
        (office.z0 + office.z1) / 2,
        STATION_BELT_RGB,
      ),
    );
  }
  for (const door of layout.bayDoors) parts.push(...yardDoorParts(door, 0, BUS_BASE_DOOR_RGB));
  const mouth = layout.washMouth;
  parts.push(
    wallBox(mouth.w, mouth.h, 0.12, mouth.x, 0, mouth.z, mouth.nx, mouth.nz, 0, BUS_BASE_MOUTH_RGB),
  );
  const { t } = BUS_BASE_GANTRY;
  for (const post of layout.gantry)
    parts.push(standingBox(t, mouth.h + t, t, post.x, 0, post.z, GEN_STEEL_RGB));
  parts.push(
    standingBox(
      t,
      t,
      Math.abs(layout.gantry[1]!.z - layout.gantry[0]!.z) + t,
      layout.gantry[0]!.x,
      mouth.h,
      mouth.z,
      GEN_STEEL_RGB,
    ),
  );
  const entrance = layout.officeDoor;
  parts.push(
    wallBox(entrance.w, entrance.h, 0.12, entrance.x, 0, entrance.z, 0, 1, 0, STATION_ENTRANCE_RGB),
  );
  for (const island of layout.fuel) parts.push(...fuelIslandParts(island));
  fenceLoop(parts, layout.fence, GEN_FENCE_HEIGHT_M, layout.gate);
  return mergeParts(parts);
}

/** Every lit pane of a bus base, one geometry for the one emissive material; local Y=0 is the yard slab's top. */
function buildBusBaseLitGeometry(footprint: FootprintSize): THREE.BufferGeometry {
  return mergeParts(paneParts(computeBusBaseLayout(footprint).panes, 0));
}

/** One parked bus at its real size, nose to local +Z, standing on its own origin. */
function buildParkedBusGeometry(): THREE.BufferGeometry {
  const [sx, sy, sz] = sizeForKind(VehicleKind.Bus);
  const bus = buildVehicleGeometry(VehicleKind.Bus);
  bus.scale(sx, sy, sz);
  bus.translate(0, sy / 2, 0);
  return bus;
}

// --- the tram depot and the rail yard --------------------------------------------

/** A segment of track centreline in the yard frame, from its start to its end. */
export interface TrackSeg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface YardSpec {
  roads: number;
  /** The stabling roads' centres apart. */
  pitch: number;
  roadLength: number;
  /** The shop: two roads of this width, this long, with doors at this clear height. */
  hallRoadW: number;
  hallLength: number;
  doorClear: number;
  officeM2: number;
  /** The turnout lead from the track edge to the first road. */
  lead: number;
  /** Catenary poles over the roads: a tram takes its current from the wire. */
  poles: boolean;
  /** Ballast under the rails, as the railway lays them; a tram's rails lie in a concrete apron. */
  ballast: boolean;
  /** A diesel fuelling stand at the lead, and a drive from the street: the rail yard's. */
  fuelStand: boolean;
  drive: boolean;
}

/** Eight roads at 3.5 m centres, 22.4 m long: two 11 m cars and a coupling; the hall over a maintenance and a wash road. */
export const TRAM_DEPOT_SPEC: YardSpec = {
  roads: 8,
  pitch: 3.5,
  roadLength: 22.4,
  hallRoadW: 4.9,
  hallLength: 28.4,
  doorClear: 4.6,
  officeM2: 97,
  lead: 20,
  poles: true,
  ballast: false,
  fuelStand: false,
  drive: false,
};
/** Five roads at 4.5 m centres, 45.6 m long: three 14 m cars at a 15.2 m pitch; the hall over a maintenance and a wash road. */
export const RAIL_YARD_SPEC: YardSpec = {
  roads: 5,
  pitch: 4.5,
  roadLength: 45.6,
  hallRoadW: 6,
  hallLength: 51.6,
  doorClear: 4.6,
  officeM2: 125,
  lead: 20,
  poles: false,
  ballast: true,
  fuelStand: true,
  drive: true,
};
/** Catenary poles 6 m tall every 10 m along a pair of roads, each with a crossarm over both. */
export const CATENARY_POLE = { h: 6, pitch: 10, size: 0.2, arm: 5.5, armT: 0.12 };
/** The track as the road mesh lays it: rails at the gauge on sleepers, over ballast on the railway. */
const YARD_GAUGE_HALF_M = 0.75;
const YARD_RAIL = { w: 0.14, h: 0.12 };
const YARD_SLEEPER = { l: 2.3, w: 0.32, h: 0.1, pitch: 1.6 };
const YARD_BALLAST = { halfW: 1.7, h: 0.08 };
/** The darker trackbed a tram road's rails lie in on the apron. */
const YARD_TRACKBED_HALF_M = 1.3;
/** A road's far end keeps this far inside the lot; a road's rails keep this clear of the fence. */
const YARD_TRACK_EDGE_M = 0.3;
const YARD_ROAD_CLEAR_M = 1.5;
const YARD_WALL_M = 0.3;
const YARD_OFFICE_H = 3.6;
const YARD_OFFICE_W = { tram: 10, rail: 13.3 };
const YARD_FENCE_GAP_M = 3.5;
const YARD_DRIVE_M = 7.2;
const YARD_FUEL_STAND = { tankR: 0.8, tankL: 5, cabinetW: 0.8, cabinetH: 1.2, cabinetD: 0.6 };
const YARD_WINDOW = { w: 1.6, h: 1.3, sill: 1.1, pitch: 3.2 };

const YARD_RAIL_RGB: RGB = [0.7, 0.71, 0.74];
const YARD_SLEEPER_RGB: RGB = [0.26, 0.22, 0.19];
const YARD_BALLAST_RGB: RGB = [0.34, 0.33, 0.31];
const YARD_APRON_RGB: RGB = [0.52, 0.52, 0.5];
const YARD_TRACKBED_RGB: RGB = [0.4, 0.4, 0.39];
const YARD_HALL_RGB: RGB = [0.58, 0.6, 0.62];
const YARD_OFFICE_RGB: RGB = [0.72, 0.7, 0.65];
const YARD_DOOR_RGB: RGB = [0.84, 0.85, 0.83];
const YARD_TANK_RGB: RGB = [0.62, 0.62, 0.6];

export interface YardLayout {
  fromEnd: boolean;
  /** The turnout lead from the track edge to the ladder, one or two straight segments. */
  lead: TrackSeg[];
  ladder: TrackSeg;
  /** The stabling roads in fill order, each from its turnout to its buffer. */
  roads: TrackSeg[];
  /** The maintenance road and the wash road, from the lead to the hall's far end. */
  hallRoads: TrackSeg[];
  hall: Rect;
  office: Rect;
  hallDoors: YardDoor[];
  officeDoor: YardDoor;
  panes: DepotPane[];
  poles: Vec2[];
  /** The concrete apron the tram's rails lie in; the whole yard but the strip beyond the last road. */
  apron: Rect;
  fence: Rect;
  fenceGaps: FenceGap[];
  drive: Rect | null;
  /** The fuelling stand's centre, its tank along Z. */
  fuel: Vec2 | null;
  /** The cars of each stabled set in fill order: centre and the turn that points a nose along the road. */
  sets: { x: number; z: number; turn: 0 | 1 | 2 | 3 }[][];
}

/** A gap in the fence along one side of the lot: 0 the +Z side, 1 +X, 2 -Z, 3 -X; `a`..`b` along that side. */
export interface FenceGap {
  side: 0 | 1 | 2 | 3;
  a: number;
  b: number;
}

/** The lot with its long side along X, as a yard is laid out. */
export function yardFootprint(entry: BuildingCatalogEntry): FootprintSize {
  const { w, d } = entry.footprint;
  return w >= d ? { w, d } : { w: d, d: w };
}

/**
 * A yard's frame: the lot with its long side along X and the track on its -Z
 * edge, or, where the track runs along a short edge of the lot, off its -X
 * end; and the turn that lays that frame on the placed lot.
 */
export function yardFrame(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
  facing: 0 | 1 | 2 | 3,
): { footprint: FootprintSize; turn: 0 | 1 | 2 | 3; fromEnd: boolean } {
  const lot = footprintForRotation(entry, rotation);
  const longAlongX = lot.w >= lot.d;
  const trackAlongX = facing % 2 === 0;
  const fromEnd = trackAlongX !== longAlongX;
  return {
    footprint: longAlongX ? { w: lot.w, d: lot.d } : { w: lot.d, d: lot.w },
    turn: ((facing + (fromEnd ? 1 : 2)) % 4) as 0 | 1 | 2 | 3,
    fromEnd,
  };
}

/** Which edge of a footprint the tram track runs along, as the station reads the railway. */
export const tramSideOf = railSideOf;

/**
 * Where everything stands in a yard, in its frame. The lead climbs at 45°
 * from the track edge to the ladder, which steps across the stabling roads
 * at their pitch; the roads run along +X to their buffers at the far end of
 * the lot. The shop lies along the track side under the roads, its two
 * roads off the lead, its doors at its near end; the tram's office stands
 * at the shop's far end, the rail yard's by its gate at the street. Pure;
 * fixed per frame footprint and spec.
 */
export function computeYardLayout(
  footprint: FootprintSize,
  spec: YardSpec,
  fromEnd: boolean,
  cars: { perSet: number; length: number; pitch: number },
): YardLayout {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  const inset = GEN_FENCE_INSET_M;
  const m = YARD_TRACK_EDGE_M;
  const { pitch, roads: n, roadLength } = spec;
  const span = pitch * (n - 1);
  const xL0 = halfW - m - roadLength - span;
  const bed = spec.ballast ? YARD_BALLAST.halfW : YARD_TRACKBED_HALF_M;

  const hall: Rect = {
    x0: halfW - inset - spec.hallLength,
    x1: halfW - inset,
    z0: -halfD + inset,
    z1: -halfD + inset + 2 * spec.hallRoadW,
  };
  // The lead starts at the track edge, in by its own bed so its rails stay
  // inside the lot. The first road's line: a lead of the stated length climbs
  // to it, the roads above it clear the fence, the lead starts inside the
  // lot, and the road's bed clears the shop.
  const edge = -halfD + bed + 0.2;
  const climb = spec.lead / Math.SQRT2;
  const roomZ = halfD - inset - YARD_ROAD_CLEAR_M - span;
  // The climb's outer rail reaches a bed's corner past its start.
  const reach = xL0 + halfW - bed * Math.SQRT1_2 - 0.1 + edge;
  const z0 = Math.max(hall.z1 + bed + 0.3, Math.min(edge + climb, roomZ, reach));
  const lead: TrackSeg[] = [];
  if (!fromEnd) {
    lead.push({ x0: xL0 - (z0 - edge), z0: edge, x1: xL0, z1: z0 });
  } else {
    // Off the end: straight in from the -X edge, then the climb.
    const xB = xL0 - (z0 - edge);
    lead.push(
      { x0: -halfW + m, z0: edge, x1: xB, z1: edge },
      { x0: xB, z0: edge, x1: xL0, z1: z0 },
    );
  }
  const ladder: TrackSeg = { x0: xL0, z0, x1: xL0 + span, z1: z0 + span };
  const roads: TrackSeg[] = [];
  for (let k = 0; k < n; k++) {
    const x = xL0 + pitch * k;
    const z = z0 + pitch * k;
    roads.push({ x0: x, z0: z, x1: x + roadLength, z1: z });
  }
  const climbSeg = lead[lead.length - 1]!;
  const leadXAt = (z: number): number => climbSeg.x0 + (z - climbSeg.z0);
  const hallRoads: TrackSeg[] = [0, 1].map((i) => {
    const z = hall.z0 + (i + 0.5) * spec.hallRoadW;
    return { x0: leadXAt(z), z0: z, x1: hall.x1 - 0.5, z1: z };
  });
  const hallDoors: YardDoor[] = hallRoads.map((r) => ({
    x: hall.x0,
    z: r.z0,
    nx: -1,
    nz: 0,
    w: spec.hallRoadW - 0.9,
    h: spec.doorClear,
  }));

  const drive: Rect | null = spec.drive
    ? {
        x0: halfW - inset - 1 - YARD_DRIVE_M,
        x1: halfW - inset - 1,
        z0: roads[n - 1]!.z0 + bed + 1,
        z1: halfD,
      }
    : null;
  const officeW = spec.drive ? YARD_OFFICE_W.rail : YARD_OFFICE_W.tram;
  const officeD = spec.officeM2 / officeW;
  const office: Rect = drive
    ? {
        x0: drive.x0 - 1 - officeW,
        x1: drive.x0 - 1,
        z0: halfD - inset - YARD_WALL_M - officeD,
        z1: halfD - inset - YARD_WALL_M,
      }
    : { x0: hall.x1 - officeW, x1: hall.x1, z0: hall.z1, z1: hall.z1 + officeD };
  const officeDoor: YardDoor = {
    x: (office.x0 + office.x1) / 2,
    z: office.z1,
    nx: 0,
    nz: 1,
    ...STATION_ENTRANCE,
  };
  const panes: DepotPane[] = [];
  for (const door of hallDoors) {
    for (let k = 0; k < 4; k++) {
      panes.push({
        x: door.x,
        z: door.z + (k - 1.5) * 1.1,
        nx: -1,
        nz: 0,
        w: 0.95,
        y: door.h - 1,
        h: 0.55,
      });
    }
  }
  for (const dx of [-0.6, 0.6]) {
    panes.push({ x: officeDoor.x + dx, z: office.z1, nx: 0, nz: 1, w: 1, y: 0.4, h: 1.7 });
  }
  const clearOfDoor = (x: number): boolean =>
    Math.abs(x - officeDoor.x) > officeDoor.w / 2 + 1 + YARD_WINDOW.w / 2;
  for (let x = office.x0 + 1.4; x + YARD_WINDOW.w / 2 <= office.x1 - 1; x += YARD_WINDOW.pitch) {
    if (!clearOfDoor(x)) continue;
    panes.push({
      x,
      z: office.z1,
      nx: 0,
      nz: 1,
      w: YARD_WINDOW.w,
      y: YARD_WINDOW.sill,
      h: YARD_WINDOW.h,
    });
  }
  for (let z = office.z0 + 1.4; z + YARD_WINDOW.w / 2 <= office.z1 - 1; z += YARD_WINDOW.pitch) {
    panes.push({
      x: office.x0,
      z,
      nx: -1,
      nz: 0,
      w: YARD_WINDOW.w,
      y: YARD_WINDOW.sill,
      h: YARD_WINDOW.h,
    });
  }

  const poles: Vec2[] = [];
  if (spec.poles) {
    for (let k = 0; k + 1 < n; k += 2) {
      const a = roads[k]!;
      const b = roads[k + 1]!;
      const z = (a.z0 + b.z0) / 2;
      for (
        let x = Math.max(a.x0, b.x0) + 1.5;
        x <= Math.min(a.x1, b.x1) - 1;
        x += CATENARY_POLE.pitch
      ) {
        poles.push({ x, z });
      }
    }
  }

  const fence = lotRect(footprint, inset);
  const fenceGaps: FenceGap[] = [];
  const first = lead[0]!;
  if (!fromEnd) {
    const at = first.x0 + (fence.z0 - first.z0);
    fenceGaps.push({
      side: 2,
      a: Math.max(fence.x0, at - YARD_FENCE_GAP_M),
      b: at + YARD_FENCE_GAP_M,
    });
  } else {
    fenceGaps.push({
      side: 3,
      a: Math.max(fence.z0, first.z0 - YARD_FENCE_GAP_M),
      b: first.z0 + YARD_FENCE_GAP_M,
    });
  }
  // The gate opens across the office's frontage and the drive beside it.
  if (drive) fenceGaps.push({ side: 0, a: office.x0 - 1, b: drive.x1 });

  // A set stands centred on its road: two tram cars and a coupling fill it exactly.
  const setLength = cars.length + (cars.perSet - 1) * cars.pitch;
  const sets = roads.map((road) =>
    Array.from({ length: cars.perSet }, (_, j) => ({
      x: road.x0 + (roadLength - setLength) / 2 + cars.length / 2 + j * cars.pitch,
      z: road.z0,
      turn: 1 as const,
    })),
  );

  return {
    fromEnd,
    lead,
    ladder,
    roads,
    hallRoads,
    hall,
    office,
    hallDoors,
    officeDoor,
    panes,
    poles,
    apron: {
      x0: -halfW + 0.05,
      x1: halfW - 0.05,
      z0: -halfD + 0.05,
      z1: Math.min(halfD - 0.05, roads[n - 1]!.z0 + bed + 1),
    },
    fence,
    fenceGaps,
    drive,
    fuel: spec.fuelStand ? { x: -halfW + 1.8, z: -halfD + 8 } : null,
    sets,
  };
}

/** A fence round `r` with a gap on each side listed. */
function fenceLoopWithGaps(
  parts: THREE.BufferGeometry[],
  r: Rect,
  height: number,
  gaps: readonly FenceGap[],
): void {
  const sides: { side: 0 | 1 | 2 | 3; a: number; b: number; fixed: number; alongX: boolean }[] = [
    { side: 0, a: r.x0, b: r.x1, fixed: r.z1, alongX: true },
    { side: 1, a: r.z0, b: r.z1, fixed: r.x1, alongX: false },
    { side: 2, a: r.x0, b: r.x1, fixed: r.z0, alongX: true },
    { side: 3, a: r.z0, b: r.z1, fixed: r.x0, alongX: false },
  ];
  for (const s of sides) {
    let from = s.a;
    for (const gap of gaps.filter((g) => g.side === s.side).sort((p, q) => p.a - q.a)) {
      fenceRun(parts, from, gap.a, s.fixed, s.alongX, height, GEN_FENCE_POST_SPACING_M);
      for (const at of [gap.a, gap.b]) {
        parts.push(
          s.alongX
            ? standingBox(0.25, height + 0.15, 0.25, at, 0, s.fixed, GEN_FENCE_RGB)
            : standingBox(0.25, height + 0.15, 0.25, s.fixed, 0, at, GEN_FENCE_RGB),
        );
      }
      from = gap.b;
    }
    fenceRun(parts, from, s.b, s.fixed, s.alongX, height, GEN_FENCE_POST_SPACING_M);
  }
}

/** A box laid along a track segment: `w` across it, `h` tall, standing on `y0`, shifted `across` metres to the segment's right. */
function alongSegment(
  seg: TrackSeg,
  w: number,
  h: number,
  y0: number,
  across: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const dx = seg.x1 - seg.x0;
  const dz = seg.z1 - seg.z0;
  const yaw = Math.atan2(dx, dz);
  const box = new THREE.BoxGeometry(w, h, Math.hypot(dx, dz));
  box.rotateY(yaw);
  box.translate(
    (seg.x0 + seg.x1) / 2 + across * Math.cos(yaw),
    y0 + h / 2,
    (seg.z0 + seg.z1) / 2 - across * Math.sin(yaw),
  );
  return paintVertexColor(box, hexFromRgb(rgb));
}

/** One segment of track: the pair of rails at the gauge, over sleepers on a ballast bed where the spec lays one. */
function trackParts(
  parts: THREE.BufferGeometry[],
  seg: TrackSeg,
  y0: number,
  ballast: boolean,
): void {
  let railY = y0;
  // A tram road lies in the apron: a darker trackbed strip between and about
  // its rails, so the road reads from the air as the street's rails do.
  if (!ballast) {
    parts.push(alongSegment(seg, 2 * YARD_TRACKBED_HALF_M, 0.01, y0, 0, YARD_TRACKBED_RGB));
    railY = y0 + 0.01;
  }
  if (ballast) {
    parts.push(alongSegment(seg, 2 * YARD_BALLAST.halfW, YARD_BALLAST.h, y0, 0, YARD_BALLAST_RGB));
    const dx = seg.x1 - seg.x0;
    const dz = seg.z1 - seg.z0;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    for (let t = YARD_SLEEPER.pitch / 2; t < length; t += YARD_SLEEPER.pitch) {
      const sleeper = new THREE.BoxGeometry(YARD_SLEEPER.l, YARD_SLEEPER.h, YARD_SLEEPER.w);
      sleeper.rotateY(yaw);
      sleeper.translate(
        seg.x0 + (dx * t) / length,
        y0 + YARD_BALLAST.h + YARD_SLEEPER.h / 2,
        seg.z0 + (dz * t) / length,
      );
      parts.push(paintVertexColor(sleeper, hexFromRgb(YARD_SLEEPER_RGB)));
    }
    railY = y0 + YARD_BALLAST.h + YARD_SLEEPER.h;
  }
  for (const s of [-1, 1]) {
    parts.push(
      alongSegment(seg, YARD_RAIL.w, YARD_RAIL.h, railY, s * YARD_GAUGE_HALF_M, YARD_RAIL_RGB),
    );
  }
}

/** Every segment of a yard's track in the order it is reached: the lead, the ladder, the stabling roads and the shop's roads. */
export function yardSegments(layout: YardLayout): TrackSeg[] {
  return [...layout.lead, layout.ladder, ...layout.roads, ...layout.hallRoads];
}

/** The yard slab with the tram's concrete apron, the rail yard's drive and fuelling stand, and the fence open for the lead and the drive; local Y=0 is the highest ground under the lot. */
function buildYardYardGeometry(
  footprint: FootprintSize,
  layout: YardLayout,
  spec: YardSpec,
): THREE.BufferGeometry {
  const top = RECYCLING_YARD_HEIGHT;
  const parts: THREE.BufferGeometry[] = [buildRecyclingYardGeometry(footprint)];
  if (!spec.ballast) parts.push(groundPatch(layout.apron, 0, EDU_ASPHALT_M, YARD_APRON_RGB));
  if (layout.drive) parts.push(groundPatch(layout.drive, 0, EDU_CONCRETE_M, STATION_PAVING_RGB));
  if (layout.fuel) {
    const { tankR, tankL, cabinetW, cabinetH, cabinetD } = YARD_FUEL_STAND;
    const tank = new THREE.CylinderGeometry(tankR, tankR, tankL, 12);
    tank.rotateX(Math.PI / 2);
    tank.translate(layout.fuel.x, top + 0.5 + tankR, layout.fuel.z);
    parts.push(paintVertexColor(tank, hexFromRgb(YARD_TANK_RGB)));
    for (const s of [-1, 1]) {
      parts.push(
        standingBox(
          1.8,
          0.5,
          0.3,
          layout.fuel.x,
          top,
          layout.fuel.z + s * (tankL / 2 - 0.8),
          GEN_CONCRETE_RGB,
        ),
      );
    }
    parts.push(
      standingBox(
        cabinetW,
        cabinetH,
        cabinetD,
        layout.fuel.x + tankR + 0.8,
        top,
        layout.fuel.z,
        BUS_BASE_DISPENSER_RGB,
      ),
    );
  }
  const fence: THREE.BufferGeometry[] = [];
  fenceLoopWithGaps(fence, layout.fence, GEN_FENCE_HEIGHT_M, layout.fenceGaps);
  for (const part of fence) part.translate(0, top, 0);
  parts.push(...fence);
  return mergeParts(parts);
}

/** Every rail of the yard as one geometry; local Y=0 is the highest ground under the lot. */
function buildYardTrackGeometry(layout: YardLayout, spec: YardSpec): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y0 = RECYCLING_YARD_HEIGHT + (spec.ballast ? 0 : EDU_ASPHALT_M);
  for (const seg of yardSegments(layout)) trackParts(parts, seg, y0, spec.ballast);
  return mergeParts(parts);
}

/** The catenary poles and their crossarms as one geometry; local Y=0 is the yard slab's top. */
function buildYardPolesGeometry(layout: YardLayout): THREE.BufferGeometry {
  const { h, size, arm, armT } = CATENARY_POLE;
  const parts: THREE.BufferGeometry[] = [];
  for (const p of layout.poles) {
    parts.push(standingBox(size, h, size, p.x, 0, p.z, GEN_STEEL_RGB));
    parts.push(standingBox(armT, armT, arm, p.x, h - 0.4, p.z, GEN_STEEL_RGB));
  }
  return mergeParts(parts);
}

/** The shop hall under its roof with the framed doors at its near end, and the office with its door; local Y=0 is the yard slab's top. */
function buildYardShopGeometry(layout: YardLayout, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    ...cappedBox(layout.hall, height, YARD_HALL_RGB, STATION_CAP_M, STATION_CAP_RGB),
    ...cappedBox(layout.office, YARD_OFFICE_H, YARD_OFFICE_RGB, STATION_CAP_M, STATION_CAP_RGB),
  ];
  for (const door of layout.hallDoors) parts.push(...yardDoorParts(door, 0, YARD_DOOR_RGB));
  const entrance = layout.officeDoor;
  parts.push(
    wallBox(entrance.w, entrance.h, 0.12, entrance.x, 0, entrance.z, 0, 1, 0, STATION_ENTRANCE_RGB),
  );
  return mergeParts(parts);
}

/** Every lit pane of a yard's shop and office, one geometry for the one emissive material; local Y=0 is the yard slab's top. */
function buildYardLitGeometry(layout: YardLayout): THREE.BufferGeometry {
  return mergeParts(paneParts(layout.panes, 0));
}

/** The cars a yard stables on each road, as the lines draw them. */
export const YARD_CARS = {
  tram: { perSet: TRAM_CARS_PER_SET, length: TRAM_CAR_SIZE[2], pitch: TRAM_CAR_PITCH },
  rail: { perSet: TRAIN_CARS_PER_SET, length: TRAIN_CAR_SIZE[2], pitch: TRAIN_CAR_PITCH },
} as const;

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
  /** A draped park's own plate, built from the terrain under it. */
  drape?: DrapeRecord;
}

interface DrapeRecord {
  mesh: THREE.Mesh;
  /** The merged geometry's first vertices are the lawn's: this many, tinted as the park wears. */
  lawnVertices: number;
}

interface CemeteryPlacement {
  centerX: number;
  /** Ground level the lawn plate's top stands on. */
  floorY: number;
  centerZ: number;
  rotation: 0 | 1 | 2 | 3;
  graves: GraveSpace[];
}

interface DepotPlacement {
  centerX: number;
  /** The yard slab's top, where the vehicles stand. */
  floorY: number;
  centerZ: number;
  turn: 0 | 1 | 2 | 3;
  kind: 'busBaseBus' | 'tramDepotCar' | 'railYardCar';
  /** Each berth in fill order: the cars of the set that stands in it, centre and nose turn in the kit frame. */
  berths: { x: number; z: number; turn: 0 | 1 | 2 | 3 }[][];
  /** The catalog's holding, parked whole when the sim lists no fleet for the depot. */
  fleet: number;
  liveryHex: number;
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
const _scale = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _carColor = new THREE.Color();

export class UtilityKitRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  /** Whether a tile is water, so a shore building turns to face it; the default sees none. */
  private readonly waterAt: (x: number, z: number) => boolean;
  /** Whether a tile carries rail, so a station lays its platform along the track; the default sees none. */
  private readonly railAt: (x: number, z: number) => boolean;
  /** Whether a tile carries tram track, so a tram depot runs its lead to it; the default sees none. */
  private readonly tramAt: (x: number, z: number) => boolean;
  private readonly registryIds = new Set(UTILITY_KIT_CATALOG_IDS);
  private readonly kits = new Map<string, KitDefinition>();
  private readonly instances = new Map<number, InstanceRecord>();
  private readonly turbineAnims = new Map<number, TurbineAnim>();
  /** Interments each cemetery holds, by building id: kept for a cemetery whose building arrives after its count. */
  private readonly interments = new Map<number, number>();
  /** Where each placed cemetery stands, so its headstones can be added or taken away without a building delta. */
  private readonly cemeteries = new Map<number, CemeteryPlacement>();
  /** Vehicles each depot has at home, by building id: kept for a depot whose building arrives after its count. */
  private readonly fleets = new Map<number, number>();
  /** Where each placed depot stands, so its parked fleet can be refit without a building delta. */
  private readonly depots = new Map<number, DepotPlacement>();
  /** Catchment load on each park, by building id: kept for a park whose building arrives after its load. */
  private readonly parkLoads = new Map<number, number>();
  /** Parts whose geometry does not depend on the footprint, one pool across every kit that stands them. */
  private readonly sharedPools = new Map<UtilityKitPartKind, InstancedSlotPool>();
  /** Every draped park plate's material: vertex colours carry the lawn, paths, pond and wear. */
  private readonly nightFactorUniform = uniform(0);
  private readonly drapeMaterial = nightBodyMaterial(this.nightFactorUniform, {
    vertexColors: true,
  });
  private readonly beaconMaterial = new THREE.MeshLambertMaterial({
    color: TURBINE_BEACON_COLOR,
    emissive: TURBINE_BEACON_COLOR,
    emissiveIntensity: 0,
  });

  /** The panes of every station, school, library, clinic and depot: dark glass by day, a warm light that follows the night factor. */
  private readonly stationLightMaterial = new THREE.MeshLambertMaterial({
    color: STATION_GLASS_COLOR,
    emissive: STATION_LIGHT_COLOR,
    emissiveIntensity: 0,
  });

  private nightFactorValue = 0;
  private lastTMs = 0;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: BuildingCatalogEntry[],
    waterAt?: (x: number, z: number) => boolean,
    railAt?: (x: number, z: number) => boolean,
    tramAt?: (x: number, z: number) => boolean,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.waterAt = waterAt ?? ((): boolean => false);
    this.railAt = railAt ?? ((): boolean => false);
    this.tramAt = tramAt ?? ((): boolean => false);
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

  /**
   * Sets how many interments each cemetery holds: one headstone per interment,
   * the first graves in fill order, never more than the cemetery has graves.
   * Only a cemetery whose count changed is touched, so calling this on every
   * snapshot costs a map lookup per cemetery.
   */
  setInterments(facilities: readonly { id: number; used: number }[]): void {
    for (const { id, used } of facilities) {
      if (this.interments.get(id) === used) continue;
      this.interments.set(id, used);
      this.fitHeadstones(id);
    }
    for (const kit of this.kits.values()) kit.pools.cemeteryStone?.commit();
  }

  /** How many headstones a cemetery stands now. */
  headstoneCount(buildingId: number): number {
    return this.instances.get(buildingId)?.slots.cemeteryStone?.length ?? 0;
  }

  /**
   * Sets the catchment load on each park: past 1.0 its lawn wears toward
   * scuffed earth, bare at 3. A plaza and a sports ground wear nothing. Only a
   * park whose load changed is touched; a load listed before the park's
   * building arrives is kept and applied when it does.
   */
  setParkLoads(parks: readonly { id: number; load: number }[]): void {
    for (const { id, load } of parks) {
      if (this.parkLoads.get(id) === load) continue;
      this.parkLoads.set(id, load);
      this.wearPark(id);
    }
    this.kits.get('small-park')?.pools.parkGround?.commit();
  }

  /** The per-instance colour one kit part carries now. */
  getPartColor(catalogId: string, kind: UtilityKitPartKind, slot: number, out: THREE.Color): void {
    this.kits.get(catalogId)?.pools[kind]?.getColorAt(slot, out);
  }

  /** The plate a draped park was built as, or null for a flat rung or an unknown id. */
  drapedMesh(buildingId: number): THREE.Mesh | null {
    return this.instances.get(buildingId)?.drape?.mesh ?? null;
  }

  /** The colour a draped park's lawn is now, from its first lawn vertex, or null. */
  drapedLawnColor(buildingId: number): RGB | null {
    const drape = this.instances.get(buildingId)?.drape;
    if (!drape) return null;
    const color = drape.mesh.geometry.getAttribute('color');
    return [color.getX(0), color.getY(0), color.getZ(0)];
  }

  /** How many draped park plates stand now. */
  drapedMeshCount(): number {
    let count = 0;
    for (const record of this.instances.values()) if (record.drape) count++;
    return count;
  }

  /** The part kinds one kit pools, in declaration order. */
  poolKinds(catalogId: string): UtilityKitPartKind[] {
    const kit = this.kits.get(catalogId);
    return kit ? (Object.keys(kit.pools) as UtilityKitPartKind[]) : [];
  }

  /**
   * Sets what each connected depot holds and has out on the lines: the rest
   * is parked on its apron, the first berths in fill order. Only a depot
   * whose count changed is touched; a depot the list leaves out parks its
   * whole catalog fleet, so an older worker's depots stand full.
   */
  setDepotFleets(depots: readonly { id: number; holds: number; inService: number }[]): void {
    const listed = new Set<number>();
    for (const { id, holds, inService } of depots) {
      listed.add(id);
      const home = Math.max(0, holds - inService);
      if (this.fleets.get(id) === home) continue;
      this.fleets.set(id, home);
      this.fitFleet(id);
    }
    for (const [id, placement] of this.depots) {
      if (listed.has(id) || this.fleets.get(id) === placement.fleet) continue;
      this.fleets.set(id, placement.fleet);
      this.fitFleet(id);
    }
    for (const kit of this.kits.values()) {
      kit.pools.busBaseBus?.commit();
      kit.pools.tramDepotCar?.commit();
      kit.pools.railYardCar?.commit();
    }
  }

  /** How many vehicles (buses, or tram and train sets) each depot has parked now, by building id. */
  parkedFleets(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [id, placement] of this.depots) {
      const cars = placement.berths[0]?.length ?? 1;
      out[id] = (this.instances.get(id)?.slots[placement.kind]?.length ?? 0) / cars;
    }
    return out;
  }

  /** 0 (day) .. 1 (night): the turbine beacon and the lit panes of the stations, schools and library react; every other kit stays unlit. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorValue = Math.min(1, Math.max(0, nightFactor));
    this.nightFactorUniform.value = this.nightFactorValue;
    this.beaconMaterial.emissiveIntensity = this.nightFactorValue;
    this.stationLightMaterial.emissiveIntensity = this.nightFactorValue;
  }

  /** How brightly the stations' panes glow now. */
  stationLightIntensity(): number {
    return this.stationLightMaterial.emissiveIntensity;
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
  /** A part's material, plate or body: its vertex and instance colours, shaded toward the one night tint. */
  private bodyMaterial(): THREE.Material {
    return nightBodyMaterial(this.nightFactorUniform, { vertexColors: true });
  }

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
      case 'hospital':
        return this.buildHospitalKit(entry);
      case 'cemetery':
        return this.buildCemeteryKit(entry);
      case 'crematorium':
        return this.buildCrematoriumKit(entry);
      case 'fire-station':
      case 'fire-station-district':
      case 'police-station':
      case 'police-station-district':
        return this.buildStationKit(entry);
      case 'school':
      case 'middle-school':
      case 'high-school':
      case 'college':
      case 'library':
        return this.buildEducationKit(entry);
      case 'solar-farm':
      case 'gas-turbine':
      case 'combined-cycle':
      case 'nuclear-plant':
        return this.buildGeneratorKit(entry);
      case 'small-park':
        return this.buildSmallParkKit(entry);
      case 'civic-plaza':
        return this.buildPlazaKit(entry);
      case 'neighbourhood-park':
        return this.buildNeighbourhoodParkKit(entry);
      case 'district-park':
        return this.buildDistrictParkKit(entry);
      case 'sports-ground':
        return this.buildSportsGroundKit(entry);
      case 'clinic':
        return this.buildClinicKit(entry);
      case 'rail-station':
        return this.buildDepotKit(entry);
      case 'bus-depot':
      case 'bus-garage':
        return this.buildBusBaseKit(entry);
      case 'tram-depot':
        return this.buildYardKit(entry, 'tram');
      case 'rail-yard':
        return this.buildYardKit(entry, 'rail');
      default:
        // Unreachable: the constructor only calls buildKit() for ids already
        // filtered through this.registryIds, which is exactly this switch's
        // case list.
        throw new RangeError(`utilitykits: unknown registry id "${entry.id}"`);
    }
  }

  /** The two bus sizes share one recipe, the stall rows, bays, islands and office keyed off the footprint. */
  private buildBusBaseKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material = lambert(),
      capacity = INITIAL_KIT_CAPACITY,
    ) => new InstancedSlotPool(this.scene, geometry, material, capacity);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        busBaseYard: pool(buildBusBaseYardGeometry(footprint)),
        busBaseShop: pool(buildBusBaseShopGeometry(footprint)),
        busBaseLit: pool(buildBusBaseLitGeometry(footprint), this.stationLightMaterial),
        busBaseBus: pool(
          buildParkedBusGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY * computeBusBaseLayout(footprint).stalls.length,
        ),
      },
    };
  }

  /** A yard's track and grounds come in the two frames its lot can take, the lead off the long edge or off the end; the rest is one geometry. */
  private buildYardKit(entry: BuildingCatalogEntry, mode: 'tram' | 'rail'): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material = lambert(),
      capacity = INITIAL_KIT_CAPACITY,
    ) => new InstancedSlotPool(this.scene, geometry, material, capacity);
    const spec = mode === 'tram' ? TRAM_DEPOT_SPEC : RAIL_YARD_SPEC;
    const footprint = yardFootprint(entry);
    const side = computeYardLayout(footprint, spec, false, YARD_CARS[mode]);
    const end = computeYardLayout(footprint, spec, true, YARD_CARS[mode]);
    const cars = YARD_CARS[mode];
    const carPool = pool(
      mode === 'tram' ? buildTramCarGeometry() : buildTrainCarGeometry(),
      lambert(),
      INITIAL_KIT_CAPACITY * spec.roads * cars.perSet,
    );
    const pools: KitDefinition['pools'] =
      mode === 'tram'
        ? {
            tramDepotYard: pool(buildYardYardGeometry(footprint, side, spec)),
            tramDepotYardEnd: pool(buildYardYardGeometry(footprint, end, spec)),
            tramDepotTrack: pool(buildYardTrackGeometry(side, spec)),
            tramDepotTrackEnd: pool(buildYardTrackGeometry(end, spec)),
            tramDepotPoles: pool(buildYardPolesGeometry(side)),
            tramDepotShop: pool(buildYardShopGeometry(side, entry.height)),
            tramDepotLit: pool(buildYardLitGeometry(side), this.stationLightMaterial),
            tramDepotCar: carPool,
          }
        : {
            railYardYard: pool(buildYardYardGeometry(footprint, side, spec)),
            railYardYardEnd: pool(buildYardYardGeometry(footprint, end, spec)),
            railYardTrack: pool(buildYardTrackGeometry(side, spec)),
            railYardTrackEnd: pool(buildYardTrackGeometry(end, spec)),
            railYardShop: pool(buildYardShopGeometry(side, entry.height)),
            railYardLit: pool(buildYardLitGeometry(side), this.stationLightMaterial),
            railYardCar: carPool,
          };
    return { entry, pavesLot: true, pools };
  }

  private buildClinicKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material = lambert(),
      capacity = INITIAL_KIT_CAPACITY,
    ) => new InstancedSlotPool(this.scene, geometry, material, capacity);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        clinicGrounds: pool(buildClinicGroundsGeometry(footprint)),
        clinicBuilding: pool(buildClinicBuildingGeometry(footprint)),
        clinicLit: pool(buildClinicLitGeometry(footprint), this.stationLightMaterial),
        clinicCar: pool(
          buildParkedCarGeometry(),
          lambert(),
          INITIAL_KIT_CAPACITY * computeClinicLayout(footprint).stalls.length,
        ),
      },
    };
  }

  /** The station's grounds and canopy come in the two track frames its lot can take; the depot and its panes are one geometry in the depot frame. */
  private buildDepotKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material = lambert(),
      capacity = INITIAL_KIT_CAPACITY,
    ) => new InstancedSlotPool(this.scene, geometry, material, capacity);
    const frames = depotFrames(entry);
    return {
      entry,
      pavesLot: true,
      pools: {
        depotGrounds: pool(buildDepotGroundsGeometry(frames.short)),
        depotGroundsLong: pool(buildDepotGroundsGeometry(frames.long)),
        depotCanopy: pool(buildDepotCanopyGeometry(frames.short)),
        depotCanopyLong: pool(buildDepotCanopyGeometry(frames.long)),
        depotBuilding: pool(buildDepotBuildingGeometry()),
        depotLit: pool(buildDepotLitGeometry(), this.stationLightMaterial),
        depotCar: pool(buildParkedCarGeometry(), lambert(), INITIAL_KIT_CAPACITY * DEPOT_STALLS),
      },
    };
  }

  private buildTurbineKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
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
    const lambert = (): THREE.Material => this.bodyMaterial();
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
    const pool = (geometry: THREE.BufferGeometry) =>
      new InstancedSlotPool(this.scene, geometry, this.bodyMaterial(), INITIAL_KIT_CAPACITY);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        pumpGrounds: pool(buildPumpGroundsGeometry(footprint)),
        pumpStation: pool(buildPumpStationGeometry(footprint)),
        pumpIntake: pool(buildPumpIntakeGeometry(footprint)),
      },
    };
  }

  private buildDrainKit(entry: BuildingCatalogEntry): KitDefinition {
    const pool = (geometry: THREE.BufferGeometry) =>
      new InstancedSlotPool(this.scene, geometry, this.bodyMaterial(), INITIAL_KIT_CAPACITY);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        drainGrounds: pool(buildGeneratorGroundsGeometry(footprint, GEN_SCRUB_RGB, [])),
        drainHeadwall: pool(buildDrainHeadwallGeometry(footprint)),
        drainOutfall: pool(buildDrainOutfallGeometry(footprint)),
      },
    };
  }

  private buildWorksKit(entry: BuildingCatalogEntry): KitDefinition {
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, this.bodyMaterial(), capacity);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        worksGrounds: pool(buildWorksGroundsGeometry(footprint)),
        worksPlant: pool(buildWorksPlantGeometry(footprint)),
        worksClarifier: pool(
          buildWorksClarifierGeometry(),
          INITIAL_KIT_CAPACITY * WORKS_CLARIFIER_COUNT,
        ),
        worksOutfall: pool(buildWorksOutfallGeometry(footprint)),
      },
    };
  }

  private buildCoalPlantKit(entry: BuildingCatalogEntry): KitDefinition {
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, this.bodyMaterial(), capacity);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        coalGrounds: pool(buildCoalGroundsGeometry(footprint)),
        coalPlant: pool(buildCoalPlantGeometry(footprint)),
        coalSmokestack: pool(
          buildCoalSmokestackGeometry(),
          INITIAL_KIT_CAPACITY * COAL_SMOKESTACK_COUNT,
        ),
        coalHeap: pool(buildCoalHeapGeometry(footprint)),
      },
    };
  }

  private buildIncineratorKit(entry: BuildingCatalogEntry): KitDefinition {
    const pool = (geometry: THREE.BufferGeometry) =>
      new InstancedSlotPool(this.scene, geometry, this.bodyMaterial(), INITIAL_KIT_CAPACITY);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        incineratorGrounds: pool(buildIncineratorGroundsGeometry(footprint)),
        incineratorPlant: pool(buildIncineratorPlantGeometry(footprint)),
        incineratorStack: pool(buildIncineratorStackGeometry()),
      },
    };
  }

  private buildRecyclingDepotKit(entry: BuildingCatalogEntry): KitDefinition {
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, this.bodyMaterial(), capacity);
    const { footprint } = entry;
    return {
      entry,
      pavesLot: true,
      pools: {
        recyclingYard: pool(buildRecyclingYardGeometry(footprint)),
        recyclingDepot: pool(buildRecyclingDepotGeometry(footprint)),
        recyclingRollOff: pool(
          buildRecyclingRollOffGeometry(),
          INITIAL_KIT_CAPACITY * RECYCLING_ROLL_OFF_COUNT,
        ),
        recyclingTruck: pool(
          buildParkedTruckGeometry(VehicleKind.Recycling),
          INITIAL_KIT_CAPACITY * RECYCLING_TRUCK_COUNT,
        ),
      },
    };
  }

  private buildMrfKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
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
        mrfScale: pool(buildMrfScaleGeometry(entry.footprint)),
        mrfTruck: pool(
          buildParkedTruckGeometry(VehicleKind.Recycling),
          INITIAL_KIT_CAPACITY * MRF_TRUCK_COUNT,
        ),
      },
    };
  }

  private buildTransferKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
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

  private buildHospitalKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, lambert(), capacity);
    return {
      entry,
      pavesLot: true,
      pools: {
        hospitalYard: pool(buildRecyclingYardGeometry(entry.footprint)),
        hospitalBlock: pool(buildHospitalBlockGeometry(entry.footprint)),
        hospitalDeck: pool(buildHospitalDeckGeometry(entry.footprint)),
        hospitalPaint: pool(buildHospitalPaintGeometry(entry.footprint)),
        hospitalCar: pool(
          buildParkedCarGeometry(),
          INITIAL_KIT_CAPACITY * hospitalDeckSpaces(entry.footprint),
        ),
        hospitalAmbulance: pool(buildParkedTruckGeometry(VehicleKind.Ambulance)),
      },
    };
  }

  private buildCemeteryKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, lambert(), capacity);
    const plots = cemeteryPlots(entry);
    return {
      entry,
      pavesLot: true,
      pools: {
        cemeteryGrounds: pool(buildCemeteryGroundsGeometry(entry.footprint, plots)),
        cemeteryGatehouse: pool(buildCemeteryGatehouseGeometry(entry.footprint, plots)),
        cemeteryFence: pool(buildCemeteryFenceGeometry(entry.footprint, plots)),
        cemeteryTree: pool(buildParkTreeGeometry(), INITIAL_MULTI_PART_CAPACITY),
        cemeteryStone: pool(buildHeadstoneGeometry(), plots),
      },
    };
  }

  private buildCrematoriumKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (geometry: THREE.BufferGeometry) =>
      new InstancedSlotPool(this.scene, geometry, lambert(), INITIAL_KIT_CAPACITY);
    return {
      entry,
      pavesLot: true,
      pools: {
        crematoriumGrounds: pool(buildCrematoriumGroundsGeometry(entry.footprint)),
        crematoriumBuilding: pool(buildCrematoriumBuildingGeometry(entry.footprint)),
        crematoriumFlue: pool(buildCrematoriumFlueGeometry()),
      },
    };
  }

  private buildStationKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material = lambert(),
      capacity = INITIAL_KIT_CAPACITY,
    ) => new InstancedSlotPool(this.scene, geometry, material, capacity);
    const layout = computeStationLayout(entry);
    const apparatusKind = layout.service === 'fire' ? VehicleKind.Fire : VehicleKind.Police;
    const pools: KitDefinition['pools'] = {
      stationYard: pool(buildStationYardGeometry(entry)),
      stationBuilding: pool(buildStationBuildingGeometry(entry)),
      stationLit: pool(buildStationLitGeometry(entry), this.stationLightMaterial),
      stationApparatus: pool(
        buildParkedTruckGeometry(apparatusKind),
        lambert(),
        INITIAL_KIT_CAPACITY * layout.apparatus.length,
      ),
      stationCar: pool(
        buildParkedCarGeometry(),
        lambert(),
        INITIAL_KIT_CAPACITY * layout.stalls.length,
      ),
    };
    if (stationHasMast(entry)) pools.stationMast = pool(buildStationMastGeometry(entry));
    return { entry, pavesLot: true, pools };
  }

  private buildEducationKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material = lambert(),
      capacity = INITIAL_KIT_CAPACITY,
    ) => new InstancedSlotPool(this.scene, geometry, material, capacity);
    const layout = computeEducationLayout(entry);
    const pools: KitDefinition['pools'] = {
      schoolGrounds: pool(buildEducationGroundsGeometry(entry)),
      schoolBuilding: pool(buildEducationBuildingGeometry(entry)),
      schoolProps: pool(buildEducationPropsGeometry(entry)),
      schoolLit: pool(buildEducationLitGeometry(entry), this.stationLightMaterial),
    };
    if (layout.stalls.length > 0) {
      pools.schoolCar = pool(
        buildParkedCarGeometry(),
        lambert(),
        INITIAL_KIT_CAPACITY * layout.stalls.length,
      );
    }
    if (layout.bus) pools.schoolBus = pool(buildSchoolBusGeometry());
    if (layout.trees.length > 0) {
      pools.schoolTree = pool(
        buildParkTreeGeometry(),
        lambert(),
        INITIAL_KIT_CAPACITY * layout.trees.length,
      );
    }
    return { entry, pavesLot: true, pools };
  }

  private buildGeneratorKit(entry: BuildingCatalogEntry): KitDefinition {
    const lambert = (): THREE.Material => this.bodyMaterial();
    const pool = (geometry: THREE.BufferGeometry, capacity = INITIAL_KIT_CAPACITY) =>
      new InstancedSlotPool(this.scene, geometry, lambert(), capacity);
    const { footprint } = entry;
    const pools: KitDefinition['pools'] = {};
    switch (entry.id) {
      case 'solar-farm':
        pools.solarGrounds = pool(buildSolarGroundsGeometry(footprint));
        pools.solarSite = pool(buildSolarSiteGeometry(footprint));
        pools.solarRow = pool(
          buildSolarRowGeometry(SOLAR_ROW_LENGTH_M),
          INITIAL_KIT_CAPACITY * computeSolarLayout(footprint, 0).rows.length,
        );
        break;
      case 'gas-turbine':
        pools.gasGrounds = pool(buildGasTurbineGroundsGeometry(footprint));
        pools.gasPlant = pool(buildGasTurbinePlantGeometry(footprint));
        pools.gasStack = pool(buildGasTurbineStackGeometry(footprint));
        break;
      case 'combined-cycle':
        pools.combinedGrounds = pool(buildCombinedCycleGroundsGeometry(footprint));
        pools.combinedPlant = pool(buildCombinedCyclePlantGeometry(footprint));
        pools.combinedStack = pool(buildCombinedCycleStackGeometry(footprint));
        break;
      default:
        pools.nuclearGrounds = pool(buildNuclearGroundsGeometry(footprint));
        pools.nuclearPlant = pool(buildNuclearPlantGeometry(footprint));
        pools.nuclearIntake = pool(buildNuclearIntakeGeometry());
    }
    return { entry, pavesLot: true, pools };
  }

  /** One pool per footprint-independent part kind, built on first use and shared by every kit that stands it. */
  private sharedPool(
    kind: UtilityKitPartKind,
    build: () => THREE.BufferGeometry,
    capacity: number,
  ): InstancedSlotPool {
    let pool = this.sharedPools.get(kind);
    if (!pool) {
      pool = new InstancedSlotPool(this.scene, build(), this.bodyMaterial(), capacity);
      this.sharedPools.set(kind, pool);
    }
    return pool;
  }

  /** The tree and bench pools every park rung shares. */
  private parkProps(): Pick<KitDefinition['pools'], 'parkTree' | 'parkBench'> {
    return {
      parkTree: this.sharedPool('parkTree', buildParkTreeGeometry, INITIAL_MULTI_PART_CAPACITY),
      parkBench: this.sharedPool('parkBench', buildParkBenchGeometry, INITIAL_MULTI_PART_CAPACITY),
    };
  }

  private buildSmallParkKit(entry: BuildingCatalogEntry): KitDefinition {
    return {
      entry,
      pools: {
        parkGround: new InstancedSlotPool(
          this.scene,
          buildParkGroundGeometry(entry.footprint),
          this.bodyMaterial(),
          INITIAL_KIT_CAPACITY,
        ),
        ...this.parkProps(),
      },
    };
  }

  private buildPlazaKit(entry: BuildingCatalogEntry): KitDefinition {
    return {
      entry,
      pavesLot: true,
      pools: {
        plazaGround: new InstancedSlotPool(
          this.scene,
          buildPlazaGroundGeometry(entry.footprint),
          this.bodyMaterial(),
          INITIAL_KIT_CAPACITY,
        ),
        ...this.parkProps(),
      },
    };
  }

  private buildNeighbourhoodParkKit(entry: BuildingCatalogEntry): KitDefinition {
    return {
      entry,
      pools: {
        ...this.parkProps(),
        playFrame: this.sharedPool('playFrame', buildPlayFrameGeometry, INITIAL_KIT_CAPACITY),
      },
    };
  }

  private buildDistrictParkKit(entry: BuildingCatalogEntry): KitDefinition {
    return {
      entry,
      pools: {
        ...this.parkProps(),
        pavilionBlock: this.sharedPool(
          'pavilionBlock',
          buildPavilionBlockGeometry,
          INITIAL_KIT_CAPACITY,
        ),
      },
    };
  }

  private buildSportsGroundKit(entry: BuildingCatalogEntry): KitDefinition {
    return {
      entry,
      pavesLot: true,
      pools: {
        sportsGround: new InstancedSlotPool(
          this.scene,
          buildSportsGroundGeometry(entry.footprint),
          this.bodyMaterial(),
          INITIAL_KIT_CAPACITY,
        ),
        ...this.parkProps(),
        pitchGoal: this.sharedPool('pitchGoal', buildPitchGoalGeometry, INITIAL_KIT_CAPACITY),
        pavilionBlock: this.sharedPool(
          'pavilionBlock',
          buildPavilionBlockGeometry,
          INITIAL_KIT_CAPACITY,
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
    scale: THREE.Vector3 = _unitScale,
  ): number {
    const slot = pool.allocate();
    _position.set(x, y, z);
    _quaternion.setFromAxisAngle(_yAxis, rotation * (Math.PI / 2));
    _matrix.compose(_position, _quaternion, scale);
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
      case 'water-drain':
      case 'sewage-works':
        this.applyShoreKit(kit, building, entry, centerX, groundY, centerZ);
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
      case 'hospital':
        this.applyHospital(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'cemetery':
        this.applyCemetery(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'crematorium':
        this.applyCrematorium(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'fire-station':
      case 'fire-station-district':
      case 'police-station':
      case 'police-station-district':
        this.applyStation(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'school':
      case 'middle-school':
      case 'high-school':
      case 'college':
      case 'library':
        this.applyEducation(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'solar-farm':
      case 'gas-turbine':
      case 'combined-cycle':
      case 'nuclear-plant':
        this.applyGenerator(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'small-park':
        this.applySmallPark(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'civic-plaza':
        this.applyPlaza(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'neighbourhood-park':
        this.applyNeighbourhoodPark(kit, building, entry, centerX, centerZ, rotation);
        return;
      case 'district-park':
        this.applyDistrictPark(kit, building, entry, centerX, centerZ, rotation);
        return;
      case 'sports-ground':
        this.applySportsGround(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'clinic':
        this.applyClinic(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'rail-station':
        this.applyDepot(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'bus-depot':
      case 'bus-garage':
        this.applyBusBase(kit, building, entry, centerX, groundY, centerZ, rotation);
        return;
      case 'tram-depot':
        this.applyYard(kit, building, entry, 'tram', centerX, groundY, centerZ, rotation);
        return;
      case 'rail-yard':
        this.applyYard(kit, building, entry, 'rail', centerX, groundY, centerZ, rotation);
        return;
      default:
        // Unreachable: kit is only non-null for entry.ids covered above (see buildKit's switch).
        throw new RangeError(`utilitykits: unknown registry id "${entry.id}"`);
    }
  }

  private applyBusBase(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { busBaseYard, busBaseShop, busBaseLit, busBaseBus } = kit.pools;
    if (!busBaseYard || !busBaseShop || !busBaseLit || !busBaseBus) return;
    const layout = computeBusBaseLayout(entry.footprint);
    const yardTop = groundY + RECYCLING_YARD_HEIGHT;
    this.depots.set(building.id, {
      centerX,
      floorY: yardTop + EDU_ASPHALT_M,
      centerZ,
      turn: rotation,
      kind: 'busBaseBus',
      berths: layout.stalls.map((s) => [{ x: s.x, z: s.z, turn: s.turn }]),
      fleet: entry.depot?.fleet ?? layout.stalls.length,
      liveryHex: BUS_LIVERY_HEX,
    });
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        busBaseYard: [this.placeAt(busBaseYard, centerX, groundY, centerZ, rotation)],
        busBaseShop: [this.placeAt(busBaseShop, centerX, yardTop, centerZ, rotation)],
        busBaseLit: [this.placeAt(busBaseLit, centerX, yardTop, centerZ, rotation)],
        busBaseBus: [],
      },
    });
    this.fitFleet(building.id);
  }

  /**
   * A yard is laid out in its frame: the track and grounds of whichever frame
   * the lot takes, turned so the lead meets the edge the track runs by — never
   * the rotation the player placed it at. With no track beside it the lead
   * takes the back of the lot as placed.
   */
  private applyYard(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    mode: 'tram' | 'rail',
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const lot = footprintForRotation(entry, rotation);
    const trackAt = mode === 'tram' ? this.tramAt : this.railAt;
    const facing =
      railSideOf(building.x, building.z, lot, trackAt) ?? (((rotation + 2) % 4) as 0 | 1 | 2 | 3);
    const frame = yardFrame(entry, rotation, facing);
    const spec = mode === 'tram' ? TRAM_DEPOT_SPEC : RAIL_YARD_SPEC;
    const layout = computeYardLayout(frame.footprint, spec, frame.fromEnd, YARD_CARS[mode]);
    const prefix = mode === 'tram' ? 'tramDepot' : 'railYard';
    const yardKind = `${prefix}Yard${frame.fromEnd ? 'End' : ''}` as UtilityKitPartKind;
    const trackKind = `${prefix}Track${frame.fromEnd ? 'End' : ''}` as UtilityKitPartKind;
    const shopKind = `${prefix}Shop` as UtilityKitPartKind;
    const litKind = `${prefix}Lit` as UtilityKitPartKind;
    const carKind = mode === 'tram' ? 'tramDepotCar' : 'railYardCar';
    const yard = kit.pools[yardKind];
    const track = kit.pools[trackKind];
    const shop = kit.pools[shopKind];
    const lit = kit.pools[litKind];
    const poles = kit.pools.tramDepotPoles;
    if (!yard || !track || !shop || !lit || !kit.pools[carKind]) return;
    const { turn } = frame;
    const yardTop = groundY + RECYCLING_YARD_HEIGHT;
    const railTop =
      yardTop +
      (spec.ballast ? YARD_BALLAST.h + YARD_SLEEPER.h : EDU_ASPHALT_M + 0.01) +
      YARD_RAIL.h;
    this.depots.set(building.id, {
      centerX,
      floorY: railTop,
      centerZ,
      turn,
      kind: carKind,
      berths: layout.sets,
      fleet: entry.depot?.fleet ?? layout.sets.length,
      liveryHex: mode === 'tram' ? TRAM_LIVERY_HEX : TRAIN_LIVERY_HEX,
    });
    const slots: Partial<Record<UtilityKitPartKind, number[]>> = {
      [yardKind]: [this.placeAt(yard, centerX, groundY, centerZ, turn)],
      [trackKind]: [this.placeAt(track, centerX, groundY, centerZ, turn)],
      [shopKind]: [this.placeAt(shop, centerX, yardTop, centerZ, turn)],
      [litKind]: [this.placeAt(lit, centerX, yardTop, centerZ, turn)],
      [carKind]: [],
    };
    if (poles && mode === 'tram') {
      slots.tramDepotPoles = [this.placeAt(poles, centerX, yardTop, centerZ, turn)];
    }
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
    this.fitFleet(building.id);
  }

  /**
   * Parks exactly as many vehicles as the depot has at home, the first berths
   * in fill order: adds at the tail or takes the tail away, so a vehicle
   * already standing is never rewritten.
   */
  private fitFleet(buildingId: number): void {
    const record = this.instances.get(buildingId);
    const placement = this.depots.get(buildingId);
    const pool = record
      ? this.kits.get(record.catalogId)?.pools[placement?.kind ?? 'busBaseBus']
      : undefined;
    const slots = placement ? record?.slots[placement.kind] : undefined;
    if (!record || !placement || !pool || !slots) return;

    const cars = placement.berths[0]?.length ?? 0;
    const home = Math.min(this.fleets.get(buildingId) ?? placement.fleet, placement.berths.length);
    const want = home * cars;
    while (slots.length > want) pool.free(slots.pop()!);
    while (slots.length < want) {
      const i = slots.length;
      const car = placement.berths[Math.floor(i / cars)]![i % cars]!;
      const rotated = rotateLocalXZ(car.x, car.z, placement.turn);
      const slot = this.placeAt(
        pool,
        placement.centerX + rotated.x,
        placement.floorY,
        placement.centerZ + rotated.z,
        ((placement.turn + car.turn) % 4) as 0 | 1 | 2 | 3,
      );
      _carColor.setHex(placement.liveryHex);
      pool.setColorAt(slot, _carColor);
      slots.push(slot);
    }
  }

  private applyClinic(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { clinicGrounds, clinicBuilding, clinicLit, clinicCar } = kit.pools;
    if (!clinicGrounds || !clinicBuilding || !clinicLit || !clinicCar) return;
    const layout = computeClinicLayout(entry.footprint);
    const paved = groundY + RECYCLING_YARD_HEIGHT + EDU_ASPHALT_M;
    const cars: number[] = [];
    layout.stalls.forEach((stall, i) => {
      if (!deckStallTaken(building.id, i)) return;
      const turned = rotateLocalXZ(stall.x, stall.z, rotation);
      const slot = this.placeAt(
        clinicCar,
        centerX + turned.x,
        paved,
        centerZ + turned.z,
        ((rotation + stall.turn) % 4) as 0 | 1 | 2 | 3,
      );
      _carColor.setHex(
        VEHICLE_PALETTE_HEX[Math.floor(hash1(building.id * 31 + i) * VEHICLE_PALETTE_HEX.length)]!,
      );
      clinicCar.setColorAt(slot, _carColor);
      cars.push(slot);
    });
    const whole = (pool: InstancedSlotPool): number[] => [
      this.placeAt(pool, centerX, groundY, centerZ, rotation),
    ];
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        clinicGrounds: whole(clinicGrounds),
        clinicBuilding: whole(clinicBuilding),
        clinicLit: whole(clinicLit),
        clinicCar: cars,
      },
    });
  }

  /**
   * The station is laid out in its track frame: the grounds and canopy of
   * whichever frame the lot takes, turned so the platform lies along the edge
   * the rail runs by — never the rotation the player placed it at, since a
   * platform away from the track serves nothing. With no rail beside it the
   * platform takes the back of the lot as placed.
   */
  private applyDepot(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { depotBuilding, depotLit, depotCar } = kit.pools;
    if (!depotBuilding || !depotLit || !depotCar) return;
    const lot = footprintForRotation(entry, rotation);
    const facing =
      railSideOf(building.x, building.z, lot, this.railAt) ??
      (((rotation + 2) % 4) as 0 | 1 | 2 | 3);
    const frame = depotFrame(entry, rotation, facing);
    const grounds = frame.long ? kit.pools.depotGroundsLong : kit.pools.depotGrounds;
    const canopy = frame.long ? kit.pools.depotCanopyLong : kit.pools.depotCanopy;
    if (!grounds || !canopy) return;
    const layout = computeDepotLayout(frame.footprint);
    const { turn } = frame;
    const placeLocal = (
      pool: InstancedSlotPool,
      local: Vec2,
      y: number,
      at: 0 | 1 | 2 | 3,
    ): number => {
      const turned = rotateLocalXZ(local.x, local.z, turn);
      return this.placeAt(pool, centerX + turned.x, y, centerZ + turned.z, at);
    };
    const floor = groundY + RECYCLING_YARD_HEIGHT + DEPOT_PLATFORM.h;
    const paved = groundY + RECYCLING_YARD_HEIGHT + EDU_ASPHALT_M;
    const depotAt = rectCentre(layout.depot);
    const cars: number[] = [];
    layout.stalls.forEach((stall, i) => {
      if (!deckStallTaken(building.id, i)) return;
      const slot = placeLocal(depotCar, stall, paved, ((turn + stall.turn) % 4) as 0 | 1 | 2 | 3);
      _carColor.setHex(
        VEHICLE_PALETTE_HEX[Math.floor(hash1(building.id * 31 + i) * VEHICLE_PALETTE_HEX.length)]!,
      );
      depotCar.setColorAt(slot, _carColor);
      cars.push(slot);
    });
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        [frame.long ? 'depotGroundsLong' : 'depotGrounds']: [
          this.placeAt(grounds, centerX, groundY, centerZ, turn),
        ],
        [frame.long ? 'depotCanopyLong' : 'depotCanopy']: [
          this.placeAt(canopy, centerX, groundY, centerZ, turn),
        ],
        depotBuilding: [placeLocal(depotBuilding, depotAt, floor, turn)],
        depotLit: [placeLocal(depotLit, depotAt, floor, turn)],
        depotCar: cars,
      },
    });
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
   * A shore kit's parts, every one turned so the kit's local +Z faces the
   * water beside the footprint — never the rotation the player placed it at,
   * since an intake pointing inland would draw from nothing. The grounds
   * stand on the ground, everything else on the plate's top, and the works'
   * clarifiers at their own places in the turned frame.
   */
  private applyShoreKit(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
  ): void {
    const lot = footprintForRotation(entry, building.rotation);
    const facing = waterSideOf(building.x, building.z, lot, this.waterAt);
    const plateY = groundY + GEN_PLATE_M;
    const slots: Partial<Record<UtilityKitPartKind, number[]>> = {};
    for (const [kind, pool] of Object.entries(kit.pools) as [
      UtilityKitPartKind,
      InstancedSlotPool,
    ][]) {
      if (kind === 'worksClarifier') continue;
      const y = kind.endsWith('Grounds') ? groundY : plateY;
      slots[kind] = [this.placeAt(pool, centerX, y, centerZ, facing)];
    }
    const clarifierPool = kit.pools.worksClarifier;
    if (clarifierPool) {
      slots.worksClarifier = computeWorksLayout(entry.footprint).clarifiers.map((local) => {
        const turned = rotateLocalXZ(local.x, local.z, facing);
        return this.placeAt(clarifierPool, centerX + turned.x, plateY, centerZ + turned.z, facing);
      });
    }
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
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
    const { coalGrounds, coalPlant, coalSmokestack, coalHeap } = kit.pools;
    if (!coalGrounds || !coalPlant || !coalSmokestack || !coalHeap) return;
    const plateY = groundY + GEN_PLATE_M;
    const slots = {
      coalGrounds: [this.placeAt(coalGrounds, centerX, groundY, centerZ, rotation)],
      coalPlant: [this.placeAt(coalPlant, centerX, plateY, centerZ, rotation)],
      coalHeap: [this.placeAt(coalHeap, centerX, plateY, centerZ, rotation)],
      coalSmokestack: computeCoalSmokestackLocalPlacements(entry.footprint).map((local) => {
        const turned = rotateLocalXZ(local.x, local.z, rotation);
        return this.placeAt(
          coalSmokestack,
          centerX + turned.x,
          plateY,
          centerZ + turned.z,
          rotation,
        );
      }),
    };
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
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
    const { incineratorGrounds, incineratorPlant, incineratorStack } = kit.pools;
    if (!incineratorGrounds || !incineratorPlant || !incineratorStack) return;
    const plateY = groundY + GEN_PLATE_M;
    const stack = computeIncineratorStackLocalPlacement(entry.footprint);
    const turned = rotateLocalXZ(stack.x, stack.z, rotation);
    const slots = {
      incineratorGrounds: [this.placeAt(incineratorGrounds, centerX, groundY, centerZ, rotation)],
      incineratorPlant: [this.placeAt(incineratorPlant, centerX, plateY, centerZ, rotation)],
      incineratorStack: [
        this.placeAt(incineratorStack, centerX + turned.x, plateY, centerZ + turned.z, rotation),
      ],
    };
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
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
    const { recyclingYard, recyclingDepot, recyclingRollOff, recyclingTruck } = kit.pools;
    if (!recyclingYard || !recyclingDepot || !recyclingRollOff || !recyclingTruck) return;
    // Everything but the yard stands on the yard slab, not in it.
    const yardTop = groundY + RECYCLING_YARD_HEIGHT;
    const layout = computeRecyclingDepotLayout(entry.footprint);
    const placeLocal = (pool: InstancedSlotPool, local: Vec2): number => {
      const turned = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(pool, centerX + turned.x, yardTop, centerZ + turned.z, rotation);
    };
    const slots = {
      recyclingYard: [this.placeAt(recyclingYard, centerX, groundY, centerZ, rotation)],
      recyclingDepot: [this.placeAt(recyclingDepot, centerX, yardTop, centerZ, rotation)],
      recyclingRollOff: layout.rollOffs.map((local) => placeLocal(recyclingRollOff, local)),
      recyclingTruck: layout.trucks.map((local) => placeLocal(recyclingTruck, local)),
    };
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
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
    const { mrfYard, mrfHall, mrfBales, mrfOffice, mrfScale, mrfTruck } = kit.pools;
    if (!mrfYard || !mrfHall || !mrfBales || !mrfOffice || !mrfScale || !mrfTruck) return;

    const slots = {
      mrfYard: [this.placeAt(mrfYard, centerX, groundY, centerZ, rotation)],
      mrfHall: [this.placeAt(mrfHall, centerX, groundY, centerZ, rotation)],
      mrfBales: [this.placeAt(mrfBales, centerX, groundY, centerZ, rotation)],
      mrfOffice: [this.placeAt(mrfOffice, centerX, groundY, centerZ, rotation)],
      mrfScale: [this.placeAt(mrfScale, centerX, groundY, centerZ, rotation)],
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

  private applyHospital(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const {
      hospitalYard,
      hospitalBlock,
      hospitalDeck,
      hospitalPaint,
      hospitalCar,
      hospitalAmbulance,
    } = kit.pools;
    if (
      !hospitalYard ||
      !hospitalBlock ||
      !hospitalDeck ||
      !hospitalPaint ||
      !hospitalCar ||
      !hospitalAmbulance
    ) {
      return;
    }

    const layout = computeHospitalLayout(entry.footprint);
    const placeLocal = (
      pool: InstancedSlotPool,
      local: Vec2,
      y: number,
      turn: 0 | 1 | 2 | 3,
    ): number => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(pool, centerX + rotated.x, y, centerZ + rotated.z, turn);
    };
    const floor = groundY + RECYCLING_YARD_HEIGHT;
    const cars: number[] = [];
    layout.stalls.forEach((stall, i) => {
      if (!deckStallTaken(building.id, i)) return;
      const turn = ((rotation + (stall.noseX > 0 ? 1 : 3)) % 4) as 0 | 1 | 2 | 3;
      const slot = placeLocal(hospitalCar, stall, floor + stall.level * DECK_STOREY_M, turn);
      _carColor.setHex(
        VEHICLE_PALETTE_HEX[Math.floor(hash1(building.id * 31 + i) * VEHICLE_PALETTE_HEX.length)]!,
      );
      hospitalCar.setColorAt(slot, _carColor);
      cars.push(slot);
    });
    const slots = {
      hospitalYard: [this.placeAt(hospitalYard, centerX, groundY, centerZ, rotation)],
      hospitalBlock: [this.placeAt(hospitalBlock, centerX, groundY, centerZ, rotation)],
      hospitalDeck: [this.placeAt(hospitalDeck, centerX, groundY, centerZ, rotation)],
      hospitalPaint: [this.placeAt(hospitalPaint, centerX, groundY, centerZ, rotation)],
      hospitalCar: cars,
      hospitalAmbulance: [placeLocal(hospitalAmbulance, layout.ambulance, floor, rotation)],
    };
    this.instances.set(building.id, { catalogId: building.catalogId, slots });
  }

  private applyCrematorium(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { crematoriumGrounds, crematoriumBuilding, crematoriumFlue } = kit.pools;
    if (!crematoriumGrounds || !crematoriumBuilding || !crematoriumFlue) return;

    const flueLocal = computeCrematoriumLayout(entry.footprint).flue;
    const flueRotated = rotateLocalXZ(flueLocal.x, flueLocal.z, rotation);
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        crematoriumGrounds: [this.placeAt(crematoriumGrounds, centerX, groundY, centerZ, rotation)],
        crematoriumBuilding: [
          this.placeAt(crematoriumBuilding, centerX, groundY, centerZ, rotation),
        ],
        crematoriumFlue: [
          this.placeAt(
            crematoriumFlue,
            centerX + flueRotated.x,
            groundY,
            centerZ + flueRotated.z,
            rotation,
          ),
        ],
      },
    });
  }

  private applyStation(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { stationYard, stationBuilding, stationLit, stationMast, stationApparatus, stationCar } =
      kit.pools;
    if (!stationYard || !stationBuilding || !stationLit || !stationApparatus || !stationCar) return;

    const layout = computeStationLayout(entry);
    const floor = groundY + RECYCLING_YARD_HEIGHT;
    const placeLocal = (pool: InstancedSlotPool, local: Vec2, turn: 0 | 1 | 2 | 3): number => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(pool, centerX + rotated.x, floor, centerZ + rotated.z, turn);
    };
    const cars: number[] = [];
    layout.stalls.forEach((stall, i) => {
      if (!deckStallTaken(building.id, i)) return;
      const slot = placeLocal(stationCar, stall, ((rotation + stall.turn) % 4) as 0 | 1 | 2 | 3);
      _carColor.setHex(
        VEHICLE_PALETTE_HEX[Math.floor(hash1(building.id * 31 + i) * VEHICLE_PALETTE_HEX.length)]!,
      );
      stationCar.setColorAt(slot, _carColor);
      cars.push(slot);
    });
    const whole = (pool: InstancedSlotPool): number[] => [
      this.placeAt(pool, centerX, groundY, centerZ, rotation),
    ];
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        stationYard: whole(stationYard),
        stationBuilding: whole(stationBuilding),
        stationLit: whole(stationLit),
        ...(stationMast ? { stationMast: whole(stationMast) } : {}),
        stationApparatus: layout.apparatus.map((spot) =>
          placeLocal(stationApparatus, spot, rotation),
        ),
        stationCar: cars,
      },
    });
  }

  private applyEducation(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const {
      schoolGrounds,
      schoolBuilding,
      schoolProps,
      schoolLit,
      schoolTree,
      schoolCar,
      schoolBus,
    } = kit.pools;
    if (!schoolGrounds || !schoolBuilding || !schoolProps || !schoolLit) return;

    const layout = computeEducationLayout(entry);
    const lawn = groundY + RECYCLING_YARD_HEIGHT;
    const paved = lawn + EDU_ASPHALT_M;
    const placeLocal = (
      pool: InstancedSlotPool,
      local: Vec2,
      y: number,
      turn: 0 | 1 | 2 | 3,
    ): number => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(pool, centerX + rotated.x, y, centerZ + rotated.z, turn);
    };
    const cars: number[] = [];
    if (schoolCar) {
      layout.stalls.forEach((stall, i) => {
        if (!deckStallTaken(building.id, i)) return;
        const slot = placeLocal(
          schoolCar,
          stall,
          paved,
          ((rotation + stall.turn) % 4) as 0 | 1 | 2 | 3,
        );
        _carColor.setHex(
          VEHICLE_PALETTE_HEX[
            Math.floor(hash1(building.id * 31 + i) * VEHICLE_PALETTE_HEX.length)
          ]!,
        );
        schoolCar.setColorAt(slot, _carColor);
        cars.push(slot);
      });
    }
    const whole = (pool: InstancedSlotPool): number[] => [
      this.placeAt(pool, centerX, groundY, centerZ, rotation),
    ];
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        schoolGrounds: whole(schoolGrounds),
        schoolBuilding: whole(schoolBuilding),
        schoolProps: whole(schoolProps),
        schoolLit: whole(schoolLit),
        schoolCar: cars,
        ...(schoolBus && layout.bus
          ? {
              schoolBus: [
                placeLocal(
                  schoolBus,
                  layout.bus,
                  paved,
                  ((rotation + layout.bus.turn) % 4) as 0 | 1 | 2 | 3,
                ),
              ],
            }
          : {}),
        ...(schoolTree
          ? { schoolTree: layout.trees.map((tree) => placeLocal(schoolTree, tree, lawn, rotation)) }
          : {}),
      },
    });
  }

  private applyCemetery(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const { cemeteryGrounds, cemeteryGatehouse, cemeteryFence, cemeteryTree, cemeteryStone } =
      kit.pools;
    if (
      !cemeteryGrounds ||
      !cemeteryGatehouse ||
      !cemeteryFence ||
      !cemeteryTree ||
      !cemeteryStone
    ) {
      return;
    }

    const layout = computeCemeteryLayout(entry.footprint, cemeteryPlots(entry));
    const trees = layout.trees.map((local) => {
      const rotated = rotateLocalXZ(local.x, local.z, rotation);
      return this.placeAt(
        cemeteryTree,
        centerX + rotated.x,
        groundY + CEMETERY_LAWN_HEIGHT,
        centerZ + rotated.z,
        rotation,
      );
    });
    this.cemeteries.set(building.id, {
      centerX,
      floorY: groundY + CEMETERY_LAWN_HEIGHT,
      centerZ,
      rotation,
      graves: layout.graves,
    });
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        cemeteryGrounds: [this.placeAt(cemeteryGrounds, centerX, groundY, centerZ, rotation)],
        cemeteryGatehouse: [this.placeAt(cemeteryGatehouse, centerX, groundY, centerZ, rotation)],
        cemeteryFence: [this.placeAt(cemeteryFence, centerX, groundY, centerZ, rotation)],
        cemeteryTree: trees,
        cemeteryStone: [],
      },
    });
    this.fitHeadstones(building.id);
  }

  /**
   * Stands exactly as many headstones as the cemetery has interments, the
   * first graves in fill order: adds at the tail or takes the tail away, so a
   * stone already standing is never rewritten.
   */
  private fitHeadstones(buildingId: number): void {
    const record = this.instances.get(buildingId);
    const placement = this.cemeteries.get(buildingId);
    const pool = record ? this.kits.get(record.catalogId)?.pools.cemeteryStone : undefined;
    const slots = record?.slots.cemeteryStone;
    if (!record || !placement || !pool || !slots) return;

    const want = Math.min(this.interments.get(buildingId) ?? 0, placement.graves.length);
    while (slots.length > want) pool.free(slots.pop()!);
    while (slots.length < want) {
      const i = slots.length;
      const stone = headstoneAt(placement.graves[i]!);
      const rotated = rotateLocalXZ(stone.x, stone.z, placement.rotation);
      const slot = this.placeAt(
        pool,
        placement.centerX + rotated.x,
        placement.floorY,
        placement.centerZ + rotated.z,
        placement.rotation,
      );
      _carColor.setScalar(0.85 + 0.2 * hash1(buildingId * 8191 + i));
      pool.setColorAt(slot, _carColor);
      slots.push(slot);
    }
  }

  /**
   * A generator's whole-lot parts turn with the lot. A solar farm's rows do not:
   * each stands at a world offset from the lot's centre, turned to the facing.
   * A reactor's intake is turned as a shore building is, onto the edge that
   * touches the water.
   */
  private applyGenerator(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const slots: Partial<Record<UtilityKitPartKind, number[]>> = {};
    const plateY = groundY + GEN_PLATE_M;
    for (const kind of GENERATOR_LOT_PARTS[entry.id] ?? []) {
      const pool = kit.pools[kind];
      if (!pool) return;
      slots[kind] = [
        this.placeAt(pool, centerX, kind.endsWith('Grounds') ? groundY : plateY, centerZ, rotation),
      ];
    }
    const rowPool = kit.pools.solarRow;
    if (rowPool) {
      const layout = computeSolarLayout(entry.footprint, rotation);
      slots.solarRow = layout.rows.map((row) =>
        this.placeAt(rowPool, centerX + row.x, plateY, centerZ + row.z, layout.turn),
      );
    }
    const intakePool = kit.pools.nuclearIntake;
    if (intakePool) {
      const lot = footprintForRotation(entry, rotation);
      const facing = waterSideOf(building.x, building.z, lot, this.waterAt);
      const edge = rotateLocalXZ(0, ((facing % 2 === 0 ? lot.d : lot.w) * TILE_METERS) / 2, facing);
      slots.nuclearIntake = [
        this.placeAt(intakePool, centerX + edge.x, plateY, centerZ + edge.z, facing),
      ];
    }
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
    this.wearPark(building.id);
  }

  /** Local placements carried into the world and stood on `yAt(worldX, worldZ)`, one slot each. */
  private placeParkProps(
    pool: InstancedSlotPool,
    placements: readonly Vec2[],
    centerX: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
    yAt: (x: number, z: number) => number,
    scale: THREE.Vector3 = _unitScale,
  ): number[] {
    return placements.map((local) => {
      const r = rotateLocalXZ(local.x, local.z, rotation);
      const x = centerX + r.x;
      const z = centerZ + r.z;
      return this.placeAt(pool, x, yAt(x, z), z, rotation, scale);
    });
  }

  /** As placeParkProps, each bench turned with the park on top of its own facing. */
  private placeParkBenches(
    pool: InstancedSlotPool,
    benches: readonly BenchPlacement[],
    centerX: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
    yAt: (x: number, z: number) => number,
  ): number[] {
    return benches.map((bench) => {
      const r = rotateLocalXZ(bench.x, bench.z, rotation);
      const x = centerX + r.x;
      const z = centerZ + r.z;
      const turn = ((rotation + bench.rotation) % 4) as 0 | 1 | 2 | 3;
      return this.placeAt(pool, x, yAt(x, z), z, turn);
    });
  }

  /** A pavilion block scaled to its footprint, seated on the highest ground under its corners so its footing, not a gap, meets a slope. */
  private placePavilion(
    pool: InstancedSlotPool,
    block: PlacedBlock,
    centerX: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
    yAt: (x: number, z: number) => number,
  ): number {
    const r = rotateLocalXZ(block.x, block.z, rotation);
    const x = centerX + r.x;
    const z = centerZ + r.z;
    const rect = worldRect(blockRect(block), centerX, centerZ, rotation);
    const y = Math.max(
      yAt(rect.x0, rect.z0),
      yAt(rect.x1, rect.z0),
      yAt(rect.x0, rect.z1),
      yAt(rect.x1, rect.z1),
    );
    return this.placeAt(pool, x, y, z, rotation, _scale.set(block.w, 1, block.d));
  }

  /** One mesh per draped park: the lawn parts first (their vertex range is what wears), then everything laid on it. */
  private addDrape(
    lawnParts: THREE.BufferGeometry[],
    otherParts: THREE.BufferGeometry[],
  ): DrapeRecord {
    let lawnVertices = 0;
    for (const part of lawnParts) lawnVertices += part.getAttribute('position').count;
    const mesh = new THREE.Mesh(mergeParts([...lawnParts, ...otherParts]), this.drapeMaterial);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return { mesh, lawnVertices };
  }

  private applyPlaza(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const groundPool = kit.pools.plazaGround;
    const treePool = kit.pools.parkTree;
    const benchPool = kit.pools.parkBench;
    if (!groundPool || !treePool || !benchPool) return;

    const layout = computePlazaLayout(entry.footprint);
    const planterTop = (): number => groundY + PLAZA_PLANTER.height;
    const flat = (): number => groundY;
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        plazaGround: [this.placeAt(groundPool, centerX, groundY, centerZ, rotation)],
        parkTree: this.placeParkProps(
          treePool,
          layout.planters,
          centerX,
          centerZ,
          rotation,
          planterTop,
        ),
        parkBench: this.placeParkBenches(
          benchPool,
          layout.benches,
          centerX,
          centerZ,
          rotation,
          flat,
        ),
      },
    });
  }

  private applyNeighbourhoodPark(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const treePool = kit.pools.parkTree;
    const benchPool = kit.pools.parkBench;
    const framePool = kit.pools.playFrame;
    if (!treePool || !benchPool || !framePool) return;

    const layout = computeNeighbourhoodParkLayout(entry.footprint);
    const toWorld = (r: Rect): Rect => worldRect(r, centerX, centerZ, rotation);
    const quad = (r: Rect, lift: number, rgb: RGB): THREE.BufferGeometry => {
      const w = toWorld(r);
      return drapedQuad(w.x0, w.z0, w.x1, w.z1, { lift, rgb, heightAt: this.heightAt });
    };
    const lawnOptions: DrapeOptions = {
      lift: PARK_LAWN_HEIGHT,
      rgb: PARK_LAWN_RGB,
      heightAt: this.heightAt,
    };
    const pathLift = PARK_LAWN_HEIGHT + PARK_PATH_Y_OFFSET;
    const playLift = PARK_LAWN_HEIGHT + PARK_MARK_HEIGHT_M;
    const drape = this.addDrape(
      [
        quad(layout.lawn, PARK_LAWN_HEIGHT, PARK_LAWN_RGB),
        ...drapedSkirt(toWorld(layout.lawn), lawnOptions),
      ],
      [
        ...layout.paths.map((p) => quad(p, pathLift, PARK_PATH_RGB)),
        quad(layout.playZone, playLift, PLAY_SURFACE_RGB),
      ],
    );
    const onSurface = (x: number, z: number): number => this.heightAt(x, z) + playLift;
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        parkTree: this.placeParkProps(
          treePool,
          layout.trees,
          centerX,
          centerZ,
          rotation,
          this.heightAt,
        ),
        parkBench: this.placeParkBenches(
          benchPool,
          layout.benches,
          centerX,
          centerZ,
          rotation,
          this.heightAt,
        ),
        playFrame: this.placeParkProps(
          framePool,
          layout.playFrames,
          centerX,
          centerZ,
          rotation,
          onSurface,
        ),
      },
      drape,
    });
    this.wearPark(building.id);
  }

  private applyDistrictPark(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const treePool = kit.pools.parkTree;
    const benchPool = kit.pools.parkBench;
    const pavilionPool = kit.pools.pavilionBlock;
    if (!treePool || !benchPool || !pavilionPool) return;

    const heightAtLocal = (x: number, z: number): number => {
      const r = rotateLocalXZ(x, z, rotation);
      return this.heightAt(centerX + r.x, centerZ + r.z);
    };
    const layout = computeDistrictParkLayout(entry.footprint, heightAtLocal);
    const toWorld = (r: Rect): Rect => worldRect(r, centerX, centerZ, rotation);
    const quad = (r: Rect, lift: number, rgb: RGB): THREE.BufferGeometry => {
      const w = toWorld(r);
      return drapedQuad(w.x0, w.z0, w.x1, w.z1, {
        step: DISTRICT_DRAPE_STEP_M,
        lift,
        rgb,
        heightAt: this.heightAt,
      });
    };
    const lawnOptions: DrapeOptions = {
      step: DISTRICT_DRAPE_STEP_M,
      lift: PARK_LAWN_HEIGHT,
      rgb: PARK_LAWN_RGB,
      heightAt: this.heightAt,
    };
    const pathLift = PARK_LAWN_HEIGHT + PARK_PATH_Y_OFFSET;
    const pond = toWorld(layout.pond);
    const pondSurface = drapedQuad(pond.x0, pond.z0, pond.x1, pond.z1, {
      step: DISTRICT_POND.w,
      lift: 0,
      rgb: SHALLOW_WATER_COLOR,
      heightAt: () => layout.pondY,
    });
    // The banks run from the lawn to the water, which lies below it on the
    // high side and may stand above it on the low side of a slope, so each
    // is drawn facing both ways: the loop as it is and walked the other way.
    const bankOptions: WallOptions = {
      step: DISTRICT_DRAPE_STEP_M,
      rgb: POND_BANK_RGB,
      topAt: (x, z) => this.heightAt(x, z) + PARK_LAWN_HEIGHT,
      bottomAt: () => layout.pondY,
    };
    const banks = rectLoop(pond).flatMap((s) => [
      drapedWall(s, bankOptions),
      drapedWall({ ax: s.bx, az: s.bz, bx: s.ax, bz: s.az }, bankOptions),
    ]);
    const drape = this.addDrape(
      [
        ...layout.lawnPieces.map((r) => quad(r, PARK_LAWN_HEIGHT, PARK_LAWN_RGB)),
        ...drapedSkirt(toWorld(layout.lawn), lawnOptions),
      ],
      [...layout.paths.map((p) => quad(p, pathLift, PARK_PATH_RGB)), pondSurface, ...banks],
    );
    const specimenScale = _scale.setScalar(DISTRICT_SPECIMEN.scale);
    const specimens = this.placeParkProps(
      treePool,
      layout.specimens,
      centerX,
      centerZ,
      rotation,
      this.heightAt,
      specimenScale,
    );
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        parkTree: [
          ...this.placeParkProps(treePool, layout.trees, centerX, centerZ, rotation, this.heightAt),
          ...specimens,
        ],
        parkBench: this.placeParkBenches(
          benchPool,
          layout.benches,
          centerX,
          centerZ,
          rotation,
          this.heightAt,
        ),
        pavilionBlock: [
          this.placePavilion(
            pavilionPool,
            layout.pavilion,
            centerX,
            centerZ,
            rotation,
            this.heightAt,
          ),
        ],
      },
      drape,
    });
    this.wearPark(building.id);
  }

  private applySportsGround(
    kit: KitDefinition,
    building: BuildingInstance,
    entry: BuildingCatalogEntry,
    centerX: number,
    groundY: number,
    centerZ: number,
    rotation: 0 | 1 | 2 | 3,
  ): void {
    const groundPool = kit.pools.sportsGround;
    const treePool = kit.pools.parkTree;
    const benchPool = kit.pools.parkBench;
    const goalPool = kit.pools.pitchGoal;
    const pavilionPool = kit.pools.pavilionBlock;
    if (!groundPool || !treePool || !benchPool || !goalPool || !pavilionPool) return;

    const layout = computeSportsGroundLayout(entry.footprint);
    const flat = (): number => groundY;
    const pitchTop = (): number => groundY + PARK_LAWN_HEIGHT + PARK_MARK_HEIGHT_M;
    this.instances.set(building.id, {
      catalogId: building.catalogId,
      slots: {
        sportsGround: [this.placeAt(groundPool, centerX, groundY, centerZ, rotation)],
        parkTree: this.placeParkProps(treePool, layout.trees, centerX, centerZ, rotation, flat),
        parkBench: this.placeParkBenches(
          benchPool,
          layout.benches,
          centerX,
          centerZ,
          rotation,
          flat,
        ),
        pitchGoal: this.placeParkBenches(
          goalPool,
          layout.goals,
          centerX,
          centerZ,
          rotation,
          pitchTop,
        ),
        pavilionBlock: [
          this.placePavilion(pavilionPool, layout.pavilion, centerX, centerZ, rotation, flat),
        ],
      },
    });
  }

  /** Tints a park's lawn by its load: the pocket park's plate by instance colour, a draped park's lawn vertices in place. */
  private wearPark(buildingId: number): void {
    const record = this.instances.get(buildingId);
    if (!record) return;
    const t = parkWear(this.parkLoads.get(buildingId) ?? 0);
    if (record.catalogId === 'small-park') {
      const pool = this.kits.get(record.catalogId)?.pools.parkGround;
      const slot = record.slots.parkGround?.[0];
      if (!pool || slot === undefined) return;
      _carColor.setRGB(
        lerpNum(1, SCUFFED_EARTH_RGB[0], t),
        lerpNum(1, SCUFFED_EARTH_RGB[1], t),
        lerpNum(1, SCUFFED_EARTH_RGB[2], t),
      );
      pool.setColorAt(slot, _carColor);
      return;
    }
    const drape = record.drape;
    if (!drape) return;
    const color = drape.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const r = lerpNum(PARK_LAWN_RGB[0], SCUFFED_EARTH_RGB[0], t);
    const g = lerpNum(PARK_LAWN_RGB[1], SCUFFED_EARTH_RGB[1], t);
    const b = lerpNum(PARK_LAWN_RGB[2], SCUFFED_EARTH_RGB[2], t);
    for (let i = 0; i < drape.lawnVertices; i++) color.setXYZ(i, r, g, b);
    color.needsUpdate = true;
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
      if (record.drape) {
        this.scene.remove(record.drape.mesh);
        record.drape.mesh.geometry.dispose();
      }
      this.instances.delete(buildingId);
    }
    this.turbineAnims.delete(buildingId);
    this.cemeteries.delete(buildingId);
    this.depots.delete(buildingId);
  }
}
