/**
 * Where the poles of a power line stand, and which poles a wire joins. Pure
 * placement over the road tiles and the strung line layer: no three.js, no
 * heights, no randomness — the same tiles always give the same poles.
 *
 * Three lines are laid here. A powered sealed street carries its own: a pole
 * every second tile, behind the kerb and outside the footway, on one side the
 * line keeps between junctions. A line the player strings over open ground is
 * the tall cross-country kind, centred on its tile. Strung along a gravel road
 * it becomes a roadside line standing at the tile's edge. A line tile on a
 * sealed street draws nothing: the street's own line is there already.
 *
 * Wires hang from pole to pole with a real sag, so a junction tile or a street
 * crossing is spanned in one go and no pole ever stands on it.
 */

import {
  CHUNKS_PER_SIDE,
  CHUNK_TILES,
  TILE_METERS,
  tileToWorld,
  worldToTile,
} from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  hasKerbs,
  isPaved,
  kerbWidthOf,
  presetProfileForTier,
} from '../shared/roadprofile';
import { RoadTier, isFrontageTier, isStreetTier } from '../shared/types';
import type { RoadProfile, TilePoint } from '../shared/types';
import { flankShift, hasCrossingRoad, joins, lateralAxis, tileKey } from './roadfurniture';
import type { FurnitureRoadTile, RoadTileIndex } from './roadfurniture';
import type { CablePlace } from './cables';
import {
  alongOffsets,
  firstFreeAlong,
  placeIsFree,
  SLIDE_LIMIT_M,
  type Roadside,
} from './roadsidespace';

export type PoleKind = 'street' | 'roadside' | 'country';

/** What a kind of pole is made of: its height and crossarm, metres. */
interface PoleSpec {
  /** Above the ground it stands on. */
  height: number;
  /** How far below the top the crossarm hangs, for a line running east-west and north-south. */
  dropEastWest: number;
  dropNorthSouth: number;
  armLength: number;
  /** Between the outer wires and the middle one, along the arm. */
  spread: number;
  /** Radius at the foot. */
  radius: number;
  /** Tiles between poles along a run. */
  spacingTiles: number;
}

/** A 40 ft pole set 6 ft, the common street pole. */
export const STREET_POLE_HEIGHT_M = 10.4;
/** A 69 kV cross-country pole, 70 to 80 ft. */
export const COUNTRY_POLE_HEIGHT_M = 21;

export const POLE_SPECS: Readonly<Record<PoleKind, PoleSpec>> = {
  street: {
    height: STREET_POLE_HEIGHT_M,
    dropEastWest: 0.9,
    // The arms of a line crossing it hang lower, so the two never touch at a junction.
    dropNorthSouth: 1.7,
    armLength: 2.4,
    spread: 0.9,
    radius: 0.2,
    spacingTiles: 2,
  },
  roadside: {
    height: STREET_POLE_HEIGHT_M,
    dropEastWest: 0.9,
    dropNorthSouth: 1.7,
    armLength: 2.4,
    spread: 0.9,
    radius: 0.2,
    spacingTiles: 4,
  },
  country: {
    height: COUNTRY_POLE_HEIGHT_M,
    dropEastWest: 1.4,
    dropNorthSouth: 1.4,
    armLength: 4.4,
    spread: 1.8,
    radius: 0.32,
    spacingTiles: 5,
  },
};

/** A pole stands at least this far behind the kerb face. */
export const POLE_BEHIND_KERB_M = 0.6;
/** A wire hangs at least this high over any road it crosses. */
export const WIRE_CLEARANCE_M = 4.7;
/** How far a guy wire's anchor lies from its pole, along the ground. */
export const GUY_REACH_M = 4;
/** A pole pulled harder than this by its wires, as a share of one wire's pull, is guyed. */
const GUY_PULL = 0.35;
/** The most tiles a wire spans between two poles. */
const MAX_SPAN_TILES = 5;

/** A cable guard stands up the side of a riser pole, this far from its axis, metres. */
export const RISER_GUARD_OFFSET_M = 0.2;

/** One pole: where it stands, how tall, and how it is dressed. */
export interface PoleStand {
  /** The tile it stands on, as tileKey. */
  key: number;
  kind: PoleKind;
  x: number;
  z: number;
  height: number;
  /** Where the crossarm hangs above the ground. */
  arm: number;
  armLength: number;
  spread: number;
  radius: number;
  /** The direction the crossarm lies along, a unit vector square to the first wire. */
  armX: number;
  armZ: number;
  /** The ground anchor of the guy that holds it, or null where its wires pull evenly. */
  guy: { x: number; z: number } | null;
  /**
   * A riser pole carries a buried cable up to the wire: the unit direction from
   * the pole to that cable, which the guard up its side faces. Absent otherwise.
   */
  riser?: { x: number; z: number };
}

export interface WireSpan {
  a: PoleStand;
  b: PoleStand;
}

/**
 * A green box on the surface where a buried cable shows: the junction box at an
 * end or a branch of a run, or the pad-mounted transformer along a buried
 * street. (fx, fz) is the unit direction its doors face.
 */
export interface CableBox {
  kind: 'junction' | 'transformer';
  x: number;
  z: number;
  fx: number;
  fz: number;
}

