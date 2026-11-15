/**
 * Street lamps: deterministic placement every LAMP_SPACING_TILES tiles, alternating
 * sides, purely from tile coordinates (no rng) — a properly modeled
 * CANTILEVER streetlight:
 *   POLE (tapered mast, wider base, curbside) -> ARM (a curved/angled
 *   bracket — a short rising NECK off the pole top, then a longer REACH
 *   arcing back down over the road) -> HOUSING (a tapered box/cowl luminaire
 *   hanging from the arm end, over the road, pointing down) -> LENS (a warm
 *   sphere seated in the cowl mouth — the actual light source) -> POOL (a soft
 *   disc of light lying on the pavement below it).
 * There is no beam volume: housing and lens ramp their emissive well past the
 * bloom luminance threshold so the post pass smears them into a halo, and the
 * pool lights the road itself — bloom can only bleed around bright pixels, so
 * a halo at head height cannot brighten pavement that has none of its own.
 * All three fade on the lamp's own clock schedule (lampGlowFactor), not the
 * shared dusk ramp.
 * Every part (pole/arm/housing) is one merged, instanced geometry — one draw
 * call per part regardless of lamp count — and each casts a shadow (the sun
 * shadow map + `renderer.shadowMap.enabled` are already wired in scene.ts;
 * this file only needs `castShadow = true` on its own meshes).
 * Cheap instanced geometry, not per-pixel lighting.
 */
import * as THREE from 'three';
import { RoadFlow, RoadTier } from '../shared/types';
import { RING_OUTER_RADIUS_M, ringCentre, type RoundaboutBlock } from '../shared/roundabout';
import {
  LAMP_SPACING_TILES,
  LAMP_SPACING_WIDE_TILES,
  TILE_METERS,
  tileToWorld,
} from '../shared/constants';
import { ROAD_Y_OFFSET } from './roadsmesh';
import {
  carriagewayHalfWidthOf,
  carriagewayShiftOf,
  carriagewayWidth,
  centralReserveOffsetOf,
  FOOTWAY_WIDTH_M,
  hasKerbs,
  postedKmhOf,
  presetProfileForTier,
} from '../shared/roadprofile';
import type { RoadProfile, TilePoint } from '../shared/types';
import { MIN_INSTANCE_CAPACITY, setInstanceCount } from './groundquad';
import {
  buildTileSet,
  flankShift,
  hasCrossingRoad,
  lateralAxis,
  POLE_BEHIND_KERB_M,
  tileKey,
  type FurnitureRoadTile,
  type TramPoleStand,
} from './roadfurniture';
import { BUS_STOP_PAD } from './busstops';
import { firstFreeAlong, keepClearOf, Standing, type Spot } from './roadsidespace';

/** Pole heights by the street's width: 20, 30 and 40 ft. */
export const LAMP_HEIGHTS_M = [6.1, 9.1, 12.2] as const;
/** A carriageway under this is lit by the lowest pole. */
const MID_STREET_FROM_M = 9;
/** A carriageway up to this alternates its lamps; a wider one stands them in pairs. */
export const NARROW_STREET_UP_TO_M = 15;

/** Clear zone beside a road with no kerb, to a posted speed of 65 km/h, then beyond it. */
export const CLEAR_ZONE_SLOW_M = 3.0;
export const CLEAR_ZONE_FAST_M = 4.6;
export const CLEAR_ZONE_SLOW_UP_TO_KMH = 65;

/** How far from a crosswalk a lamp stands. */
export const CROSSWALK_CLEARANCE_M = 3;
/** The boarding area's length along the kerb. */
const BOARDING_ALONG_M = 1.52;
/** Half the stretch of a tile's kerb a bus stop keeps clear: its pad and its boarding area. */
export const STOP_CLEAR_HALF_M = BUS_STOP_PAD.along / 2 + BOARDING_ALONG_M / 2;
/** A lamp slides along its tile's strip, to the nearest free place, no further from the tile's middle than keeps it clear of a crosswalk in the next tile. */
const SLIDE_LIMIT_M = TILE_METERS / 2 - CROSSWALK_CLEARANCE_M;

/** The reference pole, and the height the arm, housing and lens are modelled for. */
const POLE_HEIGHT = LAMP_HEIGHTS_M[0];
const POLE_RADIUS_TOP = 0.12;
const POLE_RADIUS_BOTTOM = 0.16;
const POLE_RADIAL_SEGMENTS = 8;
// Charcoal-grey painted metal. The old near-black (0x2a2e33) sat below the
// Lambert shading range in daylight, so a slim pole read as a flat black wire
// against grass/sky rather than a modeled post; a mid charcoal takes visible
// sun shading (lit vs. shaded faces) and still reads as a dark street lamp.
const POLE_COLOR = 0x50555d;

/**
 * The cantilever arm reaches from the pole top TOWARD the road centerline
 * (direction = opposite the pole's lateral-offset sign), so the housing (and
 * the pool it casts) land over the outer LANE of the road. It is modelled for
 * the lowest pole and grows with the pole: arm, housing and lens are scaled by
 * `lampScaleOf`, the pole's own height is stretched, so a taller pole's
 * lantern still hangs over its outer lane.
 */
const ARM_LENGTH_METERS = 2.4;
const ARM_THICKNESS = 0.1;
/** Mount height, just below the pole top. */
const ARM_MOUNT_BELOW_TOP_M = 0.05;

/** The size of a pole's arm, housing, lens and pool against the lowest pole's: 1 at 6.1 m, 1.5 at 12.2 m. */
export function lampScaleOf(height: number): number {
  return 0.5 + (0.5 * height) / POLE_HEIGHT;
}

/** How far a pole's arm reaches over the road, metres. */
export function armLengthOf(height: number): number {
  return ARM_LENGTH_METERS * lampScaleOf(height);
}

