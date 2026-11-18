import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AIMING_POINT_LONG_M,
  AIRCRAFT_SPECS,
  CENTRELINE_GAP_M,
  CENTRELINE_START_M,
  CENTRELINE_STRIPE_M,
  CENTRELINE_WIDTH_M,
  HOLDING_LINE_M,
  NUMERAL_HEIGHT_M,
  NUMERAL_START_M,
  NUMERAL_WIDTH_M,
  SIDE_STRIPE_WIDTH_M,
  TDZ_BAR_LENGTH_M,
  TDZ_BAR_WIDTH_M,
  THRESHOLD_OFFSET_M,
  THRESHOLD_STRIPE_LENGTH_M,
  THRESHOLD_STRIPE_WIDTH_M,
  WHITE_PAINT,
  YELLOW_PAINT,
  aircraftGeometry,
  aircraftPlacements,
  airportBuildings,
  airportPlateGeometry,
  airportPlateQuads,
  buildingPanes,
  runwayDesignations,
  ROOF_OVERHANG_M,
} from './airportkit';
import { LandmarkRenderer } from './landmarks';
import { facilityParts } from './airportfacilities';
import {
  AIRPORT_IDS,
  AirportId,
  AirportLayout,
  NARROW_WINGSPAN_M,
  Rect,
  STAND_CLEARANCE_M,
  WIDEST_WINGSPAN_M,
  CAR_PARK_SPACES,
  airportLayout,
} from '../shared/airportlayout';
import { TILE_METERS } from '../shared/constants';
import { PLOT_BAND_TOP } from './plotground';
import { BuildingCatalogEntry, BuildingInstance, BuildingState } from '../shared/types';
import catalogData from '../data/catalog.json';

type Rotation = 0 | 1 | 2 | 3;
const EPS = 0.02;

interface Q {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  color: readonly [number, number, number];
}

/** The plate's quads read back from its built vertices, in the layout's frame. */
function plateQuads(id: AirportId, rotation: Rotation = 0): Q[] {
  // The plate's rectangles; its rounded shapes are polygons the facilities' tests measure.
  return airportPlateQuads(id, rotation);
}

function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new RangeError(`no item at ${i}`);
  return item;
}

const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.every((v, i) => Math.abs(v - at(b, i)) < 1e-5);
const whites = (qs: Q[]): Q[] => qs.filter((q) => same(q.color, WHITE_PAINT));
const yellows = (qs: Q[]): Q[] => qs.filter((q) => same(q.color, YELLOW_PAINT));
const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;
const inside = (q: Q, r: Rect): boolean =>
  q.x0 >= r.x - EPS && q.x1 <= r.x + r.w + EPS && q.z0 >= r.z - EPS && q.z1 <= r.z + r.d + EPS;
const onRunway = (id: AirportId, qs: Q[]): Q[] => {
  const r = airportLayout(id).runway;
  return qs.filter((q) => inside(q, r));
};

describe('plate', () => {
  it.each(AIRPORT_IDS)('%s is one mesh of a few thousand triangles inside the lot band', (id) => {
    const g = airportPlateGeometry(id, 0);
    expect((g.getIndex()?.count ?? 0) / 3).toBeLessThan(12_000);
    for (const q of plateQuads(id)) {
      expect(q.y).toBeGreaterThan(0.08);
      expect(q.y).toBeLessThanOrEqual(PLOT_BAND_TOP);
    }
  });

  it.each(AIRPORT_IDS)('%s paints the runway white and every taxiway mark yellow', (id) => {
    const layout = airportLayout(id);
    const qs = plateQuads(id);
    const taxi = [
      layout.taxiway,
      ...layout.connectors,
      ...(layout.secondTaxiway ? [layout.secondTaxiway] : []),
      ...layout.taxiwayLinks,
    ];
    expect(yellows(qs).length).toBeGreaterThan(0);
    // A connector's centreline runs on into the taxiway it joins, so test its two ends.
    const onTaxiway = (x: number, z: number): boolean =>
      taxi.some(
        (r) => x >= r.x - EPS && x <= r.x + r.w + EPS && z >= r.z - EPS && z <= r.z + r.d + EPS,
      );
    for (const q of yellows(qs)) {
      expect(onTaxiway(q.x0, q.z0) && onTaxiway(q.x1, q.z1)).toBe(true);
    }
    for (const q of whites(qs)) {
      expect(inside(q, layout.runway) || (!!layout.carPark && inside(q, layout.carPark))).toBe(
        true,
      );
    }
  });
});

