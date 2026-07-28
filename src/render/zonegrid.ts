/**
 * Zoning-grid visualization: while a zone tool is active, a city builder
 * shows two things over the city — a grid over every tile you could
 * usefully zone (buildable, road- and building-free, within reach of a
 * road), and a colored tint over tiles that already carry a zone.
 *
 * The layers are merged, TERRAIN-CONFORMING geometry (every vertex sampled
 * through heightAt, the roadsmesh.ts corner-sampling pattern) rather than
 * flat quads, which would be buried by the uphill part of any sloped tile
 * (zonable tiles allow up to MAX_BUILD_SLOPE (4m) of height delta). The look
 * follows the standard look: thin near-white grid LINES along the tile
 * boundaries (shared boundaries deduped via {@link boundaryEdges}) over a
 * subtle grey cell fill, plus the RCI-colored tint layer for painted zones.
 *
 * The zonable-tile SELECTION rule lives in
 * {@link ../world/zonable.ts} (standard perpendicular-frontage marching,
 * depth 4, stopping at the first blocking cell, never off a dangling road
 * end) — this module just re-exports it applied to a `ZoneGridSource`, so the
 * grid matches world/grid.ts's zone-painting gate exactly.
 *
 *  - `rebuild(grid)`: recomputes the zonable-tile fill + boundary-line
 *    layers from a grid snapshot. Pure selection logic lives in
 *    {@link computeZonableTiles} (world/zonable.ts); pure line dedup in
 *    {@link boundaryEdges}. Call once per road-network change (the caller
 *    owns the dirty flag — e.g. only on a RoadTileDelta batch — not once per
 *    frame).
 *  - `applyZonePatches(patches)`: folds incoming SimSnapshot.zones
 *    ZonePatch[] rectangles into a cached per-tile zone byte array, then
 *    rebuilds the tint layer from that cache with the RCI
 *    palette. The cache persists across rebuild() calls (a road changing
 *    elsewhere must not forget previously-painted zones).
 *  - `setVisible(v)`: all layers together (the grid, like the
 *    zoning it reflects, is only meaningful while a zone tool is selected).
 *    Neither `rebuild` nor `applyZonePatches` ever touches mesh.visible —
 *    `setVisible` is the ONLY mutator, so the hide-when-idle flag survives
 *    any number of rebuilds/patches while a non-zone tool is in hand.
 */
import * as THREE from 'three';
import { ZoneType, type ZonePatch } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import {
  computeZonableTiles as computeZonableTilesFrontage,
  type ZonableGridSource,
} from '../world/zonable';

// Conforming-layer stack: fill under tint under lines, all under the road
// plates at 0.15 (roadsmesh.ts ROAD_Y_OFFSET) so cells never float over
// adjacent asphalt. Because each cell now shares the terrain's exact
// triangulation (see pushConformingQuad + CELL_SUBDIV), these small offsets
// clear the ground everywhere with no poke-through.
const FILL_Y_OFFSET = 0.09;
const TINT_Y_OFFSET = 0.11;
const LINE_Y_OFFSET = 0.13;
/** Grid-line strip width in meters (thin white tile lines). */
export const LINE_WIDTH_M = 0.35;
/**
 * One quad per tile. A tile's 4 corners land exactly on the terrain mesh's
 * own vertices, and pushConformingQuad splits on the terrain's diagonal, so a
 * cell reproduces the rendered ground surface + yOffset. Subdividing finer
 * would sample the bilinear heightAt between terrain vertices, which dips
 * below the terrain's flat triangles and lets land poke through — the exact
 * bug this avoids. Kept as a named constant so the layer vertex counts (and
 * their tests) stay derived from it.
 */
export const CELL_SUBDIV = 1;

const FILL_OPACITY = 0.16;
const LINE_OPACITY = 0.55;
const TINT_OPACITY = 0.5;

/** Subtle grey cell fill under the lines (the standard grey-tiles read). */
const FILL_RGB: readonly [number, number, number] = [0.78, 0.82, 0.86];
/** Near-white boundary lines. */
const LINE_RGB: readonly [number, number, number] = [0.96, 0.97, 0.98];

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

