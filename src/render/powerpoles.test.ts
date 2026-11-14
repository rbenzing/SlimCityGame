import { describe, expect, it } from 'vitest';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  hasKerbs,
  kerbWidthOf,
  presetProfileForTier,
} from '../shared/roadprofile';
import { RoadFlow, RoadTier } from '../shared/types';
import type { BusStop, TilePoint } from '../shared/types';
import { stopPostSpots, stopRoadAt } from './busstops';
import { STOP_CLEAR_HALF_M } from './lamps';
import { buildTileSet, lateralAxis, tileKey } from './roadfurniture';
import type { FurnitureRoadTile } from './roadfurniture';
import { keepClearOf, OBJECT_GAP_M, Standing } from './roadsidespace';
import {
  COUNTRY_POLE_HEIGHT_M,
  POLE_BEHIND_KERB_M,
  STREET_POLE_HEIGHT_M,
  WIRE_CLEARANCE_M,
  chunksAroundTile,
  layStreetChunk,
  layStrungLine,
  poleLateralOffset,
  wirePoints,
} from './powerpoles';
import type { PowerLay, PowerWorld } from './powerpoles';

type RoadSpec = Partial<FurnitureRoadTile> & { powered?: boolean };

const row = (x0: number, x1: number, z: number, spec: RoadSpec = {}): FurnitureRoadTile[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({
    x: x0 + i,
    z,
    tier: RoadTier.TwoLane,
    powered: true,
    ...spec,
  }));

const col = (x: number, z0: number, z1: number, spec: RoadSpec = {}): FurnitureRoadTile[] =>
  Array.from({ length: z1 - z0 + 1 }, (_, i) => ({
    x,
    z: z0 + i,
    tier: RoadTier.TwoLane,
    powered: true,
    ...spec,
  }));

const worldOf = (
  tiles: FurnitureRoadTile[],
  keepOff: number[] = [],
  closed: number[] = [],
): PowerWorld => ({
  tileSet: buildTileSet(tiles),
  keepOff: new Set(keepOff),
  closed: new Set(closed),
});

const keyOf = (x: number, z: number): number => x * 100_000 + z;

/** The street's line over the first terrain chunk, where every test street lies. */
const lay = (w: PowerWorld): PowerLay => layStreetChunk(w, 0);

const tileOf = (p: { x: number; z: number }): TilePoint => ({
  x: Math.floor(p.x / TILE_METERS),
  z: Math.floor(p.z / TILE_METERS),
});

const flat = (): number => 0;

