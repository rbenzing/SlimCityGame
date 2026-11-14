import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import {
  bracketHeightUnder,
  computeLampPlacements,
  lampPolylines,
  LampRenderer,
  standsOf,
  type LampStand,
} from './lamps';
import { layStreetAll, layStreetChunks, roadChunksOf, shapePole, wirePoints } from './powerpoles';
import type { PowerLay, PowerWorld } from './powerpoles';
import { buildTileSet, computeSignPlacements, signalPolylines } from './roadfurniture';
import type { FurnitureRoadTile } from './roadfurniture';
import { KEEP_CLEAR_NONE, Standing } from './roadsidespace';
import {
  carryLampsOnPoles,
  fixtureOf,
  lampFixture,
  leastWireDistance,
  type LayPoles,
  segmentDistance,
  WIRE_FROM_POST_M,
} from './wireclearance';

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

const flat = (): number => 0;

const worldOf = (tiles: FurnitureRoadTile[], posts: readonly LampStand[]): PowerWorld => ({
  tileSet: buildTileSet(tiles),
  keepOff: new Set(),
  closed: new Set(),
  roadside: { clear: KEEP_CLEAR_NONE, taken: new Standing().addAll(posts) },
});

/** The street's poles laid the way the game lays them, chunk by chunk: with the given lamp posts held clear. */
const chunked =
  (tiles: FurnitureRoadTile[]): LayPoles =>
  (posts, chunks) => {
    const world = worldOf(tiles, posts);
    return layStreetChunks(world, chunks ?? roadChunksOf(world));
  };

/** The same, the whole street at once. */
const layerOf =
  (tiles: FurnitureRoadTile[]) =>
  (posts: readonly LampStand[]): PowerLay =>
    layStreetAll(worldOf(tiles, posts));

const lampsOf = (tiles: FurnitureRoadTile[]): LampStand[] =>
  computeLampPlacements(tiles).flatMap(standsOf);

const nearestWire = (lamps: readonly LampStand[], lay: PowerLay): number =>
  leastWireDistance(
    lay.spans,
    lamps.map((s) => lampFixture(s, flat)),
    flat,
  );

const presets = [
  RoadTier.TwoLane,
  RoadTier.OneWay,
  RoadTier.Avenue,
  RoadTier.FourLane,
  RoadTier.Alley,
] as const;

describe('the least distance from a wire to a fixture', () => {
  it('is the distance between two crossing segments', () => {
    expect(segmentDistance([0, 0, 0], [4, 0, 0], [2, 3, -1], [2, 3, 1])).toBeCloseTo(3);
    expect(segmentDistance([0, 0, 0], [4, 0, 0], [6, 0, 0], [8, 0, 0])).toBeCloseTo(2);
    expect(segmentDistance([0, 0, 0], [0, 0, 0], [3, 4, 0], [3, 4, 0])).toBeCloseTo(5);
  });

  it('reads the sag: a lamp head under the middle of a long span is nearer than under a pole', () => {
    const lay = layerOf(row(1, 14, 5))([]);
    const span = lay.spans[0]!;
    const pts = wirePoints(span.a, span.b, 0, flat);
    const mid = pts[Math.floor(pts.length / 2)]!;
    const above = (x: number, z: number, y: number) =>
      fixtureOf([
        [
          [x, y, z],
          [x, y - 0.1, z],
        ],
      ]);
    const under = leastWireDistance([span], [above(mid.x, mid.z, mid.y - 2)], flat);
    expect(under).toBeCloseTo(2, 1);
  });
});

