/**
 * The garage entrance of a built-in form: where its portal stands on the body,
 * the ramp that falls to it where its parking is below ground, and the one
 * drive from the kerb cut along the body's wall to it. Pure, in the lot's
 * frontage frame (`u` along the street, `v` from the street line into the lot).
 */
import { builtInParking } from './garage';
import type { LotLayout, LotPoint, LotRect } from './lotlayout';
import type { BuildingCatalogEntry } from './types';

/** A two-way drive, 20 ft: the portal and the drive to it are this wide. */
export const PORTAL_WIDTH_M = 6.1;
/** The clear height under the portal's header: a van, 8 ft 2 in. */
export const PORTAL_CLEAR_M = 2.5;
/** A ramp to a level below is cut at 1 in 8. */
export const RAMP_GRADE = 1 / 8;
/** The deepest a sill sits below the footway's grade, so nothing is dug under the footway. */
export const RAMP_SILL_MAX_M = 1.2;
/** The wall left between the portal and the body's rear corner. */
export const PORTAL_REAR_WALL_M = 1;
/** The least wall between the body's street face, with its door, and the portal. */
export const PORTAL_DOOR_CLEAR_M = 3;

export interface BuiltInPortal {
  /** The wall the portal stands in, named by the way it faces; never the street face. */
  face: 'u+' | 'u-';
  /** The portal's opening on that wall: a line `PORTAL_WIDTH_M` long along `v`. */
  rect: LotRect;
  centre: LotPoint;
  /** The drive from the street line to the end of the portal. */
  drive: LotRect;
  /** The stretch of the drive that falls to the portal's sill, across the drive's width; null at grade. */
  ramp: LotRect | null;
  /** How far the sill sits below grade, metres. */
  sillDepth: number;
}

/**
 * The portal of a body laid out on its lot with its ground on the high-`u`
 * side clear (the layout's `sideDrive`), or null where that ground is too
 * narrow for a drive or the wall too short for a portal clear of the door.
 */
export function builtInPortalFor(layout: LotLayout, belowGround: boolean): BuiltInPortal | null {
  const { body, lot } = layout;
  const wall = body.u1;
  if (lot.u1 - wall < PORTAL_WIDTH_M - 1e-9) return null;
  const v1 = body.v1 - PORTAL_REAR_WALL_M;
  const v0 = v1 - PORTAL_WIDTH_M;
  if (v0 < body.v0 + PORTAL_DOOR_CLEAR_M) return null;
  const drive: LotRect = { u0: wall, u1: wall + PORTAL_WIDTH_M, v0: 0, v1 };
  const ramp: LotRect | null = belowGround ? { u0: wall, u1: drive.u1, v0, v1 } : null;
  return {
    face: 'u+',
    rect: { u0: wall, u1: wall, v0, v1 },
    centre: { u: wall, v: (v0 + v1) / 2 },
    drive,
    ramp,
    sillDepth: ramp ? Math.min(RAMP_SILL_MAX_M, (ramp.u1 - ramp.u0) * RAMP_GRADE) : 0,
  };
}

/** The layout with its one drive, its kerb cut and its portal laid for the form's garage. */
export function withBuiltInDrive(entry: BuildingCatalogEntry, layout: LotLayout): LotLayout {
  const portal = builtInPortalFor(layout, builtInParking(entry).belowLevels > 0);
  if (!portal) return layout;
  return {
    ...layout,
    aisles: [portal.drive],
    curbCut: { u0: portal.drive.u0, u1: portal.drive.u1 },
    throat: null,
    portal,
  };
}
