/**
 * The shared part kit an archetype is assembled from (render/archetypes.ts
 * picks the recipe; this builds it).
 *
 * Every part is a box (a tank, a bollard, an awning), placed in the building's
 * own UNROTATED footprint frame and rotated with it — the same convention
 * props.ts uses for roof clutter. The placements are pure functions of the
 * building's boxes, its road-facing side and, where it parks a lot, that lot,
 * so a warehouse's dock or a strip's pylon is testable without a scene.
 *
 * Budget: a part is one box, twelve triangles. A commercial block with all its
 * parts is a few hundred, which is why the reference's 65,536-vertex mesh cap
 * is never the binding constraint on a building — merged ground geometry is.
 */
import * as THREE from 'three';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import {
  computeSetbacks,
  frontageSetbackFor,
  InstancedSlotPool,
  type FrontageSetback,
  type SetbackBox,
} from './massing';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { maxHeightUnderBody } from './footprint';
import { findRoadFacingEdge, localSideOf, NO_STREETS, type Side } from './frontage';
import { materialHex } from './palette';
import { isApartmentEntry, isWalkUpEntry, partsFor, type BuildingPart } from './archetypes';
import { computeCornerOffset, hasSmokestack, smokestackCorner } from './props';
import { deriveFacadeParams, FLOOR_HEIGHT_METERS, windowGrid, type RGB } from './facade';
import { hipRoofGeometry } from './hiproof';
import { buildGableRoofGeometry, roofColorHex, trimColor } from './houses';
import {
  FUEL_CANOPY_DEPTH_M,
  FUEL_CANOPY_GAP_M,
  lotPlanFor,
  lotPointToWorld,
  TANK_DIAMETER_M,
  TANK_GAP_M,
  type LotPlan,
} from './lotplan';
import { DRIVE_THROUGH_LANE_M, DRIVE_THROUGH_STACK_M, type LotRect } from '../shared/lotlayout';
import type { KerbSurroundings } from '../shared/kerblayout';

const INITIAL_PART_CAPACITY = 32;

/**
 * New galvanised sheet. Not a chart swatch: the kit's lambert lighting takes
 * most of a chart colour's value, and a unit at the chart's brightest read
 * black from above against the roof's own lit shader.
 */
const GALVANISED = 0xe2e0da;
const RUST = 0x7a4430;
/** The kit's dark: reveals, shelter frames, bumpers and the bund. */
const KIT_DARK = materialHex('darkBitumen');

/** Colours, all from the calibrated chart. */
const PART_COLOR: Readonly<Record<BuildingPart, number>> = {
  loadingDock: materialHex('stainedConcrete'),
  rollUpDoors: materialHex('metalPlates'),
  monitorRoof: materialHex('metalPlates'),
  roofArray: materialHex('bluePlaster'), // photovoltaic dark blue
  canopy: materialHex('redPlaster'),
  signageBand: materialHex('whiteBrick'),
  fuelCanopy: materialHex('whiteBrick'),
  tanks: materialHex('whitePlaster'),
  awning: materialHex('redPlaster'),
  bulkhead: materialHex('stainedConcrete'),
  cornice: materialHex('whiteBrick'),
  stripCanopy: materialHex('whiteBrick'),
  stripColumn: materialHex('whiteBrick'),
  anchorParapet: materialHex('whitePlaster'),
  pylon: materialHex('whiteBrick'),
  entryTower: materialHex('whitePlaster'),
  towerGlazing: materialHex('whiteBrick'),
  brickBase: materialHex('redBrick'),
  cartCorral: materialHex('metalPlates'),
  menuBoard: materialHex('stainedConcrete'),
  clearanceBar: materialHex('redPlaster'),
  pickupCanopy: materialHex('whiteBrick'),
  dumpsterEnclosure: materialHex('cleanConcrete'),
  fuelFascia: materialHex('redPlaster'),
  fuelIsland: materialHex('cleanConcrete'),
  dispenser: materialHex('redPlaster'),
  bollard: materialHex('metalPlates'),
  priceSign: materialHex('whiteBrick'),
  signPole: materialHex('metalPlates'),
  lobbyPortal: materialHex('whiteBrick'),
  roofScreen: materialHex('metalPlates'),
  coolingTower: materialHex('metalPlates'),
  porteCochere: materialHex('whiteBrick'),
  rooftopUnit: GALVANISED,
  roofHatch: materialHex('metalPlates'),
  // The industrial kit: the wainscot is the industrial roof plate's own grey.
  wainscot: materialHex('metalPlates'),
  walkDoor: materialHex('stainedConcrete'),
  gutter: GALVANISED,
  downspout: GALVANISED,
  ridgeVent: GALVANISED,
  dockShelter: KIT_DARK,
  dockBumper: KIT_DARK,
  dockLight: GALVANISED,
  officeCorner: materialHex('whiteBrick'),
  officeCanopy: materialHex('whiteBrick'),
  panelReveal: KIT_DARK,
  parapetBand: KIT_DARK,
  clerestory: materialHex('whiteBrick'),
  entryCanopy: materialHex('whiteBrick'),
  condenser: GALVANISED,
  bundWall: KIT_DARK,
  bullet: materialHex('whitePlaster'),
  pipeRack: materialHex('metalPlates'),
  processColumn: materialHex('whitePlaster'),
  // A dark rust: the chart's rusted metal read black at the lit side's own value, so it is lifted.
  furnace: RUST,
  stove: RUST,
  skipBridge: materialHex('metalPlates'),
  duct: materialHex('metalPlates'),
  chipPile: materialHex('brightWood'),
  stacker: materialHex('metalPlates'),
  // The apartment kit: the hip and the hood take the building's own roof colour, the box bay its wall's.
  hipRoofBlock: KIT_DARK,
  mailKiosk: materialHex('metalPlates'),
  stoop: materialHex('stainedConcrete'),
  entryHood: KIT_DARK,
  breezeway: KIT_DARK,
  // Slabs, landings and the flight are the walks' concrete; a guard takes the house kit's trim colour, so it reads against the wall.
  landing: materialHex('cleanConcrete'),
  landingGuard: KIT_DARK,
  stairFlight: materialHex('cleanConcrete'),
  balconySlab: materialHex('cleanConcrete'),
  balconyGuard: KIT_DARK,
  patio: materialHex('cleanConcrete'),
  storefrontBand: materialHex('whiteBrick'),
  brickPier: materialHex('redBrick'),
  boxBay: materialHex('whitePlaster'),
  elevatorBulkhead: materialHex('cleanConcrete'),
  penthouse: materialHex('metalPlates'),
};

/** The tower's glass guard: the kit's glazing blue, a solid slab on the kit's own material. */
const GLAZING_BLUE: RGB = (() => {
  const c = new THREE.Color(materialHex('bluePlaster'));
  return [c.r, c.g, c.b];
})();

/**
 * The parts that glow: sign bands, the pylon and price-sign faces, the
 * supermarket tower's glazing, the office lobby portal, a distribution
 * centre's glazed office corner and a factory's clerestory. They share the
 * kit's emissive material, which follows the night factor as a window does.
 */
export const LIT_PARTS: ReadonlySet<BuildingPart> = new Set<BuildingPart>([
  'signageBand',
  'pylon',
  'priceSign',
  'towerGlazing',
  'lobbyPortal',
  'officeCorner',
  'clerestory',
  'storefrontBand',
]);

/** A lit cabinet is white by day on whichever side the sun is: its glow never falls below this share. */
export const LIT_DAY_FLOOR = 0.45;

/** A sloped awning: its top falls from the wall to a short valance at the front; +z is out from the wall. */
function awningGeometry(): THREE.BufferGeometry {
  // The side profile in (z, y): wall top, front top, front bottom, wall bottom.
  const profile: readonly (readonly [number, number])[] = [
    [-0.5, 0.5],
    [0.5, -0.1],
    [0.5, -0.5],
    [-0.5, -0.5],
  ];
  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]): void => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  const at = (i: number, x: number): number[] => [x, profile[i]![1], profile[i]![0]];
  // Each side of the profile is a quad across the awning's width, wound outward.
  for (let i = 0; i < profile.length; i += 1) {
    const j = (i + 1) % profile.length;
    quad(at(i, 0.5), at(i, -0.5), at(j, -0.5), at(j, 0.5));
  }
  // The two ends close the profile.
  quad(at(0, 0.5), at(1, 0.5), at(2, 0.5), at(3, 0.5));
  quad(at(3, -0.5), at(2, -0.5), at(1, -0.5), at(0, -0.5));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A horizontal pressure vessel along Z: a cylinder closed by shallow domes, in
 * the proportion of a 3 m bullet 15 m long, scaled per instance to that.
 */
function bulletGeometry(): THREE.BufferGeometry {
  const radius = 0.5;
  const capDepth = BULLET_DIAMETER_M / BULLET_LENGTH_M / 2;
  const half = 0.5 - capDepth;
  const profile: THREE.Vector2[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * (Math.PI / 2);
    profile.push(new THREE.Vector2(radius * Math.sin(a), -half - capDepth * Math.cos(a)));
  }
  for (let i = steps; i >= 0; i -= 1) {
    const a = (i / steps) * (Math.PI / 2);
    profile.push(new THREE.Vector2(radius * Math.sin(a), half + capDepth * Math.cos(a)));
  }
  return new THREE.LatheGeometry(profile, 14).rotateX(Math.PI / 2);
}

/** A part's unit geometry, scaled per instance: a box unless the part is round or sloped. */
const PART_GEOMETRY: Partial<Record<BuildingPart, () => THREE.BufferGeometry>> = {
  tanks: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  bollard: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  awning: awningGeometry,
  processColumn: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  furnace: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  stove: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  bullet: bulletGeometry,
  chipPile: () => new THREE.ConeGeometry(0.5, 1, 16),
  hipRoofBlock: hipRoofBlockGeometry,
  entryHood: entryHoodGeometry,
};

/**
 * A walk-up's hip, centred like every other part. Every walk-up body in the
 * catalog is square, so its four pitches meet at a point: the one pool draws
 * that, and a longer body would want a ridge of its own.
 */
function hipRoofBlockGeometry(): THREE.BufferGeometry {
  const geometry = hipRoofGeometry(0);
  geometry.translate(0, -0.5, 0);
  return geometry;
}

/** The gabled hood over a multiplex's stoop: the house kit's gable with its ridge running out from the wall, +z. */
function entryHoodGeometry(): THREE.BufferGeometry {
  const geometry = buildGableRoofGeometry();
  geometry.rotateY(Math.PI / 2);
  geometry.translate(0, -0.5, 0);
  return geometry;
}

// --- part dimensions, world meters -----------------------------------------

const DOCK_DEPTH_M = 2.6;
const DOCK_HEIGHT_M = 1.2;
/** Share of the frontage the dock platform runs along. */
const DOCK_FRONTAGE_FRACTION = 0.65;

const DOOR_WIDTH_M = 3;
const DOOR_HEIGHT_M = 3.6;
const DOOR_THICKNESS_M = 0.18;
export const DOOR_COUNT = 3;

/** The monitor roof is a raised lantern running down the roof's long axis. */
const MONITOR_HEIGHT_M = 1.9;
const MONITOR_WIDTH_FRACTION = 0.34;
const MONITOR_LENGTH_FRACTION = 0.78;

const ARRAY_HEIGHT_M = 0.25;
const ARRAY_INSET_FRACTION = 0.72;

/** The flat canopy of a storefront of no kind. */
const CANOPY_DEPTH_M = 1.9;
const CANOPY_THICKNESS_M = 0.22;
const CANOPY_HEIGHT_M = 3.1;
const CANOPY_FRONTAGE_FRACTION = 0.82;

/** A lit sign band: 0.9 m tall at 3.6 m, 60% of its tenant's frontage. */
export const SIGN_HEIGHT_M = 0.9;
const SIGN_THICKNESS_M = 0.16;
export const SIGN_FRONTAGE_FRACTION = 0.6;
/** The band sits just above the shopfront. */
const SIGN_ABOVE_CANOPY_M = 0.5;
export const SIGN_CENTRE_Y_M = CANOPY_HEIGHT_M + SIGN_ABOVE_CANOPY_M;

/** A shop: a dark base band, an awning a bay, a cornice across the parapet. */
export const BULKHEAD_HEIGHT_M = 0.6;
const BULKHEAD_PROUD_M = 0.1;
const SHOP_BAY_M = 6;
export const AWNING_OUT_M = 1.5;
export const AWNING_UNDERSIDE_M = 2.45;
const AWNING_HEIGHT_M = 0.55;
const AWNING_GAP_M = 0.4;
export const CORNICE_DEPTH_M = 0.5;
export const CORNICE_HEIGHT_M = 0.45;

/** A strip: one canopy the length of its frontage, tenants in bays, an anchor, a pylon. */
export const STRIP_CANOPY_DEPTH_M = 2.1;
export const STRIP_CANOPY_UNDERSIDE_M = 2.75;
export const STRIP_CANOPY_FASCIA_M = 0.3;
export const STRIP_COLUMN_M = 0.3;
export const STRIP_COLUMN_SPACING_M = 6;
export const STRIP_BAY_M = 8;
export const ANCHOR_BAYS = 2;
export const ANCHOR_STEP_M = 1.2;
const PARAPET_THICKNESS_M = 0.4;
export const PYLON_HEIGHT_M = 6.1;
export const PYLON_WIDTH_M = 3.66;
export const PYLON_CABINET_M = 1.8;
export const PYLON_POLE_M = 0.4;
export const PYLON_SETBACK_M = 1.5;
const SIGN_STAND_GAP_M = 0.5;

/** A supermarket: an entry tower, stepped parapets either side, a brick base, cart corrals. */
export const TOWER_WIDTH_M = 6;
export const TOWER_DEPTH_M = 4;
export const TOWER_RISE = 1.28;
export const ENTRY_PARAPET_RISE = 1.17;
export const ENTRY_WING_M = 12;
const TOWER_PROJECT_M = 1.5;
const GLAZING_WIDTH_M = 4.4;
const GLAZING_HEIGHT_M = 2.9;
const GLAZING_THICKNESS_M = 0.1;
export const BRICK_BASE_HEIGHT_M = 1.2;
export const BRICK_BASE_PROUD_M = 0.1;
export const CORRAL_LENGTH_M = 3.66;
export const CORRAL_WIDTH_M = 1.52;
export const CORRAL_RAIL_M = 1;
const CORRAL_RAIL_THICKNESS_M = 0.08;
export const CORRAL_POST_HEIGHT_M = 2.3;
const SMALL_POST_M = 0.1;

/** A drive-through: a menu board, a clearance bar, a pickup canopy and a dumpster enclosure. */
export const MENU_BOARD_WIDTH_M = 1.8;
export const MENU_BOARD_HEIGHT_M = 2.1;
const MENU_BOARD_PANEL_M = 1.2;
const MENU_BOARD_THICKNESS_M = 0.15;
export const CLEARANCE_BAR_M = 2.74;
const CLEARANCE_BAR_THICKNESS_M = 0.15;
export const PICKUP_CANOPY_WIDTH_M = 1.8;
export const PICKUP_CANOPY_DEPTH_M = 2.7;
export const PICKUP_CANOPY_HEIGHT_M = 3;
const PICKUP_CANOPY_THICKNESS_M = 0.2;
export const DUMPSTER_WIDTH_M = 3.66;
export const DUMPSTER_DEPTH_M = 3.05;
export const DUMPSTER_WALL_HEIGHT_M = 1.83;
const DUMPSTER_WALL_THICKNESS_M = 0.2;
const DUMPSTER_REAR_GAP_M = 0.8;

/** The forecourt canopy's and the tank farm's ground, which the lot plan keeps clear for them. */
export { FUEL_CANOPY_GAP_M, FUEL_CANOPY_DEPTH_M, TANK_DIAMETER_M, TANK_GAP_M };
/** A filling station's canopy stands off the kiosk over the forecourt, on posts, its underside 14 ft up. */
export const FUEL_CANOPY_THICKNESS_M = 0.5;
export const FUEL_CANOPY_HEIGHT_M = 4.27;
export const FUEL_CANOPY_FRONTAGE_FRACTION = 0.9;
export const FUEL_FASCIA_HEIGHT_M = 0.91;
const FUEL_FASCIA_THICKNESS_M = 0.15;
const FUEL_POST_M = 0.4;
const FUEL_POST_INSET_M = 1;
/** Two pump islands under the canopy, 25 ft apart, each with two dispensers and a bollard at each end. */
export const ISLAND_COUNT = 2;
export const ISLAND_WIDTH_M = 1.2;
export const ISLAND_LENGTH_M = 3.66;
export const ISLAND_HEIGHT_M = 0.15;
export const ISLAND_SPACING_M = 7.6;
export const DISPENSER_SIZE_M: readonly [number, number, number] = [0.5, 1.9, 1];
const DISPENSER_OFFSET_M = 0.9;
export const BOLLARD_DIAMETER_M = 0.25;
export const BOLLARD_HEIGHT_M = 0.9;
export const PRICE_SIGN_WIDTH_M = 2.4;
export const PRICE_SIGN_HEIGHT_M = 1.5;
export const PRICE_SIGN_POLE_M = 0.3;
const KIOSK_AWNING_WIDTH_M = 4;

