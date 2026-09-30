/**
 * Interchanges: a street carried over a motorway on a bridge, and the slip
 * roads that join the two, laid out from where the player points.
 *
 * Every piece is an ordinary road the player could have drawn. The layout only
 * decides where each one goes so that it obeys the rules already in force: a
 * ramp runs beside the motorway the way it flows, joining it at its start for
 * an exit and its end for an entrance; it is laid on the ground; and it meets
 * the street where the street has come back down to the ground.
 *
 * Each carriageway is laid out in its own frame. `u` counts columns outward on
 * the driver's right, 0 being the column beside the carriageway, and `v` runs
 * along it, positive downstream, 0 being the street's row. The ramps of every
 * carriageway are the same corner lists read in that frame, which is what puts
 * a two-carriageway motorway's second half turned half round from the first.
 *
 * Pure: tiles and readers, no grid and no scene.
 */
import { BRIDGE_MAX_GRADE, ROAD_ELEVATION_STEP_M } from './constants';
import { overpassRise } from './overpass';
import { RoadFlow, RoadTier, stepForFlow } from './types';
import type { Command, TilePoint } from './types';

export type InterchangeForm = 'diamond' | 'parclo' | 'cloverleaf';

/** How far before the bridge an exit leaves the motorway, and after it an entrance joins. */
export const RAMP_REACH_TILES = 8;
/** A loop runs round a block this many tiles deep, about 40 m in radius. */
const LOOP_DEPTH_TILES = 4;
/** An outer ramp turns away this far from the street, clear of the loop inside it. */
const OUTER_DEPTH_TILES = 6;
/** A diamond ramp turns away this far from the street. */
const DIAMOND_DEPTH_TILES = 2;
/** How far the street runs on past the last junction on each side. */
const STREET_RUN_ON_TILES = 2;
/**
 * How many columns further out than on flat ground the street may take to
 * come down where the ground falls away from the motorway. Past that the
 * interchange is refused, and the player can level the ground.
 */
const FALLING_GROUND_TILES = 4;

/** One carriageway at the street's row: its tiles across the road, and the way it runs. */
export interface Carriageway {
  flow: RoadFlow;
  /** Its tiles on the street's row, from the driver's left to their right. */
  tiles: TilePoint[];
}

/** The motorway where the interchange is to go. */
export interface InterchangeSite {
  /** The tile the street crosses the motorway's axis through. */
  at: TilePoint;
  /** Whether the motorway runs north-south. */
  vertical: boolean;
  /** One carriageway, or two running opposite ways with their outer sides outward. */
  carriageways: Carriageway[];
}

export interface InterchangeRamp {
  /** In the order it is driven. */
  tiles: TilePoint[];
  exit: boolean;
  loop: boolean;
}

export interface InterchangeLayout {
  /** The crossing street, from one end to the other, with each tile's lift above its ground. */
  street: { tiles: TilePoint[]; elevations: number[] };
  ramps: InterchangeRamp[];
  /** The street's deck over the motorway, metres. */
  deck: number;
}

/** What the layout needs to know about the grid. */
export interface InterchangeGround {
  /** The direction of a motorway carriageway on the ground here, or None. */
  motorwayFlowAt(x: number, z: number): RoadFlow;
  /** The neighbour mask of the road on the ground here, 0 where there is none. */
  maskAt(x: number, z: number): number;
  /** Whether any road stands here, on either layer. */
  roadAt(x: number, z: number): boolean;
  /** Whether a road passes over here. */
  overRoadAt(x: number, z: number): boolean;
  /** Whether a road could be laid here: dry, not too steep, no building. */
  buildableAt(x: number, z: number): boolean;
  /** The ground's height at a tile, metres. */
  heightAt(x: number, z: number): number;
}

/** The way to a driver's right, heading `flow`. */
function rightOf(flow: RoadFlow): { dx: number; dz: number } {
  const { dx, dz } = stepForFlow(flow);
  return { dx: -dz, dz: dx };
}

const alongZ = (flow: RoadFlow): boolean => flow === RoadFlow.North || flow === RoadFlow.South;

