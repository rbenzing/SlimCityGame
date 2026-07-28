/**
 * District overlay: a colored per-district
 * tint (like render/zonegrid.ts's zone tint) plus boundary lines between
 * differently-districted (or district vs. unassigned) tiles, both
 * TERRAIN-CONFORMING — every vertex sampled through `heightAt`, the
 * roadsmesh.ts/zonegrid.ts corner-sampling pattern — so the overlay hugs the
 * ground on a slope instead of floating/clipping.
 *
 * Fed entirely from SimSnapshot.districts { patches, defs }:
 * `patches` are ZonePatch-shaped rectangles of per-tile district ids (0 =
 * unassigned), folded into a full-map cache exactly like
 * render/overlays.ts's OverlayRenderer folds power/watered coverage patches;
 * `defs` is the worker's authoritative district list (id/name/color), kept
 * as a lookup for the tint color. No GridState import — this module never
 * needs a full grid, only the district id layer + defs, both delivered over
 * the wire.
 *
 * `setVisible` is the sole visibility mutator (mirrors ZoneGridRenderer): the
 * integrate phase decides when to show it (district.paint tool active, and/or
 * the 'districts' LensId selected) and calls setVisible accordingly; rebuilds
 * from applyDistrictPatches never touch it, so hide-when-idle survives any
 * number of incoming patches.
 */
import * as THREE from 'three';
import type { District, ZonePatch } from '../shared/types';
import { MAP_SIZE, TILE_METERS } from '../shared/constants';

// Layer stack: tint under lines, both under the road plates at 0.15
// (roadsmesh.ts ROAD_Y_OFFSET) and clear of render/zonegrid.ts's own
// fill/tint/line stack (0.08-0.13) so the two overlays never z-fight when
// both happen to be visible at once.
const TINT_Y_OFFSET = 0.16;
const LINE_Y_OFFSET = 0.18;

/** Sub-quads per cell axis — matches render/zonegrid.ts's CELL_SUBDIV so the
 * tint hugs the smooth in-tile terrain curve, not just its corner plane. */
export const CELL_SUBDIV = 4;
/** Boundary-line strip width in meters — matches render/zonegrid.ts's LINE_WIDTH_M. */
export const LINE_WIDTH_M = 0.35;

const TINT_OPACITY = 0.4;
const LINE_OPACITY = 0.7;
/** Near-white boundary lines, same read as render/zonegrid.ts's grid lines. */
const LINE_RGB: readonly [number, number, number] = [0.96, 0.97, 0.98];
/** Tint color for a district id with no matching `defs` entry (shouldn't
 * normally happen — defs always arrive with/before their patches — but keeps
 * the overlay visibly present rather than invisible if it ever does). */
const FALLBACK_DISTRICT_RGB: readonly [number, number, number] = [0.6, 0.6, 0.6];

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

type HeightSampler = (x: number, z: number) => number;

/** One tile-boundary line segment: the `side` edge of tile (x, z). */
export interface DistrictEdge {
  x: number;
  z: number;
  side: 'N' | 'E' | 'S' | 'W';
}

/**
 * Every boundary edge between a district-assigned tile and a neighbor
 * carrying a DIFFERENT district id (including an unassigned/id-0 neighbor, or
 * the map edge). Unlike render/zonegrid.ts's single-set `boundaryEdges`
 * (which dedupes a uniform "in set / out of set" boundary to one edge per
 * shared side), this walks every assigned tile and its own four sides
 * against `districtOf`: a boundary between two DIFFERENT non-zero districts
 * is therefore emitted from BOTH sides (each tile's own edge at that side) —
 * harmless (both land at the identical conforming-quad position; the
 * material is transparent/depth-write-off) and far simpler than a
 * multi-color dedup scheme for a purely cosmetic overlay. Pure and exported
 * for tests.
 */
export function districtBoundaryEdges(
  size: number,
  districtOf: (x: number, z: number) => number,
): DistrictEdge[] {
  const edges: DistrictEdge[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const id = districtOf(x, z);
      if (id === 0) continue;
      const north = z > 0 ? districtOf(x, z - 1) : 0;
      const west = x > 0 ? districtOf(x - 1, z) : 0;
      const east = x < size - 1 ? districtOf(x + 1, z) : 0;
      const south = z < size - 1 ? districtOf(x, z + 1) : 0;
      if (north !== id) edges.push({ x, z, side: 'N' });
      if (west !== id) edges.push({ x, z, side: 'W' });
      if (east !== id) edges.push({ x, z, side: 'E' });
      if (south !== id) edges.push({ x, z, side: 'S' });
    }
  }
  return edges;
}

