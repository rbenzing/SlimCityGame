/**
 * Building instance registry. Owns the authoritative set of
 * placed/grown BuildingInstances and stamps/clears their footprint onto
 * GridState.buildingId. Pure bookkeeping — no three.js/DOM, no randomness.
 */
import { inBounds, TILE_METERS, tileIndex } from '../shared/constants';
import { footprintForRotation, type Footprint } from '../shared/footprint';
import { claimedTiles, frameCorners } from '../shared/lotframe';
import { clampedVacancies, occupiedResidents } from '../shared/occupancy';
import { BuildingState } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingCategory,
  BuildingDelta,
  BuildingInstance,
  GridState,
  ParcelFrame,
  TilePoint,
} from '../shared/types';

/** Every in-bounds tile index of the w×d lot at (x, z). */
export function lotTiles(x: number, z: number, w: number, d: number): number[] {
  const tiles: number[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      if (inBounds(x + dx, z + dz)) tiles.push(tileIndex(x + dx, z + dz));
    }
  }
  return tiles;
}

/**
 * The tiles a building of `w` by `d` stands on: its rectangle from (x, z),
 * or, framed, every tile its turned parcel overlaps. The one reading the
 * registry, the worker and the growth pass share, so they stamp, level and
 * free the same ground.
 */
export function standingTiles(
  size: number,
  x: number,
  z: number,
  w: number,
  d: number,
  frame: ParcelFrame | undefined,
): TilePoint[] {
  if (frame !== undefined) return claimedTiles(frame, w * TILE_METERS, d * TILE_METERS, size);
  const tiles: TilePoint[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) tiles.push({ x: x + dx, z: z + dz });
  }
  return tiles;
}

/**
 * The building changes since the last snapshot as one delta the render thread
 * can apply in any order: every id in exactly one list, carrying the building
 * as it stands now.
 *
 * The changes arrive as a log, and a log can name one building twice — a home
 * updated when its construction finished and removed when it levelled up, both
 * before the next snapshot. Sent as logged, a renderer that applied the
 * removals first put the removed home straight back from its update, and its
 * roof stood on beside the bigger house that replaced it.
 *
 * A building no longer standing is removed and nothing else. One removed and
 * standing again under the same id — only a load does that — is an update: the
 * render thread still holds that id and has to redraw it.
 */
export function settleBuildingDelta(
  added: readonly BuildingInstance[],
  updated: readonly BuildingInstance[],
  removed: readonly number[],
  standing: (id: number) => BuildingInstance | undefined,
): BuildingDelta {
  const gone = new Set(removed);
  const delta: BuildingDelta = { added: [], updated: [], removed: [] };
  const sent = new Set<number>();
  const send = (id: number, isNew: boolean): void => {
    if (sent.has(id)) return;
    const now = standing(id);
    if (!now) return;
    sent.add(id);
    (isNew && !gone.has(id) ? delta.added : delta.updated).push({ ...now });
  };
  for (const b of added) send(b.id, true);
  for (const b of updated) send(b.id, false);
  for (const id of gone) if (!sent.has(id)) delta.removed.push(id);
  return delta;
}

/** Safe read of a possibly-out-of-range typed array slot (noUncheckedIndexedAccess). */
function readU32(arr: Uint32Array, idx: number): number {
  const v = arr[idx];
  return v === undefined ? 0 : v;
}

export interface SerializedBuildingInstance {
  id: number;
  catalogId: string;
  x: number;
  z: number;
  rotation: 0 | 1 | 2 | 3;
  level: number;
  state: BuildingState;
  problems: number;
  /** Written only when above 0; absent in older saves, which load every building full. */
  vacancies?: number;
  w: number;
  d: number;
  /** The parcel's frame where the building stands on a curved street; absent on a grid lot. */
  frame?: ParcelFrame;
}

/** Plain-data (JSON/ArrayBuffer friendly) snapshot of a BuildingRegistry. */
export interface SerializedBuildingRegistry {
  nextId: number;
  buildings: SerializedBuildingInstance[];
}

export class BuildingRegistry {
  private readonly catalogIndex: Map<string, BuildingCatalogEntry>;
  private readonly instances = new Map<number, BuildingInstance>();
  /** Footprint each instance was stamped with, keyed by id (rotation already applied). */
  private readonly footprints = new Map<number, Footprint>();
  private nextId = 1;

