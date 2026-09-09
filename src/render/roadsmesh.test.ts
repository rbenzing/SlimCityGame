import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  roadTileVertices,
  RoadMeshRenderer,
  dashSegments,
  crosswalkBarOffsets,
  junctionArmLayout,
  isAvenueMedianEligible,
  isHighwayDividerEligible,
  hasMedianTree,
  gravelColorAt,
  isArrowTile,
  ARROW_PERIOD_TILES,
  DASH_PAINT_LENGTH_M,
  DASH_GAP_LENGTH_M,
  DASH_PERIOD_M,
  TURN_ARC_SEGMENTS,
  JUNCTION_CORNER_SEGMENTS,
  END_CAP_SEGMENTS,
  CAP_Y_OFFSET,
  isPlainCenterlineTier,
  CURB_Y_OFFSET,
  TWO_LANE_HALF_WIDTH_FRACTION,
  HIGHWAY_HALF_WIDTH_FRACTION,
  AVENUE_HALF_WIDTH_FRACTION,
  GRAVEL_HALF_WIDTH_FRACTION,
  ALLEY_HALF_WIDTH_FRACTION,
  FOUR_LANE_HALF_WIDTH_FRACTION,
  BUS_LANE_HALF_WIDTH_FRACTION,
  BIKE_LANE_HALF_WIDTH_FRACTION,
  TRAM_HALF_WIDTH_FRACTION,
  RAIL_HALF_WIDTH_FRACTION,
  carriagewayHalfWidthMeters,
  curbWidthMeters,
  isLaneGlyphTile,
  LANE_GLYPH_PERIOD_TILES,
  SIDEWALK_WIDTH_M,
} from './roadsmesh';
import { RoadFlow, RoadTileDelta, RoadTier } from '../shared/types';
import type { JunctionControl, RoadProfile } from '../shared/types';
import { carriagewayHalfWidthOf, kerbWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { BIKE_PAINT_MAX_WIDTH_M, markingPlan } from './roadmarkings';
import { CHUNK_TILES, TILE_METERS } from '../shared/constants';
import { DEFAULT_ALLOWED, Movement } from '../shared/approach';

const flatHeightAt = (): number => 0;

/**
 * Local mirror of the documented neighbor-bitmask convention (shared/types.ts
 * GridState.roadMask / RoadTileDelta.mask): +N=1 +E=2 +S=4 +W=8, confirmed
 * against src/world/roads.ts computeMask (N = neighbor at z-1, E = x+1,
 * S = z+1, W = x-1).
 */
const N = 1;
const E = 2;
const S = 4;
const W = 8;

/**
 * A junction the sim has controlled. Crossings and stop bars follow the
 * control, so a test about the geometry of an arm's markings has to say what
 * the junction is controlled BY; `allWayStop` holds every arm, which is what
 * these tests want to see painted.
 */
function controlledJunction(
  x: number,
  z: number,
  tier: RoadTier,
  mask: number,
  control: JunctionControl = 'allWayStop',
): { positions: number[]; colors: number[] } {
  return roadTileVertices(
    x,
    z,
    tier,
    mask,
    flatHeightAt,
    undefined,
    undefined,
    undefined,
    undefined,
    control,
  );
}

function avg(triple: readonly number[]): number {
  return ((triple[0] ?? 0) + (triple[1] ?? 0) + (triple[2] ?? 0)) / 3;
}

/** Splits a flat [r,g,b,r,g,b,...] array into triples. */
function toTriples(flat: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < flat.length; i += 3) out.push(flat.slice(i, i + 3));
  return out;
}

/** Lane paint reads as a bright, neutral white — distinct from the dimmer
 * near-white sidewalk band and from every (much darker) asphalt tier color. */
function isMarkingWhite(t: readonly number[]): boolean {
  const [r, g, b] = t as [number, number, number];
  return r > 0.9 && g > 0.9 && b > 0.9;
}

/** Centre-line paint: US yellow, separating traffic going opposite ways. */
function isMarkingYellow(t: readonly number[]): boolean {
  const [r, g, b] = t as [number, number, number];
  return r > 0.85 && g > 0.6 && g < 0.85 && b < 0.35;
}

/** Any painted line, whichever colour it is. */
function isPaint(t: readonly number[]): boolean {
  return isMarkingWhite(t) || isMarkingYellow(t);
}

/** Sidewalk/shoulder curb: near-white, but distinctly dimmer than lane paint. */
function isSidewalk(t: readonly number[]): boolean {
  const [r, g, b] = t as [number, number, number];
  return r > 0.72 && r < 0.9 && g > 0.72 && g < 0.9 && b > 0.72 && b < 0.9;
}

/** Avenue median grass top: a clearly green (not grey/white) vertex color. */
function isMedianGrass(t: readonly number[]): boolean {
  const [r, g, b] = t as [number, number, number];
  return g > r && g > b && g > 0.35 && g < 0.65;
}

/** Median concrete edge / highway barrier: a mid-grey distinct from every asphalt tier shade and from the sidewalk band. */
function isConcreteBand(t: readonly number[]): boolean {
  const [r, g, b] = t as [number, number, number];
  return Math.abs(r - g) < 0.03 && Math.abs(g - b) < 0.03 && r > 0.45 && r < 0.58;
}

function countWhere(colors: readonly number[], pred: (t: readonly number[]) => boolean): number {
  return toTriples(colors).filter(pred).length;
}

function vertexCount(positions: readonly number[]): number {
  return positions.length / 3;
}

describe('roadTileVertices — transit lane variants (Bus Lane / Bike Lane)', () => {
  const isBusPaint = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return r > 0.45 && r > g + 0.2 && r > b + 0.2 && g < 0.35 && b < 0.32;
  };
  const isBikePaint = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return g > 0.3 && g > r + 0.15 && g > b + 0.12 && r < 0.28;
  };

  it('paints a terracotta band + keeps white markings on a straight bus-lane run', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.BusLane, N | S, flatHeightAt);
    expect(countWhere(colors, isBusPaint)).toBeGreaterThan(0);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0); // four-lane white set reused
    expect(countWhere(colors, isBikePaint)).toBe(0);
  });

  it('paints a green band on a straight bike-lane run, never terracotta', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.BikeLane, N | S, flatHeightAt);
    expect(countWhere(colors, isBikePaint)).toBeGreaterThan(0);
    expect(countWhere(colors, isBusPaint)).toBe(0);
  });

  it('breaks the colored band at junctions (paint stops at crossings)', () => {
    const straight = roadTileVertices(0, 0, RoadTier.BusLane, N | S, flatHeightAt);
    const junction = roadTileVertices(0, 0, RoadTier.BusLane, N | E | S | W, flatHeightAt);
    expect(countWhere(straight.colors, isBusPaint)).toBeGreaterThan(0);
    expect(countWhere(junction.colors, isBusPaint)).toBe(0);
  });

  it('places lane glyphs periodically + deterministically', () => {
    expect(LANE_GLYPH_PERIOD_TILES).toBeGreaterThanOrEqual(2);
    expect(isLaneGlyphTile(0)).toBe(true);
    expect(isLaneGlyphTile(LANE_GLYPH_PERIOD_TILES)).toBe(true);
    expect(isLaneGlyphTile(-LANE_GLYPH_PERIOD_TILES)).toBe(true);
    expect(isLaneGlyphTile(1)).toBe(false);
    // A glyph tile (z=0) carries more white paint than a non-glyph tile (z=1).
    const glyph = roadTileVertices(0, 0, RoadTier.BusLane, N | S, flatHeightAt);
    const plain = roadTileVertices(0, 1, RoadTier.BusLane, N | S, flatHeightAt);
    expect(countWhere(glyph.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(plain.colors, isMarkingWhite),
    );
  });

  it('is deterministic — identical output for identical inputs', () => {
    const a = roadTileVertices(2, 5, RoadTier.BikeLane, N | S, flatHeightAt);
    const b = roadTileVertices(2, 5, RoadTier.BikeLane, N | S, flatHeightAt);
    expect(a.positions).toEqual(b.positions);
    expect(a.colors).toEqual(b.colors);
  });

  it('gives a wide tier the curb it has room for, not a footway it does not', () => {
    // A two-lane leaves plenty of tile beyond its carriageway, so it draws a
    // full footway. A motorway is 15m of road in a 16m tile: half a metre of
    // kerb, because its shoulders are inside the paved width already.
    expect(curbWidthMeters(RoadTier.TwoLane)).toBeCloseTo(SIDEWALK_WIDTH_M, 5);
    // A motorway draws a KERB, not a pavement — nobody walks beside one, and
    // its shoulders are inside the paved width already. It keeps that kerb
    // however much tile is left over: drawing whatever fits is how a road
    // comes to look like it has somewhere to walk when it has not.
    const kerb = curbWidthMeters(RoadTier.Highway);
    expect(kerb).toBeGreaterThan(0);
    expect(kerb).toBeLessThan(SIDEWALK_WIDTH_M);
    expect(carriagewayHalfWidthMeters(RoadTier.Highway) + kerb).toBeLessThan(TILE_METERS / 2);
  });

  it('draws no curb at all where the tier has none', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley, RoadTier.RailTrack])
      expect(curbWidthMeters(tier)).toBe(0);
  });

  it('every tier draws exactly the carriageway, kerb and paint it always has, now read from its preset profile', () => {
    // The geometry flags come from the cross-section; these are the values the
    // hand-written per-tier table used to hold, so a preset that drifted from
    // its tier would show up here as a changed road.
    const expected: [RoadTier, number, boolean, boolean][] = [
      [RoadTier.TwoLane, TWO_LANE_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.Avenue, AVENUE_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.Highway, HIGHWAY_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.Gravel, GRAVEL_HALF_WIDTH_FRACTION, false, false],
      [RoadTier.Alley, ALLEY_HALF_WIDTH_FRACTION, false, true],
      [RoadTier.OneWay, TWO_LANE_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.FourLane, FOUR_LANE_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.BusLane, BUS_LANE_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.BikeLane, BIKE_LANE_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.Tram, TRAM_HALF_WIDTH_FRACTION, true, true],
      [RoadTier.RailTrack, RAIL_HALF_WIDTH_FRACTION, false, false],
    ];
    for (const [tier, halfFraction, kerbs, paved] of expected) {
      expect(carriagewayHalfWidthMeters(tier)).toBeCloseTo(TILE_METERS * halfFraction, 6);
      expect(curbWidthMeters(tier) > 0).toBe(kerbs);
      // Paint is the observable of `paved`: every paved tier marks its junction
      // arms (stop line, crosswalk), and an unpaved one paints nothing at all.
      const junction = controlledJunction(3, 3, tier, N | E | S | W);
      expect(countWhere(junction.colors, isMarkingWhite) > 0).toBe(paved);
    }
  });

  it('draws a composed profile at its own width, and a preset passed explicitly exactly as before', () => {
    const extent = (v: { positions: number[] }, centreX: number): number => {
      let max = 0;
      for (let i = 0; i < v.positions.length; i += 3) {
        max = Math.max(max, Math.abs(v.positions[i]! - centreX));
      }
      return max;
    };
    const centreX = (3 + 0.5) * TILE_METERS;
    const preset = roadTileVertices(3, 3, RoadTier.TwoLane, N | S, flatHeightAt);
    const explicit = roadTileVertices(
      3,
      3,
      RoadTier.TwoLane,
      N | S,
      flatHeightAt,
      undefined,
      presetProfileForTier(RoadTier.TwoLane),
    );
    expect(explicit.positions).toEqual(preset.positions);
    expect(explicit.colors).toEqual(preset.colors);

    // Three 3.5 m lanes with footways: 10.5 m of carriageway plus a full kerb
    // each side, on a tile whose nearest preset is the 7.5 m two-lane.
    const threeLane: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.9 },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'centreTurn', width: 3.5 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'sidewalk', width: 1.9 },
      ],
    };
    const custom = roadTileVertices(
      3,
      3,
      RoadTier.TwoLane,
      N | S,
      flatHeightAt,
      undefined,
      threeLane,
    );
    // Its own footway width, not the standard one: a section that says how
    // wide its pavement is gets exactly that drawn.
    expect(extent(custom, centreX)).toBeCloseTo(10.5 / 2 + 1.9, 3);
    expect(extent(preset, centreX)).toBeCloseTo(7.5 / 2 + SIDEWALK_WIDTH_M, 3);
  });

  it('carriageways match their documented lane widths', () => {
    // Bus = four-lane/highway width; Bike sits between two-lane and four-lane.
    expect(carriagewayHalfWidthMeters(RoadTier.BusLane)).toBeCloseTo(
      carriagewayHalfWidthMeters(RoadTier.Highway),
    );
    const two = carriagewayHalfWidthMeters(RoadTier.TwoLane);
    const bike = carriagewayHalfWidthMeters(RoadTier.BikeLane);
    const four = carriagewayHalfWidthMeters(RoadTier.FourLane);
    expect(bike).toBeGreaterThan(two);
    expect(bike).toBeLessThan(four);
  });
});

describe('roadTileVertices — tram track (RoadTier.Tram)', () => {
  const isRail = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return r > 0.66 && r < 0.78 && Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
  };
  const isSleeper = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return r > 0.2 && r < 0.34 && r > g && g >= b;
  };

  it('embeds two steel rails + cross-tie sleepers on a straight run', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Tram, N | S, flatHeightAt);
    expect(countWhere(colors, isRail)).toBeGreaterThan(0);
    expect(countWhere(colors, isSleeper)).toBeGreaterThan(0);
  });

  it('has NO painted centerline on a straight run (the rails are the centre)', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Tram, N | S, flatHeightAt);
    // No yellow: nothing separates the two directions but the rails themselves.
    expect(countWhere(colors, isMarkingYellow)).toBe(0);
    // Its edges are still marked, like every other paved street.
    expect(countWhere(colors, isMarkingWhite)).toBe(2 * 6);
  });

  it('breaks the track at junctions (rails stop at crossings)', () => {
    const straight = roadTileVertices(0, 0, RoadTier.Tram, N | S, flatHeightAt);
    const junction = roadTileVertices(0, 0, RoadTier.Tram, N | E | S | W, flatHeightAt);
    expect(countWhere(straight.colors, isRail)).toBeGreaterThan(0);
    expect(countWhere(junction.colors, isRail)).toBe(0);
  });

  it('rides a two-lane-width carriageway and is deterministic', () => {
    expect(carriagewayHalfWidthMeters(RoadTier.Tram)).toBeCloseTo(
      carriagewayHalfWidthMeters(RoadTier.TwoLane),
    );
    const a = roadTileVertices(3, 4, RoadTier.Tram, N | S, flatHeightAt);
    const b = roadTileVertices(3, 4, RoadTier.Tram, N | S, flatHeightAt);
    expect(a.positions).toEqual(b.positions);
    expect(a.colors).toEqual(b.colors);
  });
});

describe('roadTileVertices — dedicated rail line (RoadTier.RailTrack)', () => {
  const isRail = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return r > 0.66 && r < 0.78 && Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
  };
  const isSleeper = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return r > 0.2 && r < 0.32 && r > g && g >= b;
  };
  const isBallast = (t: readonly number[]): boolean => {
    const [r, g, b] = t as [number, number, number];
    return r > 0.3 && r < 0.38 && Math.abs(r - g) < 0.04 && Math.abs(g - b) < 0.04;
  };

  it('lays a ballast bed with embedded rails + sleepers on a straight run', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.RailTrack, N | S, flatHeightAt);
    expect(countWhere(colors, isBallast)).toBeGreaterThan(0);
    expect(countWhere(colors, isRail)).toBeGreaterThan(0);
    expect(countWhere(colors, isSleeper)).toBeGreaterThan(0);
  });

  it('is unpaved + curbless: no lane markings and no sidewalk strip', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.RailTrack, N | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
    expect(countWhere(colors, isSidewalk)).toBe(0);
  });

  it('breaks the track at junctions (rails stop at crossings)', () => {
    const straight = roadTileVertices(0, 0, RoadTier.RailTrack, N | S, flatHeightAt);
    const junction = roadTileVertices(0, 0, RoadTier.RailTrack, N | E | S | W, flatHeightAt);
    expect(countWhere(straight.colors, isRail)).toBeGreaterThan(0);
    expect(countWhere(junction.colors, isRail)).toBe(0);
  });

  it('rides a narrow dedicated corridor (gravel-class width) and is deterministic', () => {
    expect(carriagewayHalfWidthMeters(RoadTier.RailTrack)).toBeCloseTo(
      carriagewayHalfWidthMeters(RoadTier.Gravel),
    );
    const a = roadTileVertices(6, 7, RoadTier.RailTrack, N | S, flatHeightAt);
    const b = roadTileVertices(6, 7, RoadTier.RailTrack, N | S, flatHeightAt);
    expect(a.positions).toEqual(b.positions);
    expect(a.colors).toEqual(b.colors);
  });
});

