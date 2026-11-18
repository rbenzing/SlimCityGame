/**
 * A suburban commercial or industrial building's car park where it stands:
 * the road-facing edge it opens onto, the kerb credit the street paints along
 * that frontage, and the lot laid out for the spaces left to hold on site. The
 * sim asks it whether a footprint fits; the renderer draws what it lays out.
 * Pure.
 */
import { TILE_METERS } from './constants';
import { footprintForRotation } from './footprint';
import { bodyMetresFor } from './floorarea';
import { kerbCreditFor, lotDriveCuts, withDriveCuts, type KerbSurroundings } from './kerblayout';
import { layoutLot, type LotLayout } from './lotlayout';
import { LOT_PERIMETER_STRIP_M } from './lotgrounds';
import { isWalkUpKind } from './buildingkind';
import { GARAGE_FRONT_PROJECTION_M, hasPodium, PODIUM_OVERHANG_M } from './garage';
import {
  drawsLotParking,
  isDenseLotEntry,
  isRoomyLotEntry,
  lotSpacesFor,
  onSiteSpaces,
  WALK_UP_REAR_YARD_M,
  WALK_UP_SIDE_YARD_M,
} from './parkingcode';
import { findRoadFacingEdge, type RoadFacingEdge } from './roadedge';
import type { BuildingCatalogEntry, BuildingKind } from './types';

/** A filling station's canopy stands off the kiosk over the forecourt, on posts. */
export const FUEL_CANOPY_GAP_M = 2;
export const FUEL_CANOPY_DEPTH_M = 10;
/** A tank farm stands this far off the wall opposite the street, its tanks this wide. */
export const TANK_GAP_M = 2;
export const TANK_DIAMETER_M = 6;
/** A chemical plant's bund wall stands this far outside its tanks, on paving that reaches its outer face. */
export const BUND_MARGIN_M = 2;
export const BUND_THICKNESS_M = 0.3;

/** The kinds that keep a forecourt in front of the body, and those that keep a tank farm behind it. */
const FORECOURT_KINDS: ReadonlySet<BuildingKind> = new Set(['fuel']);
const TANK_FARM_KINDS: ReadonlySet<BuildingKind> = new Set(['chemical', 'paper']);
/**
 * How deep behind the body a heavy plant's hardstanding reaches, where the lot
 * has the ground: the chemical plant's tank farm and the bund's outer face; a
 * food plant's silo pair, a gap off the wall; a steelworks' furnace, scrap
 * yard and gantry.
 */
const HARDSTANDING_M: Readonly<Partial<Record<BuildingKind, number>>> = {
  chemical: TANK_GAP_M + TANK_DIAMETER_M + BUND_MARGIN_M + BUND_THICKNESS_M / 2,
  foodplant: 6,
  metals: 14,
};
/** The kinds that dock trailers at a bank of doors and keep a truck court before it. */
const TRUCK_COURT_KINDS: ReadonlySet<BuildingKind> = new Set(['warehouse', 'foodplant']);

/**
 * The ground a kind keeps clear of its car park: a forecourt in front, a tank
 * farm or a walk-up's rear lawn behind. A dense kind on its larger lot keeps
 * in front the ground its street face reaches, so every part stays on the lot.
 */
export function lotYardsFor(entry: BuildingCatalogEntry): {
  forecourtDepth?: number;
  frontSetback?: number;
  bodyMargin?: number;
  rearYard?: number;
  hardstanding?: number;
} {
  const kind = entry.kind;
  const denseFront = isDenseLotEntry(entry) ? (GARAGE_FRONT_PROJECTION_M[kind ?? ''] ?? 0) : 0;
  return {
    ...(kind && FORECOURT_KINDS.has(kind)
      ? { forecourtDepth: FUEL_CANOPY_GAP_M + FUEL_CANOPY_DEPTH_M }
      : {}),
    ...(denseFront > 0 ? { frontSetback: denseFront } : {}),
    ...(isDenseLotEntry(entry) && hasPodium(entry) ? { bodyMargin: PODIUM_OVERHANG_M } : {}),
    ...(kind && TANK_FARM_KINDS.has(kind) ? { rearYard: TANK_GAP_M + TANK_DIAMETER_M } : {}),
    ...(kind === 'multiplex' || kind === 'garden' ? { rearYard: WALK_UP_REAR_YARD_M[kind] } : {}),
    ...(kind && HARDSTANDING_M[kind] ? { hardstanding: HARDSTANDING_M[kind] } : {}),
  };
}

/**
 * The layout for a building's own lot, in its frontage frame, holding its
 * requirement less `kerbCredit` on site; null for one that parks no lot to code.
 */
