import type { BuildingCatalogEntry } from './types';

export interface Footprint {
  w: number;
  d: number;
}

/** Rotation 1 (90°) and 3 (270°) swap width/depth; 0 and 2 keep them. */
export function footprintForRotation(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
): Footprint {
  const { w, d } = entry.footprint;
  return rotation % 2 === 1 ? { w: d, d: w } : { w, d };
}
