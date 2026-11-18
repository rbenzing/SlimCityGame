import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RoadMeshRenderer } from './roadsmesh';
import { TreeRenderer, crownReach, type TreeSpecies } from './trees';
import { endCapsOf } from './roadfurniture';
import type { FurnitureRoadTile } from './roadfurniture';
import { RoadFlow, RoadTier } from '../shared/types';
import type { MapData, RoadTileDelta } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const SIZE = 14;
const ROW = 6;
const FIRST = 3;
const LAST = 9;
const E = 2;
const W = 8;
const SPECIES: readonly TreeSpecies[] = ['broadleaf', 'pine', 'poplar', 'shrub'];

function delta(x: number, tier: RoadTier, mask: number): RoadTileDelta {
  return { x, z: ROW, tier, mask, elevation: 0, profile: tier, flow: RoadFlow.None };
}

function deadEnd(tier: RoadTier): { deltas: RoadTileDelta[]; tiles: FurnitureRoadTile[] } {
  const deltas: RoadTileDelta[] = [];
  const tiles: FurnitureRoadTile[] = [];
  for (let x = FIRST; x <= LAST; x++) {
    deltas.push(delta(x, tier, (x > FIRST ? W : 0) | (x < LAST ? E : 0)));
    tiles.push({ x, z: ROW, tier });
  }
  return { deltas, tiles };
}

type Tri = [number, number, number, number, number, number];

function trianglesOf(scene: THREE.Scene): Tri[] {
  const out: Tri[] = [];
  for (const mesh of scene.children) {
    if (!(mesh instanceof THREE.Mesh)) continue;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i + 2 < p.count; i += 3) {
      out.push([p.getX(i), p.getZ(i), p.getX(i + 1), p.getZ(i + 1), p.getX(i + 2), p.getZ(i + 2)]);
    }
  }
  return out;
}

function inside(t: Tri, x: number, z: number): boolean {
  const area = (t[2] - t[0]) * (t[5] - t[1]) - (t[3] - t[1]) * (t[4] - t[0]);
  if (Math.abs(area) < 1e-9) return false;
  const side = (ax: number, az: number, bx: number, bz: number): number =>
    (bx - ax) * (z - az) - (bz - az) * (x - ax);
  const d1 = side(t[0], t[1], t[2], t[3]);
  const d2 = side(t[2], t[3], t[4], t[5]);
  const d3 = side(t[4], t[5], t[0], t[1]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Every visible instance whose crown lies over road: its trunk or a point on its crown's rim is on a road triangle. */
function treesOnRoad(trees: TreeRenderer, tris: readonly Tri[]): string[] {
  const found: string[] = [];
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const species of SPECIES) {
    const mesh = trees.meshFor(species);
    if (!mesh) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      if (m.elements[0] === 0) continue;
      m.decompose(pos, quat, scale);
      const reach = crownReach(species, scale.x);
      const probes: Array<[number, number]> = [[0, 0]];
      for (let k = 0; k < 8; k++) {
        probes.push([Math.cos((k * Math.PI) / 4) * reach, Math.sin((k * Math.PI) / 4) * reach]);
      }
      if (probes.some(([dx, dz]) => tris.some((t) => inside(t, pos.x + dx, pos.z + dz)))) {
        found.push(`${species} at ${pos.x.toFixed(1)},${pos.z.toFixed(1)}`);
      }
    }
  }
  return found;
}

function map(): MapData {
  const n = SIZE * SIZE;
  return {
    name: 'test',
    size: SIZE,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n).fill(255),
    seaLevel: 0,
    spawn: { x: 0, z: 0 },
  };
}

describe('wild trees and shrubs stay off a dead end’s rounded cap', () => {
  for (const [tier, bites] of [
    [RoadTier.FourLane, true],
    [RoadTier.Avenue, true],
    [RoadTier.TwoLane, false],
  ] as const) {
    it(`no crown over the paving of a dead-end tier ${tier}, cap included`, () => {
      const { deltas, tiles } = deadEnd(tier);
      const scene = new THREE.Scene();
      new RoadMeshRenderer(scene, () => 0).apply(deltas);
      const tris = trianglesOf(scene);
      const road = tiles.map((t) => ({ x: t.x, z: t.z }));
      const caps = endCapsOf(tiles);
      expect(caps.length).toBe(2);

      let before = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const trees = new TreeRenderer(new THREE.Scene(), () => 0);
        trees.build(map(), seed);
        trees.clearAt(road);
        trees.clearBeside(road);
        before += treesOnRoad(trees, tris).length;
        trees.clearEndCaps(caps);
        expect(treesOnRoad(trees, tris)).toEqual([]);
      }
      // The check bites: without the cap rule some seed leaves a crown on it.
      if (bites) expect(before).toBeGreaterThan(0);
    });
  }

  it('leaves the trees clear of the cap standing', () => {
    const { tiles } = deadEnd(RoadTier.FourLane);
    const road = tiles.map((t) => ({ x: t.x, z: t.z }));
    const trees = new TreeRenderer(new THREE.Scene(), () => 0);
    trees.build(map(), 3);
    trees.clearAt(road);
    trees.clearBeside(road);
    const count = (): number => {
      let n = 0;
      const m = new THREE.Matrix4();
      for (const s of SPECIES) {
        const mesh = trees.meshFor(s);
        for (let i = 0; mesh && i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          if (m.elements[0] !== 0) n++;
        }
      }
      return n;
    };
    const before = count();
    trees.clearEndCaps(endCapsOf(tiles));
    expect(count()).toBeGreaterThan(before - 12);
    expect(count()).toBeLessThan(before + 1);
    expect(TILE_METERS).toBe(20);
  });
});