// RCI palette.
const RCI_RES_RGB = hexToRgb01(0x63c96a);
const RCI_COM_RGB = hexToRgb01(0x4a9fe3);
const RCI_IND_RGB = hexToRgb01(0xe3a44a);
// Zoning-types expansion — new zones stay within the RCI
// residential/commercial families (so the palette still reads as one system)
// but each gets its own shade so the drawer's four residential cards (and the
// fifth Mixed card) are visually distinguishable on the grid, not just in the
// tool label:
//   ResMediumRow — a deeper, cooler green than ResLow/ResHigh's base green.
//   ResMedium    — a lighter, yellower green.
//   Mixed        — a distinct TEAL: still green-dominant (it IS a residential
//                   sector per growth.ts's zoneSector()) but with blue lifted
//                   partway toward the commercial blue, reading as "between"
//                   res-green and com-blue — the com-ground-floor-plus-
//                   apartments identity the zone actually has.
const RCI_RES_MEDIUM_ROW_RGB = hexToRgb01(0x4fae62);
const RCI_RES_MEDIUM_RGB = hexToRgb01(0x8fd66a);
const RCI_MIXED_RGB = hexToRgb01(0x3fc9a8);

/** RCI tint color for a painted zone, or null for ZoneType.None (unpainted —
 * not drawn on the tint layer). Pure and exported for tests. */
export function zoneTintColor(zone: ZoneType): readonly [number, number, number] | null {
  switch (zone) {
    case ZoneType.ResLow:
    case ZoneType.ResHigh:
      return RCI_RES_RGB;
    case ZoneType.ResMediumRow:
      return RCI_RES_MEDIUM_ROW_RGB;
    case ZoneType.ResMedium:
      return RCI_RES_MEDIUM_RGB;
    case ZoneType.Mixed:
      return RCI_MIXED_RGB;
    case ZoneType.ComLow:
    case ZoneType.ComHigh:
      return RCI_COM_RGB;
    case ZoneType.Industrial:
      return RCI_IND_RGB;
    default:
      return null;
  }
}

/**
 * The subset of GridState (src/shared/types.ts) zonegrid needs to compute
 * the zonable-tile grid. Structurally identical to world/zonable.ts's
 * ZonableGridSource (both this render layer and zone painting read the same
 * shape from the same GridState/client-grid mirror) — aliased, not
 * redeclared, so the two can never silently drift apart. A real GridState
 * satisfies this structurally, but tests can hand-build a minimal grid
 * without the other layers (trees, fields, power, watered, ...) zonegrid
 * never looks at.
 */
export type ZoneGridSource = ZonableGridSource;

/**
 * Zonable tiles for the render grid: delegates entirely to
 * world/zonable.ts's `computeZonableTiles` (standard perpendicular-frontage model
 * — perpendicular march off a road's frontage sides, depth 4, stopping at
 * the first blocking cell, never off a dangling road end), the ONE shared
 * predicate that also drives zone painting. Re-exported (rather than importing
 * zonable's function directly at call sites) so callers/tests of
 * `render/zonegrid.ts` keep a stable import path. Pure and exported for direct
 * unit testing.
 */
export function computeZonableTiles(g: ZoneGridSource): Array<{ x: number; z: number }> {
  return computeZonableTilesFrontage(g);
}

/** One tile-boundary line segment: the `side` edge of tile (x, z). */
export interface TileEdge {
  x: number;
  z: number;
  side: 'N' | 'E' | 'S' | 'W';
}

/**
 * Deduped boundary-line segments for a tile set: every tile owns its North
 * (z-) and West (x-) edge unconditionally; it owns its East/South edge only
 * when no tile of the set adjoins there (that neighbor would otherwise draw
 * the same boundary as its own W/N edge). A lone tile yields 4 edges; two
 * side-by-side tiles yield 7 (the shared boundary drawn exactly once).
 * Pure and exported for tests.
 */
export function boundaryEdges(tiles: Array<{ x: number; z: number }>): TileEdge[] {
  const inSet = new Set(tiles.map((t) => `${t.x},${t.z}`));
  const edges: TileEdge[] = [];
  for (const t of tiles) {
    edges.push({ x: t.x, z: t.z, side: 'N' });
    edges.push({ x: t.x, z: t.z, side: 'W' });
    if (!inSet.has(`${t.x + 1},${t.z}`)) edges.push({ x: t.x, z: t.z, side: 'E' });
    if (!inSet.has(`${t.x},${t.z + 1}`)) edges.push({ x: t.x, z: t.z, side: 'S' });
  }
  return edges;
}

