/**
 * Road composition: the derivations that turn a class and a cross-section into
 * the numbers the sim and the render already consume — speed, capacity,
 * carriageway width, kerbs. Pure functions over data; no grid, no three.js.
 *
 * The sim already speaks real units: a road's speed is metres per second and
 * an edge's cost is length over speed, so seconds. Capacity is the one figure
 * that needs a calibration, and it is a single constant: game capacity units
 * per vehicle per hour, chosen so the two-lane preset keeps its 600.
 */
import roadsData from '../data/roads.json';
import type {
  LaneFlow,
  LanePiece,
  LanePieceKind,
  RoadClassId,
  RoadClassSpec,
  RoadProfile,
  RoadSpec,
  RoadTier,
} from './types';
import { TILE_METERS } from './constants';

const data = roadsData as { classes: RoadClassSpec[]; specs: RoadSpec[] };

export const ROAD_CLASSES: readonly RoadClassSpec[] = data.classes;
export const ROAD_PRESETS: readonly RoadSpec[] = data.specs;

/** HCM base saturation flow for an urban lane, veh/h/lane. */
export const SATURATION_FLOW_VEH_PER_HOUR = 1900;
/**
 * Game capacity units per veh/h. The two-lane preset is 600 for two lanes at
 * 700 veh/h each (1,900 × 0.37 green ratio), so 600 / 1,400 = 3/7.
 */
export const CAPACITY_PER_VEH_PER_HOUR = 3 / 7;
/** Per-lane figures are rounded to this so they read as catalogue numbers, not decimals. */
const LANE_CAPACITY_STEP = 25;

/**
 * People-carrying pieces in car-equivalent game units. A bus lane at 50
 * buses/h × 48 riders ÷ 1.5 riders per car-trip is ~1,600 car-equivalents/h;
 * a tram track at 30 trams/h × 150 riders is ~1,500; a bike lane counts its
 * share of commute trips at the sim's granularity, not its physical 1,500
 * bikes/h; a rail track is the §26 figure carried over.
 */
export const TRANSIT_PIECE_CAPACITY: Readonly<Record<'bus' | 'tram' | 'bike' | 'rail', number>> = {
  bus: 700,
  tram: 650,
  bike: 75,
  rail: 3000,
};

/**
 * Profile ids: 0 is no road, 1..11 are the presets and equal their tier, and
 * player-composed profiles start here, in the save's own table.
 */
export const FIRST_CUSTOM_PROFILE_ID = 12;

export function isPresetProfileId(id: number): boolean {
  return id >= 1 && id < FIRST_CUSTOM_PROFILE_ID;
}

/** A preset's profile id is its tier. */
export function profileIdForTier(tier: RoadTier): number {
  return tier;
}

/**
 * The nearest preset tier for a profile — what every consumer that still
 * reads a tier (lamps, kerb parking, water conduction, the render's shade)
 * sees when the tile carries a composed profile. Reserved transit lanes win
 * over the class, since a street with a tram down it is a tram street first;
 * otherwise the class maps to the preset that shares its role. Every preset
 * maps back to its own tier.
 */
export function tierForProfile(profile: RoadProfile): RoadTier {
  if (profile.class === 'rail') return 11 as RoadTier;
  if (profile.pieces.some((p) => p.kind === 'tram' || p.tram)) return 10 as RoadTier;
  if (profile.pieces.some((p) => p.kind === 'bus')) return 8 as RoadTier;
  if (profile.pieces.some((p) => p.kind === 'bike')) return 9 as RoadTier;
  const byClass: Record<RoadClassId, number> = {
    dirt: 4,
    alley: 5,
    rural: 1,
    local: 1,
    urban: 7,
    collector: 7,
    arterial: 2,
    divided: 2,
    oneWay: 6,
    highway: 3,
    ramp: 6,
    rail: 11,
  };
  return byClass[profile.class] as RoadTier;
}

/** The preset profile a tier is shorthand for. Every tier has one. */
export function presetProfileForTier(tier: RoadTier): RoadProfile {
  const spec = ROAD_PRESETS.find((s) => s.tier === tier);
  if (!spec?.profile) throw new RangeError(`roadprofile: no preset profile for tier ${tier}`);
  return spec.profile;
}

