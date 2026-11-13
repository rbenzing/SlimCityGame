/**
 * Road furniture: deterministic clutter placed from the road tile set alone —
 * MANHOLE covers in the carriageway, curbside UTILITY BOXES, PARKING METERS,
 * and TRAFFIC SIGNS. Every prop is one merged, instanced geometry (one draw
 * call per prop kind regardless of count). Placement is a pure function of tile
 * coordinates and neighbor presence (no rng, no Date.now); a local triple32
 * hash drives per-tile selection, side, and jitter so a given road always
 * renders the same furniture. Orientation/curbside is derived from which
 * neighbor tiles are present (the tile stream carries no connection mask),
 * exactly as the street-lamp placer does.
 */
import * as THREE from 'three';
import {
  corridorHalfOf,
  flowDirection,
  flowForStep,
  isStreetTier,
  RoadFlow,
  RoadTier,
  stepForFlow,
  TilePoint,
} from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import {
  carriagewayHalfWidthMeters,
  curbWidthMeters,
  ROAD_Y_OFFSET,
  CURB_Y_OFFSET,
} from './roadsmesh';
import {
  carriagewayHalfWidthOf,
  carriagewayShiftOf,
  carriagewayWidth,
  hasFootway,
  isOneWayProfile,
  isParkingLane,
  kerbWidthOf,
  parkingSides,
  plainLaneCentres,
  presetProfileForTier,
  rankForTier,
  roadClass,
  runsAgainstDrawing,
} from '../shared/roadprofile';
import { armGivesWay, signalAspect } from '../shared/junction';
import type { SignalAspect } from '../shared/junction';
import { corridorPartnerTile, rampJoinAround } from '../shared/corridor';
import type { RampJoin } from '../shared/corridor';
import { isSeparateRoad } from '../shared/approachzone';
import type { SeparateRoadSurroundings } from '../shared/approachzone';
import type { JunctionControl, RoadProfile } from '../shared/types';
import { materialHex } from './palette';
import { MIN_INSTANCE_CAPACITY, setInstanceCount } from './groundquad';
import {
  firstFreeAlong,
  MAST_BEHIND_KERB_M,
  MAST_PAST_JUNCTION_M,
  placeIsFree,
  SIGN_BEHIND_KERB_M,
  SIGN_BOTTOM_NO_WALK_M,
  SIGN_BOTTOM_OVER_WALK_M,
  SIGN_NO_KERB_M,
  SLIDE_LIMIT_M,
  type Roadside,
  type Spot,
} from './roadsidespace';

// --- Manhole -----------------------------------------------------------------
const MANHOLE_RADIUS = 0.5;
const MANHOLE_HEIGHT = 0.06; // rim thickness — stays low and flat
const MANHOLE_SEGMENTS = 24;
/** Cast iron: a dark rim, groove and seam round a lighter centre plate. */
export const MANHOLE_RIM_COLOR = materialHex('darkBitumen');
export const MANHOLE_PLATE_COLOR = materialHex('slateRoof');
/**
 * A hair proud of the ASPHALT, which is itself ROAD_Y_OFFSET above the ground
 * the props are seated from. Lifting only by this put the cover 0.06 m under
 * the carriageway: every one of them was drawn, and not one was visible.
 */
export const MANHOLE_LIFT = ROAD_Y_OFFSET + 0.03;
/**
 * The longest a maintenance standard lets a sewer run between accesses: 400 ft.
 */
const MANHOLE_MAX_SPACING_M = 121.92;
/**
 * How far apart covers sit ALONG a run, in tiles.
 *
 * A cover is the top of a sewer manhole, and a sewer has one where it needs
 * access — at a change of direction, a junction of pipes, and otherwise at the
 * longest interval allowed. So the period is the most tiles that fit inside
 * that interval, counted from the tile rather than written down: a figure
 * written down is one that keeps its old value when the tile changes size and
 * silently starts spacing covers further apart than any real street does.
 * Scattering a cover over an eighth of every tile, which is what this was, put
 * them across the running lanes at a density no street has.
 */
const MANHOLE_PERIOD_TILES = Math.max(1, Math.floor(MANHOLE_MAX_SPACING_M / TILE_METERS));

// --- Utility / electrical box ------------------------------------------------
const BOX_WIDTH = 0.62;
const BOX_HEIGHT = 1.2; // overall height — plinth + body + top cap
const BOX_DEPTH = 0.44;
const BOX_BODY_COLOR = 0x4c5a4c; // grey-green cabinet body
const BOX_DOOR_COLOR = 0x3f4a3f; // proud front door panel
const BOX_TRIM_COLOR = 0x2c332c; // plinth, cap and door seam
const BOX_SELECT_FRACTION = 1 / 12; // ~1 in 12 curbed tiles

// --- Telco pedestal ----------------------------------------------------------
/**
 * The round pedestal that stands on a verge beside a great many American
 * streets — a squat capped cylinder rather than a cabinet. It shares the
 * cabinet's slot and its siting; only its shape and colour differ, so a street
 * gets a mix of the two instead of a row of identical boxes.
 */
const PEDESTAL_RADIUS = 0.17;
const PEDESTAL_BODY_HEIGHT = 0.72;
const PEDESTAL_DOME_HEIGHT = 0.12;
const PEDESTAL_PAD_RADIUS = PEDESTAL_RADIUS + 0.07;
const PEDESTAL_PAD_HEIGHT = 0.06;
const PEDESTAL_RADIAL_SEGMENTS = 12;
const PEDESTAL_BODY_COLOR = 0x2f5d3a; // the green they are almost always painted
const PEDESTAL_DOME_COLOR = 0x264d31; // the cap, a shade deeper
const PEDESTAL_PAD_COLOR = 0x8a8a82; // the concrete pad it is bolted to
/** Of the tiles that earn a cabinet, the share that get a pedestal instead. */
const PEDESTAL_SHARE = 0.45;

// --- Parking meter -----------------------------------------------------------
const METER_POLE_RADIUS = 0.05;
const METER_POLE_HEIGHT = 0.85;
const METER_HEAD_W = 0.2;
const METER_HEAD_H = 0.26;
const METER_HEAD_D = 0.14;
const METER_POLE_COLOR = 0x6d6f74; // dark metal pole and top cap
const METER_HEAD_COLOR = 0x9a9ba0; // silver meter head
const METER_DISPLAY_COLOR = 0x20242a; // dark display face
const METER_PERIOD = 5; // a meter pair on every (x+z) multiple of 5
const METER_ALONG = 3; // the pair straddles the tile center by ±3m along the run
/** How far behind the kerb face a roadside pole's centre stands: 18 in, in the furnishing strip. */
export const POLE_BEHIND_KERB_M = 0.46;

/** How far behind the kerb face a meter stands, so it is beside its bay and clear of the traffic. */
export const METER_KERB_CLEARANCE_M = POLE_BEHIND_KERB_M;

/**
 * A cabinet's near face stands this far behind the kerb face, so its body fills
 * the 0.6 m furnishing strip and leaves the walk behind it clear.
 */
const CABINET_BEHIND_KERB_M = 0.1;

/** A meter pair's ±3 m, and how far a meter slides along its strip to find a free place. */
const METER_SLIDE_LIMIT_M = 2;

// --- Traffic signs -----------------------------------------------------------
// Standard road signs, each a recognizable shape+color on the shared pole.
const SIGN_POLE_RADIUS = 0.04;
const SIGN_BOARD = 0.6; // board footprint used to seat every type near the pole top
/** The pole stands so that the bottom of a full-size board is 2.1 m over the ground it stands on. */
const SIGN_POLE_HEIGHT = SIGN_BOTTOM_OVER_WALK_M + SIGN_BOARD + 0.05;
const SIGN_BOARD_Y = SIGN_POLE_HEIGHT - SIGN_BOARD / 2 - 0.05; // board center height
/** The bottom of a full-size board over the ground at its pole's foot: 2.1 m. */
export const SIGN_BOARD_BOTTOM_M = SIGN_BOARD_Y - SIGN_BOARD / 2;
const SIGN_POLE_COLOR = 0x50555d; // charcoal pole

// --- Traffic signals ---------------------------------------------------------
const SIGNAL_MAST_RADIUS = 0.07;
/** Tall enough that the head's bottom hangs 4.6 m over the road: the least a signal head clears. */
const SIGNAL_MAST_HEIGHT = 5.6;
const SIGNAL_ARM_LENGTH = 1.9;
const SIGNAL_ARM_THICKNESS = 0.09;
const SIGNAL_HEAD_WIDTH = 0.34;
const SIGNAL_HEAD_HEIGHT = 0.86;
const SIGNAL_HEAD_DEPTH = 0.24;
const SIGNAL_LENS_RADIUS = 0.1;
const SIGNAL_LENS_SPACING = 0.26;
const SIGNAL_HOUSING_COLOR = 0x2f3338;
const SIGNAL_RED = 0xd6402f;
const SIGNAL_AMBER = 0xe8a33a;
const SIGNAL_GREEN = 0x46b360;
/** Where a signal head's bottom and top hang over the ground the mast stands on, metres. */
export const SIGNAL_HEAD_BOTTOM_M = SIGNAL_MAST_HEIGHT - SIGNAL_ARM_THICKNESS - SIGNAL_HEAD_HEIGHT;
export const SIGNAL_HEAD_TOP_M = SIGNAL_MAST_HEIGHT - SIGNAL_ARM_THICKNESS;
/** How far a signal's arm reaches out from its mast, metres. */
export const SIGNAL_ARM_REACH_M = SIGNAL_ARM_LENGTH;
/** Red, amber and green UNLIT: dark glass, so a head reads as a signal with nothing burning. */
const SIGNAL_LENS_DARK = [0x4a2620, 0x4d3a1f, 0x1f4a2c] as const;

/**
 * Which side of its arm a cantilever's face is on, in its own frame: +1 or -1
 * along local z.
 *
 * A cantilever is authored reaching along +X and turned by `signalYaw`, which
 * swings the arm in over the road from whichever kerb the mast stands on. The
 * face is fixed to the arm, so that one turn decides both. On a right-hand
 * network the mast stands on the approaching driver's right with the arm
 * reaching left, and from there local -Z is the side that looks back down the
 * lanes at them. The face on +Z was a left-hand cantilever: every signal
 * showed its own drivers its back and the drivers across the junction its lit
 * face.
 */
export const CANTILEVER_FACE_Z = -1;

// --- Motorway signage --------------------------------------------------------
const HIGHWAY_GREEN = 0x1d6b45; // the standard motorway board green
const ADVISORY_YELLOW = 0xe0b230; // ramp advisory-speed plaque
const ADVISORY_PLAQUE = 0.5;
const EXIT_POST_HEIGHT = 5.2;
const EXIT_POST_RADIUS = 0.13;
/** How far the cantilever arm reaches out over the carriageway. */
const EXIT_ARM_LENGTH = 3.2;
const EXIT_TRUSS_DEPTH = 0.42;
const EXIT_BOARD_WIDTH = 2.8;
const EXIT_BOARD_HEIGHT = 1.5;
/** Tiles between overhead gantries along a straight motorway run. */
const GANTRY_PERIOD = 12;
const GANTRY_HEIGHT = 6.4; // clears anything the vehicle kit puts on the road
const GANTRY_LEG_RADIUS = 0.12;
const GANTRY_LEG_CLEARANCE = 1.2; // legs stand outside both shoulders
const GANTRY_TRUSS_DEPTH = 0.62;
const GANTRY_PANEL_WIDTH = 5.2;
const GANTRY_PANEL_HEIGHT = 1.6;
const GANTRY_STEEL = 0x8d9299; // galvanised legs and truss beam
const SIGN_RED = 0xc0392b; // regulatory / warning red
const SIGN_WHITE = 0xf0f0f0; // sign white
const SIGN_FIELD = 0xf3e9b5; // pale warning-triangle field
const SIGN_BLUE = 0x1f6fd0; // one-way blue
const ONEWAY_SIGN_PERIOD = 6; // a one-way marker on every (x+z) multiple of 6
const SPEED_SIGN_PERIOD = 10; // a speed marker on every (x+z) multiple of 10

// --- Tram contact pole ------------------------------------------------------
// A streetcar's overhead pole: 35 ft (10.7 m) with a bracket arm reaching
// 1.9 m over the track, the arm at the contact wire's height (19 ft, rounded up
// to clear the arm), one every 22 m — El Paso's 420 poles over 29,500 ft and
// Oklahoma City's 243 over 18,000 ft. The wire itself is not drawn.
export const TRAM_POLE_HEIGHT_M = 10.7;
export const TRAM_POLE_RADIUS_M = 0.125;
export const TRAM_POLE_ARM_LENGTH_M = 1.9;
export const TRAM_POLE_ARM_HEIGHT_M = 6.0;
export const TRAM_POLE_SPACING_M = 22;
const TRAM_POLE_ARM_THICKNESS_M = 0.1;
const TRAM_POLE_SEGMENTS = 8;
const TRAM_POLE_COLOR = materialHex('metalPlates');

// Distinct hash slots so each per-tile draw is decorrelated from the others.
const HASH_MANHOLE_ROT = 4;
const HASH_BOX_SELECT = 5;
const HASH_BOX_SIDE = 6;
const HASH_METER_SIDE = 7;
const HASH_SIGN_SIDE = 8;
const HASH_CABINET_KIND = 9;

// ---------------------------------------------------------------------------
// Deterministic hashing (never Math.random/Date.now) — a local copy of the
// triple32 recipe shared verbatim across the render layer.
// ---------------------------------------------------------------------------

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Wide fixed stride so (x,z) pairs never collide. */
export function tileKey(x: number, z: number): number {
  return x * 100_000 + z;
}

/** Per-tile hash in [0,1) for a given draw slot. */
function hashTile(x: number, z: number, slot: number): number {
  return hash1(tileKey(x, z) * 16 + slot);
}

export type FurnitureAxis = 'x' | 'z';
export type FurnitureSide = 1 | -1;

/**
 * A road tile furniture may sit on; `tier` is optional (undefined -> TwoLane),
 * `elevated` marks a tile up on a bridge deck (undefined -> on the ground).
 */
