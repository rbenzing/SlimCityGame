import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  EDU_GYM,
  EDU_PULL_IN_M,
  EDU_STOREY_M,
  EDU_TENNIS_PAIR,
  EDU_WING_DEPTH_M,
  FLAGPOLE_HEIGHT_M,
  RECYCLING_YARD_HEIGHT,
  SCHOOL_BUS_SIZE,
  UtilityKitRenderer,
  computeEducationLayout,
  educationFloorArea,
  educationStallRect,
  footprintHalfExtents,
  type EducationLayout,
  type Rect,
  type UtilityKitPartKind,
} from './utilitykits';
import { sizeForKind } from './vehicles';
import catalogData from '../data/catalog.json';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  VehicleKind,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const flat = (): number => 0;

/** Each building's stated floor, m², from the civic massing table. */
const STATED_FLOOR = {
  school: 5203,
  'middle-school': 8904,
  'high-school': 11911,
  college: 16230,
  library: 1143,
} as const;
const EDUCATION_IDS = Object.keys(STATED_FLOOR) as (keyof typeof STATED_FLOOR)[];
const SCHOOL_IDS = ['school', 'middle-school', 'high-school', 'college'] as const;

const kinds: UtilityKitPartKind[] = [
  'schoolGrounds',
  'schoolBuilding',
  'schoolProps',
  'schoolLit',
  'schoolTree',
  'schoolCar',
  'schoolBus',
];

