/**
 * Landfill overlay: the garbage LANDFILL area drawn from the sim snapshot.
 * Layers, all fed from SimSnapshot.garbage:
 *  - a flat dull brown-grey ground TINT over every DUMPING-GROUND tile (every
 *    vertex sampled through `heightAt`, the render/districts.ts
 *    pushConformingQuad pattern) so the painted footprint reads on the ground;
 *  - one continuous capped MOUND over every dumping-ground tile: a single
 *    surface whose cap height rises with the whole area's `landfillFill`
 *    fraction and whose sides slope to the ground at the area's edge, with a
 *    flat gravel HAUL ROAD cut through it from the office to the deepest
 *    tile (world/landfill.ts dumpPath); it casts/receives shadow;
 *  - an OFFICE KIT on each area's entrance tile (world/landfill.ts
 *    landfillAreas — the same deterministic office pick the sim's truck depots
 *    use): a concrete yard pad, a small gatehouse office with roof + door, a
 *    two-bay striped parking lot facing the street, and a yard light. The
 *    office tile gets NO tint and NO pile — it's the operated gatehouse; the
 *    rest of the area is the dumping grounds the trucks drive into. Areas with
 *    no street contact — or below LANDFILL_MIN_AREA_TILES (too small to
 *    operate) — get no office.
 *
 * `garbage.landfill` patches are ZonePatch-shaped rectangles of per-tile
 * membership (0/1), folded into a full-map Uint8 cache exactly like
 * render/districts.ts's DistrictsRenderer folds its district-id patches;
 * `garbage.landfillFill` (0..1, default 0) is the shared fill fraction every
 * tile's pile rises with, so they all grow together.
 *
 * `setVisible` is the sole visibility mutator (mirrors DistrictsRenderer):
 * rebuilds from apply() never change it, so hide-when-idle survives any number
 * of incoming snapshots — recreated meshes inherit the stored state.
 */
import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { nightBodyMaterial } from './nightlook';
import type { SimSnapshot, TilePoint } from '../shared/types';
import {
  LANDFILL_MAX_PILE_METERS,
  LANDFILL_MIN_AREA_TILES,
  MAP_SIZE,
  TILE_METERS,
  tileToWorld,
} from '../shared/constants';
import { landfillAreas } from '../world/landfill';

/** True when a mesh's geometry actually has vertices to draw. */
function hasGeometry(mesh: THREE.Mesh): boolean {
  const position = mesh.geometry.getAttribute('position');
  return position !== undefined && position.count > 0;
}

/** Tiny lift above the terrain so the tint reads on the ground without z-fighting (matches render/districts.ts's TINT_Y_OFFSET). */
const TINT_Y_OFFSET = 0.16;
const TINT_OPACITY = 0.5;
/** Dull brown-grey — the painted landfill footprint. */
const TINT_COLOR = 0x6b5d4f;
/** Trashy grey-brown — the heaped piles; each heap tints between these two tones. */
const PILE_COLOR_A = new THREE.Color(0x6b6250);
const PILE_COLOR_B = new THREE.Color(0x4e483d);
/** The capped mound's top varies over this band (× the area's fill height), so the surface reads as worked waste, not a slab. */
const PILE_HEIGHT_JITTER_MIN = 0.5;
const PILE_HEIGHT_JITTER_SPAN = 0.5;
/** The mound is one surface laid on this grid, so its side slope and the haul road both resolve. */
const MOUND_CELL_M = 2.5;
/** Horizontal run from the area's edge to the full-height cap (a side slope of 10 m run). */
const MOUND_SLOPE_RUN_M = 10;
/** The mound rides this far over the terrain, above the tint's lift so the two never z-fight. */
const MOUND_Y_OFFSET = 0.2;
/** The haul road is a single lane with shoulders, flat at ground level and cut through the mound. */
const HAUL_ROAD_HALF_M = 2.5;
/** The road's walls rise to the cap over this run on each side. */
const HAUL_ROAD_WALL_M = 2.5;
const HAUL_ROAD_COLOR = new THREE.Color(0x8a8576);

/** Sub-quads per cell axis — matches render/districts.ts's CELL_SUBDIV so the tint hugs the in-tile terrain curve, not just its corner plane. */
export const CELL_SUBDIV = 4;
/** Vertices one cell tint contributes (CELL_SUBDIV² sub-quads x 6 verts). */
export const VERTS_PER_CELL = CELL_SUBDIV * CELL_SUBDIV * 6;

