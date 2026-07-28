import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TAX_RATE, START_FUNDS, TICKS_PER_MONTH } from '../shared/constants';
import { BuildingState, FieldId } from '../shared/types';
import type { SelectionInfo } from '../shared/types';
import { DEFAULT_BRUSH_SETTINGS } from '../tools/tools';
import { createInitialStats, useCityStore } from './store';
import { resetCityStore } from './test-helpers';

beforeEach(() => {
  resetCityStore();
});

describe('useCityStore initial state', () => {
  it('has a sane CityStats with starting funds and zeroed everything else', () => {
    const { stats } = useCityStore.getState();
    expect(stats.funds).toBe(START_FUNDS);
    expect(stats.tick).toBe(0);
    expect(stats.population).toBe(0);
    expect(stats.jobs).toBe(0);
    expect(stats.employed).toBe(0);
    expect(stats.demand).toEqual({ res: 0, com: 0, ind: 0 });
    expect(stats.milestoneLevel).toBe(0);
    expect(stats.milestoneProgress).toBe(0);
    expect(stats.loanBalance).toBe(0);
    expect(stats.taxRates).toEqual({
      res: DEFAULT_TAX_RATE,
      com: DEFAULT_TAX_RATE,
      ind: DEFAULT_TAX_RATE,
    });
  });

  it('defaults tool/overlay/speed/notifications/undo state sanely', () => {
    const s = useCityStore.getState();
    expect(s.selectedTool).toBe('select');
    expect(s.overlay).toBeNull();
    expect(s.speed).toBe(1);
    expect(s.notifications).toEqual([]);
    expect(s.preview).toBeNull();
    expect(s.selectedBuilding).toBeNull();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });

  it('defaults the wave-2 tool-options/trend/selection fields sanely', () => {
    const s = useCityStore.getState();
    expect(s.toolMode).toBe('lpath');
    expect(s.toolFlags).toEqual({ angleLock: false, straightMode: false });
    expect(s.previousMonthPopulation).toBe(0);
    expect(s.previousMonthFunds).toBe(START_FUNDS);
    expect(s.selectionInfo).toBeNull();
  });

  it('defaults brushSettings to DEFAULT_BRUSH_SETTINGS (UI-SPEC §6.11)', () => {
    expect(useCityStore.getState().brushSettings).toEqual(DEFAULT_BRUSH_SETTINGS);
  });
});

describe('applySnapshotStats', () => {
  it('replaces stats wholesale', () => {
    const next = { ...createInitialStats(), population: 500, funds: 12_345 };
    useCityStore.getState().applySnapshotStats(next);
    expect(useCityStore.getState().stats).toEqual(next);
  });

  it('does not touch previousMonth* while the tick stays within the same month', () => {
    useCityStore
      .getState()
      .applySnapshotStats({ ...createInitialStats(), tick: 50, population: 10, funds: 48_000 });
    useCityStore
      .getState()
      .applySnapshotStats({ ...createInitialStats(), tick: 150, population: 40, funds: 49_500 });
    expect(useCityStore.getState().previousMonthPopulation).toBe(0);
    expect(useCityStore.getState().previousMonthFunds).toBe(START_FUNDS);
    expect(useCityStore.getState().stats.population).toBe(40);
  });

  it('snapshots the prior population/funds once the tick crosses into a new month', () => {
    useCityStore
      .getState()
      .applySnapshotStats({ ...createInitialStats(), tick: 100, population: 50, funds: 48_000 });
    useCityStore.getState().applySnapshotStats({
      ...createInitialStats(),
      tick: TICKS_PER_MONTH + 10,
      population: 500,
      funds: 60_000,
    });
    expect(useCityStore.getState().previousMonthPopulation).toBe(50);
    expect(useCityStore.getState().previousMonthFunds).toBe(48_000);
    expect(useCityStore.getState().stats.population).toBe(500);
  });

  it('does not roll over on a backward tick jump (e.g. a fresh load)', () => {
    useCityStore
      .getState()
      .applySnapshotStats({ ...createInitialStats(), tick: TICKS_PER_MONTH + 10, population: 500 });
    useCityStore.getState().applySnapshotStats({ ...createInitialStats(), tick: 5, population: 0 });
    expect(useCityStore.getState().previousMonthPopulation).toBe(0);
  });
});

