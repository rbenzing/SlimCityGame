/**
 * A suburban commercial or industrial lot's parking plan on the map: the
 * shared car park (src/shared/lotparking.ts) for this building, turned this
 * way, fronting this street and credited with the stalls it paints along the
 * frontage, and the frame that carries its lot coordinates onto the world.
 * Every renderer that places the body, its kit, its roof clutter or its car
 * park reads this one plan, so the body stands where the stalls leave room
 * for it.
 */
import type { BuildingCatalogEntry } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import type { KerbSurroundings } from '../shared/kerblayout';
import type { LotLayout } from '../shared/lotlayout';
import { lotParkingAt } from '../shared/lotparking';
import { edgeFrameFor, frameToWorld, type EdgeFrame, type RoadFacingEdge } from './frontage';

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

/** A lot point in world metres. */
export function lotPointToWorld(frame: EdgeFrame, u: number, v: number): { x: number; z: number } {
  return frameToWorld(frame, u, -v / TILE_METERS);
}
