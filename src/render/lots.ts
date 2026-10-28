/**
 * Lot pads: the paved (or planted) ground a building stands on, covering its
 * whole tile footprint. A suburban commercial or industrial lot laid out to
 * its parking code is planted, and paved only where its layout uses the
 * ground (layCarPark).
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
import { uniform } from 'three/tsl';
import { nightBodyMaterial } from './nightlook';
import { BuildingState, RoadTier } from '../shared/types';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { CHUNK_TILES, CHUNKS_PER_SIDE, TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import {
  pushConformingQuad,
  pushConformingTurnedQuad,
  conformingQuadVertexCount,
} from './groundquad';
import { materialUnit, type MaterialName } from './palette';
import { massingLifecycleTint } from './massing';
import { isFarmEntry, isHouseEntry, isWalkUpEntry } from './archetypes';
import { cropBands, planFarm, type FarmPlan, type FarmRect } from './farmlot';
import { edgeFrameOfParcel, NO_STREETS, sidewalkDepthMeters, type StreetLookup } from './frontage';
import {
  civicCrossingRects,
  civicSiteFor,
  NO_SENSORS,
  type CivicSite,
  type KitSensors,
} from './civiccrossing';
import { lotToWorld, planHouseLot, type HouseLotPlan, type LotRect } from './houselot';
import {
  CURB_CUT_Y_OFFSET,
  NEAR_WHITE_STRIPE_COLOR,
  STRIPE_LINE_HALF_WIDTH_M,
  STRIPE_LINE_Y_OFFSET,
} from './parked';
import type { KerbSurroundings } from '../shared/kerblayout';
import { lotPaving } from '../shared/lotlayout';
import {
  framedLotPlanFor,
  lotPlanFor,
  lotPointToWorld,
  type KerbCreditOf,
  type LotPlan,
} from './lotplan';

/**
 * Pads ride just above the terrain overlays and BELOW everything that sits on
 * a lot — the parking apron at 0.12 and a driveway at 0.10 — so a lot's own
 * surfaces stack on top of it rather than fighting it for the same plane.
 */
