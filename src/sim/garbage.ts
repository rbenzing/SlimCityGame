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
 * `trash` and the landfill fill are RUNTIME state (not part of the grid save);
 * they rebuild within a few ticks of a load, like traffic edge volume. Pure of
 * three.js/DOM; deterministic (no Math.random/Date.now) — collection order is
 * building-id-stable. Incinerators (Stage B) will add per-facility buffers that
 * burn over time; this module already models the landfill half of that loop.
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

const clampTile = (v: number): number => (v < 0 ? 0 : v > TRASH_TILE_MAX ? TRASH_TILE_MAX : v);

export class GarbageSystem {
  /** Per-tile uncollected trash, 0..TRASH_TILE_MAX. Runtime only (not saved). */
  readonly trash: Uint8Array;
  /** Total trash units currently piled across the landfill area. */
  private landfillStoredUnits = 0;

  constructor(size: number) {
    this.trash = new Uint8Array(size * size);
  }

  /** Generation + landfill collection. Call on the GARBAGE_PERIOD cadence. */
  tick(grid: GridState, buildings: readonly GarbageBuilding[]): void {
    const footprints = footprintsByBuildingId(grid);
    const ordered = [...buildings].sort((a, b) => a.id - b.id);
    this.generate(footprints, ordered);
    this.collectLandfill(grid, footprints, ordered);
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
  }
}
