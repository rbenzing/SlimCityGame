import { describe, expect, it } from 'vitest';
import {
  FURNITURE_CLEAR_M,
  GATE_HALF_WIDTH_M,
  planFurniture,
  type FurnitureSite,
  type FurniturePiece,
  type Rect,
} from './sitefurniture';

/** The fence stands this far in from the lot line (as sites.ts lays it). */
const FENCE_INSET = 0.5;

function site(overrides: Partial<FurnitureSite> = {}): FurnitureSite {
  return {
    lot: { x0: 0, z0: 0, x1: 60, z1: 40 },
    body: { x0: 15, z0: 10, x1: 45, z1: 30 },
    front: { x: 0, z: 1 },
    house: false,
    ...overrides,
  };
}

const aabb = (p: FurniturePiece): Rect => {
  const turned = Math.abs(Math.sin(p.yaw)) > 0.5;
  const hx = (turned ? p.d : p.w) / 2;
  const hz = (turned ? p.w : p.d) / 2;
  return { x0: p.x - hx, z0: p.z - hz, x1: p.x + hx, z1: p.z + hz };
};

const gap = (a: Rect, b: Rect): number =>
  Math.max(a.x0 - b.x1, b.x0 - a.x1, a.z0 - b.z1, b.z0 - a.z1);

const kinds = (pieces: FurniturePiece[]): string[] => pieces.map((p) => p.kind);

describe('planFurniture', () => {
  it('lays the cabin, skip and toilet at their real sizes, largest first', () => {
    const pieces = planFurniture(site(), 3);
    expect(kinds(pieces).slice(0, 3)).toEqual(['cabin', 'skip', 'toilet']);
    const [cabin, skip, toilet] = pieces;
    expect([cabin!.w, cabin!.d, cabin!.h]).toEqual([6.1, 2.4, 2.6]);
    expect([skip!.w, skip!.d, skip!.h]).toEqual([6.7, 2.4, 1.4]);
    expect([toilet!.w, toilet!.d, toilet!.h]).toEqual([1.2, 1.2, 2.3]);
  });

  it('keeps every piece inside the fence, clear of it and of the body by a metre', () => {
    for (let id = 0; id < 12; id++) {
      const s = site();
      for (const p of planFurniture(s, id)) {
        const r = aabb(p);
        expect(r.x0).toBeGreaterThanOrEqual(s.lot.x0 + FENCE_INSET + FURNITURE_CLEAR_M - 1e-9);
        expect(r.z0).toBeGreaterThanOrEqual(s.lot.z0 + FENCE_INSET + FURNITURE_CLEAR_M - 1e-9);
        expect(r.x1).toBeLessThanOrEqual(s.lot.x1 - FENCE_INSET - FURNITURE_CLEAR_M + 1e-9);
        expect(r.z1).toBeLessThanOrEqual(s.lot.z1 - FENCE_INSET - FURNITURE_CLEAR_M + 1e-9);
        expect(gap(r, s.body)).toBeGreaterThanOrEqual(FURNITURE_CLEAR_M - 1e-9);
      }
    }
  });

  it('keeps pieces off the gate and the drive from the street face to the body', () => {
    for (let id = 0; id < 12; id++) {
      const s = site();
      const centre = (s.body.x0 + s.body.x1) / 2;
      const strip: Rect = {
        x0: centre - GATE_HALF_WIDTH_M,
        x1: centre + GATE_HALF_WIDTH_M,
        z0: s.body.z1,
        z1: s.lot.z1,
      };
      for (const p of planFurniture(s, id)) expect(gap(aabb(p), strip)).toBeGreaterThan(0);
    }
  });

  it('keeps pieces off the gate whichever way the street face turns', () => {
    const fronts = [
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: -1, z: 0 },
    ];
    for (const front of fronts) {
      const s = site({ front });
      const cx = (s.body.x0 + s.body.x1) / 2;
      const cz = (s.body.z0 + s.body.z1) / 2;
      const strip: Rect =
        front.z !== 0
          ? {
              x0: cx - GATE_HALF_WIDTH_M,
              x1: cx + GATE_HALF_WIDTH_M,
              z0: front.z > 0 ? s.body.z1 : s.lot.z0,
              z1: front.z > 0 ? s.lot.z1 : s.body.z0,
            }
          : {
              z0: cz - GATE_HALF_WIDTH_M,
              z1: cz + GATE_HALF_WIDTH_M,
              x0: front.x > 0 ? s.body.x1 : s.lot.x0,
              x1: front.x > 0 ? s.lot.x1 : s.body.x0,
            };
      for (let id = 0; id < 6; id++) {
        for (const p of planFurniture(s, id)) expect(gap(aabb(p), strip)).toBeGreaterThan(0);
      }
    }
  });

  it('never lets two pieces touch', () => {
    for (let id = 0; id < 12; id++) {
      const pieces = planFurniture(site(), id);
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          expect(gap(aabb(pieces[i]!), aabb(pieces[j]!))).toBeGreaterThan(0);
        }
      }
    }
  });

  it('lays nothing on a lot with no room, and only the pieces that fit on a tight one', () => {
    const tight = site({
      lot: { x0: 0, z0: 0, x1: 20, z1: 20 },
      body: { x0: 3, z0: 3, x1: 17, z1: 17 },
    });
    expect(planFurniture(tight, 1)).toEqual([]);
    // A ring 1.5 m wide between the body's clearance and the fence's holds the toilet and nothing longer.
    const ring = site({
      lot: { x0: 0, z0: 0, x1: 26, z1: 26 },
      body: { x0: 4, z0: 4, x1: 22, z1: 22 },
    });
    expect(kinds(planFurniture(ring, 1))).toEqual(['toilet']);
  });

  it('gives a house the skip and the toilet and never a cabin', () => {
    for (let id = 0; id < 12; id++) {
      const k = kinds(planFurniture(site({ house: true }), id));
      expect(k).toContain('skip');
      expect(k).toContain('toilet');
      expect(k).not.toContain('cabin');
    }
  });

  it('adds one spoil heap beside the body on a large lot, and none on a small one', () => {
    const big = planFurniture(
      site({
        lot: { x0: 0, z0: 0, x1: 100, z1: 60 },
        body: { x0: 30, z0: 15, x1: 70, z1: 45 },
      }),
      4,
    );
    const heaps = big.filter((p) => p.kind === 'heap');
    expect(heaps).toHaveLength(1);
    expect([heaps[0]!.w, heaps[0]!.d, heaps[0]!.h]).toEqual([6, 4, 1.5]);
    const small = planFurniture(
      site({ lot: { x0: 0, z0: 0, x1: 30, z1: 30 }, body: { x0: 8, z0: 8, x1: 20, z1: 20 } }),
      4,
    );
    expect(small.filter((p) => p.kind === 'heap')).toHaveLength(0);
  });

  it('is the same for the same id, and the corner it fills follows the id', () => {
    expect(planFurniture(site(), 9)).toEqual(planFurniture(site(), 9));
    const cabinX = new Set<number>();
    for (let id = 0; id < 16; id++) cabinX.add(planFurniture(site(), id)[0]!.x);
    expect(cabinX.size).toBeGreaterThan(1);
  });

  it('leaves room for a scaffold face when the body asks for a wider clearance', () => {
    const s = site({ standoff: 1.5 });
    for (let id = 0; id < 8; id++) {
      for (const p of planFurniture(s, id)) {
        expect(gap(aabb(p), s.body)).toBeGreaterThanOrEqual(FURNITURE_CLEAR_M + 1.5 - 1e-9);
      }
    }
  });
});
