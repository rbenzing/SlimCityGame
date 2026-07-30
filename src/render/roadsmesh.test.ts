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
} from './roadsmesh';
import { RoadTileDelta, RoadTier } from '../shared/types';
import { CHUNK_TILES, TILE_METERS } from '../shared/constants';

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

describe('roadTileVertices — asphalt base plate', () => {
  it('returns no geometry for RoadTier.None, regardless of mask', () => {
    for (const mask of [0, 15]) {
      const { positions, colors } = roadTileVertices(0, 0, RoadTier.None, mask, flatHeightAt);
      expect(positions).toEqual([]);
      expect(colors).toEqual([]);
    }
  });

  it('an isolated tile (mask 0, no connections) gets the core plate plus all 4 sidewalk/shoulder curbs, and no median/divider (not a "run")', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const { positions, colors } = roadTileVertices(1, 1, tier, 0, flatHeightAt);
      // core (1 quad) + 4 curb quads, no extensions/corners (nothing connects),
      // no markings (no travel axis to align them with), no median/divider
      // (popcount 0 is disconnected, not a "straight run" — see isAvenueMedianEligible).
      expect(vertexCount(positions)).toBe(5 * 6);
      expect(colors.length).toBe(positions.length);
    }
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

  it('orders tier brightness highway (darkest) < two-lane < avenue (lightest)', () => {
    const two = avg(roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt).colors.slice(0, 3));
    const avenue = avg(roadTileVertices(0, 0, RoadTier.Avenue, 0, flatHeightAt).colors.slice(0, 3));
    const highwayMain = avg(
      roadTileVertices(0, 0, RoadTier.Highway, 0, flatHeightAt).colors.slice(0, 3),
    );
    expect(highwayMain).toBeLessThan(two);
    expect(two).toBeLessThan(avenue);
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

  it('avenue carriageway is 4 lanes = 15m', () => {
    const span = coreSpanMeters(RoadTier.Avenue);
    expect(span).toBeCloseTo(15, 5);
  });

  it('highway carriageway is near full tile width, leaving only a narrow shoulder', () => {
    const span = coreSpanMeters(RoadTier.Highway);
    expect(span).toBeGreaterThan(14);
    expect(span).toBeLessThan(TILE_METERS);
    const shoulderEachSide = (TILE_METERS - span) / 2;
    // "shoulder bands instead of sidewalk curbs" — much narrower than two-lane's sidewalk.
    expect(shoulderEachSide).toBeLessThan((TILE_METERS - coreSpanMeters(RoadTier.TwoLane)) / 2);
  });

  it('sidewalk/shoulder curb width fills exactly the gap between carriageway edge and tile boundary, per tier', () => {
    // Tile (0,0) spans world X in [0, 16]; the East curb strip's inner (west)
    // edge should land exactly at the tier's core half-width from center (8).
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const { positions, colors } = roadTileVertices(0, 0, tier, 0, flatHeightAt);
      const posTriples = toTriples(positions);
      const colorTriples = toTriples(colors);
      const curbXs: number[] = [];
      for (let i = 0; i < posTriples.length; i++) {
        if (isSidewalk(colorTriples[i] as number[]))
          curbXs.push((posTriples[i] as number[])[0] as number);
      }
      expect(curbXs.length).toBeGreaterThan(0);
      expect(Math.max(...curbXs)).toBeCloseTo(TILE_METERS, 6); // curb always reaches the outer tile edge
      const coreHalf = coreSpanMeters(tier) / 2;
      const expectedInnerEdge = 8 + coreHalf; // tile center (8) + carriageway half-width
      const eastCurbXs = curbXs.filter((wx) => wx > 8);
      expect(Math.min(...eastCurbXs)).toBeCloseTo(expectedInnerEdge, 6);
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

  it('two-lane centerline is dashed: marking-white quad count matches dashSegments over the tile span', () => {
    for (const z of [0, 1, 2, 3]) {
      const { colors } = roadTileVertices(0, z, RoadTier.TwoLane, N | S, flatHeightAt);
      expect(countWhere(colors, isMarkingWhite)).toBe(dashCountFor(z) * 6);
    }
  });

  it('a straight avenue run (median-eligible) suppresses the solid center pair but keeps dashed lane lines', () => {
    const z = 0;
    const { colors } = roadTileVertices(0, z, RoadTier.Avenue, N | S, flatHeightAt);
    // 2 dashed lane lines, no center pair (replaced by the physical median).
    expect(countWhere(colors, isMarkingWhite)).toBe(dashCountFor(z) * 2 * 6);
  });

  it('highway draws ONLY solid edge lines — no center line at all (replaced by the physical divider barrier)', () => {
    const onPhase = roadTileVertices(0, 0, RoadTier.Highway, N | S, flatHeightAt).colors;
    const offPhase = roadTileVertices(0, 1, RoadTier.Highway, N | S, flatHeightAt).colors;
    // 2 solid edge lines, always, with no dash dependency.
    expect(countWhere(onPhase, isMarkingWhite)).toBe(2 * 6);
    expect(countWhere(offPhase, isMarkingWhite)).toBe(2 * 6);
  });

  it('marking color is the same neutral white across every tier (no tier-only yellow stripe)', () => {
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
  });

  it('markings orient along whichever travel axis the mask connects (horizontal road)', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, E | W, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(dashCountFor(0) * 6);
  });

});

describe('roadTileVertices — intersection suppression / proper intersections (mask popcount >= 3)', () => {
  it('a 2-connection straight tile keeps its markings', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Highway, N | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('a 3-connection T-junction has clean asphalt in its box interior but white stop-line/crosswalk markings on each connected arm', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.Highway, N | E | S, flatHeightAt);
    // Junction box (core plate, first 6 vertices) stays clean tier-grey asphalt.
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false);
    // But its 3 connected arms carry markings (not zero).
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
    expect(vertexCount(positions)).toBeGreaterThan(0);
  });

  it('a full 4-way intersection has clean asphalt in its box interior but markings on all 4 arms', () => {
    const { positions, colors } = roadTileVertices(
      0,
      0,
      RoadTier.Highway,
      N | E | S | W,
      flatHeightAt,
    );
    const core = toTriples(colors).slice(0, 6);
    for (const c of core) expect(isMarkingWhite(c)).toBe(false);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
    expect(vertexCount(positions)).toBeGreaterThan(0);
  });

  it('a 90-degree corner (popcount 2, non-collinear) is NOT a junction and keeps its existing plain marking behavior, unchanged', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N | E, flatHeightAt);
    // Corners never get stop-lines/crosswalks (those require popcount >= 3) —
    // whatever markings appear come only from the ordinary per-axis logic.
    const count = countWhere(colors, isMarkingWhite);
    expect(count % 6).toBe(0);
  });
});

