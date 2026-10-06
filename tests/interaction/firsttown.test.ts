import { describe, expect, it } from 'vitest';
import { SEWER_MILESTONE } from '../../src/shared/constants';
import { BuildingState, RoadTier, ZoneType } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import {
  GROWTH_TIMEOUT_MS,
  entryOf,
  initialized,
  initializedAtMilestone,
  roadRow,
  rows,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/**
 * The first thing every player builds, from the opening state of a new game:
 * a street, a turbine and a water tower on it, and a strip of each zone. No
 * sandbox, no unlimited money, no terraforming, no shore, nothing unlocked by
 * a later milestone.
 *
 * This scenario is frozen. If a change needs a step added here for the town
 * to grow, that change has added a prerequisite to growth, and the growth
 * engine's contract in GROUND-TRUTHS.md is what has to move first, not this
 * file. The sewer gate of 2026-10-02 shipped because every growth test was
 * given a pond and a drain instead.
 */
const FIRST_TOWN: Command[] = [
  { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 49, 32) },
  // Two turbines, three clear tiles apart so their rotors clear each other.
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 48, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'wind-turbine', x: 64, z: 48, rotation: 0 },
  { kind: 'placeBuilding', catalogId: 'water-tower', x: 66, z: 47, rotation: 0 },
  { kind: 'paintZone', zone: ZoneType.ResLow, tiles: rows(60, 50, 16, 2) },
  { kind: 'paintZone', zone: ZoneType.Industrial, tiles: rows(76, 50, 16, 2) },
  { kind: 'paintZone', zone: ZoneType.ComLow, tiles: rows(66, 47, 26, 2) },
];

/** Everything the opening offers and nothing more: the frozen scenario checks itself. */
const OPENING_COMMANDS = new Set(['buildRoad', 'placeBuilding', 'paintZone']);
const OPENING_PLACEABLES = new Set(['wind-turbine', 'water-tower']);

function grownSectors(h: Harness): Set<string> {
  const sectors = new Set<string>();
  for (const b of standingBuildings(h).values()) {
    const entry = entryOf(b);
    if (entry.zone !== undefined && b.state === BuildingState.Active) sectors.add(entry.category);
  }
  return sectors;
}

describe('the first town', () => {
  it('is built from the opening alone', () => {
    for (const c of FIRST_TOWN) {
      expect(OPENING_COMMANDS.has(c.kind)).toBe(true);
      if (c.kind === 'placeBuilding') expect(OPENING_PLACEABLES.has(c.catalogId)).toBe(true);
    }
  });

  it(
    'grows homes, shops and industry on a street with power and water, and nothing else',
    () => {
      const h = initialized();
      expect(run(h, 1, FIRST_TOWN).ok).toBe(true);
      h.ticks(2000);
      expect(grownSectors(h)).toEqual(new Set(['res', 'com', 'ind']));
    },
    GROWTH_TIMEOUT_MS,
  );

  it(
    'as a Big Town, which is off septic tanks, grows nothing until it has a drain',
    () => {
      const h = initializedAtMilestone(SEWER_MILESTONE);
      expect(run(h, 1, FIRST_TOWN).ok).toBe(true);
      h.ticks(600);
      expect(grownSectors(h).size).toBe(0);
      const snap = h.lastSnapshot()!;
      expect(snap.zonedUnserved!.sewer).toBeGreaterThan(0);
    },
    GROWTH_TIMEOUT_MS,
  );
});
