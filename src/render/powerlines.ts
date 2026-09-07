/**
 * Power lines: wooden poles with wire slung between them.
 *
 * A line's tiles come from the sim as a membership layer, with no notion of
 * which pole joins which. The shape is recovered here, from the layer itself:
 * a pole stands on every line tile, and a span is drawn to its neighbour to
 * the east and to the south — each ordered pair once, so no span is drawn
 * twice — which yields exactly the run the player dragged.
 *
 * The wire hangs. A span is a shallow catenary rather than a straight bar,
 * approximated by a few segments, because a dead-straight wire between two
 * poles is the single clearest tell that a power line is a diagram and not a
 * thing in the world.
 */

import * as THREE from 'three';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

/** Pole height above the ground it stands on, metres. */
const POLE_HEIGHT = 9;
const POLE_RADIUS_TOP = 0.11;
const POLE_RADIUS_BOTTOM = 0.16;
const POLE_RADIAL_SEGMENTS = 6;
/** Creosoted timber, brown enough to read against both grass and asphalt. */
const POLE_COLOR = 0x5c4a38;

/** The crossarm the wires hang off, across the run. */
const ARM_LENGTH = 2.2;
const ARM_THICKNESS = 0.12;
const ARM_HEIGHT = POLE_HEIGHT - 0.9;

/** Lateral offsets of the wires along the crossarm, metres from the pole. */
const WIRE_OFFSETS: readonly number[] = [-0.85, 0, 0.85];
const WIRE_COLOR = 0x2a2a2c;
/** How far the middle of a span dips below its ends, metres. */
const WIRE_SAG = 0.55;
/** Segments per span — enough for the sag to read as a curve, not a kink. */
const WIRE_SEGMENTS = 6;

const tileKey = (x: number, z: number): number => z * 4096 + x;

/** Where a pole stands in world space, and how high its crossarm sits. */
export interface PolePlacement {
  x: number;
  z: number;
  /** True when the run continues east, so a span is drawn that way. */
  spanEast: boolean;
  /** True when the run continues south. */
  spanSouth: boolean;
}

/**
 * Works out which poles carry a span to which, from the line layer alone.
 * Each span is claimed by its west/north end so a run of N poles yields N-1
 * spans rather than 2(N-1) overlapping ones.
 */
export function computePolePlacements(tiles: readonly TilePoint[]): PolePlacement[] {
  const present = new Set<number>();
  for (const t of tiles) present.add(tileKey(t.x, t.z));
  return tiles.map((t) => ({
    x: t.x,
    z: t.z,
    spanEast: present.has(tileKey(t.x + 1, t.z)),
    spanSouth: present.has(tileKey(t.x, t.z + 1)),
  }));
}

/**
 * A catenary's points between two ends, as a fraction of the way along. The
 * sag is a simple parabola — indistinguishable from a real catenary over a
 * span this short, and far cheaper to evaluate.
 */
function sagAt(t: number): number {
  return -WIRE_SAG * 4 * t * (1 - t);
}