  constructor(catalog: BuildingCatalogEntry[]) {
    this.catalogIndex = new Map(catalog.map((entry) => [entry.id, entry]));
  }

  /**
   * Stamps `entry`'s footprint (rotated) into `g.buildingId` starting at
   * (x, z) and registers a new BuildingInstance. Returns null without
   * mutating the grid if any covered tile is out of bounds or occupied.
   */
  place(
    g: GridState,
    entry: BuildingCatalogEntry,
    x: number,
    z: number,
    rotation: 0 | 1 | 2 | 3,
    state: BuildingState = BuildingState.Active,
    frame?: ParcelFrame,
  ): BuildingInstance | null {
    // A framed building is the upright kind turned by its frame, never by a quarter turn.
    if (frame !== undefined) {
      return this.placeFramed(g, entry, frame, entry.footprint.w, entry.footprint.d, state);
    }
    const { w, d } = footprintForRotation(entry, rotation);

    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const tz = z + dz;
        if (!inBounds(tx, tz)) return null;
        if (readU32(g.buildingId, tileIndex(tx, tz)) !== 0) return null;
      }
    }

    const id = this.nextId++;
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        g.buildingId[tileIndex(x + dx, z + dz)] = id;
      }
    }

    const instance: BuildingInstance = {
      id,
      catalogId: entry.id,
      x,
      z,
      rotation,
      level: entry.level ?? 1,
      state,
      problems: 0,
    };
    this.instances.set(id, instance);
    this.footprints.set(id, { w, d });
    return instance;
  }

  /**
   * The tile-set form of `place`: a building on a turned parcel claims every
   * tile its rectangle in the frame overlaps, stands at the min tile of
   * them, and keeps rotation 0. Null, with the grid untouched, if the
   * rectangle leaves the map or any claimed tile is occupied.
   */
  private placeFramed(
    g: GridState,
    entry: BuildingCatalogEntry,
    frame: ParcelFrame,
    w: number,
    d: number,
    state: BuildingState,
  ): BuildingInstance | null {
    const extent = g.size * TILE_METERS;
    const onMap = (p: { x: number; z: number }): boolean =>
      p.x >= 0 && p.z >= 0 && p.x <= extent && p.z <= extent;
    if (!frameCorners(frame, w * TILE_METERS, d * TILE_METERS).every(onMap)) return null;
    const tiles = standingTiles(g.size, 0, 0, w, d, frame);
    if (tiles.length === 0) return null;
    for (const t of tiles) {
      if (!inBounds(t.x, t.z) || readU32(g.buildingId, tileIndex(t.x, t.z)) !== 0) return null;
    }

    const id = this.nextId++;
    for (const t of tiles) g.buildingId[tileIndex(t.x, t.z)] = id;
    const instance: BuildingInstance = {
      id,
      catalogId: entry.id,
      x: tiles[0]!.x,
      z: tiles[0]!.z,
      rotation: 0,
      level: entry.level ?? 1,
      state,
      problems: 0,
      frame: { x: frame.x, z: frame.z, heading: frame.heading },
    };
    this.instances.set(id, instance);
    this.footprints.set(id, { w, d });
    return instance;
  }

  /** Clears the stamped tiles for `id` and forgets the instance. */
  remove(g: GridState, id: number): BuildingInstance | null {
    const instance = this.instances.get(id);
    if (!instance) return null;

    const footprint = this.footprints.get(id) ?? { w: 1, d: 1 };
    const tiles = standingTiles(
      g.size,
      instance.x,
      instance.z,
      footprint.w,
      footprint.d,
      instance.frame,
    );
    for (const { x: tx, z: tz } of tiles) {
      if (!inBounds(tx, tz)) continue;
      const idx = tileIndex(tx, tz);
      if (readU32(g.buildingId, idx) === id) {
        g.buildingId[idx] = 0;
      }
    }

    this.instances.delete(id);
    this.footprints.delete(id);
    return instance;
  }

  get(id: number): BuildingInstance | undefined {
    return this.instances.get(id);
  }

  all(): BuildingInstance[] {
    return Array.from(this.instances.values());
  }

  byCategory(category: BuildingCategory): BuildingInstance[] {
    const out: BuildingInstance[] = [];
    for (const inst of this.instances.values()) {
      const entry = this.catalogIndex.get(inst.catalogId);
      if (entry && entry.category === category) out.push(inst);
    }
    return out;
  }

  /** Residents/jobs summed from the catalog entries of Active instances only. */
  totals(): { residents: number; jobs: number } {
    let residents = 0;
    let jobs = 0;
    for (const inst of this.instances.values()) {
      if (inst.state !== BuildingState.Active) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry) continue;
      residents += occupiedResidents(entry, inst);
      jobs += entry.jobs ?? 0;
    }
    return { residents, jobs };
  }

  /** Plain-object snapshot (numbers/strings only) fit for JSON/ArrayBuffer packing. */
  serialize(): SerializedBuildingRegistry {
    const buildings: SerializedBuildingInstance[] = [];
    for (const inst of this.instances.values()) {
      const footprint = this.footprints.get(inst.id) ?? { w: 1, d: 1 };
      buildings.push({
        id: inst.id,
        catalogId: inst.catalogId,
        x: inst.x,
        z: inst.z,
        rotation: inst.rotation,
        level: inst.level,
        state: inst.state,
        problems: inst.problems,
        ...(inst.vacancies ? { vacancies: inst.vacancies } : {}),
        w: footprint.w,
        d: footprint.d,
        ...(inst.frame ? { frame: { ...inst.frame } } : {}),
      });
    }
    return { nextId: this.nextId, buildings };
  }

  static deserialize(
    catalog: BuildingCatalogEntry[],
    data: SerializedBuildingRegistry,
  ): BuildingRegistry {
    const registry = new BuildingRegistry(catalog);
    registry.nextId = data.nextId;
    for (const b of data.buildings) {
      const instance: BuildingInstance = {
        id: b.id,
        catalogId: b.catalogId,
        x: b.x,
        z: b.z,
        rotation: b.rotation,
        level: b.level,
        state: b.state,
        problems: b.problems,
      };
      const spec = registry.catalogIndex.get(b.catalogId);
      const vacancies = spec ? clampedVacancies(spec, b.vacancies) : 0;
      if (vacancies > 0) instance.vacancies = vacancies;
      // A save from before frames carries none, and every building stands on the grid.
      if (b.frame) instance.frame = { x: b.frame.x, z: b.frame.z, heading: b.frame.heading };
      registry.instances.set(b.id, instance);
      registry.footprints.set(b.id, { w: b.w, d: b.d });
    }
    return registry;
  }

  /**
   * A save keeps each building's footprint, but the renderer draws a building on
   * its catalog footprint. When a ploppable's catalog footprint has since shrunk,
   * the old stamp is cut back to the new one inside it, at the first position
   * (by z, then x) whose tiles `fronts` a road, else at the origin, so the
   * building keeps the street it was served from; the tiles it no longer covers
   * are freed. Zoned buildings keep the footprint they were saved with.
   */
  restampShrunkPloppables(g: GridState, fronts: (tiles: readonly number[]) => boolean): void {
    for (const [id, inst] of this.instances) {
      const entry = this.catalogIndex.get(inst.catalogId);
      const stored = this.footprints.get(id);
      if (!entry || entry.zone !== undefined || !stored) continue;
      const now = footprintForRotation(entry, inst.rotation);
      if (now.w === stored.w && now.d === stored.d) continue;
      if (now.w > stored.w || now.d > stored.d) continue;

      let offX = 0;
      let offZ = 0;
      search: for (let oz = 0; oz <= stored.d - now.d; oz++) {
        for (let ox = 0; ox <= stored.w - now.w; ox++) {
          if (fronts(lotTiles(inst.x + ox, inst.z + oz, now.w, now.d))) {
            offX = ox;
            offZ = oz;
            break search;
          }
        }
      }

      for (let dz = 0; dz < stored.d; dz++) {
        for (let dx = 0; dx < stored.w; dx++) {
          const tx = inst.x + dx;
          const tz = inst.z + dz;
          if (!inBounds(tx, tz)) continue;
          const kept = dx >= offX && dx < offX + now.w && dz >= offZ && dz < offZ + now.d;
          if (kept) g.buildingId[tileIndex(tx, tz)] = id;
          else if (readU32(g.buildingId, tileIndex(tx, tz)) === id) {
            g.buildingId[tileIndex(tx, tz)] = 0;
          }
        }
      }
      inst.x += offX;
      inst.z += offZ;
      this.footprints.set(id, now);
    }
  }
}
