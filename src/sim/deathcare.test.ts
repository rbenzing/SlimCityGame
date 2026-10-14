import { describe, expect, it } from 'vitest';
import {
  DEATH_RATE_PER_RESIDENT_PER_TICK,
  MILESTONES,
  TICKS_PER_DAY,
  TICKS_PER_YEAR,
  VACANCY_RELET_DAYS,
} from '../shared/constants';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, CityStats, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { DeathCareSystem } from './deathcare';
import { EconomySystem } from './economy';

const home = (id: string, residents: number): BuildingCatalogEntry => ({
  id,
  name: id,
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
});

const HOUSE = home('house', 3);
const TOWER = home('tower', 300);
const BLOCK = home('block', 100);
const catalog = [HOUSE, TOWER, BLOCK];
const byId = new Map(catalog.map((c) => [c.id, c]));

/** `count` copies of `entry` laid in rows of 100 from row `z`. */
function lay(
  registry: BuildingRegistry,
  g: GridState,
  entry: BuildingCatalogEntry,
  count: number,
  z: number,
  state: BuildingState = BuildingState.Active,
): BuildingInstance[] {
  return Array.from(
    { length: count },
    (_, i) =>
      registry.place(g, entry, i % 100, z + Math.floor(i / 100), 0, state) as BuildingInstance,
  );
}

/** 100 blocks of 100: a city of 10,000. */
function cityOfTenThousand(): { registry: BuildingRegistry; g: GridState } {
  const g = createGrid();
  const registry = new BuildingRegistry(catalog);
  lay(registry, g, BLOCK, 100, 0);
  return { registry, g };
}

const vacanciesById = (registry: BuildingRegistry): Map<number, number> =>
  new Map(registry.all().map((b) => [b.id, b.vacancies ?? 0]));

function run(
  system: DeathCareSystem,
  registry: BuildingRegistry,
  ticks: number,
  population: number,
  demand = 0,
  fromTick = 0,
): void {
  const buildings = registry.all();
  for (let t = fromTick; t < fromTick + ticks; t++) system.tick(buildings, population, demand, t);
}

describe('DeathCareSystem: saves', () => {
  it('loads an old save, with no vacancies and no deathCare, full and with every counter at zero', () => {
    const { registry } = cityOfTenThousand();
    const oldSave = registry.serialize();
    expect(oldSave.buildings.every((b) => b.vacancies === undefined)).toBe(true);

    const restored = BuildingRegistry.deserialize(catalog, oldSave);
    expect(restored.totals().residents).toBe(10_000);
    expect(restored.all().every((b) => b.vacancies === undefined)).toBe(true);

    const system = new DeathCareSystem(byId);
    system.restoreState(undefined);
    expect(system.serializeState()).toEqual({
      deathRemainder: 0,
      deaths: 0,
      reletRemainder: 0,
      relets: 0,
      interments: [],
      backlog: [],
      regionalThisMonth: 0,
    });
    expect(system.totalDeaths).toBe(0);
    expect(system.uncollected).toBe(0);
  });

  it('loads a slice-1 save, four counters and nothing else, with no interments and nothing uncollected', () => {
    const system = new DeathCareSystem(byId);
    system.restoreState({ deathRemainder: 0.5, deaths: 12, reletRemainder: 0.25, relets: 3 });
    expect(system.totalDeaths).toBe(12);
    expect(system.uncollected).toBe(0);
    expect(system.backlog).toEqual([]);
    expect(system.regionalThisMonth).toBe(0);
    expect(system.serializeState()).toMatchObject({ interments: [], backlog: [] });
  });

  it('loads damaged counters as zero rather than carrying them', () => {
    const system = new DeathCareSystem(byId);
    system.restoreState({
      deathRemainder: Number.NaN,
      deaths: -4,
      reletRemainder: 7,
      relets: Number.POSITIVE_INFINITY,
    });
    const state = system.serializeState();
    expect(state.deathRemainder).toBe(0);
    expect(state.deaths).toBe(0);
    expect(state.reletRemainder).toBeLessThan(1);
    expect(state.relets).toBe(0);
  });
});