function instance(
  id: number,
  catalogId: string,
  overrides: Partial<BuildingInstance> = {},
): BuildingInstance {
  return {
    id,
    catalogId,
    x: 10,
    z: 10,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...overrides,
  };
}
const add = (...buildings: BuildingInstance[]): BuildingDelta => ({
  added: buildings,
  removed: [],
  updated: [],
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;

const around = (c: { x: number; z: number }, hx: number, hz: number): Rect => ({
  x0: c.x - hx,
  x1: c.x + hx,
  z0: c.z - hz,
  z1: c.z + hz,
});

/** The bus parked with its nose along X: 11 m across the frontage. */
const busRect = (layout: EducationLayout): Rect => {
  const alongX = layout.bus!.turn % 2 === 1;
  const { l, w } = SCHOOL_BUS_SIZE;
  return around(layout.bus!, (alongX ? l : w) / 2, (alongX ? w : l) / 2);
};

describe.each(EDUCATION_IDS)('the %s layout', (id) => {
  const entry = byId(id);
  const layout = computeEducationLayout(entry);
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const lot: Rect = { x0: -halfW, x1: halfW, z0: -halfD, z1: halfD };
  const inside = (r: Rect): boolean =>
    r.x0 >= lot.x0 - 1e-9 &&
    r.x1 <= lot.x1 + 1e-9 &&
    r.z0 >= lot.z0 - 1e-9 &&
    r.z1 <= lot.z1 + 1e-9;

  it('is deterministic', () => {
    expect(computeEducationLayout(entry)).toEqual(layout);
  });

  it('keeps every building 2 m clear of the lot edge and everything else inside it', () => {
    for (const m of layout.masses) {
      expect(m.rect.x0).toBeGreaterThanOrEqual(lot.x0 + 2 - 1e-9);
      expect(m.rect.x1).toBeLessThanOrEqual(lot.x1 - 2 + 1e-9);
      expect(m.rect.z0).toBeGreaterThanOrEqual(lot.z0 + 2 - 1e-9);
      expect(m.rect.z1).toBeLessThanOrEqual(lot.z1 - 2 + 1e-9);
    }
    expect(inside(layout.canopy)).toBe(true);
    for (const r of [...layout.asphalt, ...layout.concrete, ...layout.tennis]) {
      expect(inside(r)).toBe(true);
    }
    for (const r of [layout.mulch, layout.field, layout.quad, layout.pullIn, layout.bookDrop]) {
      if (r) expect(inside(r)).toBe(true);
    }
    for (const s of layout.stalls) expect(inside(educationStallRect(s))).toBe(true);
    if (layout.bus) expect(inside(busRect(layout))).toBe(true);
    for (const t of layout.trees) expect(inside(around(t, 1.1, 1.1))).toBe(true);
    for (const p of layout.paths) {
      const dx = p.b.x - p.a.x;
      const dz = p.b.z - p.a.z;
      const len = Math.hypot(dx, dz);
      const px = (-dz / len) * (p.w / 2);
      const pz = (dx / len) * (p.w / 2);
      for (const end of [p.a, p.b]) {
        for (const s of [-1, 1]) {
          expect(inside(around({ x: end.x + s * px, z: end.z + s * pz }, 0, 0))).toBe(true);
        }
      }
    }
    if (layout.flagpole) expect(inside(around(layout.flagpole, 0.5, 0.5))).toBe(true);
    if (layout.playStructure) expect(inside(around(layout.playStructure, 2, 4.5))).toBe(true);
    for (const p of layout.panes) expect(inside(around(p, p.w / 2, p.d / 2))).toBe(true);
  });

  it('has no two building masses overlapping', () => {
    for (let i = 0; i < layout.masses.length; i++) {
      for (let j = i + 1; j < layout.masses.length; j++) {
        expect(overlaps(layout.masses[i]!.rect, layout.masses[j]!.rect)).toBe(false);
      }
    }
  });

  it('draws the floor its design states, wings x 3, gyms x 2, the library x 1, within 1%', () => {
    const drawn = educationFloorArea(layout);
    expect(Math.abs(drawn - STATED_FLOOR[id]) / STATED_FLOOR[id]).toBeLessThan(0.01);
  });

  it('keeps the stalls, the bus and the canopy clear of every building and of each other', () => {
    const things: Rect[] = layout.stalls.map(educationStallRect);
    if (layout.bus) things.push(busRect(layout));
    for (let i = 0; i < things.length; i++) {
      for (const m of layout.masses) expect(overlaps(things[i]!, m.rect)).toBe(false);
      expect(overlaps(things[i]!, layout.canopy)).toBe(false);
      for (let j = i + 1; j < things.length; j++) {
        expect(overlaps(things[i]!, things[j]!)).toBe(false);
      }
    }
  });

  it('puts every pane on a wall of a building', () => {
    for (const p of layout.panes) {
      const onWall = layout.masses.some((m) => {
        const r = m.rect;
        const nearX = Math.abs(p.x - r.x0) < 0.2 || Math.abs(p.x - r.x1) < 0.2;
        const nearZ = Math.abs(p.z - r.z0) < 0.2 || Math.abs(p.z - r.z1) < 0.2;
        const withinX = p.x >= r.x0 - 0.3 && p.x <= r.x1 + 0.3;
        const withinZ = p.z >= r.z0 - 0.3 && p.z <= r.z1 + 0.3;
        return (nearX && withinZ) || (nearZ && withinX);
      });
      const ontoCanopyDoor =
        Math.abs(p.x - layout.door.x) < 1.5 && Math.abs(p.z - layout.door.z) < 1.5;
      expect(onWall || ontoCanopyDoor).toBe(true);
      expect(p.y + p.h).toBeLessThanOrEqual(Math.max(...layout.masses.map((m) => m.height)));
    }
    expect(layout.panes.length).toBeGreaterThan(0);
  });
});

describe('the wings and gyms', () => {
  it('draw three storeys of 3.2 m, the elementary school taking its parapet to its 10 m', () => {
    for (const id of SCHOOL_IDS) {
      const layout = computeEducationLayout(byId(id));
      const wings = layout.masses.filter((m) => m.floors === 3);
      expect(wings).toHaveLength(id === 'college' ? 3 : 2);
      for (const wing of wings) {
        expect(wing.height).toBe(byId(id).height);
        const sides = [wing.rect.x1 - wing.rect.x0, wing.rect.z1 - wing.rect.z0];
        expect(sides.some((s) => Math.abs(s - EDU_WING_DEPTH_M) < 1e-9)).toBe(true);
      }
    }
    expect(byId('school').height).toBe(10);
    expect(3 * EDU_STOREY_M).toBeCloseTo(9.6, 9);
  });

  it('stand each gym 7.3 m tall at the front of the back wing, away from the side wing', () => {
    for (const id of ['school', 'middle-school', 'high-school'] as const) {
      const layout = computeEducationLayout(byId(id));
      const [back, side, gym] = layout.masses;
      expect(gym!.height).toBe(7.3);
      expect(gym!.floors).toBe(EDU_GYM.floors);
      expect(gym!.rect.z0).toBeCloseTo(back!.rect.z1, 9);
      expect(gym!.rect.x0).toBeGreaterThan(side!.rect.x1);
    }
    expect(computeEducationLayout(byId('college')).masses.some((m) => m.floors === 2)).toBe(false);
  });

  it('holds the college quad between its two side wings, about 75 by 73 m, with four paths', () => {
    const layout = computeEducationLayout(byId('college'));
    const quad = layout.quad!;
    expect(quad.x1 - quad.x0).toBeCloseTo(74.6, 6);
    expect(quad.z1 - quad.z0).toBeCloseTo(72.7, 6);
    expect(layout.paths).toHaveLength(4);
    expect(layout.trees.length).toBeGreaterThan(6);
  });
});

describe('the middle and high school grounds', () => {
  for (const id of ['middle-school', 'high-school'] as const) {
    const entry = byId(id);
    const layout = computeEducationLayout(entry);
    const { halfD } = footprintHalfExtents(entry.footprint);

    it(`${id} has a 9.1 m bus pull-in along the frontage with the bus inside it`, () => {
      const pull = layout.pullIn!;
      expect(pull.z0).toBeCloseTo(halfD - 2 - EDU_PULL_IN_M, 9);
      const bus = busRect(layout);
      expect(bus.x0).toBeGreaterThanOrEqual(pull.x0);
      expect(bus.x1).toBeLessThanOrEqual(pull.x1);
      expect(bus.z0).toBeGreaterThanOrEqual(pull.z0);
      expect(bus.z1).toBeLessThanOrEqual(pull.z1);
    });

    it(`${id} stands a staff car park before the gym`, () => {
      const gym = layout.masses[layout.masses.length - 1]!;
      for (const s of layout.stalls) {
        expect(s.z).toBeGreaterThan(gym.rect.z1);
        expect(s.x).toBeGreaterThan(gym.rect.x0);
      }
      expect(layout.stalls).toHaveLength(id === 'middle-school' ? 16 : 11);
    });
  }

  it('lays two paired tennis courts, 36.6 by 32.9 m, inside the high school courtyard', () => {
    const layout = computeEducationLayout(byId('high-school'));
    const courtyard = layout.courtyard!;
    expect(layout.tennis).toHaveLength(2);
    const x0 = Math.min(...layout.tennis.map((c) => c.x0));
    const x1 = Math.max(...layout.tennis.map((c) => c.x1));
    const z0 = Math.min(...layout.tennis.map((c) => c.z0));
    const z1 = Math.max(...layout.tennis.map((c) => c.z1));
    expect(x1 - x0).toBeCloseTo(EDU_TENNIS_PAIR.w, 9);
    expect(z1 - z0).toBeCloseTo(EDU_TENNIS_PAIR.d, 9);
    for (const court of layout.tennis) {
      expect(court.x0).toBeGreaterThanOrEqual(courtyard.x0);
      expect(court.x1).toBeLessThanOrEqual(courtyard.x1);
      expect(court.z0).toBeGreaterThanOrEqual(courtyard.z0);
      expect(court.z1).toBeLessThanOrEqual(courtyard.z1);
      for (const m of layout.masses) expect(overlaps(court, m.rect)).toBe(false);
    }
    expect(layout.tennis[0]!.z1).toBeCloseTo(layout.tennis[1]!.z0, 9);
  });

  it('gives the middle school a play field and no tennis courts, and the high school the reverse', () => {
    const middle = computeEducationLayout(byId('middle-school'));
    const high = computeEducationLayout(byId('high-school'));
    expect(middle.field).not.toBeNull();
    expect(middle.tennis).toHaveLength(0);
    expect(high.field).toBeNull();
  });
});

describe('the elementary school grounds', () => {
  it('opens a courtyard to the street with a play structure on a mulch patch on the blacktop', () => {
    const layout = computeEducationLayout(byId('school'));
    expect(layout.bus).toBeNull();
    const mulch = layout.mulch!;
    const structure = layout.playStructure!;
    expect(structure.x).toBeGreaterThan(mulch.x0);
    expect(structure.x).toBeLessThan(mulch.x1);
    expect(structure.z).toBeGreaterThan(mulch.z0);
    expect(structure.z).toBeLessThan(mulch.z1);
    expect(
      layout.asphalt.some((a) => a.x0 <= mulch.x0 && a.x1 >= mulch.x1 && a.z1 >= mulch.z1),
    ).toBe(true);
    const { halfD } = footprintHalfExtents(byId('school').footprint);
    expect(layout.courtyard!.z1).toBe(halfD);
  });
});

describe('the library', () => {
  const layout = computeEducationLayout(byId('library'));

  it('raises a 24 m reading room to 6.0 m between flanks of 3.2 m', () => {
    const heights = layout.masses.map((m) => m.height);
    expect(heights).toEqual([3.2, 6, 3.2]);
    const reading = layout.masses[1]!.rect;
    expect(reading.x1 - reading.x0).toBeCloseTo(24, 9);
    expect(layout.door.x).toBeCloseTo((reading.x0 + reading.x1) / 2, 9);
    // The clerestory glazing stands over the flanks' roofs.
    expect(layout.panes.some((p) => p.y >= 3.2 && p.y + p.h <= 6)).toBe(true);
  });

  it('parks twelve cars on one aisle, one of them accessible with its access aisle', () => {
    expect(layout.stalls).toHaveLength(12);
    expect(layout.stalls.filter((s) => s.accessible)).toHaveLength(1);
    const accessible = educationStallRect(layout.stalls.find((s) => s.accessible)!);
    const aisle = layout.accessibleAisle!;
    expect(aisle.z0).toBeCloseTo(accessible.z1, 9);
    expect(aisle.z1 - aisle.z0).toBeCloseTo(60 * 0.0254, 9);
    expect(accessible.z1 - accessible.z0).toBeCloseTo(132 * 0.0254, 9);
  });

  it('stands a book drop on the street face beside the door', () => {
    const drop = layout.bookDrop!;
    expect(drop.z0).toBeCloseTo(layout.masses[1]!.rect.z1, 9);
    expect(drop.x0).toBeGreaterThan(layout.canopy.x1);
  });
});

describe('the school bus', () => {
  it('is a Type C, 11.0 by 2.44 by 3.2 m', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [byId('high-school')]);
    const bus = renderer.partGeometry('high-school', 'schoolBus')!;
    bus.computeBoundingBox();
    const size = bus.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2.44, 6);
    expect(size.y).toBeCloseTo(3.2, 6);
    expect(size.z).toBeCloseTo(11, 6);
    expect(bus.boundingBox!.min.y).toBeCloseTo(0, 6);
  });

  it('stands higher and longer than the 4.0 m car beside it', () => {
    const [, ch, cl] = sizeForKind(VehicleKind.Car);
    expect(SCHOOL_BUS_SIZE.h).toBeGreaterThan(ch);
    expect(SCHOOL_BUS_SIZE.l).toBeGreaterThan(2 * cl);
  });
});