describe('roadTileVertices — asphalt base plate', () => {
  it('returns no geometry for RoadTier.None, regardless of mask', () => {
    for (const mask of [0, 15]) {
      const { positions, colors } = roadTileVertices(0, 0, RoadTier.None, mask, flatHeightAt);
      expect(positions).toEqual([]);
      expect(colors).toEqual([]);
    }
  });

  it('a lone tile (mask 0, no connections) is a road with two ends, not a square boxed in on all four sides', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const { positions, colors } = roadTileVertices(1, 1, tier, 0, flatHeightAt);
      const pos = toTriples(positions);
      const col = toTriples(colors);
      // Two caps' worth of asphalt fan, where a dead end has one and a
      // through-run none: a lone tile dead-ends at both of its ends.
      const fan = pos.filter((pt) => Math.abs((pt[1] as number) - CAP_Y_OFFSET) < 1e-6).length;
      expect(fan).toBe(2 * END_CAP_SEGMENTS * 3);
      // Curb: a ring round each cap plus the TWO straight flanks that run
      // alongside the road. The four flanks it used to emit boxed the tile in
      // on every side and read as a hash, not a street.
      const ring = pos.filter(
        (pt, i) =>
          isSidewalk(col[i] as number[]) && Math.abs((pt[1] as number) - CURB_Y_OFFSET) < 1e-6,
      ).length;
      expect(ring).toBe(2 * END_CAP_SEGMENTS * 6 + 2 * 6);
      expect(colors.length).toBe(positions.length);
    }
  });

  it('a lone tile lies along the direction it was drawn in, and east-west when it recorded none', () => {
    const spread = (flow: RoadFlow): { x: number; z: number } => {
      const { positions } = roadTileVertices(
        1,
        1,
        RoadTier.TwoLane,
        0,
        flatHeightAt,
        undefined,
        undefined,
        undefined,
        flow,
      );
      const pts = toTriples(positions);
      const xs = pts.map((p) => p[0] as number);
      const zs = pts.map((p) => p[2] as number);
      return {
        x: Math.max(...xs) - Math.min(...xs),
        z: Math.max(...zs) - Math.min(...zs),
      };
    };
    // Drawn north or south, the road runs up the tile; drawn east or west — or
    // never drawn anywhere, which is what a single click records — it runs
    // across it. Either way it is longer along its own axis than across it.
    for (const flow of [RoadFlow.North, RoadFlow.South]) {
      const s = spread(flow);
      expect(s.z).toBeGreaterThan(s.x);
    }
    for (const flow of [RoadFlow.East, RoadFlow.West, RoadFlow.None]) {
      const s = spread(flow);
      expect(s.x).toBeGreaterThan(s.z);
    }
  });

  it('a lone tile wide enough to fill its tile keeps its rounded ends inside it, rather than paving two neighbours', () => {
    // A four-lane carriageway is 15m of a 16m tile, so a turnaround bulb of its
    // own half-width at BOTH ends would reach ~15m either side of centre. The
    // bulge is held to the strip of tile left over instead.
    const { positions } = roadTileVertices(0, 0, RoadTier.FourLane, 0, flatHeightAt);
    const centre = TILE_METERS / 2; // tile (0,0)'s own centre in world metres
    const xs = toTriples(positions).map((p) => Math.abs((p[0] as number) - centre));
    // The asphalt stays inside the tile; only the kerb band wraps past it, by
    // exactly the width the straight run already spends there.
    expect(Math.max(...xs)).toBeLessThanOrEqual(TILE_METERS / 2 + SIDEWALK_WIDTH_M + 1e-6);
  });

  it('colors the core plate a uniform tier-shade grey even at a full 4-way junction (its arms carry white stop-line/crosswalk markings, but the box interior itself never does)', () => {
    // mask 15: every side connects, so there are no sidewalk curbs; the core
    // plate is always the first 6 vertices (2 triangles) emitted.
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, 15, flatHeightAt);
    const core = toTriples(colors).slice(0, 6);
    const [r0, g0, b0] = core[0] as [number, number, number];
    for (const [r, g, b] of core as [number, number, number][]) {
      expect(r).toBeCloseTo(r0, 6);
      expect(g).toBeCloseTo(g0, 6);
      expect(b).toBeCloseTo(b0, 6);
      expect(Math.abs(r - g)).toBeLessThan(0.06);
      expect(Math.abs(g - b)).toBeLessThan(0.06);
    }
    // Light-grey — lighter than near-black, still clearly
    // darker than the near-white sidewalk/marking bands.
    expect(r0).toBeGreaterThan(0.3);
    expect(r0).toBeLessThan(0.75);
  });

  it('paves every road the same asphalt, so no two of them meet in a colour step', () => {
    // A quiet street and a motorway are the same material. Tinting each road
    // type its own grey put a visible seam wherever two met, and turned every
    // crossing into a patch of whichever one won the tile.
    const shade = (tier: RoadTier): number =>
      avg(roadTileVertices(0, 0, tier, 0, flatHeightAt).colors.slice(0, 3));
    const paved = [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.Alley,
      RoadTier.OneWay,
      RoadTier.FourLane,
      RoadTier.BusLane,
      RoadTier.BikeLane,
      RoadTier.Tram,
    ];
    const first = shade(RoadTier.TwoLane);
    for (const tier of paved) expect(shade(tier), `tier ${tier}`).toBeCloseTo(first, 9);
    // The surfaces that really are a different material still differ.
    expect(shade(RoadTier.Gravel)).not.toBeCloseTo(first, 2);
    expect(shade(RoadTier.RailTrack)).not.toBeCloseTo(first, 2);
  });

  it('asphalt (any tier) is darker than the sidewalk curb color', () => {
    // mask 0 emits both the core asphalt plate and all 4 curbs, so both
    // colors are present in one call.
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const { colors } = roadTileVertices(0, 0, tier, 0, flatHeightAt);
      const triples = toTriples(colors);
      const asphaltR = avg(triples[0] as number[]);
      const sidewalkTriple = triples.find((t) => isSidewalk(t));
      expect(sidewalkTriple).toBeDefined();
      expect(asphaltR).toBeLessThan(avg(sidewalkTriple as number[]));
    }
  });

  it("avenue's core plate is wider than two-lane's core plate (in world meters)", () => {
    // The core quad is always emitted first, so slicing the first 6 vertices
    // isolates it from whichever extensions/curbs/markings mask 0 also adds.
    const twoLaneCore = roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt).positions.slice(
      0,
      18,
    );
    const avenueCore = roadTileVertices(0, 0, RoadTier.Avenue, 0, flatHeightAt).positions.slice(
      0,
      18,
    );
    const xsOf = (positions: number[]): number[] => positions.filter((_, i) => i % 3 === 0);
    const spanOf = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    expect(spanOf(xsOf(avenueCore))).toBeGreaterThan(spanOf(xsOf(twoLaneCore)));
  });

  it('follows terrain contour: each corner is sampled independently through hAt', () => {
    const hAt = (x: number, z: number): number => x * 0.1 + z * 0.01;
    const { positions } = roadTileVertices(2, 2, RoadTier.TwoLane, 0, hAt);
    const ys = positions.filter((_, i) => i % 3 === 1);
    // With a non-constant height field the vertices should not all share one y.
    expect(new Set(ys.map((y) => y.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('validates mask is an integer within the 4-bit range 0..15', () => {
    expect(() => roadTileVertices(0, 0, RoadTier.TwoLane, -1, flatHeightAt)).toThrow();
    expect(() => roadTileVertices(0, 0, RoadTier.TwoLane, 16, flatHeightAt)).toThrow();
    expect(() => roadTileVertices(0, 0, RoadTier.TwoLane, 1.5, flatHeightAt)).toThrow();
    expect(() => roadTileVertices(0, 0, RoadTier.TwoLane, 15, flatHeightAt)).not.toThrow();
  });
});

describe('roadTileVertices — carriageway ratios (UI-SPEC §6.7 Roads v2)', () => {
  /** Measures the core plate's world-X span the same way as the "wider core" test above. */
  function coreSpanMeters(tier: RoadTier): number {
    const positions = roadTileVertices(0, 0, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('two-lane carriageway is 2 lanes = 7.5m (lane = 1.5× the widest vehicle)', () => {
    const span = coreSpanMeters(RoadTier.TwoLane);
    expect(span).toBeCloseTo(7.5, 5);
  });

  it('avenue carriageway is 4 full lanes and a refuge median, leaving a footway each side', () => {
    const span = coreSpanMeters(RoadTier.Avenue);
    expect(span).toBeCloseTo(16.2, 5);
    // The rest of the tile is the two footways, which is what makes the avenue
    // a road a person can walk beside and cross. On a 16 m tile it could
    // afford neither at full size; on this one it affords both.
    expect(TILE_METERS - span).toBeGreaterThanOrEqual(2 * SIDEWALK_WIDTH_M);
    expect(curbWidthMeters(RoadTier.Avenue)).toBeCloseTo(SIDEWALK_WIDTH_M, 5);
  });

  it('highway carriageway is near full tile width, leaving only a narrow shoulder', () => {
    const span = coreSpanMeters(RoadTier.Highway);
    expect(span).toBeGreaterThan(14);
    expect(span).toBeLessThan(TILE_METERS);
    const shoulderEachSide = (TILE_METERS - span) / 2;
    // "shoulder bands instead of sidewalk curbs" — much narrower than two-lane's sidewalk.
    expect(shoulderEachSide).toBeLessThan((TILE_METERS - coreSpanMeters(RoadTier.TwoLane)) / 2);
  });

  it('the kerb strip starts at the carriageway edge and runs one sidewalk wide, per tier', () => {
    // A road running north-south, so its kerbs lie east and west of the
    // carriageway and can be measured straight across X. Tile (0,0) spans
    // world X in [0, TILE_METERS], so its centre is half of it.
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const { positions, colors } = roadTileVertices(0, 0, tier, N | S, flatHeightAt);
      const posTriples = toTriples(positions);
      const colorTriples = toTriples(colors);
      const curbXs: number[] = [];
      for (let i = 0; i < posTriples.length; i++) {
        if (isSidewalk(colorTriples[i] as number[]))
          curbXs.push((posTriples[i] as number[])[0] as number);
      }
      expect(curbXs.length).toBeGreaterThan(0);
      const coreHalf = coreSpanMeters(tier) / 2;
      const eastCurbXs = curbXs.filter((wx) => wx > TILE_METERS / 2);
      // Inner edge exactly at the carriageway edge, outer edge one kerb band
      // beyond it — the tile's leftover verge stays grass.
      expect(Math.min(...eastCurbXs)).toBeCloseTo(TILE_METERS / 2 + coreHalf, 6);
      expect(Math.max(...eastCurbXs)).toBeCloseTo(TILE_METERS / 2 + coreHalf + curbWidthMeters(tier), 6);
    }
  });
});

describe('dashSegments — true-ratio metric dash pattern (UI-SPEC §6.7 Roads v2)', () => {
  it('uses the spec metrics: ~3m painted, ~4.5m gap, 7.5m period', () => {
    expect(DASH_PAINT_LENGTH_M).toBe(3);
    expect(DASH_GAP_LENGTH_M).toBe(4.5);
    expect(DASH_PERIOD_M).toBe(7.5);
  });

  it('returns [] for an empty or inverted range', () => {
    expect(dashSegments(5, 5)).toEqual([]);
    expect(dashSegments(5, 2)).toEqual([]);
  });

  it('paints exactly [0,3] within [0, 7.5) — one full period, phase anchored at global 0', () => {
    expect(dashSegments(0, 7.499)).toEqual([[0, 3]]);
  });

  it('paints negative-side segments too (phase extends symmetrically through 0)', () => {
    const segments = dashSegments(-8, 0);
    expect(segments.length).toBeGreaterThan(0);
    for (const [lo, hi] of segments) {
      expect(hi).toBeLessThanOrEqual(0);
      expect(lo).toBeGreaterThanOrEqual(-8);
    }
  });

  it('every segment is exactly DASH_PAINT_LENGTH_M long unless clipped by the query range', () => {
    for (const [lo, hi] of dashSegments(0, 100)) {
      expect(hi - lo).toBeLessThanOrEqual(DASH_PAINT_LENGTH_M + 1e-9);
      expect(hi - lo).toBeGreaterThan(0);
    }
  });

  it('seam continuity: splitting a query range in two reproduces the same total painted length as one wide query', () => {
    const whole = dashSegments(40, 60);
    const a = dashSegments(40, 50);
    const b = dashSegments(50, 60);
    const totalLength = (segs: Array<[number, number]>): number =>
      segs.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);
    expect(totalLength(a) + totalLength(b)).toBeCloseTo(totalLength(whole), 9);
  });

  it('seam continuity: a dash split across the boundary glues back together with no gap or overlap', () => {
    // Find a boundary that actually splits a painted segment (period 7.5 isn't
    // a "nice" number, so scanning finds one quickly).
    for (let boundary = 1; boundary < 20; boundary++) {
      const whole = dashSegments(boundary - 10, boundary + 10);
      const straddling = whole.find(([lo, hi]) => lo < boundary && hi > boundary);
      if (!straddling) continue;
      const a = dashSegments(boundary - 10, boundary);
      const b = dashSegments(boundary, boundary + 10);
      // The straddling segment's left half ends exactly at boundary in `a`,
      // and its right half starts exactly at boundary in `b`.
      expect(a[a.length - 1]?.[1]).toBeCloseTo(boundary, 9);
      expect(b[0]?.[0]).toBeCloseTo(boundary, 9);
      return;
    }
    throw new Error('test setup failed to find a straddling segment in [−10,+29]');
  });
});

describe('roadTileVertices — true-ratio dashed/solid markings by tier (UI-SPEC §6.7 Roads v2)', () => {
  /** The straight-run marking span roadTileVertices uses for a fully-through N|S or E|W tile. */
  function dashCountFor(z: number): number {
    const centerZ = (z + 0.5) * TILE_METERS;
    return dashSegments(centerZ - TILE_METERS / 2, centerZ + TILE_METERS / 2).length;
  }

  it('two-lane centerline is dashed yellow: its quad count matches dashSegments over the tile span', () => {
    for (const z of [0, 1, 2, 3]) {
      const { colors } = roadTileVertices(0, z, RoadTier.TwoLane, N | S, flatHeightAt);
      expect(countWhere(colors, isMarkingYellow)).toBe(dashCountFor(z) * 6);
      // Plus the two solid white edge lines every paved road carries.
      expect(countWhere(colors, isMarkingWhite)).toBe(2 * 6);
    }
  });

  it('paints a road that does not change exactly where it always did, with no sweep', () => {
    // Every neighbour is the same road, so every line meets itself at both
    // seams and none of them drifts. The geometry has to be identical to the
    // road drawn with no neighbour plans at all — a straight line is one quad,
    // and a sweep that fires on an unchanging road would silently multiply
    // every marking in the city.
    const plain = roadTileVertices(0, 3, RoadTier.Avenue, N | S, flatHeightAt);
    const sameBothSides = roadTileVertices(
      0,
      3,
      RoadTier.Avenue,
      N | S,
      flatHeightAt,
      { n: RoadTier.Avenue, e: RoadTier.None, s: RoadTier.Avenue, w: RoadTier.None },
      presetProfileForTier(RoadTier.Avenue),
      {
        n: carriagewayHalfWidthOf(presetProfileForTier(RoadTier.Avenue)),
        e: 0,
        s: carriagewayHalfWidthOf(presetProfileForTier(RoadTier.Avenue)),
        w: 0,
        plans: {
          n: markingPlan(presetProfileForTier(RoadTier.Avenue)),
          e: null,
          s: markingPlan(presetProfileForTier(RoadTier.Avenue)),
          w: null,
        },
      },
    );
    expect(sameBothSides.positions.length).toBe(plain.positions.length);
  });

  it('sweeps a line across the tile when the road on the far side paints it elsewhere', () => {
    // The neighbour is a narrower road, so this tile's lines have somewhere to
    // go and the paint has to bend to get there — which costs geometry the
    // unchanging road above does not pay.
    const half = carriagewayHalfWidthOf(presetProfileForTier(RoadTier.Avenue));
    const plain = roadTileVertices(0, 3, RoadTier.Avenue, N | S, flatHeightAt);
    const narrows = roadTileVertices(
      0,
      3,
      RoadTier.Avenue,
      N | S,
      flatHeightAt,
      { n: RoadTier.Avenue, e: RoadTier.None, s: RoadTier.TwoLane, w: RoadTier.None },
      presetProfileForTier(RoadTier.Avenue),
      {
        n: half,
        e: 0,
        s: carriagewayHalfWidthOf(presetProfileForTier(RoadTier.TwoLane)),
        w: 0,
        plans: {
          n: markingPlan(presetProfileForTier(RoadTier.Avenue)),
          e: null,
          s: markingPlan(presetProfileForTier(RoadTier.TwoLane)),
          w: null,
        },
      },
    );
    expect(narrows.positions.length).toBeGreaterThan(plain.positions.length);
  });

  it('a straight avenue run carries a yellow left edge line down each side of its median', () => {
    const z = 0;
    const { colors } = roadTileVertices(0, z, RoadTier.Avenue, N | S, flatHeightAt);
    // 2 dashed white lane lines + 2 solid white edge lines at the kerbs.
    expect(countWhere(colors, isMarkingWhite)).toBe(dashCountFor(z) * 2 * 6 + 2 * 6);
    // And two solid yellow ones beside the median: an avenue is a divided
    // road, and the left-hand edge of a divided road is marked yellow. A pair
    // painted over the median's own centre instead is buried the moment the
    // mesh draws the planting, which left the avenue with no yellow at all.
    expect(countWhere(colors, isMarkingYellow)).toBe(2 * 6);
  });

  it('highway draws white lane lines and white edges — never a yellow centre, since every lane runs one way', () => {
    for (const z of [0, 1]) {
      const { colors } = roadTileVertices(0, z, RoadTier.Highway, N | S, flatHeightAt);
      expect(countWhere(colors, isMarkingYellow)).toBe(0);
      // 2 solid edge lines plus a dashed line between each pair of same-way lanes.
      expect(countWhere(colors, isMarkingWhite)).toBe(2 * 6 + dashCountFor(z) * 2 * 6);
    }
  });

  it('white paint is one neutral white on every road, and yellow is one yellow', () => {
    const twoLane = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, flatHeightAt).colors;
    const avenue = roadTileVertices(0, 0, RoadTier.Avenue, N | S, flatHeightAt).colors; // straight run: guarantees dashed lane markings are present
    const highway = roadTileVertices(0, 0, RoadTier.Highway, N | S, flatHeightAt).colors;
    const oneMarkingColor = (colors: number[]): number[] =>
      toTriples(colors).find((t) => isMarkingWhite(t)) as number[];
    const [r1, g1, b1] = oneMarkingColor(twoLane) as [number, number, number];
    const [r2, g2, b2] = oneMarkingColor(avenue) as [number, number, number];
    const [r3, g3, b3] = oneMarkingColor(highway) as [number, number, number];
    expect(r2).toBeCloseTo(r1, 6);
    expect(g2).toBeCloseTo(g1, 6);
    expect(b2).toBeCloseTo(b1, 6);
    expect(r3).toBeCloseTo(r1, 6);
    expect(g3).toBeCloseTo(g1, 6);
    expect(b3).toBeCloseTo(b1, 6);
    expect(Math.abs(r1 - g1)).toBeLessThan(0.05);
    expect(Math.abs(g1 - b1)).toBeLessThan(0.05);
    // Yellow is warm and unmistakably not white.
    const yellow = toTriples(twoLane).find((t) => isMarkingYellow(t)) as number[];
    expect(yellow[0]!).toBeGreaterThan(yellow[2]! + 0.4);
  });

  it('markings orient along whichever travel axis the mask connects (horizontal road)', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, E | W, flatHeightAt);
    expect(countWhere(colors, isMarkingYellow)).toBe(dashCountFor(0) * 6);
    expect(countWhere(colors, isMarkingWhite)).toBe(2 * 6);
  });
});

