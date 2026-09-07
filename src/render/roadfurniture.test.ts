import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeBoxPlacements,
  computeManholePlacements,
  computeMeterPlacements,
  computeSignPlacements,
  FurnitureRoadTile,
  kerbFacingYaw,
  MANHOLE_LIFT,
  METER_KERB_CLEARANCE_M,
  RoadFurnitureRenderer,
} from './roadfurniture';
import { RoadTier } from '../shared/types';
import type { JunctionControl, RoadProfile } from '../shared/types';
import { carriagewayHalfWidthMeters, ROAD_Y_OFFSET, SIDEWALK_WIDTH_M } from './roadsmesh';
import { SIGNAL_CYCLE_S } from '../shared/junction';

const flatHeightAt = (): number => 0;

describe('kerb props stand at the tile’s own edge', () => {
  it('a meter on a two-lane with parking lanes sits at the 12 m carriageway’s kerb, not the preset’s', () => {
    const parked: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'parking', width: 2.25 },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    const run = (profile?: RoadProfile): FurnitureRoadTile[] =>
      Array.from({ length: 40 }, (_, i) => ({ x: i, z: 10, tier: RoadTier.TwoLane, profile }));
    const preset = computeMeterPlacements(run());
    const composed = computeMeterPlacements(run(parked));
    expect(preset.length).toBeGreaterThan(0);
    expect(composed.length).toBe(preset.length);
    // A meter stands at the KERB FACE of its own carriageway — beside the bay
    // it charges for — so what changes with the cross-section is the edge it
    // measures from, not the small clearance behind it.
    for (const m of preset) expect(m.lateralOffset).toBeCloseTo(3.75 + METER_KERB_CLEARANCE_M, 6);
    for (const m of composed) expect(m.lateralOffset).toBeCloseTo(6 + METER_KERB_CLEARANCE_M, 6);
    // And it stands ON the footway, never out at its back edge or in the road.
    for (const m of composed) {
      expect(m.lateralOffset).toBeGreaterThan(6);
      expect(m.lateralOffset).toBeLessThan(6 + SIDEWALK_WIDTH_M);
    }
    // A manhole stays inside the carriageway it belongs to, whichever width that is.
    for (const h of computeManholePlacements(run(parked))) {
      expect(Math.abs(h.lateral)).toBeLessThan(6);
    }
  });
});

/** Builds a straight run of same-tier tiles, horizontal (fixed z) or vertical (fixed x). */
function strip(
  fixed: number,
  from: number,
  to: number,
  orientation: 'ew' | 'ns',
  tier?: RoadTier,
): FurnitureRoadTile[] {
  const tiles: FurnitureRoadTile[] = [];
  for (let v = from; v <= to; v++) {
    const base = orientation === 'ew' ? { x: v, z: fixed } : { x: fixed, z: v };
    tiles.push(tier === undefined ? base : { ...base, tier });
  }
  return tiles;
}

/** A few parallel two-lane streets — enough tiles that every prop layer fires. */
function representativeGrid(): FurnitureRoadTile[] {
  const tiles: FurnitureRoadTile[] = [];
  for (const z of [0, 4, 8]) tiles.push(...strip(z, 0, 19, 'ew', RoadTier.TwoLane));
  return tiles;
}

/**
 * A plus with arms of length two — the distance-1 tiles are the approaches —
 * under whatever control the sim has put on the middle of it.
 */
const controlledPlus = (
  control: JunctionControl | undefined,
  tier: RoadTier = RoadTier.TwoLane,
  armTier: RoadTier = tier,
): FurnitureRoadTile[] => [
  { x: 0, z: 0, tier, control },
  { x: 1, z: 0, tier },
  { x: 2, z: 0, tier },
  { x: -1, z: 0, tier },
  { x: -2, z: 0, tier },
  { x: 0, z: 1, tier: armTier },
  { x: 0, z: 2, tier: armTier },
  { x: 0, z: -1, tier: armTier },
  { x: 0, z: -2, tier: armTier },
];

const PAVED_TIERS = [
  RoadTier.TwoLane,
  RoadTier.Avenue,
  RoadTier.Highway,
  RoadTier.Alley,
  RoadTier.OneWay,
  RoadTier.FourLane,
];