interface TintTile {
  x: number;
  z: number;
  color: readonly [number, number, number];
}

type HeightSampler = (x: number, z: number) => number;

/**
 * Two triangles covering the quad (x0,z0)-(x1,z1), every corner's y sampled
 * through `heightAt` + yOffset. The split runs on the (x0,z1)-(x1,z0)
 * diagonal to MATCH the terrain PlaneGeometry's own triangulation (which,
 * after its rotateX(-90deg), splits each cell on that same diagonal). Sharing
 * the terrain's triangulation is what lets the overlay sit a constant yOffset
 * above the rendered ground instead of the bilinear surface cutting under the
 * terrain's flat triangles and letting land poke through. CCW from +Y.
 */
function pushConformingQuad(
  positions: number[],
  heightAt: HeightSampler,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
): void {
  const y00 = heightAt(x0, z0) + yOffset;
  const y10 = heightAt(x1, z0) + yOffset;
  const y11 = heightAt(x1, z1) + yOffset;
  const y01 = heightAt(x0, z1) + yOffset;
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
}

/** {@link pushConformingQuad} subdivided into CELL_SUBDIV² sub-quads — full-tile fills sample the in-tile terrain curve, not just its corners. */
function pushConformingCell(
  positions: number[],
  heightAt: HeightSampler,
  tileX: number,
  tileZ: number,
  yOffset: number,
): void {
  const step = TILE_METERS / CELL_SUBDIV;
  const baseX = tileX * TILE_METERS;
  const baseZ = tileZ * TILE_METERS;
  for (let sz = 0; sz < CELL_SUBDIV; sz++) {
    for (let sx = 0; sx < CELL_SUBDIV; sx++) {
      const x0 = baseX + sx * step;
      const z0 = baseZ + sz * step;
      pushConformingQuad(positions, heightAt, x0, z0, x0 + step, z0 + step, yOffset);
    }
  }
}

/** Vertices one edge-line strip contributes (2 length segments × 2 tris × 3 verts). */
export const VERTS_PER_EDGE_STRIP = 12;
/** Vertices one cell fill/tint contributes (CELL_SUBDIV² sub-quads × 6 verts). */
export const VERTS_PER_CELL = CELL_SUBDIV * CELL_SUBDIV * 6;

/** Thin conforming strip centered on a tile-boundary edge, split into two
 * length segments so its midpoint also tracks the terrain. */
function pushEdgeStrip(positions: number[], heightAt: HeightSampler, edge: TileEdge): void {
  const half = LINE_WIDTH_M / 2;
  const x = edge.x * TILE_METERS;
  const z = edge.z * TILE_METERS;
  const alongX = edge.side === 'N' || edge.side === 'S';
  // Boundary line position: N/W run along the tile's own min edge; E/S along max.
  const lineX = edge.side === 'E' ? x + TILE_METERS : x;
  const lineZ = edge.side === 'S' ? z + TILE_METERS : z;
  const mid = TILE_METERS / 2;

  if (alongX) {
    pushConformingQuad(positions, heightAt, x, lineZ - half, x + mid, lineZ + half, LINE_Y_OFFSET);
    pushConformingQuad(
      positions,
      heightAt,
      x + mid,
      lineZ - half,
      x + TILE_METERS,
      lineZ + half,
      LINE_Y_OFFSET,
    );
  } else {
    pushConformingQuad(positions, heightAt, lineX - half, z, lineX + half, z + mid, LINE_Y_OFFSET);
    pushConformingQuad(
      positions,
      heightAt,
      lineX - half,
      z + mid,
      lineX + half,
      z + TILE_METERS,
      LINE_Y_OFFSET,
    );
  }
}

export class ZoneGridRenderer {
  private readonly heightAt: HeightSampler;

  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly lineMaterial: THREE.MeshBasicMaterial;
  private readonly tintMaterial: THREE.MeshBasicMaterial;

  private readonly fillMesh: THREE.Mesh;
  private readonly lineMesh: THREE.Mesh;
  private readonly tintMesh: THREE.Mesh;

