import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PARK_BENCH_COUNT,
  PARK_LAWN_RGB,
  PARK_PATH_RGB,
  PARK_STREET_SETBACK_M,
  PARK_TREE_CANOPY_RADIUS,
  PITCH,
  POND_BANK_RGB,
  UtilityKitRenderer,
  computeDistrictParkLayout,
  computeNeighbourhoodParkLayout,
  computePlazaLayout,
  computeSportsGroundLayout,
  type PlacedBlock,
  type Rect,
  type Vec2,
} from './utilitykits';
import { PLOT_BAND_TOP } from './plotground';
import { SHALLOW_WATER_COLOR } from './water';
import catalogData from '../data/catalog.json';
import { BuildingState, type BuildingCatalogEntry, type BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const entry = (id: string): BuildingCatalogEntry =>
  (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find((e) => e.id === id)!;
const PLAZA = entry('civic-plaza');
const NEIGHBOURHOOD = entry('neighbourhood-park');
const DISTRICT = entry('district-park');
const SPORTS = entry('sports-ground');

const MIN_PATH_WIDTH_M = 1.5;
const BENCH_HALF_M = 0.6;

function blockRect(b: PlacedBlock): Rect {
  return { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function around(p: Vec2, r: number): Rect {
  return { x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r };
}

/** Every strip is one network: each joins another along at least a path width, none stands alone. */
function pathGaps(paths: readonly Rect[]): number {
  const eps = 1e-6;
  const parent = paths.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const a = paths[i]!;
      const b = paths[j]!;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox >= -eps && oz >= -eps && Math.max(ox, oz) >= MIN_PATH_WIDTH_M - eps) {
        parent[find(i)] = find(j);
      }
    }
  }
  return new Set(paths.map((_, i) => find(i))).size - 1;
}

function lot(e: BuildingCatalogEntry): Rect {
  const hw = (e.footprint.w * TILE_METERS) / 2;
  const hd = (e.footprint.d * TILE_METERS) / 2;
  return { x0: -hw, x1: hw, z0: -hd, z1: hd };
}

/** Parts a kit stands: a point and how far it reaches round itself. */
function insideLot(
  e: BuildingCatalogEntry,
  points: readonly Vec2[],
  reach: number,
  blocks: Rect[],
) {
  const plot = lot(e);
  const street = plot.z1 - PARK_STREET_SETBACK_M;
  for (const p of points) {
    expect(p.x - reach).toBeGreaterThanOrEqual(plot.x0);
    expect(p.x + reach).toBeLessThanOrEqual(plot.x1);
    expect(p.z - reach).toBeGreaterThanOrEqual(plot.z0);
    expect(p.z + reach).toBeLessThanOrEqual(street + 1e-9);
  }
  for (const b of blocks) {
    expect(b.x0).toBeGreaterThanOrEqual(plot.x0);
    expect(b.x1).toBeLessThanOrEqual(plot.x1);
    expect(b.z0).toBeGreaterThanOrEqual(plot.z0);
    expect(b.z1).toBeLessThanOrEqual(street + 1e-9);
  }
}

describe('the sports ground keeps its field and run-off clear', () => {
  const layout = computeSportsGroundLayout(SPORTS.footprint);

  it('lays the field at its real size with the run-off all round, inside the plate', () => {
    expect(layout.pitch.x1 - layout.pitch.x0).toBe(105);
    expect(layout.pitch.z1 - layout.pitch.z0).toBe(68);
    expect(layout.runOff).toEqual({
      x0: layout.pitch.x0 - PITCH.runOff,
      x1: layout.pitch.x1 + PITCH.runOff,
      z0: layout.pitch.z0 - PITCH.runOff,
      z1: layout.pitch.z1 + PITCH.runOff,
    });
    expect(layout.runOff.x0).toBeGreaterThanOrEqual(layout.plate.x0);
    expect(layout.runOff.z0).toBeGreaterThanOrEqual(layout.plate.z0);
  });

  it('stands no tree, bench, lamp, fence or pavilion in the field or its run-off', () => {
    for (const t of layout.trees) {
      expect(overlaps(layout.runOff, around(t, PARK_TREE_CANOPY_RADIUS))).toBe(false);
    }
    for (const b of layout.benches) {
      expect(overlaps(layout.runOff, around(b, BENCH_HALF_M))).toBe(false);
    }
    expect(overlaps(layout.runOff, blockRect(layout.pavilion))).toBe(false);
    expect(layout).not.toHaveProperty('fencePosts');
    expect(layout.benches.length).toBeGreaterThan(0);
    expect(layout.trees.length).toBeGreaterThan(0);
  });

  it('stands everything inside the plot and a metre back from the street side', () => {
    insideLot(SPORTS, layout.trees, PARK_TREE_CANOPY_RADIUS, [blockRect(layout.pavilion)]);
    insideLot(SPORTS, layout.benches, BENCH_HALF_M, []);
    expect(layout.pavilion.z + layout.pavilion.d / 2).toBeCloseTo(
      layout.plate.z1 - PARK_STREET_SETBACK_M,
      9,
    );
  });

  it('keeps the changing pavilion at its 255 m2 gross floor', () => {
    expect(layout.pavilion.w * layout.pavilion.d).toBeCloseTo(255, 6);
  });
});

describe('park paths are one network', () => {
  const neighbourhood = computeNeighbourhoodParkLayout(NEIGHBOURHOOD.footprint);
  const district = computeDistrictParkLayout(DISTRICT.footprint, () => 0, 7);

  it.each([
    ['neighbourhood', NEIGHBOURHOOD, neighbourhood.paths],
    ['district', DISTRICT, district.paths],
  ] as const)('joins every %s path strip to the rest with no gap', (_name, e, paths) => {
    expect(pathGaps(paths)).toBe(0);
    for (const p of paths) {
      expect(Math.min(p.x1 - p.x0, p.z1 - p.z0)).toBeGreaterThanOrEqual(MIN_PATH_WIDTH_M);
    }
    const plot = lot(e);
    for (const edge of [
      (p: Rect) => p.x0 === plot.x0,
      (p: Rect) => p.x1 === plot.x1,
      (p: Rect) => p.z0 === plot.z0,
      (p: Rect) => p.z1 === plot.z1,
    ]) {
      expect(paths.some(edge)).toBe(true);
    }
  });

  it('notices a gap when a strip is cut away', () => {
    expect(pathGaps(neighbourhood.paths.filter((_, i) => i !== 0 && i !== 5))).toBeGreaterThan(0);
  });
});

describe('the neighbourhood park carries its real furnishings', () => {
  const layout = computeNeighbourhoodParkLayout(NEIGHBOURHOOD.footprint);

  it('has a play area, a shelter, shade trees, benches on its paths and an open lawn', () => {
    expect(layout.playFrames.length).toBeGreaterThanOrEqual(2);
    expect(layout.swings.length).toBeGreaterThanOrEqual(2);
    for (const s of [...layout.playFrames, ...layout.swings]) {
      expect(s.x).toBeGreaterThan(layout.playZone.x0);
      expect(s.x).toBeLessThan(layout.playZone.x1);
      expect(s.z).toBeGreaterThan(layout.playZone.z0);
      expect(s.z).toBeLessThan(layout.playZone.z1);
    }
    expect(layout.shelter.w * layout.shelter.d).toBeGreaterThanOrEqual(40);
    expect(layout.shadeTrees.length).toBeGreaterThanOrEqual(3);
    expect(layout.benches.length).toBeGreaterThanOrEqual(PARK_BENCH_COUNT);
    for (const bench of layout.benches) {
      const near = layout.paths.some((p) => overlaps(p, around(bench, 2.5)));
      expect(near).toBe(true);
    }
    // One quadrant is left as open lawn: no furnishing within a 30 m square at its centre.
    const open = around({ x: -42, z: 42 }, 15);
    const furnishings: Vec2[] = [
      ...layout.trees,
      ...layout.shadeTrees,
      ...layout.benches,
      ...layout.playFrames,
      ...layout.swings,
    ];
    for (const f of furnishings) expect(overlaps(open, around(f, 0.1))).toBe(false);
    expect(overlaps(open, blockRect(layout.shelter))).toBe(false);
  });

  it('stands everything inside the plot and off the paths', () => {
    insideLot(
      NEIGHBOURHOOD,
      [...layout.trees, ...layout.shadeTrees, ...layout.benches, ...layout.swings],
      BENCH_HALF_M,
      [blockRect(layout.shelter)],
    );
    for (const path of layout.paths) {
      expect(overlaps(path, blockRect(layout.shelter))).toBe(false);
      for (const t of layout.shadeTrees) expect(overlaps(path, around(t, 1))).toBe(false);
    }
  });
});

describe('the civic plaza carries its real furnishings', () => {
  const layout = computePlazaLayout(PLAZA.footprint);

  it('has paving in a pattern, planters in a grid, benches, lamps and a fountain', () => {
    expect(layout.bands.length).toBeGreaterThan(10);
    expect(layout.gridPlanters.length).toBeGreaterThanOrEqual(9);
    const xs = new Set(layout.gridPlanters.map((p) => p.x));
    const zs = new Set(layout.gridPlanters.map((p) => p.z));
    expect(layout.gridPlanters).toHaveLength(xs.size * zs.size);
    expect(layout.benches.length).toBeGreaterThanOrEqual(4);
    expect(layout.lamps.length).toBeGreaterThanOrEqual(4);
    expect(layout.fountain.radius).toBeGreaterThan(2);
    expect(layout.fountain.radius).toBeLessThan((layout.feature.x1 - layout.feature.x0) / 2);
  });

  it('keeps the planters, lamps and benches clear of the fountain and inside the plot', () => {
    const basin = around(layout.fountain, layout.fountain.radius);
    for (const p of [...layout.gridPlanters, ...layout.lamps, ...layout.benches]) {
      expect(overlaps(basin, around(p, 0.5))).toBe(false);
    }
    insideLot(PLAZA, [...layout.planters, ...layout.gridPlanters, ...layout.lamps], 1, []);
    insideLot(PLAZA, layout.benches, BENCH_HALF_M, []);
  });
});

describe('the district park pond', () => {
  const flat = (): number => 0;
  const layout = computeDistrictParkLayout(DISTRICT.footprint, flat, 12);

  function polygonArea(points: readonly Vec2[]): number {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const q = points[(i + 1) % points.length]!;
      a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
  }

  it('has an irregular rounded shoreline of at least a dozen points inside its rect', () => {
    expect(layout.pondOutline.length).toBeGreaterThanOrEqual(12);
    const rect = (layout.pond.x1 - layout.pond.x0) * (layout.pond.z1 - layout.pond.z0);
    const area = polygonArea(layout.pondOutline);
    expect(area).toBeLessThan(0.9 * rect);
    expect(area).toBeGreaterThan(0.4 * rect);
    for (const p of layout.pondOutline) {
      expect(p.x).toBeGreaterThanOrEqual(layout.pond.x0);
      expect(p.x).toBeLessThanOrEqual(layout.pond.x1);
      expect(p.z).toBeGreaterThanOrEqual(layout.pond.z0);
      expect(p.z).toBeLessThanOrEqual(layout.pond.z1);
    }
    const onEdge = layout.pondOutline.filter(
      (p) =>
        p.x === layout.pond.x0 ||
        p.x === layout.pond.x1 ||
        p.z === layout.pond.z0 ||
        p.z === layout.pond.z1,
    );
    expect(onEdge.length).toBeLessThan(layout.pondOutline.length / 2);
    expect(layout.pondBank).toHaveLength(layout.pondOutline.length);
  });

  it('is deterministic from the park id and differs between parks', () => {
    const again = computeDistrictParkLayout(DISTRICT.footprint, flat, 12);
    const other = computeDistrictParkLayout(DISTRICT.footprint, flat, 13);
    expect(again.pondOutline).toEqual(layout.pondOutline);
    expect(other.pondOutline).not.toEqual(layout.pondOutline);
  });

  it('has a bank a little lighter than the lawn, and the water colour the world uses', () => {
    const lum = (c: readonly number[]): number => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
    expect(lum(POND_BANK_RGB)).toBeGreaterThan(lum(PARK_LAWN_RGB));
    expect(lum(POND_BANK_RGB)).toBeLessThan(lum(PARK_LAWN_RGB) + 0.2);
  });
});

// ---------------------------------------------------------------------------
// The draped plate: everything laid on the lawn lies on the lawn
// ---------------------------------------------------------------------------

function makeInstance(id: number, catalogId: string, x: number, z: number): BuildingInstance {
  return { id, catalogId, x, z, rotation: 0, level: 1, state: BuildingState.Active, problems: 0 };
}

type P3 = readonly [number, number, number];
type Tri = readonly [P3, P3, P3];
type Colour = readonly [number, number, number];

function near(
  c: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  i: number,
  rgb: Colour,
): boolean {
  return (
    Math.abs(c.getX(i) - rgb[0]) < 0.02 &&
    Math.abs(c.getY(i) - rgb[1]) < 0.02 &&
    Math.abs(c.getZ(i) - rgb[2]) < 0.02
  );
}

function trianglesBy(geometry: THREE.BufferGeometry, rgb: Colour): Tri[] {
  const pos = geometry.getAttribute('position');
  const col = geometry.getAttribute('color');
  const index = geometry.index!;
  const corner = (i: number): P3 => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  const out: Tri[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)] as const;
    if (!ids.every((i) => near(col, i, rgb))) continue;
    out.push([corner(ids[0]), corner(ids[1]), corner(ids[2])]);
  }
  return out;
}

