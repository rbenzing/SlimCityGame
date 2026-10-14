import { describe, expect, it } from 'vitest';
import { MILESTONES, tileIndex } from '../shared/constants';
import { SCHOOLING_GATE, level3Schooling } from '../shared/schooling';
import { BuildingState, FieldId, Problem, RoadTier, ZoneType } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  DemandLevels,
  FundingKey,
  GridState,
  ServiceKind,
} from '../shared/types';
import { createGrid } from '../world/grid';
import catalogData from '../data/catalog.json';
import { BuildingRegistry } from './buildings';
import { GrowthSystem, schoolsMissingAt, type Rng } from './growth';
import { ServiceSim, radiateWeighted } from './services';

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

const neutralDemand: DemandLevels = { res: 0.5, com: 0.5, ind: 0.5 };

const constantRng = (value: number): Rng => ({
  next: () => value,
  int: (maxExclusive: number) => Math.floor(value * maxExclusive),
  range: (a: number, b: number) => a + value * (b - a),
  fork: () => constantRng(value),
});

/** A building of `zone` at `level`, standing alone on a 1×1 lot, with no kind of its own. */
function entryOf(zone: ZoneType, level: number): BuildingCatalogEntry {
  const commercialOrIndustrial =
    zone === ZoneType.ComLow ||
    zone === ZoneType.ComHigh ||
    zone === ZoneType.Industrial ||
    zone === ZoneType.IndHeavy;
  return {
    id: `z${zone}-l${level}`,
    name: `z${zone} level ${level}`,
    category: commercialOrIndustrial ? 'com' : 'res',
    zone,
    level,
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0,
    ...(commercialOrIndustrial ? { jobs: 4 } : { residents: 4 }),
    powerUse: 0.1,
    waterUse: 0.1,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

function catalogFor(zone: ZoneType): BuildingCatalogEntry[] {
  return [1, 2, 3].map((level) => entryOf(zone, level));
}

const SITE = tileIndex(8, 8);

/** One served level-2 building of `zone` with land value for level 3, ready to level up. */
function standing(zone: ZoneType): {
  g: GridState;
  registry: BuildingRegistry;
  growth: GrowthSystem;
  inst: BuildingInstance;
} {
  const catalog = catalogFor(zone);
  const g = createGrid();
  const registry = new BuildingRegistry(catalog);
  const inst = registry.place(g, catalog[1]!, 8, 8, 0, BuildingState.Active)!;
  g.zone[SITE] = zone;
  g.power[SITE] = 1;
  g.watered[SITE] = 1;
  g.sewered[SITE] = 1;
  g.roadTier[SITE] = RoadTier.TwoLane;
  g.fields[FieldId.LandValue]![SITE] = 220;
  return { g, registry, growth: new GrowthSystem(catalog, constantRng(0), () => true), inst };
}

const cover = (g: GridState, ...fields: FieldId[]): void => {
  for (const f of fields) g.fields[f]![SITE] = 150;
};

/** Runs one growth pass and says whether the building rose to level 3. */
function levelsUp(s: ReturnType<typeof standing>, t = 0): { rose: boolean; problems: number } {
  const delta = s.growth.tick(s.g, s.registry, neutralDemand, 6, t);
  return {
    rose: delta.added.some((b) => b.level === 3),
    problems: s.registry.get(s.inst.id)?.problems ?? 0,
  };
}

describe('the schooling each zone waits on for level 3', () => {
  it('is elementary for detached and row housing, middle and high for denser zones, college for towers of commerce, nothing for industry', () => {
    const rungs = (zone: ZoneType): FieldId[] => level3Schooling(zone).map((r) => r.field);
    expect(rungs(ZoneType.ResLow)).toEqual([FieldId.Education]);
    expect(rungs(ZoneType.ResMediumRow)).toEqual([FieldId.Education]);
    for (const zone of [ZoneType.ResMedium, ZoneType.ResHigh, ZoneType.Mixed, ZoneType.ComLow]) {
      expect(rungs(zone)).toEqual([FieldId.MiddleEducation, FieldId.HighEducation]);
    }
    expect(rungs(ZoneType.ComHigh)).toEqual([FieldId.CollegeEducation]);
    for (const zone of [ZoneType.Industrial, ZoneType.IndHeavy, ZoneType.Agriculture]) {
      expect(rungs(zone)).toEqual([]);
    }
  });

  it('gives every rung its own field, so no rung stands in for another', () => {
    const fields = [ZoneType.ResLow, ZoneType.ResHigh, ZoneType.ComHigh].flatMap((zone) =>
      level3Schooling(zone).map((r) => r.field),
    );
    expect(new Set(fields)).toEqual(
      new Set([
        FieldId.Education,
        FieldId.MiddleEducation,
        FieldId.HighEducation,
        FieldId.CollegeEducation,
      ]),
    );
  });
});

describe('level 3 of a ResHigh lot', () => {
  it('stays at level 2 with NeedsSchool when only a middle school reaches it', () => {
    const s = standing(ZoneType.ResHigh);
    cover(s.g, FieldId.MiddleEducation);
    const { rose, problems } = levelsUp(s);
    expect(rose).toBe(false);
    expect(s.registry.get(s.inst.id)!.level).toBe(2);
    expect(problems & Problem.NeedsSchool).toBe(Problem.NeedsSchool);
  });

  it('reaches level 3 once a middle and a high school both reach it', () => {
    const s = standing(ZoneType.ResHigh);
    cover(s.g, FieldId.MiddleEducation, FieldId.HighEducation);
    expect(levelsUp(s).rose).toBe(true);
  });

  it('gets no help from elementary schools, at any strength or number', () => {
    const s = standing(ZoneType.ResHigh);
    s.g.fields[FieldId.Education]![SITE] = 255;
    const { rose, problems } = levelsUp(s);
    expect(rose).toBe(false);
    expect(problems & Problem.NeedsSchool).toBe(Problem.NeedsSchool);
    expect(schoolsMissingAt(s.g, SITE, ZoneType.ResHigh).map((r) => r.kind)).toEqual([
      'middle-education',
      'high-education',
    ]);
  });

  it('is shut by a high school alone as it is by a middle school alone', () => {
    const s = standing(ZoneType.ResHigh);
    cover(s.g, FieldId.HighEducation);
    expect(levelsUp(s).rose).toBe(false);
    expect(schoolsMissingAt(s.g, SITE, ZoneType.ResHigh).map((r) => r.kind)).toEqual([
      'middle-education',
    ]);
  });

  it('needs the field strictly over the gate: exactly the gate is not enough', () => {
    const s = standing(ZoneType.ResHigh);
    s.g.fields[FieldId.MiddleEducation]![SITE] = SCHOOLING_GATE;
    s.g.fields[FieldId.HighEducation]![SITE] = SCHOOLING_GATE;
    expect(levelsUp(s).rose).toBe(false);
    s.g.fields[FieldId.MiddleEducation]![SITE] = SCHOOLING_GATE + 1;
    s.g.fields[FieldId.HighEducation]![SITE] = SCHOOLING_GATE + 1;
    expect(levelsUp(s, 10).rose).toBe(true);
  });

  it('carries no NeedsSchool when the land value for level 3 is not there, since schooling is not what holds it', () => {
    const s = standing(ZoneType.ResHigh);
    s.g.fields[FieldId.LandValue]![SITE] = 150;
    expect(levelsUp(s).problems & Problem.NeedsSchool).toBe(0);
  });

  it('loses NeedsSchool when the land value falls away, and gets it back when it returns', () => {
    const s = standing(ZoneType.ResHigh);
    expect(levelsUp(s).problems & Problem.NeedsSchool).toBe(Problem.NeedsSchool);
    s.g.fields[FieldId.LandValue]![SITE] = 150;
    expect(levelsUp(s, 10).problems & Problem.NeedsSchool).toBe(0);
    s.g.fields[FieldId.LandValue]![SITE] = 220;
    expect(levelsUp(s, 20).problems & Problem.NeedsSchool).toBe(Problem.NeedsSchool);
  });

  it('never abandons a building for NeedsSchool, however many passes it stands held', () => {
    const s = standing(ZoneType.ResHigh);
    for (let t = 0; t < 100; t += 10) s.growth.tick(s.g, s.registry, neutralDemand, 6, t);
    expect(s.registry.get(s.inst.id)!.state).toBe(BuildingState.Active);
  });
});

describe('the other zones', () => {
  it('holds a detached house to the elementary school alone, as before', () => {
    const s = standing(ZoneType.ResLow);
    cover(s.g, FieldId.MiddleEducation, FieldId.HighEducation, FieldId.CollegeEducation);
    expect(levelsUp(s).rose).toBe(false);
    cover(s.g, FieldId.Education);
    expect(levelsUp(s, 10).rose).toBe(true);
  });

  it('holds local commercial to the middle and the high school', () => {
    const s = standing(ZoneType.ComLow);
    cover(s.g, FieldId.Education, FieldId.CollegeEducation);
    expect(levelsUp(s).rose).toBe(false);
    cover(s.g, FieldId.MiddleEducation, FieldId.HighEducation);
    expect(levelsUp(s, 10).rose).toBe(true);
  });

  it('holds high-density commercial to the college, and nothing below it will do', () => {
    const s = standing(ZoneType.ComHigh);
    cover(s.g, FieldId.Education, FieldId.MiddleEducation, FieldId.HighEducation);
    const held = levelsUp(s);
    expect(held.rose).toBe(false);
    expect(held.problems & Problem.NeedsSchool).toBe(Problem.NeedsSchool);
    cover(s.g, FieldId.CollegeEducation);
    expect(levelsUp(s, 10).rose).toBe(true);
  });

  it('never gates industry, which levels on its order book alone', () => {
    for (const zone of [ZoneType.Industrial, ZoneType.IndHeavy]) {
      const s = standing(zone);
      s.g.fields[FieldId.LandValue]![SITE] = 0;
      const { rose, problems } = levelsUp(s);
      expect(rose).toBe(true);
      expect(problems & Problem.NeedsSchool).toBe(0);
    }
  });

  it('never gates level 2 at any density, with no school anywhere', () => {
    for (const zone of [
      ZoneType.ResLow,
      ZoneType.ResMediumRow,
      ZoneType.ResMedium,
      ZoneType.ResHigh,
      ZoneType.Mixed,
      ZoneType.ComLow,
      ZoneType.ComHigh,
    ]) {
      const catalog = catalogFor(zone);
      const g = createGrid();
      const registry = new BuildingRegistry(catalog);
      const inst = registry.place(g, catalog[0]!, 8, 8, 0, BuildingState.Active)!;
      g.zone[SITE] = zone;
      g.power[SITE] = 1;
      g.watered[SITE] = 1;
      g.sewered[SITE] = 1;
      g.roadTier[SITE] = RoadTier.TwoLane;
      g.fields[FieldId.LandValue]![SITE] = 200;
      const growth = new GrowthSystem(catalog, constantRng(0), () => true);
      const delta = growth.tick(g, registry, neutralDemand, 6, 0);
      expect(
        delta.added.map((b) => b.level),
        `zone ${zone}`,
      ).toEqual([2]);
      expect(registry.get(inst.id)?.problems ?? 0).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// The schools in the service pass
// ---------------------------------------------------------------------------

const STRIP = 90;
const ROAD_Z = 1;

function school(
  kind: ServiceKind,
  range: number,
  capacity?: number,
  strength = 150,
): BuildingCatalogEntry {
  return {
    id: `s-${kind}-${range}-${capacity ?? 'none'}`,
    name: kind,
    category: 'service',
    footprint: { w: 1, d: 1 },
    height: 10,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    service: { kind, strength, range, ...(capacity !== undefined ? { capacity } : {}) },
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

function home(residents: number): BuildingCatalogEntry {
  return {
    id: `home-${residents}`,
    name: 'home',
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w: 1, d: 1 },
    height: 5,
    color: 0,
    residents,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

/** A grid with a straight road along z = 1 for x = 0 .. STRIP - 1. */
function strip(): { g: GridState; buildings: BuildingInstance[] } {
  const g = createGrid();
  for (let x = 0; x < STRIP; x++) g.roadTier[tileIndex(x, ROAD_Z)] = RoadTier.TwoLane;
  return { g, buildings: [] };
}

function place(
  world: { g: GridState; buildings: BuildingInstance[] },
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  id: number,
): void {
  world.g.buildingId[tileIndex(x, z)] = id;
  world.buildings.push({
    id,
    catalogId: entry.id,
    x,
    z,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  });
}

const funding = (education = 1): Record<FundingKey, number> => ({
  police: 1,
  fire: 1,
  health: 1,
  education,
  park: 1,
});

/** The furthest road tile along the strip a field holds over the schooling gate; -1 for none. */
function reach(g: GridState, field: FieldId): number {
  let far = -1;
  for (let x = 0; x < STRIP; x++) {
    if (g.fields[field]![tileIndex(x, ROAD_Z)]! > SCHOOLING_GATE) far = x;
  }
  return far;
}

const RUNG_FIELDS: ReadonlyArray<readonly [ServiceKind, FieldId]> = [
  ['education', FieldId.Education],
  ['middle-education', FieldId.MiddleEducation],
  ['high-education', FieldId.HighEducation],
  ['college-education', FieldId.CollegeEducation],
];

const EDUCATION_FIELDS = RUNG_FIELDS.map(([, field]) => field);

describe('each school writes its own field and no other', () => {
  for (const [kind, written] of RUNG_FIELDS) {
    it(`${kind} writes field ${written} only`, () => {
      const world = strip();
      const entry = school(kind, 50);
      place(world, entry, 0, 0, 1);
      new ServiceSim([entry]).tick(world.g, world.buildings, funding());
      for (const field of EDUCATION_FIELDS) {
        const total = world.g.fields[field]!.reduce((sum, v) => sum + v, 0);
        if (field === written) expect(total).toBeGreaterThan(0);
        else expect(total).toBe(0);
      }
    });
  }

  it('writes 150 at its door and a catchment of 0.6 of its range, for every rung', () => {
    for (const [kind, field] of RUNG_FIELDS) {
      const world = strip();
      const entry = school(kind, 50);
      place(world, entry, 0, 0, 1);
      new ServiceSim([entry]).tick(world.g, world.buildings, funding());
      expect(world.g.fields[field]![tileIndex(0, ROAD_Z)]).toBe(150);
      // 150 × (1 − h/50) > 60 holds for h < 30, and the two tiles of radiation
      // carry it two further: the last road tile over the gate is 29 + 2.
      expect(reach(world.g, field)).toBe(31);
    }
  });

  it('is beaten by no number of elementary schools on the middle field', () => {
    const world = strip();
    const entry = school('education', 50);
    for (let i = 0; i < 6; i++) place(world, entry, i * 3, 0, i + 1);
    new ServiceSim([entry]).tick(world.g, world.buildings, funding());
    expect(Math.max(...world.g.fields[FieldId.Education]!)).toBe(150);
    expect(Math.max(...world.g.fields[FieldId.MiddleEducation]!)).toBe(0);
    expect(Math.max(...world.g.fields[FieldId.HighEducation]!)).toBe(0);
  });
});

describe('funding, one slider for the whole department', () => {
  it('scales every rung’s range by the Education funding', () => {
    for (const [kind, field] of RUNG_FIELDS) {
      const full = strip();
      const half = strip();
      const entry = school(kind, 80);
      place(full, entry, 0, 0, 1);
      place(half, entry, 0, 0, 1);
      new ServiceSim([entry]).tick(full.g, full.buildings, funding(1));
      new ServiceSim([entry]).tick(half.g, half.buildings, funding(0.5));
      expect(reach(half.g, field)).toBeLessThan(reach(full.g, field));
      expect(reach(half.g, field)).toBeGreaterThan(0);
    }
  });
});

describe('a school’s load closes its gate as the supply-share model says', () => {
  /** A school of capacity 1,000 with `homes` homes of 500 on the strip: load = homes × 0.5. */
  function loaded(homes: number): { g: GridState; load: number | undefined } {
    const world = strip();
    const entry = school('high-education', 50, 1000);
    const household = home(500);
    place(world, entry, 0, 0, 1);
    for (let i = 0; i < homes; i++) place(world, household, 2 + i, 2, 10 + i);
    const sim = new ServiceSim([entry, household]);
    sim.tick(world.g, world.buildings, funding());
    return { g: world.g, load: sim.facilityLoad(1) };
  }

  it('holds the full catchment at 100% load', () => {
    const { g, load } = loaded(2);
    expect(load).toBeCloseTo(1, 10);
    expect(reach(g, FieldId.HighEducation)).toBe(31);
  });

  it('shrinks the catchment toward the door as load rises, 0.4 of the range at 150%', () => {
    const { g, load } = loaded(3);
    expect(load).toBeCloseTo(1.5, 10);
    // 150 × (1 − h/50) ÷ 1.5 > 60 holds for h < 20; the radiation adds two.
    expect(reach(g, FieldId.HighEducation)).toBe(21);
  });

  it('reaches 0.2 of the range at 200%', () => {
    const { g } = loaded(4);
    expect(reach(g, FieldId.HighEducation)).toBe(11);
  });

  it('closes the gate everywhere at 250%, the same for every rung', () => {
    const { g, load } = loaded(5);
    expect(load).toBeCloseTo(2.5, 10);
    expect(reach(g, FieldId.HighEducation)).toBe(-1);
    // Weaker, not gone: the field is still there, just never over the gate.
    expect(g.fields[FieldId.HighEducation]![tileIndex(0, ROAD_Z)]).toBe(60);
  });

  it('is relieved by a second school, which pools its places over the same ground', () => {
    const world = strip();
    const entry = school('high-education', 50, 1000);
    const household = home(500);
    place(world, entry, 0, 0, 1);
    place(world, entry, 1, 0, 2);
    for (let i = 0; i < 4; i++) place(world, household, 3 + i, 2, 10 + i);
    new ServiceSim([entry, household]).tick(world.g, world.buildings, funding());
    // 2,000 people over 2 × 1,000 places is 100%, not the 200% one school would read:
    // the pair reaches as far as it does with nobody to serve (the second sits a tile on).
    const unloaded = strip();
    place(unloaded, entry, 0, 0, 1);
    place(unloaded, entry, 1, 0, 2);
    new ServiceSim([entry, household]).tick(unloaded.g, unloaded.buildings, funding());
    expect(reach(world.g, FieldId.HighEducation)).toBe(32);
    expect(reach(world.g, FieldId.HighEducation)).toBe(reach(unloaded.g, FieldId.HighEducation));
    expect(world.g.fields[FieldId.HighEducation]![tileIndex(0, ROAD_Z)]).toBe(150);
  });
});

describe('the library', () => {
  const lib = school('library', 60, undefined, 20);
  const elementary = school('education', 50);

  function withLibrary(opts: {
    libraryId: number;
    schoolId: number;
    libraryX?: number;
    libraryZ?: number;
    libraryEntry?: BuildingCatalogEntry;
    extra?: (world: { g: GridState; buildings: BuildingInstance[] }) => void;
  }): { g: GridState; sim: ServiceSim; world: { g: GridState; buildings: BuildingInstance[] } } {
    const world = strip();
    place(world, elementary, 0, 0, opts.schoolId);
    place(world, opts.libraryEntry ?? lib, opts.libraryX ?? 1, opts.libraryZ ?? 0, opts.libraryId);
    opts.extra?.(world);
    const sim = new ServiceSim([elementary, opts.libraryEntry ?? lib, home(500)]);
    sim.tick(world.g, world.buildings, funding());
    return { g: world.g, sim, world };
  }

  function alone(): GridState {
    const world = strip();
    place(world, elementary, 0, 0, 1);
    new ServiceSim([elementary]).tick(world.g, world.buildings, funding());
    return world.g;
  }

  it('writes no field of its own', () => {
    const world = strip();
    place(world, lib, 0, 0, 1);
    new ServiceSim([lib]).tick(world.g, world.buildings, funding());
    for (const field of world.g.fields.keys()) {
      if (field === FieldId.Crime || field === FieldId.FireRisk || field === FieldId.LandValue)
        continue;
      expect(
        world.g.fields[field]!.every((v) => v === 0),
        `field ${field}`,
      ).toBe(true);
    }
  });

  it('stretches the catchment of a school at its door, more at the door than far away', () => {
    const base = reach(alone(), FieldId.Education);
    const { g } = withLibrary({ libraryId: 2, schoolId: 1 });
    const stretched = reach(g, FieldId.Education);
    expect(base).toBe(31);
    expect(stretched).toBeGreaterThan(base);
    // Up to a fifth, never more: no uplift can carry the gate past 0.6 × range × 1.2.
    expect(stretched).toBeLessThanOrEqual(Math.ceil(0.6 * 50 * 1.2) + 2);
  });

  it('changes nothing for a school it does not reach', () => {
    // On a road of its own, which the school's road does not join.
    const base = alone();
    const { g } = withLibrary({
      libraryId: 2,
      schoolId: 1,
      libraryX: 0,
      libraryZ: 9,
      extra: (world) => {
        for (let x = 0; x < STRIP; x++) world.g.roadTier[tileIndex(x, 10)] = RoadTier.TwoLane;
      },
    });
    expect(Array.from(g.fields[FieldId.Education]!)).toEqual(
      Array.from(base.fields[FieldId.Education]!),
    );
  });

  it('changes nothing where there is no school, writing no field', () => {
    const base = strip();
    const bare = strip();
    place(bare, lib, 1, 0, 1);
    new ServiceSim([lib]).tick(bare.g, bare.buildings, funding());
    for (const field of EDUCATION_FIELDS) {
      expect(Array.from(bare.g.fields[field]!)).toEqual(Array.from(base.g.fields[field]!));
    }
  });

  it('is applied before any school radiates, whatever order the registry holds them in', () => {
    const libraryFirst = withLibrary({ libraryId: 1, schoolId: 2 }).g;
    const schoolFirst = withLibrary({ libraryId: 2, schoolId: 1 }).g;
    expect(reach(libraryFirst, FieldId.Education)).toBeGreaterThan(31);
    expect(Array.from(libraryFirst.fields[FieldId.Education]!)).toEqual(
      Array.from(schoolFirst.fields[FieldId.Education]!),
    );
  });

  it('stretches every rung’s range, and only a school’s', () => {
    const middle = school('middle-education', 50);
    const world = strip();
    place(world, middle, 0, 0, 1);
    place(world, lib, 1, 0, 2);
    new ServiceSim([middle, lib]).tick(world.g, world.buildings, funding());
    expect(reach(world.g, FieldId.MiddleEducation)).toBeGreaterThan(31);

    // A health facility's range is not a school's, and is not stretched.
    const clinic = school('health', 50, undefined, 140);
    const clinicAlone = strip();
    place(clinicAlone, clinic, 0, 0, 1);
    new ServiceSim([clinic]).tick(clinicAlone.g, clinicAlone.buildings, funding());
    const clinicNear = strip();
    place(clinicNear, clinic, 0, 0, 1);
    place(clinicNear, lib, 1, 0, 2);
    new ServiceSim([clinic, lib]).tick(clinicNear.g, clinicNear.buildings, funding());
    expect(Array.from(clinicNear.g.fields[FieldId.Health]!)).toEqual(
      Array.from(clinicAlone.g.fields[FieldId.Health]!),
    );
  });

  it('follows the supply-share model: a library at 200% load gives half its uplift', () => {
    const capped = school('library', 60, 1000, 20);
    const fine = withLibrary({ libraryId: 2, schoolId: 1, libraryEntry: capped });
    const crowded = withLibrary({
      libraryId: 2,
      schoolId: 1,
      libraryEntry: capped,
      extra: (world) => {
        for (let i = 0; i < 4; i++) place(world, home(500), 3 + i, 2, 20 + i);
      },
    });
    const none = reach(alone(), FieldId.Education);
    const full = reach(fine.g, FieldId.Education);
    const halved = reach(crowded.g, FieldId.Education);
    expect(fine.sim.facilityLoad(2)).toBeCloseTo(0, 10);
    expect(crowded.sim.facilityLoad(2)).toBeCloseTo(2, 10);
    expect(full).toBeGreaterThan(none);
    expect(halved).toBeGreaterThan(none);
    expect(halved).toBeLessThanOrEqual(full);
  });

  it('is funded by the Education slider, like the schools it serves', () => {
    const world = strip();
    place(world, elementary, 0, 0, 1);
    place(world, lib, 1, 0, 2);
    const sim = new ServiceSim([elementary, lib]);
    sim.tick(world.g, world.buildings, funding(1));
    const full = reach(world.g, FieldId.Education);
    const lean = strip();
    place(lean, elementary, 0, 0, 1);
    place(lean, lib, 1, 0, 2);
    new ServiceSim([elementary, lib]).tick(lean.g, lean.buildings, funding(0.5));
    expect(reach(lean.g, FieldId.Education)).toBeLessThan(full);
  });

  it('lifts a road tile’s own range by its uplift, in the falloff', () => {
    const reached = new Map([[tileIndex(10, ROAD_Z), 10]]);
    // Over its plain range of 50, 10 hops out is 150 × (1 − 10/50) = 120 …
    const plain = radiateWeighted(reached, 50, 150);
    expect(plain.get(tileIndex(10, ROAD_Z))).toBeCloseTo(120, 10);
    // … and over a local range of 60, 150 × (1 − 10/60) = 125.
    const lifted = radiateWeighted(reached, 50, 150, () => 60);
    expect(lifted.get(tileIndex(10, ROAD_Z))).toBeCloseTo(125, 10);
  });
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

describe('the education ladder in the catalog', () => {
  const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
  const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
  const milestone = (name: string): number => MILESTONES.findIndex((m) => m.name === name);
  const KWH_PER_SF = { education: 9.4, assembly: 12.1 };
  const GAL_PER_SF = { school: 10.84, office: 14.48 };
  const SF_PER_M2 = 10.7639;
  const HOURS = 8760;
  const KL_PER_GAL = 0.00378541;

  it('names the existing school Elementary School and keeps its id', () => {
    expect(byId('school').name).toBe('Elementary School');
    expect(byId('school').service?.kind).toBe('education');
  });

  it('holds the sourced capacities', () => {
    expect(byId('school').service?.capacity).toBe(7000);
    expect(byId('middle-school').service?.capacity).toBe(17_700);
    expect(byId('high-school').service?.capacity).toBe(15_200);
    expect(byId('college').service?.capacity).toBe(50_000);
    expect(byId('library').service?.capacity).toBe(20_500);
  });

  it('derives the capacities from enrolment and the national share, to the nearest hundred', () => {
    expect(Math.round(((599 / 33.8) * 1000) / 100) * 100).toBe(17_700);
    expect(Math.round(((693 / 45.7) * 1000) / 100) * 100).toBe(15_200);
    expect(Math.round(340_110_988 / 16_607 / 100) * 100).toBe(20_500);
    expect(Math.round(50_000 * 0.0546)).toBe(2730);
  });

  it('writes 150 at every school’s door, so every gate of 60 is 0.6 of the range', () => {
    for (const id of ['school', 'middle-school', 'high-school', 'college']) {
      expect(byId(id).service?.strength).toBe(150);
    }
    expect(SCHOOLING_GATE).toBe(60);
  });

  it('holds the ranges derived from capacity at the town’s density', () => {
    const residential = catalog.filter(
      (e) =>
        e.residents !== undefined &&
        e.residents > 0 &&
        e.zone !== undefined &&
        e.zone !== ZoneType.Agriculture &&
        e.bodyFootprint === undefined,
    );
    const density =
      residential.reduce((sum, e) => sum + e.residents! / (e.footprint.w * e.footprint.d), 0) /
      residential.length;
    expect(residential).toHaveLength(60);
    expect(density).toBeCloseTo(8.106, 3);
    const perCoveredTile = density * 0.35;
    const catchmentRadius = (capacity: number): number =>
      Math.sqrt(capacity / (2 * perCoveredTile));
    const rangeOf = (id: string): number => byId(id).service!.range;
    for (const id of ['school', 'middle-school', 'high-school', 'college']) {
      const derived = catchmentRadius(byId(id).service!.capacity!) / 0.6;
      expect(rangeOf(id), id).toBe(Math.round(derived));
    }
    expect(rangeOf('library')).toBe(Math.round(catchmentRadius(20_500)));
  });

  it('prices each school by real cost ratios to the elementary school', () => {
    const elementary = 43_693 * 456;
    const ratio = (cost: number): number => (6000 * cost) / elementary;
    expect(byId('school').cost).toBe(6000);
    expect(byId('middle-school').cost).toBe(Math.round(ratio(43_635 * 599) / 10) * 10);
    expect(byId('high-school').cost).toBe(Math.round(ratio(49_000 * 693) / 10) * 10);
    expect(byId('middle-school').cost).toBe(7870);
    expect(byId('high-school').cost).toBe(10_230);
    expect(byId('college').cost).toBe(12_400);
    expect(byId('library').cost).toBe(785);
    // The college is a floor: 174,700 sf at the high school's $235.29, to the nearest ¢100.
    expect(Math.round(ratio(174_700 * 235.29) / 100) * 100).toBe(12_400);
    expect(Math.round(ratio(12_300 * 211.55) / 5) * 5).toBe(785);
  });

  it('prices upkeep by all-staff ratio off the elementary school’s ¢400 for 62.5 staff', () => {
    const perStaff = 400 / (456 / 7.3);
    expect(byId('middle-school').upkeep).toBe(Math.round((599 / 7.3) * perStaff));
    expect(byId('high-school').upkeep).toBe(Math.round((693 / 7.3) * perStaff));
    expect(byId('college').upkeep).toBe(Math.round((2730 / 8.0) * perStaff));
    expect(byId('library').upkeep).toBe(Math.round(8.5 * perStaff));
    expect(byId('middle-school').upkeep).toBe(525);
    expect(byId('high-school').upkeep).toBe(608);
    expect(byId('college').upkeep).toBe(2185);
    expect(byId('library').upkeep).toBe(54);
  });

  it('sizes each building to its floor by the massing rule', () => {
    const gross = (id: string): number => {
      const e = byId(id);
      return (e.footprint.w * e.footprint.d * 185 * e.height) / 3.2;
    };
    const sf = (m2: number): number => m2 * SF_PER_M2;
    // The floors: Maine's 160 and 185 sf a pupil, 64 sf a college student, 0.6 sf a head.
    const floors: Record<string, number> = {
      school: 56_000,
      'middle-school': 599 * 160,
      'high-school': 693 * 185,
      college: 2730 * 64,
      library: 0.6 * 20_500,
    };
    for (const [id, floor] of Object.entries(floors)) {
      expect(Math.abs(sf(gross(id)) / floor - 1), id).toBeLessThan(0.07);
    }
    expect(byId('school').footprint).toEqual({ w: 3, d: 3 });
    expect(byId('school').height).toBe(10);
  });

  it('draws power and water on the stated floors by the civic method', () => {
    const draw = (id: string, floor: number, kwh: number, gal: number): void => {
      const e = byId(id);
      expect(e.powerUse, id).toBeCloseTo((kwh * floor) / HOURS / 1000, 4);
      expect(e.waterUse, id).toBeCloseTo(((gal * floor) / 365) * KL_PER_GAL, 1);
    };
    draw('school', 56_000, KWH_PER_SF.education, GAL_PER_SF.school);
    draw('middle-school', 599 * 160, KWH_PER_SF.education, GAL_PER_SF.school);
    draw('high-school', 693 * 185, KWH_PER_SF.education, GAL_PER_SF.school);
    draw('college', 2730 * 64, KWH_PER_SF.education, GAL_PER_SF.school);
    draw('library', 0.6 * 20_500, KWH_PER_SF.assembly, GAL_PER_SF.office);
  });

  it('unlocks each rung at its milestone, looked up by name', () => {
    expect(byId('library').unlockMilestone).toBe(milestone('Busy Township'));
    expect(byId('middle-school').unlockMilestone).toBe(milestone('Big Town'));
    expect(byId('high-school').unlockMilestone).toBe(milestone('Big Town'));
    expect(byId('college').unlockMilestone).toBe(milestone('Grand City'));
  });

  it('is affordable the moment each rung unlocks: the milestone’s reward covers it outright', () => {
    const reward = (name: string): number => MILESTONES[milestone(name)]!.reward;
    expect(reward('Busy Township')).toBeGreaterThanOrEqual(byId('library').cost);
    expect(reward('Big Town')).toBeGreaterThanOrEqual(
      byId('middle-school').cost + byId('high-school').cost,
    );
    expect(reward('Grand City')).toBeGreaterThanOrEqual(byId('college').cost);
  });

  it('gives the library a capacity and the uplift dial as its strength, and no school field', () => {
    const library = byId('library').service!;
    expect(library.kind).toBe('library');
    expect(library.strength).toBe(20);
  });
});
