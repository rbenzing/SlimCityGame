import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { isModernTall } from '../shared/modernlook';
import { BuildingCatalogEntry } from '../shared/types';
import { partsFor } from './archetypes';
import {
  PartPlacement,
  ROOF_INSET_M,
  SCREEN_HEIGHT_M,
  SCREEN_THICKNESS_M,
  computePartPlacements,
  placementBounds,
} from './buildingkit';
import { computeSetbacks } from './massing';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const modern = catalog.filter(isModernTall);
/** What stands on a roof and is hidden or housed by the crown. */
const PLANT = new Set([
  'rooftopUnit',
  'roofHatch',
  'coolingTower',
  'penthouse',
  'elevatorBulkhead',
]);

function placementsOf(e: BuildingCatalogEntry, id: number): PartPlacement[] {
  const { boxes, podium } = computeSetbacks(e, id);
  return computePartPlacements(
    e,
    boxes[0]!,
    boxes[boxes.length - 1]!,
    'S',
    null,
    id,
    podium ?? null,
    boxes,
  );
}

describe('the crown of a modern building', () => {
  it('screens its rooftop plant on all four sides, in every modern entry', () => {
    expect(modern.length).toBeGreaterThan(20);
    for (const e of modern) {
      const placed = placementsOf(e, 3);
      const screens = placed.filter((p) => p.part === 'roofScreen');
      expect(screens.length, e.id).toBe(4);
      expect(
        placed.some((p) => PLANT.has(p.part)),
        `${e.id} has plant`,
      ).toBe(true);
      const xs = screens.filter((p) => p.size[0] > p.size[2]);
      expect(xs.length, `${e.id} two long sides`).toBe(2);
    }
  });

  it('is never lower than the tallest piece of plant it hides, and never lower than 3 m', () => {
    for (const e of modern) {
      for (const id of [1, 3, 40]) {
        const placed = placementsOf(e, id);
        const plant = placed.filter((p) => PLANT.has(p.part));
        const tallest = Math.max(...plant.map((p) => p.size[1]));
        for (const s of placed.filter((p) => p.part === 'roofScreen')) {
          expect(s.size[1], `${e.id} #${id}`).toBeGreaterThanOrEqual(tallest - 1e-9);
          expect(s.size[1], `${e.id} #${id}`).toBeGreaterThanOrEqual(SCREEN_HEIGHT_M);
        }
      }
    }
  });

  it('stands round the plant, 2 m in from the roof edge, so no plant is outside it', () => {
    for (const e of modern) {
      const { boxes } = computeSetbacks(e, 3);
      const top = boxes[boxes.length - 1]!;
      const placed = placementsOf(e, 3);
      const screens = placed.filter((p) => p.part === 'roofScreen').map(placementBounds);
      const outer = {
        x0: Math.min(...screens.map((r) => r.x0)),
        x1: Math.max(...screens.map((r) => r.x1)),
        z0: Math.min(...screens.map((r) => r.z0)),
        z1: Math.max(...screens.map((r) => r.z1)),
      };
      expect(outer.x1, e.id).toBeCloseTo(top.w / 2 - (ROOF_INSET_M - SCREEN_THICKNESS_M), 6);
      expect(outer.z1, e.id).toBeCloseTo(top.d / 2 - (ROOF_INSET_M - SCREEN_THICKNESS_M), 6);
      const inner = {
        x0: outer.x0 + SCREEN_THICKNESS_M,
        x1: outer.x1 - SCREEN_THICKNESS_M,
        z0: outer.z0 + SCREEN_THICKNESS_M,
        z1: outer.z1 - SCREEN_THICKNESS_M,
      };
      for (const p of placed.filter((q) => PLANT.has(q.part))) {
        const b = placementBounds(p);
        expect(b.x0, `${e.id} ${p.part}`).toBeGreaterThanOrEqual(inner.x0 - 1e-6);
        expect(b.x1, `${e.id} ${p.part}`).toBeLessThanOrEqual(inner.x1 + 1e-6);
        expect(b.z0, `${e.id} ${p.part}`).toBeGreaterThanOrEqual(inner.z0 - 1e-6);
        expect(b.z1, `${e.id} ${p.part}`).toBeLessThanOrEqual(inner.z1 + 1e-6);
      }
    }
  });

  it('keeps a residential tower its penthouse, inside the screen', () => {
    const tower = modern.filter((e) => e.kind === 'tower');
    expect(tower.length).toBeGreaterThan(0);
    for (const e of tower) {
      const placed = placementsOf(e, 3);
      expect(
        placed.some((p) => p.part === 'penthouse'),
        e.id,
      ).toBe(true);
      expect(placed.filter((p) => p.part === 'roofScreen').length, e.id).toBe(4);
    }
  });

  it('puts no screen on a building at or under the ceiling that has none today', () => {
    for (const e of catalog.filter((c) => !isModernTall(c))) {
      expect(partsFor(e), e.id).not.toContain('roofScreen');
    }
  });
});
