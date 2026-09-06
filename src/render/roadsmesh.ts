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
import { RoadFlow, RoadTileDelta, RoadTier } from '../shared/types';
import type { JunctionControl } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import {
  TILE_METERS,
  CHUNK_TILES,
  CHUNKS_PER_SIDE,
  MAP_SIZE,
  tileIndex,
} from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  carriagewayWidth,
  FOOTWAY_WIDTH_M,
  hasKerbs,
  isPaved,
  kerbWidthOf,
  PRESET_LANE_WIDTH_M,
  presetProfileForTier,
  rankForTier,
  roadClass,
} from '../shared/roadprofile';
import { armGivesWay } from '../shared/junction';
import { defaultLaneMovements, Movement } from '../shared/approach';
import type { MovementSet } from '../shared/approach';
import {
  centrePair,
  markingPlan,
  travelLanes,
  type MarkingLine,
  type MarkingPlan,
} from './roadmarkings';

/** The road plate rides this far above the terrain — anything standing ON a road must add it. */
export const ROAD_Y_OFFSET = 0.15;
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
export const LANE_WIDTH_M = PRESET_LANE_WIDTH_M;
export const SIDEWALK_WIDTH_M = FOOTWAY_WIDTH_M;
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
/**
 * Asphalt: one shade for every paved road, quiet street to motorway. It sits
 * clear of the mid-grey band (0.45..0.58) that reads as a physical concrete
 * median or divider, so plain carriageway never looks like a raised band.
 */
const ASPHALT_COLOR: readonly [number, number, number] = [0.42, 0.42, 0.43];
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
  return carriagewayHalfWidthOf(presetProfileForTier(tier));
}

/**
 * Width (meters) of the curb strip a tier actually draws outside its
 * carriageway — a full footway where the tile has room for one, clamped to
 * whatever is left over where it does not. A motorway or an avenue is 15m of
 * carriageway in a 16m tile, so it gets half a metre of curb, not a pavement:
 * its shoulders are inside the paved width already. Gravel, alley and rail draw
 * no curb at all.
 *
 * This is what anything standing beside a road must measure from — lamps,
 * signs, and the deck of a bridge. Assuming a full footway instead leaves a
 * motorway bridge two metres wider than its road on each side, with the lamps
 * marooned out in the middle of the empty strip.
 */
export function curbWidthMeters(tier: RoadTier): number {
  return kerbWidthOf(presetProfileForTier(tier));
}

/**
 * The shade a surface is: one asphalt for every paved road, the gravel tan
 * for a dirt track, ballast for a railway. What tells one paved road from
 * another is its width and its markings, not its colour.
 */
function surfaceColor(profile: RoadProfile): readonly [number, number, number] {
  switch (roadClass(profile.class).surface) {
    case 'gravel':
      return GRAVEL_BASE_COLOR;
    case 'ballast':
      return RAIL_BALLAST_COLOR;
    default:
      return ASPHALT_COLOR;
  }
}
/**
 * The geometry a road draws, read from its cross-section: the paved width
 * between the kerbs, whether it has kerbs at all, and whether its surface
 * takes paint. Rail is ballast and gravel is gravel, so neither is painted and
 * neither gets a crosswalk.
 *
 * The shade comes from the SURFACE, not the road: asphalt is asphalt, whether
 * it is a quiet street or a motorway. Tinting each road type a different grey
 * put a visible colour step at every place two of them met, and turned every
 * crossing into a patch of the winner's shade; what tells a motorway from a
 * side street is its width and its markings, which is what the cross-section
 * already carries.
 */