describe('setTool / setOverlay', () => {
  it('setTool updates selectedTool', () => {
    useCityStore.getState().setTool('road.two');
    expect(useCityStore.getState().selectedTool).toBe('road.two');
    useCityStore.getState().setTool('plop.police-station');
    expect(useCityStore.getState().selectedTool).toBe('plop.police-station');
  });

  it('setOverlay sets and clears the overlay lens', () => {
    useCityStore.getState().setOverlay(3);
    expect(useCityStore.getState().overlay).toBe(3);
    useCityStore.getState().setOverlay(null);
    expect(useCityStore.getState().overlay).toBeNull();
  });

  it('setOverlay accepts the widened LensId (power/watered) alongside FieldId', () => {
    useCityStore.getState().setOverlay('power');
    expect(useCityStore.getState().overlay).toBe('power');
    useCityStore.getState().setOverlay('watered');
    expect(useCityStore.getState().overlay).toBe('watered');
    useCityStore.getState().setOverlay(FieldId.Traffic);
    expect(useCityStore.getState().overlay).toBe(FieldId.Traffic);
  });
});

describe('tool flags + mode (UI-SPEC §5)', () => {
  it('setToolFlags merges a partial patch, leaving other flags untouched', () => {
    useCityStore.getState().setToolFlags({ angleLock: true });
    expect(useCityStore.getState().toolFlags).toEqual({ angleLock: true, straightMode: false });
  });

  it('setToolMode updates toolMode and mirrors the straightMode contract flag', () => {
    useCityStore.getState().setToolMode('straight');
    expect(useCityStore.getState().toolMode).toBe('straight');
    expect(useCityStore.getState().toolFlags.straightMode).toBe(true);

    useCityStore.getState().setToolMode('lpath');
    expect(useCityStore.getState().toolMode).toBe('lpath');
    expect(useCityStore.getState().toolFlags.straightMode).toBe(false);
  });

  it('setToolMode and setToolFlags are independent of one another', () => {
    useCityStore.getState().setToolFlags({ angleLock: true });
    useCityStore.getState().setToolMode('straight');
    expect(useCityStore.getState().toolFlags).toEqual({ angleLock: true, straightMode: true });

    useCityStore.getState().setToolFlags({ angleLock: false });
    expect(useCityStore.getState().toolMode).toBe('straight');
    expect(useCityStore.getState().toolFlags).toEqual({ angleLock: false, straightMode: true });
  });
});

describe('brushSettings (UI-SPEC §6.11 Brush radius / Strength rows)', () => {
  it('setBrushSettings merges a partial patch, leaving the other field untouched', () => {
    useCityStore.getState().setBrushSettings({ radius: 6 });
    expect(useCityStore.getState().brushSettings).toEqual({ ...DEFAULT_BRUSH_SETTINGS, radius: 6 });

    useCityStore.getState().setBrushSettings({ strength: 5 });
    expect(useCityStore.getState().brushSettings).toEqual({ radius: 6, strength: 5 });
  });

  it('setting radius does not disturb strength and vice versa across repeated calls', () => {
    useCityStore.getState().setBrushSettings({ strength: 1 });
    useCityStore.getState().setBrushSettings({ radius: 16 });
    useCityStore.getState().setBrushSettings({ radius: 2 });
    expect(useCityStore.getState().brushSettings).toEqual({ radius: 2, strength: 1 });
  });
});

describe('setSpeed', () => {
  it('updates local speed state and forwards to the bound worker bridge', () => {
    const setSpeedMock = vi.fn();
    useCityStore.getState().bindActions({
      sendCommands: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      setSpeed: setSpeedMock,
      togglePhoto: vi.fn(),
    });
    useCityStore.getState().setSpeed(2);
    expect(useCityStore.getState().speed).toBe(2);
    expect(setSpeedMock).toHaveBeenCalledWith(2);
  });

  it('is safe to call before bindActions has ever run', () => {
    expect(() => useCityStore.getState().setSpeed(4)).not.toThrow();
    expect(useCityStore.getState().speed).toBe(4);
  });
});