describe('numerals', () => {
  it.each(AIRPORT_IDS)('%s numerals are 18.3 m tall at both ends, clear of the stripes', (id) => {
    const layout = airportLayout(id);
    const x0 = layout.runway.x;
    const x1 = x0 + layout.runway.w;
    const w = onRunway(id, whites(plateQuads(id)));
    const low = w.filter(
      (q) => q.x0 > x0 + NUMERAL_START_M - EPS && q.x1 < x0 + CENTRELINE_START_M - 1,
    );
    const high = w.filter(
      (q) => q.x1 < x1 - NUMERAL_START_M + EPS && q.x0 > x1 - CENTRELINE_START_M + 1,
    );
    for (const end of [low, high]) {
      expect(end.length).toBeGreaterThan(0);
      expect(Math.max(...end.map((q) => q.x1)) - Math.min(...end.map((q) => q.x0))).toBeCloseTo(
        NUMERAL_HEIGHT_M,
        1,
      );
    }
    expect(NUMERAL_HEIGHT_M).toBe(18.3);
  });

  it('names the runway by its heading on the map', () => {
    // A single digit is never preceded by a zero (AC 150/5340-1M, 2.3).
    expect(runwayDesignations(0)).toEqual(['9', '27']);
    expect(runwayDesignations(2)).toEqual(['27', '9']);
    expect(runwayDesignations(1)).toEqual(['36', '18']);
    expect(runwayDesignations(3)).toEqual(['18', '36']);
  });

  it('centres a single digit on the centreline', () => {
    const layout = airportLayout('regional-airport');
    const x0 = layout.runway.x;
    const rz = layout.runwayCentreZ;
    const low = onRunway('regional-airport', whites(plateQuads('regional-airport', 0))).filter(
      (q) => q.x0 > x0 + NUMERAL_START_M - EPS && q.x1 < x0 + CENTRELINE_START_M - 1,
    );
    // The 9: six strokes, spanning one digit's width about the centreline.
    expect(low).toHaveLength(6);
    const lo = Math.min(...low.map((q) => q.z0));
    const hi = Math.max(...low.map((q) => q.z1));
    expect(hi - lo).toBeCloseTo(NUMERAL_WIDTH_M, 1);
    expect((lo + hi) / 2).toBeCloseTo(rz, 1);
  });

  it('draws 18 with the 1 on the pilot-left and the 8 on the right, whichever way the plot turns', () => {
    // Rotation 3 flies south from the low-x end: the pilot's right is layout +z.
    const layout = airportLayout('regional-airport');
    const x0 = layout.runway.x;
    const rz = layout.runwayCentreZ;
    const low = onRunway('regional-airport', whites(plateQuads('regional-airport', 3))).filter(
      (q) => q.x0 > x0 + NUMERAL_START_M - EPS && q.x1 < x0 + CENTRELINE_START_M - 1,
    );
    expect(low.filter((q) => q.z1 <= rz + EPS)).toHaveLength(1);
    expect(low.filter((q) => q.z0 >= rz - EPS)).toHaveLength(7);
  });

  it('draws 27 at the high end of an east-west runway with the 2 on the pilot-left', () => {
    // At the high-x end the pilot faces -x and his right is layout -z.
    const layout = airportLayout('regional-airport');
    const x1 = layout.runway.x + layout.runway.w;
    const rz = layout.runwayCentreZ;
    const high = onRunway('regional-airport', whites(plateQuads('regional-airport', 0))).filter(
      (q) => q.x1 < x1 - NUMERAL_START_M + EPS && q.x0 > x1 - CENTRELINE_START_M + 1,
    );
    expect(high.filter((q) => q.z0 >= rz - EPS)).toHaveLength(5);
    expect(high.filter((q) => q.z1 <= rz + EPS)).toHaveLength(3);
  });
});