describe('junctionArmLayout — stop-line + crosswalk depth (UI-SPEC §6.7 Roads v2)', () => {
  it('a zero or negative arm depth yields an all-zero layout', () => {
    expect(junctionArmLayout(0)).toEqual({
      crosswalkStart: 0,
      crosswalkEnd: 0,
      stopLineStart: 0,
      stopLineEnd: 0,
    });
    expect(junctionArmLayout(-1)).toEqual({
      crosswalkStart: 0,
      crosswalkEnd: 0,
      stopLineStart: 0,
      stopLineEnd: 0,
    });
  });

  it('orders crosswalk (nearest the box) before the stop line (farthest from the box), with a gap between them', () => {
    for (const armDepth of [0.64, 1.2, 3.2, 10]) {
      const layout = junctionArmLayout(armDepth);
      expect(layout.crosswalkStart).toBe(0);
      expect(layout.crosswalkEnd).toBeGreaterThan(layout.crosswalkStart);
      expect(layout.stopLineStart).toBeGreaterThanOrEqual(layout.crosswalkEnd);
      expect(layout.stopLineEnd).toBeGreaterThan(layout.stopLineStart);
    }
  });

  it('never spills past the available arm depth', () => {
    for (const armDepth of [0.1, 0.64, 1.2, 3.2, 3.8, 10]) {
      const layout = junctionArmLayout(armDepth);
      expect(layout.stopLineEnd).toBeLessThanOrEqual(armDepth + 1e-9);
    }
  });

  it('reaches the full spec-target depths once the arm has room (>= 3.8m)', () => {
    const layout = junctionArmLayout(10);
    expect(layout.crosswalkEnd).toBeCloseTo(2.4, 9);
    expect(layout.stopLineEnd - layout.stopLineStart).toBeCloseTo(0.4, 9);
  });

  it('scales every measurement down proportionally on a short arm, preserving relative order', () => {
    const short = junctionArmLayout(0.64); // ~highway's arm depth
    const long = junctionArmLayout(10);
    const shortRatio = short.crosswalkEnd / (short.stopLineEnd - short.crosswalkEnd);
    const longRatio = long.crosswalkEnd / (long.stopLineEnd - long.crosswalkEnd);
    expect(shortRatio).toBeCloseTo(longRatio, 6);
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
    const { positions, colors } = roadTileVertices(5, 5, RoadTier.TwoLane, N | E | S, flatHeightAt);
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
    const { colors } = roadTileVertices(2, 2, RoadTier.Highway, N | E | S | W, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBeGreaterThan(0);
  });

  it('a 4-way junction draws strictly more marking geometry than a 3-way T-junction (one more arm worth of stop-line + crosswalk)', () => {
    const tCount = countWhere(
      roadTileVertices(5, 5, RoadTier.TwoLane, N | E | S, flatHeightAt).colors,
      isMarkingWhite,
    );
    const fourCount = countWhere(
      roadTileVertices(5, 5, RoadTier.TwoLane, N | E | S | W, flatHeightAt).colors,
      isMarkingWhite,
    );
    expect(fourCount).toBeGreaterThan(tCount);
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

  it('isolated tile (mask 0): core + 4 curbs, no markings, no median/divider — 30 vertices, for every tier', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.Highway]) {
      const { positions } = roadTileVertices(0, 0, tier, 0, flatHeightAt);
      expect(vertexCount(positions)).toBe(30);
    }
  });

  it('T-junction (mask N|E|S, popcount 3): the structural quad count matches the hand-derived total, plus non-zero marking geometry', () => {
    // core(6) + ext N,E,S(18) + curb W(6) = 30, plus 2 ROUNDED curb-return
    // corners (NE, SE) — each a carriageway fan (SEG*3) + a curved sidewalk
    // (SEG*6).
    const rounded = JUNCTION_CORNER_SEGMENTS * 12;
    const { positions, colors } = roadTileVertices(5, 5, RoadTier.TwoLane, N | E | S, flatHeightAt);
    const markingVerts = countWhere(colors, isMarkingWhite);
    expect(vertexCount(positions)).toBe(30 + 2 * rounded + markingVerts);
    expect(markingVerts).toBeGreaterThan(0); // v2: junctions now carry arm markings
  });

  it('full 4-way intersection (mask 15): the structural quad count matches the hand-derived total, plus non-zero marking geometry', () => {
    // core(6) + 4 ext(24) = 30, plus 4 ROUNDED curb-return corners (fan SEG*3 +
    // curved sidewalk SEG*6 each).
    const rounded = JUNCTION_CORNER_SEGMENTS * 12;
    const { positions, colors } = roadTileVertices(5, 5, RoadTier.TwoLane, 15, flatHeightAt);
    const markingVerts = countWhere(colors, isMarkingWhite);
    expect(vertexCount(positions)).toBe(30 + 4 * rounded + markingVerts);
    expect(markingVerts).toBeGreaterThan(0); // v2: junctions now carry arm markings on every side
  });

});

