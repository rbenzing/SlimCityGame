/**
 * Road tile rendering: one merged, vertex-colored BufferGeometry per chunk.
 * `roadTileVertices` is the pure per-tile helper; the class
 * only owns chunk bookkeeping, BufferGeometry (re)construction, and the
 * median-tree InstancedMeshes.
 *
 * Geometry model: each tile emits a core asphalt plate sized
 * by tier, plus one "extension" quad per side whose mask bit is set — this
 * pushes the plate flush to the tile boundary on every side that connects to
 * another road tile, so a run of connected tiles reads as one seamless
 * carriageway with no gap at the shared edge. Wherever two adjacent sides
 * both connect (a turn, or a junction), a diagonal "corner fill" quad closes
 * the remaining gap at that corner so turns and junction boxes read as solid
 * asphalt. Any side whose mask bit is NOT set (no road neighbor there) gets a
 * raised, near-white sidewalk/shoulder curb strip instead, sized to fill the
 * remaining space out to the tile edge. Lane markings are thin white strips
 * drawn along whichever travel axis the mask indicates, suppressed entirely
 * once a tile has 3+ connections (a junction reads as clean asphalt in its
 * interior, though its connected arms now carry stop-lines + crosswalks).
 *
 * Paint/carriageway detail: true-ratio metric paint, narrower/wider
 * carriageways per tier, proper-intersection stop-lines + zebra crosswalks, a
 * raised avenue median (+ deterministic low trees), and a highway center
 * barrier. See the per-feature comments below for the numeric decisions.
 *
 * Extra tiers: four more tiers reuse every building block (core/extension/
 * corner plates, curbs, axis markings, junction arm markings) through
 * `tierSpec`'s `hasCurbs`/`paved` flags plus new `emitAxisMarkings` cases,
 * rather than duplicating the per-tile assembly logic:
 * - **Gravel** (tier 4): dusty tan, per-tile jittered vertex color
 *   (`gravelColorAt`), a narrower ~7m core, no curbs (bare shoulder — the
 *   underlying terrain shows through), and no paint of any kind (its
 *   `paved: false` gates out both axis markings and junction arm markings).
 * - **Alley** (tier 5): narrow ~6m dark asphalt, no curbs, no centerline (no
 *   `emitAxisMarkings` case), but still `paved: true` so junction arm
 *   markings apply like every other paved tier.
 * - **One-Way** (tier 6): two-lane width/color/markings, plus a periodic
 *   pavement direction arrow (`emitDirectionArrow`) on straight axes every
 *   `ARROW_PERIOD_TILES` global tiles, always pointing toward the
 *   low->high coordinate along that axis (the render-side half of the
 *   sim's directed-edge convention — RoadTileDelta carries no explicit
 *   direction, so this is a fixed cosmetic rule, not sim-fed).
 * - **Four-Lane** (tier 7): avenue-width carriageway with avenue-style
 *   dashed lane dividers + solid double center, but never a median (medians
 *   are gated on tier === Avenue elsewhere, so Four-Lane simply never
 *   qualifies).
 *
 * Corner rounding: the turn-corner fillet
 * (`emitCornerFillet`) is
 * a real turn radius (~0.5 of the carriageway half-width, capped by the curb
 * strip's own width) that bulges OUTWARD into the curb — a curb-return
 * shape a car could actually round. Because it sits a hair above curb
 * height and the curb strips underneath are unchanged, the curb reads as
 * arcing around the corner (instead of a square notch) as an emergent
 * effect of height layering, with no separate curb-geometry edit needed —
 * see the block comment above `emitCornerFillet` for the full reasoning.
 * The two plain-single-centerline tiers (TwoLane, One-Way —
 * `isPlainCenterlineTier`) additionally get a curved dash sequence
 * (`emitCurvedCenterlineDashes`) connecting their two straight arms through
 * the turn tile via a matching quarter-circle arc, instead of both arms
 * running the full core depth and crossing at a hard 90° in the middle.
 * Multi-line tiers (Avenue, Highway, Four-Lane) and unmarked tiers
 * (Gravel, Alley) are excluded and keep their square-stop
 * marking behavior. None of this touches the road GRAPH — centerlines stay
 * grid-aligned tile-to-tile; only this per-tile cosmetic
 * paint/geometry curves.
 */
import * as THREE from 'three';
import { RoadTileDelta, RoadTier } from '../shared/types';
import { TILE_METERS, CHUNK_TILES, CHUNKS_PER_SIDE } from '../shared/constants';

const ROAD_Y_OFFSET = 0.15;
/** Max sub-quad edge length (m) when a road quad is tessellated to follow a slope. */
const ROAD_QUAD_MAX_CELL_M = 2;
/** Corner+center height spread below which a quad is flat and stays one quad. */
const ROAD_QUAD_FLAT_EPSILON_M = 0.02;
/** Global tint the unlit road surface dims to at full night, leaving lamp pools bright. */
const ROAD_NIGHT_DIM = 0.34;
/** Lane markings sit a hair above the road surface to avoid z-fighting. */
const MARK_Y_OFFSET = 0.16;
/** Sidewalk/shoulder curbs stand physically proud of the road surface. */
const CURB_RAISE = 0.08;
export const CURB_Y_OFFSET = ROAD_Y_OFFSET + CURB_RAISE;

const TILE_HALF = TILE_METERS / 2;

/**
 * Neighbor bitmask directions — matches GridState.roadMask / RoadTileDelta.mask
 * (shared/types.ts) and src/world/roads.ts computeMask: N = neighbor at
 * (x, z-1), E = (x+1, z), S = (x, z+1), W = (x-1, z).
 */
const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

/**
 * Sidewalk/shoulder band: raised strip along tile edges that border a
 * non-road tile. Its width is not a fixed
 * constant — it's whatever is left between the tier's carriageway edge and
 * the tile boundary, so two-lane's much narrower carriageway (below) makes
 * the band widen to fill, while avenue/highway's wider carriageways leave a
 * narrower band that reads as a shoulder rather than a full sidewalk.
 */
const SIDEWALK_COLOR: readonly [number, number, number] = [0.82, 0.81, 0.79];

/** Lane paint: uniformly white across tiers, not tier-tinted. */
const MARKING_COLOR: readonly [number, number, number] = [0.95, 0.95, 0.96];
/**
 * True-ratio paint width (~0.15m).
 */
const PAINT_HALF_WIDTH_M = 0.075;
/** The two parallel lines of a "double solid" center marking (avenue). */
const CENTER_LINE_OFFSET = 0.22;
/** Avenue's dashed lane-divider lines sit partway between center and curb. */
const LANE_LINE_OFFSET_FRACTION = 0.5;
/** Highway's solid edge lines sit just inside the pavement edge. */
const EDGE_LINE_MARGIN = 0.5;

/**
 * True-ratio dash metrics (centerline dashes ~3m painted / ~4.5m gap). Phase
 * is always anchored at GLOBAL world-meter 0 —
 * never a per-tile or per-chunk local origin — so painted segments line up
 * continuously across every tile and chunk seam (see dashSegments).
 */
export const DASH_PAINT_LENGTH_M = 3;
export const DASH_GAP_LENGTH_M = 4.5;
export const DASH_PERIOD_M = DASH_PAINT_LENGTH_M + DASH_GAP_LENGTH_M;

/**
 * Painted sub-segments of a metric dash pattern (period DASH_PERIOD_M,
 * anchored at global world-meter 0) that fall within [lo, hi] — a GLOBAL
 * world-meter range along the travel axis. Clipped to the query range, so a
 * dash straddling a tile or chunk boundary appears as two adjacent clipped
 * segments (one per query) that together reconstruct the same coverage as
 * one wider query — see the seam-continuity tests. Returns [] for an empty
 * or inverted range.
 */
export function dashSegments(lo: number, hi: number): Array<[number, number]> {
  if (hi <= lo) return [];
  const segments: Array<[number, number]> = [];
  const firstK = Math.floor(lo / DASH_PERIOD_M) - 1;
  const lastK = Math.ceil(hi / DASH_PERIOD_M) + 1;
  for (let k = firstK; k <= lastK; k++) {
    const segStart = k * DASH_PERIOD_M;
    const segEnd = segStart + DASH_PAINT_LENGTH_M;
    const clippedStart = Math.max(segStart, lo);
    const clippedEnd = Math.min(segEnd, hi);
    if (clippedEnd > clippedStart) segments.push([clippedStart, clippedEnd]);
  }
  return segments;
}

/**
 * Carriageway ratios, expressed
 * as a half-width fraction of TILE_METERS (so `2 * fraction * TILE_METERS` is
 * the total paved carriageway width):
 * - two-lane -> 9.6m; the freed width goes to the widened sidewalk band.
 * - avenue -> 13.6m, leaving room for the 1.8m median inside the same paved
 *   plate.
 * - highway -> 14.72m (near full-width) — a narrow ~0.64m band per
 *   side reads as a shoulder rather than a full sidewalk.
 */
