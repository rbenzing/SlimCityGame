import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CC_BOILER,
  CC_HALL,
  CC_STACK_HEIGHT_M,
  CC_TOWER,
  GAS_INLET,
  GAS_PACKAGE,
  GAS_PLATE,
  GAS_STACK_HEIGHT_M,
  GAS_STACK_RADIUS_M,
  GEN_FENCE_HEIGHT_M,
  GEN_PLATE_M,
  GEN_SECURITY_FENCE_HEIGHT_M,
  NUCLEAR_INTAKE,
  NUCLEAR_REACTOR,
  NUCLEAR_TURBINE,
  SOLAR_LOW_EDGE_M,
  SOLAR_NOON_FACING,
  SOLAR_PITCH_M,
  SOLAR_PLAN_M,
  SOLAR_SKID,
  SOLAR_TOP_EDGE_M,
  UtilityKitRenderer,
  computeCombinedCycleLayout,
  computeGasTurbineLayout,
  computeNuclearLayout,
  computeSolarLayout,
  rotateLocalXZ,
  type Rect,
  type UtilityKitPartKind,
} from './utilitykits';
import { sunDirection } from './sun';
import catalogData from '../data/catalog.json';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const flat = (): number => 0;
const ROTATIONS = [0, 1, 2, 3] as const;

const GENERATOR_KINDS: Readonly<Record<string, readonly UtilityKitPartKind[]>> = {
  'solar-farm': ['solarGrounds', 'solarRow', 'solarSite'],
  'gas-turbine': ['gasGrounds', 'gasPlant', 'gasStack'],
  'combined-cycle': ['combinedGrounds', 'combinedPlant', 'combinedStack'],
  'nuclear-plant': ['nuclearGrounds', 'nuclearPlant', 'nuclearIntake'],
};
const IDS = Object.keys(GENERATOR_KINDS);

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

/** A rect of the lot's own frame, turned with the lot, as a rect about the lot's centre. */
function turned(r: Rect, rotation: 0 | 1 | 2 | 3): Rect {
  const corners = [
    rotateLocalXZ(r.x0, r.z0, rotation),
    rotateLocalXZ(r.x1, r.z0, rotation),
    rotateLocalXZ(r.x0, r.z1, rotation),
    rotateLocalXZ(r.x1, r.z1, rotation),
  ];
  return {
    x0: Math.min(...corners.map((c) => c.x)),
    x1: Math.max(...corners.map((c) => c.x)),
    z0: Math.min(...corners.map((c) => c.z)),
    z1: Math.max(...corners.map((c) => c.z)),
  };
}

function boundsOf(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.clone();
}

describe('the generator kits are claimed by the kit renderer', () => {
  it('builds all four, so the instancer draws only a plinth under each', () => {
    const renderer = new UtilityKitRenderer(
      new THREE.Scene(),
      flat,
      IDS.map((id) => byId(id)),
    );
    for (const id of IDS) expect(renderer.kitIds().has(id)).toBe(true);
  });
});

