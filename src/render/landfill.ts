/**
 * Landfill overlay: the garbage LANDFILL area drawn from the sim snapshot
 * (SlimCity SPEC §21). Two TERRAIN-CONFORMING layers over every landfill tile,
 * both fed from SimSnapshot.garbage:
 *  - a flat dull brown-grey ground TINT (every vertex sampled through
 *    `heightAt`, the render/districts.ts pushConformingQuad pattern) so the
 *    painted landfill footprint reads on the ground; and
 *  - a per-tile low-poly TRASH-PILE box whose height rises with the whole
 *    area's `landfillFill` fraction, an InstancedMesh of unit boxes scaled per
 *    tile (the render/trees.ts / render/massing.ts instanced-box idiom) so the
 *    piles cast/receive the sun's shadow.
 *
 * `garbage.landfill` patches are ZonePatch-shaped rectangles of per-tile
 * membership (0/1), folded into a full-map Uint8 cache exactly like
 * render/districts.ts's DistrictsRenderer folds its district-id patches;
 * `garbage.landfillFill` (0..1, default 0) is the shared fill fraction every
 * tile's pile rises with, so they all grow together.
 *
 * `setVisible` is the sole visibility mutator (mirrors DistrictsRenderer):
 * rebuilds from apply() never change it, so hide-when-idle survives any number
 * of incoming snapshots — the recreated pile mesh inherits the stored state.
 */
import * as THREE from 'three';
import type { SimSnapshot } from '../shared/types';
import { LANDFILL_MAX_PILE_METERS, MAP_SIZE, TILE_METERS, tileToWorld } from '../shared/constants';

/** Tiny lift above the terrain so the tint reads on the ground without z-fighting (matches render/districts.ts's TINT_Y_OFFSET). */
const TINT_Y_OFFSET = 0.16;
const TINT_OPACITY = 0.5;
/** Dull brown-grey — the painted landfill footprint. */
const TINT_COLOR = 0x6b5d4f;
/** Trashy grey-brown — the heaped piles. */
const PILE_COLOR = 0x5f574a;
/** Pile footprint as a fraction of a tile, leaving a margin so piles don't tile-to-tile merge into one slab. */
const PILE_FOOTPRINT_FRACTION = 0.8;

/** Sub-quads per cell axis — matches render/districts.ts's CELL_SUBDIV so the tint hugs the in-tile terrain curve, not just its corner plane. */
export const CELL_SUBDIV = 4;
/** Vertices one cell tint contributes (CELL_SUBDIV² sub-quads x 6 verts). */
export const VERTS_PER_CELL = CELL_SUBDIV * CELL_SUBDIV * 6;

type HeightSampler = (x: number, z: number) => number;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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
  positions.push(x0, y00, z0, x0, y01, z1, x1, y11, z1);
  positions.push(x0, y00, z0, x1, y11, z1, x1, y10, z0);
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

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();