export interface PowerLay {
  poles: PoleStand[];
  spans: WireSpan[];
  boxes?: CableBox[];
}

/** A pole before it is dressed: its place, and the others its wires run to. */
export interface PoleSite {
  key: number;
  kind: PoleKind;
  x: number;
  z: number;
  /** The unit direction to the cable this pole is the riser for, where it is one. */
  riser?: { x: number; z: number };
}

/** What the street lines are laid over. */
export interface PowerWorld {
  tileSet: RoadTileIndex;
  /** Tiles that take no pole (a drive, a junction a free road owns, a station); a wire still crosses them. */
  keepOff: ReadonlySet<number>;
  /** Tiles that carry the supply inside a structure (a tram guideway): nothing is drawn, and no wire crosses. */
  closed: ReadonlySet<number>;
  /**
   * What stands before a pole does: the bus stops' spans, the drives, and the
   * signal masts, stop signs, tram poles and lamps already put down. A pole
   * moves along its strip off any of them, or is not stood.
   */
  roadside?: Roadside;
  /** Tiles a generator or a substation stands on: a strung line that ends beside one ends on a pole at its edge. */
  sources?: ReadonlySet<number>;
  /** Tiles a buried cable lies under, keyed by tileKey. */
  cables?: ReadonlySet<number>;
  /** Tiles a building stands on, keyed by tileKey: a cable's box never stands in one's lot. */
  built?: ReadonlySet<number>;
  /** Tiles a line on poles stands on (strung or held), keyed by tileKey: where a cable ends beside one it rises. */
  lines?: ReadonlySet<number>;
}

/** How far a pole slides along its tile's strip to find a free place, metres. */
const POLE_SLIDE_LIMIT_M = TILE_METERS / 2 - 1;

/** How far outside a source's edge the pole that ends a line beside it stands. */
export const SOURCE_POLE_SETBACK_M = 0.8;

/** How hard a span sags at its middle, metres: half a metre at the 40 m street span. */
export function wireSagM(lengthM: number): number {
  return Math.max(0.2, 0.5 * (lengthM / 40) ** 2);
}

/** Gives a site its crossarm and guy from the places its wires run to. */
export function shapePole(
  site: PoleSite,
  neighbours: readonly { x: number; z: number }[],
): PoleStand {
  const spec = POLE_SPECS[site.kind];
  let armX = 0;
  let armZ = 1;
  let alongX = true;
  let pullX = 0;
  let pullZ = 0;
  neighbours.forEach((n, i) => {
    const dx = n.x - site.x;
    const dz = n.z - site.z;
    const len = Math.hypot(dx, dz) || 1;
    if (i === 0) {
      armX = -dz / len;
      armZ = dx / len;
      alongX = Math.abs(dx) >= Math.abs(dz);
    }
    pullX += dx / len;
    pullZ += dz / len;
  });
  const pull = Math.hypot(pullX, pullZ);
  return {
    key: site.key,
    kind: site.kind,
    x: site.x,
    z: site.z,
    height: spec.height,
    arm: spec.height - (alongX ? spec.dropEastWest : spec.dropNorthSouth),
    armLength: spec.armLength,
    spread: spec.spread,
    radius: spec.radius,
    armX,
    armZ,
    guy:
      neighbours.length > 0 && pull > GUY_PULL
        ? { x: site.x - (pullX / pull) * GUY_REACH_M, z: site.z - (pullZ / pull) * GUY_REACH_M }
        : null,
    ...(site.riser ? { riser: site.riser } : {}),
  };
}

/**
 * Dresses sites joined by links into a lay: every site becomes a pole, every
 * link a span, and each pole is guyed by what its own links pull.
 */
export function layFromLinks(
  sites: readonly PoleSite[],
  links: readonly [number, number][],
): PowerLay {
  const around: { x: number; z: number }[][] = sites.map(() => []);
  for (const [a, b] of links) {
    around[a]!.push(sites[b]!);
    around[b]!.push(sites[a]!);
  }
  const poles = sites.map((s, i) => shapePole(s, around[i]!));
  return { poles, spans: links.map(([a, b]) => ({ a: poles[a]!, b: poles[b]! })) };
}

const EVEN = (n: number): boolean => ((n % 2) + 2) % 2 === 0;

const DIRS: readonly { dx: number; dz: number }[] = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];

function profileOf(tile: FurnitureRoadTile): RoadProfile {
  return tile.profile ?? presetProfileForTier(tile.tier ?? RoadTier.TwoLane);
}

/**
 * How far from a road's centre line its poles stand: behind the walk where it
 * has a kerb, and at the edge of the tile where it has none, since the pole
 * must still clear the kerb face by POLE_BEHIND_KERB_M whatever else is true.
 */
export function poleLateralOffset(profile: RoadProfile): number {
  const half = carriagewayHalfWidthOf(profile);
  const radius = POLE_SPECS.street.radius;
  if (!hasKerbs(profile)) return Math.max(TILE_METERS / 2, half + POLE_BEHIND_KERB_M + radius);
  return Math.max(half + kerbWidthOf(profile) + radius, half + POLE_BEHIND_KERB_M + radius);
}

