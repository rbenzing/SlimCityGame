import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../app/persist';
import { BuildingState, RoadTier, ZoneType } from '../shared/types';
import {
  catalog,
  latestSaveData,
  roadRow,
  run,
  sandboxed,
  standingBuildings,
} from '../../tests/support/sim';

describe('the bulldozer on an abandoned zoned building', () => {
  it('clears the building and leaves its lot free to be built on again', () => {
    const entry = catalog.find((e) => e.zone === ZoneType.ResLow)!;
    const h = sandboxed();
    let seq = 500;
    const street = roadRow(100, 100, 12);
    expect(run(h, ++seq, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: street }]).ok).toBe(
      true,
    );
    const place = {
      kind: 'placeBuilding',
      catalogId: entry.id,
      x: 104,
      z: 101,
      rotation: 2,
      restore: true,
    } as const;
    expect(run(h, ++seq, [place]).ok).toBe(true);

    // Abandon it the way a save holds it, then load that city.
    h.sim.handleMessage({ type: 'requestSave' });
    const payload = decodeSave(latestSaveData(h));
    for (const b of payload.meta.registry.buildings) b.state = BuildingState.Abandoned;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    h.ticks(2);
    const before = [...standingBuildings(h).values()].filter((b) => b.catalogId === entry.id);
    expect(before.length).toBeGreaterThan(0);

    const cleared = run(h, ++seq, [{ kind: 'bulldoze', tiles: [{ x: 104, z: 101 }] }]);
    expect(cleared.ok).toBe(true);
    h.ticks(2);
    expect([...standingBuildings(h).values()].some((b) => b.catalogId === entry.id)).toBe(false);

    expect(run(h, seq + 1, [place]).ok).toBe(true);
  });
});
