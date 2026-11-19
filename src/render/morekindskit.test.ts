import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';
import { footprintForRotation } from '../shared/footprint';
import { type BuildingPart } from './archetypes';
import {
  kitPlanFor,
  PHARMACY_CANOPY_M,
  placementBounds,
  storageDoorsPerWall,
  storageRows,
  STORAGE_DOOR_PITCH_M,
  STORAGE_DRIVE_M,
  type KitPlan,
  type LocalRect,
  type PartPlacement,
} from './buildingkit';
import { tierCountOf } from './massing';
import { windowlessBody } from './facade';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const ofKind = (kind: string, roomy: boolean): BuildingCatalogEntry[] =>
  catalog.filter((e) => e.kind === kind && (e.bodyFootprint !== undefined) === roomy);

type StreetSide = 'N' | 'E' | 'S' | 'W';

/** A street along one side of a w×d lot at (10, 10). */
function streetOn(side: StreetSide, w: number, d: number): (x: number, z: number) => boolean {
  switch (side) {
    case 'N':
      return (x, z) => z === 9 && x >= 10 && x < 10 + w;
    case 'S':
      return (x, z) => z === 10 + d && x >= 10 && x < 10 + w;
    case 'E':
      return (x, z) => x === 10 + w && z >= 10 && z < 10 + d;
    default:
      return (x, z) => x === 9 && z >= 10 && z < 10 + d;
  }
}

function kitOf(e: BuildingCatalogEntry, rotation: 0 | 1 | 2 | 3, side: StreetSide): KitPlan {
  const lot = footprintForRotation(e, rotation);
  return kitPlanFor(e, { id: 7, x: 10, z: 10, rotation }, streetOn(side, lot.w, lot.d))!;
}

const only = (plan: KitPlan, part: BuildingPart): PartPlacement[] =>
  plan.placements.filter((p) => p.part === part);

const inside = (r: LocalRect, lot: LocalRect): boolean =>
  r.x0 >= lot.x0 - 1e-6 && r.x1 <= lot.x1 + 1e-6 && r.z0 >= lot.z0 - 1e-6 && r.z1 <= lot.z1 + 1e-6;
const overlap = (a: LocalRect, b: LocalRect): boolean =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

const alongOf = (p: PartPlacement, side: StreetSide): number =>
  side === 'N' || side === 'S' ? p.offset[0] : p.offset[2];

const SIDES = ['S', 'N', 'E', 'W'] as const;
/** A lot on an east or west street stands turned a quarter, so its long frontage runs along that street. */
const TURN: Readonly<Record<StreetSide, 0 | 1>> = { S: 0, N: 0, E: 1, W: 1 };

describe('the three kinds are one volume at every level', () => {
  it('stand as a single tier, not a stack, and show no window of their own on the wall', () => {
    for (const kind of ['pharmacy', 'machineshop', 'storage']) {
      for (const e of catalog.filter((c) => c.kind === kind)) {
        expect(tierCountOf(e), e.id).toBe(1);
        expect(windowlessBody(e), e.id).toBe(true);
      }
    }
  });
});