/** Whether the street's own line runs along this tile: sealed, powered, on the ground, not a motorway or a ramp. */
function carriesStreetLine(tile: FurnitureRoadTile & { powered?: boolean }): boolean {
  if (tile.powered === false || tile.elevated === true || tile.ring === true) return false;
  const tier = tile.tier ?? RoadTier.TwoLane;
  if (!isStreetTier(tier) || tier === RoadTier.Highway || tier === RoadTier.Ramp) return false;
  return isPaved(profileOf(tile));
}

interface TileSite extends PoleSite {
  tx: number;
  tz: number;
}

const cableAt = (w: PowerWorld, x: number, z: number): boolean =>
  w.cables?.has(tileKey(x, z)) === true;

/**
 * Whether a sealed street's own supply runs under this tile: a cable lies
 * beneath a made-up street on the ground, so no pole and no wire shows here.
 */
export function isBuriedStreet(w: PowerWorld, x: number, z: number): boolean {
  if (!cableAt(w, x, z)) return false;
  const tile = w.tileSet.get(tileKey(x, z));
  if (!tile || tile.elevated === true || tile.ring === true) return false;
  const tier = tile.tier ?? RoadTier.TwoLane;
  return isFrontageTier(tier) && isPaved(profileOf(tile));
}

/** A cable that is not a street's own supply underground: one that needs its own ends dressed. */
const looseCableAt = (w: PowerWorld, x: number, z: number): boolean =>
  cableAt(w, x, z) && !isBuriedStreet(w, x, z);

/** Cable tiles orthogonally beside (x, z). */
function cableNeighbours(w: PowerWorld, x: number, z: number): number {
  return DIRS.filter((d) => cableAt(w, x + d.dx, z + d.dz)).length;
}

/** Whether (x, z) is the last tile of a run of loose cable. */
function cableEndAt(w: PowerWorld, x: number, z: number): boolean {
  return looseCableAt(w, x, z) && cableNeighbours(w, x, z) <= 1;
}

/**
 * For the last buried tile before a junction, the direction from its riser
 * into the buried stretch (away from the junction); null on any other tile.
 */
function buriedEndRiserDir(
  w: PowerWorld,
  x: number,
  z: number,
  axis: 'x' | 'z',
): { x: number; z: number } | null {
  const run = axis === 'z' ? [DIRS[1]!, DIRS[3]!] : [DIRS[0]!, DIRS[2]!];
  for (const d of run) {
    const nx = x + d.dx;
    const nz = z + d.dz;
    if (
      joins(w.tileSet, x, z, nx, nz) &&
      hasCrossingRoad(w.tileSet, nx, nz) &&
      !isBuriedStreet(w, nx, nz)
    ) {
      return { x: 0 - d.dx, z: 0 - d.dz };
    }
  }
  return null;
}

/**
 * The direction from a street tile's pole to the cable that rises there: along
 * the run toward a buried stretch, or toward the end of a run of cable beside
 * the tile. Null where nothing rises on this tile.
 */
function riserDirAt(
  w: PowerWorld,
  x: number,
  z: number,
  axis: 'x' | 'z',
): { x: number; z: number } | null {
  if (!w.cables || w.cables.size === 0) return null;
  const run = axis === 'z' ? [DIRS[1]!, DIRS[3]!] : [DIRS[0]!, DIRS[2]!];
  for (const d of run) {
    if (joins(w.tileSet, x, z, x + d.dx, z + d.dz) && isBuriedStreet(w, x + d.dx, z + d.dz)) {
      return { x: d.dx, z: d.dz };
    }
  }
  for (const d of DIRS) if (cableEndAt(w, x + d.dx, z + d.dz)) return { x: d.dx, z: d.dz };
  return null;
}

/**
 * The side of a tile's road its pole stands on, the same all along a run
 * because it follows the coordinate the run lies along, and the other side
 * where a road lies beyond that one. Null where neither side is free.
 */
function sideOf(tileSet: RoadTileIndex, x: number, z: number, axis: 'x' | 'z'): 1 | -1 | null {
  const line = axis === 'z' ? z : x;
  const preferred: 1 | -1 = EVEN(line) ? 1 : -1;
  const free = (s: 1 | -1): boolean =>
    !tileSet.has(tileKey(x + (axis === 'x' ? s : 0), z + (axis === 'z' ? s : 0)));
  if (free(preferred)) return preferred;
  return free(preferred === 1 ? -1 : 1) ? (preferred === 1 ? -1 : 1) : null;
}

/** Where the pole of a road tile stands at its side, in world metres. */
function roadsideSite(
  tileSet: RoadTileIndex,
  tile: FurnitureRoadTile,
  axis: 'x' | 'z',
  side: 1 | -1,
  kind: PoleKind,
): TileSite {
  const offset =
    (poleLateralOffset(profileOf(tile)) + flankShift(tileSet, tile, { axis, side })) * side;
  return {
    key: tileKey(tile.x, tile.z),
    kind,
    tx: tile.x,
    tz: tile.z,
    x: tileToWorld(tile.x) + (axis === 'x' ? offset : 0),
    z: tileToWorld(tile.z) + (axis === 'z' ? offset : 0),
  };
}