const TWO_LANE_HALF_WIDTH_FRACTION = 0.3;
const AVENUE_HALF_WIDTH_FRACTION = 0.425;
const HIGHWAY_HALF_WIDTH_FRACTION = 0.46;
/** Gravel: narrower core (~7m) of the 16m tile. */
const GRAVEL_HALF_WIDTH_FRACTION = 7 / (2 * TILE_METERS);
/** Alley: narrow (~6m). */
const ALLEY_HALF_WIDTH_FRACTION = 6 / (2 * TILE_METERS);
/** Four-Lane: avenue-width carriageway. */
const FOUR_LANE_HALF_WIDTH_FRACTION = AVENUE_HALF_WIDTH_FRACTION;

/** Gravel's dusty tan base color family, before per-tile jitter. */
const GRAVEL_BASE_COLOR: readonly [number, number, number] = [0.62, 0.55, 0.42];
/** Alley: dark asphalt, distinctly darker than every other paved tier. */
const ALLEY_COLOR: readonly [number, number, number] = [0.33, 0.33, 0.34];
/** One-Way reuses the two-lane look. */
const ONE_WAY_COLOR: readonly [number, number, number] = [0.5, 0.5, 0.51];
/**
 * Four-Lane: an avenue-family shade, distinguishable from avenue's own and
 * kept clear of the mid-grey band `isConcreteBand`-style tests use to detect
 * the median/divider raised bands (0.45..0.58) — plain asphalt must never
 * look like a physical concrete band.
 */
const FOUR_LANE_COLOR: readonly [number, number, number] = [0.6, 0.6, 0.61];

interface QuadSpec {
  halfWidthFraction: number;
  color: readonly [number, number, number];
  /** Raised sidewalk/shoulder curbs on unconnected sides (false: bare — no curb geometry at all). */
  hasCurbs: boolean;
  /** Whether this tier is painted at all: gates axis markings AND junction arm markings (false only for Gravel). */
  paved: boolean;
}

