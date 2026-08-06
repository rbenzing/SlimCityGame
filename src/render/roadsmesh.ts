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
 * - **Bus Lane** (tier 8): four-lane-width carriageway with the four-lane
 *   white marking set, plus a terracotta band painted over each curbside lane
 *   and a periodic white transit diamond (`emitColoredLaneBands`).
 * - **Bike Lane** (tier 9): three-lane-width carriageway with the two-lane
 *   white centerline, plus a green edge strip each side and a periodic white
 *   bicycle pictogram (`emitColoredLaneBands`). Both transit variants paint
 *   their colored band on straight runs only; junctions/turns break it.
 * - **Tram** (tier 10): two-lane-width shared street with two embedded steel
 *   rails + periodic cross-tie sleepers down the centre (`emitTramTrack`), and
 *   NO painted centerline (the rails are the centre). Track paints on straight
 *   runs only; junctions/turns break it, same as the colored bands.
 * - **Rail Track** (tier 11): a dedicated heavy-rail line — a dark ballast bed
 *   (`paved: false`, no curbs/markings/crosswalks) carrying the same embedded
 *   `emitTramTrack` rails + sleepers. Not a street: excluded from the drivable
 *   traffic graph so cosmetic cars never route onto it.
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
 * Turn tiles additionally get curved lane markings (`emitCurvedMarkings`, the
 * arc analog of `emitAxisMarkings`): each tier's straight-run line set is
 * swept around the quarter-annulus at radius `rMid + offset` — two-lane /
 * one-way single dashed centerline, avenue / four-lane double-solid center +
 * dashed lane lines, highway solid edge lines, gravel / alley none. None of
 * this touches the road GRAPH — centerlines stay grid-aligned tile-to-tile;
 * only this per-tile cosmetic paint/geometry curves.
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
 * Road sizing rule (user 2026-07-29): one lane is 1.5× the widest vehicle, and
 * a sidewalk is 0.5× a lane. The widest vehicle is the bus at 2.5m
 * (render/vehicles.ts sizeForKind), so a lane is 3.75m and a sidewalk 1.875m.
 * A tier's carriageway = laneCount × LANE_WIDTH_M; whatever the carriageway +
 * two sidewalks leave of the 16m tile is a grass verge (narrow local streets
 * get a wide verge; 4-lane arterials fill the tile and the sidewalk clamps).
 */
export const LANE_WIDTH_M = 3.75;
export const SIDEWALK_WIDTH_M = 0.5 * LANE_WIDTH_M; // 1.875m
/** Half-carriageway as a fraction of TILE_METERS, from a tier's lane count. */
const laneFraction = (lanes: number): number => (lanes * LANE_WIDTH_M) / (2 * TILE_METERS);

export const TWO_LANE_HALF_WIDTH_FRACTION = laneFraction(2); // 7.5m carriageway
export const AVENUE_HALF_WIDTH_FRACTION = laneFraction(4); // 15m (4 lanes + median inside)
export const HIGHWAY_HALF_WIDTH_FRACTION = laneFraction(4); // 15m (4 lanes + shoulders inside)
/** Gravel: rural ~1.5-lane. */
export const GRAVEL_HALF_WIDTH_FRACTION = laneFraction(1.5);
/** Alley: single lane. */
export const ALLEY_HALF_WIDTH_FRACTION = laneFraction(1);
/** Four-Lane: 4 lanes, no median. */
export const FOUR_LANE_HALF_WIDTH_FRACTION = laneFraction(4);
/** Bus Lane: 4 lanes wide (the outer curbside lane each side is a painted bus lane). */
export const BUS_LANE_HALF_WIDTH_FRACTION = laneFraction(4);
/** Bike Lane: 3 lanes wide — two travel lanes plus a painted edge bike lane each side. */
export const BIKE_LANE_HALF_WIDTH_FRACTION = laneFraction(3);
/** Tram Track: a shared two-lane street with rails embedded down the centre. */
export const TRAM_HALF_WIDTH_FRACTION = laneFraction(2);
/** Rail Track: a dedicated single-track ballast corridor (~5.6m wide), no traffic lanes. */
export const RAIL_HALF_WIDTH_FRACTION = laneFraction(1.5);

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
/** Bus/Bike lanes reuse a mid asphalt base — the colored lane band is the differentiator, not the base shade. */
const TRANSIT_LANE_COLOR: readonly [number, number, number] = [0.5, 0.5, 0.51];
/** Tram rail: bright steel, distinctly lighter/metallic against asphalt (but below marking white). */
const TRAM_RAIL_COLOR: readonly [number, number, number] = [0.7, 0.71, 0.74];
/** Tram sleeper (cross-tie): dark creosote timber. */
const TRAM_SLEEPER_COLOR: readonly [number, number, number] = [0.26, 0.22, 0.19];
/** Track gauge (rail-to-rail); rails sit at ±half this from the centreline. */
const TRAM_GAUGE_HALF_M = 0.75;
/** Rail ribbon half-width + sleeper metrics. */
const TRAM_RAIL_HALF_W_M = 0.07;
const TRAM_SLEEPER_HALF_LEN_M = 1.15;
const TRAM_SLEEPER_HALF_W_M = 0.16;
const TRAM_SLEEPER_PERIOD_M = 1.6;
/** Sleepers sit on the road; rails ride a hair above the sleepers, both below the marking layer. */
const TRAM_SLEEPER_Y_OFFSET = ROAD_Y_OFFSET + 0.004;
const TRAM_RAIL_Y_OFFSET = ROAD_Y_OFFSET + 0.012;
/** Rail Track ballast bed: dark crushed-stone grey, distinct from asphalt tiers and gravel's tan. */
const RAIL_BALLAST_COLOR: readonly [number, number, number] = [0.34, 0.33, 0.31];
/** Painted bus-lane surface (terracotta red — the universal transit-lane tint). */
const BUS_LANE_PAINT_COLOR: readonly [number, number, number] = [0.6, 0.24, 0.18];
/** Painted bike-lane surface (deep green). */
const BIKE_LANE_PAINT_COLOR: readonly [number, number, number] = [0.13, 0.42, 0.22];
/** Bus-lane band = the full curbside lane; bike-lane band = a narrow edge strip. */
const BUS_LANE_BAND_WIDTH_M = LANE_WIDTH_M;
const BIKE_LANE_BAND_WIDTH_M = 1.6;
/** Colored lane fill sits above the asphalt plate but below the white lane paint, so markings/glyphs read on top. */
const LANE_TINT_Y_OFFSET = ROAD_Y_OFFSET + 0.003;

interface QuadSpec {
  halfWidthFraction: number;
  color: readonly [number, number, number];
  /** Raised sidewalk/shoulder curbs on unconnected sides (false: bare — no curb geometry at all). */
  hasCurbs: boolean;
  /** Whether this tier is painted at all: gates axis markings AND junction arm markings (false only for Gravel). */
  paved: boolean;
}

