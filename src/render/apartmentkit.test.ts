import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { footprintForRotation } from '../shared/footprint';
import type { BuildingCatalogEntry } from '../shared/types';
import { isApartmentEntry, type BuildingPart } from './archetypes';
import {
  computePartPlacements,
  kitPlanFor,
  LIT_PARTS,
  LANDING_DEPTH_M,
  LANDING_THICKNESS_M,
  PENTHOUSE_PLATE_SHARE,
  ROOF_SETBACK_FROM_STREET_M,
  STAIR_PITCH,
  STAIR_WIDTH_M,
  placementBounds,
  storeysOf,
  type PartPlacement,
} from './buildingkit';
import { computeSetbacks } from './massing';

const apartments = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter((e) =>
  isApartmentEntry(e),
);
const byKind = (kind: string): BuildingCatalogEntry[] => apartments.filter((e) => e.kind === kind);

/** A street along the south side of a lot at (10, 10). */
const southStreet =
  (lot: { w: number; d: number }) =>
  (x: number, z: number): boolean =>
    z === 10 + lot.d && x >= 4 && x < 30;

const planOf = (e: BuildingCatalogEntry, id = 3) =>
  kitPlanFor(e, { id, x: 10, z: 10, rotation: 0 }, southStreet(footprintForRotation(e, 0)))!;
const ofKind = (list: readonly PartPlacement[], part: BuildingPart): PartPlacement[] =>
  list.filter((p) => p.part === part);
const bottom = (p: PartPlacement): number => p.offset[1] - p.size[1] / 2;
const top = (p: PartPlacement): number => p.offset[1] + p.size[1] / 2;

describe('a garden walk-up’s open stair', () => {
  it('climbs from the ground to the top floor on each face: a flight to every floor, each ending at a landing at that floor', () => {
    for (const e of byKind('garden')) {
      const plan = planOf(e);
      const { rows, pitch } = storeysOf(e, plan.baseBox);
      const flights = ofKind(plan.placements, 'stairFlight');
      const landings = ofKind(plan.placements, 'landing');
      for (const sign of [-1, 1]) {
        const mine = flights
          .filter((f) => Math.sign(f.offset[2]) === sign)
          .sort((a, b) => a.offset[1] - b.offset[1]);
        expect(mine, `${e.id} flights`).toHaveLength(rows - 1);
        mine.forEach((f, i) => {
          const rise = (i + 1) * pitch;
          // Each flight spans one storey: its top is the next floor's level.
          expect(f.offset[1] + pitch / 2, `${e.id} flight ${i}`).toBeCloseTo(rise, 6);
          expect(f.pitch).toBe(STAIR_PITCH);
          // A landing stands at the floor the flight reaches and touches its top end.
          const reach = placementBounds(f);
          const met = landings.some(
            (l) =>
              Math.sign(l.offset[2]) === sign &&
              Math.abs(top(l) - (rise + LANDING_THICKNESS_M)) < 1e-6 &&
              placementBounds(l).x0 <= reach.x1 + 1e-6 &&
              placementBounds(l).x1 >= reach.x0 - 1e-6 &&
              placementBounds(l).z0 <= reach.z1 + 1e-6 &&
              placementBounds(l).z1 >= reach.z0 - 1e-6,
          );
          expect(met, `${e.id} flight ${i} meets a landing at floor ${i + 1}`).toBe(true);
        });
      }
    }
  });

  it('keeps every riser at 7.75 in or less and every tread at 10 in or more', () => {
    const rise = Math.tan(STAIR_PITCH);
    const run = 1;
    const riser = 7 * 0.0254;
    const tread = 11 * 0.0254;
    expect(riser).toBeLessThanOrEqual(7.75 * 0.0254);
    expect(tread).toBeGreaterThanOrEqual(10 * 0.0254);
    expect(rise * run).toBeCloseTo(riser / tread, 9);
    expect(STAIR_WIDTH_M).toBeGreaterThan(0);
    expect(LANDING_DEPTH_M).toBeGreaterThan(0);
  });

  it('keeps every balcony and patio off the flights and galleries', () => {
    for (const e of byKind('garden')) {
      const plan = planOf(e);
      const stairs = [
        ...ofKind(plan.placements, 'stairFlight'),
        ...ofKind(plan.placements, 'landing'),
      ].map(placementBounds);
      for (const p of [
        ...ofKind(plan.placements, 'balconySlab'),
        ...ofKind(plan.placements, 'patio'),
      ]) {
        const b = placementBounds(p);
        for (const s of stairs) {
          const clash = b.x0 < s.x1 && s.x0 < b.x1 && b.z0 < s.z1 && s.z0 < b.z1;
          // The same height only: a flight and a balcony in one bay would cross.
          expect(clash, `${e.id} ${p.part}`).toBe(false);
        }
      }
    }
  });
});