/**
 * The bracket bends in two straight runs — a cheap, deterministic stand-in
 * for a curved gooseneck: a short NECK that rises off the pole-top mount,
 * then a longer REACH that arcs back down to the housing attach point. Both
 * segments are merged into one static local geometry authored with the
 * mount at local origin, reaching only along local +X — writeLamp supplies
 * the yaw that turns +X to face the road for each (axis, side) combination.
 */
const ARM_NECK_FRACTION = 0.3;
const ARM_NECK_LENGTH = ARM_LENGTH_METERS * ARM_NECK_FRACTION;
const ARM_REACH_LENGTH = ARM_LENGTH_METERS - ARM_NECK_LENGTH;
const ARM_RISE = 0.32; // upward bend of the neck before the reach arcs back down

// How far below the arm mount the housing attach point hangs.
const HOUSING_DROP = 0.22;

const HOUSING_CAP_LENGTH = 0.36; // mounting cap, along the arm direction
const HOUSING_CAP_HEIGHT = 0.12;
const HOUSING_CAP_DEPTH = 0.3;
const HOUSING_COWL_TOP_RADIUS = 0.22; // wide where it meets the mounting cap
const HOUSING_COWL_BOTTOM_RADIUS = 0.06; // tapers down to a point — the cowl points down
const HOUSING_COWL_HEIGHT = 0.26;
const HOUSING_COWL_SEGMENTS = 4; // 4-sided taper reads as a "boxy" cowl, not a smooth cone
const HOUSING_TILT_RAD = THREE.MathUtils.degToRad(18); // angled downward, toward the road
const HOUSING_COLOR = 0xffd9a0;

/**
 * Lens: the bulb itself, a small sphere seated in the cowl mouth. It is
 * deliberately wider than the cowl's bottom radius so it bulges past the rim
 * and stays visible from the game's angled camera — a compact, very bright
 * core is exactly what the bloom pass needs to bleed a believable halo over
 * the road.
 */
const LENS_COLOR = 0xfff1d0; // hotter and whiter than the fixture's warm body
const LENS_UNLIT_COLOR = 0x2b2620; // dark glass by day, so it still takes some sun shading
const LENS_RADIUS = 0.26;
const LENS_WIDTH_SEGMENTS = 8;
const LENS_HEIGHT_SEGMENTS = 6;
/** Distance from the housing attach point down its own (tilted) axis to the lens center. */
const LENS_DROP = HOUSING_CAP_HEIGHT + HOUSING_COWL_HEIGHT;

/**
 * Ground pool: the light the lamp actually throws on the road. Bloom only
 * bleeds around bright pixels, so a halo at head height can never light the
 * pavement however wide its radius — the road needs bright pixels of its own.
 * The pool supplies them, and being the largest bright area on the lamp it is
 * also its widest bloom source. Additive with no depth write, soft-edged by
 * vertex color rather than a texture, and terrain-conforming (every vertex
 * samples the ground) so it lies on a road running across a slope instead of
 * slicing through it.
 *
 * It is an ELLIPSE, not a circle: a real cantilever luminaire aims down the
 * roadway and throws a pool far longer along the road than across it. Stretched
 * that way the pools of successive lamps overlap into a continuously lit
 * corridor, which is what a lit street looks like — equal-radius circles read
 * as isolated puddles with dark road between them.
 */
const POOL_RADIUS = 4.5;
const POOL_ALONG_SCALE = 4.5; // down the roadway — ~40 m of road per lamp, 60 m apart on alternate kerbs
const POOL_ACROSS_SCALE = 1; // across it — the carriageway plus a little verge
const POOL_SEGMENTS = 24;
const POOL_Y_OFFSET = ROAD_Y_OFFSET + 0.06; // clears the raised road surface
const POOL_MAX_OPACITY = 0.55;
/** Sodium-warm: road light is warmer and deeper than the fixture's own body. */
const POOL_COLOR = 0xffc27a;
/**
 * [radius fraction, brightness] rings from the core outward; the last must end
 * at 0. The curve decays steeply and never plateaus — a broad flat core reads
 * as a painted shape with an edge, while a hot point trailing off over most of
 * the radius reads as light falling on a surface.
 */
const POOL_RINGS: ReadonlyArray<readonly [number, number]> = [
  [0.12, 0.72],
  [0.3, 0.4],
  [0.55, 0.18],
  [0.78, 0.06],
  [1, 0],
];

/**
 * Night emissive strengths. The housing sits in the same range as lit building
 * windows (buildings.ts WINDOW_EMISSIVE_STRENGTH) so the fixture reads as lit;
 * the lens goes far hotter because it is a handful of pixels and needs to clear
 * the bloom threshold by a wide margin to smear into a halo.
 */
const HOUSING_EMISSIVE_STRENGTH = 3.2;
const LENS_EMISSIVE_STRENGTH = 14;

/**
 * Lamp schedule, in clock hours (hour = dayT × 24, matching ui/format.ts's
 * status-strip clock: sunrise 06:00, sunset 18:00). Lamps deliberately do NOT
 * follow nightFactor — that ramp only reaches 0 at noon, which left lamps
 * faintly lit all morning.
 */
const LAMP_ON_START_HOUR = 18; // sunset: lamps begin to come up
const LAMP_ON_FULL_HOUR = 19.5; // fully lit by the time dusk has settled
const LAMP_OFF_START_HOUR = 6; // sunrise: lamps begin to fade
export const LAMP_OFF_HOUR = 7; // dark by one hour past sunrise

/**
 * 0 (off) .. 1 (full) lamp glow for a visual-day fraction in [0,1). Pure: no
 * three.js, no globals. Off through the daylight hours, ramping up from sunset
 * and out over the hour after sunrise.
 */
export function lampGlowFactor(dayT: number): number {
  const hour = ((((dayT % 1) + 1) % 1) * 24) % 24;
  if (hour <= LAMP_OFF_START_HOUR || hour >= LAMP_ON_FULL_HOUR) return 1;
  if (hour < LAMP_OFF_HOUR)
    return 1 - (hour - LAMP_OFF_START_HOUR) / (LAMP_OFF_HOUR - LAMP_OFF_START_HOUR);
  if (hour < LAMP_ON_START_HOUR) return 0;
  return (hour - LAMP_ON_START_HOUR) / (LAMP_ON_FULL_HOUR - LAMP_ON_START_HOUR);
}

