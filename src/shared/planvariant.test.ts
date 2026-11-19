/**
 * A commercial lot's plan variant: one lot in three stands its building at the
 * street, and the pick never changes whether a lot fits or what it holds.
 */
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { drawsLotParking } from './parkingcode';
import { lotLayoutFor } from './lotparking';
import type { LotLayout, LotRect } from './lotlayout';
import { planVariantAt, STREET_PLAN_SETBACK_M, type PlanVariant } from './planvariant';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const shops = catalog.filter((e) => e.category === 'com' && drawsLotParking(e));

const EPS = 0.01;
const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;

/** Every lot laid both ways: along the street either way, both turns, with and without a kerb credit. */
function bothWays(): { id: string; usual: LotLayout; street: LotLayout; kind: string }[] {
  const out: { id: string; usual: LotLayout; street: LotLayout; kind: string }[] = [];
  for (const e of shops) {
    for (const rotation of [0, 1] as const) {
      for (const alongX of [true, false]) {
        for (const credit of [0, 3]) {
          const lay = (v: PlanVariant): LotLayout =>
            lotLayoutFor(e, rotation, alongX, credit, true, v)!;
          out.push({
            id: `${e.id} r${rotation} ${alongX ? 'x' : 'z'} k${credit}`,
            usual: lay('carpark-front'),
            street: lay('street'),
            kind: e.kind ?? '',
          });
        }
      }
    }
  }
  return out;
}

const LOTS = bothWays();

describe('planVariantAt', () => {
  it('is the same answer every time for one tile', () => {
    expect(planVariantAt(17, 42)).toBe(planVariantAt(17, 42));
  });

  it('gives the street plan to about one lot in three, mixed along a row', () => {
    let street = 0;
    let row = 0;
    for (let x = 0; x < 100; x++) {
      for (let z = 0; z < 100; z++) {
        if (planVariantAt(x, z) === 'street') {
          street++;
          if (z === 0) row++;
        }
      }
    }
    expect(street / 10000).toBeGreaterThan(0.3);
    expect(street / 10000).toBeLessThan(0.37);
    expect(row).toBeGreaterThan(10);
    expect(row).toBeLessThan(60);
  });
});

describe('a lot laid at the street', () => {
  it('fits, holds and falls short exactly as the usual plan does, on every commercial lot', () => {
    expect(LOTS.length).toBeGreaterThan(500);
    const faults: string[] = [];
    for (const { id, usual, street } of LOTS) {
      const same =
        usual.fits === street.fits &&
        usual.provided === street.provided &&
        usual.shortfall === street.shortfall &&
        usual.required === street.required &&
        usual.berths.length === street.berths.length &&
        usual.accessible === street.accessible;
      if (!same) faults.push(id);
    }
    expect(faults).toEqual([]);
  });

  it('is a different plan on a good share of the lots that fit, and always nearer the street', () => {
    const fitting = LOTS.filter((l) => l.usual.fits);
    const moved = fitting.filter((l) => Math.abs(l.usual.body.v0 - l.street.body.v0) > EPS);
    expect(moved.length / fitting.length).toBeGreaterThan(0.2);
    for (const l of moved) {
      expect(l.street.body.v0, l.id).toBeLessThan(l.usual.body.v0);
      expect(l.street.body.v0, l.id).toBeGreaterThanOrEqual(STREET_PLAN_SETBACK_M - EPS);
    }
  });

  it('leaves a lot whose kind pins its body on the one plan', () => {
    const pinned = [
      'autorepair',
      'quicklube',
      'bank',
      'pharmacy',
      'restaurant',
      'fuel',
      'strip',
      'medicaloffice',
      'supermarket',
    ];
    const seen = new Set<string>();
    for (const l of LOTS.filter((x) => pinned.includes(x.kind))) {
      seen.add(l.kind);
      expect(l.street, l.id).toEqual(l.usual);
    }
    expect([...seen].sort()).toEqual([...pinned].sort());
  });

  it('keeps every stall, aisle and berth off the body and inside the lot', () => {
    const faults: string[] = [];
    for (const { id, usual, street } of LOTS) {
      if (!usual.fits) continue;
      const ground = [
        ...street.stalls.map((s) => s.rect),
        ...street.accessAisles,
        ...street.aisles,
        ...street.berths,
      ];
      for (const r of ground) {
        const inside =
          r.u0 >= -EPS &&
          r.u1 <= street.lot.u1 + EPS &&
          r.v0 >= -EPS &&
          r.v1 <= street.lot.v1 + EPS;
        if (overlaps(r, street.body) || !inside) faults.push(id);
      }
    }
    expect(faults).toEqual([]);
  });

  it('reaches the door from the footway: no walk is needed at the street line, else it runs from the street or an aisle', () => {
    const faults: string[] = [];
    for (const { id, usual, street } of LOTS) {
      if (!usual.fits || street.body.v0 === usual.body.v0) continue;
      const door = street.entranceWalk;
      if (street.body.v0 < EPS) {
        if (door) faults.push(`${id} walk at the street line`);
        continue;
      }
      if (!door) continue;
      const fromStreet = door.v0 < EPS;
      const fromAisle = street.aisles.some(
        (a) => Math.abs(a.v1 - door.v0) < EPS && a.u0 < door.u1 - EPS && door.u0 < a.u1 - EPS,
      );
      if (!fromStreet && !fromAisle) faults.push(`${id} walk from nowhere`);
      const meets = street.frontWalk ? street.frontWalk.v0 : street.body.v0;
      if (Math.abs(door.v1 - meets) > EPS) faults.push(`${id} walk misses the door`);
    }
    expect(faults).toEqual([]);
  });

  it('keeps the drive: the curb cut is inside the lot, with an aisle where there are stalls', () => {
    const faults: string[] = [];
    for (const { id, usual, street } of LOTS) {
      if (!usual.fits) continue;
      const cut = street.curbCut;
      if (cut.u0 < -EPS || cut.u1 > street.lot.u1 + EPS) faults.push(`${id} cut`);
      if (street.stalls.length > 0 && street.aisles.length === 0) faults.push(`${id} no aisle`);
    }
    expect(faults).toEqual([]);
  });
});