describe('road-furniture placement (pure)', () => {
  it('is deterministic: repeated calls on the same tiles give identical placements', () => {
    const tiles = strip(0, 0, 20, 'ew', RoadTier.TwoLane);
    expect(computeManholePlacements(tiles)).toEqual(computeManholePlacements(tiles));
    expect(computeBoxPlacements(tiles)).toEqual(computeBoxPlacements(tiles));
    expect(computeMeterPlacements(tiles)).toEqual(computeMeterPlacements(tiles));
    expect(computeSignPlacements(tiles)).toEqual(computeSignPlacements(tiles));
  });

  it('is order-independent for manholes: shuffled input yields the same placement set', () => {
    const ordered = strip(0, 0, 20, 'ew', RoadTier.TwoLane);
    const shuffled = [...ordered].reverse();
    const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
    const a = new Set(computeManholePlacements(ordered).map(key));
    const b = new Set(computeManholePlacements(shuffled).map(key));
    expect(a).toEqual(b);
  });

  it('places no manholes on gravel', () => {
    expect(computeManholePlacements(strip(0, 0, 20, 'ew', RoadTier.Gravel))).toEqual([]);
  });

  it('places no meters on Avenue, Highway, Gravel, or Alley (only curb-parking tiers)', () => {
    for (const tier of [RoadTier.Avenue, RoadTier.Highway, RoadTier.Gravel, RoadTier.Alley]) {
      expect(computeMeterPlacements(strip(0, 0, 20, 'ew', tier))).toEqual([]);
    }
  });

  it('places no boxes on gravel or alley (no curb)', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      expect(computeBoxPlacements(strip(0, 0, 20, 'ew', tier))).toEqual([]);
    }
  });

  it('places no signs on gravel or alley (no curb)', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      expect(computeSignPlacements(strip(0, 0, 20, 'ew', tier))).toEqual([]);
    }
  });

  it('keeps every manhole inside the carriageway and off the centerline, for each paved tier', () => {
    for (const tier of PAVED_TIERS) {
      const manholes = computeManholePlacements(strip(0, 0, 40, 'ew', tier));
      expect(manholes.length).toBeGreaterThan(0);
      const half = carriagewayHalfWidthMeters(tier);
      for (const m of manholes) {
        const mag = Math.abs(m.lateral);
        expect(mag).toBeGreaterThanOrEqual(0.6);
        expect(mag).toBeLessThanOrEqual(half - 0.5);
        expect(mag).toBeLessThan(half);
      }
    }
  });

  it('selects the expected periodic tiles for meter pairs along a straight run', () => {
    const meters = computeMeterPlacements(strip(0, 0, 20, 'ew', RoadTier.TwoLane)); // z=0
    const xs = [...new Set(meters.map((m) => m.x))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 5, 10, 15, 20]); // (x+0) % 5 === 0
    expect(meters.length).toBe(xs.length * 2); // two meters per selected tile
  });

  it('offsets the two meters of a pair to opposite sides of the tile center along the run', () => {
    const meters = computeMeterPlacements(strip(0, 0, 5, 'ew', RoadTier.TwoLane));
    const alongs = meters.filter((m) => m.x === 5).map((m) => m.along);
    expect(alongs).toEqual([3, -3]);
  });

  it("marks a dead-end tile (exactly one road neighbor) 'nothrough' and nothing else", () => {
    // (5,5)-(6,5)-(7,5): the two endpoints are dead ends, the middle is a plain run.
    const signs = computeSignPlacements(strip(5, 5, 7, 'ew', RoadTier.TwoLane));
    expect(signs.every((s) => s.type === 'nothrough')).toBe(true);
    expect(signs.filter((s) => s.x === 5).length).toBe(1); // exactly one on the dead end
    expect(signs.filter((s) => s.x === 7).length).toBe(1);
    expect(signs.some((s) => s.x === 6)).toBe(false); // middle run earns nothing
  });

  const APPROACHES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  const signAt =
    (signs: readonly { x: number; z: number; type: string }[]) =>
    (x: number, z: number): string | undefined =>
      signs.find((s) => s.x === x && s.z === z)?.type;

  it('signs nothing at a crossroads the sim has left uncontrolled', () => {
    // Two quiet streets crossing really do meet on sight lines; a board there
    // would be a board no highway authority put up.
    const signs = computeSignPlacements(controlledPlus(undefined));
    expect(signs.filter((s) => s.type === 'stop' || s.type === 'giveway')).toEqual([]);
    expect(signs.filter((s) => s.type === 'signal')).toEqual([]);
  });

  it('puts a stop board on every approach to an all-way stop', () => {
    const signs = computeSignPlacements(controlledPlus('allWayStop'));
    const at = signAt(signs);
    for (const [x, z] of APPROACHES) expect(at(x, z)).toBe('stop');
    expect(signs.some((s) => s.x === 0 && s.z === 0)).toBe(false); // the junction itself: no sign
  });

  it('puts a signal head on every approach to a signalised junction', () => {
    const signs = computeSignPlacements(controlledPlus('signal', RoadTier.Avenue));
    const at = signAt(signs);
    for (const [x, z] of APPROACHES) expect(at(x, z)).toBe('signal');
  });

  it('signs only the road that gives way at a minor-road stop', () => {
    // A two-lane side street crossing a four-lane one: the four-lane runs
    // through and is not signed, the side street stops.
    const signs = computeSignPlacements(
      controlledPlus('stop', RoadTier.FourLane, RoadTier.TwoLane),
    );
    const at = signAt(signs);
    expect(at(0, 1)).toBe('stop');
    expect(at(0, -1)).toBe('stop');
    expect(at(1, 0)).toBeUndefined();
    expect(at(-1, 0)).toBeUndefined();
  });

  it('gives way rather than stopping where the sim only warranted a give-way', () => {
    const signs = computeSignPlacements(
      controlledPlus('yield', RoadTier.FourLane, RoadTier.TwoLane),
    );
    const at = signAt(signs);
    expect(at(0, 1)).toBe('giveway');
    expect(at(1, 0)).toBeUndefined();
  });

  it('gives way at every entry to a roundabout, which is the one place it may', () => {
    const signs = computeSignPlacements(controlledPlus('roundabout'));
    const at = signAt(signs);
    for (const [x, z] of APPROACHES) expect(at(x, z)).toBe('giveway');
  });

  it('seats no parking meter across a junction, where there is no curb', () => {
    const t = RoadTier.TwoLane;
    const tiles = [...strip(4, 0, 20, 'ew', t), ...strip(4, 0, 20, 'ns', t)];
    const meters = computeMeterPlacements(tiles);
    expect(meters.some((m) => m.x === 4 && m.z === 4)).toBe(false);
  });

  it('signs only the stem of a T-junction where the bar runs through', () => {
    const t = RoadTier.TwoLane;
    // An east-west four-lane bar with a two-lane stem dropping south from its
    // centre: the bar runs through and the stem stops.
    const tiles: FurnitureRoadTile[] = [
      { x: -2, z: 0, tier: RoadTier.FourLane },
      { x: -1, z: 0, tier: RoadTier.FourLane },
      { x: 0, z: 0, tier: RoadTier.FourLane, control: 'stop' },
      { x: 1, z: 0, tier: RoadTier.FourLane },
      { x: 2, z: 0, tier: RoadTier.FourLane },
      { x: 0, z: 1, tier: t },
      { x: 0, z: 2, tier: t },
    ];
    const signs = computeSignPlacements(tiles);
    const at = (x: number, z: number): string | undefined =>
      signs.find((s) => s.x === x && s.z === z)?.type;
    expect(at(0, 1)).toBe('stop');
    expect(at(1, 0)).toBeUndefined();
    expect(at(-1, 0)).toBeUndefined();
    expect(signs.some((s) => s.x === 0 && s.z === 0)).toBe(false); // the junction itself: no sign
  });

  it("marks a turn (L) tile 'bend'", () => {
    const t = RoadTier.TwoLane;
    // (0,0)-(1,0)-(2,0) then up to (2,-1)-(2,-2); (2,0) is the corner.
    const tiles: FurnitureRoadTile[] = [
      { x: 0, z: 0, tier: t },
      { x: 1, z: 0, tier: t },
      { x: 2, z: 0, tier: t },
      { x: 2, z: -1, tier: t },
      { x: 2, z: -2, tier: t },
    ];
    const signs = computeSignPlacements(tiles);
    expect(signs.find((s) => s.x === 2 && s.z === 0)?.type).toBe('bend');
  });

  it('positions the bend sign at the curve OUTER corner, just past the sidewalk, facing the curve', () => {
    const t = RoadTier.TwoLane;
    // Corner (2,0) connects W (1,0) and N (2,-1): the curve hugs the NW tile
    // corner, so the sign stands on the opposite (SE) diagonal.
    const tiles: FurnitureRoadTile[] = [
      { x: 0, z: 0, tier: t },
      { x: 1, z: 0, tier: t },
      { x: 2, z: 0, tier: t },
      { x: 2, z: -1, tier: t },
      { x: 2, z: -2, tier: t },
    ];
    const sign = computeSignPlacements(tiles).find((s) => s.x === 2 && s.z === 0)!;
    expect(sign.type).toBe('bend');
    // radius = tileHalf + carriagewayHalf + sidewalk + margin, along the
    // (+1,+1)/sqrt(2) diagonal from the NW corner (-8,-8).
    const radius = 8 + carriagewayHalfWidthMeters(t) + SIDEWALK_WIDTH_M + 0.5;
    const expected = -8 + radius * Math.SQRT1_2;
    expect(sign.worldOffsetX).toBeCloseTo(expected, 5);
    expect(sign.worldOffsetZ).toBeCloseTo(expected, 5);
    // Faces back toward the corner (the oncoming curve traffic).
    expect(sign.yaw).toBeCloseTo(Math.atan2(-Math.SQRT1_2, -Math.SQRT1_2), 5);
    // Stays inside its own tile (never strands deep in a neighbor's grass).
    expect(Math.abs(sign.worldOffsetX!)).toBeLessThan(8);
    expect(Math.abs(sign.worldOffsetZ!)).toBeLessThan(8);
  });

  it('keeps manholes, boxes and meters OFF turn tiles (the curve owns the tile)', () => {
    // A staircase where every interior tile is a non-collinear 2-neighbor
    // turn — plenty of tiles so each prop layer's hash/period rules would
    // otherwise fire on several of them.
    const t = RoadTier.TwoLane;
    const tiles: FurnitureRoadTile[] = [];
    let x = 0;
    let z = 0;
    tiles.push({ x, z, tier: t });
    for (let k = 0; k < 24; k++) {
      if (k % 2 === 0) x += 1;
      else z += 1;
      tiles.push({ x, z, tier: t });
    }
    const turnTiles = new Set<string>();
    const byKey = new Set(tiles.map((p) => `${p.x},${p.z}`));
    for (const p of tiles) {
      const n = byKey.has(`${p.x},${p.z - 1}`);
      const e = byKey.has(`${p.x + 1},${p.z}`);
      const s = byKey.has(`${p.x},${p.z + 1}`);
      const w = byKey.has(`${p.x - 1},${p.z}`);
      const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
      const collinear = (n && s && !e && !w) || (e && w && !n && !s);
      if (count === 2 && !collinear) turnTiles.add(`${p.x},${p.z}`);
    }
    expect(turnTiles.size).toBeGreaterThan(10); // the staircase really is all turns

    for (const m of computeManholePlacements(tiles)) {
      expect(turnTiles.has(`${m.x},${m.z}`)).toBe(false);
    }
    for (const b of computeBoxPlacements(tiles)) {
      expect(turnTiles.has(`${b.x},${b.z}`)).toBe(false);
    }
    for (const m of computeMeterPlacements(tiles)) {
      expect(turnTiles.has(`${m.x},${m.z}`)).toBe(false);
    }
  });

  it("marks the periodic tiles of a One-Way straight run 'oneway'", () => {
    const signs = computeSignPlacements(strip(0, 0, 18, 'ew', RoadTier.OneWay)); // z=0
    const oneways = signs.filter((s) => s.type === 'oneway').map((s) => s.x);
    expect([...oneways].sort((a, b) => a - b)).toEqual([6, 12]); // (x+0) % 6 === 0, interior only
  });

  it("marks the periodic tiles of an Avenue straight run 'speed'", () => {
    const signs = computeSignPlacements(strip(0, 0, 30, 'ew', RoadTier.Avenue)); // z=0
    const speeds = signs.filter((s) => s.type === 'speed').map((s) => s.x);
    expect([...speeds].sort((a, b) => a - b)).toEqual([10, 20]); // (x+0) % 10 === 0, interior only
  });

  it('signs a highway overhead only — no street furniture on a motorway', () => {
    const tiles = strip(0, 0, 30, 'ew', RoadTier.Highway); // z=0
    const signs = computeSignPlacements(tiles);
    const types = new Set(signs.map((s) => s.type));

    // Nothing that belongs beside a street: no speed boards, no stopping, no
    // giving way, no bend or dead-end plates.
    for (const street of ['speed', 'stop', 'giveway', 'bend', 'oneway', 'nothrough', 'signal'])
      expect(types.has(street as never)).toBe(false);

    // Gantries instead, straddling the centreline rather than standing at a curb.
    const gantries = signs.filter((s) => s.type === 'gantry');
    expect(gantries.length).toBeGreaterThan(0);
    for (const g of gantries) expect(g.lateralOffset).toBe(0);
  });

  it('carries no boxes or meters along a highway', () => {
    const tiles = strip(0, 0, 30, 'ew', RoadTier.Highway);
    expect(computeBoxPlacements(tiles)).toEqual([]);
    expect(computeMeterPlacements(tiles)).toEqual([]);
  });

  it('marks where something leaves a highway as an exit', () => {
    const t = RoadTier.Highway;
    // A slip road dropping south off a highway running east-west.
    const tiles: FurnitureRoadTile[] = [
      ...strip(0, 0, 8, 'ew', t),
      { x: 4, z: 1, tier: t },
      { x: 4, z: 2, tier: t },
    ];
    const signs = computeSignPlacements(tiles);
    expect(signs.some((s) => s.type === 'exit')).toBe(true);
    // Never a signal or a stop board on a motorway junction.
    expect(signs.some((s) => s.type === 'signal' || s.type === 'stop')).toBe(false);
  });

  describe('up on a bridge deck', () => {
    /** The same run, once on the ground and once carried on a deck. */
    const grounded = (tier = RoadTier.TwoLane): FurnitureRoadTile[] => strip(0, 0, 39, 'ew', tier);
    const onDeck = (tier = RoadTier.TwoLane): FurnitureRoadTile[] =>
      grounded(tier).map((t) => ({ ...t, elevated: true }));

    it('carries none of the kerbside clutter, which has no verge to stand on', () => {
      // Each of these fires on the grounded run, so an empty deck result is the
      // deck rule and not an accident of the test's geometry.
      expect(computeManholePlacements(grounded()).length).toBeGreaterThan(0);
      expect(computeBoxPlacements(grounded()).length).toBeGreaterThan(0);
      expect(computeMeterPlacements(grounded()).length).toBeGreaterThan(0);

      expect(computeManholePlacements(onDeck())).toEqual([]);
      expect(computeBoxPlacements(onDeck())).toEqual([]);
      expect(computeMeterPlacements(onDeck())).toEqual([]);
    });

    it('still signs a junction on the deck, because it is still a junction', () => {
      const deckPlus = (tier: RoadTier, control: JunctionControl): FurnitureRoadTile[] =>
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [-1, 0],
          [-2, 0],
          [0, 1],
          [0, 2],
          [0, -1],
          [0, -2],
        ].map(([x, z]) => ({
          x: x!,
          z: z!,
          tier,
          elevated: true,
          ...(x === 0 && z === 0 ? { control } : {}),
        }));

      const boards = computeSignPlacements(deckPlus(RoadTier.TwoLane, 'allWayStop'));
      expect(boards.filter((s) => s.type === 'stop').length).toBe(4);

      const signals = computeSignPlacements(deckPlus(RoadTier.Avenue, 'signal'));
      expect(signals.filter((s) => s.type === 'signal').length).toBe(4);
    });

    it('signs an elevated motorway overhead, where its signage belongs anyway', () => {
      const tiles: FurnitureRoadTile[] = strip(0, 0, 39, 'ew', RoadTier.Highway).map((t) => ({
        ...t,
        elevated: true,
      }));
      const signs = computeSignPlacements(tiles);
      expect(signs.length).toBeGreaterThan(0);
      expect(signs.every((s) => s.type === 'gantry')).toBe(true);
    });

    it('drops the verge boards, which would stand on thin air', () => {
      // A dead-ended deck run: 'nothrough' is a board on the verge, and a deck
      // has none.
      const stub = strip(5, 5, 7, 'ew', RoadTier.TwoLane);
      expect(computeSignPlacements(stub).some((s) => s.type === 'nothrough')).toBe(true);
      expect(
        computeSignPlacements(stub.map((t) => ({ ...t, elevated: true }))).some(
          (s) => s.type === 'nothrough',
        ),
      ).toBe(false);
    });
  });

  it('never seats a cabinet on a tile that already carries a sign', () => {
    // A lattice of streets: long runs for the cabinets, junctions and dead ends
    // for the boards. Both stand at the tile centre on a chosen side at the
    // same offset out from the carriageway, so sharing a tile means growing
    // through each other.
    const tiles: FurnitureRoadTile[] = [];
    for (const line of [0, 4, 8, 12, 16, 20]) {
      tiles.push(...strip(line, 0, 20, 'ew', RoadTier.TwoLane));
      tiles.push(...strip(line, 0, 20, 'ns', RoadTier.TwoLane));
    }

    const boxes = computeBoxPlacements(tiles);
    const signs = computeSignPlacements(tiles);
    expect(boxes.length).toBeGreaterThan(0); // both layers really fired
    expect(signs.length).toBeGreaterThan(0);

    const signTiles = new Set(signs.map((s) => `${s.x},${s.z}`));
    const clashes = boxes.filter((b) => signTiles.has(`${b.x},${b.z}`));
    expect(clashes).toEqual([]);
  });

  it('leaves a rail line alone — a track is not a street', () => {
    const track = strip(0, 0, 39, 'ew', RoadTier.RailTrack);
    expect(computeManholePlacements(track)).toEqual([]);
    expect(computeBoxPlacements(track)).toEqual([]);
    expect(computeMeterPlacements(track)).toEqual([]);
    expect(computeSignPlacements(track)).toEqual([]);
  });

  it('produces no placements for an empty road tile list', () => {
    expect(computeManholePlacements([])).toEqual([]);
    expect(computeBoxPlacements([])).toEqual([]);
    expect(computeMeterPlacements([])).toEqual([]);
    expect(computeSignPlacements([])).toEqual([]);
  });
});

