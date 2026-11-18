import { describe, expect, it } from 'vitest';
import { TILE_METERS } from './constants';
import {
  AIRPORT_IDS,
  APRON_DEPTH_M,
  AirportId,
  BLAST_PAD_M,
  BUILDINGS_STRIP_DEPTH_M,
  CAR_PARK_SPACES,
  CLEAR_BEYOND_END_M,
  HOLDING_POSITION_M,
  KERB_AND_CAR_PARK_STRIP_M,
  OBJECT_FREE_AREA_WIDTH_M,
  Rect,
  RUNWAY_LENGTH_M,
  RUNWAY_TO_TAXIWAY_M,
  RUNWAY_WIDTH_M,
  SAFETY_AREA_WIDTH_M,
  SECOND_TAXIWAY_SEPARATION_M,
  SHOULDER_WIDTH_M,
  STAND_CLEARANCE_M,
  TAXILANE_FIXED_OBJECT_M,
  TAXIWAY_FIXED_OBJECT_M,
  TAXIWAY_WIDTH_M,
  TERMINAL_FLOORS,
  TERMINAL_FLOOR_M2,
  WIDEST_WINGSPAN_M,
  airportLayout,
  airportPlotTiles,
  carParkCapacity,
} from './airportlayout';

const EPS = 1e-6;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - EPS &&
  inner.z >= outer.z - EPS &&
  inner.x + inner.w <= outer.x + outer.w + EPS &&
  inner.z + inner.d <= outer.z + outer.d + EPS;

/** Every rectangle in the layout that stands, parks or paves ground beyond the runway's own pavement. */
function groundRects(id: AirportId): { name: string; rect: Rect }[] {
  const l = airportLayout(id);
  const named: { name: string; rect: Rect }[] = [
    { name: 'apron', rect: l.apron },
    { name: 'kerbRoad', rect: l.kerbRoad },
    { name: 'carPark', rect: l.carPark },
    ...l.stands.map((rect) => ({ name: 'stand', rect })),
    ...l.hangars.map((rect) => ({ name: 'hangar', rect })),
    ...l.taxiwayLinks.map((rect) => ({ name: 'link', rect })),
  ];
  if (l.terminal) named.push({ name: 'terminal', rect: l.terminal });
  if (l.pilotsBuilding) named.push({ name: 'pilots', rect: l.pilotsBuilding });
  if (l.secondTaxiway) named.push({ name: 'secondTaxiway', rect: l.secondTaxiway });
  return named;
}

