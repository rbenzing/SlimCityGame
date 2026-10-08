/**
 * Garbage & waste (§21) — trash generation + collection.
 *
 * Every GARBAGE_PERIOD ticks the worker calls tick() with the active
 * residential/commercial/industrial buildings. A trash unit is 0.25 kg. Each
 * building deposits trash on its footprint tiles per head: its residents and
 * jobs each carry a daily kilogram figure, spread over the day's passes, and the
 * whole units the running total crosses are emitted on each pass. A painted LANDFILL area then
 * collects the trash of every building within its road-BFS service radius into
 * a shared store, raising the pile; once the store is full (area capacity =
 * tiles × LANDFILL_CAPACITY_PER_TILE) it collects nothing and trash backs up.
 * Uncollected trash stays on the per-tile `trash` layer for the 'trash' lens.
 *
 * Incinerator facilities collect within their own road-BFS radius into a
 * per-building buffer (bufferCapacity) and burn it down at burnRate every pass;
 * a full buffer stops that facility collecting. Where several incinerators
 * reach the same building they take its trash in equal shares, so the load
 * evens out across the group, and they collect before the landfill does: an
 * incinerator processes what it takes, a landfill only keeps it, which is the
 * waste hierarchy's order. The incinerator's catalog `pollution` is emitted by
 * the worker's per-building emit pass scaled by what it burned against its
 * ceiling (`incineratorEmission`) — an idle combustor makes no smoke, a full
 * one makes all of it.
 *
 * Kerbside recycling depots divert at source: a home they serve (few homes in
 * the building, within the depot's road reach and remaining capacity) sets its
 * recyclables out in the cart, so they never reach the trash tiles.
 *
 * Materials Recovery Facilities sort recycling, never rubbish: each takes, up
 * to its throughput, the depots' carts first and then its own round's — the
 * blocks and businesses in its road reach that kerbside does not serve, whose
 * recycling is likewise set aside at source. Whatever is sorted, in town or by
 * the regional plant that takes the carts no MRF does, is recovered at
 * MRF_YIELD_PERCENT and tallied for the economy to credit once a month. A town
 * MRF's residue fills its store and is forwarded to the nearest final facility
 * its streets reach; a full store stops it.
 *
 * The landfill fill, incinerator buffers and MRF residue stores are saved
 * (GarbageSaveState, in the save meta); the per-tile `trash` layer and the trucks are RUNTIME state that
 * rebuilds within a few ticks of a load. Pure of three.js/DOM; deterministic (no
 * Math.random/Date.now) — collection order is building-id-stable.
 */
import type { GridState } from '../shared/types';
import {
  KERBSIDE_MAX_HOMES,
  LANDFILL_CAPACITY_PER_TILE,
  LANDFILL_COLLECTION_RANGE,
  GARBAGE_PASSES_PER_DAY,
  MRF_KG_PER_COMMERCIAL_JOB_DAY,
  MRF_KG_PER_HOME_DAY,
  MRF_KG_PER_INDUSTRIAL_JOB_DAY,
  MRF_YIELD_PERCENT,
  RECYCLING_KG_PER_RESIDENT_DAY,
  TRASH_KG_PER_JOB_DAY,
  TRASH_KG_PER_RESIDENT_DAY,
  TRASH_TILE_MAX,
  TRASH_UNITS_PER_TONNE,
} from '../shared/constants';
import { landfillTileCount, landfillTiles } from '../world/landfill';
import {
  footprintsByBuildingId,
  nearestRoadTile,
  radiateWeighted,
  roadBfsDistances,
} from './services';

/**
 * An Active R/C/I building the worker hands to the garbage pass: who lives and
 * works in it, how many homes it holds (0 when it is none), and its catalog
 * category, which sets what a job recycles on an MRF round (a mixed-use block
 * is `res`, and its jobs are shops).
 */
export interface GarbageBuilding {
  id: number;
  residents: number;
  jobs: number;
  homes: number;
  category: 'res' | 'com' | 'ind';
}

/** Trash units in `kg` kilograms, rounded to shed float noise. */
const unitsOf = (kg: number): number =>
  Math.round(((kg * TRASH_UNITS_PER_TONNE) / 1000) * 1e6) / 1e6;

/**
 * The whole units a daily rate of `unitsPerDay` emits on garbage pass `pass`:
 * the rate is spread over the day's passes as a fraction and each pass emits the
 * whole units the running total crossed, so a day sums exactly with no stored
 * remainder.
 */