describe.each(IDS)('the %s kit', (id) => {
  const entry = byId(id);
  const kinds = GENERATOR_KINDS[id]!;

  it('keeps every part inside its footprint at all four rotations', () => {
    for (const rotation of ROTATIONS) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
      renderer.apply(add(instance(5, id, { rotation })));
      const lotShape = footprintForRotation(entry, rotation);
      const lot = new THREE.Box3(
        new THREE.Vector3(10 * TILE_METERS, -20, 10 * TILE_METERS),
        new THREE.Vector3((10 + lotShape.w) * TILE_METERS, 60, (10 + lotShape.d) * TILE_METERS),
      );
      const m = new THREE.Matrix4();
      for (const kind of kinds) {
        const geometry = renderer.partGeometry(id, kind)!;
        const bounds = boundsOf(geometry);
        const slots = renderer.partSlotsFor(5, kind);
        expect(slots.length).toBeGreaterThan(0);
        for (const slot of slots) {
          renderer.getPartMatrix(id, kind, slot, m);
          expect(lot.containsBox(bounds.clone().applyMatrix4(m).expandByScalar(-1e-6))).toBe(true);
        }
      }
    }
  });

  it('stands its plate on the highest ground under the lot and its parts on the plate', () => {
    const slope = (x: number, z: number): number => 0.04 * x + 0.02 * z;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), slope, [entry]);
    renderer.apply(add(instance(2, id, { x: 3, z: 4 })));
    const lot = footprintForRotation(entry, 0);
    const top = slope((3 + lot.w) * TILE_METERS, (4 + lot.d) * TILE_METERS);
    const m = new THREE.Matrix4();
    for (const kind of kinds) {
      const slot = renderer.partSlotsFor(2, kind)[0]!;
      renderer.getPartMatrix(id, kind, slot, m);
      const y = new THREE.Vector3().setFromMatrixPosition(m).y;
      const onPlate = kind.endsWith('Grounds') ? 0 : GEN_PLATE_M;
      expect(y).toBeCloseTo(top + onPlate, 5);
    }
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
    expect(renderer.partSlotsFor(2, kinds[0]!)).toHaveLength(1);
  });

  it('carries no emissive colour on any part, at noon or at night', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    renderer.apply(add(instance(1, id)));
    for (const nightFactor of [0, 1]) {
      renderer.setNightFactor(nightFactor);
      for (const kind of kinds) expect(renderer.partEmissiveHex(id, kind)).toBe(0);
    }
  });

  it('is drawn the same way twice', () => {
    const a = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const b = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    for (const kind of kinds) {
      const pa = a.partGeometry(id, kind)!.getAttribute('position').array;
      const pb = b.partGeometry(id, kind)!.getAttribute('position').array;
      expect(Array.from(pa)).toEqual(Array.from(pb));
    }
  });
});