/** An office's lobby portal, a hotel's porte-cochere, and what stands on a roof. */
export const LOBBY_WIDTH_M = 4;
export const LOBBY_HEIGHT_M = 4.5;
export const LOBBY_PROJECT_M = 1.5;
export const PORTE_COCHERE_WIDTH_M = 6.1;
export const PORTE_COCHERE_DEPTH_M = 6;
export const PORTE_COCHERE_THICKNESS_M = 0.6;
export const PORTE_COCHERE_UNDERSIDE_M = 4.27;
const PORTE_COLUMN_M = 0.4;
export const UNIT_PLATE_M2 = 232;
export const UNIT_CAP = 8;
/** A 3-5 ton packaged unit, 1.95 × 1.22 × 1.07 m on a 0.36 m curb. */
export const UNIT_LENGTH_M = 1.95;
export const UNIT_WIDTH_M = 1.22;
export const UNIT_HEIGHT_M = 1.07 + 0.36;
export const ROOF_INSET_M = 2;
const HATCH_SIZE_M: readonly [number, number, number] = [0.9, 0.3, 0.76];
const HATCH_CLEAR_M = 0.5;
export const SCREEN_HEIGHT_M = 3;
const SCREEN_THICKNESS_M = 0.3;
export const COOLING_TOWER_SIZE_M: readonly [number, number, number] = [6, 3, 3];

/** A tank farm: three tanks in a row off the wall opposite the street, in the yard behind the plant. */
export const TANK_COUNT = 3;
export const TANK_HEIGHT_M = 5;
export const TANK_SPACING_M = 7.5;

// The industrial kit's parts, absolute metres.

/** A metal building: a wainscot round every face, gutters along both eaves, downspouts, a ridge vent. */
export const WAINSCOT_HEIGHT_M = 1;
const WAINSCOT_PROUD_M = 0.08;
export const GUTTER_M = 0.2;
export const DOWNSPOUT_M = 0.13;
export const DOWNSPOUT_SPACING_M = 6;
export const RIDGE_VENT_THROAT_M = 0.23;
const RIDGE_VENT_CAP_M = 0.18;
const RIDGE_VENT_HEIGHT_M = 0.3;
/** A service bay's door is 10 × 10 ft, a factory's 12 × 12 ft, a walk door 3070. */
export const SHOP_DOOR_M = 3.05;
export const SHOP_DOOR_SPACING_M = 6;
export const SHOP_DOOR_MAX = 4;
export const FACTORY_DOOR_M = 3.66;
export const FACTORY_DOOR_COUNT = 2;
export const WALK_DOOR_WIDTH_M = 0.9;
export const WALK_DOOR_HEIGHT_M = 2.1;
const WALK_DOOR_GAP_M = 1.5;
/** A dock door is 9 × 10 ft at 14 ft centres, with a shelter frame 0.3 m proud, two bumpers and a light. */
export const DOCK_DOOR_WIDTH_M = 2.74;
export const DOCK_DOOR_HEIGHT_M = 3.05;
export const DOCK_DOOR_CENTRES_M = 4.3;
export const SHELTER_PROUD_M = 0.3;
const SHELTER_FRAME_M = 0.3;
export const BUMPER_SIZE_M: readonly [number, number, number] = [0.3, 0.25, 0.11];
const BUMPER_OFFSET_M = 0.9;
const DOCK_LIGHT_SIZE_M: readonly [number, number, number] = [0.25, 0.2, 0.4];
const DOCK_LIGHT_ABOVE_M = 0.45;
/** The glazed office corner of a distribution centre: two storeys, 8 × 8 m, standing half out of the street face. */
export const OFFICE_CORNER_M = 8;
export const OFFICE_CORNER_HEIGHT_M = 7.3;
export const OFFICE_CORNER_PROUD_M = 4;
export const OFFICE_CANOPY_SIZE_M: readonly [number, number, number] = [3, 0.2, 1.5];
export const OFFICE_CANOPY_HEIGHT_M = 3;
export const PANEL_REVEAL_SPACING_M = 7.6;
const PANEL_REVEAL_WIDTH_M = 0.1;
const PANEL_REVEAL_PROUD_M = 0.05;
export const PARAPET_BAND_HEIGHT_M = 1;
const PARAPET_BAND_PROUD_M = 0.1;
/** A factory's clerestory: a lit band along both sides of the monitor. */
export const CLERESTORY_HEIGHT_M = 0.6;
const CLERESTORY_PROUD_M = 0.1;
export const ENTRY_CANOPY_SIZE_M: readonly [number, number, number] = [3, 0.2, 1.5];
export const ENTRY_CANOPY_HEIGHT_M = 3;
/** A food plant's evaporative condensers, a 700-ton unit. */
export const CONDENSER_SIZE_M: readonly [number, number, number] = [6, 3, 3.6];
export const CONDENSER_COUNT = 2;
/** The chemical plant's bund, bullet, pipe rack and process column. */
export const BUND_HEIGHT_M = 1;
export const BUND_MARGIN_M = 2;
const BUND_THICKNESS_M = 0.3;
export const BULLET_DIAMETER_M = 3;
export const BULLET_LENGTH_M = 15;
const BULLET_SADDLE_M = 0.8;
export const RACK_WIDTH_M = 6;
export const RACK_BENT_SPACING_M = 6;
export const RACK_CLEAR_M = 5.5;
const RACK_TIER_GAP_M = 1.5;
const RACK_BEAM_M = 0.4;
const RACK_COLUMN_M = 0.3;
export const COLUMN_DIAMETER_M = 3;
export const COLUMN_RISE = 1.6;
/** The steelworks' blast furnace, stoves, skip bridge and duct. */
export const FURNACE_DIAMETER_M = 8;
export const FURNACE_RISE = 1.8;
export const STOVE_DIAMETER_M = 5;
export const STOVE_RISE = 1.4;
export const STOVE_COUNT = 3;
const STOVE_GAP_M = 1.5;
export const SKIP_BRIDGE_M = 1.5;
const SKIP_BRIDGE_PITCH = Math.PI / 3;
export const DUCT_M = 1.5;
/** The paper mill's wood chip pile and its stacker. */
export const CHIP_PILE_DIAMETER_M = 25;
export const CHIP_PILE_HEIGHT_M = 8;
export const STACKER_M = 1.2;
/** How far from the pile's crown the stacker's foot stands on the yard. */
const STACKER_REACH_M = 15.5;
/** How far up the stack's shaft the duct enters it. */
const STACK_DUCT_HEIGHT_M = 9;
/** The gap a yard plant keeps off the body and off its neighbours. */
const PLANT_GAP_M = 1;

// --- the apartment kit, world metres ----------------------------------------

/** A walk-up's hip: 5:12 over 0.45 m eaves, its rise capped as the house kit's is. */
export const HIP_PITCH = 5 / 12;
export const HIP_EAVE_M = 0.45;
export const HIP_RISE_CAP_M = 4.5;
/** A walk-up's brick base, round every face. */
export const WALK_UP_BRICK_BASE_HEIGHT_M = 0.9;
export const WALK_UP_BRICK_BASE_PROUD_M = 0.05;
/** A USPS cluster box unit on its pedestal: wide, tall, deep. */
export const MAIL_KIOSK_SIZE_M: readonly [number, number, number] = [0.77, 1.93, 0.45];
/** The kiosk stands this far off the walk, this far in from the lot's street edge, or this far off the wall beside the door. */
const MAIL_KIOSK_GAP_M = 0.5;
const MAIL_KIOSK_IN_M = 1;
const MAIL_KIOSK_OFF_WALL_M = 0.5;
/** A multiplex's shared stoop: a landing up two risers, under a gabled hood on two posts. */
export const STOOP_WIDTH_M = 2.4;
export const STOOP_DEPTH_M = 1.5;
export const STOOP_RISE_M = 0.45;
export const STOOP_RISERS = 2;
const STOOP_TREAD_M = 0.3;
export const ENTRY_HOOD_SIZE_M: readonly [number, number] = [2.4, 1.2];
export const ENTRY_HOOD_POST_M = 0.15;
/** The hood's underside is the house kit's portico height, its gable the colonial's 8:12. */
export const ENTRY_HOOD_UNDERSIDE_M = 2.45;
const ENTRY_HOOD_PITCH = 8 / 12;
const ENTRY_HOOD_POST_INSET_M = 0.05;
/** A garden walk-up's breezeway: the open slot, a landing per upper floor and the flight to the first. */
export const BREEZEWAY_WIDTH_M = 1.8;
export const BREEZEWAY_PROUD_M = 0.05;
export const LANDING_DEPTH_M = 1.2;
export const LANDING_THICKNESS_M = 0.15;
/** A guard is 42 in, drawn as one thin slab. */
export const GUARD_HEIGHT_M = 1.07;
export const GUARD_THICKNESS_M = 0.05;
export const STAIR_WIDTH_M = 1;
/** The flight's slab, stringers and treads together, so it reads as a stair and not a line. */
export const STAIR_SLAB_M = 0.3;
/** The 7 in rise over 11 in run of a stair: about 32°. */
export const STAIR_PITCH = Math.atan2(7, 11);
/** A balcony is 6 ft deep and the bay less 1 m wide; a walk-up's slab is 0.15 m, a block's 0.2 m. */
export const BALCONY_DEPTH_M = 1.8;
export const BALCONY_BAY_INSET_M = 1;
export const WALK_UP_BALCONY_SLAB_M = 0.15;
export const BLOCK_BALCONY_SLAB_M = 0.2;
/** A tower's continuous balcony stops this short of each end of the face. */
export const TOWER_BALCONY_END_M = 1;
/** A podium's storefront band: glazing over the shop's bulkhead between brick piers. */
export const STOREFRONT_GLAZING_M = 3;
export const STOREFRONT_PROUD_M = 0.05;
export const BRICK_PIER_M = 0.6;
const BRICK_PIER_PROUD_M = 0.1;
/** A band piece narrower than this, left beside the lobby portal, is not drawn. */
const MIN_BAND_PIECE_M = 0.6;
/** A box bay, 2 ft proud, in the wall's own colour darkened. */
export const BOX_BAY_PROUD_M = 0.6;
export const BOX_BAY_DARKEN = 0.78;
/** An apartment block's parapet band, 30 in. */
export const BLOCK_PARAPET_M = 0.76;
/** The elevator bulkhead (along the street, tall, deep) and the mechanical penthouse, each this far back from the street face. */
export const ELEVATOR_BULKHEAD_SIZE_M: readonly [number, number, number] = [3, 4.1, 4];
export const PENTHOUSE_HEIGHT_M = 4.1;
export const PENTHOUSE_PLATE_SHARE = 0.3;
export const ROOF_SETBACK_FROM_STREET_M = 3;

export interface PartPlacement {
  readonly part: BuildingPart;
  /** Box size in world meters (w along X, h along Y, d along Z), unrotated, before any yaw. */
  readonly size: readonly [number, number, number];
  /** Center offset from the building's footprint center, unrotated, meters. */
  readonly offset: readonly [number, number, number];
  /** Turn about the vertical, radians, in the unrotated frame, for a part with a front such as an awning. */
  readonly yaw?: number;
  /** Elevation of the part's +Z end above its -Z end, radians, for a bridge or a duct that runs on the slant. */
  readonly pitch?: number;
  /** The instance colour, 0..1 a channel, for a part in its building's own colour; the part's chart colour otherwise. */
  readonly color?: RGB;
}

/** A rectangle in the building's unrotated frame, metres from its footprint centre. */
export interface LocalRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A point in the building's unrotated frame, metres from its footprint centre. */
export interface LocalPoint {
  x: number;
  z: number;
}

/** A drive-through lane in the building's frame. */
export interface KitLane {
  /** The centre line from the drive to the lane's end. */
  path: LocalPoint[];
  rects: LocalRect[];
  length: number;
  /** The pickup window on the body's wall, and the way the wall faces. */
  pickup: LocalPoint;
  pickupFacing: LocalPoint;
}

/**
 * The lot a building stands on, as the parts that stand on it read it, in the
 * building's own frame. Only a building that parks a lot to code has one.
 */
export interface KitLot {
  lot: LocalRect;
  /** The drive's mouth at the street edge. */
  curbCut: LocalRect;
  /** The walk from the street to the body's entrance, where the layout has one. */
  walk: LocalRect | null;
  /** The walk along the body's street face, which a kiosk may stand on; the same rectangle as in `taken`. */
  frontWalk: LocalRect | null;
  /** Planted islands nearest the entrance first, none holding a tree. */
  islands: LocalRect[];
  /** Where the loading berths are, when there are any. */
  dock: LocalPoint | null;
  /** The way the wall the berths lie beside faces, as a unit step out of the body; null without berths. */
  loadingFacing: LocalPoint | null;
  /** Trailer stalls striped in the truck court before the loading wall. */
  trailers: LocalRect[];
  /** Ground a car, a truck or a trailer stands on: stalls, aisles, berths, trailer stalls and the planted islands, but no walk. */
  hard: LocalRect[];
  lane: KitLane | null;
  /** Ground a stall, aisle, berth, walk, yard or the lane is laid on, which a part on the ground must not stand on; planted islands are left to them. */
  taken: LocalRect[];
}

/** The side across the footprint from `side`: the back of a building that fronts `side`. */
function oppositeSide(side: Side): Side {
  switch (side) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'E':
      return 'W';
    default:
      return 'E';
  }
}

/** Outward unit normal of a footprint side, in the unrotated frame. */
function sideNormal(side: Side): { nx: number; nz: number } {
  switch (side) {
    case 'N':
      return { nx: 0, nz: -1 };
    case 'S':
      return { nx: 0, nz: 1 };
    case 'E':
      return { nx: 1, nz: 0 };
    default:
      return { nx: -1, nz: 0 };
  }
}

/** The turn that carries a part's front, +z, out of a side of the footprint. */
function sideYaw(side: Side): number {
  switch (side) {
    case 'S':
      return 0;
    case 'E':
      return Math.PI / 2;
    case 'N':
      return Math.PI;
    default:
      return -Math.PI / 2;
  }
}

const isAlongX = (side: Side): boolean => side === 'N' || side === 'S';

/** Span of the facade on a side: the box's X extent for N/S, its Z extent for E/W. */
function facadeSpan(box: SetbackBox, side: Side): number {
  return isAlongX(side) ? box.w : box.d;
}

/** Half-depth from the box center out to the given face. */
function halfDepthTo(box: SetbackBox, side: Side): number {
  return (isAlongX(side) ? box.d : box.w) / 2;
}

/**
 * A box on a side of the footprint: `span` wide along the wall at `along` from
 * the wall's middle, `depth` thick across a line `out` from the footprint
 * centre, `height` tall with its middle at `centerY`. A part with a front is
 * built facing +z and turned out of the side.
 */
function onSide(
  part: BuildingPart,
  side: Side,
  along: number,
  out: number,
  span: number,
  depth: number,
  height: number,
  centerY: number,
  faced = false,
): PartPlacement {
  const { nx, nz } = sideNormal(side);
  const alongX = isAlongX(side);
  const offset: [number, number, number] = alongX
    ? [along, centerY, nz * out]
    : [nx * out, centerY, along];
  if (faced) return { part, size: [span, height, depth], offset, yaw: sideYaw(side) };
  return { part, size: alongX ? [span, height, depth] : [depth, height, span], offset };
}

/**
 * A box laid flat against one facade: `span` wide along the wall, `depth` out
 * from it, `height` tall, its inner face flush with the wall.
 */
function againstFacade(
  part: BuildingPart,
  base: SetbackBox,
  side: Side,
  span: number,
  depth: number,
  height: number,
  centerY: number,
  along = 0,
): PartPlacement {
  return onSide(
    part,
    side,
    along,
    halfDepthTo(base, side) + depth / 2,
    span,
    depth,
    height,
    centerY,
  );
}

/** A box stood anywhere on the plan, `w` along X and `d` along Z. */
function atPoint(
  part: BuildingPart,
  x: number,
  z: number,
  w: number,
  d: number,
  height: number,
  centerY: number,
): PartPlacement {
  return { part, size: [w, height, d], offset: [x, centerY, z] };
}

/** The plan extent of a placement in the unrotated frame, its yaw taken into account. */
export function placementBounds(p: PartPlacement): LocalRect {
  const quarter = Math.abs(Math.round((p.yaw ?? 0) / (Math.PI / 2))) % 2 === 1;
  const pitch = p.pitch ?? 0;
  // A part on the slant runs its length along the plan by the cosine of its pitch, and its height adds the sine.
  const length = p.size[2] * Math.cos(pitch) + p.size[1] * Math.sin(Math.abs(pitch));
  const yaw = p.yaw ?? 0;
  const square = Math.abs(yaw / (Math.PI / 2) - Math.round(yaw / (Math.PI / 2))) < 1e-9;
  let w = quarter ? length : p.size[0];
  let d = quarter ? p.size[0] : length;
  if (!square) {
    // A part on the diagonal covers the box that holds it.
    w = Math.abs(Math.cos(yaw)) * p.size[0] + Math.abs(Math.sin(yaw)) * length;
    d = Math.abs(Math.sin(yaw)) * p.size[0] + Math.abs(Math.cos(yaw)) * length;
  }
  return {
    x0: p.offset[0] - w / 2,
    x1: p.offset[0] + w / 2,
    z0: p.offset[2] - d / 2,
    z1: p.offset[2] + d / 2,
  };
}

const rectsOverlap = (a: LocalRect, b: LocalRect): boolean =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

const rectInside = (r: LocalRect, lot: LocalRect): boolean =>
  r.x0 >= lot.x0 - 1e-6 && r.x1 <= lot.x1 + 1e-6 && r.z0 >= lot.z0 - 1e-6 && r.z1 <= lot.z1 + 1e-6;

/** The bays a frontage is cut into: whole bays near `bay` metres wide, at least one. */
function baysOf(span: number, bay: number): { count: number; width: number } {
  const count = Math.max(1, Math.round(span / bay));
  return { count, width: span / count };
}