/** The height of the lawn triangles at (x, z), or null off them; vertical triangles are skipped. */
function lawnHeight(lawn: readonly Tri[], x: number, z: number): number | null {
  for (const [a, b, c] of lawn) {
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(det) < 1e-9) continue;
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
    const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det;
    const l3 = 1 - l1 - l2;
    const e = -1e-6;
    if (l1 >= e && l2 >= e && l3 >= e) return l1 * a[1] + l2 * b[1] + l3 * c[1];
  }
  return null;
}

const bumpy = (x: number, z: number): number =>
  5 + 0.6 * Math.sin(x / 9) + 0.5 * Math.cos(z / 11) + 0.004 * x;

describe('what a draped park lays on its lawn lies on the lawn', () => {
  function checkLaid(catalogId: string, e: BuildingCatalogEntry, laid: readonly Colour[]): void {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), bumpy, [e]);
    renderer.apply({ added: [makeInstance(1, catalogId, 300, 300)], removed: [], updated: [] });
    const geometry = renderer.drapedMesh(1)!.geometry;
    const lawn = trianglesBy(geometry, PARK_LAWN_RGB);
    let checked = 0;
    for (const rgb of laid) {
      for (const p of trianglesBy(geometry, rgb)) {
        const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
        const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
        const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
        const ground = lawnHeight(lawn, cx, cz);
        if (ground === null) continue;
        expect(cy - ground).toBeGreaterThan(0.005);
        expect(cy - ground).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  }

  it('lies every neighbourhood path above the lawn it crosses on rolling ground', () => {
    checkLaid('neighbourhood-park', NEIGHBOURHOOD, [PARK_PATH_RGB]);
  });

  it('lies every district path, bank and the water above the lawn on rolling ground', () => {
    checkLaid('district-park', DISTRICT, [PARK_PATH_RGB, POND_BANK_RGB, SHALLOW_WATER_COLOR]);
  });

  it('holds the district pond water in the lot band of the ground on a slope, shaped like its outline', () => {
    const slope = (x: number, z: number): number => 10 + 0.05 * x + 0.02 * z;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), slope, [DISTRICT]);
    renderer.apply({ added: [makeInstance(4, 'district-park', 10, 10)], removed: [], updated: [] });
    const geometry = renderer.drapedMesh(4)!.geometry;
    const water = trianglesBy(geometry, SHALLOW_WATER_COLOR);
    expect(water.length).toBeGreaterThan(24);
    let area = 0;
    for (const p of water) {
      for (const v of p) {
        const above = v[1] - slope(v[0], v[2]);
        expect(above).toBeGreaterThanOrEqual(-1e-4);
        expect(above).toBeLessThanOrEqual(PLOT_BAND_TOP + 1e-4);
      }
      const [a, b, c] = p;
      area += ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
    }
    const layout = computeDistrictParkLayout(DISTRICT.footprint, () => 0, 4);
    const rect = (layout.pond.x1 - layout.pond.x0) * (layout.pond.z1 - layout.pond.z0);
    expect(Math.abs(area)).toBeLessThan(0.9 * rect);
    expect(Math.abs(area)).toBeGreaterThan(0.4 * rect);
  });
});