export function roadClass(id: RoadClassId): RoadClassSpec {
  const found = ROAD_CLASSES.find((c) => c.id === id);
  if (!found) throw new RangeError(`roadprofile: no class ${id}`);
  return found;
}

/** Sim speed (m/s) from a posted speed. 50 km/h → 14, 100 km/h → 28. */
export function speedFromKmh(kmh: number): number {
  return Math.round(kmh / 3.6);
}

/** A profile's sim speed: its posted speed, or the class default, over 3.6. */
export function profileSpeed(profile: RoadProfile): number {
  const cls = roadClass(profile.class);
  const posted = profile.postedKmh ?? cls.postedKmh.default;
  return speedFromKmh(Math.min(cls.postedKmh.max, Math.max(cls.postedKmh.min, posted)));
}

/**
 * Game capacity of one travel lane of a class: saturation flow × the share of
 * time the lane moves, or the free-flow figure, times the calibration
 * constant, to the nearest catalogue step.
 */
export function laneCapacity(classId: RoadClassId): number {
  const flow = roadClass(classId).laneFlow;
  const vehPerHour =
    'greenRatio' in flow ? SATURATION_FLOW_VEH_PER_HOUR * flow.greenRatio : flow.vehPerHour;
  return (
    Math.round((vehPerHour * CAPACITY_PER_VEH_PER_HOUR) / LANE_CAPACITY_STEP) * LANE_CAPACITY_STEP
  );
}

/** Game capacity of one piece. A shared two-way travel lane counts for both directions. */
export function pieceCapacity(piece: LanePiece, classId: RoadClassId): number {
  switch (piece.kind) {
    case 'travel': {
      const lanes = (piece.flow ?? 'both') === 'both' ? 2 : 1;
      return lanes * laneCapacity(classId) + (piece.tram ? TRANSIT_PIECE_CAPACITY.tram : 0);
    }
    case 'bus':
      return TRANSIT_PIECE_CAPACITY.bus;
    case 'tram':
      return TRANSIT_PIECE_CAPACITY.tram;
    case 'bike':
      return TRANSIT_PIECE_CAPACITY.bike;
    case 'rail':
      return TRANSIT_PIECE_CAPACITY.rail;
    default:
      return 0;
  }
}

/** Σ piece capacity — what replaces the per-tier scalar. */
export function profileCapacity(profile: RoadProfile): number {
  return profile.pieces.reduce((sum, p) => sum + pieceCapacity(p, profile.class), 0);
}

/**
 * Traffic lanes in the profile, both directions summed: travel lanes, the
 * reserved bus and tram lanes, which are lanes with a different occupant, and
 * a centre turn lane, which is the third lane of a three-lane street. A shared
 * two-way lane counts for both directions.
 */
export function laneCount(profile: RoadProfile): number {
  return profile.pieces.reduce((n, p) => {
    if (p.kind === 'centreTurn') return n + 1;
    if (p.kind !== 'travel' && p.kind !== 'bus' && p.kind !== 'tram') return n;
    return n + ((p.flow ?? 'both') === 'both' ? 2 : 1);
  }, 0);
}

const CARRIAGEWAY_KINDS: ReadonlySet<LanePiece['kind']> = new Set([
  'travel',
  'centreTurn',
  'parking',
  'bike',
  'bus',
  'tram',
  'rail',
  'median',
  'barrier',
  'shoulder',
]);

/** Paved (or ballasted) width between the kerbs, metres. Sidewalks and verges are outside it. */
export function carriagewayWidth(profile: RoadProfile): number {
  return profile.pieces.reduce((w, p) => (CARRIAGEWAY_KINDS.has(p.kind) ? w + p.width : w), 0);
}

/** The lane width every preset was drawn with; a footway is half of it. */
export const PRESET_LANE_WIDTH_M = 3.75;
export const FOOTWAY_WIDTH_M = 0.5 * PRESET_LANE_WIDTH_M; // 1.875 m

/** Metres from the centreline to the carriageway edge — what everything beside a road measures from. */
export function carriagewayHalfWidthOf(profile: RoadProfile): number {
  return carriagewayWidth(profile) / 2;
}