function tierSpec(tier: RoadTier): QuadSpec {
  switch (tier) {
    case RoadTier.TwoLane:
      return {
        halfWidthFraction: TWO_LANE_HALF_WIDTH_FRACTION,
        color: [0.5, 0.5, 0.51],
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.Avenue:
      return {
        halfWidthFraction: AVENUE_HALF_WIDTH_FRACTION,
        color: [0.58, 0.58, 0.59],
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.Highway:
      return {
        halfWidthFraction: HIGHWAY_HALF_WIDTH_FRACTION,
        color: [0.4, 0.4, 0.41],
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.Gravel:
      return {
        halfWidthFraction: GRAVEL_HALF_WIDTH_FRACTION,
        color: GRAVEL_BASE_COLOR,
        hasCurbs: false,
        paved: false,
      };
    case RoadTier.Alley:
      return {
        halfWidthFraction: ALLEY_HALF_WIDTH_FRACTION,
        color: ALLEY_COLOR,
        hasCurbs: false,
        paved: true,
      };
    case RoadTier.OneWay:
      return {
        halfWidthFraction: TWO_LANE_HALF_WIDTH_FRACTION,
        color: ONE_WAY_COLOR,
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.FourLane:
      return {
        halfWidthFraction: FOUR_LANE_HALF_WIDTH_FRACTION,
        color: FOUR_LANE_COLOR,
        hasCurbs: true,
        paved: true,
      };
    default:
      throw new RangeError(`roadTileVertices: no quad spec for tier ${tier}`);
  }
}

/**
 * Deterministic per-tile jitter on Gravel's dusty tan base color — same
 * avalanche hash shape as `hasMedianTree`, just widened to a byte per channel
 * instead
 * of a single bit. Pure function of (x, z); never Math.random.
 */
export function gravelColorAt(x: number, z: number): [number, number, number] {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const jitter = (byte: number): number => (byte / 255 - 0.5) * 2 * GRAVEL_COLOR_JITTER;
  const jr = jitter(h & 0xff);
  const jg = jitter((h >>> 8) & 0xff);
  const jb = jitter((h >>> 16) & 0xff);
  return [GRAVEL_BASE_COLOR[0] + jr, GRAVEL_BASE_COLOR[1] + jg, GRAVEL_BASE_COLOR[2] + jb];
}

/** Max per-channel deviation `gravelColorAt` applies around GRAVEL_BASE_COLOR. */
const GRAVEL_COLOR_JITTER = 0.05;

function pushVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
): void {
  positions.push(x, y, z);
  colors.push(color[0], color[1], color[2]);
}

/**
 * Two triangles covering a horizontal quad centered at (cx, cz), corners
 * sampled independently through `hAt` so the quad follows terrain contour.
 * Winding is CCW as seen from +Y (matches three's default FrontSide culling).
 */
function pushQuad(
  positions: number[],
  colors: number[],
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const x0 = cx - halfX;
  const x1 = cx + halfX;
  const z0 = cz - halfZ;
  const z1 = cz + halfZ;

  // Flat quads stay a single quad; only sloped quads tessellate to hug terrain.
  const hSpread =
    Math.max(hAt(x0, z0), hAt(x1, z0), hAt(x1, z1), hAt(x0, z1), hAt(cx, cz)) -
    Math.min(hAt(x0, z0), hAt(x1, z0), hAt(x1, z1), hAt(x0, z1), hAt(cx, cz));
  const subdivide = hSpread > ROAD_QUAD_FLAT_EPSILON_M;
  const nx = subdivide ? Math.max(1, Math.ceil((2 * halfX) / ROAD_QUAD_MAX_CELL_M)) : 1;
  const nz = subdivide ? Math.max(1, Math.ceil((2 * halfZ) / ROAD_QUAD_MAX_CELL_M)) : 1;
  const stepX = (x1 - x0) / nx;
  const stepZ = (z1 - z0) / nz;

  for (let iz = 0; iz < nz; iz++) {
    const cz0 = z0 + iz * stepZ;
    const cz1 = iz === nz - 1 ? z1 : cz0 + stepZ;
    for (let ix = 0; ix < nx; ix++) {
      const cx0 = x0 + ix * stepX;
      const cx1 = ix === nx - 1 ? x1 : cx0 + stepX;
      const y00 = hAt(cx0, cz0) + yOffset;
      const y10 = hAt(cx1, cz0) + yOffset;
      const y11 = hAt(cx1, cz1) + yOffset;
      const y01 = hAt(cx0, cz1) + yOffset;

      // Same CCW-from-+Y winding as the single-quad triangulation.
      pushVertex(positions, colors, cx0, y00, cz0, color);
      pushVertex(positions, colors, cx1, y11, cz1, color);
      pushVertex(positions, colors, cx1, y10, cz0, color);

      pushVertex(positions, colors, cx0, y00, cz0, color);
      pushVertex(positions, colors, cx0, y01, cz1, color);
      pushVertex(positions, colors, cx1, y11, cz1, color);
    }
  }
}

/**
 * Pushes an axis-aligned rectangle given LOCAL bounds in meters (relative to
 * the tile center at world (centerX, centerZ)). `lo`/`hi` may be asymmetric
 * around 0, unlike the tile-centered squares pushQuad itself expects.
 */
function pushLocalRect(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  loX: number,
  hiX: number,
  loZ: number,
  hiZ: number,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const cx = centerX + (loX + hiX) / 2;
  const cz = centerZ + (loZ + hiZ) / 2;
  const halfX = (hiX - loX) / 2;
  const halfZ = (hiZ - loZ) / 2;
  pushQuad(positions, colors, cx, cz, halfX, halfZ, yOffset, color, hAt);
}

/** A single marking line segment running along Z (vertical travel), offset `offset` in X. */
function pushVerticalLine(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  offset: number,
  zLo: number,
  zHi: number,
  hAt: (x: number, z: number) => number,
): void {
  pushLocalRect(
    positions,
    colors,
    centerX,
    centerZ,
    offset - PAINT_HALF_WIDTH_M,
    offset + PAINT_HALF_WIDTH_M,
    zLo,
    zHi,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
}

/** A single marking line segment running along X (horizontal travel), offset `offset` in Z. */
function pushHorizontalLine(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  offset: number,
  xLo: number,
  xHi: number,
  hAt: (x: number, z: number) => number,
): void {
  pushLocalRect(
    positions,
    colors,
    centerX,
    centerZ,
    xLo,
    xHi,
    offset - PAINT_HALF_WIDTH_M,
    offset + PAINT_HALF_WIDTH_M,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
}

/**
 * Emits a solid (non-dashed) marking line across the full [lo, hi] local
 * span in one shot.
 */
function pushSolidLine(
  positions: number[],
  colors: number[],
  vertical: boolean,
  centerX: number,
  centerZ: number,
  offset: number,
  lo: number,
  hi: number,
  hAt: (x: number, z: number) => number,
): void {
  if (vertical) pushVerticalLine(positions, colors, centerX, centerZ, offset, lo, hi, hAt);
  else pushHorizontalLine(positions, colors, centerX, centerZ, offset, lo, hi, hAt);
}

/**
 * Emits a dashed marking line across the local [lo, hi] span: converts to a
 * GLOBAL world-meter range (so phase is seam-continuous — see dashSegments),
 * then draws one line quad per painted sub-segment.
 */
function pushDashedLine(
  positions: number[],
  colors: number[],
  vertical: boolean,
  centerX: number,
  centerZ: number,
  offset: number,
  lo: number,
  hi: number,
  hAt: (x: number, z: number) => number,
): void {
  const origin = vertical ? centerZ : centerX;
  for (const [segLo, segHi] of dashSegments(origin + lo, origin + hi)) {
    const localLo = segLo - origin;
    const localHi = segHi - origin;
    if (vertical)
      pushVerticalLine(positions, colors, centerX, centerZ, offset, localLo, localHi, hAt);
    else pushHorizontalLine(positions, colors, centerX, centerZ, offset, localLo, localHi, hAt);
  }
}

/**
 * Emits the tier-specific marking set along one axis (vertical XOR
 * horizontal): two-lane's single
 * centerline is dashed; avenue's center pair is solid double (unless a
 * median is about to replace it — `suppressCenterPair`) plus dashed lane
 * lines; highway carries ONLY solid edge lines (its center is
 * the physical highway divider barrier, not painted).
 */
function emitAxisMarkings(
  positions: number[],
  colors: number[],
  tier: RoadTier,
  centerX: number,
  centerZ: number,
  coreHalf: number,
  vertical: boolean,
  lo: number,
  hi: number,
  suppressCenterPair: boolean,
  hAt: (x: number, z: number) => number,
): void {
  const solid = (offset: number): void =>
    pushSolidLine(positions, colors, vertical, centerX, centerZ, offset, lo, hi, hAt);
  const dashed = (offset: number): void =>
    pushDashedLine(positions, colors, vertical, centerX, centerZ, offset, lo, hi, hAt);

  switch (tier) {
    case RoadTier.TwoLane:
      dashed(0);
      break;
    case RoadTier.Avenue:
      if (!suppressCenterPair) {
        solid(CENTER_LINE_OFFSET);
        solid(-CENTER_LINE_OFFSET);
      }
      {
        const laneOffset = coreHalf * LANE_LINE_OFFSET_FRACTION;
        dashed(laneOffset);
        dashed(-laneOffset);
      }
      break;
    case RoadTier.Highway: {
      const edgeOffset = coreHalf - EDGE_LINE_MARGIN;
      solid(edgeOffset);
      solid(-edgeOffset);
      break;
    }
    case RoadTier.OneWay:
      // Two-lane look: same single dashed centerline.
      dashed(0);
      break;
    case RoadTier.FourLane:
      // Avenue-style dashed lane dividers + solid double center, but NEVER a
      // median (medianEligible/suppressCenterPair is only ever true for
      // Avenue itself, so Four-Lane always keeps its center pair).
      solid(CENTER_LINE_OFFSET);
      solid(-CENTER_LINE_OFFSET);
      {
        const laneOffset = coreHalf * LANE_LINE_OFFSET_FRACTION;
        dashed(laneOffset);
        dashed(-laneOffset);
      }
      break;
    // RoadTier.Alley falls through to default: no centerline, even though
    // it's otherwise a paved tier with junction arm markings.
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// One-Way direction arrows: a stem quad + two head
// quads, painted white, emitted every ARROW_PERIOD_TILES-th tile by GLOBAL
// coordinate along the tile's flow axis, always pointing toward the
// low->high coordinate on that axis (the render-side half of the direction
// convention — RoadTileDelta carries no explicit direction field,
// so this is a fixed cosmetic rule rather than sim-fed).
// ---------------------------------------------------------------------------

/** Arrows appear every ~3rd tile by global coord. */
export const ARROW_PERIOD_TILES = 3;

/** True every ARROW_PERIOD_TILES-th global tile coordinate, negative-safe. */
export function isArrowTile(coord: number): boolean {
  return ((coord % ARROW_PERIOD_TILES) + ARROW_PERIOD_TILES) % ARROW_PERIOD_TILES === 0;
}

const ARROW_HALF_LENGTH_M = 3;
const ARROW_HEAD_LENGTH_M = 1.2;
const ARROW_STEM_HALF_WIDTH_M = 0.15;
const ARROW_HEAD_HALF_WIDTH_M = 0.6;

/**
 * Emits one direction arrow (stem + two head-wing quads) centered on the
 * tile, oriented along `vertical`'s travel axis and always pointing toward
 * the low->high coordinate on that axis (+Z for vertical, +X for
 * horizontal) — see the direction-convention note above.
 */
function emitDirectionArrow(
  positions: number[],
  colors: number[],
  vertical: boolean,
  centerX: number,
  centerZ: number,
  hAt: (x: number, z: number) => number,
): void {
  const headBase = ARROW_HALF_LENGTH_M - ARROW_HEAD_LENGTH_M;
  const tip = ARROW_HALF_LENGTH_M;
  const tail = -ARROW_HALF_LENGTH_M;
  const rects: Array<[number, number, number, number]> = [
    // [alongLo, alongHi, acrossLo, acrossHi]
    [tail, headBase, -ARROW_STEM_HALF_WIDTH_M, ARROW_STEM_HALF_WIDTH_M], // stem
    [headBase, tip, ARROW_STEM_HALF_WIDTH_M, ARROW_HEAD_HALF_WIDTH_M], // head wing, + side
    [headBase, tip, -ARROW_HEAD_HALF_WIDTH_M, -ARROW_STEM_HALF_WIDTH_M], // head wing, - side
  ];
  for (const [alongLo, alongHi, acrossLo, acrossHi] of rects) {
    if (vertical) {
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        acrossLo,
        acrossHi,
        alongLo,
        alongHi,
        MARK_Y_OFFSET,
        MARKING_COLOR,
        hAt,
      );
    } else {
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        alongLo,
        alongHi,
        acrossLo,
        acrossHi,
        MARK_Y_OFFSET,
        MARKING_COLOR,
        hAt,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Proper intersections: each
// connecting arm of a junction tile (mask popcount >= 3) gets a stop line and
// a zebra crosswalk, laid out along the arm's travel axis by distance `d`
// from the box edge (d=0, i.e. the tile's core/coreHalf boundary) outward
// toward the tile edge. The target depths (2.4m crosswalk + 1.0m gap
// + 0.4m stop line = 3.8m) assume more per-arm depth than a 16m tile's
// carriageway ratios leave available on every tier once the box itself takes
// its share (TILE_HALF - coreHalf: 3.2m two-lane, 1.2m avenue, 0.64m
// highway) — so junctionArmLayout scales all three measurements down
// together to fit whatever depth the arm actually has, preserving their
// relative order (crosswalk nearest the box, stop line farthest) and never
// overlapping or spilling past the tile edge.
// ---------------------------------------------------------------------------

/** Along-travel-axis zebra-stripe length (~2.4m). */
const CROSSWALK_BAR_LENGTH_M = 2.4;
/** Across-travel-axis single-stripe width (~0.45m). */
const CROSSWALK_BAR_WIDTH_M = 0.45;
/** Across-travel-axis gap between stripes (~0.6m). */
const CROSSWALK_BAR_GAP_M = 0.6;
/** Along-travel-axis stop-line thickness (~0.4m). */
const STOP_LINE_THICKNESS_M = 0.4;
/** Along-travel-axis gap between the crosswalk's far edge and the stop line (~1m before the junction box). */
const STOP_LINE_GAP_M = 1.0;
const JUNCTION_ARM_TARGET_DEPTH_M =
  CROSSWALK_BAR_LENGTH_M + STOP_LINE_GAP_M + STOP_LINE_THICKNESS_M;

export interface JunctionArmLayout {
  /** Always 0 — the crosswalk starts flush with the box edge. */
  crosswalkStart: number;
  crosswalkEnd: number;
  stopLineStart: number;
  stopLineEnd: number;
}

/**
 * Pure layout for one junction arm given its available depth (distance from
 * the box edge to the tile's outer edge). Scales the spec's target depths
 * down proportionally when `armDepth` is short of the ideal
 * JUNCTION_ARM_TARGET_DEPTH_M, so the crosswalk + gap + stop line always fit
 * exactly within [0, armDepth] with no overlap. Returns an all-zero layout
 * for a non-positive armDepth.
 */
export function junctionArmLayout(armDepth: number): JunctionArmLayout {
  if (armDepth <= 0)
    return { crosswalkStart: 0, crosswalkEnd: 0, stopLineStart: 0, stopLineEnd: 0 };
  const scale = Math.min(1, armDepth / JUNCTION_ARM_TARGET_DEPTH_M);
  const crosswalkEnd = CROSSWALK_BAR_LENGTH_M * scale;
  const stopLineStart = crosswalkEnd + STOP_LINE_GAP_M * scale;
  const stopLineEnd = stopLineStart + STOP_LINE_THICKNESS_M * scale;
  return { crosswalkStart: 0, crosswalkEnd, stopLineStart, stopLineEnd };
}

/**
 * Deterministic zebra-stripe center offsets (across the travel axis, i.e.
 * symmetric about the carriageway centerline) that fit within
 * [-carriagewayHalfWidth, carriagewayHalfWidth] at CROSSWALK_BAR_WIDTH_M
 * width / CROSSWALK_BAR_GAP_M spacing. Always at least one stripe (for any
 * positive width) — a pure function of the carriageway width alone, so it's
 * identical for every arm of a given tier regardless of tile coords.
 */
export function crosswalkBarOffsets(carriagewayHalfWidth: number): number[] {
  if (carriagewayHalfWidth <= 0) return [];
  const period = CROSSWALK_BAR_WIDTH_M + CROSSWALK_BAR_GAP_M;
  const usable = carriagewayHalfWidth * 2;
  const count = Math.max(1, Math.floor((usable + CROSSWALK_BAR_GAP_M) / period));
  const totalSpan = count * CROSSWALK_BAR_WIDTH_M + (count - 1) * CROSSWALK_BAR_GAP_M;
  const start = -totalSpan / 2 + CROSSWALK_BAR_WIDTH_M / 2;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(start + i * period);
  return offsets;
}

/**
 * Emits one arm's stop line + zebra crosswalk. `dAt(d)` maps an
 * along-travel-axis distance from the box edge to a LOCAL coordinate
 * (relative to tile center) on that axis — the caller supplies the correct
 * direction/origin per side (N/E/S/W).
 */
function emitJunctionArmMarkings(
  positions: number[],
  colors: number[],
  vertical: boolean,
  centerX: number,
  centerZ: number,
  coreHalf: number,
  armDepth: number,
  dAt: (d: number) => number,
  hAt: (x: number, z: number) => number,
): void {
  const layout = junctionArmLayout(armDepth);

  // Stop line: one bar spanning the full carriageway width.
  const stopLo = Math.min(dAt(layout.stopLineStart), dAt(layout.stopLineEnd));
  const stopHi = Math.max(dAt(layout.stopLineStart), dAt(layout.stopLineEnd));
  if (vertical)
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      -coreHalf,
      coreHalf,
      stopLo,
      stopHi,
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );
  else
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      stopLo,
      stopHi,
      -coreHalf,
      coreHalf,
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );

  // Zebra crosswalk: bars spaced across the carriageway, each spanning
  // [crosswalkStart, crosswalkEnd] along the travel axis.
  const crossLo = Math.min(dAt(layout.crosswalkStart), dAt(layout.crosswalkEnd));
  const crossHi = Math.max(dAt(layout.crosswalkStart), dAt(layout.crosswalkEnd));
  if (crossHi <= crossLo) return;
  for (const offset of crosswalkBarOffsets(coreHalf)) {
    const barLo = offset - CROSSWALK_BAR_WIDTH_M / 2;
    const barHi = offset + CROSSWALK_BAR_WIDTH_M / 2;
    if (vertical)
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        barLo,
        barHi,
        crossLo,
        crossHi,
        MARK_Y_OFFSET,
        MARKING_COLOR,
        hAt,
      );
    else
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        crossLo,
        crossHi,
        barLo,
        barHi,
        MARK_Y_OFFSET,
        MARKING_COLOR,
        hAt,
      );
  }
}

// ---------------------------------------------------------------------------
// Avenue median + highway divider. Both are raised
// physical bands down the center of a STRAIGHT run (mask popcount <= 2 and
// collinear — i.e. never a corner or a junction, so the treatment always
// "breaks" cleanly at exactly the right tiles; no partial-tile
// clipping is needed). The band's along-travel-axis span mirrors the lane
// markings' own zLo/zHi rule (extend to the tile edge on a connected side,
// stop at the core edge on a dead-end side) so it can never overrun into a
// sidewalk/shoulder curb quad at a dead end.
// ---------------------------------------------------------------------------

/** Avenue median total width (raised ~1.8m center median). */
const MEDIAN_WIDTH_M = 1.8;
const MEDIAN_HALF_WIDTH_M = MEDIAN_WIDTH_M / 2;
/** Concrete edge tint's width on each side of the median, before the grass top. */
const MEDIAN_CONCRETE_EDGE_M = 0.15;
const MEDIAN_RAISE = 0.15;
const MEDIAN_Y_OFFSET = ROAD_Y_OFFSET + MEDIAN_RAISE;
const MEDIAN_CONCRETE_COLOR: readonly [number, number, number] = [0.55, 0.55, 0.53];
const MEDIAN_GRASS_COLOR: readonly [number, number, number] = [0.28, 0.5, 0.26];

/** Highway divider total width (low ~0.6m concrete barrier band). */
const HIGHWAY_BARRIER_WIDTH_M = 0.6;
const HIGHWAY_BARRIER_HALF_WIDTH_M = HIGHWAY_BARRIER_WIDTH_M / 2;
const HIGHWAY_BARRIER_RAISE = 0.2;
const HIGHWAY_BARRIER_Y_OFFSET = ROAD_Y_OFFSET + HIGHWAY_BARRIER_RAISE;
const HIGHWAY_BARRIER_COLOR: readonly [number, number, number] = [0.5, 0.5, 0.5];

// ---------------------------------------------------------------------------
// Rounded roads: cosmetic-only corner rounding
// layered on top of the existing per-tile quads, NOT curved centerlines
// (the road GRAPH/centerline stays grid-aligned tile-to-tile; only this
// per-tile cosmetic paint/geometry curves) —
// a triangle fan at each convex 90° corner of the carriageway.
//
// The core/extension/corner-fill scheme above always leaves the plate's
// silhouette perfectly straight EXCEPT at exactly one place: a turn tile
// (mask popcount 2, non-collinear) has a single convex "elbow" — the core
// plate's own corner diagonally opposite its two connected sides, where the
// plate occupies only one of the four surrounding quadrants (the other three
// are curb/void). A dangling stub (popcount 1) similarly ends in a flat,
// square-cut dead end.
//
// Turn-corner fillet: a believable turn radius WIDENS the pavement outward,
// into the curb, like a real curb return. The elbow is a corner of the
// asphalt plate itself, so a fan centers its arc directly ON the elbow corner
// (apex = arc center) and sweeps outward at the turn radius, bulging past the
// core boundary into the curb strip, replacing a quarter-disc of curb with
// asphalt. Because the curb strips beneath are simple full-coverage
// rectangles and this fan sits a hair above curb height
// (FILLET_Y_OFFSET), the curb is only ever visible OUTSIDE the fan's radius
// — so the effective curb/asphalt boundary the player sees is exactly this
// arc, not a square notch, with no separate curb-geometry edit required.
// The radius is a fraction of the carriageway HALF-WIDTH (`coreHalf`,
// not the curb offset `armDepth`) — a real turn-radius scale — capped by
// `armDepth` so the bulge never spills past the tile's own outer edge.
//
// The dead-end (popcount 1) cap is sized differently: an armDepth-scaled
// radius would read as a tiny nub far narrower than the road it caps. Its
// radius is instead the tier's own carriageway HALF-WIDTH (`coreHalf` — the
// same value the core plate uses), so the half-disc spans the FULL
// carriageway width and reads as a proper turnaround wide enough for a car to
// U-turn across both lanes, rather than a narrow dead-end nub. This is
// unrelated to the turn-corner fillet's own radius above.
// ---------------------------------------------------------------------------

/**
 * Turn-corner fillet radius as a fraction of the carriageway HALF-WIDTH
 * (`coreHalf`) — ~0.5 of the carriageway half-width, tuned to look like a car
 * could round it. Always capped by `armDepth` (the curb strip's own width) in
 * emitCornerFillet, so the bulge can never spill past the tile's outer edge
 * even on tight tiers (e.g. highway, whose armDepth is much narrower than
 * half its own coreHalf).
 */
const TURN_RADIUS_FRACTION = 0.5;
/** A hair above curb height — visible over the curb quads beneath it, no z-fighting. */
export const FILLET_Y_OFFSET = CURB_Y_OFFSET + 0.01;
/**
 * Quarter-circle turn-corner fillet, subdivided into this many triangles.
 * Kept EVEN so the fan's own vertex count (segments * 3) is itself a multiple
 * of 6 — preserving the file's existing "whole 18-float quad" invariant that
 * every (tier, mask) vertex-count-sanity test checks across mask 0..15.
 */
export const CORNER_FILLET_SEGMENTS = 4;
/** Half-disc dead-end cap, subdivided into this many triangles (also even, same invariant reason). */
export const END_CAP_SEGMENTS = 6;
/**
 * Fraction of the dead-end's outward room (armDepth) the rounded asphalt cap
 * fills; the remainder is the sidewalk arc that wraps it to the tile edge.
 * Keeping asphalt+sidewalk within armDepth contains the whole cap inside the
 * tile instead of ballooning a full coreHalf past its edge.
 */
export const END_CAP_ASPHALT_DEPTH_FRACTION = 0.55;

/**
 * Pushes a triangle fan from `apex` across consecutive pairs of `ring`
 * (both given as LOCAL [x, z] coordinates relative to the tile center),
 * sampling height per vertex through `hAt`. Auto-corrects winding per
 * triangle (via the local-space 2D cross product) to match this file's
 * CCW-from-+Y convention (see pushQuad), so callers don't have to reason
 * about arc direction/sign by hand.
 */
function pushFan(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  apex: readonly [number, number],
  ring: ReadonlyArray<readonly [number, number]>,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const worldOf = (p: readonly [number, number]): [number, number, number] => {
    const wx = centerX + p[0];
    const wz = centerZ + p[1];
    return [wx, hAt(wx, wz) + yOffset, wz];
  };
  const apexWorld = worldOf(apex);
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const e1x = a[0] - apex[0];
    const e1z = a[1] - apex[1];
    const e2x = b[0] - apex[0];
    const e2z = b[1] - apex[1];
    const cross = e1x * e2z - e1z * e2x;
    const [first, second] = cross < 0 ? [a, b] : [b, a];
    const firstWorld = worldOf(first);
    const secondWorld = worldOf(second);
    pushVertex(positions, colors, apexWorld[0], apexWorld[1], apexWorld[2], color);
    pushVertex(positions, colors, firstWorld[0], firstWorld[1], firstWorld[2], color);
    pushVertex(positions, colors, secondWorld[0], secondWorld[1], secondWorld[2], color);
  }
}

/**
 * Turn-tile corner fillet: the single
 * convex elbow of a turn's asphalt plate sits at the core corner diagonally
 * opposite the two connected sides (e.g. N|E connected -> the elbow is the
 * core's SW corner). The fan's apex IS the arc's center: a quarter-circle of
 * `radius` swept directly around the elbow, bulging OUTWARD past the core
 * boundary into the curb strip (a real turn radius / curb-return shape),
 * rather than chamfering inward into the already-solid core.
 */
function emitCornerFillet(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  armDepth: number,
  hasE: boolean,
  hasS: boolean,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const signX = hasE ? -1 : 1;
  const signZ = hasS ? -1 : 1;
  const radius = Math.min(TURN_RADIUS_FRACTION * coreHalf, armDepth);
  if (radius <= 0) return;
  const corner: [number, number] = [signX * coreHalf, signZ * coreHalf];
  const startAngle = Math.atan2(signZ, 0);
  const endAngle = Math.atan2(0, signX);
  let delta = endAngle - startAngle;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= CORNER_FILLET_SEGMENTS; i++) {
    const angle = startAngle + (delta * i) / CORNER_FILLET_SEGMENTS;
    ring.push([corner[0] + radius * Math.cos(angle), corner[1] + radius * Math.sin(angle)]);
  }
  pushFan(positions, colors, centerX, centerZ, corner, ring, FILLET_Y_OFFSET, color, hAt);
}

/**
 * Dangling road-end cap (mask popcount 1): a half-disc fan centered on the
 * core plate's flat dead-end edge, bulging outward (away from the single
 * connection) by `radius`, rounding what would otherwise be a hard square
 * cut into a soft cul-de-sac-style cap.
 *
 * Unlike the turn-corner
 * fillet, `radius` here is the tier's own carriageway HALF-WIDTH (`coreHalf`
 * — the same value the core plate itself uses), NOT
 * `TURN_RADIUS_FRACTION * coreHalf` (capped by armDepth). A dead-end must read as a proper
 * full-width rounded turnaround (a car could U-turn across both lanes), so
 * the half-disc spans the entire carriageway width rather than the narrow
 * nub an armDepth-scaled radius would produce.
 */
function emitEndCap(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  armDepth: number,
  vertical: boolean,
  outwardSign: 1 | -1,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const alongDepth = armDepth * END_CAP_ASPHALT_DEPTH_FRACTION;
  if (coreHalf <= 0 || alongDepth <= 0) return;
  const edgeAlong = outwardSign * coreHalf;
  const apex: [number, number] = vertical ? [0, edgeAlong] : [edgeAlong, 0];
  // Half-ELLIPSE: spans the full carriageway width across (coreHalf) but bulges
  // outward only `alongDepth`, so the rounded end stays inside the tile.
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= END_CAP_SEGMENTS; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / END_CAP_SEGMENTS;
    ring.push(endCapRingPoint(coreHalf, alongDepth, angle, edgeAlong, outwardSign, vertical));
  }
  pushFan(positions, colors, centerX, centerZ, apex, ring, FILLET_Y_OFFSET, color, hAt);
}

/**
 * A single point on the end-cap ellipse at the given angle, with independent
 * cross/along semi-axes — shared by the asphalt fan and the sidewalk arc so
 * both trace the exact same pivot/angle convention and seam seamlessly.
 */
function endCapRingPoint(
  crossRadius: number,
  alongDepth: number,
  angle: number,
  edgeAlong: number,
  outwardSign: 1 | -1,
  vertical: boolean,
): [number, number] {
  const cross = crossRadius * Math.sin(angle);
  const along = edgeAlong + outwardSign * alongDepth * Math.cos(angle);
  return vertical ? [cross, along] : [along, cross];
}

/**
 * A half-annulus curb/sidewalk ring hugging a
 * dangling road-end cap's rounded asphalt perimeter — the curb/sidewalk
 * arcs around the rounded cap at the cap radius, the same idea as
 * the turn-corner curb-follows-fillet, but made an explicit geometry
 * edit here (rather than relying on height-layering alone) because the
 * dead-end cap's own radius (coreHalf) commonly EXCEEDS the plain curb
 * strip's width (armDepth) — see emitEndCap's doc comment — so the existing
 * straight curb quad's flat far boundary sits well short of the asphalt
 * bulge's own rim, leaving a visible straight cut slicing across the round
 * cap instead of backing it. This ring reuses emitEndCap's exact pivot/angle
 * parametrization (`endCapRingPoint`) at the SAME inner radius (`coreHalf`,
 * the cap's own edge — a perfect seam with the asphalt fan's rim) and
 * extends outward by `curbWidth` (the tier's own armDepth, matching every
 * other curb strip's width), additive on top of the plain straight curb
 * quads (never removing them — exactly like the corner fillet, which layers
 * over rather than edits the curb underneath).
 */
function emitEndCapCurb(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  armDepth: number,
  vertical: boolean,
  outwardSign: 1 | -1,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  // Sidewalk arc wrapping the asphalt ellipse: from the asphalt rim out to the
  // tile edge, concentric so it hugs the rounded cap. Widths in cross and
  // along both equal the leftover of armDepth past the asphalt cap.
  const innerAlong = armDepth * END_CAP_ASPHALT_DEPTH_FRACTION;
  const outerAlong = armDepth;
  const bandWidth = outerAlong - innerAlong;
  if (bandWidth <= 0) return;
  const innerCross = coreHalf;
  const outerCross = coreHalf + bandWidth;
  const edgeAlong = outwardSign * coreHalf;
  const push = (p: readonly [number, number]): void => {
    const wx = centerX + p[0];
    const wz = centerZ + p[1];
    pushVertex(positions, colors, wx, hAt(wx, wz) + CURB_Y_OFFSET, wz, color);
  };
  for (let i = 0; i < END_CAP_SEGMENTS; i++) {
    const a0 = -Math.PI / 2 + (Math.PI * i) / END_CAP_SEGMENTS;
    const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / END_CAP_SEGMENTS;
    const innerA = endCapRingPoint(innerCross, innerAlong, a0, edgeAlong, outwardSign, vertical);
    const outerA = endCapRingPoint(outerCross, outerAlong, a0, edgeAlong, outwardSign, vertical);
    const innerB = endCapRingPoint(innerCross, innerAlong, a1, edgeAlong, outwardSign, vertical);
    const outerB = endCapRingPoint(outerCross, outerAlong, a1, edgeAlong, outwardSign, vertical);
    const cross =
      (outerA[0] - innerA[0]) * (innerB[1] - innerA[1]) -
      (outerA[1] - innerA[1]) * (innerB[0] - innerA[0]);
    const tri1 = cross >= 0 ? [innerA, outerA, innerB] : [innerA, innerB, outerA];
    const tri2 = cross >= 0 ? [innerB, outerA, outerB] : [innerB, outerB, outerA];
    for (const tri of [tri1, tri2]) for (const p of tri) push(p);
  }
}

// ---------------------------------------------------------------------------
// Curved centerline through a turn: without this, a turn tile's two straight
// axis-marking calls (see emitAxisMarkings below) each reach all the way to
// the CORE's far boundary on their own unconnected side and cross through the
// tile center at a hard 90°, which reads as square even though there's no gap
// in the asphalt underneath. Restricted to the tiers with a single plain
// dashed centerline (TwoLane, One-Way — isPlainCenterlineTier): the caller
// clamps each straight arm to stop at its OWN near-core-boundary (never
// crossing into the core interior at all), and this function fills the gap
// with a quarter-circle arc of dashes, radius = coreHalf, centered on the
// turn's INNER pivot (the corner-fill corner, diagonally opposite the
// fillet's outer elbow) — tangent to both straight arms exactly where they
// stop, so the dash sequence reads as one continuous curve. Avenue/
// FourLane (multi-line: solid center pair + dashed lane lines) and Highway
// (solid edge lines only) keep their square-stop behavior — curving multiple
// parallel offset lines through a turn is excluded.
// ---------------------------------------------------------------------------

/** True for tiers whose ONLY straight-run marking is a single dashed centerline (emitAxisMarkings' `dashed(0)` case) — the only tiers whose centerline curves through a turn. */
export function isPlainCenterlineTier(tier: RoadTier): boolean {
  return tier === RoadTier.TwoLane || tier === RoadTier.OneWay;
}

/** Straight sub-quads used to approximate one painted centerline dash's sweep through a turn-tile arc — kept small enough that a ~3m dash visibly curves rather than reading as a flat chord dropped onto the curve. */
export const DASH_ARC_SEGMENTS = 3;

/**
 * Pushes one quad of a curved paint band: the region between radius `rInner`
 * and `rOuter`, swept from `angleA` to `angleB` around `pivotLocal` (a LOCAL
 * [x, z] point relative to the tile center). Splits the quad along the
 * (outerA, innerB) diagonal into 2 triangles and auto-corrects winding via
 * one local-space cross product (both triangles share the same correction,
 * valid since the quad is planar/convex in local space) — matches this
 * file's CCW-from-+Y convention regardless of which way `angleA`->`angleB`
 * sweeps (see pushFan for the analogous fan-shaped version of this trick).
 */
function pushArcBandSegment(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  pivotLocal: readonly [number, number],
  angleA: number,
  angleB: number,
  rInner: number,
  rOuter: number,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const at = (angle: number, r: number): [number, number] => [
    pivotLocal[0] + r * Math.cos(angle),
    pivotLocal[1] + r * Math.sin(angle),
  ];
  const innerA = at(angleA, rInner);
  const outerA = at(angleA, rOuter);
  const innerB = at(angleB, rInner);
  const outerB = at(angleB, rOuter);
  const cross =
    (outerA[0] - innerA[0]) * (innerB[1] - innerA[1]) -
    (outerA[1] - innerA[1]) * (innerB[0] - innerA[0]);
  const tri1 = cross >= 0 ? [innerA, outerA, innerB] : [innerA, innerB, outerA];
  const tri2 = cross >= 0 ? [innerB, outerA, outerB] : [innerB, outerB, outerA];
  for (const tri of [tri1, tri2]) {
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + yOffset, wz, color);
    }
  }
}