describe('a lamp keeps its distance from a wire it is not hung on', () => {
  it.each(presets.flatMap((tier) => [[tier, 'x'] as const, [tier, 'z'] as const]))(
    'tier %i, run along %s: every post clears every wire by 1.83 m',
    (tier, along) => {
      const tiles = along === 'x' ? row(1, 14, 5, { tier }) : col(5, 1, 14, { tier });
      const lamps = lampsOf(tiles);
      const lay = layerOf(tiles);
      const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
      expect(settled.posts.length + settled.carried.length).toBe(lamps.length);
      const final = lay(settled.posts);
      expect(nearestWire(settled.posts, final)).toBeGreaterThanOrEqual(WIRE_FROM_POST_M);
    },
  );

  it('would not have, on a street whose lamps stand taller than the wires hang low', () => {
    const tiles = row(1, 14, 5, { tier: RoadTier.Avenue });
    const lamps = lampsOf(tiles);
    expect(nearestWire(lamps, layerOf(tiles)(lamps))).toBeLessThan(WIRE_FROM_POST_M);
  });

  it('hangs a lamp that would break the clearance on the nearest power pole, under the wires', () => {
    const tiles = row(1, 14, 5, { tier: RoadTier.Avenue });
    const lamps = lampsOf(tiles);
    const lay = layerOf(tiles);
    const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
    expect(settled.carried.length).toBeGreaterThan(0);
    const poles = lay(settled.posts).poles;
    for (const stand of settled.carried) {
      expect(stand.bracket).toBe(true);
      const pole = poles.find((p) => p.x === stand.x && p.z === stand.z);
      expect(pole).toBeDefined();
      const top = Math.max(
        ...lampPolylines(stand, 0)
          .flat()
          .map((p) => p[1]),
      );
      expect(top).toBeLessThanOrEqual(pole!.arm - 0.76 + 1e-9);
      // The lamp's own mounting height, or lower where the wires are in the way.
      const own = lamps.find((l) => l.reachX === stand.reachX && l.reachZ === stand.reachZ)!;
      expect(stand.height!).toBeLessThanOrEqual(own.height! + 1e-9);
    }
  });

  it('leaves a lamp that clears every wire on its own post', () => {
    const tiles = row(1, 14, 5, { tier: RoadTier.TwoLane });
    const lamps = lampsOf(tiles);
    expect(lamps.every((l) => l.height === 6.1)).toBe(true);
    const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
    expect(settled.carried).toEqual([]);
    expect(settled.posts).toEqual(lamps);
  });

  it('leaves the lamps of the kerb that carries no line where they stand', () => {
    const tiles = row(1, 14, 5, { tier: RoadTier.FourLane });
    const lamps = lampsOf(tiles);
    const lay = layerOf(tiles);
    const poleSide = Math.sign(lay(lamps).poles[0]!.z - 5 * 20 - 10);
    const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
    const other = lamps.filter((l) => Math.sign(l.z - 5 * 20 - 10) !== poleSide);
    expect(other.length).toBeGreaterThan(0);
    for (const stand of other) expect(settled.posts).toContainEqual(stand);
  });

  it('is the same on every run: no randomness', () => {
    const tiles = row(1, 14, 5, { tier: RoadTier.Avenue });
    const lamps = lampsOf(tiles);
    expect(carryLampsOnPoles(lamps, chunked(tiles), flat)).toEqual(
      carryLampsOnPoles(lamps, chunked(tiles), flat),
    );
  });
});

describe('a junction keeps its lamps and signals clear of the wires', () => {
  /** Two streets meeting at (8, 8), the meeting under signals; the north arm is left out for a T. */
  const meeting = (tier: RoadTier, north: boolean): FurnitureRoadTile[] => [
    ...row(1, 14, 8, { tier }).map((t) => (t.x === 8 ? { ...t, control: 'signal' as const } : t)),
    ...col(8, north ? 1 : 9, 14, { tier }).filter((t) => t.z !== 8),
  ];
  const junctions: [string, FurnitureRoadTile[]][] = [
    ['a crossroads of avenues', meeting(RoadTier.Avenue, true)],
    ['a T of avenues', meeting(RoadTier.Avenue, false)],
    ['a crossroads of two-lane streets', meeting(RoadTier.TwoLane, true)],
    ['a crossroads of four-lane roads', meeting(RoadTier.FourLane, true)],
  ];

  it.each(junctions)('%s', (_name, tiles) => {
    const lamps = lampsOf(tiles);
    const lay = layerOf(tiles);
    const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
    const final = lay(settled.posts);
    expect(nearestWire(settled.posts, final)).toBeGreaterThanOrEqual(WIRE_FROM_POST_M);
    const signals = computeSignPlacements(tiles)
      .filter((s) => s.type === 'signal')
      .map((s) => fixtureOf(signalPolylines(s, 0)));
    expect(signals.length).toBeGreaterThan(0);
    expect(leastWireDistance(final.spans, signals, flat)).toBeGreaterThanOrEqual(2);
  });
});

describe('a power pole that slides off a taken place', () => {
  const MAX_STREET_SPAN_M = 45.72;

  it('never leaves a span longer than the longest street span: an extra pole stands first', () => {
    const tiles = row(1, 14, 5);
    const base = layerOf(tiles)([]).poles.find((p) => Math.floor(p.x / 20) === 5)!;
    const crowd = (tileX: number, from: number, to: number) =>
      [...Array.from({ length: (to - from) / 2 + 1 }, (_, i) => from + i * 2)].map((d) => ({
        x: tileX * 20 + 10 + d,
        z: base.z,
        reachX: 0,
        reachZ: 0,
      }));
    const held = [...crowd(3, -7, 7), ...crowd(5, -7, 7)];
    const lay = layerOf(tiles)(held);
    const xs = lay.poles.map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(MAX_STREET_SPAN_M);
    for (const span of lay.spans) {
      expect(Math.hypot(span.b.x - span.a.x, span.b.z - span.a.z)).toBeLessThanOrEqual(
        MAX_STREET_SPAN_M,
      );
    }
  });
});

