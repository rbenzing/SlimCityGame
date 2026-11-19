import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { ROOF_INSET_M, rooftopUnitCount } from './buildingkit';
import { RAILWAY_GAUGE_HALF_M } from './roadsmesh';
import {
  CEMETERY_LAWN_HEIGHT,
  CREMATORIUM_FLUE_HEIGHT_M,
  CREMATORIUM_RIDGE_M,
  CREMATORIUM_FOYER_HEIGHT_M,
  CREMATORIUM_HALL_HEIGHT_M,
  CREMATORIUM_ROOF_CAP_M,
  EDU_GYM,
  EDU_WING_STOREYS,
  HOSPITAL_BLOCK_SIZE,
  HOSPITAL_STOREYS,
  HOSPITAL_STOREY_M,
  RAIL_SHOP_DOOR,
  RAIL_SHOP_MONITOR,
  RAIL_YARD_SPEC,
  UtilityKitRenderer,
  YARD_CARS,
  computeEducationLayout,
  computeEducationRoof,
  computeHospitalLayout,
  computeHospitalRoof,
  computeRailShopRoof,
  computeYardLayout,
  educationGymRise,
  railShopDoors,
  yardFootprint,
  type Rect,
  type RoofBox,
  type UtilityKitPartKind,
} from './utilitykits';

const CATALOG = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => CATALOG.find((e) => e.id === id)!;
const flat = (): number => 0;
const ROTATIONS = [0, 1, 2, 3] as const;

const instance = (id: number, catalogId: string, rotation: 0 | 1 | 2 | 3): BuildingInstance => ({
  id,
  catalogId,
  x: 10,
  z: 10,
  rotation,
  level: 1,
  state: BuildingState.Active,
  problems: 0,
});
const add = (...buildings: BuildingInstance[]): BuildingDelta => ({
  added: buildings,
  removed: [],
  updated: [],
});

const insideRect = (b: RoofBox, r: Rect, inset = 0): boolean =>
  b.x - b.w / 2 >= r.x0 + inset - 1e-9 &&
  b.x + b.w / 2 <= r.x1 - inset + 1e-9 &&
  b.z - b.d / 2 >= r.z0 + inset - 1e-9 &&
  b.z + b.d / 2 <= r.z1 - inset + 1e-9;
const overlap = (a: RoofBox, b: RoofBox): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-9 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 1e-9;
const ofKind = (boxes: readonly RoofBox[], part: RoofBox['part']): RoofBox[] =>
  boxes.filter((b) => b.part === part);

/** Every part of a kit in the lot at all four rotations. */
function expectInsideLotAtEveryTurn(id: string, kind: UtilityKitPartKind): void {
  const entry = byId(id);
  for (const rotation of ROTATIONS) {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
    renderer.apply(add(instance(5, id, rotation)));
    const shape = footprintForRotation(entry, rotation);
    const lot = new THREE.Box3(
      new THREE.Vector3(10 * TILE_METERS, -20, 10 * TILE_METERS),
      new THREE.Vector3((10 + shape.w) * TILE_METERS, 80, (10 + shape.d) * TILE_METERS),
    );
    const geometry = renderer.partGeometry(id, kind)!;
    geometry.computeBoundingBox();
    const m = new THREE.Matrix4();
    for (const slot of renderer.partSlotsFor(5, kind)) {
      renderer.getPartMatrix(id, kind, slot, m);
      const box = geometry.boundingBox!.clone().applyMatrix4(m);
      expect(lot.containsBox(box.expandByScalar(-1e-6)), `${id} turn ${rotation}`).toBe(true);
    }
  }
}

function topOf(id: string, kind: UtilityKitPartKind): number {
  const geometry = new UtilityKitRenderer(new THREE.Scene(), flat, [byId(id)]).partGeometry(
    id,
    kind,
  )!;
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
}

