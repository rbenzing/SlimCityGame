/**
 * Tool ghost/preview renderer: translucent quads over the
 * tiles a tool is about to commit, plus a crisp footprint border frame and
 * (for ploppables) a volume box. Fully rebuilt on every setPreview() call — a
 * preview always replaces the whole previewed tile set (there is nothing to
 * incrementally patch between calls, unlike BuildingInstancer's add/remove
 * bookkeeping), so growth only ever needs a bigger empty buffer, never data
 * preservation across a resize.
 *
 * base/fill/border/inner are merged, TERRAIN-CONFORMING geometry — every
 * vertex's Y comes from heightAt sampled at that vertex's OWN (x,z), each
 * tile/edge further subdivided so mid-tile/mid-edge curvature is followed
 * too — exactly zonegrid.ts's pushConformingCell/pushConformingQuad pattern
 * (reimplemented locally here since ghosts.ts owns its own files), so a quad
 * never buries itself in a rising slope. The plop volume box keeps its rigid
 * BoxGeometry (a box's vertical sides are *supposed* to stay vertical, not
 * hug the ground) but samples every footprint corner — not just the center —
 * for its base height, so it always clears the highest point under it. The
 * stripe layer (a small road-only dash, already far smaller than a full tile)
 * stays instanced.
 *
 * Six layers (4 merged Mesh + 1 instanced Mesh for the stripe + 1 plain Mesh
 * for the volume box), all kept in the scene at all times (empty geometry /
 * count=0 / visible=false when nothing to show — mirrors VehicleRenderer's
 * always-present, fixed-mesh convention), added in this fixed order:
 *  - base: one conforming quad per tile. Accent blue for road/plop/bulldoze, a
 *    darker green "border" shade for zone (see fill below), orange-red
 *    whenever `valid` is false (overrides every other kind's color).
 *  - fill: zone only, valid only — a shrunk, brighter-green conforming quad on
 *    top of the base layer so the base peeks out as a darker cell border
 *    ("bright green cell fill with darker cell borders").
 *  - stripe: road only, valid only — a thin white dash on every other tile
 *    along the path (deterministic index-parity dashing, oriented along
 *    whichever local axis the path actually runs on). Still instanced.
 *  - border: a crisp ~0.18m-wide conforming frame around the
 *    previewed tile set's OUTER perimeter only — edges shared with another
 *    previewed tile are skipped (see computeFootprintEdges), so a solid block
 *    reads as ONE bordered shape, a ribbon as one outline, and a
 *    scattered/ringed set (e.g. a terraform brush ring) as automatic per-tile
 *    outlines. White 90% when valid, danger red when invalid — on EVERY
 *    kind, unlike the kind-tinted base layer.
 *  - inner: the same edge geometry, but drawn on every edge SHARED
 *    between two previewed tiles instead (faint 25%), so multi-tile
 *    footprints keep a readable tile count under the solid outer border.
 *    Same white/red validity switch as border (kind-agnostic, "invalid"
 *    overrides everything else, mirroring baseColorFor's precedent),
 *    differing only in opacity.
 *  - volume (additive): ONE translucent box — never instanced, there
 *    is only ever one live preview — sized to a ploppable's true footprint ×
 *    height, shown only when setPreview's `opts.volume` is supplied (plop
 *    tools only; road/zone/bulldoze/terraform previews never pass it, so
 *    they stay flat frames). Accent blue ~22%, red-tinted
 *    when invalid.
 */
import * as THREE from 'three';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

export type GhostKind = 'road' | 'zone' | 'plop' | 'bulldoze';

const INITIAL_CAPACITY = 64;

const GHOST_Y_OFFSET = 0.2;
const ZONE_FILL_Y_OFFSET = 0.21;
const STRIPE_Y_OFFSET = 0.22;
const BORDER_Y_OFFSET = 0.23;
const INNER_GRID_Y_OFFSET = 0.24;
/** The plop-volume box's bottom face sits flush with the base ghost quad's plane. */
const VOLUME_Y_OFFSET = GHOST_Y_OFFSET;