/** Carriageway half-width (meters) for a tier — the road-edge distance from the centerline, e.g. for placing curbside props. */
export function carriagewayHalfWidthMeters(tier: RoadTier): number {
  return TILE_METERS * tierSpec(tier).halfWidthFraction;
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
    case RoadTier.BusLane:
      return {
        halfWidthFraction: BUS_LANE_HALF_WIDTH_FRACTION,
        color: TRANSIT_LANE_COLOR,
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.BikeLane:
      return {
        halfWidthFraction: BIKE_LANE_HALF_WIDTH_FRACTION,
        color: TRANSIT_LANE_COLOR,
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.Tram:
      return {
        halfWidthFraction: TRAM_HALF_WIDTH_FRACTION,
        color: TRANSIT_LANE_COLOR,
        hasCurbs: true,
        paved: true,
      };
    case RoadTier.RailTrack:
      // Dedicated rail: ballast bed, no curbs/sidewalks, and unpaved so it gets
      // no lane markings or junction crosswalks — just the embedded rails.
      return {
        halfWidthFraction: RAIL_HALF_WIDTH_FRACTION,
        color: RAIL_BALLAST_COLOR,
        hasCurbs: false,
        paved: false,
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
    // Bike Lane shares the two-lane white marking set (single dashed
    // centerline); its green edge lanes are painted separately.
    case RoadTier.TwoLane:
    case RoadTier.BikeLane:
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
    // Bus Lane shares the four-lane white marking set (solid double center +
    // dashed lane dividers); the divider falls exactly at the bus-lane band's
    // inner edge, so it reads as the line separating the bus lane from traffic.
    case RoadTier.FourLane:
    case RoadTier.BusLane:
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
// Transit lane variants (Bus Lane / Bike Lane): a colored lane band painted on
// the carriageway (terracotta bus lane / green bike lane) plus a periodic white
// glyph — a transit diamond in each bus lane, a bicycle pictogram in each bike
// lane. Painted on STRAIGHT runs only (like medians/arrows); junctions and
// turns break the band, matching how real lane paint stops at crossings. The
// white lane markings themselves come from the reused emitAxisMarkings /
// emitCurvedMarkings cases (bus mirrors four-lane, bike mirrors two-lane).
// ---------------------------------------------------------------------------

/** Lane glyphs repeat every Nth straight tile by GLOBAL coordinate. */
export const LANE_GLYPH_PERIOD_TILES = 3;

/** True every LANE_GLYPH_PERIOD_TILES-th global tile coordinate, negative-safe. */
export function isLaneGlyphTile(coord: number): boolean {
  return (
    ((coord % LANE_GLYPH_PERIOD_TILES) + LANE_GLYPH_PERIOD_TILES) % LANE_GLYPH_PERIOD_TILES === 0
  );
}

/**
 * Pushes one flat triangle at yOffset, FORCING up-facing winding (CCW from +Y)
 * so the single-sided road material never culls it. Points are LOCAL [x, z]
 * offsets from the tile center.
 */
function pushGroundTri(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
  const tri = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
  for (const p of tri) {
    const wx = centerX + p[0];
    const wz = centerZ + p[1];
    pushVertex(positions, colors, wx, hAt(wx, wz) + yOffset, wz, color);
  }
}

/** A flat ring (annulus) centered at local (cx, cz) — a bike wheel viewed from above. */
function pushRing(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  cx: number,
  cz: number,
  rInner: number,
  rOuter: number,
  segments: number,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const iA: [number, number] = [cx + rInner * Math.cos(a0), cz + rInner * Math.sin(a0)];
    const oA: [number, number] = [cx + rOuter * Math.cos(a0), cz + rOuter * Math.sin(a0)];
    const iB: [number, number] = [cx + rInner * Math.cos(a1), cz + rInner * Math.sin(a1)];
    const oB: [number, number] = [cx + rOuter * Math.cos(a1), cz + rOuter * Math.sin(a1)];
    pushGroundTri(positions, colors, centerX, centerZ, iA, oA, iB, yOffset, color, hAt);
    pushGroundTri(positions, colors, centerX, centerZ, iB, oA, oB, yOffset, color, hAt);
  }
}

/** Bus-lane transit diamond (white filled), centered across `across`, oriented along travel. */
function emitTransitDiamond(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  across: number,
  hAt: (x: number, z: number) => number,
): void {
  const halfAlong = 0.9;
  const halfAcross = 0.5;
  const mp = (along: number, acr: number): [number, number] =>
    vertical ? [acr, along] : [along, acr];
  const fore = mp(halfAlong, across);
  const aft = mp(-halfAlong, across);
  const left = mp(0, across + halfAcross);
  const right = mp(0, across - halfAcross);
  pushGroundTri(
    positions,
    colors,
    centerX,
    centerZ,
    fore,
    left,
    aft,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
  pushGroundTri(
    positions,
    colors,
    centerX,
    centerZ,
    fore,
    aft,
    right,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
}

/** A flat rectangular bar between LOCAL points p0 and p1, half-thickness `ht`, at yOffset. */
function pushBar(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  p0: readonly [number, number],
  p1: readonly [number, number],
  ht: number,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const nx = (-dz / len) * ht;
  const nz = (dx / len) * ht;
  const a: [number, number] = [p0[0] + nx, p0[1] + nz];
  const bb: [number, number] = [p1[0] + nx, p1[1] + nz];
  const c: [number, number] = [p1[0] - nx, p1[1] - nz];
  const d: [number, number] = [p0[0] - nx, p0[1] - nz];
  pushGroundTri(positions, colors, centerX, centerZ, a, bb, c, yOffset, color, hAt);
  pushGroundTri(positions, colors, centerX, centerZ, a, c, d, yOffset, color, hAt);
}

/**
 * Bike-lane pictogram (white): a side-profile bicycle laid flat on the lane —
 * two wheel rings inline along travel plus a frame (down tube, seat tube, top
 * tube, fork) rising toward one side, with a seat + handlebar. This mirrors the
 * real-world bike-lane stencil (a side-view bike painted on the pavement),
 * which reads clearly from the overhead camera. `across` is the band centerline
 * offset; the frame rises toward the carriageway center so both edge lanes read
 * upright the same way.
 */
function emitBicycleGlyph(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  across: number,
  hAt: (x: number, z: number) => number,
): void {
  // up>0 lifts the frame toward the carriageway centerline (across shrinks
  // toward 0), so the silhouette stands upright regardless of which edge lane.
  const upSign = across >= 0 ? -1 : 1;
  const P = (along: number, up: number): [number, number] => {
    const acr = across + upSign * up;
    return vertical ? [acr, along] : [along, acr];
  };
  const wheelR = 0.42;
  const wheelThick = 0.1;
  const rearHub = P(-0.62, 0);
  const frontHub = P(0.62, 0);
  pushRing(
    positions,
    colors,
    centerX,
    centerZ,
    rearHub[0],
    rearHub[1],
    wheelR - wheelThick,
    wheelR,
    12,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
  pushRing(
    positions,
    colors,
    centerX,
    centerZ,
    frontHub[0],
    frontHub[1],
    wheelR - wheelThick,
    wheelR,
    12,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
  const crank = P(0, 0);
  const saddle = P(-0.3, 0.62);
  const handle = P(0.62, 0.62);
  const ht = 0.06;
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    rearHub,
    crank,
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  ); // chain stay
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    crank,
    saddle,
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  ); // seat tube
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    saddle,
    handle,
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  ); // top tube
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    handle,
    frontHub,
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  ); // fork
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    crank,
    handle,
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  ); // down tube
  // Seat + handlebar cross-caps.
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    P(-0.46, 0.62),
    P(-0.14, 0.62),
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
  pushBar(
    positions,
    colors,
    centerX,
    centerZ,
    P(0.46, 0.62),
    P(0.78, 0.62),
    ht,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
}

/**
 * Paints the colored transit-lane band(s) + periodic glyph for a Bus Lane or
 * Bike Lane straight run along one travel axis. A band hugs each carriageway
 * edge (bus: the full curbside lane, terracotta; bike: a narrow edge strip,
 * green) between along-offsets [lo, hi]; the glyph sits centered in each band,
 * repeating every LANE_GLYPH_PERIOD_TILES tiles by global coordinate.
 */
function emitColoredLaneBands(
  positions: number[],
  colors: number[],
  tier: RoadTier,
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  coreHalf: number,
  vertical: boolean,
  lo: number,
  hi: number,
  hAt: (x: number, z: number) => number,
): void {
  const isBus = tier === RoadTier.BusLane;
  const bandWidth = isBus ? BUS_LANE_BAND_WIDTH_M : BIKE_LANE_BAND_WIDTH_M;
  if (bandWidth <= 0 || coreHalf <= bandWidth * 0.5) return;
  const paint = isBus ? BUS_LANE_PAINT_COLOR : BIKE_LANE_PAINT_COLOR;
  const bandCenter = coreHalf - bandWidth / 2;

  const rect = (a0: number, a1: number, c0: number, c1: number): void => {
    if (vertical)
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        c0,
        c1,
        a0,
        a1,
        LANE_TINT_Y_OFFSET,
        paint,
        hAt,
      );
    else
      pushLocalRect(
        positions,
        colors,
        centerX,
        centerZ,
        a0,
        a1,
        c0,
        c1,
        LANE_TINT_Y_OFFSET,
        paint,
        hAt,
      );
  };

  const glyphHere = vertical ? isLaneGlyphTile(z) : isLaneGlyphTile(x);
  for (const side of [1, -1] as const) {
    const cInner = side * (coreHalf - bandWidth);
    const cOuter = side * coreHalf;
    rect(lo, hi, Math.min(cInner, cOuter), Math.max(cInner, cOuter));
    if (glyphHere) {
      const across = side * bandCenter;
      if (isBus) emitTransitDiamond(positions, colors, centerX, centerZ, vertical, across, hAt);
      else emitBicycleGlyph(positions, colors, centerX, centerZ, vertical, across, hAt);
    }
  }
}

/**
 * Embedded tram track for a straight Tram run along one travel axis: two steel
 * rails at ±TRAM_GAUGE_HALF_M down the tile centreline plus periodic cross-tie
 * sleepers under them. Sleeper phase is anchored at GLOBAL world-meter 0 (like
 * the dash pattern) so ties line up continuously across tile/chunk seams. Drawn
 * on straight runs only (junctions/turns break the track, matching R2's colored
 * bands); the Tram tier has no painted centerline — the rails ARE the centre.
 */
function emitTramTrack(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  lo: number,
  hi: number,
  hAt: (x: number, z: number) => number,
): void {
  // rect in (along, across) space -> world, mapping the perpendicular axis.
  const rect = (
    a0: number,
    a1: number,
    c0: number,
    c1: number,
    yOff: number,
    color: readonly [number, number, number],
  ): void => {
    if (vertical)
      pushLocalRect(positions, colors, centerX, centerZ, c0, c1, a0, a1, yOff, color, hAt);
    else pushLocalRect(positions, colors, centerX, centerZ, a0, a1, c0, c1, yOff, color, hAt);
  };

  // Sleepers first (below), spanning across both rails, at global-anchored phase.
  const originGlobal = vertical ? centerZ : centerX;
  const gLo = originGlobal + lo;
  const gHi = originGlobal + hi;
  for (
    let k = Math.ceil(gLo / TRAM_SLEEPER_PERIOD_M);
    k <= Math.floor(gHi / TRAM_SLEEPER_PERIOD_M);
    k++
  ) {
    const a = k * TRAM_SLEEPER_PERIOD_M - originGlobal;
    rect(
      a - TRAM_SLEEPER_HALF_W_M,
      a + TRAM_SLEEPER_HALF_W_M,
      -TRAM_SLEEPER_HALF_LEN_M,
      TRAM_SLEEPER_HALF_LEN_M,
      TRAM_SLEEPER_Y_OFFSET,
      TRAM_SLEEPER_COLOR,
    );
  }

  // Two continuous rails on top.
  for (const off of [TRAM_GAUGE_HALF_M, -TRAM_GAUGE_HALF_M]) {
    rect(
      lo,
      hi,
      off - TRAM_RAIL_HALF_W_M,
      off + TRAM_RAIL_HALF_W_M,
      TRAM_RAIL_Y_OFFSET,
      TRAM_RAIL_COLOR,
    );
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
// Dangling road end (popcount 1): a smooth half-CIRCLE turnaround cap. A
// dead-end must read as a proper rounded bulb wide enough for a car to U-turn
// across both lanes, so its half-disc is a TRUE semicircle of radius coreHalf —
// spanning the full carriageway width AND bulging outward the same coreHalf. On
// wide tiers that bulb rounds out past the tile edge into the open ground the
// dead-end faces (a cul-de-sac), rather than collapsing to a flat sliver. Drawn
// coplanar with the road (a hair above, no lip) so it reads as one fluid
// surface, with the curved cap curb (emitEndCapCurb) wrapping the sidewalk.
// ---------------------------------------------------------------------------

/** Cap asphalt sits a hair above the road so it renders over any seam without a visible lip (still below curb height). */
export const CAP_Y_OFFSET = ROAD_Y_OFFSET + 0.002;
/** Half-disc dead-end cap, subdivided into this many triangles (even, so the fan's vertex count stays a multiple of 6 — the file's "whole 18-float quad" invariant). A high count reads as a smooth half-circle, not a low-poly fan. */
export const END_CAP_SEGMENTS = 16;

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

/** Segments across a turn tile's 90° arc — smoothness of the curved road. */
export const TURN_ARC_SEGMENTS = 12;

/**
 * A curved 90° turn tile as a QUARTER-ANNULUS road, replacing the old square
 * "L" (core + arms + corner-fill) that read as a hard corner with a flat
 * triangle. The carriageway sweeps a constant-width arc from one edge opening
 * to the other around the tile CORNER shared by the two connected sides
 * (`pivot`): inner radius `armDepth`, outer radius `TILE_HALF + coreHalf`, so
 * the band is exactly `2*coreHalf` wide (the tier carriageway) throughout and
 * meets each opening at x/z ∈ [-coreHalf, coreHalf] — seamless with the
 * straight neighbor tiles. Sidewalks fill the rest of the tile to its edges
 * (an inner fan sector toward the pivot + an outer band clamped to the tile
 * boundary), so the whole tile is covered exactly like a straight tile
 * (road flanked by sidewalk), just curved.
 *
 * Parametrized by a unit direction v(θ) = cosθ·d1 + sinθ·d2 swept over 90°,
 * where d1/d2 are the two edge-opening directions from the pivot — correct for
 * all four corner orientations with no angle-wrap cases.
 */
function emitCurvedTurn(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  armDepth: number,
  sidewalkWidth: number,
  hasN: boolean,
  hasE: boolean,
  plateColor: readonly [number, number, number],
  hasCurbs: boolean,
  hAt: (x: number, z: number) => number,
): void {
  if (coreHalf <= 0 || armDepth <= 0) return;
  const pxSign = hasE ? 1 : -1; // pivot corner on the east (E connected) or west
  const pzSign = hasN ? -1 : 1; // pivot corner on the north (N connected) or south
  const pivotX = pxSign * TILE_HALF;
  const pivotZ = pzSign * TILE_HALF;
  const rIn = armDepth;
  const rOut = TILE_HALF + coreHalf;

  // Unit sweep direction from the pivot into the tile: d1 toward the N/S-edge
  // opening (along x), d2 toward the E/W-edge opening (along z).
  const dirX = (t: number): number => -pxSign * Math.cos(t);
  const dirZ = (t: number): number => -pzSign * Math.sin(t);
  const at = (r: number, t: number): [number, number] => [
    pivotX + r * dirX(t),
    pivotZ + r * dirZ(t),
  ];
  /** Distance from the pivot along v(θ) to the tile boundary (for the outer sidewalk clamp). */
  const boundary = (t: number): number => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const tx = c > 1e-6 ? (2 * TILE_HALF) / c : Infinity;
    const tz = s > 1e-6 ? (2 * TILE_HALF) / s : Infinity;
    return Math.min(tx, tz);
  };
  // Emits one triangle, FORCING it up-facing (CCW as seen from +Y, three's
  // FrontSide). Per pushQuad's convention an up-facing ground triangle has a
  // NEGATIVE (x,z) cross of its first two edges; flip the last two verts when
  // it comes out positive. Absolute (not just self-consistent) orientation is
  // essential — the road material is single-sided MeshBasicMaterial, so a
  // down-facing triangle is culled and the curved carriageway vanishes.
  const pushTriUp = (
    p0: readonly [number, number],
    p1: readonly [number, number],
    p2: readonly [number, number],
    y: number,
    color: readonly [number, number, number],
  ): void => {
    const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + y, wz, color);
    }
  };
  // Quad (a,b = inner,outer at one angle; c,d = inner,outer at the next),
  // split into two up-facing triangles.
  const pushQuad2 = (
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
    d: readonly [number, number],
    y: number,
    color: readonly [number, number, number],
  ): void => {
    pushTriUp(a, b, c, y, color);
    pushTriUp(c, b, d, y, color);
  };

  for (let i = 0; i < TURN_ARC_SEGMENTS; i++) {
    const t0 = (i / TURN_ARC_SEGMENTS) * (Math.PI / 2);
    const t1 = ((i + 1) / TURN_ARC_SEGMENTS) * (Math.PI / 2);
    // Carriageway band [rIn, rOut].
    pushQuad2(at(rIn, t0), at(rOut, t0), at(rIn, t1), at(rOut, t1), ROAD_Y_OFFSET, plateColor);
    if (hasCurbs) {
      // Fixed-width curb bands hugging both edges of the carriageway; the rest
      // of the tile (inside the inner band, outside the outer band up to the
      // edge) is grass verge. Inner band clamps at the pivot; outer band clamps
      // at the tile boundary.
      const innerLo = Math.max(0, rIn - sidewalkWidth);
      pushQuad2(
        at(innerLo, t0),
        at(rIn, t0),
        at(innerLo, t1),
        at(rIn, t1),
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
      );
      const outerHi0 = Math.min(rOut + sidewalkWidth, boundary(t0));
      const outerHi1 = Math.min(rOut + sidewalkWidth, boundary(t1));
      pushQuad2(
        at(rOut, t0),
        at(outerHi0, t0),
        at(rOut, t1),
        at(outerHi1, t1),
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
      );
    }
  }
}

/**
 * Curved lane markings for a TURN tile — the arc analog of emitAxisMarkings.
 * The curved carriageway (emitCurvedTurn) is a constant-width annulus centered
 * on the tile-corner pivot: inner radius `armDepth = TILE_HALF - coreHalf`,
 * outer `TILE_HALF + coreHalf`, so its centerline radius is exactly rMid =
 * TILE_HALF and its radial half-width is coreHalf. A straight-tile marking at
 * perpendicular offset `o` therefore maps to an arc at radius rMid + o. Each
 * marking line is a thin painted ribbon [r-PAINT, r+PAINT] swept over the 90°,
 * dashed (by arc length, same DASH metric as the straight arms) or solid.
 * Reuses emitCurvedTurn's pivot + at(r,θ) math so paint tracks the road, and
 * forces up-facing tris for the single-sided road material. Per-tier line set
 * mirrors emitAxisMarkings; gravel/alley draw nothing. Dash phase is anchored
 * at the arc start — a small offset from the straight arms at the junction,
 * fine on a curve. Medians never replace the avenue center pair on a turn.
 */
function emitCurvedMarkings(
  positions: number[],
  colors: number[],
  tier: RoadTier,
  centerX: number,
  centerZ: number,
  coreHalf: number,
  armDepth: number,
  hasN: boolean,
  hasE: boolean,
  hAt: (x: number, z: number) => number,
): void {
  if (coreHalf <= 0 || armDepth <= 0) return;
  const pxSign = hasE ? 1 : -1;
  const pzSign = hasN ? -1 : 1;
  const pivotX = pxSign * TILE_HALF;
  const pivotZ = pzSign * TILE_HALF;
  const rMid = (armDepth + TILE_HALF + coreHalf) / 2;
  if (rMid <= 0) return;
  const dirX = (t: number): number => -pxSign * Math.cos(t);
  const dirZ = (t: number): number => -pzSign * Math.sin(t);
  const at = (r: number, t: number): [number, number] => [
    pivotX + r * dirX(t),
    pivotZ + r * dirZ(t),
  ];
  const pushTriUp = (
    p0: readonly [number, number],
    p1: readonly [number, number],
    p2: readonly [number, number],
  ): void => {
    const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + MARK_Y_OFFSET, wz, MARKING_COLOR);
    }
  };
  const STEP_M = 0.6; // sub-segment length so each painted arc stays smooth
  /** One marking line at radial offset `o` from the centerline, solid or dashed. */
  const arcLine = (o: number, dashed: boolean): void => {
    const r = rMid + o;
    if (r <= PAINT_HALF_WIDTH_M) return;
    const rA = r - PAINT_HALF_WIDTH_M;
    const rB = r + PAINT_HALF_WIDTH_M;
    const arcLen = r * (Math.PI / 2);
    const segs = dashed ? dashSegments(0, arcLen) : [[0, arcLen] as [number, number]];
    for (const [s0, s1] of segs) {
      const steps = Math.max(1, Math.ceil((s1 - s0) / STEP_M));
      for (let k = 0; k < steps; k++) {
        const ta = (s0 + ((s1 - s0) * k) / steps) / r;
        const tb = (s0 + ((s1 - s0) * (k + 1)) / steps) / r;
        pushTriUp(at(rA, ta), at(rB, ta), at(rA, tb));
        pushTriUp(at(rA, tb), at(rB, ta), at(rB, tb));
      }
    }
  };

  switch (tier) {
    case RoadTier.TwoLane:
    case RoadTier.OneWay:
    case RoadTier.BikeLane:
      arcLine(0, true);
      break;
    case RoadTier.Avenue:
    case RoadTier.FourLane:
    case RoadTier.BusLane: {
      arcLine(CENTER_LINE_OFFSET, false);
      arcLine(-CENTER_LINE_OFFSET, false);
      const laneOffset = coreHalf * LANE_LINE_OFFSET_FRACTION;
      arcLine(laneOffset, true);
      arcLine(-laneOffset, true);
      break;
    }
    case RoadTier.Highway: {
      const edgeOffset = coreHalf - EDGE_LINE_MARGIN;
      arcLine(edgeOffset, false);
      arcLine(-edgeOffset, false);
      break;
    }
    default:
      break;
  }
}

