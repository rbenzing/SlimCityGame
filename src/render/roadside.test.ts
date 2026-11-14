import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  hasFootway,
  hasKerbs,
  parkingSides,
  plainLaneCentres,
  presetProfileForTier,
  ROAD_PRESETS,
  withTurnPocket,
} from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { JunctionControl, MapData, RoadProfile } from '../shared/types';
import { createGrid } from '../world/grid';
import { deriveRoadFootprint, laySegment, planSegment } from '../world/freeroads';
import { networkFromGrid, reconcileRoads, syncRoadLayers } from '../world/roadnet';
import { freeRoadLampStands, freeRoadPoleLay } from './freeroadmesh';
import { computeLampPlacements, standOf, standsOf, STOP_CLEAR_HALF_M } from './lamps';
import { markingPlan } from './roadmarkings';
import { PAINT_HALF_WIDTH_M, medianTreeStands } from './roadsmesh';
import {
  computeBoxPlacements,
  computeManholePlacements,
  computeMeterPlacements,
  computeSignPlacements,
  computeTramPolePlacements,
  controlSignSpots,
  SIGN_BOARD_BOTTOM_M,
  SIGNAL_ARM_REACH_M,
  SIGNAL_HEAD_BOTTOM_M,
  SIGNAL_HEAD_TOP_M,
  signWorldTransform,
  tileKey,
  buildTileSet,
  lateralAxis,
  type FurnitureRoadTile,
  type SignPlacement,
} from './roadfurniture';
import {
  alongOffsets,
  keepClearOf,
  MAST_BEHIND_KERB_M,
  OBJECT_GAP_M,
  outranks,
  ROADSIDE_ORDER,
  SIGN_BEHIND_KERB_M,
  SIGN_BOTTOM_NO_WALK_M,
  SIGN_BOTTOM_OVER_WALK_M,
  SIGN_EDGE_BEHIND_KERB_M,
  SIGN_NO_KERB_M,
  SIGNAL_HEAD_MAX_M,
  SIGNAL_HEAD_MIN_M,
  Standing,
  TREE_FROM_CONTROL_M,
  TREE_FROM_DRIVE_M,
  TREE_FROM_LAMP_M,
  type Roadside,
  type StopSite,
} from './roadsidespace';
import { layStreetChunk, streetPoleSpots, type PowerWorld } from './powerpoles';
import { TreeRenderer } from './trees';

const COVER_RADIUS_M = 0.5;
const flat = (): number => 0;

type Spec = Partial<FurnitureRoadTile> & { powered?: boolean };
const row = (z: number, x0: number, x1: number, spec: Spec = {}): FurnitureRoadTile[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({
    x: x0 + i,
    z,
    tier: RoadTier.TwoLane,
    powered: true,
    ...spec,
  }));
const col = (x: number, z0: number, z1: number, spec: Spec = {}): FurnitureRoadTile[] =>
  Array.from({ length: z1 - z0 + 1 }, (_, i) => ({
    x,
    z: z0 + i,
    tier: RoadTier.TwoLane,
    powered: true,
    ...spec,
  }));

/** A crossroads at (cx, cz) with arms of `arm` tiles each way. */
const crossroads = (
  cx: number,
  cz: number,
  arm: number,
  control: JunctionControl,
  spec: Spec = {},
) =>
  [
    ...row(cz, cx - arm, cx + arm, spec),
    ...col(cx, cz - arm, cz + arm, spec).filter((t) => t.z !== cz),
  ].map((t) => (t.x === cx && t.z === cz ? { ...t, control } : t));

const spotOf = (p: SignPlacement): { x: number; z: number } => {
  const at = signWorldTransform(p);
  return { x: at.x, z: at.z };
};

const presets = ROAD_PRESETS.filter((s) => s.profile);

