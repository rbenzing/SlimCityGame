/**
 * Bridge structure: what holds an elevated road up and what keeps traffic on
 * it. The deck surface itself is drawn by RoadMeshRenderer, which samples a
 * deck-aware height function — this file adds only what a deck needs and a
 * road on the ground does not:
 *   PIERS  — tapered columns dropped at intervals from the deck underside to
 *            whatever is below, ground or riverbed, each with a wider footing.
 *   GIRDER — a slab under the carriageway, so the deck reads as a structure
 *            with thickness rather than a floating ribbon of tarmac.
 *   PARAPET— a low wall down both edges, standing in for the curb and sidewalk
 *            an at-grade tile draws.
 * Everything is instanced: one draw call per part regardless of how much
 * bridge the city has.
 */
import * as THREE from 'three';
import { PIER_SPACING_TILES, TILE_METERS, tileToWorld } from '../shared/constants';
import type { RoadTier } from '../shared/types';
import { carriagewayHalfWidthMeters, ROAD_Y_OFFSET } from './roadsmesh';

/** A deck tile as the renderer needs it: where it is, how high, how wide. */
export interface BridgeDeckTile {
  x: number;
  z: number;
  tier: RoadTier;
  mask: number; // neighbor bitmask, +N=1 +E=2 +S=4 +W=8
  /** Deck world height (terrain + elevation), in metres. */
  deckY: number;
  /** Ground world height under the tile, in metres. */
  groundY: number;
}

const GIRDER_THICKNESS = 0.7;
const GIRDER_COLOR = 0x8a8f96;

const PIER_RADIUS_TOP = 0.55;
const PIER_RADIUS_BOTTOM = 0.75;
const PIER_RADIAL_SEGMENTS = 8;
const PIER_COLOR = 0x9aa0a6;
const FOOTING_HEIGHT = 0.5;
const FOOTING_RADIUS = 1.1;
/** Sink the footing a little so it reads as bedded into the ground, not set on it. */
const FOOTING_EMBED = 0.25;

/** Slightly over a tile, so neighbouring spans meet without a seam. */
const TILE_SPAN = TILE_METERS * 1.02;

const PARAPET_HEIGHT = 1.0;
const PARAPET_THICKNESS = 0.28;
const PARAPET_COLOR = 0xb9bec4;

/** True on the tiles a pier drops from — deterministic, so it never flickers. */
export function isPierTile(x: number, z: number): boolean {
  return (x + z) % PIER_SPACING_TILES === 0;
}

/**
 * Which way the road runs through a tile, from its neighbour mask: true when it
 * runs along Z (north-south), so the parapets step out along X. A tile with no
 * clear axis falls back to the same answer as a north-south run.
 */
export function runsAlongZ(mask: number): boolean {
  const ns = (mask & 1) !== 0 || (mask & 4) !== 0;
  const ew = (mask & 2) !== 0 || (mask & 8) !== 0;
  if (ew && !ns) return false;
  return true;
}

export class BridgeRenderer {
  private readonly scene: THREE.Scene;

  private readonly girderGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly girderMaterial = new THREE.MeshLambertMaterial({ color: GIRDER_COLOR });

  private readonly pierGeometry = new THREE.CylinderGeometry(
    PIER_RADIUS_TOP,
    PIER_RADIUS_BOTTOM,
    1,
    PIER_RADIAL_SEGMENTS,
  );
  private readonly pierMaterial = new THREE.MeshLambertMaterial({ color: PIER_COLOR });

  private readonly footingGeometry = new THREE.CylinderGeometry(
    FOOTING_RADIUS,
    FOOTING_RADIUS,
    FOOTING_HEIGHT,
    PIER_RADIAL_SEGMENTS,
  );

  private readonly parapetGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly parapetMaterial = new THREE.MeshLambertMaterial({ color: PARAPET_COLOR });