export class PowerLineRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  private readonly poleGeometry: THREE.CylinderGeometry;
  private readonly armGeometry: THREE.BoxGeometry;
  private readonly poleMaterial: THREE.MeshLambertMaterial;
  private readonly wireMaterial: THREE.MeshBasicMaterial;

  private poleMesh: THREE.InstancedMesh | null = null;
  private armMesh: THREE.InstancedMesh | null = null;
  private wireMesh: THREE.LineSegments | null = null;
  private placements: PolePlacement[] = [];

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.poleGeometry = new THREE.CylinderGeometry(
      POLE_RADIUS_TOP,
      POLE_RADIUS_BOTTOM,
      POLE_HEIGHT,
      POLE_RADIAL_SEGMENTS,
    );
    this.poleGeometry.translate(0, POLE_HEIGHT / 2, 0);
    this.armGeometry = new THREE.BoxGeometry(ARM_LENGTH, ARM_THICKNESS, ARM_THICKNESS);
    this.poleMaterial = new THREE.MeshLambertMaterial({ color: POLE_COLOR });
    this.wireMaterial = new THREE.MeshBasicMaterial({ color: WIRE_COLOR });
  }

  /** Full rebuild from the current set of line tiles. */
  rebuild(tiles: readonly TilePoint[]): void {
    this.dispose();
    this.placements = computePolePlacements(tiles);
    const count = this.placements.length;
    if (count === 0) return;

    this.poleMesh = new THREE.InstancedMesh(this.poleGeometry, this.poleMaterial, count);
    this.armMesh = new THREE.InstancedMesh(this.armGeometry, this.poleMaterial, count);
    this.poleMesh.castShadow = true;
    this.armMesh.castShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const p = this.placements[i]!;
      const wx = (p.x + 0.5) * TILE_METERS;
      const wz = (p.z + 0.5) * TILE_METERS;
      const base = this.heightAt(wx, wz);
      m.compose(new THREE.Vector3(wx, base, wz), new THREE.Quaternion(), scale);
      this.poleMesh.setMatrixAt(i, m);
      // The crossarm lies across the run: north-south where the line runs
      // east, east-west otherwise, so the wires never run through the timber.
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.spanEast ? Math.PI / 2 : 0);
      m.compose(new THREE.Vector3(wx, base + ARM_HEIGHT, wz), q, scale);
      this.armMesh.setMatrixAt(i, m);
    }
    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.armMesh.instanceMatrix.needsUpdate = true;

    const points = this.buildWirePoints();
    if (points.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      this.wireMesh = new THREE.LineSegments(geometry, this.wireMaterial);
    }

    this.scene.add(this.poleMesh, this.armMesh);
    if (this.wireMesh) this.scene.add(this.wireMesh);
  }

  /** Flat [x,y,z, x,y,z, ...] pairs, two per wire segment. */
  private buildWirePoints(): number[] {
    const out: number[] = [];
    for (const p of this.placements) {
      const here = { x: (p.x + 0.5) * TILE_METERS, z: (p.z + 0.5) * TILE_METERS };
      const spans: TilePoint[] = [];
      if (p.spanEast) spans.push({ x: p.x + 1, z: p.z });
      if (p.spanSouth) spans.push({ x: p.x, z: p.z + 1 });
      for (const n of spans) {
        const there = { x: (n.x + 0.5) * TILE_METERS, z: (n.z + 0.5) * TILE_METERS };
        const yA = this.heightAt(here.x, here.z) + ARM_HEIGHT;
        const yB = this.heightAt(there.x, there.z) + ARM_HEIGHT;
        // An offset moves the wire ACROSS the run, so the three wires sit
        // side by side along the crossarm rather than one behind another.
        const eastward = n.x !== p.x;
        const acrossX = eastward ? 0 : 1;
        const acrossZ = eastward ? 1 : 0;
        for (const off of WIRE_OFFSETS) {
          for (let s = 0; s < WIRE_SEGMENTS; s++) {
            const t0 = s / WIRE_SEGMENTS;
            const t1 = (s + 1) / WIRE_SEGMENTS;
            for (const t of [t0, t1]) {
              out.push(
                here.x + (there.x - here.x) * t + acrossX * off,
                yA + (yB - yA) * t + sagAt(t),
                here.z + (there.z - here.z) * t + acrossZ * off,
              );
            }
          }
        }
      }
    }
    return out;
  }

  /** Number of poles standing after the last rebuild. */
  poleCount(): number {
    return this.placements.length;
  }

  /** World position of a pole's base, for a harness to read back. */
  polePosition(index: number): { x: number; y: number; z: number } | null {
    const p = this.placements[index];
    if (!p) return null;
    const x = (p.x + 0.5) * TILE_METERS;
    const z = (p.z + 0.5) * TILE_METERS;
    return { x, y: this.heightAt(x, z), z };
  }

  dispose(): void {
    for (const mesh of [this.poleMesh, this.armMesh]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.dispose();
    }
    if (this.wireMesh) {
      this.scene.remove(this.wireMesh);
      this.wireMesh.geometry.dispose();
    }
    this.poleMesh = null;
    this.armMesh = null;
    this.wireMesh = null;
    this.placements = [];
  }
}