/** The middle of bay `i` along a frontage of `span` cut into `count`. */
const bayCentre = (span: number, count: number, i: number): number =>
  -span / 2 + ((i + 0.5) * span) / count;

/** Rooftop units for a roof plate: one per 232 m², at least one, at most eight. */
export function rooftopUnitCount(topBox: SetbackBox): number {
  return Math.min(UNIT_CAP, Math.max(1, Math.ceil((topBox.w * topBox.d) / UNIT_PLATE_M2)));
}

/**
 * The units on a roof, spaced down its long axis 2 m inside the parapet
 * (confined to the half nearest the dock when the dock is on one end), and a
 * hatch by the back parapet.
 */
function roofEquipment(
  topBox: SetbackBox,
  roofY: number,
  side: Side | null,
  dock: LocalPoint | null,
  withUnits: boolean,
): PartPlacement[] {
  const out: PartPlacement[] = [];
  const alongZ = topBox.d > topBox.w;
  const long = alongZ ? topBox.d : topBox.w;
  if (withUnits) {
    const count = rooftopUnitCount(topBox);
    const reach = Math.max(0, long / 2 - ROOF_INSET_M - UNIT_LENGTH_M / 2);
    const dockOn = dock ? (alongZ ? dock.z : dock.x) : 0;
    const bias = Math.abs(dockOn) > 1 ? Math.sign(dockOn) : 0;
    const lo = bias > 0 ? 0 : -reach;
    const hi = bias < 0 ? 0 : reach;
    for (let i = 0; i < count; i += 1) {
      const at = count === 1 ? (lo + hi) / 2 : lo + (i * (hi - lo)) / (count - 1);
      out.push({
        part: 'rooftopUnit',
        size: alongZ
          ? [UNIT_WIDTH_M, UNIT_HEIGHT_M, UNIT_LENGTH_M]
          : [UNIT_LENGTH_M, UNIT_HEIGHT_M, UNIT_WIDTH_M],
        offset: [alongZ ? 0 : at, roofY + UNIT_HEIGHT_M / 2, alongZ ? at : 0],
      });
    }
  }
  const back = sideNormal(oppositeSide(side ?? 'S'));
  const [hw, hh, hd] = HATCH_SIZE_M;
  // Off to one side of the line the units stand on, so a long roof's last unit never meets it.
  const aside = (UNIT_WIDTH_M + hw) / 2 + HATCH_CLEAR_M;
  const backX = back.nx * (topBox.w / 2 - ROOF_INSET_M - hw / 2) + back.nz * aside;
  const backZ = back.nz * (topBox.d / 2 - ROOF_INSET_M - hd / 2) + back.nx * aside;
  out.push({ part: 'roofHatch', size: [hw, hh, hd], offset: [backX, roofY + hh / 2, backZ] });
  return out;
}

/**
 * Where a sign on a pole stands at the lot's drive mouth: beside the curb cut,
 * its street face PYLON_SETBACK_M inside the lot line, on whichever side of the
 * cut the lot has room for it. Null where the lot has no drive or no room.
 */
function signStand(
  side: Side,
  lot: KitLot,
  width: number,
  depth: number,
): { along: number; out: number } | null {
  const alongX = isAlongX(side);
  const { nx, nz } = sideNormal(side);
  const cut = lot.curbCut;
  const cutLow = alongX ? cut.x0 : cut.z0;
  const cutHigh = alongX ? cut.x1 : cut.z1;
  const lotLow = alongX ? lot.lot.x0 : lot.lot.z0;
  const lotHigh = alongX ? lot.lot.x1 : lot.lot.z1;
  const streetEdge =
    nx * (nx > 0 ? lot.lot.x1 : lot.lot.x0) + nz * (nz > 0 ? lot.lot.z1 : lot.lot.z0);
  const out = streetEdge - PYLON_SETBACK_M - depth / 2;
  const high = cutHigh + SIGN_STAND_GAP_M + width / 2;
  const low = cutLow - SIGN_STAND_GAP_M - width / 2;
  // The pole stands on ground no stall, walk or aisle takes.
  const poleClear = (along: number): boolean => {
    const x = alongX ? along : nx * out;
    const z = alongX ? nz * out : along;
    const pole = {
      x0: x - depth / 2,
      x1: x + depth / 2,
      z0: z - depth / 2,
      z1: z + depth / 2,
    };
    return rectInside(pole, lot.lot) && !lot.taken.some((t) => rectsOverlap(t, pole));
  };
  // The nearest ground to the drive mouth, either side of it.
  for (let step = 0; step <= lotHigh - lotLow; step += 1) {
    const up = high + step;
    const down = low - step;
    const upFits = up + width / 2 <= lotHigh;
    const downFits = down - width / 2 >= lotLow;
    if (!upFits && !downFits) break;
    if (upFits && poleClear(up)) return { along: up, out };
    if (downFits && poleClear(down)) return { along: down, out };
  }
  return null;
}

/** A sign on a pole: the lit face at the top of the stand, the pole under it. */
function signOnPole(
  facePart: BuildingPart,
  side: Side,
  stand: { along: number; out: number },
  faceWidth: number,
  faceHeight: number,
  poleWidth: number,
  depth: number,
): PartPlacement[] {
  const poleHeight = PYLON_HEIGHT_M - faceHeight;
  return [
    onSide(
      facePart,
      side,
      stand.along,
      stand.out,
      faceWidth,
      depth,
      faceHeight,
      PYLON_HEIGHT_M - faceHeight / 2,
    ),
    onSide(
      'signPole',
      side,
      stand.along,
      stand.out,
      poleWidth,
      poleWidth,
      poleHeight,
      poleHeight / 2,
    ),
  ];
}

/** A point `distance` along a polyline, and the unit direction there. */
export function alongPath(
  path: readonly LocalPoint[],
  distance: number,
): { at: LocalPoint; dir: LocalPoint } {
  let left = Math.max(0, distance);
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    if (left <= len || i + 2 === path.length) {
      const t = Math.min(left, len);
      return { at: { x: a.x + dir.x * t, z: a.z + dir.z * t }, dir };
    }
    left -= len;
  }
  return { at: path[0]!, dir: { x: 0, z: 1 } };
}

/** The menu board, clearance bar and pickup canopy on a drive-through lane, with the posts they stand on. */
function laneParts(lane: KitLane): PartPlacement[] {
  const out: PartPlacement[] = [];
  const half = DRIVE_THROUGH_LANE_M / 2;
  /** Across the lane, away from the body. */
  const outward = (at: LocalPoint, dir: LocalPoint): LocalPoint => {
    const s = { x: -dir.z, z: dir.x };
    return s.x * at.x + s.z * at.z >= 0 ? s : { x: -s.x, z: -s.z };
  };
  const across = (d: LocalPoint): boolean => Math.abs(d.x) > Math.abs(d.z);

  // The board stands at the head of a six-car stack back from the window.
  const board = alongPath(
    lane.path,
    Math.max(MENU_BOARD_WIDTH_M, lane.length - DRIVE_THROUGH_STACK_M),
  );
  const bs = outward(board.at, board.dir);
  const bx = board.at.x + bs.x * (half - 0.2);
  const bz = board.at.z + bs.z * (half - 0.2);
  const boardAcross = across(bs);
  out.push({
    part: 'menuBoard',
    size: boardAcross
      ? [MENU_BOARD_THICKNESS_M, MENU_BOARD_PANEL_M, MENU_BOARD_WIDTH_M]
      : [MENU_BOARD_WIDTH_M, MENU_BOARD_PANEL_M, MENU_BOARD_THICKNESS_M],
    offset: [bx, MENU_BOARD_HEIGHT_M - MENU_BOARD_PANEL_M / 2, bz],
  });
  const postHeight = MENU_BOARD_HEIGHT_M - MENU_BOARD_PANEL_M;
  for (const a of [-1, 1]) {
    const px = bx + (boardAcross ? 0 : a * (MENU_BOARD_WIDTH_M / 2 - SMALL_POST_M));
    const pz = bz + (boardAcross ? a * (MENU_BOARD_WIDTH_M / 2 - SMALL_POST_M) : 0);
    out.push(atPoint('signPole', px, pz, SMALL_POST_M, SMALL_POST_M, postHeight, postHeight / 2));
  }

  // The bar spans the lane just inside its entry, on a post at either edge.
  const entry = alongPath(lane.path, 2);
  const es = outward(entry.at, entry.dir);
  const barAcross = across(es);
  out.push({
    part: 'clearanceBar',
    size: barAcross
      ? [CLEARANCE_BAR_THICKNESS_M, CLEARANCE_BAR_THICKNESS_M, DRIVE_THROUGH_LANE_M]
      : [DRIVE_THROUGH_LANE_M, CLEARANCE_BAR_THICKNESS_M, CLEARANCE_BAR_THICKNESS_M],
    offset: [entry.at.x, CLEARANCE_BAR_M + CLEARANCE_BAR_THICKNESS_M / 2, entry.at.z],
  });
  for (const a of [-1, 1]) {
    const reach = a * (half - SMALL_POST_M);
    out.push(
      atPoint(
        'signPole',
        entry.at.x + es.x * reach,
        entry.at.z + es.z * reach,
        SMALL_POST_M,
        SMALL_POST_M,
        CLEARANCE_BAR_M,
        CLEARANCE_BAR_M / 2,
      ),
    );
  }

  // The canopy reaches out from the pickup wall over the lane.
  const f = lane.pickupFacing;
  const canopyAcross = across(f);
  const cx = lane.pickup.x + f.x * (PICKUP_CANOPY_DEPTH_M / 2);
  const cz = lane.pickup.z + f.z * (PICKUP_CANOPY_DEPTH_M / 2);
  out.push({
    part: 'pickupCanopy',
    size: canopyAcross
      ? [PICKUP_CANOPY_DEPTH_M, PICKUP_CANOPY_THICKNESS_M, PICKUP_CANOPY_WIDTH_M]
      : [PICKUP_CANOPY_WIDTH_M, PICKUP_CANOPY_THICKNESS_M, PICKUP_CANOPY_DEPTH_M],
    offset: [cx, PICKUP_CANOPY_HEIGHT_M + PICKUP_CANOPY_THICKNESS_M / 2, cz],
  });
  return out;
}

/** The dumpster enclosure's three masonry walls, open toward the building: `away` is the axis direction the back wall faces. */
function dumpsterWalls(centre: LocalPoint, away: LocalPoint): PartPlacement[] {
  const alongX = away.z !== 0;
  const [w, d] = alongX
    ? [DUMPSTER_WIDTH_M, DUMPSTER_DEPTH_M]
    : [DUMPSTER_DEPTH_M, DUMPSTER_WIDTH_M];
  const t = DUMPSTER_WALL_THICKNESS_M;
  const y = DUMPSTER_WALL_HEIGHT_M / 2;
  const wall = (x: number, z: number, ww: number, dd: number): PartPlacement =>
    atPoint('dumpsterEnclosure', centre.x + x, centre.z + z, ww, dd, DUMPSTER_WALL_HEIGHT_M, y);
  return [
    // The back wall, away from the building.
    wall((away.x * (w - t)) / 2, (away.z * (d - t)) / 2, alongX ? w : t, alongX ? t : d),
    // The two side walls, from the back wall toward the building.
    ...[-1, 1].map((k) =>
      alongX
        ? wall((k * (w - t)) / 2, (-away.z * t) / 2, t, d - t)
        : wall((-away.x * t) / 2, (k * (d - t)) / 2, w - t, t),
    ),
  ];
}

/**
 * Where the dumpster enclosure stands: the clear ground nearest the middle of
 * the body's back wall, a metre's lattice over the lot, on ground the lot
 * leaves free and clear of the body. Its back wall faces away from the body.
 */
function dumpsterSpot(
  baseBox: SetbackBox,
  side: Side,
  lot: KitLot,
): { centre: LocalPoint; away: LocalPoint } | null {
  const back = sideNormal(oppositeSide(side));
  const halfBack = halfDepthTo(baseBox, oppositeSide(side));
  const target = {
    x: back.nx * (halfBack + DUMPSTER_REAR_GAP_M + DUMPSTER_DEPTH_M / 2),
    z: back.nz * (halfBack + DUMPSTER_REAR_GAP_M + DUMPSTER_DEPTH_M / 2),
  };
  const body = {
    x0: -baseBox.w / 2 - DUMPSTER_REAR_GAP_M,
    x1: baseBox.w / 2 + DUMPSTER_REAR_GAP_M,
    z0: -baseBox.d / 2 - DUMPSTER_REAR_GAP_M,
    z1: baseBox.d / 2 + DUMPSTER_REAR_GAP_M,
  };
  let best: { centre: LocalPoint; away: LocalPoint; cost: number } | null = null;
  for (let x = Math.ceil(lot.lot.x0); x <= lot.lot.x1; x += 1) {
    for (let z = Math.ceil(lot.lot.z0); z <= lot.lot.z1; z += 1) {
      const cost = Math.hypot(x - target.x, z - target.z);
      if (best && cost >= best.cost) continue;
      const away =
        Math.abs(x) > Math.abs(z) ? { x: Math.sign(x), z: 0 } : { x: 0, z: Math.sign(z) || 1 };
      const [w, d] =
        away.z !== 0 ? [DUMPSTER_WIDTH_M, DUMPSTER_DEPTH_M] : [DUMPSTER_DEPTH_M, DUMPSTER_WIDTH_M];
      const rect = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
      if (!rectInside(rect, lot.lot) || rectsOverlap(rect, body)) continue;
      if (lot.taken.some((t) => rectsOverlap(t, rect))) continue;
      best = { centre: { x, z }, away, cost };
    }
  }
  return best ? { centre: best.centre, away: best.away } : null;
}

/** The wall a vector out of the body faces, in the unrotated frame. */
function sideOfFacing(f: LocalPoint): Side {
  if (Math.abs(f.x) > Math.abs(f.z)) return f.x > 0 ? 'E' : 'W';
  return f.z > 0 ? 'S' : 'N';
}

/** Whether `p` stands inside the lot and clear of the ground a car, truck or trailer stands on; true without a lot. */
function standsFree(p: PartPlacement | readonly PartPlacement[], lot: KitLot | null): boolean {
  if (!lot) return true;
  const list = 'part' in p ? [p] : p;
  return list.every((q) => {
    const b = placementBounds(q);
    return rectInside(b, lot.lot) && !lot.hard.some((h) => rectsOverlap(h, b));
  });
}

/** A dock bank: where along which wall it stands, and how many doors it holds. */
interface DockBank {
  wall: Side;
  /** The middle of the dock along its wall. */
  along: number;
  /** The platform's length. */
  length: number;
  doors: number;
  /** Whether the bank stands on the lot's loading side rather than the street face. */
  loading: boolean;
}

/** The doors a dock of `length` holds at 14 ft centres. */
const dockDoors = (length: number): number =>
  Math.max(1, Math.floor((length + 1e-9) / DOCK_DOOR_CENTRES_M));

/** The end of the street face a distribution centre's office stands at: the one beside the drive, away from a loading wall on a side. */
function officeEnd(side: Side, lot: KitLot | null, loadingWall: Side | null): 1 | -1 {
  const alongX = isAlongX(side);
  if (loadingWall && isAlongX(loadingWall) !== alongX) {
    const n = sideNormal(loadingWall);
    return (alongX ? n.nx : n.nz) > 0 ? -1 : 1;
  }
  const cut = lot?.curbCut;
  const drive = cut ? (alongX ? cut.x0 + cut.x1 : cut.z0 + cut.z1) / 2 : 0;
  return drive < 0 ? -1 : 1;
}

/**
 * Where a warehouse's or food plant's dock bank stands: on the wall the lot's
 * berths lie beside when the platform stands inside the lot, else on the
 * street face, clear of the office corner at its end.
 */
function dockBankOf(baseBox: SetbackBox, side: Side, lot: KitLot | null): DockBank {
  if (lot?.loadingFacing && lot.dock) {
    const wall = sideOfFacing(lot.loadingFacing);
    const span = facadeSpan(baseBox, wall);
    const doors = dockDoors(span * DOCK_FRONTAGE_FRACTION);
    const length = doors * DOCK_DOOR_CENTRES_M;
    const reach = Math.max(0, (span - length) / 2);
    const want = isAlongX(wall) ? lot.dock.x : lot.dock.z;
    const along = Math.max(-reach, Math.min(reach, want));
    const platform = againstFacade(
      'loadingDock',
      baseBox,
      wall,
      length,
      DOCK_DEPTH_M,
      DOCK_HEIGHT_M,
      DOCK_HEIGHT_M / 2,
      along,
    );
    if (rectInside(placementBounds(platform), lot.lot)) {
      return { wall, along, length, doors, loading: true };
    }
  }
  const span = facadeSpan(baseBox, side);
  const room = span - OFFICE_CORNER_M - 1;
  const doors = dockDoors(Math.min(span * DOCK_FRONTAGE_FRACTION, room));
  const length = doors * DOCK_DOOR_CENTRES_M;
  const end = officeEnd(side, lot, null);
  return { wall: side, along: (-end * OFFICE_CORNER_M) / 2, length, doors, loading: false };
}

/**
 * A distribution centre's glazed office corner at one end of the street face,
 * half out of the wall so it reads as a block, with its canopy at the door;
 * the block shortens its projection where the car park is in the way, and
 * stands nowhere where even that does not clear.
 */
