/**
 * A suburban commercial or industrial lot's parking plan on the map: the
 * shared layout (src/shared/lotlayout.ts) for this building, turned this way,
 * fronting this street, and the frame that carries its lot coordinates onto
 * the world. Every renderer that places the body, its kit, its roof clutter
 * or its car park reads this one plan, so the body stands where the stalls
 * leave room for it.
 *
 * The forecourt a filling station keeps in front of its kiosk and the yard a
 * plant keeps behind itself for its tank farm are its kit's, so their sizes
 * live here where both the kit and the plan can read them.
 */
import type { BuildingCatalogEntry } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { bodyMetresFor } from '../shared/floorarea';
import { lotParkingRequirement } from '../shared/parkingcode';
import { layoutLot, type LotLayout } from '../shared/lotlayout';
import { hasPart } from './archetypes';
import {
  edgeFrameFor,
  findRoadFacingEdge,
  frameToWorld,
  type EdgeFrame,
  type RoadFacingEdge,
} from './frontage';

/** A filling station's canopy stands off the kiosk over the forecourt, on posts. */
export const FUEL_CANOPY_GAP_M = 2;
export const FUEL_CANOPY_DEPTH_M = 10;
/** A tank farm stands this far off the wall opposite the street, its tanks this wide. */
export const TANK_GAP_M = 2;
export const TANK_DIAMETER_M = 6;

export interface LotPlan {
  edge: RoadFacingEdge;
  frame: EdgeFrame;
  layout: LotLayout;
}

/** The layout for a building's own lot, in its frontage frame; null for one that parks no lot to code. */
export function lotLayoutFor(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
  alongX: boolean,
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
    spaces: requirement.spaces,
    berths: requirement.berths,
    ...(hasPart(entry, 'fuelCanopy')
      ? { forecourtDepth: FUEL_CANOPY_GAP_M + FUEL_CANOPY_DEPTH_M }
      : {}),
    ...(hasPart(entry, 'tanks') ? { rearYard: TANK_GAP_M + TANK_DIAMETER_M } : {}),
  });
}

/** The building's lot plan where it stands, or null when it parks no lot to code or fronts no road. */
export function lotPlanFor(
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  roadAt: (tileX: number, tileZ: number) => boolean,
  rotation: 0 | 1 | 2 | 3 = 0,
): LotPlan | null {
  const lot = footprintForRotation(entry, rotation);
  const edge = findRoadFacingEdge(x, z, lot.w, lot.d, roadAt);
  if (!edge) return null;
  const frame = edgeFrameFor(edge.side, x, z, lot.w, lot.d);
  const layout = lotLayoutFor(entry, rotation, frame.alongX);
  return layout ? { edge, frame, layout } : null;
}

/** A lot point in world metres. */
export function lotPointToWorld(frame: EdgeFrame, u: number, v: number): { x: number; z: number } {
  return frameToWorld(frame, u, -v / TILE_METERS);
}
