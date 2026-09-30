import { describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import { createGrid } from './grid';
import {
  clearOverRoad,
  liftToOverLayer,
  overRoadAt,
  overRoadChanges,
  setOverRoad,
} from './overpass';
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

describe('liftToOverLayer', () => {
  it('moves the road on a tile up onto its over layer exactly as it stands', () => {
    const g = createGrid(4);
    g.roadTier[5] = RoadTier.Avenue;
    g.roadProfile[5] = 2;
    g.roadFlow[5] = 3;
    g.roadElevation[5] = 7.5;
    g.roadMask[5] = 1 | 4;
    const moved = liftToOverLayer(g, 5);
    expect(moved).toEqual({ tier: RoadTier.Avenue, profile: 2, flow: 3, elevation: 7.5 });
    expect(overRoadAt(g, 5)).toEqual(moved);
    expect(g.roadTier[5]).toBe(RoadTier.None);
    expect(g.roadProfile[5]).toBe(0);
    expect(g.roadFlow[5]).toBe(0);
    expect(g.roadElevation[5]).toBe(0);
    expect(g.roadMask[5]).toBe(0);
  });

  it('reads a preset road with no stored profile as its tier', () => {
    const g = createGrid(4);
    g.roadTier[5] = RoadTier.TwoLane;
    expect(liftToOverLayer(g, 5)?.profile).toBe(RoadTier.TwoLane);
  });

  it('moves nothing from an empty tile or one that already carries a road over it', () => {
    const g = createGrid(4);
    expect(liftToOverLayer(g, 5)).toBeNull();
    g.roadTier[6] = RoadTier.TwoLane;
    setOverRoad(g, 6, street);
    expect(liftToOverLayer(g, 6)).toBeNull();
    expect(g.roadTier[6]).toBe(RoadTier.TwoLane);
    expect(overRoadAt(g, 6)).toEqual(street);
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