export type FurnitureRoadTile = TilePoint & {
  tier?: RoadTier;
  elevated?: boolean;
  /** The tile's own cross-section when it carries a composed one; kerb props stand at ITS edge. */
  profile?: RoadProfile;
  /**
   * The tile's stored flow byte. A direction in it means one carriageway
   * running that way, so both kerbs watch the same stream and only the byte
   * says which way it goes; absent, or no direction in it, means two-way.
   */
  flow?: number;
  /**
   * Who gives way here, when this tile is a junction the sim has controlled.
   * Absent means uncontrolled, which is what every junction was before the sim
   * worked one out.
   */
  control?: JunctionControl;
  /** The arms of the tile held apart from the roads beside it, as mask bits; absent where none are. */
  apart?: number;
  /** The id of the cross-section the tile carries, which says two corridor halves are one road. */
  profileId?: number;
  /**
   * A corner of a compact roundabout. The tile is its quarter of the ring,
   * which nothing stands in; the roads into it carry the ring's boards.
   */
  ring?: true;
};

/** Carriageway half-width and kerb width for a tile: its own profile's, else its tier's preset. */
function edgeOf(tile: { tier?: RoadTier; profile?: RoadProfile }): { half: number; kerb: number } {
  if (tile.profile) {
    return { half: carriagewayHalfWidthOf(tile.profile), kerb: kerbWidthOf(tile.profile) };
  }
  const t = tile.tier ?? RoadTier.TwoLane;
  return { half: carriagewayHalfWidthMeters(t), kerb: curbWidthMeters(t) };
}

/** A curbside sidewalk edge: the world axis to offset along and its sign. */
interface SideChoice {
  axis: FurnitureAxis;
  side: FurnitureSide;
}

export interface ManholePlacement {
  x: number;
  z: number;
  /** Lateral offset axis (perpendicular to the road run). */
  axis: FurnitureAxis;
  /** Signed meters from the centerline, kept inside the carriageway. */
  lateral: number;
  /** Hashed spin about Y (radians). */
  rotationY: number;
}

/** Which cabinet stands here: the rectangular one, or the round telco pedestal. */
export type CabinetKind = 'cabinet' | 'pedestal';

export interface BoxPlacement {
  x: number;
  z: number;
  /** World axis the curbside offset runs along. */
  axis: FurnitureAxis;
  side: FurnitureSide;
  /** Curbside offset magnitude (carriageway edge + half a sidewalk). */
  lateralOffset: number;
  /** Which of the two cabinets it is; they share a slot and a siting rule. */
  kind: CabinetKind;
  /** Metres it stands along its strip from the tile's middle, where another object took the middle; absent at 0. */
  along?: number;
}

export interface MeterPlacement {
  x: number;
  z: number;
  /** Axis of the curbside lateral offset (perpendicular to the run). */
  curbAxis: FurnitureAxis;
  side: FurnitureSide;
  lateralOffset: number;
  /** Signed meters along the run axis — the pair straddles the tile center. */
  along: number;
}

/** The standard sign a road tile's role earns; see {@link classifySign}. */
export type SignType =
  'stop' | 'giveway' | 'bend' | 'oneway' | 'speed' | 'nothrough' | 'signal' | 'exit' | 'gantry';

export interface SignPlacement {
  x: number;
  z: number;
  axis: FurnitureAxis;
  side: FurnitureSide;
  lateralOffset: number;
  /** Which standard sign this tile's role earned. */
  type: SignType;
  /**
   * Bend signs on TURN tiles position by explicit world offset from the tile
   * center (the curve's outer corner, just past the curved sidewalk) with
   * their own facing yaw — the straight-axis side/lateralOffset rule would
   * strand them deep in the grass. Unset for every other sign.
   */
  worldOffsetX?: number;
  worldOffsetZ?: number;
  yaw?: number;
  /** Metres a kerbside board stands along its strip from the tile's middle, where another object took the middle; absent at 0. */
  along?: number;
  /**
   * How high the bottom of a kerbside board stands over the ground, metres:
   * 2.1 over a walk, 1.5 with none. Absent on a signal, an exit board and a
   * gantry, which hang higher.
   */
  bottom?: number;
  /**
   * A gantry's reach either side of where it stands, to its legs, metres: its
   * road's own carriageway plus the clearance. Omitted, it is the three-lane
   * motorway the gantry is modelled on.
   */
  span?: number;
}

/**
 * Curbside offset (m): the outer edge of whatever curb the tier actually draws.
 * Only the exit board, which has no furnishing strip to stand in on a
 * motorway's half-metre kerb, stands there.
 */
function curbsideLateralOffset(tile: { tier?: RoadTier; profile?: RoadProfile }): number {
  const { half, kerb } = edgeOf(tile);
  return half + kerb;
}

/**
 * Where a post stands, metres from the road's centre line: `behind` the kerb
 * face, which is where the carriageway ends, or `noKerb` from the travelled way
 * where the road has no kerb to stand behind. Never beyond the tile's edge.
 */
function postOffset(
  tile: { tier?: RoadTier; profile?: RoadProfile },
  behind: number,
  noKerb: number,
): number {
  const { half, kerb } = edgeOf(tile);
  return Math.min(half + (kerb > 0 ? behind : noKerb), TILE_METERS / 2);
}

/**
 * Where a cabinet stands: its near face 0.1 m behind the kerb face, so its
 * body fills the furnishing strip and the walk behind it stays clear. A box
 * centred on the strip's pole line overhung the strip into the walk.
 */
function cabinetOffset(tile: { tier?: RoadTier; profile?: RoadProfile }, depth: number): number {
  return postOffset(tile, CABINET_BEHIND_KERB_M + depth / 2, POLE_BEHIND_KERB_M);
}

/** Where a meter stands: behind the kerb face of the stall it charges for, never on the road side of it. */
function kerbFaceOffset(tile: { tier?: RoadTier; profile?: RoadProfile }): number {
  return postOffset(tile, METER_KERB_CLEARANCE_M, METER_KERB_CLEARANCE_M);
}

/**
 * Where a cantilevered mast stands: 0.61 m behind the kerb face, so its short
 * arm spends its length out over the carriageway instead of crossing the
 * footway to get there.
 */
function mastKerbOffset(tile: { tier?: RoadTier; profile?: RoadProfile }): number {
  return postOffset(tile, MAST_BEHIND_KERB_M, SIGN_NO_KERB_M);
}

/** Where a tram contact pole stands: the lamp's place in the strip, its arm reaching over the track. */
function tramPoleOffset(tile: { tier?: RoadTier; profile?: RoadProfile }): number {
  return postOffset(tile, POLE_BEHIND_KERB_M, POLE_BEHIND_KERB_M);
}

/** Where a sign's post stands: 0.46 m behind the kerb face, or 3.7 m from the travelled way with no kerb. */
function signOffset(tile: { tier?: RoadTier; profile?: RoadProfile }): number {
  return postOffset(tile, SIGN_BEHIND_KERB_M, SIGN_NO_KERB_M);
}

/** How far a board's bottom stands over the ground beside the road: 2.1 m over a walk, 1.5 m with none. */
function boardBottomOf(tile: { tier?: RoadTier; profile?: RoadProfile }): number {
  const { kerb } = edgeOf(tile);
  const profile = tile.profile ?? presetProfileForTier(tile.tier ?? RoadTier.TwoLane);
  return kerb > 0 && hasFootway(profile) ? SIGN_BOTTOM_OVER_WALK_M : SIGN_BOTTOM_NO_WALK_M;
}

/**
 * A rail line is not a road. It sits on the grid and blocks building like one,
 * but nothing that belongs beside a street belongs beside a track: no lamps, no
 * meters, no boards telling a train to give way.
 */
function tierIsRail(tier: RoadTier | undefined): boolean {
  return (tier ?? RoadTier.TwoLane) === RoadTier.RailTrack;
}

/** Manholes sit on a paved carriageway — not gravel, and not a ballast bed. */
function tierIsPaved(tier: RoadTier | undefined): boolean {
  const t = tier ?? RoadTier.TwoLane;
  return t !== RoadTier.Gravel && !tierIsRail(t);
}

/**
 * What survives up on a deck. A bridge has no verge and no ground beneath it,
 * so the kerbside clutter has nowhere to stand and nothing to cover — but a
 * junction on a deck is still a junction, and overhead motorway signage is
 * exactly how an elevated motorway is signed.
 */
const DECK_SIGNS: ReadonlySet<SignType> = new Set<SignType>([
  'stop',
  'giveway',
  'signal',
  'exit',
  'gantry',
]);

/**
 * A grade-separated road: no sidewalk, no curb parking, no street furniture and
 * no street signage. It gets its own signage family instead — see
 * {@link classifySign}.
 */
function tierIsMotorway(tier: RoadTier | undefined): boolean {
  return (tier ?? RoadTier.TwoLane) === RoadTier.Highway;
}

/**
 * Boxes and other pavement clutter need a raised curb with a footway behind it:
 * excludes gravel and alley, which have none, and the highway and its ramps,
 * which have a shoulder rather than a sidewalk.
 */
function tierHasCurb(tier: RoadTier | undefined): boolean {
  const t = tier ?? RoadTier.TwoLane;
  return (
    t !== RoadTier.Gravel &&
    t !== RoadTier.Alley &&
    t !== RoadTier.Ramp &&
    !tierIsMotorway(t) &&
    !tierIsRail(t)
  );
}

/** Every tier that carries road signage of some kind — the highway included. */
function tierGetsSigns(tier: RoadTier | undefined): boolean {
  const t = tier ?? RoadTier.TwoLane;
  return t !== RoadTier.Gravel && t !== RoadTier.Alley && !tierIsRail(t);
}

/** Meters sit on street tiers that allow curb parking. */
function tierHasParking(tier: RoadTier | undefined): boolean {
  const t = tier ?? RoadTier.TwoLane;
  return t === RoadTier.TwoLane || t === RoadTier.FourLane || t === RoadTier.OneWay;
}

/**
 * Whether this tile actually has somewhere to park — a parking lane in the
 * section it is drawn with, not merely a tier that is the sort of road which
 * often does. A meter is a charge to use a bay, so a meter with no bay beside
 * it is meaningless; a player who turns parking off on a street should watch
 * the meters go with it, and so does the strip a turn bay leaves of a lane. A
 * tile carrying no composed profile falls back to what its tier says, which is
 * what every tile did before profiles existed.
 */
function hasParkingBay(tile: FurnitureRoadTile): boolean {
  if (!tile.profile) return tierHasParking(tile.tier);
  return tile.profile.pieces.some(isParkingLane);
}

/**
 * The board or head an approach carries under a given control, or null when it
 * carries nothing: the road that runs through a give-way or a minor-road stop
 * is not signed, and an uncontrolled junction is not signed at all. A
 * roundabout gives way at every entry, which is the one place a YIELD may face
 * every approach.
 */
function signForControl(control: JunctionControl, givesWay: boolean): SignType | null {
  switch (control) {
    case 'none':
      return null;
    case 'signal':
      return 'signal';
    case 'allWayStop':
      return 'stop';
    case 'roundabout':
      return 'giveway';
    case 'stop':
      return givesWay ? 'stop' : null;
    case 'yield':
      return givesWay ? 'giveway' : null;
  }
}

// Canonical neighbor order (N, E, S, W); each carries the outward curbside
// offset (axis + sign) for the sidewalk on that side.
const NEIGHBOR_DIRS: readonly {
  dx: number;
  dz: number;
  axis: FurnitureAxis;
  side: FurnitureSide;
}[] = [
  { dx: 0, dz: -1, axis: 'z', side: -1 },
  { dx: 1, dz: 0, axis: 'x', side: 1 },
  { dx: 0, dz: 1, axis: 'z', side: 1 },
  { dx: -1, dz: 0, axis: 'x', side: -1 },
];

/**
 * Every road tile by key, so a helper can ask not just WHETHER a neighbour is
 * road but what kind — which junction it is, and who gives way there.
 */
export type RoadTileIndex = ReadonlyMap<number, FurnitureRoadTile>;

export function buildTileSet(roadTiles: readonly FurnitureRoadTile[]): RoadTileIndex {
  const set = new Map<number, FurnitureRoadTile>();
  for (const tile of roadTiles) set.set(tileKey(tile.x, tile.z), tile);
  return set;
}

const surroundings = new WeakMap<RoadTileIndex, SeparateRoadSurroundings>();

/** The tile set as the approach walk reads the tiles around it. */
function surroundingsOf(tileSet: RoadTileIndex): SeparateRoadSurroundings {
  const known = surroundings.get(tileSet);
  if (known) return known;
  const at = (x: number, z: number): FurnitureRoadTile | undefined => tileSet.get(tileKey(x, z));
  const view: SeparateRoadSurroundings = {
    hasRoad: (x, z) => at(x, z) !== undefined,
    profileAt: (x, z) => {
      const tile = at(x, z);
      return tile ? profileOf(tile) : null;
    },
    flowAt: (x, z) => flowDirection(at(x, z)?.flow ?? 0),
    corridorHalfAt: (x, z) => corridorHalfOf(at(x, z)?.flow ?? 0),
    profileIdAt: (x, z) => at(x, z)?.profileId ?? 0,
    apartAt: (x, z) => at(x, z)?.apart ?? 0,
    // A tile carries the half it draws, which a corridor nothing divides
    // marks with the seam where it runs on onto the other half.
    oneCarriagewayAt: (x, z) => at(x, z)?.profile?.seam !== undefined,
  };
  surroundings.set(tileSet, view);
  return view;
}

/**
 * Whether the road tile at (nx, nz) is an arm of the one at (x, z): there, and
 * not a road of its own lying beside this one — its other corridor half, a
 * separate motorway carriageway, a ramp alongside, or a road held apart. Any of
 * those takes up the ground beside this one without joining it. It is the
 * approach walk's own question, so the furniture stands where the road is
 * driven.
 */
export function joins(
  tileSet: RoadTileIndex,
  x: number,
  z: number,
  nx: number,
  nz: number,
): boolean {
  if (!tileSet.has(tileKey(nx, nz))) return false;
  return !isSeparateRoad(x, z, nx - x, nz - z, surroundingsOf(tileSet));
}

/** How the ramp tile at (rx, rz) meets the motorway tile at (hx, hz). */
function rampJoinIn(
  tileSet: RoadTileIndex,
  rx: number,
  rz: number,
  hx: number,
  hz: number,
): RampJoin {
  return rampJoinAround(
    (x, z) => tileSet.get(tileKey(x, z))?.tier === RoadTier.Ramp,
    (x, z) => tileSet.get(tileKey(x, z))?.flow ?? 0,
    rx,
    rz,
    hx,
    hz,
  );
}