describe('roadTileVertices — intersection suppression / proper intersections (mask popcount >= 3)', () => {
  it('a 2-connection straight tile keeps its markings', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Highway, N | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('a 3-connection T-junction has clean asphalt in its box interior but white stop-line/crosswalk markings on each connected arm', () => {
    const { positions, colors } = controlledJunction(0, 0, RoadTier.Highway, N | E | S);
    // Junction box (core plate, first 6 vertices) stays clean tier-grey asphalt.
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false);
    // But its 3 connected arms carry markings (not zero).
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
    expect(vertexCount(positions)).toBeGreaterThan(0);
  });

  it('a full 4-way intersection has clean asphalt in its box interior but markings on all 4 arms', () => {
    const { positions, colors } = controlledJunction(0, 0, RoadTier.Highway, N | E | S | W);
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
    expect(vertexCount(positions)).toBeGreaterThan(0);
  });

  it('but a junction the sim controls with nothing is painted with nothing', () => {
    // No stop line without a sign or a signal to stop for, and no crossing at
    // a junction where two quiet streets simply meet.
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N | E | S | W, flatHeightAt);
    const controlled = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S | W);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
    expect(countWhere(controlled.colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('a roundabout puts an island in the box instead of crossings', () => {
    const round = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S | W, 'roundabout');
    const stopped = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S | W, 'allWayStop');
    // The island is planted, which nothing else on a plain street tile is.
    expect(countWhere(round.colors, isMedianGrass)).toBeGreaterThan(0);
    expect(countWhere(stopped.colors, isMedianGrass)).toBe(0);
    // Still painted — the apron and a yield line across every entry — but not
    // with a crossing, so it is not simply the junction treatment plus a disc.
    expect(countWhere(round.colors, isMarkingWhite)).toBeGreaterThan(0);
    expect(countWhere(round.colors, isMarkingWhite)).not.toBe(
      countWhere(stopped.colors, isMarkingWhite),
    );
  });

  it('yields on every entry of a roundabout, and only on the entries there are', () => {
    const three = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S, 'roundabout');
    const four = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S | W, 'roundabout');
    // One more arm is one more row of triangles; the island is the same either way.
    expect(countWhere(four.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(three.colors, isMarkingWhite),
    );
    expect(countWhere(four.colors, isMedianGrass)).toBe(countWhere(three.colors, isMedianGrass));
  });

  it('runs no centre line through a roundabout, whatever joins it', () => {
    // A two-lane crossed only by gravel would otherwise keep its markings
    // across the box, the way a main road runs past a farm track.
    const neighbors = {
      n: RoadTier.Gravel,
      e: RoadTier.Gravel,
      s: RoadTier.Gravel,
      w: RoadTier.Gravel,
    };
    const through = roadTileVertices(
      0,
      0,
      RoadTier.TwoLane,
      N | E | S | W,
      flatHeightAt,
      neighbors,
    );
    const round = roadTileVertices(
      0,
      0,
      RoadTier.TwoLane,
      N | E | S | W,
      flatHeightAt,
      neighbors,
      undefined,
      undefined,
      undefined,
      'roundabout',
    );
    expect(countWhere(through.colors, isMarkingYellow)).toBeGreaterThan(0);
    expect(countWhere(round.colors, isMarkingYellow)).toBe(0);
  });

  it('a give-way gets its crossing but no stop bar, which is what a give-way means', () => {
    const yielded = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S | W, 'yield');
    const stopped = controlledJunction(0, 0, RoadTier.TwoLane, N | E | S | W, 'allWayStop');
    const painted = countWhere(yielded.colors, isMarkingWhite);
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(countWhere(stopped.colors, isMarkingWhite));
  });

  it('a 90-degree corner (popcount 2, non-collinear) is NOT a junction and keeps its existing plain marking behavior, unchanged', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N | E, flatHeightAt);
    // Corners never get stop-lines/crosswalks (those require popcount >= 3) —
    // whatever markings appear come only from the ordinary per-axis logic.
    const count = countWhere(colors, isMarkingWhite);
    expect(count % 6).toBe(0);
  });
});

describe('junctionArmLayout — a crosswalk and a stop line at their real size', () => {
  it('lays them in the order a driver meets them: stop line, gap, then the crossing', () => {
    const layout = junctionArmLayout(1.5);
    // Measured from the junction tile's edge, positive inward. A stop line
    // stands in advance of the nearest crosswalk line — stopping past the
    // crossing is stopping on the people using it — and there is no room for
    // it between the tile edge and the crossing, so it goes back down the
    // APPROACH, which is where a driver actually stops.
    expect(layout.stopLineStart).toBeLessThan(0);
    expect(layout.stopLineEnd - layout.stopLineStart).toBeCloseTo(0.4, 9);
    expect(layout.crosswalkStart).toBeGreaterThan(layout.stopLineEnd);
    expect(layout.crosswalkStart - layout.stopLineEnd).toBeCloseTo(1.2, 9);
  });

  it('lays the crossing over the strip the footway crosses, never narrower than a crossing may be', () => {
    // A crossing is the footway carried over the road, so it belongs in the
    // strip between the junction box and the tile edge — which is exactly what
    // the crossing road spends on its own footway.
    const roomy = junctionArmLayout(2.4);
    expect(roomy.crosswalkStart).toBe(0);
    expect(roomy.crosswalkEnd).toBeCloseTo(2.4, 9);

    // A road that leaves almost no verge still gets a crossing a person can
    // stand in; that one reaches a little into the box.
    const tight = junctionArmLayout(0.5);
    expect(tight.crosswalkEnd).toBeCloseTo(1.8, 9);
  });

  it('keeps its real size whatever the road, since squeezing it is what made a crossing read as a dashed ring', () => {
    // The old layout scaled everything into the depth left between the box and
    // the tile edge, which on a four-lane is half a metre.
    const a = junctionArmLayout();
    const b = junctionArmLayout();
    expect(a).toEqual(b);
    expect(a.stopLineEnd).toBeLessThan(TILE_METERS / 2); // still inside the tile
  });
});
describe('crosswalkBarOffsets — zebra-stripe placement (UI-SPEC §6.7 Roads v2)', () => {
  it('returns [] for a non-positive width', () => {
    expect(crosswalkBarOffsets(0)).toEqual([]);
    expect(crosswalkBarOffsets(-1)).toEqual([]);
  });

  it('places at least one bar for any positive carriageway half-width', () => {
    expect(crosswalkBarOffsets(0.5).length).toBeGreaterThanOrEqual(1);
  });

  it('every bar stays within the carriageway half-width', () => {
    for (const halfWidth of [0.5, 2, 4.8, 6.8, 7.36]) {
      for (const offset of crosswalkBarOffsets(halfWidth)) {
        expect(Math.abs(offset)).toBeLessThanOrEqual(halfWidth);
      }
    }
  });

  it('bars are evenly spaced at the ~0.45m width + ~0.6m gap period (1.05m)', () => {
    const offsets = crosswalkBarOffsets(6.8); // a wide carriageway half-width (fits several bars)
    expect(offsets.length).toBeGreaterThan(2);
    for (let i = 1; i < offsets.length; i++) {
      expect((offsets[i] as number) - (offsets[i - 1] as number)).toBeCloseTo(1.05, 9);
    }
  });

  it('is a pure function of the width alone — identical for every arm of the same tier', () => {
    expect(crosswalkBarOffsets(4.8)).toEqual(crosswalkBarOffsets(4.8));
  });

  it('a wider carriageway fits more bars than a narrower one', () => {
    expect(crosswalkBarOffsets(6.8).length).toBeGreaterThan(crosswalkBarOffsets(4.8).length);
  });
});

describe('roadTileVertices — proper intersections: stop-line + crosswalk bars appear per connected arm', () => {
  it('a T-junction (N|E|S) draws markings on exactly the 3 connected arms, none within the unconnected (W) curb strip', () => {
    const { positions, colors } = controlledJunction(5, 5, RoadTier.TwoLane, N | E | S);
    const posTriples = toTriples(positions);
    const colorTriples = toTriples(colors);
    const centerX = 5.5 * TILE_METERS;
    // The W side has no road neighbor, so it carries a curb strip from the
    // tile's outer W edge (centerX - 8) in to the carriageway edge
    // (centerX - coreHalf); no marking vertex should ever fall inside that span.
    const coreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION; // TwoLane core half-width (see carriageway-ratio tests)
    const westCurbInnerEdge = centerX - coreHalf;
    let sawMarkingInWestCurb = false;
    for (let i = 0; i < posTriples.length; i++) {
      if (isMarkingWhite(colorTriples[i] as number[])) {
        const worldX = (posTriples[i] as number[])[0] as number;
        if (worldX < westCurbInnerEdge) sawMarkingInWestCurb = true;
      }
    }
    expect(sawMarkingInWestCurb).toBe(false); // W has no road neighbor -> no arm markings there
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('a full 4-way junction on a tight (highway) tier still emits non-degenerate, non-overlapping arm markings on all 4 sides', () => {
    const { colors } = controlledJunction(2, 2, RoadTier.Highway, N | E | S | W);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('a 4-way junction draws strictly more marking geometry than a 3-way T-junction (one more arm worth of stop-line + crosswalk)', () => {
    const tCount = countWhere(
      controlledJunction(5, 5, RoadTier.TwoLane, N | E | S).colors,
      isMarkingWhite,
    );
    const fourCount = countWhere(
      controlledJunction(5, 5, RoadTier.TwoLane, N | E | S | W).colors,
      isMarkingWhite,
    );
    expect(fourCount).toBeGreaterThan(tCount);
  });
});

describe('roadTileVertices — lane-use arrows on the last tile before a junction', () => {
  /** A straight run tile told which way the junction it approaches lies. */
  const approach = (
    tier: RoadTier,
    toward: RoadFlow,
    mask = N | S,
    flow: RoadFlow = RoadFlow.None,
    allowed: number = DEFAULT_ALLOWED,
    zone: { distance: number; pocket: boolean } = { distance: 0, pocket: false },
  ): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      4,
      4,
      tier,
      mask,
      flatHeightAt,
      undefined,
      undefined,
      undefined,
      flow,
      undefined,
      { toward, allowed, openness: 1, laneAllowed: 0, ...zone },
    );

  const plain = (tier: RoadTier, mask = N | S): { positions: number[]; colors: number[] } =>
    roadTileVertices(4, 4, tier, mask, flatHeightAt);

  it('paints nothing on a single-lane approach, which does everything anyway', () => {
    // A two-lane street has one lane each way, so no lane needs telling apart.
    const painted = countWhere(approach(RoadTier.TwoLane, RoadFlow.South).colors, isMarkingWhite);
    expect(painted).toBe(countWhere(plain(RoadTier.TwoLane).colors, isMarkingWhite));
  });

  it('paints an arrow per lane on a four-lane approach', () => {
    const arrowed = approach(RoadTier.FourLane, RoadFlow.South);
    expect(countWhere(arrowed.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(plain(RoadTier.FourLane).colors, isMarkingWhite),
    );
  });

  it('gives a two-lane street a lane it does not have, and an arrow to go in it', () => {
    const pocket = { distance: 0, pocket: true };
    const street = approach(RoadTier.TwoLane, RoadFlow.South);
    const pocketed = approach(
      RoadTier.TwoLane,
      RoadFlow.South,
      N | S,
      RoadFlow.None,
      DEFAULT_ALLOWED,
      pocket,
    );
    // One lane each way paints no lane-use arrow at all; with the pocket there
    // are two lanes to tell apart, so there is something to say.
    expect(countWhere(pocketed.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(street.colors, isMarkingWhite),
    );
    // And the asphalt is wider for the lane it gained, so the paint is on road.
    const spread = (v: { positions: number[] }): number =>
      Math.max(...toTriples(v.positions).map((p) => Math.abs(p[0]! - 4.5 * TILE_METERS)));
    expect(spread(pocketed)).toBeGreaterThan(spread(street));
  });

  it('carries the pocket down the whole approach zone, and the arrows only at its head', () => {
    const atHead = approach(
      RoadTier.TwoLane,
      RoadFlow.South,
      N | S,
      RoadFlow.None,
      DEFAULT_ALLOWED,
      {
        distance: 0,
        pocket: true,
      },
    );
    const behind = approach(
      RoadTier.TwoLane,
      RoadFlow.South,
      N | S,
      RoadFlow.None,
      DEFAULT_ALLOWED,
      {
        distance: 1,
        pocket: true,
      },
    );
    const spread = (v: { positions: number[] }): number =>
      Math.max(...toTriples(v.positions).map((p) => Math.abs(p[0]! - 4.5 * TILE_METERS)));
    // The same widened cross-section a tile further back...
    expect(spread(behind)).toBeCloseTo(spread(atHead), 6);
    // ...but the arrows belong on the tile the driver reads them from.
    expect(countWhere(behind.colors, isMarkingWhite)).toBeLessThan(
      countWhere(atHead.colors, isMarkingWhite),
    );
  });

  it('arrows only the half of the carriageway that is driving toward the junction', () => {
    // Right-hand traffic: heading south (+Z), the approaching lanes are the
    // ones west of the centreline, so every arrow vertex is at negative x.
    const centreX = 4.5 * TILE_METERS;
    const arrowed = approach(RoadTier.FourLane, RoadFlow.South);
    const posTriples = toTriples(arrowed.positions);
    const colorTriples = toTriples(arrowed.colors);
    // The arrow paint is whatever white the plain tile does not have; look at
    // where the extra white sits by sign of x, on both halves.
    let west = 0;
    let east = 0;
    for (let i = 0; i < posTriples.length; i++) {
      if (!isMarkingWhite(colorTriples[i] as number[])) continue;
      const dx = (posTriples[i] as number[])[0]! - centreX;
      if (dx < -0.2) west++;
      else if (dx > 0.2) east++;
    }
    // A plain four-lane paints symmetrically, so the asymmetry IS the arrows.
    expect(west).toBeGreaterThan(east);
  });

  it('arrows the other half when the junction is the other way', () => {
    const centreX = 4.5 * TILE_METERS;
    const sideOf = (toward: RoadFlow): number => {
      const v = approach(RoadTier.FourLane, toward);
      const pos = toTriples(v.positions);
      const col = toTriples(v.colors);
      let sum = 0;
      for (let i = 0; i < pos.length; i++) {
        if (isMarkingWhite(col[i] as number[])) sum += (pos[i] as number[])[0]! - centreX;
      }
      return sum;
    };
    expect(sideOf(RoadFlow.South)).toBeLessThan(0);
    expect(sideOf(RoadFlow.North)).toBeGreaterThan(0);
  });

  it('takes an arrow away when the turn it showed is banned', () => {
    const free = approach(RoadTier.FourLane, RoadFlow.South);
    const noLeft = approach(
      RoadTier.FourLane,
      RoadFlow.South,
      N | S,
      RoadFlow.None,
      Movement.Through | Movement.Right,
    );
    expect(countWhere(noLeft.colors, isMarkingWhite)).toBeLessThan(
      countWhere(free.colors, isMarkingWhite),
    );
    // Banning everything but the left leaves less paint again: the through
    // heads and the right hook both go.
    const leftOnly = approach(
      RoadTier.FourLane,
      RoadFlow.South,
      N | S,
      RoadFlow.None,
      Movement.Left,
    );
    expect(countWhere(leftOnly.colors, isMarkingWhite)).toBeLessThan(
      countWhere(noLeft.colors, isMarkingWhite),
    );
  });

  it('paints nothing on a road that paints nothing', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      expect(
        countWhere(approach(tier, RoadFlow.South).colors, isMarkingWhite),
        `tier ${tier}`,
      ).toBe(countWhere(plain(tier).colors, isMarkingWhite));
    }
  });

  it('arrows a one-way street only where it runs toward the junction', () => {
    const toward = approach(RoadTier.OneWay, RoadFlow.South, N | S, RoadFlow.South);
    const away = approach(RoadTier.OneWay, RoadFlow.South, N | S, RoadFlow.North);
    expect(countWhere(toward.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(away.colors, isMarkingWhite),
    );
  });
});

describe('isAvenueMedianEligible / isHighwayDividerEligible (UI-SPEC §6.7 Roads v2)', () => {
  it('is false for every tier other than the one it names', () => {
    expect(isAvenueMedianEligible(RoadTier.TwoLane, N | S)).toBe(false);
    expect(isAvenueMedianEligible(RoadTier.Highway, N | S)).toBe(false);
    expect(isHighwayDividerEligible(RoadTier.TwoLane, N | S)).toBe(false);
    expect(isHighwayDividerEligible(RoadTier.Avenue, N | S)).toBe(false);
  });

  it('is true for straight collinear runs (single connection or opposite-pair)', () => {
    for (const mask of [N, E, S, W, N | S, E | W]) {
      expect(isAvenueMedianEligible(RoadTier.Avenue, mask)).toBe(true);
      expect(isHighwayDividerEligible(RoadTier.Highway, mask)).toBe(true);
    }
  });

  it('is false for a disconnected tile (popcount 0 — not a "run")', () => {
    expect(isAvenueMedianEligible(RoadTier.Avenue, 0)).toBe(false);
    expect(isHighwayDividerEligible(RoadTier.Highway, 0)).toBe(false);
  });

  it('is false for a 90-degree corner (popcount 2, non-collinear)', () => {
    for (const mask of [N | E, E | S, S | W, W | N]) {
      expect(isAvenueMedianEligible(RoadTier.Avenue, mask)).toBe(false);
      expect(isHighwayDividerEligible(RoadTier.Highway, mask)).toBe(false);
    }
  });

  it('is false for any junction (popcount >= 3)', () => {
    for (const mask of [N | E | S, N | E | W, N | S | W, E | S | W, N | E | S | W]) {
      expect(isAvenueMedianEligible(RoadTier.Avenue, mask)).toBe(false);
      expect(isHighwayDividerEligible(RoadTier.Highway, mask)).toBe(false);
    }
  });
});

describe('roadTileVertices — avenue median (UI-SPEC §6.7 Roads v2)', () => {
  it('a straight avenue run carries a raised concrete-edged grass median; a corner and a junction do not', () => {
    const straight = roadTileVertices(0, 0, RoadTier.Avenue, N | S, flatHeightAt).colors;
    const corner = roadTileVertices(0, 0, RoadTier.Avenue, N | E, flatHeightAt).colors;
    const junction = roadTileVertices(0, 0, RoadTier.Avenue, N | E | S, flatHeightAt).colors;
    expect(countWhere(straight, isMedianGrass)).toBeGreaterThan(0);
    expect(countWhere(straight, isConcreteBand)).toBeGreaterThan(0);
    expect(countWhere(corner, isMedianGrass)).toBe(0);
    expect(countWhere(junction, isMedianGrass)).toBe(0);
  });

  it('the median sits raised above the road surface', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.Avenue, N | S, flatHeightAt);
    const posTriples = toTriples(positions);
    const colorTriples = toTriples(colors);
    const roadY = (posTriples[0] as number[])[1] as number; // core quad's first vertex
    const grassIndex = colorTriples.findIndex((t) => isMedianGrass(t));
    expect(grassIndex).toBeGreaterThanOrEqual(0);
    const grassY = (posTriples[grassIndex] as number[])[1] as number;
    expect(grassY).toBeGreaterThan(roadY);
  });

  it('other tiers never carry the avenue median', () => {
    const twoLane = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, flatHeightAt).colors;
    const highway = roadTileVertices(0, 0, RoadTier.Highway, N | S, flatHeightAt).colors;
    expect(countWhere(twoLane, isMedianGrass)).toBe(0);
    expect(countWhere(highway, isMedianGrass)).toBe(0);
  });
});

describe('roadTileVertices — highway divider (UI-SPEC §6.7 Roads v2)', () => {
  it('a straight highway run carries a raised concrete barrier band; a corner and a junction do not', () => {
    const straight = roadTileVertices(0, 0, RoadTier.Highway, N | S, flatHeightAt);
    const corner = roadTileVertices(0, 0, RoadTier.Highway, N | E, flatHeightAt);
    const junction = roadTileVertices(0, 0, RoadTier.Highway, N | E | S, flatHeightAt);

    const straightBarrierCount = countWhere(straight.colors, isConcreteBand);
    expect(straightBarrierCount).toBeGreaterThan(0);

    // Corner/junction still emit concrete-ish curb colors on their non-connected
    // sides, so isolate specifically the RAISED barrier vertices by height.
    const posTriples = toTriples(straight.positions);
    const colorTriples = toTriples(straight.colors);
    const roadY = (posTriples[0] as number[])[1] as number;
    let sawRaisedBarrier = false;
    for (let i = 0; i < posTriples.length; i++) {
      if (
        isConcreteBand(colorTriples[i] as number[]) &&
        (posTriples[i] as number[])[1]! > roadY + 0.1
      ) {
        sawRaisedBarrier = true;
      }
    }
    expect(sawRaisedBarrier).toBe(true);

    expect(isHighwayDividerEligible(RoadTier.Highway, N | E)).toBe(false);
    expect(isHighwayDividerEligible(RoadTier.Highway, N | E | S)).toBe(false);
    void corner;
    void junction;
  });
});

describe('hasMedianTree — deterministic per-tile placement (UI-SPEC §6.7 Roads v2: "~every 2nd tile, from tile hash")', () => {
  it('is a pure, deterministic function of (x, z)', () => {
    expect(hasMedianTree(3, 7)).toBe(hasMedianTree(3, 7));
    expect(hasMedianTree(100, -4)).toBe(hasMedianTree(100, -4));
  });

  it('is not simply "every even tile" or "every odd tile" (varies with both coordinates)', () => {
    const rowSamples = Array.from({ length: 20 }, (_, x) => hasMedianTree(x, 0));
    expect(new Set(rowSamples).size).toBe(2); // both true and false occur
  });

  it('lands close to 50% true density across a long straight run (never uses Math.random)', () => {
    let trueCount = 0;
    const sampleSize = 200;
    for (let z = 0; z < sampleSize; z++) if (hasMedianTree(0, z)) trueCount++;
    const fraction = trueCount / sampleSize;
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.7);
  });
});

