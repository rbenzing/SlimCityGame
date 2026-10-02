/**
 * Tool state machine: hover preview -> drag -> commit/cancel.
 * Pure logic only — no three.js/DOM here. `ToolEnv` is the injected boundary
 * to screen->tile picking, the road/catalog data, and the command channel;
 * `main` (render thread integration) supplies a real implementation and
 * relays keyboard shortcuts (Esc -> cancel(), R -> rotatePlop()).
 */
import {
  inBounds,
  TERRAFORM_BRUSH_MAX,
  TERRAFORM_BRUSH_MIN,
  TERRAFORM_COST_PER_METER_TILE,
  TERRAFORM_STRENGTH_MAX,
  TERRAFORM_STRENGTH_MIN,
  LANDFILL_PAINT_COST_PER_TILE,
  POWER_LINE_COST_PER_TILE,
  BRIDGE_MAX_ELEVATION,
  BRIDGE_COST_PER_METER_TILE,
  BRIDGE_MAX_GRADE,
  ROAD_ELEVATION_STEP_M,
  TILE_METERS,
  tileToWorld,
} from '../shared/constants';
import type {
  BrushSettings,
  BuildingCatalogEntry,
  Command,
  CursorChip,
  RoadSpec,
  RoadTier,
  TilePoint,
  ToolFlags,
  ToolId,
  TransitMode,
  ZoneType,
} from '../shared/types';
import {
  corridorHalfOf,
  flowsAlong,
  RoadTier as RoadTierValue,
  ZoneType as ZoneTypeValue,
} from '../shared/types';
import type { RoadProfile } from '../shared/types';
import {
  carriagewayShiftOf,
  composeProfile,
  corridorHalfProfile,
  worldOrderedProfile,
  joinRefusal,
  layRefusal,
  NO_EDITS,
  rankedTogether,
  roadRank,
  withArticle,
  presetProfileForTier,
  profilesEqual,
  profileWidth,
  roadPriceOf,
  tierForProfile,
  type RoadPrice,
  tilesAcross,
  type ProfileEdits,
  isOneWayProfile,
} from '../shared/roadprofile';
import {
  isTileCentre,
  sampleCentreLine,
  segmentLengthM,
  tightestRadiusM,
  tileCentreCm,
  tileOfCm,
} from '../shared/roadgeom';
import type { EndMove } from '../world/freeroads';
import type { CmPoint, SegmentGeom } from '../shared/roadgeom';
import { ZONE_DEPTH } from '../world/zonable';
import {
  bulldozeReach,
  corridorPartnerTile,
  corridorRunsFor,
  corridorSplitRefusal,
  corridorTiles,
  rampMeetingRefusal,
} from '../shared/corridor';
import type { CorridorRuns } from '../shared/corridor';
import {
  interchangeCommands,
  interchangeLayout,
  interchangeRefusal,
  readInterchangeSite,
  type InterchangeForm,
  type InterchangeGround,
  type InterchangeLayout,
} from '../shared/interchange';
import {
  blockTiles,
  roundaboutAtJunction,
  roundaboutCommands,
  type RoundaboutGround,
  type RoundaboutPlan,
} from '../shared/roundabout';
import { atOneLevel, bitToward, crossingShape, overpassRise } from '../shared/overpass';

/**
 * The onPreview payload: every CursorChip field (cost/lengthMeters/
 * invalidReason) plus the geometry the render side needs.
 */
export interface ToolPreview extends CursorChip {
  tiles: TilePoint[];
  valid: boolean;
  label: string;
  /**
   * The road's cross-section width in metres, so the ghost can be drawn at the
   * size the road will actually be rather than at tile size. A corridor is two
   * carriageways on two tile rows and each row carries half, which is where
   * the split is made. Absent for every tool that is not laying a road.
   */
  widthMeters?: number;
  /**
   * How high above its ground each of `tiles` would be laid, metres, where
   * any of them would stand off it: a raised road, a bridge or an overpass.
   * Absent for a road that lies on the ground, and for every other tool.
   */
  deckLifts?: number[];
  /**
   * How far across its run each of `tiles` is drawn from the tile's centre,
   * metres toward the higher coordinate: a corridor with nothing dividing it
   * has each half pushed against the edge the two share. Absent where every
   * tile is drawn centred.
   */
  bandShifts?: number[];
  /**
   * A road off the grid being drawn: its centre line and the points clicked so
   * far, world metres. Present only in the `Curve` mode, whose ghost is this
   * line at `widthMeters` rather than tiles.
   */
  curve?: { centre: { x: number; z: number }[]; clicks: { x: number; z: number }[] };
}

/** A road off the grid, as the tool asks whether it may be laid. */
export interface FreeRoadAsk {
  tier: RoadTier;
  profileId: number;
  a: CmPoint;
  b: CmPoint;
  control: CmPoint | null;
  /** 0 both ways; 1 one-way from `a` to `b`. */
  flow: number;
  /** Points partway along free roads where its ends land, each split there first. */
  splits: CmPoint[];
}

/** Where a dropped road end lands, and whether it lands partway along a free road. */
export interface RoadEndSnap {
  at: CmPoint;
  splits: boolean;
}

/** A road off the grid the tool is drawing: its centre line, and the roads it splits. */
interface FreeRoad {
  geom: SegmentGeom;
  splits: CmPoint[];
}

/**
 * How far from the line of the road a curve starts on its bend may be placed
 * and still be pulled onto it, metres: near enough reads as "carry on".
 */
export const BEND_SNAP_M = 8;

/** Zone tool paint mode (tool-options row): brush follows the
 * drag's actual path; rect fills the enclosing rectangle (existing/default). */
export type ZoneMode = 'brush' | 'rect';

export interface ToolEnv {
  /** Screen pixel -> tile coordinate, or null when off the playable grid. */
  screenToTile(sx: number, sy: number): TilePoint | null;
  /** Dispatches a forward command batch under a human-readable undo label. */
  send(label: string, commands: Command[]): void;
  roadSpec(tier: RoadTier): RoadSpec;
  entry(catalogId: string): BuildingCatalogEntry | undefined;
  onPreview(preview: ToolPreview | null): void;
  /**
   * Current available funds. Optional (additive contract): an env that omits
   * it never reports an "Insufficient funds" invalidReason.
   */
  funds?(): number;
  /**
   * Current reached MILESTONES index. Optional: an env that omits it never
   * reports a "Locked" invalidReason.
   */
  milestoneLevel?(): number;
  /**
   * Geometric placement check (grid overlap/water/etc. — beyond simple
   * in-bounds). Optional: an env that omits it never blocks on this check.
   */
  canPlace?(tiles: TilePoint[]): boolean;
  /**
   * Terrain height in meters at a tile. The Level terraform
   * tool samples this once at drag start for its flatten target. Optional:
   * an env that omits it samples a target height of 0 (still real terraform
   * behavior — just unsampled — never a crash).
   */
  heightAt?(tile: TilePoint): number;
  /**
   * True when a tile carries a road or building, i.e. is excluded from the
   * terraform kernel ("can't terraform under structures").
   * Optional: an env that omits it never excludes any tile, so a terraform
   * brush preview is always valid.
   */
  hasStructure?(tile: TilePoint): boolean;
  /**
   * Whether a power line already stands on a tile, so the cursor quotes only
   * the tiles a drag would actually change. Optional: an env that omits it
   * quotes the whole run, which is what a fresh one costs anyway.
   */
  powerLineAt?(x: number, z: number): boolean;
  /**
   * The id to lay a composed cross-section under — an existing custom id with
   * this exact shape, or the next free one. Optional: an env that omits it
   * lays every road as its preset, edits or not.
   */
  profileIdFor?(profile: RoadProfile): number;
  /**
   * The cross-section an existing road tile carries, or null where there is
   * no road. Optional: an env that omits it never refuses a run for the roads
   * it would touch.
   */
  roadProfileAt?(tile: TilePoint): RoadProfile | null;
  /**
   * The stored flow byte of an existing road tile, which way it was drawn.
   * Optional: without it a ramp's meeting with a motorway cannot be judged,
   * and is not refused.
   */
  roadFlowAt?(tile: TilePoint): number;
  /**
   * The profile id an existing road tile carries, 0 where there is none: what
   * says two corridor halves are one road. Optional: without it no drag is
   * refused for splitting a corridor here, and the world still refuses it.
   */
  roadProfileIdAt?(tile: TilePoint): number;
  /**
   * The stored flow byte and profile id of the road passing over a crossing
   * tile, or null where none does. Optional: without it the bulldoze preview
   * reads every tile as at grade, and the world still decides what goes.
   */
  overRoadAt?(tile: TilePoint): { flow: number; profile: number } | null;
  /**
   * The grid as an interchange is laid out on it. Optional: without it the
   * Interchange tool previews nothing and lays nothing.
   */
  interchangeGround?(): InterchangeGround;
  /**
   * The grid as a roundabout's site reads it. Optional: without it the
   * Roundabout tool previews nothing and lays nothing.
   */
  roundaboutGround?(): RoundaboutGround;
  /**
   * The neighbour mask of an existing road tile: which sides it is joined on.
   * What tells a road running straight across a drag from a junction, and a
   * pair of carriageways from a crossroads. Optional: without it no crossing
   * is recognised and a drag meets every road at grade.
   */
  roadMaskAt?(tile: TilePoint): number;
  /**
   * How far an existing road tile's deck stands above its ground, metres; 0
   * on the ground. Optional: without it no road is seen raised above a drag,
   * so none is passed under.
   */
  roadElevationAt?(tile: TilePoint): number;
  /**
   * The deck height above its ground, metres, that each tile of a run would
   * be laid at when asked for `elevation`, solved by the world's own rule; or
   * null where no deck can be solved. Optional: without it the ghost lies on
   * the ground.
   */
  deckLifts?(tiles: TilePoint[], elevation: number): number[] | null;
  /**
   * The ground under a screen pixel, world metres, or null off the ground.
   * Optional: without it the `Curve` mode has nowhere to put a click.
   */
  worldPointAt?(sx: number, sy: number): { x: number; z: number } | null;
  /**
   * Where a road end dropped at `p` lands: on a road node near it, partway
   * along a free road near it (which is then split there), at the centre of
   * the grid road tile under it, or at `p` itself. Optional: without it an end
   * lands exactly where it was clicked.
   */
  snapRoadEnd?(p: CmPoint): RoadEndSnap;
  /**
   * The road end within half a tile of `p` — the end tile of a grid road or
   * the end node of a road off the grid — or null. Optional: without it a grid
   * drag starts and stops on the tile under the cursor.
   */
  roadEndNear?(p: CmPoint): CmPoint | null;
  /**
   * The way a road carries on from its end at `p`, as a unit direction, or
   * null where no single road ends there. Optional: without it a bend is
   * never pulled into line with the road it continues.
   */
  roadEndDirection?(p: CmPoint): { x: number; z: number } | null;
  /**
   * Whether a road off the grid may be laid, by the world's own rules, and
   * how long it is along its centre line. `profile` is the cross-section
   * `ask.profileId` names, which the world may not have been told yet.
   * Optional: without it a curve is drawn but never judged, and never laid.
   */
  planFreeRoad?(
    ask: FreeRoadAsk,
    profile: RoadProfile,
  ): { ok: true; lengthM: number } | { ok: false; reason: string };
  /**
   * Why a grid run may not be laid over `tiles` by the world's own rule for
   * the ground roads off the grid hold, once `moves` have brought the ends of
   * roads off the grid it starts or stops on onto their tile centres — or why
   * a move is refused — or null. Optional: without it a grid drag is never
   * refused for running into a road off the grid, and the world refuses it
   * after release instead.
   */
  gridRunRefusal?(tiles: readonly TilePoint[], moves: readonly EndMove[]): string | null;
}