export class LandfillRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: HeightSampler;

  private readonly tintMaterial: THREE.MeshBasicMaterial;
  private readonly pileMaterial: THREE.MeshLambertMaterial;
  /** Unit box spanning y 0..1 (base on the ground), scaled per instance — shared, built once. */
  private readonly pileGeometry: THREE.BoxGeometry;
  private readonly tintMesh: THREE.Mesh;
  private pileMesh: THREE.InstancedMesh | null = null;

  /** Cached full-map per-tile landfill membership (0/1), folded by apply(). */
  private readonly cache = new Uint8Array(MAP_SIZE * MAP_SIZE);
  /** Whole-area fill fraction 0..1 (every pile's height ∝ this). */
  private fill = 0;
  private memberTiles = 0;
  /** Persisted so a rebuild's recreated pile mesh inherits the toggle state. */
  private visible = false;

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.scene = scene;
    this.heightAt = heightAt;

    this.tintMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: TINT_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.tintMaterial.color.setHex(TINT_COLOR);

    this.pileMaterial = new THREE.MeshLambertMaterial({ color: PILE_COLOR, flatShading: true });

    this.pileGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.pileGeometry.translate(0, 0.5, 0);

    this.tintMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.tintMaterial);
    this.tintMesh.name = 'landfill-tint';
    this.tintMesh.visible = false;
    scene.add(this.tintMesh);

    this.rebuildPiles([]);
  }

  /** Shows/hides the tint + pile layers together. The ONLY mutator of visibility. */
  setVisible(v: boolean): void {
    this.visible = v;
    this.tintMesh.visible = v;
    if (this.pileMesh) this.pileMesh.visible = v;
  }

  /**
   * Folds garbage.landfill membership patches into the cached full-map layer,
   * stores garbage.landfillFill (0..1, default 0), then rebuilds both layers.
   * `undefined` — or a snapshot carrying no landfill data — clears to empty.
   */
  apply(garbage: NonNullable<SimSnapshot['garbage']> | undefined): void {
    if (!garbage || !garbage.landfill) {
      this.cache.fill(0);
      this.fill = 0;
      this.rebuild();
      return;
    }

    for (const patch of garbage.landfill) {
      for (let dz = 0; dz < patch.h; dz++) {
        for (let dx = 0; dx < patch.w; dx++) {
          const x = patch.x + dx;
          const z = patch.z + dz;
          if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
          this.cache[z * MAP_SIZE + x] = patch.data[dz * patch.w + dx] ?? 0;
        }
      }
    }

    this.fill = clamp01(garbage.landfillFill ?? 0);
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

  /** Live layer meshes (tint, piles), for inspection/renderOrder tuning. */
  layers(): { tint: THREE.Mesh; piles: THREE.InstancedMesh | null } {
    return { tint: this.tintMesh, piles: this.pileMesh };
  }

  dispose(): void {
    this.scene.remove(this.tintMesh);
    this.tintMesh.geometry.dispose();
    this.tintMaterial.dispose();
    if (this.pileMesh) {
      this.scene.remove(this.pileMesh);
      this.pileMesh = null;
    }
    this.pileGeometry.dispose();
    this.pileMaterial.dispose();
  }

  private memberAt(x: number, z: number): number {
    return this.cache[z * MAP_SIZE + x] ?? 0;
  }

  private rebuild(): void {
    const members: number[] = [];
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (this.memberAt(x, z) !== 0) members.push(z * MAP_SIZE + x);
      }
    }
    this.memberTiles = members.length;
    this.rebuildTint(members);
    this.rebuildPiles(members);
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
   * Recreates the pile InstancedMesh: one unit box per membership tile, scaled
   * to the shared fill height and seated on the terrain (heightAt at the tile
   * center). At fill 0 the height would collapse, so we draw no piles rather
   * than emit zero-scale matrices.
   */
  private rebuildPiles(members: number[]): void {
    const height = this.pileHeight();
    const drawCount = height > 0 ? members.length : 0;
    const capacity = Math.max(1, drawCount);

    const mesh = new THREE.InstancedMesh(this.pileGeometry, this.pileMaterial, capacity);
    mesh.name = 'landfill-piles';
    mesh.count = drawCount;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = this.visible;

    const footprint = PILE_FOOTPRINT_FRACTION * TILE_METERS;
    _quaternion.identity();
    for (let slot = 0; slot < drawCount; slot++) {
      const packed = members[slot]!;
      const x = packed % MAP_SIZE;
      const z = (packed - x) / MAP_SIZE;
      const cx = tileToWorld(x);
      const cz = tileToWorld(z);
      _position.set(cx, this.heightAt(cx, cz), cz);
      _scale.set(footprint, height, footprint);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(slot, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (this.pileMesh) this.scene.remove(this.pileMesh);
    this.pileMesh = mesh;
    this.scene.add(mesh);
  }
}