/**
 * The motorway at `at`, or why an interchange cannot go there: the tile has to
 * be a motorway, and the carriageways across it on that row are one, or two
 * running opposite ways with each one's outer side, its driver's right, facing
 * away from the other.
 */
export function readInterchangeSite(
  at: TilePoint,
  ground: InterchangeGround,
): InterchangeSite | { refusal: string } {
  const flow = ground.motorwayFlowAt(at.x, at.z);
  if (flow === RoadFlow.None) return { refusal: 'An interchange goes on a motorway' };
  const vertical = alongZ(flow);
  const across = vertical ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
  const onAxis = (x: number, z: number): RoadFlow => {
    const f = ground.motorwayFlowAt(x, z);
    return f !== RoadFlow.None && alongZ(f) === vertical ? f : RoadFlow.None;
  };
  let lo = { ...at };
  while (onAxis(lo.x - across.dx, lo.z - across.dz) !== RoadFlow.None) {
    lo = { x: lo.x - across.dx, z: lo.z - across.dz };
  }
  const row: Array<{ t: TilePoint; flow: RoadFlow }> = [];
  for (
    let t = lo;
    onAxis(t.x, t.z) !== RoadFlow.None;
    t = { x: t.x + across.dx, z: t.z + across.dz }
  ) {
    row.push({ t, flow: onAxis(t.x, t.z) });
  }
  const groups: Array<{ flow: RoadFlow; tiles: TilePoint[] }> = [];
  for (const { t, flow: f } of row) {
    const last = groups[groups.length - 1];
    if (last && last.flow === f) last.tiles.push(t);
    else groups.push({ flow: f, tiles: [t] });
  }
  const leftToRight = (g: { flow: RoadFlow; tiles: TilePoint[] }): TilePoint[] => {
    // Low to high across is left to right when the driver's right points high.
    const r = rightOf(g.flow);
    return r.dx + r.dz > 0 ? g.tiles : [...g.tiles].reverse();
  };
  if (groups.length === 1) {
    return { at, vertical, carriageways: [{ flow, tiles: leftToRight(groups[0]!) }] };
  }
  if (groups.length === 2) {
    const [low, high] = groups as [(typeof groups)[0], (typeof groups)[0]];
    const lowRight = rightOf(low.flow);
    // The low carriageway's outer side is low, the high one's high.
    if (lowRight.dx + lowRight.dz < 0) {
      return {
        at,
        vertical,
        carriageways: [
          { flow: low.flow, tiles: leftToRight(low) },
          { flow: high.flow, tiles: leftToRight(high) },
        ],
      };
    }
    return {
      refusal: 'The carriageways run on each other’s left, so their ramps would have nowhere to go',
    };
  }
  return { refusal: 'An interchange needs a motorway of one or two carriageways' };
}

/** The deck a street of `streetTier` stands at over a motorway: its clearance, in the elevation control's steps. */
export function interchangeDeck(streetTier: RoadTier): number {
  const rise = overpassRise(streetTier, RoadTier.Highway);
  return Math.ceil(rise / ROAD_ELEVATION_STEP_M) * ROAD_ELEVATION_STEP_M;
}

type Corner = readonly [number, number];