function quadSpecFor(_tier: RoadTier, profile: RoadProfile): QuadSpec {
  return {
    halfWidthFraction: carriagewayWidth(profile) / (2 * TILE_METERS),
    color: surfaceColor(profile),
    hasCurbs: hasKerbs(profile),
    paved: isPaved(profile),
  };
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
 * Break coordinates for terrain-conforming subdivision: `a`, `b`, and every
 * multiple of ROAD_QUAD_MAX_CELL_M strictly between them. Because the cell
 * size divides TILE_METERS evenly, the lattice includes every tile-corner
 * line, so (1) every emitter shares identical break lines — adjoining pieces
 * (plate / extensions / sidewalks / markings) can never T-crack on a slope —
 * and (2) sub-quads never straddle a terrain-cell boundary.
 */
function latticeBreaks(a: number, b: number): number[] {
  const out = [a];
  const first = Math.floor(a / ROAD_QUAD_MAX_CELL_M) * ROAD_QUAD_MAX_CELL_M;
  for (let v = first + ROAD_QUAD_MAX_CELL_M; v < b - 1e-6; v += ROAD_QUAD_MAX_CELL_M) {
    if (v > a + 1e-6) out.push(v);
  }
  out.push(b);
  return out;
}

/** One conforming sub-quad split on the terrain mesh's own (x0,z1)-(x1,z0) anti-diagonal, CCW from +Y. */
function pushConformingSubQuad(
  positions: number[],
  colors: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const y00 = hAt(x0, z0) + yOffset;
  const y10 = hAt(x1, z0) + yOffset;
  const y11 = hAt(x1, z1) + yOffset;
  const y01 = hAt(x0, z1) + yOffset;
  pushVertex(positions, colors, x0, y00, z0, color);
  pushVertex(positions, colors, x0, y01, z1, color);
  pushVertex(positions, colors, x1, y10, z0, color);
  pushVertex(positions, colors, x0, y01, z1, color);
  pushVertex(positions, colors, x1, y11, z1, color);
  pushVertex(positions, colors, x1, y10, z0, color);
}

/**
 * Terrain-conforming horizontal quad centered at (cx, cz). The terrain mesh is
 * piecewise-linear per tile, split on the (x0,z1)-(x1,z0) ANTI-diagonal, and
 * `hAt` interpolates that exact surface — so a ground quad conforms iff its
 * own triangulation matches: sub-quads on the tile-corner-aligned 2m lattice
 * (latticeBreaks), each split on the SAME anti-diagonal. The old version split
 * on the opposite diagonal, letting slopes bulge through wide plates or open
 * gaps beneath them. Flat spans (every lattice sample within epsilon) still
 * emit a single quad — on flat ground any diagonal is exact.
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
  const xs = latticeBreaks(x0, x1);
  const zs = latticeBreaks(z0, z1);

  // Flat gate over the FULL lattice (not just 5 samples — a bump between
  // sparse samples must not slip through): flat spans stay one quad.
  let lo = Infinity;
  let hi = -Infinity;
  for (const zz of zs) {
    for (const xx of xs) {
      const h = hAt(xx, zz);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (hi - lo <= ROAD_QUAD_FLAT_EPSILON_M) {
    pushConformingSubQuad(positions, colors, x0, z0, x1, z1, yOffset, color, hAt);
    return;
  }

  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      pushConformingSubQuad(
        positions,
        colors,
        xs[ix]!,
        zs[iz]!,
        xs[ix + 1]!,
        zs[iz + 1]!,
        yOffset,
        color,
        hAt,
      );
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

/**
 * Yellow: what separates traffic going opposite ways on a US road. White does
 * everything else — lane lines between traffic going the same way, and the
 * edge line that says where the running surface ends.
 */
const YELLOW_MARKING_COLOR: readonly [number, number, number] = [0.92, 0.76, 0.16];

/** The paint a planned line asks for. */
function paintOf(line: MarkingLine): readonly [number, number, number] {
  return line.color === 'yellow' ? YELLOW_MARKING_COLOR : MARKING_COLOR;
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
  paint: readonly [number, number, number] = MARKING_COLOR,
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
    paint,
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
  paint: readonly [number, number, number] = MARKING_COLOR,
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
    paint,
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
  paint: readonly [number, number, number] = MARKING_COLOR,
): void {
  if (vertical) pushVerticalLine(positions, colors, centerX, centerZ, offset, lo, hi, hAt, paint);
  else pushHorizontalLine(positions, colors, centerX, centerZ, offset, lo, hi, hAt, paint);
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
  paint: readonly [number, number, number] = MARKING_COLOR,
): void {
  const origin = vertical ? centerZ : centerX;
  for (const [segLo, segHi] of dashSegments(origin + lo, origin + hi)) {
    const localLo = segLo - origin;
    const localHi = segHi - origin;
    if (vertical)
      pushVerticalLine(positions, colors, centerX, centerZ, offset, localLo, localHi, hAt, paint);
    else
      pushHorizontalLine(positions, colors, centerX, centerZ, offset, localLo, localHi, hAt, paint);
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
/**
 * Paints a straight run's lines from its marking plan. The centre pair around
 * a raised median is left out where the median itself is drawn; every other
 * line is painted exactly where the cross-section puts it.
 */
function emitAxisMarkings(
  positions: number[],
  colors: number[],
  plan: MarkingPlan,
  centerX: number,
  centerZ: number,
  vertical: boolean,
  lo: number,
  hi: number,
  suppressCenterPair: boolean,
  hAt: (x: number, z: number) => number,
): void {
  const pair = suppressCenterPair ? centrePair(plan) : null;
  for (const line of plan.solid) {
    if (pair && (line === pair[0] || line === pair[1])) continue;
    const paint = paintOf(line);
    pushSolidLine(positions, colors, vertical, centerX, centerZ, line.at, lo, hi, hAt, paint);
  }
  for (const line of plan.dashed) {
    const paint = paintOf(line);
    pushDashedLine(positions, colors, vertical, centerX, centerZ, line.at, lo, hi, hAt, paint);
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
/** Half the length of a turn-lane arrow along the lane. */
const TURN_ARROW_HALF_LENGTH_M = 2.4;
/** How far the turn arrow's hook reaches across the lane before its head. */
const TURN_ARROW_HOOK_M = 1.4;

/**
 * Emits one two-way left-turn arrow inside a turn lane: a stem along the
 * travel axis, a hook bending across toward the side the driver turns, and a
 * head at the end of the hook. A turn lane carries one pointing each way,
 * because traffic enters it from both directions to turn across.
 *
 * `ahead` is +1 when the arrow points toward the high coordinate on the travel
 * axis, and `across` is +1 when the turn is toward the high coordinate on the
 * other axis — a driver heading one way turns across the opposing traffic, so
 * the two are the opposite of each other on the two arrows.
 */
function emitTurnArrow(
  positions: number[],
  colors: number[],
  vertical: boolean,
  centerX: number,
  centerZ: number,
  laneCentre: number,
  ahead: 1 | -1,
  across: 1 | -1,
  hAt: (x: number, z: number) => number,
): void {
  const stemHalf = ARROW_STEM_HALF_WIDTH_M;
  const stemFrom = -TURN_ARROW_HALF_LENGTH_M;
  const stemTo = TURN_ARROW_HALF_LENGTH_M - TURN_ARROW_HOOK_M;
  const hookTo = TURN_ARROW_HOOK_M;
  const rect = (alongLo: number, alongHi: number, acrossLo: number, acrossHi: number): void => {
    const a0 = ahead * alongLo;
    const a1 = ahead * alongHi;
    const c0 = laneCentre + across * acrossLo;
    const c1 = laneCentre + across * acrossHi;
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      vertical ? Math.min(c0, c1) : Math.min(a0, a1),
      vertical ? Math.max(c0, c1) : Math.max(a0, a1),
      vertical ? Math.min(a0, a1) : Math.min(c0, c1),
      vertical ? Math.max(a0, a1) : Math.max(c0, c1),
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );
  };
  // Stem along the lane, then the hook bending across, then the head.
  rect(stemFrom, stemTo, -stemHalf, stemHalf);
  rect(stemTo - stemHalf, stemTo + stemHalf, -stemHalf, hookTo - ARROW_HEAD_LENGTH_M);
  rect(
    stemTo - ARROW_HEAD_HALF_WIDTH_M,
    stemTo + ARROW_HEAD_HALF_WIDTH_M,
    hookTo - ARROW_HEAD_LENGTH_M,
    hookTo,
  );
}

/** How far in from the tile edge a lane-use arrow's centre sits. */
const LANE_ARROW_SETBACK_M = 4;
/** The four orthogonal steps, and the direction each one lies in. */
const APPROACH_DIRS: ReadonlyArray<readonly [number, number, RoadFlow]> = [
  [0, -1, RoadFlow.North],
  [1, 0, RoadFlow.East],
  [0, 1, RoadFlow.South],
  [-1, 0, RoadFlow.West],
];
const APPROACH_STEPS: ReadonlyArray<readonly [number, number]> = APPROACH_DIRS.map(([dx, dz]) => [
  dx,
  dz,
]);
/** How far back from the head a turning hook leaves the stem. */
const LANE_ARROW_HOOK_DROP_M = 0.9;
/** How far across the lane a turning hook reaches before its own head. */
const LANE_ARROW_HOOK_REACH_M = 1.3;

/**
 * A LANE-USE arrow: what one lane of an approach is allowed to do, painted
 * from its movement set and nothing else. A lane that runs through gets a
 * stem and a head; every turn it offers gets a hook branching off the stem
 * toward that side with a head of its own. A lane with a movement taken away
 * therefore looks restricted, because the arrow that would have said so is
 * simply not painted.
 *
 * `ahead` is +1 when the traffic in this lane travels toward the high
 * coordinate on the axis. Left and right are read from that: facing along +Z
 * — south, since z grows southward — a driver's left hand points at +X.
 */
function emitLaneUseArrow(
  positions: number[],
  colors: number[],
  vertical: boolean,
  centerX: number,
  centerZ: number,
  laneCentre: number,
  ahead: 1 | -1,
  movements: MovementSet,
  hAt: (x: number, z: number) => number,
): void {
  const stemHalf = ARROW_STEM_HALF_WIDTH_M;
  const tip = ARROW_HALF_LENGTH_M;
  const headBase = tip - ARROW_HEAD_LENGTH_M;
  const tail = -ARROW_HALF_LENGTH_M;
  const hookAlong = headBase - LANE_ARROW_HOOK_DROP_M;
  const leftSign = vertical ? ahead : -ahead;

  /** A rectangle in lane-local coordinates: along the lane, and across it. */
  const rect = (alongLo: number, alongHi: number, acrossLo: number, acrossHi: number): void => {
    const a0 = ahead * alongLo;
    const a1 = ahead * alongHi;
    const c0 = laneCentre + acrossLo;
    const c1 = laneCentre + acrossHi;
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      vertical ? Math.min(c0, c1) : Math.min(a0, a1),
      vertical ? Math.max(c0, c1) : Math.max(a0, a1),
      vertical ? Math.min(a0, a1) : Math.min(c0, c1),
      vertical ? Math.max(a0, a1) : Math.max(c0, c1),
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );
  };

  /** A point in lane-local coordinates, as the local [x, z] the tile emits in. */
  const at = (along: number, across: number): [number, number] => {
    const a = ahead * along;
    const c = laneCentre + across;
    return vertical ? [c, a] : [a, c];
  };
  /** A solid arrowhead. Rectangles cannot make one, and a bar does not read as an arrow. */
  const head = (
    baseA: readonly [number, number],
    baseB: readonly [number, number],
    apex: readonly [number, number],
  ): void =>
    pushGroundTri(
      positions,
      colors,
      centerX,
      centerZ,
      baseA,
      baseB,
      apex,
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );

  const through = (movements & Movement.Through) !== 0;
  // The stem runs to the head when the lane goes through, and only as far as
  // the hooks when it does not — a turn-only lane has no shaft past them.
  rect(tail, through ? headBase : hookAlong + stemHalf, -stemHalf, stemHalf);
  if (through) {
    head(
      at(headBase, -ARROW_HEAD_HALF_WIDTH_M),
      at(headBase, ARROW_HEAD_HALF_WIDTH_M),
      at(tip, 0),
    );
  }
  for (const [bit, sign] of [
    [Movement.Left, leftSign],
    [Movement.Right, -leftSign],
  ] as const) {
    if ((movements & bit) === 0) continue;
    const outer = sign * LANE_ARROW_HOOK_REACH_M;
    const neck = sign * (LANE_ARROW_HOOK_REACH_M - ARROW_HEAD_LENGTH_M);
    rect(hookAlong - stemHalf, hookAlong + stemHalf, Math.min(0, neck), Math.max(0, neck));
    head(
      at(hookAlong - ARROW_HEAD_HALF_WIDTH_M, neck),
      at(hookAlong + ARROW_HEAD_HALF_WIDTH_M, neck),
      at(hookAlong, outer),
    );
  }
}

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
  /** Point the other way: toward the low coordinate on the travel axis. */
  reversed: boolean,
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
  for (const [rawLo, rawHi, acrossLo, acrossHi] of rects) {
    // Reversing mirrors the arrow along its travel axis, so the same three
    // rectangles point the other way.
    const alongLo = reversed ? -rawHi : rawLo;
    const alongHi = reversed ? -rawLo : rawHi;
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
/** Parking bays are ticked off every this many metres along the kerb. */
export const PARKING_BAY_PITCH_M = 6;
const PARKING_TICK_HALF_LENGTH_M = 0.075;

/**
 * Fills and ticks every reserved or parking lane in the plan: a terracotta
 * band with a diamond for a bus lane, a green band with a bicycle for a bike
 * lane, and for a parking lane a solid line along its inner edge with a tick
 * across it at every bay — the bays are pitched by GLOBAL coordinate so they
 * run continuously across tile seams.
 */
function emitColoredLaneBands(
  positions: number[],
  colors: number[],
  plan: MarkingPlan,
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  vertical: boolean,
  lo: number,
  hi: number,
  hAt: (x: number, z: number) => number,
): void {
  const rect = (
    a0: number,
    a1: number,
    c0: number,
    c1: number,
    color: readonly [number, number, number],
    y: number,
  ): void => {
    if (vertical) pushLocalRect(positions, colors, centerX, centerZ, c0, c1, a0, a1, y, color, hAt);
    else pushLocalRect(positions, colors, centerX, centerZ, a0, a1, c0, c1, y, color, hAt);
  };

  const glyphHere = vertical ? isLaneGlyphTile(z) : isLaneGlyphTile(x);
  const origin = vertical ? centerZ : centerX;
  for (const band of plan.bands) {
    const across = (band.from + band.to) / 2;
    if (band.kind === 'parking') {
      // The line between the parking lane and the moving lane is the edge
      // nearer the centre; the ticks cross the lane from it to the kerb.
      const inner = Math.abs(band.from) < Math.abs(band.to) ? band.from : band.to;
      pushSolidLine(positions, colors, vertical, centerX, centerZ, inner, lo, hi, hAt);
      const first = Math.ceil((origin + lo) / PARKING_BAY_PITCH_M) * PARKING_BAY_PITCH_M;
      for (let w = first; w <= origin + hi; w += PARKING_BAY_PITCH_M) {
        const along = w - origin;
        rect(
          along - PARKING_TICK_HALF_LENGTH_M,
          along + PARKING_TICK_HALF_LENGTH_M,
          band.from,
          band.to,
          MARKING_COLOR,
          MARK_Y_OFFSET,
        );
      }
      continue;
    }
    const paint = band.kind === 'bus' ? BUS_LANE_PAINT_COLOR : BIKE_LANE_PAINT_COLOR;
    rect(lo, hi, band.from, band.to, paint, LANE_TINT_Y_OFFSET);
    if (glyphHere) {
      if (band.kind === 'bus')
        emitTransitDiamond(positions, colors, centerX, centerZ, vertical, across, hAt);
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
/**
 * Gap between the crossing's far edge and the stop bar. The US rule is that a
 * stop line stands at least 4 ft in advance of the nearest crosswalk line.
 */
const STOP_LINE_GAP_M = 1.2;
/** How far inside the tile edge the crosswalk's outer bar starts. */
const CROSSWALK_EDGE_SETBACK_M = 0.4;

export interface JunctionArmLayout {
  /** Distance from the tile edge to the crosswalk's outer bar. */
  crosswalkStart: number;
  crosswalkEnd: number;
  stopLineStart: number;
  stopLineEnd: number;
}

/**
 * Pure layout for one junction arm, measured INWARD from the tile's outer
 * edge: the crosswalk first, then the gap, then the stop line a driver halts
 * behind. The measurements are the real ones and never shrink — squeezing
 * them into whatever depth was left between the box and the tile edge is what
 * turned a wide road's crossing into a dashed ring hugging the box instead of
 * a crosswalk. On a road wide enough that its carriageway fills the tile the
 * crosswalk simply lies inside the junction, which is where it lies on the
 * ground too.
 */
export function junctionArmLayout(_armDepth?: number): JunctionArmLayout {
  const crosswalkStart = CROSSWALK_EDGE_SETBACK_M;
  const crosswalkEnd = crosswalkStart + CROSSWALK_BAR_LENGTH_M;
  const stopLineStart = crosswalkEnd + STOP_LINE_GAP_M;
  const stopLineEnd = stopLineStart + STOP_LINE_THICKNESS_M;
  return { crosswalkStart, crosswalkEnd, stopLineStart, stopLineEnd };
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
  dAt: (d: number) => number,
  hAt: (x: number, z: number) => number,
  /** Whether the road has footways: no footway, no crossing to paint. */
  hasFootways: boolean,
  /**
   * Whether this approach actually has to stop. A stop line marks where to
   * stop for a sign or a signal; an approach that only gives way, or one at a
   * junction nothing controls, is not painted one.
   */
  stops: boolean,
): void {
  const layout = junctionArmLayout();

  // Stop line: one bar spanning the full carriageway width.
  if (stops) {
    const stopLo = Math.min(dAt(layout.stopLineStart), dAt(layout.stopLineEnd));
    const stopHi = Math.max(dAt(layout.stopLineStart), dAt(layout.stopLineEnd));
    const across: [number, number] = [-coreHalf, coreHalf];
    const along: [number, number] = [stopLo, stopHi];
    const [xLo, xHi] = vertical ? across : along;
    const [zLo, zHi] = vertical ? along : across;
    pushLocalRect(
      positions,
      colors,
      centerX,
      centerZ,
      xLo,
      xHi,
      zLo,
      zHi,
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );
  }

  // Zebra crosswalk: bars spaced across the carriageway, each spanning
  // [crosswalkStart, crosswalkEnd] along the travel axis. A road with no
  // footway has nobody to cross, so it paints none.
  if (!hasFootways) return;
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
  // One triangle in local [x,z] space, per-vertex terrain-sampled, forced
  // up-facing (CCW from +Y) via the 2D cross — matches pushTriUp's rule.
  const pushTri = (
    p0: readonly [number, number],
    p1: readonly [number, number],
    p2: readonly [number, number],
  ): void => {
    const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + yOffset, wz, color);
    }
  };
  const lerp = (
    a: readonly [number, number],
    b: readonly [number, number],
    t: number,
  ): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const hOf = (p: readonly [number, number]): number => hAt(centerX + p[0], centerZ + p[1]);

  // Flat gate: on flat ground a plain apex fan is exact — subdivide only when
  // the terrain under the fan (apex, rim, and mid-spoke samples) varies.
  let lo = hOf(apex);
  let hi = lo;
  for (const p of ring) {
    for (const t of [0.5, 1]) {
      const h = hOf(lerp(apex, p, t));
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  const flat = hi - lo <= ROAD_QUAD_FLAT_EPSILON_M;

  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    if (flat) {
      pushTri(apex, a, b);
      continue;
    }
    // A whole apex-to-rim triangle spans the carriageway half-width (up to
    // 7.5m) with only 3 terrain samples — on a slope the interior cuts under
    // or floats above the ground. Subdivide RADIALLY into ~2m rings so every
    // strip is sampled densely enough to hug the terrain surface.
    const spokeLen = Math.max(
      Math.hypot(a[0] - apex[0], a[1] - apex[1]),
      Math.hypot(b[0] - apex[0], b[1] - apex[1]),
    );
    const rings = Math.max(1, Math.ceil(spokeLen / ROAD_QUAD_MAX_CELL_M));
    let prevA: readonly [number, number] = apex;
    let prevB: readonly [number, number] = apex;
    for (let k = 1; k <= rings; k++) {
      const t = k / rings;
      const curA = lerp(apex, a, t);
      const curB = lerp(apex, b, t);
      if (k === 1) {
        pushTri(apex, curA, curB); // innermost tip triangle
      } else {
        pushTri(prevA, curA, prevB);
        pushTri(prevB, curA, curB);
      }
      prevA = curA;
      prevB = curB;
    }
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
  // subdivided RADIALLY into ~2m strips (a single quad across a 7.5-15m
  // carriageway has only 4 terrain samples — slopes bulge through or open
  // gaps beneath it), each strip split into two up-facing triangles with
  // per-vertex terrain sampling.
  const pushQuad2 = (
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
    d: readonly [number, number],
    y: number,
    color: readonly [number, number, number],
  ): void => {
    const span = Math.max(
      Math.hypot(b[0] - a[0], b[1] - a[1]),
      Math.hypot(d[0] - c[0], d[1] - c[1]),
    );
    const steps = Math.max(1, Math.ceil(span / ROAD_QUAD_MAX_CELL_M));
    const lerp = (
      p: readonly [number, number],
      q: readonly [number, number],
      t: number,
    ): [number, number] => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    // Flat gate over the would-be subdivision samples: on flat ground one
    // quad is exact, so subdivide only when the terrain actually varies.
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      for (const p of [lerp(a, b, t), lerp(c, d, t)]) {
        const h = hAt(centerX + p[0], centerZ + p[1]);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (hi - lo <= ROAD_QUAD_FLAT_EPSILON_M) {
      pushTriUp(a, b, c, y, color);
      pushTriUp(c, b, d, y, color);
      return;
    }
    for (let k = 0; k < steps; k++) {
      const t0r = k / steps;
      const t1r = (k + 1) / steps;
      const a0 = lerp(a, b, t0r);
      const b0 = lerp(a, b, t1r);
      const c0 = lerp(c, d, t0r);
      const d0 = lerp(c, d, t1r);
      pushTriUp(a0, b0, c0, y, color);
      pushTriUp(c0, b0, d0, y, color);
    }
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
  plan: MarkingPlan,
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
    paint: readonly [number, number, number] = MARKING_COLOR,
  ): void => {
    const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + MARK_Y_OFFSET, wz, paint);
    }
  };
  const STEP_M = 0.6; // sub-segment length so each painted arc stays smooth
  /** One marking line at radial offset `o` from the centerline, solid or dashed. */
  const arcLine = (line: MarkingLine, dashed: boolean): void => {
    const o = line.at;
    const paint = paintOf(line);
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
        pushTriUp(at(rA, ta), at(rB, ta), at(rA, tb), paint);
        pushTriUp(at(rA, tb), at(rB, ta), at(rB, tb), paint);
      }
    }
  };

  // The plan's offsets are signed across the carriageway; on a curve the
  // "across" direction is radial, so a positive offset is a larger radius.
  for (const line of plan.solid) arcLine(line, false);
  for (const line of plan.dashed) arcLine(line, true);
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
  plan: MarkingPlan,
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
  const pushTriUp = (
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    paint: readonly [number, number, number] = MARKING_COLOR,
  ): void => {
    const cr = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const tri = cr > 0 ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of tri) {
      const wx = centerX + p[0];
      const wz = centerZ + p[1];
      pushVertex(positions, colors, wx, hAt(wx, wz) + MARK_Y_OFFSET, wz, paint);
    }
  };
  const STEP_M = 0.6;
  // One marking ribbon arc at radius r (a ±r straight pair joined around the
  // half-circle), solid or dashed by arc length.
  const arc = (
    r: number,
    dashed: boolean,
    paint: readonly [number, number, number] = MARKING_COLOR,
  ): void => {
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
        pushTriUp(point(rA, aa), point(rB, aa), point(rA, ab), paint);
        pushTriUp(point(rA, ab), point(rB, aa), point(rB, ab), paint);
      }
    }
  };
  // Each line wraps the cap once at its own radius; the pair of a double
  // centre and the two sides of a lane line meet as one ribbon around the
  // half-circle, so each distinct positive offset is drawn once. A line at the
  // centre has no radius to wrap.
  const seen = new Set<number>();
  const wrap = (lines: readonly MarkingLine[], dashed: boolean): void => {
    for (const line of lines) {
      const r = Math.abs(line.at);
      const key = Math.round(r * 1e6);
      if (r <= PAINT_HALF_WIDTH_M || seen.has(key)) continue;
      seen.add(key);
      arc(r, dashed, paintOf(line));
    }
  };
  wrap(plan.solid, false);
  wrap(plan.dashed, true);
}

/**
 * One up-facing triangle at a fixed height above the terrain, given LOCAL
 * (metres from the tile centre) corners in any order; the winding is fixed so
 * the single-sided road material shows it.
 */
function pushFlatTri(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  yOffset: number,
  color: readonly [number, number, number],
  hAt: (x: number, z: number) => number,
): void {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(cross) < 1e-9) return;
  const order = cross > 0 ? [c, b, a] : [a, b, c];
  for (const p of order) {
    const wx = centerX + p[0];
    const wz = centerZ + p[1];
    pushVertex(positions, colors, wx, hAt(wx, wz) + yOffset, wz, color);
  }
}