/**
 * Two triangles covering the quad (x0,z0)-(x1,z1), every corner's y sampled
 * independently through `heightAt` + yOffset so the quad follows the terrain
 * contour (render/zonegrid.ts's pushConformingQuad pattern). CCW from +Y.
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
  positions.push(x0, y00, z0, x0, y01, z1, x1, y11, z1);
  positions.push(x0, y00, z0, x1, y11, z1, x1, y10, z0);
}

/** {@link pushConformingQuad} subdivided into CELL_SUBDIV² sub-quads — a
 * full-tile tint samples the in-tile terrain curve, not just its corners. */
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

/** Vertices one edge-line strip contributes (2 length segments x 2 tris x 3 verts). */
export const VERTS_PER_EDGE_STRIP = 12;
/** Vertices one cell tint contributes (CELL_SUBDIV² sub-quads x 6 verts). */
export const VERTS_PER_CELL = CELL_SUBDIV * CELL_SUBDIV * 6;

/** Thin conforming strip centered on a tile-boundary edge, split into two
 * length segments so its midpoint also tracks the terrain. */
function pushEdgeStrip(positions: number[], heightAt: HeightSampler, edge: DistrictEdge): void {
  const half = LINE_WIDTH_M / 2;
  const x = edge.x * TILE_METERS;
  const z = edge.z * TILE_METERS;
  const alongX = edge.side === 'N' || edge.side === 'S';
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

export class DistrictsRenderer {
  private readonly heightAt: HeightSampler;

  private readonly tintMaterial: THREE.MeshBasicMaterial;
  private readonly lineMaterial: THREE.MeshBasicMaterial;
  private readonly tintMesh: THREE.Mesh;
  private readonly lineMesh: THREE.Mesh;

  /** Cached full-map per-tile district id (0 = unassigned), fed by applyDistrictPatches. */
  private readonly districtCache = new Uint8Array(MAP_SIZE * MAP_SIZE);
  /** Cached district defs (id -> District), replaced/merged wholesale each applyDistrictPatches call. */
  private readonly defsById = new Map<number, District>();

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.heightAt = heightAt;

    this.tintMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: TINT_OPACITY,
      depthWrite: false,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.lineMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: LINE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.lineMaterial.color.setRGB(...LINE_RGB);

    this.tintMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.tintMaterial);
    this.lineMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.lineMaterial);
    this.tintMesh.name = 'districts-tint';
    this.lineMesh.name = 'districts-lines';
    this.tintMesh.visible = false;
    this.lineMesh.visible = false;

    scene.add(this.tintMesh, this.lineMesh);
  }

  /** Shows/hides the tint + boundary-line layers together. The ONLY mutator of visibility. */
  setVisible(v: boolean): void {
    this.tintMesh.visible = v;
    this.lineMesh.visible = v;
  }

  /**
   * Folds SimSnapshot.districts.patches into the cached full-map district-id
   * layer, merges `defs` (by id) into the cached color lookup, then rebuilds
   * the tint + boundary layers from the whole cache. Safe/cheap to call with
   * an empty patches array and/or empty defs (a no-op rebuild is skipped).
   */
  applyDistrictPatches(patches: ZonePatch[], defs: District[]): void {
    for (const def of defs) this.defsById.set(def.id, def);

    for (const patch of patches) {
      for (let dz = 0; dz < patch.h; dz++) {
        for (let dx = 0; dx < patch.w; dx++) {
          const x = patch.x + dx;
          const z = patch.z + dz;
          if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
          this.districtCache[z * MAP_SIZE + x] = patch.data[dz * patch.w + dx] ?? 0;
        }
      }
    }

    if (patches.length === 0 && defs.length === 0) return;
    this.rebuild();
  }

  private districtAt(x: number, z: number): number {
    return this.districtCache[z * MAP_SIZE + x] ?? 0;
  }

  private rebuild(): void {
    const positions: number[] = [];
    const colors: number[] = [];
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const id = this.districtAt(x, z);
        if (id === 0) continue;
        const def = this.defsById.get(id);
        const color = def ? hexToRgb01(def.color) : FALLBACK_DISTRICT_RGB;
        const before = positions.length;
        pushConformingCell(positions, this.heightAt, x, z, TINT_Y_OFFSET);
        const added = (positions.length - before) / 3;
        for (let i = 0; i < added; i++) colors.push(color[0], color[1], color[2]);
      }
    }
    this.setGeometry(this.tintMesh, positions, colors);

    const linePositions: number[] = [];
    for (const edge of districtBoundaryEdges(MAP_SIZE, (x, z) => this.districtAt(x, z))) {
      pushEdgeStrip(linePositions, this.heightAt, edge);
    }
    this.setGeometry(this.lineMesh, linePositions);
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

  /** Live layer meshes (tint, lines), for renderOrder tuning or inspection. */
  layers(): { tint: THREE.Mesh; lines: THREE.Mesh } {
    return { tint: this.tintMesh, lines: this.lineMesh };
  }
}
