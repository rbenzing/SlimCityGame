import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, FarmKind } from '../shared/types';
import { FarmRenderer, cowPose } from './farms';
import { orchardTrees, paddockHerd, planFarm, type FarmRect } from './farmlot';

const farm = (kind: FarmKind, level: number, w: number, d: number): BuildingCatalogEntry => ({
  id: `farm-${kind}-${level}`,
  name: kind,
  category: 'ind',
  zone: ZoneType.Agriculture,
  level,
  farm: kind,
  footprint: { w, d },
  height: 9 + level,
  color: 0x7a3a2c,
  residents: 4,
  jobs: level,
  powerUse: 0.2,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
});
const catalog = [
  farm('crops', 1, 4, 5),
  farm('crops', 3, 6, 7),
  farm('orchard', 1, 4, 5),
  farm('pasture', 2, 5, 6),
];
const standing = (
  catalogId: string,
  state: BuildingState = BuildingState.Active,
  id = 1,
): BuildingInstance => ({ id, catalogId, x: 10, z: 10, rotation: 0, level: 1, state, problems: 0 });
const dirtNorth = (_x: number, z: number): boolean => z === 9;
const flat = (): number => 3;

function renderer(): FarmRenderer {
  return new FarmRenderer(new THREE.Scene(), flat, catalog, dirtNorth);
}

describe('cowPose', () => {
  const paddock: FarmRect = { x0: 200, z0: 230, x1: 300, z1: 320 };

  it('keeps every head clear of the fence at every hour', () => {
    for (let i = 0; i < 6; i++) {
      for (let t = 0; t < 3_600_000; t += 37_000) {
        const { x, z } = cowPose(paddock, 5, i, t);
        expect(x).toBeGreaterThanOrEqual(paddock.x0 + 4 - 1e-9);
        expect(x).toBeLessThanOrEqual(paddock.x1 - 4 + 1e-9);
        expect(z).toBeGreaterThanOrEqual(paddock.z0 + 4 - 1e-9);
        expect(z).toBeLessThanOrEqual(paddock.z1 - 4 + 1e-9);
      }
    }
  });

  it('faces the way it walks, and walks at a grazing pace', () => {
    const a = cowPose(paddock, 5, 2, 100_000);
    const b = cowPose(paddock, 5, 2, 101_000);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    expect(Math.abs(Math.atan2(Math.sin(heading - a.yaw), Math.cos(heading - a.yaw)))).toBeLessThan(
      0.1,
    );
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.4);
  });

  it('is the same for the same farm, head and time, and different between heads', () => {
    expect(cowPose(paddock, 5, 1, 42_000)).toEqual(cowPose(paddock, 5, 1, 42_000));
    expect(cowPose(paddock, 5, 1, 42_000)).not.toEqual(cowPose(paddock, 5, 2, 42_000));
  });
});

describe('FarmRenderer', () => {
  it('stands a crop farm’s barn roof, farmhouse and silo, and no trees or herd', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-crops-1')], updated: [], removed: [] });
    expect(r.partCount('barnRoof')).toBe(1);
    expect(r.partCount('houseBody')).toBe(1);
    expect(r.partCount('houseRoof')).toBe(1);
    expect(r.partCount('silo')).toBe(1);
    expect(r.partCount('siloDome')).toBe(1);
    expect(r.partCount('crown')).toBe(0);
    expect(r.herdSize()).toBe(0);
  });

  it('grows a large crop farm two silos and two bins', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-crops-3')], updated: [], removed: [] });
    expect(r.partCount('silo')).toBe(2);
    expect(r.partCount('bin')).toBe(2);
    expect(r.partCount('binRoof')).toBe(2);
  });

  it('plants an orchard tree by tree, each a trunk under a crown', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-orchard-1')], updated: [], removed: [] });
    const plan = planFarm(standing('farm-orchard-1'), catalog[2]!, dirtNorth)!;
    expect(r.partCount('crown')).toBe(orchardTrees(plan).length);
    expect(r.partCount('trunk')).toBe(orchardTrees(plan).length);
    expect(r.partCount('silo')).toBe(0);
  });

  it('fences a paddock and grazes its herd in it', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-pasture-2')], updated: [], removed: [] });
    const plan = planFarm(standing('farm-pasture-2'), catalog[3]!, dirtNorth)!;
    expect(r.herdSize()).toBe(paddockHerd(plan));
    expect(r.partCount('post')).toBeGreaterThan(0);
    expect(r.partCount('rail')).toBe(r.partCount('post') * 2);
  });

  it('shows only the barn frame and bare ground while a farm is going up', () => {
    const r = renderer();
    r.apply({
      added: [standing('farm-pasture-2', BuildingState.Constructing)],
      updated: [],
      removed: [],
    });
    expect(r.partCount('barnRoof')).toBe(0);
    expect(r.herdSize()).toBe(0);
  });

  it('keeps an abandoned farm’s buildings but not its herd', () => {
    const r = renderer();
    r.apply({
      added: [standing('farm-pasture-2', BuildingState.Abandoned)],
      updated: [],
      removed: [],
    });
    expect(r.partCount('barnRoof')).toBe(1);
    expect(r.partCount('post')).toBeGreaterThan(0);
    expect(r.herdSize()).toBe(0);
  });

  it('gives back every part when a farm goes, and rebuilds it whole when it changes', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-pasture-2')], updated: [], removed: [] });
    const posts = r.partCount('post');
    r.apply({ added: [], updated: [standing('farm-pasture-2')], removed: [] });
    expect(r.partCount('post')).toBe(posts);
    r.apply({ added: [], updated: [], removed: [1] });
    expect(r.herdSize()).toBe(0);
    // Freed slots are recycled rather than removed, so the next farm reuses them.
    r.apply({
      added: [standing('farm-pasture-2', BuildingState.Active, 2)],
      updated: [],
      removed: [],
    });
    expect(r.partCount('post')).toBe(posts);
  });

  it('draws nothing for a building that is not a farm', () => {
    const house = {
      ...farm('crops', 1, 2, 2),
      id: 'house',
      zone: ZoneType.ResLow,
      farm: undefined,
    };
    const r = new FarmRenderer(new THREE.Scene(), flat, [house], dirtNorth);
    r.apply({ added: [standing('house')], updated: [], removed: [] });
    expect(r.partCount('barnRoof')).toBe(0);
    expect(r.partCount('houseBody')).toBe(0);
  });
});
