/**
 * Roads contract additions: the RoadSpec optional fields (noiseMult / oneWay /
 * carriesWater / surface), the four new RoadTier members
 * (Gravel/Alley/OneWay/FourLane -> 4..7), and the roads.json catalog entries.
 * Everything is ADDITIVE — the existing three specs keep their tier numbers and
 * every existing numeric value.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed values.
 */
import { describe, expect, it } from 'vitest';

import type { RoadSpec } from './types';
import { RoadTier } from './types';
import { MILESTONES } from './constants';
import roadsData from '../data/roads.json';

const specs = (roadsData as { specs: RoadSpec[] }).specs;
const byTier = (tier: RoadTier): RoadSpec | undefined => specs.find((s) => s.tier === tier);

describe('RoadTier v3 members (UI-SPEC §6.7 Roads v3)', () => {
  it('keeps the existing members and their exact values — additive only', () => {
    expect(RoadTier.None).toBe(0);
    expect(RoadTier.TwoLane).toBe(1);
    expect(RoadTier.Avenue).toBe(2);
    expect(RoadTier.Highway).toBe(3);
  });

  it('gains the four new named members mapped to 4..7, continuing upward', () => {
    expect(RoadTier.Gravel).toBe(4);
    expect(RoadTier.Alley).toBe(5);
    expect(RoadTier.OneWay).toBe(6);
    expect(RoadTier.FourLane).toBe(7);
  });

  it('gains the roads-epic transit lane members at 8..9', () => {
    expect(RoadTier.BusLane).toBe(8);
    expect(RoadTier.BikeLane).toBe(9);
  });

  it('all tier values fit the grid roadTier Uint8Array and stay unique', () => {
    const values = Object.values(RoadTier);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('RoadSpec v3 optional fields (UI-SPEC §6.7 Roads v3)', () => {
  it('are all optional — a v1-shaped spec remains valid unchanged', () => {
    const legacy: RoadSpec = {
      tier: RoadTier.TwoLane,
      name: 'Plain Road',
      costPerTile: 20,
      upkeepPerTile: 0.4,
      speed: 14,
      capacity: 600,
      unlockMilestone: 0,
    };
    expect(legacy.noiseMult).toBeUndefined(); // default 1×
    expect(legacy.oneWay).toBeUndefined(); // default bidirectional
    expect(legacy.carriesWater).toBeUndefined(); // default true (carries pipes)
    expect(legacy.surface).toBeUndefined(); // default 'paved'
  });

  it('accepts the full v3 shape with typed values', () => {
    const v3: RoadSpec = {
      tier: RoadTier.Gravel,
      name: 'Test Gravel',
      costPerTile: 8,
      upkeepPerTile: 0.15,
      speed: 8,
      capacity: 200,
      unlockMilestone: 0,
      noiseMult: 2,
      oneWay: false,
      carriesWater: true,
      surface: 'gravel',
    };
    expect(v3.noiseMult).toBe(2);
    expect(v3.oneWay).toBe(false);
    expect(v3.carriesWater).toBe(true);
    expect(v3.surface).toBe('gravel');
    // @ts-expect-error surface is the closed literal union 'paved' | 'gravel'
    const badSurface: RoadSpec = { ...v3, surface: 'dirt' };
    expect(badSurface.tier).toBe(RoadTier.Gravel);
    // @ts-expect-error oneWay is a boolean, not a direction string
    const badOneWay: RoadSpec = { ...v3, oneWay: 'north' };
    expect(badOneWay.tier).toBe(RoadTier.Gravel);
  });
});

describe('roads.json catalog v3 (UI-SPEC §6.7 Roads v3)', () => {
  it('holds exactly nine specs with unique tiers 1..9', () => {
    expect(specs).toHaveLength(9);
    expect(new Set(specs.map((s) => s.tier)).size).toBe(9);
    expect([...specs.map((s) => s.tier)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('Bus Lane (tier 8): transit-priority, unlock M2, above avenue in cost + capacity', () => {
    const bus = byTier(RoadTier.BusLane);
    expect(bus).toEqual({
      tier: 8,
      name: 'Bus Lane',
      costPerTile: 55,
      upkeepPerTile: 1.1,
      speed: 18,
      capacity: 2200,
      unlockMilestone: 2,
    });
    // Paved + bidirectional (differentiator is cosmetic colored paint, not routing).
    expect(bus?.surface).toBeUndefined();
    expect(bus?.oneWay).toBeUndefined();
  });

  it('Bike Lane (tier 9): cheap, unlock M1, modest capacity above two-lane', () => {
    const bike = byTier(RoadTier.BikeLane);
    expect(bike).toEqual({
      tier: 9,
      name: 'Bike Lane',
      costPerTile: 28,
      upkeepPerTile: 0.5,
      speed: 14,
      capacity: 750,
      unlockMilestone: 1,
    });
    expect(bike!.capacity).toBeGreaterThan(byTier(RoadTier.TwoLane)!.capacity);
  });

  it('keeps the existing three specs byte-for-byte on their v1 numbers', () => {
    expect(byTier(RoadTier.TwoLane)).toMatchObject({
      name: 'Two-Lane Road',
      costPerTile: 20,
      upkeepPerTile: 0.4,
      speed: 14,
      capacity: 600,
      unlockMilestone: 0,
    });
    expect(byTier(RoadTier.Avenue)).toMatchObject({
      name: 'Avenue',
      costPerTile: 45,
      upkeepPerTile: 0.9,
      speed: 18,
      capacity: 1600,
      unlockMilestone: 1,
    });
    expect(byTier(RoadTier.Highway)).toMatchObject({
      name: 'Highway',
      costPerTile: 90,
      upkeepPerTile: 1.8,
      speed: 28,
      capacity: 4000,
      unlockMilestone: 3,
    });
  });

  it('Highway gains carriesWater false (power only, never water) and 3× noise', () => {
    const highway = byTier(RoadTier.Highway);
    expect(highway?.carriesWater).toBe(false);
    expect(highway?.noiseMult).toBe(3);
    expect(highway?.oneWay).toBeUndefined();
    expect(highway?.surface).toBeUndefined(); // paved by default
  });

  it('every non-highway spec carries water implicitly (no carriesWater: false)', () => {
    for (const spec of specs) {
      if (spec.tier !== RoadTier.Highway) {
        expect(spec.carriesWater).not.toBe(false);
      }
    }
  });

  it('Gravel Road: ¢8/tile, 0.15 upkeep, speed 8, capacity 200, M0, 2× noise, gravel surface', () => {
    expect(byTier(RoadTier.Gravel)).toEqual({
      tier: 4,
      name: 'Gravel Road',
      costPerTile: 8,
      upkeepPerTile: 0.15,
      speed: 8,
      capacity: 200,
      unlockMilestone: 0,
      noiseMult: 2,
      surface: 'gravel',
    });
  });

  it('Alley: ¢14/tile, 0.3 upkeep, speed 10, capacity 350, unlock M1', () => {
    expect(byTier(RoadTier.Alley)).toEqual({
      tier: 5,
      name: 'Alley',
      costPerTile: 14,
      upkeepPerTile: 0.3,
      speed: 10,
      capacity: 350,
      unlockMilestone: 1,
    });
  });

  it('One-Way Road: ¢24/tile, 0.45 upkeep, speed 16, capacity 1100, M1, oneWay', () => {
    expect(byTier(RoadTier.OneWay)).toEqual({
      tier: 6,
      name: 'One-Way Road',
      costPerTile: 24,
      upkeepPerTile: 0.45,
      speed: 16,
      capacity: 1100,
      unlockMilestone: 1,
      oneWay: true,
    });
  });

  it('Four-Lane Road: ¢32/tile, 0.7 upkeep, speed 17, capacity 1200, M1 — between two-lane and avenue', () => {
    const fourLane = byTier(RoadTier.FourLane);
    expect(fourLane).toEqual({
      tier: 7,
      name: 'Four-Lane Road',
      costPerTile: 32,
      upkeepPerTile: 0.7,
      speed: 17,
      capacity: 1200,
      unlockMilestone: 1,
    });
    // Sits between Two-Lane and Avenue in price and capacity per the spec.
    const two = byTier(RoadTier.TwoLane)!;
    const avenue = byTier(RoadTier.Avenue)!;
    expect(fourLane!.costPerTile).toBeGreaterThan(two.costPerTile);
    expect(fourLane!.costPerTile).toBeLessThan(avenue.costPerTile);
    expect(fourLane!.capacity).toBeGreaterThan(two.capacity);
    expect(fourLane!.capacity).toBeLessThan(avenue.capacity);
  });

  it('only One-Way is directed; only Gravel is unpaved', () => {
    expect(specs.filter((s) => s.oneWay === true).map((s) => s.tier)).toEqual([RoadTier.OneWay]);
    expect(specs.filter((s) => s.surface === 'gravel').map((s) => s.tier)).toEqual([
      RoadTier.Gravel,
    ]);
  });

  it('every spec stays economically sane and unlockable', () => {
    for (const spec of specs) {
      expect(spec.costPerTile).toBeGreaterThan(0);
      expect(spec.upkeepPerTile).toBeGreaterThan(0);
      expect(spec.upkeepPerTile).toBeLessThan(spec.costPerTile);
      expect(spec.speed).toBeGreaterThan(0);
      expect(spec.capacity).toBeGreaterThan(0);
      expect(spec.unlockMilestone).toBeGreaterThanOrEqual(0);
      expect(spec.unlockMilestone).toBeLessThan(MILESTONES.length);
      if (spec.noiseMult !== undefined) expect(spec.noiseMult).toBeGreaterThan(0);
    }
  });
});