describe('RoadFurnitureRenderer', () => {
  it('produces non-zero counts across all four layers on a representative grid', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const counts = renderer.furnitureCounts();
    expect(counts.manholes).toBeGreaterThan(0);
    expect(counts.boxes).toBeGreaterThan(0);
    expect(counts.meters).toBeGreaterThan(0);
    expect(counts.signs).toBeGreaterThan(0);
  });

  it('adds one InstancedMesh per non-empty layer, sized to that layer count', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    // manhole, cabinet, telco pedestal, meter, sign — the two cabinets share a
    // slot and a siting rule but not a shape, so each takes its own layer.
    expect(meshes.length).toBe(5);

    const counts = renderer.furnitureCounts();
    const total = counts.manholes + counts.boxes + counts.meters + counts.signs;
    expect(meshes.reduce((sum, m) => sum + m.count, 0)).toBe(total);
  });

  it('lights one lens per signal head, and cycles which one', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    // A signalised crossroads: an east-west bar with a north-south stem,
    // controlled by signals, so all four approaches carry a head.
    renderer.rebuild(controlledPlus('signal', RoadTier.Avenue));

    const lamps = scene.children.find(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.userData.furnitureKind === 'signalLamp',
    );
    expect(lamps).toBeDefined();
    expect(lamps!.count).toBe(4);

    // At the top of the cycle the north-south pair runs and the east-west pair
    // waits; half a cycle later they have swapped. Nobody ever sees two greens.
    renderer.setSignalPhase(0);
    const start = renderer.signalAspects();
    expect(start.filter((a) => a === 'green')).toHaveLength(2);
    expect(start.filter((a) => a === 'red')).toHaveLength(2);

    renderer.setSignalPhase(SIGNAL_CYCLE_S / 2);
    const halfway = renderer.signalAspects();
    expect(halfway).not.toEqual(start);
    expect(halfway.filter((a) => a === 'green')).toHaveLength(2);
    for (let i = 0; i < start.length; i++) {
      expect(halfway[i]).not.toBe(start[i]);
    }

    // A full cycle round is where it started.
    renderer.setSignalPhase(SIGNAL_CYCLE_S);
    expect(renderer.signalAspects()).toEqual(start);
  });

  it('has no lamp layer at all where no junction is signalised', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());
    expect(
      scene.children.some((c) => (c as THREE.Object3D).userData.furnitureKind === 'signalLamp'),
    ).toBe(false);
    expect(renderer.signalAspects()).toEqual([]);
  });

  it('manholes receive but do not cast shadows; boxes cast shadows', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const manhole = meshes.find((m) => m.userData.furnitureKind === 'manhole')!;
    expect(manhole.castShadow).toBe(false);
    expect(manhole.receiveShadow).toBe(true);

    const box = meshes.find((m) => m.userData.furnitureKind === 'box')!;
    expect(box.castShadow).toBe(true);
  });

  it('tags each sign layer by furnitureKind and its signType, casting shadows', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const signMeshes = meshes.filter((m) => m.userData.furnitureKind === 'sign');
    expect(signMeshes.length).toBeGreaterThan(0);
    for (const mesh of signMeshes) {
      expect(mesh.castShadow).toBe(true);
      expect(typeof mesh.userData.signType).toBe('string');
    }
  });

  it('a second rebuild disposes the previous meshes instead of accumulating them', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());
    const first = scene.children.filter((c) => c instanceof THREE.InstancedMesh);

    renderer.rebuild(representativeGrid());
    const second = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(second.length).toBe(5);
    for (const mesh of first) expect(scene.children).not.toContain(mesh);
  });

  it('rebuild() with no road tiles clears every layer back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    renderer.rebuild([]);
    const counts = renderer.furnitureCounts();
    expect(counts.manholes).toBe(0);
    expect(counts.boxes).toBe(0);
    expect(counts.meters).toBe(0);
    expect(counts.signs).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });

  it('dispose() removes every layer from the scene', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadFurnitureRenderer(scene, flatHeightAt);
    renderer.rebuild(representativeGrid());

    renderer.dispose();
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });
});

