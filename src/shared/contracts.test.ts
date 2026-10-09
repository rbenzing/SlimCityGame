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
  MILESTONES,
  NIGHT_WINDOW_LIT_MAX,
  NIGHT_WINDOW_LIT_MIN,
  SEWAGE_POLLUTION_PER_KL,
  SEWAGE_RETURN_FRACTION,
  SEWER_MILESTONE,
  TICKS_PER_DAY,
  TICK_RATE,
  TILE_METERS,
  VISUAL_DAY_TICKS,
  WATER_FOUL_PER_KL,
  WATER_FOUL_REACH_TILES,
} from './constants';
import catalogData from '../data/catalog.json';
import { averageOutputMW } from './power';

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
    // The station waits for a Small Town. A town is on septic tanks until it
    // is a Big Town, past the Census' old urban line of 2,500 people, and the
    // drain and the works unlock the rung before, so the player has one
    // milestone's warning.
    expect(pump.unlockMilestone).toBe(1);
    expect(MILESTONES[SEWER_MILESTONE]).toMatchObject({ name: 'Big Town', population: 3_500 });
    expect(MILESTONES[SEWER_MILESTONE - 1]!.population).toBeLessThan(2_500);
    expect(drain.unlockMilestone).toBe(SEWER_MILESTONE - 1);
    expect(byId('sewage-works').unlockMilestone).toBe(SEWER_MILESTONE - 1);
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

  it('rates the treatment works as a drain of the same class whose effluent meets the secondary standard', () => {
    const drain = byId('water-drain');
    const works = byId('sewage-works');
    /** 40 CFR 133.102: 30 mg/L out against 200 mg/L in. */
    const SECONDARY_EFFLUENT_MG_L = 30;
    const RAW_SEWAGE_MG_L = 200;
    /** EPRI: an activated-sludge plant of the one-million-gallon class draws 2,236 kWh per million gallons. */
    const ACTIVATED_SLUDGE_KWH_PER_MG = 2_236;
    expect(works.utility?.sewerKL).toBe(drain.utility?.sewerKL);
    expect(works.utility?.effluent).toBeCloseTo(SECONDARY_EFFLUENT_MG_L / RAW_SEWAGE_MG_L, 9);
    expect(works.pollution).toBe(Math.round(drain.pollution! * works.utility!.effluent!));
    const kw = (1 * ACTIVATED_SLUDGE_KWH_PER_MG) / HOURS_PER_DAY;
    expect(Math.abs(works.powerUse - kw / 1000)).toBeLessThanOrEqual(0.0003);
    expect(works.requiresAdjacent).toBe('water');
    expect(works.unlockMilestone).toBe(2);
    // The programme's ladder dial: the works costs five times the drain it replaces.
    expect(works.cost).toBe(5 * drain.cost);
    expect(works.footprint).toEqual({ w: 2, d: 2 });
  });

  it('fouls the water to saturation at a full raw outfall, fading over 500 m', () => {
    expect(WATER_FOUL_PER_KL).toBeCloseTo(255 / ONE_MGD_KL, 9);
    expect(WATER_FOUL_REACH_TILES * TILE_METERS).toBe(500);
  });
});