const NO_CROSSINGS: ReadonlySet<string> = new Set();

/** Where a drag passes over the roads it crosses, and how high it must be to. */
interface OverpassPlan {
  /** The drag's tiles, as "x,z", that lay the road passing over a crossing. */
  crossings: ReadonlySet<string>;
  /** The drag's tiles, as "x,z", where it passes under a road raised above it. */
  under: ReadonlySet<string>;
  /** The deck height to lay the drag at, metres. */
  elevation: number;
  /** Why the drag cannot cross over, or null. */
  refusal: string | null;
}

/** The drag's tiles that never meet the road already on them: the ones it passes over or under. */
function passingBy(plan: OverpassPlan | null): ReadonlySet<string> {
  if (!plan) return NO_CROSSINGS;
  if (plan.under.size === 0) return plan.crossings;
  return new Set([...plan.crossings, ...plan.under]);
}

export const ZONE_TOOL_TO_TYPE: Record<string, ZoneType> = {
  'zone.resLow': ZoneTypeValue.ResLow,
  'zone.resHigh': ZoneTypeValue.ResHigh,
  'zone.comLow': ZoneTypeValue.ComLow,
  'zone.comHigh': ZoneTypeValue.ComHigh,
  'zone.industrial': ZoneTypeValue.Industrial,
  'zone.dezone': ZoneTypeValue.None,
  // Zoning types expansion — additive, save-safe (ZoneType numbers 1–5 above
  // are unchanged; these map to the new appended values).
  'zone.resMediumRow': ZoneTypeValue.ResMediumRow,
  'zone.resMedium': ZoneTypeValue.ResMedium,
  'zone.mixed': ZoneTypeValue.Mixed,
  'zone.agriculture': ZoneTypeValue.Agriculture,
  'zone.indHeavy': ZoneTypeValue.IndHeavy,
};

const ZONE_TOOL_TO_LABEL: Record<string, string> = {
  'zone.resLow': 'Residential (Low)',
  'zone.resHigh': 'Residential (High)',
  'zone.comLow': 'Commercial (Low)',
  'zone.comHigh': 'Commercial (High)',
  'zone.industrial': 'Industrial',
  'zone.dezone': 'De-zone',
  // Zoning types expansion.
  'zone.resMediumRow': 'Residential (Medium Row)',
  'zone.resMedium': 'Residential (Medium)',
  'zone.mixed': 'Mixed-Use',
  'zone.agriculture': 'Agriculture',
  'zone.indHeavy': 'Industrial (Heavy)',
};

/** Road tool id -> the tier it lays. Exported so the integration layer can ask
 * what a road preview is actually building. */
/** What the Interchange tool lays: its form, and the road it carries over the motorway. */
export interface InterchangeOptions {
  form: InterchangeForm;
  streetTier: RoadTier;
}

/** The name a compact roundabout is laid, and undone, under. */
export const ROUNDABOUT_LABEL = 'Compact roundabout';

/** The name an interchange of each form is laid, and undone, under. */
export const INTERCHANGE_LABEL: Readonly<Record<InterchangeForm, string>> = {
  diamond: 'Diamond interchange',
  parclo: 'Partial cloverleaf',
  cloverleaf: 'Cloverleaf',
};

export const ROAD_TOOL_TO_TIER: Record<string, RoadTier> = {
  'road.two': RoadTierValue.TwoLane,
  'road.avenue': RoadTierValue.Avenue,
  'road.highway': RoadTierValue.Highway,
  // Roads catalog expansion — same preview/commit machinery,
  // ghost paths and cursor chips included, just four more tier mappings.
  'road.gravel': RoadTierValue.Gravel,
  'road.alley': RoadTierValue.Alley,
  'road.oneway': RoadTierValue.OneWay,
  'road.four': RoadTierValue.FourLane,
  // No bus, bike or tram tool: those are lanes a road of any size is given
  // from the Profile row, not roads of their own. Their tiers still exist in
  // the catalog, so a save holding one loads and lays the road it drew.
  // Rail track (roads epic R4).
  'road.rail': RoadTierValue.RailTrack,
  // The slip road a motorway is reached by (roads epic wave 5).
  'road.ramp': RoadTierValue.Ramp,
};

/**
 * Whether a tool offers the `Grid` mode: every road but the motorway, whose
 * carriageways and ramps a street grid has no place for.
 */
export function offersGrid(tool: ToolId): boolean {
  return tool !== 'road.highway' && tool !== 'road.ramp';
}

/** The 'terraform' Command's mode field (shared/types.ts), named locally for readability. */
type TerraformMode = Extract<Command, { kind: 'terraform' }>['mode'];

const TERRAFORM_TOOL_TO_MODE: Record<string, TerraformMode> = {
  'terraform.raise': 'raise',
  'terraform.lower': 'lower',
  'terraform.level': 'level',
  'terraform.smooth': 'smooth',
};

const TERRAFORM_TOOL_TO_LABEL: Record<string, string> = {
  'terraform.raise': 'Raise',
  'terraform.lower': 'Lower',
  'terraform.level': 'Level',
  'terraform.smooth': 'Smooth',
};

/**
 * Continuous-brushing cadence: sim ticks between throttled
 * terraform-command emissions while a drag is held. Deterministic game time
 * (the caller supplies the current tick — never Date.now()), so brushing
 * scales with sim speed rather than real seconds.
 */
export const TERRAFORM_EMIT_INTERVAL_TICKS = 6;

/** Tool-options defaults: the midpoint of each slider's range. */
export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  radius: Math.round((TERRAFORM_BRUSH_MIN + TERRAFORM_BRUSH_MAX) / 2),
  strength: Math.round((TERRAFORM_STRENGTH_MIN + TERRAFORM_STRENGTH_MAX) / 2),
};

/**
 * Builds the road-drag L-path from `start` to `end` inclusive: the longer
 * axis is traversed first, then the shorter axis, with ties broken toward X.
 * The elbow tile is never duplicated.
 */
export function buildLPath(start: TilePoint, end: TilePoint): TilePoint[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const stepX = dx === 0 ? 0 : Math.sign(dx);
  const stepZ = dz === 0 ? 0 : Math.sign(dz);
  const xMajor = Math.abs(dx) >= Math.abs(dz);
  const tiles: TilePoint[] = [];
  if (xMajor) {
    for (let x = start.x; x !== end.x; x += stepX) tiles.push({ x, z: start.z });
    for (let z = start.z; z !== end.z; z += stepZ) tiles.push({ x: end.x, z });
  } else {
    for (let z = start.z; z !== end.z; z += stepZ) tiles.push({ x: start.x, z });
    for (let x = start.x; x !== end.x; x += stepX) tiles.push({ x, z: end.z });
  }
  tiles.push({ x: end.x, z: end.z });
  return tiles;
}

/**
 * How far a road guide reaches, in tiles — half the zoning depth.
 *
 * It is the furthest a snap can pull a road without destroying ground an
 * existing road already serves: inside it, the gap between two parallel
 * streets is a stagger nobody chose; beyond it, the offset is a block the
 * player meant to leave, and moving the road there would be moving it
 * somewhere it was not pointed.
 */
export const GUIDE_SNAP_TILES = ZONE_DEPTH / 2;

/**
 * `tile` pulled into line with a nearby road, independently on each axis.
 *
 * A guide is a road that RUNS along the axis being snapped — a candidate only
 * counts when its neighbour along that axis is road too. One tile on its own
 * says nothing about direction, and taking it as a guide would let a
 * perpendicular road's single crossing tile drag a new street sideways onto
 * it. The nearest guide wins; a tie keeps the tile where it is, since there is
 * no reason to prefer one side.
 */
export function snapToGuide(
  tile: TilePoint,
  isRoad: (x: number, z: number) => boolean,
  reach = GUIDE_SNAP_TILES,
  along = GRID_SPACING_TILES,
): TilePoint {
  const { rowGuides, columnGuides } = guideLines(tile, isRoad, along);
  const nearest = (guides: (at: number) => boolean, from: number): number => {
    for (let d = 1; d <= reach; d++) {
      const lower = guides(from - d);
      const upper = guides(from + d);
      // Equally close both ways is no reason to prefer either, so stay put.
      if (lower !== upper) return lower ? from - d : from + d;
      if (lower && upper) break;
    }
    return from;
  };
  return { x: nearest(columnGuides, tile.x), z: nearest(rowGuides, tile.z) };
}

/**
 * Which rows and columns near `tile` a road runs along. A guide is a road that
 * RUNS along the axis — a candidate only counts when its neighbour along that
 * axis is road too, since one tile on its own says nothing about direction.
 */
function guideLines(
  tile: TilePoint,
  isRoad: (x: number, z: number) => boolean,
  along: number,
): { rowGuides: (z: number) => boolean; columnGuides: (x: number) => boolean } {
  const runsAlongX = (x: number, z: number): boolean =>
    isRoad(x, z) && (isRoad(x - 1, z) || isRoad(x + 1, z));
  const runsAlongZ = (x: number, z: number): boolean =>
    isRoad(x, z) && (isRoad(x, z - 1) || isRoad(x, z + 1));
  // The line a road lays down reaches PAST its own ends — continuing a street
  // across a gap is most of what the snap is for, and a guide that stopped at
  // the last paved tile could never do it. It reaches one block, because
  // beyond a block away sharing a row is coincidence rather than intent.
  return {
    rowGuides: (z) => {
      for (let x = tile.x - along; x <= tile.x + along; x++) if (runsAlongX(x, z)) return true;
      return false;
    },
    columnGuides: (x) => {
      for (let z = tile.z - along; z <= tile.z + along; z++) if (runsAlongZ(x, z)) return true;
      return false;
    },
  };
}

/**
 * A road end off the grid at `p` pulled into line with a nearby road,
 * independently on each axis: onto the centre line of the nearest row or
 * column a road runs along, within the guide's reach. Equally near two, it
 * stays where it is, as a grid drag does.
 */
export function guidePoint(
  p: CmPoint,
  isRoad: (x: number, z: number) => boolean,
  reach = GUIDE_SNAP_TILES,
  along = GRID_SPACING_TILES,
): CmPoint {
  const tile = { x: Math.floor(p.x / 100 / TILE_METERS), z: Math.floor(p.z / 100 / TILE_METERS) };
  const { rowGuides, columnGuides } = guideLines(tile, isRoad, along);
  const onto = (guides: (at: number) => boolean, from: number, cm: number): number => {
    let best: number | null = null;
    let bestD = Infinity;
    let tie = false;
    for (let t = from - reach; t <= from + reach; t++) {
      if (!guides(t)) continue;
      const line = Math.round(tileToWorld(t) * 100);
      const d = Math.abs(line - cm);
      if (d > reach * TILE_METERS * 100) continue;
      if (d < bestD) {
        best = line;
        bestD = d;
        tie = false;
      } else if (d === bestD) tie = true;
    }
    return best === null || tie ? cm : best;
  };
  return { x: onto(columnGuides, tile.x, p.x), z: onto(rowGuides, tile.z, p.z) };
}