/**
 * Emits the curved dashed-centerline connector for a turn tile (see the
 * block comment above). The arc's radius is exactly `coreHalf`, centered on
 * the turn's inner pivot, tangent to both straight arms at their own
 * near-core-boundary stop points. Painted sub-segments reuse dashSegments'
 * GLOBAL world-meter phase, seeded from the vertical arm's own entry world-Z
 * (phase continuity INTO the turn — exact continuity out the far/exit side
 * isn't generally possible since the arc length rarely divides evenly by the
 * dash period, matching the spec's "where practical").
 */
function emitCurvedCenterlineDashes(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  hasE: boolean,
  hasS: boolean,
  hAt: (x: number, z: number) => number,
): void {
  const radius = coreHalf;
  if (radius <= 0) return;
  const signX = hasE ? -1 : 1;
  const signZ = hasS ? -1 : 1;
  // Inner pivot: the corner-fill corner, diagonally opposite the fillet's outer elbow.
  const pivotLocal: [number, number] = [-signX * coreHalf, -signZ * coreHalf];

  const angleEntry = Math.atan2(0, signX);
  const angleExit = Math.atan2(signZ, 0);
  let delta = angleExit - angleEntry;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const arcLength = radius * Math.abs(delta);
  if (arcLength <= 0) return;

  // Entry tangent point's world Z, on the vertical arm's x=0 centerline —
  // seeds the dash phase so it continues from wherever the straight arm's
  // own dash pattern left off.
  const entryWorldZ = centerZ + pivotLocal[1];

  for (const [lo, hi] of dashSegments(entryWorldZ, entryWorldZ + arcLength)) {
    const tLo = (lo - entryWorldZ) / arcLength;
    const tHi = (hi - entryWorldZ) / arcLength;
    const dashAngleLo = angleEntry + delta * tLo;
    const dashAngleHi = angleEntry + delta * tHi;
    for (let seg = 0; seg < DASH_ARC_SEGMENTS; seg++) {
      const a0 = dashAngleLo + ((dashAngleHi - dashAngleLo) * seg) / DASH_ARC_SEGMENTS;
      const a1 = dashAngleLo + ((dashAngleHi - dashAngleLo) * (seg + 1)) / DASH_ARC_SEGMENTS;
      pushArcBandSegment(
        positions,
        colors,
        centerX,
        centerZ,
        pivotLocal,
        a0,
        a1,
        radius - PAINT_HALF_WIDTH_M,
        radius + PAINT_HALF_WIDTH_M,
        MARK_Y_OFFSET,
        MARKING_COLOR,
        hAt,
      );
    }
  }
}