function officeCorner(
  baseBox: SetbackBox,
  side: Side,
  lot: KitLot | null,
  bank: DockBank,
  roofY: number,
): { corner: PartPlacement; canopy: PartPlacement } | null {
  const span = facadeSpan(baseBox, side);
  if (span < OFFICE_CORNER_M * 2) return null;
  const end = officeEnd(side, lot, bank.loading ? bank.wall : null);
  const along = end * (span / 2 - OFFICE_CORNER_M / 2);
  const height = Math.min(OFFICE_CORNER_HEIGHT_M, roofY - 0.4);
  const half = halfDepthTo(baseBox, side);
  for (const proud of [OFFICE_CORNER_PROUD_M, OFFICE_CORNER_PROUD_M / 2]) {
    const corner = onSide(
      'officeCorner',
      side,
      along,
      half + proud - OFFICE_CORNER_M / 2,
      OFFICE_CORNER_M,
      OFFICE_CORNER_M,
      height,
      height / 2,
    );
    const [cw, ch, cd] = OFFICE_CANOPY_SIZE_M;
    const canopy = onSide(
      'officeCanopy',
      side,
      along,
      half + proud + cd / 2,
      cw,
      cd,
      ch,
      OFFICE_CANOPY_HEIGHT_M + ch / 2,
    );
    // Only what stands out of the wall must be clear: the part inside it is the body's.
    const outside = onSide(
      'officeCorner',
      side,
      along,
      half + proud / 2,
      OFFICE_CORNER_M,
      proud,
      height,
      height / 2,
    );
    if (standsFree([outside, canopy], lot)) return { corner, canopy };
  }
  return null;
}

/** The faces of a body, each as the side it stands on and the span it runs. */
function facesOf(baseBox: SetbackBox): readonly { side: Side; span: number }[] {
  return (['N', 'S', 'E', 'W'] as const).map((s) => ({ side: s, span: facadeSpan(baseBox, s) }));
}

/** The two faces a metal building's eaves run along: the long walls. */
function eaveFaces(baseBox: SetbackBox): readonly Side[] {
  return baseBox.d > baseBox.w ? ['E', 'W'] : ['N', 'S'];
}

/** The service doors across a frontage of `span`: a workshop's one per 6 m, at most four, and a factory's two. */
export function serviceDoorCount(kind: 'workshop' | 'factory', span: number): number {
  if (kind === 'factory') return FACTORY_DOOR_COUNT;
  const fitting = Math.floor((span - 2 * WALK_DOOR_GAP_M) / SHOP_DOOR_SPACING_M);
  return Math.max(1, Math.min(SHOP_DOOR_MAX, Math.floor(span / SHOP_DOOR_SPACING_M), fitting));
}

/** A row of service doors across a frontage, centred, with a walk door at its end: the doors' centres and the walk door's. */
function doorRow(span: number, count: number): { doors: number[]; walk: number } {
  const pitch = SHOP_DOOR_SPACING_M;
  const total = count * pitch + 2 * WALK_DOOR_GAP_M;
  const start = -total / 2;
  return {
    doors: Array.from({ length: count }, (_, i) => start + pitch / 2 + i * pitch),
    walk: Math.min(span / 2 - WALK_DOOR_WIDTH_M, start + count * pitch + WALK_DOOR_GAP_M),
  };
}

/** The positions of a metal building's downspouts along an eave: at each corner and every 6 m between. */
export function downspoutPositions(length: number): number[] {
  const inset = DOWNSPOUT_M;
  const ends = length / 2 - inset;
  const out: number[] = [];
  for (let at = -ends; at < ends - 1; at += DOWNSPOUT_SPACING_M) out.push(at);
  out.push(ends);
  return out;
}

/** Where the stack's shaft stands on the roof in the building's frame, which the duct runs to; null for a building with none. */
function stackBase(
  entry: BuildingCatalogEntry,
  topBox: SetbackBox,
  buildingId: number,
): { x: number; z: number } | null {
  return hasSmokestack(entry) ? computeCornerOffset(topBox, smokestackCorner(buildingId)) : null;
}

/** The ground a plant's parts stand on, in the frame of the wall at the back of the building. */
interface Rear {
  baseBox: SetbackBox;
  side: Side;
  back: Side;
  lot: KitLot | null;
  roofY: number;
}

/** A box at the back of the building: `along` its back wall from the middle, `out` from the wall to its middle. */
function atRear(
  r: Rear,
  part: BuildingPart,
  along: number,
  out: number,
  span: number,
  depth: number,
  height: number,
  centerY: number,
): PartPlacement {
  return onSide(
    part,
    r.back,
    along,
    halfDepthTo(r.baseBox, r.back) + out,
    span,
    depth,
    height,
    centerY,
  );
}

/** How far the lot runs behind the back wall, and how far to either side along it, from the middle of the wall; unbounded without a lot. */
function rearRoom(r: Rear): { out: number; low: number; high: number } {
  if (!r.lot) return { out: Infinity, low: Infinity, high: Infinity };
  const { nx, nz } = sideNormal(r.back);
  const { lot } = r.lot;
  const alongX = isAlongX(r.back);
  const edge = alongX ? (nz > 0 ? lot.z1 : -lot.z0) : nx > 0 ? lot.x1 : -lot.x0;
  return {
    out: edge - halfDepthTo(r.baseBox, r.back),
    low: alongX ? -lot.x0 : -lot.z0,
    high: alongX ? lot.x1 : lot.z1,
  };
}

/**
 * A chemical plant's yard: a bund wall round the tank farm, a pipe rack over
 * the middle tank to the body, a bullet on saddles and a process column
 * beside the farm, each where the lot has room for it.
 */
function chemicalYard(r: Rear): PartPlacement[] {
  const out: PartPlacement[] = [];
  const room = rearRoom(r);
  const farmHalf = ((TANK_COUNT - 1) / 2) * TANK_SPACING_M + TANK_DIAMETER_M / 2;
  const farmDepth = TANK_GAP_M + TANK_DIAMETER_M;

  // The bund stands BUND_MARGIN_M outside the tanks, or as near as the lot lets it.
  const margin = Math.min(
    BUND_MARGIN_M,
    room.out - farmDepth - BUND_THICKNESS_M / 2,
    Math.min(room.low, room.high) - farmHalf - BUND_THICKNESS_M / 2,
  );
  const half = farmHalf + margin;
  if (margin >= 0.5) {
    out.push(
      atRear(
        r,
        'bundWall',
        0,
        farmDepth + margin,
        2 * half + BUND_THICKNESS_M,
        BUND_THICKNESS_M,
        BUND_HEIGHT_M,
        BUND_HEIGHT_M / 2,
      ),
    );
    for (const k of [-1, 1]) {
      out.push(
        atRear(
          r,
          'bundWall',
          k * half,
          (farmDepth + margin) / 2,
          BUND_THICKNESS_M,
          farmDepth + margin,
          BUND_HEIGHT_M,
          BUND_HEIGHT_M / 2,
        ),
      );
    }
  }

  // Two tiers over the middle tank, from the far edge of the farm to the body.
  const rackY = RACK_CLEAR_M + RACK_BEAM_M / 2;
  const topTier = rackY + RACK_TIER_GAP_M;
  for (const y of [rackY, topTier]) {
    out.push(atRear(r, 'pipeRack', 0, farmDepth / 2, RACK_WIDTH_M, farmDepth, RACK_BEAM_M, y));
  }
  const columnTop = topTier + RACK_BEAM_M / 2;
  for (let bent = RACK_COLUMN_M * 1.2; bent < farmDepth; bent += RACK_BENT_SPACING_M) {
    for (const k of [-1, 1]) {
      out.push(
        atRear(
          r,
          'pipeRack',
          (k * (RACK_WIDTH_M + RACK_COLUMN_M)) / 2,
          bent,
          RACK_COLUMN_M,
          RACK_COLUMN_M,
          columnTop,
          columnTop / 2,
        ),
      );
    }
  }

  // A bullet and a process column take the ground either side of the farm, on whichever side the lot leaves room.
  const clearOf = (p: PartPlacement | readonly PartPlacement[]): boolean => standsFree(p, r.lot);
  const bulletPieces = (along: number): PartPlacement[] => {
    const centre = BULLET_DIAMETER_M / 2 + BULLET_SADDLE_M + PLANT_GAP_M;
    const alongX = isAlongX(r.back);
    const bullet = atRear(
      r,
      'bullet',
      along,
      BULLET_DIAMETER_M / 2 + PLANT_GAP_M,
      BULLET_LENGTH_M,
      BULLET_DIAMETER_M,
      BULLET_DIAMETER_M,
      centre,
    );
    // The vessel's length runs along the wall, which is X on a back wall that faces N or S.
    const placed: PartPlacement[] = [
      {
        ...bullet,
        size: [BULLET_DIAMETER_M, BULLET_DIAMETER_M, BULLET_LENGTH_M],
        yaw: alongX ? Math.PI / 2 : 0,
      },
    ];
    for (const k of [-1, 1]) {
      placed.push(
        atRear(
          r,
          'pipeRack',
          along + k * (BULLET_LENGTH_M / 2 - 3),
          BULLET_DIAMETER_M / 2 + PLANT_GAP_M,
          0.6,
          BULLET_DIAMETER_M * 0.7,
          BULLET_SADDLE_M,
          BULLET_SADDLE_M / 2,
        ),
      );
    }
    return placed;
  };
  const columnHeight = r.roofY * COLUMN_RISE;
  const columnAt = (along: number): PartPlacement =>
    atRear(
      r,
      'processColumn',
      along,
      COLUMN_DIAMETER_M / 2 + PLANT_GAP_M,
      COLUMN_DIAMETER_M,
      COLUMN_DIAMETER_M,
      columnHeight,
      columnHeight / 2,
    );
  const bulletAlong = half + PLANT_GAP_M + BULLET_LENGTH_M / 2;
  const columnAlong = half + PLANT_GAP_M + COLUMN_DIAMETER_M / 2;
  const sides = room.high >= room.low ? [1, -1] : [-1, 1];
  const bulletSide = sides.find((k) => clearOf(bulletPieces(k * bulletAlong)));
  if (bulletSide) out.push(...bulletPieces(bulletSide * bulletAlong));
  const columnSide = [-(bulletSide ?? -1), bulletSide ?? 1].find((k) =>
    clearOf(columnAt(k * columnAlong)),
  );
  if (columnSide) out.push(columnAt(columnSide * columnAlong));
  return out;
}

/** Where a steelworks' furnace may stand, in the frame of its back wall: along it and out from it, and where each stove stands. */
interface YardSite {
  end: 1 | -1;
  furnace: readonly [number, number];
  stove: (i: number) => readonly [number, number];
}

/**
 * A steelworks' yard: the furnace at one end of the back wall, three stoves
 * in a row beside it, the skip bridge up its far side and the duct to the
 * stack, each where the lot has room; without the furnace, none of the rest
 * that hangs on it.
 */
function steelworksYard(r: Rear, stack: { x: number; z: number } | null): PartPlacement[] {
  const out: PartPlacement[] = [];
  const span = facadeSpan(r.baseBox, r.back);
  const alongX = isAlongX(r.back);
  const furnaceH = r.roofY * FURNACE_RISE;
  const stoveH = r.roofY * STOVE_RISE;
  const furnaceR = FURNACE_DIAMETER_M / 2;
  const stoveR = STOVE_DIAMETER_M / 2;
  const round = (
    part: 'furnace' | 'stove',
    a: number,
    o: number,
    diameter: number,
    height: number,
  ): PartPlacement => atRear(r, part, a, o, diameter, diameter, height, height / 2);
  /**
   * The furnace stands at one end of the hall: behind its back wall at either
   * end, or failing that beside either end wall level with the back; the stoves
   * march from it toward the middle of the wall, or toward the street.
   */
  const marched = (i: number): number =>
    furnaceR + STOVE_GAP_M + stoveR + i * (STOVE_DIAMETER_M + STOVE_GAP_M);
  const sites: YardSite[] = [];
  for (const e of [1, -1] as const) {
    const a = e * (span / 2 - furnaceR - PLANT_GAP_M);
    sites.push({
      end: e,
      furnace: [a, furnaceR + PLANT_GAP_M],
      stove: (i) => [a - e * marched(i), stoveR + PLANT_GAP_M],
    });
  }
  for (const e of [1, -1] as const) {
    const o = -(furnaceR + PLANT_GAP_M);
    sites.push({
      end: e,
      furnace: [e * (span / 2 + furnaceR + PLANT_GAP_M), o],
      stove: (i) => [e * (span / 2 + stoveR + PLANT_GAP_M), o - marched(i)],
    });
  }
  const site = sites.find((s) =>
    standsFree(round('furnace', ...s.furnace, FURNACE_DIAMETER_M, furnaceH), r.lot),
  );
  if (!site) return out;
  const end = site.end;
  const furnace = round('furnace', ...site.furnace, FURNACE_DIAMETER_M, furnaceH);
  out.push(furnace);
  for (let i = 0; i < STOVE_COUNT; i += 1) {
    const stove = round('stove', ...site.stove(i), STOVE_DIAMETER_M, stoveH);
    if (standsFree(stove, r.lot)) out.push(stove);
  }

  // The skip bridge rises to the furnace's far rim from the yard, steeper where the lot is short of room.
  const { nx, nz } = sideNormal(r.back);
  const bridgeDirs = [
    { x: alongX ? 0 : nx, z: alongX ? nz : 0 },
    { x: alongX ? end : 0, z: alongX ? 0 : end },
  ];
  const bridge = (dir: LocalPoint, pitch: number): PartPlacement => {
    const length = furnaceH / Math.sin(pitch);
    const run = furnaceH / Math.tan(pitch);
    // The top lands on the furnace's rim on the side the bridge comes from.
    const top = {
      x: furnace.offset[0] + dir.x * furnaceR,
      z: furnace.offset[2] + dir.z * furnaceR,
    };
    const mid = { x: top.x + (dir.x * run) / 2, z: top.z + (dir.z * run) / 2 };
    return {
      part: 'skipBridge',
      size: [SKIP_BRIDGE_M, SKIP_BRIDGE_M, length],
      offset: [mid.x, furnaceH / 2 + (SKIP_BRIDGE_M / 2) * Math.cos(pitch), mid.z],
      // The +Z end is the high one: turned so +Z points back at the furnace.
      yaw: Math.atan2(-dir.x, -dir.z),
      pitch,
    };
  };
  for (const dir of bridgeDirs) {
    const found = [SKIP_BRIDGE_PITCH, (70 * Math.PI) / 180, (80 * Math.PI) / 180]
      .map((p) => bridge(dir, p))
      .find(
        (b) =>
          standsFree(b, r.lot) &&
          !out.some((o) => o !== furnace && rectsOverlap(placementBounds(o), placementBounds(b))),
      );
    if (found) {
      out.push(found);
      break;
    }
  }

  // The duct runs from the furnace's flank to the stack's shaft, on the slant.
  if (stack) {
    const from = { x: furnace.offset[0], y: furnaceH - furnaceR / 2, z: furnace.offset[2] };
    const to = { x: stack.x, y: r.roofY + STACK_DUCT_HEIGHT_M, z: stack.z };
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const run = Math.hypot(dx, dz);
    const dy = to.y - from.y;
    out.push({
      part: 'duct',
      size: [DUCT_M, DUCT_M, Math.hypot(run, dy)],
      offset: [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2],
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(dy, run),
    });
  }
  return out;
}

/**
 * A paper mill's chip pile and the stacker over it, on the clear ground
 * nearest the middle of the back wall that holds the pile and the boom
 * inside the lot, clear of the body, the tank farm and the car park;
 * nothing where the lot has no such ground.
 */
function chipYard(r: Rear): PartPlacement[] {
  const radius = CHIP_PILE_DIAMETER_M / 2;
  const reach = STACKER_REACH_M;
  const back = sideNormal(r.back);
  const tanks = [...Array(TANK_COUNT).keys()].map((i) =>
    atRear(
      r,
      'tanks',
      (i - (TANK_COUNT - 1) / 2) * TANK_SPACING_M,
      TANK_GAP_M + TANK_DIAMETER_M / 2,
      TANK_DIAMETER_M,
      TANK_DIAMETER_M,
      TANK_HEIGHT_M,
      TANK_HEIGHT_M / 2,
    ),
  );
  const body = {
    x0: -r.baseBox.w / 2 - PLANT_GAP_M,
    x1: r.baseBox.w / 2 + PLANT_GAP_M,
    z0: -r.baseBox.d / 2 - PLANT_GAP_M,
    z1: r.baseBox.d / 2 + PLANT_GAP_M,
  };
  const pieces = (x: number, z: number): PartPlacement[] => {
    const pile: PartPlacement = {
      part: 'chipPile',
      size: [CHIP_PILE_DIAMETER_M, CHIP_PILE_HEIGHT_M, CHIP_PILE_DIAMETER_M],
      offset: [x, CHIP_PILE_HEIGHT_M / 2, z],
    };
    // The boom runs from the crown down to the yard on the side toward the body.
    const top = CHIP_PILE_HEIGHT_M + STACKER_M / 2;
    const length = Math.hypot(reach, top);
    const toward = { x: -back.nx, z: -back.nz };
    return [
      pile,
      {
        part: 'stacker',
        size: [STACKER_M, STACKER_M, length],
        offset: [x + (toward.x * reach) / 2, top / 2, z + (toward.z * reach) / 2],
        yaw: Math.atan2(-toward.x, -toward.z),
        pitch: Math.atan2(top, reach),
      },
    ];
  };
  const half = halfDepthTo(r.baseBox, r.back);
  const target = {
    x: back.nx * (half + reach + PLANT_GAP_M),
    z: back.nz * (half + reach + PLANT_GAP_M),
  };
  const lot = r.lot;
  if (!lot) return pieces(target.x, target.z);
  let best: { at: PartPlacement[]; cost: number } | null = null;
  for (let x = Math.ceil(lot.lot.x0 + radius); x <= lot.lot.x1 - radius; x += 1) {
    for (let z = Math.ceil(lot.lot.z0 + radius); z <= lot.lot.z1 - radius; z += 1) {
      const cost = Math.hypot(x - target.x, z - target.z);
      if (best && cost >= best.cost) continue;
      const at = pieces(x, z);
      const bounds = at.map(placementBounds);
      const pileBounds = bounds[0]!;
      if (bounds.some((b) => rectsOverlap(b, body))) continue;
      if (tanks.some((t) => rectsOverlap(placementBounds(t), pileBounds))) continue;
      if (!standsFree(at, lot)) continue;
      best = { at, cost };
    }
  }
  return best?.at ?? [];
}