/** How many of the four orthogonal neighbors are roads this tile joins. */
function neighborCount(tileSet: RoadTileIndex, x: number, z: number): number {
  let count = 0;
  for (const d of NEIGHBOR_DIRS) if (joins(tileSet, x, z, x + d.dx, z + d.dz)) count++;
  return count;
}

interface PresentSides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/** Which orthogonal neighbors are roads this tile joins. */
function presentSides(tileSet: RoadTileIndex, x: number, z: number): PresentSides {
  return {
    n: joins(tileSet, x, z, x, z - 1),
    e: joins(tileSet, x, z, x + 1, z),
    s: joins(tileSet, x, z, x, z + 1),
    w: joins(tileSet, x, z, x - 1, z),
  };
}

/** True iff the tile connects on exactly one axis — a straight-through run. */
function isCollinear2(sides: PresentSides): boolean {
  const ns = sides.n && sides.s && !sides.e && !sides.w;
  const ew = sides.e && sides.w && !sides.n && !sides.s;
  return ns || ew;
}

/**
 * True for a TURN tile: exactly two non-collinear road neighbors. The
 * carriageway sweeps a curve across the tile, so any straight-axis lateral
 * placement rule would drop props into the middle of the road — turn tiles
 * skip in-road/curbside furniture and get only the bend sign, positioned at
 * the curve's outer corner (see computeSignPlacements).
 */
function isTurnTile(tileSet: RoadTileIndex, x: number, z: number): boolean {
  const sides = presentSides(tileSet, x, z);
  const count = (sides.n ? 1 : 0) + (sides.e ? 1 : 0) + (sides.s ? 1 : 0) + (sides.w ? 1 : 0);
  return count === 2 && !isCollinear2(sides);
}

/** True for a JUNCTION tile: three or more road neighbours meet on it. */
function isJunctionTile(tileSet: RoadTileIndex, x: number, z: number): boolean {
  const sides = presentSides(tileSet, x, z);
  return (sides.n ? 1 : 0) + (sides.e ? 1 : 0) + (sides.s ? 1 : 0) + (sides.w ? 1 : 0) >= 3;
}

/**
 * Whether a raised median runs down the middle of this tile's road, leaving no
 * centreline to seat a cover on. Every composed section puts its median at the
 * centre, and a corridor half carries its share of one at the edge it shares,
 * which is the whole road's middle.
 */
function hasCentralMedian(tile: FurnitureRoadTile): boolean {
  return profileOf(tile).pieces.some((p) => p.kind === 'median');
}

/** The cross-section a tile carries: its own where it has one, else its tier's preset. */
function profileOf(tile: FurnitureRoadTile): RoadProfile {
  return tile.profile ?? presetProfileForTier(tile.tier ?? RoadTier.TwoLane);
}

/**
 * Whether a sewer runs under this road at all — the class's own water flag.
 *
 * A cover is the top of a sewer, so a road with no buried line under its
 * running surface has nothing to cover. A motorway and its slip road drain off
 * the shoulder to the verge instead, so a cover on one is a hole in a road
 * with nothing beneath it. Asking the class rather than listing tiers means a
 * class that stops carrying water stops growing covers in the same change.
 */
function carriesSewer(tile: FurnitureRoadTile): boolean {
  return roadClass(profileOf(tile).class).carriesWater;
}

/**
 * The joined neighbour with the most arms of its own — the junction this tile
 * runs into. A road lying beside it is not one: the other half of a corridor
 * next to a T is a straight run past it, not an approach to it.
 */
function busiestNeighbour(
  tileSet: RoadTileIndex,
  x: number,
  z: number,
): FurnitureRoadTile | undefined {
  let best: FurnitureRoadTile | undefined;
  let bestDegree = 0;
  for (const d of NEIGHBOR_DIRS) {
    if (!joins(tileSet, x, z, x + d.dx, z + d.dz)) continue;
    const neighbour = tileSet.get(tileKey(x + d.dx, z + d.dz));
    if (!neighbour) continue;
    const degree = neighborCount(tileSet, neighbour.x, neighbour.z);
    if (degree > bestDegree) {
      bestDegree = degree;
      best = neighbour;
    }
  }
  return best;
}

/**
 * Whether the arm running from `approach` into `junction` has to give way,
 * read off the hierarchy the same way the junction's own markings read it: an
 * arm below the top rank gives way, and where every arm ranks the same they
 * all do.
 */
function approachGivesWay(
  tileSet: RoadTileIndex,
  junction: FurnitureRoadTile,
  approach: FurnitureRoadTile,
): boolean {
  const ranks: number[] = [];
  for (const d of NEIGHBOR_DIRS) {
    const nx = junction.x + d.dx;
    const nz = junction.z + d.dz;
    if (!joins(tileSet, junction.x, junction.z, nx, nz)) continue;
    const arm = tileSet.get(tileKey(nx, nz));
    if (arm) ranks.push(rankForTier(arm.tier ?? RoadTier.TwoLane));
  }
  return armGivesWay(rankForTier(approach.tier ?? RoadTier.TwoLane), ranks);
}

/**
 * Whether traffic on this tile runs `toward` a junction: every lane of a
 * two-way road, and on a one-way carriageway only where its lanes run that
 * way. Half of a two-way corridor may carry the lanes running against the way
 * it was drawn, which is the stop line's own rule.
 */
function trafficArrives(tile: FurnitureRoadTile, toward: RoadFlow): boolean {
  const flow = flowDirection(tile.flow ?? 0);
  const profile = profileOf(tile);
  if (flow === RoadFlow.None || !isOneWayProfile(profile)) return true;
  return (flow === toward) !== runsAgainstDrawing(profile);
}

/** The sides whose neighbor tile is absent — the sidewalk edges. */
function availableSidewalkSides(tileSet: RoadTileIndex, x: number, z: number): SideChoice[] {
  const out: SideChoice[] = [];
  for (const d of NEIGHBOR_DIRS)
    if (!tileSet.has(tileKey(x + d.dx, z + d.dz))) out.push({ axis: d.axis, side: d.side });
  return out;
}

/**
 * Lateral (perpendicular-to-run) offset axis, derived from neighbor presence:
 * an east-west road offsets along z, a north-south road along x. Isolated tiles
 * and junctions fall back to z — meaningful only for props that belong IN the
 * carriageway; anything curbside must check {@link hasCrossingRoad} first.
 */
export function lateralAxis(tileSet: RoadTileIndex, x: number, z: number): FurnitureAxis {
  const hasEW = joins(tileSet, x, z, x - 1, z) || joins(tileSet, x, z, x + 1, z);
  const hasNS = joins(tileSet, x, z, x, z - 1) || joins(tileSet, x, z, x, z + 1);
  return hasNS && !hasEW ? 'x' : 'z';
}

/**
 * True where road runs through the tile on BOTH axes — a turn, a T, or a
 * crossroads. Such a tile has no curb: the lateral offset that clears one
 * carriageway lands inside the other, which is how furniture ends up standing
 * in the middle of an intersection. Nothing curbside may seat here.
 */
export function hasCrossingRoad(tileSet: RoadTileIndex, x: number, z: number): boolean {
  const hasEW = joins(tileSet, x, z, x - 1, z) || joins(tileSet, x, z, x + 1, z);
  const hasNS = joins(tileSet, x, z, x, z - 1) || joins(tileSet, x, z, x, z + 1);
  return hasEW && hasNS;
}

/**
 * How much further out, or less far, a kerbside prop on `pick` stands because
 * the tile's carriageway is off its centre: half of a corridor nothing divides
 * is pushed against the edge it shares with its other half, and its kerbs go
 * with it. Only a flank kerb moves; the end of a road is where it always was.
 */
export function flankShift(
  tileSet: RoadTileIndex,
  tile: FurnitureRoadTile,
  pick: SideChoice,
): number {
  if (!tile.profile || pick.axis !== lateralAxis(tileSet, tile.x, tile.z)) return 0;
  return pick.side * carriagewayShiftOf(tile.profile);
}

/**
 * The edge a corridor half shares with its other half, or null for any other
 * road tile. It is the middle of the road, not a kerb: nothing kerbside stands
 * on it.
 */
export function sharedEdgeOf(tileSet: RoadTileIndex, tile: FurnitureRoadTile): SideChoice | null {
  const partner = corridorPartnerTile(
    tile.x,
    tile.z,
    (x, z) => tileSet.get(tileKey(x, z))?.flow ?? 0,
    surroundingsOf(tileSet).profileIdAt,
  );
  if (!partner) return null;
  return partner.x !== tile.x
    ? { axis: 'x', side: partner.x > tile.x ? 1 : -1 }
    : { axis: 'z', side: partner.z > tile.z ? 1 : -1 };
}

/** Deterministically picks one of the available sides from a [0,1) hash. */
function pickSide(sides: readonly SideChoice[], h: number): SideChoice | null {
  if (sides.length === 0) return null;
  return sides[Math.min(sides.length - 1, Math.floor(h * sides.length))]!;
}

/** Positive modulo so a straight run's (x+z) advances the period cleanly. */
function periodHits(x: number, z: number, period: number): boolean {
  return (((x + z) % period) + period) % period === 0;
}

// ---------------------------------------------------------------------------
// Pure placement functions (unit-testable, no THREE dependency).
// ---------------------------------------------------------------------------

/**
 * Manhole covers down one lane of a run, one every MANHOLE_PERIOD_TILES.
 *
 * A cover lies in the middle of a plain travel lane, clear of every painted
 * line: the first such lane from the low side of the tile's own cross-section,
 * so the covers of a run stand in one line down the same lane. A lane that
 * carries tram rails, a turn bay (where arrows, a stop line and a crosswalk
 * lie), a bike or bus lane and a parking lane take none. A road with a raised
 * MEDIAN carries none: its sewer runs under one carriageway rather than under
 * the planting, and rather than guess which, that road has no covers.
 */
export function computeManholePlacements(
  roadTiles: readonly FurnitureRoadTile[],
): ManholePlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: ManholePlacement[] = [];
  for (const tile of roadTiles) {
    if (tile.ring) continue;
    if (!tierIsPaved(tile.tier)) continue;
    if (!carriesSewer(tile)) continue; // no buried line here, so nothing to cover
    if (tile.elevated) continue; // a deck has no sewer under it to cover
    if (isTurnTile(tileSet, tile.x, tile.z)) continue; // curved carriageway: no straight-axis seat
    if (isJunctionTile(tileSet, tile.x, tile.z)) continue; // the box is busy enough
    if (hasCentralMedian(tile)) continue;
    if (!periodHits(tile.x, tile.z, MANHOLE_PERIOD_TILES)) continue;
    const profile = profileOf(tile);
    if (profile.pieces.some((p) => p.bay === true)) continue; // a junction's approach is all paint
    const lane = plainLaneCentres(profile)[0];
    if (lane === undefined) continue; // no plain lane to lie in
    out.push({
      x: tile.x,
      z: tile.z,
      axis: lateralAxis(tileSet, tile.x, tile.z),
      // The lane's middle, from the tile's middle: half of a corridor's
      // carriageway is pushed against the edge it shares.
      lateral: lane + carriagewayShiftOf(profile),
      rotationY: hashTile(tile.x, tile.z, HASH_MANHOLE_ROT) * Math.PI * 2,
    });
  }
  return out;
}

/** The world point of an object standing `lateral` from a tile's middle on `side`, `along` its strip. */
function stripPoint(
  tile: TilePoint,
  axis: FurnitureAxis,
  side: FurnitureSide,
  lateral: number,
  along: number,
): Spot {
  const off = lateral * side;
  return axis === 'x'
    ? { x: tileToWorld(tile.x) + off, z: tileToWorld(tile.z) + along }
    : { x: tileToWorld(tile.x) + along, z: tileToWorld(tile.z) + off };
}

/**
 * How far along its strip an object standing on `tile` slides to find a free
 * place, from the tile's middle: 0 where the middle is free, null where no place
 * in the tile is. Without a roadside every place is free.
 */
function freeAlong(
  roadside: Roadside | undefined,
  tile: TilePoint,
  axis: FurnitureAxis,
  side: FurnitureSide,
  lateral: number,
  limit = SLIDE_LIMIT_M,
): number | null {
  if (!roadside) return 0;
  return firstFreeAlong((along) => {
    const p = stripPoint(tile, axis, side, lateral, along);
    return placeIsFree(roadside, p.x, p.z);
  }, limit);
}

/**
 * Utility boxes on a sidewalk edge of ~1 in 12 curbed tiles. A box takes its
 * place after every other object, and moves along its strip off a bus stop's
 * span, a drive or a neighbour's centre, or is not put down.
 */
export function computeBoxPlacements(
  roadTiles: readonly FurnitureRoadTile[],
  roadside?: Roadside,
): BoxPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: BoxPlacement[] = [];
  for (const tile of roadTiles) {
    if (tile.ring) continue;
    if (!tierHasCurb(tile.tier)) continue;
    if (tile.elevated) continue; // no verge on a deck to seat a cabinet on
    if (isTurnTile(tileSet, tile.x, tile.z)) continue; // the curve owns the tile; no curbside seat
    if (effectiveSign(tileSet, tile)) continue; // the board has the slot; a cabinet is not worth sharing it
    if (hashTile(tile.x, tile.z, HASH_BOX_SELECT) >= BOX_SELECT_FRACTION) continue;

    const pick = pickSide(
      availableSidewalkSides(tileSet, tile.x, tile.z),
      hashTile(tile.x, tile.z, HASH_BOX_SIDE),
    );
    if (!pick) continue; // no free sidewalk side (fully surrounded tile)

    // Which of the two cabinets, from its own hash so a street gets a mix.
    const kind: CabinetKind =
      hashTile(tile.x, tile.z, HASH_CABINET_KIND) < PEDESTAL_SHARE ? 'pedestal' : 'cabinet';
    // Each stands in the strip on its own depth: a pedestal is round, so its
    // depth is its diameter.
    const lateralOffset =
      cabinetOffset(tile, kind === 'pedestal' ? PEDESTAL_PAD_RADIUS * 2 : BOX_DEPTH) +
      flankShift(tileSet, tile, pick);
    const along = freeAlong(roadside, tile, pick.axis, pick.side, lateralOffset);
    if (along === null) continue;
    const placed: BoxPlacement = {
      x: tile.x,
      z: tile.z,
      axis: pick.axis,
      side: pick.side,
      lateralOffset,
      kind,
      ...(along === 0 ? {} : { along }),
    };
    out.push(placed);
    if (roadside) {
      const p = stripPoint(tile, pick.axis, pick.side, lateralOffset, along);
      roadside.taken.add(p.x, p.z);
    }
  }
  return out;
}