describe('a manhole cover lies in the middle of one plain lane', () => {
  for (const spec of presets) {
    it(`on tier ${spec.tier}: off every painted line, band and rail, in one lane along the run`, () => {
      const profile = spec.profile!;
      const covers = computeManholePlacements(row(10, 0, 59, { tier: spec.tier, profile }));
      const plan = markingPlan(profile);
      const lanes = plainLaneCentres(profile);
      for (const c of covers) {
        expect(lanes.some((l) => Math.abs(l - c.lateral) < 1e-9)).toBe(true);
        for (const line of [...plan.solid, ...plan.dashed]) {
          expect(Math.abs(line.at - c.lateral)).toBeGreaterThanOrEqual(
            COVER_RADIUS_M + PAINT_HALF_WIDTH_M,
          );
        }
        for (const band of plan.bands) {
          expect(
            c.lateral + COVER_RADIUS_M <= band.from || c.lateral - COVER_RADIUS_M >= band.to,
          ).toBe(true);
        }
        if (plan.turnLane) {
          const { from, to } = plan.turnLane;
          expect(c.lateral + COVER_RADIUS_M <= from || c.lateral - COVER_RADIUS_M >= to).toBe(true);
        }
      }
      expect(new Set(covers.map((c) => c.lateral)).size).toBeLessThanOrEqual(1);
    });
  }

  it('lays covers on some road at all, and never on a railway', () => {
    const total = presets.reduce(
      (n, s) =>
        n + computeManholePlacements(row(10, 0, 59, { tier: s.tier, profile: s.profile })).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
    expect(computeManholePlacements(row(10, 0, 59, { tier: RoadTier.RailTrack }))).toEqual([]);
  });

  it('keeps off a lane a tram shares, a bike lane, a bus lane and a turn bay', () => {
    const tram: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'travel', width: 3.75, flow: 'back', tram: true },
        { kind: 'travel', width: 3.75, flow: 'fwd', tram: true },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    expect(computeManholePlacements(row(10, 0, 59, { profile: tram }))).toEqual([]);
    const lanes: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'bike', width: 1.875, flow: 'back' },
        { kind: 'bus', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    const covers = computeManholePlacements(row(10, 0, 59, { profile: lanes }));
    expect(covers.length).toBeGreaterThan(0);
    // The first plain travel lane from the low side: past the bike and bus lanes.
    for (const c of covers) expect(c.lateral).toBeCloseTo(plainLaneCentres(lanes)[0]!, 9);
    expect(plainLaneCentres(lanes)[0]!).toBeGreaterThan(-3.75 - 1.875 - 3.75 / 2 + 3.75);
    const pocket = withTurnPocket(presetProfileForTier(RoadTier.TwoLane), 1);
    if (pocket) {
      expect(computeManholePlacements(row(10, 0, 59, { profile: pocket }))).toEqual([]);
    }
  });

  it('lies a whole tile from a junction, clear of its crosswalk, stop line and arrows', () => {
    const tiles = crossroads(30, 10, 30, 'signal');
    const covers = computeManholePlacements(tiles);
    expect(covers.length).toBeGreaterThan(0);
    for (const c of covers) {
      expect(c.x === 30 && c.z === 10).toBe(false);
      const toJunction = Math.hypot(
        tileToWorld(c.x) - tileToWorld(30),
        tileToWorld(c.z) - tileToWorld(10),
      );
      // A tile's middle is 10 m from the junction's edge, where the stop line
      // and the crosswalk lie; arrows lie within 6 m of it.
      expect(toJunction).toBeGreaterThanOrEqual(TILE_METERS + TILE_METERS / 2);
    }
  });
});

