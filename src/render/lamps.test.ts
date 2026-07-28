import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { computeLampPlacements, LampRenderer, tierGetsLamp } from './lamps';
import { RoadTier, TilePoint } from '../shared/types';
import { LAMP_SPACING_TILES } from '../shared/constants';

const flatHeightAt = (): number => 0;

/** Builds a straight run of tiles, either horizontal (fixed z) or vertical (fixed x). */
function strip(fixed: number, from: number, to: number, orientation: 'ew' | 'ns'): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let v = from; v <= to; v++) {
    tiles.push(orientation === 'ew' ? { x: v, z: fixed } : { x: fixed, z: v });
  }
  return tiles;
}

describe('computeLampPlacements (pure)', () => {
  it('respects the shared LAMP_SPACING_TILES constant', () => {
    expect(LAMP_SPACING_TILES).toBe(3);
  });

  it('places lamps every LAMP_SPACING_TILES along an east-west road, offset on z, alternating sides', () => {
    const tiles = strip(5, 0, 6, 'ew'); // (0,5)..(6,5)
    const placements = computeLampPlacements(tiles);

    expect(placements).toEqual([
      { x: 1, z: 5, axis: 'z', side: 1 },
      { x: 4, z: 5, axis: 'z', side: -1 },
    ]);
  });

  it('places lamps every LAMP_SPACING_TILES along a north-south road, offset on x, alternating sides', () => {
    const tiles = strip(5, 0, 6, 'ns'); // (5,0)..(5,6)
    const placements = computeLampPlacements(tiles);

    expect(placements).toEqual([
      { x: 5, z: 1, axis: 'x', side: 1 },
      { x: 5, z: 4, axis: 'x', side: -1 },
    ]);
  });

  it('continues alternating sides across more than two lamps on a longer road', () => {
    const tiles = strip(0, 0, 12, 'ew'); // (0,0)..(12,0)
    const placements = computeLampPlacements(tiles);
    // sums divisible by 3: x=0,3,6,9,12 -> groups 0,1,2,3,4 -> sides +,-,+,-,+
    expect(placements.map((p) => p.side)).toEqual([1, -1, 1, -1, 1]);
    expect(placements.map((p) => p.x)).toEqual([0, 3, 6, 9, 12]);
  });

  it('is order-independent: shuffled input yields the same placement set', () => {
    const ordered = strip(0, 0, 12, 'ew');
    const shuffled = [...ordered].reverse();
    const a = computeLampPlacements(ordered);
    const b = computeLampPlacements(shuffled);
    const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
    expect(new Set(a.map(key))).toEqual(new Set(b.map(key)));
    expect(a.length).toBe(b.length);
  });

  it('defaults an isolated (non-adjacent) selected tile to the z axis', () => {
    const placements = computeLampPlacements([{ x: 9, z: 9 }]); // sum=18, divisible by 3, no neighbors
    expect(placements).toEqual([{ x: 9, z: 9, axis: 'z', side: 1 }]);
  });

  it('skips tiles whose (x+z) is not a multiple of LAMP_SPACING_TILES', () => {
    const placements = computeLampPlacements([{ x: 1, z: 1 }]); // sum=2
    expect(placements).toEqual([]);
  });

  it('produces no placements for an empty road tile list', () => {
    expect(computeLampPlacements([])).toEqual([]);
  });

  it('gates lamps by tier: every tier but gravel is lamp-eligible', () => {
    expect(tierGetsLamp(RoadTier.Gravel)).toBe(false);
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.Alley,
      RoadTier.OneWay,
      RoadTier.FourLane,
    ]) {
      expect(tierGetsLamp(tier)).toBe(true);
    }
    expect(tierGetsLamp(undefined)).toBe(true);
  });

  it('places no lamp on a gravel tile but keeps it as a neighbor for orientation', () => {
    // A straight EW run where the lamp tile (x=3) is gravel: it is skipped,
    // and the next eligible paved lamp tile still orients correctly.
    const tiles = strip(0, 0, 6, 'ew').map((t) => ({
      ...t,
      tier: t.x === 3 ? RoadTier.Gravel : RoadTier.TwoLane,
    }));
    const placements = computeLampPlacements(tiles);
    expect(placements.some((p) => p.x === 3)).toBe(false);
    expect(placements.some((p) => p.x === 6)).toBe(true);
  });

  it('is deterministic: repeated calls on the same input give the same result (no rng)', () => {
    const tiles = strip(2, 0, 20, 'ew');
    const a = computeLampPlacements(tiles);
    const b = computeLampPlacements(tiles);
    expect(b).toEqual(a);
  });
});