/**
 * The kerb a tile's meters stand at: the side its parking lane is on, or
 * either, picked per tile, where both sides have one or the tile carries only
 * its tier's preset. The profile is in world order, so its low side is the
 * low-coordinate kerb.
 */
function meterSide(tile: FurnitureRoadTile): FurnitureSide {
  const either: FurnitureSide = hashTile(tile.x, tile.z, HASH_METER_SIDE) < 0.5 ? -1 : 1;
  if (!tile.profile) return either;
  const { low, high } = parkingSides(tile.profile);
  if (low && !high) return -1;
  if (high && !low) return 1;
  return either;
}

/**
 * Parking meters (two per tile) on curb-parking tiers, every 5th tile along the
 * run. A meter moves along its strip off a bus stop's span, a drive or the
 * centre of a higher object, or is not put down; each it puts down it adds to
 * `roadside.taken`.
 */
export function computeMeterPlacements(
  roadTiles: readonly FurnitureRoadTile[],
  roadside?: Roadside,
): MeterPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: MeterPlacement[] = [];
  for (const tile of roadTiles) {
    if (tile.ring) continue;
    if (!hasParkingBay(tile)) continue;
    if (tile.elevated) continue; // nobody parks on a viaduct
    // No curb parking on a curve, and none across a junction — both cases have
    // road on the crossing axis where the meter would stand.
    if (hasCrossingRoad(tileSet, tile.x, tile.z)) continue;
    if (!periodHits(tile.x, tile.z, METER_PERIOD)) continue;

    const curbAxis = lateralAxis(tileSet, tile.x, tile.z);
    // Half of a corridor has one kerb: the edge it shares is the road's middle.
    const shared = sharedEdgeOf(tileSet, tile);
    const side = shared ? (-shared.side as FurnitureSide) : meterSide(tile);
    const lateralOffset =
      kerbFaceOffset(tile) + flankShift(tileSet, tile, { axis: curbAxis, side });
    for (const base of [METER_ALONG, -METER_ALONG]) {
      const slide = firstFreeAlong((a) => {
        if (!roadside) return true;
        const p = stripPoint(tile, curbAxis, side, lateralOffset, base + a);
        return placeIsFree(roadside, p.x, p.z);
      }, METER_SLIDE_LIMIT_M);
      if (slide === null) continue;
      const along = base + slide;
      out.push({ x: tile.x, z: tile.z, curbAxis, side, lateralOffset, along });
      if (roadside) {
        const p = stripPoint(tile, curbAxis, side, lateralOffset, along);
        roadside.taken.add(p.x, p.z);
      }
    }
  }
  return out;
}

/** Where a tram contact pole stands, in world metres, and the way its arm reaches: toward the road. */
export interface TramPoleStand {
  x: number;
  z: number;
  reachX: number;
  reachZ: number;
}

/**
 * Whether the trams on this road share its traffic lanes: the street tramway,
 * whose wire hangs from poles at the kerb. A reservation is not one.
 */
function runsTramsInTraffic(tile: FurnitureRoadTile): boolean {
  const tier = tile.tier ?? RoadTier.TwoLane;
  return isStreetTier(tier) && profileOf(tile).pieces.some((p) => p.tram === true);
}

/**
 * The kerb a one-way road's poles stand on: its drivers' right, where the
 * stops are. Null where the road is two-way or its direction is not stored.
 */
function oneWayPoleSide(tile: FurnitureRoadTile): FurnitureSide | null {
  if (!isOneWayProfile(profileOf(tile))) return null;
  const flow = flowDirection(tile.flow ?? 0);
  if (flow === RoadFlow.None) return null;
  return flow === RoadFlow.North || flow === RoadFlow.East ? 1 : -1;
}

/**
 * Overhead contact poles along every street tramway: one every TRAM_POLE_SPACING_M
 * of road, phase anchored at world-metre zero so they keep their spacing across
 * every tile, at the kerb face so the arm spends its length over the track. A
 * two-way road takes them on alternate kerbs; a one-way road on its drivers'
 * right. None stands where road crosses the tile (a junction box or a turn),
 * on a roundabout, on a tile in `keepOff` (a driveway's mouth, or where a road
 * off the grid meets), or on a kerb another road lies against. A pole gives way
 * to a signal mast or a stop sign in `roadside`, and to a bus stop's span, by
 * moving along its tile's strip, or is not stood.
 */
export function computeTramPolePlacements(
  roadTiles: readonly FurnitureRoadTile[],
  keepOff?: ReadonlySet<number>,
  roadside?: Roadside,
): TramPoleStand[] {
  const tileSet = buildTileSet(roadTiles);
  const out: TramPoleStand[] = [];
  for (const tile of roadTiles) {
    if (tile.ring) continue;
    if (!runsTramsInTraffic(tile)) continue;
    if (keepOff?.has(tileKey(tile.x, tile.z))) continue;
    if (hasCrossingRoad(tileSet, tile.x, tile.z)) continue;
    const axis = lateralAxis(tileSet, tile.x, tile.z);
    const runsAlongX = axis === 'z';
    const start = (runsAlongX ? tile.x : tile.z) * TILE_METERS;
    const free = (s: FurnitureSide): boolean =>
      !tileSet.has(tileKey(tile.x + (axis === 'x' ? s : 0), tile.z + (axis === 'z' ? s : 0)));
    const oneWay = oneWayPoleSide(tile);
    for (
      let k = Math.ceil(start / TRAM_POLE_SPACING_M);
      k * TRAM_POLE_SPACING_M < start + TILE_METERS;
      k++
    ) {
      const preferred: FurnitureSide = oneWay ?? (k % 2 === 0 ? 1 : -1);
      const other: FurnitureSide = preferred === 1 ? -1 : 1;
      const side = free(preferred) ? preferred : free(other) ? other : null;
      if (side === null) continue;
      const lateral = side * (tramPoleOffset(tile) + flankShift(tileSet, tile, { axis, side }));
      const base = k * TRAM_POLE_SPACING_M;
      const at = (a: number): Spot =>
        runsAlongX
          ? { x: a, z: tileToWorld(tile.z) + lateral }
          : { x: tileToWorld(tile.x) + lateral, z: a };
      const slide = roadside
        ? firstFreeAlong((s) => {
            const a = base + s;
            if (a < start || a >= start + TILE_METERS) return false;
            const p = at(a);
            return placeIsFree(roadside, p.x, p.z);
          }, SLIDE_LIMIT_M)
        : 0;
      if (slide === null) continue;
      const p = at(base + slide);
      out.push(
        runsAlongX
          ? { x: p.x, z: p.z, reachX: 0, reachZ: -side }
          : { x: p.x, z: p.z, reachX: -side, reachZ: 0 },
      );
    }
  }
  return out;
}

/**
 * The one standard sign a road tile's role earns, or null. First match wins:
 * dead-end, then junction approach, then turn, then the periodic one-way / speed
 * markers on straight runs.
 */
function classifySign(tileSet: RoadTileIndex, tile: FurnitureRoadTile): SignType | null {
  const { x, z } = tile;
  const nc = neighborCount(tileSet, x, z);
  const sides = presentSides(tileSet, x, z);
  const straight = nc === 2 && isCollinear2(sides);

  // A motorway reads nothing like a street, so it takes none of the street
  // furniture below: no stopping, no giving way, no bends, no speed boards on
  // the verge. Where something leaves it, that is an EXIT; along the run, the
  // information goes overhead on a GANTRY spanning both carriageways, which is
  // the only way to sign a road nobody is walking beside.
  if (tierIsMotorway(tile.tier)) {
    if (exitAhead(tileSet, tile)) return 'exit';
    if (straight && periodHits(x, z, GANTRY_PERIOD)) return 'gantry';
    return null;
  }

  if (nc === 1) return 'nothrough'; // dead-end

  // Approach into a junction: a low-degree tile whose busiest neighbour is one.
  // The board is the junction's own, not a guess from this road's tier — the
  // sim decides who gives way there, from the classes that meet and what they
  // carry, and this only draws it. A junction the sim has said nothing about
  // is uncontrolled and takes no board.
  if (nc <= 2) {
    const junction = busiestNeighbour(tileSet, x, z);
    if (junction && neighborCount(tileSet, junction.x, junction.z) >= 3) {
      // Where nobody arrives, nobody is held: a one-way carriageway leaving
      // the junction, the half of a corridor running away from it among them.
      const toward = flowForStep(Math.sign(junction.x - x), Math.sign(junction.z - z));
      if (!trafficArrives(tile, toward)) return null;
      const control = junction.control ?? 'none';
      return signForControl(control, approachGivesWay(tileSet, junction, tile));
    }
  }

  if (nc === 2 && !isCollinear2(sides)) return 'bend'; // turn tile

  if (tile.tier === RoadTier.OneWay && straight && periodHits(x, z, ONEWAY_SIGN_PERIOD))
    return 'oneway';
  if (tile.tier === RoadTier.Avenue && straight && periodHits(x, z, SPEED_SIGN_PERIOD))
    return 'speed';

  return null;
}

/**
 * Whether the next motorway tile along this one's flow is where a ramp LEAVES.
 *
 * An exit board is only worth anything before the turn-off, while a driver can
 * still move over for it, so it goes on the one tile before the diverge. After
 * it, or at a merge where a ramp joins, there is nothing to take. Which way the
 * ramp was drawn is what says it leaves: pointing away from the motorway.
 */
function exitAhead(tileSet: RoadTileIndex, tile: FurnitureRoadTile): boolean {
  const run = flowDirection(tile.flow ?? 0);
  if (run === RoadFlow.None) return false;
  const { dx, dz } = stepForFlow(run);
  const nx = tile.x + dx;
  const nz = tile.z + dz;
  const next = tileSet.get(tileKey(nx, nz));
  if (!next || !tierIsMotorway(next.tier)) return false;
  for (const [lx, lz] of dx === 0
    ? [
        [1, 0],
        [-1, 0],
      ]
    : [
        [0, 1],
        [0, -1],
      ]) {
    const rx = nx + lx!;
    const rz = nz + lz!;
    const ramp = tileSet.get(tileKey(rx, rz));
    if (ramp?.tier !== RoadTier.Ramp) continue;
    const join = rampJoinIn(tileSet, rx, rz, nx, nz);
    if (join === 'diverge') return true;
    // A head-on ramp a save still holds leaves where it points away.
    if (join === 'headOn' && flowDirection(ramp.flow ?? 0) === flowForStep(lx!, lz!)) return true;
  }
  return false;
}

/**
 * The sign a tile will ACTUALLY carry, gates included — not just the one its
 * shape earns. Shared so that anything else wanting the same curbside slot can
 * ask, rather than growing straight through the board: a sign and a utility
 * cabinet both stand at the tile centre on a chosen side at the same offset out
 * from the carriageway, so two of them on one tile occupy the same space.
 */
function effectiveSign(tileSet: RoadTileIndex, tile: FurnitureRoadTile): SignType | null {
  if (!tierGetsSigns(tile.tier)) return null;
  const type = classifySign(tileSet, tile);
  if (!type) return null;
  if (tile.elevated && !DECK_SIGNS.has(type)) return null;
  return type;
}

/** How far past the curve's outer sidewalk edge the bend sign stands. */
const BEND_SIGN_CURVE_MARGIN = 0.5;

/**
 * The boards a junction's CONTROL puts on an approach. Unlike the rest of the
 * kerbside furniture they are not decoration to be scattered: a driver has to
 * see them from the seat, so where they stand is part of what they mean.
 */
const CONTROL_SIGNS: ReadonlySet<SignType> = new Set<SignType>(['signal', 'stop', 'giveway']);

/**
 * How far back from the junction the control board stands — level with the
 * stop line the driver is being told to stop at, rather than out at the middle
 * of the tile where the instruction arrives a car length early.
 */
const CONTROL_SIGN_SETBACK_M = 0.35;

/**
 * Which way a board standing on a kerb must face: back along the traffic on
 * ITS OWN side of the road, so the driver it is addressing reads its face and
 * not its edge.
 *
 * One rule serves every kerbside board. The kerb the sign stands on points
 * outward from the carriageway; on a right-hand-drive network the traffic
 * beside that kerb travels with the kerb on its right, so the direction it
 * comes FROM is the kerb vector turned a quarter anticlockwise. A board is
 * authored facing +z, so its yaw is that direction's bearing.
 */
export function kerbFacingYaw(axis: FurnitureAxis, side: FurnitureSide): number {
  const kerbX = axis === 'x' ? side : 0;
  const kerbZ = axis === 'x' ? 0 : side;
  return Math.atan2(-kerbZ, kerbX);
}

/**
 * Which way a board on a ONE-WAY carriageway must face, or null where the tile
 * does not say.
 *
 * The kerb rule works out the traffic from the side of the road a board stands
 * on, which holds only while each kerb has its own stream. A one-way
 * carriageway runs the same way past both of its kerbs, so the kerb cannot say
 * which way that is and only the stored flow can. A board faces back against
 * the flow, which is where the drivers reading it are coming from.
 */
function flowFacingYaw(tile: FurnitureRoadTile): number | null {
  const direction = flowDirection(tile.flow ?? 0);
  if (direction === RoadFlow.None) return null;
  const { dx, dz } = stepForFlow(direction);
  return Math.atan2(-dx, -dz);
}

/**
 * The kerb a kerbside cantilever stands on, from the sides that are free, or
 * none.
 *
 * A cantilever's face turns with its arm, and its arm with its kerb, so it
 * cannot be turned to face anything: it faces the drivers it serves only from
 * their right. On a two-way road either kerb has drivers on its right, so any
 * free side will do. On a one-way carriageway both kerbs carry the same
 * stream, and only the kerb to the right of the flow has them — so it is that
 * kerb or no sign at all, since a sign showing its back is worse than none.
 */
function cantileverSide(tile: FurnitureRoadTile, free: readonly SideChoice[]): SideChoice | null {
  const direction = flowDirection(tile.flow ?? 0);
  if (direction === RoadFlow.None) return pickSide(free, hashTile(tile.x, tile.z, HASH_SIGN_SIDE));
  const { dx, dz } = stepForFlow(direction);
  const right: SideChoice =
    dz === 0 ? { axis: 'z', side: dx > 0 ? 1 : -1 } : { axis: 'x', side: dz > 0 ? -1 : 1 };
  return free.find((s) => s.axis === right.axis && s.side === right.side) ?? null;
}