describe('a sign’s post stands in the furnishing strip', () => {
  const streets = presets.filter(
    (s) => hasKerbs(s.profile!) && s.tier !== RoadTier.Highway && s.tier !== RoadTier.Ramp,
  );

  for (const spec of streets) {
    it(`on tier ${spec.tier}: 0.46 m behind the kerb face, the board 2.1 m up and its edge 0.3 m behind`, () => {
      const profile = spec.profile!;
      const half = carriagewayHalfWidthOf(profile);
      // A dead end carries the no-through board.
      const signs = computeSignPlacements(row(10, 0, 2, { tier: spec.tier, profile })).filter(
        (s) => s.type === 'nothrough',
      );
      expect(signs.length).toBeGreaterThan(0);
      for (const s of signs) {
        expect(s.lateralOffset - half).toBeCloseTo(SIGN_BEHIND_KERB_M, 9);
        // A board is a few centimetres thick, standing edge-on to the kerb.
        expect(s.lateralOffset - half - 0.05).toBeGreaterThanOrEqual(SIGN_EDGE_BEHIND_KERB_M);
        expect(s.bottom).toBe(
          hasFootway(profile) ? SIGN_BOTTOM_OVER_WALK_M : SIGN_BOTTOM_NO_WALK_M,
        );
      }
    });
  }

  it('is modelled with the bottom of a full-size board 2.1 m over the walk', () => {
    expect(SIGN_BOARD_BOTTOM_M).toBeCloseTo(SIGN_BOTTOM_OVER_WALK_M, 9);
    expect(SIGN_BOTTOM_NO_WALK_M).toBe(1.5);
  });

  it('stands 3.7 m from the travelled way where there is no kerb, or at the tile’s edge', () => {
    const bare: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
      ],
    };
    expect(hasKerbs(bare)).toBe(false);
    const signs = computeSignPlacements(row(10, 0, 2, { profile: bare })).filter(
      (s) => s.type === 'nothrough',
    );
    expect(signs.length).toBeGreaterThan(0);
    for (const s of signs) {
      expect(s.lateralOffset).toBeCloseTo(Math.min(3.75 + SIGN_NO_KERB_M, TILE_METERS / 2), 9);
      expect(s.bottom).toBe(SIGN_BOTTOM_NO_WALK_M);
    }
    const wide: RoadProfile = {
      class: 'local',
      pieces: [{ kind: 'travel', width: 16, flow: 'both' }],
    };
    for (const s of computeSignPlacements(row(10, 0, 2, { profile: wide }))) {
      expect(s.lateralOffset).toBeLessThanOrEqual(TILE_METERS / 2);
    }
  });

  it('puts a stop sign on the near right at the stop line', () => {
    const tiles = crossroads(5, 10, 4, 'allWayStop');
    const profile = presetProfileForTier(RoadTier.TwoLane);
    const half = carriagewayHalfWidthOf(profile);
    const stops = computeSignPlacements(tiles).filter((s) => s.type === 'stop');
    expect(stops.length).toBe(4);
    for (const s of stops) {
      const at = spotOf(s);
      const toward = { x: Math.sign(5 - s.x), z: Math.sign(10 - s.z) };
      const right = { x: -toward.z, z: toward.x };
      const rel = { x: at.x - tileToWorld(s.x), z: at.z - tileToWorld(s.z) };
      // On the driver's right, in the strip, at the tile's end by the junction.
      expect(rel.x * right.x + rel.z * right.z).toBeCloseTo(half + SIGN_BEHIND_KERB_M, 9);
      expect(rel.x * toward.x + rel.z * toward.z).toBeCloseTo(TILE_METERS / 2 - 0.35, 9);
    }
  });
});

describe('a signal’s mast stands at the far right corner of its junction', () => {
  const streets = presets.filter(
    (s) => hasKerbs(s.profile!) && s.tier !== RoadTier.Highway && s.tier !== RoadTier.Ramp,
  );

  for (const spec of streets) {
    it(`on tier ${spec.tier}: 0.61 m behind the kerb face, its arm over the lanes, the head 4.6 to 7.8 m up`, () => {
      const profile = spec.profile!;
      const half = carriagewayHalfWidthOf(profile);
      const tiles = crossroads(8, 10, 4, 'signal', { tier: spec.tier, profile });
      const masts = computeSignPlacements(tiles).filter((s) => s.type === 'signal');
      expect(masts.length).toBe(4);
      for (const m of masts) {
        const at = spotOf(m);
        const toward = { x: Math.sign(8 - m.x), z: Math.sign(10 - m.z) };
        const right = { x: -toward.z, z: toward.x };
        const rel = { x: at.x - tileToWorld(m.x), z: at.z - tileToWorld(m.z) };
        const lateral = rel.x * right.x + rel.z * right.z;
        const along = rel.x * toward.x + rel.z * toward.z;
        expect(lateral - half).toBeCloseTo(MAST_BEHIND_KERB_M, 9);
        // Past the junction: its centre is a tile ahead, its far edge a tile and a half.
        expect(along).toBeGreaterThan(TILE_METERS * 1.5);
        // The arm reaches back over the lanes it holds, never along the footway.
        const head = lateral - SIGNAL_ARM_REACH_M;
        expect(head).toBeLessThan(half);
        expect(head).toBeGreaterThan(-half);
        expect(m.yaw).toBeDefined();
      }
    });
  }

  it('hangs the head between 4.6 and 7.8 m over the road', () => {
    expect(SIGNAL_HEAD_BOTTOM_M).toBeGreaterThanOrEqual(SIGNAL_HEAD_MIN_M);
    expect(SIGNAL_HEAD_TOP_M).toBeLessThanOrEqual(SIGNAL_HEAD_MAX_M);
  });

  it('stands at the stop line on the near right where no road lies beyond the junction', () => {
    // A T: the road from the west ends against a street running north and south.
    const tiles = [...row(10, 0, 8), ...col(8, 6, 14).filter((t) => t.z !== 10)].map((t) =>
      t.x === 8 && t.z === 10 ? { ...t, control: 'signal' as const } : t,
    );
    const masts = computeSignPlacements(tiles).filter((s) => s.type === 'signal');
    const fromWest = masts.find((m) => m.x === 7 && m.z === 10)!;
    expect(fromWest).toBeDefined();
    const at = spotOf(fromWest);
    expect(at.x - tileToWorld(7)).toBeCloseTo(TILE_METERS / 2 - 0.35, 9);
  });
});