describe('roadTileVertices — vertex count sanity per tile kind', () => {
  it('every (tier, mask) combination emits whole quads with matching position/color lengths', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      for (let mask = 0; mask <= 15; mask++) {
        const { positions, colors } = roadTileVertices(3, 3, tier, mask, flatHeightAt);
        expect(positions.length % 18).toBe(0); // whole quads: 6 vertices * 3 comps
        expect(colors.length).toBe(positions.length);
      }
    }
  });

  it('lone tile (mask 0): core plate + 2 flank kerbs + a rounded end and its kerb ring at each end', () => {
    // Both ends of a lone tile are dead ends, so it carries two of everything
    // a dangling stub carries at its one.
    const bothEnds = 2 * (END_CAP_SEGMENTS * 3 + END_CAP_SEGMENTS * 6);
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt);
    const paint = countWhere(colors, isPaint);
    expect(vertexCount(positions) - paint).toBe(3 * 6 + bothEnds);
  });

  it('a lone tile of a divided road still carries its median — it is a run one tile long, not a bare patch', () => {
    for (const tier of [RoadTier.Avenue, RoadTier.Highway]) {
      const lone = roadTileVertices(0, 0, tier, 0, flatHeightAt);
      const run = roadTileVertices(0, 0, tier, E | W, flatHeightAt);
      // The same divider geometry a straight run of this road lays down.
      const band = countWhere(run.colors, isConcreteBand);
      expect(band).toBeGreaterThan(0);
      expect(countWhere(lone.colors, isConcreteBand)).toBe(band);
    }
  });

  it('T-junction (mask N|E|S, popcount 3): the structural quad count matches the hand-derived total, plus non-zero marking geometry', () => {
    // core(6) + ext N,E,S(18) + curb W(6) = 30, plus 2 ROUNDED curb-return
    // corners (NE, SE) — each a carriageway fan (SEG*3) + a curved sidewalk
    // (SEG*6).
    const rounded = JUNCTION_CORNER_SEGMENTS * 12;
    const { positions, colors } = controlledJunction(5, 5, RoadTier.TwoLane, N | E | S);
    const markingVerts = countWhere(colors, isPaint);
    expect(vertexCount(positions)).toBe(30 + 2 * rounded + markingVerts);
    expect(markingVerts).toBeGreaterThan(0); // v2: junctions now carry arm markings
  });

  it('full 4-way intersection (mask 15): the structural quad count matches the hand-derived total, plus non-zero marking geometry', () => {
    // core(6) + 4 ext(24) = 30, plus 4 ROUNDED curb-return corners (fan SEG*3 +
    // curved sidewalk SEG*6 each).
    const rounded = JUNCTION_CORNER_SEGMENTS * 12;
    const { positions, colors } = controlledJunction(5, 5, RoadTier.TwoLane, 15);
    const markingVerts = countWhere(colors, isMarkingWhite);
    expect(vertexCount(positions)).toBe(30 + 4 * rounded + markingVerts);
    expect(markingVerts).toBeGreaterThan(0); // v2: junctions now carry arm markings on every side
  });
});

describe('roadTileVertices — terrain-conforming tessellation on slopes', () => {
  // Rises 0.2 m per tile in x — well above the flatness epsilon, so plate
  // quads must subdivide to hug the slope instead of spanning it flat.
  const slopedHeightAt = (x: number): number => x * 0.2;
  /**
   * A flat two-lane straight run: the core plate and its two flank kerbs, plus
   * the dashes of the centre line. Hard-coded so a plate that silently starts
   * subdividing flat ground fails here.
   */
  const FLAT_STRAIGHT_RUN_VERTS = 18 + 7 * 6;

  it('emits the same vertex count as before on flat terrain (no needless subdivision)', () => {
    // A straight run: the plain rectangular case, with none of a lone tile's
    // or a junction's extra geometry to hide a subdivision in.
    const flat = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, flatHeightAt);
    expect(vertexCount(flat.positions)).toBe(FLAT_STRAIGHT_RUN_VERTS);
  });

  it('emits more vertices on a slope (quads split into sub-cells)', () => {
    const sloped = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, slopedHeightAt);
    expect(vertexCount(sloped.positions)).toBeGreaterThan(FLAT_STRAIGHT_RUN_VERTS);
  });

  it('every plate vertex sits on (never below) its own terrain height', () => {
    const { positions } = roadTileVertices(0, 0, RoadTier.TwoLane, 0, slopedHeightAt);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      expect(y).toBeGreaterThanOrEqual(slopedHeightAt(x) - 1e-6);
    }
  });
});

describe('RoadMeshRenderer — night dimming', () => {
  it('dims the shared road material toward the night floor at full night and back to full by day', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    renderer.apply([makeDelta(0, 0, RoadTier.TwoLane)]);
    const material = (scene.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;

    renderer.setNightFactor(1);
    expect(material.color.r).toBeLessThan(0.5);
    const night = material.color.r;

    renderer.setNightFactor(0);
    expect(material.color.r).toBeCloseTo(1, 5);
    expect(night).toBeLessThan(material.color.r);
  });
});

describe('roadTileVertices — cosmetic corner rounding (UI-SPEC §6.18 #5 "Rounded roads")', () => {
  /** World Y an end-cap vertex sits at under flatHeightAt (hAt=0): exactly CAP_Y_OFFSET. */
  const isAtFilletHeight = (y: number): boolean => Math.abs(y - CAP_Y_OFFSET) < 1e-6;

  it('a dangling road end (popcount 1) adds exactly END_CAP_SEGMENTS extra triangles beyond the structural + marking total', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N, flatHeightAt);
    // The cap is counted by what it is rather than by subtracting everything
    // else, so a road that paints one more line does not move the total: the
    // asphalt fan sits at the cap height, the curb ring at curb height with
    // the tile's two straight flank curbs.
    const pos = toTriples(positions);
    const col = toTriples(colors);
    const fan = pos.filter((pt) => isAtFilletHeight(pt[1] as number)).length;
    expect(fan).toBe(END_CAP_SEGMENTS * 3);
    const ring = pos.filter(
      (pt, i) =>
        isSidewalk(col[i] as number[]) && Math.abs((pt[1] as number) - CURB_Y_OFFSET) < 1e-6,
    ).length;
    expect(ring).toBe(END_CAP_SEGMENTS * 6 + 2 * 6);
  });

  it('sits flush with the road (a hair above, below curb height) so the cap reads as continued pavement with no lip', () => {
    // Cap asphalt is coplanar-ish with the road (ROAD_Y_OFFSET 0.15), only a
    // hair above to render over any seam — and well BELOW curb height (0.23),
    // unlike a raised curb-return.
    expect(CAP_Y_OFFSET).toBeGreaterThan(0.15);
    expect(CAP_Y_OFFSET).toBeLessThan(0.16);
  });

  it('all four dangling-end masks (N, E, S, W) add an end-cap fan', () => {
    for (const mask of [N, E, S, W]) {
      const { positions } = roadTileVertices(4, 4, RoadTier.TwoLane, mask, flatHeightAt);
      expect(toTriples(positions).some((p) => isAtFilletHeight(p[1] as number))).toBe(true);
    }
  });

  it('a straight run (popcount 2, collinear) and any junction (popcount >= 3) get NO fillet/cap', () => {
    for (const mask of [N | S, E | W, N | E | S, N | E | S | W]) {
      const { positions } = roadTileVertices(3, 3, RoadTier.TwoLane, mask, flatHeightAt);
      expect(toTriples(positions).some((p) => isAtFilletHeight(p[1] as number))).toBe(false);
    }
  });

  it('a lone tile (popcount 0) gets a cap at BOTH ends — it dead-ends in both directions', () => {
    const { positions } = roadTileVertices(3, 3, RoadTier.TwoLane, 0, flatHeightAt);
    const fan = toTriples(positions).filter((p) => isAtFilletHeight(p[1] as number)).length;
    const dangling = toTriples(
      roadTileVertices(3, 3, RoadTier.TwoLane, N, flatHeightAt).positions,
    ).filter((p) => isAtFilletHeight(p[1] as number)).length;
    expect(fan).toBe(2 * dangling);
  });

  it('the end cap bulges outward past the core edge, away from the single connection', () => {
    // mask=N (connects north) dead-ends south -> the cap should reach past +coreHalf in world Z.
    const coreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION;
    const centerZ = 0.5 * TILE_METERS;
    const { positions } = roadTileVertices(0, 0, RoadTier.TwoLane, N, flatHeightAt);
    const maxZ = Math.max(
      ...toTriples(positions)
        .filter((p) => isAtFilletHeight(p[1] as number))
        .map((p) => p[2] as number),
    );
    expect(maxZ).toBeGreaterThan(centerZ + coreHalf);
  });

  it('the cap is a TRUE half-circle (bulge == coreHalf), so a WIDER carriageway bulges deeper — no armDepth clamp', () => {
    const centerZ = 0.5 * TILE_METERS;
    // bulge = how far the cap reaches PAST the tier's own flat dead-end edge
    // (centerZ + coreHalf), isolating the outward depth from coreHalf itself.
    const bulgeFor = (tier: RoadTier, coreHalf: number): number => {
      const { positions } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      const zs = toTriples(positions)
        .filter((p) => isAtFilletHeight(p[1] as number))
        .map((p) => p[2] as number);
      return Math.max(...zs) - (centerZ + coreHalf);
    };
    const highwayCoreHalf = TILE_METERS * HIGHWAY_HALF_WIDTH_FRACTION;
    const twoLaneCoreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION;
    // A true semicircle: the outward bulge equals the carriageway half-width.
    expect(bulgeFor(RoadTier.TwoLane, twoLaneCoreHalf)).toBeCloseTo(twoLaneCoreHalf, 5);
    expect(bulgeFor(RoadTier.Highway, highwayCoreHalf)).toBeCloseTo(highwayCoreHalf, 5);
    // Wider carriageway => deeper bulge (highway is wider than two-lane).
    expect(bulgeFor(RoadTier.Highway, highwayCoreHalf)).toBeGreaterThan(
      bulgeFor(RoadTier.TwoLane, twoLaneCoreHalf),
    );
  });

  it('is deterministic — the same (tier, mask, coords) always produces the same fillet/cap geometry', () => {
    const a = roadTileVertices(1, 1, RoadTier.TwoLane, N | E, flatHeightAt);
    const b = roadTileVertices(1, 1, RoadTier.TwoLane, N | E, flatHeightAt);
    expect(a.positions).toEqual(b.positions);
    expect(a.colors).toEqual(b.colors);
  });

  it('every (tier, turn-or-end mask) combination still emits whole quads (matching the file-wide 18-float invariant)', () => {
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.Gravel,
      RoadTier.Alley,
      RoadTier.OneWay,
      RoadTier.FourLane,
    ]) {
      for (const mask of [N, E, S, W, N | E, E | S, S | W, W | N]) {
        const { positions, colors } = roadTileVertices(5, 5, tier, mask, flatHeightAt);
        expect(positions.length % 18).toBe(0);
        expect(colors.length).toBe(positions.length);
      }
    }
  });
});

describe('roadTileVertices — dead-end cap full carriageway width (UI-SPEC §6.18 #5 follow-up, ticket endcap-width)', () => {
  const isAtFilletHeight = (y: number): boolean => Math.abs(y - CAP_Y_OFFSET) < 1e-6;

  /** Core plate half-width in world meters, measured the same way as the per-tier carriageway-ratio tests above. */
  function coreHalfMeters(tier: RoadTier): number {
    const positions = roadTileVertices(0, 0, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return (Math.max(...xs) - Math.min(...xs)) / 2;
  }

  it('the dead-end cap is a full half-circle of radius coreHalf for every paved/gravel tier', () => {
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.FourLane,
      RoadTier.Gravel,
      RoadTier.Alley,
    ]) {
      const coreHalf = coreHalfMeters(tier);
      const centerZ = 0.5 * TILE_METERS;
      const { positions } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      const capZs = toTriples(positions)
        .filter((p) => isAtFilletHeight(p[1] as number))
        .map((p) => p[2] as number);
      expect(capZs.length).toBeGreaterThan(0);
      const bulge = Math.max(...capZs) - (centerZ + coreHalf);
      expect(bulge).toBeCloseTo(coreHalf, 5); // a true semicircle, radius coreHalf
    }
  });

  it('wide carriageways (avenue/four-lane) round out PAST the tile edge, while narrow tiers stay inside it', () => {
    const centerZ = 0.5 * TILE_METERS;
    const farEdge = centerZ + TILE_METERS / 2;
    const capMaxZ = (tier: RoadTier): number => {
      const { positions } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      return Math.max(
        ...toTriples(positions)
          .filter((p) => isAtFilletHeight(p[1] as number))
          .map((p) => p[2] as number),
      );
    };
    // Wide tiers have < coreHalf of tile room, so a true half-circle spills past
    // the far edge into the open ground (a cul-de-sac).
    expect(capMaxZ(RoadTier.Avenue)).toBeGreaterThan(farEdge);
    expect(capMaxZ(RoadTier.FourLane)).toBeGreaterThan(farEdge);
    // Narrow tiers' bulb fits comfortably within the tile.
    expect(capMaxZ(RoadTier.TwoLane)).toBeLessThanOrEqual(farEdge + 1e-6);
    expect(capMaxZ(RoadTier.Alley)).toBeLessThanOrEqual(farEdge + 1e-6);
  });

  it("the half-disc's vertex positions span the FULL carriageway width across the open (dead-end) edge — from -coreHalf to +coreHalf on the cross axis, for every tier", () => {
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.FourLane,
      RoadTier.Gravel,
      RoadTier.Alley,
    ]) {
      const coreHalf = coreHalfMeters(tier);
      const centerX = 0.5 * TILE_METERS;
      // mask=N: dead-ends south, a vertical cap whose cross axis is world X.
      const { positions } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      const capXs = toTriples(positions)
        .filter((p) => isAtFilletHeight(p[1] as number))
        .map((p) => p[0] as number);
      expect(Math.min(...capXs)).toBeCloseTo(centerX - coreHalf, 6);
      expect(Math.max(...capXs)).toBeCloseTo(centerX + coreHalf, 6);
    }
  });

  it('a horizontal dead-end (mask=E or W) spans the full carriageway width on the Z cross axis too', () => {
    const coreHalf = coreHalfMeters(RoadTier.TwoLane);
    const centerZ = 0.5 * TILE_METERS;
    for (const mask of [E, W]) {
      const { positions } = roadTileVertices(0, 0, RoadTier.TwoLane, mask, flatHeightAt);
      const capZs = toTriples(positions)
        .filter((p) => isAtFilletHeight(p[1] as number))
        .map((p) => p[2] as number);
      expect(Math.min(...capZs)).toBeCloseTo(centerZ - coreHalf, 6);
      expect(Math.max(...capZs)).toBeCloseTo(centerZ + coreHalf, 6);
    }
  });
});

