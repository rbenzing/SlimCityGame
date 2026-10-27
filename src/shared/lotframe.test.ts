import { describe, expect, it } from 'vitest';
import { claimedTiles, frameCorners, frameOfGridLot, toLocal, toWorld } from './lotframe';
import type { ParcelFrame } from './types';

const close = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('a parcel frame is a north-fronting grid lot moved and turned', () => {
  it('is the identity on a north-fronting grid lot', () => {
    const frame = frameOfGridLot(3, 4, 1, 2, 'N');
    const p = toWorld(frame, 5, 7);
    close(p.x, 65);
    close(p.z, 87);
  });

  it('turns (u, v) to (-v, u) at heading π/2', () => {
    const frame: ParcelFrame = { x: 0, z: 0, heading: Math.PI / 2 };
    const p = toWorld(frame, 5, 7);
    close(p.x, -7);
    close(p.z, 5);
  });

  it('inverts toWorld at any heading', () => {
    const frame: ParcelFrame = { x: 123.4, z: -56.7, heading: 0.83 };
    const p = toWorld(frame, 11, 29);
    const q = toLocal(frame, p.x, p.z);
    close(q.u, 11);
    close(q.v, 29);
  });

  it('puts every grid front on its own kerb with v running into the lot', () => {
    for (const front of ['N', 'E', 'S', 'W'] as const) {
      const frame = frameOfGridLot(2, 2, 1, 2, front);
      // The middle of the 20 × 40 m lot is the same world point whichever side the street is on.
      const alongZ = front === 'E' || front === 'W';
      const mid = toWorld(frame, alongZ ? 20 : 10, alongZ ? 10 : 20);
      close(mid.x, 50);
      close(mid.z, 60);
      // One metre into the lot from the frontage's middle lies inside the lot's tiles.
      const inward = toWorld(frame, 10, 1);
      expect(inward.x).toBeGreaterThan(40);
      expect(inward.x).toBeLessThan(60);
      expect(inward.z).toBeGreaterThan(40);
      expect(inward.z).toBeLessThan(80);
    }
  });
});

describe('claimedTiles partitions the tiles between parcels by centre', () => {
  it('claims exactly the lot tiles on a grid lot', () => {
    const frame = frameOfGridLot(3, 4, 1, 2, 'N');
    expect(claimedTiles(frame, 20, 40, 64)).toEqual([
      { x: 3, z: 4 },
      { x: 3, z: 5 },
    ]);
  });

  it('does not claim a tile the rectangle only touches along an edge', () => {
    const frame = frameOfGridLot(3, 4, 2, 2, 'E');
    const tiles = claimedTiles(frame, 40, 40, 64);
    expect(tiles).toHaveLength(4);
    expect(tiles.every((t) => t.x >= 3 && t.x <= 4 && t.z >= 4 && t.z <= 5)).toBe(true);
  });

  it('claims about the lot area in tiles for a normal lot turned 30°, every centre inside', () => {
    const frame: ParcelFrame = { x: 100, z: 100, heading: Math.PI / 6 };
    const tiles = claimedTiles(frame, 20, 40, 64);
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    expect(tiles.length).toBeLessThanOrEqual(3);
    for (const t of tiles) {
      const { u, v } = toLocal(frame, (t.x + 0.5) * 20, (t.z + 0.5) * 20);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(40);
    }
    expect(frameCorners(frame, 20, 40)).toHaveLength(4);
  });

  it('never gives one tile to two parcels standing end to end at any angle', () => {
    for (const heading of [0.2, 0.5, Math.PI / 4, 1.1, 2.3]) {
      const a: ParcelFrame = { x: 200, z: 200, heading };
      const b = { ...toWorld(a, 20, 0), heading };
      const ta = claimedTiles(a, 20, 40, 64);
      const tb = claimedTiles(b, 20, 40, 64);
      for (const t of ta) expect(tb.some((s) => s.x === t.x && s.z === t.z)).toBe(false);
    }
  });

  it('stays inside the grid', () => {
    // Turned about, the rectangle reaches past the grid's north-west edge.
    const frame: ParcelFrame = { x: 30, z: 30, heading: Math.PI };
    const tiles = claimedTiles(frame, 20, 40, 8);
    expect(tiles.every((t) => t.x >= 0 && t.z >= 0 && t.x < 8 && t.z < 8)).toBe(true);
    expect(tiles.length).toBeGreaterThan(0);
  });
});