describe('a pharmacy', () => {
  for (const side of SIDES) {
    for (const e of ofKind('pharmacy', true)) {
      const plan = kitOf(e, TURN[side], side);
      // The kit works in the building's own frame, where the street face is `local`.
      const local = plan.side!;
      const span = local === 'N' || local === 'S' ? plan.baseBox.w : plan.baseBox.d;

      it(`${e.id} (${side}) enters through a corner tower taller than the roof, glazed, with its door`, () => {
        const [tower] = only(plan, 'entryTower');
        expect(tower, e.id).toBeDefined();
        expect(tower!.size[1]).toBeGreaterThan(e.height);
        const towerWidth = local === 'N' || local === 'S' ? tower!.size[0] : tower!.size[2];
        expect(Math.abs(alongOf(tower!, local)), e.id).toBeCloseTo(span / 2 - towerWidth / 2, 5);
        const [glazing] = only(plan, 'towerGlazing');
        const [door] = only(plan, 'walkDoor');
        expect(Math.abs(alongOf(glazing!, local) - alongOf(tower!, local))).toBeLessThan(1e-6);
        expect(Math.abs(alongOf(door!, local) - alongOf(tower!, local))).toBeLessThan(1e-6);
        const [front] = only(plan, 'glassFront');
        expect(front, e.id).toBeDefined();
        expect(overlap(placementBounds(front!), placementBounds(tower!)), e.id).toBe(false);
      });

      it(`${e.id} (${side}) signs two faces, the street's and the tower's end wall`, () => {
        const bands = only(plan, 'signageBand');
        expect(bands, e.id).toHaveLength(2);
        const [a, b] = bands.map(placementBounds);
        // One band is wider along x than deep (a face on the z axis) and the other the reverse.
        const alongX = (r: LocalRect): boolean => r.x1 - r.x0 > r.z1 - r.z0;
        expect(alongX(a!) !== alongX(b!), e.id).toBe(true);
        for (const band of bands) {
          expect(band.offset[1] + band.size[1] / 2).toBeLessThanOrEqual(e.height);
        }
      });

      it(`${e.id} (${side}) puts the drive-up window under a canopy over the head of its lane, on the wall away from the tower`, () => {
        const lane = plan.lot!.lane!;
        expect(lane, e.id).not.toBeNull();
        const [canopy] = only(plan, 'pickupCanopy');
        const [window] = only(plan, 'bayGlass');
        expect(canopy, e.id).toBeDefined();
        expect(window, e.id).toBeDefined();
        expect(
          lane.rects.some((r) => overlap(r, placementBounds(canopy!))),
          e.id,
        ).toBe(true);
        const [tower] = only(plan, 'entryTower');
        const wallIsX = Math.abs(lane.pickupFacing.x) > Math.abs(lane.pickupFacing.z);
        // The lane's wall is an end wall: the tower stands at the other end of the face.
        const laneEnd = wallIsX ? lane.pickupFacing.x : lane.pickupFacing.z;
        expect(Math.sign(alongOf(tower!, local)), e.id).toBe(-Math.sign(laneEnd));
        // The canopy reaches 3.7 m out over the lane, 6 m along the wall, on two posts at its outer edge, with a fascia.
        const slab = placementBounds(canopy!);
        const reach = wallIsX ? slab.x1 - slab.x0 : slab.z1 - slab.z0;
        const along = wallIsX ? slab.z1 - slab.z0 : slab.x1 - slab.x0;
        expect(reach, e.id).toBeCloseTo(PHARMACY_CANOPY_M.out, 5);
        expect(along, e.id).toBeCloseTo(PHARMACY_CANOPY_M.along, 5);
        expect(only(plan, 'pickupCanopy'), e.id).toHaveLength(2);
        const posts = only(plan, 'signPole');
        expect(posts, e.id).toHaveLength(2);
        const outer = (r: LocalRect): number =>
          wallIsX ? (laneEnd > 0 ? r.x1 : -r.x0) : laneEnd > 0 ? r.z1 : -r.z0;
        for (const post of posts) {
          expect(outer(slab) - outer(placementBounds(post)), e.id).toBeCloseTo(
            PHARMACY_CANOPY_M.postInset,
            5,
          );
        }
        // It stands off every stall and aisle (the lane's own width is 3.66 m, so a hair of reach is allowed).
        const trim = (r: LocalRect): LocalRect => ({
          x0: r.x0 + 0.1,
          x1: r.x1 - 0.1,
          z0: r.z0 + 0.1,
          z1: r.z1 - 0.1,
        });
        for (const p of [canopy!, ...posts, ...only(plan, 'pickupCanopy')]) {
          for (const h of plan.lot!.hard) {
            expect(overlap(h, trim(placementBounds(p))), `${e.id} ${p.part}`).toBe(false);
          }
        }
        for (const p of [tower!, canopy!, window!]) {
          expect(inside(placementBounds(p), plan.lot!.lot), `${e.id} ${p.part}`).toBe(true);
        }
      });
    }
  }
});