describe('roadTileVertices — road-end-cap-v2: curb ring hugs the rounded dead-end cap (UI-SPEC §15)', () => {
  const isAtCurbHeight = (y: number): boolean => Math.abs(y - CURB_Y_OFFSET) < 1e-6;

  function coreHalfMeters(tier: RoadTier): number {
    const positions = roadTileVertices(0, 0, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return (Math.max(...xs) - Math.min(...xs)) / 2;
  }

  it('every dead-end triangle faces UP (+Y normal) — the cap fan and its wrap-around curb must not be culled by the single-sided road material', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue]) {
      for (const mask of [N, E, S, W]) {
        const { positions } = roadTileVertices(0, 0, tier, mask, flatHeightAt);
        const p = toTriples(positions);
        for (let i = 0; i < p.length; i += 3) {
          const v0 = p[i] as number[];
          const v1 = p[i + 1] as number[];
          const v2 = p[i + 2] as number[];
          const normalY =
            ((v1[2] as number) - (v0[2] as number)) * ((v2[0] as number) - (v0[0] as number)) -
            ((v1[0] as number) - (v0[0] as number)) * ((v2[2] as number) - (v0[2] as number));
          expect(normalY).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });

  it('the cap curb ring (last END_CAP_SEGMENTS quads) is a full-width half-annulus hugging the rim: inner at the cap radius, outer one sidewalk-width further, rounding the tip past the tile edge', () => {
    const centerZ = 0.5 * TILE_METERS;
    for (const tier of [RoadTier.TwoLane, RoadTier.OneWay]) {
      const coreHalf = coreHalfMeters(tier);
      const armDepth = TILE_METERS / 2 - coreHalf;
      const capRadius = Math.min(coreHalf, armDepth);
      const sidewalk = 1.875; // SIDEWALK_WIDTH_M
      // Pivot: same point emitEndCap's apex sits at (mask=N -> outwardSign +1).
      const pivotZ = centerZ + coreHalf;
      const pivotX = 0.5 * TILE_METERS;
      const { positions, colors } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      // The ring is END_CAP_SEGMENTS quads (2 triangles apiece) of curb-height,
      // sidewalk-coloured geometry. It is found by what it is rather than by
      // where it sits in the buffer, since the cap's edge lines wrap it too.
      const ringVertCount = END_CAP_SEGMENTS * 6;
      const allPos = toTriples(positions);
      const allCol = toTriples(colors);
      // The ring is the CURVED curb: sidewalk paint at curb height, standing
      // between the cap rim and one sidewalk-width beyond it. The tile's two
      // straight flank curbs are the same colour and height but sit alongside
      // the carriageway, not around the bulb.
      const ringIndices = allPos
        .map((_, i) => i)
        .filter((i) => {
          const pt = allPos[i] as number[];
          if (!isSidewalk(allCol[i] as number[])) return false;
          if (!isAtCurbHeight(pt[1] as number)) return false;
          const dx = (pt[0] as number) - pivotX;
          const dz = (pt[2] as number) - pivotZ;
          const r = Math.hypot(dx, dz);
          return r >= capRadius - 1e-6 && r <= capRadius + sidewalk + 1e-6 && dz >= -1e-6;
        });
      const posTriples = ringIndices.map((i) => allPos[i] as number[]);
      const colorTriples = ringIndices.map((i) => allCol[i] as number[]);
      expect(posTriples.length).toBeGreaterThanOrEqual(ringVertCount);
      const alongOffsets: number[] = [];
      for (let i = 0; i < posTriples.length; i++) {
        const p = posTriples[i] as number[];
        expect(isAtCurbHeight(p[1] as number)).toBe(true);
        expect(isSidewalk(colorTriples[i] as number[])).toBe(true);
        alongOffsets.push((p[2] as number) - pivotZ); // outward = +Z for mask=N
      }
      // The wrap runs from the asphalt rim (capRadius) to one sidewalk-width
      // beyond it — the tip rounds past the tile edge into the open ground the
      // dead end faces (never a flat cut).
      expect(Math.min(...alongOffsets)).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(...alongOffsets)).toBeCloseTo(capRadius + sidewalk, 5);
    }
  });

  it('Gravel/Alley (no curbs) never get a curb ring at a dead end', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      const { colors } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      expect(countWhere(colors, isSidewalk)).toBe(0);
    }
  });

  it('sidewalk vertex counts: straights/isolated are flat curb quads; junctions add a curved curb-return per rounded corner', () => {
    const curbReturn = JUNCTION_CORNER_SEGMENTS * 6; // one rounded corner's curved sidewalk band
    const expected: Array<[number, number]> = [
      // A lone tile: the same 2 flat flank quads a straight run has, plus a
      // curved ring wrapping each of its two rounded ends.
      [0, 2 * 6 + 2 * END_CAP_SEGMENTS * 6],
      [N | S, 2 * 6], // straight run: 2 flat curb quads
      [E | W, 2 * 6], // straight run: 2 flat curb quads
      [N | E | S, 1 * 6 + 2 * curbReturn], // T: flat W curb + 2 rounded corner-returns (NE, SE)
      [N | E | S | W, 4 * curbReturn], // 4-way: a curb-return at each of the 4 rounded corners
    ];
    for (const [mask, count] of expected) {
      const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, mask, flatHeightAt);
      expect(countWhere(colors, isSidewalk)).toBe(count);
    }
  });

  it('is deterministic — the same (tier, mask, coords) always produces the same curb-ring geometry', () => {
    const a = roadTileVertices(2, 3, RoadTier.TwoLane, E, flatHeightAt);
    const b = roadTileVertices(2, 3, RoadTier.TwoLane, E, flatHeightAt);
    expect(a.positions).toEqual(b.positions);
    expect(a.colors).toEqual(b.colors);
  });
});

describe('isPlainCenterlineTier', () => {
  it('is true only for TwoLane and One-Way (the single-dashed-centerline tiers)', () => {
    expect(isPlainCenterlineTier(RoadTier.TwoLane)).toBe(true);
    expect(isPlainCenterlineTier(RoadTier.OneWay)).toBe(true);
    for (const tier of [
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.Gravel,
      RoadTier.Alley,
      RoadTier.FourLane,
    ]) {
      expect(isPlainCenterlineTier(tier)).toBe(false);
    }
  });
});

describe('roadTileVertices — curved turn (quarter-annulus)', () => {
  const TILE_HALF = TILE_METERS / 2;
  const coreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION; // TwoLane carriageway half-width
  const armDepth = TILE_HALF - coreHalf;
  const rIn = armDepth;
  const rOut = TILE_HALF + coreHalf;

  it('every turn triangle faces UP (+Y normal) — a down-wound triangle is culled by the single-sided road material and would make the curve invisible', () => {
    // The road material is FrontSide MeshBasicMaterial; on flat terrain every
    // road/sidewalk triangle must have an upward geometric normal or it
    // vanishes (this is exactly the bug where the curved corner rendered as a
    // grass gap). Normal.y of triangle (v0,v1,v2) = e1.z*e2.x - e1.x*e2.z.
    for (const mask of [N | E, E | S, S | W, N | W]) {
      const { positions } = roadTileVertices(0, 0, RoadTier.TwoLane, mask, flatHeightAt);
      const p = toTriples(positions);
      expect(p.length % 3).toBe(0);
      for (let i = 0; i < p.length; i += 3) {
        const v0 = p[i] as number[];
        const v1 = p[i + 1] as number[];
        const v2 = p[i + 2] as number[];
        const e1z = (v1[2] as number) - (v0[2] as number);
        const e1x = (v1[0] as number) - (v0[0] as number);
        const e2z = (v2[2] as number) - (v0[2] as number);
        const e2x = (v2[0] as number) - (v0[0] as number);
        const normalY = e1z * e2x - e1x * e2z;
        expect(normalY).toBeGreaterThanOrEqual(-1e-9); // up-facing (or degenerate), never down
      }
    }
  });

  /** Core plate color: color of vertex 0 of an isolated tile of this tier/coords. */
  function plateColorOf(tier: RoadTier, x = 0, z = 0): number[] {
    return roadTileVertices(x, z, tier, 0, flatHeightAt).colors.slice(0, 3);
  }
  const isPlateColor = (c: readonly number[], ref: readonly number[]): boolean =>
    Math.abs((c[0] as number) - (ref[0] as number)) < 1e-6 &&
    Math.abs((c[1] as number) - (ref[1] as number)) < 1e-6 &&
    Math.abs((c[2] as number) - (ref[2] as number)) < 1e-6;

  /** Carriageway verts of a turn tile: those whose color matches the tier plate color. */
  function carriagewayPoints(tier: RoadTier, x: number, z: number, mask: number): number[][] {
    const ref = plateColorOf(tier, x, z);
    const { positions, colors } = roadTileVertices(x, z, tier, mask, flatHeightAt);
    const pos = toTriples(positions);
    const col = toTriples(colors);
    const pts: number[][] = [];
    for (let i = 0; i < pos.length; i++) {
      if (isPlateColor(col[i] as number[], ref)) pts.push(pos[i] as number[]);
    }
    return pts;
  }

  /** World pivot corner of a turn tile, mirroring emitCurvedTurn's pivot rule. */
  function pivotWorld(x: number, z: number, hasN: boolean, hasE: boolean): [number, number] {
    const centerX = (x + 0.5) * TILE_METERS;
    const centerZ = (z + 0.5) * TILE_METERS;
    return [centerX + (hasE ? 1 : -1) * TILE_HALF, centerZ + (hasN ? -1 : 1) * TILE_HALF];
  }

  it('every carriageway vert of a TwoLane N|E turn lies within the [rIn, rOut] annulus around the pivot, and the band spans the full width', () => {
    const [pivotX, pivotZ] = pivotWorld(0, 0, true, true);
    const pts = carriagewayPoints(RoadTier.TwoLane, 0, 0, N | E);
    expect(pts.length).toBeGreaterThan(0);
    const dists = pts.map((p) => Math.hypot((p[0] as number) - pivotX, (p[2] as number) - pivotZ));
    for (const d of dists) {
      expect(d).toBeGreaterThanOrEqual(rIn - 1e-4);
      expect(d).toBeLessThanOrEqual(rOut + 1e-4);
    }
    // At least one vert at the inner radius and one at the outer: full-width band.
    expect(Math.min(...dists)).toBeCloseTo(rIn, 5);
    expect(Math.max(...dists)).toBeCloseTo(rOut, 5);
  });

  it('the carriageway reaches both edge openings seamlessly (N edge at world z=0, E edge at world x=TILE_METERS)', () => {
    const pts = carriagewayPoints(RoadTier.TwoLane, 0, 0, N | E);
    const zs = pts.map((p) => p[2] as number);
    const xs = pts.map((p) => p[0] as number);
    expect(Math.min(...zs)).toBeCloseTo(0, 5); // north edge of tile (0,0)
    expect(Math.max(...xs)).toBeCloseTo(TILE_METERS, 5); // east edge of tile (0,0)
  });

  it('a curbed turn tier (TwoLane) emits sidewalk verts; bare tiers (Gravel, Alley) emit none', () => {
    const twoLane = roadTileVertices(0, 0, RoadTier.TwoLane, N | E, flatHeightAt).colors;
    expect(countWhere(twoLane, isSidewalk)).toBeGreaterThan(0);
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      const { colors } = roadTileVertices(0, 0, tier, N | E, flatHeightAt);
      expect(countWhere(colors, isSidewalk)).toBe(0);
    }
  });

  it('all four turn masks (N|E, E|S, S|W, N|W) produce a non-empty carriageway and are deterministic', () => {
    for (const mask of [N | E, E | S, S | W, N | W]) {
      const a = roadTileVertices(2, 2, RoadTier.TwoLane, mask, flatHeightAt);
      const b = roadTileVertices(2, 2, RoadTier.TwoLane, mask, flatHeightAt);
      expect(carriagewayPoints(RoadTier.TwoLane, 2, 2, mask).length).toBeGreaterThan(0);
      expect(vertexCount(a.positions)).toBeGreaterThan(0);
      expect(a.positions).toEqual(b.positions);
      expect(a.colors).toEqual(b.colors);
    }
  });

  it('marked tiers carry curved lane markings around the turn; bare tiers (Gravel, Alley) stay unpainted', () => {
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.OneWay,
      RoadTier.Avenue,
      RoadTier.Highway,
      RoadTier.FourLane,
    ]) {
      const { colors } = roadTileVertices(0, 0, tier, N | E, flatHeightAt);
      expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
    }
    for (const tier of [RoadTier.Gravel, RoadTier.Alley]) {
      const { colors } = roadTileVertices(0, 0, tier, N | E, flatHeightAt);
      expect(countWhere(colors, isMarkingWhite)).toBe(0);
    }
  });

  it('the carriageway is one quad per arc segment (TURN_ARC_SEGMENTS = 12 quads of plate color)', () => {
    expect(TURN_ARC_SEGMENTS).toBe(12);
    const pts = carriagewayPoints(RoadTier.TwoLane, 0, 0, N | E);
    expect(pts.length).toBe(TURN_ARC_SEGMENTS * 6); // one 2-triangle quad per segment
  });
});

describe('roadTileVertices — sidewalks/shoulders (§6.7)', () => {
  it('a hand-built 3-tile straight road: curbs land only on edges with no road neighbor', () => {
    // A north-south TwoLane road occupying z=0..2 at x=0. Tile (0,-1) and
    // (0,3) do not exist / are not road, so the end tiles are missing one
    // connection each.
    const south = S; // z=0: only the z+1 neighbor (z=1) is road
    const both = N | S; // z=1: neighbors on both sides are road
    const north = N; // z=2: only the z-1 neighbor (z=1) is road

    const t0 = roadTileVertices(0, 0, RoadTier.TwoLane, south, flatHeightAt);
    const t1 = roadTileVertices(0, 1, RoadTier.TwoLane, both, flatHeightAt);
    const t2 = roadTileVertices(0, 2, RoadTier.TwoLane, north, flatHeightAt);

    // z=1 (through-run) is missing E, W -> 2 straight curb quads, no cap ring.
    // z=0 and z=2 are dead ends (popcount 1): the bulb-facing straight curb is
    // suppressed (the curved cap curb wraps it instead), so 2 FLANK curb quads
    // + the END_CAP_SEGMENTS-quad cap curb ring (see emitEndCapCurb).
    const ringVerts = END_CAP_SEGMENTS * 6;
    expect(countWhere(t0.colors, isSidewalk)).toBe(2 * 6 + ringVerts);
    expect(countWhere(t1.colors, isSidewalk)).toBe(2 * 6);
    expect(countWhere(t2.colors, isSidewalk)).toBe(2 * 6 + ringVerts);
  });

  it('places the missing-side curb HUGGING the carriageway (fixed width), leaving a grass verge to the tile edge', () => {
    // Straight E|W run: N and S are unconnected, so each carries a curb. The
    // curb is now a fixed SIDEWALK_WIDTH_M strip against the carriageway edge,
    // not a fill-to-edge strip — a grass verge sits between it and the tile
    // boundary. Tile (0,0): centerZ = 8, TwoLane coreHalf = 3.75, sidewalk
    // 1.875. The N curb spans world Z [8 - 3.75 - 1.875, 8 - 3.75] = [2.375, 4.25].
    const coreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION;
    const sidewalk = 1.875;
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, E | W, flatHeightAt);
    const triples = toTriples(positions);
    const colorTriples = toTriples(colors);
    let minCurbZ = Infinity;
    let maxCurbZonNorth = -Infinity;
    for (let i = 0; i < triples.length; i++) {
      if (isSidewalk(colorTriples[i] as number[])) {
        const zc = (triples[i] as number[])[2] as number;
        minCurbZ = Math.min(minCurbZ, zc);
        if (zc < TILE_METERS / 2) maxCurbZonNorth = Math.max(maxCurbZonNorth, zc); // north-side curb only
      }
    }
    // Inner edge sits exactly at the carriageway edge; outer edge is one
    // sidewalk-width out; neither reaches the tile boundary (world Z 0).
    expect(maxCurbZonNorth).toBeCloseTo(TILE_METERS / 2 - coreHalf, 5);
    expect(minCurbZ).toBeCloseTo(TILE_METERS / 2 - coreHalf - sidewalk, 5);
    expect(minCurbZ).toBeGreaterThan(0); // grass verge remains
  });

  it('a junction curb-return sidewalk lands FLUSH with the straight road sidewalks at the tile edge ([coreHalf, coreHalf+sidewalk]) — seamless transition', () => {
    // 4-way tile (0,0): centerX=centerZ=8. Along the north edge (world z=0),
    // the NE curb-return's sidewalk must occupy the same band a straight road's
    // side sidewalk does: x ∈ [8 + coreHalf, 8 + coreHalf + sidewalk].
    const coreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION;
    const sidewalk = 1.875;
    const { positions, colors } = roadTileVertices(
      0,
      0,
      RoadTier.TwoLane,
      N | E | S | W,
      flatHeightAt,
    );
    const pos = toTriples(positions);
    const col = toTriples(colors);
    const xs: number[] = [];
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i] as number[];
      // north edge (z≈0), east half (x>center) → the NE corner's sidewalk.
      if (
        isSidewalk(col[i] as number[]) &&
        Math.abs((p[2] as number) - 0) < 1e-6 &&
        (p[0] as number) > TILE_METERS / 2
      ) {
        xs.push(p[0] as number);
      }
    }
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeCloseTo(TILE_METERS / 2 + coreHalf, 5);
    expect(Math.max(...xs)).toBeCloseTo(TILE_METERS / 2 + coreHalf + sidewalk, 5);
  });

  it('a lone tile (mask 0) gets 2 straight flank curbs and a ring round each end; a full intersection (mask 15) gets a curved curb-return at each of its 4 rounded corners', () => {
    const lone = roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt);
    const junction = roadTileVertices(0, 0, RoadTier.TwoLane, N | E | S | W, flatHeightAt);
    expect(countWhere(lone.colors, isSidewalk)).toBe(2 * 6 + 2 * END_CAP_SEGMENTS * 6);
    expect(countWhere(junction.colors, isSidewalk)).toBe(4 * JUNCTION_CORNER_SEGMENTS * 6);
  });

  it('curbs are raised exactly 0.08m above the road surface', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt);
    const posTriples = toTriples(positions);
    const colorTriples = toTriples(colors);
    const roadY = (posTriples[0] as number[])[1] as number; // core quad's first vertex
    const curbIndex = colorTriples.findIndex((t) => isSidewalk(t));
    expect(curbIndex).toBeGreaterThanOrEqual(0);
    const curbY = (posTriples[curbIndex] as number[])[1] as number;
    expect(curbY - roadY).toBeCloseTo(0.08, 6);
  });
});