/** The ramps on one carriageway's side, as corner lists in its (u, v) frame. `g` is the first column at grade. */
function sideRamps(
  form: InterchangeForm,
  g: number,
): Array<{ corners: Corner[]; exit: boolean; loop: boolean }> {
  const reach = RAMP_REACH_TILES;
  const diamondOff = {
    corners: [
      [0, -reach],
      [0, -DIAMOND_DEPTH_TILES],
      [g, -DIAMOND_DEPTH_TILES],
      [g, -1],
    ] as Corner[],
    exit: true,
    loop: false,
  };
  const diamondOn = {
    corners: [
      [g, 1],
      [g, DIAMOND_DEPTH_TILES],
      [0, DIAMOND_DEPTH_TILES],
      [0, reach],
    ] as Corner[],
    exit: false,
    loop: false,
  };
  const loopOn = {
    corners: [
      [g + 1, -1],
      [g + 1, -LOOP_DEPTH_TILES],
      [0, -LOOP_DEPTH_TILES],
      [0, -1],
    ] as Corner[],
    exit: false,
    loop: true,
  };
  const outerOff = {
    corners: [
      [0, -reach],
      [0, -OUTER_DEPTH_TILES],
      [g + 3, -OUTER_DEPTH_TILES],
      [g + 3, -1],
    ] as Corner[],
    exit: true,
    loop: false,
  };
  const loopOff = {
    corners: [
      [0, 1],
      [0, LOOP_DEPTH_TILES],
      [g + 1, LOOP_DEPTH_TILES],
      [g + 1, 1],
    ] as Corner[],
    exit: true,
    loop: true,
  };
  const outerOn = {
    corners: [
      [g + 3, 1],
      [g + 3, OUTER_DEPTH_TILES],
      [0, OUTER_DEPTH_TILES],
      [0, reach],
    ] as Corner[],
    exit: false,
    loop: false,
  };
  switch (form) {
    case 'diamond':
      return [diamondOff, diamondOn];
    case 'parclo':
      return [outerOff, loopOn, diamondOn];
    case 'cloverleaf':
      return [outerOff, loopOn, loopOff, outerOn];
  }
}

/** How far out from the carriageway the street runs on its ramp side, in the (u, v) frame. */
function streetReach(form: InterchangeForm, g: number): number {
  return (form === 'diamond' ? g : g + 3) + STREET_RUN_ON_TILES;
}

/** Every tile from `a` to `b` along one axis, both included. */
function straight(a: TilePoint, b: TilePoint): TilePoint[] {
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  const out = [{ ...a }];
  for (let p = a; p.x !== b.x || p.z !== b.z;) {
    p = { x: p.x + dx, z: p.z + dz };
    out.push(p);
  }
  return out;
}

/**
 * The interchange of `form` at `site`, with a crossing road of `streetTier`,
 * on ground whose height at a tile is `heightAt`. The street's deck is laid out
 * in height above sea level, not above each tile, so a bridge across uneven
 * ground stays one road: a grade step a tile from the motorway down to where
 * it meets the ground.
 */
export function interchangeLayout(
  form: InterchangeForm,
  site: InterchangeSite,
  streetTier: RoadTier,
  heightAt: (x: number, z: number) => number = () => 0,
): InterchangeLayout {
  const deck = interchangeDeck(streetTier);
  // The first column out from a carriageway where the street would be back on
  // flat ground; ground falling away moves it further out.
  const flatGrade = deck / BRIDGE_MAX_GRADE - 1;
  const across = site.vertical ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
  const acrossOf = (t: TilePoint): number => t.x * across.dx + t.z * across.dz;
  const at = (k: number): TilePoint =>
    site.vertical ? { x: k, z: site.at.z } : { x: site.at.x, z: k };
  const ground = (k: number): number => {
    const t = at(k);
    return heightAt(t.x, t.z);
  };
  const all = site.carriageways.flatMap((c) => c.tiles);
  const low = Math.min(...all.map(acrossOf));
  const high = Math.max(...all.map(acrossOf));

  // The street's surface above sea level: over the motorway it clears the
  // highest carriageway tile, and out from it it comes down a grade step a
  // tile until it meets the ground, as far out as any layout could reach.
  const farthest = flatGrade + FALLING_GROUND_TILES + streetReach(form, 0);
  let top = -Infinity;
  for (let k = low; k <= high; k++) top = Math.max(top, ground(k) + deck);
  const surface = new Map<number, number>();
  for (let k = low; k <= high; k++) surface.set(k, top);
  for (let k = low - 1; k >= low - 1 - farthest; k--) {
    surface.set(k, Math.max(ground(k), surface.get(k + 1)! - BRIDGE_MAX_GRADE));
  }
  for (let k = high + 1; k <= high + 1 + farthest; k++) {
    surface.set(k, Math.max(ground(k), surface.get(k - 1)! - BRIDGE_MAX_GRADE));
  }
  // Each side's first column at grade, `u` out from its carriageway.
  const onGround = (k: number): boolean => surface.get(k)! - ground(k) <= 1e-9;
  const gradeAt = (column: (u: number) => number): number => {
    for (let u = flatGrade; u < flatGrade + FALLING_GROUND_TILES; u++) {
      if (onGround(column(u))) return u;
    }
    return flatGrade + FALLING_GROUND_TILES;
  };
  const gLow = gradeAt((u) => low - 1 - u);
  const gHigh = gradeAt((u) => high + 1 + u);
  const facesLow = (c: Carriageway): boolean => rightOf(c.flow).dx + rightOf(c.flow).dz < 0;

  const ramps: InterchangeRamp[] = [];
  for (const c of site.carriageways) {
    const out = rightOf(c.flow);
    const down = stepForFlow(c.flow);
    const edge = c.tiles[c.tiles.length - 1]!;
    const world = ([u, v]: Corner): TilePoint => ({
      x: edge.x + out.dx * (u + 1) + down.dx * v,
      z: edge.z + out.dz * (u + 1) + down.dz * v,
    });
    for (const ramp of sideRamps(form, facesLow(c) ? gLow : gHigh)) {
      const tiles: TilePoint[] = [];
      ramp.corners.forEach((corner, i) => {
        if (i === 0) return;
        const leg = straight(world(ramp.corners[i - 1]!), world(corner));
        tiles.push(...(i === 1 ? leg : leg.slice(1)));
      });
      ramps.push({ tiles, exit: ramp.exit, loop: ramp.loop });
    }
  }

  // The street runs on past the junctions on each side, or on the side with no
  // carriageway's ramps, past where it meets the ground.
  const rampsLow = site.carriageways.some(facesLow);
  const rampsHigh = site.carriageways.some((c) => !facesLow(c));
  const reachLow = rampsLow ? streetReach(form, gLow) : gLow + STREET_RUN_ON_TILES;
  const reachHigh = rampsHigh ? streetReach(form, gHigh) : gHigh + STREET_RUN_ON_TILES;
  const tiles: TilePoint[] = [];
  const elevations: number[] = [];
  for (let k = low - 1 - reachLow; k <= high + 1 + reachHigh; k++) {
    tiles.push(at(k));
    elevations.push(surface.get(k)! - ground(k));
  }
  return { street: { tiles, elevations }, ramps, deck };
}

