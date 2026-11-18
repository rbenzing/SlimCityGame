import { describe, expect, it } from 'vitest';
import { TILE_METERS } from './constants';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import {
  type Point,
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
  carParkRowStalls,
  carParkRowZs,
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
    ...(l.carPark ? [{ name: 'carPark', rect: l.carPark }] : []),
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
    // The strips meet: the apron starts where the stand line does; the airfield's car park ends at
    // the street, the others' stop short of the loop's last leg and the international has none.
    if (l.carPark) {
      if (id === 'airfield') expect(l.carPark.z + l.carPark.d).toBeCloseTo(l.plot.d, 6);
      else expect(l.carPark.z + l.carPark.d).toBeLessThan(l.plot.d);
      expect(l.carPark.z).toBeGreaterThan(l.apron.z + l.apron.d);
    } else {
      expect(id).toBe('international-airport');
    }
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
      if (l.carPark) expect(overlaps(b, l.carPark)).toBe(false);
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
    expect(l.drive.z).toBe(l.plot.d);
    if (!l.carPark) return;
    expect(inside(l.carPark, l.plot)).toBe(true);
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

// ---------------------------------------------------------------------------
// The facilities beside the runway: fence, tower, fuel, maintenance, cargo,
// garages, loop road, service road, signs and boarding bridges.
// ---------------------------------------------------------------------------

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entryHeight = (id: AirportId): number => catalog.find((e) => e.id === id)!.height;
const PILOTS_HEIGHT_M = 3.6;

interface RungSpec {
  fence: number;
  outrigger: boolean;
  tower: { height: number; cab: number; shaft: number } | null;
  primary: number;
  tanks: { n: number; lying: boolean; across: number; long: number };
  dikeWall: number | null;
  hangar: { w: number; d: number; h: number; apron: number };
  cargo: { n: number; w: number; d: number; h: number; kind: 'narrow' | 'wide' } | null;
  garages: number;
  kerbThrough: number | null;
  gantries: number;
  bridges: number;
}

/** The spec's Numbers table, restated as the contract the constants answer to. */
const SPEC: Record<AirportId, RungSpec> = {
  airfield: {
    fence: 1.2,
    outrigger: false,
    tower: null,
    primary: 76.2,
    tanks: { n: 1, lying: true, across: 3.0, long: 6.4 },
    dikeWall: null,
    hangar: { w: 18.3, d: 24.4, h: 6, apron: 12 },
    cargo: null,
    garages: 0,
    kerbThrough: null,
    gantries: 0,
    bridges: 0,
  },
  'regional-airport': {
    fence: 2.4,
    outrigger: true,
    tower: { height: 26.5, cab: 7.6, shaft: 6.0 },
    primary: 152.4,
    tanks: { n: 2, lying: false, across: 9.1, long: 6.1 },
    dikeWall: 1.0,
    hangar: { w: 45, d: 62, h: 20, apron: 40 },
    cargo: { n: 1, w: 60, d: 30, h: 9, kind: 'narrow' },
    garages: 0,
    kerbThrough: 2,
    gantries: 1,
    bridges: 4,
  },
  'international-airport': {
    fence: 2.4,
    outrigger: true,
    tower: { height: 60.4, cab: 7.6, shaft: 9.0 },
    primary: 304.8,
    tanks: { n: 3, lying: false, across: 16.3, long: 6.5 },
    dikeWall: 1.0,
    hangar: { w: 75, d: 95, h: 26.5, apron: 72 },
    cargo: { n: 2, w: 120, d: 36, h: 10, kind: 'wide' },
    garages: 2,
    kerbThrough: 3,
    gantries: 2,
    bridges: 6,
  },
};

/** A polyline's segments as rects of the given width; free ends are butt, joints are filled. */
function thicken(line: Point[], width: number): Rect[] {
  const half = width / 2;
  const out: Rect[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i]!;
    const q = line[i + 1]!;
    const lead = i > 0 ? half : 0;
    const trail = i + 2 < line.length ? half : 0;
    if (Math.abs(p.z - q.z) < EPS) {
      const a = Math.min(p.x, q.x) - (p.x <= q.x ? lead : trail);
      const b = Math.max(p.x, q.x) + (p.x <= q.x ? trail : lead);
      out.push({ x: a, z: p.z - half, w: b - a, d: width });
    } else {
      expect(Math.abs(p.x - q.x), 'polylines run along an axis').toBeLessThan(EPS);
      const a = Math.min(p.z, q.z) - (p.z <= q.z ? lead : trail);
      const b = Math.max(p.z, q.z) + (p.z <= q.z ? trail : lead);
      out.push({ x: p.x - half, z: a, w: width, d: b - a });
    }
  }
  return out;
}