/**
 * Width of the kerb strip a profile draws outside its carriageway: a full
 * footway where the tile has room for one, clamped to whatever is left where it
 * does not, and nothing at all where the profile has no kerbs. A motorway is
 * 15 m of carriageway in a 16 m tile, so it gets half a metre of kerb, not a
 * pavement — its shoulders are inside the paved width already.
 */
export function kerbWidthOf(profile: RoadProfile): number {
  if (!hasKerbs(profile)) return 0;
  return Math.max(0, Math.min(FOOTWAY_WIDTH_M, TILE_METERS / 2 - carriagewayHalfWidthOf(profile)));
}

/** Kerb to kerb including footways, metres — what the tile has to hold. */
export function profileWidth(profile: RoadProfile): number {
  return profile.pieces.reduce((w, p) => w + p.width, 0);
}

/** Whether the profile fits one tile. What is left over is verge. */
export function fitsTile(profile: RoadProfile): boolean {
  return profileWidth(profile) <= TILE_METERS + 1e-6;
}

/** Raised kerbs on the unconnected sides: explicit, else wherever there is a footway. */
export function hasKerbs(profile: RoadProfile): boolean {
  return profile.kerbs ?? profile.pieces.some((p) => p.kind === 'sidewalk');
}

/** Whether the surface takes paint: gravel and ballast do not. */
export function isPaved(profile: RoadProfile): boolean {
  return roadClass(profile.class).surface === 'paved';
}

// ---------------------------------------------------------------------------
// Composition: the edits a player makes to a preset, and the profile they
// produce. Edits are absolute for the sides they name and `null` where the
// preset is left as it is, so "no edits" composes back to the preset exactly.
// ---------------------------------------------------------------------------

export type SideChoice = 'none' | 'left' | 'right' | 'both';

/** What sits down the middle of a two-way road, between the directions. */
export type MiddleChoice = 'none' | 'median' | 'turn';

export interface ProfileEdits {
  /** Which kerbs get a parking lane. null = as the preset has. */
  parking: SideChoice | null;
  /** Which kerbs get a painted bike lane. null = as the preset has. */
  bike: SideChoice | null;
  /** Footways on both sides, or none. null = as the preset has. */
  footways: boolean | null;
  /**
   * Travel lanes running forward — on a one-way road, the lanes it has at all.
   * null = as the preset has.
   */
  lanes: number | null;
  /**
   * Travel lanes running back, when the road is not the same both ways: a
   * three-lane road is two one way and one the other, which is only sayable
   * now the tile knows which way is which. null = the same as forward.
   */
  lanesBack: number | null;
  /** What separates the directions. null = as the preset has. */
  middle: MiddleChoice | null;
  /** Posted speed in km/h, clamped to the class range. null = as the preset has. */
  postedKmh: number | null;
}

export const NO_EDITS: ProfileEdits = {
  parking: null,
  bike: null,
  footways: null,
  lanes: null,
  lanesBack: null,
  middle: null,
  postedKmh: null,
};

/** Real-world default widths, metres, for a piece a player adds. */
export const DEFAULT_PIECE_WIDTHS: Readonly<Record<LanePieceKind, number>> = {
  travel: 3.5,
  centreTurn: 3.5,
  parking: 2.25,
  bike: 1.6,
  bus: 3.5,
  tram: 3.5,
  rail: 5.6,
  median: 1.8,
  barrier: 0.6,
  shoulder: 1.5,
  sidewalk: 1.9,
  verge: 0,
};

/** Pieces that make up the road proper; everything outside them is an edge. */
const CORE_KINDS: ReadonlySet<LanePieceKind> = new Set([
  'travel',
  'centreTurn',
  'median',
  'barrier',
  'shoulder',
  'bus',
  'tram',
  'rail',
]);

function hasSide(choice: SideChoice, side: 'left' | 'right'): boolean {
  return choice === 'both' || choice === side;
}

/** Edits with every field decided — what a profile actually holds. */
export interface ResolvedEdits {
  parking: SideChoice;
  bike: SideChoice;
  footways: boolean;
  lanes: number;
  lanesBack: number;
  middle: MiddleChoice;
  postedKmh: number;
}