describe('where a street pole stands', () => {
  const tiers = [
    RoadTier.TwoLane,
    RoadTier.Avenue,
    RoadTier.OneWay,
    RoadTier.FourLane,
    RoadTier.Alley,
    RoadTier.Highway,
    RoadTier.Ramp,
    RoadTier.Gravel,
  ];

  it.each(tiers)('stands tier %i behind the kerb face and outside the walk', (tier) => {
    const profile = presetProfileForTier(tier);
    const half = carriagewayHalfWidthOf(profile);
    const offset = poleLateralOffset(profile);
    expect(offset).toBeGreaterThanOrEqual(half + POLE_BEHIND_KERB_M);
    expect(offset).toBeGreaterThanOrEqual(half + kerbWidthOf(profile));
    // A road with no kerb takes its pole at the edge of the tile.
    if (!hasKerbs(profile)) expect(offset).toBeGreaterThanOrEqual(TILE_METERS / 2);
  });

  it.each([RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Alley, RoadTier.OneWay])(
    'puts the pole of tier %i beside its road, never in the carriageway',
    (tier) => {
      const half = carriagewayHalfWidthOf(presetProfileForTier(tier));
      const { poles } = lay(worldOf(row(1, 14, 5, { tier })));
      expect(poles.length).toBeGreaterThan(3);
      for (const pole of poles) {
        expect(Math.abs(pole.z - tileToWorld(5))).toBeGreaterThanOrEqual(half + POLE_BEHIND_KERB_M);
      }
    },
  );

  it('stands the pole outside the footway of a two-lane street, not on it', () => {
    const profile = presetProfileForTier(RoadTier.TwoLane);
    const reach = carriagewayHalfWidthOf(profile) + kerbWidthOf(profile);
    const { poles } = lay(worldOf(row(1, 14, 5)));
    for (const pole of poles) {
      expect(Math.abs(pole.z - tileToWorld(5))).toBeGreaterThanOrEqual(reach);
    }
  });

  it('stands a pole 10.4 m out of the ground', () => {
    const { poles } = lay(worldOf(row(1, 14, 5)));
    expect(poles.length).toBeGreaterThan(0);
    for (const pole of poles) expect(pole.height).toBe(STREET_POLE_HEIGHT_M);
  });

  it('keeps one side between junctions, and one pole every second tile', () => {
    const { poles } = lay(worldOf(row(1, 14, 5)));
    const sides = new Set(poles.map((p) => Math.sign(p.z - tileToWorld(5))));
    expect(sides.size).toBe(1);
    const xs = poles.map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBe(2 * TILE_METERS);
  });

  it('is the same on every lay: no randomness', () => {
    const tiles = row(1, 14, 5);
    expect(lay(worldOf(tiles))).toEqual(lay(worldOf(tiles)));
  });

  it('draws nothing along an unpowered street', () => {
    expect(lay(worldOf(row(1, 14, 5, { powered: false })))).toEqual({ poles: [], spans: [] });
  });

  it('draws nothing along a motorway or a ramp, nor an unmade road', () => {
    for (const tier of [RoadTier.Highway, RoadTier.Ramp, RoadTier.Gravel, RoadTier.RailTrack]) {
      expect(lay(worldOf(row(1, 14, 5, { tier }))).poles).toEqual([]);
    }
  });

  it('draws nothing on a bridge deck or a raised road', () => {
    const tiles = [...row(1, 6, 5), ...row(7, 10, 5, { elevated: true }), ...row(11, 14, 5)];
    const { poles } = lay(worldOf(tiles));
    for (const pole of poles) {
      const t = tileOf(pole);
      expect(t.x < 7 || t.x > 10).toBe(true);
    }
  });

  it('draws no pole on a tram guideway, and no wire across it', () => {
    const closed = [7, 8, 9, 10].map((x) => keyOf(x, 5));
    const { poles, spans } = lay(worldOf(row(1, 14, 5), [], closed));
    for (const pole of poles) expect(closed).not.toContain(keyOf(tileOf(pole).x, 5));
    for (const span of spans) {
      const [lo, hi] = [span.a.x, span.b.x].sort((a, b) => a - b) as [number, number];
      expect(lo > tileToWorld(10) || hi < tileToWorld(7)).toBe(true);
    }
  });

  it('stands none on a junction or a turn, and spans a junction in one wire', () => {
    const tiles = [...row(1, 14, 5), ...col(8, 1, 9).filter((t) => t.z !== 5)];
    const { poles, spans } = lay(worldOf(tiles));
    for (const pole of poles) {
      const t = tileOf(pole);
      expect(t.x === 8 && t.z === 5).toBe(false);
    }
    const across = spans.find(
      (s) => s.a.x < tileToWorld(8) && s.b.x > tileToWorld(8) && Math.abs(s.a.z - s.b.z) < 1e-6,
    );
    expect(across).toBeDefined();
  });

  it('stands none on a drive and moves the pole one tile along', () => {
    const plain = lay(worldOf(row(1, 14, 5))).poles.map((p) => tileOf(p).x);
    expect(plain).toContain(5);
    const { poles } = lay(worldOf(row(1, 14, 5), [keyOf(5, 5)]));
    const xs = poles.map((p) => tileOf(p).x);
    expect(xs).not.toContain(5);
    expect(xs).toContain(4);
  });

  it('keeps a pole off the side of a street where another road lies beside it', () => {
    // Two streets side by side, each holding apart the arm toward the other.
    const tiles = [...row(1, 14, 5, { apart: 4 }), ...row(1, 14, 6, { apart: 1 })];
    const { poles } = lay(worldOf(tiles));
    expect(poles.length).toBeGreaterThan(0);
    for (const pole of poles) {
      // The pole of either street stands outside both, never between them.
      expect(pole.z < tileToWorld(5) || pole.z > tileToWorld(6)).toBe(true);
    }
  });
});