describe('a machine shop', () => {
  for (const side of SIDES) {
    for (const e of [...ofKind('machineshop', false), ...ofKind('machineshop', true)]) {
      const plan = kitOf(e, 0, side);
      const span = side === 'N' || side === 'S' ? plan.baseBox.w : plan.baseBox.d;

      it(`${e.id} (${side}) has one grade door and an office door side by side on the street face`, () => {
        const doors = only(plan, 'rollUpDoors');
        const [walk] = only(plan, 'walkDoor');
        expect(doors, e.id).toHaveLength(1);
        expect(walk, e.id).toBeDefined();
        expect(overlap(placementBounds(doors[0]!), placementBounds(walk!)), e.id).toBe(false);
        expect(doors[0]!.size[1]).toBeCloseTo(3.05, 5);
        expect(walk!.size[1]).toBeCloseTo(2.1, 5);
      });

      it(`${e.id} (${side}) has a short sign over the doors, a fan on the roof and a bin clear of every car`, () => {
        const [sign] = only(plan, 'signageBand');
        expect(sign, e.id).toBeDefined();
        const width = side === 'N' || side === 'S' ? sign!.size[0] : sign!.size[2];
        expect(width).toBeLessThanOrEqual(4 + 1e-9);
        expect(width).toBeLessThan(span);
        const [fan] = only(plan, 'exhaustFan');
        expect(fan!.offset[1] - fan!.size[1] / 2, e.id).toBeCloseTo(e.height, 5);
        const bins = only(plan, 'scrapBin');
        expect(bins.length, e.id).toBeLessThanOrEqual(1);
        if (plan.lot) {
          for (const bin of bins) {
            expect(inside(placementBounds(bin), plan.lot.lot), e.id).toBe(true);
            expect(
              plan.lot.hard.some((h) => overlap(h, placementBounds(bin))),
              e.id,
            ).toBe(false);
          }
        }
      });
    }
  }

  it('finds the bin a place on its roomy lots', () => {
    for (const e of ofKind('machineshop', true)) {
      expect(only(kitOf(e, 0, 'S'), 'scrapBin'), e.id).toHaveLength(1);
    }
  });
});

