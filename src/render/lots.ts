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
import { BuildingState } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { pushConformingQuad, conformingQuadVertexCount } from './groundquad';
import { materialUnit, type MaterialName } from './palette';
import { massingLifecycleTint } from './massing';
import { isFarmEntry, isHouseEntry } from './archetypes';
import { cropBands, planFarm, type FarmPlan, type FarmRect } from './farmlot';
import { NO_STREETS, type StreetLookup } from './frontage';
import { lotToWorld, planHouseLot, type HouseLotPlan, type LotRect } from './houselot';
import { CURB_CUT_Y_OFFSET } from './parked';

/**
 * Pads ride just above the terrain overlays and BELOW everything that sits on
 * a lot — the parking apron at 0.12 and a driveway at 0.10 — so a lot's own
 * surfaces stack on top of it rather than fighting it for the same plane.
 */
export const LOT_Y_OFFSET = 0.08;
/** A home's drive, path and patio ride over its lawn and under the road plate (0.15). */
export const DRIVE_Y_OFFSET = 0.1;

const DRIVE_SURFACE: Readonly<Record<HouseLotPlan['surface'], MaterialName>> = {
  dirt: 'dirt',
  concrete: 'cleanConcrete',
};
const PATIO_SURFACE: Readonly<Record<HouseLotPlan['yard']['patioStone'], MaterialName>> = {
  concrete: 'stainedConcrete',
  brick: 'redBrick',
};

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
  // A farm lays its own ground: yard, drive and field (placeFarm).
  if (isFarmEntry(entry)) return null;
  if (entry.category === 'ind') return 'darkAsphalt';
  if (entry.category === 'com') return 'brightAsphalt';
  if (entry.category === 'res') {
    // Detached homes and attached rows keep a garden; denser housing is paved.
    return isHouseEntry(entry) ? 'mownLawn' : 'stainedConcrete';
  }
  // Utilities, services, parks and landmarks bring their own ground treatment.
  return null;
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
  const { w, d } = footprintForRotation(entry, building.rotation);
  return {
    x0: building.x * TILE_METERS,
    z0: building.z * TILE_METERS,
    x1: (building.x + w) * TILE_METERS,
    z1: (building.z + d) * TILE_METERS,
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
  private readonly roadAt: (x: number, z: number) => boolean;
  /** The streets a home's lawn, drive and path run out to; the default finds none. */
  private readonly street: StreetLookup;
  /** Where the dirt roads a farm's gate opens onto are; the default finds none. */
  private readonly dirtAt: (x: number, z: number) => boolean;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly meshes = new Map<number, THREE.Mesh>();
  private visible = true;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean = () => false,
    street: StreetLookup = NO_STREETS,
    dirtAt: (x: number, z: number) => boolean = () => false,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
    this.street = street;
    this.dirtAt = dirtAt;
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
    const tint = massingLifecycleTint(building.state);
    const tinted = (name: MaterialName): readonly [number, number, number] => {
      const base = materialUnit(name);
      return [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]];
    };
    const positions: number[] = [];
    const colors: number[] = [];

    const farm = planFarm(building, entry, this.dirtAt);
    if (farm) {
      // Land, not a building: a farm's ground says what state it is in by
      // what grows on it (layFarmGround), and is never darkened like a
      // derelict wall — a fallow field is grass, not a scorch mark.
      const lay = (r: FarmRect, y: number, name: MaterialName): void =>
        pushConformingQuad(
          positions,
          colors,
          r.x0,
          r.z0,
          r.x1,
          r.z1,
          y,
          materialUnit(name),
          this.heightAt,
        );
      layFarmGround(farm, building.state, lay);
      this.addMesh(building.id, positions, colors);
      return;
    }

    const surface = lotSurfaceFor(entry);
    if (surface === null) return;
    const bounds = lotBounds(building, entry);
    pushConformingQuad(
      positions,
      colors,
      bounds.x0,
      bounds.z0,
      bounds.x1,
      bounds.z1,
      LOT_Y_OFFSET,
      tinted(surface),
      this.heightAt,
    );

    const plan = planHouseLot(building, entry, this.roadAt, this.street);
    if (plan) {
      const lay = (rect: LotRect, y: number, name: MaterialName): void => {
        const a = lotToWorld(plan.frame, rect.u0, rect.v0);
        const b = lotToWorld(plan.frame, rect.u1, rect.v1);
        pushConformingQuad(
          positions,
          colors,
          Math.min(a.x, b.x),
          Math.min(a.z, b.z),
          Math.max(a.x, b.x),
          Math.max(a.z, b.z),
          y,
          tinted(name),
          this.heightAt,
        );
      };
      for (const strip of plan.vergeLawn) lay(strip, LOT_Y_OFFSET, surface);
      for (const path of plan.paths) lay(path, DRIVE_Y_OFFSET, 'cleanConcrete');
      for (const patio of plan.yard.patios)
        lay(patio, DRIVE_Y_OFFSET, PATIO_SURFACE[plan.yard.patioStone]);
      for (const drive of plan.drives) {
        lay(drive.rect, DRIVE_Y_OFFSET, DRIVE_SURFACE[plan.surface]);
        // Across the footway the drive is always paved: the kerb is dropped
        // and the paving carried through, dirt drive or not.
        if (drive.cut.v1 > drive.cut.v0) lay(drive.cut, CURB_CUT_Y_OFFSET, 'cleanConcrete');
      }
    }
    this.addMesh(building.id, positions, colors);
  }

  private addMesh(id: number, positions: number[], colors: number[]): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    mesh.visible = this.visible;
    this.scene.add(mesh);
    this.meshes.set(id, mesh);
  }
}

/**
 * A farm's ground, laid through `lay`: grass round the farmstead, gravel
 * where the machinery stands and down the drive, and the field. A crop
 * field is its bands of crop and furrow; an orchard is mown grass between its
 * trees; a paddock is grazed pasture. A field being broken is bare tilled
 * soil, and an abandoned one has gone back to rough grass. Pure given `lay`.
 */
export function layFarmGround(
  plan: FarmPlan,
  state: BuildingState,
  lay: (rect: FarmRect, y: number, name: MaterialName) => void,
): void {
  lay(plan.yard, LOT_Y_OFFSET, 'mownLawn');
  // Farmyards are rolled gravel, pale against the grass, not the dark earth of a track.
  lay(plan.apron, DRIVE_Y_OFFSET, 'sand');
  lay(plan.drive, DRIVE_Y_OFFSET, 'sand');
  if (state === BuildingState.Constructing) {
    lay(plan.field, LOT_Y_OFFSET, 'tilledSoil');
  } else if (state === BuildingState.Abandoned) {
    lay(plan.field, LOT_Y_OFFSET, 'brightVegetation');
  } else if (plan.kind === 'crops') {
    const crop: MaterialName = plan.ripe ? 'ripeGrain' : 'cropGreen';
    for (const band of cropBands(plan))
      lay(band.rect, LOT_Y_OFFSET, band.furrow ? 'tilledSoil' : crop);
  } else {
    lay(plan.field, LOT_Y_OFFSET, plan.kind === 'orchard' ? 'mownLawn' : 'pasture');
  }
}
