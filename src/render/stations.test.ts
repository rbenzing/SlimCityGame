import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  RECYCLING_YARD_HEIGHT,
  STATION_BAY_DOOR,
  STATION_BAY_PITCH_M,
  STATION_SALLY_DOOR,
  STATION_TOWER,
  UtilityKitRenderer,
  computeStationLayout,
  footprintHalfExtents,
  type Rect,
  type StationLayout,
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
const STATION_IDS = [
  'fire-station',
  'fire-station-district',
  'police-station',
  'police-station-district',
] as const;
const FIRE_IDS = ['fire-station', 'fire-station-district'] as const;
const flat = (): number => 0;
const FOOT_M = 0.3048;

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

const kinds: UtilityKitPartKind[] = [
  'stationYard',
  'stationBuilding',
  'stationLit',
  'stationMast',
  'stationApparatus',
  'stationCar',
];

const stallRect = (s: { x: number; z: number }): Rect => ({
  x0: s.x - (9 * FOOT_M) / 2,
  x1: s.x + (9 * FOOT_M) / 2,
  z0: s.z - (18 * FOOT_M) / 2,
  z1: s.z + (18 * FOOT_M) / 2,
});

describe.each(STATION_IDS)('the %s layout', (id) => {
  const entry = byId(id);
  const layout = computeStationLayout(entry);
  const { halfW, halfD } = footprintHalfExtents(entry.footprint);
  const lot: Rect = { x0: -halfW, x1: halfW, z0: -halfD, z1: halfD };

  it('keeps the building, the paving and every stall inside the lot', () => {
    const inside = (r: Rect): boolean =>
      r.x0 >= lot.x0 - 1e-9 &&
      r.x1 <= lot.x1 + 1e-9 &&
      r.z0 >= lot.z0 - 1e-9 &&
      r.z1 <= lot.z1 + 1e-9;
    expect(inside(layout.plate)).toBe(true);
    for (const p of layout.paving) expect(inside(p)).toBe(true);
    for (const s of layout.stalls) expect(inside(stallRect(s))).toBe(true);
    if (layout.tower) expect(inside(layout.tower)).toBe(true);
  });

  it('keeps stalls clear of the building, of each other and of the concrete before the doors', () => {
    const stalls = layout.stalls.map(stallRect);
    for (let i = 0; i < stalls.length; i++) {
      expect(overlaps(stalls[i]!, layout.plate)).toBe(false);
      for (const p of layout.paving) expect(overlaps(stalls[i]!, p)).toBe(false);
      for (let j = i + 1; j < stalls.length; j++)
        expect(overlaps(stalls[i]!, stalls[j]!)).toBe(false);
    }
  });

  it('draws to the catalog height, in whole storeys', () => {
    expect(layout.height).toBe(entry.height);
    expect(layout.height / 3.2).toBeCloseTo(Math.round(layout.height / 3.2), 9);
  });

  it('parks its appliances on the concrete in front of the doors, clear of the building', () => {
    const [vw, , vl] = sizeForKind(
      layout.service === 'fire' ? VehicleKind.Fire : VehicleKind.Police,
    );
    expect(layout.apparatus).toHaveLength(id.includes('district') ? 2 : 1);
    for (const spot of layout.apparatus) {
      const body: Rect = {
        x0: spot.x - vw / 2,
        x1: spot.x + vw / 2,
        z0: spot.z - vl / 2,
        z1: spot.z + vl / 2,
      };
      expect(overlaps(body, layout.plate)).toBe(false);
      expect(layout.paving.some((p) => p.x0 <= body.x0 && p.x1 >= body.x1 && p.z1 >= body.z1)).toBe(
        true,
      );
    }
  });

  it('is deterministic', () => {
    expect(computeStationLayout(entry)).toEqual(layout);
  });
});

describe.each(FIRE_IDS)('the %s bays', (id) => {
  const entry = byId(id);
  const layout: StationLayout = computeStationLayout(entry);
  const fireHeight = sizeForKind(VehicleKind.Fire)[1];

  it('has two bays on the first rung and three on the district one, 18 ft apart', () => {
    expect(layout.bayDoors).toHaveLength(id === 'fire-station' ? 2 : 3);
    expect(STATION_BAY_PITCH_M).toBeCloseTo(18 * FOOT_M, 9);
    layout.bayDoors.forEach((door, i) => {
      if (i > 0) expect(door.x - layout.bayDoors[i - 1]!.x).toBeCloseTo(STATION_BAY_PITCH_M, 9);
    });
  });

  it('opens each bay by a door at least 14 ft wide and 14 ft high, taller than the engine', () => {
    for (const door of layout.bayDoors) {
      expect(door.h).toBeGreaterThanOrEqual(14 * FOOT_M);
      expect(door.w).toBeGreaterThanOrEqual(14 * FOOT_M);
      expect(door.h).toBeGreaterThanOrEqual(4.27);
      expect(door.h).toBeGreaterThan(fireHeight);
      expect(door.w).toBeGreaterThan(sizeForKind(VehicleKind.Fire)[0]);
      expect(door.w).toBeLessThan(STATION_BAY_PITCH_M);
    }
    expect(STATION_BAY_DOOR.h).toBeGreaterThan(fireHeight);
  });

  it('leaves an apron before the doors the length of the engine and more', () => {
    const { halfD } = footprintHalfExtents(entry.footprint);
    const apron = halfD - layout.plate.z1;
    // 18.3 m for the first rung (civic-massing.md), 50 ft for the district one (Fire Engineering).
    expect(apron).toBeGreaterThanOrEqual(id === 'fire-station' ? 18.3 : 50 * FOOT_M);
    expect(apron).toBeGreaterThan(sizeForKind(VehicleKind.Fire)[2]);
  });

  it('draws the leaf of each door to its height, in a frame wider than it', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const geometry = renderer.partGeometry(id, 'stationBuilding')!;
    const position = geometry.getAttribute('position');
    const door = layout.bayDoors[0]!;
    let leafTop = false;
    let frameLeft = false;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const x = position.getX(i);
      if (
        Math.abs(y - (RECYCLING_YARD_HEIGHT + door.h)) < 1e-4 &&
        Math.abs(x - (door.x - door.w / 2)) < 1e-4
      ) {
        leafTop = true;
      }
      if (Math.abs(x - (door.x - door.w / 2 - 0.35)) < 1e-4) frameLeft = true;
    }
    expect(leafTop).toBe(true);
    expect(frameLeft).toBe(true);
  });
});

