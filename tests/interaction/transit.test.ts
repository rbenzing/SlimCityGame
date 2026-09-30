import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { RoadTier, ZoneType } from '../../src/shared/types';
import type { Harness } from '../support/sim';
import { column, initialized, latestSaveGrid, roadRow, rows, run } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('a tramway crossing another street', () => {
  const AVENUE_X = 90;
  const TRAM_Z = 85;

  /**
   * An avenue with homes and power, and a tramway drawn across it afterwards —
   * so the crossing tile is the avenue's — with a tram line from one side of it
   * to the other.
   */
  function crossedTown(): Harness {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: column(AVENUE_X, 60, 50) }]);
    const tramway = roadRow(70, TRAM_Z, 41);
    expect(run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.Tram, tiles: tramway }]).ok).toBe(true);
    run(h, 4, [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: AVENUE_X - 1, z: 60, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: AVENUE_X - 2, z: 61, rotation: 0 },
      {
        kind: 'paintZone',
        zone: ZoneType.ResLow,
        tiles: [...rows(70, TRAM_Z + 1, 20, 3), ...rows(AVENUE_X + 1, TRAM_Z + 1, 20, 3)],
      },
      {
        kind: 'paintZone',
        zone: ZoneType.Industrial,
        tiles: rows(AVENUE_X + 1, TRAM_Z - 4, 20, 4),
      },
      {
        kind: 'createTransitLine',
        line: {
          id: 0,
          stops: [
            { x: 72, z: TRAM_Z },
            { x: 108, z: TRAM_Z },
          ],
          color: 0x3cb45a,
          mode: 'tram',
        },
      },
    ]);
    h.ticks(1500);
    return h;
  }

  const riders = (h: Harness): number => h.lastSnapshot()!.transit!.ridership[0]!;

  it('runs the tram straight over the avenue, and it carries riders', () => {
    const h = crossedTown();
    expect(riders(h)).toBeGreaterThan(0);
  });

  it('leaves the crossing the avenue’s own road', () => {
    const h = crossedTown();
    h.sim.handleMessage({ type: 'requestSave' });
    expect(latestSaveGrid(h).roadTier[tileIndex(AVENUE_X, TRAM_Z)]).toBe(RoadTier.Avenue);
  });
});
