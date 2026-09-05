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
import type { LanePiece, RoadClassId, RoadClassSpec, RoadProfile, RoadSpec } from './types';
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
  return Math.round((vehPerHour * CAPACITY_PER_VEH_PER_HOUR) / LANE_CAPACITY_STEP) * LANE_CAPACITY_STEP;
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
 * Traffic lanes in the profile, both directions summed: travel lanes plus the
 * reserved bus and tram lanes, which are lanes with a different occupant. A
 * shared two-way lane counts for both directions.
 */
export function laneCount(profile: RoadProfile): number {
  return profile.pieces.reduce((n, p) => {
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
