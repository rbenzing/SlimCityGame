import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { ZoneType } from '../shared/types';
import { platOf, type Parcel, type PlatSource } from './plat';
import {
  parcelWithYard as yardParcel,
  yardRowsBehind as yardRows,
  yardTilesOf as yardTiles,
  type YardLot,
  type YardSource,
} from './yard';

const ZONE = ZoneType.ResLow;

/** A world with the streets and zoned tiles it is told of, and land worth `value` everywhere. */
function world(opts: {
  streets: Array<[number, number]>;
  zoned: Array<[number, number]>;
  value?: number;
  built?: Array<[number, number, number]>;
  zone?: number;
}): PlatSource {
  const zone = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const buildingId = new Uint32Array(MAP_SIZE * MAP_SIZE);
  const landValue = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(opts.value ?? 119);
  const streets = new Set(opts.streets.map(([x, z]) => `${x},${z}`));
  for (const [x, z] of opts.zoned) zone[tileIndex(x, z)] = opts.zone ?? ZONE;
  for (const [x, z, id] of opts.built ?? []) buildingId[tileIndex(x, z)] = id;
  return {
    size: MAP_SIZE,
    zone,
    buildingId,
    landValue,
    streetAt: (x, z) => streets.has(`${x},${z}`),
  };
}

const block = (x0: number, z0: number, w: number, d: number): Array<[number, number]> => {
  const tiles: Array<[number, number]> = [];
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) tiles.push([x, z]);
  return tiles;
};

const key = (t: { x: number; z: number }): string => `${t.x},${t.z}`;

// The yards as the plat of the world as it stands reads them.
const yardRowsBehind = (src: PlatSource, lot: YardLot): number =>
  yardRows(src, platOf(src, ZONE), lot);
const yardTilesOf = (src: PlatSource, lot: YardLot): ReturnType<typeof yardTiles> =>
  yardTiles(src, platOf(src, ZONE), lot);
const parcelWithYard = (src: PlatSource, lot: Parcel): Parcel =>
  yardParcel(src, platOf(src, ZONE), lot);

/** A street along z = 10 and ResLow zoned three deep south of it, at land worth `value`. */
const southOfStreet = (value: number): PlatSource =>
  world({ streets: block(10, 10, 12, 1), zoned: block(10, 11, 12, 3), value });

