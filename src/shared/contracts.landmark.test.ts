/**
 * Landmark-ploppable contract additions (Airport): the
 * BuildingCatalogEntry.noise emission channel and the airport
 * catalog entry. The airport is a LANDMARK, not transit — every sim effect
 * flows through EXISTING systems (field emissions, park-kind service
 * coverage, power/water draw, upkeep), so the entire contract is one
 * optional field plus data.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed values.
 */
import { describe, expect, it } from 'vitest';

import type { BuildingCatalogEntry } from './types';
import { MILESTONES } from './constants';
import catalogData from '../data/catalog.json';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

describe('BuildingCatalogEntry.noise (UI-SPEC §6.10)', () => {
  it('is optional — entries without a noise emission remain valid', () => {
    const quiet: BuildingCatalogEntry = {
      id: 'quiet-shed',
      name: 'Quiet Shed',
      category: 'ind',
      footprint: { w: 1, d: 1 },
      height: 4,
      color: 0x999999,
      powerUse: 0.1,
      waterUse: 0.1,
      cost: 100,
      upkeep: 10,
      unlockMilestone: 0,
    };
    expect(quiet.noise).toBeUndefined();
  });

  it('carries a 0..255 source emission, the same pattern as pollution', () => {
    const loud: BuildingCatalogEntry = {
      id: 'loud-yard',
      name: 'Loud Yard',
      category: 'ind',
      footprint: { w: 2, d: 2 },
      height: 6,
      color: 0x888888,
      powerUse: 1,
      waterUse: 1,
      pollution: 30,
      noise: 160,
      cost: 500,
      upkeep: 50,
      unlockMilestone: 0,
    };
    expect(loud.noise).toBe(160);
    expect(loud.pollution).toBe(30);
    // @ts-expect-error noise is a number 0..255, not a string
    const bad: BuildingCatalogEntry = { ...loud, noise: 'deafening' };
    expect(bad.id).toBe('loud-yard');
  });

  it('every catalog noise value sits inside the field range 0..255', () => {
    for (const entry of catalog) {
      if (entry.noise !== undefined) {
        expect(Number.isInteger(entry.noise)).toBe(true);
        expect(entry.noise).toBeGreaterThanOrEqual(0);
        expect(entry.noise).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('airport landmark catalog entry (UI-SPEC §6.10)', () => {
  const airport = catalog.find((entry) => entry.id === 'airport');

  it('exists exactly once in the production catalog', () => {
    expect(catalog.filter((entry) => entry.id === 'airport')).toHaveLength(1);
    expect(airport?.name).toBe('International Airport');
  });

  it('is a park-category ploppable — no zone, no level, no utility spec', () => {
    expect(airport?.category).toBe('park');
    expect(airport?.zone).toBeUndefined();
    expect(airport?.level).toBeUndefined();
    expect(airport?.utility).toBeUndefined();
    expect(airport?.residents).toBeUndefined();
    expect(airport?.jobs).toBeUndefined();
  });

  it('spans the §6.10 large footprint, 8×6 tiles, 14 m terminal slab', () => {
    expect(airport?.footprint).toEqual({ w: 8, d: 6 });
    expect(airport?.height).toBe(14);
  });

  it('reads desaturated bone per the §6.6 palette', () => {
    expect(airport?.color).toBe(0xe3dac9);
    const color = airport?.color ?? 0;
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    // Desaturated (low chroma) and light (off-white/bone) palette preset.
    expect((hi - lo) / hi).toBeLessThan(0.15);
    expect(lo).toBeGreaterThan(180);
  });

  it('emits prestige and realism through existing fields: landValue 120, pollution 30, noise 160', () => {
    expect(airport?.landValueBonus).toBe(120);
    expect(airport?.pollution).toBe(30);
    expect(airport?.noise).toBe(160);
    for (const emission of [airport?.landValueBonus, airport?.pollution, airport?.noise]) {
      expect(emission).toBeGreaterThanOrEqual(0);
      expect(emission).toBeLessThanOrEqual(255);
    }
  });

  it('covers as a park-kind service, strength 200 over range 80', () => {
    expect(airport?.service).toEqual({ kind: 'park', strength: 200, range: 80 });
    expect(airport?.service?.strength).toBeLessThanOrEqual(255);
  });

  it('draws power 8 MW and water 6 kL', () => {
    expect(airport?.powerUse).toBe(8);
    expect(airport?.waterUse).toBe(6);
  });

  it('costs ¢60000 with ¢2500/month upkeep — a real ploppable, not grown', () => {
    expect(airport?.cost).toBe(60_000);
    expect(airport?.upkeep).toBe(2_500);
    expect(airport?.cost).toBeGreaterThan(0);
  });

  it('unlocks at milestone 5, a valid late MILESTONES index', () => {
    expect(airport?.unlockMilestone).toBe(5);
    expect(MILESTONES.length).toBeGreaterThan(5);
    expect(MILESTONES[5]?.population).toBeGreaterThan(0);
  });
});