const gap = (a: Rect, b: Rect): number =>
  Math.hypot(
    Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)),
    Math.max(0, a.z - (b.z + b.d), b.z - (a.z + a.d)),
  );

const onPolyline = (line: Point[], p: Point): boolean =>
  line.some((a, i) => {
    const b = line[i + 1];
    if (!b) return false;
    return (
      p.x >= Math.min(a.x, b.x) - EPS &&
      p.x <= Math.max(a.x, b.x) + EPS &&
      p.z >= Math.min(a.z, b.z) - EPS &&
      p.z <= Math.max(a.z, b.z) + EPS
    );
  });

interface Box {
  name: string;
  rect: Rect;
  height: number;
}

/** Every building and tank with its height; the tower is left out. */
function boxes(id: AirportId): Box[] {
  const l = airportLayout(id);
  const out: Box[] = [];
  if (l.terminal) out.push({ name: 'terminal', rect: l.terminal, height: entryHeight(id) });
  if (l.pilotsBuilding) {
    out.push({ name: 'pilots', rect: l.pilotsBuilding, height: PILOTS_HEIGHT_M });
  }
  for (const rect of l.hangars) out.push({ name: 'hangar', rect, height: entryHeight(id) });
  out.push({ name: 'maintenance', rect: l.maintenance.hangar, height: l.maintenance.height });
  for (const c of l.cargo) out.push({ name: 'cargo', rect: c.building, height: c.height });
  for (const g of l.garages) out.push({ name: 'garage', rect: g.rect, height: g.height });
  for (const t of l.fuel.tanks) out.push({ name: 'tank', rect: t.footprint, height: t.height });
  return out;
}

/** Every new part's ground rect; parts of one group may touch or overlap. */
function partRects(id: AirportId): { name: string; rect: Rect; group: string }[] {
  const l = airportLayout(id);
  const out: { name: string; rect: Rect; group: string }[] = [];
  const add = (name: string, rect: Rect, group = name): void => {
    out.push({ name, rect, group });
  };
  if (l.tower) add('tower', l.tower.base);
  add('maintenance hangar', l.maintenance.hangar);
  add('maintenance apron', l.maintenance.apron);
  add('maintenance link', l.maintenance.link);
  add('maintenance approach', l.maintenance.approach);
  l.cargo.forEach((c, i) => {
    add(`cargo ${i}`, c.building);
    add(`cargo apron ${i}`, c.apron, `cargo apron ${i}`);
    c.stands.forEach((s) => add(`cargo stand ${i}`, s, `cargo apron ${i}`));
    add(`cargo link ${i}`, c.link);
    add(`cargo approach ${i}`, c.approach);
    add(`court ${i}`, c.court);
  });
  l.garages.forEach((g, i) => {
    add(`garage ${i}`, g.rect);
    const r = g.drum.diameter / 2;
    add(`drum ${i}`, { x: g.drum.cx - r, z: g.drum.cz - r, w: 2 * r, d: 2 * r });
    thicken(g.entry, 7.2).forEach((r2, k) => add(`entry ${i}.${k}`, r2, 'road'));
  });
  l.fuel.tanks.forEach((t, i) => add(`tank ${i}`, t.footprint, 'fuel'));
  if (l.fuel.dike) add('dike', l.fuel.dike, 'fuel');
  if (l.loopRoad) {
    add('kerb walk', l.loopRoad.kerbWalk);
    thicken(l.loopRoad.centreline, l.loopRoad.lanes * l.loopRoad.laneWidth).forEach((r, i) =>
      add(`loop ${i}`, r, 'road'),
    );
  }
  add('kerbRoad', l.kerbRoad, 'road');
  l.serviceRoad.lines.forEach((line, n) =>
    thicken(line, l.serviceRoad.width).forEach((r, i) => add(`service ${n}.${i}`, r, 'service')),
  );
  add('sign', l.signs.entrance.rect);
  l.boardingBridges.forEach((b, i) => add(`bridge ${i}`, b.rect));
  return out;
}