describe('the yard behind a platted lot', () => {
  it('is rows two and three behind a half lot', () => {
    const src = southOfStreet(10);
    const lot = platOf(src, ZONE).parcels.find((p) => p.x === 14)!;
    expect(lot).toMatchObject({ lot: 'half', z: 11, d: 1 });
    expect(yardTilesOf(src, lot).map(key)).toEqual(['14,12', '14,13']);
  });

  it('is row three behind a normal lot', () => {
    const src = southOfStreet(119);
    const lot = platOf(src, ZONE).parcels.find((p) => p.x === 14)!;
    expect(lot).toMatchObject({ lot: 'normal', z: 11, d: 2 });
    expect(yardTilesOf(src, lot).map(key)).toEqual(['14,13']);
  });

  it('is row three behind a double lot', () => {
    const src = southOfStreet(180);
    const lot = platOf(src, ZONE).parcels.find((p) => p.lot === 'double')!;
    expect(yardRowsBehind(src, lot)).toBe(1);
    expect(yardTilesOf(src, lot)).toHaveLength(2);
  });

  it('is none behind an estate or an acre, which reach the zoning depth themselves', () => {
    const src = southOfStreet(240);
    const parcels = platOf(src, ZONE).parcels;
    expect(parcels.some((p) => p.lot === 'acre' || p.lot === 'estate')).toBe(true);
    for (const p of parcels) expect(yardTilesOf(src, p)).toEqual([]);
  });

  it('runs out from the street whichever side the street is on', () => {
    for (const [streets, zoned, front, tile] of [
      [block(10, 10, 1, 12), block(11, 10, 3, 12), 'W', '13,14'],
      [block(14, 10, 1, 12), block(11, 10, 3, 12), 'E', '11,14'],
      [block(10, 20, 12, 1), block(10, 17, 12, 3), 'S', '14,17'],
    ] as const) {
      const src = world({ streets: [...streets], zoned: [...zoned], value: 10 });
      const lot = platOf(src, ZONE).parcels.find(
        (p) => p.front === front && (front === 'S' ? p.x === 14 : p.z === 14),
      )!;
      expect(lot.lot).toBe('half');
      const tiles = yardTilesOf(src, lot).map(key);
      expect(tiles).toHaveLength(2);
      expect(tiles).toContain(tile);
    }
  });

  it('keeps to zoned, free ground: an unzoned or built tile ends the yard', () => {
    const unzoned = world({
      streets: block(10, 10, 12, 1),
      zoned: [...block(10, 11, 12, 2), ...block(10, 13, 5, 1)],
      value: 10,
    });
    const lot = (src: PlatSource, x: number): Parcel =>
      platOf(src, ZONE).parcels.find((p) => p.x === x)!;
    expect(yardRowsBehind(unzoned, lot(unzoned, 12))).toBe(2);
    expect(yardRowsBehind(unzoned, lot(unzoned, 18))).toBe(1);
    const built = world({
      streets: block(10, 10, 12, 1),
      zoned: block(10, 11, 12, 3),
      value: 10,
      built: [[12, 12, 9]],
    });
    expect(yardRowsBehind(built, lot(built, 12))).toBe(0);
    expect(yardRowsBehind(built, lot(built, 13))).toBe(2);
  });

  it('is none in a zone that is not low-density housing', () => {
    const src = world({
      streets: block(10, 10, 12, 1),
      zoned: block(10, 11, 12, 3),
      zone: ZoneType.ResMedium,
    });
    const lot = platOf(src, ZoneType.ResMedium).parcels[0]!;
    expect(yardTilesOf(src, lot)).toEqual([]);
  });

  it('gives the middle row between two streets to the lot whose street is first in map order on a tie', () => {
    // Two streets four rows apart: the lots take rows 11 and 13, and row 12 is two from both streets.
    const streets = [...block(10, 10, 12, 1), ...block(10, 14, 12, 1)];
    const src = world({ streets, zoned: block(10, 11, 12, 3), value: 10 });
    const parcels = platOf(src, ZONE).parcels;
    const north = parcels.find((p) => p.front === 'N' && p.x === 14)!;
    const south = parcels.find((p) => p.front === 'S' && p.x === 14)!;
    expect(yardTilesOf(src, north).map(key)).toEqual(['14,12']);
    expect(yardTilesOf(src, south)).toEqual([]);
  });

  it('gives a tile to the lot whose street is nearer', () => {
    // Five rows between the streets: row 13 is three from the north street and two from the south.
    const streets = [...block(10, 10, 12, 1), ...block(10, 15, 12, 1)];
    const src = world({ streets, zoned: block(10, 11, 12, 4), value: 10 });
    const parcels = platOf(src, ZONE).parcels;
    const north = parcels.find((p) => p.front === 'N' && p.x === 14)!;
    const south = parcels.find((p) => p.front === 'S' && p.x === 14)!;
    expect(yardTilesOf(src, north).map(key)).toEqual(['14,12']);
    expect(yardTilesOf(src, south).map(key)).toEqual(['14,13']);
  });

  it('keeps a back-to-back block to the rows only one street reaches', () => {
    // Six rows between the streets: each street's lots and yard fill its own three rows.
    const streets = [...block(10, 10, 12, 1), ...block(10, 17, 12, 1)];
    const src = world({ streets, zoned: block(10, 11, 12, 6), value: 10 });
    const near = platOf(src, ZONE).parcels.find((p) => p.front === 'N' && p.x === 14)!;
    expect(yardTilesOf(src, near).map(key)).toEqual(['14,12', '14,13']);
    const far = platOf(src, ZONE).parcels.find((p) => p.front === 'S' && p.x === 14)!;
    expect(yardTilesOf(src, far).map(key)).toEqual(['14,15', '14,14']);
  });

  it('leaves a tile a cross street’s lot will grow on to that lot, and yards only what no lot starts on', () => {
    const streets = [...block(10, 10, 12, 1), ...block(14, 11, 1, 6)];
    const src = world({
      streets,
      zoned: [...block(10, 11, 4, 3), ...block(15, 11, 6, 3)],
      value: 10,
    });
    const plat = platOf(src, ZONE);
    const lot = (x: number): Parcel => plat.parcels.find((p) => p.x === x && p.z === 11)!;
    // Beside the cross street the lots along it cover (13,12) and (13,13); the tiles west of them are the yard.
    expect(plat.parcelAt[tileIndex(13, 12)]).toBeGreaterThanOrEqual(0);
    expect(yardTilesOf(src, lot(11)).map(key)).toEqual(['11,12', '11,13']);
    expect(yardTilesOf(src, lot(13)).map(key)).toEqual([]);
    expect(yardTilesOf(src, lot(20)).map(key)).toEqual(['20,12', '20,13']);
  });

  it('shrinks when the plat later claims a yard tile for a new parcel', () => {
    const src = world({ streets: block(10, 10, 12, 1), zoned: block(10, 11, 12, 3), value: 10 });
    const lot = platOf(src, ZONE).parcels.find((p) => p.x === 14)!;
    expect(yardRowsBehind(src, lot)).toBe(2);
    // A cross street cut beside the lot's column puts parcels on row 12 and 13 tiles.
    const cut = world({
      streets: [...block(10, 10, 12, 1), ...block(15, 11, 1, 3)],
      zoned: block(10, 11, 12, 3),
      value: 10,
    });
    const next = platOf(cut, ZONE).parcels.find((p) => p.x === 14 && p.z === 11)!;
    expect(yardRowsBehind(cut, next)).toBe(0);
  });

  it('is never in two yards and never in a parcel of the plat', () => {
    const streets = [
      ...block(10, 10, 20, 1),
      ...block(10, 18, 20, 1),
      ...block(30, 10, 1, 9),
      ...block(9, 10, 1, 9),
    ];
    const zoned = [...block(10, 11, 20, 3), ...block(10, 15, 20, 3), ...block(31, 10, 3, 9)];
    for (const value of [10, 119, 180, 240]) {
      const src = world({ streets, zoned, value });
      const plat = platOf(src, ZONE);
      const seen = new Map<string, number>();
      plat.parcels.forEach((p, n) => {
        for (const t of yardTilesOf(src, p)) {
          expect(plat.parcelAt[tileIndex(t.x, t.z)]).toBe(-1);
          expect(seen.has(key(t))).toBe(false);
          seen.set(key(t), n);
        }
      });
    }
  });
});