function isCollinearMask(mask: number): boolean {
  const hasVertical = (mask & (NORTH | SOUTH)) !== 0;
  const hasHorizontal = (mask & (EAST | WEST)) !== 0;
  return !(hasVertical && hasHorizontal);
}

/**
 * Straight (non-corner, non-junction) avenue run eligible for the
 * median: mask popcount in [1, 2] AND collinear. A "straight avenue run"
 * requires at least one real road
 * connection (popcount >= 1), not a fully disconnected popcount-0 tile,
 * since a median down the middle of a road segment with no neighbors on
 * either side isn't really a "run" at all. (Collinearity alone already
 * implies popcount <= 2 for a 4-bit neighbor mask; both are checked to
 * stay robust to any future mask shape.)
 */
export function isAvenueMedianEligible(tier: RoadTier, mask: number): boolean {
  const popcount =
    (mask & NORTH ? 1 : 0) + (mask & EAST ? 1 : 0) + (mask & SOUTH ? 1 : 0) + (mask & WEST ? 1 : 0);
  return tier === RoadTier.Avenue && popcount >= 1 && popcount <= 2 && isCollinearMask(mask);
}

/** Straight (non-corner, non-junction) highway run eligible for the divider barrier — see isAvenueMedianEligible for the popcount >= 1 rationale. */
export function isHighwayDividerEligible(tier: RoadTier, mask: number): boolean {
  const popcount =
    (mask & NORTH ? 1 : 0) + (mask & EAST ? 1 : 0) + (mask & SOUTH ? 1 : 0) + (mask & WEST ? 1 : 0);
  return tier === RoadTier.Highway && popcount >= 1 && popcount <= 2 && isCollinearMask(mask);
}

