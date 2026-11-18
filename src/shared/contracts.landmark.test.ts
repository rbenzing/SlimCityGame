/**
 * Landmark-ploppable contract additions (Airport): the
 * BuildingCatalogEntry.noise emission channel and the airport
 * catalog entry. The airport is a LANDMARK filed under transit — every sim
 * effect flows through EXISTING systems (field emissions, power/water draw,
 * upkeep), so the entire contract is one optional field plus data. It is not
 * a park: it carries no service block, so it neither covers nor counts as
 * open space.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed values.
 */
import { describe, expect, it } from 'vitest';

import type { BuildingCatalogEntry } from './types';
import { MILESTONES } from './constants';
import { airportPlotTiles } from './airportlayout';
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
    expect(airport?.name).toBe('Former Airport');
  });

  it('is retired: out of the build drawer, still a catalog entry every save can load', () => {
    expect(airport?.retired).toBe(true);
  });

  it('is a transit-category ploppable, not a park — no zone, no level, no utility spec', () => {
    expect(airport?.category).toBe('transit');
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

  it('carries no service block: an airport is not a park, so it covers nothing and counts as no open space', () => {
    expect(airport?.service).toBeUndefined();
  });

  it('draws the power of its terminal floor and the water of its passengers (derived in contracts.test)', () => {
    expect(airport?.powerUse).toBe(0.4);
    expect(airport?.waterUse).toBe(175);
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

describe('the three airport catalog entries', () => {
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  const rungs = [
    {
      id: 'airfield',
      name: 'Airfield',
      plot: airportPlotTiles('airfield'),
      height: 6,
      power: 0.0015,
      water: 0.5,
      pollution: 5,
      noise: 60,
      cost: 2_400,
      upkeep: 100,
      unlock: 'Busy Township',
    },
    {
      id: 'regional-airport',
      name: 'Regional Airport',
      plot: airportPlotTiles('regional-airport'),
      height: 9,
      power: 0.12,
      water: 52,
      pollution: 15,
      noise: 120,
      cost: 18_000,
      upkeep: 750,
      unlock: 'Small City',
    },
    {
      id: 'international-airport',
      name: 'International Airport',
      plot: airportPlotTiles('international-airport'),
      height: 14,
      power: 0.4,
      water: 175,
      pollution: 30,
      noise: 160,
      cost: 60_000,
      upkeep: 2_500,
      unlock: 'Metropolis',
    },
  ];

  it.each(rungs)('pins $id to the spec', (rung) => {
    const e = byId(rung.id);
    expect(e.name).toBe(rung.name);
    expect(e.category).toBe('transit');
    expect(e.footprint).toEqual(rung.plot);
    expect(e.height).toBe(rung.height);
    expect(e.powerUse).toBe(rung.power);
    expect(e.waterUse).toBe(rung.water);
    expect(e.pollution).toBe(rung.pollution);
    expect(e.noise).toBe(rung.noise);
    expect(e.cost).toBe(rung.cost);
    expect(e.upkeep).toBe(rung.upkeep);
    expect(MILESTONES[e.unlockMilestone]?.name).toBe(rung.unlock);
    expect(e.service).toBeUndefined();
    expect(e.landValueBonus).toBeUndefined();
    expect(e.retired).toBeUndefined();
  });

  it('leaves the former airport as it was but for its name and its retirement', () => {
    const { name, retired, ...rest } = byId('airport');
    expect(name).toBe('Former Airport');
    expect(retired).toBe(true);
    expect(rest).toEqual({
      id: 'airport',
      category: 'transit',
      footprint: { w: 8, d: 6 },
      height: 14,
      color: 14932681,
      powerUse: 0.4,
      waterUse: 175,
      pollution: 30,
      noise: 160,
      landValueBonus: 120,
      cost: 60000,
      upkeep: 2500,
      unlockMilestone: 5,
    });
  });
});