describe('centreline', () => {
  it.each(AIRPORT_IDS)(
    '%s is 36.5 m stripes and 24.3 m gaps from each threshold, reduced near the midpoint',
    (id) => {
      const layout = airportLayout(id);
      const width = CENTRELINE_WIDTH_M[layout.paint];
      const stripes = onRunway(id, whites(plateQuads(id)))
        .filter(
          (q) =>
            near(q.z1 - q.z0, width) &&
            near((q.z0 + q.z1) / 2, layout.runwayCentreZ) &&
            q.x1 - q.x0 > 20,
        )
        .sort((a, b) => a.x0 - b.x0);
      expect(CENTRELINE_STRIPE_M).toBe(36.5);
      expect(CENTRELINE_GAP_M).toBe(24.3);
      expect(stripes.length).toBeGreaterThan(5);
      const n = stripes.length;
      // Whole figures from each threshold; only stripes and gaps near the midpoint are reduced.
      for (const i of [0, 1, n - 1, n - 2]) {
        expect(at(stripes, i).x1 - at(stripes, i).x0).toBeCloseTo(36.5, 1);
      }
      for (const i of [1, n - 1]) {
        expect(at(stripes, i).x0 - at(stripes, i - 1).x1).toBeCloseTo(24.3, 1);
      }
      for (let i = 0; i < n; i++) {
        const s = at(stripes, i);
        // Reduced stripes keep at least 24 m, reduced gaps at least 12.3 m.
        expect(s.x1 - s.x0).toBeGreaterThanOrEqual(24 - EPS);
        expect(s.x1 - s.x0).toBeLessThanOrEqual(36.5 + EPS);
        if (i > 0) {
          const gap = s.x0 - at(stripes, i - 1).x1;
          expect(gap).toBeGreaterThanOrEqual(12.3 - EPS);
          expect(gap).toBeLessThanOrEqual(24.3 + EPS);
        }
        // The pattern is mirrored about the runway's midpoint.
        const mirror = at(stripes, n - 1 - i);
        expect(s.x0 - layout.runway.x).toBeCloseTo(
          layout.runway.x + layout.runway.w - mirror.x1,
          1,
        );
      }
      expect(at(stripes, 0).x0 - layout.runway.x).toBeCloseTo(CENTRELINE_START_M, 1);
    },
  );

  it('is 0.3, 0.45 and 0.9 m wide for visual, non-precision and precision', () => {
    expect(CENTRELINE_WIDTH_M).toEqual({ visual: 0.3, 'non-precision': 0.45, precision: 0.9 });
  });
});