describe('a meter stands behind the kerb of the stall it serves', () => {
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

  it('is 0.46 m behind the kerb face, never on the road side of the parking lane', () => {
    const half = carriagewayHalfWidthOf(parked);
    const meters = computeMeterPlacements(row(10, 0, 59, { profile: parked }));
    expect(meters.length).toBeGreaterThan(0);
    for (const m of meters) {
      expect(m.lateralOffset).toBeGreaterThan(half);
      expect(m.lateralOffset - half).toBeCloseTo(0.46, 9);
    }
  });

  it('serves the kerb its stall lies against', () => {
    const lowOnly: RoadProfile = { ...parked, pieces: parked.pieces.filter((_, i) => i !== 4) };
    const sides = parkingSides(lowOnly);
    expect(sides).toEqual({ low: true, high: false });
    const meters = computeMeterPlacements(row(10, 0, 59, { profile: lowOnly }));
    expect(meters.length).toBeGreaterThan(0);
    for (const m of meters) expect(m.side).toBe(-1);
  });
});

describe('a street tree keeps clear', () => {
  it('stands on no road’s end cap, only where the road runs on both ways', () => {
    const NORTH = 1;
    const EAST = 2;
    const SOUTH = 4;
    const WEST = 8;
    let found = 0;
    for (let x = 0; x < 40; x++) {
      expect(medianTreeStands(RoadTier.Avenue, EAST, x, 3)).toBe(false);
      expect(medianTreeStands(RoadTier.Avenue, WEST, x, 3)).toBe(false);
      expect(medianTreeStands(RoadTier.Avenue, NORTH, 3, x)).toBe(false);
      expect(medianTreeStands(RoadTier.Avenue, SOUTH, 3, x)).toBe(false);
      if (medianTreeStands(RoadTier.Avenue, EAST | WEST, x, 3)) found++;
      expect(medianTreeStands(RoadTier.Avenue, EAST | SOUTH, x, 3)).toBe(false);
    }
    expect(found).toBeGreaterThan(5);
  });

  it('keeps 4.6 m from a lamp and 6.1 m from a stop sign or signal down an avenue', () => {
    const profile = presetProfileForTier(RoadTier.Avenue);
    const tiles = crossroads(20, 10, 18, 'signal', { tier: RoadTier.Avenue, profile });
    const lamps = computeLampPlacements(tiles).flatMap(standsOf);
    const control = controlSignSpots(tiles);
    expect(lamps.length).toBeGreaterThan(0);
    expect(control.length).toBeGreaterThan(0);
    let trees = 0;
    for (const t of tiles) {
      const EW = !(t.x === 20 && t.z !== 10);
      const mask = EW ? 2 | 8 : 1 | 4;
      if (!medianTreeStands(RoadTier.Avenue, mask, t.x, t.z)) continue;
      trees++;
      const p = { x: tileToWorld(t.x), z: tileToWorld(t.z) };
      for (const l of lamps)
        expect(Math.hypot(l.x - p.x, l.z - p.z)).toBeGreaterThanOrEqual(TREE_FROM_LAMP_M);
      for (const c of control) {
        expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeGreaterThanOrEqual(TREE_FROM_CONTROL_M);
      }
    }
    expect(trees).toBeGreaterThan(0);
  });

  it('is taken down by the scatter wherever it stands within reach of a lamp, a sign or a pad', () => {
    const size = 4;
    const map: MapData = {
      name: 'test',
      size,
      height: new Float32Array(size * size),
      water: new Uint8Array(size * size),
      trees: new Uint8Array(size * size).fill(255),
      seaLevel: 0,
      spawn: { x: 0, z: 0 },
    };
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flat);
    renderer.build(map, 7);
    const live = (): { x: number; z: number }[] => {
      const out: { x: number; z: number }[] = [];
      for (const species of ['broadleaf', 'pine', 'poplar', 'shrub'] as const) {
        const mesh = renderer.meshFor(species);
        if (!mesh) continue;
        const m = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          const e = m.elements;
          // A hidden tree is a zero-scale matrix.
          if (e[0] === 0 && e[5] === 0 && e[10] === 0) continue;
          out.push({ x: e[12]!, z: e[14]! });
        }
      }
      return out;
    };
    const before = live();
    const spot = { x: tileToWorld(1) + 4, z: tileToWorld(2), radius: TREE_FROM_LAMP_M };
    renderer.clearNear([spot]);
    const after = live();
    const inReach = (t: { x: number; z: number }): boolean =>
      Math.hypot(t.x - spot.x, t.z - spot.z) < spot.radius;
    expect(before.some(inReach)).toBe(true);
    expect(after.some(inReach)).toBe(false);
    // Only the trees in reach went.
    expect(after.length).toBe(before.filter((t) => !inReach(t)).length);
    expect(TREE_FROM_DRIVE_M).toBe(1.8);
  });
});