const ZONE_FILL_SHRINK = 0.8; // reveals the darker base layer as a border ring
const ZONE_BORDER_DARKEN = 0.55; // base-layer shade under the zone fill

const STRIPE_PERIOD = 2; // every other path tile carries a dash (deterministic)
const STRIPE_LENGTH_FRACTION = 0.6;
const STRIPE_WIDTH_FRACTION = 0.08;

const BASE_OPACITY = 0.55; // "valid = blue 55%"
const ZONE_FILL_OPACITY = 0.65;
const STRIPE_OPACITY = 0.9;
/** "A bright 2-px-feel border quad strip ... ~0.18m wide". */
const BORDER_WIDTH_METERS = 0.18;
/** "White at 90% when valid". */
const BORDER_OPACITY = 0.9;
/** "Faint (25%) per-tile division lines". */
const INNER_GRID_OPACITY = 0.25;
/** Accent blue ~22%, kept distinct from the 25% inner grid lines so the
 * volume box reads as its own opacity. */
const VOLUME_OPACITY = 0.22;

/** One quad per tile: its corners land on the terrain mesh's own vertices and
 * pushConformingQuad splits on the terrain's diagonal, so the ghost matches the
 * ground surface + yOffset. Finer subdivision would sample bilinear heights
 * that dip under the terrain's flat triangles and let land poke through. */
export const GHOST_CELL_SUBDIV = 1;
/** Length-axis sub-segments per border/inner edge strip (mirrors
 * zonegrid.ts's pushEdgeStrip 2-segment split) — the strip's own midpoint
 * also tracks the terrain, not just its two ends. */
export const GHOST_EDGE_LENGTH_SUBDIV = 2;

/** Vertices one tile's conforming base/fill quad contributes. */
export const VERTS_PER_GHOST_CELL = GHOST_CELL_SUBDIV * GHOST_CELL_SUBDIV * 6;
/** Vertices one border/inner edge segment contributes. */
export const VERTS_PER_GHOST_EDGE = GHOST_EDGE_LENGTH_SUBDIV * 6;

/** Style tokens, converted to 0..1 RGB (no colorSpace conversion —
 * material.color is set via setRGB so these pass through unmodified, matching
 * how buildings.ts's instance tinting works). Exported for direct testing. */
export function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

const WHITE_RGB: readonly [number, number, number] = [1, 1, 1];
const ACCENT_RGB = hexToRgb01(0x38b6e3); // accent
const ZONE_FILL_RGB = hexToRgb01(0x5dd06b); // positive
const INVALID_RGB = hexToRgb01(0xe5533f); // danger
const STRIPE_RGB = WHITE_RGB;