  private gridSize = 0;
  /** Cached last-known zone byte per tile (z*size+x), fed by applyZonePatches. */
  private zoneCache = new Uint8Array(0);

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.heightAt = heightAt;

    this.fillMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: FILL_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.fillMaterial.color.setRGB(...FILL_RGB);

    this.lineMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: LINE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.lineMaterial.color.setRGB(...LINE_RGB);

    this.tintMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: TINT_OPACITY,
      depthWrite: false,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.fillMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial);
    this.lineMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.lineMaterial);
    this.tintMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.tintMaterial);
    this.fillMesh.name = 'zonegrid-fill';
    this.lineMesh.name = 'zonegrid-lines';
    this.tintMesh.name = 'zonegrid-tint';
    this.fillMesh.visible = false;
    this.lineMesh.visible = false;
    this.tintMesh.visible = false;

    scene.add(this.fillMesh, this.lineMesh, this.tintMesh);
  }

  /** Recomputes the zonable-tile fill + boundary-line layers. Call once per
   * road-network change (caller-owned dirty flag), not once per frame. */
  rebuild(grid: ZoneGridSource): void {
    if (this.zoneCache.length !== grid.size * grid.size) {
      // Genuinely different map size: start the zone tint cache fresh.
      this.zoneCache = new Uint8Array(grid.size * grid.size);
    }
    this.gridSize = grid.size;

    const tiles = computeZonableTiles(grid);

    const fillPositions: number[] = [];
    for (const tile of tiles) {
      pushConformingCell(fillPositions, this.heightAt, tile.x, tile.z, FILL_Y_OFFSET);
    }
    this.setGeometry(this.fillMesh, fillPositions);

    const linePositions: number[] = [];
    for (const edge of boundaryEdges(tiles)) {
      pushEdgeStrip(linePositions, this.heightAt, edge);
    }
    this.setGeometry(this.lineMesh, linePositions);
  }

  /** Shows/hides the zonable grid (fill + lines) and the painted-zone tint layer together. */
  setVisible(v: boolean): void {
    this.fillMesh.visible = v;
    this.lineMesh.visible = v;
    this.tintMesh.visible = v;
  }

  /** Folds SimSnapshot.zones patches into the cached zone-per-tile state,
   * then rebuilds the painted-zone tint layer from the whole cache. */
  applyZonePatches(patches: ZonePatch[]): void {
    if (this.gridSize === 0 || patches.length === 0) return;

    for (const patch of patches) {
      for (let dz = 0; dz < patch.h; dz++) {
        for (let dx = 0; dx < patch.w; dx++) {
          const x = patch.x + dx;
          const z = patch.z + dz;
          if (x < 0 || z < 0 || x >= this.gridSize || z >= this.gridSize) continue;
          const value = patch.data[dz * patch.w + dx] ?? ZoneType.None;
          this.zoneCache[z * this.gridSize + x] = value;
        }
      }
    }

    this.rebuildTint();
  }

  private rebuildTint(): void {
    const tiles: TintTile[] = [];
    for (let z = 0; z < this.gridSize; z++) {
      for (let x = 0; x < this.gridSize; x++) {
        const zone = this.zoneCache[z * this.gridSize + x] as ZoneType;
        const color = zoneTintColor(zone);
        if (color) tiles.push({ x, z, color });
      }
    }

    const positions: number[] = [];
    const colors: number[] = [];
    for (const t of tiles) {
      const before = positions.length;
      pushConformingCell(positions, this.heightAt, t.x, t.z, TINT_Y_OFFSET);
      const added = (positions.length - before) / 3;
      for (let i = 0; i < added; i++) colors.push(t.color[0], t.color[1], t.color[2]);
    }
    this.setGeometry(this.tintMesh, positions, colors);
  }

  /** Replaces a mesh's geometry with fresh non-indexed triangles, disposing the old one. */
  private setGeometry(mesh: THREE.Mesh, positions: number[], colors?: number[]): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    if (colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    }
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  /** Live layer meshes (fill, lines, tint), for renderOrder tuning or inspection. */
  layers(): { fill: THREE.Mesh; lines: THREE.Mesh; tint: THREE.Mesh } {
    return { fill: this.fillMesh, lines: this.lineMesh, tint: this.tintMesh };
  }
}