/** Dusty tan family check for Gravel's jittered vertex color. */
function isGravelTan(t: readonly number[]): boolean {
  const [r, g, b] = t as [number, number, number];
  return r > 0.5 && r < 0.72 && g > 0.43 && g < 0.65 && b > 0.3 && b < 0.52 && r > g && g > b;
}

/** Local mirror of the dash-count-over-a-tile-span helper used elsewhere in this file. */
function dashCountForZ(z: number): number {
  const centerZ = (z + 0.5) * TILE_METERS;
  return dashSegments(centerZ - TILE_METERS / 2, centerZ + TILE_METERS / 2).length;
}
function dashCountForX(x: number): number {
  const centerX = (x + 0.5) * TILE_METERS;
  return dashSegments(centerX - TILE_METERS / 2, centerX + TILE_METERS / 2).length;
}

describe('roadTileVertices — paved→gravel transition seam', () => {
  const noN = { n: RoadTier.None, e: RoadTier.None, s: RoadTier.None, w: RoadTier.None };

  it('a paved tile connected to a gravel neighbor emits a grey→tan transition band; without one, none', () => {
    const withGravel = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, flatHeightAt, {
      ...noN,
      s: RoadTier.Gravel,
    });
    const plain = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, flatHeightAt);
    expect(countWhere(withGravel.colors, isGravelTan)).toBeGreaterThan(0);
    expect(countWhere(plain.colors, isGravelTan)).toBe(0);
  });

  it('the seam only appears on a CONNECTED edge facing gravel (a gravel neighbor on an unconnected side is ignored)', () => {
    // mask N only (S not connected), but a gravel tile sits south -> no seam.
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N, flatHeightAt, {
      ...noN,
      s: RoadTier.Gravel,
    });
    expect(countWhere(colors, isGravelTan)).toBe(0);
  });

  it('the seam band sits near the gravel-facing (south) edge of the tile', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N | S, flatHeightAt, {
      ...noN,
      s: RoadTier.Gravel,
    });
    const pos = toTriples(positions);
    const col = toTriples(colors);
    const tanZs = pos.filter((_, i) => isGravelTan(col[i] as number[])).map((p) => p[2] as number);
    expect(tanZs.length).toBeGreaterThan(0);
    // Tile (0,0) spans world Z [0, TILE_METERS]; tan verts hug its south edge.
    expect(Math.max(...tanZs)).toBeCloseTo(TILE_METERS, 5);
  });
});

describe('roadTileVertices — Gravel (tier 4, UI-SPEC §6.7 Roads v3)', () => {
  /** Measures the core plate's world-X span the same way as the carriageway tests. */
  function coreSpanMeters(tier: RoadTier, x = 0, z = 0): number {
    const positions = roadTileVertices(x, z, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('has a narrow rural core (~1.5 lanes), narrower than a two-lane', () => {
    const span = coreSpanMeters(RoadTier.Gravel);
    expect(span).toBeCloseTo(5.625, 5); // 1.5 lanes × 3.75
    expect(span).toBeLessThan(coreSpanMeters(RoadTier.TwoLane));
  });

  it('is dusty tan (the ~[0.62,0.55,0.42] family), not any asphalt grey', () => {
    const { colors } = roadTileVertices(2, 2, RoadTier.Gravel, N | S, flatHeightAt);
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isGravelTan(c)).toBe(true);
  });

  it('applies slight deterministic per-tile color variation, not a single flat shade', () => {
    const colorsAt = (x: number, z: number): number[] =>
      roadTileVertices(x, z, RoadTier.Gravel, 0, flatHeightAt).colors.slice(0, 3);
    const samples = new Set<string>();
    for (let x = 0; x < 10; x++) samples.add(JSON.stringify(colorsAt(x, 0)));
    expect(samples.size).toBeGreaterThan(1); // not every tile is identical
  });

  it('gravelColorAt is pure and deterministic, and stays within a small jitter of the base color', () => {
    expect(gravelColorAt(4, 9)).toEqual(gravelColorAt(4, 9));
    const [r, g, b] = gravelColorAt(4, 9);
    expect(Math.abs(r - 0.62)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.abs(g - 0.55)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.abs(b - 0.42)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('has NO curbs — a lone tile is bare plate and rounded ends, with no sidewalk quads at all', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.Gravel, 0, flatHeightAt);
    expect(vertexCount(positions)).toBe(6 + 2 * END_CAP_SEGMENTS * 3);
    expect(countWhere(colors, isSidewalk)).toBe(0);
  });

  it('has NO paint on a straight run (no dashed centerline, unlike every paved tier)', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Gravel, N | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
  });

  it('gravel junctions stay unpainted: no stop-line/crosswalk markings at a T-junction', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Gravel, N | E | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
    // The junction box interior and its arms are still bare tan asphalt-analog, not clean grey.
    for (const c of toTriples(colors)) {
      expect(isMarkingWhite(c)).toBe(false);
    }
  });

  it('never carries an avenue median or highway divider', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Gravel, N | S, flatHeightAt);
    expect(countWhere(colors, isMedianGrass)).toBe(0);
    expect(countWhere(colors, isConcreteBand)).toBe(0);
  });
});

describe('roadTileVertices — Alley (tier 5, UI-SPEC §6.7 Roads v3)', () => {
  function coreSpanMeters(tier: RoadTier): number {
    const positions = roadTileVertices(0, 0, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('has a narrow core, ~3.5m — narrower than two-lane', () => {
    const span = coreSpanMeters(RoadTier.Alley);
    expect(span).toBeGreaterThanOrEqual(3);
    expect(span).toBeLessThanOrEqual(4);
    expect(span).toBeLessThan(coreSpanMeters(RoadTier.TwoLane));
  });

  it("alley's ~3.5m core is narrower than gravel's ~5m core", () => {
    expect(coreSpanMeters(RoadTier.Alley)).toBeLessThan(coreSpanMeters(RoadTier.Gravel));
  });

  it('is a dark asphalt tier color, not the dusty-tan gravel family', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Alley, 0, flatHeightAt);
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isGravelTan(c)).toBe(false);
  });

  it('has NO sidewalk curbs — a lone tile is bare plate and rounded ends', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.Alley, 0, flatHeightAt);
    expect(vertexCount(positions)).toBe(6 + 2 * END_CAP_SEGMENTS * 3);
    expect(countWhere(colors, isSidewalk)).toBe(0);
  });

  it('has NO centerline on a straight run', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Alley, N | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
  });

  it('is still a "paved tier" — a T-junction gets stop-line + crosswalk arm markings', () => {
    const { colors } = controlledJunction(0, 0, RoadTier.Alley, N | E | S);
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false); // box interior stays clean
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0); // but arms carry markings
  });
});

describe('roadTileVertices — One-Way (tier 6, UI-SPEC §6.7 Roads v3)', () => {
  function coreSpanMeters(tier: RoadTier): number {
    const positions = roadTileVertices(0, 0, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('has the two-lane carriageway width ("two-lane look")', () => {
    const span = coreSpanMeters(RoadTier.OneWay);
    expect(span).toBeCloseTo(7.5, 5); // 2 lanes
    expect(span).toBeCloseTo(coreSpanMeters(RoadTier.TwoLane), 6);
  });

  it('draws the same single dashed centerline as two-lane, on a non-arrow tile', () => {
    // z=1 is not a multiple of ARROW_PERIOD_TILES (3), so no arrow interferes.
    expect(isArrowTile(1)).toBe(false);
    const { colors } = roadTileVertices(0, 1, RoadTier.OneWay, N | S, flatHeightAt);
    // Its lane line plus the RIGHT edge line; a one-way street's left edge is
    // yellow, since it faces the opposing carriageway rather than the roadside.
    expect(countWhere(colors, isMarkingWhite)).toBe(dashCountForZ(1) * 6 + 1 * 6);
    expect(countWhere(colors, isMarkingYellow)).toBe(1 * 6);
  });

  it('is still a "paved tier" — a T-junction gets stop-line + crosswalk arm markings', () => {
    const { colors } = controlledJunction(1, 1, RoadTier.OneWay, N | E | S);
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  describe('direction arrows', () => {
    it('ARROW_PERIOD_TILES is 3 ("every ~3rd tile")', () => {
      expect(ARROW_PERIOD_TILES).toBe(3);
    });

    it('isArrowTile is true at every 3rd coordinate, including across zero and negative coords', () => {
      for (const c of [-6, -3, 0, 3, 6, 9]) expect(isArrowTile(c)).toBe(true);
      for (const c of [-5, -2, 1, 2, 4, 5]) expect(isArrowTile(c)).toBe(false);
    });

    it('adds exactly one arrow (stem + 2 head quads = 3 quads) worth of extra marking geometry on an arrow tile vs a non-arrow tile with the same dash phase parity', () => {
      // z=0 and z=3 are both arrow tiles; z=1,2,4,5 are not. Compare an arrow
      // tile against a non-arrow tile and account for dash-count difference.
      for (const z of [0, 1, 2, 3, 4, 5]) {
        const { colors } = roadTileVertices(0, z, RoadTier.OneWay, N | S, flatHeightAt);
        const expectedDash = dashCountForZ(z) * 6;
        const expectedArrow = isArrowTile(z) ? 3 * 6 : 0;
        expect(countWhere(colors, isMarkingWhite)).toBe(expectedDash + expectedArrow + 1 * 6);
      }
    });

    it('same arrow-count rule holds for a horizontal (E|W) run, keyed on global X', () => {
      for (const x of [0, 1, 2, 3]) {
        const { colors } = roadTileVertices(x, 0, RoadTier.OneWay, E | W, flatHeightAt);
        const expectedDash = dashCountForX(x) * 6;
        const expectedArrow = isArrowTile(x) ? 3 * 6 : 0;
        expect(countWhere(colors, isMarkingWhite)).toBe(expectedDash + expectedArrow + 1 * 6);
      }
    });

    it('on a vertical run, the arrow head sits toward the low->high (+Z) coordinate', () => {
      // z=3 is an arrow tile.
      const { positions, colors } = roadTileVertices(0, 3, RoadTier.OneWay, N | S, flatHeightAt);
      const posTriples = toTriples(positions);
      const colorTriples = toTriples(colors);
      const centerX = 0.5 * TILE_METERS;
      const centerZ = 3.5 * TILE_METERS;
      let sawHeadVertex = false;
      for (let i = 0; i < posTriples.length; i++) {
        if (!isMarkingWhite(colorTriples[i] as number[])) continue;
        const worldX = (posTriples[i] as number[])[0] as number;
        // The dashed centerline and the arrow's stem never exceed ±0.15m
        // across the travel axis; only the arrow's head wings reach further —
        // isolating them lets us check orientation unambiguously.
        // The arrow's head wings reach past the stem but stay well inside the
        // edge lines, which sit at the carriageway edge.
        const across = Math.abs(worldX - centerX);
        if (across > 0.2 && across < 2) {
          sawHeadVertex = true;
          const worldZ = (posTriples[i] as number[])[2] as number;
          expect(worldZ).toBeGreaterThan(centerZ);
        }
      }
      expect(sawHeadVertex).toBe(true);
    });

    it('on a horizontal run, the arrow head sits toward the low->high (+X) coordinate', () => {
      // x=3 is an arrow tile.
      const { positions, colors } = roadTileVertices(3, 0, RoadTier.OneWay, E | W, flatHeightAt);
      const posTriples = toTriples(positions);
      const colorTriples = toTriples(colors);
      const centerX = 3.5 * TILE_METERS;
      const centerZ = 0.5 * TILE_METERS;
      let sawHeadVertex = false;
      for (let i = 0; i < posTriples.length; i++) {
        if (!isMarkingWhite(colorTriples[i] as number[])) continue;
        const worldZ = (posTriples[i] as number[])[2] as number;
        const across = Math.abs(worldZ - centerZ);
        if (across > 0.2 && across < 2) {
          sawHeadVertex = true;
          const worldX = (posTriples[i] as number[])[0] as number;
          expect(worldX).toBeGreaterThan(centerX);
        }
      }
      expect(sawHeadVertex).toBe(true);
    });

    it('no arrow (no head-wing-range vertex) on a non-arrow tile', () => {
      expect(isArrowTile(4)).toBe(false);
      const { positions, colors } = roadTileVertices(0, 4, RoadTier.OneWay, N | S, flatHeightAt);
      const posTriples = toTriples(positions);
      const colorTriples = toTriples(colors);
      const centerX = 0.5 * TILE_METERS;
      for (let i = 0; i < posTriples.length; i++) {
        if (!isMarkingWhite(colorTriples[i] as number[])) continue;
        const across = Math.abs((posTriples[i] as number[])[0] as number) - centerX;
        // Nothing between the stem and the edge lines: no arrow head here.
        expect(Math.abs(across) > 0.2 && Math.abs(across) < 2).toBe(false);
      }
    });

    it('is deterministic — the same tile always produces the same arrow geometry', () => {
      const a = roadTileVertices(0, 3, RoadTier.OneWay, N | S, flatHeightAt);
      const b = roadTileVertices(0, 3, RoadTier.OneWay, N | S, flatHeightAt);
      expect(a.positions).toEqual(b.positions);
      expect(a.colors).toEqual(b.colors);
    });
  });
});

describe('roadTileVertices — Four-Lane (tier 7, UI-SPEC §6.7 Roads v3)', () => {
  function coreSpanMeters(tier: RoadTier): number {
    const positions = roadTileVertices(0, 0, tier, 0, flatHeightAt).positions.slice(0, 18);
    const xs = positions.filter((_, i) => i % 3 === 0);
    return Math.max(...xs) - Math.min(...xs);
  }

  it('has a 4-lane carriageway = 15m, narrower than the avenue by the median it lacks', () => {
    const span = coreSpanMeters(RoadTier.FourLane);
    expect(span).toBeCloseTo(15, 5);
    // The two were once the same width and told apart by their markings. Both
    // now carry four full lanes and a footway each side; the avenue is wider
    // by exactly the refuge median down its middle.
    expect(coreSpanMeters(RoadTier.Avenue) - span).toBeCloseTo(1.2, 5);
  });

  it('draws dashed lane dividers + a solid double center pair, on EVERY straight run (no median ever suppresses it)', () => {
    for (const mask of [N | S, E | W]) {
      const { colors } = roadTileVertices(0, 0, RoadTier.FourLane, mask, flatHeightAt);
      const z = mask === (N | S) ? 0 : undefined;
      const dashCount = z !== undefined ? dashCountForZ(0) : dashCountForX(0);
      // 2 solid center quads + 2 dashed lane lines' worth of quads.
      expect(countWhere(colors, isMarkingWhite)).toBe((2 + 2 * dashCount) * 6);
    }
  });

  it('NEVER carries an avenue median, even on a straight run', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.FourLane, N | S, flatHeightAt);
    expect(countWhere(colors, isMedianGrass)).toBe(0);
    expect(countWhere(colors, isConcreteBand)).toBe(0);
    expect(isAvenueMedianEligible(RoadTier.FourLane, N | S)).toBe(false);
  });

  it('is a "paved tier" — a T-junction gets stop-line + crosswalk arm markings, clean box interior', () => {
    const { colors } = controlledJunction(2, 2, RoadTier.FourLane, N | E | S);
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('has sidewalk/shoulder curbs like avenue (not suppressed)', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.FourLane, 0, flatHeightAt);
    expect(countWhere(colors, isSidewalk)).toBeGreaterThan(0);
  });
});

describe('roadTileVertices — v3 tiers share the v1/v2 unknown-tier guard', () => {
  it('still throws RangeError for a genuinely unknown tier value', () => {
    expect(() => roadTileVertices(0, 0, 99 as RoadTier, 0, flatHeightAt)).toThrow(RangeError);
  });

  it('every new tier (4..7) emits whole quads with matching position/color lengths across every mask', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley, RoadTier.OneWay, RoadTier.FourLane]) {
      for (let mask = 0; mask <= 15; mask++) {
        const { positions, colors } = roadTileVertices(6, 6, tier, mask, flatHeightAt);
        expect(positions.length % 18).toBe(0);
        expect(colors.length).toBe(positions.length);
      }
    }
  });
});