/** The facing a board on this tile takes: its carriageway's where there is one, else its kerb's. */
function signFacingYaw(tile: FurnitureRoadTile, axis: FurnitureAxis, side: FurnitureSide): number {
  return flowFacingYaw(tile) ?? kerbFacingYaw(axis, side);
}

/** The boards a junction's control puts on an approach, which stand where they are whatever else is near. */
export function isControlSign(type: SignType): boolean {
  return type === 'signal' || type === 'stop' || type === 'giveway';
}

/** Where every signal mast, stop sign and give-way board stands, world metres, off the tiles in `keepOff`. */
export function controlSignSpots(
  roadTiles: readonly FurnitureRoadTile[],
  keepOff?: ReadonlySet<number>,
): Spot[] {
  return computeSignPlacements(roadTiles)
    .filter((s) => isControlSign(s.type) && !keepOff?.has(tileKey(s.x, s.z)))
    .map((s) => {
      const at = signWorldTransform(s);
      return { x: at.x, z: at.z };
    });
}

/**
 * Where the far right corner of a junction lies for a driver coming in along
 * `tile`: on the tile beyond the junction, in its furnishing strip on the
 * driver's right, MAST_PAST_JUNCTION_M past the junction's edge so it clears
 * the kerb ramp. Null where nothing straight lies beyond, or a road lies on that
 * side of it; the mast then stands at the stop line.
 */
function farRightCorner(
  tileSet: RoadTileIndex,
  tile: FurnitureRoadTile,
  junction: FurnitureRoadTile,
  toward: { x: number; z: number },
  right: { x: number; z: number },
  pick: SideChoice,
): { lateral: number; along: number } | null {
  const far = tileSet.get(tileKey(junction.x + toward.x, junction.z + toward.z));
  if (!far || far.ring || far.elevated !== tile.elevated) return null;
  if (!joins(tileSet, junction.x, junction.z, far.x, far.z)) return null;
  if (neighborCount(tileSet, far.x, far.z) !== 2) return null;
  if (!isCollinear2(presentSides(tileSet, far.x, far.z))) return null;
  if (tileSet.has(tileKey(far.x + right.x, far.z + right.z))) return null;
  return {
    lateral: mastKerbOffset(far) + flankShift(tileSet, far, pick),
    along: TILE_METERS * 1.5 + MAST_PAST_JUNCTION_M,
  };
}

/** A kerbside board that gives way to the higher objects: it is placed once those are. */
const MOVABLE_BOARDS: ReadonlySet<SignType> = new Set<SignType>(['oneway', 'speed', 'nothrough']);

/**
 * One typed sign per curbed tile whose road-tile role earns it. A signal mast
 * stands at the far right corner of its junction and a stop sign at the stop
 * line on the near right, both of them where they stand whatever else is near;
 * every other board takes its place after them and moves along its strip off a
 * bus stop's span, a drive or the centre of any object in `roadside`, or is not
 * put down. Each it puts down it adds to `roadside.taken`.
 */
export function computeSignPlacements(
  roadTiles: readonly FurnitureRoadTile[],
  roadside?: Roadside,
): SignPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const out: SignPlacement[] = [];
  const late: { tile: FurnitureRoadTile; placement: SignPlacement }[] = [];
  const bottomOf = (tile: FurnitureRoadTile): { bottom: number } => ({
    bottom: boardBottomOf(tile),
  });
  for (const tile of roadTiles) {
    if (tile.ring) continue;
    const type = effectiveSign(tileSet, tile);
    if (!type) continue;

    if (type === 'bend') {
      // A turn tile's carriageway is a quarter-annulus centered on the corner
      // shared by its two connected edges. The sign stands on the OUTER side
      // of the curve — along the diagonal from that corner through the tile
      // center, just past the curved sidewalk band — facing back toward the
      // corner so drivers rounding the bend see the board.
      const sides = presentSides(tileSet, tile.x, tile.z);
      const half = TILE_METERS / 2;
      const cornerX = sides.e ? half : -half;
      const cornerZ = sides.s ? half : -half;
      const invLen = 1 / Math.hypot(cornerX, cornerZ);
      const dirX = -cornerX * invLen;
      const dirZ = -cornerZ * invLen;
      const bendEdge = edgeOf(tile);
      const radius = half + bendEdge.half + bendEdge.kerb + BEND_SIGN_CURVE_MARGIN;
      out.push({
        x: tile.x,
        z: tile.z,
        axis: 'x',
        side: 1,
        lateralOffset: 0,
        type,
        ...bottomOf(tile),
        worldOffsetX: cornerX + dirX * radius,
        worldOffsetZ: cornerZ + dirZ * radius,
        yaw: Math.atan2(-dirX, -dirZ),
      });
      continue;
    }

    if (type === 'gantry') {
      // The one sign that spans the road rather than standing beside it: it
      // straddles the centreline on legs outside both shoulders, so it takes no
      // lateral offset and no side. Its legend is the one a motorway driver
      // reads, and standing over the carriageway it has no kerb to take a
      // facing from — so it turns to the flow, and falls back to the road's
      // run only where the tile does not say which way it goes.
      const spanAxis = lateralAxis(tileSet, tile.x, tile.z);
      const facing = flowFacingYaw(tile);
      // A motorway laid across two tiles is one carriageway, so it gets one
      // gantry, standing over the edge its two halves share and spanning both.
      const seam = tile.profile?.seam;
      if (seam && seam.side < 0) continue;
      const reach = tile.profile
        ? (seam ? carriagewayWidth(tile.profile) : carriagewayHalfWidthOf(tile.profile)) +
          GANTRY_LEG_CLEARANCE
        : undefined;
      out.push({
        x: tile.x,
        z: tile.z,
        axis: spanAxis,
        side: 1,
        lateralOffset: seam ? TILE_METERS / 2 : 0,
        type,
        ...(facing === null ? {} : { yaw: facing }),
        ...(reach === undefined ? {} : { span: reach }),
      });
      continue;
    }

    const junction = CONTROL_SIGNS.has(type)
      ? busiestNeighbour(tileSet, tile.x, tile.z)
      : undefined;
    if (junction && neighborCount(tileSet, junction.x, junction.z) >= 3) {
      // A control board stands on the DRIVER'S RIGHT at the stop line, facing
      // the traffic it holds — not on whichever kerb a hash landed on. Which
      // way the driver is going is the direction the junction lies in; their
      // right is that turned a quarter clockwise.
      const towardX = Math.sign(junction.x - tile.x);
      const towardZ = Math.sign(junction.z - tile.z);
      const rightX = -towardZ;
      const rightZ = towardX;
      const axis: FurnitureAxis = rightX !== 0 ? 'x' : 'z';
      const side: FurnitureSide = (rightX !== 0 ? rightX : rightZ) > 0 ? 1 : -1;
      // A signal hangs its head off an arm and stands in the strip 0.61 m behind
      // the kerb, at the far right corner of the junction where it can be; a
      // flat board is read from the road and stands 0.46 m behind it at the stop
      // line. Both are measured from where the carriageway is.
      const pick: SideChoice = { axis, side };
      const corner =
        type === 'signal'
          ? farRightCorner(
              tileSet,
              tile,
              junction,
              { x: towardX, z: towardZ },
              { x: rightX, z: rightZ },
              pick,
            )
          : null;
      const lateral =
        corner?.lateral ??
        (type === 'signal' ? mastKerbOffset(tile) : signOffset(tile)) +
          flankShift(tileSet, tile, pick);
      const along = corner?.along ?? TILE_METERS / 2 - CONTROL_SIGN_SETBACK_M;
      const control: SignPlacement = {
        x: tile.x,
        z: tile.z,
        axis,
        side,
        lateralOffset: lateral,
        type,
        ...(type === 'signal' ? {} : bottomOf(tile)),
        worldOffsetX: rightX * lateral + towardX * along,
        worldOffsetZ: rightZ * lateral + towardZ * along,
        // A signal's mast arm reaches out over the road it holds; a flat board
        // faces back at the traffic it is stopping, which is the way it is
        // read. Lying along the run showed drivers its edge.
        yaw: isCantilevered(type) ? signalYaw(axis, side) : kerbFacingYaw(axis, side),
      };
      out.push(control);
      if (roadside) {
        const at = signWorldTransform(control);
        roadside.taken.add(at.x, at.z);
      }
      continue;
    }

    // A board stands on a FLANK kerb — one running alongside the carriageway —
    // never across the end of it. A dead end's bulb is a kerb too, and a sign
    // planted on it faces across the road instead of back down it.
    const flankAxis = lateralAxis(tileSet, tile.x, tile.z);
    const free = availableSidewalkSides(tileSet, tile.x, tile.z);
    const flanks = free.filter((s) => s.axis === flankAxis);
    const pick = isCantilevered(type)
      ? cantileverSide(tile, flanks.length > 0 ? flanks : free)
      : pickSide(flanks.length > 0 ? flanks : free, hashTile(tile.x, tile.z, HASH_SIGN_SIDE));
    if (!pick) continue;

    const base =
      type === 'exit'
        ? curbsideLateralOffset(tile)
        : isCantilevered(type)
          ? mastKerbOffset(tile)
          : signOffset(tile);
    const placement: SignPlacement = {
      x: tile.x,
      z: tile.z,
      axis: pick.axis,
      side: pick.side,
      // Measured from where the carriageway is, which on half of a corridor
      // nothing divides is off the tile's centre.
      lateralOffset: base + flankShift(tileSet, tile, pick),
      type,
      ...(isCantilevered(type) ? {} : bottomOf(tile)),
      // Every kerbside board faces the traffic it speaks to. Without this a
      // board took the authored +z facing whatever way its road ran, so half
      // of them stood edge-on to the drivers meant to read them. A cantilever
      // is not a board: its arm has to reach from its kerb out over the
      // carriageway, and that is decided by the kerb alone.
      yaw: isCantilevered(type)
        ? signalYaw(pick.axis, pick.side)
        : signFacingYaw(tile, pick.axis, pick.side),
    };
    if (roadside && MOVABLE_BOARDS.has(type)) late.push({ tile, placement });
    else out.push(placement);
  }
  // The boards that give way go down once everything that does not has.
  for (const { tile, placement } of late) {
    const along = freeAlong(
      roadside,
      tile,
      placement.axis,
      placement.side,
      placement.lateralOffset,
    );
    if (along === null) continue;
    out.push(along === 0 ? placement : { ...placement, along });
    if (roadside) {
      const p = stripPoint(tile, placement.axis, placement.side, placement.lateralOffset, along);
      roadside.taken.add(p.x, p.z);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry merging — each source part painted a flat vertex color so one
// merged, instanced geometry carries distinctly-colored sub-parts.
// ---------------------------------------------------------------------------

/** Merges parts, painting each a flat color into a per-vertex color attribute. */
function mergeColoredGeometries(
  parts: readonly { geometry: THREE.BufferGeometry; color: number }[],
): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  let vertexTotal = 0;
  for (const p of parts)
    vertexTotal += (p.geometry.getAttribute('position') as THREE.BufferAttribute).count;

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const colors = new Float32Array(vertexTotal * 3);
  const indices: number[] = [];
  const rgb = new THREE.Color();

  let vertexOffset = 0;
  let floatOffset = 0;
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const norm = p.geometry.getAttribute('normal') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, floatOffset);
    normals.set(norm.array as Float32Array, floatOffset);
    rgb.set(p.color);
    for (let i = 0; i < pos.count; i++) {
      colors[(vertexOffset + i) * 3] = rgb.r;
      colors[(vertexOffset + i) * 3 + 1] = rgb.g;
      colors[(vertexOffset + i) * 3 + 2] = rgb.b;
    }
    floatOffset += pos.array.length;

    const index = p.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + vertexOffset);
    vertexOffset += pos.count;
    p.geometry.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}

/**
 * Cast-iron cover: a dark full disc, a lighter center plate proud of it, a
 * concentric groove ring and a lift seam on top. Centered on local y=0 so it
 * seats near-flush with the road. The merge is tagged CylinderGeometry so the
 * shadow-flag test still finds this layer by geometry kind.
 */
function buildManholeGeometry(): THREE.BufferGeometry {
  const rim = new THREE.CylinderGeometry(
    MANHOLE_RADIUS,
    MANHOLE_RADIUS,
    MANHOLE_HEIGHT,
    MANHOLE_SEGMENTS,
  );
  const plate = new THREE.CylinderGeometry(
    MANHOLE_RADIUS - 0.08,
    MANHOLE_RADIUS - 0.08,
    MANHOLE_HEIGHT + 0.002,
    MANHOLE_SEGMENTS,
  );
  const groove = new THREE.RingGeometry(0.28, 0.33, MANHOLE_SEGMENTS);
  groove.rotateX(-Math.PI / 2);
  groove.translate(0, MANHOLE_HEIGHT / 2 + 0.002, 0);
  const seam = new THREE.BoxGeometry(MANHOLE_RADIUS * 1.4, 0.01, 0.05);
  seam.translate(0, MANHOLE_HEIGHT / 2 + 0.005, 0);
  const geometry = mergeColoredGeometries([
    { geometry: rim, color: MANHOLE_RIM_COLOR },
    { geometry: plate, color: MANHOLE_PLATE_COLOR },
    { geometry: groove, color: MANHOLE_RIM_COLOR },
    { geometry: seam, color: MANHOLE_RIM_COLOR },
  ]);
  return geometry;
}

/**
 * Street cabinet: a thin base plinth, the grey-green body, a proud front door
 * with a center seam, and a top cap. Centered on local y=0 (the renderer lifts
 * it by half its height). Tagged BoxGeometry so the shadow-flag test finds it.
 */
