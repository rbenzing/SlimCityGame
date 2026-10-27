/**
 * A suburban commercial or industrial lot's parking plan on the map: the
 * shared car park (src/shared/lotparking.ts) for this building, turned this
 * way, fronting this street and credited with the stalls it paints along the
 * frontage, and the frame that carries its lot coordinates onto the world.
 * Every renderer that places the body, its kit, its roof clutter or its car
 * park reads this one plan, so the body stands where the stalls leave room
 * for it.
 */
import type { BuildingCatalogEntry, BuildingInstance, ParcelFrame } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import type { KerbSurroundings } from '../shared/kerblayout';
import type { LotLayout } from '../shared/lotlayout';
import { lotLayoutFor, lotParkingAt } from '../shared/lotparking';
import {
  edgeFrameFor,
  edgeFrameOfParcel,
  frameToWorld,
  type EdgeFrame,
  type RoadFacingEdge,
} from './frontage';

export {
  FUEL_CANOPY_DEPTH_M,
  FUEL_CANOPY_GAP_M,
  lotLayoutFor,
  TANK_DIAMETER_M,
  TANK_GAP_M,
} from '../shared/lotparking';

export interface LotPlan {
  edge: RoadFacingEdge;
  frame: EdgeFrame;
  layout: LotLayout;
  /** The painted kerb stalls along the frontage the lot counts toward its code. */
  kerbCredit: number;
}

/**
 * The building's lot plan where it stands, or null when it parks no lot to
 * code or fronts no road. `kerb` is the road mesh's word on the stalls it
 * paints; without it nothing is credited.
 */
export function lotPlanFor(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  rotation: 0 | 1 | 2 | 3 = 0,
  kerb: KerbSurroundings | null = null,
): LotPlan | null {
  const parking = lotParkingAt(entry, x, z, rotation, roadAt, kerb);
  if (!parking) return null;
  const lot = footprintForRotation(entry, rotation);
  const frame = edgeFrameFor(parking.edge.side, x, z, lot.w, lot.d);
  return { edge: parking.edge, frame, layout: parking.layout, kerbCredit: parking.kerbCredit };
}

/** The kerb stalls a framed lot's frontage earns, read from the free road under its kerb line. */
export type KerbCreditOf = (frame: ParcelFrame, wM: number) => number;

/** Where a building stands as its lot plan reads it: its tile corner and quarter turn on the grid, or its parcel's frame on a curve. */
export type LotSite = Pick<BuildingInstance, 'x' | 'z' | 'rotation' | 'frame'>;

/** How far out from the kerb line a framed lot's road tile is read, in tiles. */
const ROAD_TILE_PROBE = 0.5;

/**
 * The lot plan of a building on a curve: a north-fronting lot's layout,
 * credited with the kerb stalls its frontage earns, carried onto the world by
 * its parcel's frame. Its road tile is the one across the frontage's middle.
 * Null for a building that parks no lot to code.
 */
export function framedLotPlanFor(
  entry: BuildingCatalogEntry,
  parcel: ParcelFrame,
  kerbCreditOf: KerbCreditOf | null,
): LotPlan | null {
  const w = entry.footprint.w;
  const wM = w * TILE_METERS;
  const kerbCredit = kerbCreditOf ? kerbCreditOf(parcel, wM) : 0;
  const layout = lotLayoutFor(entry, 0, true, kerbCredit);
  if (!layout) return null;
  const frame = edgeFrameOfParcel(parcel);
  const road = frameToWorld(frame, wM / 2, ROAD_TILE_PROBE);
  const edge: RoadFacingEdge = {
    side: 'N',
    edgeTiles: w,
    roadTileX: Math.floor(road.x / TILE_METERS),
    roadTileZ: Math.floor(road.z / TILE_METERS),
  };
  return { edge, frame, layout, kerbCredit };
}

/** The one lot plan every renderer places a car park by: the parcel's on a curve, the grid's elsewhere. */
export function lotPlanAt(
  entry: BuildingCatalogEntry,
  site: LotSite,
  roadAt: (tileX: number, tileZ: number) => boolean,
  kerb: KerbSurroundings | null,
  kerbCreditOf: KerbCreditOf | null,
): LotPlan | null {
  if (site.frame) return framedLotPlanFor(entry, site.frame, kerbCreditOf);
  return lotPlanFor(entry, site.x, site.z, roadAt, site.rotation, kerb);
}

/** A lot point in world metres. */
export function lotPointToWorld(frame: EdgeFrame, u: number, v: number): { x: number; z: number } {
  return frameToWorld(frame, u, -v / TILE_METERS);
}
