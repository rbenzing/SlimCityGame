import { describe, expect, it } from 'vitest';
import {
  CONFORM_MAX_CELL_M,
  conformingQuadVertexCount,
  pushConformingQuad,
} from './groundquad';

const WHITE: readonly [number, number, number] = [1, 1, 1];

/** Every vertex of the emitted surface, as {x, y, z}. */
function build(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  heightAt: (x: number, z: number) => number,
  maxCellM?: number,
): { x: number; y: number; z: number }[] {
  const positions: number[] = [];
  const colors: number[] = [];
  pushConformingQuad(positions, colors, x0, z0, x1, z1, yOffset, WHITE, heightAt, maxCellM);
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    out.push({ x: positions[i]!, y: positions[i + 1]!, z: positions[i + 2]! });
  }
  return out;
}

describe('pushConformingQuad', () => {
  it('emits one colour per vertex', () => {
    const positions: number[] = [];
    const colors: number[] = [];
    pushConformingQuad(positions, colors, 0, 0, 8, 8, 0.1, [0.2, 0.3, 0.4], () => 0);
    expect(colors.length).toBe(positions.length);
  });

  it('subdivides to cells no larger than the limit', () => {
    const verts = build(0, 0, 16, 16, 0, () => 0);
    // 16m at 2m cells -> 8x8 cells, 6 vertices each.
    expect(verts.length).toBe(8 * 8 * 6);
    expect(conformingQuadVertexCount(0, 0, 16, 16)).toBe(verts.length);
  });

  it('honours a caller-supplied cell size', () => {
    expect(conformingQuadVertexCount(0, 0, 16, 16, 4)).toBe(4 * 4 * 6);
  });

  it('rides a constant offset above flat ground', () => {
    for (const v of build(0, 0, 8, 8, 0.25, () => 3)) {
      expect(v.y).toBeCloseTo(3.25, 6);
    }
  });

  // The defect this whole module exists for: a single four-corner quad over a
  // hill is a plane through its corners, and the ground rises through it.
  it('does not let a hill push through the middle of the surface', () => {
    // A ridge running along x, peaking at z = 8, invisible from the corners of
    // a single 16x16 quad because both z edges sit at the same height.
    const ridge = (_x: number, z: number): number => 8 - Math.abs(z - 8);
    const yOffset = 0.1;
    const verts = build(0, 0, 16, 16, yOffset, ridge);

    for (const v of verts) {
      expect(
        v.y,
        `surface at z=${v.z} sits below the ground it covers`,
      ).toBeGreaterThanOrEqual(ridge(v.x, v.z) + yOffset - 1e-9);
    }
    // And it actually followed the ridge rather than flattening it.
    const peak = Math.max(...verts.map((v) => v.y));
    const edge = Math.min(...verts.map((v) => v.y));
    expect(peak - edge).toBeCloseTo(8, 6);
  });

  it('splits each cell on the terrain mesh diagonal, not the opposite one', () => {
    // One cell, four distinct corner heights. The shared edge of the two
    // triangles must be (x0,z1)-(x1,z0); the other diagonal crosses the
    // terrain's own triangles and clips along the seam.
    const h = (x: number, z: number): number => (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0);
    const verts = build(0, 0, CONFORM_MAX_CELL_M, CONFORM_MAX_CELL_M, 0, h);
    expect(verts.length).toBe(6);

    const key = (v: { x: number; z: number }): string => `${v.x},${v.z}`;
    const triA = verts.slice(0, 3).map(key);
    const triB = verts.slice(3, 6).map(key);
    const shared = triA.filter((k) => triB.includes(k));
    expect(shared.sort()).toEqual([`0,${CONFORM_MAX_CELL_M}`, `${CONFORM_MAX_CELL_M},0`].sort());
  });

  it('samples the real surface at every cell corner, not just the rect corners', () => {
    const calls: string[] = [];
    const h = (x: number, z: number): number => {
      calls.push(`${x},${z}`);
      return 0;
    };
    build(0, 0, 16, 16, 0, h);
    expect(calls).toContain('8,8'); // an interior sample the rect corners never see
  });
});