describe('a board faces the traffic it speaks to', () => {
  /** The direction a board with this yaw looks, given boards are authored facing +z. */
  const facing = (yaw: number): { x: number; z: number } => ({
    x: Math.round(Math.sin(yaw) * 1e6) / 1e6,
    z: Math.round(Math.cos(yaw) * 1e6) / 1e6,
  });

  it('looks back along the road, never across it', () => {
    // The kerb a board stands on runs along one axis; whichever kerb it is,
    // the board must look ALONG the carriageway rather than out over it.
    for (const axis of ['x', 'z'] as const) {
      for (const side of [1, -1] as const) {
        const look = facing(kerbFacingYaw(axis, side));
        // A kerb on the x axis means the road runs along z, so the board looks
        // along z — and vice versa.
        if (axis === 'x') {
          expect(Math.abs(look.z)).toBeCloseTo(1, 6);
          expect(Math.abs(look.x)).toBeCloseTo(0, 6);
        } else {
          expect(Math.abs(look.x)).toBeCloseTo(1, 6);
          expect(Math.abs(look.z)).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('looks the opposite way on the opposite kerb', () => {
    // The two kerbs of a road address opposing streams, so their boards cannot
    // face the same way.
    for (const axis of ['x', 'z'] as const) {
      const a = facing(kerbFacingYaw(axis, 1));
      const b = facing(kerbFacingYaw(axis, -1));
      expect(a.x).toBeCloseTo(-b.x, 6);
      expect(a.z).toBeCloseTo(-b.z, 6);
    }
  });

  it('gives every kerbside board a facing, not just the ones at a junction', () => {
    // A dead end: the board used to take the authored +z facing whatever way
    // the road ran, so on an east-west stub it stood edge-on to the driver.
    const run: FurnitureRoadTile[] = [
      { x: 1, z: 5, tier: RoadTier.TwoLane },
      { x: 2, z: 5, tier: RoadTier.TwoLane },
      { x: 3, z: 5, tier: RoadTier.TwoLane },
    ];
    const signs = computeSignPlacements(run);
    expect(signs.length).toBeGreaterThan(0);
    for (const s of signs) {
      expect(s.yaw, `${s.type} at ${s.x},${s.z}`).toBeDefined();
      // An east-west road: every board looks along x, never along z.
      const look = facing(s.yaw!);
      expect(Math.abs(look.x)).toBeCloseTo(1, 6);
    }
  });
});

describe('a parking meter needs a bay to charge for', () => {
  const bay: RoadProfile = {
    class: 'local',
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      { kind: 'parking', width: 2.25 },
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'sidewalk', width: 1.875 },
    ],
  };
  const noBay: RoadProfile = {
    class: 'local',
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'sidewalk', width: 1.875 },
    ],
  };
  const run = (profile: RoadProfile): FurnitureRoadTile[] =>
    Array.from({ length: 24 }, (_, i) => ({ x: i, z: 5, tier: RoadTier.TwoLane, profile }));

  it('stands meters along a street that has parking', () => {
    expect(computeMeterPlacements(run(bay)).length).toBeGreaterThan(0);
  });

  it('stands none along the same street with the parking taken out', () => {
    // The tier still says "the sort of road that often has parking"; the tile's
    // own cross-section says there is nowhere to park, and it is the one that
    // decides.
    expect(computeMeterPlacements(run(noBay))).toEqual([]);
  });

  it('falls back to the tier where a tile carries no composed profile', () => {
    const plain: FurnitureRoadTile[] = Array.from({ length: 24 }, (_, i) => ({
      x: i,
      z: 5,
      tier: RoadTier.TwoLane,
    }));
    expect(computeMeterPlacements(plain).length).toBeGreaterThan(0);
  });
});

describe('a sewer cover sits ON the road, not under it', () => {
  it('lifts a manhole clear of the asphalt, which is itself above the ground', () => {
    // Kerb props are seated from the TERRAIN, and the carriageway is drawn
    // ROAD_Y_OFFSET above it. A cover lifted only a few centimetres from the
    // ground was buried: every one was drawn and not one could be seen.
    expect(MANHOLE_LIFT).toBeGreaterThan(ROAD_Y_OFFSET);
  });

  it('puts a cover on every paved road, and none on a dirt one', () => {
    const run = (tier: RoadTier): FurnitureRoadTile[] =>
      Array.from({ length: 60 }, (_, i) => ({ x: i, z: 7, tier }));
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Alley, RoadTier.FourLane]) {
      expect(computeManholePlacements(run(tier)).length, `tier ${tier}`).toBeGreaterThan(0);
    }
    expect(computeManholePlacements(run(RoadTier.Gravel))).toEqual([]);
    expect(computeManholePlacements(run(RoadTier.RailTrack))).toEqual([]);
  });
});

