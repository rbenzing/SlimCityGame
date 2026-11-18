import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { lotLayoutFor } from './lotparking';
import {
  LOT_HOME_BUFFER_M,
  LOT_LIGHT_NEAR_HOMES_M,
  MONUMENT_SIGN,
  PYLON_MIN_FRONTAGE_M,
  PYLON_SIGN,
  isFencedWorks,
  planLotGrounds,
  pylonFaceArea,
  wantsPylon,
  type GroundsKind,
  type LotGroundsFacts,
} from './lotgrounds';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entry = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const layoutOf = (id: string) => lotLayoutFor(entry(id), 0, true)!;
const factsOf = (id: string, over: Partial<LotGroundsFacts> = {}): LotGroundsFacts => ({
  kind: entry(id).kind,
  category: entry(id).category === 'ind' ? 'ind' : 'com',
  homeSides: [],
  kitSign: false,
  kitRefuse: false,
  ...over,
});
const kinds = (id: string, over: Partial<LotGroundsFacts> = {}): GroundsKind[] =>
  planLotGrounds(layoutOf(id), factsOf(id, over)).pieces.map((p) => p.kind);

describe('the order of omission', () => {
  it('leaves a one-tile corner shop its walk and a bin, and no lights, planting or refuse', () => {
    const k = kinds('com-low-1');
    expect(k).toContain('walk');
    expect(k).toContain('bin');
    for (const none of ['light', 'tree', 'shrub', 'refuse'] as const) expect(k).not.toContain(none);
  });

  it('gives a large lot every piece a small one lacks', () => {
    const small = new Set(kinds('com-low-1'));
    const large = new Set(kinds('ind-warehouse-2'));
    for (const k of ['walk', 'light', 'refuse', 'shrub', 'tree', 'bin'] as const) {
      expect(large.has(k), k).toBe(true);
    }
    expect(small.size).toBeLessThan(large.size);
  });

  it('is deterministic', () => {
    const l = layoutOf('ind-warehouse-2');
    expect(planLotGrounds(l, factsOf('ind-warehouse-2'))).toEqual(
      planLotGrounds(l, factsOf('ind-warehouse-2')),
    );
  });
});

describe('signs', () => {
  it('stands a pylon on a long frontage of a strip, within its face-area cap', () => {
    const plan = planLotGrounds(layoutOf('com-strip-3'), factsOf('com-strip-3'));
    const sign = plan.pieces.filter((p) => p.kind === 'pylon' || p.kind === 'monument');
    expect(sign.map((p) => p.kind)).toEqual(['pylon']);
    expect(sign[0]!.height).toBe(PYLON_SIGN.height);
    expect(sign[0]!.rect.v0).toBeCloseTo(PYLON_SIGN.setback, 6);
    expect(wantsPylon('strip', 100)).toBe(true);
    expect(pylonFaceArea(100)).toBe(PYLON_SIGN.maxFaceArea);
    expect(pylonFaceArea(PYLON_MIN_FRONTAGE_M)).toBeLessThanOrEqual(PYLON_SIGN.maxFaceArea);
  });

  it('stands a monument where the kind or frontage does not call for a pylon', () => {
    expect(wantsPylon('strip', PYLON_MIN_FRONTAGE_M - 1)).toBe(false);
    expect(wantsPylon('workshop', 100)).toBe(false);
    const sign = planLotGrounds(layoutOf('ind-workshop-3'), factsOf('ind-workshop-3')).pieces.find(
      (p) => p.kind === 'monument',
    )!;
    expect(sign.height).toBe(MONUMENT_SIGN.height);
    expect(sign.rect.v0).toBeCloseTo(MONUMENT_SIGN.setback, 6);
  });

  it('lays no second sign where the kit stands a pole sign, and no second enclosure', () => {
    const k = kinds('com-strip-3', { kitSign: true, kitRefuse: true });
    expect(k).not.toContain('pylon');
    expect(k).not.toContain('monument');
    expect(k).not.toContain('refuse');
  });
});

describe("the kit's own enclosure, sign and corrals", () => {
  it('keeps planting off the ring beside and behind the body where the kit stands a dumpster enclosure', () => {
    const id = 'com-restaurant-3-lot6x2';
    const layout = layoutOf(id);
    const b = layout.body;
    const ring = 0.8 + 3.66;
    const plan = planLotGrounds(layout, factsOf(id, { kitRefuse: true, kitSign: true }));
    const planting = plan.pieces.filter((p) => p.kind === 'shrub' || p.kind === 'tree');
    expect(planting.length).toBeGreaterThan(0);
    for (const p of planting) {
      const inRing =
        p.rect.u0 < b.u1 + ring &&
        p.rect.u1 > b.u0 - ring &&
        p.rect.v1 > b.v0 &&
        p.rect.v0 < b.v1 + ring;
      expect(inRing, `${p.kind} at ${p.rect.u0},${p.rect.v0}`).toBe(false);
    }
  });

  it('lays no light in an island where the kit stands cart corrals', () => {
    const id = 'com-market-2';
    const layout = layoutOf(id);
    const plan = planLotGrounds(layout, factsOf(id, { kitIslandFurniture: true }));
    for (const l of plan.pieces.filter((p) => p.kind === 'light')) {
      expect(
        layout.islands.some(
          (i) => l.rect.u0 < i.u1 && l.rect.u1 > i.u0 && l.rect.v0 < i.v1 && l.rect.v1 > i.v0,
        ),
      ).toBe(false);
    }
  });
});

describe('a side that abuts homes', () => {
  it('plants the deeper buffer and shortens the poles', () => {
    const id = 'ind-warehouse-2';
    const layout = layoutOf(id);
    const plan = planLotGrounds(layout, factsOf(id, { homeSides: ['u-'] }));
    const shrubs = plan.pieces.filter((p) => p.kind === 'shrub' && p.rect.u0 < LOT_HOME_BUFFER_M);
    expect(shrubs.length).toBeGreaterThan(0);
    for (const l of plan.pieces.filter((p) => p.kind === 'light' && p.short)) {
      expect(l.height).toBe(LOT_LIGHT_NEAR_HOMES_M);
      expect(l.rect.u0).toBeGreaterThanOrEqual(LOT_LIGHT_NEAR_HOMES_M - 0.01);
    }
  });
});

describe("a works' yard", () => {
  it('is fenced for every industrial kind but flex space, and never for commercial ones', () => {
    expect(isFencedWorks({ category: 'ind', kind: 'warehouse' })).toBe(true);
    expect(isFencedWorks({ category: 'ind', kind: 'flex' })).toBe(false);
    expect(isFencedWorks({ category: 'com', kind: 'strip' })).toBe(false);
  });

  it('gates the fence where the drive crosses it, the gate as wide as the drive', () => {
    const plan = planLotGrounds(layoutOf('ind-workshop-2'), factsOf('ind-workshop-2'));
    const gate = plan.pieces.find((p) => p.kind === 'gate')!;
    expect(gate).toBeDefined();
    expect(gate.rect.u1 - gate.rect.u0).toBeGreaterThan(3.6);
    expect(gate.rect.u1 - gate.rect.u0).toBeLessThanOrEqual(7.31);
  });
});