export const LOT_Y_OFFSET = 0.08;
/** A home's drive, path and patio ride over its lawn and under the road plate (0.15). */
export const DRIVE_Y_OFFSET = 0.1;
/** A car park's concrete walks and slab ride over its paving, under its paint (0.135). */
export const WALK_Y_OFFSET = 0.11;
/** A drive-through lane rides over the yard's paving it starts on, under the paint (0.135). */
export const LANE_Y_OFFSET = 0.12;

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
    // Detached homes and attached rows keep a garden; a walk-up lays a car
    // park on a lawn; the mid-rise and the tower are paved downtown.
    if (isHouseEntry(entry)) return 'mownLawn';
    return isWalkUpEntry(entry) ? 'brightAsphalt' : 'stainedConcrete';
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
  /** The stalls the streets paint, which a car park's layout counts toward its code; none without it. */
  private readonly kerb: KerbSurroundings | null;
  /** The kerb stalls a framed lot's frontage earns from its free road; null credits none. */
  private readonly kerbCreditOf: KerbCreditOf | null;
  /** The water and track a shore kit, a station or a rail yard turns to face, which decide where its way in is. */
  private readonly kitSensors: KitSensors;
  /** 0 (day) .. 1 (night): what the lots' ground shades by, the same tint as the terrain. */
  private readonly nightFactorUniform = uniform(0);
  private readonly material = nightBodyMaterial(this.nightFactorUniform, { vertexColors: true });
  /** One merged mesh per 16-tile chunk, keyed by the chunk of a lot's low corner. */
  private readonly chunks = new Map<number, LotChunk>();
  private readonly lotChunk = new Map<number, number>();
  private readonly dirty = new Set<number>();
  private rebuilds = 0;
  private visible = true;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean = () => false,
    street: StreetLookup = NO_STREETS,
    dirtAt: (x: number, z: number) => boolean = () => false,
    kerb: KerbSurroundings | null = null,
    kerbCreditOf: KerbCreditOf | null = null,
    kitSensors: KitSensors = NO_SENSORS,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
    this.street = street;
    this.dirtAt = dirtAt;
    this.kerb = kerb;
    this.kerbCreditOf = kerbCreditOf;
    this.kitSensors = kitSensors;
  }

  /** 0 (day) .. 1 (night): how far the lots' ground shades toward the night tint. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  apply(delta: BuildingDelta): void {
    for (const id of delta.removed) this.remove(id);
    for (const building of delta.added) this.place(building);
    for (const building of delta.updated) {
      this.remove(building.id);
      this.place(building);
    }
    this.flush();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const chunk of this.chunks.values()) if (chunk.mesh) chunk.mesh.visible = visible;
  }

  lotCount(): number {
    return this.lotChunk.size;
  }

  /** Vertices in the largest single lot currently built — the number the cap binds. */
  largestMeshVertices(): number {
    let largest = 0;
    for (const chunk of this.chunks.values()) {
      for (const lot of chunk.lots.values()) largest = Math.max(largest, lot.positions.length / 3);
    }
    return largest;
  }

  dispose(): void {
    for (const id of Array.from(this.lotChunk.keys())) this.remove(id);
    this.flush();
    this.material.dispose();
  }

  private remove(id: number): void {
    const key = this.lotChunk.get(id);
    if (key === undefined) return;
    this.chunks.get(key)?.lots.delete(id);
    this.lotChunk.delete(id);
    this.dirty.add(key);
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
      this.store(building, positions, colors);
      return;
    }

    // A civic building brings its own ground and lays only its way in, across
    // the verge and the footway to the street it fronts.
    const civic = civicSiteFor(entry, building, this.street, this.kitSensors);
    if (civic) {
      this.layCivicCrossing(civic, positions, colors, tinted);
      this.store(building, positions, colors);
      return;
    }

    const surface = lotSurfaceFor(entry);
    if (surface === null) return;
    const plan = planHouseLot(building, entry, this.roadAt, this.street);
    if (building.frame && plan) {
      // A home on a curve: its pad is its lot turned with its street, and
      // every strip on it is laid in the same frame.
      const framed = plan;
      const toWorld = (u: number, v: number): { x: number; z: number } =>
        lotToWorld(framed.frame, u, v);
      const lay = (rect: LotRect, y: number, name: MaterialName): void => {
        pushConformingTurnedQuad(
          positions,
          colors,
          toWorld,
          rect.u0,
          rect.v0,
          rect.u1,
          rect.v1,
          y,
          tinted(name),
          this.heightAt,
        );
      };
      lay({ u0: 0, u1: framed.edgeLenM, v0: 0, v1: framed.lotDepthM }, LOT_Y_OFFSET, surface);
      this.layHouseLot(framed, surface, lay);
      this.store(building, positions, colors);
      return;
    }
    if (building.frame) {
      // A lot on a curve: its pad is its parcel turned with its street, and its
      // car park is laid in the parcel's frame, the one every renderer places it by.
      const carPark = framedLotPlanFor(entry, building.frame, this.kerbCreditOf);
      const frame = edgeFrameOfParcel(building.frame);
      const toWorld = (u: number, v: number): { x: number; z: number } =>
        lotPointToWorld(frame, u, v);
      const layColor = (rect: LotRect, y: number, color: readonly [number, number, number]): void =>
        pushConformingTurnedQuad(
          positions,
          colors,
          toWorld,
          rect.u0,
          rect.v0,
          rect.u1,
          rect.v1,
          y,
          color,
          this.heightAt,
        );
      const lay = (rect: LotRect, y: number, name: MaterialName): void =>
        layColor(rect, y, tinted(name));
      const { w, d } = entry.footprint;
      lay(
        { u0: 0, u1: w * TILE_METERS, v0: 0, v1: d * TILE_METERS },
        LOT_Y_OFFSET,
        carPark || isWalkUpEntry(entry) ? 'mownLawn' : surface,
      );
      if (carPark) {
        this.layCarPark(carPark, entry, surface, lay, (r) =>
          layColor(r, STRIPE_LINE_Y_OFFSET, NEAR_WHITE_STRIPE_COLOR),
        );
      }
      this.store(building, positions, colors);
      return;
    }
    const bounds = lotBounds(building, entry);
    const carPark = lotPlanFor(
      entry,
      building.x,
      building.z,
      this.roadAt,
      building.rotation,
      this.kerb,
    );
    pushConformingQuad(
      positions,
      colors,
      bounds.x0,
      bounds.z0,
      bounds.x1,
      bounds.z1,
      LOT_Y_OFFSET,
      // A lot laid to code is lawn but for what it paves; a walk-up fronting no street is all lawn.
      tinted(carPark || isWalkUpEntry(entry) ? 'mownLawn' : surface),
      this.heightAt,
    );
    if (carPark) {
      const layColor = (r: LotRect, y: number, color: readonly [number, number, number]): void => {
        const a = lotPointToWorld(carPark.frame, r.u0, r.v0);
        const b = lotPointToWorld(carPark.frame, r.u1, r.v1);
        pushConformingQuad(
          positions,
          colors,
          Math.min(a.x, b.x),
          Math.min(a.z, b.z),
          Math.max(a.x, b.x),
          Math.max(a.z, b.z),
          y,
          color,
          this.heightAt,
        );
      };
      const lay = (r: LotRect, y: number, name: MaterialName): void => layColor(r, y, tinted(name));
      this.layCarPark(carPark, entry, surface, lay, (r) =>
        layColor(r, STRIPE_LINE_Y_OFFSET, NEAR_WHITE_STRIPE_COLOR),
      );
      this.layVergeCrossing(carPark, surface, lay);
      this.store(building, positions, colors);
      return;
    }

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
      this.layHouseLot(plan, surface, lay);
    }
    this.store(building, positions, colors);
  }

  /**
   * A civic building's crossings: each span's verge strip and its footway cut,
   * paved the way a shop's drive is (asphalt, a drive's and an apron's) or a
   * home's walk is (concrete). A framed parcel's front line is the back of its
   * free road's footway, so it has no verge and a street's footway is assumed.
   */
  private layCivicCrossing(
    site: CivicSite,
    positions: number[],
    colors: number[],
    tinted: (name: MaterialName) => readonly [number, number, number],
  ): void {
    const road = this.street(site.edge.roadTileX, site.edge.roadTileZ);
    if (!road && !site.framed) return;
    const vergeM = site.framed ? 0 : (road?.vergeM ?? 0);
    const sidewalkM = road?.sidewalkM ?? sidewalkDepthMeters(RoadTier.TwoLane);
    for (const { rect, kind, layer } of civicCrossingRects(site.crossings, vergeM, sidewalkM)) {
      const color = tinted(kind === 'walk' ? 'cleanConcrete' : 'brightAsphalt');
      const y =
        layer === 'footway' ? CURB_CUT_Y_OFFSET : kind === 'walk' ? WALK_Y_OFFSET : DRIVE_Y_OFFSET;
      if (site.framed) {
        pushConformingTurnedQuad(
          positions,
          colors,
          (u, v) => lotPointToWorld(site.frame, u, v),
          rect.u0,
          rect.v0,
          rect.u1,
          rect.v1,
          y,
          color,
          this.heightAt,
        );
        continue;
      }
      const a = lotPointToWorld(site.frame, rect.u0, rect.v0);
      const b = lotPointToWorld(site.frame, rect.u1, rect.v1);
      pushConformingQuad(
        positions,
        colors,
        Math.min(a.x, b.x),
        Math.min(a.z, b.z),
        Math.max(a.x, b.x),
        Math.max(a.z, b.z),
        y,
        color,
        this.heightAt,
      );
    }
  }

  /** What a home's lot paves over its lawn: the verge strips, the walks, the patios, the drives and their cuts across the footway. */
  private layHouseLot(
    plan: HouseLotPlan,
    surface: MaterialName,
    lay: (rect: LotRect, y: number, name: MaterialName) => void,
  ): void {
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

  /**
   * A suburban lot laid to its parking code: planted, with only what its
   * layout uses paved over the grass — the yard's paving under the drive,
   * spaces, berths, forecourt and tank farm, concrete under the body and its
   * walks — and the verge paved where the drive and the walk cross it.
   */
  private layCarPark(
    plan: LotPlan,
    entry: BuildingCatalogEntry,
    surface: MaterialName,
    lay: (rect: LotRect, y: number, name: MaterialName) => void,
    stripe: (rect: LotRect) => void,
  ): void {
    const { layout } = plan;
    const paving = lotPaving(layout);
    // A walk-up's rear yard is the lawn its balconies open onto, never paved.
    const yard = isWalkUpEntry(entry)
      ? paving.yard.filter((r) => r !== layout.rearYard)
      : paving.yard;
    for (const r of yard) lay(r, DRIVE_Y_OFFSET, surface);
    for (const r of paving.concrete) lay(r, WALK_Y_OFFSET, 'cleanConcrete');
    for (const r of paving.lane) lay(r, LANE_Y_OFFSET, 'darkAsphalt');
    for (const r of trailerStripes(layout.trailerStalls)) stripe(r);
  }

  /**
   * A grid lot's drive and entrance walk carried out across the road tile's
   * verge to its footway. A framed parcel's front line is the back of the
   * footway, so it has no verge to cross.
   */
  private layVergeCrossing(
    plan: LotPlan,
    surface: MaterialName,
    lay: (rect: LotRect, y: number, name: MaterialName) => void,
  ): void {
    const { layout, edge } = plan;
    const verge = this.street(edge.roadTileX, edge.roadTileZ)?.vergeM ?? 0;
    if (verge <= 0) return;
    if (layout.aisles.length > 0) {
      const cut = layout.curbCut;
      lay({ u0: cut.u0, u1: cut.u1, v0: -verge, v1: 0 }, DRIVE_Y_OFFSET, surface);
    }
    const walk = layout.entranceWalk;
    if (walk) lay({ ...walk, v0: -verge, v1: 0 }, WALK_Y_OFFSET, 'cleanConcrete');
  }

  /** Files a lot's laid ground under its chunk; the chunk's mesh is rebuilt by `flush`. */
  private store(building: BuildingInstance, positions: number[], colors: number[]): void {
    const key = chunkKeyOf(building.x, building.z);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = { lots: new Map(), mesh: null };
      this.chunks.set(key, chunk);
    }
    chunk.lots.set(building.id, { positions, colors });
    this.lotChunk.set(building.id, key);
    this.dirty.add(key);
  }

  /** Chunk meshes built so far: a delta that changes nothing builds none. */
  rebuiltChunks(): number {
    return this.rebuilds;
  }

  /** Rebuilds the mesh of every chunk a lot was added to, changed in or removed from. */
  private flush(): void {
    for (const key of this.dirty) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      if (chunk.mesh) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh = null;
      }
      if (chunk.lots.size === 0) {
        this.chunks.delete(key);
        continue;
      }
      const positions: number[] = [];
      const colors: number[] = [];
      for (const lot of chunk.lots.values()) {
        for (const v of lot.positions) positions.push(v);
        for (const v of lot.colors) colors.push(v);
      }
      this.rebuilds += 1;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.receiveShadow = true;
      mesh.visible = this.visible;
      this.scene.add(mesh);
      chunk.mesh = mesh;
    }
    this.dirty.clear();
  }
}