// --- the apartment kit --------------------------------------------------------

/** What the apartment kit lays its parts from: the body, the podium under it where there is one, the frontage, the lot and the seed. */
interface Block {
  entry: BuildingCatalogEntry;
  baseBox: SetbackBox;
  topBox: SetbackBox;
  side: Side | null;
  lot: KitLot | null;
  buildingId: number;
  podium: SetbackBox | null;
}

/** The storeys the facade cuts a body into and each one's height: 3.2 m, but for a body that does not divide by it. */
export function storeysOf(
  entry: BuildingCatalogEntry,
  baseBox: SetbackBox,
): { rows: number; pitch: number } {
  const { rows } = windowGrid(entry, baseBox.h);
  return { rows, pitch: baseBox.h / rows };
}

/** The window bays across a face of `span`: the facade's columns, each this wide. */
export function windowBays(
  entry: BuildingCatalogEntry,
  span: number,
): { count: number; width: number } {
  const { cols } = windowGrid(entry, FLOOR_HEIGHT_METERS);
  return { count: cols, width: span / cols };
}

/** A hex colour as the 0..1 channels an instance takes. */
function rgbOf(hex: number): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** The two faces a tower's balconies run along: the longer pair, or the street's and its back on a square plan. */
function longFaces(box: SetbackBox, side: Side): readonly Side[] {
  if (box.w > box.d + 1e-9) return ['N', 'S'];
  if (box.d > box.w + 1e-9) return ['E', 'W'];
  return [side, oppositeSide(side)];
}

/**
 * A balcony on `face`: a slab `width` wide at `along` with its floor at `y`,
 * a guard across its front and, for a bay's balcony, along its sides, every
 * guard in `guardColor`: the trim colour of a painted rail, or the glazing
 * blue of a tower's glass.
 */
function balcony(
  box: SetbackBox,
  face: Side,
  along: number,
  width: number,
  y: number,
  slab: number,
  sides: boolean,
  guardColor: RGB,
): PartPlacement[] {
  const half = halfDepthTo(box, face);
  const top = y + slab;
  const out: PartPlacement[] = [
    onSide(
      'balconySlab',
      face,
      along,
      half + BALCONY_DEPTH_M / 2,
      width,
      BALCONY_DEPTH_M,
      slab,
      y + slab / 2,
    ),
    {
      ...onSide(
        'balconyGuard',
        face,
        along,
        half + BALCONY_DEPTH_M - GUARD_THICKNESS_M / 2,
        width,
        GUARD_THICKNESS_M,
        GUARD_HEIGHT_M,
        top + GUARD_HEIGHT_M / 2,
      ),
      color: guardColor,
    },
  ];
  if (!sides) return out;
  for (const s of [-1, 1]) {
    out.push({
      ...onSide(
        'balconyGuard',
        face,
        along + (s * (width - GUARD_THICKNESS_M)) / 2,
        half + BALCONY_DEPTH_M / 2,
        GUARD_THICKNESS_M,
        BALCONY_DEPTH_M,
        GUARD_HEIGHT_M,
        top + GUARD_HEIGHT_M / 2,
      ),
      color: guardColor,
    });
  }
  return out;
}

/**
 * The mail kiosk beside the walk, as near the street as the car park leaves
 * ground for it, on whichever side of the walk is free; or beside the door
 * where the lot has no walk. `prefer` says which side to try first and
 * `doorHalf` how wide the door's own parts are.
 */
function mailKiosk(b: Block, doorHalf: number, prefer: 1 | -1): PartPlacement[] {
  const { baseBox, side, lot } = b;
  if (!side) return [];
  const [w, h, d] = MAIL_KIOSK_SIZE_M;
  const alongX = isAlongX(side);
  const walk = lot?.walk ?? null;
  const half = halfDepthTo(baseBox, side);
  const candidates: PartPlacement[] = [];
  if (lot && walk) {
    const { nx, nz } = sideNormal(side);
    const edge = alongX ? (nz > 0 ? lot.lot.z1 : -lot.lot.z0) : nx > 0 ? lot.lot.x1 : -lot.lot.x0;
    const [lo, hi] = alongX ? [walk.x0, walk.x1] : [walk.z0, walk.z1];
    for (let out = edge - MAIL_KIOSK_IN_M - d / 2; out > half + d / 2; out -= MAIL_KIOSK_IN_M) {
      for (const k of [prefer, -prefer]) {
        const along = (k > 0 ? hi : lo) + k * (MAIL_KIOSK_GAP_M + w / 2);
        candidates.push(onSide('mailKiosk', side, along, out, w, d, h, h / 2, true));
      }
    }
  }
  const out = half + MAIL_KIOSK_OFF_WALL_M + d / 2;
  for (const k of [prefer, -prefer]) {
    const along = k * (doorHalf + MAIL_KIOSK_GAP_M + w / 2);
    candidates.push(onSide('mailKiosk', side, along, out, w, d, h, h / 2, true));
  }
  // The kiosk is reached from the front walk, so it may stand on it, and on nothing else that is laid.
  const blocked = (lot?.taken ?? []).filter((t) => t !== lot?.frontWalk);
  const free = candidates.find(
    (p) => standsFree(p, lot) && !blocked.some((t) => rectsOverlap(t, placementBounds(p))),
  );
  return free ? [free] : [];
}

/**
 * The storefront band across a podium's street face: a brick pier at each end
 * and every bay, the shop's bulkhead and lit glazing between them, and the
 * middle left clear for a lobby portal `portal` wide.
 */
function podiumBand(
  entry: BuildingCatalogEntry,
  podium: SetbackBox,
  side: Side,
  portal: number,
): PartPlacement[] {
  const span = facadeSpan(podium, side);
  const { count, width } = windowBays(entry, span);
  const piers: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    if (i === 0) piers.push(-span / 2 + BRICK_PIER_M / 2);
    else if (i === count) piers.push(span / 2 - BRICK_PIER_M / 2);
    else piers.push(-span / 2 + i * width);
  }
  const blocked: readonly [number, number] | null = portal > 0 ? [-portal / 2, portal / 2] : null;
  const clear = (a: number, b: number): boolean => !blocked || b <= blocked[0] || a >= blocked[1];
  const out: PartPlacement[] = [];
  for (const at of piers) {
    if (!clear(at - BRICK_PIER_M / 2, at + BRICK_PIER_M / 2)) continue;
    out.push(
      againstFacade(
        'brickPier',
        podium,
        side,
        BRICK_PIER_M,
        BRICK_PIER_PROUD_M,
        podium.h,
        podium.h / 2,
        at,
      ),
    );
  }
  for (let i = 0; i < count; i += 1) {
    const a = piers[i]! + BRICK_PIER_M / 2;
    const b = piers[i + 1]! - BRICK_PIER_M / 2;
    const pieces: (readonly [number, number])[] =
      blocked && !clear(a, b)
        ? [
            [a, Math.min(b, blocked[0])],
            [Math.max(a, blocked[1]), b],
          ]
        : [[a, b]];
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < MIN_BAND_PIECE_M) continue;
      const w = p1 - p0;
      const c = (p0 + p1) / 2;
      out.push(
        againstFacade(
          'bulkhead',
          podium,
          side,
          w,
          BULKHEAD_PROUD_M,
          BULKHEAD_HEIGHT_M,
          BULKHEAD_HEIGHT_M / 2,
          c,
        ),
        againstFacade(
          'storefrontBand',
          podium,
          side,
          w,
          STOREFRONT_PROUD_M,
          STOREFRONT_GLAZING_M,
          BULKHEAD_HEIGHT_M + STOREFRONT_GLAZING_M / 2,
          c,
        ),
      );
    }
  }
  return out;
}

/** A walk-up's hip over its eaves, the ridge along the frontage, its rise capped. */
function hipRoofOf(
  baseBox: SetbackBox,
  side: Side | null,
  baseTop: number,
  color: RGB,
): PartPlacement {
  const w = baseBox.w + 2 * HIP_EAVE_M;
  const d = baseBox.d + 2 * HIP_EAVE_M;
  const rise = Math.min(HIP_RISE_CAP_M, (HIP_PITCH * Math.min(w, d)) / 2);
  const turned = side !== null && !isAlongX(side);
  return {
    part: 'hipRoofBlock',
    size: turned ? [d, rise, w] : [w, rise, d],
    offset: [0, baseTop + rise / 2, 0],
    ...(turned ? { yaw: Math.PI / 2 } : {}),
    color,
  };
}

/** A band round every face of `box`, `height` tall with its top at `top`, `proud` of the wall, the end walls over the corners. */
function wrapFaces(
  part: BuildingPart,
  box: SetbackBox,
  proud: number,
  height: number,
  top: number,
): PartPlacement[] {
  return facesOf(box).map((face) =>
    againstFacade(
      part,
      box,
      face.side,
      face.span + (isAlongX(face.side) ? 2 * proud : 0),
      proud,
      height,
      top - height / 2,
    ),
  );
}

/**
 * The apartment kit, placed: a walk-up's hip, base and kiosk with the
 * multiplex's stoop and hood or the garden's breezeways, stairs, balconies
 * and patios; a mid-rise's storefront podium, box bays, balconies, parapet,
 * bulkhead and units; a tower's lobby, storefront podium, continuous
 * balconies, parapet and penthouse. Everything on the street face is skipped
 * where the block fronts no street. Pure.
 */
function apartmentParts(b: Block): PartPlacement[] {
  const { entry, baseBox, topBox, side, lot, buildingId } = b;
  const out: PartPlacement[] = [];
  const baseTop = baseBox.yOffset + baseBox.h;
  const roofY = topBox.yOffset + topBox.h;
  const { rows, pitch } = storeysOf(entry, baseBox);
  const roofRgb = rgbOf(roofColorHex(buildingId));
  const { wallColor } = deriveFacadeParams(entry, buildingId);
  // A rail is painted as a house's trim is: white on a dark wall, dark only on a light one.
  const railRgb = rgbOf(trimColor(buildingId, wallColor));

  if (isWalkUpEntry(entry)) {
    out.push(hipRoofOf(baseBox, side, baseTop, roofRgb));
    out.push(
      ...wrapFaces(
        'brickBase',
        baseBox,
        WALK_UP_BRICK_BASE_PROUD_M,
        WALK_UP_BRICK_BASE_HEIGHT_M,
        WALK_UP_BRICK_BASE_HEIGHT_M,
      ),
    );
  }
  if (!side) return out;
  const half = halfDepthTo(baseBox, side);

  if (entry.kind === 'multiplex') {
    out.push(
      againstFacade(
        'stoop',
        baseBox,
        side,
        STOOP_WIDTH_M,
        STOOP_DEPTH_M,
        STOOP_RISE_M,
        STOOP_RISE_M / 2,
      ),
    );
    const riser = STOOP_RISE_M / STOOP_RISERS;
    out.push(
      onSide(
        'stoop',
        side,
        0,
        half + STOOP_DEPTH_M + STOOP_TREAD_M / 2,
        STOOP_WIDTH_M,
        STOOP_TREAD_M,
        riser,
        riser / 2,
      ),
    );
    const [hw, hd] = ENTRY_HOOD_SIZE_M;
    const rise = (hw / 2) * ENTRY_HOOD_PITCH;
    out.push({
      ...onSide(
        'entryHood',
        side,
        0,
        half + hd / 2,
        hw,
        hd,
        rise,
        ENTRY_HOOD_UNDERSIDE_M + rise / 2,
        true,
      ),
      color: roofRgb,
    });
    const postH = ENTRY_HOOD_UNDERSIDE_M - STOOP_RISE_M;
    const inset = ENTRY_HOOD_POST_M / 2 + ENTRY_HOOD_POST_INSET_M;
    for (const k of [-1, 1]) {
      out.push(
        onSide(
          'signPole',
          side,
          k * (hw / 2 - inset),
          half + hd - inset,
          ENTRY_HOOD_POST_M,
          ENTRY_HOOD_POST_M,
          postH,
          STOOP_RISE_M + postH / 2,
        ),
      );
    }
    out.push(...mailKiosk(b, STOOP_WIDTH_M / 2, 1));
  }

  if (entry.kind === 'garden') {
    // The flight stands on one side of the street slot by seed, and on the other side of the rear one.
    const seedSide: 1 | -1 = buildingId % 2 === 0 ? 1 : -1;
    const faces: { face: Side; flight: 1 | -1 }[] = [
      { face: side, flight: seedSide },
      { face: oppositeSide(side), flight: seedSide === 1 ? -1 : 1 },
    ];
    for (const { face, flight } of faces) {
      const h = halfDepthTo(baseBox, face);
      const span = facadeSpan(baseBox, face);
      const alongX = isAlongX(face);
      const { nx, nz } = sideNormal(face);
      out.push(
        againstFacade(
          'breezeway',
          baseBox,
          face,
          BREEZEWAY_WIDTH_M,
          BREEZEWAY_PROUD_M,
          baseTop,
          baseTop / 2,
        ),
      );
      for (let f = 1; f < rows; f += 1) {
        const y = f * pitch;
        out.push(
          onSide(
            'landing',
            face,
            0,
            h + BREEZEWAY_PROUD_M + LANDING_DEPTH_M / 2,
            BREEZEWAY_WIDTH_M,
            LANDING_DEPTH_M,
            LANDING_THICKNESS_M,
            y + LANDING_THICKNESS_M / 2,
          ),
          {
            ...onSide(
              'landingGuard',
              face,
              0,
              h + BREEZEWAY_PROUD_M + LANDING_DEPTH_M - GUARD_THICKNESS_M / 2,
              BREEZEWAY_WIDTH_M,
              GUARD_THICKNESS_M,
              GUARD_HEIGHT_M,
              y + LANDING_THICKNESS_M + GUARD_HEIGHT_M / 2,
            ),
            color: railRgb,
          },
        );
      }
      // The flight from the ground to the first landing runs along the wall beside the slot, its top at the slot's edge.
      let stair: PartPlacement | null = null;
      if (rows > 1) {
        const run = pitch / Math.tan(STAIR_PITCH);
        const length = pitch / Math.sin(STAIR_PITCH);
        const along = flight * (BREEZEWAY_WIDTH_M / 2 + run / 2);
        const outFromWall = h + BREEZEWAY_PROUD_M + STAIR_WIDTH_M / 2;
        const toward = alongX ? { x: -flight, z: 0 } : { x: 0, z: -flight };
        stair = {
          part: 'stairFlight',
          size: [STAIR_WIDTH_M, STAIR_SLAB_M, length],
          offset: alongX
            ? [along, pitch / 2, nz * outFromWall]
            : [nx * outFromWall, pitch / 2, along],
          yaw: Math.atan2(toward.x, toward.z),
          pitch: STAIR_PITCH,
        };
        out.push(stair);
      }
      // A patio and a balcony per upper floor in every bay clear of the slot and the flight.
      const { count, width } = windowBays(entry, span);
      const stairBounds = stair ? placementBounds(stair) : null;
      for (let i = 0; i < count; i += 1) {
        const c = bayCentre(span, count, i);
        if (Math.abs(c) - width / 2 < BREEZEWAY_WIDTH_M / 2) continue;
        const bay = width - BALCONY_BAY_INSET_M;
        const patio = onSide(
          'patio',
          face,
          c,
          h + BALCONY_DEPTH_M / 2,
          bay,
          BALCONY_DEPTH_M,
          WALK_UP_BALCONY_SLAB_M,
          WALK_UP_BALCONY_SLAB_M / 2,
        );
        if (stairBounds && rectsOverlap(placementBounds(patio), stairBounds)) continue;
        if (!(lot?.taken ?? []).some((t) => rectsOverlap(t, placementBounds(patio))))
          out.push(patio);
        for (let f = 1; f < rows; f += 1) {
          out.push(
            ...balcony(baseBox, face, c, bay, f * pitch, WALK_UP_BALCONY_SLAB_M, true, railRgb),
          );
        }
      }
    }
    out.push(...mailKiosk(b, BREEZEWAY_WIDTH_M / 2, seedSide === 1 ? -1 : 1));
  }

  if (entry.kind !== 'midrise' && entry.kind !== 'tower') return out;
  const podiumBox = b.podium ?? baseBox;
  const podiumTop = b.podium ? b.podium.yOffset + b.podium.h : 0;
  out.push(...podiumBand(entry, podiumBox, side, entry.kind === 'tower' ? LOBBY_WIDTH_M : 0));
  out.push(...wrapFaces('parapetBand', baseBox, PARAPET_BAND_PROUD_M, BLOCK_PARAPET_M, baseTop));
  /** The floors above the podium: the row whose floor is the podium's top is the first. */
  const upperFloors = (): number[] => {
    const ys: number[] = [];
    for (let f = 1; f < rows; f += 1) if (f * pitch >= podiumTop - 1e-9) ys.push(f * pitch);
    return ys;
  };

  if (entry.kind === 'midrise') {
    const dark: RGB = [
      wallColor[0] * BOX_BAY_DARKEN,
      wallColor[1] * BOX_BAY_DARKEN,
      wallColor[2] * BOX_BAY_DARKEN,
    ];
    const bayTop = baseTop - BLOCK_PARAPET_M;
    for (const face of [side, oppositeSide(side)]) {
      const span = facadeSpan(baseBox, face);
      const { count, width } = windowBays(entry, span);
      const bay = width - BALCONY_BAY_INSET_M;
      for (let i = 0; i < count; i += 1) {
        const c = bayCentre(span, count, i);
        if (i % 2 === 0) {
          out.push({
            ...againstFacade(
              'boxBay',
              baseBox,
              face,
              bay,
              BOX_BAY_PROUD_M,
              bayTop - podiumTop,
              (podiumTop + bayTop) / 2,
              c,
            ),
            color: dark,
          });
        } else {
          for (const y of upperFloors()) {
            out.push(...balcony(baseBox, face, c, bay, y, BLOCK_BALCONY_SLAB_M, true, railRgb));
          }
        }
      }
    }
    const [bw, bh, bd] = ELEVATOR_BULKHEAD_SIZE_M;
    const bulkhead = onSide(
      'elevatorBulkhead',
      side,
      0,
      halfDepthTo(topBox, side) - ROOF_SETBACK_FROM_STREET_M - bd / 2,
      bw,
      bd,
      bh,
      roofY + bh / 2,
    );
    out.push(bulkhead);
    const bulk = placementBounds(bulkhead);
    out.push(
      ...roofEquipment(topBox, roofY, side, null, true).filter(
        (p) => !rectsOverlap(placementBounds(p), bulk),
      ),
    );
  }

  if (entry.kind === 'tower') {
    out.push(
      againstFacade(
        'lobbyPortal',
        podiumBox,
        side,
        LOBBY_WIDTH_M,
        LOBBY_PROJECT_M,
        LOBBY_HEIGHT_M,
        LOBBY_HEIGHT_M / 2,
      ),
    );
    for (const face of longFaces(baseBox, side)) {
      const span = facadeSpan(baseBox, face) - 2 * TOWER_BALCONY_END_M;
      for (const y of upperFloors()) {
        out.push(...balcony(baseBox, face, 0, span, y, BLOCK_BALCONY_SLAB_M, false, GLAZING_BLUE));
      }
    }
    const share = Math.sqrt(PENTHOUSE_PLATE_SHARE);
    const pw = topBox.w * share;
    const pd = topBox.d * share;
    const across = isAlongX(side) ? pd : pw;
    out.push(
      onSide(
        'penthouse',
        side,
        0,
        halfDepthTo(topBox, side) - ROOF_SETBACK_FROM_STREET_M - across / 2,
        isAlongX(side) ? pw : pd,
        across,
        PENTHOUSE_HEIGHT_M,
        roofY + PENTHOUSE_HEIGHT_M / 2,
      ),
    );
  }
  return out;
}