/**
 * Dangling road-end cap (mask popcount 1): a half-disc fan centered on the
 * core plate's flat dead-end edge, bulging outward (away from the single
 * connection) by `radius`, rounding what would otherwise be a hard square
 * cut into a soft cul-de-sac-style cap.
 *
 * Unlike the turn-corner
 * fillet, `radius` here is the tier's own carriageway HALF-WIDTH (`coreHalf`
 * — the same value the core plate itself uses), NOT `TURN_RADIUS_FRACTION *
 * coreHalf`. A dead-end must read as a proper full-width rounded turnaround (a
 * car could U-turn across both lanes / the curb rounds off), so the cap is a
 * TRUE half-circle of radius `coreHalf` spanning the entire carriageway. For
 * wide tiers (avenue / highway / four-lane) that bulb is larger than the strip
 * of tile left beyond the carriageway, so it rounds out past the tile edge into
 * the open ground the dead-end faces — exactly like a real cul-de-sac, and the
 * same reason emitEndCapCurb lets its sidewalk wrap past the edge too.
 */
function emitEndCap(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  vertical: boolean,
  outwardSign: 1 | -1,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  // Full half-CIRCLE turnaround: bulge outward by the carriageway half-width
  // (coreHalf) so the end reads as a rounded cul-de-sac like the curved corners,
  // at every tier — wide carriageways round out past the tile edge.
  const alongDepth = coreHalf;
  if (coreHalf <= 0) return;
  const edgeAlong = outwardSign * coreHalf;
  const apex: [number, number] = vertical ? [0, edgeAlong] : [edgeAlong, 0];
  // Half-circle: cross radius and outward bulge both `coreHalf`, so the rounded
  // end is a true semicircle spanning the full carriageway width.
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= END_CAP_SEGMENTS; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / END_CAP_SEGMENTS;
    ring.push(endCapRingPoint(coreHalf, alongDepth, angle, edgeAlong, outwardSign, vertical));
  }
  pushFan(positions, colors, centerX, centerZ, apex, ring, CAP_Y_OFFSET, color, hAt);
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
 * A half-annulus curb/sidewalk ring hugging a dangling road-end cap's rounded
 * asphalt perimeter — the curb/sidewalk arcs around the cap at its own radius,
 * concentric with the half-circle bulb. Its inner radius is `coreHalf` (a
 * perfect seam with the asphalt fan's rim) and it extends outward one sidewalk
 * width; it meets the straight flank sidewalks at ±90° and wraps the tip past
 * the tile edge into the open ground the dead end faces — one continuous
 * half-circle wrap, never a flat cut. Additive over the plain straight curb
 * quads (never removing them — like the corner fillet, it layers over the curb
 * underneath). For wide tiers the whole ring rounds out past the tile edge with
 * the asphalt bulb it backs.
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
  // A curb/sidewalk half-annulus wrapping the round cap, concentric with the
  // bulb (center = the core's dead-end edge midpoint, radius = the cap's own
  // coreHalf). Its band width matches the tier's STRAIGHT edge treatment
  // (min(SIDEWALK_WIDTH_M, armDepth)) — a full sidewalk on narrow tiers, a thin
  // shoulder curb on wide arterials/highways — so the cap never sprouts a
  // sidewalk the straight run doesn't have. Meets the straight flank curbs at
  // ±90° and rounds the tip past the tile edge into the open ground.
  const capRadius = coreHalf;
  if (capRadius <= 0) return;
  const curbBand = Math.min(SIDEWALK_WIDTH_M, armDepth);
  if (curbBand <= 0) return;
  const pivotAlong = outwardSign * coreHalf; // bulb center along the road axis
  // Local [x, z] of a point `r` out from the bulb center at sweep angle `a`.
  const point = (r: number, a: number): [number, number] => {
    const along = pivotAlong + outwardSign * r * Math.cos(a);
    const cross = r * Math.sin(a);
    return vertical ? [cross, along] : [along, cross];
  };
  // Force each triangle up-facing (+Y normal): the single-sided road material
  // culls down-wound faces (the bug that made curved geometry vanish).
  const pushTriUp = (p0: [number, number], p1: [number, number], p2: [number, number]): void => {
    const cr = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cr > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + CURB_Y_OFFSET, wz, color);
    }
  };
  // A constant-width band — NOT clamped to the tile edge. A dead end's bulb
  // faces open ground (no road neighbor), so letting the wrap round the tip
  // past the tile boundary keeps the curb a smooth half-circle instead of a
  // flat cut where it would otherwise hit the edge.
  const rOut = capRadius + curbBand;
  for (let i = 0; i < END_CAP_SEGMENTS; i++) {
    const a0 = -Math.PI / 2 + (Math.PI * i) / END_CAP_SEGMENTS;
    const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / END_CAP_SEGMENTS;
    const innerA = point(capRadius, a0);
    const outerA = point(rOut, a0);
    const innerB = point(capRadius, a1);
    const outerB = point(rOut, a1);
    pushTriUp(innerA, outerA, innerB);
    pushTriUp(innerB, outerA, outerB);
  }
}

