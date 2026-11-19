import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from './types';
import { bodyMetresFor, grossFloorSqFt, storeysOf } from './floorarea';
import { lotLayoutFor } from './lotparking';
import {
  REPAIR_BAY_M,
  repairBays,
  lotParkingRequirement,
  requiredSpaces,
  SPACES_PER_1000_SQ_FT,
} from './parkingcode';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const repairs = catalog.filter((e) => e.kind === 'autorepair');
const stores = catalog.filter((e) => e.kind === 'convenience');

describe('the auto repair shop parks 2 spaces a service bay and 1 an employee', () => {
  it('counts a bay for each 3.7 m of the body’s street frontage', () => {
    expect(REPAIR_BAY_M).toBe(3.7);
    expect(repairBays(13.6)).toBe(3);
    expect(repairBays(27.2)).toBe(7);
    expect(repairBays(40.8)).toBe(11);
    expect(repairBays(3.6)).toBe(0);
  });

  it('is one storey, so the plate is its floor', () => {
    for (const e of repairs) expect(storeysOf(e), e.id).toBe(1);
  });

  it('owes 2 a bay plus the jobs on the frontage it is given, and the unturned body’s by default', () => {
    for (const e of repairs) {
      const front = bodyMetresFor(e).w;
      expect(lotParkingRequirement(e)!.spaces, e.id).toBe(2 * repairBays(front) + e.jobs!);
      expect(lotParkingRequirement(e, bodyMetresFor(e).d)!.spaces, e.id).toBe(
        2 * repairBays(bodyMetresFor(e).d) + e.jobs!,
      );
    }
    const l1 = repairs.find((e) => e.id === 'com-autorepair-1')!;
    expect(lotParkingRequirement(l1)!.spaces).toBe(2 * 3 + 5);
  });

  it('lays the count the frontage it stands on draws, whichever way the lot is turned', () => {
    for (const e of repairs.filter((r) => r.bodyFootprint !== undefined)) {
      const body = bodyMetresFor(e);
      for (const [rotation, alongX, along] of [
        [0, true, body.w],
        [1, true, body.d],
      ] as const) {
        const l = lotLayoutFor(e, rotation, alongX)!;
        expect(l.required, `${e.id} r${rotation}`).toBe(2 * repairBays(along) + e.jobs!);
      }
    }
  });
});

describe('the convenience store parks at the shop’s rate', () => {
  it('asks 5 spaces for every 1,000 sq ft, with no exempt floor', () => {
    expect(SPACES_PER_1000_SQ_FT.convenience).toBe(SPACES_PER_1000_SQ_FT.shop);
    for (const e of stores) {
      expect(lotParkingRequirement(e)!.spaces, e.id).toBe(
        requiredSpaces('convenience', grossFloorSqFt(e)),
      );
      expect(lotParkingRequirement(e)!.spaces, e.id).toBe(
        Math.ceil((5 * grossFloorSqFt(e)) / 1000),
      );
    }
  });
});

describe('every level of both kinds lays to its code on its lots', () => {
  it('fits its spaces, accessible spaces and berths, every roomy and compact lot, turned either way', () => {
    for (const e of [...repairs, ...stores].filter((r) => r.bodyFootprint !== undefined)) {
      for (const [rotation, alongX] of [
        [0, true],
        [1, true],
      ] as const) {
        expect(lotLayoutFor(e, rotation, alongX)!.fits, `${e.id} r${rotation}`).toBe(true);
      }
    }
  });
});
