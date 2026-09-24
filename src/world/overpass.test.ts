import { describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import { createGrid } from './grid';
import { clearOverRoad, overRoadAt, overRoadChanges, setOverRoad } from './overpass';
import type { OverRoad } from './overpass';

const street: OverRoad = { tier: RoadTier.TwoLane, profile: 1, flow: 2, elevation: 8 };

describe('the road passing over a crossing tile', () => {
  it('is written, read and cleared as one unit', () => {
    const g = createGrid(4);
    expect(overRoadAt(g, 5)).toBeNull();
    setOverRoad(g, 5, street);
    expect(overRoadAt(g, 5)).toEqual(street);
    clearOverRoad(g, 5);
    expect(overRoadAt(g, 5)).toBeNull();
    expect(g.overElevation[5]).toBe(0);
  });
});

describe('overRoadChanges', () => {
  const avenue: OverRoad = { ...street, tier: RoadTier.Avenue, profile: 2 };
  const gravel: OverRoad = { ...street, tier: RoadTier.Gravel, profile: 4 };

  it('lays over a crossing that carries nothing yet', () => {
    expect(overRoadChanges(null, street, false)).toBe(true);
  });

  it('takes it from a road it outranks, and not from one it does not', () => {
    expect(overRoadChanges(street, avenue, false)).toBe(true);
    expect(overRoadChanges(street, gravel, false)).toBe(false);
  });

  it('re-lays the same road at a new height, and leaves an identical one alone', () => {
    expect(overRoadChanges(street, { ...street, elevation: 10 }, false)).toBe(true);
    expect(overRoadChanges(street, { ...street }, false)).toBe(false);
  });

  it('lets replace mode lay a lesser road over a greater one', () => {
    expect(overRoadChanges(street, gravel, true)).toBe(true);
    expect(overRoadChanges(street, { ...street }, true)).toBe(false);
  });
});
