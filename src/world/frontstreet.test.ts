import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { RoadTier } from '../shared/types';
import type { BuildingCatalogEntry } from '../shared/types';
import { createGrid, frontingTurns, frontTouchesStreet } from './grid';

const SIZE = 32;
const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entry = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const at = (x: number, z: number): number => z * SIZE + x;
const ROTATIONS = [0, 1, 2, 3] as const;

/** A school, 3 x 3, at (10, 10): its ring is x 9..13, z 9..13. */
const school = entry('school');
const NORTH = { x: 11, z: 9 };
const SOUTH = { x: 11, z: 13 };
const WEST = { x: 9, z: 11 };
const EAST = { x: 13, z: 11 };

function gridWith(...streets: { x: number; z: number }[]) {
  const g = createGrid(SIZE);
  for (const s of streets) g.roadTier[at(s.x, s.z)] = RoadTier.TwoLane;
  return g;
}

describe('frontTouchesStreet', () => {
  it.each([
    ['north', NORTH, 2],
    ['east', EAST, 1],
    ['south', SOUTH, 0],
    ['west', WEST, 3],
  ])(
    'is true for exactly the rotation that turns a kit’s front to a street on its %s',
    (_side, street, front) => {
      const g = gridWith(street);
      const fronting = ROTATIONS.filter((r) => frontTouchesStreet(g, school, 10, 10, r));
      expect(fronting).toEqual([front]);
    },
  );

  it('is true for two rotations on a corner lot, and for none with no street', () => {
    const corner = gridWith(NORTH, WEST);
    expect(ROTATIONS.filter((r) => frontTouchesStreet(corner, school, 10, 10, r))).toEqual([2, 3]);
    expect(ROTATIONS.filter((r) => frontTouchesStreet(gridWith(), school, 10, 10, r))).toEqual([]);
  });

  it('does not count a motorway or a street at the footprint’s corner for the front', () => {
    const g = createGrid(SIZE);
    for (let x = 10; x < 13; x++) g.roadTier[at(x, 13)] = RoadTier.Highway;
    g.roadTier[at(13, 13)] = RoadTier.TwoLane;
    expect(frontTouchesStreet(g, school, 10, 10, 0)).toBe(false);
  });

  it('turns a rail station’s front away from its track and onto the street', () => {
    const station = entry('rail-station'); // 2 x 3
    const g = createGrid(SIZE);
    for (let x = 9; x < 14; x++) g.roadTier[at(x, 9)] = RoadTier.RailTrack; // the track, north
    for (let x = 10; x < 12; x++) g.roadTier[at(x, 13)] = RoadTier.TwoLane; // the street, south
    // The turn follows the track, not the rotation; only the footprint (2 x 3) reaches the street.
    expect(ROTATIONS.filter((r) => frontTouchesStreet(g, station, 10, 10, r))).toEqual([0, 2]);
    // The street on the track's side leaves the front, opposite the track, on no street.
    const wrong = createGrid(SIZE);
    for (let x = 9; x < 14; x++) wrong.roadTier[at(x, 9)] = RoadTier.RailTrack;
    for (let x = 10; x < 12; x++) wrong.roadTier[at(x, 8)] = RoadTier.TwoLane;
    expect(ROTATIONS.some((r) => frontTouchesStreet(wrong, station, 10, 10, r))).toBe(false);
  });

  it('turns a shore kit’s land side to the street, away from the water', () => {
    const works = entry('sewage-works'); // 2 x 2
    const g = createGrid(SIZE);
    g.water[at(12, 10)] = 1;
    g.water[at(12, 11)] = 1;
    g.roadTier[at(9, 10)] = RoadTier.TwoLane; // west, the land side
    expect(frontTouchesStreet(g, works, 10, 10, 0)).toBe(true);
    const onTheShore = createGrid(SIZE);
    onTheShore.water[at(12, 10)] = 1;
    onTheShore.roadTier[at(10, 9)] = RoadTier.TwoLane; // north, not the land side
    expect(frontTouchesStreet(onTheShore, works, 10, 10, 0)).toBe(false);
  });

  it('always passes a kind that stands off the street', () => {
    for (const id of ['wind-turbine', 'solar-farm', 'water-pump', 'water-drain']) {
      for (const r of ROTATIONS)
        expect(frontTouchesStreet(gridWith(), entry(id), 10, 10, r)).toBe(true);
    }
  });
});

describe('frontingTurns', () => {
  it('lists each turn that fronts a street with the side it fronts', () => {
    expect(frontingTurns(gridWith(NORTH, WEST), school, 10, 10)).toEqual([
      { rotation: 2, side: 'N' },
      { rotation: 3, side: 'W' },
    ]);
  });

  it('is empty with no street, and null for a building with no front on one', () => {
    expect(frontingTurns(gridWith(), school, 10, 10)).toEqual([]);
    expect(frontingTurns(gridWith(), entry('wind-turbine'), 10, 10)).toBeNull();
  });

  it('lists a shore kit once, since every rotation fronts the same side', () => {
    const g = createGrid(SIZE);
    g.water[at(12, 10)] = 1;
    g.roadTier[at(9, 10)] = RoadTier.TwoLane;
    expect(frontingTurns(g, entry('sewage-works'), 10, 10)).toEqual([{ rotation: 0, side: 'W' }]);
  });
});
