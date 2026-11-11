import { describe, expect, it } from 'vitest';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, FarmKind } from '../shared/types';
import { BIN_DIAMETER_M, SILO_DIAMETER_M, TRUCK_SIZE_M, planFarm, type FarmRect } from './farmlot';
import { measureTruckRound, truckLapSeconds, truckPose } from './farms';

const farm = (kind: FarmKind, level: number, w: number, d: number): BuildingCatalogEntry => ({
  id: `farm-${kind}-${level}`,
  name: kind,
  category: 'ind',
  zone: ZoneType.Agriculture,
  level,
  kind,
  footprint: { w, d },
  height: 9,
  color: 0x7a3a2c,
  residents: 4,
  jobs: 1,
  powerUse: 0.2,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
});
const at = (x: number, z: number): BuildingInstance => ({
  id: 7,
  catalogId: 'farm',
  x,
  z,
  rotation: 0,
  level: 1,
  state: BuildingState.Active,
  problems: 0,
});
const dirtAlong =
  (side: 'N' | 'E' | 'S' | 'W', w: number, d: number) =>
  (tx: number, tz: number): boolean => {
    if (side === 'N') return tz === 9;
    if (side === 'S') return tz === 10 + d;
    if (side === 'W') return tx === 9;
    return tx === 10 + w;
  };

/** The distance from a truck's body (its oriented footprint) to a point; 0 when the point is inside it. */
function distanceFromTruck(
  truck: { x: number; z: number; yaw: number },
  px: number,
  pz: number,
): number {
  const [w, , l] = TRUCK_SIZE_M;
  const dx = px - truck.x;
  const dz = pz - truck.z;
  // Local +Z is the nose and maps to world (sin yaw, cos yaw).
  const along = dx * Math.sin(truck.yaw) + dz * Math.cos(truck.yaw);
  const across = dx * Math.cos(truck.yaw) - dz * Math.sin(truck.yaw);
  return Math.hypot(Math.max(Math.abs(across) - w / 2, 0), Math.max(Math.abs(along) - l / 2, 0));
}

/** The nearest a truck's body comes to a rectangle, by walking the rectangle's outline. */
function gapToRect(truck: { x: number; z: number; yaw: number }, r: FarmRect): number {
  let best = Infinity;
  const step = 0.25;
  for (let x = r.x0; x <= r.x1 + 1e-9; x += step) {
    best = Math.min(best, distanceFromTruck(truck, x, r.z0), distanceFromTruck(truck, x, r.z1));
  }
  for (let z = r.z0; z <= r.z1 + 1e-9; z += step) {
    best = Math.min(best, distanceFromTruck(truck, r.x0, z), distanceFromTruck(truck, r.x1, z));
  }
  return best;
}

describe('the farm truck', () => {
  describe.each([
    ['crops', 1, 4, 5],
    ['crops', 3, 6, 7],
    ['orchard', 2, 5, 6],
    ['pasture', 3, 6, 7],
  ] as const)('on a %s farm at level %i', (kind, level, w, d) => {
    it.each(['N', 'E', 'S', 'W'] as const)(
      'keeps its whole body clear of the barn, house, silos, bins and shed on its round, gated %s',
      (side) => {
        const plan = planFarm(at(10, 10), farm(kind, level, w, d), dirtAlong(side, w, d))!;
        const route = plan.truckRoute!;
        expect(route).not.toBeNull();
        const round = measureTruckRound(route, plan.truckStop);
        const faults: string[] = [];
        for (let t = 0; t <= truckLapSeconds(round); t += 0.1) {
          const truck = truckPose(round, t);
          const here = (name: string, gap: number): void => {
            if (gap < 0.2) faults.push(`${name} ${gap.toFixed(2)} m at ${t.toFixed(1)} s`);
          };
          here('barn', gapToRect(truck, plan.barn));
          here('house', gapToRect(truck, plan.house));
          if (plan.shed) here('shed', gapToRect(truck, plan.shed));
          for (const c of plan.silos) {
            here('silo', distanceFromTruck(truck, c.x, c.z) - SILO_DIAMETER_M / 2);
          }
          for (const c of plan.bins) {
            here('bin', distanceFromTruck(truck, c.x, c.z) - BIN_DIAMETER_M / 2);
          }
        }
        expect(faults.slice(0, 5)).toEqual([]);
      },
    );
  });
});
