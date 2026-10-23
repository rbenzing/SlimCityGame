/**
 * Parks-and-recreation catalog contract: the five park rungs, their figures
 * derived from the published standard rather than typed, and the entries that
 * drape on the ground instead of levelling it.
 *
 * Every capacity is tiles × residents-per-tile ÷ 5 and every range is the
 * walking standard in tiles less the two coverage radiates, so a number
 * edited alone fails here.
 */
import { describe, expect, it } from 'vitest';

import type { BuildingCatalogEntry } from './types';
import { OPEN_SPACE_TILES_PER_THOUSAND, TILE_METERS } from './constants';
import catalogData from '../data/catalog.json';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => {
  const entry = catalog.find((e) => e.id === id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  return entry;
};

/** The tiles coverage radiates around each reached road tile: the walk from road to gate. */
const RADIATED_TILES = 2;
/** The five park typologies pooled into one service kind: a fifth each. */
const TYPOLOGIES = 5;
const TILE_SQ_M = TILE_METERS * TILE_METERS;

/**
 * Each rung's typology from the outdoor-space standard: square metres owed per
 * resident and the maximum walk to it, in metres; and what it does to its ground.
 */
const LADDER: ReadonlyArray<{
  id: string;
  name: string;
  footprint: { w: number; d: number };
  sqMPerResident: number;
  walkM: number;
  capacity: number;
  range: number;
  strength: number;
  landValueBonus: number;
  cost: number;
  upkeep: number;
  unlockMilestone: number;
  ground: 'level' | 'drape';
}> = [
  {
    id: 'small-park',
    name: 'Pocket Park',
    footprint: { w: 1, d: 1 },
    sqMPerResident: 2.5,
    walkM: 400,
    capacity: 32,
    range: 18,
    strength: 80,
    landValueBonus: 40,
    cost: 400,
    upkeep: 20,
    unlockMilestone: 0,
    ground: 'level',
  },
  {
    id: 'civic-plaza',
    name: 'Civic Plaza',
    footprint: { w: 5, d: 5 },
    sqMPerResident: 3,
    walkM: 700,
    capacity: 675,
    range: 33,
    strength: 50,
    landValueBonus: 30,
    cost: 14_200,
    upkeep: 80,
    unlockMilestone: 2,
    ground: 'level',
  },
  {
    id: 'neighbourhood-park',
    name: 'Neighbourhood Park',
    footprint: { w: 9, d: 9 },
    sqMPerResident: 6,
    walkM: 480,
    capacity: 1_053,
    range: 22,
    strength: 100,
    landValueBonus: 60,
    cost: 5_100,
    upkeep: 250,
    unlockMilestone: 1,
    ground: 'drape',
  },
  {
    id: 'district-park',
    name: 'District Park',
    footprint: { w: 20, d: 20 },
    sqMPerResident: 8,
    walkM: 710,
    capacity: 4_000,
    range: 34,
    strength: 200,
    landValueBonus: 100,
    cost: 44_000,
    upkeep: 1_250,
    unlockMilestone: 3,
    ground: 'drape',
  },
  {
    id: 'sports-ground',
    name: 'Sports Ground',
    footprint: { w: 6, d: 4 },
    sqMPerResident: 16,
    walkM: 1_200,
    capacity: 120,
    range: 58,
    strength: 50,
    landValueBonus: 40,
    cost: 1_400,
    upkeep: 120,
    unlockMilestone: 2,
    ground: 'level',
  },
];

describe('the park ladder', () => {
  it('is exactly the five rungs, in catalog order, every one a park-kind service', () => {
    const parks = catalog.filter((e) => e.category === 'park');
    expect(parks.map((e) => e.id)).toEqual(LADDER.map((r) => r.id));
    for (const park of parks) {
      expect(park.service?.kind).toBe('park');
      expect(park.name).toBe(LADDER.find((r) => r.id === park.id)?.name);
    }
    // And no park-kind service hides under another category.
    expect(catalog.filter((e) => e.service?.kind === 'park').map((e) => e.id)).toEqual(
      LADDER.map((r) => r.id),
    );
  });

  it.each(LADDER)('$id: capacity is its tiles × (residents a tile owes ÷ 5)', (rung) => {
    const entry = byId(rung.id);
    expect(entry.footprint).toEqual(rung.footprint);
    const residentsPerTile = Math.round(TILE_SQ_M / rung.sqMPerResident);
    const perTile = Math.round(residentsPerTile / TYPOLOGIES);
    const tiles = rung.footprint.w * rung.footprint.d;
    expect(entry.service?.capacity).toBe(tiles * perTile);
    expect(entry.service?.capacity).toBe(rung.capacity);
  });

  it.each(LADDER)(
    '$id: range is the walking standard in tiles, less the two it radiates',
    (rung) => {
      const entry = byId(rung.id);
      expect(entry.service?.range).toBe(Math.round(rung.walkM / TILE_METERS) - RADIATED_TILES);
      expect(entry.service?.range).toBe(rung.range);
    },
  );

  it.each(LADDER)('$id: strength, bonus, price, upkeep and unlock as designed', (rung) => {
    const entry = byId(rung.id);
    expect(entry.service?.strength).toBe(rung.strength);
    expect(entry.landValueBonus).toBe(rung.landValueBonus);
    expect(entry.cost).toBe(rung.cost);
    expect(entry.upkeep).toBe(rung.upkeep);
    expect(entry.unlockMilestone).toBe(rung.unlockMilestone);
  });

  it('drapes only the two lawns on the ground; paving, the pitch and the pocket park level theirs', () => {
    for (const rung of LADDER) {
      const entry = byId(rung.id);
      expect(entry.ground ?? 'level').toBe(rung.ground);
    }
    expect(catalog.filter((e) => e.ground === 'drape').map((e) => e.id)).toEqual([
      'neighbourhood-park',
      'district-park',
    ]);
  });

  it('draws water in proportion to its ground, at the pocket park’s rate per tile', () => {
    const perTile = byId('small-park').waterUse;
    for (const rung of LADDER) {
      const entry = byId(rung.id);
      expect(entry.waterUse).toBeCloseTo(perTile * rung.footprint.w * rung.footprint.d, 9);
    }
  });

  it('reads provision against the Six Acre Standard: 2.4 ha per 1,000 at 25 tiles a hectare', () => {
    expect(OPEN_SPACE_TILES_PER_THOUSAND).toBe(2.4 * (10_000 / TILE_SQ_M));
  });
});