describe('the wires of a street', () => {
  const crossroads = (): FurnitureRoadTile[] => [
    ...row(1, 14, 5),
    ...col(9, 1, 9).filter((t) => t.z !== 5),
  ];

  it('hang at least 4.7 m over the road they cross', () => {
    const { spans } = lay(worldOf(crossroads()));
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      for (const which of [-1, 0, 1] as const) {
        for (const p of wirePoints(span.a, span.b, which, flat)) {
          expect(p.y).toBeGreaterThanOrEqual(WIRE_CLEARANCE_M);
        }
      }
    }
  });

  it('sag between poles, lowest in the middle', () => {
    const { spans } = lay(worldOf(row(1, 14, 5)));
    const span = spans[0]!;
    const points = wirePoints(span.a, span.b, 0, flat);
    const ends = Math.min(points[0]!.y, points.at(-1)!.y);
    const lowest = Math.min(...points.map((p) => p.y));
    expect(lowest).toBeLessThan(ends - 0.2);
  });

  it('cross a junction tile in one span, from the pole before it to the pole after', () => {
    const { spans } = lay(worldOf(crossroads()));
    const across = spans.filter(
      (s) =>
        Math.min(s.a.x, s.b.x) < tileToWorld(9) &&
        Math.max(s.a.x, s.b.x) > tileToWorld(9) &&
        Math.abs(s.a.z - s.b.z) < 1e-6,
    );
    expect(across).toHaveLength(1);
  });

  it('hang the arm of a crossing line lower, so the two never touch at a junction', () => {
    const { poles } = lay(worldOf(crossroads()));
    const eastWest = poles.find((p) => tileOf(p).z === 5)!;
    const northSouth = poles.find((p) => tileOf(p).x === 9)!;
    expect(eastWest.arm).toBeGreaterThan(northSouth.arm);
  });
});

describe('guys', () => {
  it('hold a pole at a dead end and let a pole in a straight run stand alone', () => {
    const { poles } = lay(worldOf(row(1, 8, 5)));
    const byX = [...poles].sort((a, b) => a.x - b.x);
    expect(byX.length).toBeGreaterThanOrEqual(3);
    expect(byX[0]!.guy).not.toBeNull();
    expect(byX.at(-1)!.guy).not.toBeNull();
    for (const middle of byX.slice(1, -1)) expect(middle.guy).toBeNull();
  });

  it('hold the poles either side of a corner, anchored away from the pull of the wires', () => {
    const tiles = [...row(1, 8, 5), ...col(8, 6, 12)];
    const { poles, spans } = lay(worldOf(tiles));
    const near = poles.filter((p) => {
      const t = tileOf(p);
      return (t.x === 7 && t.z === 5) || (t.x === 8 && t.z === 6);
    });
    expect(near).toHaveLength(2);
    for (const pole of near) expect(pole.guy).not.toBeNull();
    // The two corner poles are joined round the bend.
    expect(
      spans.some((s) => near.includes(s.a) && near.includes(s.b)) ||
        spans.some(
          (s) => near.some((n) => n.key === s.a.key) && near.some((n) => n.key === s.b.key),
        ),
    ).toBe(true);
    const guyed = near[0]!;
    // The anchor lies GUY_REACH from the pole, on the ground.
    expect(Math.hypot(guyed.guy!.x - guyed.x, guyed.guy!.z - guyed.z)).toBeCloseTo(4, 5);
  });
});

