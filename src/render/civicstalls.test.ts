import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import {
  computeClinicLayout,
  computeEducationLayout,
  computeStationLayout,
  hospitalStallCount,
  UtilityKitRenderer,
  type UtilityKitPartKind,
} from './utilitykits';
import { sizeForKind } from './vehicles';
import {
  BuildingState,
  VehicleKind,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

/** The civic kits that lay stalls: the car-slot part each draws its cars in, and the stalls its layout lays. */
const CIVIC: {
  id: string;
  part: UtilityKitPartKind;
  stalls: (e: BuildingCatalogEntry) => number;
}[] = [
  { id: 'hospital', part: 'hospitalCar', stalls: (e) => hospitalStallCount(e.footprint) },
  {
    id: 'clinic',
    part: 'clinicCar',
    stalls: (e) => computeClinicLayout(e.footprint).stalls.length,
  },
  ...['fire-station', 'fire-station-district', 'police-station', 'police-station-district'].map(
    (id) => ({
      id,
      part: 'stationCar' as const,
      stalls: (e: BuildingCatalogEntry) => computeStationLayout(e).stalls.length,
    }),
  ),
  ...['school', 'middle-school', 'high-school', 'college', 'library'].map((id) => ({
    id,
    part: 'schoolCar' as const,
    stalls: (e: BuildingCatalogEntry) => computeEducationLayout(e).stalls.length,
  })),
];

const NO_CAR_PARK: ReadonlySet<string> = new Set(['school', 'college']);

function building(id: number, catalogId: string, rotation: 0 | 1 | 2 | 3): BuildingInstance {
  return {
    id,
    catalogId,
    x: 10,
    z: 10,
    rotation,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  };
}

interface Standing {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

function carsOf(renderer: UtilityKitRenderer, id: number, entry: string, part: UtilityKitPartKind) {
  return renderer.partSlotsFor(id, part).map((slot): Standing => {
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(entry, part, slot, m);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(p, q, new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z, yaw: 2 * Math.atan2(q.y, q.w) };
  });
}

/** Whether two cars on one level touch: their oriented footprints, tested on the separating axes. */
function touch(a: Standing, b: Standing): boolean {
  const [w, , l] = sizeForKind(VehicleKind.Car);
  const quad = (c: Standing) =>
    [
      [w / 2, l / 2],
      [-w / 2, l / 2],
      [-w / 2, -l / 2],
      [w / 2, -l / 2],
    ].map(([lx, lz]) => ({
      x: c.x + lx! * Math.cos(c.yaw) + lz! * Math.sin(c.yaw),
      z: c.z - lx! * Math.sin(c.yaw) + lz! * Math.cos(c.yaw),
    }));
  const qa = quad(a);
  const qb = quad(b);
  for (const poly of [qa, qb]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i]!;
      const r = poly[(i + 1) % 4]!;
      const nx = r.z - p.z;
      const nz = p.x - r.x;
      const range = (pts: typeof qa): [number, number] => {
        const v = pts.map((pt) => pt.x * nx + pt.z * nz);
        return [Math.min(...v), Math.max(...v)];
      };
      const [a0, a1] = range(qa);
      const [b0, b1] = range(qb);
      const eps = 0.02 * Math.hypot(nx, nz);
      if (a1 - b0 <= eps || b1 - a0 <= eps) return false;
    }
  }
  return true;
}

describe('a civic car park reports the stalls it draws', () => {
  for (const { id, part, stalls } of CIVIC) {
    it(`${id}: its own stalls are its layout's, its cars are the occupied ones, one to a stall`, () => {
      const entry = byId(id);
      for (const rotation of [0, 1, 2, 3] as const) {
        const renderer = new UtilityKitRenderer(new THREE.Scene(), () => 0, [entry]);
        renderer.apply({ added: [building(5, id, rotation)], removed: [], updated: [] });
        const own = renderer.ownStalls(5);
        expect(own.stalls, `${id} rot ${rotation}`).toBe(stalls(entry));
        // The primary school and the college lay no stalls: they report none.
        if (!NO_CAR_PARK.has(id)) expect(own.stalls).toBeGreaterThan(0);
        const cars = carsOf(renderer, 5, id, part);
        expect(own.occupied).toBe(cars.length);
        expect(own.occupied).toBeLessThanOrEqual(own.stalls);
        const faults: string[] = [];
        for (let i = 0; i < cars.length; i++) {
          for (let j = i + 1; j < cars.length; j++) {
            if (Math.abs(cars[i]!.y - cars[j]!.y) < 1 && touch(cars[i]!, cars[j]!)) {
              faults.push(`${id} rot ${rotation}: cars ${i} and ${j} touch`);
            }
          }
        }
        expect(faults).toEqual([]);
      }
    });
  }

  it('a hospital reports its deck and its accessible spaces, a clinic its own', () => {
    expect(hospitalStallCount(byId('hospital').footprint)).toBe(144 + 4 + 1);
    expect(computeClinicLayout(byId('clinic').footprint).stalls.length).toBeGreaterThan(0);
  });

  it('a kit that draws no car park reports no stall, and a building that is gone reports none', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), () => 0, [byId('cemetery')]);
    renderer.apply({ added: [building(8, 'cemetery', 0)], removed: [], updated: [] });
    expect(renderer.ownStalls(8)).toEqual({ stalls: 0, occupied: 0 });
    expect(renderer.ownStalls(999)).toEqual({ stalls: 0, occupied: 0 });
  });
});