function buildBoxGeometry(): THREE.BufferGeometry {
  const bottom = -BOX_HEIGHT / 2;
  const bodyH = 1.0;
  const bodyY = bottom + 0.08 + bodyH / 2;
  const plinth = new THREE.BoxGeometry(BOX_WIDTH + 0.04, 0.08, BOX_DEPTH + 0.04);
  plinth.translate(0, bottom + 0.04, 0);
  const body = new THREE.BoxGeometry(BOX_WIDTH, bodyH, BOX_DEPTH);
  body.translate(0, bodyY, 0);
  const door = new THREE.BoxGeometry(0.5, 0.82, 0.03);
  door.translate(0, bodyY, BOX_DEPTH / 2 + 0.015);
  const seam = new THREE.BoxGeometry(0.02, 0.82, 0.02);
  seam.translate(0, bodyY, BOX_DEPTH / 2 + 0.03);
  const cap = new THREE.BoxGeometry(BOX_WIDTH + 0.04, 0.06, BOX_DEPTH + 0.04);
  cap.translate(0, bottom + 0.08 + bodyH + 0.03, 0);
  const geometry = mergeColoredGeometries([
    { geometry: plinth, color: BOX_TRIM_COLOR },
    { geometry: body, color: BOX_BODY_COLOR },
    { geometry: door, color: BOX_DOOR_COLOR },
    { geometry: seam, color: BOX_TRIM_COLOR },
    { geometry: cap, color: BOX_TRIM_COLOR },
  ]);
  return geometry;
}

/**
 * A concrete pad, a round green body and a domed cap: the telco pedestal that
 * stands on the verge of most American streets. Authored with its base at the
 * origin so it seats the same way the cabinet does.
 */
function buildPedestalGeometry(): THREE.BufferGeometry {
  const pad = new THREE.CylinderGeometry(
    PEDESTAL_PAD_RADIUS,
    PEDESTAL_PAD_RADIUS,
    PEDESTAL_PAD_HEIGHT,
    PEDESTAL_RADIAL_SEGMENTS,
  );
  pad.translate(0, PEDESTAL_PAD_HEIGHT / 2, 0);
  const bodyY = PEDESTAL_PAD_HEIGHT + PEDESTAL_BODY_HEIGHT / 2;
  const body = new THREE.CylinderGeometry(
    PEDESTAL_RADIUS,
    PEDESTAL_RADIUS,
    PEDESTAL_BODY_HEIGHT,
    PEDESTAL_RADIAL_SEGMENTS,
  );
  body.translate(0, bodyY, 0);
  // A shallow dome, not a hemisphere — the real ones are barely crowned.
  const dome = new THREE.SphereGeometry(
    PEDESTAL_RADIUS,
    PEDESTAL_RADIAL_SEGMENTS,
    6,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  dome.scale(1, PEDESTAL_DOME_HEIGHT / PEDESTAL_RADIUS, 1);
  dome.translate(0, PEDESTAL_PAD_HEIGHT + PEDESTAL_BODY_HEIGHT, 0);
  return mergeColoredGeometries([
    { geometry: pad, color: PEDESTAL_PAD_COLOR },
    { geometry: body, color: PEDESTAL_BODY_COLOR },
    { geometry: dome, color: PEDESTAL_DOME_COLOR },
  ]);
}

/** Pole, a silver meter head with a dark display face, and a tapered top cap. */
function buildMeterGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(
    METER_POLE_RADIUS,
    METER_POLE_RADIUS,
    METER_POLE_HEIGHT,
    12,
  );
  pole.translate(0, METER_POLE_HEIGHT / 2, 0);
  const headY = METER_POLE_HEIGHT + METER_HEAD_H / 2;
  const head = new THREE.BoxGeometry(METER_HEAD_W, METER_HEAD_H, METER_HEAD_D);
  head.translate(0, headY, 0);
  const display = new THREE.BoxGeometry(METER_HEAD_W - 0.06, METER_HEAD_H - 0.1, 0.02);
  display.translate(0, headY, METER_HEAD_D / 2 + 0.01);
  const cap = new THREE.CylinderGeometry(METER_POLE_RADIUS, METER_HEAD_W * 0.55, 0.05, 12);
  cap.translate(0, METER_POLE_HEIGHT + METER_HEAD_H + 0.025, 0);
  return mergeColoredGeometries([
    { geometry: pole, color: METER_POLE_COLOR },
    { geometry: head, color: METER_HEAD_COLOR },
    { geometry: display, color: METER_DISPLAY_COLOR },
    { geometry: cap, color: METER_POLE_COLOR },
  ]);
}

/** The shared charcoal pole every sign type sits on (base at local y=0). */
function buildSignPole(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(SIGN_POLE_RADIUS, SIGN_POLE_RADIUS, SIGN_POLE_HEIGHT, 12);
  pole.translate(0, SIGN_POLE_HEIGHT / 2, 0);
  return pole;
}

/**
 * A flat triangular board (thin prism) from three (x,y) verts given CCW,
 * extruded a hair along z and centered on the board height. Normals computed so
 * the shared Lambert material lights it.
 */
function triangleBoard(points: readonly [number, number][], depth: number): THREE.BufferGeometry {
  const hz = depth / 2;
  const positions: number[] = [];
  for (const [px, py] of points) positions.push(px, py, hz); // 0,1,2 front
  for (const [px, py] of points) positions.push(px, py, -hz); // 3,4,5 back
  const indices = [0, 1, 2, 3, 5, 4];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    indices.push(i, j, j + 3, i, j + 3, i + 3); // side quad
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** A thin forward-facing disc (octagon at 8 segments) centered on the board height. */
function discBoard(radius: number, segments: number, z: number): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(radius, radius, 0.05, segments);
  disc.rotateX(Math.PI / 2); // circular face now points forward (±z)
  disc.translate(0, SIGN_BOARD_Y, z);
  return disc;
}

/** Red OCTAGON with a white inset ring. */
function buildStopSign(): THREE.BufferGeometry {
  const board = discBoard(0.3, 8, 0);
  const ring = new THREE.RingGeometry(0.18, 0.24, 8);
  ring.translate(0, SIGN_BOARD_Y, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: board, color: SIGN_RED },
    { geometry: ring, color: SIGN_WHITE },
  ]);
}

/** Red INVERTED triangle (point down) with a white inner triangle. */
function buildGiveWaySign(): THREE.BufferGeometry {
  const y = SIGN_BOARD_Y;
  const outer = triangleBoard(
    [
      [-0.28, y + 0.24],
      [0.28, y + 0.24],
      [0, y - 0.28],
    ],
    0.05,
  );
  const inner = triangleBoard(
    [
      [-0.18, y + 0.14],
      [0.18, y + 0.14],
      [0, y - 0.18],
    ],
    0.06,
  );
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: outer, color: SIGN_RED },
    { geometry: inner, color: SIGN_WHITE },
  ]);
}

/** Red WARNING triangle (point up), pale field, a small dark curve bar. */
function buildBendSign(): THREE.BufferGeometry {
  const y = SIGN_BOARD_Y;
  const outer = triangleBoard(
    [
      [-0.28, y - 0.24],
      [0.28, y - 0.24],
      [0, y + 0.28],
    ],
    0.05,
  );
  const inner = triangleBoard(
    [
      [-0.18, y - 0.16],
      [0.18, y - 0.16],
      [0, y + 0.18],
    ],
    0.06,
  );
  const curve = new THREE.BoxGeometry(0.06, 0.18, 0.07);
  curve.translate(0, y - 0.02, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: outer, color: SIGN_RED },
    { geometry: inner, color: SIGN_FIELD },
    { geometry: curve, color: MANHOLE_RIM_COLOR },
  ]);
}

/** Horizontal blue rectangle with a white arrow bar across it. */
function buildOneWaySign(): THREE.BufferGeometry {
  const board = new THREE.BoxGeometry(0.62, 0.24, 0.05);
  board.translate(0, SIGN_BOARD_Y, 0);
  const arrow = new THREE.BoxGeometry(0.46, 0.06, 0.06);
  arrow.translate(0, SIGN_BOARD_Y, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: board, color: SIGN_BLUE },
    { geometry: arrow, color: SIGN_WHITE },
  ]);
}

/** White CIRCLE with a red ring (larger red disc set behind the white face). */
function buildSpeedSign(): THREE.BufferGeometry {
  const rim = discBoard(0.32, 20, -0.005);
  const face = discBoard(0.28, 20, 0.01);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: rim, color: SIGN_RED },
    { geometry: face, color: SIGN_WHITE },
  ]);
}

/** Red CIRCLE with a white horizontal bar — a no-entry read. */
function buildNoThroughSign(): THREE.BufferGeometry {
  const disc = discBoard(0.3, 20, 0);
  const bar = new THREE.BoxGeometry(0.4, 0.1, 0.06);
  bar.translate(0, SIGN_BOARD_Y, 0.03);
  return mergeColoredGeometries([
    { geometry: buildSignPole(), color: SIGN_POLE_COLOR },
    { geometry: disc, color: SIGN_RED },
    { geometry: bar, color: SIGN_WHITE },
  ]);
}

/** One merged board geometry per sign type, all on the shared charcoal pole. */
/**
 * A traffic signal: a taller mast than a sign pole, a short arm reaching out
 * over the carriageway, and a dark head hung off it carrying the three lenses.
 * The lenses are plain colored discs — the head reads correctly at gameplay
 * distance without a per-junction phase state to drive, which the sim does not
 * model. Authored facing ±z like the boards, so writeSign's yaw rule applies
 * unchanged.
 */
function buildTrafficSignal(): THREE.BufferGeometry {
  const mast = new THREE.CylinderGeometry(
    SIGNAL_MAST_RADIUS,
    SIGNAL_MAST_RADIUS,
    SIGNAL_MAST_HEIGHT,
    12,
  );
  mast.translate(0, SIGNAL_MAST_HEIGHT / 2, 0);

  // The arm reaches toward the road, i.e. opposite the curb the mast stands on.
  const arm = new THREE.BoxGeometry(SIGNAL_ARM_LENGTH, SIGNAL_ARM_THICKNESS, SIGNAL_ARM_THICKNESS);
  arm.translate(SIGNAL_ARM_LENGTH / 2, SIGNAL_MAST_HEIGHT - SIGNAL_ARM_THICKNESS, 0);

  const headX = SIGNAL_ARM_LENGTH;
  const headY = SIGNAL_MAST_HEIGHT - SIGNAL_ARM_THICKNESS - SIGNAL_HEAD_HEIGHT / 2;
  const housing = new THREE.BoxGeometry(SIGNAL_HEAD_WIDTH, SIGNAL_HEAD_HEIGHT, SIGNAL_HEAD_DEPTH);
  housing.translate(headX, headY, 0);

  const parts: { geometry: THREE.BufferGeometry; color: number }[] = [
    { geometry: mast, color: SIGN_POLE_COLOR },
    { geometry: arm, color: SIGN_POLE_COLOR },
    { geometry: housing, color: SIGNAL_HOUSING_COLOR },
  ];

  // Red on top, amber, green — stacked down the face, standing just proud of
  // the housing so they are not z-fighting with it. These are the UNLIT
  // lenses: dark glass of each colour, so a head reads as a signal from any
  // angle. Exactly one of them is lit at a time, and the lit one is a separate
  // instanced disc laid over it (see SignalLampRenderer) because which one it
  // is changes every few seconds and the head geometry never does.
  const lensZ = CANTILEVER_FACE_Z * (SIGNAL_HEAD_DEPTH / 2 + 0.01);
  for (let i = 0; i < SIGNAL_LENS_DARK.length; i++) {
    const lens = new THREE.CylinderGeometry(SIGNAL_LENS_RADIUS, SIGNAL_LENS_RADIUS, 0.02, 10);
    lens.rotateX(Math.PI / 2); // face ±z, like the sign boards
    lens.translate(headX, headY + SIGNAL_LENS_SPACING * (1 - i), lensZ);
    parts.push({ geometry: lens, color: SIGNAL_LENS_DARK[i]! });
  }

  return mergeColoredGeometries(parts);
}

/**
 * Where a lit lens sits relative to the signal's own origin — the same stack
 * `buildTrafficSignal` lays out, so the lamp lands exactly on its dark lens.
 */
export function signalLensOffset(aspect: SignalAspect): { x: number; y: number; z: number } {
  const row = aspect === 'red' ? 0 : aspect === 'amber' ? 1 : 2;
  return {
    x: SIGNAL_ARM_LENGTH,
    y:
      SIGNAL_MAST_HEIGHT -
      SIGNAL_ARM_THICKNESS -
      SIGNAL_HEAD_HEIGHT / 2 +
      SIGNAL_LENS_SPACING * (1 - row),
    // Proud of the dark lens it covers: that lens is a 2 cm disc whose front
    // face stands at depth/2 + 0.02, and a lit lens laid in the same plane
    // fought it for every pixel, leaving only its wider rim alight.
    z: CANTILEVER_FACE_Z * (SIGNAL_HEAD_DEPTH / 2 + 0.03),
  };
}

/**
 * Where a placement stands in the world, and which way it faces.
 *
 * A signal is two instanced meshes — the mast with its dark head, and the one
 * lit lens laid over it — and they have to agree to the millimetre. They each
 * worked the transform out for themselves, and a CONTROL board, which every
 * signal is, carries an explicit offset placing it at the stop line rather
 * than at the kerb rule. Only the mast honoured it, so the lit lens hung in
 * the air metres from its own head. One function, read by both.
 */
export function signWorldTransform(p: SignPlacement): { x: number; z: number; yaw: number } {
  if (p.worldOffsetX !== undefined && p.worldOffsetZ !== undefined) {
    return {
      x: tileToWorld(p.x) + p.worldOffsetX,
      z: tileToWorld(p.z) + p.worldOffsetZ,
      yaw: p.yaw ?? 0,
    };
  }
  // The placement decides which way a board looks, because only it knows the
  // traffic the board is for. Recomputing one here threw that away and left a
  // facing that ignored which kerb the board stood on, so every board on one
  // side of a road showed drivers its back.
  const off = p.lateralOffset * p.side;
  const along = p.along ?? 0;
  return {
    x: p.axis === 'x' ? tileToWorld(p.x) + off : tileToWorld(p.x) + along,
    z: p.axis === 'z' ? tileToWorld(p.z) + off : tileToWorld(p.z) + along,
    yaw:
      p.yaw ??
      (isCantilevered(p.type) ? signalYaw(p.axis, p.side) : p.axis === 'x' ? 0 : Math.PI / 2),
  };
}

/** The colour a lit lens burns, by aspect. */
export function signalLampColor(aspect: SignalAspect): number {
  return aspect === 'red' ? SIGNAL_RED : aspect === 'amber' ? SIGNAL_AMBER : SIGNAL_GREEN;
}

