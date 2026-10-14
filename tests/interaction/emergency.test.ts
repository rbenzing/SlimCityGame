import { describe, expect, it } from 'vitest';
import { MILESTONES, tileIndex } from '../../src/shared/constants';
import { decodeSave, encodeSave } from '../../src/app/persist';
import {
  entryOf,
  initialized,
  initializedAtMilestone,
  latestSaveData,
  latestSaveGrid,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const SMALL_CITY = MILESTONES.findIndex((m) => m.name === 'Small City');

describe('the station ladder, in play', () => {
  it('loads a save made with 2×2 fire and police stations with their ids, tiles and rotation unchanged', () => {
    const before = initializedAtMilestone(1);
    expect(
      run(before, 1, [
        { kind: 'placeBuilding', catalogId: 'fire-station', x: 60, z: 60, rotation: 1 },
        { kind: 'placeBuilding', catalogId: 'police-station', x: 70, z: 60, rotation: 3 },
      ]).ok,
    ).toBe(true);
    before.sim.handleMessage({ type: 'requestSave' });
    const saved = new Map(
      [...standingBuildings(before).values()].map((b) => [b.catalogId, b] as const),
    );
    const fire = saved.get('fire-station')!;
    const police = saved.get('police-station')!;

    // The save is what an older build wrote: the same bytes, loaded into a fresh sim.
    const payload = decodeSave(latestSaveData(before));
    const after: Harness = initialized();
    after.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    after.ticks(2);
    after.sim.handleMessage({ type: 'requestSave' });

    const loaded = new Map(
      [...standingBuildings(after).values()].map((b) => [b.catalogId, b] as const),
    );
    for (const [was, rotation] of [
      [fire, 1],
      [police, 3],
    ] as const) {
      const now = loaded.get(was.catalogId)!;
      expect(now).toMatchObject({
        id: was.id,
        catalogId: was.catalogId,
        x: was.x,
        z: was.z,
        rotation,
      });
      expect(entryOf(now).footprint).toEqual({ w: 2, d: 2 });
      const grid = latestSaveGrid(after);
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        expect(grid.buildingId[tileIndex(now.x + dx, now.z + dz)]).toBe(now.id);
      }
    }
  });

  it('opens the district stations at Small City and not before', () => {
    expect(SMALL_CITY).toBeGreaterThan(0);
    for (const catalogId of ['fire-station-district', 'police-station-district']) {
      const early = initializedAtMilestone(SMALL_CITY - 1);
      expect(
        run(early, 1, [{ kind: 'placeBuilding', catalogId, x: 60, z: 60, rotation: 0 }]),
      ).toMatchObject({ ok: false, reason: 'locked' });

      const open = initializedAtMilestone(SMALL_CITY);
      expect(
        run(open, 1, [{ kind: 'placeBuilding', catalogId, x: 60, z: 60, rotation: 0 }]).ok,
      ).toBe(true);
    }
  });
});