export function lotLayoutFor(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
  alongX: boolean,
  kerbCredit = 0,
  carPark = true,
): LotLayout | null {
  const requirement = lotSpacesFor(entry);
  if (!requirement) return null;
  const lot = footprintForRotation(entry, rotation);
  const body = bodyMetresFor(entry);
  const world = rotation % 2 === 1 ? { w: body.d, d: body.w } : body;
  return layoutLot({
    along: (alongX ? lot.w : lot.d) * TILE_METERS,
    depth: (alongX ? lot.d : lot.w) * TILE_METERS,
    bodyAlong: alongX ? world.w : world.d,
    bodyDepth: alongX ? world.d : world.w,
    spaces: carPark ? onSiteSpaces(requirement.spaces, kerbCredit) : 0,
    berths: requirement.berths,
    ...lotYardsFor(entry),
    ...(isRoomyLotEntry(entry) ? { perimeterStrip: LOT_PERIMETER_STRIP_M } : {}),
    ...(entry.category === 'com' && !isDenseLotEntry(entry) ? { shopfrontWalk: true } : {}),
    ...(entry.kind === 'restaurant' ? { driveThrough: true } : {}),
    ...(entry.kind && TRUCK_COURT_KINDS.has(entry.kind) ? { trailerCourt: true } : {}),
  });
}

/** A building's car park where it stands: the edge it opens onto, its kerb credit and its layout. */
export interface LotParking {
  edge: RoadFacingEdge;
  kerbCredit: number;
  layout: LotLayout;
}

/**
 * The car park of `entry` standing at (x, z) turned `rotation`, fronting the
 * road `roadAt` finds beside it and credited with the stalls `kerb` paints
 * along that frontage (none without a `kerb`). Null for a building that parks
 * no lot to code, or one that fronts no road.
 */
export function lotParkingAt(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  rotation: 0 | 1 | 2 | 3,
  roadAt: (tileX: number, tileZ: number) => boolean,
  kerb: KerbSurroundings | null,
): LotParking | null {
  if (!lotSpacesFor(entry)) return null;
  const lot = footprintForRotation(entry, rotation);
  const edge = findRoadFacingEdge(x, z, lot.w, lot.d, roadAt);
  if (!edge) return null;
  const tiles = { x, z, w: lot.w, d: lot.d };
  const alongX = edge.side === 'N' || edge.side === 'S';
  let kerbCredit = kerb ? kerbCreditFor(kerb, tiles, edge.side) : 0;
  let layout = lotLayoutFor(entry, rotation, alongX, kerbCredit)!;
  if (kerb && layout.aisles.length > 0) {
    // The lot's own drive is a no-parking zone on the kerb it earns credit
    // from: a stall it blocks is no space, so the credit is counted again with
    // the cut in place, and the lot laid out for what it leaves.
    const cut = layout.curbCut;
    const own = withDriveCuts(kerb, lotDriveCuts(tiles, edge.side, cut.u0, cut.u1));
    const counted = kerbCreditFor(own, tiles, edge.side);
    if (counted !== kerbCredit) {
      kerbCredit = counted;
      layout = lotLayoutFor(entry, rotation, alongX, kerbCredit)!;
    }
  }
  if (isWalkUpKind(entry.kind) && !clearOfSideLines(layout, WALK_UP_SIDE_YARD_M)) {
    // No room for a car park beside the body: the lot keeps its lawn and its walk to the door, and parks at the kerb.
    layout = lotLayoutFor(entry, rotation, alongX, kerbCredit, false)!;
  }
  return { edge, kerbCredit, layout };
}

/** Whether the layout keeps its body at least `yard` in from both side lot lines. */
function clearOfSideLines(layout: LotLayout, yard: number): boolean {
  const { body, lot } = layout;
  return body.u0 >= lot.u0 + yard - 1e-9 && body.u1 <= lot.u1 - yard + 1e-9;
}

/**
 * Whether `entry` meets its parking code standing there: its lot holds the
 * spaces its kerb credit leaves, with their accessible spaces, and its berths.
 * A building that parks no lot to code, or fronts no road, always does; a
 * walk-up's car park is drawn, never required, so a home is never held back
 * by it.
 */
export function holdsLotParkingAt(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  rotation: 0 | 1 | 2 | 3,
  roadAt: (tileX: number, tileZ: number) => boolean,
  kerb: KerbSurroundings | null,
): boolean {
  if (!drawsLotParking(entry)) return true;
  return lotParkingAt(entry, x, z, rotation, roadAt, kerb)?.layout.fits ?? true;
}
