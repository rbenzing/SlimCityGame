import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';
import { footprintForRotation } from '../shared/footprint';
import { FLOOR_HEIGHT_METERS } from '../shared/floorarea';
import {
  BODY_REAR_PROUD_M,
  garageFor,
  garageTopM,
  GARAGE_FRONT_PROJECTION_M,
} from '../shared/garage';
import type { BuildingPart } from './archetypes';
import { computeSetbacks } from './massing';
import {
  AWNING_OUT_M,
  RIBBON_BAND_PROUD_M,
  kitPlanFor,
  placementBounds,
  type KitPlan,
  type PartPlacement,
} from './buildingkit';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

/** A building at (10, 10) with its street on the south side of its lot. */
function southern(e: BuildingCatalogEntry): KitPlan {
  const lot = footprintForRotation(e, 0);
  const road = (x: number, z: number): boolean => z === 10 + lot.d && x >= 10 && x < 10 + lot.w;
  return kitPlanFor(e, { id: 7, x: 10, z: 10, rotation: 0 }, road)!;
}

const ofPart = (plan: KitPlan, part: BuildingPart): PartPlacement[] =>
  plan.placements.filter((p) => p.part === part);
const top = (p: PartPlacement): number => p.offset[1] + p.size[1] / 2;
const bottom = (p: PartPlacement): number => p.offset[1] - p.size[1] / 2;

/** The entrance of each kind that has one at its street face: office, mid-rise, tower. */
const ENTRANCES = [
  'com-high-1',
  'com-office-2',
  'com-high-2',
  'res-high-1',
  'res-high-3',
  'res-tower-2',
];

describe('a lobby is one tall storey of glass with doors at its foot', () => {
  it('stands a pair of 0.9 m leaves, 2.1 m high, on the ground under the glazing', () => {
    for (const id of [...ENTRANCES, 'mixed-1', 'mixed-2', 'mixed-3']) {
      const plan = southern(byId(id));
      const leaves = ofPart(plan, 'lobbyDoor');
      expect(leaves, id).toHaveLength(2);
      for (const leaf of leaves) {
        expect(leaf.size[0], id).toBeCloseTo(0.9, 9);
        expect(leaf.size[1], id).toBeGreaterThanOrEqual(2.1);
        expect(leaf.size[1], id).toBeLessThanOrEqual(2.4);
        expect(bottom(leaf), id).toBeCloseTo(0, 9);
      }
      expect(Math.abs(leaves[0]!.offset[0] + leaves[1]!.offset[0]), id).toBeLessThan(1e-9);
    }
  });

  it('is a lit glazed bay 4 m wide and 4.5 m tall with glass above a canopy that stays within the storey, framed round', () => {
    for (const id of ENTRANCES) {
      const plan = southern(byId(id));
      const [glazing] = ofPart(plan, 'lobbyPortal');
      const [canopy] = ofPart(plan, 'lobbyCanopy');
      expect(glazing, id).toBeDefined();
      expect(canopy, id).toBeDefined();
      expect(glazing!.size[0], id).toBe(4);
      expect(top(glazing!), id).toBeCloseTo(4.5, 9);
      expect(top(glazing!), id).toBeGreaterThan(top(canopy!));
      expect(bottom(glazing!), id).toBeCloseTo(0, 9);
      const frame = ofPart(plan, 'lobbyFrame');
      expect(frame, id).toHaveLength(3);
      expect(Math.max(...frame.map(top)), id).toBeCloseTo(4.5, 9);
      for (const leaf of ofPart(plan, 'lobbyDoor')) {
        expect(bottom(canopy!), id).toBeGreaterThanOrEqual(top(leaf));
        expect(placementBounds(canopy!).x0, id).toBeLessThanOrEqual(placementBounds(leaf).x0);
        expect(placementBounds(canopy!).x1, id).toBeGreaterThanOrEqual(placementBounds(leaf).x1);
      }
      expect(top(canopy!), id).toBeLessThan(FLOOR_HEIGHT_METERS);
    }
  });

  it('keeps every entrance part inside the street-face projection the body stands back for', () => {
    for (const id of [...ENTRANCES, 'mixed-1', 'mixed-2', 'mixed-3']) {
      const e = byId(id);
      const plan = southern(e);
      const face = (computeSetbacks(e, 7).podium ?? plan.baseBox).d / 2;
      const reach = GARAGE_FRONT_PROJECTION_M[e.kind ?? ''] ?? 0;
      for (const part of [
        'lobbyPortal',
        'lobbyDoor',
        'lobbyCanopy',
        'lobbyFrame',
        'awning',
      ] as const) {
        for (const p of ofPart(plan, part)) {
          expect(placementBounds(p).z1 - face, `${id} ${part}`).toBeLessThanOrEqual(reach + 1e-9);
        }
      }
    }
  });
});

describe('a mixed-use block’s shopfront', () => {
  it('has a lit sign band, an awning a bay and a canopy over its door, and no awning across the door', () => {
    for (const id of ['mixed-1', 'mixed-2', 'mixed-3']) {
      const plan = southern(byId(id));
      expect(ofPart(plan, 'signageBand').length, id).toBe(1);
      expect(ofPart(plan, 'awning').length, id).toBeGreaterThan(2);
      expect(ofPart(plan, 'cornice').length, id).toBe(1);
      expect(ofPart(plan, 'lobbyPortal'), id).toHaveLength(0);
      const [canopy] = ofPart(plan, 'lobbyCanopy');
      expect(canopy, id).toBeDefined();
      const c = placementBounds(canopy!);
      for (const awning of ofPart(plan, 'awning')) {
        const a = placementBounds(awning);
        expect(a.x1 <= c.x0 + 1e-9 || a.x0 >= c.x1 - 1e-9, id).toBe(true);
      }
    }
  });

  it('projects its awning exactly as far as the body stands back from the street line', () => {
    expect(GARAGE_FRONT_PROJECTION_M.mixed).toBe(AWNING_OUT_M);
  });
});

describe('a garage built behind a body', () => {
  it('keeps the deck clear of the widest band the body wears on its rear face', () => {
    expect(BODY_REAR_PROUD_M).toBeGreaterThanOrEqual(RIBBON_BAND_PROUD_M);
  });

  it('leaves no part of the body standing in the deck below its top', () => {
    for (const e of catalog) {
      const garage = garageFor(e);
      if (!garage) continue;
      const plan = southern(e);
      const clear = garage.deck.v0 - garage.body.v1;
      const deckTop = garageTopM(garage);
      for (const p of plan.placements) {
        if (bottom(p) >= deckTop - 1e-9) continue;
        // The street is south (+z): the rear face is the box's north side.
        const behind = -placementBounds(p).z0 - plan.baseBox.d / 2;
        expect(behind, `${e.id} ${p.part} at ${bottom(p).toFixed(2)} m`).toBeLessThanOrEqual(
          clear + 1e-9,
        );
      }
    }
  });
});