describe('the line a player strings', () => {
  const none = (): PowerWorld => worldOf([]);

  it('stands 21 m poles every five tiles over open ground, centred on their tile', () => {
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i, z: 3 }));
    const { poles, spans } = layStrungLine(none(), line);
    expect(poles).toHaveLength(3);
    for (const pole of poles) {
      expect(pole.height).toBe(COUNTRY_POLE_HEIGHT_M);
      expect(pole.z).toBe(tileToWorld(3));
    }
    const xs = poles.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBe(5 * TILE_METERS);
    expect(xs[2]! - xs[1]!).toBe(5 * TILE_METERS);
    expect(spans).toHaveLength(2);
  });

  it('ends on a pole at the edge of the source it starts from, not a tile away', () => {
    // A substation on tiles 0..1 x 2..3; the line leaves east from x = 2.
    const sources = new Set([keyOf(0, 2), keyOf(1, 2), keyOf(0, 3), keyOf(1, 3)]);
    const line = Array.from({ length: 6 }, (_, i) => ({ x: 2 + i, z: 2 }));
    const { poles } = layStrungLine({ ...none(), sources }, line);
    const first = [...poles].sort((a, b) => a.x - b.x)[0]!;
    const edge = 2 * TILE_METERS;
    expect(first.x).toBeLessThan(edge + 1.5);
    expect(first.x).toBeGreaterThanOrEqual(edge);
    expect(first.z).toBe(tileToWorld(2));
    // Without the source the same pole stands in the middle of its tile.
    const bare = [...layStrungLine(none(), line).poles].sort((a, b) => a.x - b.x)[0]!;
    expect(bare.x).toBe(tileToWorld(2));
  });

  it('guys the poles at its ends and not those between', () => {
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i, z: 3 }));
    const poles = [...layStrungLine(none(), line).poles].sort((a, b) => a.x - b.x);
    expect(poles[0]!.guy).not.toBeNull();
    expect(poles[1]!.guy).toBeNull();
    expect(poles[2]!.guy).not.toBeNull();
  });

  it('becomes a roadside line along a gravel road, at the tile edge and never on the road', () => {
    const gravel = row(0, 12, 3, { tier: RoadTier.Gravel });
    const line = gravel.map((t) => ({ x: t.x, z: t.z }));
    const { poles } = layStrungLine(worldOf(gravel), line);
    expect(poles.length).toBeGreaterThanOrEqual(3);
    const half = carriagewayHalfWidthOf(presetProfileForTier(RoadTier.Gravel));
    for (const pole of poles) {
      expect(pole.height).toBe(STREET_POLE_HEIGHT_M);
      expect(Math.abs(pole.z - tileToWorld(3))).toBeGreaterThanOrEqual(TILE_METERS / 2);
      expect(Math.abs(pole.z - tileToWorld(3))).toBeGreaterThan(half);
    }
    const sorted = [...poles].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length - 1; i++) {
      expect(sorted[i]!.x - sorted[i - 1]!.x).toBeLessThanOrEqual(4 * TILE_METERS);
    }
    // The street's own line passes a gravel road by.
    expect(lay(worldOf(gravel)).poles).toEqual([]);
  });

  it('draws nothing of its own on a sealed street: the street carries the line', () => {
    const street = row(2, 12, 3);
    const line = street.map((t) => ({ x: t.x, z: t.z }));
    expect(layStrungLine(worldOf(street), line)).toEqual({ poles: [], spans: [] });
  });

  it('crosses a street in one span, with no pole on the road and the wire well clear of it', () => {
    const street = row(0, 12, 5);
    const line = Array.from({ length: 11 }, (_, i) => ({ x: 6, z: i }));
    const { poles, spans } = layStrungLine(worldOf(street), line);
    for (const pole of poles) expect(tileOf(pole).z).not.toBe(5);
    const across = spans.find(
      (s) => Math.min(s.a.z, s.b.z) < tileToWorld(5) && Math.max(s.a.z, s.b.z) > tileToWorld(5),
    );
    expect(across).toBeDefined();
    for (const which of [-1, 0, 1] as const) {
      for (const p of wirePoints(across!.a, across!.b, which, flat)) {
        expect(p.y).toBeGreaterThanOrEqual(WIRE_CLEARANCE_M);
      }
    }
  });

  it('draws no pole on rail', () => {
    const rail = row(0, 12, 5, { tier: RoadTier.RailTrack });
    const line = Array.from({ length: 11 }, (_, i) => ({ x: 6, z: i }));
    for (const pole of layStrungLine(worldOf(rail), line).poles) expect(tileOf(pole).z).not.toBe(5);
  });
});