export type LampAxis = 'x' | 'z';

/**
 * A road tile a lamp may sit on; `tier` is optional (undefined = eligible), and
 * `profile` is the tile's own cross-section when it carries a composed one —
 * the pole stands at ITS kerb, not the preset's.
 */
export type LampRoadTile = FurnitureRoadTile & {
  /**
   * Whether the tile has electricity. A street with no supply carries no lamp
   * at all — the pole goes up with the cable, not with the tarmac. Left unsaid
   * the tile is treated as supplied, so a caller that knows nothing about the
   * power network gets the lamps it always got.
   */
  powered?: boolean;
};

/**
 * Whether a road tier gets street lamps. Unpaved gravel/dirt roads do not, and
 * neither does a rail line — a track is not a street, and nobody lights one.
 */
export function tierGetsLamp(tier: RoadTier | undefined): boolean {
  return tier !== RoadTier.Gravel && tier !== RoadTier.RailTrack;
}

/** A bus stop as the lamps keep clear of it: its tile and which kerb (0 the low side, 1 the high). */
export interface LampStopSite {
  x: number;
  z: number;
  side: 0 | 1;
}

export interface LampPlacement {
  x: number; // tile x
  z: number; // tile z
  /** World axis the lamp is offset along, away from the road centerline. */
  axis: LampAxis;
  /** Sign of the lateral offset along `axis`. */
  side: 1 | -1;
  /**
   * Meters from the road centerline to the pole's centre: behind the kerb
   * face, or back from the travelled way by the clear zone where there is no
   * kerb. A pole on a central median carries its signed offset from the tile's
   * middle here, with `side` 1.
   */
  lateralOffset: number;
  /** Pole height, metres, by the street's width. */
  height: number;
  /** Metres the lamp stands along its tile's strip from the tile's middle; absent at 0. */
  along?: number;
  /** A pole on a central median, twin-armed: its arms reach both ways. */
  twin?: true;
}

/** How a street is lit: its pole height, and whether lamps stand in pairs rather than alternate. */
export interface LampRule {
  height: number;
  wide: boolean;
  /** Tiles between lamps, or between pairs of them. */
  spacingTiles: number;
}

/**
 * The lighting a cross-section takes by its width: a carriageway up to 15 m
 * alternates its lamps every 3 tiles, a wider one (and every motorway) sets
 * them in facing pairs every 4. Poles stand 6.1 m under a 9 m carriageway,
 * 9.1 m to 15 m and 12.2 m beyond. Half of a two-tile corridor is one side of
 * a road twice its width.
 */
export function lampRuleOf(profile: RoadProfile): LampRule {
  const width = carriagewayWidth(profile) * (profile.seam ? 2 : 1);
  const narrow = width <= NARROW_STREET_UP_TO_M + 1e-6;
  const [low, mid, high] = LAMP_HEIGHTS_M;
  const height = width < MID_STREET_FROM_M ? low : narrow ? mid : high;
  const wide = !narrow || profile.class === 'highway';
  return { height, wide, spacingTiles: wide ? LAMP_SPACING_WIDE_TILES : LAMP_SPACING_TILES };
}

/**
 * How far a pole stands from the road's centre line, metres. Behind a kerb it
 * stands in the furnishing strip, its centre 0.46 m behind the kerb face,
 * which is where the carriageway (parking and bike lanes included) ends. With
 * no kerb it stands back from the travelled way by the clear zone, 3.0 m on a
 * road posted to 65 km/h or less and 4.6 m on a faster one, and a slip road's
 * stands at the tile's edge on the outside. Never beyond the tile's edge.
 * `faceShift` is how far the kerb face has moved off the carriageway's own
 * half-width, for half of a corridor pushed against its seam.
 */
export function lampLateralOffset(
  tier: RoadTier | undefined,
  profile?: RoadProfile,
  faceShift = 0,
): number {
  const section = profile ?? presetProfileForTier(tier ?? RoadTier.TwoLane);
  const edge = TILE_METERS / 2;
  if (section.class === 'ramp') return edge;
  const face = carriagewayHalfWidthOf(section) + faceShift;
  if (hasKerbs(section)) return Math.min(face + POLE_BEHIND_KERB_M, edge);
  const clear =
    postedKmhOf(section) <= CLEAR_ZONE_SLOW_UP_TO_KMH ? CLEAR_ZONE_SLOW_M : CLEAR_ZONE_FAST_M;
  return Math.min(face + clear, edge);
}

/** Where a motorway's central median or barrier stands across it, or null where it has none. */
export function centralLampOffsetOf(profile: RoadProfile): number | null {
  return profile.class === 'highway' ? centralReserveOffsetOf(profile) : null;
}

/**
 * The kerb a lamp stands on in run `group` of its street: they alternate, but
 * a slip road's stand on its outside, the side of its wider shoulder.
 */
export function lampSideOf(profile: RoadProfile, group: number): 1 | -1 {
  if (profile.class === 'ramp') {
    const first = profile.pieces[0]?.width ?? 0;
    const last = profile.pieces[profile.pieces.length - 1]?.width ?? 0;
    return first > last ? -1 : 1;
  }
  return group % 2 === 0 ? 1 : -1;
}

/**
 * Deterministic lamp placement along the road's run. A lamp sits on every
 * tile whose position along the road is a multiple of its street's spacing
 * (see `lampRuleOf`): alternating kerbs on a narrow street, a facing pair on
 * a wide one, a twin on a motorway's median. A lamp whose place is a bus
 * stop's span slides along its tile's strip to the nearest free place, and
 * the tile carries none where there is none. Pure function of the input
 * list: no rng, no dependency on tile ordering.
 */