  private girderMesh: THREE.InstancedMesh | null = null;
  private pierMesh: THREE.InstancedMesh | null = null;
  private footingMesh: THREE.InstancedMesh | null = null;
  private parapetMesh: THREE.InstancedMesh | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Replaces the whole structure from the current set of deck tiles. */
  rebuild(tiles: readonly BridgeDeckTile[]): void {
    this.clearMeshes();
    if (tiles.length === 0) return;

    const piers = tiles.filter((t) => isPierTile(t.x, t.z) && t.deckY - t.groundY > FOOTING_HEIGHT);

    this.girderMesh = this.addMesh(this.girderGeometry, this.girderMaterial, tiles.length);
    this.parapetMesh = this.addMesh(this.parapetGeometry, this.parapetMaterial, tiles.length * 2);
    if (piers.length > 0) {
      this.pierMesh = this.addMesh(this.pierGeometry, this.pierMaterial, piers.length);
      this.footingMesh = this.addMesh(this.footingGeometry, this.pierMaterial, piers.length);
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    tiles.forEach((tile, i) => {
      const wx = tileToWorld(tile.x);
      const wz = tileToWorld(tile.z);
      const halfWidth = carriagewayHalfWidthMeters(tile.tier);
      const alongZ = runsAlongZ(tile.mask);
      const deckTop = tile.deckY + ROAD_Y_OFFSET;

      // Girder: a slab spanning the tile, hung just under the carriageway.
      const span = TILE_SPAN;
      pos.set(wx, deckTop - GIRDER_THICKNESS / 2, wz);
      scale.set(
        alongZ ? halfWidth * 2 : span,
        GIRDER_THICKNESS,
        alongZ ? span : halfWidth * 2,
      );
      m.compose(pos, q, scale);
      this.girderMesh!.setMatrixAt(i, m);

      // Parapets: one down each edge of the carriageway.
      for (const side of [-1, 1]) {
        const offset = halfWidth - PARAPET_THICKNESS / 2;
        pos.set(
          wx + (alongZ ? side * offset : 0),
          deckTop + PARAPET_HEIGHT / 2,
          wz + (alongZ ? 0 : side * offset),
        );
        scale.set(
          alongZ ? PARAPET_THICKNESS : span,
          PARAPET_HEIGHT,
          alongZ ? span : PARAPET_THICKNESS,
        );
        m.compose(pos, q, scale);
        this.parapetMesh!.setMatrixAt(i * 2 + (side === -1 ? 0 : 1), m);
      }
    });

    piers.forEach((tile, i) => {
      const wx = tileToWorld(tile.x);
      const wz = tileToWorld(tile.z);
      const footingTop = tile.groundY + FOOTING_HEIGHT - FOOTING_EMBED;
      const columnTop = tile.deckY + ROAD_Y_OFFSET - GIRDER_THICKNESS;
      const columnHeight = Math.max(0.1, columnTop - footingTop);

      pos.set(wx, footingTop + columnHeight / 2, wz);
      scale.set(1, columnHeight, 1);
      m.compose(pos, q, scale);
      this.pierMesh!.setMatrixAt(i, m);

      pos.set(wx, tile.groundY + FOOTING_HEIGHT / 2 - FOOTING_EMBED, wz);
      scale.set(1, 1, 1);
      m.compose(pos, q, scale);
      this.footingMesh!.setMatrixAt(i, m);
    });

    for (const mesh of [this.girderMesh, this.parapetMesh, this.pierMesh, this.footingMesh]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private clearMeshes(): void {
    for (const mesh of [this.girderMesh, this.parapetMesh, this.pierMesh, this.footingMesh]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.girderMesh = null;
    this.parapetMesh = null;
    this.pierMesh = null;
    this.footingMesh = null;
  }

  dispose(): void {
    this.clearMeshes();
    this.girderGeometry.dispose();
    this.girderMaterial.dispose();
    this.pierGeometry.dispose();
    this.pierMaterial.dispose();
    this.footingGeometry.dispose();
    this.parapetGeometry.dispose();
    this.parapetMaterial.dispose();
  }
}