describe('the civic ploppables (honest both sides): every draw from floor area and a surveyed intensity', () => {
  const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  /** civic-massing: one tile of footprint is a 185 m² plate, a storey 3.2 m. */
  const PLATE_M2_PER_TILE = 185;
  const STOREY_M = 3.2;
  const SQFT_PER_M2 = 10.7639;
  const HOURS_PER_YEAR = 8_760;
  const DAYS_PER_YEAR = 365;
  const KL_PER_GAL = 0.003785;
  /** CBECS 2018 Table C14: electricity, kWh per square foot a year, by principal building activity. */
  const CBECS_KWH_PER_SF = {
    publicOrderSafety: 13.9,
    outpatient: 17.4,
    inpatient: 28.8,
    education: 9.4,
  };
  /** A transport terminal: ENERGY STAR's 56.2 kBtu/sf site median, electricity at public assembly's 51% share, in kWh. */
  const TERMINAL_KWH_PER_SF = (56.2 * (12.1 / (81.1 / 3.412))) / 3.412;
  /** EPA WaterSense at Work and ENERGY STAR Portfolio Manager (CY2019): median water use, gallons per square foot a year. */
  const WATERSENSE_GAL_PER_SF = {
    office: 14.48,
    fireStation: 28.9,
    medicalOffice: 23.4,
    hospital: 55.71,
    school: 10.84,
  };
  /** A floor the building's plan states rather than the massing rule's: the hospital's 72 beds at 2,500 sf a bed. */
  const STATED_FLOOR_SQFT: Readonly<Record<string, number>> = { hospital: 72 * 2_500 };
  /** One regional terminal's floor per yearly enplanement, passengers at twice that, 4.2 gallons each. */
  const TERMINAL_SF_PER_ENPLANEMENT = 125_000 / 600_000;
  const GAL_PER_PASSENGER = 4.2;
  /** The tonnes a day the incinerator burns, and a plant's own use of the power it could make. */
  const SMALL_COMBUSTOR_TONS_PER_DAY = 450;
  const COMBUSTOR_KWH_PER_TON = 63;

  const floorSqft = (e: BuildingCatalogEntry): number =>
    STATED_FLOOR_SQFT[e.id] ??
    e.footprint.w * e.footprint.d * PLATE_M2_PER_TILE * (e.height / STOREY_M) * SQFT_PER_M2;
  const mwFrom = (sqft: number, kwhPerSf: number): number =>
    (sqft * kwhPerSf) / HOURS_PER_YEAR / 1000;
  const klFrom = (sqft: number, galPerSfYear: number): number =>
    ((sqft * galPerSfYear) / DAYS_PER_YEAR) * KL_PER_GAL;
  const close = (got: number, want: number, places: number): void =>
    expect(Math.abs(got - want)).toBeLessThanOrEqual(0.5 * 10 ** -places + 1e-12);

  it('draws what a station of its floor area draws: police and fire, clinic, hospital, school, rail station', () => {
    for (const [id, kwh, gal, mwPlaces, klPlaces] of [
      ['police-station', CBECS_KWH_PER_SF.publicOrderSafety, WATERSENSE_GAL_PER_SF.office, 4, 1],
      ['fire-station', CBECS_KWH_PER_SF.publicOrderSafety, WATERSENSE_GAL_PER_SF.fireStation, 4, 0],
      ['clinic', CBECS_KWH_PER_SF.outpatient, WATERSENSE_GAL_PER_SF.medicalOffice, 4, 1],
      ['hospital', CBECS_KWH_PER_SF.inpatient, WATERSENSE_GAL_PER_SF.hospital, 3, 0],
      ['school', CBECS_KWH_PER_SF.education, WATERSENSE_GAL_PER_SF.school, 4, 1],
      ['rail-station', TERMINAL_KWH_PER_SF, WATERSENSE_GAL_PER_SF.office, 4, 0],
    ] as const) {
      const entry = byId(id);
      const sqft = floorSqft(entry);
      close(entry.powerUse, mwFrom(sqft, kwh), mwPlaces);
      close(entry.waterUse, klFrom(sqft, gal), klPlaces);
    }
  });

  it("draws the airport's terminal as a transport terminal, and its passengers' water", () => {
    const airport = byId('airport');
    const sqft = floorSqft(airport);
    close(airport.powerUse, mwFrom(sqft, TERMINAL_KWH_PER_SF), 1);
    const passengers = (sqft / TERMINAL_SF_PER_ENPLANEMENT) * 2;
    close(airport.waterUse, ((passengers * GAL_PER_PASSENGER) / DAYS_PER_YEAR) * KL_PER_GAL, 0);
  });

  it("draws the incinerator as a small combustor's own use of the power it burns", () => {
    const incinerator = byId('incinerator');
    const kwhPerDay = SMALL_COMBUSTOR_TONS_PER_DAY * COMBUSTOR_KWH_PER_TON;
    close(incinerator.powerUse, kwhPerDay / 24 / 1000, 2);
  });

  it("draws the recovery facility's sorting line at 20 kWh a tonne over the day, and its staff's water", () => {
    const mrf = byId('materials-recovery-facility');
    /** 50 short tons a day; 20 kWh a tonne, building included (measured 23.8, large plants near 10). */
    const TONNES_PER_DAY = 50 * 0.90718474;
    const MRF_KWH_PER_TONNE = 20;
    close(mrf.powerUse, (TONNES_PER_DAY * MRF_KWH_PER_TONNE) / 24 / 1000, 4);
    const STAFF = 17;
    const GAL_PER_WORKER_DAY = 13;
    close(mrf.waterUse, STAFF * GAL_PER_WORKER_DAY * KL_PER_GAL, 1);
  });

  it("draws the transfer station's hall at 5 kWh a tonne over the day, and its staff's water", () => {
    const station = byId('transfer-station');
    /** 50 short tons a day; 5 kWh a tonne, the top of two small stations' measured 2.5–6.1. */
    const TONNES_PER_DAY = 50 * 0.90718474;
    const TRANSFER_KWH_PER_TONNE = 5;
    close(station.powerUse, (TONNES_PER_DAY * TRANSFER_KWH_PER_TONNE) / 24 / 1000, 5);
    const STAFF = 4;
    const GAL_PER_WORKER_DAY = 13;
    close(station.waterUse, STAFF * GAL_PER_WORKER_DAY * KL_PER_GAL, 1);
  });

  it("draws the coal plant's staff water, not its cooling water", () => {
    const coal = byId('coal-plant');
    const STAFF = 50;
    const GAL_PER_WORKER_DAY = 13;
    close(coal.waterUse, STAFF * GAL_PER_WORKER_DAY * KL_PER_GAL, 1);
  });
});

