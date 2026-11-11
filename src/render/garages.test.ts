import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import {
  BuildingState,
  type BuildingCatalogEntry,
  type BuildingDelta,
  type BuildingInstance,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { bodyMetresFor } from '../shared/floorarea';
import {
  GARAGE_FRONT_PROJECTION_M,
  GARAGE_TIER_M,
  PODIUM_OVERHANG_M,
  garageFor,
  parksInGarage,
} from '../shared/garage';
import { STALL_LENGTH_M, STALL_WIDTH_M } from '../shared/parkingcode';
import { GarageRenderer } from './garages';
import { ParkedCarRenderer } from './parked';
import { buildGarageGeometry, closedTiersFor, garageGroundY, tierFloorY } from './garagekit';
import { garageBodyCentre, computeSetbacks, frontageSetbackFor } from './massing';
import { garagePlanAt, lotPointToWorld } from './lotplan';
import { frameToLocal } from './frontage';
import { BALCONY_DEPTH_M, LOBBY_PROJECT_M, PORTE_COCHERE_DEPTH_M } from './buildingkit';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const garaged = catalog.filter((e) => garageFor(e));
const LEVEL_ONE = ['com-high-1', 'com-hotel-1', 'mixed-1', 'res-high-1'];

type Side = 'N' | 'S' | 'E' | 'W';
const SIDES: readonly Side[] = ['N', 'S', 'E', 'W'];
const TURNS = [0, 1, 2, 3] as const;
const X = 10;
const Z = 10;

/** A road a tile out along one side of the lot at (X, Z). */
function roadOn(side: Side, w: number, d: number): (x: number, z: number) => boolean {
  switch (side) {
    case 'N':
      return (x, z) => z === Z - 1 && x >= X && x < X + w;
    case 'S':
      return (x, z) => z === Z + d && x >= X && x < X + w;
    case 'E':
      return (x, z) => x === X + w && z >= Z && z < Z + d;
    default:
      return (x, z) => x === X - 1 && z >= Z && z < Z + d;
  }
}

function instance(e: BuildingCatalogEntry, rotation: 0 | 1 | 2 | 3 = 0, id = 1): BuildingInstance {
  return {
    id,
    catalogId: e.id,
    x: X,
    z: Z,
    rotation,
    level: e.level ?? 1,
    state: BuildingState.Active,
    problems: 0,
  };
}

const add = (...b: BuildingInstance[]): BuildingDelta => ({ added: b, removed: [], updated: [] });

describe('the body on its lot', () => {
  it('keeps the body’s plate and height whatever the lot does', () => {
    for (const e of garaged) {
      const { boxes } = computeSetbacks(
        e,
        1,
        frontageSetbackFor(e, X, Z, roadOn('N', e.footprint.w, e.footprint.d)),
      );
      const body = bodyMetresFor(e);
      expect(boxes[0]!.w, e.id).toBeCloseTo(body.w, 9);
      expect(boxes[0]!.d, e.id).toBeCloseTo(body.d, 9);
      expect(
        boxes.reduce((sum, b) => sum + b.h, 0),
        e.id,
      ).toBeCloseTo(e.height, 9);
    }
  });

  it('stands against the street line, behind its street-face parts, at all four turns on every side', () => {
    for (const e of garaged) {
      for (const rotation of TURNS) {
        for (const side of SIDES) {
          const lot = footprintForRotation(e, rotation);
          const roadAt = roadOn(side, lot.w, lot.d);
          const plan = garagePlanAt(e, { x: X, z: Z, rotation }, roadAt)!;
          expect(plan, `${e.id} ${rotation}${side}`).not.toBeNull();
          const centre = garageBodyCentre(plan);
          const set = frontageSetbackFor(e, X, Z, roadAt, undefined, rotation);
          expect(centre.x - (X + lot.w / 2) * TILE_METERS, e.id).toBeCloseTo(set.centerXM, 9);
          expect(centre.z - (Z + lot.d / 2) * TILE_METERS, e.id).toBeCloseTo(set.centerZM, 9);
          // How far the body's street face stands in from the lot's street edge, along the street's normal.
          const local = frameToLocal(plan.frame, centre.x, centre.z);
          const body = bodyMetresFor(e);
          const inFromStreet = -local.outwardM - body.d / 2;
          expect(inFromStreet, `${e.id} ${rotation}${side}`).toBeCloseTo(
            GARAGE_FRONT_PROJECTION_M[e.kind ?? '']!,
            9,
          );
        }
      }
    }
  });

  it('holds the front projections to the street-face parts the kit draws', () => {
    expect(GARAGE_FRONT_PROJECTION_M.office).toBe(LOBBY_PROJECT_M);
    expect(GARAGE_FRONT_PROJECTION_M.hotel).toBe(PORTE_COCHERE_DEPTH_M);
    expect(GARAGE_FRONT_PROJECTION_M.tower).toBe(BALCONY_DEPTH_M);
    expect(GARAGE_FRONT_PROJECTION_M.midrise).toBe(BALCONY_DEPTH_M);
  });

  it('keeps the deck inside the lot, behind the body and clear of it, at all four turns on every side', () => {
    for (const e of garaged) {
      for (const rotation of TURNS) {
        for (const side of SIDES) {
          const lot = footprintForRotation(e, rotation);
          const plan = garagePlanAt(e, { x: X, z: Z, rotation }, roadOn(side, lot.w, lot.d))!;
          const { garage, frame } = plan;
          const x0 = X * TILE_METERS;
          const z0 = Z * TILE_METERS;
          const x1 = (X + lot.w) * TILE_METERS;
          const z1 = (Z + lot.d) * TILE_METERS;
          const rect = (r: { u0: number; u1: number; v0: number; v1: number }) => {
            const a = lotPointToWorld(frame, r.u0, r.v0);
            const b = lotPointToWorld(frame, r.u1, r.v1);
            return {
              x0: Math.min(a.x, b.x),
              x1: Math.max(a.x, b.x),
              z0: Math.min(a.z, b.z),
              z1: Math.max(a.z, b.z),
            };
          };
          const deck = rect(garage.deck);
          const body = rect(garage.body);
          const label = `${e.id} ${rotation}${side}`;
          expect(deck.x0, label).toBeGreaterThanOrEqual(x0 - 1e-6);
          expect(deck.x1, label).toBeLessThanOrEqual(x1 + 1e-6);
          expect(deck.z0, label).toBeGreaterThanOrEqual(z0 - 1e-6);
          expect(deck.z1, label).toBeLessThanOrEqual(z1 + 1e-6);
          const apart =
            deck.x1 <= body.x0 + 1e-6 ||
            body.x1 <= deck.x0 + 1e-6 ||
            deck.z1 <= body.z0 + 1e-6 ||
            body.z1 <= deck.z0 + 1e-6;
          expect(apart, label).toBe(true);
          // Behind: the deck's centre is further from the street than the body's.
          const deckAt = frameToLocal(frame, (deck.x0 + deck.x1) / 2, (deck.z0 + deck.z1) / 2);
          const bodyAt = frameToLocal(frame, (body.x0 + body.x1) / 2, (body.z0 + body.z1) / 2);
          expect(deckAt.outwardM, label).toBeLessThan(bodyAt.outwardM);
        }
      }
    }
  });

  it('leaves the four level-1 kinds standing as they do today', () => {
    for (const id of LEVEL_ONE) {
      const e = catalog.find((c) => c.id === id)!;
      expect(parksInGarage(e)).toBe(false);
      const lot = footprintForRotation(e, 0);
      expect(frontageSetbackFor(e, X, Z, roadOn('N', lot.w, lot.d))).toEqual({
        spanXM: 0,
        spanZM: 0,
        centerXM: 0,
        centerZM: 0,
      });
      const renderer = new GarageRenderer(
        new THREE.Scene(),
        () => 0,
        catalog,
        roadOn('N', lot.w, lot.d),
      );
      renderer.apply(add(instance(e)));
      expect(renderer.deckCount(), id).toBe(0);
    }
  });
});

describe('the cars in a garage', () => {
  const office = catalog.find((e) => e.id === 'com-office-2')!;
  const lot = footprintForRotation(office, 0);
  const roadAt = roadOn('N', lot.w, lot.d);

  function park(e: BuildingCatalogEntry, rotation: 0 | 1 | 2 | 3 = 0, side: Side = 'N') {
    const l = footprintForRotation(e, rotation);
    const road = roadOn(side, l.w, l.d);
    const renderer = new ParkedCarRenderer(new THREE.Scene(), () => 0, catalog, road);
    renderer.setDayFraction(0.5);
    renderer.apply(add(instance(e, rotation)));
    return { renderer, plan: garagePlanAt(e, { x: X, z: Z, rotation }, road)! };
  }

  it('reports the garage’s stalls, every tier’s, as the building’s own', () => {
    for (const e of garaged) {
      const { renderer, plan } = park(e);
      const g = plan.garage;
      expect(renderer.ownStallCount(1), e.id).toBe(g.tiers * g.stallsPerTier);
      expect(renderer.garageStallCount(1), e.id).toBe(g.provided);
      expect(renderer.garageStallSlotsFor(1), e.id).toHaveLength(g.provided);
    }
  });

  it('stands one car in each stall, on its tier’s floor, none in an aisle, on the ramp or on the stair', () => {
    for (const rotation of TURNS) {
      for (const side of SIDES) {
        const { renderer, plan } = park(office, rotation, side);
        const { garage, frame } = plan;
        const seen = new Set<string>();
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const label = `${rotation}${side}`;
        expect(renderer.garageOccupiedCount(1), label).toBe(garage.provided);
        for (const ref of renderer.garageStallSlotsFor(1)) {
          renderer.getCarMatrix(ref, m);
          m.decompose(p, q, s);
          const local = frameToLocal(frame, p.x, p.z);
          const u = local.along;
          const v = -local.outwardM;
          const key = `${u.toFixed(2)},${v.toFixed(2)},${p.y.toFixed(2)}`;
          expect(seen.has(key), `${label} two cars at ${key}`).toBe(false);
          seen.add(key);
          // Inside a stall of a row: its depth is the stall's, never the aisle's.
          const row = garage.rows.find((r) => v > r.rect.v0 - 1e-6 && v < r.rect.v1 + 1e-6);
          expect(row, `${label} ${key}`).toBeDefined();
          const inAisle = v > garage.aisle.v0 + 1e-6 && v < garage.aisle.v1 - 1e-6;
          expect(inAisle, `${label} ${key}`).toBe(false);
          const onRamp =
            u > garage.ramp.u0 && u < garage.ramp.u1 && v > garage.ramp.v0 && v < garage.ramp.v1;
          expect(onRamp, `${label} ${key}`).toBe(false);
          const onStair =
            u > garage.stair.u0 + 1e-6 &&
            u < garage.stair.u1 - 1e-6 &&
            v > garage.stair.v0 &&
            v < garage.stair.v1;
          expect(onStair, `${label} ${key}`).toBe(false);
          // On a tier's floor: its height above the ground is the tier's, and its half height.
          const tier = Math.round((p.y - s.y / 2 - tierFloorY(0)) / GARAGE_TIER_M);
          expect(tier, label).toBeGreaterThanOrEqual(0);
          expect(tier, label).toBeLessThan(garage.tiers);
          expect(p.y - s.y / 2, label).toBeCloseTo(tierFloorY(tier), 6);
        }
        expect(seen.size, label).toBe(garage.provided);
      }
    }
  });

  it('keeps each car inside its stall', () => {
    const { renderer, plan } = park(office);
    const { garage, frame } = plan;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const ref of renderer.garageStallSlotsFor(1)) {
      renderer.getCarMatrix(ref, m);
      m.decompose(p, q, s);
      const local = frameToLocal(frame, p.x, p.z);
      const stall = garage.stalls.find(
        (st) =>
          Math.abs(st.u - local.along) < STALL_WIDTH_M / 2 &&
          Math.abs(st.v + local.outwardM) < STALL_LENGTH_M / 2,
      );
      expect(stall).toBeDefined();
    }
  });

  it('fills the garage by the hour as a lot is: full at midday, and none on the street of a level-1 kind', () => {
    const { renderer } = park(office);
    const night = new ParkedCarRenderer(new THREE.Scene(), () => 0, catalog, roadAt);
    night.setDayFraction(0.1);
    night.apply(add(instance(office)));
    expect(renderer.garageOccupiedCount(1)).toBeGreaterThan(night.garageOccupiedCount(1));
    expect(night.garageOccupiedCount(1)).toBe(0);
    for (const id of LEVEL_ONE) {
      const e = catalog.find((c) => c.id === id)!;
      const l = footprintForRotation(e, 0);
      const r = new ParkedCarRenderer(new THREE.Scene(), () => 0, catalog, roadOn('N', l.w, l.d));
      r.apply(add(instance(e)));
      expect(r.garageStallCount(1), id).toBe(0);
    }
  });

  it('frees the garage’s cars when the building leaves', () => {
    const { renderer } = park(office);
    const before = renderer.carInstanceCount();
    renderer.apply({ added: [], removed: [1], updated: [] });
    expect(renderer.garageStallCount(1)).toBe(0);
    expect(renderer.ownStallCount(1)).toBe(0);
    expect(renderer.carInstanceCount()).toBe(before);
  });
});