describe('the solar farm', () => {
  const entry = byId('solar-farm');

  it('faces the noon side of the scene, read from the scene’s own sun', () => {
    const sun = sunDirection(0.5);
    const len = Math.hypot(sun.x, sun.z);
    expect(SOLAR_NOON_FACING.x).toBeCloseTo(Math.round(sun.x / len), 9);
    expect(SOLAR_NOON_FACING.z).toBeCloseTo(Math.round(sun.z / len), 9);
    expect(Math.hypot(SOLAR_NOON_FACING.x, SOLAR_NOON_FACING.z)).toBe(1);
  });

  it('lays its rows at the same offsets and facing at every rotation', () => {
    const first = computeSolarLayout(entry.footprint, 0);
    for (const rotation of ROTATIONS) {
      const layout = computeSolarLayout(entry.footprint, rotation);
      expect(layout.rows).toEqual(first.rows);
      expect(layout.turn).toBe(first.turn);
    }
    expect(computeSolarLayout(entry.footprint, 0)).toEqual(first);
  });

  it('pitches a dozen rows at 9.5 m for a 45% ground coverage ratio', () => {
    const { rows } = computeSolarLayout(entry.footprint, 0);
    expect(rows).toHaveLength(12);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.z - rows[i - 1]!.z).toBeCloseTo(SOLAR_PITCH_M, 9);
      expect(rows[i]!.x).toBe(0);
    }
    expect(SOLAR_PLAN_M).toBeCloseTo(4.29, 1);
    expect(SOLAR_PLAN_M / SOLAR_PITCH_M).toBeGreaterThan(0.445);
    expect(SOLAR_PLAN_M / SOLAR_PITCH_M).toBeLessThan(0.455);
  });

  it('takes the facing as an input and pitches the rows along it', () => {
    const east = computeSolarLayout(entry.footprint, 0, { x: 1, z: 0 });
    expect(east.turn).toBe(1);
    expect(east.rows).toHaveLength(12);
    expect(east.rows.every((r) => r.z === 0)).toBe(true);
    expect(computeSolarLayout(entry.footprint, 0, { x: 0, z: -1 }).turn).toBe(2);
    expect(computeSolarLayout(entry.footprint, 0, { x: -1, z: 0 }).turn).toBe(3);
  });

  it('draws a row 20° tilted, its low edge 0.6 m up and its top edge at 2.16 m', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const bounds = boundsOf(renderer.partGeometry('solar-farm', 'solarRow')!);
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(bounds.max.y).toBeCloseTo(SOLAR_TOP_EDGE_M, 6);
    expect(SOLAR_TOP_EDGE_M).toBeCloseTo(2.16, 2);
    expect(SOLAR_LOW_EDGE_M).toBe(0.6);
    // Two 2.28 m modules down the slope: 4.56 m of panel.
    const rise = SOLAR_TOP_EDGE_M - SOLAR_LOW_EDGE_M;
    expect(rise / Math.sin((20 * Math.PI) / 180)).toBeCloseTo(4.56, 6);
  });

  it('turns every panel to the same world direction at every rotation of the lot', () => {
    const faces: THREE.Vector3[] = [];
    for (const rotation of ROTATIONS) {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
      renderer.apply(add(instance(5, 'solar-farm', { rotation })));
      const geometry = renderer.partGeometry('solar-farm', 'solarRow')!;
      const normals = geometry.getAttribute('normal');
      const panelFace = Math.cos((20 * Math.PI) / 180);
      const m = new THREE.Matrix4();
      const slots = renderer.partSlotsFor(5, 'solarRow');
      expect(slots).toHaveLength(12);
      for (const slot of slots) {
        renderer.getPartMatrix('solar-farm', 'solarRow', slot, m);
        const q = new THREE.Quaternion();
        m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
        const sum = new THREE.Vector3();
        let count = 0;
        for (let i = 0; i < normals.count; i++) {
          if (Math.abs(normals.getY(i) - panelFace) > 1e-3) continue;
          sum.add(new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i)));
          count++;
        }
        expect(count).toBeGreaterThan(0);
        const normal = sum.divideScalar(count).applyQuaternion(q);
        expect(normal.y).toBeCloseTo(panelFace, 6);
        faces.push(new THREE.Vector3(normal.x, 0, normal.z).normalize());
      }
    }
    for (const face of faces) {
      expect(face.x).toBeCloseTo(SOLAR_NOON_FACING.x, 6);
      expect(face.z).toBeCloseTo(SOLAR_NOON_FACING.z, 6);
    }
  });

  it('keeps its rows off the track and the skid wherever the street is', () => {
    for (const rotation of ROTATIONS) {
      const layout = computeSolarLayout(entry.footprint, rotation);
      const halfLong = 49.72;
      for (const row of layout.rows) {
        const rect: Rect = {
          x0: row.x - halfLong,
          x1: row.x + halfLong,
          z0: row.z - SOLAR_PLAN_M / 2,
          z1: row.z + SOLAR_PLAN_M / 2,
        };
        expect(overlaps(rect, turned(layout.track, rotation))).toBe(false);
        expect(overlaps(rect, turned(layout.skid, rotation))).toBe(false);
      }
    }
  });

  it('puts the track in from the street edge to the skid, which is the SMA station on a 20 ft skid', () => {
    const layout = computeSolarLayout(entry.footprint, 0);
    expect(layout.track.z1).toBe((entry.footprint.d * TILE_METERS) / 2);
    expect(layout.track.x1 - layout.track.x0).toBe(4);
    expect(layout.skid.x1 - layout.skid.x0).toBeCloseTo(SOLAR_SKID.w, 9);
    expect(layout.skid.z1 - layout.skid.z0).toBeCloseTo(SOLAR_SKID.d, 9);
    expect(SOLAR_SKID.h).toBe(entry.height);
    expect(layout.gate.x0).toBeLessThan(layout.track.x0);
    expect(layout.gate.x1).toBeGreaterThan(layout.track.x1);
  });

  it('draws a 7 ft chain-link fence round the lot', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const site = boundsOf(renderer.partGeometry('solar-farm', 'solarSite')!);
    expect(GEN_FENCE_HEIGHT_M).toBe(2.1);
    // The skid and its roof vent stand over the fence; nothing else does.
    expect(site.max.y).toBeCloseTo(SOLAR_SKID.h + 0.35, 6);
    const lot = (entry.footprint.w * TILE_METERS) / 2;
    expect(site.min.x).toBeCloseTo(-lot + 0.6 - 0.06, 4);
    expect(site.max.x).toBeCloseTo(lot - 0.6 + 0.06, 4);
  });
});

