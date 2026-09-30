import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { RoadTier, ZoneType } from '../../src/shared/types';
import type { Harness } from '../support/sim';
import {
  column,
  GROWTH_TIMEOUT_MS,
  initialized,
  latestSaveGrid,
  roadRow,
  rows,
  run,
  sixLaneCommands,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('a tramway crossing another street', () => {
  const AVENUE_X = 90;
  const TRAM_Z = 85;

  /**
   * An avenue with homes and power, and a tramway drawn across it afterwards —
   * so the crossing tiles are the avenue's — with a tram line from one side of
   * it to the other. `sixLane` lays the avenue as two carriageways, in columns
   * 90 and 91.
   */
  function crossedTown(sixLane = false): Harness {
    const h = initialized();
    run(h, 1, [
      { kind: 'setSandbox', on: true },
      { kind: 'setUnlimitedMoney', on: true },
    ]);
    const avenue = column(AVENUE_X, 60, 50);
    const laid = run(
      h,
      2,
      sixLane
        ? sixLaneCommands(avenue)
        : [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: avenue }],
    );
    expect(laid.ok).toBe(true);
    const tramway = roadRow(70, TRAM_Z, 41);
    expect(run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.Tram, tiles: tramway }]).ok).toBe(true);
    run(h, 4, [
      { kind: 'placeBuilding', catalogId: 'wind-turbine', x: AVENUE_X - 1, z: 60, rotation: 0 },
      { kind: 'placeBuilding', catalogId: 'water-tower', x: AVENUE_X - 2, z: 61, rotation: 0 },
      {
        kind: 'paintZone',
        zone: ZoneType.ResLow,
        tiles: [...rows(70, TRAM_Z + 1, 20, 3), ...rows(AVENUE_X + 2, TRAM_Z + 1, 20, 3)],
      },
      {
        kind: 'paintZone',
        zone: ZoneType.Industrial,
        tiles: rows(AVENUE_X + 2, TRAM_Z - 4, 20, 4),
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

  it(
    'runs the tram straight over the avenue, carrying riders, and leaves the crossing the avenue’s',
    () => {
      const h = crossedTown();
      expect(riders(h)).toBeGreaterThan(0);
      h.sim.handleMessage({ type: 'requestSave' });
      expect(latestSaveGrid(h).roadTier[tileIndex(AVENUE_X, TRAM_Z)]).toBe(RoadTier.Avenue);
    },
    GROWTH_TIMEOUT_MS,
  );

  it(
    'runs over a six-lane avenue too, through the median it opens',
    () => {
      const h = crossedTown(true);
      expect(riders(h)).toBeGreaterThan(0);
      h.sim.handleMessage({ type: 'requestSave' });
      const g = latestSaveGrid(h);
      for (const x of [AVENUE_X, AVENUE_X + 1]) {
        expect(g.roadTier[tileIndex(x, TRAM_Z)]).toBe(RoadTier.Avenue);
      }
    },
    GROWTH_TIMEOUT_MS,
  );
});