/**
 * The pole the street's line stands on this tile, or null. Every second tile
 * carries one; none stands on a junction or a turn, on a drive, or where the
 * supply runs inside a structure. A drive on a pole's tile moves the pole one
 * tile along.
 */
function streetSiteAt(w: PowerWorld, x: number, z: number): TileSite | null {
  const key = tileKey(x, z);
  const tile = w.tileSet.get(key);
  if (!tile || !carriesStreetLine(tile) || w.closed.has(key)) return null;
  if (w.keepOff.has(key) || hasCrossingRoad(w.tileSet, x, z)) return null;
  const axis = lateralAxis(w.tileSet, x, z);
  // Where a buried stretch ends, or a cable runs up to the line, a pole stands
  // whatever tile it is: it carries the cable up. A buried stretch that ends at
  // a junction has no tile to stand on there, so its last tile takes the riser.
  const riser = isBuriedStreet(w, x, z)
    ? buriedEndRiserDir(w, x, z, axis)
    : riserDirAt(w, x, z, axis);
  if (isBuriedStreet(w, x, z) && riser === null) return null;
  if (riser === null && !EVEN(x + z)) {
    // The next tile along the run, when it is one a drive has taken.
    const nx = x + (axis === 'z' ? 1 : 0);
    const nz = z + (axis === 'x' ? 1 : 0);
    const next = w.tileSet.get(tileKey(nx, nz));
    const taken =
      next !== undefined &&
      w.keepOff.has(tileKey(nx, nz)) &&
      carriesStreetLine(next) &&
      !hasCrossingRoad(w.tileSet, nx, nz) &&
      joins(w.tileSet, x, z, nx, nz);
    if (!taken) return null;
  }
  const side = sideOf(w.tileSet, x, z, axis);
  if (side === null) return null;
  const site: TileSite = {
    ...roadsideSite(w.tileSet, tile, axis, side, 'street'),
    ...(riser ? { riser } : {}),
  };
  const roadside = w.roadside;
  if (!roadside) return site;
  // The pole moves along its strip, nearest its tile's middle, to a place no
  // stop, drive or other object holds.
  const at = (along: number): { x: number; z: number } =>
    axis === 'z' ? { x: site.x + along, z: site.z } : { x: site.x, z: site.z + along };
  const along = firstFreeAlong((a) => {
    const p = at(a);
    return placeIsFree(roadside, p.x, p.z);
  }, POLE_SLIDE_LIMIT_M);
  if (along === null) return null;
  return along === 0 ? site : { ...site, ...at(along) };
}

/** Every pole the street's own line stands, where the roadside lets it: what the objects below a pole keep clear of. */
export function streetPoleSpots(w: PowerWorld): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const tile of w.tileSet.values()) {
    const site = streetSiteAt(w, tile.x, tile.z);
    if (site) out.push({ x: site.x, z: site.z });
  }
  return out;
}

/**
 * The pole a wire from (x, z) in direction (dx, dz) reaches: walks the road,
 * across junction tiles in one span and round a turn, until a pole stands or
 * the line ends.
 */
function reachFrom(
  w: PowerWorld,
  x: number,
  z: number,
  dx: number,
  dz: number,
  siteAt: (x: number, z: number) => TileSite | null,
): TileSite | null {
  let cx = x;
  let cz = z;
  let ddx = dx;
  let ddz = dz;
  for (let step = 0; step < MAX_SPAN_TILES; step++) {
    if (!joins(w.tileSet, cx, cz, cx + ddx, cz + ddz)) return null;
    cx += ddx;
    cz += ddz;
    const key = tileKey(cx, cz);
    const tile = w.tileSet.get(key);
    // No wire runs over a buried stretch: the line ends on its riser.
    if (!tile || !carriesStreetLine(tile) || w.closed.has(key)) return null;
    const site = siteAt(cx, cz);
    if (site) return site;
    if (isBuriedStreet(w, cx, cz)) return null;
    const open = DIRS.filter((d) => joins(w.tileSet, cx, cz, cx + d.dx, cz + d.dz));
    const bent =
      open.length === 2 && !(open[0]!.dx === -open[1]!.dx && open[0]!.dz === -open[1]!.dz);
    if (bent) {
      const onward = open.find((d) => !(d.dx === -ddx && d.dz === -ddz));
      if (!onward) return null;
      ddx = onward.dx;
      ddz = onward.dz;
    }
  }
  return null;
}

