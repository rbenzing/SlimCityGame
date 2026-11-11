/**
 * The buried cable as the underground shows it: every tile of cable drawn as
 * the conduit it is, on the ground under the glass surface, with the feet of
 * the boxes and risers that bring it up marked.
 *
 * A cable is buried, so nothing on the surface ever shows it but its boxes,
 * its transformers and its risers. Underground each tile is a thin strip along
 * the centre line of its tile, joined to the orthogonal neighbours that carry
 * cable, in a dull red-orange no pipe wears, so it reads as power beside the
 * blue water and the brown sewer. The strip runs between the two pipe runs,
 * and is drawn on the ground like they are: depth is not drawn, only what is
 * buried and where.
 *
 * Visible only while the city is underground; `setVisible` is the only thing
 * that changes that.
 */
import * as THREE from 'three';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

/**
 * The conduit's strip, narrower than a pipe run (1.2 m), and the hub every
 * open-ground tile draws so a lone tile still shows.
 */
export const CABLE_STRIP_WIDTH_M = 0.6;
const HUB_HALF_M = 1.5;
/** The marker where a box or riser stands on the cable, a square this wide, metres. */
export const CABLE_FOOT_M = 1.4;
/** Over the pipes (0.05, 0.06), under the road plates (0.15). */
const CABLE_Y_OFFSET = 0.08;
const FOOT_Y_OFFSET = 0.09;
const CABLE_OPACITY = 0.95;
/** A dull red-orange, which no pipe wears. */
export const CABLE_RGB = 0xd0452a;
const FOOT_RGB = 0xf0a060;

type HeightSampler = (x: number, z: number) => number;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * The strips a cable tile draws, in tile-local metres as (x0, z0, x1, z1): a
 * hub at the centre and an arm out to each edge whose neighbour carries cable.
 * Pure and exported for tests.
 */
export function cableStrips(joins: {
  east: boolean;
  west: boolean;
  south: boolean;
  north: boolean;
}): Array<readonly [number, number, number, number]> {
  const mid = TILE_METERS / 2;
  const half = CABLE_STRIP_WIDTH_M / 2;
  const alongX = (x0: number, x1: number): readonly [number, number, number, number] => [
    x0,
    mid - half,
    x1,
    mid + half,
  ];
  const alongZ = (z0: number, z1: number): readonly [number, number, number, number] => [
    mid - half,
    z0,
    mid + half,
    z1,
  ];
  const out: Array<readonly [number, number, number, number]> = [];
  const alone = !joins.east && !joins.west && !joins.south && !joins.north;
  if (alone || joins.east || joins.west) out.push(alongX(mid - HUB_HALF_M, mid + HUB_HALF_M));
  if (alone || joins.south || joins.north) out.push(alongZ(mid - HUB_HALF_M, mid + HUB_HALF_M));
  if (joins.east) out.push(alongX(mid, TILE_METERS));
  if (joins.west) out.push(alongX(0, mid));
  if (joins.south) out.push(alongZ(mid, TILE_METERS));
  if (joins.north) out.push(alongZ(0, mid));
  return out;
}

/**
 * Where a cable under a street lies across it: `offset` metres from the
 * street's centre line, toward the side its pole line stood (under the footway
 * or the verge), along the street's run (`alongX` true when it runs east-west).
 */
export interface CablePlace {
  alongX: boolean;
  offset: number;
}

/**
 * The strip a cable draws under a street, in tile-local metres as (x0, z0, x1,
 * z1): the whole tile along the run, at its own offset, clear of both pipe runs.
 * Pure and exported for tests.
 */
export function placedCableStrip({
  alongX,
  offset,
}: CablePlace): readonly [number, number, number, number] {
  const mid = TILE_METERS / 2;
  const half = CABLE_STRIP_WIDTH_M / 2;
  return alongX
    ? [0, mid + offset - half, TILE_METERS, mid + offset + half]
    : [mid + offset - half, 0, mid + offset + half, TILE_METERS];
}

export class CableOverlayRenderer {
  private readonly mesh: THREE.Mesh;
  private readonly heightAt: HeightSampler;
  private tiles = 0;
  private feet = 0;
  private visible = false;

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.heightAt = heightAt;
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: CABLE_OPACITY,
        depthWrite: false,
      }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData['underground'] = 'keep';
    scene.add(this.mesh);
  }

  /** Rebuilds every strip and foot mark from the cable tiles and the points boxes and risers stand on. */
  rebuild(
    cables: readonly TilePoint[],
    feet: readonly { x: number; z: number }[],
    placeAt: (x: number, z: number) => CablePlace | null = () => null,
  ): void {
    const has = new Set(cables.map((t) => t.x * 100_000 + t.z));
    const positions: number[] = [];
    const colors: number[] = [];
    const cableColor = new THREE.Color(CABLE_RGB);
    const footColor = new THREE.Color(FOOT_RGB);
    for (const { x, z } of cables) {
      const [east, west, south, north] = ORTHOGONAL.map(([dx, dz]) =>
        has.has((x + dx) * 100_000 + (z + dz)),
      ) as [boolean, boolean, boolean, boolean];
      const place = placeAt(x, z);
      const strips = place ? [placedCableStrip(place)] : cableStrips({ east, west, south, north });
      for (const [x0, z0, x1, z1] of strips) {
        this.pushQuad(
          positions,
          colors,
          x * TILE_METERS + x0,
          z * TILE_METERS + z0,
          x * TILE_METERS + x1,
          z * TILE_METERS + z1,
          CABLE_Y_OFFSET,
          cableColor,
        );
      }
    }
    const half = CABLE_FOOT_M / 2;
    for (const f of feet) {
      this.pushQuad(
        positions,
        colors,
        f.x - half,
        f.z - half,
        f.x + half,
        f.z + half,
        FOOT_Y_OFFSET,
        footColor,
      );
    }
    this.tiles = cables.length;
    this.feet = feet.length;
    this.mesh.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    this.mesh.geometry = geometry;
    this.mesh.visible = this.visible;
  }

  /** The only thing that shows or hides the overlay, so a rebuild never undoes it. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.mesh.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Cable tiles and foot marks drawn, for tests and read-backs. */
  counts(): { tiles: number; feet: number } {
    return { tiles: this.tiles, feet: this.feet };
  }

  /** Triangles drawn, for tests and read-backs. */
  triangleCount(): number {
    return (this.mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }

  /** Two triangles over (x0, z0)-(x1, z1), each corner sampled off the terrain, split on its own diagonal. */
  private pushQuad(
    positions: number[],
    colors: number[],
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    yOffset: number,
    color: THREE.Color,
  ): void {
    const y00 = this.heightAt(x0, z0) + yOffset;
    const y10 = this.heightAt(x1, z0) + yOffset;
    const y11 = this.heightAt(x1, z1) + yOffset;
    const y01 = this.heightAt(x0, z1) + yOffset;
    positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
    positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
    for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
  }
}
