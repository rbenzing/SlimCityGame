import { describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import { createGrid, GROUND_HUGGING_LIFT_M, touchesStreet } from './grid';

const SIZE = 16;
const at = (x: number, z: number): number => z * SIZE + x;
/** A 2 x 2 footprint at (5, 5). */
const footprint = [
  { x: 5, z: 5 },
  { x: 6, z: 5 },
  { x: 5, z: 6 },
  { x: 6, z: 6 },
];

describe('touchesStreet', () => {
  it('is false for an empty ring', () => {
    expect(touchesStreet(createGrid(SIZE), footprint)).toBe(false);
  });

  it.each([
    ['north', 5, 4],
    ['south', 6, 7],
    ['west', 4, 6],
    ['east', 7, 5],
  ])('is true for a street beside the %s edge', (_side, x, z) => {
    const g = createGrid(SIZE);
    g.roadTier[at(x, z)] = RoadTier.TwoLane;
    expect(touchesStreet(g, footprint)).toBe(true);
  });

  it.each([
    ['gravel', RoadTier.Gravel],
    ['an alley', RoadTier.Alley],
    ['a one-way street', RoadTier.OneWay],
    ['an avenue', RoadTier.Avenue],
    ['a tram street', RoadTier.Tram],
  ])('counts %s as a street', (_name, tier) => {
    const g = createGrid(SIZE);
    g.roadTier[at(4, 5)] = tier;
    expect(touchesStreet(g, footprint)).toBe(true);
  });

  it.each([
    ['a motorway', RoadTier.Highway],
    ['a ramp', RoadTier.Ramp],
    ['rail', RoadTier.RailTrack],
  ])('does not count %s as a street', (_name, tier) => {
    const g = createGrid(SIZE);
    g.roadTier[at(4, 5)] = tier;
    expect(touchesStreet(g, footprint)).toBe(false);
  });

  it('does not count a street touching only at a corner', () => {
    const g = createGrid(SIZE);
    g.roadTier[at(4, 4)] = RoadTier.TwoLane;
    g.roadTier[at(7, 7)] = RoadTier.TwoLane;
    expect(touchesStreet(g, footprint)).toBe(false);
  });

  it('does not count a street a tile away', () => {
    const g = createGrid(SIZE);
    g.roadTier[at(3, 5)] = RoadTier.TwoLane;
    expect(touchesStreet(g, footprint)).toBe(false);
  });

  it('does not count an elevated deck, but a sliver of lift still lies on its ground', () => {
    const g = createGrid(SIZE);
    g.roadTier[at(4, 5)] = RoadTier.TwoLane;
    g.roadElevation[at(4, 5)] = 6;
    expect(touchesStreet(g, footprint)).toBe(false);
    g.roadElevation[at(4, 5)] = GROUND_HUGGING_LIFT_M / 2;
    expect(touchesStreet(g, footprint)).toBe(true);
  });

  it('does not count a road passing over a crossing, only the ground layer', () => {
    const g = createGrid(SIZE);
    g.overTier[at(4, 5)] = RoadTier.TwoLane;
    expect(touchesStreet(g, footprint)).toBe(false);
  });

  it('ignores the map edge and reads a framed footprint by its own tiles', () => {
    const g = createGrid(SIZE);
    g.roadTier[at(1, 0)] = RoadTier.TwoLane;
    expect(touchesStreet(g, [{ x: 0, z: 0 }])).toBe(true);
    expect(touchesStreet(g, [{ x: 0, z: 15 }])).toBe(false);
    // A turned parcel claims an L of tiles; the street meets the far arm.
    const l = [
      { x: 5, z: 5 },
      { x: 5, z: 6 },
      { x: 6, z: 6 },
    ];
    g.roadTier[at(7, 6)] = RoadTier.TwoLane;
    expect(touchesStreet(g, l)).toBe(true);
  });
});