function makeDelta(x: number, z: number, tier: RoadTier, mask = 0): RoadTileDelta {
  return { x, z, tier, mask, elevation: 0, profile: tier, flow: RoadFlow.None };
}

describe('RoadMeshRenderer', () => {
  it('draws a tile carrying a composed profile at that profile, and a preset tile as before', () => {
    const wide: RoadProfile = {
      class: 'urban',
      kerbs: true,
      pieces: [
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
      ],
    };
    const extentOf = (scene: THREE.Scene, centreX: number): number => {
      const mesh = scene.children[0] as THREE.Mesh;
      const pos = mesh.geometry.getAttribute('position');
      let max = 0;
      for (let i = 0; i < pos.count; i++) max = Math.max(max, Math.abs(pos.getX(i) - centreX));
      return max;
    };
    const centreX = (2 + 0.5) * TILE_METERS;

    // Without a resolver the tile draws as its tier's preset.
    const plain = new THREE.Scene();
    new RoadMeshRenderer(plain, flatHeightAt).apply([
      { ...makeDelta(2, 2, RoadTier.TwoLane, N | S), profile: 12 },
    ]);
    // With one, the same delta draws the composed 14 m carriageway.
    const composed = new THREE.Scene();
    new RoadMeshRenderer(composed, flatHeightAt, (id) => (id === 12 ? wide : null)).apply([
      { ...makeDelta(2, 2, RoadTier.TwoLane, N | S), profile: 12 },
    ]);
    expect(extentOf(plain, centreX)).toBeCloseTo(7.5 / 2 + SIDEWALK_WIDTH_M, 3);
    // The composed deck declares a kerb without a footway, so it draws a kerb.
    expect(extentOf(composed, centreX)).toBeCloseTo(14 / 2 + kerbWidthOf(wide), 3);
  });

  it('builds one merged mesh for a chunk containing the changed tiles', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    const deltaA = makeDelta(0, 0, RoadTier.TwoLane);
    const deltaB = makeDelta(1, 0, RoadTier.TwoLane);
    renderer.apply([deltaA, deltaB]);

    expect(scene.children.length).toBe(1);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.getAttribute('position');
    const expectedVertexCount =
      vertexCount(
        roadTileVertices(deltaA.x, deltaA.z, deltaA.tier, deltaA.mask, flatHeightAt).positions,
      ) +
      vertexCount(
        roadTileVertices(deltaB.x, deltaB.z, deltaB.tier, deltaB.mask, flatHeightAt).positions,
      );
    expect(position.count).toBe(expectedVertexCount);
  });

  it('removes the chunk mesh once every tile in it is bulldozed', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    renderer.apply([makeDelta(0, 0, RoadTier.TwoLane)]);
    expect(scene.children.length).toBe(1);

    renderer.apply([makeDelta(0, 0, RoadTier.None)]);
    expect(scene.children.length).toBe(0);
  });

  it('rebuilds only chunks containing changed tiles', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    // Tile (0,0) sits in chunk (0,0); tile (CHUNK_TILES, 0) sits in the next chunk over.
    renderer.apply([
      makeDelta(0, 0, RoadTier.TwoLane),
      makeDelta(CHUNK_TILES, 0, RoadTier.TwoLane),
    ]);
    expect(scene.children.length).toBe(2);

    const before = new Set(scene.children);
    // Touch only the second chunk's tile.
    renderer.apply([makeDelta(CHUNK_TILES, 0, RoadTier.Highway)]);
    const after = new Set(scene.children);

    expect(after.size).toBe(2);
    const persisted = [...before].filter((mesh) => after.has(mesh));
    expect(persisted.length).toBe(1); // the untouched chunk's mesh instance is unchanged
  });

  it('never creates a median-tree mesh for a TwoLane-only city (no scene-graph cost when no avenues exist)', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    renderer.apply([
      makeDelta(0, 0, RoadTier.TwoLane, N | S),
      makeDelta(0, 1, RoadTier.TwoLane, N | S),
    ]);
    expect(renderer.medianTreeCount()).toBe(0);
    // Only the road chunk mesh(es) should be in the scene — no extra tree meshes.
    for (const child of scene.children) {
      expect(child).not.toBe(null);
    }
  });

  it('places median-tree instances for eligible, hash-selected avenue tiles and none for the rest', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    const deltas: RoadTileDelta[] = [];
    for (let z = 0; z < 20; z++) deltas.push(makeDelta(0, z, RoadTier.Avenue, N | S));
    renderer.apply(deltas);

    const expectedCount = deltas.filter(
      (d) => isAvenueMedianEligible(d.tier, d.mask) && hasMedianTree(d.x, d.z),
    ).length;
    expect(renderer.medianTreeCount()).toBe(expectedCount);
    expect(expectedCount).toBeGreaterThan(0); // sanity: the 20-tile run really does place some trees
  });

  it('removing every avenue tile drops the median-tree mesh back to zero', () => {
    const scene = new THREE.Scene();
    const renderer = new RoadMeshRenderer(scene, flatHeightAt);
    renderer.apply([
      makeDelta(0, 0, RoadTier.Avenue, N | S),
      makeDelta(0, 1, RoadTier.Avenue, N | S),
    ]);
    const before = renderer.medianTreeCount();

    renderer.apply([makeDelta(0, 0, RoadTier.None), makeDelta(0, 1, RoadTier.None)]);
    expect(renderer.medianTreeCount()).toBe(0);
    void before;
  });
});

// ---------------------------------------------------------------------------
// Terrain conformance: on SLOPED ground every emitted ground shell must ride
// within its documented offset band above the terrain surface — never cut
// under it (terrain bulging through the road) and never float far above it
// (daylight gaps). The height field below is piecewise-linear per 16m tile,
// split on the (x0,z1)-(x1,z0) anti-diagonal — the EXACT surface model the
// real terrain mesh renders and terrain.heightAt interpolates — so the road
// emitters' conformance against it is conformance against the real ground.
// ---------------------------------------------------------------------------

describe('roadTileVertices — terrain conformance on twisted slopes', () => {
  // Deterministic pseudo-random corner heights in [0, 2.5m].
  const cornerHeight = (cx: number, cz: number): number => {
    let h = (cx * 73856093) ^ (cz * 19349663);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h / 0xffffffff) * 2.5;
  };
  // terrain.ts's exact barycentric interpolation over the anti-diagonal split.
  const twistedHeightAt = (x: number, z: number): number => {
    const tx = Math.floor(x / TILE_METERS);
    const tz = Math.floor(z / TILE_METERS);
    const u = x / TILE_METERS - tx;
    const v = z / TILE_METERS - tz;
    const h00 = cornerHeight(tx, tz);
    const h10 = cornerHeight(tx + 1, tz);
    const h01 = cornerHeight(tx, tz + 1);
    const h11 = cornerHeight(tx + 1, tz + 1);
    if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  };

  // Ground shells span ROAD_Y_OFFSET (0.15) up to the highway barrier (0.35);
  // fold-straddling 2m cells and arc strips carry a small residual on a
  // twisted field. The band catches the OLD defects by an order of magnitude
  // (wrong-diagonal caps/turns deviated by up to ~half the terrain twist).
  const MIN_DELTA = 0.15 - 0.06;
  const MAX_DELTA = 0.35 + 0.12;

  const assertConforms = (tier: RoadTier, mask: number, label: string): void => {
    const { positions } = roadTileVertices(3, 5, tier, mask, twistedHeightAt);
    expect(positions.length).toBeGreaterThan(0);
    for (let i = 0; i + 8 < positions.length; i += 9) {
      // Sample each triangle at its centroid and its three edge midpoints.
      const pts: Array<[number, number, number]> = [];
      const ax = positions[i]!;
      const ay = positions[i + 1]!;
      const az = positions[i + 2]!;
      const bx = positions[i + 3]!;
      const by = positions[i + 4]!;
      const bz = positions[i + 5]!;
      const cx = positions[i + 6]!;
      const cy = positions[i + 7]!;
      const cz = positions[i + 8]!;
      pts.push([(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3]);
      pts.push([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]);
      pts.push([(bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2]);
      pts.push([(ax + cx) / 2, (ay + cy) / 2, (az + cz) / 2]);
      for (const [px, py, pz] of pts) {
        const delta = py - twistedHeightAt(px, pz);
        expect(delta, `${label}: shell point (${px.toFixed(2)}, ${pz.toFixed(2)})`).toBeGreaterThan(
          MIN_DELTA,
        );
        expect(delta, `${label}: shell point (${px.toFixed(2)}, ${pz.toFixed(2)})`).toBeLessThan(
          MAX_DELTA,
        );
      }
    }
  };

  it('a straight two-lane run conforms (plate, sidewalks, markings)', () => {
    assertConforms(RoadTier.TwoLane, N | S, 'two-lane straight');
  });

  it('a wide avenue run conforms (15m plate, median, lane lines)', () => {
    assertConforms(RoadTier.Avenue, E | W, 'avenue straight');
  });

  it('a dead-end cap conforms (semicircle fan + wrap curb)', () => {
    assertConforms(RoadTier.TwoLane, N, 'two-lane dead end');
    assertConforms(RoadTier.Avenue, W, 'avenue dead end');
  });

  it('a curved turn conforms (quarter-annulus plate + curb bands + arc markings)', () => {
    assertConforms(RoadTier.TwoLane, N | E, 'two-lane turn');
    assertConforms(RoadTier.Avenue, S | W, 'avenue turn');
  });

  it('a 4-way junction conforms (box, corner fills, crosswalks, stop lines)', () => {
    assertConforms(RoadTier.TwoLane, N | E | S | W, 'two-lane crossroads');
    assertConforms(RoadTier.FourLane, N | E | S | W, 'four-lane crossroads');
  });
});

describe('roadTileVertices — width transitions on a straight run', () => {
  const four = TILE_METERS * FOUR_LANE_HALF_WIDTH_FRACTION; // 7.5
  const two = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION; // 3.75
  const cz = TILE_METERS / 2; // tile (0,0) centre z
  const flanks = 2 * 6; // the two straight flank kerbs a four-lane run always has
  const wedgeVerts = (colors: number[], positions: number[]): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    toTriples(colors).forEach((c, i) => {
      const z = positions[i * 3 + 2]!;
      if (isSidewalk(c) && Math.abs(z - cz) < four - 1e-6) out.push([positions[i * 3]!, z]);
    });
    return out;
  };

  it('a four-lane between four-lanes bends nothing; between two-lanes it bends both kerbs in', () => {
    const same = roadTileVertices(0, 0, RoadTier.FourLane, E | W, flatHeightAt, {
      n: RoadTier.None,
      e: RoadTier.FourLane,
      s: RoadTier.None,
      w: RoadTier.FourLane,
    });
    expect(countWhere(same.colors, isSidewalk)).toBe(flanks);

    const narrowing = roadTileVertices(0, 0, RoadTier.FourLane, E | W, flatHeightAt, {
      n: RoadTier.None,
      e: RoadTier.TwoLane,
      s: RoadTier.None,
      w: RoadTier.TwoLane,
    });
    const wedge = wedgeVerts(narrowing.colors, narrowing.positions);
    expect(wedge.length).toBeGreaterThan(0);
    // At each tile edge the wedge reaches in to the two-lane's kerb, ±3.75 from
    // the centreline; at the tile centre (both ends narrow) it has tapered out.
    const atEast = wedge
      .filter(([x]) => Math.abs(x - TILE_METERS) < 1e-6)
      .map(([, z]) => Math.abs(z - cz));
    const atWest = wedge.filter(([x]) => Math.abs(x) < 1e-6).map(([, z]) => Math.abs(z - cz));
    expect(Math.min(...atEast)).toBeCloseTo(two, 6);
    expect(Math.min(...atWest)).toBeCloseTo(two, 6);
    for (const [x, z] of wedge)
      if (Math.abs(x - TILE_METERS / 2) < 1e-6) expect(Math.abs(z - cz)).toBeCloseTo(four, 6);
  });

  it('one narrower end tapers over the whole tile; the far edge stays at full width', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.FourLane, E | W, flatHeightAt, {
      n: RoadTier.None,
      e: RoadTier.TwoLane,
      s: RoadTier.None,
      w: RoadTier.FourLane,
    });
    const wedge = wedgeVerts(colors, positions);
    const atWest = wedge.filter(([x]) => Math.abs(x) < 1e-6);
    expect(atWest.length).toBe(0);
    const midInset = wedge.filter(([x]) => Math.abs(x - TILE_METERS / 2) < 1e-6).map(([, z]) => Math.abs(z - cz));
    expect(Math.min(...midInset)).toBeCloseTo((four + two) / 2, 6);
  });

  it('draws no wedge on the narrower side, toward gravel, at a junction, or on a tile without kerbs', () => {
    const narrower = roadTileVertices(0, 0, RoadTier.TwoLane, E | W, flatHeightAt, {
      n: RoadTier.None,
      e: RoadTier.FourLane,
      s: RoadTier.None,
      w: RoadTier.FourLane,
    });
    expect(countWhere(narrower.colors, isSidewalk)).toBe(flanks);

    const gravel = roadTileVertices(0, 0, RoadTier.FourLane, E | W, flatHeightAt, {
      n: RoadTier.None,
      e: RoadTier.Gravel,
      s: RoadTier.None,
      w: RoadTier.Gravel,
    });
    expect(countWhere(gravel.colors, isSidewalk)).toBe(flanks);

    const junction = roadTileVertices(0, 0, RoadTier.FourLane, E | W | N, flatHeightAt, {
      n: RoadTier.TwoLane,
      e: RoadTier.TwoLane,
      s: RoadTier.None,
      w: RoadTier.TwoLane,
    });
    // A taper bends the kerb INTO the carriageway, so its paving reaches
    // inside the junction's own square. The pavement that carries a footway
    // round the corner lives in the arm strips outside that square and is not
    // a wedge, so the test asks where the paving is rather than merely whether
    // there is any.
    const insideTheBox = toTriples(junction.colors).filter((c, i) => {
      const x = junction.positions[i * 3]!;
      const z = junction.positions[i * 3 + 2]!;
      return isSidewalk(c) && Math.abs(x - cz) < four - 1e-6 && Math.abs(z - cz) < four - 1e-6;
    });
    expect(insideTheBox.length).toBe(0);

    const alley = roadTileVertices(0, 0, RoadTier.Alley, E | W, flatHeightAt, {
      n: RoadTier.None,
      e: RoadTier.Gravel,
      s: RoadTier.None,
      w: RoadTier.Gravel,
    });
    expect(countWhere(alley.colors, isSidewalk)).toBe(0);
  });

  it('carries the footway round the corner, from the crossing to the junction edge', () => {
    // Somebody who crosses one arm has to walk round to the crossing over the
    // next one. The arm road is narrower than the junction, so between its
    // kerb and the paved corner there was bare asphalt to walk on.
    const armHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION;
    const junction = roadTileVertices(0, 0, RoadTier.FourLane, E | W | N | S, flatHeightAt, {
      n: RoadTier.TwoLane,
      e: RoadTier.TwoLane,
      s: RoadTier.TwoLane,
      w: RoadTier.TwoLane,
    });
    // Paving in the NORTH arm strip, out beyond the side street's own kerb:
    // the stretch a person walks between the two crossings.
    const linking = toTriples(junction.colors).filter((c, i) => {
      const x = junction.positions[i * 3]!;
      const z = junction.positions[i * 3 + 2]!;
      const along = cz - z; // north of the tile centre
      return (
        isSidewalk(c) &&
        along > four + 1e-6 && // in the arm strip, not the junction square
        Math.abs(x - cz) > armHalf + 1e-6 && // clear of the side street itself
        Math.abs(x - cz) < four + 1e-6 // and short of the rounded corner
      );
    });
    expect(linking.length).toBeGreaterThan(0);
  });

  it('lays none of it where the arm has no footway to carry on from', () => {
    // A crossing is for the people on a pavement. An unpaved track has none,
    // so nothing is carried round to meet it — even though the track is
    // narrower than the junction and the room is there.
    const junction = roadTileVertices(0, 0, RoadTier.FourLane, E | W | N | S, flatHeightAt, {
      n: RoadTier.Gravel,
      e: RoadTier.Gravel,
      s: RoadTier.Gravel,
      w: RoadTier.Gravel,
    });
    const armHalf = carriagewayHalfWidthMeters(RoadTier.Gravel);
    expect(armHalf).toBeLessThan(four); // the room really is there
    const linking = toTriples(junction.colors).filter((c, i) => {
      const x = junction.positions[i * 3]!;
      const z = junction.positions[i * 3 + 2]!;
      return (
        isSidewalk(c) &&
        cz - z > four + 1e-6 &&
        Math.abs(x - cz) > armHalf + 1e-6 &&
        Math.abs(x - cz) < four - 1e-6
      );
    });
    expect(linking.length).toBe(0);
  });

  it('measures the neighbour from its own cross-section when told to', () => {
    const composedNeighbour = roadTileVertices(
      0,
      0,
      RoadTier.FourLane,
      E | W,
      flatHeightAt,
      { n: RoadTier.None, e: RoadTier.TwoLane, s: RoadTier.None, w: RoadTier.FourLane },
      undefined,
      { n: 0, e: 6, s: 0, w: four }, // the two-lane carries parking lanes: 12 m of carriageway
    );
    const atEast = wedgeVerts(composedNeighbour.colors, composedNeighbour.positions)
      .filter(([x]) => Math.abs(x - TILE_METERS) < 1e-6)
      .map(([, z]) => Math.abs(z - cz));
    expect(Math.min(...atEast)).toBeCloseTo(6, 6);
  });
});

