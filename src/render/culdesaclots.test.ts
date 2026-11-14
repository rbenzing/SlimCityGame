import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DRIVE_END_CLEARANCE_M } from '../shared/culdesac';
import { TILE_METERS } from '../shared/constants';
import {
  BuildingState,
  RoadFlow,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';
import { bulbFanToWorld, bulbMouthGapM, bulbReachM, bulbRingPoint } from './bulbfront';
import { bulbFrontOf, type BulbStreet } from './culdesacmesh';
import type { StreetLookup } from './frontage';
import { homeDriveCuts, lotToWorld, planHouseGround } from './houselot';
import { LotRenderer } from './lots';

// A 2x2 turning circle at tiles 10..11, its street leaving the south side on the
// block's east column, so its mouth is in the south-east quarter of the ring.
const CENTRE = 11 * TILE_METERS;
const STREET: BulbStreet = { side: RoadFlow.South, lateral: 10, half: 4.4, kerb: 1.9 };
const FRONT = bulbFrontOf(CENTRE, CENTRE, STREET);
const inBlock = (x: number, z: number): boolean => x >= 10 && x <= 11 && z >= 10 && z <= 11;
const roadAt = inBlock;
const street: StreetLookup = (x, z) =>
  inBlock(x, z) ? { vergeM: 3.8, sidewalkM: 1.9, bulb: FRONT } : null;

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'home',
    name: 'Home',
    category: 'res',
    zone: ZoneType.ResLow,
    kind: 'detached',
    level: 1,
    footprint: { w: 2, d: 2 },
    height: 4,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  };
}

function building(over: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'home',
    x: 10,
    z: 8,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  };
}

const home = entry();
/** A lot north of the block, one east of it, and one west of it. */
const NORTH = { x: 10, z: 8 };
const EAST = { x: 12, z: 10 };
const WEST = { x: 8, z: 10 };

/** The vertices of a lot's ground that lie over the block's own tiles. */
function overBlock(entryOf: BuildingCatalogEntry, b: BuildingInstance): [number, number][] {
  const scene = new THREE.Scene();
  new LotRenderer(scene, () => 0, [entryOf], roadAt, street).apply({
    added: [b],
    updated: [],
    removed: [],
  });
  const mesh = scene.children[0] as THREE.Mesh | undefined;
  if (!mesh) return [];
  const p = mesh.geometry.getAttribute('position');
  const out: [number, number][] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (x > 10 * TILE_METERS + 1e-6 && x < 12 * TILE_METERS - 1e-6) {
      if (z > 10 * TILE_METERS + 1e-6 && z < 12 * TILE_METERS - 1e-6) out.push([x, z]);
    }
  }
  return out;
}