describe.each(EDUCATION_IDS)('the %s kit', (id) => {
  const entry = byId(id);
  const layout = computeEducationLayout(entry);

  it('is claimed by the kit renderer so the instancer draws only a plinth under it', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    expect(renderer.kitIds().has(id)).toBe(true);
  });

  it('keeps every part inside its footprint at all four rotations', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
      renderer.apply(add(instance(5, id, { rotation })));
      const lotShape = footprintForRotation(entry, rotation);
      const lot = new THREE.Box3(
        new THREE.Vector3(10 * TILE_METERS, -20, 10 * TILE_METERS),
        new THREE.Vector3((10 + lotShape.w) * TILE_METERS, 40, (10 + lotShape.d) * TILE_METERS),
      );
      const m = new THREE.Matrix4();
      for (const kind of kinds) {
        const geometry = renderer.partGeometry(id, kind);
        if (!geometry) continue;
        geometry.computeBoundingBox();
        for (const slot of renderer.partSlotsFor(5, kind)) {
          renderer.getPartMatrix(id, kind, slot, m);
          const box = geometry.boundingBox!.clone().applyMatrix4(m);
          expect(lot.containsBox(box.expandByScalar(-1e-6))).toBe(true);
        }
      }
      expect(renderer.partSlotsFor(5, 'schoolBuilding')).toHaveLength(1);
      expect(renderer.partSlotsFor(5, 'schoolBus')).toHaveLength(layout.bus ? 1 : 0);
      expect(renderer.partSlotsFor(5, 'schoolTree')).toHaveLength(layout.trees.length);
    }
  });

  it('stands a flagpole 9.1 m tall on the lot', () => {
    expect(layout.flagpole).not.toBeNull();
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const props = renderer.partGeometry(id, 'schoolProps')!;
    props.computeBoundingBox();
    expect(props.boundingBox!.max.y - RECYCLING_YARD_HEIGHT).toBeGreaterThanOrEqual(
      FLAGPOLE_HEIGHT_M - 1e-6,
    );
    expect(props.boundingBox!.max.y - RECYCLING_YARD_HEIGHT).toBeLessThan(FLAGPOLE_HEIGHT_M + 0.05);
  });

  it('draws the tallest building to its catalog height or, for the library, its raised roof', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const building = renderer.partGeometry(id, 'schoolBuilding')!;
    building.computeBoundingBox();
    const top = building.boundingBox!.max.y - RECYCLING_YARD_HEIGHT;
    const tallest = Math.max(...layout.masses.map((m) => m.height));
    expect(top).toBeCloseTo(tallest, 5);
    // The college's portico and pediment stay under its wings.
    if (id === 'college') expect(top).toBeLessThanOrEqual(entry.height + 1e-6);
  });

  it('stands on the highest ground under its lot, so a slope never shows through', () => {
    const slope = (x: number, z: number): number => 0.04 * x + 0.02 * z;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), slope, [entry]);
    renderer.apply(add(instance(2, id, { x: 3, z: 4 })));
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(id, 'schoolBuilding', renderer.partSlotsFor(2, 'schoolBuilding')[0]!, m);
    const lot = footprintForRotation(entry, 0);
    expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeCloseTo(
      slope((3 + lot.w) * TILE_METERS, (4 + lot.d) * TILE_METERS),
      5,
    );
  });

  it('frees every slot of a removed building', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    renderer.apply(add(instance(1, id), instance(2, id, { x: 60, z: 60 })));
    const slots = kinds.map((kind) => renderer.partSlotsFor(1, kind));
    renderer.apply({ added: [], removed: [1], updated: [] });
    const m = new THREE.Matrix4();
    kinds.forEach((kind, i) => {
      expect(renderer.partSlotsFor(1, kind)).toHaveLength(0);
      for (const slot of slots[i]!) {
        renderer.getPartMatrix(id, kind, slot, m);
        expect(new THREE.Vector3().setFromMatrixScale(m).length()).toBe(0);
      }
    });
    expect(renderer.partSlotsFor(2, 'schoolBuilding')).toHaveLength(1);
  });

  it('lights its windows, bands and door panes at night and leaves the rest unlit', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    expect(renderer.stationLightIntensity()).toBe(0);
    renderer.setNightFactor(1);
    expect(renderer.stationLightIntensity()).toBe(1);
    expect(renderer.partEmissiveHex(id, 'schoolLit')).not.toBe(0);
    expect(renderer.partEmissiveHex(id, 'schoolBuilding')).toBe(0);
    expect(renderer.partEmissiveHex(id, 'schoolGrounds')).toBe(0);
    expect(renderer.partEmissiveHex(id, 'schoolProps')).toBe(0);
  });
});