describe('threshold stripes, aiming point, touchdown zone and side stripes', () => {
  const threshold = (id: AirportId): Q[] =>
    onRunway(id, whites(plateQuads(id))).filter(
      (q) =>
        near(q.x1 - q.x0, THRESHOLD_STRIPE_LENGTH_M) && near(q.z1 - q.z0, THRESHOLD_STRIPE_WIDTH_M),
    );

  it.each([
    ['airfield', 0],
    ['regional-airport', 8],
    ['international-airport', 12],
  ] as const)('%s has %i stripes at each end, 45.7 by 1.75 from 6.1 m in', (id, count) => {
    const layout = airportLayout(id);
    const x0 = layout.runway.x;
    const x1 = x0 + layout.runway.w;
    const stripes = threshold(id);
    expect(stripes).toHaveLength(2 * count);
    const low = stripes.filter((q) => q.x0 < x0 + 100);
    expect(low).toHaveLength(count);
    for (const q of low) expect(q.x0).toBeCloseTo(x0 + THRESHOLD_OFFSET_M, 1);
    for (const q of stripes.filter((s) => s.x0 > x0 + 100)) {
      expect(q.x1).toBeCloseTo(x1 - THRESHOLD_OFFSET_M, 1);
    }
    for (const q of stripes) {
      expect(q.z0).toBeGreaterThanOrEqual(layout.runway.z - EPS);
      expect(q.z1).toBeLessThanOrEqual(layout.runway.z + layout.runway.d + EPS);
    }
  });

  it.each(['regional-airport', 'international-airport'] as const)(
    '%s threshold stripes are 1.75 m apart, the innermost pair 3.5 m apart, about the centreline',
    (id) => {
      const layout = airportLayout(id);
      const low = threshold(id)
        .filter((q) => q.x0 < layout.runway.x + 100)
        .sort((a, b) => a.z0 - b.z0);
      const n = low.length;
      for (let i = 1; i < n; i++) {
        const gap = at(low, i).z0 - at(low, i - 1).z1;
        expect(gap).toBeCloseTo(i === n / 2 ? 3.5 : 1.75, 2);
      }
      expect((at(low, 0).z0 + at(low, n - 1).z1) / 2).toBeCloseTo(layout.runwayCentreZ, 2);
    },
  );

  const aiming = (id: AirportId): Q[] =>
    onRunway(id, whites(plateQuads(id))).filter(
      (q) => near(q.x1 - q.x0, AIMING_POINT_LONG_M) && q.z1 - q.z0 > 5,
    );

  it('puts an aiming point on the regional and international only', () => {
    expect(aiming('airfield')).toHaveLength(0);
    expect(aiming('regional-airport')).toHaveLength(4);
    expect(aiming('international-airport')).toHaveLength(4);
  });

  it.each([
    ['regional-airport', 6.0, 14.6],
    ['international-airport', 9.1, 21.9],
  ] as const)(
    '%s aiming point starts 311 m in: two 45.7 m bars %f m wide, inner sides %f m apart',
    (id, width, spacing) => {
      const layout = airportLayout(id);
      const x0 = layout.runway.x;
      const low = aiming(id).filter((q) => q.x0 < x0 + 600);
      expect(low).toHaveLength(2);
      for (const q of low) {
        expect(q.x0).toBeCloseTo(x0 + 311, 1);
        expect(q.z1 - q.z0).toBeCloseTo(width, 1);
      }
      const sorted = [...low].sort((a, b) => a.z0 - b.z0);
      expect(at(sorted, 1).z0 - at(sorted, 0).z1).toBeCloseTo(spacing, 1);
      expect((at(sorted, 0).z0 + at(sorted, 1).z1) / 2).toBeCloseTo(layout.runwayCentreZ, 2);
    },
  );

  const bars = (id: AirportId): Q[] =>
    onRunway(id, whites(plateQuads(id))).filter(
      (q) => near(q.x1 - q.x0, TDZ_BAR_LENGTH_M) && near(q.z1 - q.z0, TDZ_BAR_WIDTH_M),
    );
  const sides = (id: AirportId): Q[] =>
    onRunway(id, whites(plateQuads(id))).filter(
      (q) => near(q.z1 - q.z0, SIDE_STRIPE_WIDTH_M) && q.x1 - q.x0 > 1000,
    );

  it('puts touchdown bars 22.9 by 1.8 m in groups of 3, 2, 2, 1 and 1, none where the aiming point lies', () => {
    const layout = airportLayout('international-airport');
    const x0 = layout.runway.x;
    const rz = layout.runwayCentreZ;
    expect(bars('international-airport')).toHaveLength(36);
    const low = bars('international-airport').filter((q) => q.x0 < x0 + 1000 && q.z0 > rz);
    // Steps of 500 ft (152.4 m): the second step, 1,000 ft, is the aiming point's.
    const counts = new Map<number, number>();
    for (const q of low) {
      const step = Math.round((q.x0 - x0) / 152.4);
      expect(q.x0 - x0).toBeCloseTo(step * 152.4, 1);
      counts.set(step, (counts.get(step) ?? 0) + 1);
    }
    expect([...counts.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 3],
      [3, 2],
      [4, 2],
      [5, 1],
      [6, 1],
    ]);
    // Across the runway: innermost inner sides 21.9 m apart, bars 1.5 m apart.
    const group = low.filter((q) => near(q.x0 - x0, 152.4)).sort((a, b) => a.z0 - b.z0);
    expect(at(group, 0).z0 - rz).toBeCloseTo(21.9 / 2, 2);
    expect(at(group, 1).z0 - at(group, 0).z1).toBeCloseTo(1.5, 2);
    expect(at(group, 2).z0 - at(group, 1).z1).toBeCloseTo(1.5, 2);
  });

  it('has an edge marking 0.9 m wide along the full runway on the international only', () => {
    const layout = airportLayout('international-airport');
    const edges = sides('international-airport');
    expect(edges).toHaveLength(2);
    for (const q of edges) {
      expect(q.x0).toBeCloseTo(layout.runway.x, 1);
      expect(q.x1).toBeCloseTo(layout.runway.x + layout.runway.w, 1);
    }
    const sorted = [...edges].sort((a, b) => a.z0 - b.z0);
    expect(at(sorted, 0).z0).toBeCloseTo(layout.runway.z, 2);
    expect(at(sorted, 1).z1).toBeCloseTo(layout.runway.z + layout.runway.d, 2);
    for (const id of ['airfield', 'regional-airport'] as const) {
      expect(bars(id)).toHaveLength(0);
      expect(sides(id)).toHaveLength(0);
    }
  });

  it('gives the airfield numerals and a centreline only', () => {
    const w = onRunway('airfield', whites(plateQuads('airfield')));
    const layout = airportLayout('airfield');
    const centre = w.filter((q) => near(q.z1 - q.z0, 0.3) && q.x1 - q.x0 > 20);
    const numerals = w.filter((q) => !centre.includes(q));
    expect(centre.length).toBeGreaterThan(5);
    expect(numerals.length).toBeGreaterThan(0);
    for (const q of numerals) {
      expect(
        q.x0 < layout.runway.x + CENTRELINE_START_M ||
          q.x1 > layout.runway.x + layout.runway.w - CENTRELINE_START_M,
      ).toBe(true);
    }
  });
});