describe('DeathCareSystem: deaths accrue', () => {
  it('derives the rate from the calendar: 9 per 1,000 a year, 1.25e-7 a tick', () => {
    expect(DEATH_RATE_PER_RESIDENT_PER_TICK).toBeCloseTo(1.25e-7, 15);
    expect(DEATH_RATE_PER_RESIDENT_PER_TICK * TICKS_PER_YEAR * 1000).toBeCloseTo(9, 9);
  });

  it('takes 90 of a city of 10,000 in a game year, give or take the remainder', () => {
    const { registry } = cityOfTenThousand();
    const system = new DeathCareSystem(byId);
    run(system, registry, TICKS_PER_YEAR, 10_000);
    expect(Math.abs(system.totalDeaths - 90)).toBeLessThanOrEqual(1);
    expect(registry.totals().residents).toBe(10_000 - system.totalDeaths);
  });

  it('reports what each tick did, and nothing on a tick without a death', () => {
    const { registry } = cityOfTenThousand();
    const system = new DeathCareSystem(byId);
    // 10,000 residents: one death every 800 ticks.
    const perTick = Array.from(
      { length: 1700 },
      (_, t) => system.tick(registry.all(), 10_000, 0, t).deaths,
    );
    expect(perTick.reduce((a, b) => a + b, 0)).toBe(2);
    expect(perTick.filter((d) => d > 0)).toHaveLength(2);
    expect(system.thisTick).toEqual({ deaths: 0, relets: 0 });
    expect(system.totalDeaths).toBe(2);
  });

  it('is identical across a save and reload in the middle of the year', () => {
    const whole = cityOfTenThousand();
    const wholeSystem = new DeathCareSystem(byId);
    run(wholeSystem, whole.registry, TICKS_PER_YEAR, 10_000);

    const half = cityOfTenThousand();
    const firstHalf = new DeathCareSystem(byId);
    run(firstHalf, half.registry, TICKS_PER_YEAR / 2, 10_000);

    const registry = BuildingRegistry.deserialize(
      catalog,
      JSON.parse(JSON.stringify(half.registry.serialize())),
    );
    const secondHalf = new DeathCareSystem(byId);
    secondHalf.restoreState(JSON.parse(JSON.stringify(firstHalf.serializeState())));
    run(secondHalf, registry, TICKS_PER_YEAR / 2, 10_000, 0, TICKS_PER_YEAR / 2);

    expect(secondHalf.totalDeaths).toBe(wholeSystem.totalDeaths);
    expect(vacanciesById(registry)).toEqual(vacanciesById(whole.registry));
    expect(secondHalf.serializeState()).toEqual(wholeSystem.serializeState());
  });

  it('lands in proportion to residents: a tower against its neighbouring houses', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(catalog);
    const [tower] = lay(registry, g, TOWER, 1, 0);
    const houses = lay(registry, g, HOUSE, 300, 1);
    const system = new DeathCareSystem(byId);

    // 1,200 residents, 300 of them in the tower; deaths until 90 have fallen.
    for (let t = 0; system.totalDeaths < 90; t++)
      system.tick(registry.all(), 1.5 / DEATH_RATE_PER_RESIDENT_PER_TICK, 0, t);

    const towerDeaths = tower!.vacancies ?? 0;
    const houseDeaths = houses.reduce((sum, h) => sum + (h.vacancies ?? 0), 0);
    expect(towerDeaths + houseDeaths).toBe(system.totalDeaths);
    // A quarter of the residents, a quarter of the deaths: 22.5 of 90, within a few.
    expect(towerDeaths).toBeGreaterThanOrEqual(18);
    expect(towerDeaths).toBeLessThanOrEqual(27);
    expect(houseDeaths).toBeGreaterThanOrEqual(63);
  });

  it('never takes more than a building holds, nor a death from one with nobody in it', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(catalog);
    const houses = lay(registry, g, HOUSE, 5, 0);
    const [empty] = houses;
    empty!.vacancies = 3;
    const system = new DeathCareSystem(byId);

    // Kill everyone, and then some: the city runs out of people before it runs out of time.
    let t = 0;
    while (registry.totals().residents > 0) {
      system.tick(registry.all(), 1.5 / DEATH_RATE_PER_RESIDENT_PER_TICK, 0, t++);
      expect(empty!.vacancies).toBe(3);
    }
    system.tick(registry.all(), 1.5 / DEATH_RATE_PER_RESIDENT_PER_TICK, 0, t);

    expect(system.totalDeaths).toBe(12);
    // Every house ends exactly empty: none went below 0 residents, none above 3 vacancies.
    for (const h of houses) expect(h.vacancies).toBe(3);
  });

  it('takes nobody from a building that is not Active', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(catalog);
    const [live] = lay(registry, g, BLOCK, 1, 0);
    const [building] = lay(registry, g, BLOCK, 1, 1, BuildingState.Constructing);
    const [abandoned] = lay(registry, g, BLOCK, 1, 2, BuildingState.Abandoned);
    const system = new DeathCareSystem(byId);

    for (let t = 0; system.totalDeaths < 50; t++)
      system.tick(registry.all(), 1.5 / DEATH_RATE_PER_RESIDENT_PER_TICK, 0, t);

    expect(live!.vacancies).toBe(system.totalDeaths);
    expect(building!.vacancies).toBeUndefined();
    expect(abandoned!.vacancies).toBeUndefined();
  });

  it('draws the same deaths however the buildings are listed: by id, not by order', () => {
    const forward = cityOfTenThousand();
    const reversed = cityOfTenThousand();
    const a = new DeathCareSystem(byId);
    const b = new DeathCareSystem(byId);
    const listedForward = forward.registry.all();
    const listedBackward = reversed.registry.all().reverse();
    for (let t = 0; t < 30_000; t++) {
      a.tick(listedForward, 10_000, 0, t);
      b.tick(listedBackward, 10_000, 0, t);
    }
    expect(a.totalDeaths).toBeGreaterThan(0);
    expect(vacanciesById(reversed.registry)).toEqual(vacanciesById(forward.registry));
  });
});