/** Every pole the street's own line stands in one terrain chunk, with the spans that start there. */
export function layStreetChunk(w: PowerWorld, chunk: number): PowerLay {
  const x0 = (chunk % CHUNKS_PER_SIDE) * CHUNK_TILES;
  const z0 = Math.floor(chunk / CHUNKS_PER_SIDE) * CHUNK_TILES;
  const sites = new Map<number, TileSite | null>();
  const siteAt = (x: number, z: number): TileSite | null => {
    const key = tileKey(x, z);
    if (!sites.has(key)) sites.set(key, streetSiteAt(w, x, z));
    return sites.get(key) ?? null;
  };
  const neighboursOf = (s: TileSite): TileSite[] => {
    const alongX = lateralAxis(w.tileSet, s.tx, s.tz) === 'z';
    const dirs = alongX
      ? [
          { dx: -1, dz: 0 },
          { dx: 1, dz: 0 },
        ]
      : [
          { dx: 0, dz: -1 },
          { dx: 0, dz: 1 },
        ];
    const out: TileSite[] = [];
    for (const d of dirs) {
      const n = reachFrom(w, s.tx, s.tz, d.dx, d.dz, siteAt);
      if (n && !out.some((o) => o.key === n.key)) out.push(n);
    }
    return out;
  };
  const stands = new Map<number, PoleStand>();
  const standOf = (s: TileSite): PoleStand => {
    let stand = stands.get(s.key);
    if (!stand) {
      stand = shapePole(s, neighboursOf(s));
      stands.set(s.key, stand);
    }
    return stand;
  };

  const poles: PoleStand[] = [];
  const spans: WireSpan[] = [];
  for (let z = z0; z < z0 + CHUNK_TILES; z++) {
    for (let x = x0; x < x0 + CHUNK_TILES; x++) {
      const site = siteAt(x, z);
      if (!site) continue;
      const pole = standOf(site);
      poles.push(pole);
      for (const n of neighboursOf(site)) {
        // A span belongs to the pole at its lower end, so two chunks never lay it twice.
        if (n.key > site.key) spans.push({ a: pole, b: standOf(n) });
      }
    }
  }
  const boxes = layCableBoxes(w, x0, z0);
  return boxes.length > 0 ? { poles, spans, boxes } : { poles, spans };
}

/** A junction box's body: along its door face, deep, and high, metres. */
export const JUNCTION_BOX_M = { width: 1.9, depth: 1.8, height: 1.15 } as const;
/** A pad-mounted transformer's body, the same. */
export const TRANSFORMER_M = { width: 1.0, depth: 0.9, height: 0.8 } as const;
/** A buried street carries a transformer every this many tiles. */
export const TRANSFORMER_SPACING_TILES = 4;
/** The clear ground a junction box's doors face, metres. */
export const BOX_DOOR_CLEARANCE_M = 3;
/** Between a box and the walk or the carriageway beside it, metres. */
const BOX_GAP_M = 0.3;

/** Whether a world point lies on a carriageway, a footway or a junction. */
function onRoad(w: PowerWorld, px: number, pz: number): boolean {
  const tx = worldToTile(px);
  const tz = worldToTile(pz);
  const tile = w.tileSet.get(tileKey(tx, tz));
  if (!tile) return false;
  if (hasCrossingRoad(w.tileSet, tx, tz)) return true;
  const across =
    lateralAxis(w.tileSet, tx, tz) === 'z' ? pz - tileToWorld(tz) : px - tileToWorld(tx);
  const profile = profileOf(tile);
  const reach = carriagewayHalfWidthOf(profile) + (hasKerbs(profile) ? kerbWidthOf(profile) : 0);
  return Math.abs(across) < reach;
}

/** The first of `facings` whose door zone is clear ground, or null: nothing of a road or another object in it. */
function clearFacing(
  w: PowerWorld,
  x: number,
  z: number,
  halfDepth: number,
  facings: readonly { x: number; z: number }[],
): { x: number; z: number } | null {
  for (const f of facings) {
    const clear = [1.5, BOX_DOOR_CLEARANCE_M].every((reach) => {
      const px = x + f.x * (halfDepth + reach);
      const pz = z + f.z * (halfDepth + reach);
      return !onRoad(w, px, pz) && (!w.roadside || w.roadside.taken.isFree(px, pz, 1));
    });
    if (clear) return f;
  }
  return null;
}

/** The four unit directions, a preferred one first. */
function facingsFrom(first: { x: number; z: number } | null): { x: number; z: number }[] {
  const all = DIRS.map((d) => ({ x: d.dx, z: d.dz }));
  if (!first) return all;
  return [first, ...all.filter((d) => !(d.x === first.x && d.z === first.z))];
}

/**
 * The junction box that dresses an end or a branch of a cable run, standing on
 * open ground at the tile's middle or, under a road, in the strip outside the
 * footway; null where no clear place or no clear doors are to be had.
 */
function junctionBoxAt(w: PowerWorld, tx: number, tz: number): CableBox | null {
  const half = JUNCTION_BOX_M.depth / 2;
  // Away from the run it ends: its doors open onto the ground it leaves behind.
  const next = DIRS.find((d) => cableAt(w, tx + d.dx, tz + d.dz));
  const away = next ? { x: -next.dx, z: -next.dz } : null;
  const own = boxOnTile(w, tx, tz, half, away);
  if (own) return own;
  // No room in the strip of its own tile: the box stands on the nearest free
  // open ground beside it, trying the neighbours north, east, south, west.
  for (const d of DIRS) {
    const nx = tx + d.dx;
    const nz = tz + d.dz;
    const key = tileKey(nx, nz);
    if (w.tileSet.has(key) || w.keepOff.has(key) || w.built?.has(key) || cableAt(w, nx, nz)) {
      continue;
    }
    const box = boxOnTile(w, nx, nz, half, away);
    if (box) return box;
  }
  return null;
}

