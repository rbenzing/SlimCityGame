import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CLEARANCE_M,
  BRIDGE_COST_PER_METER_TILE,
  BRIDGE_MAX_ELEVATION,
  BRIDGE_MAX_GRADE,
} from '../shared/constants';
import { FIELD_COUNT, RoadTier } from '../shared/types';
import type { GridState, TilePoint } from '../shared/types';
import { isElevated, solveElevationProfile } from './bridges';

function makeGrid(size: number): GridState {
  const n = size * size;
  return {
    size,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(n)),
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
    roadElevation: new Uint8Array(n),
  };
}

const idx = (size: number, x: number, z: number): number => z * size + x;

/** A west-east run of tiles along row z. */
function run(z: number, fromX: number, toX: number): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let x = fromX; x <= toX; x++) tiles.push({ x, z });
  return tiles;
}

/** Digs a channel of water tiles (depth metres below sea level) across a row. */
function carveRiver(g: GridState, z: number, fromX: number, toX: number, depth = 3): void {
  for (let x = fromX; x <= toX; x++) {
    const i = idx(g.size, x, z);
    g.water[i] = 1;
    g.height[i] = -depth;
  }
}

describe('solveElevationProfile', () => {
  it('leaves a run across dry flat ground at grade, for free', () => {
    const g = makeGrid(16);
    const result = solveElevationProfile(g, run(5, 2, 10));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elevations.every((e) => e === 0)).toBe(true);
    expect(result.cost).toBe(0);
    expect(isElevated(result.elevations)).toBe(false);
  });

  it('lifts the deck clear of the water where a run crosses a river', () => {
    const g = makeGrid(16);
    const depth = 3;
    carveRiver(g, 5, 7, 9, depth);

    const tiles = run(5, 0, 15);
    const result = solveElevationProfile(g, tiles);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Elevation is relative to each tile's own terrain, and a riverbed sits
    // below sea level — so clearing the surface costs the depth on top.
    const overWater = BRIDGE_CLEARANCE_M + depth;
    for (const x of [7, 8, 9]) {
      expect(result.elevations[tiles.findIndex((t) => t.x === x)]).toBe(overWater);
    }
    expect(isElevated(result.elevations)).toBe(true);
  });

  it('ramps the approaches down to the ground within the grade limit', () => {
    const g = makeGrid(24);
    carveRiver(g, 5, 11, 13);

    const tiles = run(5, 0, 23);
    const result = solveElevationProfile(g, tiles);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Grade is a property of the DECK, in world height — the stored offsets are
    // relative to terrain, so they step wherever the bank falls away beneath.
    const deckY = tiles.map((t, i) => g.height[idx(24, t.x, t.z)]! + result.elevations[i]!);
    for (let i = 1; i < deckY.length; i++) {
      expect(Math.abs(deckY[i]! - deckY[i - 1]!)).toBeLessThanOrEqual(BRIDGE_MAX_GRADE);
    }
    // Both ends reach the ground: the banks are long enough to land on.
    expect(result.elevations[0]).toBe(0);
    expect(result.elevations[result.elevations.length - 1]).toBe(0);
  });

  it('refuses a span that would end in mid-air on dry ground', () => {
    const g = makeGrid(16);
    // River right at the end of the drag: there is no bank left to ramp down on.
    carveRiver(g, 5, 4, 8);

    const result = solveElevationProfile(g, run(5, 3, 8));
    expect(result).toEqual({ ok: false, reason: 'grade' });
  });

  it('allows a span to stop over water — a dead end gets capped, not rejected', () => {
    const g = makeGrid(16);
    carveRiver(g, 5, 6, 12);

    // Ends ON water rather than just short of dry land.
    const result = solveElevationProfile(g, run(5, 0, 8));
    expect(result.ok).toBe(true);
  });

  it('refuses to join an existing road at a step steeper than the grade limit', () => {
    const g = makeGrid(16);
    carveRiver(g, 5, 6, 8);
    // An at-grade road already built hard against the water's edge.
    g.roadTier[idx(16, 5, 5)] = RoadTier.TwoLane;

    const result = solveElevationProfile(g, run(5, 6, 14));
    expect(result).toEqual({ ok: false, reason: 'grade' });
  });

  it('meets an existing elevated road at its own height', () => {
    const g = makeGrid(16);
    // A deck already standing at 6m, continued by a fresh drag.
    g.roadTier[idx(16, 5, 5)] = RoadTier.TwoLane;
    g.roadElevation[idx(16, 5, 5)] = 6;

    const result = solveElevationProfile(g, run(5, 6, 14));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // First tile is within one legal step of the 6m neighbour, then ramps down.
    expect(Math.abs(result.elevations[0]! - 6)).toBeLessThanOrEqual(BRIDGE_MAX_GRADE);
    expect(result.elevations[result.elevations.length - 1]).toBe(0);
  });

  it('raises a deliberate viaduct over dry ground and ramps both ends', () => {
    const g = makeGrid(32);
    const manual = 8;

    const result = solveElevationProfile(g, run(5, 0, 31), manual);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Math.max(...result.elevations)).toBe(manual);
    expect(result.elevations[0]).toBe(0);
    expect(result.elevations[result.elevations.length - 1]).toBe(0);
  });

  it('rejects a deck taller than the ceiling', () => {
    const g = makeGrid(64);
    const result = solveElevationProfile(g, run(5, 0, 63), BRIDGE_MAX_ELEVATION + 1);
    expect(result).toEqual({ ok: false, reason: 'height' });
  });

  it('charges per metre of deck, per tile', () => {
    const g = makeGrid(32);
    const result = solveElevationProfile(g, run(5, 0, 31), 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const metres = result.elevations.reduce((sum, e) => sum + e, 0);
    expect(result.cost).toBe(metres * BRIDGE_COST_PER_METER_TILE);
  });

  it('returns an empty profile for an empty drag', () => {
    const g = makeGrid(8);
    expect(solveElevationProfile(g, [])).toEqual({ ok: true, elevations: [], cost: 0 });
  });
});