/**
 * Lane markings swept around a dead-end cap's half-circle — the cap analog of
 * emitCurvedMarkings. Each symmetric marking-line pair at cross-offset ±o on the
 * straight run becomes one arc of radius o about the cap's pivot (the core
 * dead-end edge midpoint), joining the two straight lines around the rounded
 * end. Highway's solid edge lines wrap the curb; avenue/four-lane wrap their
 * double-center + dashed lane lines; a single centerline (offset 0, two-lane /
 * one-way) has nothing to wrap; gravel/alley paint nothing. Forces up-facing
 * tris for the single-sided road material; dashes by arc length.
 */
function emitEndCapMarkings(
  positions: number[],
  colors: number[],
  tier: RoadTier,
  centerX: number,
  centerZ: number,
  coreHalf: number,
  vertical: boolean,
  outwardSign: 1 | -1,
  hAt: (x: number, z: number) => number,
): void {
  if (coreHalf <= 0) return;
  const pivotAlong = outwardSign * coreHalf;
  const point = (r: number, a: number): [number, number] => {
    const along = pivotAlong + outwardSign * r * Math.cos(a);
    const cross = r * Math.sin(a);
    return vertical ? [cross, along] : [along, cross];
  };
  const pushTriUp = (p0: [number, number], p1: [number, number], p2: [number, number]): void => {
    const cr = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cr > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + MARK_Y_OFFSET, wz, MARKING_COLOR);
    }
  };
  const STEP_M = 0.6;
  // One marking ribbon arc at radius r (a ±r straight pair joined around the
  // half-circle), solid or dashed by arc length.
  const arc = (r: number, dashed: boolean): void => {
    if (r <= PAINT_HALF_WIDTH_M) return;
    const rA = r - PAINT_HALF_WIDTH_M;
    const rB = r + PAINT_HALF_WIDTH_M;
    const arcLen = r * Math.PI; // full half-circle
    const segs = dashed ? dashSegments(0, arcLen) : [[0, arcLen] as [number, number]];
    for (const [s0, s1] of segs) {
      const steps = Math.max(1, Math.ceil((s1 - s0) / STEP_M));
      for (let k = 0; k < steps; k++) {
        const aa = -Math.PI / 2 + (s0 + ((s1 - s0) * k) / steps) / r;
        const ab = -Math.PI / 2 + (s0 + ((s1 - s0) * (k + 1)) / steps) / r;
        pushTriUp(point(rA, aa), point(rB, aa), point(rA, ab));
        pushTriUp(point(rA, ab), point(rB, aa), point(rB, ab));
      }
    }
  };
  switch (tier) {
    case RoadTier.Highway:
      arc(coreHalf - EDGE_LINE_MARGIN, false);
      break;
    case RoadTier.Avenue:
    case RoadTier.FourLane:
    case RoadTier.BusLane:
      arc(CENTER_LINE_OFFSET, false);
      arc(coreHalf * LANE_LINE_OFFSET_FRACTION, true);
      break;
    default:
      // TwoLane / OneWay / BikeLane: a single centerline at offset 0 — nothing
      // to wrap. Gravel / Alley: unpainted.
      break;
  }
}