describe('DeathCareSystem: vacancies re-let while the town attracts residents', () => {
  const RELET_TICKS = VACANCY_RELET_DAYS * TICKS_PER_DAY;

  it('re-lets one vacancy in about 41 game days', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(catalog);
    const [block] = lay(registry, g, BLOCK, 1, 0);
    block!.vacancies = 1;
    const system = new DeathCareSystem(byId);

    run(system, registry, RELET_TICKS - 10, 0, 1);
    expect(block!.vacancies).toBe(1);
    run(system, registry, 20, 0, 1);
    expect(block!.vacancies).toBeUndefined();
    expect(system.totalRelets).toBe(1);
  });

  it('re-lets a standing stock at 1 a tick per 41 days, whatever the size of the demand', () => {
    const rates = [0.01, 1].map((demand) => {
      const g = createGrid();
      const registry = new BuildingRegistry(catalog);
      const [tower] = lay(registry, g, TOWER, 1, 0);
      tower!.vacancies = 200;
      const system = new DeathCareSystem(byId);
      // Deaths elsewhere keep the stock at 200: put back what was re-let.
      for (let t = 0; t < RELET_TICKS; t++) {
        const { relets } = system.tick(registry.all(), 0, demand, t);
        tower!.vacancies = (tower!.vacancies ?? 0) + relets;
      }
      return system.totalRelets;
    });
    expect(Math.abs(rates[0]! - 200)).toBeLessThanOrEqual(1);
    expect(rates[1]).toBe(rates[0]);
  });

  it.each([0, -0.4, -1])('re-lets nothing while demand is %s', (demand) => {
    const g = createGrid();
    const registry = new BuildingRegistry(catalog);
    const [tower] = lay(registry, g, TOWER, 1, 0);
    tower!.vacancies = 50;
    const system = new DeathCareSystem(byId);

    run(system, registry, 3 * RELET_TICKS, 0, demand);

    expect(tower!.vacancies).toBe(50);
    expect(system.totalRelets).toBe(0);
    expect(system.serializeState().reletRemainder).toBe(0);
  });

  it('draws the re-lets by the stride over the vacancies, across a save', () => {
    const build = (): BuildingRegistry => {
      const g = createGrid();
      const registry = new BuildingRegistry(catalog);
      for (const b of lay(registry, g, BLOCK, 20, 0)) b.vacancies = 40;
      return registry;
    };
    const whole = build();
    const wholeSystem = new DeathCareSystem(byId);
    run(wholeSystem, whole, RELET_TICKS, 0, 1);

    const part = build();
    const first = new DeathCareSystem(byId);
    run(first, part, 3000, 0, 1);
    const registry = BuildingRegistry.deserialize(
      catalog,
      JSON.parse(JSON.stringify(part.serialize())),
    );
    const second = new DeathCareSystem(byId);
    second.restoreState(JSON.parse(JSON.stringify(first.serializeState())));
    run(second, registry, RELET_TICKS - 3000, 0, 1);

    expect(wholeSystem.totalRelets).toBeGreaterThan(0);
    expect(second.totalRelets).toBe(wholeSystem.totalRelets);
    expect(vacanciesById(registry)).toEqual(vacanciesById(whole));
    // The stride spreads the re-lets: no building was left carrying them all.
    const touched = [...vacanciesById(whole).values()].filter((v) => v < 40).length;
    expect(touched).toBeGreaterThan(1);
  });

  it('does not re-let into a building that is not Active', () => {
    const g = createGrid();
    const registry = new BuildingRegistry(catalog);
    const [abandoned] = lay(registry, g, BLOCK, 1, 0, BuildingState.Abandoned);
    abandoned!.vacancies = 5;
    const system = new DeathCareSystem(byId);
    run(system, registry, 2 * RELET_TICKS, 0, 1);
    expect(system.totalRelets).toBe(0);
    expect(abandoned!.vacancies).toBe(5);
  });
});