describe('one object to a place', () => {
  const stopsAt = (x: number, z: number, side: 0 | 1): StopSite[] => [{ x, z, side }];

  /** The roadside a placer is told of: the keep-clear places and what already stands. */
  const side = (
    tiles: FurnitureRoadTile[],
    taken: { x: number; z: number }[] = [],
    stops: StopSite[] = [],
    drives?: Set<number>,
  ): Roadside => {
    const set = buildTileSet(tiles);
    return {
      clear: keepClearOf(
        drives,
        stops,
        STOP_CLEAR_HALF_M,
        (x, z) => lateralAxis(set, x, z),
        tileKey,
      ),
      taken: new Standing().addAll(taken),
    };
  };

  it('ranks signal, stop sign, tram pole, lamp, power pole, sign, meter, cabinet, tree', () => {
    expect(ROADSIDE_ORDER).toEqual([
      'signal',
      'stopSign',
      'tramPole',
      'lamp',
      'powerPole',
      'sign',
      'meter',
      'cabinet',
      'tree',
    ]);
    expect(outranks('signal', 'tree')).toBe(true);
    expect(outranks('tree', 'lamp')).toBe(false);
    expect(OBJECT_GAP_M).toBe(1.5);
  });

  it('slides along a strip, nearest the middle first', () => {
    expect(alongOffsets(1.5)).toEqual([0, 0.5, -0.5, 1, -1, 1.5, -1.5]);
  });

  it('moves a tram pole off a signal mast or stop sign, and leaves the mast where it stands', () => {
    const tiles = row(10, 0, 20, { tier: RoadTier.Tram });
    const base = computeTramPolePlacements(tiles);
    // Both kerb poles of a span stand together, so the pair slides as one.
    const victim = base[2]!;
    const partner = base[3]!;
    const sign = { x: victim.x + 0.6, z: victim.z };
    const moved = computeTramPolePlacements(tiles, undefined, side(tiles, [sign]));
    expect(moved.length).toBe(base.length);
    expect(Math.hypot(moved[2]!.x - sign.x, moved[2]!.z - sign.z)).toBeGreaterThanOrEqual(1.5);
    expect(moved[3]!.x).toBeCloseTo(moved[2]!.x, 9);
    expect(moved[3]!.z).toBe(partner.z);
    expect(moved.filter((_, i) => i !== 2 && i !== 3).map((p) => p.x)).toEqual(
      base.filter((_, i) => i !== 2 && i !== 3).map((p) => p.x),
    );
  });

  it('moves a lamp off a mast, and a mast is never moved for a lamp', () => {
    const tiles = row(10, 0, 20);
    const lamps = computeLampPlacements(tiles).map(standOf);
    const mast = { x: lamps[1]!.x + 0.3, z: lamps[1]!.z };
    const moved = computeLampPlacements(tiles, undefined, [], [], [mast]).map(standOf);
    expect(moved.length).toBe(lamps.length);
    for (const l of moved)
      expect(Math.hypot(l.x - mast.x, l.z - mast.z)).toBeGreaterThanOrEqual(1.5);
  });

  it('moves a power pole off a lamp, a tram pole or a mast', () => {
    const tiles = row(5, 1, 14);
    const world = (taken: { x: number; z: number }[]): PowerWorld => ({
      tileSet: buildTileSet(tiles),
      keepOff: new Set(),
      closed: new Set(),
      roadside: side(tiles, taken),
    });
    const base = layStreetChunk(world([]), 0).poles;
    expect(base.length).toBeGreaterThan(3);
    const lamp = { x: base[2]!.x + 0.2, z: base[2]!.z - 1.4 };
    const moved = layStreetChunk(world([lamp]), 0).poles;
    expect(moved.length).toBe(base.length);
    for (const p of moved)
      expect(Math.hypot(p.x - lamp.x, p.z - lamp.z)).toBeGreaterThanOrEqual(1.5);
    // Only the pole beside the lamp moved.
    expect(moved.filter((_, i) => i !== 2).map((p) => [p.x, p.z])).toEqual(
      base.filter((_, i) => i !== 2).map((p) => [p.x, p.z]),
    );
  });

  it('moves a board, a meter and a cabinet off whatever stands before them', () => {
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
    const tiles = row(10, 0, 59, { profile: parked, tier: RoadTier.OneWay });
    const meters = computeMeterPlacements(tiles);
    expect(meters.length).toBeGreaterThan(2);
    const spotOfMeter = (m: (typeof meters)[number]): { x: number; z: number } => ({
      x: tileToWorld(m.x) + m.along,
      z: tileToWorld(m.z) + m.lateralOffset * m.side,
    });
    const held = spotOfMeter(meters[0]!);
    const around = side(tiles, [{ x: held.x + 0.2, z: held.z }]);
    const moved = computeMeterPlacements(tiles, around);
    expect(moved.length).toBeGreaterThanOrEqual(meters.length - 1);
    for (const m of moved) {
      const p = spotOfMeter(m);
      expect(Math.hypot(p.x - held.x - 0.2, p.z - held.z)).toBeGreaterThanOrEqual(1.5);
    }
    // Each meter it puts down is taken for those after it.
    for (let i = 0; i < moved.length; i++) {
      for (let j = i + 1; j < moved.length; j++) {
        const a = spotOfMeter(moved[i]!);
        const b = spotOfMeter(moved[j]!);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(1.5);
      }
    }
    // A cabinet gives way too: dropped or moved ≥ 1.5 from what holds its place.
    const boxes = computeBoxPlacements(row(10, 0, 79));
    expect(boxes.length).toBeGreaterThan(1);
    const box = boxes[0]!;
    const boxAt = {
      x: tileToWorld(box.x) + (box.axis === 'x' ? box.lateralOffset * box.side : 0),
      z: tileToWorld(box.z) + (box.axis === 'z' ? box.lateralOffset * box.side : 0),
    };
    const blocked = computeBoxPlacements(row(10, 0, 79), side(row(10, 0, 79), [boxAt]));
    for (const b of blocked) {
      const p = {
        x: tileToWorld(b.x) + (b.axis === 'x' ? b.lateralOffset * b.side : (b.along ?? 0)),
        z: tileToWorld(b.z) + (b.axis === 'z' ? b.lateralOffset * b.side : (b.along ?? 0)),
      };
      expect(Math.hypot(p.x - boxAt.x, p.z - boxAt.z)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('moves a one-way board off a lamp it would stand against', () => {
    const tiles = row(10, 0, 40, { tier: RoadTier.OneWay });
    const free = computeSignPlacements(tiles).filter((s) => s.type === 'oneway');
    expect(free.length).toBeGreaterThan(0);
    const held = spotOf(free[0]!);
    const moved = computeSignPlacements(tiles, side(tiles, [held])).filter(
      (s) => s.type === 'oneway',
    );
    for (const s of moved) {
      const p = spotOf(s);
      expect(Math.hypot(p.x - held.x, p.z - held.z)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('keeps every object of a laid-out street 1.5 m from every other', () => {
    const tiles = crossroads(12, 10, 10, 'signal', { tier: RoadTier.TwoLane });
    const stops = stopsAt(8, 10, 0);
    const clear = side(tiles, [], stops).clear;
    const control = controlSignSpots(tiles);
    const poles = computeTramPolePlacements(tiles, undefined, {
      clear,
      taken: new Standing().addAll(control),
    });
    const lamps = computeLampPlacements(tiles, undefined, poles, stops, control).flatMap(standsOf);
    const upper = new Standing().addAll(control).addAll(poles).addAll(lamps);
    const world: PowerWorld = {
      tileSet: buildTileSet(tiles),
      keepOff: new Set(),
      closed: new Set(),
      roadside: { clear, taken: upper },
    };
    const power = streetPoleSpots(world);
    const roadside = { clear, taken: upper.clone().addAll(power) };
    const signs = computeSignPlacements(tiles, roadside).filter(
      (s) => !['signal', 'stop', 'giveway'].includes(s.type),
    );
    const meters = computeMeterPlacements(tiles, roadside);
    const boxes = computeBoxPlacements(tiles, roadside);
    // Every object of each lower kind stands 1.5 m from every higher one.
    const spotsOf = {
      lower: [
        ...signs.map(spotOf),
        ...meters.map((m) => ({
          x: tileToWorld(m.x) + (m.curbAxis === 'x' ? m.lateralOffset * m.side : m.along),
          z: tileToWorld(m.z) + (m.curbAxis === 'z' ? m.lateralOffset * m.side : m.along),
        })),
        ...boxes.map((b) => ({
          x: tileToWorld(b.x) + (b.axis === 'x' ? b.lateralOffset * b.side : (b.along ?? 0)),
          z: tileToWorld(b.z) + (b.axis === 'z' ? b.lateralOffset * b.side : (b.along ?? 0)),
        })),
      ],
      higher: [...control, ...poles, ...lamps, ...power],
    };
    for (const a of spotsOf.lower) {
      for (const b of spotsOf.higher) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(OBJECT_GAP_M - 1e-9);
      }
    }
    // The lamps clear the signals and the poles; the power poles clear the lamps.
    for (const l of lamps) {
      for (const b of [...control, ...poles]) {
        expect(Math.hypot(l.x - b.x, l.z - b.z)).toBeGreaterThanOrEqual(OBJECT_GAP_M - 1e-9);
      }
    }
    for (const p of power) {
      for (const b of [...control, ...poles, ...lamps]) {
        expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThanOrEqual(OBJECT_GAP_M - 1e-9);
      }
    }
  });
});

describe('a bus stop’s span and a drive are kept clear of every object', () => {
  const tiles = row(5, 0, 24);
  const set = buildTileSet(tiles);
  const stop: StopSite = { x: 10, z: 5, side: 1 };
  const clear = keepClearOf(
    undefined,
    [stop],
    STOP_CLEAR_HALF_M,
    (x, z) => lateralAxis(set, x, z),
    tileKey,
  );

  it('blocks the stop’s side of its tile out to 2.59 m either side, and nothing else', () => {
    const cx = tileToWorld(10);
    const cz = tileToWorld(5);
    expect(clear.blocks(cx, cz + 4)).toBe(true);
    expect(clear.blocks(cx + STOP_CLEAR_HALF_M - 0.1, cz + 4)).toBe(true);
    expect(clear.blocks(cx + STOP_CLEAR_HALF_M + 0.1, cz + 4)).toBe(false);
    expect(clear.blocks(cx, cz - 4)).toBe(false);
    expect(clear.blocks(tileToWorld(11), cz + 4)).toBe(false);
  });

  it('stands no power pole in the span, and moves it along its strip instead', () => {
    const world = (stops: StopSite[]): PowerWorld => ({
      tileSet: set,
      keepOff: new Set(),
      closed: new Set(),
      roadside: {
        clear: keepClearOf(
          undefined,
          stops,
          STOP_CLEAR_HALF_M,
          (x, z) => lateralAxis(set, x, z),
          tileKey,
        ),
        taken: new Standing(),
      },
    });
    const free = layStreetChunk(world([]), 0).poles;
    const poleSide = Math.sign(free[0]!.z - tileToWorld(5));
    // The stop on the poles' own kerb, on whichever even tile carries one.
    const target = free.find((p) => p.x > tileToWorld(2) && p.x < tileToWorld(14))!;
    const tx = Math.floor(target.x / TILE_METERS);
    const there: StopSite = { x: tx, z: 5, side: poleSide > 0 ? 1 : 0 };
    const held = layStreetChunk(world([there]), 0).poles;
    const sc = tileToWorld(tx);
    for (const p of held) {
      const inSpan =
        Math.sign(p.z - tileToWorld(5)) === poleSide &&
        Math.floor(p.x / TILE_METERS) === tx &&
        Math.abs(p.x - sc) < STOP_CLEAR_HALF_M;
      expect(inSpan).toBe(false);
    }
    expect(held.length).toBe(free.length);
    // Only what stands beside the stop changed.
    const far = (p: { x: number }): boolean => Math.abs(p.x - sc) > 2 * TILE_METERS;
    expect(held.filter(far).map((p) => [p.x, p.z])).toEqual(
      free.filter(far).map((p) => [p.x, p.z]),
    );
  });

  it('lays again only what stands beside a changed stop or drive', () => {
    const lamps = (stops: StopSite[], drives?: Set<number>): string[] =>
      computeLampPlacements(row(5, 0, 59), drives, [], stops).map(
        (p) => `${p.x},${p.z},${p.side},${p.along ?? 0}`,
      );
    const none = lamps([]);
    const withStop = lamps([
      { x: 9, z: 5, side: 1 },
      { x: 9, z: 5, side: 0 },
    ]);
    const diff = (a: string[], b: string[]): string[] => [
      ...a.filter((s) => !b.includes(s)),
      ...b.filter((s) => !a.includes(s)),
    ];
    for (const s of diff(none, withStop)) expect(s.startsWith('9,5,')).toBe(true);
    const withDrive = lamps([], new Set([tileKey(9, 5)]));
    for (const s of diff(none, withDrive)) expect(s.startsWith('9,5,')).toBe(true);
    const meters = (stops: StopSite[]) =>
      computeMeterPlacements(
        row(5, 0, 59, { profile: { ...presetProfileForTier(RoadTier.TwoLane) } }),
        side2(stops),
      );
    const side2 = (stops: StopSite[]): Roadside => ({
      clear: keepClearOf(undefined, stops, STOP_CLEAR_HALF_M, () => 'z', tileKey),
      taken: new Standing(),
    });
    const m0 = meters([]);
    const m1 = meters([
      { x: 20, z: 5, side: 0 },
      { x: 20, z: 5, side: 1 },
    ]);
    const key = (m: { x: number; along: number; side: number }): string =>
      `${m.x},${m.along},${m.side}`;
    const changed = [
      ...m0.filter((m) => !m1.some((n) => key(n) === key(m))),
      ...m1.filter((m) => !m0.some((n) => key(n) === key(m))),
    ];
    for (const m of changed) expect(m.x).toBe(20);
  });
});

describe('a curved street’s lamps and poles keep off drives and stops as on the grid', () => {
  const SIZE = 48;
  const noCustom = (): null => null;
  const at = (x: number, z: number) => ({ x: Math.round(x * 100), z: Math.round(z * 100) });

  const laid = () => {
    const g = createGrid(SIZE);
    g.roads = networkFromGrid(g);
    const req = {
      tier: RoadTier.TwoLane,
      profileId: RoadTier.TwoLane,
      a: at(200, 200),
      b: at(500, 500),
      control: at(500, 200),
      flow: 0,
    };
    const p = planSegment(g, g.roads, req, noCustom);
    if (!p.ok) throw new Error(`refused: ${p.reason}`);
    laySegment(g, g.roads, p, req);
    reconcileRoads(g.roads, g);
    expect(syncRoadLayers(g, g.roads)).toEqual([]);
    deriveRoadFootprint(g, g.roads, noCustom);
    return g;
  };
  const powered = (): boolean => true;
  const lookup = noCustom;

  it('keeps every lamp off a drive’s tile and 1.5 m from what already stands', () => {
    const g = laid();
    const free = freeRoadLampStands(g.roads!, lookup, powered);
    expect(free.length).toBeGreaterThan(4);
    const driveTile = {
      x: Math.floor(free[3]!.x / TILE_METERS),
      z: Math.floor(free[3]!.z / TILE_METERS),
    };
    const drives = new Set([tileKey(driveTile.x, driveTile.z)]);
    const held = { x: free[0]!.x + 0.3, z: free[0]!.z };
    const roadside: Roadside = {
      clear: keepClearOf(drives, [], STOP_CLEAR_HALF_M, () => 'z', tileKey),
      taken: new Standing().addAll([held]),
    };
    const moved = freeRoadLampStands(g.roads!, lookup, powered, roadside);
    expect(moved.length).toBeGreaterThan(0);
    for (const s of moved) {
      expect(
        drives.has(tileKey(Math.floor(s.x / TILE_METERS), Math.floor(s.z / TILE_METERS))),
      ).toBe(false);
      expect(Math.hypot(s.x - held.x, s.z - held.z)).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('keeps every pole off a stop’s span on the street it stands beside', () => {
    const g = laid();
    const base = freeRoadPoleLay(g.roads!, lookup, powered).poles;
    expect(base.length).toBeGreaterThan(2);
    const held = { x: base[1]!.x + 0.2, z: base[1]!.z };
    const moved = freeRoadPoleLay(g.roads!, lookup, powered, {
      clear: keepClearOf(undefined, [], STOP_CLEAR_HALF_M, () => 'z', tileKey),
      taken: new Standing().addAll([held]),
    }).poles;
    for (const p of moved)
      expect(Math.hypot(p.x - held.x, p.z - held.z)).toBeGreaterThanOrEqual(1.5);
  });

  it('is the same on every lay', () => {
    const g = laid();
    expect(freeRoadLampStands(g.roads!, lookup, powered)).toEqual(
      freeRoadLampStands(g.roads!, lookup, powered),
    );
  });
});

describe('the shared module is pure and deterministic', () => {
  it('answers the same on every ask', () => {
    const a = new Standing().addAll([{ x: 3, z: 4 }]);
    expect(a.isFree(3.5, 4)).toBe(false);
    expect(a.isFree(3.5, 4)).toBe(false);
    expect(a.isFree(5.5, 4)).toBe(true);
    const copy = a.clone().addAll([{ x: 9, z: 9 }]);
    expect(a.isFree(9, 9)).toBe(true);
    expect(copy.isFree(9, 9)).toBe(false);
  });
});