function emittedOnPass(unitsPerDay: number, pass: number): number {
  const total = (n: number): number => Math.floor((unitsPerDay * n) / GARBAGE_PASSES_PER_DAY);
  return total(pass + 1) - total(pass);
}

const totalKgPerDay = (b: GarbageBuilding): number =>
  b.residents * TRASH_KG_PER_RESIDENT_DAY + b.jobs * TRASH_KG_PER_JOB_DAY;

/** Trash units a building emits on garbage pass `pass`, all of it as refuse. */
export function unitsOnPass(b: GarbageBuilding, pass: number): number {
  return emittedOnPass(unitsOf(totalKgPerDay(b)), pass);
}

/** A building of one to KERBSIDE_MAX_HOMES homes: the kerbside round's, never an MRF's. */
const isKerbsideSized = (b: GarbageBuilding): boolean =>
  b.homes >= 1 && b.homes <= KERBSIDE_MAX_HOMES;

/** The recycling (kg a day) a building's residents set out in the kerbside cart. */
export function kerbsideKgPerDay(b: GarbageBuilding): number {
  return b.residents * RECYCLING_KG_PER_RESIDENT_DAY;
}

/**
 * The recycling (kg a day) an MRF round takes from a building: a block's homes
 * and every job, by its category. A building kerbside serves gives it none.
 */
export function roundKgPerDay(b: GarbageBuilding): number {
  if (isKerbsideSized(b)) return 0;
  const homes = b.residents > 0 ? b.homes * MRF_KG_PER_HOME_DAY : 0;
  const perJob =
    b.category === 'ind' ? MRF_KG_PER_INDUSTRIAL_JOB_DAY : MRF_KG_PER_COMMERCIAL_JOB_DAY;
  return homes + b.jobs * perJob;
}

/**
 * The recycling and refuse units a served building emits on garbage pass
 * `pass` when it sets `recyclingKgPerDay` aside: each stream by its own
 * cumulative floor, so each sums exactly over a day.
 */
export function servedUnitsOnPass(
  b: GarbageBuilding,
  pass: number,
  recyclingKgPerDay: number,
): { recycling: number; refuse: number } {
  const recyclingPerDay = unitsOf(recyclingKgPerDay);
  const refusePerDay = Math.round((unitsOf(totalKgPerDay(b)) - recyclingPerDay) * 1e6) / 1e6;
  return {
    recycling: emittedOnPass(recyclingPerDay, pass),
    refuse: emittedOnPass(refusePerDay, pass),
  };
}

/**
 * The recovered share of `units` sorted after `before` were sorted the same
 * day: MRF_YIELD_PERCENT of the day's running total, floored, so a day's
 * recovered is exact and the residue is the rest of each pass.
 */
export function recoveredOf(before: number, units: number): number {
  const kept = (n: number): number => Math.floor((n * MRF_YIELD_PERCENT) / 100);
  return kept(before + units) - kept(before);
}

