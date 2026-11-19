import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import {
  PORTAL_CLEAR_M,
  PORTAL_WIDTH_M,
  RAMP_GRADE,
  RAMP_SILL_MAX_M,
} from '../shared/builtinportal';
import { FLOOR_HEIGHT_METERS, storeysOf } from '../shared/floorarea';
import { builtInParking } from '../shared/garage';
import { lotLayoutFor } from '../shared/lotparking';
import type { LotLayout } from '../shared/lotlayout';
import type { BuildingCatalogEntry } from '../shared/types';
import {
  buildBuiltInGeometry,
  builtInParts,
  builtInVariantKey,
  type BuiltInPart,
} from './builtinkit';
import { carParkShape } from '../shared/carparkshape';
import { CAR_PARK_CORNER_RADIUS_M } from '../shared/roundedoutline';
import { LOT_CAR_BODY } from './parked';

const forms = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
  (e) => e.stacked !== undefined,
);

const of = (parts: BuiltInPart[], role: BuiltInPart['role']): BuiltInPart[] =>
  parts.filter((p) => p.role === role);

function eachForm(
  f: (entry: BuildingCatalogEntry, layout: LotLayout, parts: BuiltInPart[]) => void,
) {
  for (const entry of forms) {
    const layout = lotLayoutFor(entry, 0, true)!;
    f(entry, layout, builtInParts(layout, builtInParking(entry).aboveStoreys));
  }
}

describe('the portal of a built-in form, as drawn', () => {
  it('is one dark opening 6.1 m wide, 2.5 m clear of its sill, under a header', () => {
    eachForm((entry, layout, parts) => {
      const [opening, ...extra] = of(parts, 'portal');
      expect(extra, entry.id).toHaveLength(0);
      expect(opening!.v1 - opening!.v0, entry.id).toBeCloseTo(PORTAL_WIDTH_M, 6);
      const sill = layout.portal!.sillDepth;
      expect(opening!.y1 - opening!.y0 + sill, entry.id).toBeCloseTo(PORTAL_CLEAR_M, 6);
      const [header] = of(parts, 'header');
      expect(header!.y0, entry.id).toBeCloseTo(opening!.y1, 6);
      expect(header!.v1 - header!.v0, entry.id).toBeGreaterThan(PORTAL_WIDTH_M);
    });
  });

  it('stands on a side wall, never on the street face, and clear of the door', () => {
    eachForm((entry, layout, parts) => {
      const [opening] = of(parts, 'portal');
      expect(opening!.u0, entry.id).toBeCloseTo(layout.body.u1, 6);
      expect(opening!.v0, entry.id).toBeGreaterThanOrEqual(layout.body.v0 + 3);
    });
  });

  it('has a ramp between low walls where parking is below ground, and none at grade', () => {
    eachForm((entry, layout, parts) => {
      const below = builtInParking(entry).belowLevels > 0;
      expect(of(parts, 'rampDeck'), entry.id).toHaveLength(below ? 1 : 0);
      expect(of(parts, 'rampWall'), entry.id).toHaveLength(below ? 2 : 0);
      if (below) {
        const ramp = layout.portal!.ramp!;
        const sill = layout.portal!.sillDepth;
        expect(sill, entry.id).toBeCloseTo(
          Math.min(RAMP_SILL_MAX_M, (ramp.u1 - ramp.u0) * RAMP_GRADE),
          6,
        );
      }
    });
  });
});

describe('the garage band of a built-in form', () => {
  it('has one opening row for each parking storey above ground, just over the ground floor', () => {
    eachForm((entry, _layout, parts) => {
      const above = builtInParking(entry).aboveStoreys;
      const rows = new Set(of(parts, 'bandOpening').map((p) => p.y0.toFixed(3)));
      expect(rows.size, entry.id).toBe(above);
      for (const p of of(parts, 'bandOpening')) {
        expect(p.y0, entry.id).toBeGreaterThanOrEqual(FLOOR_HEIGHT_METERS);
      }
    });
    expect(forms.filter((e) => builtInParking(e).aboveStoreys > 0).map((e) => e.id)).toEqual([
      'com-office-2-up2x2',
      'com-high-2-up3x3',
      'com-hotel-3-up2x2',
    ]);
  });

  it('leaves the working storeys their windows: the band takes only the parking storeys', () => {
    for (const entry of forms) {
      const { aboveStoreys } = builtInParking(entry);
      const storeys = Math.round(entry.height / FLOOR_HEIGHT_METERS);
      expect(storeys - aboveStoreys, entry.id).toBe(storeysOf(entry));
    }
  });
});

describe('the drive of a built-in form', () => {
  it('turns its free far corner on the radius the lot drives use, never square', () => {
    for (const entry of forms) {
      const layout = lotLayoutFor(entry, 0, true)!;
      const radii = carParkShape(layout, true, LOT_CAR_BODY).rounded.get(layout.portal!.drive);
      expect(radii, entry.id).toBeTruthy();
      // North-west, north-east, south-east, south-west, north being the street: the corner at the
      // far end on the lot-line side is free and round; the one at the body's wall is the wall's.
      expect(radii![2], entry.id).toBeGreaterThanOrEqual(CAR_PARK_CORNER_RADIUS_M - 1e-9);
    }
  });
});

describe('the geometry of a built-in form', () => {
  it('is one merged mesh per distinct form, inside the block triangle tier', () => {
    const keys = new Set<string>();
    for (const entry of forms) {
      const layout = lotLayoutFor(entry, 0, true)!;
      const above = builtInParking(entry).aboveStoreys;
      keys.add(builtInVariantKey(layout, above, false));
      const g = buildBuiltInGeometry(layout, above, false);
      const triangles = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      expect(triangles, entry.id).toBeGreaterThan(0);
      expect(triangles, entry.id).toBeLessThanOrEqual(1500);
    }
    expect(keys.size).toBeGreaterThan(1);
    expect(builtInVariantKey(lotLayoutFor(forms[0]!, 0, true)!, 0, false)).not.toBe(
      builtInVariantKey(lotLayoutFor(forms[0]!, 0, true)!, 0, true),
    );
  });
});
