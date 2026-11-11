import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { frontSideOf, NO_SENSORS, type KitSensors } from './kitfront';
import type { Side } from './roadedge';
import type { BuildingCatalogEntry } from './types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entry = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

const ROTATIONS = [0, 1, 2, 3] as const;
const sideAt = (
  id: string,
  rotation: 0 | 1 | 2 | 3,
  sensors: KitSensors = NO_SENSORS,
): Side | null => frontSideOf(entry(id), 10, 10, rotation, sensors);

describe('frontSideOf', () => {
  it('puts a kit’s front on its local +Z edge: south, east, north, west as it is turned', () => {
    expect(ROTATIONS.map((r) => sideAt('school', r))).toEqual(['S', 'E', 'N', 'W']);
    expect(ROTATIONS.map((r) => sideAt('hospital', r))).toEqual(['S', 'E', 'N', 'W']);
  });

  it('puts a plain building’s front where a kit’s is', () => {
    const plain = catalog.find((e) => e.zone !== undefined && !e.offStreet)!;
    expect(ROTATIONS.map((r) => frontSideOf(plain, 10, 10, r, NO_SENSORS))).toEqual([
      'S',
      'E',
      'N',
      'W',
    ]);
  });

  it('puts an airport’s terminal side, its back edge, opposite a kit’s front', () => {
    expect(ROTATIONS.map((r) => sideAt('airport', r))).toEqual(['N', 'W', 'S', 'E']);
  });

  it('turns a shore kit’s land side away from the water, whatever its rotation', () => {
    const water = (wx: number, wz: number): boolean => wx === 12 && wz >= 10 && wz < 12; // east of a 2 x 2 at (10, 10)
    const sensors: KitSensors = { waterAt: water, railAt: () => false };
    for (const r of ROTATIONS) expect(sideAt('sewage-works', r, sensors)).toBe('W');
  });

  it('turns a rail station’s front away from its track', () => {
    const track =
      (side: 'N' | 'E' | 'S' | 'W') =>
      (tx: number, tz: number): boolean => {
        // A 2 x 3 station at (10, 10) turned 0: the rail along the edge named.
        if (side === 'N') return tz === 9 && tx >= 10 && tx < 12;
        if (side === 'S') return tz === 13 && tx >= 10 && tx < 12;
        if (side === 'E') return tx === 12 && tz >= 10 && tz < 13;
        return tx === 9 && tz >= 10 && tz < 13;
      };
    const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' } as const;
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const sensors: KitSensors = { waterAt: () => false, railAt: track(side) };
      expect(sideAt('rail-station', 0, sensors)).toBe(opposite[side]);
    }
  });

  it('has no front for a kind marked off-street, or a depot whose gate faces its track', () => {
    for (const id of ['wind-turbine', 'solar-farm', 'water-pump', 'water-drain', 'tram-depot']) {
      for (const r of ROTATIONS) expect(sideAt(id, r)).toBeNull();
    }
  });

  it('declares a front for every other placed kind', () => {
    const fronts = catalog
      .filter(
        (e) => !e.zone && !e.offStreet && e.id !== 'tram-depot' && !e.id.startsWith('bus-stop'),
      )
      .map((e) => [e.id, frontSideOf(e, 10, 10, 0, NO_SENSORS)]);
    expect(fronts.filter(([, side]) => side === null)).toEqual([]);
  });
});