/**
 * Every part this building's archetype calls for, placed. `topBox` carries the
 * roof parts, `baseBox` the facade ones; `side` is the frontage, without which
 * a dock or a canopy would face nothing and is skipped. `lot` is the building's
 * car park where it parks one to code: the parts that stand on the lot (a
 * pylon at the drive, cart corrals, a drive-through) need it, and stand
 * nowhere without it. `buildingId` finds the stack a steelworks' duct runs to
 * and seeds the apartment kit; `podium` is the tier under a block's slab,
 * which its storefront band and lobby stand against.
 */
export function computePartPlacements(
  entry: BuildingCatalogEntry,
  baseBox: SetbackBox,
  topBox: SetbackBox,
  side: Side | null,
  lot: KitLot | null = null,
  buildingId: number | null = null,
  podium: SetbackBox | null = null,
): PartPlacement[] {
  const out: PartPlacement[] = [];
  const roofY = topBox.yOffset + topBox.h;
  const baseTop = baseBox.yOffset + baseBox.h;
  const parts = partsFor(entry);
  let block: PartPlacement[] | null = null;
  const blockOf = (part: BuildingPart): PartPlacement[] => {
    if (!block) {
      block = isApartmentEntry(entry)
        ? apartmentParts({ entry, baseBox, topBox, side, lot, buildingId: buildingId ?? 0, podium })
        : [];
    }
    return block.filter((p) => p.part === part);
  };
  if (isApartmentEntry(entry)) {
    for (const part of parts) out.push(...blockOf(part));
    return lot
      ? out.filter((p) => !LOT_BOUND_PARTS.has(p.part) || rectInside(placementBounds(p), lot.lot))
      : out;
  }
  // Doors stand on the dock where there is one, and on the ground where not.
  const doorSill = parts.includes('loadingDock') ? DOCK_HEIGHT_M : 0;
  const span = side ? facadeSpan(baseBox, side) : 0;
  // A kind's dock bank stands on the lot's loading side; a kindless one keeps the old dock on the street face.
  const bank =
    side && entry.kind && parts.includes('loadingDock') ? dockBankOf(baseBox, side, lot) : null;
  const office = bank && side ? officeCorner(baseBox, side, lot, bank, roofY) : null;
  const rear: Rear | null = side ? { baseBox, side, back: oppositeSide(side), lot, roofY } : null;
  let yard: PartPlacement[] | null = null;
  const yardOf = (part: BuildingPart): PartPlacement[] => {
    if (!rear) return [];
    if (!yard) {
      if (entry.kind === 'chemical') yard = chemicalYard(rear);
      else if (entry.kind === 'metals') {
        const stack = buildingId === null ? null : stackBase(entry, topBox, buildingId);
        yard = steelworksYard(rear, stack);
      } else if (entry.kind === 'paper') yard = chipYard(rear);
      else yard = [];
    }
    return yard.filter((p) => p.part === part);
  };

  for (const part of parts) {
    switch (part) {
      case 'monitorRoof': {
        const alongZ = topBox.d >= topBox.w;
        const w = alongZ ? topBox.w * MONITOR_WIDTH_FRACTION : topBox.w * MONITOR_LENGTH_FRACTION;
        const d = alongZ ? topBox.d * MONITOR_LENGTH_FRACTION : topBox.d * MONITOR_WIDTH_FRACTION;
        out.push({
          part,
          size: [w, MONITOR_HEIGHT_M, d],
          offset: [0, roofY + MONITOR_HEIGHT_M / 2, 0],
        });
        break;
      }
      case 'roofArray': {
        out.push({
          part,
          size: [topBox.w * ARRAY_INSET_FRACTION, ARRAY_HEIGHT_M, topBox.d * ARRAY_INSET_FRACTION],
          offset: [0, roofY + ARRAY_HEIGHT_M / 2, 0],
        });
        break;
      }
      case 'loadingDock': {
        if (!side) break;
        if (bank) {
          out.push(
            againstFacade(
              part,
              baseBox,
              bank.wall,
              bank.length,
              DOCK_DEPTH_M,
              DOCK_HEIGHT_M,
              DOCK_HEIGHT_M / 2,
              bank.along,
            ),
          );
          break;
        }
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            span * DOCK_FRONTAGE_FRACTION,
            DOCK_DEPTH_M,
            DOCK_HEIGHT_M,
            DOCK_HEIGHT_M / 2,
          ),
        );
        break;
      }
      case 'rollUpDoors': {
        if (!side) break;
        if (bank) {
          // The dock bank's doors, 9 × 10 ft at 14 ft centres along the platform.
          for (let i = 0; i < bank.doors; i += 1) {
            const along = bank.along + (i - (bank.doors - 1) / 2) * DOCK_DOOR_CENTRES_M;
            out.push(
              againstFacade(
                part,
                baseBox,
                bank.wall,
                DOCK_DOOR_WIDTH_M,
                DOOR_THICKNESS_M,
                DOCK_DOOR_HEIGHT_M,
                DOCK_HEIGHT_M + DOCK_DOOR_HEIGHT_M / 2,
                along,
              ),
            );
          }
          break;
        }
        if (entry.kind === 'workshop' || entry.kind === 'factory') {
          // Service bays on the ground: a workshop's one 10 ft door per 6 m of frontage, a factory's two 12 ft.
          const door = entry.kind === 'factory' ? FACTORY_DOOR_M : SHOP_DOOR_M;
          const count = serviceDoorCount(entry.kind, span);
          for (const along of doorRow(span, count).doors) {
            out.push(
              againstFacade(part, baseBox, side, door, DOOR_THICKNESS_M, door, door / 2, along),
            );
          }
          break;
        }
        const { nx, nz } = sideNormal(side);
        const outDist = halfDepthTo(baseBox, side) + DOOR_THICKNESS_M / 2;
        const alongX = isAlongX(side);
        // Doors sit on their sill, evenly spaced across the frontage.
        const usable = span * DOCK_FRONTAGE_FRACTION;
        const pitch = usable / DOOR_COUNT;
        for (let i = 0; i < DOOR_COUNT; i += 1) {
          const along = -usable / 2 + (i + 0.5) * pitch;
          const width = Math.min(DOOR_WIDTH_M, pitch * 0.8);
          out.push({
            part,
            size: alongX
              ? [width, DOOR_HEIGHT_M, DOOR_THICKNESS_M]
              : [DOOR_THICKNESS_M, DOOR_HEIGHT_M, width],
            offset: [
              alongX ? along : nx * outDist,
              doorSill + DOOR_HEIGHT_M / 2,
              alongX ? nz * outDist : along,
            ],
          });
        }
        break;
      }
      case 'tanks': {
        if (!side) break;
        const back = oppositeSide(side);
        const { nx, nz } = sideNormal(back);
        const alongX = back === 'N' || back === 'S';
        const outDist = halfDepthTo(baseBox, back) + TANK_GAP_M + TANK_DIAMETER_M / 2;
        for (let i = 0; i < TANK_COUNT; i += 1) {
          const along = (i - (TANK_COUNT - 1) / 2) * TANK_SPACING_M;
          out.push({
            part,
            size: [TANK_DIAMETER_M, TANK_HEIGHT_M, TANK_DIAMETER_M],
            offset: [
              alongX ? along : nx * outDist,
              TANK_HEIGHT_M / 2,
              alongX ? nz * outDist : along,
            ],
          });
        }
        break;
      }
      case 'canopy': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            span * CANOPY_FRONTAGE_FRACTION,
            CANOPY_DEPTH_M,
            CANOPY_THICKNESS_M,
            CANOPY_HEIGHT_M,
          ),
        );
        break;
      }
      case 'signageBand': {
        if (!side) break;
        // A strip signs each tenant: a band a bay, and one two bays wide for the anchor.
        // A supermarket's runs along either side of its entry tower.
        const tenants =
          entry.kind === 'strip'
            ? stripTenants(span, lot, side)
            : entry.kind === 'supermarket'
              ? towerWings(span)
              : [{ along: 0, width: span }];
        for (const t of tenants) {
          out.push(
            againstFacade(
              part,
              baseBox,
              side,
              t.width * SIGN_FRONTAGE_FRACTION,
              SIGN_THICKNESS_M,
              SIGN_HEIGHT_M,
              SIGN_CENTRE_Y_M,
              t.along,
            ),
          );
        }
        break;
      }
      case 'bulkhead': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            span,
            BULKHEAD_PROUD_M,
            BULKHEAD_HEIGHT_M,
            BULKHEAD_HEIGHT_M / 2,
          ),
        );
        break;
      }
      case 'awning': {
        if (!side) break;
        // A shop or restaurant has an awning a bay; a filling station one over the kiosk door.
        const fuel = entry.kind === 'fuel';
        const bays = fuel
          ? { count: 1, width: KIOSK_AWNING_WIDTH_M + AWNING_GAP_M }
          : baysOf(span, SHOP_BAY_M);
        for (let i = 0; i < bays.count; i += 1) {
          out.push(
            onSide(
              part,
              side,
              fuel ? 0 : bayCentre(span, bays.count, i),
              halfDepthTo(baseBox, side) + AWNING_OUT_M / 2,
              bays.width - AWNING_GAP_M,
              AWNING_OUT_M,
              AWNING_HEIGHT_M,
              AWNING_UNDERSIDE_M + AWNING_HEIGHT_M / 2,
              true,
            ),
          );
        }
        break;
      }
      case 'cornice': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            span,
            CORNICE_DEPTH_M,
            CORNICE_HEIGHT_M,
            baseTop - CORNICE_HEIGHT_M / 2,
          ),
        );
        break;
      }
      case 'stripCanopy': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            span,
            STRIP_CANOPY_DEPTH_M,
            STRIP_CANOPY_FASCIA_M,
            STRIP_CANOPY_UNDERSIDE_M + STRIP_CANOPY_FASCIA_M / 2,
          ),
        );
        break;
      }
      case 'stripColumn': {
        if (!side) break;
        const count = Math.ceil(span / STRIP_COLUMN_SPACING_M) + 1;
        const reach = span - STRIP_COLUMN_M;
        for (let i = 0; i < count; i += 1) {
          out.push(
            onSide(
              part,
              side,
              -reach / 2 + (i * reach) / (count - 1),
              halfDepthTo(baseBox, side) + STRIP_CANOPY_DEPTH_M - STRIP_COLUMN_M / 2,
              STRIP_COLUMN_M,
              STRIP_COLUMN_M,
              STRIP_CANOPY_UNDERSIDE_M,
              STRIP_CANOPY_UNDERSIDE_M / 2,
            ),
          );
        }
        break;
      }
      case 'anchorParapet': {
        if (!side) break;
        // A stepped parapet is a wall on the roof's edge, flush with the street face.
        const wallOut = halfDepthTo(baseBox, side) - PARAPET_THICKNESS_M / 2;
        if (entry.kind === 'strip') {
          const anchor = stripTenants(span, lot, side)[0]!;
          out.push(
            onSide(
              part,
              side,
              anchor.along,
              wallOut,
              anchor.width,
              PARAPET_THICKNESS_M,
              ANCHOR_STEP_M,
              baseTop + ANCHOR_STEP_M / 2,
            ),
          );
        } else {
          // A supermarket's parapet steps up either side of its tower.
          const step = (ENTRY_PARAPET_RISE - 1) * entry.height;
          for (const dir of [-1, 1]) {
            const from = TOWER_WIDTH_M / 2;
            const to = Math.min(from + ENTRY_WING_M, span / 2);
            if (to <= from) continue;
            out.push(
              onSide(
                part,
                side,
                (dir * (from + to)) / 2,
                wallOut,
                to - from,
                PARAPET_THICKNESS_M,
                step,
                baseTop + step / 2,
              ),
            );
          }
        }
        break;
      }
      case 'pylon': {
        if (!side || !lot) break;
        const stand = signStand(side, lot, PYLON_WIDTH_M, PYLON_POLE_M);
        if (!stand) break;
        out.push(
          ...signOnPole(
            part,
            side,
            stand,
            PYLON_WIDTH_M,
            PYLON_CABINET_M,
            PYLON_POLE_M,
            PYLON_POLE_M,
          ),
        );
        break;
      }
      case 'entryTower': {
        if (!side) break;
        const height = TOWER_RISE * entry.height;
        out.push(
          onSide(
            part,
            side,
            0,
            halfDepthTo(baseBox, side) + TOWER_PROJECT_M - TOWER_DEPTH_M / 2,
            TOWER_WIDTH_M,
            TOWER_DEPTH_M,
            height,
            height / 2,
          ),
        );
        break;
      }
      case 'towerGlazing': {
        if (!side) break;
        // On the tower's front face, which stands TOWER_PROJECT_M proud of the wall.
        out.push(
          onSide(
            part,
            side,
            0,
            halfDepthTo(baseBox, side) + TOWER_PROJECT_M + GLAZING_THICKNESS_M / 2,
            GLAZING_WIDTH_M,
            GLAZING_THICKNESS_M,
            GLAZING_HEIGHT_M,
            0.2 + GLAZING_HEIGHT_M / 2,
          ),
        );
        break;
      }
      case 'brickBase': {
        if (!side) break;
        // Across the street face on either side of the entry tower, which stands in front of it.
        for (const wing of towerWings(span)) {
          out.push(
            againstFacade(
              part,
              baseBox,
              side,
              wing.width,
              BRICK_BASE_PROUD_M,
              BRICK_BASE_HEIGHT_M,
              BRICK_BASE_HEIGHT_M / 2,
              wing.along,
            ),
          );
        }
        break;
      }
      case 'cartCorral': {
        if (!side || !lot) break;
        // The two islands nearest the entrance whose corral clears the entry tower and the brick base.
        const wall = {
          x0: -baseBox.w / 2 - BRICK_BASE_PROUD_M,
          x1: baseBox.w / 2 + BRICK_BASE_PROUD_M,
          z0: -baseBox.d / 2 - BRICK_BASE_PROUD_M,
          z1: baseBox.d / 2 + BRICK_BASE_PROUD_M,
        };
        const tower = placementBounds(
          onSide(
            'entryTower',
            side,
            0,
            halfDepthTo(baseBox, side) + TOWER_PROJECT_M - TOWER_DEPTH_M / 2,
            TOWER_WIDTH_M,
            TOWER_DEPTH_M,
            1,
            0,
          ),
        );
        const corrals = lot.islands
          .map(corralIn)
          .filter((c) =>
            c.every(
              (p) =>
                !rectsOverlap(placementBounds(p), tower) && !rectsOverlap(placementBounds(p), wall),
            ),
          );
        for (const corral of corrals.slice(0, 2)) out.push(...corral);
        break;
      }
      case 'menuBoard':
      case 'clearanceBar':
      case 'pickupCanopy': {
        if (!side || !lot?.lane) break;
        // The lane's parts are laid together, once, under the menu board.
        if (part === 'menuBoard') out.push(...laneParts(lot.lane));
        break;
      }
      case 'dumpsterEnclosure': {
        if (!side || !lot?.lane) break;
        const spot = dumpsterSpot(baseBox, side, lot);
        if (spot) out.push(...dumpsterWalls(spot.centre, spot.away));
        break;
      }
      case 'fuelCanopy': {
        if (!side) break;
        const { nx, nz } = sideNormal(side);
        const alongX = isAlongX(side);
        const canopySpan = span * FUEL_CANOPY_FRONTAGE_FRACTION;
        const centreOut = halfDepthTo(baseBox, side) + FUEL_CANOPY_GAP_M + FUEL_CANOPY_DEPTH_M / 2;
        const slabY = FUEL_CANOPY_HEIGHT_M + FUEL_CANOPY_THICKNESS_M / 2;
        out.push({
          part,
          size: alongX
            ? [canopySpan, FUEL_CANOPY_THICKNESS_M, FUEL_CANOPY_DEPTH_M]
            : [FUEL_CANOPY_DEPTH_M, FUEL_CANOPY_THICKNESS_M, canopySpan],
          offset: [nx * centreOut, slabY, nz * centreOut],
        });
        // Four posts, inset from the canopy's corners.
        const halfSpan = canopySpan / 2 - FUEL_POST_INSET_M;
        const halfDepth = FUEL_CANOPY_DEPTH_M / 2 - FUEL_POST_INSET_M;
        for (const a of [-1, 1]) {
          for (const d of [-1, 1]) {
            const along = a * halfSpan;
            const outDist = centreOut + d * halfDepth;
            out.push({
              part,
              size: [FUEL_POST_M, FUEL_CANOPY_HEIGHT_M, FUEL_POST_M],
              offset: [
                alongX ? along : nx * outDist,
                FUEL_CANOPY_HEIGHT_M / 2,
                alongX ? nz * outDist : along,
              ],
            });
          }
        }
        break;
      }
      case 'fuelFascia': {
        if (!side) break;
        const canopySpan = span * FUEL_CANOPY_FRONTAGE_FRACTION;
        const near = halfDepthTo(baseBox, side) + FUEL_CANOPY_GAP_M;
        const centreY = FUEL_CANOPY_HEIGHT_M + FUEL_FASCIA_HEIGHT_M / 2;
        const t = FUEL_FASCIA_THICKNESS_M;
        // The band runs round the slab's edge, outside it: kiosk end and street end, and both sides.
        for (const edge of [near - t / 2, near + FUEL_CANOPY_DEPTH_M + t / 2]) {
          out.push(
            onSide(part, side, 0, edge, canopySpan + 2 * t, t, FUEL_FASCIA_HEIGHT_M, centreY),
          );
        }
        for (const a of [-1, 1]) {
          out.push(
            onSide(
              part,
              side,
              (a * (canopySpan + t)) / 2,
              near + FUEL_CANOPY_DEPTH_M / 2,
              t,
              FUEL_CANOPY_DEPTH_M,
              FUEL_FASCIA_HEIGHT_M,
              centreY,
            ),
          );
        }
        break;
      }
      case 'fuelIsland':
      case 'dispenser':
      case 'bollard': {
        if (!side) break;
        out.push(...islandPart(part, baseBox, side));
        break;
      }
      case 'priceSign': {
        if (!side || !lot) break;
        const stand = signStand(side, lot, PRICE_SIGN_WIDTH_M, PRICE_SIGN_POLE_M);
        if (!stand) break;
        out.push(
          ...signOnPole(
            part,
            side,
            stand,
            PRICE_SIGN_WIDTH_M,
            PRICE_SIGN_HEIGHT_M,
            PRICE_SIGN_POLE_M,
            PRICE_SIGN_POLE_M,
          ),
        );
        break;
      }
      case 'lobbyPortal': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            LOBBY_WIDTH_M,
            LOBBY_PROJECT_M,
            LOBBY_HEIGHT_M,
            LOBBY_HEIGHT_M / 2,
          ),
        );
        break;
      }
      case 'porteCochere': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            PORTE_COCHERE_WIDTH_M,
            PORTE_COCHERE_DEPTH_M,
            PORTE_COCHERE_THICKNESS_M,
            PORTE_COCHERE_UNDERSIDE_M + PORTE_COCHERE_THICKNESS_M / 2,
          ),
        );
        const inset = PORTE_COLUMN_M;
        for (const a of [-1, 1]) {
          for (const d of [0, 1]) {
            out.push(
              onSide(
                part,
                side,
                (a * (PORTE_COCHERE_WIDTH_M - PORTE_COLUMN_M)) / 2,
                halfDepthTo(baseBox, side) +
                  inset +
                  PORTE_COLUMN_M / 2 +
                  d * (PORTE_COCHERE_DEPTH_M - 2 * inset - PORTE_COLUMN_M),
                PORTE_COLUMN_M,
                PORTE_COLUMN_M,
                PORTE_COCHERE_UNDERSIDE_M,
                PORTE_COCHERE_UNDERSIDE_M / 2,
              ),
            );
          }
        }
        break;
      }
      case 'roofScreen':
      case 'coolingTower': {
        // The mechanical screen stands 2 m in from the street edge of the top tier, the cooling tower behind it.
        const roofSide = side ?? 'S';
        const halfOut = (isAlongX(roofSide) ? topBox.d : topBox.w) / 2;
        const [tw, th, td] = COOLING_TOWER_SIZE_M;
        const screenOut = halfOut - ROOF_INSET_M - SCREEN_THICKNESS_M / 2;
        out.push(
          part === 'roofScreen'
            ? onSide(
                part,
                roofSide,
                0,
                screenOut,
                tw + 2,
                SCREEN_THICKNESS_M,
                SCREEN_HEIGHT_M,
                roofY + SCREEN_HEIGHT_M / 2,
              )
            : onSide(
                part,
                roofSide,
                0,
                screenOut - SCREEN_THICKNESS_M / 2 - td / 2,
                tw,
                td,
                th,
                roofY + th / 2,
              ),
        );
        break;
      }
      case 'rooftopUnit': {
        out.push(
          ...roofEquipment(topBox, roofY, side, lot?.dock ?? null, true).filter(
            (p) => p.part === 'rooftopUnit',
          ),
        );
        break;
      }
      case 'roofHatch': {
        out.push(
          ...roofEquipment(topBox, roofY, side, null, false).filter((p) => p.part === 'roofHatch'),
        );
        break;
      }
      case 'signPole':
        // Poles are placed with the sign, board, bar or corral they hold up.
        break;
      case 'wainscot': {
        if (!side) break;
        // A metal building's wainscot runs round every face, the end walls over the corners.
        for (const face of facesOf(baseBox)) {
          const corner = isAlongX(face.side) ? 2 * WAINSCOT_PROUD_M : 0;
          out.push(
            againstFacade(
              part,
              baseBox,
              face.side,
              face.span + corner,
              WAINSCOT_PROUD_M,
              WAINSCOT_HEIGHT_M,
              WAINSCOT_HEIGHT_M / 2,
            ),
          );
        }
        break;
      }
      case 'walkDoor': {
        if (!side || (entry.kind !== 'workshop' && entry.kind !== 'factory')) break;
        const count = serviceDoorCount(entry.kind, span);
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            WALK_DOOR_WIDTH_M,
            DOOR_THICKNESS_M,
            WALK_DOOR_HEIGHT_M,
            WALK_DOOR_HEIGHT_M / 2,
            doorRow(span, count).walk,
          ),
        );
        break;
      }
      case 'gutter': {
        if (!side) break;
        for (const eave of eaveFaces(baseBox)) {
          out.push(
            againstFacade(
              part,
              baseBox,
              eave,
              facadeSpan(baseBox, eave),
              GUTTER_M,
              GUTTER_M,
              baseTop - GUTTER_M / 2,
            ),
          );
        }
        break;
      }
      case 'downspout': {
        if (!side) break;
        for (const eave of eaveFaces(baseBox)) {
          for (const along of downspoutPositions(facadeSpan(baseBox, eave))) {
            out.push(
              againstFacade(
                part,
                baseBox,
                eave,
                DOWNSPOUT_M,
                DOWNSPOUT_M,
                baseTop - GUTTER_M,
                (baseTop - GUTTER_M) / 2,
                along,
              ),
            );
          }
        }
        break;
      }
      case 'ridgeVent': {
        const alongZ = topBox.d > topBox.w;
        const length = (alongZ ? topBox.d : topBox.w) - 1;
        const width = RIDGE_VENT_THROAT_M + 2 * RIDGE_VENT_CAP_M;
        out.push({
          part,
          size: alongZ
            ? [width, RIDGE_VENT_HEIGHT_M, length]
            : [length, RIDGE_VENT_HEIGHT_M, width],
          offset: [0, roofY + RIDGE_VENT_HEIGHT_M / 2, 0],
        });
        break;
      }
      case 'dockShelter': {
        if (!bank) break;
        const half = halfDepthTo(baseBox, bank.wall);
        const frameTop = DOCK_HEIGHT_M + DOCK_DOOR_HEIGHT_M + SHELTER_FRAME_M;
        for (let i = 0; i < bank.doors; i += 1) {
          const along = bank.along + (i - (bank.doors - 1) / 2) * DOCK_DOOR_CENTRES_M;
          const jamb = (DOCK_DOOR_WIDTH_M + SHELTER_FRAME_M) / 2;
          for (const k of [-1, 1]) {
            out.push(
              onSide(
                part,
                bank.wall,
                along + k * jamb,
                half + SHELTER_PROUD_M / 2,
                SHELTER_FRAME_M,
                SHELTER_PROUD_M,
                frameTop - DOCK_HEIGHT_M,
                (frameTop + DOCK_HEIGHT_M) / 2,
              ),
            );
          }
          out.push(
            onSide(
              part,
              bank.wall,
              along,
              half + SHELTER_PROUD_M / 2,
              DOCK_DOOR_WIDTH_M + 2 * SHELTER_FRAME_M,
              SHELTER_PROUD_M,
              SHELTER_FRAME_M,
              frameTop - SHELTER_FRAME_M / 2,
            ),
          );
        }
        break;
      }
      case 'dockBumper': {
        if (!bank) break;
        const [bw, bh, bd] = BUMPER_SIZE_M;
        const faceOut = halfDepthTo(baseBox, bank.wall) + DOCK_DEPTH_M + bd / 2;
        for (let i = 0; i < bank.doors; i += 1) {
          const along = bank.along + (i - (bank.doors - 1) / 2) * DOCK_DOOR_CENTRES_M;
          for (const k of [-1, 1]) {
            out.push(
              onSide(
                part,
                bank.wall,
                along + k * BUMPER_OFFSET_M,
                faceOut,
                bw,
                bd,
                bh,
                DOCK_HEIGHT_M - bh / 2 - 0.05,
              ),
            );
          }
        }
        break;
      }
      case 'dockLight': {
        if (!bank) break;
        const [lw, lh, ld] = DOCK_LIGHT_SIZE_M;
        const half = halfDepthTo(baseBox, bank.wall);
        const y = DOCK_HEIGHT_M + DOCK_DOOR_HEIGHT_M + SHELTER_FRAME_M + DOCK_LIGHT_ABOVE_M;
        for (let i = 0; i < bank.doors; i += 1) {
          const along = bank.along + (i - (bank.doors - 1) / 2) * DOCK_DOOR_CENTRES_M;
          out.push(onSide(part, bank.wall, along, half + ld / 2, lw, ld, lh, y));
        }
        break;
      }
      case 'officeCorner':
        if (office) out.push(office.corner);
        break;
      case 'officeCanopy':
        if (office) out.push(office.canopy);
        break;
      case 'panelReveal': {
        if (!side) break;
        // A dark strip every 25 ft panel on every face, left out behind the dock, the office and anything else standing on the wall.
        const standing = out.map(placementBounds);
        for (const face of facesOf(baseBox)) {
          for (
            let at = -face.span / 2 + PANEL_REVEAL_SPACING_M;
            at < face.span / 2 - 1;
            at += PANEL_REVEAL_SPACING_M
          ) {
            const strip = againstFacade(
              part,
              baseBox,
              face.side,
              PANEL_REVEAL_WIDTH_M,
              PANEL_REVEAL_PROUD_M,
              baseTop,
              baseTop / 2,
              at,
            );
            if (!standing.some((b) => rectsOverlap(b, placementBounds(strip)))) out.push(strip);
          }
        }
        break;
      }
      case 'parapetBand': {
        if (!side) break;
        for (const face of facesOf(baseBox)) {
          const corner = isAlongX(face.side) ? 2 * PARAPET_BAND_PROUD_M : 0;
          out.push(
            againstFacade(
              part,
              baseBox,
              face.side,
              face.span + corner,
              PARAPET_BAND_PROUD_M,
              PARAPET_BAND_HEIGHT_M,
              baseTop - PARAPET_BAND_HEIGHT_M / 2,
            ),
          );
        }
        break;
      }
      case 'clerestory': {
        // A lit band 0.6 m tall on each long side of the monitor, at the middle of its height.
        const alongZ = topBox.d >= topBox.w;
        const w = alongZ ? topBox.w * MONITOR_WIDTH_FRACTION : topBox.w * MONITOR_LENGTH_FRACTION;
        const d = alongZ ? topBox.d * MONITOR_LENGTH_FRACTION : topBox.d * MONITOR_WIDTH_FRACTION;
        for (const k of [-1, 1]) {
          out.push({
            part,
            size: alongZ
              ? [CLERESTORY_PROUD_M, CLERESTORY_HEIGHT_M, d]
              : [w, CLERESTORY_HEIGHT_M, CLERESTORY_PROUD_M],
            offset: [
              alongZ ? k * (w / 2 + CLERESTORY_PROUD_M / 2) : 0,
              roofY + MONITOR_HEIGHT_M / 2,
              alongZ ? 0 : k * (d / 2 + CLERESTORY_PROUD_M / 2),
            ],
          });
        }
        break;
      }
      case 'entryCanopy': {
        if (!side) break;
        const [cw, ch, cd] = ENTRY_CANOPY_SIZE_M;
        out.push(againstFacade(part, baseBox, side, cw, cd, ch, ENTRY_CANOPY_HEIGHT_M + ch / 2));
        break;
      }
      case 'condenser': {
        if (!bank) break;
        // Two evaporative condensers on the roof by the dock side, 2 m in from the parapet.
        const [cw, ch, cd] = CONDENSER_SIZE_M;
        const alongX = isAlongX(bank.wall);
        const spanTop = alongX ? topBox.w : topBox.d;
        const reach = spanTop / 2 - ROOF_INSET_M - cw - 0.5;
        if (reach < 0) break;
        const halfOut = (alongX ? topBox.d : topBox.w) / 2;
        const centre = Math.max(-reach, Math.min(reach, bank.along));
        for (const k of [-1, 1]) {
          out.push(
            onSide(
              part,
              bank.wall,
              centre + k * (cw / 2 + 0.5),
              halfOut - ROOF_INSET_M - cd / 2,
              cw,
              cd,
              ch,
              roofY + ch / 2,
            ),
          );
        }
        break;
      }
      case 'bundWall':
      case 'bullet':
      case 'pipeRack':
      case 'processColumn':
      case 'furnace':
      case 'stove':
      case 'skipBridge':
      case 'duct':
      case 'chipPile':
      case 'stacker':
        out.push(...yardOf(part));
        break;
    }
  }
  // What wraps the walls is proud of them, so a wall on the lot line leaves it off.
  if (!lot) return out;
  return out.filter((p) => !WALL_WRAP_PARTS.has(p.part) || rectInside(placementBounds(p), lot.lot));
}

