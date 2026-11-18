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
import { UNDERGROUND_CABLE_FOOT_HEX, UNDERGROUND_CABLE_HEX } from '../shared/lenses';

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
export const CABLE_RGB = UNDERGROUND_CABLE_HEX;
const FOOT_RGB = UNDERGROUND_CABLE_FOOT_HEX;

type HeightSampler = (x: number, z: number) => number;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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

type Quad = readonly [number, number, number, number];

/** A foot further than this from every strip belongs to no run here, so no lead is drawn to it, metres. */
const FOOT_LEAD_REACH_M = TILE_METERS * 1.5;

/** Where a tile's strip meets the edge it shares with a neighbour along `dx, dz`: the offset from the tile's centre line, across that edge. */
function edgeOffset(place: CablePlace | null, dx: number): number {
  if (!place) return 0;
  return place.alongX === (dx !== 0) ? place.offset : 0;
}

const rectOf = (x0: number, z0: number, x1: number, z1: number): Quad => [
  Math.min(x0, x1),
  Math.min(z0, z1),
  Math.max(x0, x1),
  Math.max(z0, z1),
];

/**
 * Every rectangle of the buried cable in world metres as (x0, z0, x1, z1): a
 * street's strip along the footway side, a hub and arms on the centre line of
 * open ground, a jog across wherever two neighbours lie at different offsets
 * so the run is one unbroken line, and a lead from each foot to the nearest
 * cable so a riser stands at the end of what it carries. Pure and exported
 * for tests.
 */
export function cableQuads(
  cables: readonly TilePoint[],
  placeAt: (x: number, z: number) => CablePlace | null,
  feet: readonly { x: number; z: number }[],
): Quad[] {
  const has = new Set(cables.map((t) => t.x * 100_000 + t.z));
  const places = new Map<number, CablePlace | null>();
  const placeOf = (x: number, z: number): CablePlace | null => {
    const key = x * 100_000 + z;
    if (!places.has(key)) places.set(key, placeAt(x, z));
    return places.get(key) ?? null;
  };
  const mid = TILE_METERS / 2;
  const half = CABLE_STRIP_WIDTH_M / 2;
  const out: Quad[] = [];
  const add = (x: number, z: number, [x0, z0, x1, z1]: Quad): void => {
    out.push([
      x * TILE_METERS + x0,
      z * TILE_METERS + z0,
      x * TILE_METERS + x1,
      z * TILE_METERS + z1,
    ]);
  };
  for (const { x, z } of cables) {
    const place = placeOf(x, z);
    const joined = ORTHOGONAL.filter(([dx, dz]) => has.has((x + dx) * 100_000 + (z + dz)));
    if (place) {
      add(x, z, placedCableStrip(place));
      for (const [dx, dz] of joined) {
        const neighbour = placeOf(x + dx, z + dz);
        const across = place.alongX === (dx !== 0);
        if (!across) {
          // An arm off the run's side to the edge, along the centre line.
          const edge = dx > 0 || dz > 0 ? TILE_METERS : 0;
          add(
            x,
            z,
            dx !== 0
              ? rectOf(mid + place.offset, mid - half, edge, mid + half)
              : rectOf(mid - half, mid + place.offset, mid + half, edge),
          );
          continue;
        }
        // Along the run: where the two strips lie at different offsets, a jog
        // across the shared edge, drawn once by the tile it is east or south of.
        const there = edgeOffset(neighbour, dx);
        if ((dx > 0 || dz > 0) && there !== place.offset && neighbour?.alongX === place.alongX) {
          const lo = mid + Math.min(place.offset, there) - half;
          const hi = mid + Math.max(place.offset, there) + half;
          add(
            x,
            z,
            place.alongX
              ? rectOf(TILE_METERS - half, lo, TILE_METERS + half, hi)
              : rectOf(lo, TILE_METERS - half, hi, TILE_METERS + half),
          );
        }
      }
      continue;
    }
    // A hub on each axis the tile joins on, both where it stands alone.
    if (joined.length === 0 || joined.some(([dx]) => dx !== 0)) {
      add(x, z, rectOf(mid - HUB_HALF_M, mid - half, mid + HUB_HALF_M, mid + half));
    }
    if (joined.length === 0 || joined.some(([, dz]) => dz !== 0)) {
      add(x, z, rectOf(mid - half, mid - HUB_HALF_M, mid + half, mid + HUB_HALF_M));
    }
    for (const [dx, dz] of joined) {
      const lateral = edgeOffset(placeOf(x + dx, z + dz), dx);
      const edge = dx > 0 || dz > 0 ? TILE_METERS : 0;
      if (dx !== 0) {
        add(x, z, rectOf(mid, mid + lateral - half, edge, mid + lateral + half));
      } else {
        add(x, z, rectOf(mid + lateral - half, mid, mid + lateral + half, edge));
      }
      if (lateral !== 0) {
        // Across from the centre line to where the neighbour's strip meets the edge.
        add(
          x,
          z,
          dx !== 0
            ? rectOf(mid - half, mid, mid + half, mid + lateral)
            : rectOf(mid, mid - half, mid + lateral, mid + half),
        );
      }
    }
  }
  const runs = out.length;
  for (const f of feet) {
    let best: { x: number; z: number; d: number } | null = null;
    for (let i = 0; i < runs; i++) {
      const [x0, z0, x1, z1] = out[i]!;
      const px = Math.min(Math.max(f.x, x0), x1);
      const pz = Math.min(Math.max(f.z, z0), z1);
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d <= FOOT_LEAD_REACH_M && (!best || d < best.d)) best = { x: px, z: pz, d };
    }
    if (!best || best.d < half) continue;
    // Out along the run from the foot, then across to the strip's end.
    out.push(rectOf(f.x, f.z - half, best.x, f.z + half));
    out.push(rectOf(best.x - half, f.z, best.x + half, best.z));
  }
  return out;
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
    const positions: number[] = [];
    const colors: number[] = [];
    const cableColor = new THREE.Color(CABLE_RGB);
    const footColor = new THREE.Color(FOOT_RGB);
    for (const [x0, z0, x1, z1] of cableQuads(cables, placeAt, feet)) {
      this.pushQuad(positions, colors, x0, z0, x1, z1, CABLE_Y_OFFSET, cableColor);
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
