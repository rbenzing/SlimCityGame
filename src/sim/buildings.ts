/**
 * Building instance registry. Owns the authoritative set of
 * placed/grown BuildingInstances and stamps/clears their footprint onto
 * GridState.buildingId. Pure bookkeeping — no three.js/DOM, no randomness.
 */
import { inBounds, tileIndex } from '../shared/constants';
import { BuildingState } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingCategory,
  BuildingInstance,
  GridState,
} from '../shared/types';

interface Footprint {
  w: number;
  d: number;
}

/** Rotation 1 (90°) and 3 (270°) swap width/depth; 0 and 2 keep them. */
export function footprintForRotation(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
): Footprint {
  const { w, d } = entry.footprint;
  return rotation % 2 === 1 ? { w: d, d: w } : { w, d };
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