describe.each(AIRPORT_IDS)('airport layout: %s', (id) => {
  const l = airportLayout(id);

  it('measures the runway, safety area and object free area the spec gives', () => {
    expect(l.runway.w).toBe(RUNWAY_LENGTH_M[id]);
    expect(l.runway.d).toBe(RUNWAY_WIDTH_M[id]);
    expect(l.safetyArea.d).toBe(SAFETY_AREA_WIDTH_M[id]);
    expect(l.objectFreeArea.d).toBe(OBJECT_FREE_AREA_WIDTH_M[id]);
    for (const area of [l.safetyArea, l.objectFreeArea]) {
      expect(l.runway.x - area.x).toBeCloseTo(CLEAR_BEYOND_END_M[id], 6);
      expect(area.x + area.w - (l.runway.x + l.runway.w)).toBeCloseTo(CLEAR_BEYOND_END_M[id], 6);
      expect(area.z + area.d / 2).toBeCloseTo(l.runwayCentreZ, 6);
    }
    expect(inside(l.objectFreeArea, l.plot)).toBe(true);
    expect(inside(l.safetyArea, l.objectFreeArea)).toBe(true);
  });

  it('puts shoulders and blast pads on the runway as the spec gives', () => {
    expect(l.shoulders).toHaveLength(2);
    for (const s of l.shoulders) expect(s.d).toBe(SHOULDER_WIDTH_M[id]);
    expect(l.shoulders[0]!.z + l.shoulders[0]!.d).toBeCloseTo(l.runway.z, 6);
    expect(l.shoulders[1]!.z).toBeCloseTo(l.runway.z + l.runway.d, 6);
    const pad = BLAST_PAD_M[id];
    if (!pad) {
      expect(l.blastPads).toHaveLength(0);
      return;
    }
    expect(l.blastPads).toHaveLength(2);
    for (const p of l.blastPads) {
      expect(p.d).toBe(pad.w);
      expect(p.w).toBe(pad.l);
      expect(p.z + p.d / 2).toBeCloseTo(l.runwayCentreZ, 6);
    }
    expect(l.blastPads[0]!.x + l.blastPads[0]!.w).toBeCloseTo(l.runway.x, 6);
    expect(l.blastPads[1]!.x).toBeCloseTo(l.runway.x + l.runway.w, 6);
  });

  it('lays the taxiway, its connectors and holding positions at the spec distances', () => {
    expect(l.taxiwayCentreZ - l.runwayCentreZ).toBeCloseTo(RUNWAY_TO_TAXIWAY_M[id], 6);
    expect(l.taxiway.d).toBe(TAXIWAY_WIDTH_M[id]);
    expect(l.taxiway.z + l.taxiway.d / 2).toBeCloseTo(l.taxiwayCentreZ, 6);
    expect(l.connectors).toHaveLength(id === 'airfield' ? 2 : 3);
    const ends = [l.runway.x, l.runway.x + l.runway.w];
    expect(l.connectors[0]!.x).toBeCloseTo(ends[0]!, 6);
    expect(l.connectors[1]!.x + l.connectors[1]!.w).toBeCloseTo(ends[1]!, 6);
    for (const c of l.connectors) {
      expect(c.z).toBeCloseTo(l.runway.z + l.runway.d, 6);
      expect(c.z + c.d).toBeCloseTo(l.taxiway.z, 6);
    }
    expect(l.holdingPositions).toHaveLength(l.connectors.length);
    for (const h of l.holdingPositions) {
      expect(h.z - l.runwayCentreZ).toBeCloseTo(HOLDING_POSITION_M[id], 6);
    }
  });

  it('sizes each stand as the widest wingspan plus clearance, and holds the spec count', () => {
    const counts = { airfield: 20, 'regional-airport': 4, 'international-airport': 6 };
    expect(l.stands).toHaveLength(counts[id]);
    const widest = WIDEST_WINGSPAN_M[id] + STAND_CLEARANCE_M[id];
    for (const s of l.stands) expect(s.w).toBeLessThanOrEqual(widest + EPS);
    expect(Math.max(...l.stands.map((s) => s.w))).toBeCloseTo(widest, 6);
    if (id === 'international-airport') {
      expect(l.stands.filter((s) => s.kind === 'wide')).toHaveLength(2);
      expect(l.stands.filter((s) => s.kind === 'narrow')).toHaveLength(4);
      expect(l.stands.reduce((sum, s) => sum + s.w, 0)).toBeCloseTo(320, 6);
    }
  });

  it('keeps stands apart and inside the apron', () => {
    for (let i = 0; i < l.stands.length; i++) {
      expect(inside(l.stands[i]!, l.apron)).toBe(true);
      for (let j = i + 1; j < l.stands.length; j++) {
        expect(overlaps(l.stands[i]!, l.stands[j]!)).toBe(false);
      }
    }
    expect(l.apron.d).toBe(APRON_DEPTH_M[id]);
  });

  it('stacks the strips to the plot depth and the runway and both ends to its length', () => {
    const international = id === 'international-airport';
    const strips = [
      OBJECT_FREE_AREA_WIDTH_M[id] / 2,
      RUNWAY_TO_TAXIWAY_M[id],
      international
        ? SECOND_TAXIWAY_SEPARATION_M + TAXILANE_FIXED_OBJECT_M
        : TAXIWAY_FIXED_OBJECT_M[id],
      APRON_DEPTH_M[id],
      BUILDINGS_STRIP_DEPTH_M[id],
      KERB_AND_CAR_PARK_STRIP_M[id],
    ];
    const sum = strips.reduce((a, b) => a + b, 0);
    expect(l.plot.d).toBeGreaterThanOrEqual(sum - EPS);
    expect(l.plot.d - sum).toBeLessThan(TILE_METERS);
    // The strips meet: the apron starts where the stand line does, the car park ends at the street.
    expect(l.carPark.z + l.carPark.d).toBeCloseTo(l.plot.d, 6);
    expect(l.carPark.z).toBeGreaterThan(l.apron.z + l.apron.d);
    const length = RUNWAY_LENGTH_M[id] + 2 * CLEAR_BEYOND_END_M[id];
    expect(l.plot.w).toBeGreaterThanOrEqual(length - EPS);
    expect(l.plot.w - length).toBeLessThan(TILE_METERS);
    expect(l.safetyArea.w).toBeCloseTo(length, 6);
  });

  it('keeps grass only in the safety area and the object free area', () => {
    for (const area of [l.safetyArea, l.objectFreeArea]) {
      for (const { name, rect } of groundRects(id)) {
        expect(overlaps(rect, area), `${name} in the clear area`).toBe(false);
      }
    }
    for (const rect of [l.runway, ...l.shoulders, ...l.blastPads, ...l.connectors]) {
      expect(inside(rect, l.plot)).toBe(true);
    }
    // The parallel taxiway's centreline stands on or beyond the area's edge.
    expect(l.taxiwayCentreZ).toBeGreaterThanOrEqual(l.objectFreeArea.z + l.objectFreeArea.d - EPS);
  });

  it('keeps every stand and building a fixed-object distance from a taxiway centreline', () => {
    const fixed = groundRects(id).filter(({ name }) =>
      ['stand', 'hangar', 'terminal', 'pilots', 'carPark', 'kerbRoad'].includes(name),
    );
    for (const { name, rect } of fixed) {
      expect(rect.z - l.taxiwayCentreZ, name).toBeGreaterThanOrEqual(
        TAXIWAY_FIXED_OBJECT_M[id] - EPS,
      );
      if (l.secondTaxiwayCentreZ !== null) {
        expect(rect.z - l.secondTaxiwayCentreZ, name).toBeGreaterThanOrEqual(
          TAXILANE_FIXED_OBJECT_M - EPS,
        );
      }
    }
  });

  it('puts the buildings in line, clear of the apron and on the plot', () => {
    const buildings = [l.terminal, l.pilotsBuilding, ...l.hangars].filter((r): r is Rect => !!r);
    expect(buildings.length).toBeGreaterThan(0);
    for (const b of buildings) {
      expect(inside(b, l.plot)).toBe(true);
      expect(b.z).toBeGreaterThanOrEqual(l.apron.z + l.apron.d - EPS);
      expect(overlaps(b, l.carPark)).toBe(false);
      expect(overlaps(b, l.kerbRoad)).toBe(false);
    }
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        expect(overlaps(buildings[i]!, buildings[j]!)).toBe(false);
      }
    }
    if (l.terminal) {
      const floors = (l.terminal.w * l.terminal.d * TERMINAL_FLOORS) / TERMINAL_FLOOR_M2[id];
      expect(floors).toBeGreaterThan(0.98);
      expect(floors).toBeLessThan(1.02);
    } else {
      expect(l.pilotsBuilding!.w * l.pilotsBuilding!.d).toBe(150);
    }
  });

  it('holds its car park spaces and opens its drive on the street edge', () => {
    expect(carParkCapacity(l)).toBeGreaterThanOrEqual(CAR_PARK_SPACES[id]);
    expect(inside(l.carPark, l.plot)).toBe(true);
    expect(l.drive.z).toBe(l.plot.d);
    expect(l.drive.x).toBeGreaterThanOrEqual(l.carPark.x);
    expect(l.drive.x).toBeLessThanOrEqual(l.carPark.x + l.carPark.w);
    expect(l.kerbRoad.z + l.kerbRoad.d).toBeCloseTo(l.carPark.z, 6);
  });

  it('is deterministic', () => {
    expect(airportLayout(id)).toEqual(airportLayout(id));
  });
});