/** The lit lens itself: a disc a shade larger than the dark one it covers. */
function buildSignalLampGeometry(): THREE.BufferGeometry {
  const lens = new THREE.CircleGeometry(SIGNAL_LENS_RADIUS * 1.05, 12);
  // A disc is drawn from one side only, and that side has to be the head's face.
  if (CANTILEVER_FACE_Z < 0) lens.rotateY(Math.PI);
  const count = lens.getAttribute('position').count;
  // Coloured per instance, but the material reads vertex colours like every
  // other furniture layer, so the attribute has to be there to be multiplied.
  lens.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3));
  return lens;
}

/**
 * Which way the road an approach faces runs. The curb offset is across the
 * road, so a curb along x means the carriageway runs north-south.
 */
function runsNorthSouth(sign: SignPlacement): boolean {
  return sign.axis === 'x';
}

/** A lattice truss between two points along local X: two chords and diagonals. */
function trussSection(
  fromX: number,
  toX: number,
  y: number,
  depth: number,
  bays: number,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const span = toX - fromX;
  const midX = (fromX + toX) / 2;
  const chordSize = depth * 0.32;

  for (const dy of [-depth / 2, depth / 2]) {
    const chord = new THREE.BoxGeometry(span, chordSize, chordSize);
    chord.translate(midX, y + dy, 0);
    out.push(chord);
  }

  // Alternating diagonals between the chords — the zig-zag that makes a beam
  // read as a sign truss rather than a plain girder.
  const bayWidth = span / bays;
  const diagonal = Math.hypot(bayWidth, depth);
  const tilt = Math.atan2(depth, bayWidth);
  for (let i = 0; i < bays; i++) {
    const web = new THREE.BoxGeometry(diagonal, chordSize * 0.7, chordSize * 0.7);
    web.rotateZ(i % 2 === 0 ? tilt : -tilt);
    web.translate(fromX + bayWidth * (i + 0.5), y, 0);
    out.push(web);
  }
  return out;
}

/**
 * A motorway exit board, cantilevered: one post at the shoulder, a truss arm
 * reaching out over the carriageway, and the green panel hung off the arm with
 * its exit-number tab riding above the top edge and a yellow advisory plaque
 * below. Authored reaching along +X, like the traffic signal, so `signalYaw`
 * turns the arm inward from whichever curb it lands on.
 */
function buildExitSign(): THREE.BufferGeometry {
  const parts: { geometry: THREE.BufferGeometry; color: number }[] = [];

  const post = new THREE.CylinderGeometry(EXIT_POST_RADIUS, EXIT_POST_RADIUS, EXIT_POST_HEIGHT, 12);
  post.translate(0, EXIT_POST_HEIGHT / 2, 0);
  parts.push({ geometry: post, color: GANTRY_STEEL });

  const armY = EXIT_POST_HEIGHT - EXIT_TRUSS_DEPTH;
  for (const g of trussSection(0, EXIT_ARM_LENGTH, armY, EXIT_TRUSS_DEPTH, 3))
    parts.push({ geometry: g, color: GANTRY_STEEL });

  // Panel hangs under the arm, centred on the arm's far half.
  const panelX = EXIT_ARM_LENGTH * 0.62;
  const panelY = armY - EXIT_TRUSS_DEPTH / 2 - EXIT_BOARD_HEIGHT / 2;
  const board = new THREE.BoxGeometry(EXIT_BOARD_WIDTH, EXIT_BOARD_HEIGHT, 0.07);
  board.translate(panelX, panelY, 0);
  parts.push({ geometry: board, color: HIGHWAY_GREEN });

  // Two white legend bars — a place name over a street name, as on a real board.
  for (const [row, width] of [
    [0.2, 0.66],
    [-0.16, 0.5],
  ] as const) {
    const legend = new THREE.BoxGeometry(EXIT_BOARD_WIDTH * width, EXIT_BOARD_HEIGHT * 0.14, 0.02);
    legend.translate(
      panelX - EXIT_BOARD_WIDTH * 0.08,
      panelY + EXIT_BOARD_HEIGHT * row,
      CANTILEVER_FACE_Z * 0.05,
    );
    parts.push({ geometry: legend, color: SIGN_WHITE });
  }

  // The diagonal exit arrow in the panel's bottom corner.
  const arrow = new THREE.BoxGeometry(EXIT_BOARD_WIDTH * 0.16, EXIT_BOARD_HEIGHT * 0.1, 0.02);
  arrow.rotateZ(Math.PI / 4);
  arrow.translate(
    panelX + EXIT_BOARD_WIDTH * 0.33,
    panelY - EXIT_BOARD_HEIGHT * 0.2,
    CANTILEVER_FACE_Z * 0.05,
  );
  parts.push({ geometry: arrow, color: SIGN_WHITE });

  // Exit-number tab, riding above the panel's top edge on its outer end.
  const tabW = EXIT_BOARD_WIDTH * 0.3;
  const tabH = EXIT_BOARD_HEIGHT * 0.3;
  const tab = new THREE.BoxGeometry(tabW, tabH, 0.06);
  tab.translate(panelX - EXIT_BOARD_WIDTH * 0.3, panelY + EXIT_BOARD_HEIGHT / 2 + tabH / 2, 0);
  parts.push({ geometry: tab, color: HIGHWAY_GREEN });
  const tabLegend = new THREE.BoxGeometry(tabW * 0.7, tabH * 0.24, 0.02);
  tabLegend.translate(
    panelX - EXIT_BOARD_WIDTH * 0.3,
    panelY + EXIT_BOARD_HEIGHT / 2 + tabH / 2,
    CANTILEVER_FACE_Z * 0.04,
  );
  parts.push({ geometry: tabLegend, color: SIGN_WHITE });

  // Yellow advisory-speed plaque under the panel — the small square that tells
  // you how fast the ramp actually takes.
  const plaque = new THREE.BoxGeometry(ADVISORY_PLAQUE, ADVISORY_PLAQUE, 0.05);
  plaque.translate(panelX, panelY - EXIT_BOARD_HEIGHT / 2 - ADVISORY_PLAQUE / 2 - 0.08, 0);
  parts.push({ geometry: plaque, color: ADVISORY_YELLOW });

  return mergeColoredGeometries(parts);
}

/**
 * An overhead gantry: legs OUTSIDE both shoulders, a truss beam carrying right
 * across the carriageway between them, and a panel hung beneath it over the
 * traffic. Authored spanning local X and centred on the tile, so writeSign's
 * existing yaw rule turns it to span whichever way the road runs — this is the
 * one sign type that sits on the centreline rather than at a curb.
 */
/** How far the modelled gantry reaches either side, to its legs: the three-lane motorway's. */
function gantryModelReach(): number {
  return carriagewayHalfWidthMeters(RoadTier.Highway) + GANTRY_LEG_CLEARANCE;
}

function buildGantrySign(): THREE.BufferGeometry {
  const parts: { geometry: THREE.BufferGeometry; color: number }[] = [];
  const reach = gantryModelReach();

  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(GANTRY_LEG_RADIUS, GANTRY_LEG_RADIUS, GANTRY_HEIGHT, 10);
    leg.translate(side * reach, GANTRY_HEIGHT / 2, 0);
    parts.push({ geometry: leg, color: GANTRY_STEEL });
  }

  const beamY = GANTRY_HEIGHT - GANTRY_TRUSS_DEPTH / 2;
  for (const g of trussSection(-reach, reach, beamY, GANTRY_TRUSS_DEPTH, 8))
    parts.push({ geometry: g, color: GANTRY_STEEL });

  // Two panels hung side by side under the truss — through traffic on the left,
  // the exit on the right, which is what makes a gantry worth having over a
  // roadside board: it can tell you which LANE, not just which turning.
  const panelY = beamY - GANTRY_TRUSS_DEPTH / 2 - GANTRY_PANEL_HEIGHT / 2;
  const panels: { centerX: number; width: number }[] = [
    { centerX: -GANTRY_PANEL_WIDTH * 0.3, width: GANTRY_PANEL_WIDTH * 0.52 },
    { centerX: GANTRY_PANEL_WIDTH * 0.34, width: GANTRY_PANEL_WIDTH * 0.36 },
  ];

  for (const { centerX, width } of panels) {
    const panel = new THREE.BoxGeometry(width, GANTRY_PANEL_HEIGHT, 0.08);
    panel.translate(centerX, panelY, 0);
    parts.push({ geometry: panel, color: HIGHWAY_GREEN });

    const legend = new THREE.BoxGeometry(width * 0.62, GANTRY_PANEL_HEIGHT * 0.16, 0.02);
    legend.translate(centerX, panelY + GANTRY_PANEL_HEIGHT * 0.16, 0.06);
    parts.push({ geometry: legend, color: SIGN_WHITE });

    // Lane-assignment down-arrows along the panel's bottom edge: a shaft with a
    // rotated square head, the detail that reads as "this lane, this way".
    const arrowY = panelY - GANTRY_PANEL_HEIGHT * 0.2;
    for (const t of [-0.25, 0.25]) {
      const shaft = new THREE.BoxGeometry(width * 0.035, GANTRY_PANEL_HEIGHT * 0.22, 0.02);
      shaft.translate(centerX + width * t, arrowY, 0.06);
      parts.push({ geometry: shaft, color: SIGN_WHITE });

      const head = new THREE.BoxGeometry(width * 0.09, width * 0.09, 0.02);
      head.rotateZ(Math.PI / 4);
      head.translate(centerX + width * t, arrowY - GANTRY_PANEL_HEIGHT * 0.12, 0.06);
      parts.push({ geometry: head, color: SIGN_WHITE });
    }
  }

  return mergeColoredGeometries(parts);
}

function buildSignGeometries(): Record<SignType, THREE.BufferGeometry> {
  return {
    stop: buildStopSign(),
    giveway: buildGiveWaySign(),
    bend: buildBendSign(),
    oneway: buildOneWaySign(),
    speed: buildSpeedSign(),
    nothrough: buildNoThroughSign(),
    signal: buildTrafficSignal(),
    exit: buildExitSign(),
    gantry: buildGantrySign(),
  };
}

/**
 * Sign types that reach out over the road on an arm rather than standing flat
 * at the curb. A flat board reads from either side, so its yaw can ignore which
 * curb it is on; an arm cannot — point it the wrong way and it hangs over the
 * grass.
 */
function isCantilevered(type: SignType): boolean {
  return type === 'signal' || type === 'exit';
}

/**
 * Yaw that swings an authored +X mast arm inward over the road, given the curb
 * it stands on. A rotation of θ about Y sends local +X to world
 * (cos θ, 0, −sin θ); the arm must point opposite the lateral offset, so each
 * axis/side pair has exactly one answer.
 */
export function signalYaw(axis: FurnitureAxis, side: FurnitureSide): number {
  if (axis === 'x') return side > 0 ? Math.PI : 0;
  return side > 0 ? Math.PI / 2 : -Math.PI / 2;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _stretch = new THREE.Vector3(1, 1, 1);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _lampBase = new THREE.Vector3();
const _lampColor = new THREE.Color();

export interface FurnitureCounts {
  manholes: number;
  boxes: number;
  meters: number;
  signs: number;
}

/**
 * One instanced layer that outlives a rebuild: a disposed mesh takes its
 * material's compiled pipeline with it, so the mesh is replaced only to hold
 * more, by doubling, and its live count follows the placements.
 */
class KeptInstances {
  private mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly userData: Record<string, unknown>,
    private readonly setup: (mesh: THREE.InstancedMesh) => void,
  ) {}

  /** The mesh sized for `count` instances (hidden at 0), or null while none was ever needed. */
  fit(count: number): THREE.InstancedMesh | null {
    if (count > this.capacity) {
      this.release();
      this.capacity = Math.max(MIN_INSTANCE_CAPACITY, this.capacity);
      while (this.capacity < count) this.capacity *= 2;
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
      Object.assign(mesh.userData, this.userData);
      this.setup(mesh);
      this.mesh = mesh;
      this.scene.add(mesh);
    }
    const mesh = this.mesh;
    if (!mesh) return null;
    setInstanceCount(mesh, count);
    // The instances are rewritten: a bound taken from earlier ones would cull them.
    mesh.boundingSphere = null;
    return mesh;
  }

  private release(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }

  /** Frees the mesh and forgets its capacity, so a later fit() starts again. */
  dispose(): void {
    this.release();
    this.capacity = 0;
  }
}

