/**
 * Contract additions: selection protocol, tool flags, cursor chips, infoview
 * lens union, night-cycle constants.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed constant values.
 */
import { describe, expect, it } from 'vitest';

import {
  BuildingState,
  FIELD_COUNT,
  FieldId,
  type BuildingCatalogEntry,
  type CursorChip,
  type LensId,
  type MainToWorker,
  type SelectionInfo,
  type ToolFlags,
  type WorkerToMain,
} from './types';
import {
  LAMP_SPACING_TILES,
  NIGHT_WINDOW_LIT_MAX,
  NIGHT_WINDOW_LIT_MIN,
  SEWAGE_POLLUTION_PER_KL,
  SEWAGE_RETURN_FRACTION,
  TICKS_PER_DAY,
  TICK_RATE,
  VISUAL_DAY_TICKS,
} from './constants';
import catalogData from '../data/catalog.json';

describe('night-cycle constants (UI-SPEC §6.5)', () => {
  it('VISUAL_DAY_TICKS is 2400 — ~2 min per full cycle at 1×', () => {
    expect(VISUAL_DAY_TICKS).toBe(2400);
    expect(VISUAL_DAY_TICKS / TICK_RATE).toBe(120); // seconds of real time
  });

  it('is decoupled from the calendar day (TICKS_PER_DAY would strobe)', () => {
    expect(VISUAL_DAY_TICKS).not.toBe(TICKS_PER_DAY);
    expect(VISUAL_DAY_TICKS).toBeGreaterThan(TICKS_PER_DAY);
  });

  it('lamps sit on every 2nd road tile — a pole every 40 m, as real streets run', () => {
    expect(LAMP_SPACING_TILES).toBe(2);
  });

  it('lit-window band is 40–70%, a valid sub-range of 0..1', () => {
    expect(NIGHT_WINDOW_LIT_MIN).toBe(0.4);
    expect(NIGHT_WINDOW_LIT_MAX).toBe(0.7);
    expect(NIGHT_WINDOW_LIT_MIN).toBeLessThan(NIGHT_WINDOW_LIT_MAX);
    expect(NIGHT_WINDOW_LIT_MIN).toBeGreaterThan(0);
    expect(NIGHT_WINDOW_LIT_MAX).toBeLessThan(1);
  });
});

describe('SelectionInfo (UI-SPEC §7)', () => {
  const grownHome: SelectionInfo = {
    building: {
      id: 42,
      catalogId: 'res-low-1',
      x: 10,
      z: 12,
      rotation: 0,
      level: 2,
      state: BuildingState.Active,
      problems: 0,
    },
    happiness: 68,
    monthlyTax: 120,
    monthlyUpkeep: 0,
    occupancy: { residents: 7, households: { occupied: 2, capacity: 2 } },
  };

  const shop: SelectionInfo = {
    building: {
      id: 43,
      catalogId: 'com-low-1',
      x: 11,
      z: 12,
      rotation: 1,
      level: 1,
      state: BuildingState.Constructing,
      problems: 0,
    },
    happiness: 50,
    monthlyTax: 0,
    monthlyUpkeep: 0,
    occupancy: { jobs: 6 },
  };

  const plopped: SelectionInfo = {
    building: {
      id: 44,
      catalogId: 'police-station',
      x: 20,
      z: 20,
      rotation: 2,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    },
    happiness: 55,
    monthlyTax: 0,
    monthlyUpkeep: 400,
    occupancy: {}, // services/utilities: every occupancy row is optional
  };

  it('carries the panel rows: building, happiness, tax, upkeep, occupancy', () => {
    expect(grownHome.building.id).toBe(42);
    expect(grownHome.happiness).toBe(68);
    expect(grownHome.monthlyTax).toBe(120);
    expect(grownHome.occupancy.households).toEqual({ occupied: 2, capacity: 2 });
    expect(grownHome.occupancy.residents).toBe(7);
    expect(shop.occupancy.jobs).toBe(6);
    expect(shop.occupancy.residents).toBeUndefined();
    expect(plopped.monthlyUpkeep).toBe(400);
    expect(plopped.occupancy).toEqual({});
  });
});

describe('selection worker protocol', () => {
  /** Narrowing must expose buildingId only on 'select'. */
  const describeMain = (msg: MainToWorker): string => {
    switch (msg.type) {
      case 'select':
        return `select:${msg.buildingId}`;
      case 'clearSelect':
        return 'clearSelect';
      default:
        return msg.type;
    }
  };

  const selectionOf = (msg: WorkerToMain): SelectionInfo | null | 'other' =>
    msg.type === 'selection' ? msg.info : 'other';

  it('MainToWorker gains select / clearSelect', () => {
    expect(describeMain({ type: 'select', buildingId: 42 })).toBe('select:42');
    expect(describeMain({ type: 'clearSelect' })).toBe('clearSelect');
    expect(describeMain({ type: 'requestSave' })).toBe('requestSave');
  });

  it('WorkerToMain gains selection with info: SelectionInfo | null', () => {
    expect(selectionOf({ type: 'selection', info: null })).toBeNull();
    expect(selectionOf({ type: 'ready' })).toBe('other');
  });
});

