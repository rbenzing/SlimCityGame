import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { Side } from '../shared/roadedge';
import {
  BuildingState,
  type BuildingCatalogEntry,
  type BuildingDelta,
  type BuildingInstance,
} from '../shared/types';
import { BuildingInstancer } from './buildings';
import { faceStreet, faceStreets, isPlainGrownBody } from './frontfacing';
import type { StreetLookup } from './frontage';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const MIXED = byId('mixed-2');
const CATALOG_BY_ID = new Map(catalog.map((e) => [e.id, e]));
const STREET_TILE = { vergeM: 2.5, sidewalkM: 3 };

/** A 2x2 at (10, 10): its neighbours on each side are the tiles on rows/columns 9 and 12. */
const X0 = 10;
const Z0 = 10;
const streetOn = (side: Side): StreetLookup => {
  const tiles = (tx: number, tz: number): boolean =>
    side === 'N'
      ? tz === Z0 - 1 && tx >= X0 && tx < X0 + 2
      : side === 'S'
        ? tz === Z0 + 2 && tx >= X0 && tx < X0 + 2
        : side === 'W'
          ? tx === X0 - 1 && tz >= Z0 && tz < Z0 + 2
          : tx === X0 + 2 && tz >= Z0 && tz < Z0 + 2;
  return (tx, tz) => (tiles(tx, tz) ? STREET_TILE : null);
};
const TOWARD: Record<Side, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

const building = (over: Partial<BuildingInstance> = {}): BuildingInstance =>
  ({
    id: 1,
    catalogId: 'mixed-2',
    x: X0,
    z: Z0,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  }) as BuildingInstance;

const deltaOf = (...added: BuildingInstance[]): BuildingDelta => ({
  added,
  removed: [],
  updated: [],
});

/** Where the door face of the drawn body points, read back from its instance matrix. */
function doorOf(delta: BuildingDelta, entry: BuildingCatalogEntry): THREE.Vector3 {
  const instancer = new BuildingInstancer(new THREE.Scene(), [entry], () => 0);
  instancer.apply(delta);
  const mesh = instancer.getPickables()[0]!.mesh;
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  mesh.getMatrixAt(0, m);
  m.decompose(new THREE.Vector3(), quat, new THREE.Vector3());
  return new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
}

describe('which bodies are plain', () => {
  it('names mixed-use alone among the grown kinds, and no placed or kit-owned building', () => {
    const plain = catalog.filter(isPlainGrownBody).map((e) => e.id);
    expect(plain.sort()).toEqual(['mixed-1', 'mixed-1-lot2x2', 'mixed-2', 'mixed-3']);
    expect(isPlainGrownBody({ ...MIXED, zone: undefined })).toBe(false);
  });
});

describe('a grown plain building turned to its street', () => {
  it.each([
    [0, 'N'],
    [0, 'S'],
    [0, 'E'],
    [0, 'W'],
    [1, 'N'],
    [1, 'S'],
    [1, 'E'],
    [1, 'W'],
  ] as const)(
    'at stored rotation %i with its street on %s shows its door to the street',
    (rotation, side) => {
      const drawn = faceStreets(deltaOf(building({ rotation })), CATALOG_BY_ID, streetOn(side));
      const door = doorOf(drawn, MIXED);
      const [x, z] = expectedDoor(rotation, side);
      expect(door.x).toBeCloseTo(x, 6);
      expect(door.z).toBeCloseTo(z, 6);
    },
  );

  it('leaves the yaw alone when the street is on a side-on edge', () => {
    for (const side of ['E', 'W'] as const) {
      expect(faceStreet(MIXED, building({ rotation: 0 }), streetOn(side)).rotation).toBe(0);
    }
    for (const side of ['N', 'S'] as const) {
      expect(faceStreet(MIXED, building({ rotation: 1 }), streetOn(side)).rotation).toBe(1);
    }
  });

  it('turns half a turn only when the street is behind the door', () => {
    expect(faceStreet(MIXED, building({ rotation: 0 }), streetOn('N')).rotation).toBe(2);
    expect(faceStreet(MIXED, building({ rotation: 1 }), streetOn('W')).rotation).toBe(3);
    expect(faceStreet(MIXED, building({ rotation: 0 }), streetOn('S')).rotation).toBe(0);
  });

  it('keeps a placed plain building exactly at its stored rotation', () => {
    const placed: BuildingCatalogEntry = { ...MIXED, id: 'placed-box', zone: undefined };
    const b = building({ catalogId: 'placed-box', rotation: 0 });
    expect(faceStreet(placed, b, streetOn('N'))).toBe(b);
  });

  it('leaves a kit-owned building, a framed parcel and a lot with no street alone', () => {
    const shopEntry = catalog.find((e) => e.kind === 'shop')!;
    const shop = building({ catalogId: shopEntry.id });
    expect(faceStreet(shopEntry, shop, streetOn('N'))).toBe(shop);
    const framed = building({ frame: {} as never });
    expect(faceStreet(MIXED, framed, streetOn('N'))).toBe(framed);
    const lone = building();
    expect(faceStreet(MIXED, lone, () => null)).toBe(lone);
  });

  it('turns the door at the next street change, when a street is added later', () => {
    const b = building({ rotation: 0 });
    const instancer = new BuildingInstancer(new THREE.Scene(), [MIXED], () => 0);
    let street: StreetLookup = () => null;
    const apply = (delta: BuildingDelta): void =>
      instancer.apply(faceStreets(delta, CATALOG_BY_ID, street));
    apply(deltaOf(b));
    const read = (): THREE.Vector3 => {
      const m = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      instancer.getPickables()[0]!.mesh.getMatrixAt(0, m);
      m.decompose(new THREE.Vector3(), quat, new THREE.Vector3());
      return new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    };
    expect(read().z).toBeCloseTo(1, 6);
    street = streetOn('N');
    // The building is delivered again when the road beside it is redrawn.
    apply({ added: [], removed: [], updated: [b] });
    expect(read().z).toBeCloseTo(-1, 6);
  });

  it('asks the street once per building a delta carries, and never for one it does not', () => {
    let asks = 0;
    const counting: StreetLookup = (tx, tz) => {
      asks += 1;
      return streetOn('N')(tx, tz);
    };
    faceStreets(deltaOf(building()), CATALOG_BY_ID, counting);
    const perBuilding = asks;
    expect(perBuilding).toBeGreaterThan(0);
    faceStreets({ added: [], removed: [1, 2, 3], updated: [] }, CATALOG_BY_ID, counting);
    expect(asks).toBe(perBuilding);
    faceStreets(deltaOf(building({ id: 2 }), building({ id: 3 })), CATALOG_BY_ID, counting);
    expect(asks).toBe(perBuilding * 3);
  });
});

/** The map direction the door points: the stored rotation's front, or the street when it is behind it (a side-on street leaves it). */
function expectedDoor(rotation: 0 | 1, side: Side): [number, number] {
  const front: Side = rotation === 0 ? 'S' : 'E';
  const behind: Record<Side, Side> = { N: 'S', E: 'W', S: 'N', W: 'E' };
  return TOWARD[behind[front] === side ? side : front];
}
