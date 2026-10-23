import { describe, expect, it } from 'vitest';
import { RoadTier } from '../../src/shared/types';
import { catalog, roadRow, run, sandboxed } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const airport = catalog.find((e) => e.id === 'airport')!;
const districtPark = catalog.find((e) => e.id === 'district-park')!;

describe('open-space provision rides every snapshot', () => {
  it('counts the footprint tiles of every park, not an airport, and reads 0 per 1,000 with nobody home', () => {
    const h = sandboxed();
    expect(h.lastSnapshot()!.openSpace).toEqual({ tiles: 0, perThousand: 0 });

    const ack = run(h, 1, [
      { kind: 'setUnlimitedMoney', on: true },
      { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(80, 99, 40) },
      { kind: 'placeBuilding', catalogId: 'small-park', x: 80, z: 100, rotation: 0 },
      { kind: 'placeBuilding', catalogId: districtPark.id, x: 82, z: 100, rotation: 0 },
      { kind: 'placeBuilding', catalogId: airport.id, x: 104, z: 100, rotation: 0 },
    ]);
    expect(ack.ok).toBe(true);

    const openSpace = h.lastSnapshot()!.openSpace;
    expect(openSpace?.tiles).toBe(1 + districtPark.footprint.w * districtPark.footprint.d);
    expect(openSpace?.perThousand).toBe(0);
    expect(h.lastSnapshot()!.stats.population).toBe(0);
  });
});
