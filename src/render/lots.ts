/**
 * Lot pads: the paved (or planted) ground a building stands on, covering its
 * whole tile footprint.
 *
 * A building's rendered mass deliberately does not fill its footprint — it
 * shrinks so neighbours don't share a wall — which left 15% of every lot edge
 * as unclaimed grass and made a dense block read as scattered boxes on a lawn.
 * The pad claims that ground. The body still shrinks; the LOT is what fills the
 * grid, which is the only way both "no gaps between properties" and "no shared
 * walls" can be true at once.
 *
 * Pads cover the footprint exactly, so two neighbouring lots meet edge to edge
 * with no seam. That is safe against the street because a road's sidewalk and
 * verge live inside the ROAD tile, never on the building's.
 *
 * Every pad is a terrain-conforming surface (render/groundquad.ts) rather than
 * a flat quad: a lot spans several tiles and any slope under a flat one would
 * push straight through it.
 *
 * Zero per-frame work: everything happens inside apply(BuildingDelta).
 */
import * as THREE from 'three';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  ZoneType,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { pushConformingQuad, conformingQuadVertexCount } from './groundquad';
import { materialUnit, type MaterialName } from './palette';
import { massingLifecycleTint } from './massing';

/**
 * Pads ride just above the terrain overlays and BELOW everything that sits on
 * a lot — the parking apron at 0.12 and a driveway at 0.10 — so a lot's own
 * surfaces stack on top of it rather than fighting it for the same plane.
 */
export const LOT_Y_OFFSET = 0.08;

/**
 * The reference caps a mesh at 65,536 vertices. A single lot pad is orders of
 * magnitude under that; the guard exists so a subdivision change can never
 * quietly walk past it.
 */
export const MAX_LOT_MESH_VERTICES = 65536;

/**
 * What a lot is surfaced with. Industry is a working yard, commerce is a
 * customer car park, apartments get a paved forecourt, and a house gets mown
 * lawn — which is still a lot, just not a paved one, and still reads as
 * claimed ground against the wild grass around it.
 */
export function lotSurfaceFor(entry: BuildingCatalogEntry): MaterialName | null {
  if (entry.category === 'ind') return 'darkAsphalt';
  if (entry.category === 'com') return 'brightAsphalt';
  if (entry.category === 'res') {
    return isHouseZone(entry.zone) ? 'brightVegetation' : 'stainedConcrete';
  }
  // Utilities, services, parks and landmarks bring their own ground treatment.
  return null;
}

/** Detached homes and attached rows keep a garden; denser housing is paved. */
function isHouseZone(zone: number | undefined): boolean {
  return zone === ZoneType.ResLow || zone === ZoneType.ResMediumRow;
}

export interface LotBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * World-meter extent of a building's footprint. `building.x`/`z` is the low
 * tile corner and the footprint is axis-aligned in tile space, so the pad
 * spans exactly the tiles the sim reserved — no more, so it cannot reach into
 * a neighbour, and no less, so it cannot leave a gap. Pure.
 */
export function lotBounds(building: BuildingInstance, entry: BuildingCatalogEntry): LotBounds {
  return {
    x0: building.x * TILE_METERS,
    z0: building.z * TILE_METERS,
    x1: (building.x + entry.footprint.w) * TILE_METERS,
    z1: (building.z + entry.footprint.d) * TILE_METERS,
  };
}

/** Vertices the pad for this footprint will build — for the mesh budget. */
export function lotVertexCount(building: BuildingInstance, entry: BuildingCatalogEntry): number {
  const b = lotBounds(building, entry);
  return conformingQuadVertexCount(b.x0, b.z0, b.x1, b.z1);
}

export class LotRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly meshes = new Map<number, THREE.Mesh>();
  private visible = true;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.remove(id);
    for (const building of delta.added) this.place(building);
    for (const building of delta.updated) {
      this.remove(building.id);
      this.place(building);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const mesh of this.meshes.values()) mesh.visible = visible;
  }

  lotCount(): number {
    return this.meshes.size;
  }

  /** Vertices in the largest pad currently built — the number the cap binds. */
  largestMeshVertices(): number {
    let largest = 0;
    for (const mesh of this.meshes.values()) {
      const position = mesh.geometry.getAttribute('position');
      if (position) largest = Math.max(largest, position.count);
    }
    return largest;
  }

  dispose(): void {
    for (const id of Array.from(this.meshes.keys())) this.remove(id);
    this.material.dispose();
  }

  private remove(id: number): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(id);
  }

  private place(building: BuildingInstance): void {
    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;
    const surface = lotSurfaceFor(entry);
    if (surface === null) return;

    const bounds = lotBounds(building, entry);
    const base = materialUnit(surface);
    const tint = massingLifecycleTint(building.state);
    const color: readonly [number, number, number] = [
      base[0] * tint[0],
      base[1] * tint[1],
      base[2] * tint[2],
    ];

    const positions: number[] = [];
    const colors: number[] = [];
    pushConformingQuad(
      positions,
      colors,
      bounds.x0,
      bounds.z0,
      bounds.x1,
      bounds.z1,
      LOT_Y_OFFSET,
      color,
      this.heightAt,
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    mesh.visible = this.visible;
    this.scene.add(mesh);
    this.meshes.set(building.id, mesh);
  }
}
