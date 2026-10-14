/**
 * Deaths, the bodies they leave, their collection, and the re-letting of the
 * homes they empty.
 *
 * Nothing here rolls a die. A city counter advances every tick by the
 * population times the death rate and a resident dies each time it passes 1;
 * a second counter advances by the vacancies over the days one takes to let,
 * but only while the town attracts residents, and a vacancy is filled each time
 * it passes 1. Both pick their building by the same fixed stride over the
 * residents (or the vacancies) in building-id order, so a run is identical
 * across a save and reload and proportional to where people live.
 *
 * Each death leaves a body at the building where it fell. A cemetery with room
 * interments the bodies of every building its roads reach, nearest cemetery
 * first; below the regional-service milestone whatever it did not take is
 * collected off the map the tick it falls and counted for the month's bill, and
 * from it the body stays where it fell, costing the tile its health.
 */
import {
  DEATH_CARE_MILESTONE,
  DEATH_CARE_PERIOD,
  DEATH_RATE_PER_RESIDENT_PER_TICK,
  MAP_TILES,
  TICKS_PER_DAY,
  VACANCY_RELET_DAYS,
  tileIndex,
} from '../shared/constants';
import { occupiedResidents, vacanciesOf } from '../shared/occupancy';
import type { BuildingCatalogEntry, BuildingInstance, GridState } from '../shared/types';
import { footprintsByBuildingId, reachOfFootprint, type UncollectedBody } from './services';

/** A prime step through the residents: consecutive picks land far apart and cover them all. */
const STRIDE = 7919;

/** Ticks a vacancy takes to be let: the divisor of the re-let counter's rate. */
const RELET_TICKS = VACANCY_RELET_DAYS * TICKS_PER_DAY;

/**
 * The counters a save keeps. The first four are absent in older saves, which
 * load with all four at zero; the rest arrived with the cemetery and load empty
 * when absent.
 */
export interface DeathCareSaveState {
  deathRemainder: number;
  deaths: number;
  reletRemainder: number;
  relets: number;
  /** Burials each cemetery holds, by building id. */
  interments?: { id: number; count: number }[];
  /** Bodies not yet collected: the tile (a grid index), how many, and the tick they fell. */
  backlog?: UncollectedBody[];
  /** Bodies the regional funeral service has taken since the last settlement. */
  regionalThisMonth?: number;
}

/** What one tick of the pass did. */
export interface DeathCareTick {
  deaths: number;
  relets: number;
}

/** A placed burial facility: its road reach and how many interments it holds before it is full. */
export interface DeathCareFacility {
  id: number;
  collectionRange: number;
  plots: number;
}

/** One body taken into a facility: the cemetery it goes to and the tile of the building it came from. */
export interface DeathCareVisit {
  facilityId: number;
  tile: number;
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

/** A whole number of at least `min`, or null. */
const wholeAtLeast = (n: unknown, min: number): number | null =>
  typeof n === 'number' && Number.isInteger(n) && n >= min ? n : null;

export class DeathCareSystem {
  private deathRemainder = 0;
  private deaths = 0;
  private reletRemainder = 0;
  private relets = 0;
  private lastTick: DeathCareTick = { deaths: 0, relets: 0 };
  /** Bodies not yet collected, oldest first. */
  private bodies: UncollectedBody[] = [];
  /** Burials each cemetery holds, by building id. */
  private readonly interments = new Map<number, number>();
  private regionalBodies = 0;

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

  /** The bodies still where they fell, oldest first. */
  get backlog(): readonly UncollectedBody[] {
    return this.bodies;
  }

  /** How many bodies are still where they fell. */
  get uncollected(): number {
    return this.bodies.reduce((sum, b) => sum + b.count, 0);
  }

  /** The tile of the oldest uncollected body, or undefined with none. */
  get oldestUncollectedTile(): number | undefined {
    return this.bodies.reduce<UncollectedBody | undefined>(
      (oldest, b) => (oldest === undefined || b.sinceTick < oldest.sinceTick ? b : oldest),
      undefined,
    )?.tile;
  }

  /** Bodies the regional funeral service has taken since the last settlement. */
  get regionalThisMonth(): number {
    return this.regionalBodies;
  }

  /** Returns the bodies the regional service took since the last call and clears the tally. */
  takeRegionalThisMonth(): number {
    const taken = this.regionalBodies;
    this.regionalBodies = 0;
    return taken;
  }