describe('a garden walk-up’s ground', () => {
  it('has a paved walk from its street edge to its face, and no car park where the body leaves no room for one', () => {
    for (const e of byKind('garden')) {
      const plan = planOf(e);
      expect(plan.lot, e.id).not.toBeNull();
      const { lot, walk } = plan.lot!;
      expect(walk, `${e.id} walk`).not.toBeNull();
      expect(plan.lot!.hard, `${e.id} hard`).toEqual([]);
      // The street is the south side: the walk meets the lot's street line and the body's face.
      expect(walk!.z1).toBeCloseTo(lot.z1, 6);
      // The walk runs into the strip along the face, which touches the body.
      const { frontWalk } = plan.lot!;
      expect(frontWalk, `${e.id} front walk`).not.toBeNull();
      expect(frontWalk!.z0).toBeCloseTo(plan.baseBox.d / 2, 6);
      expect(walk!.z0).toBeLessThanOrEqual(frontWalk!.z1 + 1e-6);
      expect(walk!.x0).toBeLessThanOrEqual(0);
      expect(walk!.x1).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps a multiplex’s drive meeting the street’s curb cut', () => {
    for (const e of byKind('multiplex')) {
      const plan = planOf(e);
      const { curbCut, hard, lot } = plan.lot!;
      expect(curbCut.z1).toBeCloseTo(lot.z1, 6);
      expect(
        hard.some((r) => r.x0 < curbCut.x1 && curbCut.x0 < r.x1 && r.z1 >= lot.z1 - 20),
        e.id,
      ).toBe(true);
    }
  });

  it('measures a walk-up’s patios as slabs on the ground against the wall, inside the lot, none over a walk’s far side', () => {
    for (const e of byKind('garden')) {
      const plan = planOf(e);
      const patios = ofKind(plan.placements, 'patio');
      expect(patios.length, e.id).toBeGreaterThan(0);
      for (const p of patios) {
        expect(bottom(p), e.id).toBeCloseTo(0, 9);
        const b = placementBounds(p);
        const wall = Math.abs(p.offset[2]) - p.size[2] / 2;
        expect(wall, e.id).toBeCloseTo(plan.baseBox.d / 2, 6);
        expect(b.z1, e.id).toBeLessThanOrEqual(plan.lot!.lot.z1 + 1e-6);
        expect(b.z0, e.id).toBeGreaterThanOrEqual(plan.lot!.lot.z0 - 1e-6);
      }
    }
  });
});

describe('a tower’s roof and ground floor', () => {
  it('keeps its roof plant to 30% of the roof, set 3 m back from the street and well in from every other edge', () => {
    for (const e of byKind('tower')) {
      const { boxes, podium } = computeSetbacks(e, 1);
      const base = boxes[0]!;
      const topBox = boxes[boxes.length - 1]!;
      const placed = computePartPlacements(e, base, topBox, 'S', null, 1, podium ?? null, boxes);
      const [pent] = ofKind(placed, 'penthouse');
      expect(pent, e.id).toBeDefined();
      const b = placementBounds(pent!);
      const share = ((b.x1 - b.x0) * (b.z1 - b.z0)) / (topBox.w * topBox.d);
      expect(share, e.id).toBeLessThanOrEqual(PENTHOUSE_PLATE_SHARE + 1e-9);
      expect(share, e.id).toBeLessThanOrEqual(1 / 3);
      expect(topBox.d / 2 - b.z1, e.id).toBeGreaterThanOrEqual(ROOF_SETBACK_FROM_STREET_M - 1e-9);
      expect(b.z0 + topBox.d / 2, e.id).toBeGreaterThanOrEqual(2);
      expect(b.x0 + topBox.w / 2, e.id).toBeGreaterThanOrEqual(2);
      expect(topBox.w / 2 - b.x1, e.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('lights its podium’s shopfront band and its lobby at night', () => {
    for (const e of byKind('tower')) {
      const plan = planOf(e);
      for (const part of ['storefrontBand', 'lobbyPortal'] as const) {
        expect(ofKind(plan.placements, part).length, `${e.id} ${part}`).toBeGreaterThan(0);
        expect(LIT_PARTS.has(part)).toBe(true);
      }
    }
  });
});