/** How far over one grade step two decks may differ and still join, as the world reads it. */
const GRADE_TOLERANCE_M = 0.001;

/**
 * Why the ground under `layout` would break it, or null. The street has to be
 * back on the ground where every ramp meets it; each tile of its bridge within
 * a grade step of the next, or they are two roads; and no ramp may pass the
 * street anywhere but its end at a height they would join at.
 */
function groundRefusal(layout: InterchangeLayout, ground: InterchangeGround): string | null {
  const key = (t: TilePoint): string => `${t.x},${t.z}`;
  const { tiles, elevations } = layout.street;
  const surface = new Map(
    tiles.map((t, i) => [
      key(t),
      { lift: elevations[i]!, y: ground.heightAt(t.x, t.z) + elevations[i]! },
    ]),
  );
  for (let i = 1; i < tiles.length; i++) {
    const a = surface.get(key(tiles[i - 1]!))!;
    const b = surface.get(key(tiles[i]!))!;
    if ((a.lift > 0 || b.lift > 0) && Math.abs(a.y - b.y) > BRIDGE_MAX_GRADE + GRADE_TOLERANCE_M) {
      return 'The ground is too steep for the street’s bridge';
    }
  }
  for (const ramp of layout.ramps) {
    // The end that meets the street: an exit's last tile, an entrance's first.
    const end = ramp.exit ? ramp.tiles.length - 1 : 0;
    for (let i = 0; i < ramp.tiles.length; i++) {
      const t = ramp.tiles[i]!;
      const y = ground.heightAt(t.x, t.z);
      for (const [dx, dz] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const) {
        const s = surface.get(key({ x: t.x + dx, z: t.z + dz }));
        if (!s) continue;
        const joins =
          s.lift <= GRADE_TOLERANCE_M || Math.abs(s.y - y) <= BRIDGE_MAX_GRADE + GRADE_TOLERANCE_M;
        if (i === end && s.lift > GRADE_TOLERANCE_M) {
          return 'The ground falls away too steeply for the street to come down to its junctions';
        }
        if (i !== end && joins)
          return 'The ground brings a ramp too close under the street, where it would join it';
      }
    }
  }
  return null;
}