describe('the garage as drawn', () => {
  const office = catalog.find((e) => e.id === 'com-office-2')!;
  const tower = catalog.find((e) => e.id === 'res-tower-2')!;

  it('draws one deck for a dense building, lays only itself again on a level-up and frees on leaving', () => {
    const scene = new THREE.Scene();
    const road = roadOn('N', 3, 3);
    const renderer = new GarageRenderer(scene, () => 0, catalog, road);
    renderer.apply(add(instance(office)));
    expect(renderer.deckCount()).toBe(1);
    expect(renderer.tiersOf(1)).toBe(garageFor(office)!.tiers);
    const meshes = renderer.meshCount();
    renderer.apply({ added: [], removed: [], updated: [instance(office)] });
    expect(renderer.deckCount()).toBe(1);
    expect(renderer.meshCount()).toBe(meshes);
    renderer.apply({ added: [], removed: [1], updated: [] });
    expect(renderer.deckCount()).toBe(0);
    expect(renderer.tiersOf(1)).toBe(0);
    renderer.dispose();
  });

  it('shares one mesh among buildings with the same deck, and starts every pool at the minimum capacity', () => {
    const scene = new THREE.Scene();
    const renderer = new GarageRenderer(
      scene,
      () => 0,
      catalog,
      (x, z) => z === 9 && x >= 10 && x < 40,
    );
    const a = instance(office, 0, 1);
    const b = { ...instance(office, 0, 2), x: 14 };
    renderer.apply(add(a, b));
    expect(renderer.meshCount()).toBe(1);
    const mesh = scene.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    )!;
    expect(mesh.instanceMatrix.count).toBeGreaterThanOrEqual(2048);
    expect(mesh.count).toBe(2);
  });

  it('turns every deck by a proper rotation, never a mirror', () => {
    const m = new THREE.Matrix4();
    for (const side of SIDES) {
      for (const e of [office, tower]) {
        const l = footprintForRotation(e, 0);
        const renderer = new GarageRenderer(
          new THREE.Scene(),
          () => 0,
          catalog,
          roadOn(side, l.w, l.d),
        );
        renderer.apply(add(instance(e)));
        expect(renderer.matrixOf(1, m)).toBe(true);
        expect(m.determinant(), `${e.id} ${side}`).toBeGreaterThan(0);
      }
    }
  });

  it('draws every face wound outward, in both mirrorings, for every tier count', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      for (const mirror of [false, true]) {
        const geometry = buildGarageGeometry(g, g.tiers, closedTiersFor(e.height / 2), mirror);
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        const index = geometry.getIndex()!;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const n = new THREE.Vector3();
        let inward = 0;
        for (let i = 0; i < index.count; i += 3) {
          a.fromBufferAttribute(position, index.getX(i));
          b.fromBufferAttribute(position, index.getX(i + 1));
          c.fromBufferAttribute(position, index.getX(i + 2));
          n.crossVectors(b.clone().sub(a), c.clone().sub(a));
          const stored = new THREE.Vector3().fromBufferAttribute(normal, index.getX(i));
          if (n.lengthSq() > 1e-12 && n.dot(stored) < 0) inward += 1;
        }
        expect(inward, `${e.id} ${mirror ? 'mirrored' : 'plain'}`).toBe(0);
        geometry.dispose();
      }
    }
  });

  it('stands the deck inside its lot and on the ground, with no part below the footing or beyond the lot', () => {
    for (const e of garaged) {
      const g = garageFor(e)!;
      const geometry = buildGarageGeometry(g, g.tiers, closedTiersFor(e.height / 2), false);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.x, e.id).toBeGreaterThanOrEqual(-g.lotW / 2 - 1e-6);
      expect(box.max.x, e.id).toBeLessThanOrEqual(g.lotW / 2 + 1e-6);
      expect(box.max.z, e.id).toBeLessThanOrEqual(g.lotD / 2 + 1e-6);
      // The drive's clearance bar and the sign stand in front of the deck, on the lot.
      expect(box.min.z, e.id).toBeGreaterThanOrEqual(-g.lotD / 2 - 1e-6);
      expect(box.min.y, e.id).toBeLessThan(0);
      // A stair tower a tier taller than the deck's roof.
      expect(box.max.y, e.id).toBeGreaterThanOrEqual(tierFloorY(g.tiers - 1) + GARAGE_TIER_M);
      geometry.dispose();
    }
  });

  it('stands on the highest ground under it, on a slope', () => {
    const plan = garagePlanAt(office, { x: X, z: Z, rotation: 0 }, roadOn('N', 3, 3))!;
    const slope = (x: number): number => x * 0.01;
    const y = garageGroundY((x) => slope(x), plan.frame, plan.garage);
    expect(y).toBeCloseTo(slope((X + 3) * TILE_METERS), 6);
  });

  it('is a deck of one more tier than a podium of the lowest tiers is backed by the body: its front is open above the base tier', () => {
    const g = garageFor(office)!;
    expect(closedTiersFor(12.8)).toBe(3);
    const closedAll = buildGarageGeometry(g, g.tiers, g.tiers, false).getAttribute(
      'position',
    ).count;
    const closedNone = buildGarageGeometry(g, g.tiers, 0, false).getAttribute('position').count;
    expect(closedNone).toBeGreaterThan(closedAll);
    expect(PODIUM_OVERHANG_M).toBeGreaterThan(0);
  });
});