// --- office kit ------------------------------------------------------------
// Ground plates conform to the terrain in cells of this size (the parked-lot
// apron pattern); boxes seat on the highest sampled corner so nothing sinks.
const CONFORM_CELL_M = 2;
/** Yard pad lift above terrain (below the ground marks, above nothing else). */
const PAD_Y_OFFSET = 0.12;
/** Painted parking-bay lines float just above the pad. */
const MARK_Y_OFFSET = 0.14;
const PAD_COLOR = new THREE.Color(0x8a8a86);
const OFFICE_BODY_COLOR = new THREE.Color(0xcfc9b8);
const OFFICE_ROOF_COLOR = new THREE.Color(0x6f6a5e);
const OFFICE_DOOR_COLOR = new THREE.Color(0x4a4640);
const OFFICE_GLASS_COLOR = new THREE.Color(0x3b444d);
const POLE_COLOR = new THREE.Color(0x50555d);
const STRIPE_COLOR = new THREE.Color(0xf2f2f2);
const LAMP_GLOW_COLOR = new THREE.Color(0xffd98c);

type HeightSampler = (x: number, z: number) => number;
/** Street lookup for entrance picks; must tolerate out-of-bounds coordinates. */
type RoadSampler = (x: number, z: number) => boolean;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 32-bit avalanche mix ("triple32", public domain) -> [0,1). Deterministic; never Math.random/Date.now. */
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Per-tile heap height as a fraction of the area's fill height — tips arrive
 * load by load, so no two tiles level off together. Deterministic per tile.
 */
export function pileHeightFactor(tileX: number, tileZ: number): number {
  return PILE_HEIGHT_JITTER_MIN + hash1(tileZ * MAP_SIZE + tileX) * PILE_HEIGHT_JITTER_SPAN;
}