/** The parts that stand proud on every face of the body, where the lot is as wide as the body. */
const WALL_WRAP_PARTS: ReadonlySet<BuildingPart> = new Set<BuildingPart>([
  'wainscot',
  'gutter',
  'downspout',
  'panelReveal',
  'parapetBand',
]);

/**
 * The apartment kit's parts that hang off a wall or stand on the ground, which
 * a body on its lot line leaves off that side rather than reach over it. The
 * hip and its eaves, the roof parts and the podium's band stay: they are the
 * building's silhouette.
 */
const LOT_BOUND_PARTS: ReadonlySet<BuildingPart> = new Set<BuildingPart>([
  'breezeway',
  'landing',
  'landingGuard',
  'stairFlight',
  'balconySlab',
  'balconyGuard',
  'patio',
  'boxBay',
  'stoop',
  'entryHood',
  'signPole',
  'mailKiosk',
  'brickBase',
  'parapetBand',
]);

/** The two stretches of a supermarket's frontage either side of its entry tower. */
function towerWings(span: number): { along: number; width: number }[] {
  const width = (span - TOWER_WIDTH_M) / 2;
  if (width <= 0) return [];
  return [-1, 1].map((k) => ({ along: (k * (TOWER_WIDTH_M + width)) / 2, width }));
}