describe('holding positions', () => {
  it.each(AIRPORT_IDS)(
    '%s has two broken lines on the runway side and two solid on the taxiway side',
    (id) => {
      const layout = airportLayout(id);
      expect(layout.holdingPositions.length).toBeGreaterThan(1);
      const ys = yellows(plateQuads(id));
      for (const h of layout.holdingPositions) {
        const lines = ys.filter(
          (q) =>
            q.x0 >= h.x - EPS &&
            q.x1 <= h.x + h.w + EPS &&
            q.z0 >= h.z - EPS &&
            q.z1 <= h.z + 2.2 &&
            near(q.z1 - q.z0, HOLDING_LINE_M),
        );
        const rows = [...new Set(lines.map((q) => q.z0.toFixed(2)))]
          .map(Number)
          .sort((a, b) => a - b);
        expect(rows).toHaveLength(4);
        const lengthOf = (z: number): number =>
          lines.filter((q) => near(q.z0, z)).reduce((s, q) => s + q.x1 - q.x0, 0);
        const countOf = (z: number): number => lines.filter((q) => near(q.z0, z)).length;
        // Broken lines come first, nearest the runway; solid lines follow on the taxiway side.
        const row = (i: number): number => at(rows, i);
        expect(countOf(row(0))).toBeGreaterThan(1);
        expect(countOf(row(1))).toBeGreaterThan(1);
        expect(lengthOf(row(0))).toBeLessThan(h.w);
        expect(countOf(row(2))).toBe(1);
        expect(countOf(row(3))).toBe(1);
        expect(lengthOf(row(2))).toBeCloseTo(h.w, 2);
        expect(lengthOf(row(3))).toBeCloseTo(h.w, 2);
        expect(row(0)).toBeCloseTo(h.z, 2);
      }
    },
  );
});

describe('car park', () => {
  it.each(AIRPORT_IDS)('%s marks as many stalls as the layout has spaces', (id) => {
    const cp = airportLayout(id).carPark;
    if (!cp) {
      // No surface car park: no stall line below the kerb lanes.
      const kerb = airportLayout(id).kerbRoad;
      expect(whites(plateQuads(id)).filter((q) => q.z0 > kerb.z + kerb.d)).toHaveLength(0);
      return;
    }
    const lines = whites(plateQuads(id)).filter((q) => inside(q, cp));
    const rows = new Map<string, number>();
    for (const q of lines) rows.set(q.z0.toFixed(2), (rows.get(q.z0.toFixed(2)) ?? 0) + 1);
    const stalls = [...rows.values()].reduce((sum, n) => sum + n - 1, 0);
    expect(stalls).toBe(CAR_PARK_SPACES[id]);
  });
});

