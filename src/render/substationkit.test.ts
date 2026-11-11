import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import { TILE_METERS } from '../shared/constants';
import type { BuildingCatalogEntry, BuildingDelta, BuildingInstance } from '../shared/types';
import { BuildingState } from '../shared/types';
import {
  CONTROL_HOUSE,
  GANTRY_HEIGHT_M,
  RISER_POLE_HEIGHT_M,
  SUBSTATION_GATE,
  SUBSTATION_LOT_M,
  SUBSTATION_PARTS,
  SWITCHGEAR_CABINETS,
  TRANSFORMER,
  buildSubstationGeometry,
} from './substationkit';
import { UtilityKitRenderer } from './utilitykits';

const entry = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find(
  (e) => e.id === 'substation',
)!;
const ids = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.map((e) => e.id);
const HALF = SUBSTATION_LOT_M / 2;

function bounds(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox!;
}

describe('the substation catalog entry', () => {
  it('is appended last, so no id moved', () => {
    expect(ids[ids.length - 1]).toBe('substation');
    expect(ids.slice(-10, -1)).toEqual([
      'sports-ground',
      'airport',
      'bus-stop',
      'bus-stop-sign',
      'rail-station',
      'bus-depot',
      'bus-garage',
      'tram-depot',
      'rail-yard',
    ]);
    expect(ids.indexOf('coal-plant')).toBe(136);
    expect(ids.indexOf('nuclear-plant')).toBe(141);
    expect(ids.indexOf('rail-yard')).toBe(175);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is a 2 x 2 utility at 300 with 6 upkeep, from the first milestone, drawing and making nothing', () => {
    expect(entry).toMatchObject({
      name: 'Substation',
      category: 'utility',
      footprint: { w: 2, d: 2 },
      cost: 300,
      upkeep: 6,
      unlockMilestone: 0,
      powerUse: 0,
      waterUse: 0,
      height: 8,
    });
    expect(entry.pollution ?? 0).toBe(0);
    expect(entry.utility).toEqual({ substation: true });
    expect(entry.offStreet).toBeUndefined();
  });
});

describe('the substation kit', () => {
  it('keeps every part inside its 2 x 2 lot, with nothing below the footing or above the gantry', () => {
    expect(SUBSTATION_LOT_M).toBe(2 * TILE_METERS);
    for (const part of SUBSTATION_PARTS) {
      const b = bounds(buildSubstationGeometry(part));
      expect(b.min.x).toBeGreaterThanOrEqual(-HALF - 1e-6);
      expect(b.max.x).toBeLessThanOrEqual(HALF + 1e-6);
      expect(b.min.z).toBeGreaterThanOrEqual(-HALF - 1e-6);
      expect(b.max.z).toBeLessThanOrEqual(HALF + 1e-6);
    }
    const equipment = bounds(buildSubstationGeometry('substationEquipment'));
    // The gantry is the tallest thing, about 12 m.
    expect(equipment.max.y).toBeGreaterThan(GANTRY_HEIGHT_M - 0.2);
    expect(equipment.max.y).toBeLessThan(GANTRY_HEIGHT_M + 0.3);
    expect(RISER_POLE_HEIGHT_M).toBe(10.4);
  });

  it('puts the gate on the street side (+Z), centred, wide enough for a truck, with the fence closed beside it', () => {
    expect(SUBSTATION_GATE.z).toBeGreaterThan(0);
    expect(SUBSTATION_GATE.x0).toBe(-SUBSTATION_GATE.x1);
    expect(SUBSTATION_GATE.x1 - SUBSTATION_GATE.x0).toBeGreaterThanOrEqual(5);
    const yard = buildSubstationGeometry('substationYard');
    const pos = yard.getAttribute('position');
    let fenceBesideGate = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const near = Math.abs(pos.getZ(i) - SUBSTATION_GATE.z) < 0.06;
      if (!near || y < 0.5 || y > 2.2) continue;
      // A vertex of fence panel on the gate's line, in the gap and not on a gate post.
      if (Math.abs(pos.getX(i)) < SUBSTATION_GATE.x1 - 0.3) fenceBesideGate++;
    }
    expect(fenceBesideGate).toBe(0);
  });

  it('stands the equipment behind the gate: a transformer of about 4 x 3 x 4, the cabinets and the control house', () => {
    expect(TRANSFORMER).toMatchObject({ h: 4 });
    expect(CONTROL_HOUSE).toMatchObject({ w: 6, d: 4, h: 3 });
    expect(SWITCHGEAR_CABINETS).toBeGreaterThanOrEqual(4);
    expect(TRANSFORMER.z).toBeLessThan(SUBSTATION_GATE.z);
    expect(CONTROL_HOUSE.z + CONTROL_HOUSE.d / 2).toBeLessThan(SUBSTATION_GATE.z);
  });

  it('faces every triangle outward: the winding agrees with the normals', () => {
    for (const part of SUBSTATION_PARTS) {
      const g = buildSubstationGeometry(part);
      const pos = g.getAttribute('position');
      const normal = g.getAttribute('normal');
      const index = g.getIndex()!;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const n = new THREE.Vector3();
      let inward = 0;
      for (let t = 0; t < index.count; t += 3) {
        const [i, j, k] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, j);
        c.fromBufferAttribute(pos, k);
        const face = b.clone().sub(a).cross(c.clone().sub(a));
        if (face.lengthSq() < 1e-12) continue;
        n.fromBufferAttribute(normal, i);
        if (face.dot(n) < 0) inward++;
      }
      expect(inward).toBe(0);
    }
  });

  it('draws as instanced meshes, unmirrored at every turn, on the lot it stands on', () => {
    const scene = new THREE.Scene();
    const kits = new UtilityKitRenderer(scene, () => 0, [entry]);
    for (const rotation of [0, 1, 2, 3] as const) {
      const building: BuildingInstance = {
        id: rotation + 1,
        catalogId: 'substation',
        x: 10,
        z: 10,
        rotation,
        level: 1,
        state: BuildingState.Active,
        problems: 0,
      };
      const delta: BuildingDelta = { added: [building], removed: [], updated: [] };
      kits.apply(delta);
      for (const part of SUBSTATION_PARTS) {
        const slots = kits.partSlotsFor(building.id, part);
        expect(slots).toHaveLength(1);
        const m = new THREE.Matrix4();
        kits.getPartMatrix('substation', part, slots[0]!, m);
        expect(m.determinant()).toBeGreaterThan(0);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        // The lot's centre: its origin tile plus a half-lot, however it is turned.
        expect(p.x).toBeCloseTo(10 * TILE_METERS + HALF - 0, 6);
      }
    }
    let instanced = 0;
    scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) instanced++;
    });
    expect(instanced).toBe(SUBSTATION_PARTS.length);
  });
});