describe('the police stations', () => {
  it('have an entrance and a sally port taller than a patrol car and wide enough for one', () => {
    for (const id of ['police-station', 'police-station-district'] as const) {
      const layout = computeStationLayout(byId(id));
      const [pw, ph] = sizeForKind(VehicleKind.Police);
      expect(layout.bayDoors).toHaveLength(0);
      expect(layout.sallyPort).not.toBeNull();
      expect(layout.sallyPort!.h).toBeGreaterThan(ph);
      expect(layout.sallyPort!.w).toBeGreaterThan(pw);
      expect(layout.sallyPort!.h).toBeCloseTo(STATION_SALLY_DOOR.h, 9);
      expect(layout.entrance.x).toBeCloseTo((layout.plate.x0 + layout.plate.x1) / 2, 9);
      expect(layout.pole).not.toBeNull();
    }
  });

  it('keep the building on the back of the lot with its car park before it', () => {
    const district = computeStationLayout(byId('police-station-district'));
    expect(district.stalls.length).toBeGreaterThan(
      computeStationLayout(byId('police-station')).stalls.length,
    );
    for (const s of district.stalls) expect(s.z).toBeGreaterThan(district.plate.z1);
  });
});

describe('the district fire station', () => {
  it('stands a hose tower four storeys high inside its plate, which the first rung does not have', () => {
    const district = computeStationLayout(byId('fire-station-district'));
    expect(district.tower).not.toBeNull();
    expect(STATION_TOWER.height / 3.2).toBe(4);
    expect(computeStationLayout(byId('fire-station')).tower).toBeNull();
  });

  it('holds the staff stalls of two shifts of nine on duty', () => {
    expect(computeStationLayout(byId('fire-station-district')).stalls).toHaveLength(18);
    expect(computeStationLayout(byId('fire-station')).stalls).toHaveLength(5);
  });
});

describe.each(STATION_IDS)('the %s kit', (id) => {
  const entry = byId(id);

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
      expect(renderer.partSlotsFor(5, 'stationYard')).toHaveLength(1);
      expect(renderer.partSlotsFor(5, 'stationApparatus')).toHaveLength(
        computeStationLayout(entry).apparatus.length,
      );
    }
  });

  it('draws the building to the catalog height on the paved lot', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    const building = renderer.partGeometry(id, 'stationBuilding')!;
    building.computeBoundingBox();
    expect(building.boundingBox!.max.y).toBeCloseTo(RECYCLING_YARD_HEIGHT + entry.height, 5);
    expect(building.boundingBox!.min.y).toBeCloseTo(RECYCLING_YARD_HEIGHT, 5);
  });

  it('stands on the highest ground under its lot, so a slope never shows through', () => {
    const slope = (x: number, z: number): number => 0.04 * x + 0.02 * z;
    const renderer = new UtilityKitRenderer(new THREE.Scene(), slope, [entry]);
    renderer.apply(add(instance(2, id, { x: 3, z: 4 })));
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(
      id,
      'stationBuilding',
      renderer.partSlotsFor(2, 'stationBuilding')[0]!,
      m,
    );
    const lot = footprintForRotation(entry, 0);
    expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeCloseTo(
      slope((3 + lot.w) * TILE_METERS, (4 + lot.d) * TILE_METERS),
      5,
    );
  });

  it('frees every slot of a removed station', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    renderer.apply(add(instance(1, id), instance(2, id, { x: 40, z: 40 })));
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
    expect(renderer.partSlotsFor(2, 'stationBuilding')).toHaveLength(1);
  });

  it('lights its panes at night and leaves the rest of the kit unlit', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    expect(renderer.stationLightIntensity()).toBe(0);
    renderer.setNightFactor(1);
    expect(renderer.stationLightIntensity()).toBe(1);
    expect(renderer.partEmissiveHex(id, 'stationLit')).not.toBe(0);
    expect(renderer.partEmissiveHex(id, 'stationBuilding')).toBe(0);
    expect(renderer.partEmissiveHex(id, 'stationYard')).toBe(0);
    renderer.setNightFactor(0.25);
    expect(renderer.stationLightIntensity()).toBeCloseTo(0.25, 9);
  });
});