describe('a street gets a mix of cabinets, not a row of identical boxes', () => {
  const longRun = (): FurnitureRoadTile[] => {
    const tiles: FurnitureRoadTile[] = [];
    for (const z of [0, 4, 8, 12, 16]) tiles.push(...strip(z, 0, 39, 'ew', RoadTier.TwoLane));
    return tiles;
  };

  it('stands both the rectangular cabinet and the round telco pedestal', () => {
    const boxes = computeBoxPlacements(longRun());
    expect(boxes.length).toBeGreaterThan(4);
    const kinds = new Set(boxes.map((b) => b.kind));
    expect(kinds).toContain('cabinet');
    expect(kinds).toContain('pedestal');
  });

  it('picks which from the tile, so the same street always looks the same', () => {
    const a = computeBoxPlacements(longRun());
    const b = computeBoxPlacements([...longRun()].reverse());
    const key = (p: { x: number; z: number; kind: string }): string => `${p.x},${p.z},${p.kind}`;
    expect(new Set(a.map(key))).toEqual(new Set(b.map(key)));
  });

  it('stands each behind the footway on its own depth, never overhanging it', () => {
    // Each is set back by HALF ITS OWN depth beyond the footway's back edge,
    // so its near face lands exactly there and its body is out on the verge.
    // The pedestal's concrete pad is a shade wider than the cabinet, so it
    // stands a shade further out — each measured from itself, not a constant.
    const boxes = computeBoxPlacements(longRun());
    const backOfFootway = carriagewayHalfWidthMeters(RoadTier.TwoLane) + SIDEWALK_WIDTH_M;
    for (const b of boxes) {
      expect(b.lateralOffset).toBeGreaterThan(backOfFootway);
      // …and not flung out into the middle of the verge either.
      expect(b.lateralOffset).toBeLessThan(backOfFootway + 0.5);
    }
    const cabinet = boxes.find((b) => b.kind === 'cabinet')!;
    const pedestal = boxes.find((b) => b.kind === 'pedestal')!;
    expect(cabinet.lateralOffset).not.toBeCloseTo(pedestal.lateralOffset, 6);
  });
});