describe('the parked cars', () => {
  it('stand one to a stall at the stall centre, and only where there are stalls', () => {
    for (const id of EDUCATION_IDS) {
      const entry = byId(id);
      const layout = computeEducationLayout(entry);
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
      renderer.apply(add(instance(5, id)));
      const cars = renderer.partSlotsFor(5, 'schoolCar');
      expect(cars.length).toBeLessThanOrEqual(layout.stalls.length);
      if (layout.stalls.length === 0) expect(renderer.instanceCount(id, 'schoolCar')).toBe(0);
      const lot = footprintForRotation(entry, 0);
      const centre = new THREE.Vector3(
        (10 + lot.w / 2) * TILE_METERS,
        0,
        (10 + lot.d / 2) * TILE_METERS,
      );
      const taken = new Set<number>();
      const m = new THREE.Matrix4();
      for (const slot of cars) {
        renderer.getPartMatrix(id, 'schoolCar', slot, m);
        const at = new THREE.Vector3().setFromMatrixPosition(m).sub(centre);
        const stall = layout.stalls.findIndex((s) => Math.hypot(s.x - at.x, s.z - at.z) < 1e-3);
        expect(stall).toBeGreaterThanOrEqual(0);
        expect(taken.has(stall)).toBe(false);
        taken.add(stall);
      }
    }
  });
});
