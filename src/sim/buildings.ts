/**
 * Building instance registry. Owns the authoritative set of
 * placed/grown BuildingInstances and stamps/clears their footprint onto
 * GridState.buildingId. Pure bookkeeping — no three.js/DOM, no randomness.
 */
import { inBounds, tileIndex } from '../shared/constants';
import { footprintForRotation, type Footprint } from '../shared/footprint';
import { BuildingState } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingCategory,
  BuildingDelta,
  BuildingInstance,
  GridState,
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
  w: number;
  d: number;
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
  ): BuildingInstance | null {
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

  /** Clears the stamped tiles for `id` and forgets the instance. */
  remove(g: GridState, id: number): BuildingInstance | null {
    const instance = this.instances.get(id);
    if (!instance) return null;

    const footprint = this.footprints.get(id) ?? { w: 1, d: 1 };
    for (let dz = 0; dz < footprint.d; dz++) {
      for (let dx = 0; dx < footprint.w; dx++) {
        const tx = instance.x + dx;
        const tz = instance.z + dz;
        if (!inBounds(tx, tz)) continue;
        const idx = tileIndex(tx, tz);
        if (readU32(g.buildingId, idx) === id) {
          g.buildingId[idx] = 0;
        }
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
      residents += entry.residents ?? 0;
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
        w: footprint.w,
        d: footprint.d,
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
      registry.instances.set(b.id, instance);
      registry.footprints.set(b.id, { w: b.w, d: b.d });
    }
    return registry;
  }
}