export function computeLampPlacements(
  roadTiles: readonly LampRoadTile[],
  /**
   * Tiles a lot's driveway crosses, as tileKey values. A lamp here would stand
   * in the mouth of a car park entrance, which is the one piece of kerb that
   * has to stay clear — cars drive over it. Omitted, nothing is blocked.
   */
  drivewayTiles?: ReadonlySet<number>,
  /**
   * The tram contact poles standing along the roads, and `fixed`, the signal
   * masts and stop signs: both stand where they are, and a lamp within
   * OBJECT_GAP_M of one moves along its strip.
   */
  poles: readonly TramPoleStand[] = [],
  /**
   * The bus stops. Nothing stands in a stop's boarding area, the kerb before
   * its pad or its shelter's path, so a lamp there moves along the strip.
   */
  stops: readonly LampStopSite[] = [],
  fixed: readonly Spot[] = [],
): LampPlacement[] {
  const tileSet = buildTileSet(roadTiles);
  const clear = keepClearOf(
    undefined,
    stops,
    STOP_CLEAR_HALF_M,
    (tx, tz) => lateralAxis(tileSet, tx, tz),
    tileKey,
  );
  const taken = new Standing().addAll(poles).addAll(fixed);

  const placements: LampPlacement[] = [];
  for (const tile of roadTiles) {
    // Gravel/dirt tiles carry no lamp but stay in tileSet for neighbor orientation.
    if (!tierGetsLamp(tile.tier)) continue;
    // Nor does a corner of a roundabout, where the pole would stand in the ring.
    if (tile.ring) continue;
    // Nor does a street the grid has not reached. An unsupplied street simply
    // has no lamps, which is how a player reads coverage off the night city
    // and how a brownout announces itself. Same as above: the tile stays in
    // tileSet, so a dark stretch does not change how its lit neighbours face.
    if (tile.powered === false) continue;
    if (drivewayTiles?.has(tileKey(tile.x, tile.z))) continue;

    // Any tile with road running through it on BOTH axes — a turn, a T, a
    // crossroads — has no curb to stand a pole on: the lateral offset that
    // clears one carriageway lands inside the other one. Such tiles carry no
    // lamp, and their straight neighbours light the junction from the approach
    // (a crosswalk lies inside the junction's own tile, a tile's length away).
    // A road lying beside this one without joining it, the other half of a
    // corridor among them, runs no road through the tile.
    if (hasCrossingRoad(tileSet, tile.x, tile.z)) continue;
    // An east-west road gets lamps offset along z, and vice versa. An isolated
    // tile has no run axis at all and falls back to z.
    const axis: LampAxis = lateralAxis(tileSet, tile.x, tile.z);

    const profile = tile.profile ?? presetProfileForTier(tile.tier ?? RoadTier.TwoLane);
    const rule = lampRuleOf(profile);
    // The run's own coordinate, so two halves of a corridor, side by side, meet
    // at the same tile and a wide street's pair stands square across.
    const along = axis === 'z' ? tile.x : tile.z;
    if (((along % rule.spacingTiles) + rule.spacingTiles) % rule.spacingTiles !== 0) continue;
    const group = along / rule.spacingTiles;

    // A place is free of a bus stop's span, and of a tram pole.
    const slideTo = (base: LampPlacement): LampPlacement | null => {
      const along = firstFreeAlong((offset) => {
        const stand = standOf(offset === 0 ? base : { ...base, along: offset });
        if (!base.twin && clear.blocks(stand.x, stand.z)) return false;
        return taken.isFree(stand.x, stand.z);
      }, SLIDE_LIMIT_M);
      if (along === null) return null;
      return along === 0 ? base : { ...base, along };
    };

    const centre = centralLampOffsetOf(profile);
    if (centre !== null) {
      // A motorway's median or barrier carries one twin-armed pole.
      const found = slideTo({
        x: tile.x,
        z: tile.z,
        axis,
        side: 1,
        lateralOffset: centre + carriagewayShiftOf(profile),
        height: rule.height,
        twin: true,
      });
      if (found) placements.push(found);
      continue;
    }

    // A pole stands only on a kerb with no road beyond it: never on the edge a
    // corridor's halves share, which is the middle of the road.
    const free = (s: 1 | -1): boolean =>
      !tileSet.has(tileKey(tile.x + (axis === 'x' ? s : 0), tile.z + (axis === 'z' ? s : 0)));
    const preferred = lampSideOf(profile, group);
    const other: 1 | -1 = preferred === 1 ? -1 : 1;
    const sides: (1 | -1)[] = rule.wide
      ? [1, -1].filter((s) => free(s as 1 | -1)).map((s) => s as 1 | -1)
      : free(preferred)
        ? [preferred]
        : free(other)
          ? [other]
          : [];
    for (const side of sides) {
      const found = slideTo({
        x: tile.x,
        z: tile.z,
        axis,
        side,
        lateralOffset: lampLateralOffset(
          tile.tier,
          profile,
          flankShift(tileSet, tile, { axis, side }),
        ),
        height: rule.height,
      });
      if (found) placements.push(found);
    }
  }
  return placements;
}

/** Concatenates N indexed BufferGeometries (position+normal+index) into one, disposing the sources — same idiom as landmarks.ts's part-merge helper. */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  let vertexTotal = 0;
  for (const g of geometries)
    vertexTotal += (g.getAttribute('position') as THREE.BufferAttribute).count;

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const indices: number[] = [];

  let vertexOffset = 0;
  let floatOffset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const norm = g.getAttribute('normal') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, floatOffset);
    normals.set(norm.array as Float32Array, floatOffset);
    floatOffset += pos.array.length;

    const index = g.index;
    if (index) {
      for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + vertexOffset);
    }
    vertexOffset += pos.count;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/**
 * Curved/angled cantilever bracket: a short NECK rising from the pole-top
 * mount (local origin), then a longer REACH sloping back down to the
 * housing attach point at (ARM_LENGTH_METERS, -HOUSING_DROP, 0) — the same
 * local end-point the housing mesh's own attach point (local origin) will
 * be instanced at. Two straight box segments, angled and merged into one
 * static geometry; only ever reaches along local +X.
 */