/** The travel lanes a profile carries forward; on a one-way road, all of them. */
function lanesEachWay(profile: RoadProfile): number {
  const travel = profile.pieces.filter((p) => p.kind === 'travel');
  const forward = travel.filter((p) => p.flow === 'fwd').length;
  return forward > 0 ? forward : travel.length;
}

/** The travel lanes a profile carries back; the same as forward where it says nothing else. */
function lanesBackOf(profile: RoadProfile): number {
  const travel = profile.pieces.filter((p) => p.kind === 'travel');
  const back = travel.filter((p) => p.flow === 'back').length;
  return back > 0 ? back : lanesEachWay(profile);
}

/** Whether every travel lane runs the same way, so the road has no two sides to separate. */
function isOneWayProfile(profile: RoadProfile): boolean {
  const travel = profile.pieces.filter((p) => p.kind === 'travel');
  return travel.length > 0 && travel.every((p) => p.flow === 'fwd');
}

/** What a profile already holds, read the way the edits are written. */
export function editsOf(profile: RoadProfile): ResolvedEdits {
  const first = profile.pieces.findIndex((p) => CORE_KINDS.has(p.kind));
  const last =
    profile.pieces.length -
    1 -
    [...profile.pieces].reverse().findIndex((p) => CORE_KINDS.has(p.kind));
  const left = first > 0 ? profile.pieces.slice(0, first) : [];
  const right = first >= 0 ? profile.pieces.slice(last + 1) : [];
  const choice = (kind: LanePieceKind): SideChoice => {
    const l = left.some((p) => p.kind === kind);
    const r = right.some((p) => p.kind === kind);
    return l && r ? 'both' : l ? 'left' : r ? 'right' : 'none';
  };
  return {
    parking: choice('parking'),
    bike: choice('bike'),
    footways: profile.pieces.some((p) => p.kind === 'sidewalk'),
    lanes: lanesEachWay(profile),
    lanesBack: lanesBackOf(profile),
    middle: profile.pieces.some((p) => p.kind === 'median')
      ? 'median'
      : profile.pieces.some((p) => p.kind === 'centreTurn')
        ? 'turn'
        : 'none',
    postedKmh: profile.postedKmh ?? roadClass(profile.class).postedKmh.default,
  };
}

/** The lane counts each way a class allows, given that its range counts both ways. */
export function lanesEachWayRange(
  classId: RoadClassId,
  oneWay: boolean,
): {
  min: number;
  max: number;
} {
  const { min, max } = roadClass(classId).lanes;
  if (oneWay) return { min: Math.max(1, min), max };
  return { min: Math.max(1, Math.ceil(min / 2)), max: Math.max(1, Math.floor(max / 2)) };
}

/**
 * Rebuilds a core's travel lanes and what sits between them, keeping whatever
 * else the core holds — a reserved bus lane, a shoulder, a barrier — in place
 * outside the lanes. New lanes are the class-default width rather than the
 * preset's, since a preset's widths are chosen for its own lane count.
 */
function rebuildCore(
  core: readonly LanePiece[],
  lanes: number,
  lanesBack: number,
  middle: MiddleChoice,
  oneWay: boolean,
  widthOf: (kind: LanePieceKind) => number,
): LanePiece[] {
  const first = core.findIndex((p) => p.kind === 'travel');
  const last = core.length - 1 - [...core].reverse().findIndex((p) => p.kind === 'travel');
  const before = first < 0 ? [] : core.slice(0, first);
  const after = first < 0 ? [] : core.slice(last + 1);
  const tram = core.some((p) => p.kind === 'travel' && p.tram === true);
  const lane = (flow: LaneFlow): LanePiece => ({
    kind: 'travel',
    width: DEFAULT_PIECE_WIDTHS.travel,
    flow,
    ...(tram ? { tram: true } : {}),
  });
  const run = (flow: LaneFlow, count: number): LanePiece[] =>
    Array.from({ length: count }, () => lane(flow));
  if (oneWay) return [...before, ...run('fwd', lanes), ...after].map((p) => ({ ...p }));
  const separator: LanePiece[] =
    middle === 'median'
      ? [{ kind: 'median', width: widthOf('median') }]
      : middle === 'turn'
        ? [{ kind: 'centreTurn', width: widthOf('centreTurn') }]
        : [];
  return [...before, ...run('back', lanesBack), ...separator, ...run('fwd', lanes), ...after].map(
    (p) => ({ ...p }),
  );
}

