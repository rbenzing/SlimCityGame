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
  CorridorHalf,
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
 * Profile ids: 0 is no road, 1..12 are the presets and equal their tier, and
 * player-composed profiles start here, in the save's own table.
 *
 * The boundary MOVES UP each time the catalogue gains a tier, which is why
 * `adoptCustomProfiles` exists: a save written before the tier existed may
 * already have given the id to a profile the player composed.
 */
export const FIRST_CUSTOM_PROFILE_ID = 13;

export function isPresetProfileId(id: number): boolean {
  return id >= 1 && id < FIRST_CUSTOM_PROFILE_ID;
}

/**
 * A save's custom-profile table, with any id a preset has since claimed moved
 * out of the way, and the tiles referring to it moved with it.
 *
 * A preset's id is its tier number, so every new road tier takes the next id
 * off the top of the range — an id an older save may already have handed to a
 * player-composed profile. Left alone, that profile would be read as the new
 * preset and every road drawn with it would silently change shape. Moving it
 * costs a load-time pass over the tiles and keeps the map the player drew.
 *
 * `tiles` is rewritten in place. Idempotent: a table already clear of preset
 * ids is returned unchanged and the tiles are not touched.
 */
export function adoptCustomProfiles(
  table: readonly { id: number; profile: RoadProfile }[],
  tiles: Uint16Array,
): Map<number, RoadProfile> {
  const taken = new Set(table.map((e) => e.id));
  let next = FIRST_CUSTOM_PROFILE_ID;
  const moved = new Map<number, number>();
  for (const entry of table) {
    if (entry.id >= FIRST_CUSTOM_PROFILE_ID) continue;
    while (taken.has(next)) next += 1;
    taken.add(next);
    moved.set(entry.id, next);
  }
  if (moved.size > 0) {
    for (let i = 0; i < tiles.length; i++) {
      const to = moved.get(tiles[i]!);
      if (to !== undefined) tiles[i] = to;
    }
  }
  return new Map(table.map((e) => [moved.get(e.id) ?? e.id, e.profile]));
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
    ramp: 12,
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
/**
 * The share of a signal cycle a lane of this class actually moves for — what
 * separates a signalised arterial from a free-flowing motorway, and the g/C
 * that a signal's delay is worked out on. A class quoted as free flow never
 * meets a signal; it reads as half the cycle so the formula stays defined.
 */
export function greenShareFor(classId: RoadClassId): number {
  const flow = roadClass(classId).laneFlow;
  return 'greenRatio' in flow ? flow.greenRatio : 0.5;
}

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

/**
 * The strip a kerbed road keeps outside its carriageway however it spends the
 * rest of the tile: somewhere for the kerb itself, and for the lamp column and
 * the signal mast that stand behind it. It is the motorway's own half a metre,
 * which is the narrowest kerb the game draws.
 *
 * A carriageway laid edge to edge across the tile has nowhere to put any of
 * them — the paving beside it flares out into the verge looking for room, and
 * the furniture stands in the road.
 */
export const KERB_RESERVE_M = 0.5;

/** Kerb to kerb including footways, metres — what the tile has to hold. */
export function profileWidth(profile: RoadProfile): number {
  return profile.pieces.reduce((w, p) => w + p.width, 0);
}

/** Whether the profile fits one tile. What is left over is verge. */
export function fitsTile(profile: RoadProfile): boolean {
  return profileWidth(profile) <= TILE_METERS + 1e-6;
}

/**
 * How wide a road may be at all: two tiles. Six lanes are 20.1 m and eight
 * are 26.8 m, so neither is a road a 16 m tile can hold — they are CORRIDORS,
 * laid as two parallel runs whose tiles each draw their own half of one
 * cross-section. Two tiles is as wide as this design goes; the road stays on
 * the grid, which is the decision that keeps everything else tractable.
 */
export const CORRIDOR_METERS = 2 * TILE_METERS;

/** Whether the profile fits a two-tile corridor, which is the widest road there is. */
export function fitsCorridor(profile: RoadProfile): boolean {
  return profileWidth(profile) <= CORRIDOR_METERS + 1e-6;
}

/**
 * Whether a class's roads may span two tiles at all. A class earns a corridor
 * by NEEDING one: if its own largest road does not fit a tile, the corridor is
 * the only way to build what the class has always claimed to run. Every other
 * class stays on one tile, so a local street with parking down both kerbs is
 * still too wide rather than quietly becoming a 32 m corridor with 20 m of
 * verge either side.
 */
export function classAdmitsCorridor(classId: RoadClassId): boolean {
  const { max } = roadClass(classId).lanes;
  return max * laneWidthFor(classId) > TILE_METERS + 1e-6;
}

/**
 * How many tiles ACROSS the road a profile needs: one for an ordinary street,
 * two for a corridor, and zero for a cross-section that cannot be laid — too
 * wide for two tiles, or too wide for one on a class that gets no second.
 */
export function tilesAcross(profile: RoadProfile): 0 | 1 | 2 {
  if (fitsTile(profile)) return 1;
  if (!classAdmitsCorridor(profile.class)) return 0;
  return fitsCorridor(profile) ? 2 : 0;
}

/** Whether the profile is wide enough to need two tiles. */
export function isCorridor(profile: RoadProfile): boolean {
  return tilesAcross(profile) === 2;
}

/**
 * One half of a corridor's cross-section, as a road in its own right.
 *
 * A six- or eight-lane divided road is not one wide carriageway: it is TWO,
 * separated by what runs down the middle. So a corridor is split at its centre
 * and each tile carries its own half, centred on itself — which is both what
 * the real road is and what lets every renderer draw a corridor with the
 * machinery it already has for an ordinary street.
 *
 * The piece straddling the middle — the median, nearly always — is divided
 * between them, so each carriageway is finished on its inner edge by its own
 * share of it rather than one tile carrying the whole median and the other
 * ending in mid-air.
 */
export function corridorHalfProfile(profile: RoadProfile, half: CorridorHalf): RoadProfile {
  if (half === 'none') return profile;
  const middle = profileWidth(profile) / 2;
  const left: LanePiece[] = [];
  const right: LanePiece[] = [];
  let at = 0;
  for (const piece of profile.pieces) {
    const end = at + piece.width;
    if (end <= middle + 1e-9) left.push({ ...piece });
    else if (at >= middle - 1e-9) right.push({ ...piece });
    else {
      left.push({ ...piece, width: middle - at });
      right.push({ ...piece, width: end - middle });
    }
    at = end;
  }
  return { ...profile, pieces: half === 'left' ? left : right };
}

/** Raised kerbs on the unconnected sides: explicit, else wherever there is a footway. */
export function hasKerbs(profile: RoadProfile): boolean {
  return profile.kerbs ?? profile.pieces.some((p) => p.kind === 'sidewalk');
}

/**
 * Somewhere to WALK beside the road — a footway, not merely the raised kerb a
 * motorway has. It is the difference between a road a pedestrian may use and
 * one they may not, which is what decides where a crossing belongs.
 */
export function hasFootway(profile: RoadProfile): boolean {
  return profile.pieces.some((p) => p.kind === 'sidewalk');
}

/** Whether the surface takes paint: gravel and ballast do not. */
export function isPaved(profile: RoadProfile): boolean {
  return roadClass(profile.class).surface === 'paved';
}

// ---------------------------------------------------------------------------
// Turn pockets: the lane an approach gains for the last few tiles before a
// junction, so the drivers waiting to turn are not the drivers going straight.
// ---------------------------------------------------------------------------

/**
 * The narrowest a turn pocket is worth building, and the narrowest a through
 * lane may be squeezed to make room for one: 10 ft, which every US standard
 * allows a lane in a constrained setting. A class whose running lanes are
 * already narrower than that builds its pocket at its own lane width instead.
 */
export const TURN_POCKET_MIN_WIDTH_M = 3.05;

/**
 * Pieces a turn pocket may be carved out of: the kerbside parking or shoulder
 * on its own half, and the median, which belongs to both halves and is where a
 * divided road's turn bay has always been cut. A reserved lane — bus, tram,
 * bike — is somebody else's road and is never taken.
 */
const POCKET_SOURCE_KINDS: ReadonlySet<LanePieceKind> = new Set(['parking', 'shoulder', 'median']);

/**
 * Where each carriageway piece sits across the tile, measured from the
 * centreline, or null for a piece outside the kerbs. Sidewalks and verges only
 * ever sit at the ends, so skipping them leaves the running offset intact.
 */
function pieceCentres(profile: RoadProfile): (number | null)[] {
  let offset = -carriagewayHalfWidthOf(profile);
  return profile.pieces.map((piece) => {
    if (!CARRIAGEWAY_KINDS.has(piece.kind)) return null;
    const centre = offset + piece.width / 2;
    offset += piece.width;
    return centre;
  });
}

/**
 * The same cross-section with a turn pocket added on the half that approaches
 * a junction — `approachSide` being the sign of that half's offsets, so +1 is
 * the half laid after the centreline and -1 the half before it. On a one-way
 * every lane approaches and the pocket goes against the left kerb, which is
 * the lane a left turn is made from.
 *
 * The width comes, in this order, from the verge the tile has not spent, from
 * the kerbside parking or shoulder on that half, and last from the through
 * lanes themselves, which a constrained retrofit narrows rather than widening
 * the road. Null when none of that is enough: a pocket narrower than
 * `TURN_POCKET_MIN_WIDTH_M` is not a lane, and a road with no travel lane on
 * the approaching half has nothing to add one beside.
 *
 * `openness` is how far open the bay is on this tile, 0 to 1. A turn bay does
 * not appear at full width out of nothing — it opens over a taper. What the
 * road gives up for it does not taper with it: the parking stops before the
 * taper starts and the through lanes shift over along the whole bay, so only
 * the bay's own width grows. The full bay decides whether the road can have
 * one at all, and a partly open tile is never the one that refuses.
 */
export function withTurnPocket(
  profile: RoadProfile,
  approachSide: -1 | 1,
  openness = 1,
): RoadProfile | null {
  // A road with a two-way left-turn lane down the middle already turns from a
  // lane of its own, everywhere, so it has nothing to gain here.
  if (profile.pieces.some((p) => p.kind === 'centreTurn')) return null;
  const open = Math.min(1, Math.max(0, openness));
  if (open <= 0) return profile;
  const target = laneWidthFor(profile.class);
  const minimum = Math.min(target, TURN_POCKET_MIN_WIDTH_M);
  const oneWay = isOneWayProfile(profile);
  const side = oneWay ? -1 : approachSide;
  const centres = pieceCentres(profile);

  const approaching = profile.pieces
    .map((piece, index) => ({ piece, index, centre: centres[index] ?? 0 }))
    .filter((e) => e.piece.kind === 'travel' && (oneWay || e.centre * side > 0));
  if (approaching.length === 0) return null;

  // A one-way's pocket sits outside its leftmost lane; a two-way's sits beside
  // the centreline, which is the innermost lane of the approaching half.
  const beside = oneWay
    ? approaching.reduce((a, b) => (b.centre < a.centre ? b : a))
    : approaching.reduce((a, b) => (Math.abs(b.centre) < Math.abs(a.centre) ? b : a));
  const insertBefore = oneWay || side === 1 ? beside.index : beside.index + 1;

  // What the pocket may be carved out of: the outermost parking bay or
  // shoulder on its own side of the road.
  const sources = profile.pieces
    .map((piece, index) => ({ piece, index, centre: centres[index] ?? 0 }))
    .filter(
      (e) =>
        POCKET_SOURCE_KINDS.has(e.piece.kind) && (e.piece.kind === 'median' || e.centre * side > 0),
    );
  const source =
    sources.length === 0
      ? null
      : sources.reduce((a, b) => (Math.abs(b.centre) > Math.abs(a.centre) ? b : a));

  // A road whose footways are pieces of its own has already paid for its kerbs;
  // one that draws them out of the leftover has not, and the bay may not spend
  // the last of it. A carriageway filling the tile has nowhere to stand a
  // signal, which is the one thing the bay is there for.
  const reserve = hasKerbs(profile) && !hasFootway(profile) ? 2 * KERB_RESERVE_M : 0;
  const slack = Math.max(0, TILE_METERS - profileWidth(profile) - reserve);
  let width = Math.min(target, slack);
  let takeSource = false;
  if (width < minimum && source) {
    takeSource = true;
    width = Math.min(target, slack + source.piece.width);
  }

  // Last resort: the lanes beside the pocket give up what is left of it.
  const narrowed = new Map<number, number>();
  if (width < minimum) {
    const shortfall = minimum - width;
    const headroom = approaching.map((e) => ({ index: e.index, room: e.piece.width - minimum }));
    const available = headroom.reduce((sum, h) => sum + Math.max(0, h.room), 0);
    if (available + 1e-9 < shortfall) return null;
    for (const h of headroom) {
      if (h.room <= 0) continue;
      const piece = profile.pieces[h.index]!;
      narrowed.set(h.index, piece.width - (shortfall * h.room) / available);
    }
    width = minimum;
  }

  // Everything above is settled by the bay at full width — whether the road
  // can have one, what the parking gives up, how far the lanes shift over. All
  // that changes along the opening taper is the bay itself, which grows out of
  // the lane beside it.
  const pocket: LanePiece = { kind: 'travel', width: width * open };
  if (beside.piece.flow) pocket.flow = beside.piece.flow;

  const pieces: LanePiece[] = [];
  profile.pieces.forEach((piece, index) => {
    if (index === insertBefore) pieces.push(pocket);
    if (takeSource && index === source?.index) return;
    const squeezed = narrowed.get(index);
    pieces.push(squeezed === undefined ? { ...piece } : { ...piece, width: squeezed });
  });
  if (insertBefore >= profile.pieces.length) pieces.push(pocket);

  const pocketed: RoadProfile = { ...profile, pieces };
  // The same reserve the width came out of, applied to the answer: taking the
  // bay out of the parking or the lanes must not put the carriageway back
  // against the tile edge either.
  return profileWidth(pocketed) <= TILE_METERS - reserve + 1e-6 ? pocketed : null;
}

/** Whether this cross-section can find the width for a turn pocket on that half. */
export function canGainTurnPocket(profile: RoadProfile, approachSide: -1 | 1): boolean {
  return withTurnPocket(profile, approachSide) !== null;
}

/**
 * The same cross-section with an AUXILIARY LANE added against the kerb on one
 * side — the lane a motorway grows beside a slip road, so that a driver
 * joining has somewhere to get up to speed and one leaving has somewhere to
 * slow down without doing it in the running lane.
 *
 * It goes OUTSIDE everything the road already carries on that side, because
 * that is where the slip road arrives; the width comes from the verge the tile
 * has not spent, and never from the kerb reserve, since the lane still needs a
 * kerb outside it. `openness` is how far open it is, 0 to 1, the same taper a
 * turn bay opens over.
 *
 * Null where the width is not there — which is most motorways in a 16 m tile.
 * Four 12 ft lanes and their kerbs fill it exactly, and an auxiliary lane is
 * another twelve feet: that is a road for two tiles, not one.
 */
export function withAuxiliaryLane(
  profile: RoadProfile,
  side: -1 | 1,
  openness = 1,
): RoadProfile | null {
  const open = Math.min(1, Math.max(0, openness));
  if (open <= 0) return profile;
  const target = laneWidthFor(profile.class);
  const minimum = Math.min(target, TURN_POCKET_MIN_WIDTH_M);
  const reserve = hasFootway(profile) ? 0 : 2 * KERB_RESERVE_M;
  const slack = Math.max(0, TILE_METERS - profileWidth(profile) - reserve);
  if (slack + 1e-9 < minimum) return null;
  const width = Math.min(target, slack);

  const flows = profile.pieces.filter((p) => p.kind === 'travel').map((p) => p.flow);
  const lane: LanePiece = { kind: 'travel', width: width * open };
  // It carries the traffic of the half it is added to, which is the half whose
  // kerb it stands against.
  const beside = side > 0 ? flows[flows.length - 1] : flows[0];
  if (beside) lane.flow = beside;

  // Outside every carriageway piece on that side, but inside the footway, if
  // the road has one — a lane does not go behind the pavement.
  const pieces = [...profile.pieces];
  const at =
    side > 0
      ? lastIndexWhere(pieces, (p) => CARRIAGEWAY_KINDS.has(p.kind)) + 1
      : firstIndexWhere(pieces, (p) => CARRIAGEWAY_KINDS.has(p.kind));
  pieces.splice(Math.max(0, at), 0, lane);
  return { ...profile, pieces };
}

/** Whether this cross-section can find the width for an auxiliary lane. */
export function canGainAuxiliaryLane(profile: RoadProfile, side: -1 | 1): boolean {
  return withAuxiliaryLane(profile, side) !== null;
}

function firstIndexWhere(pieces: readonly LanePiece[], p: (x: LanePiece) => boolean): number {
  const i = pieces.findIndex(p);
  return i < 0 ? 0 : i;
}

function lastIndexWhere(pieces: readonly LanePiece[], p: (x: LanePiece) => boolean): number {
  for (let i = pieces.length - 1; i >= 0; i--) if (p(pieces[i]!)) return i;
  return pieces.length - 1;
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

/**
 * Travel-lane width by class, metres, from the US standards a road of that
 * kind is built to: 12 ft on an arterial, a divided road, a motorway and its
 * ramps; 11 ft on an urban street, a collector and a rural road; 10 ft on a
 * local street, a one-way and an alley; 9 ft on a farm track. A turn lane is
 * the class's own lane width, since it is a lane.
 */
const LANE_WIDTH_BY_CLASS: Readonly<Record<RoadClassId, number>> = {
  dirt: 2.75,
  alley: 3.05,
  rural: 3.35,
  local: 3.05,
  urban: 3.35,
  collector: 3.35,
  arterial: 3.6,
  divided: 3.6,
  oneWay: 3.05,
  highway: 3.6,
  ramp: 3.6,
  rail: 5.6,
};

/** The width a travel lane of this class is built to, in metres. */
export function laneWidthFor(classId: RoadClassId): number {
  return LANE_WIDTH_BY_CLASS[classId];
}

/**
 * The lane counts a road of each class is BUILT IN, total across both
 * directions. A road is picked from this list rather than dialled a lane at a
 * time: a four-lane arterial is a kind of road, not a three-lane with one
 * added. The counts are the steps; how far they may go is the class's own
 * lane range in the catalogue, which `laneOptionsFor` holds them inside — a
 * count the class does not allow is a count the tool must never offer, since
 * offering one and then refusing it is how a player is told the tile is too
 * narrow for a road that fits it perfectly well.
 */
const LANE_OPTIONS_BY_CLASS: Readonly<Record<RoadClassId, readonly number[]>> = {
  dirt: [2],
  alley: [2],
  rural: [2, 4],
  local: [2, 4],
  oneWay: [1, 2, 3],
  urban: [2, 4, 6],
  collector: [2, 4, 6],
  arterial: [2, 4, 6],
  divided: [4, 6, 8],
  highway: [2, 4, 6, 8],
  ramp: [1, 2],
  rail: [],
};

/**
 * The lane counts this class offers, total across both directions: the ones
 * its own catalogue range allows AND the ones a tile can hold. Six lanes of an
 * arterial is a real road, but at 3.6 m a lane it is 21.6 m of carriageway on
 * a 16 m tile — a road that needs two of them, which is a corridor and not
 * this. Offering a count that can never be laid, then refusing it for width,
 * is the tool telling the player off for taking what it held out.
 *
 * The travel lanes alone decide it. What a player adds on top — parking, a
 * bike lane, a footway — can still overrun the tile, and being told so is
 * fair: that is a choice, and it can be taken back.
 */
export function laneOptionsFor(classId: RoadClassId): readonly number[] {
  const { min, max } = roadClass(classId).lanes;
  const lane = laneWidthFor(classId);
  const inRange = LANE_OPTIONS_BY_CLASS[classId].filter((n) => n >= min && n <= max);
  // A class that gets a corridor is offered every count that fits two tiles —
  // six and eight lanes are real offers now, not counts held out and then
  // refused. A class that gets none is still held to its own tile.
  const budget = classAdmitsCorridor(classId) ? CORRIDOR_METERS : TILE_METERS;
  const fits = inRange.filter((n) => n * lane <= budget + 1e-6);
  // A class whose very smallest road overruns the tile still offers it, so the
  // drawer is never empty and the width chip explains itself.
  return fits.length > 0 ? fits : inRange.slice(0, 1);
}

/** Real-world default widths, metres, for a piece a player adds. */
export const DEFAULT_PIECE_WIDTHS: Readonly<Record<LanePieceKind, number>> = {
  travel: 3.5,
  centreTurn: 3.6,
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
export function isOneWayProfile(profile: RoadProfile): boolean {
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
  laneWidth: number,
): LanePiece[] {
  const first = core.findIndex((p) => p.kind === 'travel');
  const last = core.length - 1 - [...core].reverse().findIndex((p) => p.kind === 'travel');
  const before = first < 0 ? [] : core.slice(0, first);
  const after = first < 0 ? [] : core.slice(last + 1);
  const tram = core.some((p) => p.kind === 'travel' && p.tram === true);
  const lane = (flow: LaneFlow): LanePiece => ({
    kind: 'travel',
    width: laneWidth,
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
      : rebuildCore(
          baseCore,
          lanes,
          lanesBack,
          middle,
          isOneWayProfile(base),
          widthOf,
          laneWidthFor(base.class),
        );

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
  return layRefusal(profile) === null;
}

/**
 * Why a composed profile may not be laid, said the way the tool says it, or
 * null when it may. The reasons are different things and read as different
 * things: a road can be too wide for the tile, or perfectly narrow and still
 * not the kind of road its class is.
 */
export function layRefusal(profile: RoadProfile): string | null {
  // A big road wider than a tile is a corridor, laid across two of them. A
  // road whose class gets no corridor is still simply too wide for its tile,
  // and a corridor-class road wider than two tiles is too wide for anything.
  if (tilesAcross(profile) === 0) {
    return classAdmitsCorridor(profile.class) ? 'Too wide for a corridor' : 'Too wide for the tile';
  }
  const cls = roadClass(profile.class);
  const name = cls.name.toLowerCase();
  if (!admitsAllPieces(profile)) return `A ${name} doesn't carry that`;
  if (!withinLaneRange(profile)) {
    const { min, max } = cls.lanes;
    return min === max ? `A ${name} runs ${min} lanes` : `A ${name} runs ${min} to ${max} lanes`;
  }
  return null;
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
 * A class's place in the hierarchy on its own, without the transit bonus the
 * profile rank adds. This is the FUNCTIONAL CLASSIFICATION a traffic engineer
 * reads when deciding which road at a junction is the minor one.
 */
export function classRank(id: RoadClassId): number {
  return CLASS_RANK[id];
}

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
