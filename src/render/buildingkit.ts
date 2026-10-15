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
import { partsFor, type BuildingPart } from './archetypes';
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
  // New galvanised sheet. Not a chart swatch: the kit's lambert lighting takes
  // most of a chart colour's value, and a unit at the chart's brightest read
  // black from above against the roof's own lit shader.
  rooftopUnit: 0xe2e0da,
  roofHatch: materialHex('metalPlates'),
};

/**
 * The parts that glow: sign bands, the pylon and price-sign faces, the
 * supermarket tower's glazing and the office lobby portal. They share the
 * kit's emissive material, which follows the night factor as a window does.
 */
export const LIT_PARTS: ReadonlySet<BuildingPart> = new Set<BuildingPart>([
  'signageBand',
  'pylon',
  'priceSign',
  'towerGlazing',
  'lobbyPortal',
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

/** A part's unit geometry, scaled per instance: a box unless the part is round or sloped. */
const PART_GEOMETRY: Partial<Record<BuildingPart, () => THREE.BufferGeometry>> = {
  tanks: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  bollard: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  awning: awningGeometry,
};

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

export interface PartPlacement {
  readonly part: BuildingPart;
  /** Box size in world meters (w along X, h along Y, d along Z), unrotated, before any yaw. */
  readonly size: readonly [number, number, number];
  /** Center offset from the building's footprint center, unrotated, meters. */
  readonly offset: readonly [number, number, number];
  /** Turn about the vertical, radians, in the unrotated frame, for a part with a front such as an awning. */
  readonly yaw?: number;
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
  /** Planted islands nearest the entrance first, none holding a tree. */
  islands: LocalRect[];
  /** Where the loading berths are, when there are any. */
  dock: LocalPoint | null;
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
  const w = quarter ? p.size[2] : p.size[0];
  const d = quarter ? p.size[0] : p.size[2];
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

/**
 * Every part this building's archetype calls for, placed. `topBox` carries the
 * roof parts, `baseBox` the facade ones; `side` is the frontage, without which
 * a dock or a canopy would face nothing and is skipped. `lot` is the building's
 * car park where it parks one to code: the parts that stand on the lot (a
 * pylon at the drive, cart corrals, a drive-through) need it, and stand
 * nowhere without it.
 */
export function computePartPlacements(
  entry: BuildingCatalogEntry,
  baseBox: SetbackBox,
  topBox: SetbackBox,
  side: Side | null,
  lot: KitLot | null = null,
): PartPlacement[] {
  const out: PartPlacement[] = [];
  const roofY = topBox.yOffset + topBox.h;
  const baseTop = baseBox.yOffset + baseBox.h;
  const parts = partsFor(entry);
  // Doors stand on the dock where there is one, and on the ground where not.
  const doorSill = parts.includes('loadingDock') ? DOCK_HEIGHT_M : 0;
  const span = side ? facadeSpan(baseBox, side) : 0;

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
    }
  }
  return out;
}

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
 * building's unrotated footprint frame.
 */
export function kitLotOf(plan: LotPlan, centre: LocalPoint, rotation: 0 | 1 | 2 | 3): KitLot {
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

  return {
    lot: rect(layout.lot),
    curbCut: rect({ u0: layout.curbCut.u0, u1: layout.curbCut.u1, v0: 0, v1: 1 }),
    islands,
    dock,
    lane,
    taken: [
      ...layout.stalls.map((s) => rect(s.rect)),
      ...layout.accessAisles.map(rect),
      ...layout.aisles.map(rect),
      ...(layout.throat ? [rect(layout.throat)] : []),
      ...berths,
      ...(layout.forecourt ? [rect(layout.forecourt)] : []),
      ...(layout.rearYard ? [rect(layout.rearYard)] : []),
      ...(layout.frontWalk ? [rect(layout.frontWalk)] : []),
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
  const { boxes } = computeSetbacks(entry, building.id, frontage);
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
  const kitLot = plan ? kitLotOf(plan, centre, building.rotation) : null;
  const placements = computePartPlacements(entry, baseBox, topBox, localSide, kitLot);

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
      _scale.set(p.size[0], p.size[1], p.size[2]);
      _matrix.compose(_position, _quaternion, _scale);
      pool.setMatrixAt(slot, _matrix);

      _color.setHex(PART_COLOR[p.part]);
      pool.setColorAt(slot, _color);

      held.push({ part: p.part, slot });
    }
    this.buildingSlots.set(building.id, held);
  }
}