describe('a 7 by 7 block with a street on each side', () => {
  // Streets at 10 and 18 both ways, zoned within three tiles of a street, on land that plats normal lots.
  const streets = [
    ...block(10, 10, 9, 1),
    ...block(10, 18, 9, 1),
    ...block(10, 10, 1, 9),
    ...block(18, 10, 1, 9),
  ];
  const zoned = block(11, 11, 7, 7).filter(
    ([x, z]) => Math.min(x - 10, 18 - x, z - 10, 18 - z) <= 3,
  );

  it('leaves no zoned tile that is in no home, no parcel and no yard', () => {
    const src = world({ streets, zoned, value: 119 });
    const plat = platOf(src, ZONE);
    const yards = new Set(plat.parcels.flatMap((p) => yardTilesOf(src, p)).map(key));
    const dead = zoned.filter(
      ([x, z]) => plat.parcelAt[tileIndex(x, z)] === -1 && !yards.has(`${x},${z}`),
    );
    expect(zoned).toHaveLength(48);
    expect(dead).toEqual([]);
    expect(yards.size).toBe(8);
  });

  it('leaves none dead with every lot built either', () => {
    const empty = world({ streets, zoned, value: 119 });
    const lots = platOf(empty, ZONE).parcels;
    const built = world({
      streets,
      zoned,
      value: 119,
      built: lots.flatMap((p, n) =>
        block(p.x, p.z, p.w, p.d).map(([x, z]): [number, number, number] => [x, z, n + 1]),
      ),
    });
    const plat = platOf(built, ZONE);
    const yards = new Set(lots.flatMap((p) => yardTilesOf(built, p)).map(key));
    const dead = zoned.filter(
      ([x, z]) =>
        !built.buildingId[tileIndex(x, z)] &&
        plat.parcelAt[tileIndex(x, z)] === -1 &&
        !yards.has(`${x},${z}`),
    );
    expect(dead).toEqual([]);
  });
});

describe('the lens parcel with its yard', () => {
  it('covers the lot and its yard, and stays the lot where there is no yard', () => {
    const src = southOfStreet(10);
    const lot = platOf(src, ZONE).parcels.find((p) => p.x === 14)!;
    expect(parcelWithYard(src, lot)).toMatchObject({ x: 14, z: 11, w: 1, d: 3, lot: 'half' });
    const far = world({ streets: block(10, 20, 12, 1), zoned: block(10, 17, 12, 3), value: 10 });
    const south = platOf(far, ZONE).parcels.find((p) => p.x === 14)!;
    expect(parcelWithYard(far, south)).toMatchObject({ x: 14, z: 17, w: 1, d: 3, front: 'S' });
    const estate = southOfStreet(240);
    const big = platOf(estate, ZONE).parcels[0]!;
    expect(parcelWithYard(estate, big)).toEqual(big);
  });

  it('reads only the layers of a yard source', () => {
    const src: YardSource = southOfStreet(10);
    expect(yardRowsBehind(src, { x: 14, z: 11, w: 1, d: 1, front: 'N' })).toBe(2);
  });
});