/** The most an MRF can sort, up to `budget`, whose residue still fits `room`. */
function largestTake(budget: number, room: number, before: number): number {
  const residue = (s: number): number => s - recoveredOf(before, s);
  if (residue(budget) <= room) return budget;
  let lo = 0;
  let hi = budget;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (residue(mid) <= room) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A placed kerbside recycling depot (catalog `garbage` spec with `servesHomes`),
 * by building instance id: the road-BFS radius its trucks reach and the homes it
 * can serve in all.
 */
export interface GarbageDepot {
  id: number;
  collectionRange: number;
  servesHomes: number;
}

/** What a depot served on the last pass, for the UI readout. */
export interface DepotServed {
  id: number;
  servedHomes: number;
  capacityHomes: number;
}

/**
 * A placed Materials Recovery Facility (catalog `garbage` spec with
 * `sortRate`), by building instance id: its round's road-BFS radius, the units
 * it sorts a pass and the residue its store holds.
 */
export interface GarbageMrf {
  id: number;
  collectionRange: number;
  sortRate: number;
  residueCapacity: number;
}

/** What an MRF did on the last pass, for the UI readout. */
export interface MrfSorted {
  id: number;
  sorted: number;
  servedBuildings: number;
  residue: number;
  stopped: boolean;
}

/**
 * A placed incinerator (catalog `garbage` spec), by building instance id. Its
 * footprint tiles come from the grid, like any building; `collectionRange` is
 * the road-BFS radius it services, `bufferCapacity` how much it can hold, and
 * `burnRate` how much it burns per pass.
 */
export interface GarbageFacility {
  id: number;
  collectionRange: number;
  bufferCapacity: number;
  burnRate: number;
}

/**
 * The persistable garbage fill: the landfill pile total + each incinerator's
 * buffer (by building id). The per-tile trash layer and cosmetic trucks are
 * NOT saved — they rebuild within a few ticks of a load.
 */
export interface GarbageSaveState {
  landfillStored: number;
  incinerators: { id: number; units: number }[];
  /** Recycling units recovered since the last month boundary; absent in older saves. */
  recoveredThisMonth?: number;
  /** Each MRF's stored residue, by building id; absent in older saves. */
  mrfs?: { id: number; residue: number }[];
}

const clampTile = (v: number): number => (v < 0 ? 0 : v > TRASH_TILE_MAX ? TRASH_TILE_MAX : v);

/** The street a footprint's trucks leave by, or null when no road is near it. */
const streetOf = (grid: GridState, footprint: readonly number[] | undefined): number | null =>
  footprint && footprint.length > 0 ? nearestRoadTile(grid, footprint) : null;

/**
 * Road distance from a footprint's street to every road tile connected to it,
 * at any distance: the network a plant trades with. Null with no street.
 */
function roadNetworkOf(
  grid: GridState,
  footprint: readonly number[] | undefined,
): ReadonlyMap<number, number> | null {
  const street = streetOf(grid, footprint);
  return street === null ? null : roadBfsDistances(grid, street, Infinity);
}

/** A depot's recycling this pass, and the street its trucks leave by. */
interface Cart {
  units: number;
  street: number | null;
}

/** True when a facility's reach covers any tile of a building's footprint. */
const reaches = (
  coverage: ReadonlyMap<number, number>,
  tiles: readonly number[] | undefined,
): boolean => !!tiles && tiles.some((ti) => (coverage.get(ti) ?? 0) > 0);

/**
 * The pollution an incinerator emits this pass: its catalog figure scaled by
 * the share of its burn ceiling it used on the last garbage pass, so the plume
 * follows the trash. A combustor with no ceiling is taken as always at it.
 */
export function incineratorEmission(pollution: number, burned: number, burnRate: number): number {
  if (!(burnRate > 0)) return pollution;
  return Math.round(pollution * Math.max(0, Math.min(1, burned / burnRate)));
}

/** A collector's reach and what it can still take this pass. */
interface Collector {
  facility: GarbageFacility;
  coverage: ReadonlyMap<number, number>;
  remaining: number;
  collected: number;
}

export class GarbageSystem {
  /** Per-tile uncollected trash, 0..TRASH_TILE_MAX. Runtime only (not saved). */
  readonly trash: Uint8Array;
  /** Total trash units currently piled across the landfill area. */
  private landfillStoredUnits = 0;
  /** Per-incinerator stored trash, by building id. Runtime only (not saved). */
  private readonly incineratorStore = new Map<number, number>();
  /** Trash each incinerator burned on the last pass (drives Pollution emit). */
  private readonly incineratorBurned = new Map<number, number>();
  /** Recycling units recovered since the last month boundary. */
  private recoveredUnits = 0;
  /** What each kerbside depot served on the last pass. */
  private depotsServed: DepotServed[] = [];
  /** Each MRF's stored residue, by building id. */
  private readonly mrfResidue = new Map<number, number>();
  /** Units each MRF has sorted so far today, which the recovered share is floored on. */
  private readonly mrfSortedToday = new Map<number, number>();
  /** Units the regional plant has sorted so far today. */
  private regionalSortedToday = 0;
  /** What each MRF did on the last pass. */
  private mrfsSorted: MrfSorted[] = [];

  constructor(size: number) {
    this.trash = new Uint8Array(size * size);
  }

  /**
   * Kerbside and MRF rounds + generation + collection (incinerator facilities
   * in equal shares, then the landfill area for what they left) + incinerator
   * burn. Call on the GARBAGE_PERIOD cadence; `pass` is the running count of
   * garbage passes, which fixes how much each building emits. `facilities` is
   * empty when no incinerator is placed, `depots` when no kerbside recycling
   * depot is, `mrfs` when no Materials Recovery Facility is.
   */
  tick(
    grid: GridState,
    buildings: readonly GarbageBuilding[],
    pass: number,
    facilities: readonly GarbageFacility[] = [],
    depots: readonly GarbageDepot[] = [],
    mrfs: readonly GarbageMrf[] = [],
  ): void {
    if (pass % GARBAGE_PASSES_PER_DAY === 0) {
      this.mrfSortedToday.clear();
      this.regionalSortedToday = 0;
    }
    const footprints = footprintsByBuildingId(grid);
    const ordered = [...buildings].sort((a, b) => a.id - b.id);
    const splits = new Map<number, { recycling: number; refuse: number }>();
    const carts = this.serveKerbside(grid, footprints, ordered, depots, pass, splits);
    this.sortRecycling(grid, footprints, ordered, pass, carts, splits, mrfs, facilities);
    this.generate(footprints, ordered, pass, splits);
    this.collectAndBurnIncinerators(grid, footprints, ordered, facilities);
    this.collectLandfill(grid, footprints, ordered);
  }

  /**
   * The buildings the kerbside depots serve this pass, recomputed from scratch.
   * Depots in id order take, along their road reach, the buildings in id order
   * with residents and few enough homes, a building once, while the depot has
   * homes left to cover it. Each served building's split goes into `splits`;
   * returns each depot's recycling units this pass and the street it leaves
   * by, in depot id order.
   */
  private serveKerbside(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
    depots: readonly GarbageDepot[],
    pass: number,
    splits: Map<number, { recycling: number; refuse: number }>,
  ): Cart[] {
    this.depotsServed = [];
    const carts: Cart[] = [];
    const eligible = buildings.filter((b) => b.residents > 0 && isKerbsideSized(b));
    for (const d of [...depots].sort((a, b) => a.id - b.id)) {
      let remaining = d.servesHomes;
      let units = 0;
      const coverage = this.reachOf(grid, footprints, d);
      if (coverage) {
        for (const b of eligible) {
          if (splits.has(b.id) || remaining < b.homes) continue;
          if (!reaches(coverage, footprints.get(b.id))) continue;
          const split = servedUnitsOnPass(b, pass, kerbsideKgPerDay(b));
          splits.set(b.id, split);
          units += split.recycling;
          remaining -= b.homes;
        }
      }
      carts.push({ units, street: units > 0 ? streetOf(grid, footprints.get(d.id)) : null });
      this.depotsServed.push({
        id: d.id,
        servedHomes: d.servesHomes - remaining,
        capacityHomes: d.servesHomes,
      });
    }
    return carts;
  }

  /**
   * The MRFs, in id order, each take up to their sort budget this pass — less
   * what would overfill their residue store, and nothing once it is full: the
   * carts of the depots their streets connect to first, at any distance, depot
   * by depot, then their round's buildings in id
   * order within reach, each once across all plants, while its recycling this
   * pass fits what is left. What each sorts is recovered at MRF_YIELD_PERCENT
   * and the residue forwarded from its store; carts no plant took are sorted
   * regionally, their residue leaving the map. Stores of removed MRFs are dropped.
   */
  private sortRecycling(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
    pass: number,
    carts: readonly Cart[],
    splits: Map<number, { recycling: number; refuse: number }>,
    mrfs: readonly GarbageMrf[],
    facilities: readonly GarbageFacility[],
  ): void {
    const live = new Set(mrfs.map((m) => m.id));
    for (const id of [...this.mrfResidue.keys()]) if (!live.has(id)) this.mrfResidue.delete(id);
    for (const id of [...this.mrfSortedToday.keys()]) {
      if (!live.has(id)) this.mrfSortedToday.delete(id);
    }
    this.mrfsSorted = [];
    const unclaimed = carts.map((c) => c.units);
    const round = buildings.filter((b) => roundKgPerDay(b) > 0);
    for (const m of [...mrfs].sort((a, b) => a.id - b.id)) {
      // The plant's whole road network, walked once this pass and only if needed.
      let walked: ReadonlyMap<number, number> | null | undefined;
      const network = (): ReadonlyMap<number, number> | null =>
        walked === undefined ? (walked = roadNetworkOf(grid, footprints.get(m.id))) : walked;
      const stored = this.mrfResidue.get(m.id) ?? 0;
      const before = this.mrfSortedToday.get(m.id) ?? 0;
      const stopped = stored >= m.residueCapacity;
      let room = stopped ? 0 : largestTake(m.sortRate, m.residueCapacity - stored, before);
      let sorted = 0;
      for (let i = 0; i < unclaimed.length && room > 0; i++) {
        const street = carts[i]!.street;
        if (unclaimed[i]! <= 0 || street === null || !network()?.has(street)) continue;
        const take = Math.min(room, unclaimed[i]!);
        unclaimed[i] = unclaimed[i]! - take;
        room -= take;
        sorted += take;
      }
      let servedBuildings = 0;
      const coverage = room > 0 ? this.reachOf(grid, footprints, m) : null;
      if (coverage) {
        for (const b of round) {
          if (room <= 0) break;
          if (splits.has(b.id) || !reaches(coverage, footprints.get(b.id))) continue;
          const split = servedUnitsOnPass(b, pass, roundKgPerDay(b));
          if (split.recycling > room) continue;
          splits.set(b.id, split);
          room -= split.recycling;
          sorted += split.recycling;
          servedBuildings += 1;
        }
      }
      const recovered = recoveredOf(before, sorted);
      this.recoveredUnits += recovered;
      this.mrfSortedToday.set(m.id, before + sorted);
      const residue = this.forwardResidue(
        grid,
        footprints,
        network,
        stored + sorted - recovered,
        facilities,
      );
      this.mrfResidue.set(m.id, residue);
      this.mrfsSorted.push({ id: m.id, sorted, servedBuildings, residue, stopped });
    }
    const regional = unclaimed.reduce((sum, n) => sum + n, 0);
    this.recoveredUnits += recoveredOf(this.regionalSortedToday, regional);
    this.regionalSortedToday += regional;
  }

  /**
   * Sends `units` of an MRF's residue to the final facilities on its road
   * `network` (its street's, at any distance) — nearest first, a landfill
   * before an incinerator at the same distance, then by incinerator id — each
   * taking up to its room. Returns what is left in the MRF's store.
   */
  private forwardResidue(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    network: () => ReadonlyMap<number, number> | null,
    units: number,
    facilities: readonly GarbageFacility[],
  ): number {
    if (units <= 0) return 0;
    const reached = network();
    if (reached === null) return units;
    const distanceTo = (footprint: readonly number[]): number | undefined => {
      const road = streetOf(grid, footprint);
      return road === null ? undefined : reached.get(road);
    };
    const sinks: { distance: number; order: number; room: number; take: (n: number) => void }[] =
      [];
    const capacity = landfillTileCount(grid) * LANDFILL_CAPACITY_PER_TILE;
    if (capacity > 0) {
      const distance = distanceTo(landfillTiles(grid).map((t) => t.z * grid.size + t.x));
      if (distance !== undefined) {
        sinks.push({
          distance,
          order: -1,
          room: capacity - this.landfillStoredUnits,
          take: (n) => {
            this.landfillStoredUnits += n;
          },
        });
      }
    }
    for (const f of facilities) {
      const distance = distanceTo(footprints.get(f.id) ?? []);
      if (distance === undefined) continue;
      const held = this.incineratorStore.get(f.id) ?? 0;
      sinks.push({
        distance,
        order: f.id,
        room: f.bufferCapacity - held,
        take: (n) => {
          this.incineratorStore.set(f.id, (this.incineratorStore.get(f.id) ?? 0) + n);
        },
      });
    }
    sinks.sort((a, b) => a.distance - b.distance || a.order - b.order);
    let left = units;
    for (const sink of sinks) {
      if (left <= 0) break;
      const n = Math.min(left, Math.max(0, sink.room));
      if (n <= 0) continue;
      sink.take(n);
      left -= n;
    }
    return left;
  }

  private generate(
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
    pass: number,
    splits: ReadonlyMap<number, { recycling: number; refuse: number }>,
  ): void {
    for (const b of buildings) {
      const tiles = footprints.get(b.id);
      if (!tiles || tiles.length === 0) continue;
      const units = splits.get(b.id)?.refuse ?? unitsOnPass(b, pass);
      if (units <= 0) continue;
      const each = Math.floor(units / tiles.length);
      const extra = units % tiles.length;
      tiles.forEach((ti, i) => {
        this.trash[ti] = clampTile(this.trash[ti]! + each + (i < extra ? 1 : 0));
      });
    }
  }

  private collectLandfill(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
  ): void {
    const capacity = landfillTileCount(grid) * LANDFILL_CAPACITY_PER_TILE;
    if (capacity <= 0) return; // no landfill painted
    let remaining = capacity - this.landfillStoredUnits;
    if (remaining <= 0) return; // full -> nothing collected, trash backs up

    const areaTiles = landfillTiles(grid).map((t) => t.z * grid.size + t.x);
    const start = nearestRoadTile(grid, areaTiles);
    if (start === null) return; // landfill has no road access -> can't collect
    const reached = roadBfsDistances(grid, start, LANDFILL_COLLECTION_RANGE);
    const coverage = radiateWeighted(reached, LANDFILL_COLLECTION_RANGE, 1);
    if (coverage.size === 0) return;

    for (const b of buildings) {
      if (remaining <= 0) break;
      const tiles = footprints.get(b.id);
      if (!tiles || tiles.length === 0) continue;
      const covered = tiles.some((ti) => (coverage.get(ti) ?? 0) > 0);
      if (!covered) continue;
      for (const ti of tiles) {
        if (remaining <= 0) break;
        const amt = Math.min(this.trash[ti]!, remaining);
        if (amt <= 0) continue;
        this.trash[ti]! -= amt;
        this.landfillStoredUnits += amt;
        remaining -= amt;
      }
    }
  }

  /**
   * The incinerators collect the trash of the buildings within their road-BFS
   * radius into their buffers (up to bufferCapacity), then each burns burnRate
   * off the top. A building reached by several takes an equal share to each,
   * so two plants over one town carry the same load; a facility whose buffer
   * is full takes nothing (its share goes to the others, or backs up) but
   * still burns. Buildings and facilities go in id order for determinism.
   * Buffers for removed incinerators are dropped.
   */
  private collectAndBurnIncinerators(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
    facilities: readonly GarbageFacility[],
  ): void {
    const live = new Set(facilities.map((f) => f.id));
    for (const id of [...this.incineratorStore.keys()]) if (!live.has(id)) this.drop(id);

    const ordered = [...facilities].sort((a, b) => a.id - b.id);
    const collectors: Collector[] = [];
    for (const f of ordered) {
      const remaining = f.bufferCapacity - (this.incineratorStore.get(f.id) ?? 0);
      const coverage = remaining > 0 ? this.reachOf(grid, footprints, f) : null;
      if (coverage) collectors.push({ facility: f, coverage, remaining, collected: 0 });
    }
    if (collectors.length > 0) {
      for (const b of buildings) {
        const btiles = footprints.get(b.id);
        if (!btiles || btiles.length === 0) continue;
        const reaching = collectors.filter(
          (c) => c.remaining > 0 && btiles.some((ti) => (c.coverage.get(ti) ?? 0) > 0),
        );
        if (reaching.length === 0) continue;
        const taken = this.shareOut(this.trashOn(btiles), reaching);
        this.takeFrom(btiles, taken);
      }
    }

    const collectedBy = new Map(collectors.map((c) => [c.facility.id, c.collected]));
    for (const f of ordered) {
      let stored = (this.incineratorStore.get(f.id) ?? 0) + (collectedBy.get(f.id) ?? 0);
      const burned = Math.min(stored, Math.max(0, f.burnRate));
      stored -= burned;
      this.incineratorStore.set(f.id, stored);
      this.incineratorBurned.set(f.id, burned);
    }
  }

  /** The tiles a facility's trucks reach, or null when it has no road to leave by. */
  private reachOf(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    f: { id: number; collectionRange: number },
  ): ReadonlyMap<number, number> | null {
    const start = streetOf(grid, footprints.get(f.id));
    if (start === null) return null;
    const reached = roadBfsDistances(grid, start, f.collectionRange);
    const coverage = radiateWeighted(reached, f.collectionRange, 1);
    return coverage.size === 0 ? null : coverage;
  }

  private trashOn(tiles: readonly number[]): number {
    let total = 0;
    for (const ti of tiles) total += this.trash[ti]!;
    return total;
  }

  /**
   * Divides `units` of one building's trash among the collectors reaching it,
   * a unit at a time round the group in id order so no one is ahead by more
   * than one, each stopping at its room; returns what was taken in all.
   */
  private shareOut(units: number, reaching: Collector[]): number {
    let pool = units;
    let taken = 0;
    let open = reaching.filter((c) => c.remaining > 0);
    while (pool > 0 && open.length > 0) {
      const each = Math.max(1, Math.floor(pool / open.length));
      for (const c of open) {
        if (pool <= 0) break;
        const amt = Math.min(each, c.remaining, pool);
        c.remaining -= amt;
        c.collected += amt;
        pool -= amt;
        taken += amt;
      }
      open = open.filter((c) => c.remaining > 0);
    }
    return taken;
  }

  /** Clears `units` of trash off a building's tiles, first tile first. */
  private takeFrom(tiles: readonly number[], units: number): void {
    let left = units;
    for (const ti of tiles) {
      if (left <= 0) break;
      const amt = Math.min(this.trash[ti]!, left);
      this.trash[ti]! -= amt;
      left -= amt;
    }
  }

  private drop(id: number): void {
    this.incineratorStore.delete(id);
    this.incineratorBurned.delete(id);
  }

  /** Trash units currently buffered in the given incinerator (0 if unknown). */
  incineratorStored(id: number): number {
    return this.incineratorStore.get(id) ?? 0;
  }

  /** Trash the given incinerator burned on the last pass (drives pollution). */
  incineratorBurnedLast(id: number): number {
    return this.incineratorBurned.get(id) ?? 0;
  }

  /** Returns the recycling units recovered since the last call and clears the tally. */
  takeRecoveredThisMonth(): number {
    const units = this.recoveredUnits;
    this.recoveredUnits = 0;
    return units;
  }

  /** What each kerbside depot served on the last pass. */
  depotSnapshot(): DepotServed[] {
    return this.depotsServed.map((d) => ({ ...d }));
  }

  /** What each Materials Recovery Facility sorted, served and holds after the last pass. */
  mrfSnapshot(): MrfSorted[] {
    return this.mrfsSorted.map((m) => ({ ...m }));
  }

  /** Residue units stored at the given MRF (0 if unknown). */
  mrfResidueStored(id: number): number {
    return this.mrfResidue.get(id) ?? 0;
  }

  /** Total trash units piled in the landfill area. */
  landfillStored(): number {
    return this.landfillStoredUnits;
  }

  /** 0..1 fill of the landfill area (0 when no area is painted). */
  landfillFillFraction(grid: GridState): number {
    const capacity = landfillTileCount(grid) * LANDFILL_CAPACITY_PER_TILE;
    return capacity > 0 ? Math.min(1, this.landfillStoredUnits / capacity) : 0;
  }

  /** True once every landfill tile is full and collection has stopped. */
  isLandfillFull(grid: GridState): boolean {
    const capacity = landfillTileCount(grid) * LANDFILL_CAPACITY_PER_TILE;
    return capacity > 0 && this.landfillStoredUnits >= capacity;
  }

  /** Clears runtime trash + fill (e.g. on load — the trash layer is not persisted). */
  reset(): void {
    this.trash.fill(0);
    this.landfillStoredUnits = 0;
    this.incineratorStore.clear();
    this.incineratorBurned.clear();
    this.recoveredUnits = 0;
    this.depotsServed = [];
    this.mrfResidue.clear();
    this.mrfSortedToday.clear();
    this.regionalSortedToday = 0;
    this.mrfsSorted = [];
  }

  /** The persistable fill state (landfill pile, incinerator buffers, MRF residue, month's recovery). */
  serializeState(): GarbageSaveState {
    return {
      recoveredThisMonth: this.recoveredUnits,
      landfillStored: this.landfillStoredUnits,
      incinerators: [...this.incineratorStore.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, units]) => ({ id, units })),
      mrfs: [...this.mrfResidue.entries()]
        .filter(([, residue]) => residue > 0)
        .sort((a, b) => a[0] - b[0])
        .map(([id, residue]) => ({ id, residue })),
    };
  }

  /** Restores fill saved by serializeState (call after reset). Ignores undefined (pre-Stage-A saves). */
  restoreState(state: GarbageSaveState | undefined): void {
    if (!state) return;
    this.landfillStoredUnits = Math.max(0, state.landfillStored || 0);
    this.recoveredUnits = Math.max(0, state.recoveredThisMonth || 0);
    this.incineratorStore.clear();
    for (const { id, units } of state.incinerators ?? []) {
      if (units > 0) this.incineratorStore.set(id, units);
    }
    this.mrfResidue.clear();
    for (const { id, residue } of state.mrfs ?? []) {
      if (residue > 0) this.mrfResidue.set(id, residue);
    }
  }
}