describe('a span across a junction', () => {
  it('is no longer than the longest street span: poles stand on the tiles beside the junction', () => {
    const tiles = [...row(1, 14, 8), ...col(8, 1, 14).filter((t) => t.z !== 8)];
    const lay = layerOf(tiles)([]);
    expect(lay.spans.length).toBeGreaterThan(4);
    for (const span of lay.spans) {
      expect(Math.hypot(span.b.x - span.a.x, span.b.z - span.a.z)).toBeLessThanOrEqual(45.72);
    }
    // No pole stands on the junction tile itself.
    expect(lay.poles.some((p) => Math.floor(p.x / 20) === 8 && Math.floor(p.z / 20) === 8)).toBe(
      false,
    );
  });
});

describe('the height of a luminaire on a power pole', () => {
  const topOf = (stand: LampStand): number =>
    Math.max(
      ...lampPolylines(stand, 0)
        .flat()
        .map((p) => p[1]),
    );

  it.each([8.7, 9.5, 12])(
    'puts the bracket top 0.76 m under a wire %d m up, to the millimetre',
    (wire) => {
      const height = bracketHeightUnder(wire);
      const stand: LampStand = { x: 0, z: 0, reachX: 0, reachZ: 1, height, bracket: true };
      expect(topOf(stand)).toBeCloseTo(wire - 0.76, 6);
    },
  );

  it.each([
    [
      'along x, the arm at 9.5 m',
      (): FurnitureRoadTile[] => row(1, 14, 5, { tier: RoadTier.Avenue }),
    ],
    [
      'along z, the arm at 8.7 m',
      (): FurnitureRoadTile[] => col(5, 1, 14, { tier: RoadTier.Avenue }),
    ],
  ])(
    'hangs every carried luminaire on a line %s under it, never above its own lamp',
    (_n, make) => {
      const tiles = make();
      const lamps = lampsOf(tiles);
      const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
      expect(settled.carried.length).toBeGreaterThan(0);
      const poles = layerOf(tiles)(settled.posts).poles;
      for (const stand of settled.carried) {
        const pole = poles.find((p) => p.x === stand.x && p.z === stand.z)!;
        expect(topOf(stand)).toBeLessThanOrEqual(pole.arm - 0.76 + 1e-9);
        const own = lamps.find((l) => l.reachX === stand.reachX && l.reachZ === stand.reachZ)!;
        expect(stand.height!).toBeCloseTo(Math.min(own.height!, bracketHeightUnder(pole.arm)), 9);
        expect(stand.height!).toBeLessThanOrEqual(own.height!);
      }
    },
  );

  it('keeps the lamp’s own height where that already clears the wires by 0.76 m', () => {
    // A 6.1 m lamp under a 9.5 m arm: the bracket limit is above it.
    expect(bracketHeightUnder(9.5)).toBeGreaterThan(6.1);
    expect(Math.min(6.1, bracketHeightUnder(9.5))).toBe(6.1);
  });
});

