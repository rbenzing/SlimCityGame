/**
 * Render-thread grid mirror. The worker owns the authoritative GridState;
 * this accumulates its snapshot deltas (RoadTileDelta / ZonePatch /
 * BuildingDelta) over the static map layers so render-side systems that need
 * whole-grid reads — ZoneGridRenderer.rebuild (zonable-cell grid),
 * LampRenderer.rebuild (accumulated road tiles), and the plop tool's
 * "Overlapping items" cursor-chip check — never have to round-trip the
 * worker. Structurally satisfies render/zonegrid.ts's ZoneGridSource
 * ({size, roadTier, water, zone, buildingId, height}).
 */
import { RoadTier } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  MapData,
  RoadTileDelta,
  TilePoint,
  ZonePatch,
} from '../shared/types';

export class ClientGridMirror {
  readonly size: number;
  readonly height: Float32Array;
  readonly water: Uint8Array;
  readonly zone: Uint8Array;
  readonly roadTier: Uint8Array;
  readonly buildingId: Uint32Array;

  /** building id -> the tile indices its footprint was stamped onto. */
  private readonly footprints = new Map<number, number[]>();

  constructor(map: MapData) {
    this.size = map.size;
    const n = map.size * map.size;
    this.height = map.height.slice();
    this.water = map.water.slice();
    this.zone = new Uint8Array(n);
    this.roadTier = new Uint8Array(n);
    this.buildingId = new Uint32Array(n);
  }

  private idx(x: number, z: number): number {
    return z * this.size + x;
  }

  private inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size && z < this.size;
  }

  applyRoadDeltas(deltas: RoadTileDelta[]): void {
    for (const d of deltas) {
      if (!this.inBounds(d.x, d.z)) continue;
      this.roadTier[this.idx(d.x, d.z)] = d.tier;
    }
  }

  /**
   * Applies terraform / auto-flatten height patches into the height mirror so
   * whole-grid readers stay in step with the
   * flattened terrain — notably ZoneGridRenderer.rebuild's slope-buildable
   * check, which reads this.height. Same {x,z,w,h,heights} shape as
   * terraform's HeightPatch and SimSnapshot.heightPatches; cells outside the
   * grid are skipped rather than throwing.
   */
  applyHeightPatches(
    patches: readonly { x: number; z: number; w: number; h: number; heights: Float32Array }[],
  ): void {
    for (const patch of patches) {
      for (let row = 0; row < patch.h; row++) {
        const z = patch.z + row;
        if (z < 0 || z >= this.size) continue;
        const rowBase = row * patch.w;
        for (let col = 0; col < patch.w; col++) {
          const x = patch.x + col;
          if (x < 0 || x >= this.size) continue;
          const v = patch.heights[rowBase + col];
          if (v !== undefined) this.height[this.idx(x, z)] = v;
        }
      }
    }
  }

  applyZonePatches(patches: ZonePatch[]): void {
    for (const patch of patches) {
      for (let dz = 0; dz < patch.h; dz++) {
        for (let dx = 0; dx < patch.w; dx++) {
          const x = patch.x + dx;
          const z = patch.z + dz;
          if (!this.inBounds(x, z)) continue;
          this.zone[this.idx(x, z)] = patch.data[dz * patch.w + dx] ?? 0;
        }
      }
    }
  }

  /**
   * Stamps added footprints, clears removed ones, and re-stamps updated
   * instances (state changes never move a building, but re-stamping keeps the
   * mirror exact even if a future delta ever alters rotation).
   */
  applyBuildingDelta(
    delta: BuildingDelta,
    entryFor: (catalogId: string) => BuildingCatalogEntry | undefined,
  ): void {
    for (const id of delta.removed) this.clearFootprint(id);
    for (const inst of delta.updated) {
      this.clearFootprint(inst.id);
      this.stampFootprint(inst, entryFor(inst.catalogId));
    }
    for (const inst of delta.added) this.stampFootprint(inst, entryFor(inst.catalogId));
  }

  /** Every road tile, row-major, tagged with its RoadTier for tier-aware consumers. */
  roadTiles(): (TilePoint & { tier: RoadTier })[] {
    const tiles: (TilePoint & { tier: RoadTier })[] = [];
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        const tier = this.roadTier[this.idx(x, z)] as RoadTier;
        if (tier !== RoadTier.None) tiles.push({ x, z, tier });
      }
    }
    return tiles;
  }

  /**
   * Whether a ploppable footprint can go here: every tile in bounds, dry,
   * road-free, and building-free (the geometric half of the worker's
   * canPlaceFootprint — slope is left to the worker's authoritative check).
   */
  isFreeForPlop(tiles: TilePoint[]): boolean {
    for (const t of tiles) {
      if (!this.inBounds(t.x, t.z)) return false;
      const i = this.idx(t.x, t.z);
      if (this.water[i]) return false;
      if (this.roadTier[i] !== RoadTier.None) return false;
      if (this.buildingId[i] !== 0) return false;
    }
    return true;
  }

  private stampFootprint(inst: BuildingInstance, entry: BuildingCatalogEntry | undefined): void {
    if (!entry) return;
    const swapped = inst.rotation === 1 || inst.rotation === 3;
    const w = swapped ? entry.footprint.d : entry.footprint.w;
    const d = swapped ? entry.footprint.w : entry.footprint.d;
    const indices: number[] = [];
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const x = inst.x + dx;
        const z = inst.z + dz;
        if (!this.inBounds(x, z)) continue;
        const i = this.idx(x, z);
        this.buildingId[i] = inst.id;
        indices.push(i);
      }
    }
    this.footprints.set(inst.id, indices);
  }

  private clearFootprint(id: number): void {
    const indices = this.footprints.get(id);
    if (!indices) return;
    for (const i of indices) {
      if (this.buildingId[i] === id) this.buildingId[i] = 0;
    }
    this.footprints.delete(id);
  }
}
