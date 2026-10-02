/**
 * The water-pipe overlay: where the pipes run, drawn on the ground while the
 * player is working on the water.
 *
 * A pipe is buried, so nothing stands on its tiles the way poles stand on a
 * power line's. It shows as a strip through each pipe tile's centre, joined to
 * the orthogonal neighbours that carry water — another pipe, a road whose main
 * carries water, a building it feeds — split lengthwise into a blue half for
 * the water going out and a brown half for the sewage coming back: one pipe,
 * both flows. The strips conform to the terrain the way the zone grid's lines
 * do, and sit a hair above the road plates so a pipe under a street still
 * shows.
 *
 * Visible only while a water tool is in hand or a water lens is on, like the
 * zone grid; `setVisible` is the only thing that changes that.
 */
import * as THREE from 'three';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

/** Above the road plates (0.15), the brown a hair over the blue so their crossings never fight. */
const WATER_Y_OFFSET = 0.17;
const SEWER_Y_OFFSET = 0.18;
/** Each flow's strip, and how far either side of the tile's centre line it runs. */
export const PIPE_STRIP_WIDTH_M = 1.2;
export const PIPE_STRIP_OFFSET_M = 0.9;
/** The hub every pipe tile draws, joined or not, so a lone tile still shows. */
const HUB_HALF_M = 1.5;
const OPACITY = 0.85;

/** The lens's water accent, and a drain-brown beside it. */
const WATER_RGB = 0x38b6e3;
const SEWER_RGB = 0x8a5a2b;

type HeightSampler = (x: number, z: number) => number;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Two triangles over the quad (x0,z0)-(x1,z1), each corner sampled through
 * `heightAt` + yOffset, split on the terrain's own diagonal (see zonegrid.ts).
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
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
}

/**
 * The strips a pipe tile draws, in tile-local metres: a hub at the centre and
 * an arm out to each edge whose neighbour carries water. Each strip is given
 * as (x0, z0, x1, z1) for the blue run; the brown run is the same rectangle
 * shifted to the other side of the centre line. Pure and exported for tests.
 */
export function pipeStrips(joins: {
  east: boolean;
  west: boolean;
  south: boolean;
  north: boolean;
}): Array<readonly [number, number, number, number]> {
  const mid = TILE_METERS / 2;
  const half = PIPE_STRIP_WIDTH_M / 2;
  const off = PIPE_STRIP_OFFSET_M;
  const out: Array<readonly [number, number, number, number]> = [];
  // Along X: the strip lies off the centre line in Z; along Z, off it in X.
  const alongX = (x0: number, x1: number): readonly [number, number, number, number] => [
    x0,
    mid - off - half,
    x1,
    mid - off + half,
  ];
  const alongZ = (z0: number, z1: number): readonly [number, number, number, number] => [
    mid - off - half,
    z0,
    mid - off + half,
    z1,
  ];
  out.push(alongX(mid - HUB_HALF_M, mid + HUB_HALF_M));
  out.push(alongZ(mid - HUB_HALF_M, mid + HUB_HALF_M));
  if (joins.east) out.push(alongX(mid, TILE_METERS));
  if (joins.west) out.push(alongX(0, mid));
  if (joins.south) out.push(alongZ(mid, TILE_METERS));
  if (joins.north) out.push(alongZ(0, mid));
  return out;
}

export class PipeOverlayRenderer {
  private readonly water: THREE.Mesh;
  private readonly sewer: THREE.Mesh;
  private readonly heightAt: HeightSampler;
  private visible = false;

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.heightAt = heightAt;
    const material = (hex: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: OPACITY,
        depthWrite: false,
      });
    this.water = new THREE.Mesh(new THREE.BufferGeometry(), material(WATER_RGB));
    this.sewer = new THREE.Mesh(new THREE.BufferGeometry(), material(SEWER_RGB));
    for (const mesh of [this.water, this.sewer]) {
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
    }
  }

  /**
   * Rebuilds the strips from every pipe tile, joining each to the neighbours
   * `carriesWater` says conduct — pipes, mains and the buildings they feed.
   */
  rebuild(tiles: readonly TilePoint[], carriesWater: (x: number, z: number) => boolean): void {
    const water: number[] = [];
    const sewer: number[] = [];
    for (const { x, z } of tiles) {
      const [east, west, south, north] = ORTHOGONAL.map(([dx, dz]) =>
        carriesWater(x + dx, z + dz),
      ) as [boolean, boolean, boolean, boolean];
      const baseX = x * TILE_METERS;
      const baseZ = z * TILE_METERS;
      for (const [x0, z0, x1, z1] of pipeStrips({ east, west, south, north })) {
        pushConformingQuad(
          water,
          this.heightAt,
          baseX + x0,
          baseZ + z0,
          baseX + x1,
          baseZ + z1,
          WATER_Y_OFFSET,
        );
        // The brown run mirrors the blue across the centre line: an X strip
        // moves in Z, a Z strip in X.
        const alongX = x1 - x0 > z1 - z0;
        const shift = 2 * PIPE_STRIP_OFFSET_M;
        pushConformingQuad(
          sewer,
          this.heightAt,
          baseX + x0 + (alongX ? 0 : shift),
          baseZ + z0 + (alongX ? shift : 0),
          baseX + x1 + (alongX ? 0 : shift),
          baseZ + z1 + (alongX ? shift : 0),
          SEWER_Y_OFFSET,
        );
      }
    }
    this.replace(this.water, water);
    this.replace(this.sewer, sewer);
  }

  /** The only thing that shows or hides the overlay, so a rebuild never undoes it. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.water.visible = visible;
    this.sewer.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Triangles drawn for each flow — for tests and read-backs. */
  triangleCount(): { water: number; sewer: number } {
    const count = (mesh: THREE.Mesh): number =>
      (mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    return { water: count(this.water), sewer: count(this.sewer) };
  }

  dispose(): void {
    for (const mesh of [this.water, this.sewer]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.parent?.remove(mesh);
    }
  }

  private replace(mesh: THREE.Mesh, positions: number[]): void {
    mesh.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
    mesh.visible = this.visible;
  }
}
