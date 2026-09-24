/**
 * The road passing over a crossing tile, read and written as one unit.
 *
 * Its four layers only ever change together — a tier with no deck height, or a
 * profile left behind after the tier is cleared, would be a road nobody can
 * draw, route or remove — so nothing outside this file writes them one by one.
 */
import { tierOutranks } from '../shared/roadprofile';
import type { GridState, RoadTier } from '../shared/types';

export interface OverRoad {
  tier: RoadTier;
  profile: number;
  flow: number;
  elevation: number;
}

/** The road passing over tile `idx`, or null where none does. */
export function overRoadAt(g: GridState, idx: number): OverRoad | null {
  const tier = (g.overTier[idx] ?? 0) as RoadTier;
  if (tier === 0) return null;
  return {
    tier,
    profile: g.overProfile[idx] ?? 0,
    flow: g.overFlow[idx] ?? 0,
    elevation: g.overElevation[idx] ?? 0,
  };
}

/** Lays `road` over tile `idx`, replacing any road already passing over it. */
export function setOverRoad(g: GridState, idx: number, road: OverRoad): void {
  g.overTier[idx] = road.tier;
  g.overProfile[idx] = road.profile;
  g.overFlow[idx] = road.flow;
  g.overElevation[idx] = road.elevation;
}

/** Takes the road passing over tile `idx` away, leaving the road below. */
export function clearOverRoad(g: GridState, idx: number): void {
  g.overTier[idx] = 0;
  g.overProfile[idx] = 0;
  g.overFlow[idx] = 0;
  g.overElevation[idx] = 0;
}

/**
 * Whether laying `next` over a crossing that already carries `current` changes
 * it, by the same rules a road at ground level follows: nothing there yet, a
 * road it outranks, the same road differently composed, or the same road at a
 * new height or heading. Replace mode lays whatever differs.
 */
export function overRoadChanges(
  current: OverRoad | null,
  next: OverRoad,
  replace: boolean,
): boolean {
  if (!current) return true;
  const differs =
    current.tier !== next.tier ||
    current.profile !== next.profile ||
    current.elevation !== next.elevation ||
    current.flow !== next.flow;
  if (replace) return differs;
  if (tierOutranks(next.tier, current.tier)) return true;
  return current.tier === next.tier && differs;
}