/** A box on one tile: at its middle on open ground, or in the strip outside the footway under a road. */
function boxOnTile(
  w: PowerWorld,
  tx: number,
  tz: number,
  half: number,
  away: { x: number; z: number } | null,
): CableBox | null {
  const tile = w.tileSet.get(tileKey(tx, tz));
  const cx = tileToWorld(tx);
  const cz = tileToWorld(tz);
  if (!tile || tile.elevated === true) {
    for (const along of alongOffsets(SLIDE_LIMIT_M)) {
      const x = cx + along;
      if (w.roadside && !placeIsFree(w.roadside, x, cz)) continue;
      const facing = clearFacing(w, x, cz, half, facingsFrom(away));
      if (facing) return { kind: 'junction', x, z: cz, fx: facing.x, fz: facing.z };
    }
    return null;
  }
  const axis = lateralAxis(w.tileSet, tx, tz);
  const side = sideOf(w.tileSet, tx, tz, axis);
  if (side === null || hasCrossingRoad(w.tileSet, tx, tz)) return null;
  const profile = profileOf(tile);
  const offset =
    carriagewayHalfWidthOf(profile) +
    (hasKerbs(profile) ? kerbWidthOf(profile) : POLE_BEHIND_KERB_M) +
    BOX_GAP_M +
    JUNCTION_BOX_M.width / 2;
  if (offset + JUNCTION_BOX_M.width / 2 > TILE_METERS / 2) return null;
  const outward = axis === 'x' ? { x: side, z: 0 } : { x: 0, z: side };
  for (const along of alongOffsets(SLIDE_LIMIT_M)) {
    const x = cx + (axis === 'x' ? offset * side : along);
    const z = cz + (axis === 'z' ? offset * side : along);
    if (w.roadside && !placeIsFree(w.roadside, x, z)) continue;
    const facing = clearFacing(w, x, z, half, facingsFrom(outward));
    if (facing) return { kind: 'junction', x, z, fx: facing.x, fz: facing.z };
  }
  return null;
}

/** The pad-mounted transformer on a buried street tile, on the side the poles stood, or null. */
function transformerAt(w: PowerWorld, tx: number, tz: number): CableBox | null {
  if (
    (((tx + tz) % TRANSFORMER_SPACING_TILES) + TRANSFORMER_SPACING_TILES) %
      TRANSFORMER_SPACING_TILES !==
    0
  ) {
    return null;
  }
  const key = tileKey(tx, tz);
  const tile = w.tileSet.get(key);
  if (!tile || w.closed.has(key) || w.keepOff.has(key) || hasCrossingRoad(w.tileSet, tx, tz)) {
    return null;
  }
  const axis = lateralAxis(w.tileSet, tx, tz);
  const side = sideOf(w.tileSet, tx, tz, axis);
  if (side === null) return null;
  const profile = profileOf(tile);
  const offset =
    carriagewayHalfWidthOf(profile) +
    (hasKerbs(profile) ? kerbWidthOf(profile) : POLE_BEHIND_KERB_M) +
    BOX_GAP_M +
    TRANSFORMER_M.width / 2;
  if (offset + TRANSFORMER_M.width / 2 > TILE_METERS / 2) return null;
  const cx =
    tileToWorld(tx) +
    (axis === 'x' ? (offset + flankShift(w.tileSet, tile, { axis, side })) * side : 0);
  const cz =
    tileToWorld(tz) +
    (axis === 'z' ? (offset + flankShift(w.tileSet, tile, { axis, side })) * side : 0);
  const along = firstFreeAlong(
    (a) =>
      !w.roadside ||
      placeIsFree(w.roadside, axis === 'z' ? cx + a : cx, axis === 'z' ? cz : cz + a),
    SLIDE_LIMIT_M,
  );
  if (along === null) return null;
  // Its doors face the street, so a crew works from the kerb side.
  return {
    kind: 'transformer',
    x: axis === 'z' ? cx + along : cx,
    z: axis === 'z' ? cz : cz + along,
    fx: axis === 'x' ? -side : 0,
    fz: axis === 'z' ? -side : 0,
  };
}

/** Whether a cable's end at (x, z) rises to a line or a street's poles, and so needs no box. */
function risesBeside(w: PowerWorld, x: number, z: number): boolean {
  return DIRS.some((d) => {
    const nx = x + d.dx;
    const nz = z + d.dz;
    const key = tileKey(nx, nz);
    if (w.lines?.has(key)) return true;
    const tile = w.tileSet.get(key);
    return (
      tile !== undefined &&
      carriesStreetLine(tile) &&
      !isBuriedStreet(w, nx, nz) &&
      !w.closed.has(key) &&
      !w.keepOff.has(key) &&
      !hasCrossingRoad(w.tileSet, nx, nz)
    );
  });
}

/**
 * The boxes the cables show in one terrain chunk (its tiles start at x0, z0):
 * a junction box at each end and each branch of a run of loose cable that does
 * not rise to a line, and a transformer on every fourth tile of a buried street.
 */