describe('ToolFlags (UI-SPEC §5)', () => {
  it('exposes exactly the real ToolManager flags', () => {
    const flags: ToolFlags = {
      angleLock: false,
      straightMode: true,
      gridMode: false,
      guideSnap: false,
      roadSnap: true,
      replaceRoad: false,
    };
    expect(Object.keys(flags).sort()).toEqual([
      'angleLock',
      'gridMode',
      'guideSnap',
      'replaceRoad',
      'roadSnap',
      'straightMode',
    ]);
    // Every flag is a required boolean — a partial object is not a ToolFlags,
    // even though setFlags MERGES one over what is already set.
    // @ts-expect-error straightMode missing
    const partial: ToolFlags = { angleLock: true };
    expect(partial.straightMode).toBeUndefined();
  });
});

describe('CursorChip (UI-SPEC §6)', () => {
  it('cost is required; length + invalid reason are optional lines', () => {
    const zoneChip: CursorChip = { cost: 0 };
    const roadChip: CursorChip = { cost: 202, lengthMeters: 137 };
    const badChip: CursorChip = {
      cost: 202,
      lengthMeters: 137,
      invalidReason: 'Overlapping items',
    };
    expect(zoneChip.lengthMeters).toBeUndefined();
    expect(roadChip.lengthMeters).toBe(137);
    expect(badChip.invalidReason).toBe('Overlapping items');
  });
});

describe('LensId (infoview lens union)', () => {
  const acceptLens = (lens: LensId): LensId => lens;

  it('accepts every FieldId plus the power/watered/sewered coverage channels', () => {
    const lenses: LensId[] = [
      FieldId.LandValue,
      FieldId.Pollution,
      FieldId.Noise,
      FieldId.Traffic,
      FieldId.Crime,
      FieldId.FireRisk,
      FieldId.Education,
      FieldId.Health,
      FieldId.Happiness,
      'power',
      'watered',
      'sewered',
    ];
    expect(lenses).toHaveLength(FIELD_COUNT + 3);
    expect(acceptLens('power')).toBe('power');
    expect(acceptLens(FieldId.Happiness)).toBe(FieldId.Happiness);
    // 'zones' is a snapshot channel, not a lens.
    // @ts-expect-error not part of LensId
    expect(() => acceptLens('zones')).not.toThrow();
  });
});

describe('the water utilities (water-and-sewage): every figure derived', () => {
  const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  const GAL_TO_KL = 0.003785;
  /** The smallest class of surface intake, outfall and lift station: one million gallons a day. */
  const ONE_MGD_KL = 1_000_000 * GAL_TO_KL;
  /** A standard 100,000-gallon elevated tank, turned over once a day as the storage rule sizes it. */
  const TANK_GAL = 100_000;
  /** kWh per million gallons: a groundwater system, and a surface-water one (EPA). */
  const GROUNDWATER_KWH_PER_MG = 1_800;
  const SURFACE_KWH_PER_MG = 1_500;
  const HOURS_PER_DAY = 24;
  /** Raw sewage's oxygen demand, lb a year per kL a day, on the coal plant's scale. */
  const SEWAGE_LB_PER_YEAR_PER_KL_DAY = 161;
  const POLLUTION_PER_LB = 140 / 484_000;

  it('rates the water tower as a 100,000-gallon tank and powers its borehole pumps', () => {
    const tower = byId('water-tower');
    expect(tower.utility?.waterKL).toBeCloseTo(TANK_GAL * GAL_TO_KL, 9);
    const kw = ((TANK_GAL / 1_000_000) * GROUNDWATER_KWH_PER_MG) / HOURS_PER_DAY;
    expect(Math.abs(tower.powerUse - kw / 1000)).toBeLessThanOrEqual(0.0003);
    expect(tower.requiresAdjacent).toBeUndefined();
  });

  it('rates the pumping station and the drain pipe at the one-million-gallon class, on a shore', () => {
    const pump = byId('water-pump');
    const drain = byId('water-drain');
    expect(pump.utility?.waterKL).toBe(ONE_MGD_KL);
    expect(drain.utility?.sewerKL).toBe(ONE_MGD_KL);
    expect(pump.requiresAdjacent).toBe('water');
    expect(drain.requiresAdjacent).toBe('water');
    const kw = (1 * SURFACE_KWH_PER_MG) / HOURS_PER_DAY;
    expect(Math.abs(pump.powerUse - kw / 1000)).toBeLessThanOrEqual(0.0003);
    expect(drain.powerUse).toBe(0);
    // The station waits for a Small Town; a drain is wanted from the first day.
    expect(pump.unlockMilestone).toBe(1);
    expect(drain.unlockMilestone).toBe(0);
  });

  it("fouls the ground at a raw outfall by its sewage's oxygen demand, on the coal plant's scale", () => {
    const drain = byId('water-drain');
    const expected = Math.round(ONE_MGD_KL * SEWAGE_LB_PER_YEAR_PER_KL_DAY * POLLUTION_PER_LB);
    expect(drain.pollution).toBe(expected);
    expect(SEWAGE_POLLUTION_PER_KL).toBeCloseTo(
      SEWAGE_LB_PER_YEAR_PER_KL_DAY * POLLUTION_PER_LB,
      12,
    );
  });

  it('returns 88% of the water drawn as sewage: what public supply does not consume', () => {
    expect(SEWAGE_RETURN_FRACTION).toBe(1 - 0.12);
  });
});