describe.each(AIRPORT_IDS)('airport facilities: %s', (id) => {
  const l = airportLayout(id);
  const spec = SPEC[id];

  it('holds the spec table figures', () => {
    expect(l.fence.height).toBe(spec.fence);
    expect(l.fence.outrigger).toEqual(spec.outrigger ? { length: 0.3, angleDeg: 45 } : null);
    expect(l.fence.postSpacing).toBe(3.05);

    if (spec.tower) {
      expect(l.tower!.height).toBe(spec.tower.height);
      expect(l.tower!.cab).toBe(spec.tower.cab);
      expect(l.tower!.shaft).toBe(spec.tower.shaft);
      expect(l.tower!.base.w).toBe(spec.tower.shaft);
      expect(l.tower!.base.d).toBe(spec.tower.shaft);
      expect(l.tower!.eyeHeight).toBeCloseTo(spec.tower.height - 3, 9);
    } else {
      expect(l.tower).toBeNull();
    }

    expect(l.fuel.tanks).toHaveLength(spec.tanks.n);
    for (const t of l.fuel.tanks) {
      expect(t.lying).toBe(spec.tanks.lying);
      expect(t.diameter).toBe(spec.tanks.across);
      expect(t.length).toBe(spec.tanks.long);
      expect(t.footprint.d).toBe(spec.tanks.across);
      expect(t.footprint.w).toBe(spec.tanks.lying ? spec.tanks.long : spec.tanks.across);
      expect(t.height).toBe(spec.tanks.lying ? spec.tanks.across : spec.tanks.long);
    }
    expect(l.fuel.dikeWall).toBe(spec.dikeWall);
    expect(l.fuel.dike === null).toBe(spec.dikeWall === null);

    const m = l.maintenance;
    expect([m.hangar.w, m.hangar.d, m.height]).toEqual([
      spec.hangar.w,
      spec.hangar.d,
      spec.hangar.h,
    ]);
    expect(m.apron.d).toBe(spec.hangar.apron);
    expect(m.apron.z).toBeCloseTo(l.apron.z, 9);

    expect(l.cargo).toHaveLength(spec.cargo?.n ?? 0);
    for (const c of l.cargo) {
      const s = spec.cargo!;
      expect([c.building.w, c.building.d, c.height]).toEqual([s.w, s.d, s.h]);
      expect(c.court.d).toBe(36.6);
      expect(c.stands).toHaveLength(1);
      expect(c.stands[0]!.kind).toBe(s.kind);
      expect(c.stands[0]!.w).toBeCloseTo(
        (s.kind === 'wide' ? WIDEST_WINGSPAN_M[id] : 36.0) + STAND_CLEARANCE_M[id],
        9,
      );
    }

    expect(l.garages).toHaveLength(spec.garages);
    for (const g of l.garages) {
      expect([g.rect.w, g.rect.d, g.tiers, g.stallsPerTier]).toEqual([135, 73.2, 5, 400]);
    }
    expect(l.serviceRoad.width).toBe(7.32);
    expect(l.signs.entrance.rect.w).toBe(2.4);
    expect(l.signs.entrance.height).toBe(1.2);
    expect(l.signs.entrance.top).toBe(1.8);
    expect(l.signs.gantries).toHaveLength(spec.gantries);
    expect(l.boardingBridges).toHaveLength(spec.bridges);
  });

  it('keeps the airfield on its kerb road and gives the others a one-way loop', () => {
    if (!l.loopRoad) {
      expect(id).toBe('airfield');
      expect(l.kerbRoad.d).toBe(7.32);
      return;
    }
    const loop = l.loopRoad;
    expect(loop.lanes).toBe(2);
    expect(loop.laneWidth).toBe(3.6);
    expect(loop.kerbStoppingLane).toBe(2.4);
    expect(loop.kerbThroughLanes).toBe(spec.kerbThrough);
    expect(l.kerbRoad.d).toBeCloseTo(2.4 + spec.kerbThrough! * 3.6, 9);
    expect(loop.cornerRadius.inner).toBe(7.6);
    expect(loop.cornerRadius.outer).toBeCloseTo(7.6 + loop.lanes * loop.laneWidth, 9);
    // The walk is 3.4 deep along the whole terminal, between it and the kerb lanes.
    expect(loop.kerbWalk).toEqual({
      x: l.terminal!.x,
      z: l.terminal!.z + l.terminal!.d,
      w: l.terminal!.w,
      d: 3.4,
    });
    expect(l.kerbRoad.z).toBeCloseTo(loop.kerbWalk.z + loop.kerbWalk.d, 9);
    // In from the drive and back to it, past the kerb along the terminal's width.
    const first = loop.centreline[0]!;
    const last = loop.centreline[loop.centreline.length - 1]!;
    expect(first).toEqual(l.drive);
    expect(last).toEqual(l.drive);
    const kerbCentreZ = l.kerbRoad.z + l.kerbRoad.d / 2;
    const kerbLeg = loop.centreline.some(
      (p, i) =>
        loop.centreline[i + 1] !== undefined &&
        Math.abs(p.z - kerbCentreZ) < EPS &&
        Math.abs(loop.centreline[i + 1]!.z - kerbCentreZ) < EPS &&
        Math.min(Math.max(p.x, loop.centreline[i + 1]!.x), l.terminal!.x + l.terminal!.w) -
          Math.max(Math.min(p.x, loop.centreline[i + 1]!.x), l.terminal!.x) >=
          0.8 * Math.min(l.terminal!.w, l.kerbRoad.w),
    );
    expect(kerbLeg).toBe(true);
    for (const g of l.signs.gantries) expect(onPolyline(loop.centreline, g)).toBe(true);
  });

  it('stands the entrance sign at the drive, on the plot', () => {
    const s = l.signs.entrance.rect;
    expect(inside(s, l.plot)).toBe(true);
    expect(Math.abs(s.x + s.w / 2 - l.drive.x)).toBeLessThan(8);
    expect(s.z + s.d).toBeLessThanOrEqual(l.plot.d + EPS);
  });

  it('keeps every new part on the plot, between the thresholds and off the clear areas', () => {
    const x0 = l.runway.x;
    const x1 = l.runway.x + l.runway.w;
    for (const { name, rect } of partRects(id)) {
      expect(inside(rect, l.plot), `${name} on the plot`).toBe(true);
      expect(rect.x, `${name} past the west threshold`).toBeGreaterThanOrEqual(x0 - EPS);
      expect(rect.x + rect.w, `${name} before the east threshold`).toBeLessThanOrEqual(x1 + EPS);
      for (const area of [l.safetyArea, l.objectFreeArea]) {
        expect(overlaps(rect, area), `${name} in a clear area`).toBe(false);
      }
    }
  });

  it('keeps parts off the taxiway object line and apart from each other and the existing layout', () => {
    const paving = ['maintenance link', 'cargo link'];
    for (const { name, rect } of partRects(id)) {
      if (paving.some((p) => name.startsWith(p))) continue;
      expect(rect.z - l.taxiwayCentreZ, name).toBeGreaterThanOrEqual(
        TAXIWAY_FIXED_OBJECT_M[id] - EPS,
      );
      if (l.secondTaxiwayCentreZ !== null) {
        expect(rect.z - l.secondTaxiwayCentreZ, name).toBeGreaterThanOrEqual(
          TAXILANE_FIXED_OBJECT_M - EPS,
        );
      }
    }
    const parts = partRects(id);
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i]!;
        const b = parts[j]!;
        if (a.group === b.group) continue;
        expect(overlaps(a.rect, b.rect), `${a.name} over ${b.name}`).toBe(false);
      }
    }
    const existing = groundRects(id).filter(({ name }) => name !== 'apron');
    for (const part of parts) {
      for (const e of existing) {
        // A bridge reaches its own stand; the airfield's sign stands at the edge of its car park.
        if (part.name.startsWith('bridge') && e.name === 'stand') continue;
        if (part.name === 'sign' && e.name === 'carPark') continue;
        if (part.group === 'road' && e.name === 'kerbRoad') continue;
        expect(overlaps(part.rect, e.rect), `${part.name} over ${e.name}`).toBe(false);
      }
      if (!part.name.startsWith('bridge') && part.name !== 'kerbRoad') {
        expect(overlaps(part.rect, l.apron) && !part.name.includes('stand'), part.name).toBe(false);
      }
    }
  });

  it('keeps every building under the 7 to 1 surface from the primary surface', () => {
    for (const b of boxes(id)) {
      const near = b.rect.z - l.runwayCentreZ;
      expect(b.height, b.name).toBeLessThanOrEqual((near - spec.primary / 2) / 7 + EPS);
    }
  });

  it('closes the fence round the airside and gates each road through it', () => {
    const f = l.fence;
    const ring = f.line;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (let i = 0; i + 1 < ring.length; i++) {
      const horizontal = Math.abs(ring[i]!.z - ring[i + 1]!.z) < EPS;
      const vertical = Math.abs(ring[i]!.x - ring[i + 1]!.x) < EPS;
      expect(horizontal !== vertical, 'each side runs along an axis').toBe(true);
    }
    const xs = ring.map((p) => p.x);
    const zs = ring.map((p) => p.z);
    // Far side and both ends on the plot's boundary.
    expect([Math.min(...xs), Math.max(...xs), Math.min(...zs)]).toEqual([0, l.plot.w, 0]);
    const nearZ = Math.max(...zs);
    expect(nearZ).toBeCloseTo(l.terminal ? l.terminal.z + l.terminal.d : l.kerbRoad.z, 9);
    expect(nearZ).toBeCloseTo(l.kerbRoad.z - (l.loopRoad ? l.loopRoad.kerbWalk.d : 0), 9);

    // The buildings the fence runs between are exactly those standing on the line.
    const onLine = (r: Rect): boolean => r.z < nearZ - EPS && r.z + r.d >= nearZ - EPS;
    const buildings = [
      ...(l.terminal ? [l.terminal] : []),
      ...(l.pilotsBuilding ? [l.pilotsBuilding] : []),
      ...l.hangars,
      l.maintenance.hangar,
      ...l.cargo.map((c) => c.building),
      ...(l.tower ? [l.tower.base] : []),
    ].filter(onLine);
    expect(buildings.length).toBeGreaterThan(0);
    expect(f.buildings).toEqual(expect.arrayContaining(buildings));
    expect(f.buildings).toHaveLength(buildings.length);
    for (const b of buildings)
      expect(b.z + b.d, 'no building ends short of the line').toBeGreaterThanOrEqual(nearZ - EPS);

    // A gate in every place a road crosses or ends on the line, and none inside a building.
    for (const line of l.serviceRoad.lines) {
      line.forEach((p, i) => {
        const q = line[i + 1];
        if (!q || Math.abs(p.x - q.x) > EPS) return;
        const crosses = Math.min(p.z, q.z) <= nearZ + EPS && Math.max(p.z, q.z) >= nearZ - EPS;
        if (!crosses) return;
        const gate = f.gates.find((g) => p.x >= g.x - EPS && p.x <= g.x + g.w + EPS);
        expect(gate, 'a gate where the service road meets the fence').toBeDefined();
        expect(gate!.w).toBeCloseTo(l.serviceRoad.width, 9);
      });
    }
    for (const g of f.gates) {
      expect(g.z).toBeCloseTo(nearZ, 9);
      for (const b of buildings) {
        expect(g.x + g.w <= b.x + EPS || g.x >= b.x + b.w - EPS, 'gate clear of buildings').toBe(
          true,
        );
      }
    }
    expect(f.gates.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps nothing landside inside the fence', () => {
    const nearZ = Math.max(...l.fence.line.map((p) => p.z));
    const landside: Rect[] = [
      l.kerbRoad,
      ...(l.carPark ? [l.carPark] : []),
      ...l.garages.map((g) => g.rect),
      ...l.cargo.map((c) => c.court),
      ...(l.loopRoad ? [l.loopRoad.kerbWalk, ...thicken(l.loopRoad.centreline, 7.2)] : []),
      ...l.serviceRoad.lines.flatMap((line) => thicken(line, l.serviceRoad.width)),
    ];
    for (const r of landside) expect(r.z).toBeGreaterThanOrEqual(nearZ - EPS);
    // Fuel stands inside it.
    for (const r of [
      ...l.fuel.tanks.map((t) => t.footprint),
      ...(l.fuel.dike ? [l.fuel.dike] : []),
    ]) {
      expect(r.z + r.d).toBeLessThanOrEqual(nearZ + EPS);
    }
  });

  it('keeps fuel 15.2 m from every building, at the end of the maintenance apron, at its gate', () => {
    for (const t of l.fuel.tanks) {
      for (const b of boxes(id).filter((x) => x.name !== 'tank')) {
        expect(gap(t.footprint, b.rect), `${b.name} to a tank`).toBeGreaterThanOrEqual(15.2 - EPS);
      }
      if (l.tower) expect(gap(t.footprint, l.tower.base)).toBeGreaterThanOrEqual(15.2 - EPS);
    }
    const area = l.fuel.dike ?? l.fuel.tanks[0]!.footprint;
    const m = l.maintenance;
    // Beside the apron's lateral end: its far edge is 15.2 m from the hangar's side.
    // (The airfield's tank stands on the tie-down apron's edge, the hangar 15.2 m beyond it.)
    const clear =
      id === 'airfield' ? area.x - (m.hangar.x + m.hangar.w) : m.hangar.x - (area.x + area.w);
    expect(clear).toBeCloseTo(15.2, 6);
    const centre = area.x + area.w / 2;
    expect(l.fence.gates.some((g) => Math.abs(g.x + g.w / 2 - centre) < 1e-6)).toBe(true);
    for (const t of l.fuel.tanks) {
      expect(t.footprint.x).toBeGreaterThanOrEqual(area.x - EPS);
      expect(t.footprint.x + t.footprint.w).toBeLessThanOrEqual(area.x + area.w + EPS);
    }
  });

  it('stands the airfield tank on the tie-down apron edge, level with its taxilane', () => {
    if (id !== 'airfield') return;
    const pad = l.fuel.tanks[0]!.footprint;
    expect(pad.x + pad.w).toBeCloseTo(l.apron.x, 9);
    expect(pad.z).toBeGreaterThanOrEqual(l.apron.z);
    expect(pad.z + pad.d).toBeLessThanOrEqual(l.apron.z + l.apron.d);
  });

  it('keeps every road off every building, tank, dike and garage', () => {
    const roads = partRects(id).filter(
      (p) => p.group === 'road' || p.group === 'service' || p.name === 'kerb walk',
    );
    const solids: { name: string; rect: Rect }[] = [
      ...boxes(id).map((b) => ({ name: b.name, rect: b.rect })),
      ...(l.tower ? [{ name: 'tower', rect: l.tower.base }] : []),
      ...(l.fuel.dike ? [{ name: 'dike', rect: l.fuel.dike }] : []),
    ];
    for (const r of roads) {
      for (const s of solids) {
        if (r.name === 'kerb walk' && s.name === 'terminal') continue;
        expect(overlaps(r.rect, s.rect), `${r.name} over ${s.name}`).toBe(false);
      }
    }
  });

  it('gives the maintenance hangar and each cargo building an apron joined to the taxiway', () => {
    const lastTaxiway = l.secondTaxiway ?? l.taxiway;
    const facilities = [
      { name: 'maintenance', ...l.maintenance, face: l.maintenance.hangar },
      ...l.cargo.map((c, i) => ({
        name: `cargo ${i}`,
        ...c,
        face: c.building,
        hangar: c.building,
      })),
    ];
    for (const f of facilities) {
      expect(f.link.z, f.name).toBeCloseTo(lastTaxiway.z + lastTaxiway.d, 9);
      expect(f.link.z + f.link.d, f.name).toBeCloseTo(f.apron.z, 9);
      expect(f.apron.z + f.apron.d, f.name).toBeLessThanOrEqual(f.face.z + EPS);
      expect(f.approach.z, f.name).toBeCloseTo(f.apron.z + f.apron.d, 9);
      expect(f.approach.z + f.approach.d, f.name).toBeCloseTo(f.face.z, 9);
      expect(f.link.x, f.name).toBeCloseTo(f.apron.x, 9);
      expect(f.link.w, f.name).toBeCloseTo(f.apron.w, 9);
    }
    for (const c of l.cargo) {
      for (const s of c.stands) expect(inside(s, c.apron)).toBe(true);
      // Dock doors face the landside, on the line, over the truck court.
      expect(c.dockFace.z).toBeCloseTo(c.building.z + c.building.d, 9);
      expect(c.court.z).toBeCloseTo(c.dockFace.z, 9);
      expect(c.court.x).toBeCloseTo(c.building.x, 9);
      expect(c.court.w).toBeCloseTo(c.building.w, 9);
    }
  });

  it('draws one boarding bridge a terminal stand, from the terminal face to the forward left door', () => {
    expect(l.boardingBridges).toHaveLength(l.terminal ? l.stands.length : 0);
    for (const b of l.boardingBridges) {
      const stand = l.stands[b.stand]!;
      expect(b.rect.z + b.rect.d).toBeCloseTo(l.terminal!.z, 9);
      expect(b.rect.z).toBeCloseTo(b.door.z, 9);
      expect(b.door.z).toBeLessThan(l.terminal!.z);
      expect(b.door.z).toBeGreaterThan(stand.z);
      // The left of an aircraft facing the terminal is the plot's +x side.
      expect(b.door.x).toBeGreaterThan(stand.x + stand.w / 2);
      expect(b.rect.x).toBeGreaterThanOrEqual(l.terminal!.x - EPS);
      expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(l.terminal!.x + l.terminal!.w + EPS);
      l.stands.forEach((other, i) => {
        if (i !== b.stand) expect(overlaps(b.rect, other)).toBe(false);
      });
    }
  });

  it('sees every runway and taxiway corner from the tower cab, 0.80 degrees or more below level, over every building', () => {
    if (!l.tower) {
      expect(id).toBe('airfield');
      return;
    }
    const t = l.tower;
    const eye = { x: t.base.x + t.base.w / 2, z: t.base.z + t.base.d / 2, y: t.eyeHeight };
    const pavements = [
      l.runway,
      l.taxiway,
      ...(l.secondTaxiway ? [l.secondTaxiway] : []),
      ...l.connectors,
      ...l.taxiwayLinks,
    ];
    const corners = pavements.flatMap((r) => [
      { x: r.x, z: r.z },
      { x: r.x + r.w, z: r.z },
      { x: r.x, z: r.z + r.d },
      { x: r.x + r.w, z: r.z + r.d },
    ]);
    for (const c of corners) {
      const dip = (Math.atan2(eye.y, Math.hypot(c.x - eye.x, c.z - eye.z)) * 180) / Math.PI;
      expect(dip, `corner ${c.x},${c.z}`).toBeGreaterThanOrEqual(0.8);
      for (const b of boxes(id)) {
        // The part of the line over the box's footprint, as fractions of the way to the corner.
        let t0 = 0;
        let t1 = 1;
        for (const [p, d, lo, hi] of [
          [eye.x, c.x - eye.x, b.rect.x, b.rect.x + b.rect.w],
          [eye.z, c.z - eye.z, b.rect.z, b.rect.z + b.rect.d],
        ] as const) {
          if (Math.abs(d) < EPS) {
            if (p < lo || p > hi) t1 = -1;
            continue;
          }
          const a = (lo - p) / d;
          const z = (hi - p) / d;
          t0 = Math.max(t0, Math.min(a, z));
          t1 = Math.min(t1, Math.max(a, z));
        }
        if (t1 <= t0) continue;
        expect(eye.y * (1 - t1), `${b.name} under the line to ${c.x},${c.z}`).toBeGreaterThan(
          b.height,
        );
      }
    }
  });
});