/**
 * The commands that lay `layout`, as one batch: the street first, so the ramps
 * find it to meet, then every ramp. Each is laid at the heights the layout
 * gives it, never solved: a ramp left to find its own profile climbs to meet
 * the street's approach beside its end and joins the bridge instead of the
 * motorway.
 */
export function interchangeCommands(layout: InterchangeLayout, streetTier: RoadTier): Command[] {
  return [
    {
      kind: 'buildRoad',
      tier: streetTier,
      tiles: layout.street.tiles,
      elevations: layout.street.elevations,
    },
    ...layout.ramps.map((ramp): Command => ({
      kind: 'buildRoad',
      tier: RoadTier.Ramp,
      tiles: ramp.tiles,
      elevations: ramp.tiles.map(() => 0),
    })),
  ];
}

/** Where along each carriageway the motorway has to run plain and straight for the ramps to join it. */
function motorwayReach(site: InterchangeSite): TilePoint[] {
  const out: TilePoint[] = [];
  for (const c of site.carriageways) {
    const down = stepForFlow(c.flow);
    for (const t of c.tiles) {
      for (let v = -RAMP_REACH_TILES - 1; v <= RAMP_REACH_TILES + 1; v++) {
        out.push({ x: t.x + down.dx * v, z: t.z + down.dz * v });
      }
    }
  }
  return out;
}

/**
 * Why `layout` cannot be laid at `site`, or null. The motorway has to run on
 * straight and plain the whole length its ramps join it over, and every tile
 * the interchange takes has to be free: no road, no building, no water, no
 * ground too steep. No road outside it may touch a ramp, which would join it;
 * only the street's two ends may meet a road already there.
 */
export function interchangeRefusal(
  site: InterchangeSite,
  layout: InterchangeLayout,
  ground: InterchangeGround,
): string | null {
  const key = (t: TilePoint): string => `${t.x},${t.z}`;
  const straightBits = site.vertical ? 0b0101 : 0b1010;
  const flows = new Map<string, RoadFlow>();
  for (const c of site.carriageways) {
    const down = stepForFlow(c.flow);
    for (const t of c.tiles) {
      for (let v = -RAMP_REACH_TILES - 1; v <= RAMP_REACH_TILES + 1; v++) {
        flows.set(key({ x: t.x + down.dx * v, z: t.z + down.dz * v }), c.flow);
      }
    }
  }
  for (const t of motorwayReach(site)) {
    if (ground.motorwayFlowAt(t.x, t.z) !== flows.get(key(t))) {
      return `The motorway has to run straight for ${RAMP_REACH_TILES + 1} tiles either side`;
    }
    const mask = ground.maskAt(t.x, t.z);
    if ((mask & ~straightBits) !== 0 || ground.overRoadAt(t.x, t.z)) {
      return 'The motorway already has a ramp, a junction or a bridge there';
    }
  }
  const motorway = new Set(motorwayReach(site).map(key));
  const street = layout.street.tiles;
  const ends = new Set([key(street[0]!), key(street[street.length - 1]!)]);
  const taken = new Set([...street, ...layout.ramps.flatMap((r) => r.tiles)].map(key));
  for (const t of [...street, ...layout.ramps.flatMap((r) => r.tiles)]) {
    if (motorway.has(key(t))) continue;
    if (ground.roadAt(t.x, t.z)) return 'Another road is in the way';
    if (!ground.buildableAt(t.x, t.z)) return 'A building, water or steep ground is in the way';
  }
  // A road outside the interchange beside a ramp or the street would join it.
  for (const t of [...street, ...layout.ramps.flatMap((r) => r.tiles)]) {
    if (motorway.has(key(t)) || ends.has(key(t))) continue;
    for (const [dx, dz] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const n = { x: t.x + dx, z: t.z + dz };
      if (taken.has(key(n)) || motorway.has(key(n))) continue;
      if (ground.roadAt(n.x, n.z))
        return 'Another road touches the interchange where it would join it';
    }
  }
  return groundRefusal(layout, ground);
}