/** How far back into the paved tile the paved→gravel transition band reaches. */
export const GRAVEL_SEAM_DEPTH_M = 2.6;

/**
 * Paved→dirt transition at the seam where a paved tile meets a GRAVEL
 * neighbor: a band along that connected edge that TAPERS from the paved
 * carriageway half-width down to the gravel's narrower half-width and blends
 * the paved grey into the dusty gravel tan (per-vertex color), so the two
 * roads flow together instead of meeting at a hard grey/tan step. Drawn a hair
 * above the carriageway. `edgeSign` (+1/-1) and `vertical` (N/S vs E/W) select
 * the edge; forced up-facing to survive the single-sided road material.
 */
function emitGravelSeam(
  positions: number[],
  colors: number[],
  tileX: number,
  tileZ: number,
  centerX: number,
  centerZ: number,
  coreHalf: number,
  gravelHalf: number,
  edgeSign: 1 | -1,
  vertical: boolean,
  plateColor: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const edge = edgeSign * TILE_HALF;
  const inner = edge - edgeSign * GRAVEL_SEAM_DEPTH_M;
  const y = ROAD_Y_OFFSET + 0.004; // above the carriageway plate, below curbs
  const tan = gravelColorAt(
    vertical ? tileX : tileX + edgeSign,
    vertical ? tileZ + edgeSign : tileZ,
  );
  const pt = (along: number, cross: number): [number, number] =>
    vertical ? [cross, along] : [along, cross];
  const innerL = pt(inner, -coreHalf);
  const innerR = pt(inner, coreHalf);
  const edgeL = pt(edge, -gravelHalf);
  const edgeR = pt(edge, gravelHalf);
  const pushTri = (
    a: readonly [number, number],
    ca: readonly [number, number, number],
    b: readonly [number, number],
    cb: readonly [number, number, number],
    c: readonly [number, number],
    cc: readonly [number, number, number],
  ): void => {
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const tri =
      cross > 0
        ? [
            [c, cc],
            [b, cb],
            [a, ca],
          ]
        : [
            [a, ca],
            [b, cb],
            [c, cc],
          ];
    for (const [p, col] of tri as Array<
      [readonly [number, number], readonly [number, number, number]]
    >) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + y, wz, col);
    }
  };
  // Trapezoid: inner edge (paved grey, full width) -> tile edge (gravel tan, narrow width).
  pushTri(innerL, plateColor, edgeL, tan, innerR, plateColor);
  pushTri(innerR, plateColor, edgeL, tan, edgeR, tan);
}