/**
 * Width transition where a straight kerbed tile meets a NARROWER paved
 * neighbour: on each flank a wedge of footway, at kerb height, runs from this
 * tile's carriageway edge at `depth` metres back to the neighbour's edge at
 * the shared tile boundary, so the kerb line bends in over the run instead of
 * stepping at the seam. The asphalt beneath keeps its full width; the wedge
 * simply covers what the narrower road does not use. Sliced along the run on
 * the shared lattice so it follows the terrain like every other plate.
 */
function emitWidthSeam(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  coreHalf: number,
  neighbourHalf: number,
  edgeSign: 1 | -1,
  vertical: boolean,
  depth: number,
  hAt: (x: number, z: number) => number,
): void {
  const edge = edgeSign * TILE_HALF;
  const inner = edge - edgeSign * depth;
  const pt = (along: number, cross: number): [number, number] =>
    vertical ? [cross, along] : [along, cross];
  // The carriageway edge this wedge covers down to, at a given distance along.
  const insideAt = (along: number): number => {
    const t = 1 - Math.abs(edge - along) / depth;
    return coreHalf - (coreHalf - neighbourHalf) * t;
  };
  const centreAlong = vertical ? centerZ : centerX;
  const breaks = latticeBreaks(
    centreAlong + Math.min(inner, edge),
    centreAlong + Math.max(inner, edge),
  );
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < breaks.length - 1; k++) {
      const a0 = breaks[k]! - centreAlong;
      const a1 = breaks[k + 1]! - centreAlong;
      const outer0 = pt(a0, side * coreHalf);
      const outer1 = pt(a1, side * coreHalf);
      const inner0 = pt(a0, side * insideAt(a0));
      const inner1 = pt(a1, side * insideAt(a1));
      pushFlatTri(
        positions,
        colors,
        centerX,
        centerZ,
        outer0,
        outer1,
        inner1,
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
        hAt,
      );
      pushFlatTri(
        positions,
        colors,
        centerX,
        centerZ,
        outer0,
        inner1,
        inner0,
        CURB_Y_OFFSET,
        SIDEWALK_COLOR,
        hAt,
      );
    }
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
  // Trapezoid: inner edge (paved grey, full width) -> tile edge (gravel tan,
  // narrow width). Subdivided cross-wise into ~2m slices — two triangles over
  // a whole (up to 15m wide) trapezoid sample the terrain at only 4 points, so
  // slopes bulge through it (same defect as the untessellated plates).
  const lerp2 = (
    p: readonly [number, number],
    q: readonly [number, number],
    t: number,
  ): [number, number] => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const slices = Math.max(
    1,
    Math.ceil((2 * Math.max(coreHalf, gravelHalf)) / ROAD_QUAD_MAX_CELL_M),
  );
  // Flat gate over the would-be slice samples: on flat ground the plain
  // 2-triangle trapezoid is exact.
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k <= slices; k++) {
    const t = k / slices;
    for (const p of [lerp2(innerL, innerR, t), lerp2(edgeL, edgeR, t)]) {
      const h = hAt(centerX + p[0], centerZ + p[1]);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  const effectiveSlices = hi - lo <= ROAD_QUAD_FLAT_EPSILON_M ? 1 : slices;
  for (let k = 0; k < effectiveSlices; k++) {
    const t0 = k / effectiveSlices;
    const t1 = (k + 1) / effectiveSlices;
    const i0 = lerp2(innerL, innerR, t0);
    const i1 = lerp2(innerL, innerR, t1);
    const e0 = lerp2(edgeL, edgeR, t0);
    const e1 = lerp2(edgeL, edgeR, t1);
    pushTri(i0, plateColor, e0, tan, i1, plateColor);
    pushTri(i1, plateColor, e0, tan, e1, tan);
  }
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
      // Radial ~2m substeps: one quad across the whole band (up to armDepth
      // wide) samples terrain at only 4 corners and clips on slopes. On flat
      // ground (sampled over the same substeps) one quad is exact — keep it.
      const span = Math.max(rOut(t0) - rIn(t0), rOut(t1) - rIn(t1));
      const steps = Math.max(1, Math.ceil(span / ROAD_QUAD_MAX_CELL_M));
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        for (const t of [t0, t1]) {
          const p = at(rIn(t) + f * (rOut(t) - rIn(t)), t);
          const h = hAt(centerX + p[0], centerZ + p[1]);
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      const effectiveSteps = hi - lo <= ROAD_QUAD_FLAT_EPSILON_M ? 1 : steps;
      for (let k = 0; k < effectiveSteps; k++) {
        const f0 = k / effectiveSteps;
        const f1 = (k + 1) / effectiveSteps;
        const iA = at(rIn(t0) + f0 * (rOut(t0) - rIn(t0)), t0);
        const oA = at(rIn(t0) + f1 * (rOut(t0) - rIn(t0)), t0);
        const iB = at(rIn(t1) + f0 * (rOut(t1) - rIn(t1)), t1);
        const oB = at(rIn(t1) + f1 * (rOut(t1) - rIn(t1)), t1);
        pushTriUp(iA, oA, iB, y, color);
        pushTriUp(iB, oA, oB, y, color);
      }
    }
  };
  const sidewalk = Math.min(SIDEWALK_WIDTH_M, armDepth);
  // Grass nub in the very tile corner, then the sidewalk band, then the
  // carriageway. The nub is armDepth − sidewalk so the sidewalk band lands at
  // exactly [coreHalf, coreHalf + sidewalk] where it meets each tile edge —
  // i.e. flush with the straight sidewalks of the roads running into the
  // junction (seamless), not a few pixels off.
  const grassNub = hasCurbs ? Math.max(0, armDepth - sidewalk) : 0;
  // The carriageway sweeps round the corner at the same radius either way. A
  // road with no footway simply has grass where the footway would be, rather
  // than asphalt filling the corner square — which is what made a junction of
  // two kerbless roads read as a box rather than a junction.
  const roadStart = hasCurbs ? grassNub + sidewalk : armDepth;
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
  return tier === RoadTier.Avenue && isStraightRunMask(mask);
}