/**
 * Street spacing for `Grid` mode, centre to centre, in tiles.
 *
 * Derived rather than chosen: a road puts frontage ZONE_DEPTH cells out from
 * each of its sides, so two parallel streets zone everything between them when
 * the gap is twice that — eight tiles of block, plus the street itself. It is
 * the widest pitch that leaves no dead ground in the middle of a block, and at
 * 20 m tiles it comes out a 180 m block, which is a city block.
 */
export const GRID_SPACING_TILES = 2 * ZONE_DEPTH + 1;

/**
 * The `Grid` tool mode: the street grid enclosed by the rectangle a drag
 * spans — its four sides, plus the internal streets that divide the block at
 * GRID_SPACING_TILES.
 *
 * Internal streets are placed from the low edge outward, so growing a drag
 * ADDS streets rather than shuffling the ones already previewed, and a
 * rectangle narrower than the pitch simply gets none — which is the right
 * answer for a thin block rather than a case needing special handling. A drag
 * with no width at all is the straight run it looks like.
 */
export function buildGridPath(start: TilePoint, end: TilePoint): TilePoint[] {
  const x0 = Math.min(start.x, end.x);
  const x1 = Math.max(start.x, end.x);
  const z0 = Math.min(start.z, end.z);
  const z1 = Math.max(start.z, end.z);
  if (x0 === x1 || z0 === z1) return straightPath(start, end);

  const seen = new Set<string>();
  const tiles: TilePoint[] = [];
  const push = (x: number, z: number): void => {
    const key = `${x},${z}`;
    if (seen.has(key)) return;
    seen.add(key);
    tiles.push({ x, z });
  };
  // The two edges, then a street every pitch between them — but only while a
  // whole block still fits before the far edge. Without that an internal
  // street can land a tile short of the perimeter and cut off a sliver nothing
  // can be built in, which is worse than the slightly wide block it avoids.
  const divide = (lo: number, hi: number): number[] => {
    const out = [lo, hi];
    for (let at = lo + GRID_SPACING_TILES; hi - at >= GRID_SPACING_TILES; at += GRID_SPACING_TILES)
      out.push(at);
    return out;
  };
  const rows = divide(z0, z1);
  const cols = divide(x0, x1);

  for (const z of rows) for (let x = x0; x <= x1; x++) push(x, z);
  for (const x of cols) for (let z = z0; z <= z1; z++) push(x, z);
  return tiles;
}

/**
 * The `Straight` tool mode / `90° lock` snapping chip: a direct
 * single-axis-locked segment from `start` along whichever axis dominates the
 * drag, ignoring the other axis entirely (unlike {@link buildLPath}, this
 * never doglegs to actually reach `end`'s off-axis coordinate). Ties break
 * toward X, matching buildLPath.
 */
export function straightPath(start: TilePoint, end: TilePoint): TilePoint[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const xMajor = Math.abs(dx) >= Math.abs(dz);
  const tiles: TilePoint[] = [];
  if (xMajor) {
    const stepX = dx === 0 ? 0 : Math.sign(dx);
    for (let x = start.x; x !== end.x; x += stepX) tiles.push({ x, z: start.z });
    tiles.push({ x: end.x, z: start.z });
  } else {
    const stepZ = dz === 0 ? 0 : Math.sign(dz);
    for (let z = start.z; z !== end.z; z += stepZ) tiles.push({ x: start.x, z });
    tiles.push({ x: start.x, z: end.z });
  }
  return tiles;
}

/** Normalizes a drag between any two corners into the enclosed tile rectangle. */
export function rectTiles(start: TilePoint, end: TilePoint): TilePoint[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);
  const tiles: TilePoint[] = [];
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) tiles.push({ x, z });
  }
  return tiles;
}

/**
 * Footprint tiles for a ploppable at `origin` (its min-x/min-z corner).
 * Odd rotations (90°/270°) swap width and depth; the origin corner itself
 * never moves.
 */
export function footprintTiles(
  origin: TilePoint,
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
): TilePoint[] {
  const swapped = rotation === 1 || rotation === 3;
  const w = swapped ? entry.footprint.d : entry.footprint.w;
  const d = swapped ? entry.footprint.w : entry.footprint.d;
  const tiles: TilePoint[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      tiles.push({ x: origin.x + dx, z: origin.z + dz });
    }
  }
  return tiles;
}

/**
 * Terraform brush ring: the tile outline at exactly `radius`
 * tiles from `center` — a thin circle shell for the ghost preview, cheap
 * regardless of brush size (O(radius) tiles, not O(radius²)). This is NOT
 * the area the sim kernel edits (that's the filled {@link brushDiscTiles});
 * genre-standard brush cursors show only the outline, never the whole falloff
 * disc. A tile is on the ring when its rounded Euclidean distance from
 * `center` equals `radius`; out-of-bounds tiles are dropped.
 */
export function brushRingTiles(center: TilePoint, radius: number): TilePoint[] {
  const r = Math.max(0, Math.round(radius));
  const tiles: TilePoint[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.round(Math.hypot(dx, dz)) !== r) continue;
      const x = center.x + dx;
      const z = center.z + dz;
      if (inBounds(x, z)) tiles.push({ x, z });
    }
  }
  return tiles;
}

/**
 * The filled brush disc: every tile within `radius` tiles of
 * `center` — mirrors the sim kernel's effective falloff footprint (the
 * smoothstep falloff reaches exactly 0 at the radius, so nothing beyond it
 * ever changes). Used internally for the structure-exclusion validity check
 * and the cost estimate; the ghost preview itself only ever shows
 * {@link brushRingTiles}.
 */
export function brushDiscTiles(center: TilePoint, radius: number): TilePoint[] {
  const r = Math.max(0, Math.round(radius));
  const rSq = r * r;
  const tiles: TilePoint[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > rSq) continue;
      const x = center.x + dx;
      const z = center.z + dz;
      if (inBounds(x, z)) tiles.push({ x, z });
    }
  }
  return tiles;
}

function isPlopTool(tool: ToolId): boolean {
  return tool.startsWith('plop.');
}

function isTerraformTool(tool: ToolId): boolean {
  return tool.startsWith('terraform.');
}

/** Transit-line tools: click stops in sequence, right-click to commit the line. */
function isTransitTool(tool: ToolId): boolean {
  return tool === 'transit.line' || tool === 'transit.rail' || tool === 'transit.tram';
}

/** Which mode the pending line commits as — the tool picks the network. */
function transitModeOf(tool: ToolId): TransitMode {
  if (tool === 'transit.rail') return 'rail';
  if (tool === 'transit.tram') return 'tram';
  return 'bus';
}

/** What the player is drawing, for the preview label and the command name. */
const TRANSIT_MODE_LABEL: Record<TransitMode, string> = {
  bus: 'Bus',
  rail: 'Rail',
  tram: 'Tram',
};

/** District paint tool: brush/rect paint the selected district id onto tiles. */
function isDistrictTool(tool: ToolId): boolean {
  return tool === 'district.paint';
}

/** Landfill paint tool: brush/rect paint the landfill area onto tiles. */
function isPaintLandfillTool(tool: ToolId): boolean {
  return tool === 'landfill.paint';
}

/**
 * Power-line tool: drags a RUN, not an area — a line goes from somewhere to
 * somewhere, so it takes the same straight/elbow path a road drag does.
 */
function isPowerLineTool(tool: ToolId): boolean {
  return tool === 'power.line';
}

/** A minimum of 2 stops makes a routable bus line (mirrors sim/transit.ts). */
const MIN_TRANSIT_STOPS = 2;

/** Distinct packed-hex colors cycled for successive new bus lines. */
const TRANSIT_LINE_PALETTE: readonly number[] = [
  0xef5350, 0x42a5f5, 0x66bb6a, 0xffa726, 0xab47bc, 0x26c6da,
];

function catalogIdOf(tool: ToolId): string {
  return tool.slice('plop.'.length);
}

export class ToolManager {
  private readonly env: ToolEnv;
  private _tool: ToolId = 'select';
  private rotation: 0 | 1 | 2 | 3 = 0;
  private hoverTile: TilePoint | null = null;
  /** The road end the hover tile was snapped to, when it was. */
  private hoverEnd: CmPoint | null = null;
  /** Where on the ground the pointer is, for a tool that asks which part of the tile it is over. */
  private hoverPoint: CmPoint | null = null;
  private dragStart: TilePoint | null = null;
  /** The road end the drag started on, when it started on one. */
  private dragStartEnd: CmPoint | null = null;
  private armed = false;
  private flags: ToolFlags = {
    angleLock: false,
    straightMode: false,
    gridMode: false,
    guideSnap: false,
    roadSnap: true,
    replaceRoad: false,
  };
  private zoneMode: ZoneMode = 'rect';
  /** Zone brush mode: the deduped, drag-ordered path of tiles painted so far. */
  private brushTiles: TilePoint[] = [];
  private brushSeen = new Set<string>();
  /** Terrain-brush radius/strength, consumed by the terraform tools. */
  private brushSettings: BrushSettings = DEFAULT_BRUSH_SETTINGS;
  /** Level tool: the height sampled at drag start, flattened toward for the whole stroke. */
  private terraformLevelTarget: number | null = null;
  /** The sim tick (caller-supplied, deterministic) at which the last terraform dab fired. */
  private terraformLastEmitTick = 0;
  /** Running estimated cost of the in-progress terraform stroke (cursor chip). */
  private terraformStrokeCost = 0;
  /** District id the paint tool stamps (set from the UI store's selectedDistrict). */
  private districtId = 1;
  /**
   * Deliberate deck height for the road tool, in metres. Zero means follow the
   * ground and only bridge where the drag crosses water.
   */
  private roadElevation = 0;
  private profileEdits: ProfileEdits = NO_EDITS;
  /** Pending bus-line stops accumulated by successive clicks. */
  private transitStops: TilePoint[] = [];
  /** Index into TRANSIT_LINE_PALETTE for the next committed line's color. */
  private transitColorIndex = 0;
  /** `Curve` mode: the start, then the bend, clicked so far, world centimetres. */
  private curveClicks: RoadEndSnap[] = [];
  /** A `Straight` drag at any angle: where it started, as the road's end lands there. */
  private freeDragStart: RoadEndSnap | null = null;
  /** `Curve` mode: where the cursor is, world centimetres, or null off the ground. */
  private curveCursor: CmPoint | null = null;
  /** What the Interchange tool lays (from its options row). */
  private interchange: InterchangeOptions = { form: 'diamond', streetTier: RoadTierValue.TwoLane };

  constructor(env: ToolEnv) {
    this.env = env;
  }

  get tool(): ToolId {
    return this._tool;
  }

  /**
   * True while a primary-button drag is in progress (staged ESC):
   * main.ts consumes an Escape press at stage 1 (cancel the drag) only when
   * this is set, letting the UI layer handle the later stages otherwise.
   */
  get dragActive(): boolean {
    return (this.armed && this.dragStart !== null) || this.curveClicks.length > 0;
  }