describe('the healthcare ladder: a hospital serves the people its beds do, for less a head than a clinic', () => {
  const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  const BEDS = 72;
  /** KFF 2024: staffed community-hospital beds, and admissions a year, per 1,000 residents. */
  const BEDS_PER_THOUSAND = 2.28;
  const ADMISSIONS_PER_THOUSAND = 99;
  /** AHA Fast Facts (2024): community hospitals' admissions over their staffed beds. */
  const ADMISSIONS_PER_BED = 33_553_725 / 775_297;

  it('serves about 5% fewer than both routes from its 72 beds give', () => {
    const hospital = byId('hospital');
    const byBeds = (BEDS / BEDS_PER_THOUSAND) * 1_000;
    const byAdmissions = ((BEDS * ADMISSIONS_PER_BED) / ADMISSIONS_PER_THOUSAND) * 1_000;
    for (const route of [byBeds, byAdmissions]) {
      const under = 1 - hospital.service!.capacity! / route;
      expect(under).toBeGreaterThan(0.03);
      expect(under).toBeLessThan(0.06);
    }
  });

  it('writes the clinic’s health strength, further and for more people', () => {
    const clinic = byId('clinic');
    const hospital = byId('hospital');
    expect(hospital.service).toMatchObject({ kind: 'health', strength: clinic.service!.strength });
    expect(hospital.service!.range).toBeGreaterThan(clinic.service!.range);
    expect(hospital.service!.capacity).toBeGreaterThan(clinic.service!.capacity!);
    expect(hospital.unlockMilestone).toBeGreaterThan(clinic.unlockMilestone);
  });

  it('costs less a head to build and to run than the clinic', () => {
    const perHead = (e: BuildingCatalogEntry, of: number): number => of / e.service!.capacity!;
    const clinic = byId('clinic');
    const hospital = byId('hospital');
    expect(perHead(hospital, hospital.cost)).toBeLessThan(perHead(clinic, clinic.cost));
    expect(perHead(hospital, hospital.upkeep)).toBeLessThan(perHead(clinic, clinic.upkeep));
  });
});