export class RoadFurnitureRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  private readonly manholeGeometry = buildManholeGeometry();
  private readonly manholeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly boxGeometry = buildBoxGeometry();
  private readonly pedestalGeometry = buildPedestalGeometry();
  private readonly boxMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly meterGeometry = buildMeterGeometry();
  private readonly meterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly signGeometries = buildSignGeometries();
  private readonly signMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly manholeLayer: KeptInstances;
  private readonly boxLayer: KeptInstances;
  private readonly pedestalLayer: KeptInstances;
  private readonly meterLayer: KeptInstances;
  /** One layer per sign type, made the first time that type is placed. */
  private readonly signLayers = new Map<SignType, KeptInstances>();

  /**
   * The one lit lens on each signal head. A separate instanced disc rather
   * than part of the head, because which lens burns changes every few seconds
   * and the head itself never does. Unlit — a MeshBasicMaterial — so a signal
   * still reads at night, when the whole street is dimmed toward the lamp
   * pools.
   */
  private readonly lampGeometry = buildSignalLampGeometry();
  private readonly lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  private lampMesh: THREE.InstancedMesh | null = null;
  private readonly lampLayer: KeptInstances;

  /** The tram's contact poles: a mast and its bracket arm, each one instanced pool. */
  private readonly tramPoleGeometry = new THREE.CylinderGeometry(
    TRAM_POLE_RADIUS_M,
    TRAM_POLE_RADIUS_M,
    TRAM_POLE_HEIGHT_M,
    TRAM_POLE_SEGMENTS,
  ).translate(0, TRAM_POLE_HEIGHT_M / 2, 0);
  private readonly tramArmGeometry = new THREE.BoxGeometry(
    TRAM_POLE_ARM_LENGTH_M,
    TRAM_POLE_ARM_THICKNESS_M,
    TRAM_POLE_ARM_THICKNESS_M,
  ).translate(TRAM_POLE_ARM_LENGTH_M / 2, TRAM_POLE_ARM_HEIGHT_M, 0);
  private readonly tramPoleMaterial = new THREE.MeshLambertMaterial({ color: TRAM_POLE_COLOR });
  private readonly tramPoleLayer: KeptInstances;
  private readonly tramArmLayer: KeptInstances;
  private tramPoles: readonly TramPoleStand[] = [];

  private manholes: ManholePlacement[] = [];
  private boxes: BoxPlacement[] = [];
  private meters: MeterPlacement[] = [];
  private signs: SignPlacement[] = [];
  /** The signal heads, in the order their lamps are instanced. */
  private signalHeads: SignPlacement[] = [];
  /** Seconds into the signal cycle, as last set. */
  private signalSeconds = 0;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.manholeLayer = new KeptInstances(
      scene,
      this.manholeGeometry,
      this.manholeMaterial,
      { furnitureKind: 'manhole' },
      (mesh) => {
        mesh.castShadow = false; // flat disc — nothing to cast
        mesh.receiveShadow = true;
      },
    );
    this.boxLayer = new KeptInstances(
      scene,
      this.boxGeometry,
      this.boxMaterial,
      { furnitureKind: 'box' },
      (mesh) => {
        mesh.castShadow = true;
      },
    );
    this.pedestalLayer = new KeptInstances(
      scene,
      this.pedestalGeometry,
      this.boxMaterial,
      { furnitureKind: 'pedestal' },
      (mesh) => {
        mesh.castShadow = true;
      },
    );
    this.meterLayer = new KeptInstances(
      scene,
      this.meterGeometry,
      this.meterMaterial,
      { furnitureKind: 'meter' },
      (mesh) => {
        mesh.castShadow = true;
      },
    );
    this.lampLayer = new KeptInstances(
      scene,
      this.lampGeometry,
      this.lampMaterial,
      { furnitureKind: 'signalLamp' },
      () => {},
    );
    this.tramPoleLayer = new KeptInstances(
      scene,
      this.tramPoleGeometry,
      this.tramPoleMaterial,
      { furnitureKind: 'tramPole' },
      (mesh) => {
        mesh.castShadow = true;
      },
    );
    this.tramArmLayer = new KeptInstances(
      scene,
      this.tramArmGeometry,
      this.tramPoleMaterial,
      { furnitureKind: 'tramArm' },
      (mesh) => {
        mesh.castShadow = true;
      },
    );
  }

  /**
   * Full rebuild from the current road tile set (roads change relatively
   * rarely). `keepOff` holds tiles, keyed x·100 000 + z, where a road off the
   * grid meets: the tile's own role — a corner, a straight — no longer says
   * where its kerbs are, so nothing it earned is stood there.
   */
  rebuild(
    roadTiles: readonly FurnitureRoadTile[],
    keepOff?: ReadonlySet<number>,
    roadside?: Roadside,
  ): void {
    const allowed = <T extends { x: number; z: number }>(placements: T[]): T[] =>
      keepOff && keepOff.size > 0
        ? placements.filter((p) => !keepOff.has(p.x * 100_000 + p.z))
        : placements;
    // Signs take their places first, then meters, then boxes; each gives way
    // to what the roadside already holds and to what went down before it.
    const here = roadside && { clear: roadside.clear, taken: roadside.taken.clone() };
    this.manholes = allowed(computeManholePlacements(roadTiles));
    this.signs = allowed(computeSignPlacements(roadTiles, here));
    this.meters = allowed(computeMeterPlacements(roadTiles, here));
    this.boxes = allowed(computeBoxPlacements(roadTiles, here));

    const manholeMesh = this.manholeLayer.fit(this.manholes.length);
    if (manholeMesh) {
      for (let i = 0; i < this.manholes.length; i++)
        this.writeManhole(manholeMesh, i, this.manholes[i]!);
      manholeMesh.instanceMatrix.needsUpdate = true;
    }

    // The two cabinets share a slot and a siting rule but not a shape, so each
    // takes its own instanced mesh.
    const cabinets = this.boxes.filter((b) => b.kind === 'cabinet');
    const pedestals = this.boxes.filter((b) => b.kind === 'pedestal');
    const boxMesh = this.boxLayer.fit(cabinets.length);
    if (boxMesh) {
      for (let i = 0; i < cabinets.length; i++)
        this.writeBox(boxMesh, i, cabinets[i]!, BOX_HEIGHT / 2);
      boxMesh.instanceMatrix.needsUpdate = true;
    }
    const pedestalMesh = this.pedestalLayer.fit(pedestals.length);
    if (pedestalMesh) {
      // Authored with its base at the origin, so it seats on the ground itself.
      for (let i = 0; i < pedestals.length; i++) this.writeBox(pedestalMesh, i, pedestals[i]!, 0);
      pedestalMesh.instanceMatrix.needsUpdate = true;
    }

    const meterMesh = this.meterLayer.fit(this.meters.length);
    if (meterMesh) {
      for (let i = 0; i < this.meters.length; i++) this.writeMeter(meterMesh, i, this.meters[i]!);
      meterMesh.instanceMatrix.needsUpdate = true;
    }

    // One InstancedMesh per sign type, grouping the placements by type; a type
    // that is no longer placed keeps its mesh, hidden.
    const byType = new Map<SignType, SignPlacement[]>();
    for (const s of this.signs) {
      const group = byType.get(s.type);
      if (group) group.push(s);
      else byType.set(s.type, [s]);
    }
    for (const type of byType.keys()) {
      if (this.signLayers.has(type)) continue;
      this.signLayers.set(
        type,
        new KeptInstances(
          this.scene,
          this.signGeometries[type],
          this.signMaterial,
          { furnitureKind: 'sign', signType: type },
          (mesh) => {
            mesh.castShadow = true;
          },
        ),
      );
    }
    for (const [type, layer] of this.signLayers) {
      const group = byType.get(type) ?? [];
      const mesh = layer.fit(group.length);
      if (!mesh) continue;
      for (let i = 0; i < group.length; i++) this.writeSign(mesh, i, group[i]!);
      mesh.instanceMatrix.needsUpdate = true;
    }

    this.signalHeads = this.signs.filter((s) => s.type === 'signal');
    this.lampMesh = this.lampLayer.fit(this.signalHeads.length);
    this.writeSignalLamps();
  }

  /**
   * Stands the tram contact poles. They are placed apart from the rest of the
   * furniture because they keep off the driveways, which change with the
   * buildings rather than the roads, and the street lamps step aside for them.
   */
  setTramPoles(poles: readonly TramPoleStand[]): void {
    this.tramPoles = poles;
    const pole = this.tramPoleLayer.fit(poles.length);
    const arm = this.tramArmLayer.fit(poles.length);
    if (!pole || !arm) return;
    poles.forEach((p, i) => {
      _position.set(p.x, this.heightAt(p.x, p.z), p.z);
      _matrix.compose(_position, _identityQuat, _scale);
      pole.setMatrixAt(i, _matrix);
      _quat.setFromAxisAngle(_yAxis, Math.atan2(-p.reachZ, p.reachX));
      _matrix.compose(_position, _quat, _scale);
      arm.setMatrixAt(i, _matrix);
    });
    pole.instanceMatrix.needsUpdate = true;
    arm.instanceMatrix.needsUpdate = true;
  }

  /** The tram poles standing, from the last setTramPoles(). */
  tramPoleStands(): readonly TramPoleStand[] {
    return this.tramPoles;
  }

  /**
   * Advances the signal cycle. `seconds` is time as the TRAFFIC sees it, so a
   * paused city holds its lights and a fast-forwarded one cycles them faster —
   * the same clock the cars on the road are running on.
   */
  setSignalPhase(seconds: number): void {
    if (seconds === this.signalSeconds) return;
    this.signalSeconds = seconds;
    this.writeSignalLamps();
  }

  /** The aspect each head is showing right now, in instance order. */
  signalAspects(): SignalAspect[] {
    return this.signalHeads.map((s) => signalAspect(runsNorthSouth(s), this.signalSeconds));
  }

  private writeSignalLamps(): void {
    const mesh = this.lampMesh;
    if (!mesh) return;
    for (let i = 0; i < this.signalHeads.length; i++) {
      const sign = this.signalHeads[i]!;
      const aspect = signalAspect(runsNorthSouth(sign), this.signalSeconds);
      this.writeSignalLamp(mesh, i, sign, aspect);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private writeSignalLamp(
    mesh: THREE.InstancedMesh,
    slot: number,
    p: SignPlacement,
    aspect: SignalAspect,
  ): void {
    // The head hangs off the signal's own transform, so the lamp rides the
    // same one and is then offset into the head in the signal's local frame.
    const { x: wx, z: wz, yaw } = signWorldTransform(p);
    _quat.setFromAxisAngle(_yAxis, yaw);
    const local = signalLensOffset(aspect);
    _position
      .set(local.x, local.y, local.z)
      .applyQuaternion(_quat)
      .add(_lampBase.set(wx, this.heightAt(wx, wz), wz));
    _matrix.compose(_position, _quat, _scale);
    mesh.setMatrixAt(slot, _matrix);
    _lampColor.setHex(signalLampColor(aspect));
    mesh.setColorAt(slot, _lampColor);
  }

  /**
   * Where each signal's mast stands and where its head actually hangs, in
   * world metres, worked out through the same transform the renderer writes
   * into the instance matrix.
   *
   * A head is a few pixels across in a screenshot and its arm is foreshortened
   * to nothing from overhead, so whether it reaches out over the lanes it
   * holds or stops at the kerb is not a question a picture can answer — it was
   * guessed at from one, twice. This answers it in metres, to be compared
   * against the carriageway the arm is supposed to reach across.
   */
  signalPlacements(): {
    mast: { x: number; z: number };
    head: { x: number; z: number };
    axis: FurnitureAxis;
    side: FurnitureSide;
    tile: { x: number; z: number };
  }[] {
    return this.signalHeads.map((p) => {
      const { x, z, yaw } = signWorldTransform(p);
      // The lens rides the signal's own transform and is then offset into the
      // head in its local frame; the aspect only moves it up and down the
      // stack, so any of the three gives the same reach.
      const local = signalLensOffset('red');
      return {
        mast: { x, z },
        head: {
          x: x + local.x * Math.cos(yaw) + local.z * Math.sin(yaw),
          z: z - local.x * Math.sin(yaw) + local.z * Math.cos(yaw),
        },
        axis: p.axis,
        side: p.side,
        tile: { x: p.x, z: p.z },
      };
    });
  }

  /** Where each cabinet stands and which kind it is, from the last rebuild(). */
  cabinetPlacements(): readonly BoxPlacement[] {
    return this.boxes;
  }

  /** Instance counts for each prop layer from the last rebuild(). */
  furnitureCounts(): FurnitureCounts {
    return {
      manholes: this.manholes.length,
      boxes: this.boxes.length,
      meters: this.meters.length,
      signs: this.signs.length,
    };
  }

  private writeManhole(mesh: THREE.InstancedMesh, slot: number, p: ManholePlacement): void {
    const cx = tileToWorld(p.x);
    const cz = tileToWorld(p.z);
    const wx = p.axis === 'x' ? cx + p.lateral : cx;
    const wz = p.axis === 'z' ? cz + p.lateral : cz;
    _quat.setFromAxisAngle(_yAxis, p.rotationY);
    _position.set(wx, this.heightAt(wx, wz) + MANHOLE_LIFT, wz);
    _matrix.compose(_position, _quat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeBox(
    mesh: THREE.InstancedMesh,
    slot: number,
    p: BoxPlacement,
    baseLift: number,
  ): void {
    const off = p.lateralOffset * p.side;
    const along = p.along ?? 0;
    const wx = p.axis === 'x' ? tileToWorld(p.x) + off : tileToWorld(p.x) + along;
    const wz = p.axis === 'z' ? tileToWorld(p.z) + off : tileToWorld(p.z) + along;
    _position.set(wx, this.heightAt(wx, wz) + baseLift, wz);
    _matrix.compose(_position, _identityQuat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeMeter(mesh: THREE.InstancedMesh, slot: number, p: MeterPlacement): void {
    const cx = tileToWorld(p.x);
    const cz = tileToWorld(p.z);
    const off = p.lateralOffset * p.side;
    const runAxis: FurnitureAxis = p.curbAxis === 'x' ? 'z' : 'x';
    const wx = cx + (p.curbAxis === 'x' ? off : 0) + (runAxis === 'x' ? p.along : 0);
    const wz = cz + (p.curbAxis === 'z' ? off : 0) + (runAxis === 'z' ? p.along : 0);
    _position.set(wx, this.heightAt(wx, wz) + CURB_Y_OFFSET, wz);
    _matrix.compose(_position, _identityQuat, _scale);
    mesh.setMatrixAt(slot, _matrix);
  }

  private writeSign(mesh: THREE.InstancedMesh, slot: number, p: SignPlacement): void {
    const { x: wx, z: wz, yaw } = signWorldTransform(p);
    _quat.setFromAxisAngle(_yAxis, yaw);
    // The pole is modelled for a board 2.1 m up; where there is no walk to
    // clear it stands 0.6 m shorter, which is the same pole sunk in the ground.
    const sunk = p.bottom === undefined ? 0 : SIGN_BOTTOM_OVER_WALK_M - p.bottom;
    _position.set(wx, this.heightAt(wx, wz) - sunk, wz);
    // A gantry is stretched across its own road, which is only a transform.
    const stretch = p.span === undefined ? 1 : p.span / gantryModelReach();
    _matrix.compose(_position, _quat, _stretch.set(stretch, 1, 1));
    mesh.setMatrixAt(slot, _matrix);
  }

  /** Removes every layer from the scene and frees the shared geometries/materials. */
  dispose(): void {
    // Releasing a layer frees its instance buffers and leaves the shared geometry be.
    for (const layer of [
      this.manholeLayer,
      this.boxLayer,
      this.pedestalLayer,
      this.meterLayer,
      ...this.signLayers.values(),
      this.lampLayer,
      this.tramPoleLayer,
      this.tramArmLayer,
    ]) {
      layer.dispose();
    }
    this.signLayers.clear();
    this.lampMesh = null;
    this.signalHeads = [];
    this.tramPoles = [];
    this.tramPoleGeometry.dispose();
    this.tramArmGeometry.dispose();
    this.tramPoleMaterial.dispose();
    this.manholeGeometry.dispose();
    this.boxGeometry.dispose();
    this.pedestalGeometry.dispose();
    this.meterGeometry.dispose();
    for (const geometry of Object.values(this.signGeometries)) geometry.dispose();
    this.manholeMaterial.dispose();
    this.boxMaterial.dispose();
    this.meterMaterial.dispose();
    this.signMaterial.dispose();
    this.lampGeometry.dispose();
    this.lampMaterial.dispose();
  }
}