describe('a lot fronting a turning circle', () => {
  it.each([
    ['north', NORTH],
    ['east', EAST],
    ['west', WEST],
  ])('lays its ground to the back of the ring and never onto it: %s', (_side, at) => {
    let reached = 0;
    for (let id = 1; id <= 40; id++) {
      const verts = overBlock(home, building({ id, ...at }));
      for (const [x, z] of verts) {
        expect(Math.hypot(x - CENTRE, z - CENTRE)).toBeGreaterThanOrEqual(FRONT.ringM - 1e-3);
        if (Math.hypot(x - CENTRE, z - CENTRE) < FRONT.ringM + 1e-3) reached++;
      }
    }
    expect(reached).toBeGreaterThan(0);
  });

  it('runs its drives out to the ring: from the lot edge, with no cut on a parking lane', () => {
    let drives = 0;
    for (let id = 1; id <= 60; id++) {
      const b = building({ id, ...NORTH });
      const plan = planHouseGround(b, home, roadAt, street)!;
      for (const drive of plan.drives) {
        drives++;
        expect(drive.bulb).not.toBeNull();
        expect(drive.rect.v0).toBeCloseTo(0, 9);
      }
      expect(homeDriveCuts(b, home, plan)).toEqual([]);
    }
    expect(drives).toBeGreaterThan(0);
  });

  it('keeps every drive 3 m from the street mouth at both of its edges', () => {
    let drives = 0;
    for (let id = 1; id <= 80; id++) {
      const plan = planHouseGround(building({ id, ...EAST }), home, roadAt, street)!;
      for (const drive of plan.drives) {
        drives++;
        for (const u of [drive.rect.u0, drive.rect.u1]) {
          const p = lotToWorld(plan.frame, u, 0);
          expect(bulbMouthGapM(FRONT, p.x, p.z)).toBeGreaterThanOrEqual(DRIVE_END_CLEARANCE_M);
        }
      }
    }
    expect(drives).toBeGreaterThan(0);
  });

  it('slides a home’s drive along its frontage clear of the mouth rather than dropping it', () => {
    // Half of this lot's frontage lies at the mouth, yet it has room for a drive.
    for (let id = 1; id <= 80; id++) {
      const plan = planHouseGround(building({ id, ...EAST }), home, roadAt, street)!;
      expect(plan.drives.length, `building ${id}`).toBeGreaterThan(0);
    }
  });

  it('leaves a home with no drive only where no place along its frontage clears the mouth', () => {
    // A one-tile lot standing right at the mouth: no 3 m pad fits clear of it.
    const narrow = entry({ footprint: { w: 1, d: 2 } });
    const at = { x: 12, z: 11 };
    const clearAt = (frame: ReturnType<typeof planHouseGround>, u0: number): boolean =>
      [u0, u0 + 3].every((u) => {
        const p = lotToWorld(frame!.frame, u, 0);
        return bulbMouthGapM(FRONT, p.x, p.z) >= DRIVE_END_CLEARANCE_M;
      });
    let bare = 0;
    for (let id = 1; id <= 40; id++) {
      const plan = planHouseGround(building({ id, ...at }), narrow, roadAt, street)!;
      if (plan.drives.length > 0) continue;
      bare++;
      for (let u0 = 0.5; u0 + 3 <= TILE_METERS - 0.5; u0 += 0.25) {
        expect(clearAt(plan, u0), `u0 ${u0}`).toBe(false);
      }
    }
    expect(bare).toBeGreaterThan(0);
  });

  it('lays no lawn or walk where the street meets the circle', () => {
    for (let id = 1; id <= 40; id++) {
      const plan = planHouseGround(building({ id, ...EAST }), home, roadAt, street)!;
      for (const run of [...plan.bulbLawn, ...plan.bulbWalks]) {
        for (const u of [run.u0, run.u1]) {
          const p = lotToWorld(plan.frame, u, 0);
          expect(bulbMouthGapM(FRONT, p.x, p.z)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps a shop’s drive and walk off the ring too', () => {
    const shop = entry({
      id: 'shop',
      category: 'com',
      zone: ZoneType.ComLow,
      kind: 'strip',
      footprint: { w: 2, d: 2 },
    });
    const verts = overBlock(shop, building({ id: 3, catalogId: 'shop', ...NORTH }));
    for (const [x, z] of verts) {
      expect(Math.hypot(x - CENTRE, z - CENTRE)).toBeGreaterThanOrEqual(FRONT.ringM - 1e-3);
    }
  });
});

describe('the ground from a lot edge to the ring', () => {
  const at = (u: number): { x: number; z: number } => ({ x: CENTRE - 20 + u, z: CENTRE - 20 });

  it('is slanted along the line through the circle’s centre', () => {
    const reach = bulbReachM(FRONT, at, 0, 40);
    const toWorld = bulbFanToWorld(FRONT, at, reach);
    for (const u of [2, 10, 30, 38]) {
      const a = toWorld(u, 0);
      const b = toWorld(u, reach);
      // The end on the ring is on the ring, and the line to it points at the centre.
      expect(Math.hypot(b.x - CENTRE, b.z - CENTRE)).toBeCloseTo(FRONT.ringM, 6);
      const along = { x: b.x - a.x, z: b.z - a.z };
      const toCentre = { x: CENTRE - a.x, z: CENTRE - a.z };
      expect(along.x * toCentre.z - along.z * toCentre.x).toBeCloseTo(0, 6);
    }
    // Off the axis the strip is slanted, not square to the edge.
    const off = bulbRingPoint(FRONT, at(2).x, at(2).z);
    expect(Math.abs(off.x - at(2).x)).toBeGreaterThan(1);
  });
});