describe('LampRenderer', () => {
  it('rebuild() creates one instance per computed placement across every layer', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    const tiles = strip(0, 0, 12, 'ew'); // 5 placements (see test above)

    renderer.rebuild(tiles);

    expect(renderer.lampCount()).toBe(5);
    expect(renderer.poleInstanceCount()).toBe(5);
    expect(renderer.armInstanceCount()).toBe(5);
    expect(renderer.housingInstanceCount()).toBe(5);
    expect(renderer.coneInstanceCount()).toBe(5);
    expect(renderer.poolInstanceCount()).toBe(5);
  });

  it('adds exactly one InstancedMesh per layer (pole/arm/housing/cone/pool) to the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    const instancedMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    // Model parts: pole, arm, housing, cone, pool. No square glow
    // billboard — the bloom pass provides the housing glow instead.
    expect(instancedMeshes.length).toBe(5);

    // Only one PlaneGeometry layer remains (the ground pool).
    const planeMeshes = instancedMeshes.filter((c) => c.geometry.type === 'PlaneGeometry');
    expect(planeMeshes.length).toBe(1);

    // The pole is still a single tapered cylinder.
    const cylinderMeshes = instancedMeshes.filter((c) => c.geometry.type === 'CylinderGeometry');
    expect(cylinderMeshes.length).toBe(1);

    // The light cone is still a single cone.
    const coneMeshes = instancedMeshes.filter((c) => c.geometry.type === 'ConeGeometry');
    expect(coneMeshes.length).toBe(1);

    // The arm bracket (curved/angled, neck+reach) and the housing (tapered
    // mounting cap + cowl) are now merged multi-part geometries, not bare
    // boxes — so no BoxGeometry survives at the top level, and exactly 2
    // merged BufferGeometry layers remain.
    const boxMeshes = instancedMeshes.filter((c) => c.geometry.type === 'BoxGeometry');
    expect(boxMeshes.length).toBe(0);
    const mergedMeshes = instancedMeshes.filter((c) => c.geometry.type === 'BufferGeometry');
    expect(mergedMeshes.length).toBe(2); // arm + housing
  });

  it('models the arm and housing as merged multi-part geometry (curved bracket, tapered cowl) rather than bare boxes', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild([{ x: 4, z: 5 }]);

    const merged = scene.children.filter(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.geometry.type === 'BufferGeometry',
    );
    expect(merged.length).toBe(2); // arm bracket + housing cowl
    for (const mesh of merged) {
      const vertexCount = (mesh.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      // More than a single BoxGeometry's 24 vertices: proof each part is a
      // merged multi-segment/multi-piece shape, not one bare box.
      expect(vertexCount).toBeGreaterThan(24);
    }
  });

  it('rebuild() with no road tiles clears everything back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));
    expect(renderer.lampCount()).toBeGreaterThan(0);

    renderer.rebuild([]);
    expect(renderer.lampCount()).toBe(0);
    expect(renderer.poleInstanceCount()).toBe(0);
    expect(renderer.armInstanceCount()).toBe(0);
    expect(renderer.housingInstanceCount()).toBe(0);
    expect(renderer.coneInstanceCount()).toBe(0);
    expect(renderer.poolInstanceCount()).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });

  it('a second rebuild() disposes the previous meshes instead of accumulating them', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));
    const firstMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);

    renderer.rebuild(strip(0, 0, 30, 'ew'));
    const secondMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);

    expect(secondMeshes.length).toBe(5);
    for (const mesh of firstMeshes) expect(scene.children).not.toContain(mesh);
  });

  it('casts shadows from the pole, arm, and housing — the light cone and ground pool stay non-shadow-casting FX', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    expect(renderer.poleCastShadow()).toBe(true);
    expect(renderer.armCastShadow()).toBe(true);
    expect(renderer.housingCastShadow()).toBe(true);

    const instancedMeshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const cone = instancedMeshes.find((c) => c.geometry.type === 'ConeGeometry')!;
    const pool = instancedMeshes.find((c) => c.geometry.type === 'PlaneGeometry')!;
    expect(cone.castShadow).toBe(false);
    expect(pool.castShadow).toBe(false);
  });

  it('setNightFactor fades the housing/cone/pool layers together and clamps to [0,1]', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    renderer.setNightFactor(0);
    expect(renderer.housingEmissiveIntensity()).toBe(0);
    expect(renderer.coneOpacity()).toBe(0);
    expect(renderer.poolOpacity()).toBe(0);

    renderer.setNightFactor(1);
    expect(renderer.housingEmissiveIntensity()).toBeCloseTo(1, 9);
    expect(renderer.coneOpacity()).toBeGreaterThan(0);
    expect(renderer.poolOpacity()).toBeGreaterThan(0);

    renderer.setNightFactor(-4);
    expect(renderer.housingEmissiveIntensity()).toBe(0);
    expect(renderer.coneOpacity()).toBe(0);
    renderer.setNightFactor(9);
    expect(renderer.housingEmissiveIntensity()).toBeCloseTo(1, 9);
    expect(renderer.coneOpacity()).toBeGreaterThan(0);
  });

  it('places the pole at the curbside position, ground-height-following, with the arm mount above the pole', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    // A single selected tile at (4,5): axis defaults to 'z' (isolated tile), side -1.
    renderer.rebuild([{ x: 4, z: 5 }]);
    expect(renderer.lampCount()).toBe(1);

    const polePos = renderer.polePosition(0);
    const armPos = renderer.armPosition(0);
    expect(armPos.y).toBeGreaterThan(polePos.y);
  });

  it('the arm reaches from the pole toward the road centerline, and the housing sits at the arm end (laterally between the pole and the centerline, over the road)', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    // Isolated tile (4,5): axis 'z', side -1 -> pole offset toward -z from
    // tile center; the arm/housing must move back toward +z (the centerline).
    renderer.rebuild([{ x: 4, z: 5 }]);

    const polePos = renderer.polePosition(0);
    const housingPos = renderer.housingPosition(0);
    const poolPos = renderer.poolPosition(0);
    const conePos = renderer.conePosition(0);

    // Pole side is -1 on axis z: pole.z < tile center. The housing must be
    // pulled back toward the centerline, i.e. housing.z > pole.z, but by less
    // than double the pole's own offset from the tile center (ARM_LENGTH is
    // 0.8x the pole offset) — still over the near lane, same side as the pole.
    const tileCenterZ = 88; // tileToWorld(5) = (5+0.5)*16
    const poleOffsetFromCenter = tileCenterZ - polePos.z;
    expect(housingPos.z).toBeGreaterThan(polePos.z);
    expect(housingPos.z).toBeLessThan(tileCenterZ);
    expect(tileCenterZ - housingPos.z).toBeLessThan(poleOffsetFromCenter);

    // Cone and pool are centered under the housing (over the road), not at
    // the pole's x/z (the old "beside the road" position).
    expect(poolPos.x).toBeCloseTo(housingPos.x, 9);
    expect(poolPos.z).toBeCloseTo(housingPos.z, 9);
    expect(conePos.x).toBeCloseTo(housingPos.x, 9);
    expect(conePos.z).toBeCloseTo(housingPos.z, 9);
    expect(poolPos.z).not.toBeCloseTo(polePos.z, 1);
  });

  it('the arm bracket yaw rotates its local +X reach to match the actual world direction it must extend toward the road, for every axis/side combination', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);

    const check = (
      tiles: TilePoint[],
      slot: number,
      axis: 'x' | 'z',
      expectedSign: 1 | -1,
    ): void => {
      renderer.rebuild(tiles);
      const quat = renderer.armQuaternion(slot);
      const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
      const component = axis === 'x' ? dir.x : dir.z;
      expect(Math.sign(Math.round(component))).toBe(expectedSign);
    };

    // ns strip -> axis 'x': slot0 side=1 (pole offset +x, arm must reach -x),
    // slot1 side=-1 (pole offset -x, arm must reach +x).
    check(strip(5, 0, 6, 'ns'), 0, 'x', -1);
    check(strip(5, 0, 6, 'ns'), 1, 'x', 1);
    // ew strip -> axis 'z': slot0 side=1 (pole offset +z, arm must reach -z),
    // slot1 side=-1 (pole offset -z, arm must reach +z).
    check(strip(5, 0, 6, 'ew'), 0, 'z', -1);
    check(strip(5, 0, 6, 'ew'), 1, 'z', 1);
  });

  it('lamp part positions are deterministic: repeated rebuilds on the same tiles give identical transforms', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    const tiles = strip(0, 0, 12, 'ew');

    renderer.rebuild(tiles);
    const a = {
      pole: renderer.polePosition(2),
      arm: renderer.armPosition(2),
      housing: renderer.housingPosition(2),
      cone: renderer.conePosition(2),
      pool: renderer.poolPosition(2),
    };

    renderer.rebuild(tiles);
    const b = {
      pole: renderer.polePosition(2),
      arm: renderer.armPosition(2),
      housing: renderer.housingPosition(2),
      cone: renderer.conePosition(2),
      pool: renderer.poolPosition(2),
    };

    expect(b.pole).toEqual(a.pole);
    expect(b.arm).toEqual(a.arm);
    expect(b.housing).toEqual(a.housing);
    expect(b.cone).toEqual(a.cone);
    expect(b.pool).toEqual(a.pool);
  });

  it('adds a light-cone layer with one instance per lamp, apex at the housing, base at the ground pool', () => {
    const heights = new Map<string, number>([['80,80', 12]]);
    const heightAt = (x: number, z: number): number =>
      heights.get(`${Math.round(x)},${Math.round(z)}`) ?? 0;
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, heightAt);
    renderer.rebuild([{ x: 4, z: 5 }]);
    expect(renderer.lampCount()).toBe(1);
    expect(renderer.coneInstanceCount()).toBe(1);

    const housingPos = renderer.housingPosition(0);
    const poolPos = renderer.poolPosition(0);
    const coneApexY = renderer.coneApexY(0);
    const coneBaseY = renderer.coneBaseY(0);

    // Apex sits exactly at the housing height; base sits exactly at the
    // ground light-pool height, so the cone visibly spans housing -> ground.
    expect(coneApexY).toBeCloseTo(housingPos.y, 4);
    expect(coneBaseY).toBeGreaterThan(0);
    expect(coneBaseY).toBeLessThan(housingPos.y);
    expect(coneBaseY).toBeCloseTo(poolPos.y, 4);
    // The cone/pool sit laterally over the housing's position (over the
    // road), not the pole's.
    expect(poolPos.x).toBeCloseTo(housingPos.x, 9);
    expect(poolPos.z).toBeCloseTo(housingPos.z, 9);
  });

  it('cone opacity fades in on the night factor: 0 in daylight, positive at night', () => {
    const scene = new THREE.Scene();
    const renderer = new LampRenderer(scene, flatHeightAt);
    renderer.rebuild(strip(0, 0, 12, 'ew'));

    renderer.setNightFactor(0);
    expect(renderer.coneOpacity()).toBe(0);

    renderer.setNightFactor(0.5);
    const midOpacity = renderer.coneOpacity();
    expect(midOpacity).toBeGreaterThan(0);

    renderer.setNightFactor(1);
    expect(renderer.coneOpacity()).toBeGreaterThan(midOpacity);
  });
});
