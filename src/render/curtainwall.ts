/**
 * The curtain wall a modern building (shared/modernlook.ts) is clad in: flush
 * glass cut into equal modules across each face, and at every floor line a
 * darker opaque band, the fire separation between floors, so the vision glass
 * is the rest of the floor. The facade material draws the grid from these
 * numbers and the wall's own length, so every figure here is in metres and a
 * test reads the same numbers the shader does. Pure.
 */
import type { BuildingCatalogEntry } from '../shared/types';
import { floorToFloorOf } from './facade';
import { tierHeightOf } from './massing';

/** One unitized curtain-wall module across a face: 5 ft, on the 1.2 to 1.5 m units a tower is hung with. */
export const CURTAIN_MODULE_M = 1.5;
/** The narrowest and widest a module may be cut when a face is divided into equal ones. */
export const CURTAIN_MODULE_MIN_M = 1.2;
export const CURTAIN_MODULE_MAX_M = 1.8;
/** The opaque band across each floor line: 36 in, the fire separation a floor line is built with. */
export const CURTAIN_BAND_M = 0.9;
/** The aluminium mullion between two modules, its face about 2.4 in; a thin dark line, never a frame. */
export const CURTAIN_MULLION_M = 0.06;

/** How many equal modules a wall `wallM` long is cut into: the count nearest 1.5 m a module, and always between 1.2 and 1.8 m. */
export function curtainBays(wallM: number): number {
  const eps = 1e-9;
  const fewest = Math.max(1, Math.ceil(wallM / CURTAIN_MODULE_MAX_M - eps));
  const most = Math.max(fewest, Math.floor(wallM / CURTAIN_MODULE_MIN_M + eps));
  const nearest = Math.round(wallM / CURTAIN_MODULE_M);
  return Math.min(most, Math.max(fewest, nearest));
}

/** How the tiers of a modern body are cut into floors. */
export interface CurtainCut {
  /** Floors in one tier of the body. */
  rows: number;
  /** One floor, floor line to floor line (m). */
  floorM: number;
  /** Half the band, as a fraction of a floor: the band spans this much above and below each floor line. */
  bandHalf: number;
}

/** The floor of a modern body's tier: rows of the body's own floor to floor, the band across each line between them. */
export function curtainWallCut(entry: BuildingCatalogEntry): CurtainCut {
  const tierM = tierHeightOf(entry);
  const rows = Math.max(1, Math.round(tierM / floorToFloorOf(entry.kind)));
  const floorM = tierM / rows;
  return { rows, floorM, bandHalf: CURTAIN_BAND_M / 2 / floorM };
}

/** Whether `v`, the share of a floor up from its floor line, is on the vision glass rather than in a band. */
export function isVisionGlass(cut: CurtainCut, v: number): boolean {
  return v > cut.bandHalf && v < 1 - cut.bandHalf;
}