/**
 * Applies edits to a base profile. The edges are rebuilt from the kerb inward
 * as footway, bike lane, parking lane, in the order a parking-protected bike
 * lane puts them; left is the `back` side and right the `fwd` side, the way
 * every preset lays its pieces. The core keeps the preset's own lanes until
 * the player changes their number or what separates them, at which point it is
 * rebuilt around them. Widths come from the base where it has the piece and
 * from the real-world defaults where it does not.
 */
export function composeProfile(base: RoadProfile, edits: ProfileEdits): RoadProfile {
  const current = editsOf(base);
  const parking = edits.parking ?? current.parking;
  const bike = edits.bike ?? current.bike;
  const footways = edits.footways ?? current.footways;
  const lanes = edits.lanes ?? current.lanes;
  const lanesBack = edits.lanesBack ?? edits.lanes ?? current.lanesBack;
  const middle = edits.middle ?? current.middle;

  const first = base.pieces.findIndex((p) => CORE_KINDS.has(p.kind));
  const lastFromEnd = [...base.pieces].reverse().findIndex((p) => CORE_KINDS.has(p.kind));
  const baseCore =
    first < 0 ? [...base.pieces] : base.pieces.slice(first, base.pieces.length - lastFromEnd);
  // A piece the base already has keeps its width, so recomposing a preset with
  // no changes gives the preset back; a piece the player adds gets the default.
  const widthOf = (kind: LanePieceKind): number =>
    base.pieces.find((p) => p.kind === kind)?.width ?? DEFAULT_PIECE_WIDTHS[kind];

  const core =
    lanes === current.lanes && lanesBack === current.lanesBack && middle === current.middle
      ? baseCore
      : rebuildCore(baseCore, lanes, lanesBack, middle, isOneWayProfile(base), widthOf);

  const edge = (side: 'left' | 'right'): LanePiece[] => {
    const flow = side === 'left' ? 'back' : 'fwd';
    const out: LanePiece[] = [];
    if (footways) out.push({ kind: 'sidewalk', width: widthOf('sidewalk') });
    if (hasSide(bike, side)) out.push({ kind: 'bike', width: widthOf('bike'), flow });
    if (hasSide(parking, side)) out.push({ kind: 'parking', width: widthOf('parking') });
    return out;
  };

  const pieces = [...edge('left'), ...core.map((p) => ({ ...p })), ...edge('right').reverse()];
  const composed: RoadProfile = { class: base.class, pieces };
  // A posted speed is carried only when it says something the class default
  // does not, so setting a preset's speed back to the default gives the preset
  // itself back rather than a custom profile that behaves identically.
  const cls = roadClass(base.class);
  const posted = edits.postedKmh ?? base.postedKmh ?? null;
  if (posted !== null) {
    const clamped = Math.min(cls.postedKmh.max, Math.max(cls.postedKmh.min, posted));
    if (base.postedKmh !== undefined || clamped !== cls.postedKmh.default) {
      composed.postedKmh = clamped;
    }
  }
  // A kerb the preset declared explicitly stays explicit; a preset that relied
  // on its footways for kerbs keeps kerbs only while it keeps footways.
  if (base.kerbs !== undefined) composed.kerbs = base.kerbs;
  return composed;
}

/** Structural equality, ignoring piece object identity. */
export function profilesEqual(a: RoadProfile, b: RoadProfile): boolean {
  if (a.class !== b.class) return false;
  if ((a.postedKmh ?? null) !== (b.postedKmh ?? null)) return false;
  if ((a.kerbs ?? null) !== (b.kerbs ?? null)) return false;
  if (a.pieces.length !== b.pieces.length) return false;
  return a.pieces.every((p, i) => {
    const q = b.pieces[i]!;
    return (
      p.kind === q.kind &&
      Math.abs(p.width - q.width) < 1e-9 &&
      (p.flow ?? null) === (q.flow ?? null) &&
      (p.tram ?? false) === (q.tram ?? false)
    );
  });
}

