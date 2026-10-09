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
import { kerbCreditFor, type KerbSurroundings } from './kerblayout';
import { layoutLot, type LotLayout } from './lotlayout';
import { lotParkingRequirement, onSiteSpaces } from './parkingcode';
import { findRoadFacingEdge, type RoadFacingEdge } from './roadedge';
import type { BuildingCatalogEntry, BuildingKind } from './types';

/** A filling station's canopy stands off the kiosk over the forecourt, on posts. */
export const FUEL_CANOPY_GAP_M = 2;
export const FUEL_CANOPY_DEPTH_M = 10;
/** A tank farm stands this far off the wall opposite the street, its tanks this wide. */
export const TANK_GAP_M = 2;
export const TANK_DIAMETER_M = 6;

/** The kinds that keep a forecourt in front of the body, and those that keep a tank farm behind it. */
const FORECOURT_KINDS: ReadonlySet<BuildingKind> = new Set(['fuel']);
const TANK_FARM_KINDS: ReadonlySet<BuildingKind> = new Set(['chemical', 'paper']);

/** The ground a kind keeps clear of its car park: a forecourt in front, a tank farm behind. */
export function lotYardsFor(entry: BuildingCatalogEntry): {
  forecourtDepth?: number;
  rearYard?: number;
} {
  const kind = entry.kind;
  return {
    ...(kind && FORECOURT_KINDS.has(kind)
      ? { forecourtDepth: FUEL_CANOPY_GAP_M + FUEL_CANOPY_DEPTH_M }
      : {}),
    ...(kind && TANK_FARM_KINDS.has(kind) ? { rearYard: TANK_GAP_M + TANK_DIAMETER_M } : {}),
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
): LotLayout | null {
  const requirement = lotParkingRequirement(entry);
  if (!requirement) return null;
  const lot = footprintForRotation(entry, rotation);
  const body = bodyMetresFor(entry);
  const world = rotation % 2 === 1 ? { w: body.d, d: body.w } : body;
  return layoutLot({
    along: (alongX ? lot.w : lot.d) * TILE_METERS,
    depth: (alongX ? lot.d : lot.w) * TILE_METERS,
    bodyAlong: alongX ? world.w : world.d,
    bodyDepth: alongX ? world.d : world.w,
    spaces: onSiteSpaces(requirement.spaces, kerbCredit),
    berths: requirement.berths,
    ...lotYardsFor(entry),
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
  if (!lotParkingRequirement(entry)) return null;
  const lot = footprintForRotation(entry, rotation);
  const edge = findRoadFacingEdge(x, z, lot.w, lot.d, roadAt);
  if (!edge) return null;
  const kerbCredit = kerb ? kerbCreditFor(kerb, { x, z, w: lot.w, d: lot.d }, edge.side) : 0;
  const alongX = edge.side === 'N' || edge.side === 'S';
  const layout = lotLayoutFor(entry, rotation, alongX, kerbCredit)!;
  return { edge, kerbCredit, layout };
}

/**
 * Whether `entry` meets its parking code standing there: its lot holds the
 * spaces its kerb credit leaves, with their accessible spaces, and its berths.
 * A building that parks no lot to code, or fronts no road, always does.
 */
export function holdsLotParkingAt(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  rotation: 0 | 1 | 2 | 3,
  roadAt: (tileX: number, tileZ: number) => boolean,
  kerb: KerbSurroundings | null,
): boolean {
  return lotParkingAt(entry, x, z, rotation, roadAt, kerb)?.layout.fits ?? true;
}
