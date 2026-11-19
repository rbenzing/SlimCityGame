import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { builtInParking } from './garage';
import {
  PORTAL_CLEAR_M,
  PORTAL_WIDTH_M,
  builtInPortalFor,
  type BuiltInPortal,
} from './builtinportal';
import { drawsLotParking } from './parkingcode';
import { lotLayoutFor } from './lotparking';
import type { LotLayout, LotRect } from './lotlayout';
import type { BuildingCatalogEntry } from './types';

const catalog =
  (catalogData as unknown as { buildings?: BuildingCatalogEntry[] }).buildings ??
  (catalogData as unknown as BuildingCatalogEntry[]);
const forms = catalog.filter((e) => e.stacked);
const ROTATIONS = [0, 1, 2, 3] as const;

const overlap = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - 1e-6 && b.u0 < a.u1 - 1e-6 && a.v0 < b.v1 - 1e-6 && b.v0 < a.v1 - 1e-6;
const within = (r: LotRect, lot: LotRect): boolean =>
  r.u0 >= lot.u0 - 1e-6 && r.u1 <= lot.u1 + 1e-6 && r.v0 >= lot.v0 - 1e-6 && r.v1 <= lot.v1 + 1e-6;

/** Every built-in form on its lot in each turn, the street along either axis. */
function eachLot(
  f: (entry: BuildingCatalogEntry, layout: LotLayout, portal: BuiltInPortal) => void,
) {
  for (const entry of forms) {
    for (const rotation of ROTATIONS) {
      for (const alongX of [true, false]) {
        const layout = lotLayoutFor(entry, rotation, alongX)!;
        f(entry, layout, layout.portal!);
      }
    }
  }
}

describe('the lot of a built-in form', () => {
  it('there are 24 forms', () => {
    expect(forms).toHaveLength(24);
  });

  it('lays one drive and no stall, aisle or drive-through lane for cars', () => {
    eachLot((entry, layout) => {
      expect(layout, entry.id).toBeTruthy();
      expect(layout.stalls, entry.id).toHaveLength(0);
      expect(layout.aisles, entry.id).toHaveLength(1);
      expect(layout.berths, entry.id).toHaveLength(0);
      expect(layout.driveThrough, entry.id).toBeNull();
    });
  });

  it('is not bare: a walk to the door and ground left over for lawn', () => {
    eachLot((entry, layout) => {
      expect(layout.entranceWalk ?? layout.frontWalk, entry.id).not.toBeNull();
      const lot = layout.lot;
      const paved =
        (layout.body.u1 - layout.body.u0) * (layout.body.v1 - layout.body.v0) +
        (layout.aisles[0]!.u1 - layout.aisles[0]!.u0) *
          (layout.aisles[0]!.v1 - layout.aisles[0]!.v0);
      const area = (lot.u1 - lot.u0) * (lot.v1 - lot.v0);
      expect(area - paved, entry.id).toBeGreaterThan(0.1 * area);
    });
  });

  it('keeps parking out of the growth rules: no lot car park is drawn or required', () => {
    for (const entry of forms) expect(drawsLotParking(entry)).toBe(false);
  });
});

describe('the portal of a built-in form', () => {
  it('is 6.1 m wide and 2.5 m clear, on a side face of the body', () => {
    eachLot((entry, layout, portal) => {
      expect(portal, entry.id).toBeTruthy();
      expect(PORTAL_WIDTH_M).toBe(6.1);
      expect(PORTAL_CLEAR_M).toBe(2.5);
      expect(portal.rect.v1 - portal.rect.v0).toBeCloseTo(PORTAL_WIDTH_M, 6);
      expect(portal.face === 'u+' || portal.face === 'u-').toBe(true);
      const wall = portal.face === 'u+' ? layout.body.u1 : layout.body.u0;
      expect(portal.rect.u0).toBeCloseTo(wall, 6);
      expect(portal.rect.v0).toBeGreaterThanOrEqual(layout.body.v0 - 1e-6);
      expect(portal.rect.v1).toBeLessThanOrEqual(layout.body.v1 + 1e-6);
    });
  });

  it('stands clear of the door and the front walk, on the lot', () => {
    eachLot((entry, layout, portal) => {
      const reach: LotRect = {
        u0: portal.rect.u0 - 0.01,
        u1: portal.rect.u1 + 0.01,
        v0: portal.rect.v0,
        v1: portal.rect.v1,
      };
      for (const walk of [layout.entranceWalk, layout.frontWalk]) {
        if (walk) expect(overlap(walk, portal.drive) || overlap(walk, reach), entry.id).toBe(false);
      }
      expect(portal.rect.v0, entry.id).toBeGreaterThanOrEqual(layout.body.v0 + 3);
      expect(within(portal.drive, layout.lot), entry.id).toBe(true);
    });
  });

  it('is reached by a 6.1 m drive from the kerb cut', () => {
    eachLot((entry, layout, portal) => {
      expect(portal.drive.u1 - portal.drive.u0, entry.id).toBeCloseTo(PORTAL_WIDTH_M, 6);
      expect(portal.drive.v0, entry.id).toBe(0);
      expect(layout.curbCut, entry.id).toEqual({ u0: portal.drive.u0, u1: portal.drive.u1 });
      expect(layout.aisles[0], entry.id).toBe(portal.drive);
      expect(portal.drive.v1, entry.id).toBeGreaterThanOrEqual(portal.rect.v1 - 1e-6);
      // The drive runs along the wall the portal is in.
      const wall = portal.face === 'u+' ? portal.drive.u0 : portal.drive.u1;
      expect(wall, entry.id).toBeCloseTo(portal.rect.u0, 6);
    });
  });

  it('stands at grade on every form, whether its parking is below ground or above: the drive is flat and no ramp is laid outside', () => {
    eachLot((entry, _layout, portal) => {
      expect(Object.keys(portal).sort(), entry.id).toEqual(['centre', 'drive', 'face', 'rect']);
    });
    expect(forms.some((e) => builtInParking(e).belowLevels > 0)).toBe(true);
    expect(forms.some((e) => builtInParking(e).aboveStoreys > 0)).toBe(true);
  });

  it('is refused where the ground beside the body is too narrow for a drive', () => {
    const layout = lotLayoutFor(forms[0]!, 0, true)!;
    const narrow = { ...layout, lot: { ...layout.lot, u1: layout.body.u1 + 6 } };
    expect(builtInPortalFor(narrow)).toBeNull();
  });
});
