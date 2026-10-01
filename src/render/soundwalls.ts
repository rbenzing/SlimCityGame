/**
 * Motorway noise walls: a concrete safety barrier at the carriageway's edge,
 * precast panels standing at its back, and steel posts between them every
 * 5 m. One InstancedMesh per part. Each tile's wall is four 5 m bays, each set
 * on the road's own surface where it stands, so a wall climbing a slope steps
 * up it the way a real one does.
 */
import * as THREE from 'three';
import { TILE_METERS } from '../shared/constants';
import {
  SOUND_WALL_BASE_HEIGHT_M,
  SOUND_WALL_BASE_WIDTH_M,
  SOUND_WALL_PANEL_THICKNESS_M,
  SOUND_WALL_POST_SPACING_M,
} from '../shared/soundwall';
import type { SoundWallSite } from '../shared/soundwallsites';
import { setInstanceCount } from './groundquad';
import { materialHex } from './palette';

/** A wall standing on one edge of one tile. */
export interface PlacedWall {
  x: number;
  z: number;
  site: SoundWallSite;
}

/** One instance of a wall part: where its road-side foot is, which way it faces, how tall. */
export interface WallPart {
  x: number;
  y: number;
  z: number;
  /** Rotation about the vertical that turns the part's across axis outward from the road. */
  yaw: number;
  /** Height in metres, for the parts that are stretched to the wall's height. */
  height: number;
}

export interface WallLayout {
  bases: WallPart[];
  panels: WallPart[];
  posts: WallPart[];
}

const BAYS_PER_TILE = Math.round(TILE_METERS / SOUND_WALL_POST_SPACING_M);
const POST_SIZE_M = 0.2;
/** How far a post stands proud of the panels' top. */
const POST_CAP_M = 0.15;

/** Where across the wall the panel's road-side face is: at the back of the barrier. */
const PANEL_SET_BACK_M = SOUND_WALL_BASE_WIDTH_M - SOUND_WALL_PANEL_THICKNESS_M;

/**
 * Every bay, panel and post of `walls`, on the surface `heightAt` gives.
 * Posts stand at the start of each bay, and at the end of the last bay where
 * the wall does not carry on into the next tile.
 */
export function layOutWalls(
  walls: readonly PlacedWall[],
  heightAt: (wx: number, wz: number) => number,
): WallLayout {
  const standing = new Set(walls.map((w) => `${w.x},${w.z},${w.site.edge}`));
  const layout: WallLayout = { bases: [], panels: [], posts: [] };
  for (const { x, z, site } of walls) {
    const { alongX, outward, heightM, faceOffsetM } = site;
    // Turns the part's local +x (across the wall) to point away from the road.
    const yaw = alongX ? -outward * (Math.PI / 2) : outward > 0 ? 0 : Math.PI;
    const tileStart = (alongX ? x : z) * TILE_METERS;
    const centreAcross = ((alongX ? z : x) + 0.5) * TILE_METERS;
    const at = (along: number, across: number): { x: number; z: number } =>
      alongX
        ? { x: along, z: centreAcross + faceOffsetM + outward * across }
        : { x: centreAcross + faceOffsetM + outward * across, z: along };
    const part = (along: number, across: number, height: number): WallPart => {
      const p = at(along, across);
      return { x: p.x, y: heightAt(p.x, p.z), z: p.z, yaw, height };
    };

    for (let bay = 0; bay < BAYS_PER_TILE; bay++) {
      const middle = tileStart + (bay + 0.5) * SOUND_WALL_POST_SPACING_M;
      layout.bases.push(part(middle, 0, SOUND_WALL_BASE_HEIGHT_M));
      layout.panels.push(part(middle, PANEL_SET_BACK_M, heightM));
      layout.posts.push(
        part(tileStart + bay * SOUND_WALL_POST_SPACING_M, PANEL_SET_BACK_M, heightM),
      );
    }
    const next = alongX ? `${x + 1},${z},${site.edge}` : `${x},${z + 1},${site.edge}`;
    if (!standing.has(next)) {
      layout.posts.push(part(tileStart + TILE_METERS, PANEL_SET_BACK_M, heightM));
    }
  }
  return layout;
}