function buildArmGeometry(): THREE.BufferGeometry {
  const neckDx = ARM_NECK_LENGTH;
  const neckDy = ARM_RISE;
  const neckLength = Math.hypot(neckDx, neckDy);
  const neckAngle = Math.atan2(neckDy, neckDx);
  const neck = new THREE.BoxGeometry(neckLength, ARM_THICKNESS, ARM_THICKNESS);
  neck.rotateZ(neckAngle);
  neck.translate(neckDx / 2, neckDy / 2, 0);

  const reachDx = ARM_REACH_LENGTH;
  const reachDy = -HOUSING_DROP - ARM_RISE;
  const reachLength = Math.hypot(reachDx, reachDy);
  const reachAngle = Math.atan2(reachDy, reachDx);
  const reach = new THREE.BoxGeometry(reachLength, ARM_THICKNESS, ARM_THICKNESS);
  reach.rotateZ(reachAngle);
  reach.translate(neckDx + reachDx / 2, neckDy + reachDy / 2, 0);

  return mergeGeometries([neck, reach]);
}

/**
 * Tapered cowl housing: a small mounting cap (flush with the arm's attach
 * point, local origin) with a 4-sided tapered cowl hanging below it,
 * narrowing toward the bottom — reads as "a real lamp housing", not a bare
 * box, and unambiguously points down.
 */
function buildHousingGeometry(): THREE.BufferGeometry {
  const cap = new THREE.BoxGeometry(HOUSING_CAP_LENGTH, HOUSING_CAP_HEIGHT, HOUSING_CAP_DEPTH);
  cap.translate(0, -HOUSING_CAP_HEIGHT / 2, 0);

  const cowl = new THREE.CylinderGeometry(
    HOUSING_COWL_TOP_RADIUS,
    HOUSING_COWL_BOTTOM_RADIUS,
    HOUSING_COWL_HEIGHT,
    HOUSING_COWL_SEGMENTS,
    1,
  );
  cowl.rotateY(Math.PI / 4); // square the 4-sided taper's faces up with the cap's box faces
  cowl.translate(0, -HOUSING_CAP_HEIGHT - HOUSING_COWL_HEIGHT / 2, 0);

  return mergeGeometries([cap, cowl]);
}

/**
 * Where a lamp stands, in world metres, and the unit direction its arm
 * reaches in: from the pole toward the centre line of the road it lights. A
 * grid road's lamp reaches along a world axis; a road off the grid's reaches
 * square to its centre line, whichever way that runs.
 */
export interface LampStand {
  x: number;
  z: number;
  reachX: number;
  reachZ: number;
  /** Pole height, metres; absent reads as the lowest pole. */
  height?: number;
}

const heightOf = (stand: LampStand): number => stand.height ?? POLE_HEIGHT;

/** The stand a grid lamp placement describes: curbside, offset along its axis. */
export function standOf(placement: LampPlacement): LampStand {
  const tileCenterX = tileToWorld(placement.x);
  const tileCenterZ = tileToWorld(placement.z);
  const offset = placement.lateralOffset * placement.side;
  const slide = placement.along ?? 0;
  // The arm reaches back toward the centre line, opposite the pole's offset.
  const reach = -placement.side;
  const height = placement.height;
  return placement.axis === 'x'
    ? { x: tileCenterX + offset, z: tileCenterZ + slide, reachX: reach, reachZ: 0, height }
    : { x: tileCenterX + slide, z: tileCenterZ + offset, reachX: 0, reachZ: reach, height };
}

/** The stands a placement describes: one, or the two arms of a twin on a median. */
export function standsOf(placement: LampPlacement): LampStand[] {
  const first = standOf(placement);
  if (!placement.twin) return [first];
  // `0 -` rather than a negation, which would turn a zero component into -0.
  return [first, { ...first, reachX: 0 - first.reachX, reachZ: 0 - first.reachZ }];
}

/** A compact roundabout as its lamps are placed: where its roads come in, and whether it has power. */
export interface RingLampSite {
  block: RoundaboutBlock;
  /** Each road into the ring: the corner it joins and the side of the block it meets. */
  arms: readonly { from: TilePoint; side: RoadFlow }[];
  /** The cross-section of the roads, which sets the pole's height, spacing and distance behind the kerb. */
  profile: RoadProfile;
  powered: boolean;
}

/** The roads' own width beside the pole's place, kept clear either side of a road's kerb line. */
const RING_POLE_ARM_CLEAR_M = 1;

/**
 * The lamps of one compact roundabout: on the outside of the ring, behind its
 * footway the way a street's poles stand behind its kerb, in the arcs between
 * the roads and never on the island. Each arc takes as many poles as the
 * street's spacing asks for, at least one, spread evenly along it, each
 * reaching in over the ring. An unpowered ring has none.
 */