function darken(rgb: readonly [number, number, number], factor: number): [number, number, number] {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

const ZONE_BORDER_RGB = darken(ZONE_FILL_RGB, ZONE_BORDER_DARKEN);

/** Base-layer color for `kind` at the given validity. Pure and exported for tests. */
export function baseColorFor(kind: GhostKind, valid: boolean): readonly [number, number, number] {
  if (!valid) return INVALID_RGB;
  if (kind === 'zone') return ZONE_BORDER_RGB;
  return ACCENT_RGB;
}

/**
 * Border/inner-grid frame color: white when valid, the same
 * danger red as the base layer when invalid. Unlike baseColorFor, this is
 * kind-agnostic — every kind of preview shares one frame color. Pure and
 * exported for tests.
 */
export function frameColorFor(valid: boolean): readonly [number, number, number] {
  return valid ? WHITE_RGB : INVALID_RGB;
}

/** Plop-volume box color: accent blue when valid, danger red when invalid.
 * Pure and exported for tests. */
export function volumeColorFor(valid: boolean): readonly [number, number, number] {
  return valid ? ACCENT_RGB : INVALID_RGB;
}

/**
 * Whether the dash at path index `i` should be elongated along X (true) or Z
 * (false), inferred from its neighbors in the path: an L-path corner tile
 * defaults to X. Pure and exported for tests.
 */
export function stripeAxisIsX(tiles: readonly TilePoint[], i: number): boolean {
  const cur = tiles[i];
  if (!cur) return true;
  const prev = tiles[i - 1];
  const next = tiles[i + 1];
  if (prev && prev.z !== cur.z) return false;
  if (next && next.z !== cur.z) return false;
  return true;
}

type HeightSampler = (x: number, z: number) => number;

// ---------------------------------------------------------------------------
// Terrain-conforming geometry helpers (mirrors zonegrid.ts's
// pushConformingQuad/pushConformingCell — reimplemented locally since
// ghosts.ts owns only its own files).
// ---------------------------------------------------------------------------

/**
 * Two triangles covering the quad (x0,z0)-(x1,z1), every corner's y sampled
 * independently through `heightAt` + yOffset so the quad follows the terrain
 * contour instead of a single flat plane. CCW from +Y.
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
  // Split on the (x0,z1)-(x1,z0) diagonal to match the terrain PlaneGeometry's
  // triangulation, so the ghost reproduces the ground surface + yOffset
  // instead of the bilinear surface cutting under it.
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
}

/**
 * Merged, TERRAIN-CONFORMING position array for a set of ghost tiles (base or
 * zone-fill): each tile is a `size`x`size` footprint centered on the tile
 * center, split on the terrain's own triangle diagonal so it sits a constant
 * offset above the rendered ground. Pure, exported for direct testing of the
 * "never clips below its own terrain height" guarantee.
 */
export function buildConformingTilePositions(
  tiles: readonly TilePoint[],
  heightAt: HeightSampler,
  size: number,
  yOffset: number,
): Float32Array {
  const positions: number[] = [];
  const half = size / 2;
  const step = size / GHOST_CELL_SUBDIV;
  for (const t of tiles) {
    const centerX = (t.x + 0.5) * TILE_METERS;
    const centerZ = (t.z + 0.5) * TILE_METERS;
    const x0 = centerX - half;
    const z0 = centerZ - half;
    for (let sz = 0; sz < GHOST_CELL_SUBDIV; sz++) {
      for (let sx = 0; sx < GHOST_CELL_SUBDIV; sx++) {
        const cx0 = x0 + sx * step;
        const cz0 = z0 + sz * step;
        pushConformingQuad(positions, heightAt, cx0, cz0, cx0 + step, cz0 + step, yOffset);
      }
    }
  }
  return new Float32Array(positions);
}

/**
 * Merged, TERRAIN-CONFORMING position array for the border/inner-grid
 * edge strips: each segment is split into GHOST_EDGE_LENGTH_SUBDIV
 * length-wise sub-quads (its own midpoint tracks the terrain too, matching
 * zonegrid.ts's pushEdgeStrip). Pure, exported for direct testing.
 */
export function buildConformingEdgePositions(
  edges: readonly GhostEdgeSegment[],
  heightAt: HeightSampler,
  yOffset: number,
): Float32Array {
  const positions: number[] = [];
  for (const seg of edges) {
    const { sizeX, sizeZ } = edgeQuadSize(seg);
    const x0 = seg.cx - sizeX / 2;
    const z0 = seg.cz - sizeZ / 2;
    if (seg.alongX) {
      const step = sizeX / GHOST_EDGE_LENGTH_SUBDIV;
      for (let i = 0; i < GHOST_EDGE_LENGTH_SUBDIV; i++) {
        pushConformingQuad(
          positions,
          heightAt,
          x0 + i * step,
          z0,
          x0 + (i + 1) * step,
          z0 + sizeZ,
          yOffset,
        );
      }
    } else {
      const step = sizeZ / GHOST_EDGE_LENGTH_SUBDIV;
      for (let i = 0; i < GHOST_EDGE_LENGTH_SUBDIV; i++) {
        pushConformingQuad(
          positions,
          heightAt,
          x0,
          z0 + i * step,
          x0 + sizeX,
          z0 + (i + 1) * step,
          yOffset,
        );
      }
    }
  }
  return new Float32Array(positions);
}

// ---------------------------------------------------------------------------
// Footprint edge math (border + inner grid)
// ---------------------------------------------------------------------------

/**
 * One tile-edge-length segment of the frame, in world space.
 * `alongX`: true = the segment's long axis runs along world X (a
 * north/south-facing tile edge, i.e. the boundary between tiles stacked
 * along Z); false = long axis along world Z (an east/west-facing edge).
 */
export interface GhostEdgeSegment {
  cx: number;
  cz: number;
  alongX: boolean;
}

export interface FootprintEdges {
  /** Every tile edge whose neighboring tile is NOT also in the previewed set. */
  outer: GhostEdgeSegment[];
  /** Every tile edge shared between two previewed tiles, once per shared edge. */
  inner: GhostEdgeSegment[];
}

function tileKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * Per-tile-edge segments for the border frame: `outer` covers the
 * previewed tile set's true perimeter — one segment per remaining tile edge
 * (not merged into whole-side runs; adjoining segments simply butt up
 * edge-to-edge, one per remaining edge segment) — so a solid NxM block, a
 * 1-wide ribbon, or a scattered/holey set
 * (e.g. a terraform brush ring) all get their true outline automatically,
 * with no shape-specific logic. `inner` covers every edge shared between two
 * previewed tiles, emitted exactly once per shared edge: only each tile's
 * East/South neighbor is checked for the inner set, since that already
 * covers the reverse West/North pair from the other side.
 *
 * Pure — no THREE, no y-offset — so it's plain, fast geometry math, testable
 * standalone and shared by both the border and inner-grid layers (they
 * differ only in material). The RESULT (which edges land in outer vs inner)
 * depends only on which tiles are present, never on the input array's order.
 */
export function computeFootprintEdges(tiles: readonly TilePoint[]): FootprintEdges {
  const set = new Set<string>();
  for (const t of tiles) set.add(tileKey(t.x, t.z));

  const outer: GhostEdgeSegment[] = [];
  const inner: GhostEdgeSegment[] = [];

  for (const t of tiles) {
    const { x, z } = t;
    const minX = x * TILE_METERS;
    const maxX = minX + TILE_METERS;
    const minZ = z * TILE_METERS;
    const maxZ = minZ + TILE_METERS;
    const cx = minX + TILE_METERS / 2;
    const cz = minZ + TILE_METERS / 2;

    const hasNorth = set.has(tileKey(x, z - 1));
    const hasSouth = set.has(tileKey(x, z + 1));
    const hasEast = set.has(tileKey(x + 1, z));
    const hasWest = set.has(tileKey(x - 1, z));

    if (!hasNorth) outer.push({ cx, cz: minZ, alongX: true });
    if (!hasSouth) outer.push({ cx, cz: maxZ, alongX: true });
    if (!hasWest) outer.push({ cx: minX, cz, alongX: false });
    if (!hasEast) outer.push({ cx: maxX, cz, alongX: false });

    // Dedup shared inner edges: only ever emitted from a tile's East/South
    // side, so each physical shared edge appears exactly once.
    if (hasEast) inner.push({ cx: maxX, cz, alongX: false });
    if (hasSouth) inner.push({ cx, cz: maxZ, alongX: true });
  }

  return { outer, inner };
}

/** Border/inner-grid quad size (meters) for a segment's orientation. */
function edgeQuadSize(seg: GhostEdgeSegment): { sizeX: number; sizeZ: number } {
  return seg.alongX
    ? { sizeX: TILE_METERS, sizeZ: BORDER_WIDTH_METERS }
    : { sizeX: BORDER_WIDTH_METERS, sizeZ: TILE_METERS };
}

// ---------------------------------------------------------------------------
// Plop volume ghost
// ---------------------------------------------------------------------------

/** `setPreview`'s additive volume option: a ploppable's true
 * footprint (tiles) × height (meters), anchored at its origin (min-x/min-z) tile. */
export interface GhostVolume {
  w: number;
  d: number;
  heightMeters: number;
  originTile: TilePoint;
}

export interface SetPreviewOptions {
  volume?: GhostVolume;
}

export interface VolumeBoxTransform {
  centerX: number;
  centerZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

/**
 * Pure: world-space footprint-center X/Z and box scale for the plop
 * volume ghost. Negative w/d/heightMeters clamp to zero (mirrors outline.ts's
 * outlineBoxSize), so the result is always a valid, non-inverted box. The
 * box's Y-position isn't computed here since it needs an (impure) terrain
 * height sample at the footprint's corners — left to the caller.
 */
export function volumeBoxTransform(volume: GhostVolume): VolumeBoxTransform {
  const w = Math.max(0, volume.w);
  const d = Math.max(0, volume.d);
  const heightMeters = Math.max(0, volume.heightMeters);
  return {
    centerX: (volume.originTile.x + w / 2) * TILE_METERS,
    centerZ: (volume.originTile.z + d / 2) * TILE_METERS,
    scaleX: w * TILE_METERS,
    scaleY: heightMeters,
    scaleZ: d * TILE_METERS,
  };
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const IDENTITY_QUAT = new THREE.Quaternion();

/** A BufferGeometry with a zero-length position attribute already attached,
 * so callers can inspect `.getAttribute('position').count` even before the
 * first setPreview() call. */
function emptyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  return geometry;
}

export class GhostRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: HeightSampler;
  private readonly quad: THREE.PlaneGeometry;
  private readonly volumeGeometry: THREE.BoxGeometry;

  private readonly baseMaterial: THREE.MeshBasicMaterial;
  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly stripeMaterial: THREE.MeshBasicMaterial;
  private readonly borderMaterial: THREE.MeshBasicMaterial;
  private readonly innerMaterial: THREE.MeshBasicMaterial;
  private readonly volumeMaterial: THREE.MeshBasicMaterial;

  /** Merged, terrain-conforming layers: rebuilt as a fresh BufferGeometry
   * every setPreview() call, so there is no instance "capacity" to grow —
   * unlike the instanced layers below, a Mesh's geometry is simply replaced
   * with one sized exactly to the current preview. */
  private readonly baseMesh: THREE.Mesh;
  private readonly fillMesh: THREE.Mesh;
  private readonly borderMesh: THREE.Mesh;
  private readonly innerMesh: THREE.Mesh;

  /** The stripe dash is small relative to a tile and decorative, so it stays
   * instanced (flat, single-height-sample) rather than merged/conforming. */
  private stripeMesh: THREE.InstancedMesh;
  private stripeCapacity = INITIAL_CAPACITY;

  private readonly volumeMesh: THREE.Mesh;

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.scene = scene;
    this.heightAt = heightAt;

    this.quad = new THREE.PlaneGeometry(1, 1);
    this.quad.rotateX(-Math.PI / 2);

    // Local Y in [0,1]: scaling by heightMeters keeps the base flush with
    // local y=0, i.e. "sitting on the terrain" once positioned at groundY.
    this.volumeGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.volumeGeometry.translate(0, 0.5, 0);

    this.baseMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: BASE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.fillMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: ZONE_FILL_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.fillMaterial.color.setRGB(...ZONE_FILL_RGB);
    this.stripeMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: STRIPE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.stripeMaterial.color.setRGB(...STRIPE_RGB);
    this.borderMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: BORDER_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.innerMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: INNER_GRID_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.volumeMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: VOLUME_OPACITY,
      depthWrite: false,
    });

    this.baseMesh = new THREE.Mesh(emptyGeometry(), this.baseMaterial);
    this.fillMesh = new THREE.Mesh(emptyGeometry(), this.fillMaterial);
    this.stripeMesh = this.makeStripeMesh(INITIAL_CAPACITY);
    this.borderMesh = new THREE.Mesh(emptyGeometry(), this.borderMaterial);
    this.innerMesh = new THREE.Mesh(emptyGeometry(), this.innerMaterial);
    this.volumeMesh = new THREE.Mesh(this.volumeGeometry, this.volumeMaterial);
    this.volumeMesh.visible = false;

    // Fixed scene order (base, fill, stripe, then border/inner/volume) —
    // tests rely on it; keep it if you add another layer.
    scene.add(
      this.baseMesh,
      this.fillMesh,
      this.stripeMesh,
      this.borderMesh,
      this.innerMesh,
      this.volumeMesh,
    );
  }

  /**
   * Recomputes every layer from scratch for the given preview: base/fill
   * conforming quads, the instanced stripe, plus the border/inner-grid
   * conforming frame (always, derived from the same `tiles`), plus the plop
   * volume box when `opts.volume` is supplied (road/zone/bulldoze/terraform
   * previews never pass it, so they stay flat frames).
   */
  setPreview(tiles: TilePoint[], valid: boolean, kind: GhostKind, opts?: SetPreviewOptions): void {
    if (tiles.length === 0) {
      this.clear();
      return;
    }

    this.writeBase(tiles, valid, kind);
    if (valid && kind === 'zone') {
      this.writeFill(tiles);
    } else {
      this.setGeometry(this.fillMesh, new Float32Array(0));
    }
    this.stripeCapacity =
      valid && kind === 'road'
        ? this.writeStripe(tiles, this.stripeCapacity)
        : this.hide(this.stripeMesh, this.stripeCapacity);

    const edges = computeFootprintEdges(tiles);
    this.writeBorder(edges.outer, valid);
    this.writeInnerGrid(edges.inner, valid);
    this.writeVolume(valid, opts?.volume);
  }

  /** Hides every layer (used when a tool has no active preview). */
  clear(): void {
    this.setGeometry(this.baseMesh, new Float32Array(0));
    this.setGeometry(this.fillMesh, new Float32Array(0));
    this.stripeMesh.count = 0;
    this.setGeometry(this.borderMesh, new Float32Array(0));
    this.setGeometry(this.innerMesh, new Float32Array(0));
    this.volumeMesh.visible = false;
  }

  /**
   * Live layer meshes (base/fill/border/inner as merged conforming Mesh,
   * stripe as the InstancedMesh dash layer), for renderOrder tuning or
   * inspection. The stripe mesh is a fresh InstancedMesh re-added at the end
   * of the scene's children whenever it grows, so callers needing a specific
   * instance must always re-fetch through here rather than caching one
   * across calls that might grow it; base/fill/border/inner are never
   * replaced as objects (only their geometry is swapped), so those are safe
   * to cache.
   */
  layers(): {
    base: THREE.Mesh;
    fill: THREE.Mesh;
    stripe: THREE.InstancedMesh;
    border: THREE.Mesh;
    inner: THREE.Mesh;
  } {
    return {
      base: this.baseMesh,
      fill: this.fillMesh,
      stripe: this.stripeMesh,
      border: this.borderMesh,
      inner: this.innerMesh,
    };
  }

  /** The single plop-volume box mesh; `visible` is false whenever the
   * current preview has no `opts.volume`. Unlike the instanced stripe layer,
   * this Mesh is never replaced/regrown — safe to cache across calls. */
  volumeBox(): THREE.Mesh {
    return this.volumeMesh;
  }

  /** Replaces a Mesh's geometry with fresh, exactly-sized position data,
   * disposing the old geometry (mirrors zonegrid.ts's setGeometry: a
   * brand-new BufferGeometry object also means no stale cached
   * boundingSphere carries over from a previous, differently-sized preview). */
  private setGeometry(mesh: THREE.Mesh, positions: Float32Array): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  private writeBase(tiles: TilePoint[], valid: boolean, kind: GhostKind): void {
    this.baseMaterial.color.setRGB(...baseColorFor(kind, valid));
    const positions = buildConformingTilePositions(
      tiles,
      this.heightAt,
      TILE_METERS,
      GHOST_Y_OFFSET,
    );
    this.setGeometry(this.baseMesh, positions);
  }

  private writeFill(tiles: TilePoint[]): void {
    const size = TILE_METERS * ZONE_FILL_SHRINK;
    const positions = buildConformingTilePositions(tiles, this.heightAt, size, ZONE_FILL_Y_OFFSET);
    this.setGeometry(this.fillMesh, positions);
  }

  /** Outer border: one conforming strip per remaining (non-shared) tile edge. */
  private writeBorder(edges: readonly GhostEdgeSegment[], valid: boolean): void {
    this.borderMaterial.color.setRGB(...frameColorFor(valid));
    const positions = buildConformingEdgePositions(edges, this.heightAt, BORDER_Y_OFFSET);
    this.setGeometry(this.borderMesh, positions);
  }

  /** Inner grid: one faint conforming strip per tile edge shared between two previewed tiles. */
  private writeInnerGrid(edges: readonly GhostEdgeSegment[], valid: boolean): void {
    this.innerMaterial.color.setRGB(...frameColorFor(valid));
    const positions = buildConformingEdgePositions(edges, this.heightAt, INNER_GRID_Y_OFFSET);
    this.setGeometry(this.innerMesh, positions);
  }

  /** Plop volume ghost: shown only when `volume` is supplied. */
  private writeVolume(valid: boolean, volume: GhostVolume | undefined): void {
    if (!volume) {
      this.volumeMesh.visible = false;
      return;
    }
    const t = volumeBoxTransform(volume);
    const w = Math.max(0, volume.w) * TILE_METERS;
    const d = Math.max(0, volume.d) * TILE_METERS;
    const x0 = volume.originTile.x * TILE_METERS;
    const z0 = volume.originTile.z * TILE_METERS;
    // Sample every footprint corner — not just the center — so the box's
    // base clears the terrain even on a slope rising toward one edge/corner.
    const groundY = Math.max(
      this.heightAt(x0, z0),
      this.heightAt(x0 + w, z0),
      this.heightAt(x0, z0 + d),
      this.heightAt(x0 + w, z0 + d),
    );
    this.volumeMaterial.color.setRGB(...volumeColorFor(valid));
    this.volumeMesh.position.set(t.centerX, groundY + VOLUME_Y_OFFSET, t.centerZ);
    this.volumeMesh.scale.set(t.scaleX, t.scaleY, t.scaleZ);
    this.volumeMesh.visible = true;
  }

  // -------------------------------------------------------------------------
  // Stripe layer (instanced approach — see class doc).
  // -------------------------------------------------------------------------

  private makeStripeMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.quad, this.stripeMaterial, capacity);
    mesh.count = 0;
    return mesh;
  }

  private hide(mesh: THREE.InstancedMesh, capacity: number): number {
    mesh.count = 0;
    return capacity;
  }

  private writeStripeQuad(
    mesh: THREE.InstancedMesh,
    slot: number,
    tile: TilePoint,
    sizeX: number,
    sizeZ: number,
    yOffset: number,
  ): void {
    const cx = (tile.x + 0.5) * TILE_METERS;
    const cz = (tile.z + 0.5) * TILE_METERS;
    _position.set(cx, this.heightAt(cx, cz) + yOffset, cz);
    _scale.set(sizeX, 1, sizeZ);
    _matrix.compose(_position, IDENTITY_QUAT, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeStripe(tiles: TilePoint[], capacity: number): number {
    const dashIndices: number[] = [];
    for (let i = 0; i < tiles.length; i += STRIPE_PERIOD) dashIndices.push(i);

    let mesh = this.stripeMesh;
    let newCapacity = capacity;
    if (dashIndices.length > capacity) {
      newCapacity = Math.max(1, capacity);
      while (newCapacity < dashIndices.length) newCapacity *= 2;
      this.scene.remove(mesh);
      mesh = this.makeStripeMesh(newCapacity);
      this.scene.add(mesh);
      this.stripeMesh = mesh;
    }

    const long = TILE_METERS * STRIPE_LENGTH_FRACTION;
    const short = TILE_METERS * STRIPE_WIDTH_FRACTION;
    for (let slot = 0; slot < dashIndices.length; slot++) {
      const pathIndex = dashIndices[slot]!;
      const xIsLong = stripeAxisIsX(tiles, pathIndex);
      this.writeStripeQuad(
        mesh,
        slot,
        tiles[pathIndex]!,
        xIsLong ? long : short,
        xIsLong ? short : long,
        STRIPE_Y_OFFSET,
      );
    }
    mesh.count = dashIndices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null; // invalidate the cached frustum-cull sphere (three.js only recomputes it while null)
    return newCapacity;
  }
}