describe('the gas turbine', () => {
  const entry = byId('gas-turbine');
  const layout = computeGasTurbineLayout(entry.footprint);
  const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);

  it('is deterministic', () => {
    expect(computeGasTurbineLayout(entry.footprint)).toEqual(layout);
  });

  it('stands one 30.5 m stack, 3 m across, over its catalyst housing', () => {
    const stack = boundsOf(renderer.partGeometry('gas-turbine', 'gasStack')!);
    expect(stack.max.y).toBeCloseTo(GAS_STACK_HEIGHT_M, 6);
    expect(GAS_STACK_HEIGHT_M).toBe(30.5);
    expect(stack.max.x - stack.min.x).toBeGreaterThanOrEqual(2 * GAS_STACK_RADIUS_M);
    expect(stack.max.x - stack.min.x).toBeLessThan(3.6);
    expect(layout.stack.x).toBeGreaterThan(layout.catalyst.x0);
    expect(layout.stack.x).toBeLessThan(layout.catalyst.x1);
  });

  it('puts the 20 × 5 m package on a 40 × 18 m plate with the inlet house at the catalog height', () => {
    expect(layout.set.package.x1 - layout.set.package.x0).toBe(GAS_PACKAGE.w);
    expect(layout.set.package.z1 - layout.set.package.z0).toBe(GAS_PACKAGE.d);
    expect(layout.plate.x1 - layout.plate.x0).toBe(GAS_PLATE.w);
    expect(layout.plate.z1 - layout.plate.z0).toBe(GAS_PLATE.d);
    expect(GAS_INLET.h).toBe(entry.height);
    const plant = boundsOf(renderer.partGeometry('gas-turbine', 'gasPlant')!);
    expect(plant.max.y).toBeCloseTo(entry.height, 6);
  });

  it('keeps the transformer on the plate before the package, and the gate on the street', () => {
    expect(layout.transformer.z0).toBeGreaterThan(layout.set.package.z1);
    expect(layout.transformer.z1).toBeLessThanOrEqual(layout.plate.z1);
    expect(layout.drive.z1).toBe((entry.footprint.d * TILE_METERS) / 2);
    for (const r of [layout.set.package, layout.set.inlet, layout.catalyst, layout.transformer]) {
      expect(overlaps(r, layout.drive)).toBe(false);
    }
    expect(overlaps(layout.catalyst, layout.transformer)).toBe(false);
  });
});