function layCableBoxes(
  w: PowerWorld,
  x0: number,
  z0: number,
  span: number = CHUNK_TILES,
): CableBox[] {
  const out: CableBox[] = [];
  if (!w.cables || w.cables.size === 0) return out;
  const tiles: { x: number; z: number }[] = [];
  for (const key of w.cables) {
    const x = Math.floor(key / 100_000);
    const z = key % 100_000;
    if (x >= x0 && x < x0 + span && z >= z0 && z < z0 + span) tiles.push({ x, z });
  }
  tiles.sort((a, b) => tileKey(a.x, a.z) - tileKey(b.x, b.z));
  for (const { x, z } of tiles) {
    if (isBuriedStreet(w, x, z)) {
      const transformer = transformerAt(w, x, z);
      if (transformer) out.push(transformer);
      continue;
    }
    const around = cableNeighbours(w, x, z);
    if (around >= 2 && around < 3) continue;
    if (around <= 1 && risesBeside(w, x, z)) continue;
    const box = junctionBoxAt(w, x, z);
    if (box) out.push(box);
  }
  return out;
}

/**
 * Where the cable under a street tile lies across it: under the footway (or the
 * verge where there is no walk) on the side the poles stood, clear of the pipe
 * runs down the middle. Null where the tile is no straight street, so the
 * cable keeps the tile's centre.
 */
export function cablePlaceOf(w: PowerWorld, x: number, z: number): CablePlace | null {
  const tile = w.tileSet.get(tileKey(x, z));
  if (!tile || tile.elevated === true || hasCrossingRoad(w.tileSet, x, z)) return null;
  const axis = lateralAxis(w.tileSet, x, z);
  const side = sideOf(w.tileSet, x, z, axis);
  if (side === null) return null;
  const profile = profileOf(tile);
  const reach =
    carriagewayHalfWidthOf(profile) +
    (hasKerbs(profile) ? kerbWidthOf(profile) / 2 : POLE_BEHIND_KERB_M);
  if (reach + 0.3 > TILE_METERS / 2) return null;
  return { alongX: axis === 'z', offset: reach * side };
}

/** Every place a cable's boxes stand on the whole map: what the objects below them keep clear of. */
export function cableBoxSpots(w: PowerWorld): { x: number; z: number }[] {
  return layCableBoxes(w, 0, 0, Infinity).map((b) => ({ x: b.x, z: b.z }));
}

/**
 * Lays the line the player strung: tall poles on open ground, a roadside line
 * where it follows a gravel road, nothing on a tile a street, a railway or a
 * motorway already carries — the wires cross those tiles in one span.
 */