describe('roadTileVertices — a one-way street points the way it was drawn', () => {
  /** The along-axis extent of the arrow paint on a vertical (N/S) one-way tile. */
  function arrowSpan(flow: number): { tip: number; tail: number } {
    const { positions, colors } = roadTileVertices(
      0,
      0,
      RoadTier.OneWay,
      N | S,
      flatHeightAt,
      undefined,
      undefined,
      undefined,
      flow,
    );
    // Arrow paint is white, like the lane lines; the arrow is the only paint
    // on a one-way tile that is not the centre line, so take the widest span.
    let lo = Infinity;
    let hi = -Infinity;
    toTriples(colors).forEach((c, i) => {
      if (!isMarkingWhite(c)) return;
      const x = positions[i * 3]!;
      // The lane line runs down the tile's centre and the edge lines sit out
      // at the carriageway edge; the arrow is between them. Measured from the
      // tile's own centre, and stopping short of the edges, so this keeps
      // picking out the arrow whatever the tile measures and whichever edge
      // the yellow is on — a one-way's yellow changes sides with the way it
      // runs, and an edge line caught in this window reads as arrow paint.
      const across = Math.abs(x - TILE_METERS / 2);
      if (across < 0.3 || across > 3) return;
      const z = positions[i * 3 + 2]!;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    });
    return { tip: hi, tail: lo };
  }

  it('points south by default, and north when the drag went north', () => {
    // The arrow head is the wide end. Sample the paint either side of the
    // tile's centre to see which end of the arrow is the head.
    const headEnd = (flow: number): number => {
      const { positions, colors } = roadTileVertices(
        0,
        0,
        RoadTier.OneWay,
        N | S,
        flatHeightAt,
        undefined,
        undefined,
        undefined,
        flow,
      );
      let widestZ = 0;
      let widest = 0;
      const byZ = new Map<number, { lo: number; hi: number }>();
      toTriples(colors).forEach((c, i) => {
        if (!isMarkingWhite(c)) return;
        const x = positions[i * 3]!;
        // The edge lines are white too and sit at the carriageway edge; the
        // arrow lives near the centreline.
        if (Math.abs(x - TILE_METERS / 2) > 2) return;
        const z = Math.round(positions[i * 3 + 2]! * 100) / 100;
        const span = byZ.get(z) ?? { lo: Infinity, hi: -Infinity };
        span.lo = Math.min(span.lo, x);
        span.hi = Math.max(span.hi, x);
        byZ.set(z, span);
      });
      for (const [z, span] of byZ) {
        const width = span.hi - span.lo;
        if (width > widest) {
          widest = width;
          widestZ = z;
        }
      }
      return widestZ;
    };
    // A southward arrow puts its widest paint past the tile's centre, a
    // northward one before it.
    const centre = TILE_METERS / 2;
    expect(headEnd(RoadFlow.South)).toBeGreaterThan(centre);
    expect(headEnd(RoadFlow.None)).toBeGreaterThan(centre); // the low->high default
    expect(headEnd(RoadFlow.North)).toBeLessThan(centre);
  });

  it('paints the same amount of arrow whichever way it points', () => {
    const south = arrowSpan(RoadFlow.South);
    const north = arrowSpan(RoadFlow.North);
    expect(north.tip - north.tail).toBeCloseTo(south.tip - south.tail, 6);
  });
});

describe('roadTileVertices — the taper where a road drops a lane', () => {
  const wide = presetProfileForTier(RoadTier.FourLane);
  /** A four-lane tile partway through closing 7.5 m of carriageway over seven tiles. */
  const closing = (remaining: number): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      4,
      4,
      RoadTier.FourLane,
      N | S,
      flatHeightAt,
      undefined,
      wide,
      undefined,
      RoadFlow.None,
      undefined,
      undefined,
      { toward: RoadFlow.South, remaining, length: 7, closed: 7.5 },
    );
  const spread = (v: { positions: number[] }): number =>
    Math.max(...toTriples(v.positions).map((p) => Math.abs(p[0]! - 4.5 * TILE_METERS)));

  it('narrows the road tile by tile down the taper', () => {
    const head = spread(closing(6));
    const middle = spread(closing(3));
    const foot = spread(closing(0));
    expect(head).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(foot);
  });

  it('paints the merge arrow at the head of the taper and nowhere else along it', () => {
    const plain = countWhere(
      roadTileVertices(4, 4, RoadTier.FourLane, N | S, flatHeightAt, undefined, wide).colors,
      isMarkingWhite,
    );
    // The head carries the arrow the lane that is running out needs; the tiles
    // behind it are just a narrowing road.
    expect(countWhere(closing(6).colors, isMarkingWhite)).toBeGreaterThan(plain);
    expect(countWhere(closing(5).colors, isMarkingWhite)).toBeLessThan(
      countWhere(closing(6).colors, isMarkingWhite),
    );
  });
});

describe('a run that changes width carries its footway across the seam', () => {
  const CENTRE_X = 4.5 * TILE_METERS;
  const CENTRE_Z = 4.5 * TILE_METERS;

  /** A four-lane straight run whose SOUTH neighbour is the narrower street. */
  const seam = (): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      4,
      4,
      RoadTier.FourLane,
      N | S,
      flatHeightAt,
      { n: RoadTier.FourLane, e: RoadTier.None, s: RoadTier.TwoLane, w: RoadTier.None },
      undefined,
    );

  /**
   * How far the footway reaches from the centreline at a given distance along
   * the run — the outermost kerb-coloured vertex on the row, which is the edge
   * a player sees against the grass.
   */
  const footwayReach = (
    v: { positions: number[]; colors: number[] },
    z: number,
    tolerance = 0.05,
  ): number => {
    let reach = 0;
    const triples = toTriples(v.colors);
    for (let i = 0; i < triples.length; i++) {
      if (!isSidewalk(triples[i]!)) continue;
      if (Math.abs(v.positions[i * 3 + 2]! - z) > tolerance) continue;
      reach = Math.max(reach, Math.abs(v.positions[i * 3]! - CENTRE_X));
    }
    return reach;
  };

  it('meets the narrower neighbour at exactly the width that neighbour lays', () => {
    const v = seam();
    const wide = carriagewayHalfWidthMeters(RoadTier.FourLane);
    const narrow = carriagewayHalfWidthMeters(RoadTier.TwoLane);
    expect(footwayReach(v, CENTRE_Z - TILE_METERS / 2)).toBeGreaterThan(
      footwayReach(v, CENTRE_Z + TILE_METERS / 2),
    );
    // At the far end the tile is its own road; at the shared boundary it is
    // the road it runs into, kerb strip and all — so nothing steps.
    expect(footwayReach(v, CENTRE_Z - TILE_METERS / 2)).toBeCloseTo(
      wide + curbWidthMeters(RoadTier.FourLane),
      4,
    );
    expect(footwayReach(v, CENTRE_Z + TILE_METERS / 2)).toBeCloseTo(
      narrow + curbWidthMeters(RoadTier.TwoLane),
      4,
    );
  });

  it('bends the asphalt with the kerb rather than leaving it under the footway', () => {
    const v = seam();
    const wide = carriagewayHalfWidthMeters(RoadTier.FourLane);
    const narrow = carriagewayHalfWidthMeters(RoadTier.TwoLane);
    const asphaltReach = (z: number): number => {
      let reach = 0;
      const triples = toTriples(v.colors);
      for (let i = 0; i < triples.length; i++) {
        if (isSidewalk(triples[i]!) || isPaint(triples[i]!)) continue;
        if (Math.abs(v.positions[i * 3 + 2]! - z) > 0.05) continue;
        reach = Math.max(reach, Math.abs(v.positions[i * 3]! - CENTRE_X));
      }
      return reach;
    };
    expect(asphaltReach(CENTRE_Z - TILE_METERS / 2)).toBeCloseTo(wide, 4);
    expect(asphaltReach(CENTRE_Z + TILE_METERS / 2)).toBeCloseTo(narrow, 4);
  });

  it('leaves a run of constant width squared off, as it always was', () => {
    const straight = roadTileVertices(4, 4, RoadTier.FourLane, N | S, flatHeightAt, {
      n: RoadTier.FourLane,
      e: RoadTier.None,
      s: RoadTier.FourLane,
      w: RoadTier.None,
    });
    const reach =
      carriagewayHalfWidthMeters(RoadTier.FourLane) + curbWidthMeters(RoadTier.FourLane);
    expect(footwayReach(straight, CENTRE_Z - TILE_METERS / 2)).toBeCloseTo(reach, 4);
    expect(footwayReach(straight, CENTRE_Z + TILE_METERS / 2)).toBeCloseTo(reach, 4);
  });

  it('never bends toward a WIDER neighbour: the taper belongs to the wide side', () => {
    const widening = roadTileVertices(4, 4, RoadTier.TwoLane, N | S, flatHeightAt, {
      n: RoadTier.TwoLane,
      e: RoadTier.None,
      s: RoadTier.FourLane,
      w: RoadTier.None,
    });
    const reach = carriagewayHalfWidthMeters(RoadTier.TwoLane) + curbWidthMeters(RoadTier.TwoLane);
    expect(footwayReach(widening, CENTRE_Z + TILE_METERS / 2)).toBeCloseTo(reach, 4);
  });
});

describe('a motorway closes its lane with paint and keeps the tarmac', () => {
  const motorway = presetProfileForTier(RoadTier.Highway);

  /** A motorway tile `remaining` tiles short of a drop of 7.5 m over 12. */
  const closing = (remaining: number): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      4,
      4,
      RoadTier.Highway,
      N | S,
      flatHeightAt,
      undefined,
      motorway,
      undefined,
      RoadFlow.None,
      undefined,
      undefined,
      { toward: RoadFlow.South, remaining, length: 12, closed: 7.5 },
    );
  const plain = roadTileVertices(4, 4, RoadTier.Highway, N | S, flatHeightAt, undefined, motorway);
  /** How far the tarmac reaches from the centreline — paint and kerb excluded. */
  const asphaltReach = (v: { positions: number[]; colors: number[] }): number => {
    const triples = toTriples(v.colors);
    let reach = 0;
    for (let i = 0; i < triples.length; i++) {
      if (isSidewalk(triples[i]!) || isPaint(triples[i]!)) continue;
      reach = Math.max(reach, Math.abs(v.positions[i * 3]! - 4.5 * TILE_METERS));
    }
    return reach;
  };

  it('lays the same width of tarmac at every point of the taper', () => {
    // The pavement is the recovery a driver who missed the taper needs. A
    // street narrows; a motorway does not give the tarmac up.
    const full = asphaltReach(plain);
    for (const remaining of [11, 6, 0]) {
      expect(asphaltReach(closing(remaining))).toBeCloseTo(full, 4);
    }
  });

  it('hatches the strip the lane leaves, and hatches more of it further along', () => {
    const white = (v: { colors: number[] }): number => countWhere(v.colors, isMarkingWhite);
    // A tile with no drop ahead has no strip and no hatching.
    expect(white(closing(11))).toBeGreaterThan(white(plain));
    expect(white(closing(0))).toBeGreaterThan(white(closing(11)));
  });
});

describe('roadTileVertices — a corridor half arriving at a junction', () => {
  // One carriageway of a six-lane divided road: three lanes all running the
  // same way, finished on the inside by its share of the median. Its lanes are
  // 'back', which is what a half on the low side of the split carries.
  const half = (): RoadProfile => ({
    class: 'divided',
    pieces: [
      { kind: 'sidewalk', width: 1.9 },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'median', width: 1.0 },
    ],
  });

  const tile = (
    approach?: { toward: RoadFlow; distance: number; pocket: boolean },
  ): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      4,
      4,
      RoadTier.Avenue,
      N | S,
      flatHeightAt,
      undefined,
      half(),
      undefined,
      RoadFlow.South,
      undefined,
      approach && { ...approach, allowed: DEFAULT_ALLOWED, openness: 1, laneAllowed: 0 },
    );

  it('paints a lane-use arrow in every lane of it', () => {
    // Three lanes going the same way have something to tell apart, so the
    // approach is marked. A corridor half is a road in its own right and gets
    // what any three-lane approach gets.
    const arrived = tile({ toward: RoadFlow.South, distance: 0, pocket: false });
    expect(countWhere(arrived.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(tile(undefined).colors, isMarkingWhite),
    );
  });

  it('paints them on the tile at the stop line and nowhere further back', () => {
    const atLine = tile({ toward: RoadFlow.South, distance: 0, pocket: false });
    const backOne = tile({ toward: RoadFlow.South, distance: 1, pocket: false });
    expect(countWhere(atLine.colors, isMarkingWhite)).toBeGreaterThan(
      countWhere(backOne.colors, isMarkingWhite),
    );
  });
});

describe('roadTileVertices — a corridor half that has earned a turn bay', () => {
  const half = (): RoadProfile => ({
    class: 'divided',
    pieces: [
      { kind: 'sidewalk', width: 1.9 },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'median', width: 1.0 },
    ],
  });
  const tile = (pocket: boolean): { positions: number[]; colors: number[] } =>
    roadTileVertices(
      4,
      4,
      RoadTier.Avenue,
      N | S,
      flatHeightAt,
      undefined,
      half(),
      undefined,
      RoadFlow.South,
      undefined,
      {
        toward: RoadFlow.South,
        distance: 0,
        pocket,
        allowed: DEFAULT_ALLOWED,
        openness: 1,
        laneAllowed: 0,
      },
    );

  it('still tells its lanes apart once the bay has opened', () => {
    // The bay is the whole reason the arm is worth marking: it is the lane the
    // left turn waits in, and a driver has to be told which one it is.
    expect(countWhere(tile(true).colors, isMarkingWhite)).toBeGreaterThan(0);
    expect(countWhere(tile(true).colors, isMarkingWhite)).toBeGreaterThanOrEqual(
      countWhere(tile(false).colors, isMarkingWhite),
    );
  });

});

describe('RoadMeshRenderer.paintBandsAt', () => {
  /** A straight north-south run, long enough that its middle tile is a plain one. */
  const runOf = (tier: RoadTier, length = 5): RoadMeshRenderer => {
    const renderer = new RoadMeshRenderer(new THREE.Scene(), flatHeightAt);
    renderer.apply(
      Array.from({ length }, (_, i) =>
        makeDelta(0, i, tier, (i === 0 ? 0 : N) | (i === length - 1 ? 0 : S)),
      ),
    );
    return renderer;
  };

  const acrossBands = (renderer: RoadMeshRenderer, x: number, z: number) =>
    renderer
      .paintBandsAt(x, z)
      .filter((b) => b.axis === 'x')
      .sort((a, b) => a.from - b.from);

  it('measures the carriageway of a road with no markings at its true width', () => {
    // An Alley is one 3.75 m lane and paints nothing, so its asphalt is the
    // only band there is — and it is emitted as a lattice, not one rectangle.
    const bands = acrossBands(runOf(RoadTier.Alley), 0, 2);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.to - bands[0]!.from).toBeCloseTo(3.75, 2);
    expect((bands[0]!.from + bands[0]!.to) / 2).toBeCloseTo(TILE_METERS / 2, 2);
  });

  it('reports a bike lane as its own band, separate from the edge line beside it', () => {
    const bands = acrossBands(runOf(RoadTier.BikeLane), 0, 2);
    const green = bands.filter((b) => b.color === '0.13,0.42,0.22');
    expect(green).toHaveLength(2);
    for (const band of green) {
      expect(band.to - band.from).toBeCloseTo(BIKE_PAINT_MAX_WIDTH_M, 2);
    }
    // Symmetric about the tile centre: the two lanes are the same road.
    const centres = green.map((b) => (b.from + b.to) / 2 - TILE_METERS / 2);
    expect(centres[0]! + centres[1]!).toBeCloseTo(0, 2);
  });

  it('does not read a periodic stencil as part of the band it lies on', () => {
    // The bicycle stencil is the same white as the edge line and overlaps it,
    // so a measurement that merged whatever touched would report a wider edge
    // line on exactly the tiles that carry a glyph.
    const renderer = runOf(RoadTier.BikeLane, 9);
    const glyphTile = [1, 2, 3, 4, 5, 6, 7].find((z) => isLaneGlyphTile(z));
    const plainTile = [1, 2, 3, 4, 5, 6, 7].find((z) => !isLaneGlyphTile(z));
    expect(glyphTile).toBeDefined();
    expect(plainTile).toBeDefined();
    expect(signature(acrossBands(renderer, 0, glyphTile!))).toEqual(
      signature(acrossBands(renderer, 0, plainTile!)),
    );
  });

  it('reports the same section for every plain tile of a straight run', () => {
    const marked: [string, RoadTier][] = [
      ['TwoLane', RoadTier.TwoLane],
      ['Avenue', RoadTier.Avenue],
      ['Highway', RoadTier.Highway],
      ['Alley', RoadTier.Alley],
      ['OneWay', RoadTier.OneWay],
      ['FourLane', RoadTier.FourLane],
      ['BusLane', RoadTier.BusLane],
      ['BikeLane', RoadTier.BikeLane],
      ['Tram', RoadTier.Tram],
    ];
    for (const [name, tier] of marked) {
      const renderer = runOf(tier, 9);
      const sections = [2, 3, 4, 5, 6].map((z) => signature(acrossBands(renderer, 0, z)));
      expect(new Set(sections).size, `${name} varies along a straight run`).toBe(1);
    }
  });

  it('has nothing to say about a tile with no road on it', () => {
    expect(runOf(RoadTier.TwoLane).paintBandsAt(0, 40)).toEqual([]);
  });

  /** Bands as one comparable string, the way the shot harness compares two tiles. */
  function signature(bands: { color: string; from: number; to: number }[]): string {
    return bands.map((b) => `${b.color}@${b.from.toFixed(3)}..${b.to.toFixed(3)}`).join('|');
  }
});