describe('the combined-cycle station', () => {
  const entry = byId('combined-cycle');
  const layout = computeCombinedCycleLayout(entry.footprint);
  const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);

  it('is deterministic', () => {
    expect(computeCombinedCycleLayout(entry.footprint)).toEqual(layout);
  });

  it('raises a 25 × 10 m boiler to 24 m and a 40 m, 5 m wide stack from it', () => {
    expect(layout.boiler.x1 - layout.boiler.x0).toBe(CC_BOILER.w);
    expect(layout.boiler.z1 - layout.boiler.z0).toBe(CC_BOILER.d);
    expect(CC_BOILER.h).toBe(entry.height);
    const plant = boundsOf(renderer.partGeometry('combined-cycle', 'combinedPlant')!);
    expect(plant.max.y).toBeCloseTo(24, 6);
    const stack = boundsOf(renderer.partGeometry('combined-cycle', 'combinedStack')!);
    expect(stack.max.y).toBeCloseTo(CC_STACK_HEIGHT_M, 6);
    expect(CC_STACK_HEIGHT_M).toBe(40);
    expect(stack.min.y).toBeGreaterThanOrEqual(CC_BOILER.h - 0.5);
    expect(stack.max.x - stack.min.x).toBeGreaterThanOrEqual(5);
    expect(stack.max.x - stack.min.x).toBeLessThan(5.6);
    expect(layout.stack.x).toBeGreaterThan(layout.boiler.x0);
    expect(layout.stack.x).toBeLessThan(layout.boiler.x1);
  });

  it('stands a 30 × 20 × 15 m steam hall beside the boiler and a 36 × 12 × 12 m, three-cell tower behind', () => {
    expect(layout.hall.x0).toBeGreaterThanOrEqual(layout.boiler.x1);
    expect(layout.hall.x1 - layout.hall.x0).toBe(CC_HALL.w);
    expect(layout.hall.z1 - layout.hall.z0).toBe(CC_HALL.d);
    expect(layout.tower.x1 - layout.tower.x0).toBe(CC_TOWER.w);
    expect(layout.tower.z1 - layout.tower.z0).toBe(CC_TOWER.d);
    expect(layout.fans).toHaveLength(3);
    expect(layout.tower.z1).toBeLessThanOrEqual(layout.set.package.z0);
    for (const fan of layout.fans) {
      expect(fan.x).toBeGreaterThan(layout.tower.x0);
      expect(fan.x).toBeLessThan(layout.tower.x1);
    }
  });

  it('lines three transformers along the street side', () => {
    expect(layout.transformers).toHaveLength(3);
    for (const t of layout.transformers) {
      expect(t.z0).toBeGreaterThan(layout.hall.z1);
      expect(t.z0).toBeGreaterThan(layout.boiler.z1);
      expect(overlaps(t, layout.drive)).toBe(false);
    }
  });

  it('keeps every building clear of every other', () => {
    // The inlet house stands over the package's intake end, and the package runs into the boiler, by design.
    const things: Rect[] = [
      layout.set.inlet,
      layout.boiler,
      layout.hall,
      layout.tower,
      ...layout.transformers,
    ];
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        expect(overlaps(things[i]!, things[j]!)).toBe(false);
      }
      for (const other of [layout.hall, layout.tower, ...layout.transformers]) {
        expect(overlaps(layout.set.package, other)).toBe(false);
      }
    }
  });
});

