import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { RoadTier } from '../shared/types';
import { parcelsAnchoredAt, platOf, platSourceOf, type Parcel, type PlatSource } from './plat';

const ZONE = 1;

/** A world with the streets and zoned tiles it is told of, and land worth `value` everywhere. */
function world(opts: {
  streets: Array<[number, number]>;
  zoned: Array<[number, number]>;
  value?: number;
  built?: Array<[number, number, number]>;
}): PlatSource {
  const zone = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const buildingId = new Uint32Array(MAP_SIZE * MAP_SIZE);
  const landValue = new Uint8Array(MAP_SIZE * MAP_SIZE).fill(opts.value ?? 119);
  const streets = new Set(opts.streets.map(([x, z]) => `${x},${z}`));
  for (const [x, z] of opts.zoned) zone[tileIndex(x, z)] = ZONE;
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

/** Every parcel of the plat. */
function parcelsOf(src: PlatSource): Parcel[] {
  return platOf(src, ZONE).parcels;
}

describe('the plat of a straight street', () => {
  const street = block(10, 10, 12, 1);

  it('cuts normal lots one frontage at a time along a street north of the block', () => {
    const zoned = block(10, 11, 12, 3);
    const parcels = parcelsOf(world({ streets: street, zoned }));
    expect(parcels).toHaveLength(12);
    expect(parcels.every((p) => p.lot === 'normal' && p.w === 1 && p.d === 2)).toBe(true);
    expect(parcels.every((p) => p.front === 'N' && p.z === 11)).toBe(true);
    expect(parcels.map((p) => p.x)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });

  it('cuts the lot the land warrants: half where it is poor, estates where it is the best', () => {
    const zoned = block(10, 11, 12, 3);
    const poor = parcelsOf(world({ streets: street, zoned, value: 10 }));
    expect(poor).toHaveLength(12);
    expect(poor.every((p) => p.lot === 'half' && p.w === 1 && p.d === 1)).toBe(true);
    const best = parcelsOf(world({ streets: street, zoned, value: 240 }));
    expect(best.map((p) => p.x)).toEqual([10, 12, 14, 16, 18, 20]);
    expect(best.every((p) => p.lot === 'estate' && p.w === 2 && p.d === 3)).toBe(true);
  });

  it('turns the lot to a street that runs north to south, its frontage along the street', () => {
    const avenue = block(10, 10, 1, 12);
    const zoned = block(11, 10, 3, 12);
    const parcels = parcelsOf(world({ streets: avenue, zoned }));
    expect(parcels).toHaveLength(12);
    expect(parcels.every((p) => p.front === 'W' && p.lot === 'normal')).toBe(true);
    expect(parcels.every((p) => p.w === 2 && p.d === 1 && p.x === 11)).toBe(true);
  });

  it('anchors a lot on the far side of a street by its far row, nearest the street', () => {
    const zoned = block(10, 6, 12, 3);
    const parcels = parcelsOf(world({ streets: street, zoned }));
    expect(parcels.every((p) => p.front === 'S' && p.z === 7 && p.d === 2)).toBe(true);
  });

  it('cuts only half lots where the block is painted one tile deep', () => {
    const zoned = block(10, 11, 6, 1);
    const parcels = parcelsOf(world({ streets: street, zoned }));
    expect(parcels).toHaveLength(6);
    expect(parcels.every((p) => p.lot === 'half')).toBe(true);
  });

  it('is yard, not a lot, behind the lot: no parcel starts on the deeper rows', () => {
    const zoned = block(10, 11, 4, 3);
    const plat = platOf(world({ streets: street, zoned }), ZONE);
    expect(parcelsAnchoredAt(plat, 10, 11)).toHaveLength(1);
    expect(parcelsAnchoredAt(plat, 10, 12)).toEqual([]);
    expect(parcelsAnchoredAt(plat, 10, 13)).toEqual([]);
  });

  it('does not reach ground no street fronts', () => {
    const zoned = block(40, 40, 4, 3);
    expect(parcelsAnchoredAt(platOf(world({ streets: street, zoned }), ZONE), 40, 40)).toBeNull();
  });
});

describe('the plat steps over what stands and fits what is left', () => {
  const street = block(10, 10, 12, 1);

  it('treats a building as a parcel of its own and cuts the gaps either side', () => {
    const zoned = block(10, 11, 7, 3);
    // A house two tiles wide stands at x 12–13.
    const built: Array<[number, number, number]> = [
      [12, 11, 7],
      [13, 11, 7],
      [12, 12, 7],
      [13, 12, 7],
    ];
    const parcels = parcelsOf(world({ streets: street, zoned, built }));
    expect(parcels.map((p) => [p.x, p.w])).toEqual([
      [10, 1],
      [11, 1],
      [14, 1],
      [15, 1],
      [16, 1],
    ]);
  });

  it('cuts the largest smaller lot that fits where the warranted one runs out of room', () => {
    // An estate needs two tiles of frontage; one tile is left at the run's end.
    const zoned = block(10, 11, 3, 3);
    const parcels = parcelsOf(world({ streets: street, zoned, value: 240 }));
    expect(parcels.map((p) => [p.x, p.lot])).toEqual([
      [10, 'estate'],
      [12, 'normal'],
    ]);
  });
});

describe('the plat follows the street round a bend and a cul-de-sac', () => {
  it('fronts each arm of a bend on its own side, and the inside tile its longer arm', () => {
    // A street along z = 10 from x = 10 to 20, turning south down x = 20.
    const turn = [...block(10, 10, 11, 1), ...block(20, 10, 1, 9)];
    const zoned = block(12, 11, 8, 3);
    const parcels = parcelsOf(world({ streets: turn, zoned }));
    const fronts = new Set(parcels.map((p) => p.front));
    expect(fronts.has('N')).toBe(true);
    expect(fronts.has('E')).toBe(true);
    // Every lot touches the street it fronts.
    for (const p of parcels) {
      const touches =
        p.front === 'N'
          ? turn.some(([sx, sz]) => sz === p.z - 1 && sx >= p.x && sx < p.x + p.w)
          : turn.some(([sx, sz]) => sx === p.x + p.w && sz >= p.z && sz < p.z + p.d);
      expect(touches, `${p.front} lot at ${p.x},${p.z}`).toBe(true);
    }
  });

  it('fronts the sides of a cul-de-sac and never cuts a lot across its end', () => {
    // A street along z = 10 that stops at x = 16; blocks above and below it.
    const dead = block(10, 10, 7, 1);
    const zoned = [...block(10, 11, 9, 3), ...block(10, 7, 9, 3)];
    const parcels = parcelsOf(world({ streets: dead, zoned }));
    const north = parcels.filter((p) => p.front === 'S');
    const south = parcels.filter((p) => p.front === 'N');
    expect(north.length).toBeGreaterThan(0);
    expect(south.length).toBeGreaterThan(0);
    // Beyond the road's end there is no street to front along the street's axis.
    for (const p of parcels) expect(p.front === 'W' || p.front === 'E').toBe(false);
  });
});

describe('the whole plat', () => {
  it('cuts every run once, and agrees tile for tile with what the spawner asks', () => {
    const streets = [...block(10, 10, 12, 1), ...block(21, 11, 1, 6)];
    const zoned = [...block(10, 11, 11, 3), ...block(18, 14, 3, 3)];
    const src = world({ streets, zoned, value: 181 });
    const plat = platOf(src, ZONE);
    const all = plat.parcels;
    expect(all.length).toBeGreaterThan(0);
    const key = (p: Parcel): string => `${p.front}:${p.x},${p.z}:${p.w}x${p.d}`;
    expect(new Set(all.map(key)).size).toBe(all.length);
    const asked = zoned.flatMap(([x, z]) => parcelsAnchoredAt(plat, x, z) ?? []);
    expect(new Set(asked.map(key))).toEqual(new Set(all.map(key)));
  });

  it('is empty for a zone nothing is painted in', () => {
    expect(platOf(world({ streets: block(10, 10, 4, 1), zoned: [] }), ZONE).parcels).toEqual([]);
  });
});

describe('platSourceOf', () => {
  it('reads a street tier at grade as a street, and a deck overhead or a railway as none', () => {
    const size = MAP_SIZE;
    const g = {
      size,
      zone: new Uint8Array(size * size),
      buildingId: new Uint32Array(size * size),
      roadTier: new Uint8Array(size * size),
      roadElevation: new Float32Array(size * size),
    };
    g.roadTier[tileIndex(5, 5)] = RoadTier.TwoLane;
    g.roadTier[tileIndex(6, 5)] = RoadTier.TwoLane;
    g.roadElevation[tileIndex(6, 5)] = 6;
    g.roadTier[tileIndex(7, 5)] = RoadTier.RailTrack;
    const src = platSourceOf(g, null, undefined);
    expect(src.streetAt(5, 5)).toBe(true);
    expect(src.streetAt(6, 5)).toBe(false);
    expect(src.streetAt(7, 5)).toBe(false);
    expect(src.streetAt(-1, 5)).toBe(false);
    expect(src.landValue).toBeUndefined();
  });
});

describe('runs from two streets never share ground', () => {
  it('cuts the inside corner of a bend once: a tile claimed by one run is stepped over by the other', () => {
    // A street east along z = 10 to x = 19 and south down x = 20 from z = 11;
    // the block inside the corner is zoned three deep from both.
    const streets = [...block(10, 10, 10, 1), ...block(20, 11, 1, 8)];
    const zoned = block(14, 11, 6, 6);
    const { parcels } = platOf(world({ streets, zoned, value: 240 }), ZONE);
    const claimed = new Set<string>();
    for (const p of parcels) {
      for (let dz = 0; dz < p.d; dz++) {
        for (let dx = 0; dx < p.w; dx++) {
          const k = `${p.x + dx},${p.z + dz}`;
          expect(claimed.has(k), `tile ${k} in two parcels`).toBe(false);
          claimed.add(k);
        }
      }
    }
    expect(new Set(parcels.map((p) => p.front))).toEqual(new Set(['N', 'E']));
  });
});