interface LotGround {
  positions: number[];
  colors: number[];
}

interface LotChunk {
  lots: Map<number, LotGround>;
  mesh: THREE.Mesh | null;
}

/**
 * The paint of a truck court's trailer stalls: each stall outlined by lines
 * centred on its edges, a line two stalls share drawn once.
 */
export function trailerStripes(stalls: readonly LotRect[]): LotRect[] {
  const h = STRIPE_LINE_HALF_WIDTH_M;
  const drawn = new Set<string>();
  const lines: LotRect[] = [];
  const line = (r: LotRect): void => {
    const key = [r.u0, r.u1, r.v0, r.v1].map((n) => n.toFixed(2)).join(',');
    if (drawn.has(key)) return;
    drawn.add(key);
    lines.push(r);
  };
  for (const s of stalls) {
    line({ u0: s.u0, u1: s.u1, v0: s.v0 - h, v1: s.v0 + h });
    line({ u0: s.u0, u1: s.u1, v0: s.v1 - h, v1: s.v1 + h });
    line({ u0: s.u0 - h, u1: s.u0 + h, v0: s.v0, v1: s.v1 });
    line({ u0: s.u1 - h, u1: s.u1 + h, v0: s.v0, v1: s.v1 });
  }
  return lines;
}

function chunkKeyOf(tileX: number, tileZ: number): number {
  return Math.floor(tileZ / CHUNK_TILES) * CHUNKS_PER_SIDE + Math.floor(tileX / CHUNK_TILES);
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