/** Straight (non-corner, non-junction) highway run eligible for the divider barrier — see isAvenueMedianEligible for the popcount >= 1 rationale. */
export function isHighwayDividerEligible(tier: RoadTier, mask: number): boolean {
  return tier === RoadTier.Highway && isStraightRunMask(mask);
}

/** A connected, straight, non-junction tile: one or two collinear arms. */
function isStraightRunMask(mask: number): boolean {
  const popcount =
    (mask & NORTH ? 1 : 0) + (mask & EAST ? 1 : 0) + (mask & SOUTH ? 1 : 0) + (mask & WEST ? 1 : 0);
  return popcount >= 1 && popcount <= 2 && isCollinearMask(mask);
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

// --- Mini roundabout ---------------------------------------------------------
// One tile is 16 m, which by inscribed-circle diameter is a MINI roundabout —
// the real range is 13 to 25 m. A mini's central island is small and ringed by
// a paved APRON that a long vehicle tracks over rather than a kerb it would
// ground out on, which is exactly the shape that fits a tile. A bigger
// roundabout is a 2x2 block and waits for the corridors of wave 6.

/** Radius of the raised island at the centre of a mini roundabout. */
const ROUNDABOUT_ISLAND_RADIUS_M = 2.1;
/** The painted apron round it, which a long vehicle may track over. */
const ROUNDABOUT_APRON_WIDTH_M = 1;
/** Segments round the circle — enough that a 3 m island reads as round. */
const ROUNDABOUT_SEGMENTS = 24;
/** How far in from the tile edge the yield line stands. */
const ROUNDABOUT_YIELD_SETBACK_M = 0.5;
/** A yield triangle's base. MUTCD 3B.19: 12 to 24 inches, height 1.5x the base. */
const YIELD_TRIANGLE_BASE_M = 0.5;
const YIELD_TRIANGLE_HEIGHT_M = 0.75;
/** The gap between them: 3 to 12 inches. */
const YIELD_TRIANGLE_GAP_M = 0.2;

/**
 * The central island of a mini roundabout: a planted centre inside a kerb
 * ring, the same two materials an avenue's median is built from, surrounded by
 * the painted apron.
 */
function emitRoundaboutIsland(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  hAt: (x: number, z: number) => number,
): void {
  const r = ROUNDABOUT_ISLAND_RADIUS_M;
  // The apron reads as carriageway a driver may use, so it is paint, not kerb.
  pushRing(
    positions,
    colors,
    centerX,
    centerZ,
    0,
    0,
    r,
    r + ROUNDABOUT_APRON_WIDTH_M,
    ROUNDABOUT_SEGMENTS,
    MARK_Y_OFFSET,
    MARKING_COLOR,
    hAt,
  );
  pushRing(
    positions,
    colors,
    centerX,
    centerZ,
    0,
    0,
    r - MEDIAN_CONCRETE_EDGE_M,
    r,
    ROUNDABOUT_SEGMENTS,
    MEDIAN_Y_OFFSET,
    MEDIAN_CONCRETE_COLOR,
    hAt,
  );
  const inner = r - MEDIAN_CONCRETE_EDGE_M;
  const rim: [number, number][] = [];
  for (let i = 0; i <= ROUNDABOUT_SEGMENTS; i++) {
    const a = (i / ROUNDABOUT_SEGMENTS) * Math.PI * 2;
    rim.push([inner * Math.cos(a), inner * Math.sin(a)]);
  }
  pushFan(
    positions,
    colors,
    centerX,
    centerZ,
    [0, 0],
    rim,
    MEDIAN_Y_OFFSET,
    MEDIAN_GRASS_COLOR,
    hAt,
  );
}

/**
 * A yield line across one approach: a row of solid white triangles pointing at
 * the driver arriving on it (MUTCD 3B.19 ¶10). `baseAt` and `apexAt` are the
 * signed offsets along the approach axis of the row's base and its points, so
 * the apexes face outward, toward the tile edge the traffic comes from.
 */
function emitYieldLine(
  positions: number[],
  colors: number[],
  centerX: number,
  centerZ: number,
  vertical: boolean,
  baseAt: number,
  apexAt: number,
  coreHalf: number,
  hAt: (x: number, z: number) => number,
): void {
  const pitch = YIELD_TRIANGLE_BASE_M + YIELD_TRIANGLE_GAP_M;
  const count = Math.max(1, Math.floor((2 * coreHalf) / pitch));
  const used = count * pitch - YIELD_TRIANGLE_GAP_M;
  // Across the carriageway, laid symmetrically about its centreline.
  const at = (across: number, along: number): [number, number] =>
    vertical ? [across, along] : [along, across];
  for (let i = 0; i < count; i++) {
    const left = -used / 2 + i * pitch;
    const right = left + YIELD_TRIANGLE_BASE_M;
    pushGroundTri(
      positions,
      colors,
      centerX,
      centerZ,
      at(left, baseAt),
      at(right, baseAt),
      at((left + right) / 2, apexAt),
      MARK_Y_OFFSET,
      MARKING_COLOR,
      hAt,
    );
  }
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

/**
 * Per-side carriageway half-widths of the neighbouring road tiles, in metres
 * (0 where there is no road). Optional: omitted, each side is its tier's
 * preset width, which is exact for every tile that carries a preset.
 */
export interface NeighborHalves {
  n: number;
  e: number;
  s: number;
  w: number;
}

function presetHalves(neighbors: NeighborTiers): NeighborHalves {
  const half = (tier: RoadTier): number =>
    tier === RoadTier.None ? 0 : carriagewayHalfWidthMeters(tier);
  return { n: half(neighbors.n), e: half(neighbors.e), s: half(neighbors.s), w: half(neighbors.w) };
}

export function roadTileVertices(
  x: number,
  z: number,
  tier: RoadTier,
  mask: number,
  hAt: (x: number, z: number) => number,
  neighbors: NeighborTiers = NO_NEIGHBORS,
  /** The tile's own cross-section. Omitted = the tier's preset, which is what every tile carried before profiles. */
  profile?: RoadProfile,
  neighborHalves: NeighborHalves = presetHalves(neighbors),
  /** Which way the tile was drawn; RoadFlow.None reads as the low-to-high default. */
  flow: number = RoadFlow.None,
  /**
   * Who gives way at this tile, when the sim has controlled it. The crossing
   * and the stop bar follow it: undefined or `none` paints neither, since
   * neither belongs at a junction nothing controls.
   */
  control?: JunctionControl,
  /**
   * The junction this tile is the last approach to, as the direction it lies
   * in. Set only on the tile immediately before one, and only by a caller that
   * can see the whole network; it is what puts lane-use arrows on the ground.
   */
  approachToward?: RoadFlow,
): { positions: number[]; colors: number[] } {
  if (!Number.isInteger(mask) || mask < 0 || mask > 15) {
    throw new RangeError(`roadTileVertices: mask ${mask} out of the 4-bit range 0..15`);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  if (tier === RoadTier.None) return { positions, colors };

  const crossSection = profile ?? presetProfileForTier(tier);
  const spec = quadSpecFor(tier, crossSection);
  // Every line and band this tile paints, read from its cross-section.
  const plan = markingPlan(crossSection);
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
  // A junction with nothing but LESSER roads joining it is a side turning, not
  // a crossing: the road running through keeps its markings, the way a main
  // road's centre line runs unbroken past a farm track. A junction where any
  // arm ranks alongside it is a real intersection, and its markings stop.
  const ownRankHere = rankForTier(tier);
  const joinedByLesserOnly =
    isJunction &&
    (
      [
        [hasN, neighbors.n],
        [hasE, neighbors.e],
        [hasS, neighbors.s],
        [hasW, neighbors.w],
      ] as Array<[boolean, RoadTier]>
    ).every(
      // An arm whose road is not named is unknown, not lesser: a caller that
      // supplies no neighbours gets the plain junction it always got.
      ([has, n]) => !has || (n !== RoadTier.None && rankForTier(n) < ownRankHere),
    );
  // A roundabout always breaks them: there is an island where the centre line
  // would run, and no road runs THROUGH a roundabout.
  const breaksMarkings = isJunction && (!joinedByLesserOnly || control === 'roundabout');
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
      plan,
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

  // A raised median and a motorway divider run down straight tiles only, and
  // break at corners and junctions so turn paths stay clear.
  const medianEligible = plan.hasMedian && isStraightRunMask(mask);
  const dividerEligible = plan.barrier && isStraightRunMask(mask);
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
    // Lane markings: suppressed where a junction really is a crossing (per-arm
    // stop lines and crosswalks instead) and at TURNS (the curved carriageway
    // carries no straight lane lines — they'd cut across the arc). A straight
    // run, a dead end, and a road passing a lesser turning keep their markings.
    if (!breaksMarkings && !isTurn) {
      if (hasVertical) {
        const zLo = hasN ? -TILE_HALF : -coreHalf;
        const zHi = hasS ? TILE_HALF : coreHalf;
        emitAxisMarkings(
          positions,
          colors,
          plan,
          centerX,
          centerZ,
          true,
          zLo,
          zHi,
          medianEligible,
          hAt,
        );
        if (plan.bands.length > 0)
          emitColoredLaneBands(
            positions,
            colors,
            plan,
            x,
            z,
            centerX,
            centerZ,
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
          plan,
          centerX,
          centerZ,
          false,
          xLo,
          xHi,
          medianEligible,
          hAt,
        );
        if (plan.bands.length > 0)
          emitColoredLaneBands(
            positions,
            colors,
            plan,
            x,
            z,
            centerX,
            centerZ,
            false,
            xLo,
            xHi,
            hAt,
          );
      }

      // Two-way left-turn arrows: a pair pointing opposite ways down the turn
      // lane, on the same periodic tiles as the one-way arrows, so the lane
      // reads as one traffic enters from both directions to turn across.
      if (plan.turnLane) {
        const laneCentre = (plan.turnLane.from + plan.turnLane.to) / 2;
        const paint = (vertical: boolean): void => {
          emitTurnArrow(positions, colors, vertical, centerX, centerZ, laneCentre, 1, -1, hAt);
          emitTurnArrow(positions, colors, vertical, centerX, centerZ, laneCentre, -1, 1, hAt);
        };
        if (hasVertical && isArrowTile(z)) paint(true);
        if (hasHorizontal && isArrowTile(x)) paint(false);
      }

      // Lane-use arrows on the last tile before a junction: what each lane of
      // the approach is allowed to do, painted from its movement set. A
      // single-lane approach does everything and is left unmarked, which is also
      // what MUTCD 3D.06 ¶01 says of one at a circular intersection.
      if (approachToward !== undefined && plan.solid.length + plan.dashed.length > 0) {
        const vertical = approachToward === RoadFlow.North || approachToward === RoadFlow.South;
        const ahead: 1 | -1 =
          approachToward === RoadFlow.South || approachToward === RoadFlow.East ? 1 : -1;
        // Facing the way the traffic goes, this is the across direction on the
        // driver's LEFT — the side the leftmost lane sits on, and the side a
        // left turn hooks toward.
        const leftSign = vertical ? ahead : -ahead;
        const lanes = travelLanes(crossSection);
        const oneWay = lanes.every((l) => l.flow === lanes[0]?.flow);
        // On a two-way road the approaching lanes are the ones on the driver's
        // RIGHT of the centreline. On a one-way every lane approaches, or none
        // does — which is what the road's own stored direction decides.
        const runsToward = flow === RoadFlow.None || flow === approachToward;
        const approaching = oneWay
          ? runsToward
            ? lanes
            : []
          : lanes.filter((l) => l.centre * leftSign < 0);
        if (approaching.length >= 2) {
          // Ordered from the driver's left, which is the order the movement sets
          // come in: the dedicated left first, the dedicated right last.
          const ordered = [...approaching].sort(
            (a, b) => b.centre * leftSign - a.centre * leftSign,
          );
          const movements = defaultLaneMovements(ordered.length);
          const shift = ahead * (TILE_HALF - LANE_ARROW_SETBACK_M);
          for (let i = 0; i < ordered.length; i++) {
            emitLaneUseArrow(
              positions,
              colors,
              vertical,
              vertical ? centerX : centerX + shift,
              vertical ? centerZ + shift : centerZ,
              ordered[i]!.centre,
              ahead,
              movements[i] ?? Movement.Through,
              hAt,
            );
          }
        }
      }

      // One-Way direction arrows: every ARROW_PERIOD_TILES-th tile by GLOBAL
      // coordinate along the flow axis, pointing the way the road was drawn.
      // A road laid before its direction was stored points low->high, which is
      // the way it has always been drawn and the way it is still routed.
      if (tier === RoadTier.OneWay) {
        if (hasVertical && isArrowTile(z))
          emitDirectionArrow(
            positions,
            colors,
            true,
            centerX,
            centerZ,
            flow === RoadFlow.North,
            hAt,
          );
        if (hasHorizontal && isArrowTile(x))
          emitDirectionArrow(
            positions,
            colors,
            false,
            centerX,
            centerZ,
            flow === RoadFlow.West,
            hAt,
          );
      }
    }

    // Proper intersections: each connected arm of a junction tile gets its
    // own stop line + zebra crosswalk. Corner tiles (popcount 2, non-collinear)
    // are NOT junctions by this gate and keep their plain suppression/marking
    // behavior above.
    if (isJunction) {
      // Which arms stop. A minor road meeting a bigger one gives way to it:
      // the side street gets the stop line and the crosswalk, and the road
      // running through gets neither, the way a real junction reads. Where
      // every arm ranks the same — two equal roads crossing — they all stop,
      // which is the all-way junction.
      const armRanks = (
        [
          [hasN, neighbors.n],
          [hasE, neighbors.e],
          [hasS, neighbors.s],
          [hasW, neighbors.w],
        ] as Array<[boolean, RoadTier]>
      )
        .filter(([has, n]) => has && n !== RoadTier.None)
        .map(([, n]) => rankForTier(n));
      const ranks = armRanks.length > 0 ? armRanks : [rankForTier(tier)];
      const armStops = (neighborTier: RoadTier): boolean =>
        neighborTier === RoadTier.None || armGivesWay(rankForTier(neighborTier), ranks);
      // A stop line marks where to stop for a sign or a signal, so it is the
      // CONTROL that decides whether one is painted, not the shape of the
      // junction. An uncontrolled crossroads gets no paint at all; an approach
      // that only gives way gets its crossing but no bar.
      // A roundabout is not painted like a junction at all: no crossings on
      // the box and no stop bars, an island in the middle and a yield line
      // across every entry.
      const painted = control !== undefined && control !== 'none' && control !== 'roundabout';
      const stopsFor = control === 'stop' || control === 'allWayStop' || control === 'signal';
      const arm = (vertical: boolean, at: (d: number) => number, stops: boolean): void =>
        emitJunctionArmMarkings(
          positions,
          colors,
          vertical,
          centerX,
          centerZ,
          coreHalf,
          at,
          hAt,
          spec.hasCurbs,
          stops,
        );
      // Measured inward from the TILE edge, which is where the approach
      // actually reaches the junction, rather than outward from the box.
      if (painted) {
        const armAt: [boolean, RoadTier, boolean, (d: number) => number][] = [
          [hasN, neighbors.n, true, (d) => -TILE_HALF + d],
          [hasS, neighbors.s, true, (d) => TILE_HALF - d],
          [hasE, neighbors.e, false, (d) => TILE_HALF - d],
          [hasW, neighbors.w, false, (d) => -TILE_HALF + d],
        ];
        for (const [has, neighborTier, vertical, at] of armAt) {
          if (!has || !armStops(neighborTier)) continue;
          // A signal holds every approach; a give-way or a minor-road stop
          // holds only the arms below the road that runs through.
          arm(vertical, at, stopsFor);
        }
      }

      if (control === 'roundabout') {
        emitRoundaboutIsland(positions, colors, centerX, centerZ, hAt);
        // Every entry yields, which is the one place a give-way may face all
        // of them (MUTCD 2B.10 ¶06). The triangles point at the driver, so
        // they sit toward the tile edge the approach arrives from.
        const yieldArm = (vertical: boolean, sign: 1 | -1): void => {
          const edge = sign * TILE_HALF;
          emitYieldLine(
            positions,
            colors,
            centerX,
            centerZ,
            vertical,
            edge - sign * (ROUNDABOUT_YIELD_SETBACK_M + YIELD_TRIANGLE_HEIGHT_M),
            edge - sign * ROUNDABOUT_YIELD_SETBACK_M,
            coreHalf,
            hAt,
          );
        };
        if (hasN) yieldArm(true, -1);
        if (hasS) yieldArm(true, 1);
        if (hasE) yieldArm(false, 1);
        if (hasW) yieldArm(false, -1);
      }
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
        plan,
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

  // Wide -> narrow transition: on a straight through-run, a kerbed paved tile
  // whose paved neighbour is narrower bends its kerb in to meet it over the
  // whole tile (half the tile when both ends narrow, so the two wedges share
  // the centre). The narrower side draws nothing; the gravel neighbour keeps
  // its tan seam above instead; junction throats keep their flare.
  if (spec.paved && spec.hasCurbs && connections === 2 && isCollinearMask(mask)) {
    const sides: Array<[boolean, RoadTier, number, 1 | -1, boolean]> = [
      [hasN, neighbors.n, neighborHalves.n, -1, true],
      [hasS, neighbors.s, neighborHalves.s, 1, true],
      [hasE, neighbors.e, neighborHalves.e, 1, false],
      [hasW, neighbors.w, neighborHalves.w, -1, false],
    ];
    const narrowing = sides.filter(
      ([has, nTier, nHalf]) =>
        has &&
        nTier !== RoadTier.None &&
        nTier !== RoadTier.Gravel &&
        nHalf > 0 &&
        nHalf < coreHalf - 1e-6,
    );
    const depth = narrowing.length === 2 ? TILE_HALF : TILE_METERS;
    for (const [, , nHalf, edgeSign, vertical] of narrowing) {
      emitWidthSeam(
        positions,
        colors,
        centerX,
        centerZ,
        coreHalf,
        nHalf,
        edgeSign,
        vertical,
        depth,
        hAt,
      );
    }
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
  /**
   * Resolves a profile id to its cross-section, so a composed road draws its
   * own width and kerbs. Without one every tile draws as its tier's preset —
   * which is what every tile is until a player composes something.
   */
  private readonly profileFor: (id: number) => RoadProfile | null;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    profileFor: (id: number) => RoadProfile | null = () => null,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.profileFor = profileFor;
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
   * lamp pools as the bright spots. At day (factor 0) it is 1 → the
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

  /**
   * Takes the sim's junction controls and rebuilds the chunks whose answer
   * moved. The crossings and stop bars painted on a junction follow its
   * control, and a control changes with no road delta behind it — the traffic
   * through the junction grew — so nothing else would trigger the rebuild.
   */
  setJunctionControls(
    junctions: readonly { x: number; z: number; control: JunctionControl }[],
  ): void {
    const next = new Map<number, JunctionControl>();
    for (const j of junctions) next.set(tileIndex(j.x, j.z), j.control);

    const dirty = new Set<number>();
    const moved = (x: number, z: number): void => {
      const key = chunkKeyOf(x, z);
      if (this.chunks.get(key)?.tiles.size) dirty.add(key);
    };
    for (const [i, control] of next) {
      if (this.junctionControls.get(i) !== control) moved(i % MAP_SIZE, Math.floor(i / MAP_SIZE));
    }
    for (const i of this.junctionControls.keys()) {
      if (!next.has(i)) moved(i % MAP_SIZE, Math.floor(i / MAP_SIZE));
    }
    this.junctionControls = next;

    for (const key of dirty) this.rebuildChunk(key);
    if (dirty.size > 0) this.rebuildMedianTrees();
  }

  /** Current median-tree instance count (test/inspection hook). */
  medianTreeCount(): number {
    return this.treeTrunkMesh ? this.treeTrunkMesh.count : 0;
  }

  /**
   * Rebuilds every chunk whose road geometry can be affected by a terrain
   * height change in the given tile rects. Terraform strokes, building
   * auto-flatten and the grading of a neighboring run all move the ground
   * under EXISTING roads without emitting any road delta — without this, those
   * roads keep stale pre-change geometry (buried edges / floating caps). A
   * 1-tile halo covers corner sharing (a rendered corner averages the four
   * cells around it) and cap/sidewalk overhang past the tile edge.
   */
  invalidateHeights(patches: ReadonlyArray<{ x: number; z: number; w: number; h: number }>): void {
    const dirty = new Set<number>();
    for (const p of patches) {
      const x0 = p.x - 1;
      const z0 = p.z - 1;
      const x1 = p.x + p.w;
      const z1 = p.z + p.h;
      for (let cz = Math.floor(z0 / CHUNK_TILES); cz <= Math.floor(z1 / CHUNK_TILES); cz++) {
        for (let cx = Math.floor(x0 / CHUNK_TILES); cx <= Math.floor(x1 / CHUNK_TILES); cx++) {
          dirty.add(cz * CHUNKS_PER_SIDE + cx);
        }
      }
    }
    let rebuilt = false;
    for (const key of dirty) {
      const chunk = this.chunks.get(key);
      if (chunk && chunk.tiles.size > 0) {
        this.rebuildChunk(key);
        rebuilt = true;
      }
    }
    if (rebuilt) this.rebuildMedianTrees();
  }

  /** Who gives way at each junction tile, by tile index. Absent = the sim controls it with nothing. */
  private junctionControls: ReadonlyMap<number, JunctionControl> = new Map();

  /** The road tier at tile (x,z) across all chunks, or None — for neighbor-aware seam treatment. */
  private tierAt(x: number, z: number): RoadTier {
    const chunk = this.chunks.get(chunkKeyOf(x, z));
    return chunk?.tiles.get(localTileKeyOf(x, z))?.tier ?? RoadTier.None;
  }

  /**
   * The direction of the junction this tile is the last approach to, or
   * undefined when it is not one. A tile is an approach when it is a straight
   * run — a corner has no lane to arrow — with exactly one neighbour that has
   * three arms or more of its own.
   */
  private approachToward(x: number, z: number): RoadFlow | undefined {
    const degreeAt = (ax: number, az: number): number => {
      let n = 0;
      for (const [dx, dz] of APPROACH_STEPS)
        if (this.tierAt(ax + dx, az + dz) !== RoadTier.None) n++;
      return n;
    };
    if (degreeAt(x, z) !== 2) return undefined; // a junction, a corner or an end
    let found: RoadFlow | undefined;
    for (const [dx, dz, toward] of APPROACH_DIRS) {
      if (this.tierAt(x + dx, z + dz) === RoadTier.None) continue;
      if (degreeAt(x + dx, z + dz) < 3) continue;
      if (found !== undefined) return undefined; // between two junctions: neither is the approach
      found = toward;
    }
    return found;
  }

  /** The carriageway half-width of the road at (x,z) from its own cross-section, or 0 off-road. */
  private halfAt(x: number, z: number): number {
    const tile = this.chunks.get(chunkKeyOf(x, z))?.tiles.get(localTileKeyOf(x, z));
    if (!tile) return 0;
    const profile = this.profileFor(tile.profile) ?? presetProfileForTier(tile.tier);
    return carriagewayHalfWidthOf(profile);
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
        this.profileFor(tile.profile) ?? undefined,
        {
          n: this.halfAt(tile.x, tile.z - 1),
          e: this.halfAt(tile.x + 1, tile.z),
          s: this.halfAt(tile.x, tile.z + 1),
          w: this.halfAt(tile.x - 1, tile.z),
        },
        tile.flow,
        this.junctionControls.get(tileIndex(tile.x, tile.z)),
        this.approachToward(tile.x, tile.z),
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