describe('what a change re-lays', () => {
  it('reaches only the chunk a tile lies in, when it lies well inside it', () => {
    expect(chunksAroundTile(8, 8)).toEqual([0]);
  });

  it('reaches the chunk beside it only when a span could cross the edge', () => {
    expect(chunksAroundTile(15, 8).sort((a, b) => a - b)).toEqual([0, 1]);
    expect(chunksAroundTile(8, 15).length).toBe(2);
  });

  it('never names a chunk off the map', () => {
    for (const key of chunksAroundTile(0, 0)) expect(key).toBeGreaterThanOrEqual(0);
  });

  it('lays the same poles in a chunk whatever lies in the chunks beside it', () => {
    const tiles = [...row(1, 14, 5), ...row(17, 30, 5)];
    const alone = layStreetChunk(worldOf(row(1, 14, 5)), 0);
    const beside = layStreetChunk(worldOf(tiles), 0);
    expect(beside.poles.map((p) => p.key)).toEqual(alone.poles.map((p) => p.key));
  });
});

describe('a buried cable on the surface', () => {
  const cableKeys = (tiles: readonly TilePoint[]): Set<number> =>
    new Set(tiles.map((t) => keyOf(t.x, t.z)));
  const withCables = (
    roads: FurnitureRoadTile[],
    cables: readonly TilePoint[],
    lines: readonly TilePoint[] = [],
  ): PowerWorld => ({ ...worldOf(roads), cables: cableKeys(cables), lines: cableKeys(lines) });
  const run = (x0: number, x1: number, z: number): TilePoint[] =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
  const profile = presetProfileForTier(RoadTier.TwoLane);
  const footwayReach = carriagewayHalfWidthOf(profile) + kerbWidthOf(profile);

  /** A street along row 4 with its supply buried from tile 4 to tile 11. */
  const buried = (): PowerLay => lay(withCables(row(0, 15, 4), run(4, 11, 4)));

  it('draws no pole and no wire on a buried street, and the line ends on a riser at each end', () => {
    const { poles, spans } = buried();
    for (const pole of poles) {
      const t = tileOf(pole);
      expect(t.x < 4 || t.x > 11).toBe(true);
    }
    for (const span of spans) {
      const [lo, hi] = [span.a.x, span.b.x].sort((a, b) => a - b) as [number, number];
      expect(lo > tileToWorld(11) || hi < tileToWorld(4)).toBe(true);
    }
    const risers = poles.filter((p) => p.riser);
    expect(risers.map((p) => tileOf(p).x)).toEqual([3, 12]);
    expect(risers[0]!.riser).toEqual({ x: 1, z: 0 });
    expect(risers[1]!.riser).toEqual({ x: -1, z: 0 });
  });

  it('stands a transformer every fourth tile of a buried street, outside the footway, on the pole side', () => {
    const transformers = (buried().boxes ?? []).filter((b) => b.kind === 'transformer');
    expect(transformers.map((b) => tileOf(b).x)).toEqual([4, 8]);
    const poleSide = Math.sign(lay(worldOf(row(0, 15, 4))).poles[0]!.z - tileToWorld(4));
    for (const t of transformers) {
      expect(Math.sign(t.z - tileToWorld(4))).toBe(poleSide);
      // Its whole body is beyond the walk.
      expect(Math.abs(t.z - tileToWorld(4)) - 0.5).toBeGreaterThanOrEqual(footwayReach);
      expect(Math.abs(t.z - tileToWorld(4)) + 0.5).toBeLessThanOrEqual(TILE_METERS / 2);
      // The doors face the street.
      expect(t.fz).toBe(-poleSide);
    }
    // And a junction box is never one of a buried street's own tiles.
    expect((buried().boxes ?? []).filter((b) => b.kind === 'junction')).toEqual([]);
  });

  it('draws a street with no cable exactly as before', () => {
    expect(lay(withCables(row(0, 15, 4), []))).toEqual(lay(worldOf(row(0, 15, 4))));
  });

  it('puts a junction box at each end and each branch of a run on open ground', () => {
    const cables = [...run(2, 6, 10), { x: 4, z: 11 }];
    const boxes = lay(withCables([], cables)).boxes ?? [];
    expect(boxes.every((b) => b.kind === 'junction')).toBe(true);
    expect(boxes.map((b) => `${tileOf(b).x}:${tileOf(b).z}`).sort()).toEqual([
      '2:10',
      '4:10',
      '4:11',
      '6:10',
    ]);
  });

  it('puts none along the middle of a run, and none on a bend', () => {
    const bend = [...run(2, 5, 10), { x: 5, z: 11 }, { x: 5, z: 12 }];
    const boxes = lay(withCables([], bend)).boxes ?? [];
    expect(boxes.map((b) => `${tileOf(b).x}:${tileOf(b).z}`).sort()).toEqual(['2:10', '5:12']);
  });

  it('stands its box clear of a carriageway and a walk, with 3 m of clear ground before its doors', () => {
    const gravel = row(0, 15, 6, { tier: RoadTier.Gravel });
    const half = carriagewayHalfWidthOf(presetProfileForTier(RoadTier.Gravel));
    const boxes = lay(withCables(gravel, run(3, 8, 6))).boxes ?? [];
    expect(boxes.length).toBe(2);
    for (const b of boxes) {
      expect(Math.abs(b.z - tileToWorld(6))).toBeGreaterThanOrEqual(half);
      expect(Math.abs(b.z - tileToWorld(6)) + 0.95).toBeLessThanOrEqual(TILE_METERS / 2);
      // A point 3 m past the door face is no nearer the road than the box is.
      const ahead = b.z + b.fz * (0.9 + 3);
      expect(Math.abs(ahead - tileToWorld(6))).toBeGreaterThanOrEqual(half);
    }
  });

  it('turns the end of a cable that meets a strung line into a riser, with no box there', () => {
    const line = run(10, 14, 8);
    const cables = run(15, 18, 8);
    const w = withCables([], cables, line);
    const poles = layStrungLine(w, line).poles;
    const meeting = poles.find((p) => tileOf(p).x === 14);
    expect(meeting?.riser).toEqual({ x: 1, z: 0 });
    expect(poles.filter((p) => p.riser)).toHaveLength(1);
    // The cable's far end has a box; the end beside the line has none.
    const boxes = [...(lay(w).boxes ?? []), ...(layStreetChunk(w, 1).boxes ?? [])];
    expect(boxes.map((b) => tileOf(b).x)).toEqual([18]);
  });

  it('puts the riser of a cable that meets a street on that street`s own pole line', () => {
    const w = withCables(row(0, 15, 4), run(8, 8, 5).concat(run(8, 8, 6), run(8, 8, 7)));
    const { poles, boxes } = lay(w);
    const meeting = poles.find((p) => p.riser);
    expect(meeting).toBeDefined();
    expect(tileOf(meeting!)).toEqual({ x: 8, z: 4 });
    expect(meeting!.riser).toEqual({ x: 0, z: 1 });
    expect((boxes ?? []).map((b) => tileOf(b).z)).toEqual([7]);
  });

  it('marks an end on a junction tile with a box on the free ground beside it', () => {
    const roads = [
      ...row(0, 15, 6, { tier: RoadTier.Gravel }),
      ...col(8, 7, 12, { tier: RoadTier.Gravel }),
    ];
    const boxes = lay(withCables(roads, run(8, 11, 6))).boxes ?? [];
    const tiles = boxes.map((b) => `${tileOf(b).x}:${tileOf(b).z}`).sort();
    // The far end has a box in its own strip; the junction end stands on the tile to its north.
    expect(tiles).toContain('8:5');
    expect(tiles).toHaveLength(2);
    // Never in a building's lot: with that tile built on, the box finds no place.
    const built = { ...withCables(roads, run(8, 11, 6)), built: new Set([keyOf(8, 5)]) };
    expect((lay(built).boxes ?? []).map((b) => tileOf(b).x)).not.toContain(8);
  });

  it('puts the riser of a buried stretch that ends at a junction on its last tile before it', () => {
    const roads = [...row(0, 15, 4), ...col(12, 5, 10)];
    const { poles } = lay(withCables(roads, run(6, 11, 4)));
    const risers = poles.filter((p) => p.riser).map((p) => tileOf(p).x);
    expect(risers).toContain(11);
    const last = poles.find((p) => p.riser && tileOf(p).x === 11)!;
    expect(last.riser).toEqual({ x: -1, z: 0 });
    // No other pole stands on the buried tiles.
    expect(poles.filter((p) => tileOf(p).x >= 6 && tileOf(p).x <= 10)).toEqual([]);
  });

  it('lays a chunk the same whatever lies in the chunks beside it', () => {
    const near = withCables(row(0, 15, 4), run(4, 11, 4));
    const far = withCables(
      [...row(0, 15, 4), ...row(20, 30, 4)],
      [...run(4, 11, 4), ...run(22, 28, 4)],
    );
    expect(layStreetChunk(far, 0)).toEqual(layStreetChunk(near, 0));
  });
});