describe('the pole that carries a lamp', () => {
  /** A run of street poles along x at z 0, with the keys given, and the spans between them. */
  const runOf = (xs: number[], keys: number[]): LayPoles => {
    const sites = xs.map((x, i) => ({ key: keys[i]!, kind: 'street' as const, x, z: 0 }));
    const poles = sites.map((s, i) =>
      shapePole(
        s,
        [sites[i - 1], sites[i + 1]].filter((n): n is (typeof sites)[number] => n !== undefined),
      ),
    );
    const spans = poles.slice(1).map((b, i) => ({ a: poles[i]!, b }));
    return () => new Map([[0, { poles, spans }]]);
  };
  const lampAt = (x: number, z = 1.6, height = 12.2): LampStand => ({
    x,
    z,
    reachX: 0,
    reachZ: -1,
    height,
  });

  it('is the nearest within 60 m along, and a tie goes to the lower pole key', () => {
    const lay = runOf([0, 40, 80, 120], [1, 7, 3, 9]);
    const settled = carryLampsOnPoles([lampAt(60)], lay, flat);
    expect(settled.posts).toEqual([]);
    // Poles at 40 (key 7) and 80 (key 3) are both 20 m off: the lower key, 3, at 80.
    expect(settled.carried.map((s) => s.x)).toEqual([80]);
    const nearer = carryLampsOnPoles([lampAt(50)], lay, flat);
    expect(nearer.carried.map((s) => s.x)).toEqual([40]);
  });

  it('never stands further than 60 m from the place of its lamp', () => {
    const lay = runOf([0, 40, 80, 120, 160, 200], [1, 2, 3, 4, 5, 6]);
    const settled = carryLampsOnPoles([lampAt(100)], lay, flat);
    expect(Math.abs(settled.carried[0]!.x - 100)).toBeLessThanOrEqual(60);
  });

  it('is on the lamp’s own kerb, within 3 m across the street, however near another is', () => {
    const lay = runOf([0, 40, 80, 120], [1, 2, 3, 4]);
    // A lamp 5 m across from the line, 5 m from a pole along: that pole is on the other side.
    const across = carryLampsOnPoles([lampAt(41, 5, 9.1)], lay, flat);
    expect(across.carried).toEqual([]);
    const same = carryLampsOnPoles([lampAt(41, 2.9, 9.1)], lay, flat);
    expect(same.carried.map((s) => s.x)).toEqual([40]);
  });

  it('is not drawn when no pole is within reach: no light stands under a wire', () => {
    // Two poles 140 m apart, a lamp mid-span: the wire passes it and every pole is 70 m off.
    const lay = runOf([0, 140], [1, 2]);
    const lamp = lampAt(70);
    const settled = carryLampsOnPoles([lamp], lay, flat);
    expect(settled.posts).toEqual([]);
    expect(settled.carried).toEqual([]);
    const none = carryLampsOnPoles([lamp], () => new Map([[0, { poles: [], spans: [] }]]), flat);
    expect(none.posts).toEqual([lamp]);
  });

  it('keeps the spacing of one kerb’s lamps: they move the same way every time', () => {
    const tiles = row(1, 19, 5, { tier: RoadTier.Avenue });
    const lamps = lampsOf(tiles);
    const poleSide = Math.sign(layerOf(tiles)(lamps).poles[0]!.z - 5 * 20 - 10);
    const kerb = lamps
      .filter((l) => Math.sign(l.z - 5 * 20 - 10) === poleSide)
      .map((l) => l.x)
      .sort((a, b) => a - b);
    const settled = carryLampsOnPoles(lamps, chunked(tiles), flat);
    const hung = settled.carried.map((s) => s.x).sort((a, b) => a - b);
    expect(hung).toHaveLength(kerb.length);
    expect(kerb.length).toBeGreaterThan(2);
    for (let i = 1; i < kerb.length; i++) {
      expect(hung[i]! - hung[i - 1]!).toBe(kerb[i]! - kerb[i - 1]!);
    }
  });

  it('is the same whether the poles are laid again everywhere or only round the lamps that moved', () => {
    const tiles = [
      ...row(1, 14, 8, { tier: RoadTier.Avenue }),
      ...col(8, 1, 14).filter((t) => t.z !== 8),
    ];
    const lamps = lampsOf(tiles);
    const everywhere: LayPoles = (posts) => chunked(tiles)(posts, null);
    expect(carryLampsOnPoles(lamps, chunked(tiles), flat)).toEqual(
      carryLampsOnPoles(lamps, everywhere, flat),
    );
  });
});

describe('the lamp renderer with luminaires on poles', () => {
  it('draws a post only for a lamp that has one, and the rest of the fixture for all of them', () => {
    const tiles = row(1, 14, 5, { tier: RoadTier.Avenue });
    const renderer = new LampRenderer(new THREE.Scene(), flat);
    renderer.rebuild(tiles, undefined, [], [], [], [], (stands) =>
      carryLampsOnPoles(stands, chunked(tiles), flat),
    );
    const all = renderer.lampStands();
    const carried = all.filter((s) => s.bracket);
    expect(carried.length).toBeGreaterThan(0);
    expect(renderer.lampCount()).toBe(all.length);
    expect(renderer.poleInstanceCount()).toBe(all.length - carried.length);
    expect(renderer.armInstanceCount()).toBe(all.length);
    expect(renderer.housingInstanceCount()).toBe(all.length);
    expect(renderer.lensInstanceCount()).toBe(all.length);
    expect(renderer.standSpots()).toHaveLength(all.length - carried.length);
    // The pool lies under every luminaire, a carried one's included.
    expect(renderer.poolVertexCount()).toBe(all.length * 1 * (1 + 5 * 24));
    // Lit with the others at night.
    renderer.setTimeOfDay(0);
    expect(renderer.lensEmissiveIntensity()).toBeGreaterThan(0);
  });
});