describe('the hospital roof', () => {
  const entry = byId('hospital');
  const roof = computeHospitalRoof(entry.footprint);
  const { block } = computeHospitalLayout(entry.footprint);
  const { w, d } = HOSPITAL_BLOCK_SIZE;
  const roofY = HOSPITAL_STOREYS * HOSPITAL_STOREY_M;
  const plate: Rect = {
    x0: block.x - w / 2,
    x1: block.x + w / 2,
    z0: block.z - d / 2,
    z1: block.z + d / 2,
  };

  it('carries a parapet band, a penthouse, a screen with a cooling tower and a lift bulkhead', () => {
    expect(ofKind(roof, 'parapet')).toHaveLength(4);
    for (const part of ['penthouse', 'screen', 'coolingTower', 'bulkhead'] as const) {
      expect(ofKind(roof, part), part).toHaveLength(1);
    }
  });

  it('takes 30% of the plate for the penthouse, set 3 m back from the street face', () => {
    const [pent] = ofKind(roof, 'penthouse');
    expect((pent!.w * pent!.d) / (w * d)).toBeCloseTo(0.3, 9);
    expect(plate.z1 - (pent!.z + pent!.d / 2)).toBeCloseTo(3, 9);
    const [bulk] = ofKind(roof, 'bulkhead');
    expect(plate.z1 - (bulk!.z + bulk!.d / 2)).toBeCloseTo(3, 9);
  });

  it('stands the cooling tower behind its screen, from the street', () => {
    const [screen] = ofKind(roof, 'screen');
    const [tower] = ofKind(roof, 'coolingTower');
    expect(tower!.z + tower!.d / 2).toBeLessThanOrEqual(screen!.z - screen!.d / 2 + 1e-9);
    expect(tower!.x).toBeCloseTo(screen!.x, 9);
  });

  it('keeps everything on the roof, off the parapet and clear of every other part', () => {
    const plant = roof.filter((b) => b.part !== 'parapet');
    for (const b of plant) {
      expect(insideRect(b, plate, 0.3), b.part).toBe(true);
      expect(b.y).toBeCloseTo(roofY, 9);
    }
    for (let i = 0; i < plant.length; i++) {
      for (let j = i + 1; j < plant.length; j++) {
        expect(overlap(plant[i]!, plant[j]!), `${plant[i]!.part} / ${plant[j]!.part}`).toBe(false);
      }
    }
    for (const b of ofKind(roof, 'parapet')) expect(insideRect(b, plate)).toBe(true);
  });

  it('draws the penthouse over the roof and keeps every part inside the lot at four turns', () => {
    expect(topOf('hospital', 'hospitalBlock')).toBeGreaterThan(roofY + 4);
    expectInsideLotAtEveryTurn('hospital', 'hospitalBlock');
  });
});

describe.each(['school', 'middle-school', 'high-school', 'college'])('the %s roofs', (id) => {
  const entry = byId(id);
  const layout = computeEducationLayout(entry);
  const roof = computeEducationRoof(entry);
  const wings = layout.masses.filter((m) => m.floors === EDU_WING_STOREYS);
  const gym = layout.masses.find((m) => m.floors === EDU_GYM.floors);

  it('puts a parapet band and the rule’s rooftop units on every classroom wing', () => {
    for (const wing of wings) {
      const mine = roof.filter((b) => insideRect(b, wing.rect));
      expect(ofKind(mine, 'parapet'), 'parapet').toHaveLength(4);
      const plate = { w: wing.rect.x1 - wing.rect.x0, d: wing.rect.z1 - wing.rect.z0 };
      const units = ofKind(mine, 'unit');
      expect(units).toHaveLength(rooftopUnitCount({ ...plate, h: 0, yOffset: 0 }));
      for (const u of units) {
        expect(insideRect(u, wing.rect, ROOF_INSET_M), 'unit 2 m inside the parapet').toBe(true);
        expect(u.y).toBeCloseTo(wing.height, 9);
      }
    }
    expect(roof.length).toBeGreaterThan(wings.length * 4);
  });

  it('keeps the roof boxes of one wing clear of each other', () => {
    for (const wing of wings) {
      const units = ofKind(
        roof.filter((b) => insideRect(b, wing.rect)),
        'unit',
      );
      for (let i = 0; i < units.length; i++) {
        for (let j = i + 1; j < units.length; j++)
          expect(overlap(units[i]!, units[j]!)).toBe(false);
      }
    }
  });

  it('raises the gym 6.7 m clear under a roof, with no window above its clear height', () => {
    if (id === 'college') {
      // The college's layout has no gym block, so it takes none.
      expect(gym).toBeUndefined();
      return;
    }
    expect(gym).toBeDefined();
    expect(gym!.height).toBeGreaterThanOrEqual(EDU_GYM.clear + EDU_GYM.structure);
    expect(EDU_GYM.clear).toBe(6.7);
    for (const pane of layout.panes) {
      const onGym =
        pane.x >= gym!.rect.x0 - 0.2 &&
        pane.x <= gym!.rect.x1 + 0.2 &&
        pane.z >= gym!.rect.z0 - 0.2 &&
        pane.z <= gym!.rect.z1 + 0.2 &&
        pane.y > 3;
      if (onGym)
        expect(pane.y + pane.h, 'gym pane under the clear height').toBeLessThanOrEqual(6.7);
    }
  });

  it('keeps every part inside the lot at four turns', () => {
    expectInsideLotAtEveryTurn(id, 'schoolBuilding');
  });

  it('stays inside the kit triangle tier', () => {
    const scene = new THREE.Scene();
    new UtilityKitRenderer(scene, flat, [entry]).apply(add(instance(1, id, 0)));
    let triangles = 0;
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = o.geometry as THREE.BufferGeometry;
      triangles +=
        ((g.index?.count ?? g.getAttribute('position').count) / 3) *
        (o instanceof THREE.InstancedMesh ? o.count : 1);
    });
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(30000);
  });
});