/** The tenants of a strip along its frontage, anchor first: where each stands and how wide. */
export function stripTenants(
  span: number,
  lot: KitLot | null,
  side: Side,
): { along: number; width: number }[] {
  const { count, width } = baysOf(span, STRIP_BAY_M);
  const anchorBays = Math.min(ANCHOR_BAYS, count);
  // The anchor takes the end away from the drive.
  const alongX = isAlongX(side);
  const cut = lot?.curbCut;
  const driveAlong = cut ? (alongX ? cut.x0 + cut.x1 : cut.z0 + cut.z1) / 2 : 0;
  const anchorLow = driveAlong > 0;
  const tenants = [
    {
      along: (anchorLow ? -1 : 1) * (span / 2 - (anchorBays * width) / 2),
      width: anchorBays * width,
    },
  ];
  const first = anchorLow ? anchorBays : 0;
  for (let i = 0; i < count - anchorBays; i += 1) {
    tenants.push({ along: bayCentre(span, count, first + i), width });
  }
  return tenants;
}

/** A cart corral standing in a planted island: two long rails and an end rail, a sign post at the other end. */
function corralIn(island: LocalRect): PartPlacement[] {
  const cx = (island.x0 + island.x1) / 2;
  const cz = (island.z0 + island.z1) / 2;
  const alongX = island.x1 - island.x0 >= island.z1 - island.z0;
  const long = CORRAL_LENGTH_M;
  const wide = CORRAL_WIDTH_M;
  const t = CORRAL_RAIL_THICKNESS_M;
  const rail = (along: number, across: number, l: number, w: number): PartPlacement =>
    atPoint(
      'cartCorral',
      cx + (alongX ? along : across),
      cz + (alongX ? across : along),
      alongX ? l : w,
      alongX ? w : l,
      CORRAL_RAIL_M,
      CORRAL_RAIL_M / 2,
    );
  return [
    rail(0, (wide - t) / 2, long, t),
    rail(0, -(wide - t) / 2, long, t),
    rail((long - t) / 2, 0, t, wide - 2 * t),
    atPoint(
      'signPole',
      cx + (alongX ? -(long - SMALL_POST_M) / 2 : 0),
      cz + (alongX ? 0 : -(long - SMALL_POST_M) / 2),
      SMALL_POST_M,
      SMALL_POST_M,
      CORRAL_POST_HEIGHT_M,
      CORRAL_POST_HEIGHT_M / 2,
    ),
  ];
}

/**
 * One of the filling station's island parts, for both islands: the island
 * itself, its two dispensers, or the bollard at each of its ends. The islands
 * run out from the kiosk under the canopy, 25 ft apart either side of its middle.
 */
function islandPart(
  part: 'fuelIsland' | 'dispenser' | 'bollard',
  baseBox: SetbackBox,
  side: Side,
): PartPlacement[] {
  const out: PartPlacement[] = [];
  const centreOut = halfDepthTo(baseBox, side) + FUEL_CANOPY_GAP_M + FUEL_CANOPY_DEPTH_M / 2;
  for (let i = 0; i < ISLAND_COUNT; i += 1) {
    const along = (i - (ISLAND_COUNT - 1) / 2) * ISLAND_SPACING_M;
    const place = (
      outOffset: number,
      w: number,
      length: number,
      height: number,
      centreY: number,
    ): PartPlacement =>
      onSide(part, side, along, centreOut + outOffset, w, length, height, centreY);
    if (part === 'fuelIsland') {
      out.push(place(0, ISLAND_WIDTH_M, ISLAND_LENGTH_M, ISLAND_HEIGHT_M, ISLAND_HEIGHT_M / 2));
    } else if (part === 'dispenser') {
      const [w, h, l] = DISPENSER_SIZE_M;
      for (const k of [-1, 1]) {
        out.push(place(k * DISPENSER_OFFSET_M, w, l, h, ISLAND_HEIGHT_M + h / 2));
      }
    } else {
      for (const k of [-1, 1]) {
        out.push(
          place(
            (k * (ISLAND_LENGTH_M - BOLLARD_DIAMETER_M)) / 2,
            BOLLARD_DIAMETER_M,
            BOLLARD_DIAMETER_M,
            BOLLARD_HEIGHT_M,
            ISLAND_HEIGHT_M + BOLLARD_HEIGHT_M / 2,
          ),
        );
      }
    }
  }
  return out;
}

/** Rotates a local footprint-frame offset by rotation*90°, matching props.ts. */
function rotateLocal(x: number, z: number, rotation: 0 | 1 | 2 | 3): { x: number; z: number } {
  const theta = rotation * (Math.PI / 2);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/**
 * The lot plan carried into the building's own frame: every rectangle and
 * point on the plan as metres from `centre`, the body's middle, in the
 * building's unrotated footprint frame. `rearYardFree` leaves the rear yard
 * out of the taken ground: a walk-up's is the lawn its patios stand on.
 */
export function kitLotOf(
  plan: LotPlan,
  centre: LocalPoint,
  rotation: 0 | 1 | 2 | 3,
  rearYardFree = false,
): KitLot {
  const back = ((4 - rotation) % 4) as 0 | 1 | 2 | 3;
  const toLocal = (u: number, v: number): LocalPoint => {
    const world = lotPointToWorld(plan.frame, u, v);
    return rotateLocal(world.x - centre.x, world.z - centre.z, back);
  };
  const rect = (r: LotRect): LocalRect => {
    const a = toLocal(r.u0, r.v0);
    const b = toLocal(r.u1, r.v1);
    return {
      x0: Math.min(a.x, b.x),
      x1: Math.max(a.x, b.x),
      z0: Math.min(a.z, b.z),
      z1: Math.max(a.z, b.z),
    };
  };
  const { layout } = plan;
  const inRect = (p: { u: number; v: number }, r: LotRect): boolean =>
    p.u >= r.u0 && p.u <= r.u1 && p.v >= r.v0 && p.v <= r.v1;
  const dist = (r: LotRect): number =>
    Math.hypot((r.u0 + r.u1) / 2 - layout.entrance.u, (r.v0 + r.v1) / 2 - layout.entrance.v);
  const islands = layout.islands
    .filter((r) => !layout.trees.some((t) => inRect(t, r)))
    .sort((a, b) => dist(a) - dist(b))
    .map(rect);

  const berths = layout.berths.map(rect);
  const dock =
    berths.length > 0
      ? {
          x: berths.reduce((s, r) => s + (r.x0 + r.x1) / 2, 0) / berths.length,
          z: berths.reduce((s, r) => s + (r.z0 + r.z1) / 2, 0) / berths.length,
        }
      : null;

  const trailers = layout.trailerStalls.map(rect);
  const wallStep = (du: number, dv: number): LocalPoint => {
    const a = toLocal(0, 0);
    const b = toLocal(du, dv);
    return { x: b.x - a.x, z: b.z - a.z };
  };
  const loadingFacing = layout.loadingWall
    ? layout.loadingWall === 'v+'
      ? wallStep(0, 1)
      : wallStep(layout.loadingWall === 'u+' ? 1 : -1, 0)
    : null;

  const through = layout.driveThrough;
  let lane: KitLane | null = null;
  const laneRects = through ? through.rects.map(rect) : [];
  if (through) {
    const at = through.pickup.at;
    const step = (du: number, dv: number): LocalPoint => {
      const a = toLocal(at.u, at.v);
      const b = toLocal(at.u + du, at.v + dv);
      return { x: b.x - a.x, z: b.z - a.z };
    };
    const faceStep =
      through.pickup.face === 'v+' ? step(0, 1) : step(through.pickup.face === 'u+' ? 1 : -1, 0);
    lane = {
      path: through.path.map((p) => toLocal(p.u, p.v)),
      rects: laneRects,
      length: through.length,
      pickup: toLocal(at.u, at.v),
      pickupFacing: faceStep,
    };
  }

  const frontWalk = layout.frontWalk ? rect(layout.frontWalk) : null;
  return {
    lot: rect(layout.lot),
    curbCut: rect({ u0: layout.curbCut.u0, u1: layout.curbCut.u1, v0: 0, v1: 1 }),
    walk: layout.entranceWalk ? rect(layout.entranceWalk) : null,
    frontWalk,
    islands,
    dock,
    loadingFacing,
    trailers,
    hard: [
      ...layout.stalls.map((s) => rect(s.rect)),
      ...layout.accessAisles.map(rect),
      ...layout.aisles.map(rect),
      ...(layout.throat ? [rect(layout.throat)] : []),
      ...berths,
      ...trailers,
      ...layout.islands.map(rect),
    ],
    lane,
    taken: [
      ...layout.stalls.map((s) => rect(s.rect)),
      ...layout.accessAisles.map(rect),
      ...layout.aisles.map(rect),
      ...(layout.throat ? [rect(layout.throat)] : []),
      ...berths,
      ...trailers,
      ...(layout.forecourt ? [rect(layout.forecourt)] : []),
      ...(layout.rearYard && !rearYardFree ? [rect(layout.rearYard)] : []),
      ...(frontWalk ? [frontWalk] : []),
      ...(layout.entranceWalk ? [rect(layout.entranceWalk)] : []),
      ...laneRects,
    ],
  };
}

/** What a building stands up: its placed parts, where its body stands, and the lot's tile rectangle. */
export interface KitPlan {
  placements: PartPlacement[];
  frontage: FrontageSetback;
  baseBox: SetbackBox;
  topBox: SetbackBox;
  /** The side of the footprint that fronts the street, in the building's frame; null without one. */
  side: Side | null;
  /** The car park the parts stand on, where the building parks one to code. */
  lot: KitLot | null;
  /** The footprint's tiles in the building's frame, from the body's middle. */
  tiles: LocalRect;
}

/**
 * Everything the kit stands up for a building on the map: its massing, the
 * road-facing wall, its car park where it parks one, and the parts placed
 * against all three. Pure; null for a building with nothing to stand up.
 */
export function kitPlanFor(
  entry: BuildingCatalogEntry,
  building: Pick<BuildingInstance, 'id' | 'x' | 'z' | 'rotation'>,
  roadAt: (x: number, z: number) => boolean,
  kerb: KerbSurroundings | null = null,
): KitPlan | null {
  const frontage = frontageSetbackFor(
    entry,
    building.x,
    building.z,
    roadAt,
    NO_STREETS,
    building.rotation,
    kerb,
  );
  const { boxes, podium } = computeSetbacks(entry, building.id, frontage);
  const baseBox = boxes[0];
  const topBox = boxes[boxes.length - 1];
  if (!baseBox || !topBox) return null;

  // The edge is found on the map; the parts sit in the building's own frame.
  const lot = footprintForRotation(entry, building.rotation);
  const edge = findRoadFacingEdge(building.x, building.z, lot.w, lot.d, roadAt);
  const localSide = edge ? localSideOf(edge.side, building.rotation) : null;
  const plan = edge
    ? lotPlanFor(entry, building.x, building.z, roadAt, building.rotation, kerb)
    : null;
  const centre = {
    x: (building.x + lot.w / 2) * TILE_METERS + frontage.centerXM,
    z: (building.z + lot.d / 2) * TILE_METERS + frontage.centerZM,
  };
  const kitLot = plan ? kitLotOf(plan, centre, building.rotation, isWalkUpEntry(entry)) : null;
  const placements = computePartPlacements(
    entry,
    baseBox,
    topBox,
    localSide,
    kitLot,
    building.id,
    podium ?? null,
  );

  const back = ((4 - building.rotation) % 4) as 0 | 1 | 2 | 3;
  const corner = (tx: number, tz: number): LocalPoint =>
    rotateLocal(tx * TILE_METERS - centre.x, tz * TILE_METERS - centre.z, back);
  const a = corner(building.x, building.z);
  const b = corner(building.x + lot.w, building.z + lot.d);
  const tiles = {
    x0: Math.min(a.x, b.x),
    x1: Math.max(a.x, b.x),
    z0: Math.min(a.z, b.z),
    z1: Math.max(a.z, b.z),
  };
  return { placements, frontage, baseBox, topBox, side: localSide, lot: kitLot, tiles };
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _pitch = new THREE.Quaternion();

/** A unit box anchored at its own center, scaled per instance. */
function unitBox(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

export class BuildingKitRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly roadAt: (x: number, z: number) => boolean;
  /** The stalls the streets paint, which a car park counts toward its code; null credits none. */
  private readonly kerb: KerbSurroundings | null;
  private readonly pools = new Map<BuildingPart, InstancedSlotPool>();
  private readonly buildingSlots = new Map<number, { part: BuildingPart; slot: number }[]>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** The lit parts: white by day, a glow that follows the night factor. */
  private readonly litMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: 0xffffff,
    emissiveIntensity: LIT_DAY_FLOOR,
  });

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean,
    kerb: KerbSurroundings | null = null,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
    this.kerb = kerb;
  }

  /**
   * Removals are applied LAST, matching the order the render thread folds a
   * delta into its own building map. A building can be both updated and removed
   * within one delta — abandoned and then demolished inside a single snapshot
   * window — and freeing first would let the update re-place it, leaving parts
   * standing over a building the world no longer has.
   */
  apply(delta: BuildingDelta): void {
    for (const b of delta.updated) this.free(b.id);
    for (const b of delta.added) this.place(b);
    for (const b of delta.updated) this.place(b);
    for (const id of delta.removed) this.free(id);
    for (const pool of this.pools.values()) pool.commit();
  }

  /** 0 (day) .. 1 (night): how brightly the lit parts glow. A dark building has none, since only Active buildings stand parts. */
  setNightFactor(nightFactor: number): void {
    const night = Math.min(1, Math.max(0, nightFactor));
    this.litMaterial.emissiveIntensity = LIT_DAY_FLOOR + (1 - LIT_DAY_FLOOR) * night;
  }

  /** How brightly the lit parts glow now. */
  litIntensity(): number {
    return this.litMaterial.emissiveIntensity;
  }

  /** The material a part kind is drawn with, once a building has stood one. */
  materialOf(part: BuildingPart): THREE.Material | undefined {
    return this.pools.get(part)?.getMesh().material as THREE.Material | undefined;
  }

  /** The lit material, which only the LIT_PARTS use. */
  litMaterialOf(): THREE.Material {
    return this.litMaterial;
  }

  partCountFor(buildingId: number): number {
    return this.buildingSlots.get(buildingId)?.length ?? 0;
  }

  /** Ids the kit currently holds parts for — for reconciling against the world. */
  trackedIds(): number[] {
    return Array.from(this.buildingSlots.keys());
  }

  /**
   * Parts of this kind currently standing. Counted from the live per-building
   * records, NOT from the pool's extent: a pool keeps its high-water slot count
   * after buildings churn, so asking it would report parts that no longer exist.
   */
  instanceCount(part: BuildingPart): number {
    let live = 0;
    for (const held of this.buildingSlots.values()) {
      for (const h of held) if (h.part === part) live += 1;
    }
    return live;
  }

  dispose(): void {
    for (const id of Array.from(this.buildingSlots.keys())) this.free(id);
    for (const pool of this.pools.values()) pool.commit();
    this.pools.clear();
    this.material.dispose();
    this.litMaterial.dispose();
  }

  private poolFor(part: BuildingPart): InstancedSlotPool {
    let pool = this.pools.get(part);
    if (!pool) {
      const geometry = PART_GEOMETRY[part]?.() ?? unitBox();
      const material = LIT_PARTS.has(part) ? this.litMaterial : this.material;
      pool = new InstancedSlotPool(this.scene, geometry, material, INITIAL_PART_CAPACITY);
      this.pools.set(part, pool);
    }
    return pool;
  }

  private free(id: number): void {
    const held = this.buildingSlots.get(id);
    if (!held) return;
    for (const { part, slot } of held) this.pools.get(part)?.free(slot);
    this.buildingSlots.delete(id);
  }

  private place(building: BuildingInstance): void {
    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;
    if (building.state !== BuildingState.Active) return;

    const kit = kitPlanFor(entry, building, this.roadAt, this.kerb);
    if (!kit || kit.placements.length === 0) return;
    const { placements, frontage, baseBox } = kit;

    const lot = footprintForRotation(entry, building.rotation);
    const centerX = (building.x + lot.w / 2) * TILE_METERS;
    const centerZ = (building.z + lot.d / 2) * TILE_METERS;
    // The kit stands where the body stands: on the ground under the base
    // tier, as the instancer seats it, so a dock or a pump never hangs over
    // the downhill side of a lot its body is level on.
    const groundY = maxHeightUnderBody(
      this.heightAt,
      centerX + frontage.centerXM,
      centerZ + frontage.centerZM,
      baseBox.w,
      baseBox.d,
      building.rotation,
    );
    // Kit only goes on finished buildings — a loading dock on a quarter-built
    // shell reads as debris — so the lifecycle tint is always the Active one.
    const held: { part: BuildingPart; slot: number }[] = [];
    for (const p of placements) {
      const pool = this.poolFor(p.part);
      const slot = pool.allocate();

      // The offset rotates with the footprint; the size does not, because the
      // instance quaternion already turns the box itself.
      const rotated = rotateLocal(p.offset[0], p.offset[2], building.rotation);
      _position.set(
        centerX + frontage.centerXM + rotated.x,
        groundY + p.offset[1],
        centerZ + frontage.centerZM + rotated.z,
      );
      _quaternion.setFromAxisAngle(_yAxis, building.rotation * (Math.PI / 2) + (p.yaw ?? 0));
      if (p.pitch) _quaternion.multiply(_pitch.setFromAxisAngle(_xAxis, -p.pitch));
      _scale.set(p.size[0], p.size[1], p.size[2]);
      _matrix.compose(_position, _quaternion, _scale);
      pool.setMatrixAt(slot, _matrix);

      if (p.color) _color.setRGB(p.color[0], p.color[1], p.color[2]);
      else _color.setHex(PART_COLOR[p.part]);
      pool.setColorAt(slot, _color);

      held.push({ part: p.part, slot });
    }
    this.buildingSlots.set(building.id, held);
  }
}