export function ringLampStands(site: RingLampSite): LampStand[] {
  if (!site.powered || site.arms.length === 0) return [];
  const rule = lampRuleOf(site.profile);
  const half = carriagewayHalfWidthOf(site.profile);
  const poleRadius = RING_OUTER_RADIUS_M + lampLateralOffset(undefined, site.profile) - half;
  const centre = ringCentre(site.block);
  const lineOffset = TILE_METERS / 2;
  const along = Math.sqrt(RING_OUTER_RADIUS_M ** 2 - lineOffset ** 2);
  // Where each road's centre line meets the ring, as an angle about its centre.
  const angles = site.arms
    .map(({ from, side }) => {
      const across = (from.x === site.block.x ? -1 : 1) * lineOffset;
      const acrossZ = (from.z === site.block.z ? -1 : 1) * lineOffset;
      switch (side) {
        case RoadFlow.North:
          return Math.atan2(-along, across);
        case RoadFlow.South:
          return Math.atan2(along, across);
        case RoadFlow.West:
          return Math.atan2(acrossZ, -along);
        default:
          return Math.atan2(acrossZ, along);
      }
    })
    .sort((a, b) => a - b);
  const clear = (half + FOOTWAY_WIDTH_M + RING_POLE_ARM_CLEAR_M) / poleRadius;
  const spacing = rule.spacingTiles * TILE_METERS;
  const stands: LampStand[] = [];
  angles.forEach((from, i) => {
    const to =
      (angles[(i + 1) % angles.length] ?? from) + (i + 1 === angles.length ? 2 * Math.PI : 0);
    const lo = from + clear;
    const hi = to - clear;
    if (hi <= lo) return;
    const count = Math.max(1, Math.round(((hi - lo) * poleRadius) / spacing));
    for (let k = 0; k < count; k++) {
      const a = lo + ((hi - lo) * (k + 0.5)) / count;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      stands.push({
        x: centre.x + poleRadius * ux,
        z: centre.z + poleRadius * uz,
        reachX: -ux,
        reachZ: -uz,
        height: rule.height,
      });
    }
  });
  return stands;
}

/** World XZ of the luminaire — the arm end, out over the outer lane. */
function housingWorldXZ(stand: LampStand): { x: number; z: number } {
  const arm = armLengthOf(heightOf(stand));
  return { x: stand.x + stand.reachX * arm, z: stand.z + stand.reachZ * arm };
}

/**
 * The yaw that turns the arm, which reaches along local +X, to reach along a
 * stand's direction: a turn about +Y by θ takes +X to (cos θ, −sin θ).
 */
const armYawOf = (stand: LampStand): number => Math.atan2(-stand.reachZ, stand.reachX);

/**
 * The housing's yaw. Its cowl is four-fold symmetric, so only the line it
 * tilts along matters and not which way along it: a yaw folded into [0, π).
 */
function housingYawOf(stand: LampStand): number {
  let yaw = armYawOf(stand);
  if (yaw < 0) yaw += Math.PI;
  return yaw >= Math.PI - 1e-9 ? yaw - Math.PI : yaw;
}

/** Vertices in one pool disc: the core, plus a ring of segments per falloff step. */
export const POOL_VERTICES_PER_LAMP = 1 + POOL_RINGS.length * POOL_SEGMENTS;

/**
 * One merged terrain-conforming disc per lamp, brightness carried by
 * per-vertex color: a hot core that decays fast and trails off to nothing at
 * the rim. A single center-to-rim gradient reads as a painted coin, so the
 * falloff is shaped by concentric rings; the zero-brightness rim also means
 * ground the disc can't quite match never shows a hard edge. Sampling
 * `heightAt` per vertex is what keeps the pool ON the road across a slope —
 * one flat disc at a single Y slices straight through it.
 */
function buildPoolGeometry(
  stands: readonly LampStand[],
  heightAt: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  stands.forEach((stand, lamp) => {
    const { x: centerX, z: centerZ } = housingWorldXZ(stand);
    const poolScale = lampScaleOf(heightOf(stand)); // a taller lantern lights more road
    const base = lamp * POOL_VERTICES_PER_LAMP;
    // The arm reaches ACROSS the road, so the roadway runs square to it — that
    // is the direction the pool stretches down. `across` is always `along`
    // turned a quarter, never a coordinate swap: swapping mirrors the plane,
    // which reverses triangle winding and gets one road direction's pools
    // back-face culled into invisibility.
    // Of the two ways along the road, the one toward +z (or +x, running east
    // to west) is taken, so a pool is laid the same whichever kerb it is on.
    let alongX = -stand.reachZ;
    let alongZ = stand.reachX;
    if (alongZ < 0 || (alongZ === 0 && alongX < 0)) {
      alongX = -alongX;
      alongZ = -alongZ;
    }
    const acrossX = -alongZ;
    const acrossZ = alongX;

    positions.push(centerX, heightAt(centerX, centerZ) + POOL_Y_OFFSET, centerZ);
    colors.push(1, 1, 1);

    for (let ring = 0; ring < POOL_RINGS.length; ring++) {
      const [radiusFraction, intensity] = POOL_RINGS[ring]!;
      const radius = POOL_RADIUS * radiusFraction * poolScale;
      const firstVertex = base + 1 + ring * POOL_SEGMENTS;
      const innerFirst = firstVertex - POOL_SEGMENTS;
      for (let s = 0; s < POOL_SEGMENTS; s++) {
        const angle = (s / POOL_SEGMENTS) * Math.PI * 2;
        const along = Math.cos(angle) * radius * POOL_ALONG_SCALE;
        const across = Math.sin(angle) * radius * POOL_ACROSS_SCALE;
        const vx = centerX + alongX * along + acrossX * across;
        const vz = centerZ + alongZ * along + acrossZ * across;
        positions.push(vx, heightAt(vx, vz) + POOL_Y_OFFSET, vz);
        colors.push(intensity, intensity, intensity);

        const here = firstVertex + s;
        const next = firstVertex + ((s + 1) % POOL_SEGMENTS);
        if (ring === 0) {
          indices.push(base, next, here); // fan off the core vertex
        } else {
          const innerHere = innerFirst + s;
          const innerNext = innerFirst + ((s + 1) % POOL_SEGMENTS);
          indices.push(innerHere, innerNext, here, innerNext, next, here);
        }
      }
    }
  });

  const pool = new THREE.BufferGeometry();
  pool.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  pool.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  pool.setIndex(indices);
  return pool;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _lensOffset = new THREE.Vector3();
const _identityQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

// The arm bracket geometry only reaches along local +X (mount at origin), so
// each lamp turns it about +Y to reach the way its stand faces.
const _armYaw = new THREE.Quaternion();

// Downward pitch (about the housing's own local "across" axis, local Z)
// applied before yaw, so the cowl reads as angled toward the road whichever
// way the lamp faces.
const _housingPitch = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  HOUSING_TILT_RAD,
);
const _housingQuat = new THREE.Quaternion();