describe('airport garages and car parks', () => {
  it('moves the international car park into two garages that still hold its 4,000 spaces', () => {
    const l = airportLayout('international-airport');
    expect(l.carPark).toBeNull();
    expect(carParkCapacity(l)).toBe(4000);
    expect(l.garages.reduce((sum, g) => sum + g.tiers * g.stallsPerTier, 0)).toBe(4000);
  });

  it('gives each garage a spur from the loop to its street face and a round drum against that face', () => {
    const l = airportLayout('international-airport');
    const loop = l.loopRoad!;
    const bottomZ = loop.centreline[1]!.z;
    for (const g of l.garages) {
      const [from, to] = g.entry as [Point, Point];
      expect(onPolyline(loop.centreline, from)).toBe(true);
      expect(from.z).toBeCloseTo(bottomZ, 9);
      expect(to.z).toBeCloseTo(g.rect.z + g.rect.d, 9);
      expect(to.x).toBeGreaterThan(g.rect.x);
      expect(to.x).toBeLessThan(g.rect.x + g.rect.w);
      expect(g.entryFace.z).toBeCloseTo(to.z, 9);
      expect(g.entryFace.w).toBeCloseTo(7.2, 9);
      // The drum is a round 18 m body tangent to the face, inside the garage's length.
      expect(g.drum.diameter).toBe(18);
      expect(g.drum.cz - g.drum.diameter / 2).toBeCloseTo(g.rect.z + g.rect.d, 9);
      expect(g.drum.cx - g.drum.diameter / 2).toBeGreaterThanOrEqual(g.rect.x);
      expect(g.drum.cx + g.drum.diameter / 2).toBeLessThanOrEqual(g.rect.x + g.rect.w);
      // The spur is clear of the drum.
      const spur = thicken(g.entry, 7.2)[0]!;
      const r = g.drum.diameter / 2;
      expect(overlaps(spur, { x: g.drum.cx - r, z: g.drum.cz - r, w: 2 * r, d: 2 * r })).toBe(
        false,
      );
    }
  });

  it('keeps the regional car park at 1,200 stalls or more in whole rows with an island at each end', () => {
    const l = airportLayout('regional-airport');
    expect(carParkCapacity(l)).toBeGreaterThanOrEqual(1200);
    expect(carParkRowStalls(l) * carParkRowZs(l.carPark!.d).length).toBe(carParkCapacity(l));
  });

  it('keeps the regional and the airfield on their surface car park', () => {
    for (const id of ['airfield', 'regional-airport'] as const) {
      const l = airportLayout(id);
      expect(l.carPark).not.toBeNull();
      expect(l.garages).toHaveLength(0);
      expect(carParkCapacity(l)).toBeGreaterThanOrEqual(CAR_PARK_SPACES[id]);
    }
  });
});