describe('the gyms against the wings', () => {
  it.each(['middle-school', 'high-school'])(
    'lifts the %s gym’s ridge over its classroom wings',
    (id) => {
      const entry = byId(id);
      const gym = computeEducationLayout(entry).masses.find((m) => m.floors === EDU_GYM.floors)!;
      expect(gym.height + educationGymRise(gym.rect)).toBeGreaterThan(entry.height);
    },
  );

  it('holds the elementary multipurpose room to the same clear height, under the wings', () => {
    const entry = byId('school');
    const gym = computeEducationLayout(entry).masses.find((m) => m.floors === EDU_GYM.floors)!;
    expect(gym.height).toBeGreaterThanOrEqual(6.7);
    expect(gym.height + educationGymRise(gym.rect)).toBeLessThan(entry.height);
  });
});

describe('the rail yard shop', () => {
  const entry = byId('rail-yard');
  const layout = computeYardLayout(yardFootprint(entry), RAIL_YARD_SPEC, false, YARD_CARS.rail);
  const doors = railShopDoors(layout);
  const roof = computeRailShopRoof(layout, entry.height);

  it('opens a 4.6 m door, 5.5 m high, on each track that enters the shop', () => {
    expect(layout.hallRoads).toHaveLength(2);
    expect(doors).toHaveLength(layout.hallRoads.length);
    doors.forEach((door, i) => {
      expect(door.w).toBe(RAIL_SHOP_DOOR.w);
      expect(door.w).toBe(4.6);
      expect(door.h).toBe(5.5);
      expect(door.h).toBeLessThan(entry.height);
      expect(door.z).toBeCloseTo(layout.hallRoads[i]!.z0, 9);
      expect(door.x).toBeCloseTo(layout.hall.x0, 9);
      expect(door.z - door.w / 2).toBeGreaterThanOrEqual(layout.hall.z0);
      expect(door.z + door.w / 2).toBeLessThanOrEqual(layout.hall.z1);
    });
    expect(doors[1]!.z - doors[0]!.z).toBeGreaterThanOrEqual(RAIL_SHOP_DOOR.w);
  });

  it('centres each door on the rails the track mesh draws', () => {
    const track = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]).partGeometry(
      'rail-yard',
      'railYardTrack',
    )!;
    const position = track.getAttribute('position');
    for (const door of doors) {
      for (const side of [-1, 1]) {
        const rail = door.z + side * RAILWAY_GAUGE_HALF_M;
        // A rail is one box along the road, so its ends are its vertices: the door stands between them.
        const ends = Array.from({ length: position.count }, (_, i) => i)
          .filter((i) => Math.abs(position.getZ(i) - rail) < 0.1)
          .map((i) => position.getX(i));
        expect(ends.length, `a rail at ${rail.toFixed(2)} behind the door`).toBeGreaterThan(0);
        expect(Math.min(...ends)).toBeLessThan(door.x - 1);
        expect(Math.max(...ends)).toBeGreaterThan(door.x + 1);
      }
    }
  });

  it('carries a ridge monitor along the roof and two rooftop units, all on the roof', () => {
    const [monitor] = ofKind(roof, 'monitor');
    expect(ofKind(roof, 'monitor')).toHaveLength(1);
    expect(monitor!.w).toBeGreaterThan(monitor!.d);
    expect(monitor!.d).toBe(RAIL_SHOP_MONITOR.w);
    expect(monitor!.x).toBeCloseTo((layout.hall.x0 + layout.hall.x1) / 2, 9);
    const units = ofKind(roof, 'unit');
    expect(units).toHaveLength(2);
    for (const b of roof) {
      expect(insideRect(b, layout.hall), b.part).toBe(true);
      expect(b.y).toBeGreaterThanOrEqual(entry.height - 1e-9);
    }
    for (const u of units) {
      expect(insideRect(u, layout.hall, ROOF_INSET_M), 'unit 2 m inside the edge').toBe(true);
      expect(overlap(u, monitor!)).toBe(false);
    }
  });

  it('draws the monitor over the hall and the shop inside the lot at four turns', () => {
    expect(topOf('rail-yard', 'railYardShop')).toBeGreaterThanOrEqual(
      entry.height + RAIL_SHOP_MONITOR.h - 1e-6,
    );
    expectInsideLotAtEveryTurn('rail-yard', 'railYardShop');
  });

  it('leaves the tram depot’s shop as it was, without a monitor', () => {
    const tram = byId('tram-depot');
    expect(topOf('tram-depot', 'tramDepotShop')).toBeLessThanOrEqual(tram.height + 1e-6);
  });
});

describe('the crematorium stack', () => {
  it('clears the highest roof of the building by 1.2 m (4 ft) at least', () => {
    const roofs = [
      CREMATORIUM_RIDGE_M,
      CREMATORIUM_HALL_HEIGHT_M + CREMATORIUM_ROOF_CAP_M,
      CREMATORIUM_FOYER_HEIGHT_M + 2,
    ];
    expect(CREMATORIUM_FLUE_HEIGHT_M - Math.max(...roofs)).toBeGreaterThanOrEqual(1.2 - 1e-9);
    const top = topOf('crematorium', 'crematoriumFlue') - CEMETERY_LAWN_HEIGHT;
    const building = topOf('crematorium', 'crematoriumBuilding') - CEMETERY_LAWN_HEIGHT;
    expect(top - building).toBeGreaterThanOrEqual(1.2 - 1e-9);
  });
});