  /** Burials the given cemetery holds (0 if unknown). */
  intermentsOf(id: number): number {
    return this.interments.get(id) ?? 0;
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
      interments: [...this.interments.entries()]
        .filter(([, count]) => count > 0)
        .sort((a, b) => a[0] - b[0])
        .map(([id, count]) => ({ id, count })),
      backlog: this.bodies.map((b) => ({ ...b })),
      regionalThisMonth: this.regionalBodies,
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
    this.regionalBodies = count(state?.regionalThisMonth);

    this.interments.clear();
    const held = Array.isArray(state?.interments) ? state.interments : [];
    for (const entry of held) {
      const id = wholeAtLeast(entry?.id, 1);
      const burials = wholeAtLeast(entry?.count, 1);
      if (id !== null && burials !== null) this.interments.set(id, burials);
    }

    this.bodies = [];
    const waiting = Array.isArray(state?.backlog) ? state.backlog : [];
    for (const entry of waiting) {
      const tile = wholeAtLeast(entry?.tile, 0);
      const bodies = wholeAtLeast(entry?.count, 1);
      const sinceTick = wholeAtLeast(entry?.sinceTick, 0);
      if (tile !== null && tile < MAP_TILES && bodies !== null && sinceTick !== null) {
        this.bodies.push({ tile, count: bodies, sinceTick });
      }
    }
  }

  /**
   * One tick over the city. `population` is what the economy summed this tick;
   * `residentialDemand` gates the re-let, whose pace it never scales. Each death
   * leaves a body at its building's anchor tile, stamped with `tickNo`.
   */
  tick(
    buildings: readonly BuildingInstance[],
    population: number,
    residentialDemand: number,
    tickNo: number,
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
      if (home) {
        home.vacancies = (home.vacancies ?? 0) + 1;
        this.leaveBody(tileIndex(home.x, home.z), tickNo);
      }
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

  /**
   * Collects the bodies waiting, after this tick's deaths. The cemeteries take
   * theirs first, on the tick a body falls and then every DEATH_CARE_PERIOD
   * ticks for what still waits: bodies in building-id order, each into the
   * nearest cemetery with room whose road reach covers its building, ties by
   * facility id. Then, below DEATH_CARE_MILESTONE, the regional funeral service
   * takes every body left, the tick it falls; from it they stay where they fell.
   * Interments of cemeteries no longer standing are dropped. Returns one visit
   * per body-group a cemetery took, for the cosmetic hearses.
   */
  collect(
    grid: GridState,
    tickNo: number,
    milestoneLevel: number,
    facilities: readonly DeathCareFacility[],
  ): DeathCareVisit[] {
    const live = new Set(facilities.map((f) => f.id));
    for (const id of [...this.interments.keys()]) if (!live.has(id)) this.interments.delete(id);
    if (this.bodies.length === 0) return [];

    const visits: DeathCareVisit[] = [];
    const fellNow = this.bodies.some((b) => b.sinceTick === tickNo);
    if (fellNow || tickNo % DEATH_CARE_PERIOD === 0) this.intern(grid, facilities, visits);

    if (milestoneLevel < DEATH_CARE_MILESTONE) {
      for (const b of this.bodies) this.regionalBodies += b.count;
      this.bodies = [];
    }
    return visits;
  }

  /** Offers every waiting body to the cemeteries that reach it and have room. */
  private intern(
    grid: GridState,
    facilities: readonly DeathCareFacility[],
    visits: DeathCareVisit[],
  ): void {
    const room = (f: DeathCareFacility): number => f.plots - (this.interments.get(f.id) ?? 0);
    const open = facilities.filter((f) => room(f) > 0).sort((a, b) => a.id - b.id);
    if (open.length === 0) return;
    const footprints = footprintsByBuildingId(grid);
    const reaching = open.map((facility) => ({
      facility,
      coverage: reachOfFootprint(grid, footprints.get(facility.id), facility.collectionRange),
    }));
    if (!reaching.some((r) => r.coverage)) return;

    const buildingOf = (b: UncollectedBody): number => grid.buildingId[b.tile]!;
    const ordered = [...this.bodies].sort(
      (a, b) => buildingOf(a) - buildingOf(b) || a.tile - b.tile || a.sinceTick - b.sinceTick,
    );
    for (const body of ordered) {
      const tiles = footprints.get(buildingOf(body)) ?? [body.tile];
      while (body.count > 0) {
        let best: { facility: DeathCareFacility; reach: number } | null = null;
        for (const { facility, coverage } of reaching) {
          if (!coverage || room(facility) <= 0) continue;
          const reach = Math.max(...tiles.map((ti) => coverage.get(ti) ?? 0));
          if (reach > 0 && (best === null || reach > best.reach)) best = { facility, reach };
        }
        if (best === null) break;
        const taken = Math.min(body.count, room(best.facility));
        this.interments.set(best.facility.id, (this.interments.get(best.facility.id) ?? 0) + taken);
        body.count -= taken;
        visits.push({ facilityId: best.facility.id, tile: body.tile });
      }
    }
    this.bodies = this.bodies.filter((b) => b.count > 0);
  }

  /** One body at `tile`, merged into the entry for the same tile and tick when there is one. */
  private leaveBody(tile: number, tickNo: number): void {
    for (let i = this.bodies.length - 1; i >= 0 && this.bodies[i]!.sinceTick === tickNo; i--) {
      if (this.bodies[i]!.tile === tile) {
        this.bodies[i]!.count += 1;
        return;
      }
    }
    this.bodies.push({ tile, count: 1, sinceTick: tickNo });
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