describe('the generators (honest both sides): nameplate, capacity factor, cost and upkeep derived', () => {
  const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  /** EWT DW61-1MW, a distributed-wind machine: 1 MW on a 61 m rotor at a 69 m hub. */
  const DW61_NAMEPLATE_MW = 1;
  const DW61_HUB_HEIGHT_M = 69;
  const DW61_ROTOR_M = 61;
  /** PNNL Distributed Wind Market Report: projects using midsize turbines (101 kW–1 MW) average 20%. */
  const DISTRIBUTED_MIDSIZE_CAPACITY_FACTOR = 0.2;
  /** EIA Electric Power Monthly 6.07.A: coal's 2024 capacity factor. */
  const EIA_COAL_CAPACITY_FACTOR = 0.426;
  /** PNNL Distributed Wind Market Report (2024 ed.): midsize and large distributed projects, 2015–2022, capacity-weighted. */
  const WIND_USD_PER_KW = 4_310;
  /** EIA AEO2023 overnight capital cost, 2022 $/kW, and fixed/variable O&M. */
  const COAL_USD_PER_KW = 4_507;
  /** EIA AEO2023 onshore wind fixed O&M, the published $/kW-year a distributed machine is held to for want of its own. */
  const WIND_FOM_USD_PER_KW_YR = 29.64;
  const COAL_FOM_USD_PER_KW_YR = 45.68;
  const COAL_VOM_USD_PER_MWH = 5.06;
  const COAL_HEAT_RATE_BTU_PER_KWH = 8_638;
  /** EIA Electric Power Annual 7.4: delivered coal, $/MMBtu, 2024. */
  const COAL_USD_PER_MMBTU = 2.47;
  const HOURS_PER_YEAR = 8_760;

  it('rates the wind turbine as a distributed-wind machine, drawn at its hub height, delivering a fifth of its nameplate', () => {
    const turbine = byId('wind-turbine');
    expect(turbine.utility?.powerMW).toBe(DW61_NAMEPLATE_MW);
    expect(turbine.utility?.capacityFactor).toBe(DISTRIBUTED_MIDSIZE_CAPACITY_FACTOR);
    expect(turbine.height).toBe(DW61_HUB_HEIGHT_M);
    expect(averageOutputMW(turbine.utility!)).toBeCloseTo(0.2, 6);
    expect(turbine.pollution ?? 0).toBe(0);
  });

  it('keeps its rotor out of its neighbour’s: the clear tiles between two turbines hold a rotor', () => {
    const turbine = byId('wind-turbine');
    expect(turbine.spacing).toBe(3);
    // Centres stand spacing + 1 tiles apart, which is at least one rotor.
    expect((turbine.spacing! + 1) * TILE_METERS).toBeGreaterThanOrEqual(DW61_ROTOR_M);
    expect(turbine.spacing! * TILE_METERS).toBeLessThan(DW61_ROTOR_M);
    expect(catalog.filter((e) => e.spacing !== undefined).map((e) => e.id)).toEqual([
      'wind-turbine',
    ]);
  });

  it('keeps the coal plant a 60 MW small unit at the fleet capacity factor, its figures the anchors', () => {
    const coal = byId('coal-plant');
    expect(coal.utility?.powerMW).toBe(60);
    expect(coal.utility?.capacityFactor).toBe(EIA_COAL_CAPACITY_FACTOR);
    expect(averageOutputMW(coal.utility!)).toBeCloseTo(25.56, 2);
    expect(coal.cost).toBe(12_000);
    expect(coal.upkeep).toBe(800);
    expect(coal.pollution).toBe(140);
  });

  it("prices the turbine from published capital cost against the coal plant's anchor, to the nearest ten", () => {
    const coal = byId('coal-plant');
    const turbine = byId('wind-turbine');
    const coalUsd = COAL_USD_PER_KW * coal.utility!.powerMW! * 1000;
    const windUsd = WIND_USD_PER_KW * turbine.utility!.powerMW! * 1000;
    const derived = (coal.cost * windUsd) / coalUsd;
    expect(turbine.cost).toBe(Math.round(derived / 10) * 10);
  });

  it("keeps the turbine from published operating cost against the coal plant's anchor", () => {
    const coal = byId('coal-plant');
    const turbine = byId('wind-turbine');
    const coalMwh = coal.utility!.powerMW! * coal.utility!.capacityFactor! * HOURS_PER_YEAR;
    const coalUsdPerYear =
      COAL_FOM_USD_PER_KW_YR * coal.utility!.powerMW! * 1000 +
      COAL_VOM_USD_PER_MWH * coalMwh +
      (coalMwh * COAL_HEAT_RATE_BTU_PER_KWH * COAL_USD_PER_MMBTU) / 1000;
    const windUsdPerYear = WIND_FOM_USD_PER_KW_YR * turbine.utility!.powerMW! * 1000;
    const derived = (coal.upkeep * windUsdPerYear) / coalUsdPerYear;
    expect(turbine.upkeep).toBe(Math.round(derived));
  });
});
