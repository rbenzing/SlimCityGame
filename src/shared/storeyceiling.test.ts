import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { MILESTONES, STOREY_CEILING_M, ceilingMilestone } from './constants';
import { ZoneType } from './types';
import type { BuildingCatalogEntry } from './types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

const EXEMPT_ZONES: number[] = [ZoneType.Industrial, ZoneType.IndHeavy, ZoneType.Agriculture];
const zoned = catalog.filter((e) => e.zone !== undefined && !EXEMPT_ZONES.includes(e.zone));

/** Every entry that unlocks later than its kind's own milestone because of its height, with the rung it moved to. */
const MOVED: Record<string, number> = {
  'res-high-2': 5,
  'res-high-3': 5,
  'res-tower-1': 5,
  'res-tower-2': 6,
  'res-tower-3': 6,
  'mixed-2': 5,
  'mixed-3': 5,
  'com-office-2': 5,
  'com-high-2': 6,
  'com-hotel-3': 5,
  'com-office-2-lot4x4': 5,
  'com-high-2-lot4x4': 6,
};

describe('storey ceilings', () => {
  it('has one ceiling a milestone, rising and unlimited at the last', () => {
    expect(STOREY_CEILING_M).toHaveLength(MILESTONES.length);
    for (let i = 1; i < STOREY_CEILING_M.length; i++) {
      expect(STOREY_CEILING_M[i]!).toBeGreaterThanOrEqual(STOREY_CEILING_M[i - 1]!);
    }
    expect(STOREY_CEILING_M.at(-1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('finds the first milestone whose ceiling holds a height', () => {
    expect(ceilingMilestone(4)).toBe(0);
    expect(ceilingMilestone(11.2)).toBe(0);
    expect(ceilingMilestone(11.3)).toBe(3);
    expect(ceilingMilestone(12.8)).toBe(3);
    expect(ceilingMilestone(19.2)).toBe(4);
    expect(ceilingMilestone(25.6)).toBe(5);
    expect(ceilingMilestone(38.4)).toBe(5);
    expect(ceilingMilestone(38.5)).toBe(6);
    expect(ceilingMilestone(300)).toBe(6);
  });

  it('never unlocks a zoned building below the milestone whose ceiling holds its height', () => {
    for (const e of zoned) {
      expect(e.height, e.id).toBeLessThanOrEqual(STOREY_CEILING_M[e.unlockMilestone]!);
    }
  });

  it('moves exactly the pinned entries, each to the rung its height needs, and no other', () => {
    for (const [id, rung] of Object.entries(MOVED)) {
      const e = zoned.find((z) => z.id === id);
      expect(e?.unlockMilestone, id).toBe(rung);
      expect(rung, id).toBe(ceilingMilestone(e!.height));
    }
    // Any other entry already stood within its own rung's ceiling, so it never moved.
    const unmoved = zoned.filter((e) => MOVED[e.id] === undefined);
    expect(unmoved.filter((e) => e.unlockMilestone < ceilingMilestone(e.height))).toEqual([]);
  });

  it('leaves works and farms free of the ceiling', () => {
    const exempt = catalog.filter((e) => e.zone !== undefined && EXEMPT_ZONES.includes(e.zone));
    expect(exempt.length).toBeGreaterThan(0);
    expect(exempt.some((e) => e.height > STOREY_CEILING_M[e.unlockMilestone]!)).toBe(true);
  });
});