describe('self-storage as rows', () => {
  it('cuts a plate into rows about 9 m wide with 7.3 m drives between them', () => {
    for (const span of [40.8, 54.4, 68]) {
      const { count, width } = storageRows(span);
      expect(count * width + (count - 1) * STORAGE_DRIVE_M).toBeCloseTo(span, 6);
      expect(width, `${span}`).toBeGreaterThan(7.5);
      expect(width, `${span}`).toBeLessThan(9.5);
    }
    expect(storageRows(40.8).count).toBe(3);
    expect(storageRows(54.4).count).toBe(4);
    expect(storageRows(68).count).toBe(5);
  });

  it('holds a door every 3 m along a wall, a metre of blank wall at each end', () => {
    expect(storageDoorsPerWall(40.8)).toBe(12);
    expect(storageDoorsPerWall(54.4)).toBe(17);
    expect(storageDoorsPerWall(1)).toBe(0);
  });

  for (const side of SIDES) {
    for (const e of [...ofKind('storage', false), ...ofKind('storage', true)]) {
      const plan = kitOf(e, 0, side);
      const alongX = side === 'N' || side === 'S';
      const span = alongX ? plan.baseBox.w : plan.baseBox.d;
      const depth = alongX ? plan.baseBox.d : plan.baseBox.w;
      const { count, width } = storageRows(span);
      const body: LocalRect = {
        x0: -plan.baseBox.w / 2,
        x1: plan.baseBox.w / 2,
        z0: -plan.baseBox.d / 2,
        z1: plan.baseBox.d / 2,
      };

      it(`${e.id} (${side}) draws ${count} rows, one roof each, that cover the plate between drives and never overlap`, () => {
        const rows = only(plan, 'storageRow');
        expect(rows).toHaveLength(count);
        expect(only(plan, 'storageRoof')).toHaveLength(count);
        const bounds = rows
          .map(placementBounds)
          .sort((a, b) => (alongX ? a.x0 - b.x0 : a.z0 - b.z0));
        for (const r of bounds) expect(inside(r, body), e.id).toBe(true);
        for (let i = 1; i < bounds.length; i += 1) {
          const gap = alongX
            ? bounds[i]!.x0 - bounds[i - 1]!.x1
            : bounds[i]!.z0 - bounds[i - 1]!.z1;
          expect(gap, `${e.id} drive ${i}`).toBeCloseTo(STORAGE_DRIVE_M, 5);
        }
        for (const r of rows) {
          expect(alongX ? r.size[0] : r.size[2], e.id).toBeCloseTo(width, 5);
          expect(alongX ? r.size[2] : r.size[0], e.id).toBeCloseTo(depth - STORAGE_DRIVE_M, 5);
          expect(r.size[1], e.id).toBeCloseTo(e.height, 5);
        }
        // A cross drive 7.3 m deep lies between the street face and every row's end, and the rows reach the far end.
        const gapToStreet = (r: LocalRect): number =>
          side === 'S'
            ? body.z1 - r.z1
            : side === 'N'
              ? r.z0 - body.z0
              : side === 'E'
                ? body.x1 - r.x1
                : r.x0 - body.x0;
        const farGap = (r: LocalRect): number =>
          side === 'S'
            ? r.z0 - body.z0
            : side === 'N'
              ? body.z1 - r.z1
              : side === 'E'
                ? r.x0 - body.x0
                : body.x1 - r.x1;
        for (const r of bounds) {
          expect(gapToStreet(r), `${e.id} cross drive`).toBeCloseTo(STORAGE_DRIVE_M, 5);
          expect(farGap(r), `${e.id} far end`).toBeCloseTo(0, 5);
        }
        const covered = (count * width * (depth - STORAGE_DRIVE_M)) / (span * depth);
        expect(covered, e.id).toBeGreaterThan(0.45);
        expect(covered, e.id).toBeLessThan(0.6);
      });

      it(`${e.id} (${side}) has roll-up doors 3 m apart on both long walls of every row`, () => {
        const doors = only(plan, 'storageDoor');
        const perWall = storageDoorsPerWall(depth - STORAGE_DRIVE_M);
        expect(doors, e.id).toHaveLength(count * 2 * perWall);
        const lines = new Map<number, number[]>();
        for (const d of doors) {
          const across = alongX ? d.offset[0] : d.offset[2];
          const along = alongX ? d.offset[2] : d.offset[0];
          const key = Math.round(across * 100);
          lines.set(key, [...(lines.get(key) ?? []), along]);
        }
        expect(lines.size, e.id).toBe(count * 2);
        for (const run of lines.values()) {
          const sorted = run.sort((a, b) => a - b);
          expect(sorted).toHaveLength(perWall);
          for (let i = 1; i < sorted.length; i += 1) {
            expect(sorted[i]! - sorted[i - 1]!, e.id).toBeCloseTo(STORAGE_DOOR_PITCH_M, 5);
          }
        }
        for (const d of doors) expect(d.yaw, e.id).toBeDefined();
      });

      it(`${e.id} (${side}) has a glazed office and its door at the street end of one row, and a fence or a gate across each drive`, () => {
        const [glass] = only(plan, 'glassFront');
        const [walk] = only(plan, 'walkDoor');
        expect(glass, e.id).toBeDefined();
        expect(walk, e.id).toBeDefined();
        expect(overlap(placementBounds(glass!), placementBounds(walk!)), e.id).toBe(false);
        const rows = only(plan, 'storageRow').map(placementBounds);
        const office = rows.filter((r) => {
          const g = placementBounds(glass!);
          return alongX
            ? g.x0 >= r.x0 - 1e-6 && g.x1 <= r.x1 + 1e-6
            : g.z0 >= r.z0 - 1e-6 && g.z1 <= r.z1 + 1e-6;
        });
        expect(office, e.id).toHaveLength(1);
        const fences = only(plan, 'yardFence');
        const gates = only(plan, 'storageGate');
        expect(gates, e.id).toHaveLength(1);
        // One fence run along the street face, in at most two pieces round the one gate, which is a drive wide.
        expect(fences.length, e.id).toBeGreaterThanOrEqual(1);
        expect(fences.length, e.id).toBeLessThanOrEqual(2);
        const lengthOf = (p: PartPlacement): number => p.size[alongX ? 0 : 2];
        expect(lengthOf(gates[0]!), e.id).toBeCloseTo(STORAGE_DRIVE_M, 5);
        const total = fences.reduce((s, p) => s + lengthOf(p), 0) + lengthOf(gates[0]!);
        expect(total, e.id).toBeCloseTo(span, 5);
        expect(gates[0]!.size[1]).toBeLessThan(fences[0]!.size[1]);
        // The gate stands at the end of the face beside the office, and the cross drive runs from it to every row drive.
        const gateAlong = alongX ? gates[0]!.offset[0] : gates[0]!.offset[2];
        const officeAlong = alongX ? placementBounds(glass!).x0 : placementBounds(glass!).z0;
        expect(Math.sign(gateAlong), e.id).toBe(Math.sign(officeAlong));
      });

      it(`${e.id} (${side}) puts nothing over a stall, an aisle, a berth or the lot line`, () => {
        if (!plan.lot) return;
        // The rows, their roofs and the fence stand inside the plate: no car, aisle, berth or walk lies under them.
        for (const part of ['storageRow', 'storageRoof', 'yardFence', 'storageGate'] as const) {
          for (const p of only(plan, part)) {
            const b = placementBounds(p);
            expect(inside(b, plan.lot.lot), `${e.id} ${part}`).toBe(true);
            expect(inside(b, body), `${e.id} ${part} in the plate`).toBe(true);
            // The layout's own edges are good to a millimetre or two.
            const shrunk = { x0: b.x0 + 0.02, x1: b.x1 - 0.02, z0: b.z0 + 0.02, z1: b.z1 - 0.02 };
            for (const t of plan.lot.taken)
              expect(overlap(t, shrunk), `${e.id} ${part}`).toBe(false);
          }
        }
        // What is hung on a wall stands a hand's breadth proud of it, and stays on the lot and off every car and aisle.
        const shrink = (r: LocalRect): LocalRect => ({
          x0: r.x0 + 0.2,
          x1: r.x1 - 0.2,
          z0: r.z0 + 0.2,
          z1: r.z1 - 0.2,
        });
        for (const part of ['storageDoor', 'glassFront', 'walkDoor', 'signageBand'] as const) {
          for (const p of only(plan, part)) {
            const b = placementBounds(p);
            expect(inside(b, plan.lot.lot), `${e.id} ${part}`).toBe(true);
            for (const h of plan.lot.hard) {
              expect(overlap(h, b) && overlap(h, shrink(b)), `${e.id} ${part}`).toBe(false);
            }
          }
        }
      });
    }
  }
});

