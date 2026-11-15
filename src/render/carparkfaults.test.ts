/**
 * A shop's surface car park over the real catalog: one car to a stall, nothing
 * but a car in a stall or an aisle, and a walk between the stall heads and the
 * shopfront that reaches the footway or an aisle.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import { BuildingState, type BuildingCatalogEntry } from '../shared/types';
import { footprintForRotation } from '../shared/footprint';
import { isDenseLotEntry, lotParkingRequirement, MIN_FRONT_WALK_M } from '../shared/parkingcode';
import type { LotRect } from '../shared/lotlayout';
import { lotLayoutFor } from './lotplan';
import { kitPlanFor } from './buildingkit';
import { ParkedCarRenderer } from './parked';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const commercial = catalog.filter(
  (e) => e.category === 'com' && lotParkingRequirement(e) !== null && !isDenseLotEntry(e),
);
const ROTATIONS = [0, 1, 2, 3] as const;
const EPS = 0.01;

const touches = (a: LotRect, b: LotRect): boolean =>
  a.u0 <= b.u1 + EPS && b.u0 <= a.u1 + EPS && a.v0 <= b.v1 + EPS && b.v0 <= a.v1 + EPS;
const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;

describe('a commercial car park, at every level', () => {
  it('keeps 36 in between the stall heads and the shopfront wall', () => {
    for (const e of commercial) {
      for (const rot of ROTATIONS) {
        const layout = lotLayoutFor(e, rot, rot % 2 === 0, 0)!;
        if (layout.forecourt) continue;
        const b = layout.body;
        for (const s of layout.stalls) {
          const faces = s.rect.u0 < b.u1 - EPS && s.rect.u1 > b.u0 + EPS && s.rect.v1 <= b.v0 + EPS;
          if (faces) {
            expect(b.v0 - s.rect.v1, `${e.id} r${rot}`).toBeGreaterThanOrEqual(
              MIN_FRONT_WALK_M - EPS,
            );
          }
        }
      }
    }
  });

  it('lays the front walk clear of every stall and reaches the footway or an aisle from it', () => {
    for (const e of commercial) {
      for (const rot of ROTATIONS) {
        const layout = lotLayoutFor(e, rot, rot % 2 === 0, 0)!;
        const walk = layout.frontWalk;
        expect(walk, `${e.id} r${rot} has a front walk`).not.toBeNull();
        const stalls = layout.stalls.map((s) => s.rect);
        expect(
          stalls.some((s) => overlaps(s, walk!)),
          `${e.id} r${rot} stall on the walk`,
        ).toBe(false);
        const reaches =
          walk!.v0 <= EPS ||
          layout.entranceWalk !== null ||
          (layout.forecourt !== null && layout.forecourt.v0 <= EPS) ||
          [...layout.aisles, ...(layout.throat ? [layout.throat] : [])].some((a) =>
            touches(a, walk!),
          );
        expect(reaches, `${e.id} r${rot} walk reaches footway or aisle`).toBe(true);
      }
    }
  });

  it('draws a front walk at least 36 in deep across the whole shopfront', () => {
    for (const e of commercial) {
      for (const rot of ROTATIONS) {
        const layout = lotLayoutFor(e, rot, rot % 2 === 0, 0)!;
        const walk = layout.frontWalk!;
        if (layout.forecourt || layout.body.v0 < MIN_FRONT_WALK_M) continue;
        expect(walk.v1 - walk.v0, `${e.id} r${rot}`).toBeGreaterThanOrEqual(MIN_FRONT_WALK_M - EPS);
        expect(walk.u0).toBeCloseTo(layout.body.u0, 6);
        expect(walk.u1).toBeCloseTo(layout.body.u1, 6);
      }
    }
  });
});

describe('a commercial lot as the renderers draw it', () => {
  const north = (x: number, z: number): boolean => z === 9 && x >= 0 && x < 200;

  it('stands no two cars in one stall on any commercial kind', () => {
    for (const e of catalog.filter((c) => c.category === 'com' && !isDenseLotEntry(c))) {
      const renderer = new ParkedCarRenderer(new THREE.Scene(), () => 0, catalog, north);
      renderer.apply({
        added: [
          {
            id: 1,
            catalogId: e.id,
            x: 10,
            z: 10,
            rotation: 0,
            level: 1,
            state: BuildingState.Active,
            problems: 0,
          },
        ],
        removed: [],
        updated: [],
      });
      const cars = renderer.stallWorldPositions(1);
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i]!;
          const b = cars[j]!;
          const apart = Math.hypot(a.x - b.x, a.z - b.z);
          expect(apart, `${e.id} cars ${i} and ${j}`).toBeGreaterThan(Math.min(a.width, b.width));
        }
      }
    }
  });

  it('stands no sign pole on a stall, an aisle or a walk', () => {
    for (const e of commercial) {
      for (const rot of ROTATIONS) {
        const fp = footprintForRotation(e, rot);
        const roadAt = (x: number, z: number): boolean => z === 9 && x >= 10 && x < 10 + fp.w;
        const plan = kitPlanFor(e, { id: 1, x: 10, z: 10, rotation: rot }, roadAt);
        if (!plan?.lot) continue;
        const lot = plan.lot;
        for (const p of plan.placements) {
          if (p.part !== 'signPole' && p.part !== 'pylon') continue;
          const [w, , d] = p.size;
          if (w > 0.6 || d > 0.6) continue;
          const pole = {
            x0: p.offset[0] - w / 2,
            x1: p.offset[0] + w / 2,
            z0: p.offset[2] - d / 2,
            z1: p.offset[2] + d / 2,
          };
          const inLane = (lot.lane?.rects ?? []).some(
            (t) =>
              pole.x0 >= t.x0 - EPS &&
              pole.x1 <= t.x1 + EPS &&
              pole.z0 >= t.z0 - EPS &&
              pole.z1 <= t.z1 + EPS,
          );
          const onStall =
            !inLane &&
            lot.taken.some(
              (t) =>
                pole.x0 < t.x1 - EPS &&
                t.x0 < pole.x1 - EPS &&
                pole.z0 < t.z1 - EPS &&
                t.z0 < pole.z1 - EPS,
            );
          expect(onStall, `${e.id} r${rot} ${p.part} pole`).toBe(false);
        }
      }
    }
  });
});