/**
 * Deterministic per-tile hash used ONLY to decide which median tiles carry a
 * tree (~every 2nd tile, from tile hash) — a pure
 * 32-bit avalanche mix of the tile's own coordinates, never Math.random.
 * Lands close to 50% true across a run of tiles (see determinism test).
 */
export function hasMedianTree(x: number, z: number): boolean {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 1) === 0;
}

function pushCenterBand(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  crossLo: number,
  crossHi: number,
  along: { lo: number; hi: number },
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  if (vertical)
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      crossLo,
      crossHi,
      along.lo,
      along.hi,
      yOffset,
      color,
      hAt,
    );
  else
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      along.lo,
      along.hi,
      crossLo,
      crossHi,
      yOffset,
      color,
      hAt,
    );
}

function emitAvenueMedian(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  along: { lo: number; hi: number },
  hAt: (x: number, z: number) => number,
): void {
  const m = MEDIAN_HALF_WIDTH_M;
  const e = MEDIAN_CONCRETE_EDGE_M;
  pushCenterBand(
    positions,
    colors,
    centerX,
    centerZ,
    vertical,
    -m,
    -m + e,
    along,
    MEDIAN_Y_OFFSET,
    MEDIAN_CONCRETE_COLOR,
    hAt,
  );
  pushCenterBand(
    positions,
    colors,
    centerX,
    centerZ,
    vertical,
    m - e,
    m,
    along,
    MEDIAN_Y_OFFSET,
    MEDIAN_CONCRETE_COLOR,
    hAt,
  );
  pushCenterBand(
    positions,
    colors,
    centerX,
    centerZ,
    vertical,
    -m + e,
    m - e,
    along,
    MEDIAN_Y_OFFSET,
    MEDIAN_GRASS_COLOR,
    hAt,
  );
}

function emitHighwayDivider(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  along: { lo: number; hi: number },
  hAt: (x: number, z: number) => number,
): void {
  const b = HIGHWAY_BARRIER_HALF_WIDTH_M;
  pushCenterBand(
    positions,
    colors,
    centerX,
    centerZ,
    vertical,
    -b,
    b,
    along,
    HIGHWAY_BARRIER_Y_OFFSET,
    HIGHWAY_BARRIER_COLOR,
    hAt,
  );
}