const NEW_KINDS = ['bank', 'medicaloffice', 'quicklube'] as const;
const everyLot = (kind: string): BuildingCatalogEntry[] => [
  ...ofKind(kind, false),
  ...ofKind(kind, true),
];

describe('a bank, a medical office and a quick lube', () => {
  it('stand as a single tier; a bank and a lube show no window of their own, a medical office its row of windows', () => {
    for (const kind of NEW_KINDS) {
      for (const e of catalog.filter((c) => c.kind === kind)) {
        expect(tierCountOf(e), e.id).toBe(1);
        expect(windowlessBody(e), e.id).toBe(kind !== 'medicaloffice');
      }
    }
  });

  it('keep every part off every stall, aisle and walk, and on their lot, at every turn and street side', () => {
    const groundParts = ['pickupCanopy', 'entryCanopy', 'signPole', 'guardBooth', 'mailKiosk'];
    for (const kind of NEW_KINDS) {
      for (const e of everyLot(kind)) {
        for (const side of SIDES) {
          const plan = kitOf(e, TURN[side], side);
          if (!plan.lot) continue;
          for (const p of plan.placements) {
            const b = placementBounds(p);
            if (p.part === 'hipRoofBlock') continue;
            expect(inside(b, plan.lot.lot), `${e.id} ${side} ${p.part} on the lot`).toBe(true);
            if (!groundParts.includes(p.part)) continue;
            // A canopy is overhead, and the lane's own island is not ground a car stands on.
            if (p.part === 'pickupCanopy' || p.part === 'entryCanopy') {
              for (const h of plan.lot.hard) {
                expect(overlap(h, b), `${e.id} ${side} ${p.part} over ${JSON.stringify(h)}`).toBe(
                  false,
                );
              }
              continue;
            }
            for (const t of plan.lot.taken) {
              expect(overlap(t, b), `${e.id} ${side} ${p.part} on ${JSON.stringify(t)}`).toBe(
                false,
              );
            }
          }
        }
      }
    }
  });
});

