import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { ZoneType } from '../shared/types';
import { platOf, type Parcel, type PlatSource } from './plat';
import { parcelWithYard, yardRowsBehind, yardTilesOf, type YardSource } from './yard';

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

  it('never takes a tile another street reaches', () => {
    // Two streets four rows apart: rows 11..13 are zoned between them, and the far street's lots
    // reach back two tiles from row 13.
    const streets = [...block(10, 10, 12, 1), ...block(10, 14, 12, 1)];
    const src = world({ streets, zoned: block(10, 11, 12, 3), value: 10 });
    for (const p of platOf(src, ZONE).parcels) expect(yardTilesOf(src, p)).toEqual([]);
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

  it('is not taken beside a cross street, the tile both streets could claim', () => {
    const streets = [...block(10, 10, 12, 1), ...block(14, 11, 1, 6)];
    const src = world({
      streets,
      zoned: [...block(10, 11, 4, 3), ...block(15, 11, 6, 3)],
      value: 10,
    });
    const lot = (x: number): Parcel =>
      platOf(src, ZONE).parcels.find((p) => p.x === x && p.z === 11)!;
    expect(yardTilesOf(src, lot(11)).map(key)).toEqual([]);
    expect(yardTilesOf(src, lot(20)).map(key)).toEqual(['20,12', '20,13']);
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