/** Segments across a junction corner's rounded curb-return arc. */
export const JUNCTION_CORNER_SEGMENTS = 8;

/**
 * A rounded curb-return at one corner of a JUNCTION, replacing the square
 * corner-fill. Concentric with the OUTER tile corner: a small grass nub in the
 * very corner, then a curved SIDEWALK band, then the carriageway filling in to
 * the arms. So the SMALL curve faces out toward the grass and the LONG curve
 * (the road edge) is on the inner/intersection side — streets meet with a
 * rounded sidewalk sweeping around the corner. (signX, signZ) select the
 * quadrant; radii measured from the tile corner inward toward the core.
 */
function emitRoundedCornerFill(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  armDepth: number,
  signX: 1 | -1,
  signZ: 1 | -1,
  plateColor: readonly [number, number, number],
  hasCurbs: boolean,
  hAt: (x: number, z: number) => number,
): void {
  if (armDepth <= 0) return;
  // A point `r` in from the tile corner at sweep angle `t` (toward the core).
  const at = (r: number, t: number): [number, number] => [
    signX * (TILE_HALF - r * Math.cos(t)),
    signZ * (TILE_HALF - r * Math.sin(t)),
  ];
  // Distance from the tile corner to the inner armpit edge (arm/core) at angle t.
  const boundary = (t: number): number => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return Math.min(c > 1e-6 ? armDepth / c : Infinity, s > 1e-6 ? armDepth / s : Infinity);
  };
  const pushTriUp = (
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    y: number,
    color: readonly [number, number, number],
  ): void => {
    const cr = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cr > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + y, wz, color);
    }
  };
  const band = (
    rIn: (t: number) => number,
    rOut: (t: number) => number,
    y: number,
    color: readonly [number, number, number],
  ): void => {
    for (let i = 0; i < JUNCTION_CORNER_SEGMENTS; i++) {
      const t0 = (i / JUNCTION_CORNER_SEGMENTS) * (Math.PI / 2);
      const t1 = ((i + 1) / JUNCTION_CORNER_SEGMENTS) * (Math.PI / 2);
      const iA = at(rIn(t0), t0);
      const oA = at(rOut(t0), t0);
      const iB = at(rIn(t1), t1);
      const oB = at(rOut(t1), t1);
      pushTriUp(iA, oA, iB, y, color);
      pushTriUp(iB, oA, oB, y, color);
    }
  };
  const sidewalk = Math.min(SIDEWALK_WIDTH_M, armDepth);
  // Grass nub in the very tile corner, then the sidewalk band, then the
  // carriageway. The nub is armDepth − sidewalk so the sidewalk band lands at
  // exactly [coreHalf, coreHalf + sidewalk] where it meets each tile edge —
  // i.e. flush with the straight sidewalks of the roads running into the
  // junction (seamless), not a few pixels off.
  const grassNub = hasCurbs ? Math.max(0, armDepth - sidewalk) : 0;
  const roadStart = hasCurbs ? grassNub + sidewalk : 0;
  // Carriageway: from roadStart out to the arm/core edge.
  band(
    () => roadStart,
    (t) => boundary(t),
    ROAD_Y_OFFSET,
    plateColor,
  );
  if (!hasCurbs) return;
  // Curved sidewalk curb-return band (small curve toward the grass corner, long curve inner).
  band(
    () => grassNub,
    () => grassNub + sidewalk,
    CURB_Y_OFFSET,
    SIDEWALK_COLOR,
  );
}

