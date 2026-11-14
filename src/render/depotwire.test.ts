import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CATENARY_POLE,
  computeYardLayout,
  RAIL_YARD_SPEC,
  TRAM_DEPOT_SPEC,
  UtilityKitRenderer,
  YARD_CARS,
  yardFootprint,
  type Rect,
  type YardLayout,
} from './utilitykits';
import { TRAM_CAR_SIZE } from './railcars';
import { TRAM_SUPPORT_MAX_M, TRAM_WIRE_HEIGHT_M } from './tramwire';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const TRAM = catalog.find((e) => e.id === 'tram-depot')!;
const RAIL = catalog.find((e) => e.id === 'rail-yard')!;
const footprint = yardFootprint(TRAM);

/** Every frame a depot is laid in: off the long edge or the end, either way round. */
const frames: [string, YardLayout][] = [false, true].flatMap((fromEnd) =>
  [false, true].map((mirror): [string, YardLayout] => [
    `${fromEnd ? 'end' : 'side'}${mirror ? ' mirrored' : ''}`,
    computeYardLayout(footprint, TRAM_DEPOT_SPEC, fromEnd, YARD_CARS.tram, {
      reach: 'full',
      mirror,
    }),
  ]),
);

/** The plan rectangle a stabled car's body fills, its nose along the road (X). */
const bodyOf = (car: { x: number; z: number }): Rect => ({
  x0: car.x - TRAM_CAR_SIZE[2] / 2,
  x1: car.x + TRAM_CAR_SIZE[2] / 2,
  z0: car.z - TRAM_CAR_SIZE[0] / 2,
  z1: car.z + TRAM_CAR_SIZE[0] / 2,
});
const poleOf = (p: { x: number; z: number }): Rect => ({
  x0: p.x - CATENARY_POLE.size / 2,
  x1: p.x + CATENARY_POLE.size / 2,
  z0: p.z - CATENARY_POLE.size / 2,
  z1: p.z + CATENARY_POLE.size / 2,
});
/** The gap between two rectangles; zero or less where they touch or overlap. */
const gap = (a: Rect, b: Rect): number =>
  Math.max(a.x0 - b.x1, b.x0 - a.x1, a.z0 - b.z1, b.z0 - a.z1);

/** The old UK clearance of 15 in between a vehicle's side and a pole. */
const POLE_CLEAR_M = 0.38;

describe.each(frames)('the tram depot, %s', (_name, lay) => {
  it('stands no pole inside a stabled tram or within 0.38 m of its side', () => {
    expect(lay.poles.length).toBeGreaterThan(0);
    for (const set of lay.sets) {
      for (const car of set) {
        for (const pole of lay.poles) {
          expect(gap(bodyOf(car), poleOf(pole))).toBeGreaterThanOrEqual(POLE_CLEAR_M - 1e-9);
        }
      }
    }
  });

  it('stands no pole in the shop or the office, and every pole inside the fence', () => {
    for (const pole of lay.poles) {
      expect(gap(poleOf(pole), lay.hall)).toBeGreaterThan(0.3);
      expect(gap(poleOf(pole), lay.office)).toBeGreaterThan(0.3);
      expect(pole.x).toBeGreaterThan(lay.fence.x0);
      expect(pole.x).toBeLessThan(lay.fence.x1);
      expect(pole.z).toBeGreaterThan(lay.fence.z0);
      expect(pole.z).toBeLessThan(lay.fence.z1);
    }
  });

  it('overlaps no two stabled cars', () => {
    const cars = lay.sets.flatMap((set, road) =>
      set.map((car, section) => ({ car, road, section })),
    );
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i]!;
        const b = cars[j]!;
        const between = gap(bodyOf(a.car), bodyOf(b.car));
        expect(between, `cars ${i} and ${j}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('stables one tram on a road, its sections the only cars on it', () => {
    for (const set of lay.sets) expect(set).toHaveLength(YARD_CARS.tram.perSet);
  });

  it('hangs a contact wire over each road from span wires between poles at the yard’s sides', () => {
    expect(lay.wires).toHaveLength(lay.roads.length);
    lay.roads.forEach((road, k) => {
      const wire = lay.wires[k]!;
      expect(wire).toEqual(road);
      // Each span crosses the road; the supports along it stand no further apart than 36.6 m.
      const crossings = lay.spans
        .map((span) => {
          const t = (road.z0 - span.a.z) / (span.b.z - span.a.z);
          return t >= 0 && t <= 1 ? span.a.x + (span.b.x - span.a.x) * t : null;
        })
        .filter(
          (x): x is number =>
            x !== null &&
            x >= Math.min(road.x0, road.x1) - 1e-9 &&
            x <= Math.max(road.x0, road.x1) + 1e-9,
        )
        .sort((a, b) => a - b);
      expect(crossings.length, `road ${k} supports`).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < crossings.length; i++) {
        expect(crossings[i]! - crossings[i - 1]!).toBeLessThanOrEqual(TRAM_SUPPORT_MAX_M);
      }
    });
    for (const span of lay.spans) {
      for (const end of [span.a, span.b]) {
        expect(lay.poles.some((p) => p.x === end.x && p.z === end.z)).toBe(true);
      }
    }
  });
});

describe('the tram depot’s overhead geometry', () => {
  it('hangs the contact wire 5.8 m over the rails, from poles taller than their span wires', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), () => 0, [TRAM]);
    const geometry = renderer.partGeometry('tram-depot', 'tramDepotPoles')!;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const ys = Array.from({ length: position.count }, (_, i) => position.getY(i));
    expect(TRAM_WIRE_HEIGHT_M).toBe(5.8);
    // Some vertex sits on the wire's own height band, none of the wire hangs lower.
    expect(ys.some((y) => Math.abs(y - TRAM_WIRE_HEIGHT_M) < 0.03)).toBe(true);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeCloseTo(CATENARY_POLE.h, 6);
    expect(CATENARY_POLE.h).toBeGreaterThan(6.0);
  });

  it('gives the rail yard no wire', () => {
    const rail = computeYardLayout(yardFootprint(RAIL), RAIL_YARD_SPEC, false, YARD_CARS.rail);
    expect(rail.poles).toEqual([]);
    expect(rail.spans).toEqual([]);
    expect(rail.wires).toEqual([]);
  });
});