  setTool(t: ToolId): void {
    this._tool = t;
    this.curveClicks = [];
    this.dragStart = null;
    this.dragStartEnd = null;
    this.hoverTile = null;
    this.hoverEnd = null;
    this.armed = false;
    this.brushTiles = [];
    this.brushSeen.clear();
    this.terraformLevelTarget = null;
    this.terraformStrokeCost = 0;
    this.transitStops = [];
    this.env.onPreview(null);
  }

  /** The district id the paint tool stamps (from the UI store). */
  setDistrictId(id: number): void {
    this.districtId = id;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** Deck height the road tool builds at, in metres (from the tool-options panel). */
  setRoadElevation(metres: number): void {
    this.roadElevation = Math.max(0, Math.min(BRIDGE_MAX_ELEVATION, Math.round(metres)));
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** The player's edits to the road's cross-section (from the tool-options panel). */
  setProfileEdits(edits: ProfileEdits): void {
    this.profileEdits = edits;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** The interchange's form and crossing road (from its options row). */
  setInterchange(options: InterchangeOptions): void {
    this.interchange = options;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /**
   * The interchange the Interchange tool would lay centred on `at`, what it
   * costs, and why it may not be laid. Null without a grid to lay it on.
   */
  private interchangePlan(
    at: TilePoint,
  ): { layout: InterchangeLayout | null; cost: number; refusal: string | null } | null {
    const ground = this.env.interchangeGround?.();
    if (!ground) return null;
    const site = readInterchangeSite(at, ground);
    if ('refusal' in site) return { layout: null, cost: 0, refusal: site.refusal };
    const { form, streetTier } = this.interchange;
    const layout = interchangeLayout(form, site, streetTier, (x, z) => ground.heightAt(x, z));
    // What the worker charges: every tile at its road's price, and the bridge
    // by each metre it stands up.
    const street = this.env.roadSpec(streetTier).costPerTile;
    const ramp = this.env.roadSpec(RoadTierValue.Ramp).costPerTile;
    const lifted = layout.street.elevations.reduce((sum, e) => sum + e, 0);
    const cost =
      layout.street.tiles.length * street +
      Math.round(lifted * BRIDGE_COST_PER_METER_TILE) +
      layout.ramps.reduce((sum, r) => sum + r.tiles.length * ramp, 0);
    return { layout, cost, refusal: interchangeRefusal(site, layout, ground) };
  }

  /**
   * What a road tool lays once the profile edits are applied to its preset:
   * the preset itself when the edits change nothing, else the composed
   * profile under its nearest tier, and whether that composition may be laid.
   */
  private roadBuild(presetTier: RoadTier): {
    tier: RoadTier;
    spec: RoadSpec;
    /** What it costs and what it needs, which is the size's price plus its reserved lanes'. */
    price: RoadPrice;
    profile: RoadProfile | null;
    layable: boolean;
    /** Why it may not be laid, in the words the player is shown, or null. */
    refusal: string | null;
  } {
    const base = presetProfileForTier(presetTier);
    const composed = composeProfile(base, this.profileEdits);
    if (profilesEqual(composed, base)) {
      const spec = this.env.roadSpec(presetTier);
      return {
        tier: presetTier,
        spec,
        // A preset is priced as itself, whatever it carries — the three that
        // used to stand alone still cost what the player has always paid.
        price: {
          costPerTile: spec.costPerTile,
          upkeepPerTile: spec.upkeepPerTile,
          unlockMilestone: spec.unlockMilestone,
        },
        profile: null,
        layable: true,
        refusal: null,
      };
    }
    const tier = tierForProfile(composed);
    // The reason travels with the refusal. Telling a player a road is "too
    // wide for the tile" when what is wrong is its lane count sends them to
    // change the wrong thing.
    const refusal = layRefusal(composed);
    const spec = this.env.roadSpec(tier);
    return {
      tier,
      spec,
      price: roadPriceOf(spec, composed),
      profile: composed,
      layable: refusal === null,
      refusal,
    };
  }

  /**
   * Why a run of `profile` may not be laid over `tiles`: the first existing
   * road outside the run that touches it and that its class may not meet, or
   * that lies across the run rather than along it, or null when every
   * neighbour is one it may take. A road already inside the run is about to be
   * replaced, so it does not count.
   */
  private meetRefusal(
    tiles: TilePoint[],
    profile: RoadProfile,
    crossings: ReadonlySet<string> = NO_CROSSINGS,
    moves: readonly EndMove[] = [],
  ): string | null {
    // Asked first and of every tile, as the world asks it: ground a road off
    // the grid holds is not the grid road's to take, over or under.
    const intoFree = this.env.gridRunRefusal?.(tiles, moves) ?? null;
    if (intoFree !== null) return intoFree;
    const at = this.env.roadProfileAt;
    if (!at) return null;
    // A tile the run passes OVER keeps the road beneath it and never meets
    // it, so neither the rank nor the class rule applies there.
    const over = (t: TilePoint): boolean => crossings.has(`${t.x},${t.z}`);
    // A road cannot be drawn THROUGH one it does not outrank: an avenue's
    // raised median leaves nowhere to cross, and a motorway has no gap in it
    // at all. Laying the tiles either side and skipping the middle would leave
    // two stubs pretending to be a road, so the whole run is refused instead —
    // unless the player asked to replace what is there.
    if (!this.flags.replaceRoad) {
      const mine = roadRank(profile);
      // Named the way the player picked them, not by the class underneath.
      const nameOf = (p: RoadProfile): string => this.env.roadSpec(tierForProfile(p)).name;
      for (const t of tiles) {
        const existing = at(t);
        if (!existing || over(t)) continue;
        if (rankedTogether(profile.class, existing.class) && roadRank(existing) <= mine) continue;
        const mineName = withArticle(nameOf(profile));
        return `${mineName[0]!.toUpperCase()}${mineName.slice(1)} can't cross ${withArticle(
          nameOf(existing),
        )}`;
      }
    }
    const inRun = new Set(tiles.map((t) => `${t.x},${t.z}`));
    for (const t of tiles) {
      if (over(t)) continue;
      for (const [dx, dz] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const n = { x: t.x + dx, z: t.z + dz };
        if (inRun.has(`${n.x},${n.z}`)) continue;
        const other = at(n);
        if (!other) continue;
        const why = joinRefusal(profile.class, other.class);
        if (why) return why;
      }
    }
    return this.rampJoinRefusal(tiles, profile, crossings);
  }

  /**
   * Where a single run of `profile` passes over the roads it crosses, and how
   * high it has to be to clear them — or why it cannot.
   *
   * A run crosses over a road that lies straight across it, at right angles,
   * when the player has raised the deck or when the two may not meet at grade:
   * a street across a motorway, anything a ramp may not touch, a road across a
   * railway. It is raised to at least what each road beneath needs, in the
   * elevation control's own steps, and it has to be long enough to climb that
   * high before it gets there. The worker applies the same rules to what this
   * sends; asking here puts the answer on the cursor first.
   */
  private overpassPlan(tiles: TilePoint[], profile: RoadProfile): OverpassPlan {
    const under = new Set<string>();
    const none: OverpassPlan = {
      crossings: NO_CROSSINGS,
      under,
      elevation: this.roadElevation,
      refusal: null,
    };
    const at = this.env.roadProfileAt;
    const maskAt = this.env.roadMaskAt;
    if (!at || !maskAt || tiles.length < 3) return none;
    const tier = tierForProfile(profile);
    const found: { index: number; beneath: RoadProfile }[] = [];
    let crossesOver = this.roadElevation > 0;
    let skew = false;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i]!;
      const beneath = at(t);
      if (!beneath) continue;
      const joined = maskAt(t);
      const shape = crossingShape(
        tiles,
        i,
        (x, z) => at({ x, z }) !== null && (joined & bitToward(x - t.x, z - t.z)) !== 0,
      );
      if (shape === 'along') continue;
      // A road standing higher than the drag is one it passes under, if that
      // road clears it and runs straight across.
      const lift = this.env.roadElevationAt?.(t) ?? 0;
      if (lift > this.roadElevation && !atOneLevel(lift, this.roadElevation)) {
        const needed = overpassRise(tierForProfile(beneath), tier);
        if (lift - this.roadElevation < needed) {
          return {
            ...none,
            refusal: `The road above has to clear this one by ${needed.toFixed(1)} m`,
          };
        }
        if (shape === 'skew') {
          return {
            ...none,
            refusal: 'A road passes under another straight across, at right angles',
          };
        }
        under.add(`${t.x},${t.z}`);
        continue;
      }
      if (
        joinRefusal(profile.class, beneath.class) !== null ||
        !rankedTogether(profile.class, beneath.class)
      ) {
        crossesOver = true;
      }
      if (shape === 'skew') skew = true;
      else found.push({ index: i, beneath });
    }
    if (!crossesOver || (found.length === 0 && !skew)) return none;
    if (skew) {
      return { ...none, refusal: 'An overpass crosses straight over a road, at right angles' };
    }
    const rise = Math.max(...found.map((f) => overpassRise(tier, tierForProfile(f.beneath))));
    const climb = Math.ceil(rise / BRIDGE_MAX_GRADE);
    if (found.some((f) => f.index < climb || tiles.length - 1 - f.index < climb)) {
      return {
        ...none,
        refusal: `Too short to climb over: an overpass needs ${climb} tiles of ramp either side`,
      };
    }
    return {
      crossings: new Set(found.map((f) => `${tiles[f.index]!.x},${tiles[f.index]!.z}`)),
      under,
      elevation: Math.max(
        this.roadElevation,
        Math.ceil(rise / ROAD_ELEVATION_STEP_M) * ROAD_ELEVATION_STEP_M,
      ),
      refusal: null,
    };
  }

  /**
   * Why a run may not be laid where a ramp would meet a motorway head-on or
   * against its traffic, or null. A ramp joins a motorway alongside it, running
   * its way, at the ramp's end or its start; read with the flows the drag will
   * lay and the ones the roads around it already carry, which is the same rule
   * the grid uses to decide where the two join.
   */
  private rampJoinRefusal(
    tiles: TilePoint[],
    profile: RoadProfile,
    crossings: ReadonlySet<string>,
  ): string | null {
    const at = this.env.roadProfileAt;
    const flowOf = this.env.roadFlowAt;
    if (!at || !flowOf) return null;
    const flows = flowsAlong(tiles);
    // A tile passed over carries this run on top and touches nothing beneath:
    // it is this road to its neighbours, and meets none of its own.
    const overFlow = new Map<string, number>();
    tiles.forEach((t, i) => {
      if (crossings.has(`${t.x},${t.z}`)) overFlow.set(`${t.x},${t.z}`, flows[i]!);
    });
    const onGround = tiles
      .map((t, i) => ({ t, flow: flows[i]! }))
      .filter(({ t }) => !overFlow.has(`${t.x},${t.z}`));
    return rampMeetingRefusal(
      onGround.map(({ t }) => t),
      onGround.map(({ flow }) => flow),
      profile.class,
      (x, z) => (overFlow.has(`${x},${z}`) ? profile.class : (at({ x, z })?.class ?? null)),
      (x, z) => overFlow.get(`${x},${z}`) ?? flowOf({ x, z }),
    );
  }

  /**
   * Every tile a bulldoze over `rect` touches, with the corridor partners it
   * takes beside it, and why the world would refuse it, or null.
   */
  private bulldozeOutline(rect: TilePoint[]): { tiles: TilePoint[]; refusal: string | null } {
    const flowAt = this.env.roadFlowAt;
    const idAt = this.env.roadProfileIdAt;
    if (!flowAt || !idAt) return { tiles: rect, refusal: null };
    const overAt = (x: number, z: number): { flow: number; profile: number } | null =>
      this.env.overRoadAt?.({ x, z }) ?? null;
    const reach = bulldozeReach(
      rect,
      {
        flowAt: (x, z) => overAt(x, z)?.flow ?? 0,
        profileIdAt: (x, z) => overAt(x, z)?.profile ?? 0,
      },
      { flowAt: (x, z) => flowAt({ x, z }), profileIdAt: (x, z) => idAt({ x, z }) },
    );
    const key = (t: TilePoint): string => `${t.x},${t.z}`;
    const seen = new Set(rect.map(key));
    const tiles = [...rect];
    for (const t of [...reach.over, ...reach.ground]) {
      if (seen.has(key(t))) continue;
      seen.add(key(t));
      tiles.push(t);
    }
    return { tiles, refusal: reach.refusal };
  }

  /**
   * Why laying `tiles` with `flows` would take a corridor half away from its
   * partner, or null. A tile counts where its road would change: replaced, or
   * the same road running another way. One the run passes over or under keeps
   * its road, and so does one already carrying this road this way.
   */
  private splitRefusal(
    tiles: readonly TilePoint[],
    flows: readonly number[],
    profileId: number,
    passing: ReadonlySet<string>,
  ): string | null {
    const flowAt = this.env.roadFlowAt;
    const idAt = this.env.roadProfileIdAt;
    if (!flowAt || !idAt) return null;
    const laid: TilePoint[] = [];
    const laidFlows: number[] = [];
    tiles.forEach((t, i) => {
      const id = idAt(t);
      if (id === 0 || passing.has(`${t.x},${t.z}`)) return;
      if (id === profileId && flowAt(t) === flows[i]) return;
      laid.push(t);
      laidFlows.push(flows[i] ?? 0);
    });
    return corridorSplitRefusal(laid, laidFlows, (x, z) =>
      corridorPartnerTile(
        x,
        z,
        (a, b) => flowAt({ x: a, z: b }),
        (a, b) => idAt({ x: a, z: b }),
      ),
    );
  }

  /**
   * Live tool-behavior flags from the tool-options panel, merged over what is
   * already set — the same shape the store's own setToolFlags has always had.
   * A caller that flips one chip says so, rather than restating every other
   * flag and silently clearing whichever one it has not heard of yet.
   */
  setFlags(flags: Partial<ToolFlags>): void {
    this.flags = { ...this.flags, ...flags };
    // Leaving the curve mode leaves the curve being drawn with it.
    if (!this.flags.curveMode) this.curveClicks = [];
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** Zone tool paint mode: `brush` (drag path) or `rect` (enclosing rectangle). */
  setZoneMode(mode: ZoneMode): void {
    this.zoneMode = mode;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** Live terrain-brush radius/strength (tool-options rows). */
  setBrush(settings: BrushSettings): void {
    this.brushSettings = settings;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /**
   * `nowTick` is the current deterministic sim tick (e.g. CityStats.tick),
   * supplied by the caller — never Date.now() — so continuous terraform
   * brushing throttles against game time. Tools other than
   * the terraform family ignore it entirely.
   */
  pointerDown(sx: number, sy: number, button: number, nowTick = 0): boolean {
    // Bus line: left-click appends a stop; right-click commits the line.
    if (isTransitTool(this._tool)) {
      if (button === 2) {
        this.commitTransitLine();
        return true;
      }
      if (button === 0) {
        const tile = this.env.screenToTile(sx, sy);
        if (tile) {
          this.transitStops.push(tile);
          this.hoverTile = tile;
          this.emitPreview(tile);
        }
        return true;
      }
      return false;
    }
    // A curve is drawn over several clicks, and turning the camera between
    // them is a right-drag, so the right button leaves a curve alone.
    if (button === 2 && this.drawingCurve()) return false;
    if (button === 2) {
      this.cancel();
      return false;
    }
    if (button !== 0 || this._tool === 'select') return false;
    if (this.drawingCurve()) {
      this.curveClick(sx, sy);
      return true;
    }
    const { tile, end } = this.dragAt(sx, sy);
    this.hoverTile = tile;
    this.hoverEnd = end;
    this.hoverPoint = this._tool === 'roundabout' ? this.cursorCm(sx, sy) : null;
    this.dragStart = tile;
    this.dragStartEnd = end;
    this.armed = tile !== null;
    this.brushTiles = [];
    this.brushSeen.clear();
    // A drag that may run at any angle remembers exactly where it started.
    const start = this.freeStraight() ? this.cursorCm(sx, sy) : null;
    this.freeDragStart = start ? this.snapEnd(start) : null;
    this.curveCursor = start;
    if (tile && isTerraformTool(this._tool)) {
      this.startTerraformStroke(tile, nowTick);
    }
    if (tile) this.emitPreview(tile);
    return true;
  }

  pointerMove(sx: number, sy: number, button: number, nowTick = 0): boolean {
    if (this._tool === 'select') return false;
    if (this.drawingCurve()) {
      this.curveCursor = this.cursorCm(sx, sy);
      this.emitCurvePreview();
      return button === 0;
    }
    const { tile, end } = this.dragAt(sx, sy);
    this.hoverTile = tile;
    this.hoverEnd = end;
    this.hoverPoint = this._tool === 'roundabout' ? this.cursorCm(sx, sy) : null;
    if (this.freeDragStart) this.curveCursor = this.cursorCm(sx, sy) ?? this.curveCursor;
    if (tile) {
      if (
        this.armed &&
        isTerraformTool(this._tool) &&
        nowTick - this.terraformLastEmitTick >= TERRAFORM_EMIT_INTERVAL_TICKS
      ) {
        this.terraformLastEmitTick = nowTick;
        this.sendTerraformDab(tile);
      }
      this.emitPreview(tile);
    } else {
      this.env.onPreview(null);
    }
    return button === 0;
  }

  pointerUp(sx: number, sy: number, button: number): boolean {
    if (this._tool === 'select') return false;
    if (button !== 0) return false;
    // A curve is clicked, not dragged: releasing the button does nothing.
    if (this.drawingCurve()) return true;
    if (this.armed && this.dragStart) {
      const at = this.dragAt(sx, sy);
      if (at.tile) this.hoverEnd = at.end;
      const end = at.tile ?? this.hoverTile ?? this.dragStart;
      const free = this.freeDrag(this.dragStart, end, this.cursorCm(sx, sy));
      if (free) this.layFree(free);
      else this.commit(this.dragStart, end);
    }
    this.armed = false;
    this.dragStart = null;
    this.dragStartEnd = null;
    this.freeDragStart = null;
    this.brushTiles = [];
    this.brushSeen.clear();
    return true;
  }

  /** Aborts any in-progress drag/hover gesture and clears the preview. */
  cancel(): void {
    this.dragStart = null;
    this.dragStartEnd = null;
    this.armed = false;
    this.curveClicks = [];
    this.freeDragStart = null;
    this.brushTiles = [];
    this.brushSeen.clear();
    this.terraformLevelTarget = null;
    this.terraformStrokeCost = 0;
    this.env.onPreview(null);
  }

  /**
   * Takes back the last click of a curve in progress, so a misplaced bend is
   * moved without starting again. Returns whether there was one to take back.
   */
  takeBackClick(): boolean {
    if (this.curveClicks.length === 0) return false;
    this.curveClicks.pop();
    this.emitCurvePreview();
    return true;
  }

  /** Whether the road tool is in its `Curve` mode and can put a click on the ground. */
  private drawingCurve(): boolean {
    return (
      this._tool in ROAD_TOOL_TO_TIER &&
      this.flags.curveMode === true &&
      this.env.worldPointAt !== undefined
    );
  }

  /**
   * Whether a road drag may run at any angle: `Straight` with the 90° lock
   * off, where the ground under the cursor can be read.
   */
  private freeStraight(): boolean {
    return (
      this._tool in ROAD_TOOL_TO_TIER &&
      this.flags.straightMode &&
      !this.flags.angleLock &&
      !this.flags.curveMode &&
      this.env.worldPointAt !== undefined
    );
  }

  /** The ground under a pixel, world centimetres. */
  private cursorCm(sx: number, sy: number): CmPoint | null {
    const p = this.env.worldPointAt?.(sx, sy);
    return p ? { x: Math.round(p.x * 100), z: Math.round(p.z * 100) } : null;
  }

  /**
   * The tile a drag starts or stops on at a pixel: the one under it, or, for a
   * road with snapping to roads on, the tile of a road end within half a tile
   * of the cursor, so the drag carries on from that end.
   */
  private dragAt(sx: number, sy: number): { tile: TilePoint | null; end: CmPoint | null } {
    const tile = this.env.screenToTile(sx, sy);
    if (!(this._tool in ROAD_TOOL_TO_TIER) || !this.flags.roadSnap) return { tile, end: null };
    const p = this.cursorCm(sx, sy);
    const end = p ? (this.env.roadEndNear?.(p) ?? null) : null;
    return end ? { tile: { x: tileOfCm(end.x), z: tileOfCm(end.z) }, end } : { tile, end: null };
  }

  /**
   * The ends of roads off the grid a grid run over `tiles` moves onto the
   * centre of the tile they lie on: the road end the drag started on and the
   * one it stops on, where either is off its tile centre and its tile is one
   * the run lays.
   */
  private endMoves(tiles: readonly TilePoint[]): EndMove[] {
    const starts = this.dragStart ? this.dragStartEnd : this.hoverEnd;
    const moves: EndMove[] = [];
    for (const end of [starts, this.hoverEnd]) {
      if (!end || isTileCentre(end)) continue;
      const to = { x: tileCentreCm(tileOfCm(end.x)), z: tileCentreCm(tileOfCm(end.z)) };
      const onRun = tiles.some((t) => t.x === tileOfCm(end.x) && t.z === tileOfCm(end.z));
      const seen = moves.some((m) => m.from.x === end.x && m.from.z === end.z);
      if (onRun && !seen) moves.push({ from: end, to });
    }
    return moves;
  }

  /**
   * Where a road end dropped at `p` lands, and whether it splits a road there.
   * One that lands on nothing is, with guide snapping on, pulled into line
   * with a road nearby — and then lands on whatever is there. With snapping to
   * roads off it lands on nothing, guided or not.
   */
  private snapEnd(p: CmPoint): RoadEndSnap {
    const land = (q: CmPoint): RoadEndSnap =>
      (this.flags.roadSnap ? this.env.snapRoadEnd?.(q) : undefined) ?? { at: q, splits: false };
    const landed = land(p);
    if (landed.splits || landed.at.x !== p.x || landed.at.z !== p.z) return landed;
    const at = this.env.roadProfileAt;
    if (!this.flags.guideSnap || !at) return landed;
    const guided = guidePoint(p, (x, z) => at({ x, z }) !== null);
    return guided.x === p.x && guided.z === p.z ? landed : land(guided);
  }

  /**
   * Where a bend clicked at `p` goes: onto the line of the road the curve
   * starts from when it is placed near that line ahead of the start, so the
   * curve carries the road on round the bend without a kink; else, or with
   * snapping to roads off, exactly where it was put.
   */
  private bendAt(p: CmPoint): CmPoint {
    if (!this.flags.roadSnap) return p;
    const start = this.curveClicks[0];
    const dir = start ? this.env.roadEndDirection?.(start.at) : null;
    if (!start || !dir) return p;
    const vx = (p.x - start.at.x) / 100;
    const vz = (p.z - start.at.z) / 100;
    const along = vx * dir.x + vz * dir.z;
    if (along <= 0) return p;
    const across = Math.abs(vx * dir.z - vz * dir.x);
    if (across > BEND_SNAP_M) return p;
    return {
      x: Math.round(start.at.x + dir.x * along * 100),
      z: Math.round(start.at.z + dir.z * along * 100),
    };
  }

  /**
   * The road a `Straight` drag at any angle lays from `startTile` to
   * `endTile`, or null where it lays a grid road instead: a drag along one row
   * or column is a grid street, as it always was, and only one that leaves it
   * runs off the grid.
   */
  private freeDrag(
    startTile: TilePoint,
    endTile: TilePoint,
    cursor: CmPoint | null,
  ): FreeRoad | null {
    const end = cursor ?? this.curveCursor;
    if (!this.freeDragStart || !end) return null;
    if (startTile.x === endTile.x || startTile.z === endTile.z) return null;
    return this.freeRoad(this.freeDragStart, null, end);
  }

  /** A road off the grid from `start`, bent toward `control`, to where `end` lands. */
  private freeRoad(start: RoadEndSnap, control: CmPoint | null, end: CmPoint): FreeRoad {
    const b = this.snapEnd(end);
    return {
      geom: { a: start.at, b: b.at, control },
      splits: [start, b].filter((e) => e.splits).map((e) => e.at),
    };
  }

  /**
   * The road a curve's clicks so far and the cursor describe: from the start
   * straight to the cursor after one click, and pulled toward the bend after
   * two. Null before the first click.
   */
  private curveRoad(cursor: CmPoint): FreeRoad | null {
    const [start, bend] = this.curveClicks;
    if (!start) return null;
    return this.freeRoad(start, bend?.at ?? null, cursor);
  }

  /** What laying `road` with the road tool's section would be: the ask, and the world's answer. */
  private judgeFree(road: FreeRoad): {
    build: ReturnType<ToolManager['roadBuild']>;
    section: RoadProfile;
    ask: FreeRoadAsk;
    plan: { ok: true; lengthM: number } | { ok: false; reason: string } | null;
  } {
    const build = this.roadBuild(ROAD_TOOL_TO_TIER[this._tool] as RoadTier);
    const section = build.profile ?? presetProfileForTier(build.tier);
    const { geom } = road;
    const ask: FreeRoadAsk = {
      tier: build.tier,
      profileId: build.profile
        ? (this.env.profileIdFor?.(build.profile) ?? build.tier)
        : build.tier,
      a: geom.a,
      b: geom.b,
      control: geom.control,
      // A one-way road runs the way it is drawn: from the first click to the last.
      flow: isOneWayProfile(section) ? 1 : 0,
      splits: road.splits,
    };
    // A road off the grid lies on the ground until it can be raised, so a deck
    // height the player set is refused rather than quietly dropped.
    const plan =
      this.roadElevation > 0
        ? {
            ok: false as const,
            reason: 'A road off the grid is laid on the ground: set the elevation to 0',
          }
        : (this.env.planFreeRoad?.(ask, section) ?? null);
    return { build, section, ask, plan };
  }

  private emitCurvePreview(): void {
    const cursor = this.curveCursor;
    // Before the first click, the mark is where that click would land.
    if (this.curveClicks.length === 0) {
      this.previewFree(null, cursor ? [this.snapEnd(cursor)] : []);
      return;
    }
    const road = cursor ? this.curveRoad(cursor) : null;
    this.previewFree(road, this.curveClicks);
  }

  /**
   * The ghost and chip of a road off the grid: its centre line at the road's
   * width, the points clicked so far, and what laying it would cost — or why
   * it would be refused.
   */
  private previewFree(road: FreeRoad | null, clicked: readonly RoadEndSnap[]): void {
    const clicks = clicked.map((c) => ({ x: c.at.x / 100, z: c.at.z / 100 }));
    const geom = road?.geom;
    if (!road || !geom || (geom.a.x === geom.b.x && geom.a.z === geom.b.z)) {
      // Nothing to draw yet but the clicks themselves.
      this.env.onPreview(
        clicks.length > 0
          ? { tiles: [], valid: true, cost: 0, label: 'Curve', curve: { centre: [], clicks } }
          : null,
      );
      return;
    }
    const { build, section, plan } = this.judgeFree(road);
    const lengthM = plan?.ok ? plan.lengthM : segmentLengthM(geom);
    const cost = Math.round((lengthM / TILE_METERS) * build.price.costPerTile);
    const judged =
      build.refusal !== null
        ? { valid: false, invalidReason: build.refusal }
        : plan === null
          ? { valid: false, invalidReason: 'Cannot be judged here' }
          : !plan.ok
            ? { valid: false, invalidReason: plan.reason }
            : this.evaluate([], cost, build.price.unlockMilestone, true);
    const radius = geom.control ? tightestRadiusM(geom) : Infinity;
    this.env.onPreview({
      tiles: [],
      valid: judged.valid,
      cost,
      label: build.spec.name,
      lengthMeters: lengthM,
      ...(Number.isFinite(radius) ? { radiusMeters: radius } : {}),
      ...(judged.invalidReason !== undefined ? { invalidReason: judged.invalidReason } : {}),
      widthMeters: profileWidth(section),
      curve: { centre: sampleCentreLine(geom).map((p) => ({ x: p.x, z: p.z })), clicks },
    });
  }

  /**
   * Lays a road off the grid, if the world would take it: the roads its ends
   * land partway along are split first, all in one undo step. Returns whether
   * it was sent.
   */
  private layFree(road: FreeRoad): boolean {
    const { build, ask, plan } = this.judgeFree(road);
    if (build.refusal !== null || !plan?.ok) return false;
    const cost = Math.round((plan.lengthM / TILE_METERS) * build.price.costPerTile);
    if (!this.evaluate([], cost, build.price.unlockMilestone, true).valid) return false;
    const segment: Command = {
      kind: 'buildSegment',
      tier: ask.tier,
      a: ask.a,
      b: ask.b,
      flow: ask.flow,
    };
    if (ask.control) segment.control = ask.control;
    if (build.profile) segment.profile = ask.profileId;
    this.env.send(build.spec.name, [
      ...road.splits.map((at): Command => ({ kind: 'splitSegment', at })),
      ...(build.profile
        ? [{ kind: 'defineRoadProfile' as const, id: ask.profileId, profile: build.profile }]
        : []),
      segment,
    ]);
    return true;
  }

  /**
   * One click of a curve: the start, the bend, then the end, which lays it —
   * if the world would take it. A refused final click does nothing, so the
   * player can move the cursor, or take back the bend, and try again.
   */
  private curveClick(sx: number, sy: number): void {
    const at = this.cursorCm(sx, sy);
    if (!at) return;
    this.curveCursor = at;
    if (this.curveClicks.length === 0) {
      // The start lands on what is there.
      this.curveClicks.push(this.snapEnd(at));
    } else if (this.curveClicks.length === 1) {
      // The bend goes where it is put, or onto the line of the road it continues.
      this.curveClicks.push({ at: this.bendAt(at), splits: false });
    } else if (this.layFree(this.curveRoad(at)!)) {
      this.curveClicks = [];
    }
    this.emitCurvePreview();
  }

  /** Advances the ploppable's rotation a quarter turn and refreshes its preview. */
  rotatePlop(): void {
    this.rotation = ((this.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    if (isPlopTool(this._tool) && this.hoverTile) {
      this.emitPreview(this.hoverTile);
    }
  }

  /** Road path for the current flags: single-axis-locked when either the
   * `90° lock` snapping chip or `Straight` tool mode is on, else the L-path. */
  /**
   * The corridor a road build lays, when the section needs two tiles.
   *
   * A section wider than the tile is not drawn wider: it is laid as two
   * carriageways side by side. The preview and the commit both read this, so
   * what a player is shown is exactly what gets built — including the refusal,
   * since a corridor can only be laid in a straight run and a drag round a
   * corner has to say so before the money is spent.
   */
  private roadCorridor(
    profile: RoadProfile | null,
    tiles: TilePoint[],
  ): { runs: CorridorRuns | null; needed: boolean } {
    const needed = profile !== null && tilesAcross(profile) === 2;
    return { needed, runs: needed ? corridorRunsFor(tiles) : null };
  }

  /** The stored flow each of a road build's tiles will carry, in the order they are laid. */
  private roadFlows(runs: CorridorRuns | null, tiles: TilePoint[]): number[] {
    if (!runs) return flowsAlong(tiles);
    return [...runs.near.map(() => runs.nearFlow), ...runs.far.map(() => runs.farFlow)];
  }

  /**
   * How far across its run each tile of a corridor is drawn from the tile's
   * centre, metres toward the higher coordinate: each half pushed against the
   * edge the two share where nothing divides them, as the world draws it. Null
   * where every tile is drawn centred.
   */
  private bandShifts(section: RoadProfile, runs: CorridorRuns | null): number[] | null {
    if (!runs) return null;
    const shift = (flow: number): number =>
      carriagewayShiftOf(
        corridorHalfProfile(worldOrderedProfile(section, flow), corridorHalfOf(flow)),
      );
    const near = shift(runs.nearFlow);
    const far = shift(runs.farFlow);
    if (near === 0 && far === 0) return null;
    return [...runs.near.map(() => near), ...runs.far.map(() => far)];
  }

  private roadPath(rawStart: TilePoint, rawEnd: TilePoint): TilePoint[] {
    // Guide snapping moves where the drag's ENDS sit, before any path is built
    // from them, so it composes with every mode rather than replacing one.
    const start = this.guided(rawStart);
    const end = this.guided(rawEnd);
    // Grid mode lays a rectangle's whole street grid, so it answers before the
    // single-run modes: a 90° lock has nothing to say about a shape that is
    // already square.
    // A motorway is never laid as a grid; with `Grid` selected it runs straight.
    const grid = this.flags.gridMode && offersGrid(this._tool);
    if (grid) return buildGridPath(start, end);
    return this.flags.angleLock || this.flags.straightMode || this.flags.gridMode
      ? straightPath(start, end)
      : buildLPath(start, end);
  }

  /** `tile` pulled into line with a nearby road run, when guide snapping is on. */
  private guided(tile: TilePoint): TilePoint {
    const at = this.env.roadProfileAt;
    if (!this.flags.guideSnap || !at) return tile;
    return snapToGuide(tile, (x, z) => at({ x, z }) !== null);
  }

  /** Brush mode's accumulated path, growing (deduped) on every call while a
   * drag is in progress; a plain hover (no drag yet) always collapses to the
   * single hovered tile, matching rect mode's hover behavior. */
  private brushTilesFor(current: TilePoint): TilePoint[] {
    if (this.dragStart === null) return [current];
    const key = `${current.x},${current.z}`;
    if (!this.brushSeen.has(key)) {
      this.brushSeen.add(key);
      this.brushTiles.push(current);
    }
    return this.brushTiles;
  }

  private zoneTiles(start: TilePoint, current: TilePoint): TilePoint[] {
    return this.zoneMode === 'brush' ? this.brushTilesFor(current) : rectTiles(start, current);
  }

  /**
   * Shared validity/invalidReason computation (cursor chip):
   * `Locked` (unlockMilestone beyond the injected milestone level) takes
   * priority over `Overlapping items` (geometry/canPlace), which takes
   * priority over `Insufficient funds`. Any check whose supporting ToolEnv
   * hook is absent is skipped entirely (never contributes a false positive).
   */
  private evaluate(
    tiles: TilePoint[],
    cost: number,
    unlockMilestone: number,
    geometryOk: boolean,
  ): { valid: boolean; invalidReason?: string } {
    const milestoneLevel = this.env.milestoneLevel?.();
    if (milestoneLevel !== undefined && unlockMilestone > milestoneLevel) {
      return { valid: false, invalidReason: 'Locked' };
    }
    const placementOk = geometryOk && (this.env.canPlace?.(tiles) ?? true);
    if (!placementOk) {
      return { valid: false, invalidReason: 'Overlapping items' };
    }
    const funds = this.env.funds?.();
    if (funds !== undefined && cost > funds) {
      return { valid: false, invalidReason: 'Insufficient funds' };
    }
    return { valid: true };
  }

  private emitPreview(current: TilePoint): void {
    const tool = this._tool;
    if (isPlopTool(tool)) {
      const entry = this.env.entry(catalogIdOf(tool));
      if (!entry) {
        this.env.onPreview(null);
        return;
      }
      const tiles = footprintTiles(current, entry, this.rotation);
      const geometryOk = tiles.every((t) => inBounds(t.x, t.z));
      const { valid, invalidReason } = this.evaluate(
        tiles,
        entry.cost,
        entry.unlockMilestone,
        geometryOk,
      );
      this.env.onPreview({ tiles, valid, cost: entry.cost, label: entry.name, invalidReason });
      return;
    }
    if (tool === 'interchange') {
      this.emitInterchangePreview(current);
      return;
    }
    if (tool === 'roundabout') {
      this.env.onPreview(this.judgeRoundabout(current)?.preview ?? null);
      return;
    }
    if (isTerraformTool(tool)) {
      this.emitTerraformPreview(current);
      return;
    }
    if (isTransitTool(tool)) {
      // Ghost the committed stops plus the tentative next stop under the cursor.
      const tiles = [...this.transitStops, current];
      this.env.onPreview({
        tiles,
        valid: tiles.length >= MIN_TRANSIT_STOPS,
        cost: 0,
        label: `${TRANSIT_MODE_LABEL[transitModeOf(tool)]} line (${this.transitStops.length} stop${this.transitStops.length === 1 ? '' : 's'})`,
      });
      return;
    }
    if (isDistrictTool(tool)) {
      const startTile = this.dragStart ?? current;
      const tiles = this.zoneTiles(startTile, current);
      const { valid, invalidReason } = this.evaluate(tiles, 0, 0, true);
      this.env.onPreview({
        tiles,
        valid,
        cost: 0,
        label: `District ${this.districtId}`,
        invalidReason,
      });
      return;
    }
    if (isPaintLandfillTool(tool)) {
      const startTile = this.dragStart ?? current;
      const tiles = this.zoneTiles(startTile, current);
      const cost = tiles.length * LANDFILL_PAINT_COST_PER_TILE;
      const { valid, invalidReason } = this.evaluate(tiles, cost, 1, true);
      this.env.onPreview({ tiles, valid, cost, label: 'Landfill', invalidReason });
      return;
    }

    if (isPowerLineTool(tool)) {
      const startTile = this.dragStart ?? current;
      const tiles = this.roadPath(startTile, current);
      // Only the tiles that would actually change are quoted, so dragging back
      // over a run already strung shows what it costs: nothing.
      const fresh = tiles.filter((t) => !this.env.powerLineAt?.(t.x, t.z));
      const cost = fresh.length * POWER_LINE_COST_PER_TILE;
      const { valid, invalidReason } = this.evaluate(tiles, cost, 0, true);
      this.env.onPreview({ tiles, valid, cost, label: 'Power line', invalidReason });
      return;
    }

    const start = this.dragStart ?? current;
    if (tool === 'bulldoze') {
      const { tiles, refusal } = this.bulldozeOutline(rectTiles(start, current));
      const evaluated = this.evaluate(tiles, 0, 0, true);
      const valid = evaluated.valid && refusal === null;
      const invalidReason = refusal ?? evaluated.invalidReason;
      this.env.onPreview({ tiles, valid, cost: 0, label: 'Bulldoze', invalidReason });
    } else if (tool in ROAD_TOOL_TO_TIER) {
      // A drag at any angle that has left its row or column runs off the grid.
      const free =
        this.armed && this.dragStart ? this.freeDrag(this.dragStart, current, null) : null;
      if (free && this.freeDragStart) {
        this.previewFree(free, [this.freeDragStart]);
        return;
      }
      const build = this.roadBuild(ROAD_TOOL_TO_TIER[tool] as RoadTier);
      const path = this.roadPath(start, current);
      // A section too wide for one tile is laid as two carriageways, so the
      // preview outlines both and the cost covers both.
      const corridor = this.roadCorridor(build.profile, path);
      const tiles = corridor.runs ? corridorTiles(corridor.runs) : path;
      const cost = tiles.length * build.price.costPerTile;
      const evaluated = this.evaluate(tiles, cost, build.price.unlockMilestone, true);
      // A composition the tile cannot hold, or a run touching a road its class
      // may not meet, is refused here with the reason rather than laid as
      // something else.
      const section = build.profile ?? presetProfileForTier(build.tier);
      // A corridor is two runs side by side; only a single run crosses over.
      const overpass = corridor.runs ? null : this.overpassPlan(tiles, section);
      const profileId = build.profile
        ? (this.env.profileIdFor?.(build.profile) ?? build.tier)
        : build.tier;
      const meet =
        overpass?.refusal ??
        this.meetRefusal(tiles, section, passingBy(overpass), this.endMoves(tiles)) ??
        this.splitRefusal(
          tiles,
          this.roadFlows(corridor.runs, tiles),
          profileId,
          passingBy(overpass),
        );
      const { valid, invalidReason } =
        build.refusal !== null
          ? { valid: false, invalidReason: build.refusal }
          : corridor.needed && !corridor.runs
            ? { valid: false, invalidReason: 'A corridor is laid in a straight run' }
            : meet !== null
              ? { valid: false, invalidReason: meet }
              : evaluated;
      // What the ghost is drawn at: the composed section's own width, halved
      // for a corridor because each of its two tile rows carries one
      // carriageway and corridorHalfProfile splits it exactly down the middle.
      const previewProfile = build.profile ?? presetProfileForTier(build.tier);
      const sectionWidth = profileWidth(previewProfile);
      // Drawn at the deck it will be laid at: the height commit sends, solved
      // over each run as the world solves it.
      const deckLifts = this.deckLiftsFor(
        corridor.runs ? [corridor.runs.near, corridor.runs.far] : [tiles],
        overpass?.elevation ?? this.roadElevation,
      );
      const bandShifts = this.bandShifts(previewProfile, corridor.runs);
      this.env.onPreview({
        ...(deckLifts ? { deckLifts } : {}),
        ...(bandShifts ? { bandShifts } : {}),
        tiles,
        valid,
        cost,
        label:
          overpass && overpass.crossings.size > 0
            ? `${build.spec.name} overpass, ${overpass.elevation} m`
            : overpass && overpass.under.size > 0
              ? `${build.spec.name}, passing under`
              : build.spec.name,
        // The road is as long as the drag, not as long as both its
        // carriageways added together.
        lengthMeters: path.length * TILE_METERS,
        widthMeters: corridor.runs ? sectionWidth / 2 : sectionWidth,
        invalidReason,
      });
    } else if (tool in ZONE_TOOL_TO_TYPE) {
      const label = ZONE_TOOL_TO_LABEL[tool] ?? 'Zone';
      const tiles = this.zoneTiles(start, current);
      const { valid, invalidReason } = this.evaluate(tiles, 0, 0, true);
      this.env.onPreview({ tiles, valid, cost: 0, label, invalidReason });
    }
  }

  /**
   * How high each tile of `runs`, in order, would be laid when asked for
   * `elevation`, or undefined where every one of them lies on the ground. A
   * run whose deck cannot be solved lies on the ground; the command's refusal
   * says why.
   */
  private deckLiftsFor(runs: TilePoint[][], elevation: number): number[] | undefined {
    const solve = this.env.deckLifts;
    if (!solve) return undefined;
    const lifts = runs.flatMap((run) => solve(run, elevation) ?? run.map(() => 0));
    return lifts.some((lift) => lift > 0) ? lifts : undefined;
  }

  /** Drag-start setup for a terraform stroke: samples the
   * Level target height once, resets the running cost, and fires the first
   * "dab" immediately (a lone click still edits, matching every other
   * brush tool's committed-on-click feel). */
  private startTerraformStroke(tile: TilePoint, nowTick: number): void {
    this.terraformLevelTarget =
      this._tool === 'terraform.level' ? (this.env.heightAt?.(tile) ?? 0) : null;
    this.terraformStrokeCost = 0;
    this.terraformLastEmitTick = nowTick;
    this.sendTerraformDab(tile);
  }

  /** Disc tiles the sim kernel would actually edit (excludes anything the env reports as structure-covered). */
  private editableTileCount(disc: TilePoint[]): number {
    const hasStructure = this.env.hasStructure;
    return hasStructure ? disc.filter((t) => !hasStructure(t)).length : disc.length;
  }

  /**
   * A deliberate client-side ESTIMATE, not the sim's exact charge (which
   * depends on the smoothstep falloff and the current heights under the
   * brush — data this pure, env-injected tool layer has no bulk access to):
   * editable-tile count * strength * the shared ¢/m/tile rate. Good enough
   * for a live running-cost readout; the worker ack remains the
   * authoritative charge ("funds-gated like every edit").
   */
  private estimateCost(disc: TilePoint[], strength: number): number {
    return this.editableTileCount(disc) * strength * TERRAFORM_COST_PER_METER_TILE;
  }

  /** Sends one throttled terraform command at `tile` with the current brush settings, and folds its cost estimate into the stroke's running total. */
  private sendTerraformDab(tile: TilePoint): void {
    const mode = TERRAFORM_TOOL_TO_MODE[this._tool];
    if (!mode) return;
    const { radius, strength } = this.brushSettings;
    const disc = brushDiscTiles(tile, radius);
    this.terraformStrokeCost += this.estimateCost(disc, strength);
    const command: Command = {
      kind: 'terraform',
      mode,
      center: tile,
      radius,
      strength,
      ...(mode === 'level' ? { targetHeight: this.terraformLevelTarget ?? 0 } : {}),
    };
    this.env.send(TERRAFORM_TOOL_TO_LABEL[this._tool] ?? 'Terraform', [command]);
  }

  /** The cursor-chip label: the plain tool name, except
   * Level mid-drag, which embeds its drag-start-sampled flatten target. */
  private terraformLabel(tool: ToolId): string {
    const base = TERRAFORM_TOOL_TO_LABEL[tool] ?? 'Terraform';
    if (
      tool === 'terraform.level' &&
      this.dragStart !== null &&
      this.terraformLevelTarget !== null
    ) {
      return `${base} → ${this.terraformLevelTarget.toFixed(1)}m`;
    }
    return base;
  }

  /** Terraform ghost preview: a brush-radius ring at the
   * hovered tile, invalid only when the whole underlying disc is
   * structure-excluded; cost is a running stroke total while dragging, or a
   * single-dab estimate while only hovering. */
  private emitTerraformPreview(current: TilePoint): void {
    const tool = this._tool;
    const { radius, strength } = this.brushSettings;
    const ring = brushRingTiles(current, radius);
    const disc = brushDiscTiles(current, radius);
    const hasStructure = this.env.hasStructure;
    const structureExcluded = hasStructure ? disc.every((t) => hasStructure(t)) : false;
    const cost =
      this.dragStart !== null ? this.terraformStrokeCost : this.estimateCost(disc, strength);
    const { valid, invalidReason } = this.evaluate(disc, cost, 0, !structureExcluded);
    this.env.onPreview({
      tiles: ring,
      valid,
      cost,
      label: this.terraformLabel(tool),
      invalidReason,
    });
  }

  /**
   * The interchange centred on `at`, every tile of it, the street at its deck,
   * and whether it may be laid: the site's and the layout's refusals first,
   * then the milestone and the funds every tool is judged by.
   */
  private judgeInterchange(
    at: TilePoint,
  ): { preview: ToolPreview; layout: InterchangeLayout | null } | null {
    const plan = this.interchangePlan(at);
    if (!plan) return null;
    const { layout, cost, refusal } = plan;
    const label = INTERCHANGE_LABEL[this.interchange.form];
    const tiles = layout ? [...layout.street.tiles, ...layout.ramps.flatMap((r) => r.tiles)] : [at];
    // Every road it lays has to be unlocked, or the world would lay the rest.
    const unlock = Math.max(
      ...[RoadTierValue.Highway, RoadTierValue.Ramp, this.interchange.streetTier].map(
        (tier) => this.env.roadSpec(tier).unlockMilestone,
      ),
    );
    const judged = this.evaluate(tiles, cost, unlock, true);
    const lifts = layout
      ? [...layout.street.elevations, ...layout.ramps.flatMap((r) => r.tiles.map(() => 0))]
      : null;
    const reason = refusal ?? judged.invalidReason;
    const preview: ToolPreview = {
      tiles,
      valid: refusal === null && judged.valid,
      cost,
      label,
      ...(reason !== undefined ? { invalidReason: reason } : {}),
      ...(lifts && lifts.some((l) => l > 0) ? { deckLifts: lifts } : {}),
    };
    return { preview, layout };
  }

  private emitInterchangePreview(at: TilePoint): void {
    this.env.onPreview(this.judgeInterchange(at)?.preview ?? null);
  }

  /**
   * The compact roundabout the Roundabout tool would lay at the junction `at`,
   * on the quarter of the tile the pointer is over, and whether it may be laid:
   * the site's refusal first, then the milestone and the funds the road it
   * lays is judged by. The corner tiles it lays are the junction's own road.
   */
  private judgeRoundabout(at: TilePoint): {
    preview: ToolPreview;
    plan: RoundaboutPlan;
    tier: RoadTier;
    profile?: number;
  } | null {
    const ground = this.env.roundaboutGround?.();
    if (!ground) return null;
    const p = this.hoverPoint;
    const east = p ? p.x / 100 >= (at.x + 0.5) * TILE_METERS : true;
    const south = p ? p.z / 100 >= (at.z + 0.5) * TILE_METERS : true;
    const plan = roundaboutAtJunction(at, east, south, ground);
    const tier = ground.roadAt(at.x, at.z)?.tier ?? RoadTierValue.TwoLane;
    const spec = this.env.roadSpec(tier);
    const cost = plan.toLay.length * spec.costPerTile;
    const tiles = blockTiles(plan.block);
    const judged = this.evaluate(
      tiles,
      cost,
      plan.toLay.length > 0 ? spec.unlockMilestone : 0,
      true,
    );
    const reason = plan.refusal ?? judged.invalidReason;
    const id = this.env.roadProfileIdAt?.(at) ?? 0;
    const preview: ToolPreview = {
      tiles,
      valid: plan.refusal === null && judged.valid,
      cost,
      label: ROUNDABOUT_LABEL,
      ...(reason !== undefined ? { invalidReason: reason } : {}),
    };
    return { preview, plan, tier, ...(id !== 0 && id !== tier ? { profile: id } : {}) };
  }

  private commit(start: TilePoint, end: TilePoint): void {
    const tool = this._tool;
    if (tool === 'roundabout') {
      // Asked again as it is laid, and nothing sent unless all of it can be.
      const judged = this.judgeRoundabout(end);
      if (judged?.preview.valid) {
        this.env.send(
          ROUNDABOUT_LABEL,
          roundaboutCommands(judged.plan, judged.tier, judged.profile),
        );
      }
      return;
    }
    if (tool === 'interchange') {
      // Asked again as it is laid, and nothing sent unless all of it can be:
      // a batch the world refused partway would leave half an interchange.
      const judged = this.judgeInterchange(end);
      if (judged?.layout && judged.preview.valid) {
        this.env.send(
          INTERCHANGE_LABEL[this.interchange.form],
          interchangeCommands(judged.layout, this.interchange.streetTier),
        );
      }
      return;
    }
    if (isPlopTool(tool)) {
      const catalogId = catalogIdOf(tool);
      const entry = this.env.entry(catalogId);
      if (entry) {
        this.env.send(entry.name, [
          { kind: 'placeBuilding', catalogId, x: end.x, z: end.z, rotation: this.rotation },
        ]);
      }
    } else if (tool === 'bulldoze') {
      const tiles = rectTiles(start, end);
      if (this.bulldozeOutline(tiles).refusal === null) {
        this.env.send('Bulldoze', [{ kind: 'bulldoze', tiles }]);
      }
    } else if (tool in ROAD_TOOL_TO_TIER) {
      const build = this.roadBuild(ROAD_TOOL_TO_TIER[tool] as RoadTier);
      const path = this.roadPath(start, end);
      const corridor = this.roadCorridor(build.profile, path);
      const tiles = corridor.runs ? corridorTiles(corridor.runs) : path;
      const profileId = build.profile ? this.env.profileIdFor?.(build.profile) : undefined;
      const section = build.profile ?? presetProfileForTier(build.tier);
      const overpass = corridor.runs ? null : this.overpassPlan(tiles, section);
      // The deck height to send: what the player asked for, raised as far as
      // any road the run crosses over needs.
      const elevation = overpass?.elevation ?? this.roadElevation;
      const moves = this.endMoves(tiles);
      const refused =
        (build.profile && !build.layable) ||
        (corridor.needed && !corridor.runs) ||
        (overpass?.refusal ?? null) !== null ||
        this.meetRefusal(tiles, section, passingBy(overpass), moves) !== null ||
        this.splitRefusal(
          tiles,
          this.roadFlows(corridor.runs, tiles),
          profileId ?? build.tier,
          passingBy(overpass),
        ) !== null;
      // The curve ends the run meets move onto their tile centres first, so the
      // grid road finds them there.
      const moveEnds = moves.map((m): Command => ({
        kind: 'moveSegmentEnd',
        from: m.from,
        to: m.to,
      }));
      // How the road meets the roads beside it: joined, or laid as its own.
      const options = {
        ...(this.flags.replaceRoad ? { replace: true } : {}),
        ...(this.flags.roadSnap ? {} : { join: false }),
      };
      if (refused) {
        // The preview already said why; laying nothing is the whole answer.
      } else if (corridor.runs && build.profile && profileId !== undefined) {
        // Two carriageways of ONE road: each run is its own contiguous path
        // and carries the flow byte saying which half of the section it holds.
        // One batch, so undo takes the whole road down rather than half of it.
        const runs = corridor.runs;
        const lay = (
          runTiles: TilePoint[],
          flow: number,
        ): Extract<Command, { kind: 'buildRoad' }> => ({
          kind: 'buildRoad',
          tier: build.tier,
          tiles: runTiles,
          elevation: this.roadElevation,
          profile: profileId,
          flows: runTiles.map(() => flow),
          ...options,
        });
        this.env.send(build.spec.name, [
          ...moveEnds,
          { kind: 'defineRoadProfile', id: profileId, profile: build.profile },
          lay(runs.near, runs.nearFlow),
          lay(runs.far, runs.farFlow),
        ]);
      } else if (build.profile && profileId !== undefined) {
        // Define and lay in one batch, so undo treats them as one edit and a
        // definition the worker refuses takes the road down with it.
        this.env.send(build.spec.name, [
          ...moveEnds,
          { kind: 'defineRoadProfile', id: profileId, profile: build.profile },
          {
            kind: 'buildRoad',
            tier: build.tier,
            tiles,
            elevation,
            profile: profileId,
            ...options,
          },
        ]);
      } else {
        this.env.send(build.spec.name, [
          ...moveEnds,
          { kind: 'buildRoad', tier: build.tier, tiles, elevation, ...options },
        ]);
      }
    } else if (tool in ZONE_TOOL_TO_TYPE) {
      const zone = ZONE_TOOL_TO_TYPE[tool] as ZoneType;
      const label = ZONE_TOOL_TO_LABEL[tool] ?? 'Zone';
      this.env.send(label, [{ kind: 'paintZone', zone, tiles: this.zoneTiles(start, end) }]);
    } else if (isDistrictTool(tool)) {
      // Stamp the selected district id over the brushed/rect tiles.
      this.env.send(`District ${this.districtId}`, [
        { kind: 'paintDistrict', districtId: this.districtId, tiles: this.zoneTiles(start, end) },
      ]);
    } else if (isPaintLandfillTool(tool)) {
      // Paint the landfill area over the brushed/rect tiles (sim gates to empty land).
      this.env.send('Landfill', [
        { kind: 'paintLandfill', tiles: this.zoneTiles(start, end), on: true },
      ]);
    } else if (isPowerLineTool(tool)) {
      // String the run the drag traced; the sim gates each tile and charges
      // only for the ones that change.
      this.env.send('Power line', [
        { kind: 'stringPowerLine', tiles: this.roadPath(start, end), on: true },
      ]);
    }
    this.env.onPreview(null);
  }

  /**
   * Commits the pending line (>= MIN_TRANSIT_STOPS stops) as a
   * createTransitLine command with the next palette color, then resets the
   * pending-stop list. A right-click with too few stops just clears them.
   */
  private commitTransitLine(): void {
    if (this.transitStops.length >= MIN_TRANSIT_STOPS) {
      const color = TRANSIT_LINE_PALETTE[this.transitColorIndex % TRANSIT_LINE_PALETTE.length]!;
      this.transitColorIndex += 1;
      const mode = transitModeOf(this._tool);
      this.env.send(`${TRANSIT_MODE_LABEL[mode]} line`, [
        {
          kind: 'createTransitLine',
          line: { id: 0, stops: [...this.transitStops], color, mode },
        },
      ]);
    }
    this.transitStops = [];
    this.env.onPreview(null);
  }
}