describe('notifications', () => {
  it('pushNotification appends new notifications', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 1, severity: 'info', title: 'Hello', body: 'World', tick: 10 });
    expect(useCityStore.getState().notifications).toHaveLength(1);
    expect(useCityStore.getState().notifications[0]?.title).toBe('Hello');
  });

  it('caps stored notifications at 50, dropping the oldest first', () => {
    for (let i = 0; i < 55; i++) {
      useCityStore
        .getState()
        .pushNotification({ id: i, severity: 'info', title: `t${i}`, body: 'b', tick: i });
    }
    const { notifications } = useCityStore.getState();
    expect(notifications).toHaveLength(50);
    expect(notifications[0]?.id).toBe(5);
    expect(notifications.at(-1)?.id).toBe(54);
  });

  it('dismissNotification removes only the matching id', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 1, severity: 'info', title: 'a', body: 'b', tick: 0 });
    useCityStore
      .getState()
      .pushNotification({ id: 2, severity: 'warning', title: 'a', body: 'b', tick: 0 });
    useCityStore.getState().dismissNotification(1);
    expect(useCityStore.getState().notifications.map((n) => n.id)).toEqual([2]);
  });
});

describe('selectedBuilding', () => {
  it('sets and clears the selected building', () => {
    const building = {
      id: 7,
      catalogId: 'res-low-1',
      x: 2,
      z: 3,
      rotation: 0 as const,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    };
    useCityStore.getState().setSelectedBuilding(building);
    expect(useCityStore.getState().selectedBuilding).toEqual(building);
    useCityStore.getState().setSelectedBuilding(null);
    expect(useCityStore.getState().selectedBuilding).toBeNull();
  });
});

describe('selectionInfo', () => {
  it('defaults to null and can be set/cleared independently of selectedBuilding', () => {
    const info: SelectionInfo = {
      building: {
        id: 7,
        catalogId: 'res-low-1',
        x: 2,
        z: 3,
        rotation: 0,
        level: 1,
        state: BuildingState.Active,
        problems: 0,
      },
      happiness: 82,
      monthlyTax: 120,
      monthlyUpkeep: 0,
      occupancy: { residents: 4, households: { occupied: 1, capacity: 1 } },
    };
    useCityStore.getState().setSelectionInfo(info);
    expect(useCityStore.getState().selectionInfo).toEqual(info);
    useCityStore.getState().setSelectionInfo(null);
    expect(useCityStore.getState().selectionInfo).toBeNull();
  });
});

describe('undo state + preview', () => {
  it('setUndoState updates both flags independently', () => {
    useCityStore.getState().setUndoState(true, false);
    expect(useCityStore.getState().canUndo).toBe(true);
    expect(useCityStore.getState().canRedo).toBe(false);
    useCityStore.getState().setUndoState(false, true);
    expect(useCityStore.getState().canUndo).toBe(false);
    expect(useCityStore.getState().canRedo).toBe(true);
  });

  it('setPreview sets and clears the cost readout', () => {
    useCityStore.getState().setPreview({ cost: 120, label: 'Two-Lane Road', valid: true });
    expect(useCityStore.getState().preview).toEqual({
      cost: 120,
      label: 'Two-Lane Road',
      valid: true,
    });
    useCityStore.getState().setPreview(null);
    expect(useCityStore.getState().preview).toBeNull();
  });
});

describe('bindActions', () => {
  it('stores the dispatch bridge so bound.* calls reach the injected functions', () => {
    const sendCommands = vi.fn();
    const undo = vi.fn();
    const redo = vi.fn();
    const setSpeed = vi.fn();
    useCityStore
      .getState()
      .bindActions({ sendCommands, undo, redo, setSpeed, togglePhoto: vi.fn() });
    const { bound } = useCityStore.getState();
    bound?.sendCommands('Bulldoze', []);
    bound?.undo();
    bound?.redo();
    expect(sendCommands).toHaveBeenCalledWith('Bulldoze', []);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });
});
