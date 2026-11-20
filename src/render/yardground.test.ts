import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TILE_METERS, tileIndex } from '../shared/constants';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';
import { platOf, type Parcel, type PlatSource } from '../world/plat';
import { parcelWithYard, yardRowsBehind, yardTilesOf } from '../world/yard';
import type { StreetLookup } from './frontage';
import { lotToWorld, planHouseGround } from './houselot';

const ZONE = ZoneType.ResLow;

const block = (x0: number, z0: number, w: number, d: number): Array<[number, number]> => {
  const tiles: Array<[number, number]> = [];
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) tiles.push([x, z]);
  return tiles;
};

// A 7 by 7 block with a street on each side, zoned within three tiles of a street.
const streetTiles = new Set(
  [
    ...block(10, 10, 9, 1),
    ...block(10, 18, 9, 1),
    ...block(10, 10, 1, 9),
    ...block(18, 10, 1, 9),
  ].map(([x, z]) => `${x},${z}`),
);
const zoned = block(11, 11, 7, 7).filter(([x, z]) => Math.min(x - 10, 18 - x, z - 10, 18 - z) <= 3);
const src: PlatSource = (() => {
  const zone = new Uint8Array(MAP_SIZE * MAP_SIZE);
  for (const [x, z] of zoned) zone[tileIndex(x, z)] = ZONE;
  return {
    size: MAP_SIZE,
    zone,
    buildingId: new Uint32Array(MAP_SIZE * MAP_SIZE),
    landValue: new Uint8Array(MAP_SIZE * MAP_SIZE).fill(119),
    streetAt: (x, z) => streetTiles.has(`${x},${z}`),
  };
})();
const plat = platOf(src, ZONE);

const street: StreetLookup = (x, z) =>
  streetTiles.has(`${x},${z}`) ? { vergeM: 3.8, sidewalkM: 1.9 } : null;
const roadAt = (x: number, z: number): boolean => streetTiles.has(`${x},${z}`);

const entryOf = (p: Parcel): BuildingCatalogEntry => ({
  id: 'home',
  name: 'Home',
  category: 'res',
  zone: ZONE,
  kind: 'detached',
  level: 1,
  footprint: { w: p.w, d: p.d },
  height: 4,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
});

const buildingOf = (p: Parcel, id: number): BuildingInstance => ({
  id,
  catalogId: 'home',
  x: p.x,
  z: p.z,
  rotation: 0,
  level: 1,
  state: BuildingState.Active,
  problems: 0,
});

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** The ground a home lays, lot and yard, as the world rectangle its lawn is cut to. */
function groundOf(p: Parcel, id: number): Rect {
  const plan = planHouseGround(buildingOf(p, id), entryOf(p), roadAt, street, (lot) =>
    yardRowsBehind(src, plat, lot),
  )!;
  const a = lotToWorld(plan.frame, 0, 0);
  const b = lotToWorld(plan.frame, plan.edgeLenM, plan.lotDepthM);
  return {
    x0: Math.min(a.x, b.x),
    z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x),
    z1: Math.max(a.z, b.z),
  };
}

const tileRect = (p: Parcel): Rect => ({
  x0: p.x * TILE_METERS,
  z0: p.z * TILE_METERS,
  x1: (p.x + p.w) * TILE_METERS,
  z1: (p.z + p.d) * TILE_METERS,
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

describe('the ground of every home on a 7 by 7 block', () => {
  const homes = plat.parcels;

  it('has homes on all four streets, turned ones on the east and west', () => {
    expect(new Set(homes.map((p) => p.front))).toEqual(new Set(['N', 'S', 'E', 'W']));
    expect(homes.some((p) => yardTilesOf(src, plat, p).length > 0)).toBe(true);
  });

  it('is exactly the tile-aligned rectangle of its lot plus its yard, on every street side', () => {
    for (const [i, p] of homes.entries()) {
      const want = tileRect(parcelWithYard(src, plat, p));
      const got = groundOf(p, i + 1);
      expect(got, `${p.front} lot at ${p.x},${p.z}`).toEqual(want);
    }
  });

  it('never reaches a tile the lot does not own or its yard did not give it', () => {
    for (const [i, p] of homes.entries()) {
      const got = groundOf(p, i + 1);
      const own = new Set(
        [...block(p.x, p.z, p.w, p.d), ...yardTilesOf(src, plat, p).map((t) => [t.x, t.z])].map(
          ([x, z]) => `${x},${z}`,
        ),
      );
      for (let z = got.z0 / TILE_METERS; z < got.z1 / TILE_METERS; z++) {
        for (let x = got.x0 / TILE_METERS; x < got.x1 / TILE_METERS; x++) {
          expect(own.has(`${x},${z}`), `${p.front} lot at ${p.x},${p.z} covers ${x},${z}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('overlaps no other home’s ground', () => {
    const grounds = homes.map((p, i) => groundOf(p, i + 1));
    for (let a = 0; a < grounds.length; a++) {
      for (let b = a + 1; b < grounds.length; b++) {
        expect(overlaps(grounds[a]!, grounds[b]!), `${a} and ${b}`).toBe(false);
      }
    }
  });
});
