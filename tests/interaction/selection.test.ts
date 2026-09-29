import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkerToMain } from '../../src/shared/types';
import { initialized, send, windTurbine, type Harness } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

describe('selection: what the panel is told about a building', () => {
  let h: Harness;
  beforeEach(() => {
    h = initialized();
  });

  const selectionMessages = () =>
    h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'selection' }> => m.type === 'selection',
    );

  /** Places a wind turbine and returns its instance id from the snapshot delta. */
  function placeTurbine(): number {
    send(h, 100, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    h.ticks(2);
    const withBuildings = h.messages.find(
      (m): m is Extract<WorkerToMain, { type: 'snapshot' }> =>
        m.type === 'snapshot' && m.snap.buildings !== undefined,
    );
    expect(withBuildings).toBeDefined();
    const inst = withBuildings!.snap.buildings!.added.find((b) => b.catalogId === 'wind-turbine');
    expect(inst).toBeDefined();
    return inst!.id;
  }

  it('responds to select with a SelectionInfo payload for the building', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });

    const msgs = selectionMessages();
    expect(msgs.length).toBe(1);
    const info = msgs[0]!.info;
    expect(info).not.toBeNull();
    expect(info!.building.id).toBe(id);
    expect(info!.building.catalogId).toBe('wind-turbine');
    // Utility ploppable: upkeep from the catalog, no tax, no occupancy rows.
    expect(info!.monthlyUpkeep).toBe(windTurbine.upkeep);
    expect(info!.monthlyTax).toBe(0);
    expect(info!.occupancy).toEqual({});
    // Not a capped facility, so it carries no load figure at all.
    expect(info!.serviceLoad).toBeUndefined();
    expect(info!.happiness).toBeGreaterThanOrEqual(0);
    expect(info!.happiness).toBeLessThanOrEqual(100);
  });

  it('re-pushes the selection on every snapshot while the selection is held', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });
    const before = selectionMessages().length;
    h.ticks(4); // 2 snapshots at SNAPSHOT_TICKS=2
    expect(selectionMessages().length).toBe(before + 2);
  });

  it('clearSelect ends the stream', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });
    h.sim.handleMessage({ type: 'clearSelect' });
    const before = selectionMessages().length;
    h.ticks(6);
    expect(selectionMessages().length).toBe(before);
  });

  it('answers select of an unknown building with info: null and stops', () => {
    h.sim.handleMessage({ type: 'select', buildingId: 424242 });
    const msgs = selectionMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.info).toBeNull();
    h.ticks(4);
    expect(selectionMessages().length).toBe(1);
  });

  it('pushes info: null when the selected building is demolished', () => {
    const id = placeTurbine();
    h.sim.handleMessage({ type: 'select', buildingId: id });
    send(h, 101, [{ kind: 'bulldoze', tiles: [{ x: 60, z: 60 }] }]);
    h.ticks(2);

    const msgs = selectionMessages();
    expect(msgs[msgs.length - 1]!.info).toBeNull();
    // The stream ends after the null: no further pushes.
    const count = msgs.length;
    h.ticks(4);
    expect(selectionMessages().length).toBe(count);
  });
});
