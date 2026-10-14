/**
 * Deaths and the re-letting of the homes they empty.
 *
 * Nothing here rolls a die. A city counter advances every tick by the
 * population times the death rate and a resident dies each time it passes 1;
 * a second counter advances by the vacancies over the days one takes to let,
 * but only while the town attracts residents, and a vacancy is filled each time
 * it passes 1. Both pick their building by the same fixed stride over the
 * residents (or the vacancies) in building-id order, so a run is identical
 * across a save and reload and proportional to where people live.
 */
import {
  DEATH_RATE_PER_RESIDENT_PER_TICK,
  TICKS_PER_DAY,
  VACANCY_RELET_DAYS,
} from '../shared/constants';
import { occupiedResidents, vacanciesOf } from '../shared/occupancy';
import type { BuildingCatalogEntry, BuildingInstance } from '../shared/types';

/** A prime step through the residents: consecutive picks land far apart and cover them all. */
const STRIDE = 7919;

/** Ticks a vacancy takes to be let: the divisor of the re-let counter's rate. */
const RELET_TICKS = VACANCY_RELET_DAYS * TICKS_PER_DAY;

/** The counters a save keeps: absent in older saves, which load with all four at zero. */
export interface DeathCareSaveState {
  deathRemainder: number;
  deaths: number;
  reletRemainder: number;
  relets: number;
}

/** What one tick of the pass did. */
export interface DeathCareTick {
  deaths: number;
  relets: number;
}

/**
 * The building holding the resident at `position` (0-based) among the
 * buildings' counts in the order given, or null when `position` is past them.
 */
function holderAt(
  ordered: readonly BuildingInstance[],
  countOf: (inst: BuildingInstance) => number,
  position: number,
): BuildingInstance | null {
  let remaining = position;
  for (const inst of ordered) {
    const count = countOf(inst);
    if (remaining < count) return inst;
    remaining -= count;
  }
  return null;
}

export class DeathCareSystem {
  private deathRemainder = 0;
  private deaths = 0;
  private reletRemainder = 0;
  private relets = 0;
  private lastTick: DeathCareTick = { deaths: 0, relets: 0 };

  constructor(private readonly catalog: ReadonlyMap<string, BuildingCatalogEntry>) {}

  /** Deaths since the city began, across saves. */
  get totalDeaths(): number {
    return this.deaths;
  }

  /** Vacancies re-let since the city began, across saves. */
  get totalRelets(): number {
    return this.relets;
  }

  /** What the last tick did: deaths and re-lets that fell in it. */
  get thisTick(): DeathCareTick {
    return this.lastTick;
  }

  reset(): void {
    this.restoreState(undefined);
  }

  serializeState(): DeathCareSaveState {
    return {
      deathRemainder: this.deathRemainder,
      deaths: this.deaths,
      reletRemainder: this.reletRemainder,
      relets: this.relets,
    };
  }

  /** Restores what serializeState saved; absent or malformed values load as zero. */
  restoreState(state: DeathCareSaveState | undefined): void {
    const count = (n: number | undefined): number =>
      Number.isFinite(n) && n! > 0 ? Math.floor(n!) : 0;
    const fraction = (n: number | undefined): number =>
      Number.isFinite(n) && n! > 0 ? Math.min(n!, 1 - Number.EPSILON) : 0;
    this.deathRemainder = fraction(state?.deathRemainder);
    this.deaths = count(state?.deaths);
    this.reletRemainder = fraction(state?.reletRemainder);
    this.relets = count(state?.relets);
    this.lastTick = { deaths: 0, relets: 0 };
  }

  /**
   * One tick over the city. `population` is what the economy summed this tick;
   * `residentialDemand` gates the re-let, whose pace it never scales.
   */
  tick(
    buildings: readonly BuildingInstance[],
    population: number,
    residentialDemand: number,
  ): DeathCareTick {
    let deaths = 0;
    let relets = 0;
    let ordered: BuildingInstance[] | null = null;
    const inIdOrder = (): BuildingInstance[] =>
      (ordered ??= [...buildings].sort((a, b) => a.id - b.id));

    this.deathRemainder += Math.max(0, population) * DEATH_RATE_PER_RESIDENT_PER_TICK;
    while (this.deathRemainder >= 1) {
      const living = (inst: BuildingInstance): number => this.occupiedOf(inst);
      let alive = 0;
      for (const inst of buildings) alive += living(inst);
      if (alive === 0) break;
      this.deathRemainder -= 1;
      this.deaths += 1;
      deaths += 1;
      const home = holderAt(inIdOrder(), living, (this.deaths * STRIDE) % alive);
      if (home) home.vacancies = (home.vacancies ?? 0) + 1;
    }

    if (residentialDemand > 0) {
      let vacant = this.totalVacancies(buildings);
      this.reletRemainder += vacant / RELET_TICKS;
      while (this.reletRemainder >= 1 && vacant > 0) {
        this.reletRemainder -= 1;
        this.relets += 1;
        relets += 1;
        const home = holderAt(
          inIdOrder(),
          (inst) => this.vacantOf(inst),
          (this.relets * STRIDE) % vacant,
        );
        if (home) {
          const left = (home.vacancies ?? 0) - 1;
          if (left > 0) home.vacancies = left;
          else delete home.vacancies;
        }
        vacant -= 1;
      }
      // With nothing left to let, a counter past 1 keeps only its fraction.
      if (vacant === 0) this.reletRemainder %= 1;
    }

    this.lastTick = { deaths, relets };
    return this.lastTick;
  }

  private occupiedOf(inst: BuildingInstance): number {
    const spec = this.catalog.get(inst.catalogId);
    return spec ? occupiedResidents(spec, inst) : 0;
  }

  private vacantOf(inst: BuildingInstance): number {
    const spec = this.catalog.get(inst.catalogId);
    return spec ? vacanciesOf(spec, inst) : 0;
  }

  private totalVacancies(buildings: readonly BuildingInstance[]): number {
    let total = 0;
    for (const inst of buildings) total += this.vacantOf(inst);
    return total;
  }
}