/** True for tiers whose ONLY straight-run marking is a single dashed centerline (emitAxisMarkings' `dashed(0)` case). */
export function isPlainCenterlineTier(tier: RoadTier): boolean {
  return tier === RoadTier.TwoLane || tier === RoadTier.OneWay;
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
/**
 * Per-side neighbor tiers (RoadTier.None when that side has no road neighbor).
 * Optional — omitted means "unknown / none", which reproduces the pre-neighbor
 * behavior exactly (every existing caller/test routes identically). Used only
 * for cross-tile seam treatment: a paved tile blends into an adjacent unpaved
 * (gravel) neighbor.
 */
export interface NeighborTiers {
  n: RoadTier;
  e: RoadTier;
  s: RoadTier;
  w: RoadTier;
}

const NO_NEIGHBORS: NeighborTiers = {
  n: RoadTier.None,
  e: RoadTier.None,
  s: RoadTier.None,
  w: RoadTier.None,
};

export function roadTileVertices(
  x: number,
  z: number,
  tier: RoadTier,
  mask: number,
  hAt: (x: number, z: number) => number,
  neighbors: NeighborTiers = NO_NEIGHBORS,
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

  const connections = (hasN ? 1 : 0) + (hasE ? 1 : 0) + (hasS ? 1 : 0) + (hasW ? 1 : 0);
  const isJunction = connections >= 3;
  const isTurn = connections === 2 && !isCollinearMask(mask);

  // A TURN tile (exactly 2 adjacent connections) is a curved quarter-annulus
  // road; every other shape (straight run, dead end, junction) is the
  // rectangular core + extensions + corner-fills + straight sidewalks below.
  if (isTurn) {
    emitCurvedTurn(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
      armDepth,
      Math.min(SIDEWALK_WIDTH_M, armDepth),
      hasN,
      hasE,
      plateColor,
      spec.hasCurbs,
      hAt,
    );
    // Curved lane markings around the turn, matching each tier's straight-run
    // set (two-lane dashed centerline, avenue/four-lane double-solid + dashed
    // lane lines, highway solid edge lines; gravel/alley none).
    emitCurvedMarkings(
      positions,
      colors,
      tier,
      centerX,
      centerZ,
      coreHalf,
      armDepth,
      hasN,
      hasE,
      hAt,
    );
  }

  if (!isTurn) {
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

    // Corner fills: only JUNCTIONS reach here (a TURN takes emitCurvedTurn
    // above). Each is a rounded curb-return — the carriageway turns the corner
    // with a tight radius and a curved sidewalk wraps it, grass beyond — so the
    // sidewalks flow together instead of a hard square paved corner.
    const cornerFill = (signX: 1 | -1, signZ: 1 | -1): void => {
      emitRoundedCornerFill(
        positions,
        colors,
        centerX,
        centerZ,
        armDepth,
        signX,
        signZ,
        plateColor,
        spec.hasCurbs,
        hAt,
      );
    };
    if (hasN && hasE) cornerFill(1, -1);
    if (hasS && hasE) cornerFill(1, 1);
    if (hasS && hasW) cornerFill(-1, 1);
    if (hasN && hasW) cornerFill(-1, -1);

    // Sidewalks/shoulders: a raised curb strip of fixed width SIDEWALK_WIDTH_M
    // (0.5× a lane) hugging the carriageway on every edge that does NOT border
    // another road tile; whatever the 16m tile has left beyond it is a grass
    // verge (not paved). On wide tiers (4-lane) the carriageway leaves less than
    // a full sidewalk, so the width clamps to the room available (`armDepth`).
    // Gravel/Alley (`hasCurbs: false`) get no curb geometry at all.
    if (spec.hasCurbs) {
      const curbWidth = Math.min(SIDEWALK_WIDTH_M, armDepth);
      // At a dead end the rounded cap fills the tile end; the straight sidewalk on
      // the BULB-FACING side (opposite the single connection) would lay a square
      // strip across the round cap, so it's suppressed — the curved cap curb
      // (emitEndCapCurb) wraps that side instead. The two flank sidewalks stay.
      const deadEnd = connections === 1;
      // At a dead end the flank sidewalks (the two sides parallel to the road)
      // stop at the bulb base (core edge) rather than running to the tile edge,
      // so they don't overhang past the rounded end — the curved cap curb wraps
      // that region instead. Clip the bulb-side extent (opposite the connection).
      const flankZLo = deadEnd && hasS ? -coreHalf : -TILE_HALF;
      const flankZHi = deadEnd && hasN ? coreHalf : TILE_HALF;
      const flankXLo = deadEnd && hasE ? -coreHalf : -TILE_HALF;
      const flankXHi = deadEnd && hasW ? coreHalf : TILE_HALF;
      if (!hasN && !(deadEnd && hasS)) {
        pushLocalRect(
          positions,
          colors,
          centerX,
          centerZ,
          flankXLo,
          flankXHi,
          -coreHalf - curbWidth,
          -coreHalf,
          CURB_Y_OFFSET,
          SIDEWALK_COLOR,
          hAt,
        );
      }
      if (!hasS && !(deadEnd && hasN)) {
        pushLocalRect(
          positions,
          colors,
          centerX,
          centerZ,
          flankXLo,
          flankXHi,
          coreHalf,
          coreHalf + curbWidth,
          CURB_Y_OFFSET,
          SIDEWALK_COLOR,
          hAt,
        );
      }
      if (!hasE && !(deadEnd && hasW)) {
        pushLocalRect(
          positions,
          colors,
          centerX,
          centerZ,
          coreHalf,
          coreHalf + curbWidth,
          flankZLo,
          flankZHi,
          CURB_Y_OFFSET,
          SIDEWALK_COLOR,
          hAt,
        );
      }
      if (!hasW && !(deadEnd && hasE)) {
        pushLocalRect(
          positions,
          colors,
          centerX,
          centerZ,
          -coreHalf - curbWidth,
          -coreHalf,
          flankZLo,
          flankZHi,
          CURB_Y_OFFSET,
          SIDEWALK_COLOR,
          hAt,
        );
      }
    }
  } // end !isTurn (straight/junction rectangular geometry)

  const medianEligible = isAvenueMedianEligible(tier, mask);
  const dividerEligible = isHighwayDividerEligible(tier, mask);
  const hasVertical = hasN || hasS;
  const hasHorizontal = hasE || hasW;

  // Paint: Gravel is unpaved (`paved: false`) and gets none of axis markings
  // / one-way arrows / junction arm markings — gravel junctions stay
  // unpainted. Every other tier (including Alley/One-Way/Four-Lane) is a paved
  // tier and gets the full marking behavior below.
  // Embedded steel track: Tram (rails in a paved shared street) and RailTrack
  // (rails on a dedicated unpaved ballast bed) both lay two rails + cross-tie
  // sleepers down the centre of a straight run. Emitted OUTSIDE the `spec.paved`
  // gate below so it also fires for RailTrack (paved: false); junctions/turns
  // break the track, matching the R2 colored bands.
  if ((tier === RoadTier.Tram || tier === RoadTier.RailTrack) && !isJunction && !isTurn) {
    if (hasVertical) {
      const zLo = hasN ? -TILE_HALF : -coreHalf;
      const zHi = hasS ? TILE_HALF : coreHalf;
      emitTramTrack(positions, colors, centerX, centerZ, true, zLo, zHi, hAt);
    }
    if (hasHorizontal) {
      const xLo = hasW ? -TILE_HALF : -coreHalf;
      const xHi = hasE ? TILE_HALF : coreHalf;
      emitTramTrack(positions, colors, centerX, centerZ, false, xLo, xHi, hAt);
    }
  }

  if (spec.paved) {
    // Lane markings: suppressed at junctions (mask popcount >= 3, per-arm
    // stop-lines + crosswalks instead) and at TURNS (the curved carriageway
    // carries no straight lane lines — they'd cut across the arc). Straight
    // runs and dead ends get their axis markings here.
    if (!isJunction && !isTurn) {
      if (hasVertical) {
        const zLo = hasN ? -TILE_HALF : -coreHalf;
        const zHi = hasS ? TILE_HALF : coreHalf;
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
        if (tier === RoadTier.BusLane || tier === RoadTier.BikeLane)
          emitColoredLaneBands(
            positions,
            colors,
            tier,
            x,
            z,
            centerX,
            centerZ,
            coreHalf,
            true,
            zLo,
            zHi,
            hAt,
          );
      }
      if (hasHorizontal) {
        const xLo = hasW ? -TILE_HALF : -coreHalf;
        const xHi = hasE ? TILE_HALF : coreHalf;
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
        if (tier === RoadTier.BusLane || tier === RoadTier.BikeLane)
          emitColoredLaneBands(
            positions,
            colors,
            tier,
            x,
            z,
            centerX,
            centerZ,
            coreHalf,
            false,
            xLo,
            xHi,
            hAt,
          );
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
    // Half-circle asphalt cap, then the curb ring last (tests rely on the curb
    // ring being the final quads emitted).
    emitEndCap(
      positions,
      colors,
      centerX,
      centerZ,
      coreHalf,
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
    // Lane markings wrap the rounded end too (e.g. highway edge lines follow the
    // curb around), so the paint doesn't stop dead at the cap base.
    if (spec.paved) {
      emitEndCapMarkings(
        positions,
        colors,
        tier,
        centerX,
        centerZ,
        coreHalf,
        vertical,
        outwardSign,
        hAt,
      );
    }
  }
  // Turn tiles are fully drawn by emitCurvedTurn (curved carriageway + curved
  // sidewalks) near the top of this function — no dead-end cap here.

  // Paved -> dirt transition: a tapered grey->tan band on any connected edge
  // whose neighbor is an unpaved gravel road, so the two flow together. Only
  // the paved side emits it (gravel has no seam logic), so it's never doubled.
  if (spec.paved) {
    const gravelHalf = TILE_METERS * GRAVEL_HALF_WIDTH_FRACTION;
    const seam = (edgeSign: 1 | -1, vertical: boolean): void =>
      emitGravelSeam(
        positions,
        colors,
        x,
        z,
        centerX,
        centerZ,
        coreHalf,
        gravelHalf,
        edgeSign,
        vertical,
        plateColor,
        hAt,
      );
    if (hasN && neighbors.n === RoadTier.Gravel) seam(-1, true);
    if (hasS && neighbors.s === RoadTier.Gravel) seam(1, true);
    if (hasE && neighbors.e === RoadTier.Gravel) seam(1, false);
    if (hasW && neighbors.w === RoadTier.Gravel) seam(-1, false);
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
  // Lit (Lambert) so the pavement receives cast shadows from cars, lamps and
  // buildings and shades with the sun; road faces are flat +Y, so daylight
  // reads nearly as uniform as the old unlit fill but now grounds its traffic.
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
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
   * Extra night dim toward ROAD_NIGHT_DIM, on top of the Lambert lighting's own
   * darkening. Scales material.color (a multiplier on lit vertex color), so it
   * deepens the pavement at night without touching per-tile colors, keeping the
   * additive lamp pools as the bright spots. At day (factor 0) it is 1 → the
   * road shows its full lit color.
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

  /** The road tier at tile (x,z) across all chunks, or None — for neighbor-aware seam treatment. */
  private tierAt(x: number, z: number): RoadTier {
    const chunk = this.chunks.get(chunkKeyOf(x, z));
    return chunk?.tiles.get(localTileKeyOf(x, z))?.tier ?? RoadTier.None;
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
      const neighbors: NeighborTiers = {
        n: this.tierAt(tile.x, tile.z - 1),
        e: this.tierAt(tile.x + 1, tile.z),
        s: this.tierAt(tile.x, tile.z + 1),
        w: this.tierAt(tile.x - 1, tile.z),
      };
      const vertices = roadTileVertices(
        tile.x,
        tile.z,
        tile.tier,
        tile.mask,
        this.heightAt,
        neighbors,
      );
      for (const n of vertices.positions) positions.push(n);
      for (const n of vertices.colors) colors.push(n);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Lambert needs normals; the road soup carries none. Flat +Y-ish per-face
    // normals are exactly right for the near-planar carriageway.
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true; // pavement takes cast shadows from cars/lamps/buildings
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
    trunkMesh.castShadow = true; // median foliage casts onto the road, like street trees
    canopyMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    canopyMesh.receiveShadow = true;

    this.scene.add(trunkMesh);
    this.scene.add(canopyMesh);
    this.treeTrunkMesh = trunkMesh;
    this.treeCanopyMesh = canopyMesh;
  }
}