/** Whether a composed profile may be laid: it fits the tile and keeps its class's rules. */
export function isLayable(profile: RoadProfile): boolean {
  return fitsTile(profile) && admitsAllPieces(profile) && withinLaneRange(profile);
}

/** Every piece the profile holds is one its class admits. */
export function admitsAllPieces(profile: RoadProfile): boolean {
  const admits = new Set(roadClass(profile.class).admits);
  return profile.pieces.every((p) => admits.has(p.kind));
}

/** Lane count within the class's range. */
export function withinLaneRange(profile: RoadProfile): boolean {
  const { min, max } = roadClass(profile.class).lanes;
  const n = laneCount(profile);
  return n >= min && n <= max;
}

/**
 * Which classes a class refuses to touch. Every pair not listed here joins,
 * because a city is built out of roads meeting other roads and a step in
 * width is a transition, not an error. The refusals are the joins that would
 * be absurd on the ground: a motorway or a slip road running straight onto a
 * farm track or a service alley, which could carry neither its speed nor its
 * volume. Rail is a separate network that crosses a street at grade without
 * joining it, so it refuses nothing.
 *
 * The full motorway rule — that a motorway meets the surface network only
 * through a ramp — waits for ramps to exist as something the player can draw.
 * Enforcing it before then would leave a motorway with no way into the city.
 */
const NEVER_MEETS: Partial<Record<RoadClassId, readonly RoadClassId[]>> = {
  highway: ['dirt', 'alley'],
  ramp: ['dirt', 'alley'],
};

function refuses(a: RoadClassId, b: RoadClassId): boolean {
  if (a === 'rail' || b === 'rail') return false;
  return (NEVER_MEETS[a] ?? []).includes(b);
}

/**
 * Where each class sits in the road hierarchy. A road only ever replaces one
 * BELOW it, so a farm track never cuts a motorway and a bike lane never wipes
 * an arterial. The order is the real one — surface first, then how much
 * traffic the road is built to carry — and it is deliberately not the order
 * the tier numbers happen to be in, which is the order they were added in.
 */
const CLASS_RANK: Readonly<Record<RoadClassId, number>> = {
  dirt: 0,
  alley: 1,
  rural: 2,
  local: 3,
  oneWay: 4,
  urban: 5,
  collector: 6,
  arterial: 7,
  divided: 8,
  ramp: 9,
  highway: 10,
  rail: 11,
};

/**
 * A profile's place in the hierarchy. A road carrying a reserved bus or tram
 * lane outranks the same road without one, so a stray drag cannot quietly wipe
 * a transit line it crosses.
 */
export function roadRank(profile: RoadProfile): number {
  const transit = profile.pieces.some(
    (p) => p.kind === 'bus' || p.kind === 'tram' || p.tram === true,
  );
  return CLASS_RANK[profile.class] * 2 + (transit ? 1 : 0);
}

/** The hierarchy rank of a tier, which is the rank of the preset it names. */
export function rankForTier(tier: RoadTier): number {
  return roadRank(presetProfileForTier(tier));
}

/** Whether a road of class `a` may touch a road of class `b`, in either order. */
export function canJoin(a: RoadClassId, b: RoadClassId): boolean {
  return !refuses(a, b) && !refuses(b, a);
}

/** "a dirt road", "an alley" — the article a class name takes when it is read out. */
export function withArticle(name: string): string {
  const lower = name.toLowerCase();
  return `${'aeiou'.includes(lower[0] ?? '') ? 'an' : 'a'} ${lower}`;
}

/**
 * Why a road of class `a` may not touch one of class `b`, phrased for the
 * cursor chip from the side that carries the rule, or null when they may.
 */
export function joinRefusal(a: RoadClassId, b: RoadClassId): string | null {
  if (canJoin(a, b)) return null;
  const [ruled, other] = refuses(a, b) ? [a, b] : [b, a];
  return `A ${roadClass(ruled).name.toLowerCase()} can't meet ${withArticle(roadClass(other).name)}`;
}