/**
 * The safety barrier's cross-section, across the wall (x, road side at 0) by
 * up (y): a sloped face toward the traffic, the 32-inch shape, standing on a
 * 0.6 m footing. Extruded one bay long, centred on its middle.
 */
function barrierGeometry(): THREE.BufferGeometry {
  const w = SOUND_WALL_BASE_WIDTH_M;
  const h = SOUND_WALL_BASE_HEIGHT_M;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  shape.lineTo(w - 0.2, h);
  shape.lineTo(0.08, 0.25);
  shape.lineTo(0, 0.08);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: SOUND_WALL_POST_SPACING_M,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -SOUND_WALL_POST_SPACING_M / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** A unit-tall box one bay long, its road-side foot at the origin, stretched to a part's height. */
function slabGeometry(across: number, along: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(across, 1, along);
  geometry.translate(across / 2, 0.5, 0);
  return geometry;
}

export class SoundWallRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (wx: number, wz: number) => number;
  private readonly baseGeometry = barrierGeometry();
  private readonly panelGeometry = slabGeometry(
    SOUND_WALL_PANEL_THICKNESS_M,
    SOUND_WALL_POST_SPACING_M,
  );
  private readonly postGeometry = slabGeometry(POST_SIZE_M, POST_SIZE_M);
  // Precast panels are pale, and a wall is a vertical face lit mostly from
  // the side: the palette's darker concretes read as black on it.
  private readonly baseMaterial = new THREE.MeshLambertMaterial({
    color: materialHex('whitePlaster'),
  });
  private readonly panelMaterial = new THREE.MeshLambertMaterial({
    color: materialHex('whiteBrick'),
  });
  private readonly postMaterial = new THREE.MeshLambertMaterial({
    color: materialHex('metalPlates'),
  });
  private meshes: THREE.InstancedMesh[] = [];
  private layout: WallLayout = { bases: [], panels: [], posts: [] };

  constructor(scene: THREE.Scene, heightAt: (wx: number, wz: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /** Every wall drawn again: walls change only when the roads do. */
  rebuild(walls: readonly PlacedWall[]): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes = [];
    this.layout = layOutWalls(walls, this.heightAt);
    if (walls.length === 0) return;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const build = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parts: readonly WallPart[],
      lift: (p: WallPart) => number,
      stretch: (p: WallPart) => number,
    ): void => {
      const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
      parts.forEach((p, i) => {
        rotation.setFromAxisAngle(up, p.yaw);
        matrix.compose(
          new THREE.Vector3(p.x, p.y + lift(p), p.z),
          rotation,
          new THREE.Vector3(1, stretch(p), 1),
        );
        mesh.setMatrixAt(i, matrix);
      });
      setInstanceCount(mesh, parts.length);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.scene.add(mesh);
    };
    build(
      this.baseGeometry,
      this.baseMaterial,
      this.layout.bases,
      () => 0,
      () => 1,
    );
    build(
      this.panelGeometry,
      this.panelMaterial,
      this.layout.panels,
      () => SOUND_WALL_BASE_HEIGHT_M,
      (p) => p.height - SOUND_WALL_BASE_HEIGHT_M,
    );
    build(
      this.postGeometry,
      this.postMaterial,
      this.layout.posts,
      () => 0,
      (p) => p.height + POST_CAP_M,
    );
  }

  /** How many of each part the last rebuild drew, for the dev hook. */
  counts(): { bases: number; panels: number; posts: number } {
    return {
      bases: this.layout.bases.length,
      panels: this.layout.panels.length,
      posts: this.layout.posts.length,
    };
  }
}