export class LampRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  private readonly poleGeometry = new THREE.CylinderGeometry(
    POLE_RADIUS_TOP,
    POLE_RADIUS_BOTTOM,
    POLE_HEIGHT,
    POLE_RADIAL_SEGMENTS,
  );
  private readonly poleMaterial = new THREE.MeshLambertMaterial({ color: POLE_COLOR });

  /** Curved/angled cantilever bracket (neck + reach), mount at local origin. */
  private readonly armGeometry = buildArmGeometry();

  /** Tapered box/cowl housing, attach point at local origin. */
  private readonly housingGeometry = buildHousingGeometry();
  private readonly housingMaterial = new THREE.MeshLambertMaterial({
    color: HOUSING_COLOR,
    emissive: HOUSING_COLOR,
    emissiveIntensity: 0,
  });

  /**
   * The bulb: a near-black body so by day it reads as a dark lens in the cowl
   * and by night contributes nothing but its own emissive glow.
   */
  private readonly lensGeometry = new THREE.SphereGeometry(
    LENS_RADIUS,
    LENS_WIDTH_SEGMENTS,
    LENS_HEIGHT_SEGMENTS,
  );
  private readonly lensMaterial = new THREE.MeshLambertMaterial({
    color: LENS_UNLIT_COLOR,
    emissive: LENS_COLOR,
    emissiveIntensity: 0,
  });

  private readonly poolMaterial = new THREE.MeshBasicMaterial({
    color: POOL_COLOR,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  private poleMesh: THREE.InstancedMesh | null = null;
  private armMesh: THREE.InstancedMesh | null = null;
  private housingMesh: THREE.InstancedMesh | null = null;
  private lensMesh: THREE.InstancedMesh | null = null;
  /** Not instanced: each disc carries its own terrain-sampled vertex heights. */
  private poolMesh: THREE.Mesh | null = null;
  private stands: LampStand[] = [];
  /** Instances each of the four layers can hold; only ever doubles. */
  private capacity = 0;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /**
   * Full rebuild from the current road tile set (roads change relatively
   * rarely), plus the lamps standing along roads off the grid, which have no
   * tiles to be placed from.
   */
  rebuild(
    roadTiles: readonly LampRoadTile[],
    drivewayTiles?: ReadonlySet<number>,
    freeStands: readonly LampStand[] = [],
    poles: readonly TramPoleStand[] = [],
    stops: readonly LampStopSite[] = [],
    fixed: readonly Spot[] = [],
  ): void {
    this.stands = [
      ...computeLampPlacements(roadTiles, drivewayTiles, poles, stops, fixed).flatMap(standsOf),
      ...freeStands,
    ];

    const count = this.stands.length;
    // The meshes outlive a rebuild: a disposed mesh takes its material's
    // compiled pipeline with it, so they are replaced only to hold more, by
    // doubling, and the live count follows the lamps.
    if (count > this.capacity) {
      this.disposeInstanced();
      this.capacity = Math.max(MIN_INSTANCE_CAPACITY, this.capacity);
      while (this.capacity < count) this.capacity *= 2;
      this.poleMesh = new THREE.InstancedMesh(this.poleGeometry, this.poleMaterial, this.capacity);
      this.armMesh = new THREE.InstancedMesh(this.armGeometry, this.poleMaterial, this.capacity);
      this.housingMesh = new THREE.InstancedMesh(
        this.housingGeometry,
        this.housingMaterial,
        this.capacity,
      );
      this.lensMesh = new THREE.InstancedMesh(this.lensGeometry, this.lensMaterial, this.capacity);
      // Pole/arm/housing are real modeled geometry — they cast shadows. The lens
      // is a light source, so it stays non-shadow-casting.
      this.poleMesh.castShadow = true;
      this.armMesh.castShadow = true;
      this.housingMesh.castShadow = true;
      this.scene.add(this.poleMesh, this.armMesh, this.housingMesh, this.lensMesh);
    }
    const { poleMesh, armMesh, housingMesh, lensMesh } = this;
    if (!poleMesh || !armMesh || !housingMesh || !lensMesh) return;

    // The pool keeps its Mesh and swaps the geometry that bakes terrain heights.
    const poolGeometry = buildPoolGeometry(this.stands, this.heightAt);
    if (this.poolMesh) {
      this.poolMesh.geometry.dispose();
      this.poolMesh.geometry = poolGeometry;
    } else {
      this.poolMesh = new THREE.Mesh(poolGeometry, this.poolMaterial);
      this.scene.add(this.poolMesh);
    }
    this.poolMesh.visible = count > 0;

    for (const mesh of [poleMesh, armMesh, housingMesh, lensMesh]) {
      setInstanceCount(mesh, count);
      // The lamps move between rebuilds: a bound from an earlier set would cull them.
      mesh.boundingSphere = null;
    }

    for (let i = 0; i < count; i++) this.writeLamp(i, this.stands[i]!);

    poleMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    housingMesh.instanceMatrix.needsUpdate = true;
    lensMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Drives the fixture, lens and ground pool from the visual-day fraction:
   * lamps light at dusk, burn overnight, and go dark an hour past sunrise.
   */
  setTimeOfDay(dayT: number): void {
    const f = lampGlowFactor(dayT);
    this.housingMaterial.emissiveIntensity = f * HOUSING_EMISSIVE_STRENGTH;
    this.lensMaterial.emissiveIntensity = f * LENS_EMISSIVE_STRENGTH;
    this.poolMaterial.opacity = f * POOL_MAX_OPACITY;
  }

  /** Where each lamp of the last rebuild() stands, world metres. */
  standSpots(): readonly Spot[] {
    return this.stands;
  }

  /** Number of lamps placed by the last rebuild(); every layer matches this 1:1. */
  lampCount(): number {
    return this.stands.length;
  }

  poleInstanceCount(): number {
    return this.poleMesh?.count ?? 0;
  }

  armInstanceCount(): number {
    return this.armMesh?.count ?? 0;
  }

  housingInstanceCount(): number {
    return this.housingMesh?.count ?? 0;
  }

  lensInstanceCount(): number {
    return this.lensMesh?.count ?? 0;
  }

  housingEmissiveIntensity(): number {
    return this.housingMaterial.emissiveIntensity;
  }

  lensEmissiveIntensity(): number {
    return this.lensMaterial.emissiveIntensity;
  }

  /** Vertices in the merged pool mesh — POOL_VERTICES_PER_LAMP per lamp. */
  poolVertexCount(): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.count : 0;
  }

  poolOpacity(): number {
    return this.poolMaterial.opacity;
  }

  /**
   * Sign of the Y component of triangle `tri`'s geometric normal: +1 when it
   * faces up (and so survives back-face culling from a camera above), -1 when
   * it is wound the other way. Test introspection — a pool wound backwards is
   * simply invisible in the running game, which no vertex-count check catches.
   */
  poolTriangleFacing(tri = 0): number {
    const geometry = this.poolMesh?.geometry;
    const index = geometry?.getIndex();
    const position = geometry?.getAttribute('position');
    if (!index || !position) return 0;

    const at = (i: number): THREE.Vector3 => {
      const v = index.getX(tri * 3 + i);
      return new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v));
    };
    const a = at(0);
    const normal = new THREE.Vector3()
      .subVectors(at(1), a)
      .cross(new THREE.Vector3().subVectors(at(2), a));
    return Math.sign(normal.y);
  }

  /** World coordinate of pool vertex `vertex` — test introspection for shape and conformance. */
  poolVertexX(vertex: number): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.getX(vertex) : NaN;
  }

  poolVertexY(vertex: number): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.getY(vertex) : NaN;
  }

  poolVertexZ(vertex: number): number {
    const position = this.poolMesh?.geometry.getAttribute('position');
    return position ? position.getZ(vertex) : NaN;
  }

  poleCastShadow(): boolean {
    return this.poleMesh?.castShadow ?? false;
  }

  armCastShadow(): boolean {
    return this.armMesh?.castShadow ?? false;
  }

  housingCastShadow(): boolean {
    return this.housingMesh?.castShadow ?? false;
  }

  polePosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.poleMesh, slot);
  }

  armPosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.armMesh, slot);
  }

  housingPosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.housingMesh, slot);
  }

  lensPosition(slot = 0): THREE.Vector3 {
    return this.positionOf(this.lensMesh, slot);
  }

  /** World XZ+Y of the core vertex of lamp `slot`'s pool disc. */
  poolCenter(slot = 0): THREE.Vector3 {
    const position = this.poolMesh?.geometry.getAttribute('position');
    if (!position) return new THREE.Vector3(NaN, NaN, NaN);
    const vertex = slot * POOL_VERTICES_PER_LAMP;
    return new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
  }

  /** World-space rotation of the arm instance at `slot` (test introspection for the direction-dependent yaw). */
  armQuaternion(slot = 0): THREE.Quaternion {
    const quat = new THREE.Quaternion();
    if (!this.armMesh) return quat;
    const matrix = new THREE.Matrix4();
    this.armMesh.getMatrixAt(slot, matrix);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quat, scale);
    return quat;
  }

  private positionOf(mesh: THREE.InstancedMesh | null, slot: number): THREE.Vector3 {
    if (!mesh) return new THREE.Vector3(NaN, NaN, NaN);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(slot, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  }

  private writeLamp(slot: number, stand: LampStand): void {
    const { x: poleX, z: poleZ } = stand;
    const groundY = this.heightAt(poleX, poleZ);

    // The arm/housing reach from the pole top toward the road centerline.
    const { x: housingX, z: housingZ } = housingWorldXZ(stand);
    const armYaw = _armYaw.setFromAxisAngle(_upAxis, armYawOf(stand));
    const housingQuat = _housingQuat
      .setFromAxisAngle(_upAxis, housingYawOf(stand))
      .multiply(_housingPitch);

    // One mesh serves every pole height: the pole is stretched to its height
    // and grows with its arm, and the arm, housing and lens grow together, all
    // by positive scales so no instance is mirrored.
    const height = heightOf(stand);
    const scale = lampScaleOf(height);
    _scale.set(scale, height / POLE_HEIGHT, scale);
    _position.set(poleX, groundY + height / 2, poleZ);
    _matrix.compose(_position, _identityQuat, _scale);
    this.poleMesh!.setMatrixAt(slot, _matrix);
    _scale.setScalar(scale);

    // Arm mounts at the pole-top attach point; the bracket geometry itself
    // encodes the rise-then-reach bend, so only the mount position, the
    // direction-dependent yaw and the scale vary per instance.
    const mountY = groundY + height - ARM_MOUNT_BELOW_TOP_M;
    _position.set(poleX, mountY, poleZ);
    _matrix.compose(_position, armYaw, _scale);
    this.armMesh!.setMatrixAt(slot, _matrix);

    // Housing hangs at the arm end, over the outer lane, angled down.
    const housingY = mountY - HOUSING_DROP * scale;
    _position.set(housingX, housingY, housingZ);
    _matrix.compose(_position, housingQuat, _scale);
    this.housingMesh!.setMatrixAt(slot, _matrix);

    // Lens sits in the cowl mouth: straight down the HOUSING's own axis, not
    // the world's, so the housing's downward tilt carries the bulb with it.
    _lensOffset.set(0, -LENS_DROP * scale, 0).applyQuaternion(housingQuat);
    _position.set(housingX + _lensOffset.x, housingY + _lensOffset.y, housingZ + _lensOffset.z);
    _matrix.compose(_position, _identityQuat, _scale);
    this.lensMesh!.setMatrixAt(slot, _matrix);
  }

  private disposeInstanced(): void {
    for (const mesh of [this.poleMesh, this.armMesh, this.housingMesh, this.lensMesh]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.poleMesh = null;
    this.armMesh = null;
    this.housingMesh = null;
    this.lensMesh = null;
  }
}
