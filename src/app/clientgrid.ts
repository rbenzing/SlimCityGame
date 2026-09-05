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
import { TILE_METERS, worldToTile } from '../shared/constants';
import { RoadTier } from '../shared/types';
import {
  FIRST_CUSTOM_PROFILE_ID,
  isPresetProfileId,
  presetProfileForTier,
} from '../shared/roadprofile';
import { runsAlongZ, type BridgeDeckTile } from '../render/bridges';
import type {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  MapData,
  RoadProfile,
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
  readonly roadMask: Uint8Array;
  readonly roadElevation: Float32Array;
  /** Profile id per road tile (see GridState.roadProfile); presets equal their tier. */
  readonly roadProfile: Uint16Array;
  readonly buildingId: Uint32Array;

  /** building id -> the tile indices its footprint was stamped onto. */
  private readonly footprints = new Map<number, number[]>();
  /** The worker's table of player-composed profiles, by id. Presets are catalogue data. */
  private readonly customProfiles = new Map<number, RoadProfile>();

  constructor(map: MapData) {
    this.size = map.size;
    const n = map.size * map.size;
    this.height = map.height.slice();
    this.water = map.water.slice();
    this.zone = new Uint8Array(n);
    this.roadTier = new Uint8Array(n);
    this.roadMask = new Uint8Array(n);
    this.roadElevation = new Float32Array(n);
    this.roadProfile = new Uint16Array(n);
    this.buildingId = new Uint32Array(n);
  }

  /** Replaces the mirror's custom-profile table with the worker's full table. */
  applyRoadProfiles(table: readonly { id: number; profile: RoadProfile }[]): void {
    this.customProfiles.clear();
    for (const entry of table) this.customProfiles.set(entry.id, entry.profile);
  }

  /** The cross-section behind a profile id: a preset's, a custom one from the table, or null. */
  profileById(id: number): RoadProfile | null {
    if (id === 0) return null;
    if (isPresetProfileId(id)) return presetProfileForTier(id as RoadTier);
    return this.customProfiles.get(id) ?? null;
  }

  /** The cross-section a tile carries: its preset's, its custom profile, or null off-road. */
  profileAt(x: number, z: number): RoadProfile | null {
    if (!this.inBounds(x, z)) return null;
    return this.profileById(this.roadProfile[this.idx(x, z)] ?? 0);
  }

  /** The lowest id not yet holding a custom profile — what a new definition should claim. */
  nextCustomProfileId(): number {
    let id = FIRST_CUSTOM_PROFILE_ID;
    while (this.customProfiles.has(id)) id += 1;
    return id;
  }

  private idx(x: number, z: number): number {
    return z * this.size + x;
  }

  private inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size && z < this.size;
  }

  /**
   * Applies road deltas and reports back the tiles whose deck height moved.
   *
   * A deck lifts the road SURFACE of the tiles around it as well as its own —
   * the blend that turns an approach into a slope reaches a tile either side —
   * and those neighbours carry no delta of their own. Anything that baked the
   * old surface into geometry has to rebuild that halo, so the caller is handed
   * the list rather than left to work it out. Returning it also forces the only
   * safe call order: you cannot mesh the road against elevations the mirror has
   * not absorbed yet.
   */
  applyRoadDeltas(deltas: RoadTileDelta[]): TilePoint[] {
    const raised: TilePoint[] = [];
    for (const d of deltas) {
      if (!this.inBounds(d.x, d.z)) continue;
      const i = this.idx(d.x, d.z);
      if ((this.roadElevation[i] ?? 0) !== d.elevation) raised.push({ x: d.x, z: d.z });
      this.roadTier[i] = d.tier;
      this.roadProfile[i] = d.profile;
      this.roadMask[i] = d.mask;
      this.roadElevation[i] = d.elevation;
    }
    return raised;
  }

  /**
   * World height of the road surface at a tile centre: the terrain, plus the
   * deck if the tile carries one. What anything riding the road — traffic,
   * pedestrians, lamps, the road mesh — sits on.
   */
  deckHeightAt(x: number, z: number): number {
    if (!this.inBounds(x, z)) return 0;
    const i = this.idx(x, z);
    return (this.height[i] ?? 0) + (this.roadElevation[i] ?? 0);
  }

  /**
   * Height of the deck at a world point, or null where no deck governs it and
   * the caller should read the terrain instead.
   *
   * A deck's height varies ALONG the run and is constant ACROSS it: a bridge
   * has no camber. So this interpolates the deck profile in the run direction
   * only. Interpolating in both axes drags the edges of the deck toward
   * whatever the road is passing over — a tile centre is 8m away, and the
   * structure oversails the carriageway far enough to pick up a third of the
   * riverbed — which crowns the road into a ridge and splays the girder into
   * wedges hanging under it.
   */
  deckSurfaceAt(wx: number, wz: number): number | null {
    const tx = worldToTile(wx);
    const tz = worldToTile(wz);
    if (!this.nearElevated(tx, tz)) return null;

    const ribbon = this.ribbonTileAt(tx, tz);
    if (!ribbon) return null;

    const alongZ = runsAlongZ(this.roadMask[this.idx(ribbon.x, ribbon.z)] ?? 0);
    // Tile centres sit at (t + 0.5) * TILE_METERS, so shifting by half a tile
    // puts the samples on the centre lattice the interpolation runs over.
    const f = (alongZ ? wz : wx) / TILE_METERS - 0.5;
    const i0 = Math.floor(f);
    const s = f - i0;
    const near = alongZ ? this.deckHeightAt(ribbon.x, i0) : this.deckHeightAt(i0, ribbon.z);
    const far = alongZ ? this.deckHeightAt(ribbon.x, i0 + 1) : this.deckHeightAt(i0 + 1, ribbon.z);
    return near * (1 - s) + far * s;
  }

  /**
   * The road tile whose deck governs a sample taken in tile (x, z). Usually the
   * tile itself; a wide span's structure oversails its own tile, so a sample
   * just past the edge is resolved back onto the deck it hangs off rather than
   * onto the water underneath.
   */
  private ribbonTileAt(x: number, z: number): TilePoint | null {
    if (!this.inBounds(x, z)) return null;
    if (this.roadTier[this.idx(x, z)] !== RoadTier.None) return { x, z };
    for (const [dx, dz] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (!this.inBounds(nx, nz)) continue;
      const i = this.idx(nx, nz);
      if (this.roadTier[i] !== RoadTier.None && (this.roadElevation[i] ?? 0) > 0)
        return { x: nx, z: nz };
    }
    return null;
  }

  /** True where this tile or any of its 8 neighbours carries a deck. */
  nearElevated(x: number, z: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (!this.inBounds(nx, nz)) continue;
        if ((this.roadElevation[this.idx(nx, nz)] ?? 0) > 0) return true;
      }
    }
    return false;
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

  /**
   * Every road tile, row-major, tagged with its RoadTier and whether it is up
   * on a deck — the two things a tier-aware, deck-aware consumer (lamps, road
   * furniture, ground cover) needs to decide what belongs on it.
   */
  roadTiles(): (TilePoint & { tier: RoadTier; elevated: boolean })[] {
    const tiles: (TilePoint & { tier: RoadTier; elevated: boolean })[] = [];
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        const i = this.idx(x, z);
        const tier = this.roadTier[i] as RoadTier;
        if (tier !== RoadTier.None) tiles.push({ x, z, tier, elevated: (this.roadElevation[i] ?? 0) > 0 });
      }
    }
    return tiles;
  }

  /**
   * Every tile carrying a bridge deck, with what the structure renderer needs
   * to stand it up: how wide the carriageway is, which way it runs, and the gap
   * between deck and ground the piers have to fill.
   */
  deckTiles(): BridgeDeckTile[] {
    const tiles: BridgeDeckTile[] = [];
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        const i = this.idx(x, z);
        const tier = this.roadTier[i] as RoadTier;
        if (tier === RoadTier.None) continue;
        if ((this.roadElevation[i] ?? 0) === 0) continue;
        tiles.push({
          x,
          z,
          tier,
          mask: this.roadMask[i] ?? 0,
          deckY: this.deckHeightAt(x, z),
          groundY: this.height[i] ?? 0,
        });
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