/**
 * Pure per-tile geometry, vertex-colored, no textures: core asphalt plate +
 * connected-side extensions/corner-fills, sidewalk/
 * shoulder curbs on unconnected sides, lane markings (suppressed at
 * junctions in favor of stop-lines + crosswalks), an avenue median or
 * highway divider on straight runs, and per-arm junction markings on
 * intersections (popcount >= 3).
 */
export function roadTileVertices(
  x: number,
  z: number,
  tier: RoadTier,
  mask: number,
  hAt: (x: number, z: number) => number,
): { positions: number[]; colors: number[] } {
  if (!Number.isInteger(mask) || mask < 0 || mask > 15) {
    throw new RangeError(`roadTileVertices: mask ${mask} out of the 4-bit range 0..15`);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  if (tier === RoadTier.None) return { positions, colors };

  const spec = tierSpec(tier);
  const centerX = (x + 0.5) * TILE_METERS;
  const centerZ = (z + 0.5) * TILE_METERS;
  const coreHalf = TILE_METERS * spec.halfWidthFraction;
  const armDepth = TILE_HALF - coreHalf;

  const hasN = (mask & NORTH) !== 0;
  const hasE = (mask & EAST) !== 0;
  const hasS = (mask & SOUTH) !== 0;
  const hasW = (mask & WEST) !== 0;

  // Gravel's dusty tan gets deterministic per-tile jitter instead of the
  // tier's flat spec color; every other tier keeps its flat tier shade.
  const plateColor = tier === RoadTier.Gravel ? gravelColorAt(x, z) : spec.color;

  // Core plate: always present, tier-colored.
  pushLocalRect(
    positions,
    colors,
    centerX,
    centerZ,
    -coreHalf,
    coreHalf,
    -coreHalf,
    coreHalf,
    ROAD_Y_OFFSET,
    plateColor,
    hAt,
  );

  // Extensions: push the plate flush to the tile edge on every connected side.
  if (hasN) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      -coreHalf,
      coreHalf,
      -TILE_HALF,
      -coreHalf,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }
  if (hasS) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      -coreHalf,
      coreHalf,
      coreHalf,
      TILE_HALF,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }
  if (hasE) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
      TILE_HALF,
      -coreHalf,
      coreHalf,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }
  if (hasW) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      -TILE_HALF,
      -coreHalf,
      -coreHalf,
      coreHalf,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }

  // Corner fills: close the diagonal gap wherever two adjacent sides both connect.
  if (hasN && hasE) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
      TILE_HALF,
      -TILE_HALF,
      -coreHalf,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }
  if (hasS && hasE) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
      TILE_HALF,
      coreHalf,
      TILE_HALF,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }
  if (hasS && hasW) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      -TILE_HALF,
      -coreHalf,
      coreHalf,
      TILE_HALF,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }
  if (hasN && hasW) {
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      -TILE_HALF,
      -coreHalf,
      -TILE_HALF,
      -coreHalf,
      ROAD_Y_OFFSET,
      plateColor,
      hAt,
    );
  }

  // Sidewalks/shoulders: raised curb along every edge that does NOT border
  // another road tile, sized to fill exactly the gap between the
  // (tier-specific) core edge and the tile boundary.
  // Gravel and Alley have `hasCurbs: false` — no curb geometry at all, a bare
  // shoulder/terrain-level taper on their unconnected sides.
  if (spec.hasCurbs) {
    const curbWidth = armDepth;
    if (!hasN) {
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        -TILE_HALF,
        TILE_HALF,
        -TILE_HALF,
        -TILE_HALF + curbWidth,
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
        hAt,
      );
    }
    if (!hasS) {
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        -TILE_HALF,
        TILE_HALF,
        TILE_HALF - curbWidth,
        TILE_HALF,
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
        hAt,
      );
    }
    if (!hasE) {
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        TILE_HALF - curbWidth,
        TILE_HALF,
        -TILE_HALF,
        TILE_HALF,
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
        hAt,
      );
    }
    if (!hasW) {
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        -TILE_HALF,
        -TILE_HALF + curbWidth,
        -TILE_HALF,
        TILE_HALF,
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
        hAt,
      );
    }
  }

  const connections = (hasN ? 1 : 0) + (hasE ? 1 : 0) + (hasS ? 1 : 0) + (hasW ? 1 : 0);
  const isJunction = connections >= 3;
  const isTurn = connections === 2 && !isCollinearMask(mask);
  const medianEligible = isAvenueMedianEligible(tier, mask);
  const dividerEligible = isHighwayDividerEligible(tier, mask);
  const hasVertical = hasN || hasS;
  const hasHorizontal = hasE || hasW;
  // Only the plain single-centerline tiers get the curved connector — see the
  // block comment above emitCurvedCenterlineDashes for why
  // Avenue/Highway/FourLane are excluded.
  const curvedCenterline = isTurn && isPlainCenterlineTier(tier);

  // Paint: Gravel is unpaved (`paved: false`) and gets none of axis markings
  // / one-way arrows / junction arm markings — gravel junctions stay
  // unpainted. Every other tier (including Alley/One-Way/Four-Lane) is a paved
  // tier and gets the full marking behavior below.
  if (spec.paved) {
    // Lane markings: suppressed at junctions (mask popcount >= 3) — those get
    // per-arm stop-lines + crosswalks instead (below).
    if (!isJunction) {
      if (hasVertical) {
        // curvedCenterline: the straight dash stops at ITS OWN near-core
        // boundary (same sign as the connected direction) instead of
        // crossing the whole core to the far boundary — emitCurvedCenterlineDashes
        // fills the rest with an arc. Every other case (straight run, dead
        // end) keeps the plain ±coreHalf clamp.
        const zLo = hasN ? -TILE_HALF : curvedCenterline ? coreHalf : -coreHalf;
        const zHi = hasS ? TILE_HALF : curvedCenterline ? -coreHalf : coreHalf;
        emitAxisMarkings(
          positions,
          colors,
          tier,
          centerX,
          centerZ,
          coreHalf,
          true,
          zLo,
          zHi,
          medianEligible,
          hAt,
        );
      }
      if (hasHorizontal) {
        const xLo = hasW ? -TILE_HALF : curvedCenterline ? coreHalf : -coreHalf;
        const xHi = hasE ? TILE_HALF : curvedCenterline ? -coreHalf : coreHalf;
        emitAxisMarkings(
          positions,
          colors,
          tier,
          centerX,
          centerZ,
          coreHalf,
          false,
          xLo,
          xHi,
          medianEligible,
          hAt,
        );
      }
      if (curvedCenterline) {
        emitCurvedCenterlineDashes(positions, colors, centerX, centerZ, coreHalf, hasE, hasS, hAt);
      }

      // One-Way direction arrows: every ARROW_PERIOD_TILES-th tile by GLOBAL
      // coordinate along the flow axis, always pointing low->high on that axis.
      if (tier === RoadTier.OneWay) {
        if (hasVertical && isArrowTile(z))
          emitDirectionArrow(positions, colors, true, centerX, centerZ, hAt);
        if (hasHorizontal && isArrowTile(x))
          emitDirectionArrow(positions, colors, false, centerX, centerZ, hAt);
      }
    }

    // Proper intersections: each connected arm of a junction tile gets its
    // own stop line + zebra crosswalk. Corner tiles (popcount 2, non-collinear)
    // are NOT junctions by this gate and keep their plain suppression/marking
    // behavior above.
    if (isJunction) {
      if (hasN)
        emitJunctionArmMarkings(
          positions,
          colors,
          true,
          centerX,
          centerZ,
          coreHalf,
          armDepth,
          (d) => -coreHalf - d,
          hAt,
        );
      if (hasS)
        emitJunctionArmMarkings(
          positions,
          colors,
          true,
          centerX,
          centerZ,
          coreHalf,
          armDepth,
          (d) => coreHalf + d,
          hAt,
        );
      if (hasE)
        emitJunctionArmMarkings(
          positions,
          colors,
          false,
          centerX,
          centerZ,
          coreHalf,
          armDepth,
          (d) => coreHalf + d,
          hAt,
        );
      if (hasW)
        emitJunctionArmMarkings(
          positions,
          colors,
          false,
          centerX,
          centerZ,
          coreHalf,
          armDepth,
          (d) => -coreHalf - d,
          hAt,
        );
    }
  }

  // Avenue median / highway divider: straight runs
  // only — breaks automatically at corners/junctions via the eligibility
  // gates above. Spans the same "extend to tile edge on a connected side,
  // stop at the core edge on a dead end" rule as the lane markings, so it
  // never overruns into a sidewalk/shoulder curb quad.
  if (medianEligible || dividerEligible) {
    const vertical = !(hasE || hasW);
    const lo = vertical ? (hasN ? -TILE_HALF : -coreHalf) : hasW ? -TILE_HALF : -coreHalf;
    const hi = vertical ? (hasS ? TILE_HALF : coreHalf) : hasE ? TILE_HALF : coreHalf;
    if (medianEligible)
      emitAvenueMedian(positions, colors, centerX, centerZ, vertical, { lo, hi }, hAt);
    else emitHighwayDivider(positions, colors, centerX, centerZ, vertical, { lo, hi }, hAt);
  }

  // Rounded roads: a small fillet fan at a turn tile's
  // single convex elbow corner, or a half-disc cap on a dangling stub's dead
  // end. Never fires for an isolated tile (popcount 0), a straight run
  // (popcount 2, collinear), or any junction (popcount >= 3) — the
  // core/extension/corner-fill scheme never produces a stray 90° corner in
  // those cases (verified by construction: a 3+-connection box always covers
  // the full tile except a clean straight curb cut on its one missing side).
  if (connections === 1) {
    const vertical = hasN || hasS;
    const outwardSign: 1 | -1 = hasN ? 1 : hasS ? -1 : hasE ? -1 : 1;
    emitEndCap(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
      armDepth,
      vertical,
      outwardSign,
      plateColor,
      hAt,
    );
    // Curb/sidewalk ring hugging the cap's
    // rounded perimeter (see emitEndCapCurb) — additive over the plain
    // straight curb quads above, never gated out except where this tier has
    // no curbs at all (Gravel/Alley bare shoulder).
    if (spec.hasCurbs) {
      emitEndCapCurb(
        positions,
        colors,
        centerX,
        centerZ,
        coreHalf,
        armDepth,
        vertical,
        outwardSign,
        SIDEWALK_COLOR,
        hAt,
      );
    }
  } else if (isTurn) {
    emitCornerFillet(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
      armDepth,
      hasE,
      hasS,
      plateColor,
      hAt,
    );
  }

  return { positions, colors };
}