describe('a bank', () => {
  for (const side of SIDES) {
    for (const e of ofKind('bank', true)) {
      const plan = kitOf(e, TURN[side], side);
      const lane = plan.lot!.lane!;
      const island = plan.lot!.laneIsland!;

      it(`${e.id} (${side}) has a glazed entrance with its door under one sign band`, () => {
        const [glass] = only(plan, 'glassFront');
        const [door] = only(plan, 'walkDoor');
        const bands = only(plan, 'signageBand');
        expect(glass, e.id).toBeDefined();
        expect(door, e.id).toBeDefined();
        expect(bands, e.id).toHaveLength(1);
        expect(bands[0]!.offset[1] - bands[0]!.size[1] / 2).toBeGreaterThan(
          glass!.offset[1] + glass!.size[1] / 2,
        );
        expect(bands[0]!.offset[1] + bands[0]!.size[1] / 2).toBeLessThanOrEqual(e.height);
      });

      it(`${e.id} (${side}) stands one canopy over both lanes and the island, on two posts on the island`, () => {
        expect(lane, e.id).not.toBeNull();
        expect(lane.rects, e.id).toHaveLength(2);
        const canopies = only(plan, 'pickupCanopy');
        expect(canopies, e.id).toHaveLength(1);
        const slab = placementBounds(canopies[0]!);
        for (const r of [...lane.rects, island]) expect(overlap(slab, r), e.id).toBe(true);
        // It spans the lanes and the island across, and two stacking spaces along them.
        const along = Math.max(slab.x1 - slab.x0, slab.z1 - slab.z0);
        const across = Math.min(slab.x1 - slab.x0, slab.z1 - slab.z0);
        expect(along, e.id).toBeCloseTo(2 * 6.096, 3);
        expect(across, e.id).toBeCloseTo(2 * 3.66 + 1.5, 3);
        const posts = only(plan, 'signPole');
        expect(posts, e.id).toHaveLength(2);
        for (const post of posts) {
          expect(inside(placementBounds(post), island), e.id).toBe(true);
          expect(post.size[1], e.id).toBeCloseTo(canopies[0]!.offset[1] - 0.125, 5);
        }
      });

      it(`${e.id} (${side}) has a teller kiosk and a cash machine on the island at the head of their lanes`, () => {
        const [kiosk] = only(plan, 'guardBooth');
        const [machine] = only(plan, 'mailKiosk');
        expect(kiosk, e.id).toBeDefined();
        expect(machine, e.id).toBeDefined();
        for (const p of [kiosk!, machine!])
          expect(inside(placementBounds(p), island), e.id).toBe(true);
        expect(overlap(placementBounds(kiosk!), placementBounds(machine!)), e.id).toBe(false);
        // The kiosk is at the teller lane's head, the machine nearer the tail: the cash lane is a car shorter.
        const alongX = Math.abs(lane.path[1]!.x - lane.path[0]!.x) > 1e-6;
        const at = (p: PartPlacement): number => (alongX ? p.offset[0] : p.offset[2]);
        const dir = Math.sign(
          alongX ? lane.path[1]!.x - lane.path[0]!.x : lane.path[1]!.z - lane.path[0]!.z,
        );
        expect(dir * (at(kiosk!) - at(machine!)), e.id).toBeCloseTo(6.096, 3);
      });
    }
  }
});