describe('the nuclear station', () => {
  const entry = byId('nuclear-plant');
  const layout = computeNuclearLayout(entry.footprint);

  it('is deterministic', () => {
    expect(computeNuclearLayout(entry.footprint)).toEqual(layout);
  });

  it('draws a 40 × 30 m flat-roofed reactor building to 24 m, with no dome above it', () => {
    expect(layout.reactor.x1 - layout.reactor.x0).toBe(NUCLEAR_REACTOR.w);
    expect(layout.reactor.z1 - layout.reactor.z0).toBe(NUCLEAR_REACTOR.d);
    expect(NUCLEAR_REACTOR.h).toBe(entry.height);
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const plant = boundsOf(renderer.partGeometry('nuclear-plant', 'nuclearPlant')!);
    expect(plant.max.y).toBeCloseTo(24, 6);
    const intake = boundsOf(renderer.partGeometry('nuclear-plant', 'nuclearIntake')!);
    expect(intake.max.y).toBeLessThan(24);
    // A narrower crane hall along the long axis rises from the 19 m main roof to 24 m.
    expect(NUCLEAR_REACTOR.mainH).toBe(19);
    expect(layout.crane.x1 - layout.crane.x0).toBeLessThan(NUCLEAR_REACTOR.w);
    expect(layout.crane.z1 - layout.crane.z0).toBeLessThan(NUCLEAR_REACTOR.d);
    expect(layout.crane.x0).toBeGreaterThan(layout.reactor.x0);
    expect(layout.crane.z0).toBeGreaterThan(layout.reactor.z0);
    expect(layout.crane.z1).toBeLessThan(layout.reactor.z1);
  });

  it('stands the 40 × 20 × 15 m turbine building beside it and the switchyard on the street side', () => {
    expect(layout.turbine.x0).toBeGreaterThan(layout.reactor.x1);
    expect(layout.turbine.x1 - layout.turbine.x0).toBe(NUCLEAR_TURBINE.w);
    expect(layout.turbine.z1 - layout.turbine.z0).toBe(NUCLEAR_TURBINE.d);
    expect(layout.switchyard.z0).toBeGreaterThan(layout.reactor.z1);
    expect(layout.switchyard.z0).toBeGreaterThan(layout.turbine.z1);
    expect(layout.gantries).toHaveLength(4);
    expect(layout.transformers).toHaveLength(4);
    for (const t of layout.transformers) expect(overlaps(t, layout.drive)).toBe(false);
    for (const g of layout.gantries) expect(Math.abs(g.x) - 4).toBeGreaterThan(layout.drive.x1);
  });

  it('closes the lot in two 2.4 m fences with a 6 m clear zone between and everything inside the inner', () => {
    expect(GEN_SECURITY_FENCE_HEIGHT_M).toBe(2.4);
    expect(layout.inner.x0 - layout.outer.x0).toBe(6);
    expect(layout.outer.z1 - layout.inner.z1).toBe(6);
    for (const r of [
      layout.reactor,
      layout.turbine,
      layout.switchyard,
      layout.apron,
      ...layout.transformers,
    ]) {
      expect(r.x0).toBeGreaterThanOrEqual(layout.inner.x0);
      expect(r.x1).toBeLessThanOrEqual(layout.inner.x1);
      expect(r.z0).toBeGreaterThanOrEqual(layout.inner.z0);
      expect(r.z1).toBeLessThanOrEqual(layout.inner.z1);
    }
    expect(layout.guard.z0).toBeGreaterThan(layout.outer.z1);
  });

  const waters: readonly [
    number,
    (lot: { w: number; d: number }) => (x: number, z: number) => boolean,
  ][] = [
    [0, (lot) => (x, z) => x === 10 && z === 10 + lot.d],
    [1, (lot) => (x, z) => x === 10 + lot.w && z === 10],
    [2, () => (x, z) => x === 10 && z === 9],
    [3, () => (x, z) => x === 9 && z === 10],
  ];

  it.each(waters)(
    'puts its cooling-water intake on the edge that touches the water (side %i) at every rotation, clear of the plant',
    (facing, waterFor) => {
      for (const rotation of ROTATIONS) {
        const lot = footprintForRotation(entry, rotation);
        const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry], waterFor(lot));
        renderer.apply(add(instance(5, 'nuclear-plant', { rotation })));
        const geometry = renderer.partGeometry('nuclear-plant', 'nuclearIntake')!;
        const m = new THREE.Matrix4();
        renderer.getPartMatrix(
          'nuclear-plant',
          'nuclearIntake',
          renderer.partSlotsFor(5, 'nuclearIntake')[0]!,
          m,
        );
        const box = boundsOf(geometry).applyMatrix4(m);
        const x0 = 10 * TILE_METERS;
        const z0 = 10 * TILE_METERS;
        const x1 = x0 + lot.w * TILE_METERS;
        const z1 = z0 + lot.d * TILE_METERS;
        const gap = [z1 - box.max.z, x1 - box.max.x, box.min.z - z0, box.min.x - x0][facing]!;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(NUCLEAR_INTAKE.house.setback);
        // The house and its conduit lie inside the lot.
        expect(box.min.x).toBeGreaterThanOrEqual(x0);
        expect(box.max.x).toBeLessThanOrEqual(x1);
        expect(box.min.z).toBeGreaterThanOrEqual(z0);
        expect(box.max.z).toBeLessThanOrEqual(z1);

        const centre = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
        const intake: Rect = {
          x0: box.min.x - centre.x,
          x1: box.max.x - centre.x,
          z0: box.min.z - centre.z,
          z1: box.max.z - centre.z,
        };
        const plant: Rect[] = [
          layout.reactor,
          layout.turbine,
          layout.switchyard,
          layout.guard,
          layout.pipe,
          layout.drive,
          ...layout.transformers,
        ];
        for (const r of plant) expect(overlaps(intake, turned(r, rotation))).toBe(false);
      }
    },
  );
});