export function layStrungLine(w: PowerWorld, line: readonly TilePoint[]): PowerLay {
  const onLine = new Set<number>(line.map((t) => tileKey(t.x, t.z)));
  /** The pole a line tile takes, or null where a road already carries the line over it. */
  const baseSiteAt = (x: number, z: number): TileSite | null => {
    const tile = w.tileSet.get(tileKey(x, z));
    if (!tile) {
      // Where the line ends against a source, its pole stands at that edge.
      const source = isNode({ x, z })
        ? DIRS.find((d) => w.sources?.has(tileKey(x + d.dx, z + d.dz)))
        : undefined;
      const reach = TILE_METERS / 2 - SOURCE_POLE_SETBACK_M;
      return {
        key: tileKey(x, z),
        kind: 'country',
        tx: x,
        tz: z,
        x: tileToWorld(x) + (source ? source.dx * reach : 0),
        z: tileToWorld(z) + (source ? source.dz * reach : 0),
      };
    }
    if (
      tile.tier !== RoadTier.Gravel ||
      tile.elevated === true ||
      hasCrossingRoad(w.tileSet, x, z)
    ) {
      return null;
    }
    const axis = lateralAxis(w.tileSet, x, z);
    const side = sideOf(w.tileSet, x, z, axis);
    return side === null ? null : roadsideSite(w.tileSet, tile, axis, side, 'roadside');
  };
  /** The unit direction to a cable that meets the line on this tile, if one does. */
  const cableBeside = (x: number, z: number): { x: number; z: number } | null => {
    const d = DIRS.find((n) => looseCableAt(w, x + n.dx, z + n.dz));
    return d ? { x: d.dx, z: d.dz } : null;
  };
  /** The pole a line tile takes: where a cable meets the line it is the riser that carries it up. */
  const siteAt = (x: number, z: number): TileSite | null => {
    const site = baseSiteAt(x, z);
    const riser = site ? cableBeside(x, z) : null;
    return site && riser ? { ...site, riser } : site;
  };

  const degreeOf = (t: TilePoint): TilePoint[] =>
    DIRS.map((d) => ({ x: t.x + d.dx, z: t.z + d.dz })).filter((n) =>
      onLine.has(tileKey(n.x, n.z)),
    );
  /** A tile the line ends, branches or turns on: where a pole must stand. */
  const isNode = (t: TilePoint): boolean => {
    const around = degreeOf(t);
    if (around.length !== 2 || cableBeside(t.x, t.z) !== null) return true;
    const a = around[0]!;
    const b = around[1]!;
    return !(a.x - t.x === t.x - b.x && a.z - t.z === t.z - b.z);
  };

  const sites = new Map<number, TileSite>();
  const links = new Map<string, [number, number]>();
  const linkSites = (a: TileSite, b: TileSite): void => {
    if (a.key === b.key) return;
    const lo = Math.min(a.key, b.key);
    const hi = Math.max(a.key, b.key);
    links.set(`${lo}:${hi}`, [lo, hi]);
  };

  const seenEdges = new Set<string>();
  const edgeKey = (a: TilePoint, b: TilePoint): string => {
    const ka = tileKey(a.x, a.z);
    const kb = tileKey(b.x, b.z);
    return ka < kb ? `${ka}:${kb}` : `${kb}:${ka}`;
  };

  /** Poles along one path of line tiles between two nodes, joined in order. */
  const placeAlong = (path: readonly TilePoint[]): void => {
    const last = path.length - 1;
    const standing: TileSite[] = [];
    /** The lowest index a pole may take: one past the last pole laid. */
    let floor = 0;
    let at = 0;
    for (;;) {
      // A pole due on a tile that takes none stands on the tile beside it.
      const pick = [at, at - 1, at + 1].find(
        (i) => i >= floor && i <= last && siteAt(path[i]!.x, path[i]!.z) !== null,
      );
      let step: number = POLE_SPECS.country.spacingTiles;
      if (pick !== undefined) {
        const site = siteAt(path[pick]!.x, path[pick]!.z)!;
        standing.push(site);
        sites.set(site.key, site);
        floor = pick + 1;
        at = pick;
        step = POLE_SPECS[site.kind].spacingTiles;
      }
      if (at >= last) break;
      at = Math.min(last, at + step);
    }
    for (let i = 1; i < standing.length; i++) linkSites(standing[i - 1]!, standing[i]!);
  };

  const visited = new Set<number>();
  const trace = (start: TilePoint): void => {
    for (const first of degreeOf(start)) {
      if (seenEdges.has(edgeKey(start, first))) continue;
      const path: TilePoint[] = [start];
      let prev = start;
      let cur = first;
      seenEdges.add(edgeKey(prev, cur));
      for (;;) {
        path.push(cur);
        visited.add(tileKey(cur.x, cur.z));
        if (isNode(cur)) break;
        const next = degreeOf(cur).find((n) => !(n.x === prev.x && n.z === prev.z));
        if (!next || seenEdges.has(edgeKey(cur, next))) break;
        seenEdges.add(edgeKey(cur, next));
        prev = cur;
        cur = next;
      }
      placeAlong(path);
    }
  };

  for (const t of line) {
    if (!isNode(t)) continue;
    visited.add(tileKey(t.x, t.z));
    if (degreeOf(t).length === 0) {
      const site = siteAt(t.x, t.z);
      if (site) sites.set(site.key, site);
    } else {
      trace(t);
    }
  }
  // A closed loop has no node to start from: begin it anywhere.
  for (const t of line) {
    if (!visited.has(tileKey(t.x, t.z))) {
      visited.add(tileKey(t.x, t.z));
      trace(t);
    }
  }

  const ordered = [...sites.values()].sort((a, b) => a.key - b.key);
  const index = new Map(ordered.map((s, i) => [s.key, i]));
  const joined: [number, number][] = [];
  for (const [a, b] of links.values()) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia !== undefined && ib !== undefined) joined.push([ia, ib]);
  }
  return layFromLinks(ordered, joined);
}

/**
 * The chunks whose poles or spans a change at tile (x, z) can alter: the one
 * holding it, and a neighbour only when the tile lies within a span's reach of
 * its edge.
 */
export function chunksAroundTile(x: number, z: number): number[] {
  const chunkOf = (t: number): number =>
    Math.min(CHUNKS_PER_SIDE - 1, Math.max(0, Math.floor(t / CHUNK_TILES)));
  const keys: number[] = [];
  for (let cz = chunkOf(z - MAX_SPAN_TILES); cz <= chunkOf(z + MAX_SPAN_TILES); cz++) {
    for (let cx = chunkOf(x - MAX_SPAN_TILES); cx <= chunkOf(x + MAX_SPAN_TILES); cx++) {
      keys.push(cz * CHUNKS_PER_SIDE + cx);
    }
  }
  return keys;
}

/** Where the points of one wire between two poles hang, from the arm of one to the arm of the other. */
export function wirePoints(
  a: PoleStand,
  b: PoleStand,
  which: -1 | 0 | 1,
  ground: (x: number, z: number) => number,
): { x: number; y: number; z: number }[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const acrossX = -dz / length;
  const acrossZ = dx / length;
  /** Where a wire meets a pole's arm, on the side of it that faces the span's own across. */
  const attach = (p: PoleStand): { x: number; y: number; z: number } => {
    const sign = p.armX * acrossX + p.armZ * acrossZ >= 0 ? 1 : -1;
    const along = which * p.spread * sign;
    const x = p.x + p.armX * along;
    const z = p.z + p.armZ * along;
    return { x, y: ground(p.x, p.z) + p.arm, z };
  };
  const from = attach(a);
  const to = attach(b);
  const sag = wireSagM(length);
  const segments = Math.max(4, Math.ceil(length / 8));
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    out.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - sag * 4 * t * (1 - t),
      z: from.z + (to.z - from.z) * t,
    });
  }
  return out;
}