describe('a city that stops attracting residents shrinks, and recovers when it starts again', () => {
  const emptyStats = (): CityStats => ({
    tick: 0,
    funds: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    population: 0,
    jobs: 0,
    employed: 0,
    demand: { res: 0, com: 0, ind: 0 },
    happiness: 50,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    sewerSupply: 0,
    sewerDemand: 0,
    waterFouled: 0,
    milestoneLevel: 0,
    milestoneProgress: 0,
    loanBalance: 0,
    taxRates: { res: 0.09, com: 0.09, ind: 0.09 },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
  });

  it('falls with demand at or below zero, recovers above it, and never drops a milestone', () => {
    const { registry, g } = cityOfTenThousand();
    const economy = new EconomySystem(catalog, []);
    const deathCare = new DeathCareSystem(byId);
    let stats = emptyStats();
    let tickNo = 0;

    const buildings = registry.all();
    // The economy re-sums every hundredth tick here, which is all a year-long run needs.
    const step = (demand: number): void => {
      tickNo += 1;
      if (tickNo % 100 === 1) {
        const { statsPatch } = economy.tick({ g, buildings, stats, tickNo });
        stats = { ...stats, ...statsPatch };
      }
      stats.demand = { res: demand, com: 0, ind: 0 };
      deathCare.tick(buildings, stats.population, demand, tickNo);
    };

    step(0);
    const founded = stats.population;
    const level = stats.milestoneLevel;
    expect(founded).toBe(10_000);
    expect(level).toBeGreaterThan(0);

    for (let t = 0; t < 3 * TICKS_PER_YEAR; t++) step(0);
    const trough = stats.population;
    expect(trough).toBeLessThan(founded - 200);
    expect(stats.milestoneLevel).toBe(level);
    expect(stats.milestoneProgress).toBeGreaterThanOrEqual(0);

    for (let t = 0; t < 2 * TICKS_PER_YEAR; t++) step(0.3);
    expect(stats.population).toBeGreaterThan(trough + 200);
    expect(stats.population).toBeGreaterThan(founded - 40);
    expect(stats.milestoneLevel).toBe(level);
    expect(MILESTONES[level]!.population).toBeLessThanOrEqual(founded);
  });
});