/** Smooth ramp 0..1 over t in 0..1, so the mound's slope eases into the cap and the ground. */
function smooth01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** The cap's height factor at a world point: the tile-corner factors blended bilinearly, so neighbouring tiles share one surface. */
function capFactorAt(wx: number, wz: number): number {
  const fx = wx / TILE_METERS;
  const fz = wz / TILE_METERS;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const top = pileHeightFactor(ix, iz) * (1 - tx) + pileHeightFactor(ix + 1, iz) * tx;
  const bottom = pileHeightFactor(ix, iz + 1) * (1 - tx) + pileHeightFactor(ix + 1, iz + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

/** Distance from (px,pz) to the nearest point of an axis-aligned tile square. */
function distanceToTile(px: number, pz: number, tileX: number, tileZ: number): number {
  const x0 = tileX * TILE_METERS;
  const z0 = tileZ * TILE_METERS;
  const dx = Math.max(x0 - px, 0, px - (x0 + TILE_METERS));
  const dz = Math.max(z0 - pz, 0, pz - (z0 + TILE_METERS));
  return Math.hypot(dx, dz);
}

/** Distance from (px,pz) to the segment (ax,az)-(bx,bz). */
function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : clamp01(((px - ax) * dx + (pz - az) * dz) / lengthSq);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * Two triangles covering the quad (x0,z0)-(x1,z1), every corner's y sampled
 * independently through `heightAt` + yOffset so the quad follows the terrain
 * contour (render/districts.ts's pushConformingQuad pattern). CCW from +Y.
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
  // Split on the (x0,z1)-(x1,z0) diagonal to MATCH the terrain mesh's own
  // triangulation — the opposite diagonal lets ground bulge through the tint.
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
}

/** {@link pushConformingQuad} subdivided into CELL_SUBDIV² sub-quads — a full-tile tint samples the in-tile terrain curve, not just its corners. */
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

/** A colored, terrain-conforming plate subdivided to ≤CONFORM_CELL_M cells (anti-diagonal split, like pushConformingQuad). */
function pushConformingPlate(
  positions: number[],
  colors: number[],
  heightAt: HeightSampler,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  yOffset: number,
  color: THREE.Color,
): void {
  const stepsX = Math.max(1, Math.ceil((maxX - minX) / CONFORM_CELL_M));
  const stepsZ = Math.max(1, Math.ceil((maxZ - minZ) / CONFORM_CELL_M));
  const before = positions.length;
  for (let sz = 0; sz < stepsZ; sz++) {
    for (let sx = 0; sx < stepsX; sx++) {
      const x0 = minX + ((maxX - minX) * sx) / stepsX;
      const x1 = minX + ((maxX - minX) * (sx + 1)) / stepsX;
      const z0 = minZ + ((maxZ - minZ) * sz) / stepsZ;
      const z1 = minZ + ((maxZ - minZ) * (sz + 1)) / stepsZ;
      pushConformingQuad(positions, heightAt, x0, z0, x1, z1, yOffset);
    }
  }
  for (let i = before; i < positions.length; i += 3) colors.push(color.r, color.g, color.b);
}

/** Axis-aligned colored box (no bottom face), outward-wound for FrontSide lighting. */
function pushBox(
  positions: number[],
  colors: number[],
  minX: number,
  baseY: number,
  minZ: number,
  maxX: number,
  topY: number,
  maxZ: number,
  color: THREE.Color,
): void {
  const before = positions.length;
  // Top (+Y).
  positions.push(minX, topY, minZ, minX, topY, maxZ, maxX, topY, maxZ);
  positions.push(minX, topY, minZ, maxX, topY, maxZ, maxX, topY, minZ);
  // North (-Z).
  positions.push(maxX, baseY, minZ, minX, baseY, minZ, minX, topY, minZ);
  positions.push(maxX, baseY, minZ, minX, topY, minZ, maxX, topY, minZ);
  // South (+Z).
  positions.push(minX, baseY, maxZ, maxX, baseY, maxZ, maxX, topY, maxZ);
  positions.push(minX, baseY, maxZ, maxX, topY, maxZ, minX, topY, maxZ);
  // West (-X).
  positions.push(minX, baseY, minZ, minX, baseY, maxZ, minX, topY, maxZ);
  positions.push(minX, baseY, minZ, minX, topY, maxZ, minX, topY, minZ);
  // East (+X).
  positions.push(maxX, baseY, maxZ, maxX, baseY, minZ, maxX, topY, minZ);
  positions.push(maxX, baseY, maxZ, maxX, topY, minZ, maxX, topY, maxZ);
  for (let i = before; i < positions.length; i += 3) colors.push(color.r, color.g, color.b);
}

/**
 * The office tile's local frame: `u` runs across the street frontage, `v`
 * inward from the road-side tile edge. Both axes are cardinal (the entrance
 * direction is a 4-neighbour step), so every kit piece stays axis-aligned.
 */
interface OfficeFrame {
  edgeX: number;
  edgeZ: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
}

function officeFrame(tile: TilePoint, dirX: number, dirZ: number): OfficeFrame {
  const half = TILE_METERS / 2;
  return {
    edgeX: tileToWorld(tile.x) + dirX * half,
    edgeZ: tileToWorld(tile.z) + dirZ * half,
    ux: -dirZ,
    uz: dirX,
    vx: -dirX,
    vz: -dirZ,
  };
}

/** World-space AABB of the local rect [u0,v0]-[u1,v1] (v measured inward from the road edge). */
function frameRect(
  f: OfficeFrame,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const ax = f.edgeX + f.ux * u0 + f.vx * v0;
  const az = f.edgeZ + f.uz * u0 + f.vz * v0;
  const bx = f.edgeX + f.ux * u1 + f.vx * v1;
  const bz = f.edgeZ + f.uz * u1 + f.vz * v1;
  return {
    minX: Math.min(ax, bx),
    minZ: Math.min(az, bz),
    maxX: Math.max(ax, bx),
    maxZ: Math.max(az, bz),
  };
}

export class LandfillRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: HeightSampler;
  private readonly roadAt: RoadSampler;

  private readonly tintMaterial: THREE.MeshBasicMaterial;
  private readonly nightFactorUniform = uniform(0);
  /** The heaped waste carries the night tint like the ground it lies on. */
  private readonly pileMaterial = nightBodyMaterial(this.nightFactorUniform, {
    vertexColors: true,
    flatShading: true,
  });
  /** Yard pad, gatehouse and light pole carry the same tint. */
  private readonly officeMaterial = nightBodyMaterial(this.nightFactorUniform, {
    vertexColors: true,
    flatShading: true,
  });
  /** The bay paint carries the same night tint as the pavement it lies on. */
  private readonly markMaterial = nightBodyMaterial(this.nightFactorUniform, {
    vertexColors: true,
  });
  private readonly lampMaterial: THREE.MeshBasicMaterial;
  private readonly tintMesh: THREE.Mesh;
  /** Lit office-kit solids: yard pad, gatehouse body/roof/door, light pole. */
  private readonly officeMesh: THREE.Mesh;
  /** Office-kit marks: the parking-bay stripes. */
  private readonly markMesh: THREE.Mesh;
  /** The yard light's glowing head, unlit so it stays bright at night. */
  private readonly lampMesh: THREE.Mesh;
  /** The capped mound with its haul roads: one continuous surface over every dumping-ground tile. */
  private readonly pileMesh: THREE.Mesh;

  /** Cached full-map per-tile landfill membership (0/1), folded by apply(). */
  private readonly cache = new Uint8Array(MAP_SIZE * MAP_SIZE);
  /** Whole-area fill fraction 0..1 (every pile's height ∝ this). */
  private fill = 0;
  private memberTiles = 0;
  /** Entrance/office tile per street-connected area, in area order. */
  private offices: TilePoint[] = [];
  /** Persisted so a rebuild's recreated pile mesh inherits the toggle state. */
  private visible = false;

  constructor(scene: THREE.Scene, heightAt: HeightSampler, roadAt: RoadSampler = () => false) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.roadAt = roadAt;

    this.tintMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: TINT_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.tintMaterial.color.setHex(TINT_COLOR);

    this.lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

    this.pileMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.pileMaterial);
    this.pileMesh.name = 'landfill-piles';
    this.pileMesh.visible = false;
    this.pileMesh.castShadow = true;
    this.pileMesh.receiveShadow = true;
    scene.add(this.pileMesh);

    this.tintMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.tintMaterial);
    this.tintMesh.name = 'landfill-tint';
    this.tintMesh.userData['underground'] = 'keep';
    this.tintMesh.visible = false;
    scene.add(this.tintMesh);

    this.officeMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.officeMaterial);
    this.officeMesh.name = 'landfill-office';
    this.officeMesh.visible = false;
    this.officeMesh.castShadow = true;
    this.officeMesh.receiveShadow = true;
    scene.add(this.officeMesh);

    this.markMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.markMaterial);
    this.markMesh.name = 'landfill-office-marks';
    this.markMesh.userData['underground'] = 'keep';
    this.markMesh.visible = false;
    scene.add(this.markMesh);

    this.lampMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.lampMaterial);
    this.lampMesh.name = 'landfill-office-lamp';
    this.lampMesh.userData['underground'] = 'keep';
    this.lampMesh.visible = false;
    scene.add(this.lampMesh);
  }

  /**
   * Shows/hides every layer together. The ONLY mutator of visibility.
   *
   * A layer with nothing in it stays hidden even when shown: these meshes are
   * built empty and live in the scene from the start, and an empty geometry is
   * still submitted as a draw call with a vertex count of zero.
   */
  setVisible(v: boolean): void {
    this.visible = v;
    this.tintMesh.visible = v && hasGeometry(this.tintMesh);
    this.officeMesh.visible = v && hasGeometry(this.officeMesh);
    this.markMesh.visible = v && hasGeometry(this.markMesh);
    this.lampMesh.visible = v && hasGeometry(this.lampMesh);
    this.pileMesh.visible = v && hasGeometry(this.pileMesh);
  }

  /**
   * Folds garbage.landfill membership patches into the cached full-map layer
   * and stores garbage.landfillFill when present, then rebuilds every layer.
   * A snapshot with NO landfill patches (the periodic trash/fill-only update)
   * keeps the cached membership and fill; only `undefined` clears to empty.
   */
  apply(garbage: NonNullable<SimSnapshot['garbage']> | undefined): void {
    if (!garbage) {
      this.cache.fill(0);
      this.fill = 0;
      this.rebuild();
      return;
    }

    for (const patch of garbage.landfill ?? []) {
      for (let dz = 0; dz < patch.h; dz++) {
        for (let dx = 0; dx < patch.w; dx++) {
          const x = patch.x + dx;
          const z = patch.z + dz;
          if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
          this.cache[z * MAP_SIZE + x] = patch.data[dz * patch.w + dx] ?? 0;
        }
      }
    }

    if (garbage.landfillFill !== undefined) this.fill = clamp01(garbage.landfillFill);
    this.rebuild();
  }

  /** Number of landfill (membership) tiles currently painted. */
  tileCount(): number {
    return this.memberTiles;
  }

  /** Current shared pile height in meters (landfillFill * LANDFILL_MAX_PILE_METERS). */
  pileHeight(): number {
    return this.fill * LANDFILL_MAX_PILE_METERS;
  }

  /** The entrance/office tile of each street-connected landfill area, in area order. */
  officeTiles(): TilePoint[] {
    return this.offices.map((t) => ({ ...t }));
  }

  /** Live layer meshes, for inspection/renderOrder tuning. */
  layers(): {
    tint: THREE.Mesh;
    piles: THREE.Mesh;
    office: THREE.Mesh;
    officeMarks: THREE.Mesh;
    officeLamp: THREE.Mesh;
  } {
    return {
      tint: this.tintMesh,
      piles: this.pileMesh,
      office: this.officeMesh,
      officeMarks: this.markMesh,
      officeLamp: this.lampMesh,
    };
  }

  /** Dims the parking-bay paint with the rest of the town's lit surfaces; the lamp head keeps glowing. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = clamp01(nightFactor);
  }

  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  dispose(): void {
    this.scene.remove(this.lampMesh);
    this.lampMesh.geometry.dispose();
    this.lampMaterial.dispose();
    this.scene.remove(this.tintMesh);
    this.tintMesh.geometry.dispose();
    this.tintMaterial.dispose();
    this.scene.remove(this.officeMesh);
    this.officeMesh.geometry.dispose();
    this.officeMaterial.dispose();
    this.scene.remove(this.markMesh);
    this.markMesh.geometry.dispose();
    this.markMaterial.dispose();
    this.scene.remove(this.pileMesh);
    this.pileMesh.geometry.dispose();
    this.pileMaterial.dispose();
  }

  private memberAt(x: number, z: number): number {
    return this.cache[z * MAP_SIZE + x] ?? 0;
  }

  private rebuild(): void {
    // Split into areas to find each entrance; the office tile leaves the
    // dumping grounds (no tint, no pile) and hosts the gatehouse kit instead.
    const areas = landfillAreas(MAP_SIZE, this.cache, this.roadAt);
    const officeKits: { tile: TilePoint; dirX: number; dirZ: number }[] = [];
    const officeIndex = new Set<number>();
    const hauls: TilePoint[][] = [];
    this.offices = [];
    for (const area of areas) {
      // Unreachable or undersized grounds — nobody staffs an office there.
      if (!area.roadTile || area.tiles.length < LANDFILL_MIN_AREA_TILES) continue;
      officeIndex.add(area.office.z * MAP_SIZE + area.office.x);
      this.offices.push(area.office);
      hauls.push(area.dumpPath);
      officeKits.push({
        tile: area.office,
        dirX: area.roadTile.x - area.office.x,
        dirZ: area.roadTile.z - area.office.z,
      });
    }

    let memberCount = 0;
    const grounds: number[] = [];
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (this.memberAt(x, z) === 0) continue;
        memberCount += 1;
        const packed = z * MAP_SIZE + x;
        if (!officeIndex.has(packed)) grounds.push(packed);
      }
    }
    this.memberTiles = memberCount;
    this.rebuildTint(grounds);
    this.rebuildMound(grounds, hauls);
    this.rebuildOffices(officeKits);
    // Re-evaluate visibility: the layers just changed between empty and not,
    // and an empty one stays hidden even while the lens is on.
    this.setVisible(this.visible);
  }

  private rebuildTint(members: number[]): void {
    const positions: number[] = [];
    for (const packed of members) {
      const x = packed % MAP_SIZE;
      const z = (packed - x) / MAP_SIZE;
      pushConformingCell(positions, this.heightAt, x, z, TINT_Y_OFFSET);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    this.tintMesh.geometry.dispose();
    this.tintMesh.geometry = geometry;
  }

  /**
   * Rebuilds the mound: one continuous surface over every dumping-ground tile,
   * a capped heap whose top height follows the area's fill and whose sides
   * slope down to the ground at the area's edge. Each area's haul road (office
   * to the deepest tile) is cut through it, flat at ground level. At fill 0
   * there is no mound to draw.
   */
  private rebuildMound(members: number[], hauls: TilePoint[][]): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const height = this.pileHeight();
    if (height > 0) {
      const ground = new Set(members);
      const isGround = (x: number, z: number): boolean =>
        x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE && ground.has(z * MAP_SIZE + x);
      const roads = hauls.map((path) =>
        path.map((t) => ({ x: tileToWorld(t.x), z: tileToWorld(t.z) })),
      );
      const waste = new THREE.Color();
      const pushVertex = (wx: number, wz: number): void => {
        const tx = Math.floor(wx / TILE_METERS);
        const tz = Math.floor(wz / TILE_METERS);
        let edge = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!isGround(tx + dx, tz + dz)) {
              edge = Math.min(edge, distanceToTile(wx, wz, tx + dx, tz + dz));
            }
          }
        }
        let roadDistance = Infinity;
        for (const road of roads) {
          for (let i = 0; i + 1 < road.length; i++) {
            const a = road[i]!;
            const b = road[i + 1]!;
            roadDistance = Math.min(roadDistance, distanceToSegment(wx, wz, a.x, a.z, b.x, b.z));
          }
        }
        const factor = capFactorAt(wx, wz);
        const wall = smooth01((roadDistance - HAUL_ROAD_HALF_M) / HAUL_ROAD_WALL_M);
        const rise = height * factor * smooth01(edge / MOUND_SLOPE_RUN_M) * wall;
        positions.push(wx, this.heightAt(wx, wz) + MOUND_Y_OFFSET + rise, wz);
        waste
          .copy(PILE_COLOR_A)
          .lerp(PILE_COLOR_B, (factor - PILE_HEIGHT_JITTER_MIN) / PILE_HEIGHT_JITTER_SPAN)
          .lerp(HAUL_ROAD_COLOR, 1 - wall);
        colors.push(waste.r, waste.g, waste.b);
      };

      const steps = TILE_METERS / MOUND_CELL_M;
      const stride = steps + 1;
      for (const packed of members) {
        const x = packed % MAP_SIZE;
        const z = (packed - x) / MAP_SIZE;
        const base = positions.length / 3;
        for (let j = 0; j <= steps; j++) {
          for (let i = 0; i <= steps; i++) {
            pushVertex(x * TILE_METERS + i * MOUND_CELL_M, z * TILE_METERS + j * MOUND_CELL_M);
          }
        }
        // Split on the (x0,z1)-(x1,z0) diagonal to match the terrain mesh, wound CCW from +Y.
        for (let j = 0; j < steps; j++) {
          for (let i = 0; i < steps; i++) {
            const a = base + j * stride + i;
            const c = a + stride;
            indices.push(a, c, a + 1, a + 1, c, c + 1);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.pileMesh.geometry.dispose();
    this.pileMesh.geometry = geometry;
  }

  /** Rebuilds the office-kit meshes: one gatehouse compound per entrance tile. */
  private rebuildOffices(kits: { tile: TilePoint; dirX: number; dirZ: number }[]): void {
    const litPositions: number[] = [];
    const litColors: number[] = [];
    const markPositions: number[] = [];
    const markColors: number[] = [];
    const lampPositions: number[] = [];
    const lampColors: number[] = [];
    for (const kit of kits) {
      this.pushOfficeKit(
        litPositions,
        litColors,
        markPositions,
        markColors,
        lampPositions,
        lampColors,
        kit,
      );
    }

    const lit = new THREE.BufferGeometry();
    lit.setAttribute('position', new THREE.BufferAttribute(new Float32Array(litPositions), 3));
    lit.setAttribute('color', new THREE.BufferAttribute(new Float32Array(litColors), 3));
    lit.computeVertexNormals();
    this.officeMesh.geometry.dispose();
    this.officeMesh.geometry = lit;

    const marks = new THREE.BufferGeometry();
    marks.setAttribute('position', new THREE.BufferAttribute(new Float32Array(markPositions), 3));
    marks.setAttribute('color', new THREE.BufferAttribute(new Float32Array(markColors), 3));
    marks.computeVertexNormals();
    this.markMesh.geometry.dispose();
    this.markMesh.geometry = marks;

    const lamp = new THREE.BufferGeometry();
    lamp.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lampPositions), 3));
    lamp.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lampColors), 3));
    this.lampMesh.geometry.dispose();
    this.lampMesh.geometry = lamp;
  }

  /** Highest terrain sample under a rect (4 corners + center) — box seats, never sinks. */
  private seatHeight(r: { minX: number; minZ: number; maxX: number; maxZ: number }): number {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    return Math.max(
      this.heightAt(r.minX, r.minZ),
      this.heightAt(r.maxX, r.minZ),
      this.heightAt(r.minX, r.maxZ),
      this.heightAt(r.maxX, r.maxZ),
      this.heightAt(cx, cz),
    );
  }

  /**
   * One entrance compound, laid out in the tile's road-facing frame (u across
   * the frontage, v inward from the street edge): a near-full-tile concrete
   * yard pad; the gatehouse office (body + roof cap + door) on the left rear
   * of the pad; a two-bay nose-in parking row on the right, striped toward the
   * street so cars pull straight in; and a yard light between them.
   */
  private pushOfficeKit(
    litPositions: number[],
    litColors: number[],
    markPositions: number[],
    markColors: number[],
    lampPositions: number[],
    lampColors: number[],
    kit: { tile: TilePoint; dirX: number; dirZ: number },
  ): void {
    const f = officeFrame(kit.tile, kit.dirX, kit.dirZ);

    // Yard pad: flush with the street edge so the driveway meets the road.
    const pad = frameRect(f, -7.5, 0, 7.5, 15.5);
    pushConformingPlate(
      litPositions,
      litColors,
      this.heightAt,
      pad.minX,
      pad.minZ,
      pad.maxX,
      pad.maxZ,
      PAD_Y_OFFSET,
      PAD_COLOR,
    );

    // Gatehouse office: body, roof cap with a slight overhang, street-facing door.
    const body = frameRect(f, -7.0, 7.8, -0.6, 13.2);
    const bodyBase = this.seatHeight(body) + 0.1;
    const bodyTop = bodyBase + 3.2;
    pushBox(
      litPositions,
      litColors,
      body.minX,
      bodyBase,
      body.minZ,
      body.maxX,
      bodyTop,
      body.maxZ,
      OFFICE_BODY_COLOR,
    );
    // Glazing band just under the eaves, standing a hair proud of the walls so
    // the gatehouse reads as an office rather than a blank crate.
    const glass = frameRect(f, -7.06, 7.74, -0.54, 13.26);
    pushBox(
      litPositions,
      litColors,
      glass.minX,
      bodyTop - 1.5,
      glass.minZ,
      glass.maxX,
      bodyTop - 0.55,
      glass.maxZ,
      OFFICE_GLASS_COLOR,
    );
    const roof = frameRect(f, -7.15, 7.65, -0.45, 13.35);
    pushBox(
      litPositions,
      litColors,
      roof.minX,
      bodyTop,
      roof.minZ,
      roof.maxX,
      bodyTop + 0.25,
      roof.maxZ,
      OFFICE_ROOF_COLOR,
    );
    const door = frameRect(f, -4.3, 7.6, -3.3, 7.85);
    pushBox(
      litPositions,
      litColors,
      door.minX,
      bodyBase,
      door.minZ,
      door.maxX,
      bodyBase + 2.2,
      door.maxZ,
      OFFICE_DOOR_COLOR,
    );

    // Two-bay parking row: three stripes perpendicular to the street.
    for (const u of [1.2, 4.0, 6.8]) {
      const stripe = frameRect(f, u - 0.06, 0.6, u + 0.06, 5.6);
      pushConformingPlate(
        markPositions,
        markColors,
        this.heightAt,
        stripe.minX,
        stripe.minZ,
        stripe.maxX,
        stripe.maxZ,
        MARK_Y_OFFSET,
        STRIPE_COLOR,
      );
    }

    // Yard light between office and parking: dark pole, warm glowing head.
    const pole = frameRect(f, -0.17, 5.83, 0.17, 6.17);
    const poleBase = this.seatHeight(pole) + 0.1;
    const poleTop = poleBase + 4.6;
    pushBox(
      litPositions,
      litColors,
      pole.minX,
      poleBase,
      pole.minZ,
      pole.maxX,
      poleTop,
      pole.maxZ,
      POLE_COLOR,
    );
    const head = frameRect(f, -0.34, 5.66, 0.34, 6.34);
    pushBox(
      lampPositions,
      lampColors,
      head.minX,
      poleTop,
      head.minZ,
      head.maxX,
      poleTop + 0.3,
      head.maxZ,
      LAMP_GLOW_COLOR,
    );
  }
}