describe('airport plots and paint', () => {
  it('measures 49x9, 107x23 and 183x33 tiles', () => {
    expect(airportPlotTiles('airfield')).toEqual({ w: 49, d: 9 });
    expect(airportPlotTiles('regional-airport')).toEqual({ w: 107, d: 23 });
    expect(airportPlotTiles('international-airport')).toEqual({ w: 183, d: 33 });
    for (const id of AIRPORT_IDS) {
      const l = airportLayout(id);
      expect(l.plot.w).toBe(l.plotTiles.w * TILE_METERS);
      expect(l.plot.d).toBe(l.plotTiles.d * TILE_METERS);
    }
  });

  it('gives each rung its approach category and threshold stripes', () => {
    expect(
      AIRPORT_IDS.map((id) => [airportLayout(id).paint, airportLayout(id).thresholdStripes]),
    ).toEqual([
      ['visual', 0],
      ['non-precision', 8],
      ['precision', 12],
    ]);
  });

  it('puts the international apron taxiway 76.0 m from the first, linked at both ends', () => {
    const l = airportLayout('international-airport');
    expect(l.secondTaxiwayCentreZ! - l.taxiwayCentreZ).toBeCloseTo(76.0, 6);
    expect(l.taxiwayLinks).toHaveLength(2);
    expect(airportLayout('regional-airport').secondTaxiway).toBeNull();
    expect(airportLayout('airfield').secondTaxiway).toBeNull();
  });
});
