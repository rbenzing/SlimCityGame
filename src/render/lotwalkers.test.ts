import { describe, expect, it } from 'vitest';
import { frontDoorOf, lotToWorld, planHouseLot, type LotRect } from './houselot';
import { WALK_CYCLE_WITH_DOOR_MS, computeWalkPath, walkSample } from './pedestrians';
import { TILE_METERS } from '../shared/constants';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';

const VERGE = 4.375;
const SIDEWALK = 1.875;

function entry(over: Partial<BuildingCatalogEntry>): BuildingCatalogEntry {
  return {
    id: 'home',
    name: 'Home',
    category: 'res',
    zone: ZoneType.ResLow,
    kind: 'detached',
    level: 1,
    footprint: { w: 1, d: 2 },
    height: 4,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  };
}

const KINDS: Record<string, BuildingCatalogEntry> = {
  ranch: entry({}),
  cape: entry({ height: 5, level: 2 }),
  colonial: entry({ height: 6.5, level: 3 }),
  duplex: entry({ kind: 'duplex', height: 6.4 }),
  row: entry({ zone: ZoneType.ResMediumRow, kind: 'townhouse', height: 9 }),
};

/** A rect of the lot frame as a world box. */
function worldBox(
  frame: Parameters<typeof lotToWorld>[0],
  r: LotRect,
): { x0: number; x1: number; z0: number; z1: number } {
  const corners = [
    lotToWorld(frame, r.u0, r.v0),
    lotToWorld(frame, r.u1, r.v0),
    lotToWorld(frame, r.u1, r.v1),
    lotToWorld(frame, r.u0, r.v1),
  ];
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  };
}

describe('a walker on a home’s lot', () => {
  const streetRow = (z: number) => ({
    roadAt: (_x: number, tz: number) => tz === z,
    street: (_x: number, tz: number) => (tz === z ? { vergeM: VERGE, sidewalkM: SIDEWALK } : null),
  });

  it('never stands on a drive, a pad or the car on it, walking from the pavement to the door', () => {
    for (const [name, ent] of Object.entries(KINDS)) {
      const { roadAt, street } = streetRow(6 + ent.footprint.d);
      let checked = 0;
      for (let id = 1; id <= 120; id++) {
        const building: BuildingInstance = {
          id,
          catalogId: 'home',
          x: id * 4,
          z: 6,
          rotation: 0,
          level: 1,
          state: BuildingState.Active,
          problems: 0,
        };
        const plan = planHouseLot(building, ent, roadAt, street)!;
        const door = frontDoorOf(building, ent, roadAt, street)!;
        const walk = computeWalkPath(building, roadAt, street, door);
        const boxes = plan.drives.map((d) => worldBox(plan.frame, d.rect));
        for (let t = 0; t < WALK_CYCLE_WITH_DOOR_MS; t += 100) {
          const s = walkSample(walk, id, t);
          for (const b of boxes) {
            const inside = s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1;
            expect(inside, `${name} #${id} at ${t} ms`).toBe(false);
          }
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
    expect(TILE_METERS).toBe(20);
  });
});