describe('a street pole gives way to what stands beside the street', () => {
  const east = (): FurnitureRoadTile[] => row(1, 14, 5, { flow: RoadFlow.East });
  const stop: BusStop = { x: 5, z: 5, side: 0, kind: 'sign' };
  const roadsideOf = (tiles: FurnitureRoadTile[], taken: readonly { x: number; z: number }[]) => {
    const tileSet = buildTileSet(tiles);
    return {
      tileSet,
      roadside: {
        clear: keepClearOf(
          undefined,
          [stop],
          STOP_CLEAR_HALF_M,
          (tx, tz) => lateralAxis(tileSet, tx, tz),
          tileKey,
        ),
        taken: new Standing().addAll(taken),
      },
    };
  };
  const laidWith = (tiles: FurnitureRoadTile[], taken: readonly { x: number; z: number }[]) => {
    const { tileSet, roadside } = roadsideOf(tiles, taken);
    return {
      tileSet,
      poles: layStreetChunk({ tileSet, keepOff: new Set(), closed: new Set(), roadside }, 0).poles,
    };
  };

  it('keeps 1.5 m from the sign post of a bus stop, as it does from every other object', () => {
    const tiles = east();
    const { tileSet } = roadsideOf(tiles, []);
    const posts = stopPostSpots([stop], (x, z) => stopRoadAt(tileSet, x, z));
    expect(posts).toHaveLength(1);
    const { poles } = laidWith(tiles, posts);
    expect(poles.length).toBeGreaterThan(3);
    for (const p of poles) {
      expect(Math.hypot(p.x - posts[0]!.x, p.z - posts[0]!.z)).toBeGreaterThanOrEqual(OBJECT_GAP_M);
    }
  });

  it('stands one pole where a lamp or a tram pole stands, moved along to 1.5 m clear', () => {
    const tiles = row(1, 14, 5);
    const base = laidWith(tiles, []).poles.find((p) => tileOf(p).x === 5)!;
    for (const at of [0, 0.3, -1.2]) {
      const held = { x: base.x + at, z: base.z };
      const { poles } = laidWith(tiles, [held]);
      const here = poles.filter((p) => tileOf(p).x === 5);
      expect(here).toHaveLength(1);
      expect(Math.hypot(here[0]!.x - held.x, here[0]!.z - held.z)).toBeGreaterThanOrEqual(
        OBJECT_GAP_M,
      );
    }
  });

  it('keeps its pole on a tile whose strip is crowded, so no span grows past its tiles', () => {
    const tiles = row(1, 14, 5);
    const base = laidWith(tiles, []).poles.find((p) => tileOf(p).x === 5)!;
    const crowd = [-6, -3, 0, 3, 6].map((d) => ({ x: base.x + d, z: base.z }));
    const { poles } = laidWith(tiles, crowd);
    const xs = poles.map((p) => tileOf(p).x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(2);
  });
});