// ---------------------------------------------------------------------------
// RoadMeshRenderer
// ---------------------------------------------------------------------------

interface ChunkEntry {
  tiles: Map<number, RoadTileDelta>;
  mesh: THREE.Mesh | null;
}

function chunkKeyOf(x: number, z: number): number {
  const cx = Math.floor(x / CHUNK_TILES);
  const cz = Math.floor(z / CHUNK_TILES);
  return cz * CHUNKS_PER_SIDE + cx;
}

function localTileKeyOf(x: number, z: number): number {
  const localX = ((x % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
  const localZ = ((z % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
  return localZ * CHUNK_TILES + localX;
}

/** Simple trunk cylinder + canopy sphere, self-contained geometry. */
const MEDIAN_TREE_TRUNK_HEIGHT = 1.1;
const MEDIAN_TREE_TRUNK_RADIUS_TOP = 0.1;
const MEDIAN_TREE_TRUNK_RADIUS_BOTTOM = 0.14;
const MEDIAN_TREE_CANOPY_RADIUS = 0.55;
const MEDIAN_TREE_TRUNK_COLOR = 0x6b4a2f;
const MEDIAN_TREE_CANOPY_COLOR = 0x2f6b3a;

const _treeMatrix = new THREE.Matrix4();
const _treePosition = new THREE.Vector3();
const _identityQuat = new THREE.Quaternion();
const _treeScale = new THREE.Vector3(1, 1, 1);

export class RoadMeshRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly material = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly chunks = new Map<number, ChunkEntry>();

  // Median trees: a single trunk InstancedMesh + a single
  // canopy InstancedMesh, shared geometry/material built once and reused
  // across rebuilds; only created/added to the scene once at least one
  // eligible tile actually exists (so a game with no avenue medians never
  // pays for — or exposes in the scene graph — an empty tree mesh).
  private readonly treeTrunkGeometry = new THREE.CylinderGeometry(
    MEDIAN_TREE_TRUNK_RADIUS_TOP,
    MEDIAN_TREE_TRUNK_RADIUS_BOTTOM,
    MEDIAN_TREE_TRUNK_HEIGHT,
    6,
  );
  private readonly treeCanopyGeometry = new THREE.SphereGeometry(MEDIAN_TREE_CANOPY_RADIUS, 7, 5);
  private readonly treeTrunkMaterial = new THREE.MeshLambertMaterial({
    color: MEDIAN_TREE_TRUNK_COLOR,
  });
  private readonly treeCanopyMaterial = new THREE.MeshLambertMaterial({
    color: MEDIAN_TREE_CANOPY_COLOR,
  });
  private treeTrunkMesh: THREE.InstancedMesh | null = null;
  private treeCanopyMesh: THREE.InstancedMesh | null = null;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.treeTrunkGeometry.translate(0, MEDIAN_TREE_TRUNK_HEIGHT / 2, 0);
    this.treeCanopyGeometry.translate(
      0,
      MEDIAN_TREE_TRUNK_HEIGHT + MEDIAN_TREE_CANOPY_RADIUS * 0.6,
      0,
    );
  }

  /**
   * Dims the road toward ROAD_NIGHT_DIM at night. The material is unlit
   * (final color = material.color × vertexColor), so scaling material.color
   * darkens every road vertex without touching per-tile colors, leaving the
   * additive lamp pools as the only bright spots.
   */
  setNightFactor(nightFactor: number): void {
    const f = Math.min(1, Math.max(0, nightFactor));
    const dim = 1 - f * (1 - ROAD_NIGHT_DIM);
    this.material.color.setScalar(dim);
  }

  apply(deltas: RoadTileDelta[]): void {
    const dirty = new Set<number>();
    for (const delta of deltas) {
      const key = chunkKeyOf(delta.x, delta.z);
      let chunk = this.chunks.get(key);
      if (!chunk) {
        chunk = { tiles: new Map(), mesh: null };
        this.chunks.set(key, chunk);
      }
      const tileKey = localTileKeyOf(delta.x, delta.z);
      if (delta.tier === RoadTier.None) {
        chunk.tiles.delete(tileKey);
      } else {
        chunk.tiles.set(tileKey, delta);
      }
      dirty.add(key);
    }

    for (const key of dirty) this.rebuildChunk(key);
    this.rebuildMedianTrees();
  }

  /** Current median-tree instance count (test/inspection hook). */
  medianTreeCount(): number {
    return this.treeTrunkMesh ? this.treeTrunkMesh.count : 0;
  }

  private rebuildChunk(key: number): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }
    if (chunk.tiles.size === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    for (const tile of chunk.tiles.values()) {
      const vertices = roadTileVertices(tile.x, tile.z, tile.tier, tile.mask, this.heightAt);
      for (const n of vertices.positions) positions.push(n);
      for (const n of vertices.colors) colors.push(n);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, this.material);
    chunk.mesh = mesh;
    this.scene.add(mesh);
  }

  /**
   * Recomputes the full median-tree instance list from every currently
   * tracked road tile. Median trees are an instanced mesh owned by
   * RoadMeshRenderer, not the pure per-tile geometry helper.
   */
  private rebuildMedianTrees(): void {
    const tiles: RoadTileDelta[] = [];
    for (const chunk of this.chunks.values()) {
      for (const tile of chunk.tiles.values()) tiles.push(tile);
    }

    const treeTiles = tiles.filter(
      (t) => isAvenueMedianEligible(t.tier, t.mask) && hasMedianTree(t.x, t.z),
    );

    if (treeTiles.length === 0) {
      if (this.treeTrunkMesh) {
        this.scene.remove(this.treeTrunkMesh);
        this.treeTrunkMesh = null;
      }
      if (this.treeCanopyMesh) {
        this.scene.remove(this.treeCanopyMesh);
        this.treeCanopyMesh = null;
      }
      return;
    }

    if (this.treeTrunkMesh) this.scene.remove(this.treeTrunkMesh);
    if (this.treeCanopyMesh) this.scene.remove(this.treeCanopyMesh);

    const trunkMesh = new THREE.InstancedMesh(
      this.treeTrunkGeometry,
      this.treeTrunkMaterial,
      treeTiles.length,
    );
    const canopyMesh = new THREE.InstancedMesh(
      this.treeCanopyGeometry,
      this.treeCanopyMaterial,
      treeTiles.length,
    );

    for (let i = 0; i < treeTiles.length; i++) {
      const tile = treeTiles[i]!;
      const centerX = (tile.x + 0.5) * TILE_METERS;
      const centerZ = (tile.z + 0.5) * TILE_METERS;
      const groundY = this.heightAt(centerX, centerZ) + ROAD_Y_OFFSET + MEDIAN_RAISE;
      _treePosition.set(centerX, groundY, centerZ);
      _treeMatrix.compose(_treePosition, _identityQuat, _treeScale);
      trunkMesh.setMatrixAt(i, _treeMatrix);
      canopyMesh.setMatrixAt(i, _treeMatrix);
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(trunkMesh);
    this.scene.add(canopyMesh);
    this.treeTrunkMesh = trunkMesh;
    this.treeCanopyMesh = canopyMesh;
  }
}