describe('roadTileVertices — terrain-conforming tessellation on slopes', () => {
  // Rises 0.2 m per tile in x — well above the flatness epsilon, so plate
  // quads must subdivide to hug the slope instead of spanning it flat.
  const slopedHeightAt = (x: number): number => x * 0.2;

  it('emits the same vertex count as before on flat terrain (no needless subdivision)', () => {
    const flat = roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt);
    expect(vertexCount(flat.positions)).toBe(30);
  });

  it('emits more vertices on a slope (quads split into sub-cells)', () => {
    const sloped = roadTileVertices(0, 0, RoadTier.TwoLane, 0, slopedHeightAt);
    expect(vertexCount(sloped.positions)).toBeGreaterThan(30);
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
    // core(6) + ext N(6) + flank curbs E,W(12). The bulb-facing (S) straight
    // curb is suppressed — the curved cap curb ring wraps that side instead.
    const structural = 24;
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N, flatHeightAt);
    const markingVerts = countWhere(colors, isMarkingWhite);
    // the dead-end curb ring adds its own
    // END_CAP_SEGMENTS quads (2 triangles apiece) on top, additive over the
    // plain structural curb quads above — see emitEndCapCurb.
    const ringVerts = END_CAP_SEGMENTS * 6;
    expect(vertexCount(positions)).toBe(
      structural + END_CAP_SEGMENTS * 3 + ringVerts + markingVerts,
    );
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

  it('a disconnected tile (popcount 0), a straight run (popcount 2, collinear), and any junction (popcount >= 3) get NO fillet/cap', () => {
    for (const mask of [0, N | S, E | W, N | E | S, N | E | S | W]) {
      const { positions } = roadTileVertices(3, 3, RoadTier.TwoLane, mask, flatHeightAt);
      expect(toTriples(positions).some((p) => isAtFilletHeight(p[1] as number))).toBe(false);
    }
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

  it('the bulge depth scales with armDepth (the tier-specific outward room), so a NARROWER carriageway bulges deeper, and never exceeds armDepth (cap stays inside the tile)', () => {
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
    const highwayCoreHalf = TILE_METERS * HIGHWAY_HALF_WIDTH_FRACTION; // small armDepth
    const twoLaneCoreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION; // larger armDepth
    expect(bulgeFor(RoadTier.TwoLane, twoLaneCoreHalf)).toBeGreaterThan(
      bulgeFor(RoadTier.Highway, highwayCoreHalf),
    );
    // Contained: the bulge never spills past the tier's own outward room.
    expect(bulgeFor(RoadTier.TwoLane, twoLaneCoreHalf)).toBeLessThanOrEqual(
      TILE_METERS / 2 - twoLaneCoreHalf + 1e-6,
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

  it('the dead-end cap is a half-circle bulging outward by min(coreHalf, armDepth), never past the tile edge, for every paved/gravel tier', () => {
    for (const tier of [
      RoadTier.TwoLane,
      RoadTier.Avenue,
      RoadTier.FourLane,
      RoadTier.Gravel,
      RoadTier.Alley,
    ]) {
      const coreHalf = coreHalfMeters(tier);
      const armDepth = TILE_METERS / 2 - coreHalf;
      const centerZ = 0.5 * TILE_METERS;
      const { positions } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      const capZs = toTriples(positions)
        .filter((p) => isAtFilletHeight(p[1] as number))
        .map((p) => p[2] as number);
      expect(capZs.length).toBeGreaterThan(0);
      const bulge = Math.max(...capZs) - (centerZ + coreHalf);
      expect(bulge).toBeCloseTo(Math.min(coreHalf, armDepth), 6); // full half-circle, clamped to fit
      // Contained: the rounded asphalt never crosses the tile's far edge.
      expect(Math.max(...capZs)).toBeLessThanOrEqual(centerZ + TILE_METERS / 2 + 1e-6);
    }
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
      const { positions, colors } = roadTileVertices(0, 0, tier, N, flatHeightAt);
      // The ring is emitted last, immediately after the fan — exactly
      // END_CAP_SEGMENTS quads (2 triangles apiece) of curb-height,
      // sidewalk-colored geometry.
      const ringVertCount = END_CAP_SEGMENTS * 6;
      const ringPositions = positions.slice(positions.length - ringVertCount * 3);
      const ringColors = colors.slice(colors.length - ringVertCount * 3);
      const posTriples = toTriples(ringPositions);
      const colorTriples = toTriples(ringColors);
      expect(posTriples.length).toBe(ringVertCount);
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
      [0, 4 * 6], // isolated: 4 flat curb quads
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

  it('a turn carries NO painted lane markings (the curved carriageway is unpainted)', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N | E, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
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
        if (zc < 8) maxCurbZonNorth = Math.max(maxCurbZonNorth, zc); // north-side curb only
      }
    }
    // Inner edge sits exactly at the carriageway edge; outer edge is one
    // sidewalk-width out; neither reaches the tile boundary (world Z 0).
    expect(maxCurbZonNorth).toBeCloseTo(8 - coreHalf, 5);
    expect(minCurbZ).toBeCloseTo(8 - coreHalf - sidewalk, 5);
    expect(minCurbZ).toBeGreaterThan(0); // grass verge remains
  });

  it('a junction curb-return sidewalk lands FLUSH with the straight road sidewalks at the tile edge ([coreHalf, coreHalf+sidewalk]) — seamless transition', () => {
    // 4-way tile (0,0): centerX=centerZ=8. Along the north edge (world z=0),
    // the NE curb-return's sidewalk must occupy the same band a straight road's
    // side sidewalk does: x ∈ [8 + coreHalf, 8 + coreHalf + sidewalk].
    const coreHalf = TILE_METERS * TWO_LANE_HALF_WIDTH_FRACTION;
    const sidewalk = 1.875;
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.TwoLane, N | E | S | W, flatHeightAt);
    const pos = toTriples(positions);
    const col = toTriples(colors);
    const xs: number[] = [];
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i] as number[];
      // north edge (z≈0), east half (x>center) → the NE corner's sidewalk.
      if (isSidewalk(col[i] as number[]) && Math.abs((p[2] as number) - 0) < 1e-6 && (p[0] as number) > 8) {
        xs.push(p[0] as number);
      }
    }
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeCloseTo(8 + coreHalf, 5);
    expect(Math.max(...xs)).toBeCloseTo(8 + coreHalf + sidewalk, 5);
  });

  it('an isolated tile (mask 0) gets 4 straight curbs; a full intersection (mask 15) gets a curved curb-return at each of its 4 rounded corners', () => {
    const isolated = roadTileVertices(0, 0, RoadTier.TwoLane, 0, flatHeightAt);
    const junction = roadTileVertices(0, 0, RoadTier.TwoLane, N | E | S | W, flatHeightAt);
    expect(countWhere(isolated.colors, isSidewalk)).toBe(4 * 6);
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
    // Tile (0,0) spans world Z [0,16]; the south edge is Z=16. Tan verts hug it.
    expect(Math.max(...tanZs)).toBeCloseTo(16, 5);
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

  it('has NO curbs — an isolated tile emits only the core plate (6 vertices), no sidewalk quads', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.Gravel, 0, flatHeightAt);
    expect(vertexCount(positions)).toBe(6);
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

  it('has NO sidewalk curbs — an isolated tile emits only the core plate', () => {
    const { positions, colors } = roadTileVertices(0, 0, RoadTier.Alley, 0, flatHeightAt);
    expect(vertexCount(positions)).toBe(6);
    expect(countWhere(colors, isSidewalk)).toBe(0);
  });

  it('has NO centerline on a straight run', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Alley, N | S, flatHeightAt);
    expect(countWhere(colors, isMarkingWhite)).toBe(0);
  });

  it('is still a "paved tier" — a T-junction gets stop-line + crosswalk arm markings', () => {
    const { colors } = roadTileVertices(0, 0, RoadTier.Alley, N | E | S, flatHeightAt);
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
    expect(countWhere(colors, isMarkingWhite)).toBe(dashCountForZ(1) * 6);
  });

  it('is still a "paved tier" — a T-junction gets stop-line + crosswalk arm markings', () => {
    const { colors } = roadTileVertices(1, 1, RoadTier.OneWay, N | E | S, flatHeightAt);
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
        expect(countWhere(colors, isMarkingWhite)).toBe(expectedDash + expectedArrow);
      }
    });

    it('same arrow-count rule holds for a horizontal (E|W) run, keyed on global X', () => {
      for (const x of [0, 1, 2, 3]) {
        const { colors } = roadTileVertices(x, 0, RoadTier.OneWay, E | W, flatHeightAt);
        const expectedDash = dashCountForX(x) * 6;
        const expectedArrow = isArrowTile(x) ? 3 * 6 : 0;
        expect(countWhere(colors, isMarkingWhite)).toBe(expectedDash + expectedArrow);
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
        if (Math.abs(worldX - centerX) > 0.2) {
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
        if (Math.abs(worldZ - centerZ) > 0.2) {
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
        const worldX = (posTriples[i] as number[])[0] as number;
        expect(Math.abs(worldX - centerX)).toBeLessThanOrEqual(0.2);
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

  it('has a 4-lane carriageway = 15m (same width as an avenue; distinguished by markings, not width)', () => {
    const span = coreSpanMeters(RoadTier.FourLane);
    expect(span).toBeCloseTo(15, 5);
    expect(span).toBeCloseTo(coreSpanMeters(RoadTier.Avenue), 5);
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
    const { colors } = roadTileVertices(2, 2, RoadTier.FourLane, N | E | S, flatHeightAt);
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
  return { x, z, tier, mask };
}

describe('RoadMeshRenderer', () => {
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
