/**
 * Garbage & waste (§21) — trash generation + collection.
 *
 * Every GARBAGE_PERIOD ticks the worker calls tick() with the active
 * residential/commercial/industrial buildings. Each building deposits trash on
 * its footprint tiles (rate by sector × level). A painted LANDFILL area then
 * collects the trash of every building within its road-BFS service radius into
 * a shared store, raising the pile; once the store is full (area capacity =
 * tiles × LANDFILL_CAPACITY_PER_TILE) it collects nothing and trash backs up.
 * Uncollected trash stays on the per-tile `trash` layer for the 'trash' lens.
 *
 * Incinerator facilities collect within their own road-BFS radius into a
 * per-building buffer (bufferCapacity) and burn it down at burnRate every pass;
 * a full buffer stops that facility collecting. The incinerator's catalog
 * `pollution` is emitted by the worker's normal per-building emit pass while
 * it's active — the air-pollution trade-off for the permanent fix.
 *
 * `trash`, the landfill fill, and incinerator buffers are RUNTIME state (not
 * part of the grid save); they rebuild within a few ticks of a load, like
 * traffic edge volume. Pure of three.js/DOM; deterministic (no
 * Math.random/Date.now) — collection order is building-id-stable.
 */
import type { GridState } from '../shared/types';
import {
  LANDFILL_CAPACITY_PER_TILE,
  LANDFILL_COLLECTION_RANGE,
  TRASH_EMIT_COM,
  TRASH_EMIT_IND,
  TRASH_EMIT_RES,
  TRASH_TILE_MAX,
} from '../shared/constants';
import { landfillTileCount, landfillTiles } from '../world/landfill';
import {
  footprintsByBuildingId,
  nearestRoadTile,
  radiateWeighted,
  roadBfsDistances,
} from './services';

export type TrashSector = 'res' | 'com' | 'ind';

/** Per-pass trash a building adds, before its level multiplier. */
export const TRASH_EMIT_BY_SECTOR: Readonly<Record<TrashSector, number>> = {
  res: TRASH_EMIT_RES,
  com: TRASH_EMIT_COM,
  ind: TRASH_EMIT_IND,
};

/** An Active R/C/I building the worker hands to the garbage pass. */
export interface GarbageBuilding {
  id: number;
  sector: TrashSector;
  level: number;
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

const clampTile = (v: number): number => (v < 0 ? 0 : v > TRASH_TILE_MAX ? TRASH_TILE_MAX : v);

export class GarbageSystem {
  /** Per-tile uncollected trash, 0..TRASH_TILE_MAX. Runtime only (not saved). */
  readonly trash: Uint8Array;
  /** Total trash units currently piled across the landfill area. */
  private landfillStoredUnits = 0;
  /** Per-incinerator stored trash, by building id. Runtime only (not saved). */
  private readonly incineratorStore = new Map<number, number>();
  /** Trash each incinerator burned on the last pass (drives Pollution emit). */
  private readonly incineratorBurned = new Map<number, number>();

  constructor(size: number) {
    this.trash = new Uint8Array(size * size);
  }

  /**
   * Generation + collection (landfill area, then incinerator facilities) +
   * incinerator burn. Call on the GARBAGE_PERIOD cadence. `facilities` is empty
   * when no incinerator is placed.
   */
  tick(
    grid: GridState,
    buildings: readonly GarbageBuilding[],
    facilities: readonly GarbageFacility[] = [],
  ): void {
    const footprints = footprintsByBuildingId(grid);
    const ordered = [...buildings].sort((a, b) => a.id - b.id);
    this.generate(footprints, ordered);
    this.collectLandfill(grid, footprints, ordered);
    this.collectAndBurnIncinerators(grid, footprints, ordered, facilities);
  }

  private generate(
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
  ): void {
    for (const b of buildings) {
      const tiles = footprints.get(b.id);
      if (!tiles || tiles.length === 0) continue;
      const emit = TRASH_EMIT_BY_SECTOR[b.sector] * Math.max(1, b.level);
      const per = Math.max(1, Math.round(emit / tiles.length));
      for (const ti of tiles) this.trash[ti] = clampTile(this.trash[ti]! + per);
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
   * Each incinerator collects the trash of buildings within its road-BFS
   * radius into its buffer (up to bufferCapacity), then burns burnRate off the
   * top. Facilities are processed in building-id order for determinism; a
   * facility whose buffer is full collects nothing (trash backs up) but still
   * burns. Buffers for removed incinerators are dropped.
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
    for (const f of ordered) {
      let stored = this.incineratorStore.get(f.id) ?? 0;
      stored += this.collectInto(grid, footprints, buildings, f, f.bufferCapacity - stored);
      const burned = Math.min(stored, Math.max(0, f.burnRate));
      stored -= burned;
      this.incineratorStore.set(f.id, stored);
      this.incineratorBurned.set(f.id, burned);
    }
  }

  /** Pulls up to `budget` units of covered trash into the given facility. */
  private collectInto(
    grid: GridState,
    footprints: ReadonlyMap<number, number[]>,
    buildings: readonly GarbageBuilding[],
    f: GarbageFacility,
    budget: number,
  ): number {
    if (budget <= 0) return 0;
    const tiles = footprints.get(f.id);
    if (!tiles || tiles.length === 0) return 0;
    const start = nearestRoadTile(grid, tiles);
    if (start === null) return 0; // no road access -> can't collect
    const reached = roadBfsDistances(grid, start, f.collectionRange);
    const coverage = radiateWeighted(reached, f.collectionRange, 1);
    if (coverage.size === 0) return 0;

    let remaining = budget;
    let collected = 0;
    for (const b of buildings) {
      if (remaining <= 0) break;
      const btiles = footprints.get(b.id);
      if (!btiles || btiles.length === 0) continue;
      if (!btiles.some((ti) => (coverage.get(ti) ?? 0) > 0)) continue;
      for (const ti of btiles) {
        if (remaining <= 0) break;
        const amt = Math.min(this.trash[ti]!, remaining);
        if (amt <= 0) continue;
        this.trash[ti]! -= amt;
        collected += amt;
        remaining -= amt;
      }
    }
    return collected;
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

  /** Clears runtime trash + fill (e.g. on load — this state is not persisted). */
  reset(): void {
    this.trash.fill(0);
    this.landfillStoredUnits = 0;
    this.incineratorStore.clear();
    this.incineratorBurned.clear();
  }
}