// ---------------------------------------------------------------------------
// Aircraft and buildings against the clear areas
// ---------------------------------------------------------------------------

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const overlaps = (a: Box, r: Rect): boolean =>
  a.x0 < r.x + r.w && a.x1 > r.x && a.z0 < r.z + r.d && a.z1 > r.z;

function aircraftBox(kind: 'tie-down' | 'narrow' | 'wide', nose: { x: number; z: number }): Box {
  const g = aircraftGeometry(kind);
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  return { x0: nose.x + b.min.x, x1: nose.x + b.max.x, z0: nose.z + b.min.z, z1: nose.z + b.max.z };
}

describe('aircraft', () => {
  it.each(AIRPORT_IDS)(
    '%s parks one aircraft on every stand, nose to the building line, inside it',
    (id) => {
      const layout = airportLayout(id);
      const placed = aircraftPlacements(layout);
      // One per terminal stand, then one nose to each cargo building.
      expect(placed).toHaveLength(layout.stands.length + layout.cargo.length);
      placed.slice(0, layout.stands.length).forEach((p, i) => {
        const stand = at(layout.stands, i);
        expect(p.kind).toBe(stand.kind);
        const box = aircraftBox(p.kind, p);
        expect(box.x0).toBeGreaterThanOrEqual(stand.x);
        expect(box.x1).toBeLessThanOrEqual(stand.x + stand.w);
        expect(box.z0).toBeGreaterThanOrEqual(stand.z);
        expect(box.z1).toBeLessThanOrEqual(stand.z + stand.d - STAND_CLEARANCE_M[id] + 1e-6);
        // The nose points at the building line: the tail is toward the taxiway.
        expect(box.z1 - p.z).toBeCloseTo(0, 5);
      });
    },
  );

  it('gives the jets swept wings and a tailplane, and the trainer a straight wing and a propeller', () => {
    expect(AIRCRAFT_SPECS.narrow.sweep).toBeGreaterThan(0);
    expect(AIRCRAFT_SPECS.wide.sweep).toBeGreaterThan(0);
    expect(AIRCRAFT_SPECS['tie-down'].sweep).toBe(0);
    expect(AIRCRAFT_SPECS['tie-down'].propeller).toBe(true);
    expect(AIRCRAFT_SPECS.narrow.propeller).toBe(false);
    // A swept wing's tips lie behind its root: the geometry's wing vertices at the span's ends sit further back than at the middle.
    for (const kind of ['narrow', 'wide'] as const) {
      const spec = AIRCRAFT_SPECS[kind];
      const pos = aircraftGeometry(kind).getAttribute('position');
      const axis = spec.gear + spec.diameter / 2;
      const wingTop = axis - spec.diameter * 0.175;
      let tipZ = -Infinity;
      let rootZ = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        // Only the wing's slab lies at this height and reaches the centreline or the tips.
        if (Math.abs(pos.getY(i) - wingTop) > 0.01) continue;
        if (Math.abs(pos.getX(i)) > spec.span / 2 - 0.01) tipZ = Math.max(tipZ, pos.getZ(i));
        if (Math.abs(pos.getX(i)) < 0.01) rootZ = Math.max(rootZ, pos.getZ(i));
      }
      expect(rootZ - tipZ).toBeCloseTo(spec.sweep, 1);
    }
  });

  it('sizes each type under its stand group wingspan and within the stand depth less the clearance', () => {
    const limit = {
      'tie-down': WIDEST_WINGSPAN_M.airfield,
      narrow: NARROW_WINGSPAN_M,
      wide: WIDEST_WINGSPAN_M['international-airport'],
    };
    for (const kind of ['tie-down', 'narrow', 'wide'] as const) {
      expect(AIRCRAFT_SPECS[kind].span).toBeLessThan(limit[kind]);
      const g = aircraftGeometry(kind);
      g.computeBoundingBox();
      const b = g.boundingBox as THREE.Box3;
      expect(b.max.x - b.min.x).toBeCloseTo(AIRCRAFT_SPECS[kind].span, 1);
      expect(b.max.z - b.min.z).toBeCloseTo(AIRCRAFT_SPECS[kind].length, 1);
    }
    for (const id of AIRPORT_IDS) {
      for (const s of airportLayout(id).stands) {
        expect(AIRCRAFT_SPECS[s.kind].length).toBeLessThanOrEqual(
          s.d - STAND_CLEARANCE_M[id] + 1e-6,
        );
        expect(AIRCRAFT_SPECS[s.kind].span + STAND_CLEARANCE_M[id]).toBeLessThanOrEqual(s.w + 1e-6);
      }
    }
  });

  it.each(AIRPORT_IDS)(
    '%s has nothing above ground inside the safety area or the object free area',
    (id) => {
      const layout: AirportLayout = airportLayout(id);
      const entry = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find(
        (e) => e.id === id,
      ) as BuildingCatalogEntry;
      const boxes: Box[] = [];
      for (const b of airportBuildings(layout, entry.height)) {
        const o = ROOF_OVERHANG_M;
        boxes.push({
          x0: b.rect.x - o,
          x1: b.rect.x + b.rect.w + o,
          z0: b.rect.z - o,
          z1: b.rect.z + b.rect.d + o,
        });
        for (const p of buildingPanes(b)) {
          boxes.push({
            x0: p.cx - p.w / 2,
            x1: p.cx + p.w / 2,
            z0: p.cz - p.d / 2,
            z1: p.cz + p.d / 2,
          });
        }
      }
      for (const p of aircraftPlacements(layout)) boxes.push(aircraftBox(p.kind, p));
      expect(boxes.length).toBeGreaterThan(5);
      for (const box of boxes) {
        expect(overlaps(box, layout.objectFreeArea)).toBe(false);
        expect(overlaps(box, layout.safetyArea)).toBe(false);
        expect(box.z1).toBeLessThanOrEqual(layout.plot.d);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// The renderer: pools, rotation, night and the old kit
// ---------------------------------------------------------------------------

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const flat = (): number => 0;

function instance(
  id: number,
  catalogId: string,
  rotation: Rotation,
  x = 10,
  z = 10,
): BuildingInstance {
  return { id, catalogId, x, z, rotation, level: 1, state: BuildingState.Active, problems: 0 };
}
const add = (...b: BuildingInstance[]) => ({ added: b, removed: [], updated: [] });

function countInstanced(scene: THREE.Scene): number {
  let n = 0;
  scene.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) n++;
  });
  return n;
}

describe('LandmarkRenderer airports', () => {
  it('shares its instanced pools across every airport', () => {
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, flat, catalog);
    const before = countInstanced(scene);
    renderer.apply(add(instance(1, 'international-airport', 0)));
    const one = countInstanced(scene);
    renderer.apply(
      add(
        instance(2, 'international-airport', 1, 300, 10),
        instance(3, 'airfield', 2, 10, 400),
        instance(4, 'regional-airport', 3, 400, 400),
      ),
    );
    expect(countInstanced(scene)).toBe(one);
    expect(one).toBe(before);
  });

  it('draws the plate as one mesh an airport and removes it with the airport', () => {
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, flat, catalog);
    renderer.apply(add(instance(1, 'regional-airport', 0)));
    const plate = renderer.airportPlate(1);
    expect(plate).toBeDefined();
    expect(scene.children).toContain(plate);
    renderer.apply({ added: [], removed: [1], updated: [] });
    expect(renderer.airportPlate(1)).toBeUndefined();
    expect(scene.children).not.toContain(plate);
  });

  it('draws one aircraft per stand through the rotation, inside its stand', () => {
    const layout = airportLayout('international-airport');
    for (const rotation of [0, 1, 2, 3] as const) {
      const scene = new THREE.Scene();
      const renderer = new LandmarkRenderer(scene, flat, catalog);
      const b = instance(1, 'international-airport', rotation, 10, 10);
      renderer.apply(add(b));
      const w = layout.plot.w;
      const d = layout.plot.d;
      const lot =
        rotation % 2 === 0
          ? { w: layout.plotTiles.w, d: layout.plotTiles.d }
          : { w: layout.plotTiles.d, d: layout.plotTiles.w };
      const cx = (b.x + lot.w / 2) * TILE_METERS;
      const cz = (b.z + lot.d / 2) * TILE_METERS;
      const theta = rotation * (Math.PI / 2);
      const total =
        renderer.airportPartMatrices(1, 'aircraftNarrow').length +
        renderer.airportPartMatrices(1, 'aircraftWide').length;
      const cargoStands = layout.cargo.flatMap((c) => c.stands);
      expect(total).toBe(layout.stands.length + cargoStands.length);
      for (const [kind, pool] of [
        ['narrow', 'aircraftNarrow'],
        ['wide', 'aircraftWide'],
      ] as const) {
        const stands = [...layout.stands, ...cargoStands].filter((s) => s.kind === kind);
        const terminalCount = layout.stands.filter((s) => s.kind === kind).length;
        const ms = renderer.airportPartMatrices(1, pool);
        expect(ms).toHaveLength(stands.length);
        ms.forEach((m, i) => {
          const p = new THREE.Vector3().setFromMatrixPosition(m);
          // Back to the layout's frame: undo the translation, then the turn.
          const dx = p.x - cx;
          const dz = p.z - cz;
          const lx = dx * Math.cos(theta) - dz * Math.sin(theta) + w / 2;
          const lz = dx * Math.sin(theta) + dz * Math.cos(theta) + d / 2;
          const stand = at(stands, i);
          expect(lx).toBeCloseTo(stand.x + stand.w / 2, 3);
          expect(lz).toBeGreaterThan(stand.z);
          // A cargo aircraft's nose reaches past its stand onto the approach to the building.
          if (i < terminalCount) expect(lz).toBeLessThanOrEqual(stand.z + stand.d);
        });
      }
    }
  });

  it('lights the panes with the night factor and tints the plate like every sunlit surface', () => {
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, flat, catalog);
    renderer.apply(add(instance(1, 'regional-airport', 0)));
    expect(renderer.airportPaneIntensity()).toBe(0);
    renderer.setNightFactor(1);
    expect(renderer.airportPaneIntensity()).toBe(1);
    const materials = (renderer.airportPlate(1) as THREE.Mesh).material as (THREE.Material & {
      colorNode?: unknown;
    })[];
    expect(materials).toHaveLength(3);
    for (const m of materials) {
      expect(m.colorNode).toBeDefined();
      expect(m.polygonOffset).toBe(true);
    }
    // Each layer is biased nearer than the one below it.
    const bias = materials.map((m) => m.polygonOffsetFactor);
    expect(bias[1]).toBeLessThan(bias[0] ?? 0);
    expect(bias[2]).toBeLessThan(bias[1] ?? 0);
  });

  it.each(AIRPORT_IDS)('%s plate groups cover every index, one group a layer', (id) => {
    const g = airportPlateGeometry(id, 0);
    expect(g.groups).toHaveLength(3);
    expect(g.groups.reduce((sum, grp) => sum + grp.count, 0)).toBe(g.getIndex()?.count);
    expect(g.groups.map((grp) => grp.materialIndex)).toEqual([0, 1, 2]);
  });

  it('keeps the former airport on its old kit with no plate', () => {
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, flat, catalog);
    renderer.apply(add(instance(1, 'airport', 0)));
    expect(renderer.airportPlate(1)).toBeUndefined();
    expect(renderer.hasApronSurface(1)).toBe(true);
    expect(renderer.partSlotsFor(1, 'tower')).toHaveLength(1);
    expect(renderer.partSlotsFor(1, 'plane').length).toBeGreaterThan(0);
    expect(renderer.airportPartMatrices(1, 'body')).toHaveLength(0);
  });

  it('seats every building body, roof and pane for each rung', () => {
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, flat, catalog);
    renderer.apply(add(instance(1, 'airfield', 0)));
    const layout = airportLayout('airfield');
    const boxes = airportBuildings(layout, 6).length;
    const parts = facilityParts(layout);
    expect(boxes).toBe(6);
    expect(renderer.airportPartMatrices(1, 'body')).toHaveLength(
      boxes + parts.filter((p) => p.pool === 'body').length,
    );
    expect(renderer.airportPartMatrices(1, 'roof')).toHaveLength(boxes);
    expect(renderer.airportPartMatrices(1, 'aircraftTieDown')).toHaveLength(20);
    expect(renderer.airportPartMatrices(1, 'pane').length).toBeGreaterThan(4);
  });
});