describe('a medical office', () => {
  for (const side of SIDES) {
    for (const e of everyLot('medicaloffice')) {
      const plan = kitOf(e, TURN[side], side);

      it(`${e.id} (${side}) has a hip roof over its body and a glazed entrance`, () => {
        const roofs = only(plan, 'hipRoofBlock');
        expect(roofs, e.id).toHaveLength(1);
        const roof = placementBounds(roofs[0]!);
        expect(roof.x1 - roof.x0, e.id).toBeGreaterThanOrEqual(plan.baseBox.w);
        expect(roofs[0]!.offset[1] - roofs[0]!.size[1] / 2, e.id).toBeCloseTo(e.height, 5);
        expect(only(plan, 'glassFront'), e.id).toHaveLength(1);
        expect(only(plan, 'walkDoor'), e.id).toHaveLength(1);
      });

      it(`${e.id} (${side}) signs a cross in white on blue or green, never red`, () => {
        const [panel, ...bars] = only(plan, 'signageBand');
        expect(panel, e.id).toBeDefined();
        expect(bars, e.id).toHaveLength(2);
        const [r, g, b] = panel!.color!;
        expect(r, e.id).toBeLessThan(Math.max(g, b));
        expect(panel!.color![0]).toBeLessThan(0.5);
        for (const bar of bars) expect(bar.color, e.id).toBeUndefined();
        const [first, second] = bars.map(placementBounds);
        // One bar upright, one across, crossing at the panel's middle.
        const upright = (rect: LocalRect): boolean => {
          const alongX = plan.side === 'N' || plan.side === 'S';
          return alongX
            ? rect.z1 - rect.z0 < rect.x1 - rect.x0
            : rect.x1 - rect.x0 < rect.z1 - rect.z0;
        };
        expect(upright(first!) || upright(second!), e.id).toBe(true);
        for (const bar of bars) {
          expect(bar.offset[1], e.id).toBeCloseTo(panel!.offset[1], 5);
          expect(bar.offset[1] + bar.size[1] / 2, e.id).toBeLessThanOrEqual(e.height);
        }
      });
    }
  }

  it('hangs a canopy over the walk in on two posts at the roomy lots, standing past the front walk', () => {
    for (const side of SIDES) {
      for (const e of ofKind('medicaloffice', true)) {
        const plan = kitOf(e, TURN[side], side);
        const [canopy] = only(plan, 'entryCanopy');
        const posts = only(plan, 'signPole');
        expect(canopy, e.id).toBeDefined();
        const slab = placementBounds(canopy!);
        // The 6x3 lot's street face is a drive aisle along the street, with no ground for a post: its canopy is hung from the wall over no car.
        if (e.id === 'com-medical-3-lot6x3') {
          expect(posts, `${e.id} ${side}`).toHaveLength(0);
          for (const h of plan.lot!.hard) expect(overlap(h, slab), `${e.id} ${side}`).toBe(false);
          continue;
        }
        expect(posts, `${e.id} ${side}`).toHaveLength(2);
        for (const post of posts) expect(inside(placementBounds(post), slab), e.id).toBe(true);
        const walk = plan.lot!.walk!;
        expect(overlap(slab, walk), `${e.id} ${side}`).toBe(true);
        for (const post of posts) expect(overlap(placementBounds(post), walk)).toBe(false);
      }
    }
  });
});

describe('a quick lube', () => {
  for (const side of SIDES) {
    for (const e of everyLot('quicklube')) {
      const plan = kitOf(e, TURN[side], side);
      const local = plan.side!;
      const alongX = local === 'N' || local === 'S';
      const span = alongX ? plan.baseBox.w : plan.baseBox.d;
      const bays = Math.round(span / 6.8);

      it(`${e.id} (${side}) has a bay door in each 6.8 m of both long faces`, () => {
        expect(bays, e.id).toBe(Number(e.id.match(/com-lube-(\d)/)![1]) * 2);
        const doors = only(plan, 'rollUpDoors');
        expect(doors, e.id).toHaveLength(2 * bays);
        const across = (p: PartPlacement): number => (alongX ? p.offset[2] : p.offset[0]);
        const along = (p: PartPlacement): number => (alongX ? p.offset[0] : p.offset[2]);
        const faces = [doors.filter((p) => across(p) > 0), doors.filter((p) => across(p) < 0)];
        for (const face of faces) {
          expect(face, e.id).toHaveLength(bays);
          const at = face.map(along).sort((a, b) => a - b);
          for (let i = 1; i < at.length; i += 1)
            expect(at[i]! - at[i - 1]!, e.id).toBeCloseTo(6.8, 5);
          for (const p of face) expect(p.size[alongX ? 0 : 2], e.id).toBeCloseTo(3.4, 5);
          for (const p of face) expect(p.size[1], e.id).toBeCloseTo(3.05, 5);
        }
        // Each door stands in the middle of its module, so a car drives straight through.
        expect(
          faces[0]!.map(along).sort((a, b) => a - b),
          e.id,
        ).toEqual(faces[1]!.map(along).sort((a, b) => a - b));
      });

      it(`${e.id} (${side}) has a glazed waiting room with its door on the street face and glass on the end wall, under a sign band`, () => {
        const glass = only(plan, 'glassFront');
        expect(glass, e.id).toHaveLength(2);
        expect(only(plan, 'walkDoor'), e.id).toHaveLength(1);
        const [band] = only(plan, 'signageBand');
        expect(band, e.id).toBeDefined();
        expect(band!.offset[1] - band!.size[1] / 2, e.id).toBeGreaterThan(3.05);
        const doors = only(plan, 'rollUpDoors').map(placementBounds);
        const [street] = glass.filter((p) =>
          alongX ? p.size[0] > p.size[2] : p.size[2] > p.size[0],
        );
        expect(street, e.id).toBeDefined();
        for (const d of doors) expect(overlap(d, placementBounds(street!)), e.id).toBe(false);
      });
    }
  }
});
