import { describe, expect, it } from 'vitest';
import { TILE_METERS, tileIndex } from '../shared/constants';
import { toLocal, toWorld } from '../shared/lotframe';
import { kerbLine, tightestRadiusM } from '../shared/roadgeom';
import { presetProfileForTier } from '../shared/roadprofile';
import { FieldId, RoadTier, ZoneType, type FramedParcel, type GridState } from '../shared/types';
import { deriveRoadFootprint, halfWidthOf } from './freeroads';
import { createGrid, setZones } from './grid';
import { lotsOfZone, warrantedLot } from '../shared/lots';
import {
  MAX_RUN_BEND_RAD,
  MIN_KERB_FRONTAGE_M,
  kerbChordM,
  platOf,
  platSourceOf,
  runsAlongKerbs,
  type Plat,
} from './plat';
import {
  addNode,
  addSegment,
  buildRoadCells,
  createRoadNetwork,
  encodeRoadNetwork,
  segmentGeom,
} from './roadnet';
import { ClientGridMirror } from '../app/clientgrid';
import { MAP_SIZE } from '../shared/constants';
import type { MapData, RoadNet, TilePoint } from '../shared/types';

const cm = (metres: number): number => Math.round(metres * 100);
const HALF = halfWidthOf(presetProfileForTier(RoadTier.TwoLane));
const CLEARANCE = HALF + 6;

interface Pt {
  x: number;
  z: number;
}

/** A grid zoned ResLow over a block of tiles at `value`, with one free road laid from a to b. */
function world(
  a: Pt,
  b: Pt,
  control: Pt | null,
  zoned: { x0: number; z0: number; w: number; d: number },
  value = 119,
): { g: GridState; seg: number } {
  const g = createGrid();
  g.fields[FieldId.LandValue]!.fill(value);
  for (let z = zoned.z0; z < zoned.z0 + zoned.d; z++) {
    for (let x = zoned.x0; x < zoned.x0 + zoned.w; x++) g.zone[tileIndex(x, z)] = ZoneType.ResLow;
  }
  const net = createRoadNetwork();
  const facts = { tier: RoadTier.TwoLane, profile: RoadTier.TwoLane, flow: 0 };
  const na = addNode(net, { ...facts, x: cm(a.x), z: cm(a.z), height: 0 });
  const nb = addNode(net, { ...facts, x: cm(b.x), z: cm(b.z), height: 0 });
  const seg = addSegment(net, {
    ...facts,
    a: na,
    b: nb,
    h0: 0,
    h1: 0,
    control: control === null ? null : { x: cm(control.x), z: cm(control.z) },
  });
  g.roads = net;
  deriveRoadFootprint(g, net, () => null);
  return { g, seg };
}

const platFor = (g: GridState, zone: ZoneType = ZoneType.ResLow): Plat =>
  platOf(platSourceOf(g, null, g.fields[FieldId.LandValue]), zone);

/** The parcels on each kerb of the one segment, in the order they were cut. */
function bySide(g: GridState, plat: Plat, seg: number): Record<1 | -1, FramedParcel[]> {
  const geom = segmentGeom(g.roads!, seg);
  const kerbs = { 1: kerbLine(geom, 1, HALF), [-1]: kerbLine(geom, -1, HALF) };
  const out: Record<1 | -1, FramedParcel[]> = { 1: [], [-1]: [] };
  for (const p of plat.framed) {
    const origin = toWorld(p.frame, 0, 0);
    const near = (side: 1 | -1): number =>
      Math.min(...kerbs[side].map((k) => Math.hypot(k.x - origin.x, k.z - origin.z)));
    out[near(1) <= near(-1) ? 1 : -1].push(p);
  }
  return out;
}

/** Whether any point of one parcel's rectangle, on a metre lattice, lies inside another's. */
function rectanglesOverlap(p: FramedParcel, q: FramedParcel): boolean {
  for (let u = 0.5; u < p.w; u += 1) {
    for (let v = 0.5; v < p.d; v += 1) {
      const w = toWorld(p.frame, u, v);
      const l = toLocal(q.frame, w.x, w.z);
      if (l.u > 0 && l.u < q.w && l.v > 0 && l.v < q.d) return true;
    }
  }
  return false;
}

const tileKeys = (p: FramedParcel): string[] => p.tiles.map((t) => `${t.x},${t.z}`);

describe('the plat along the kerbs of a straight road at 30 degrees', () => {
  const a = { x: 60, z: 160 };
  const length = 200;
  const b = { x: a.x + length * Math.cos(Math.PI / 6), z: a.z + length * Math.sin(Math.PI / 6) };
  const { g, seg } = world(a, b, null, { x0: 0, z0: 0, w: 20, d: 20 });
  const plat = platFor(g);
  const sides = bySide(g, plat, seg);
  // The road as laid, its far node rounded to the centimetre.
  const geom = segmentGeom(g.roads!, seg);
  const run = Math.hypot(geom.b.x - geom.a.x, geom.b.z - geom.a.z) / 100;
  const dir = { x: (geom.b.x - geom.a.x) / 100 / run, z: (geom.b.z - geom.a.z) / 100 / run };
  const bearing = Math.atan2(dir.z, dir.x);

  it('cuts normal lots end to end along both kerbs, each turned to the road', () => {
    // A tile belongs to the parcel its centre lies in, so rectangles that
    // only touch never share one and the lots stand end to end.
    const most = Math.floor((length - 2 * CLEARANCE) / TILE_METERS);
    for (const side of [1, -1] as const) {
      expect(sides[side].length).toBeGreaterThanOrEqual(7);
      expect(sides[side].length).toBeLessThanOrEqual(most);
    }
    for (const p of plat.framed) {
      expect(p.lot).toBe('normal');
      expect(p).toMatchObject({ w: 20, d: 40 });
    }
    for (const p of sides[1]) expect(p.frame.heading).toBeCloseTo(bearing, 9);
    for (const p of sides[-1]) expect(p.frame.heading).toBeCloseTo(bearing + Math.PI, 9);
  });

  it('stands every lot on its own side of the road, with v running away from it', () => {
    const offside = (p: Pt): number => (p.x - a.x) * -dir.z + (p.z - a.z) * dir.x;
    for (const p of sides[1]) {
      expect(offside(toWorld(p.frame, 0, 0))).toBeCloseTo(HALF, 6);
      expect(offside(toWorld(p.frame, 0, 1))).toBeCloseTo(HALF + 1, 6);
    }
    for (const p of sides[-1]) {
      expect(offside(toWorld(p.frame, 0, 0))).toBeCloseTo(-HALF, 6);
      expect(offside(toWorld(p.frame, 0, 1))).toBeCloseTo(-HALF - 1, 6);
    }
  });

  it('begins each kerb a drive clearance past the junction and spaces lots by at least their width', () => {
    const along = (p: Pt): number => (p.x - a.x) * dir.x + (p.z - a.z) * dir.z;
    const starts = sides[1].map((p) => along(toWorld(p.frame, 0, 0)));
    expect(starts[0]).toBeCloseTo(CLEARANCE, 6);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(20 - 1e-6);
    }
    // On the right kerb the frame's origin is the frontage's far end.
    const ends = sides[-1].map((p) => along(toWorld(p.frame, 0, 0)));
    expect(Math.min(...ends)).toBeGreaterThanOrEqual(CLEARANCE + 20 - 1e-6);
    expect(Math.max(...starts) + 20).toBeLessThanOrEqual(run - CLEARANCE + 1e-6);
    expect(Math.max(...ends)).toBeLessThanOrEqual(run - CLEARANCE + 1e-6);
  });

  it('claims no tile twice and indexes every framed parcel past the grid parcels', () => {
    const seen = new Set<string>();
    plat.framed.forEach((p, n) => {
      for (const k of tileKeys(p)) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      for (const t of p.tiles) expect(plat.parcelAt[tileIndex(t.x, t.z)]).toBe(plat.parcels.length + n);
    });
    expect(plat.parcels).toHaveLength(0);
  });

  it('steps over a parcel a building stands in and moves no other parcel', () => {
    const built = plat.framed[1]!;
    const lived = createGrid();
    lived.zone.set(g.zone);
    lived.roads = g.roads;
    lived.fields[FieldId.LandValue]!.set(g.fields[FieldId.LandValue]!);
    for (const t of built.tiles) lived.buildingId[tileIndex(t.x, t.z)] = 7;
    const after = platFor(lived);
    expect(after.framed).toHaveLength(plat.framed.length - 1);
    expect(after.framed).toEqual(plat.framed.filter((p) => p !== built));
    for (const t of built.tiles) expect(after.parcelAt[tileIndex(t.x, t.z)]).toBe(-1);
  });

  it('claims only zoned ground clear of the road, and reaches the ground beside the curve', () => {
    for (const p of plat.framed) {
      for (const t of p.tiles) {
        const i = tileIndex(t.x, t.z);
        expect(g.zone[i]).toBe(ZoneType.ResLow);
        expect(g.roadTier[i]).toBe(RoadTier.None);
        expect(plat.reached[i]).toBe(1);
      }
    }
  });
});

describe('the plat along the kerbs of a bend', () => {
  // A quarter turn to the left whose tightest radius is 40 m: the inner kerb
  // is the left one and the outer the right.
  const r = 40 / (Math.SQRT2 / 2);
  const a = { x: 100, z: 100 };
  const control = { x: a.x + r, z: a.z };
  const b = { x: a.x + r, z: a.z + r };
  // Poor land, so the ladder cuts cottage lots and the short arc holds several.
  const { g, seg } = world(a, b, control, { x0: 0, z0: 0, w: 20, d: 20 }, 10);
  const plat = platFor(g);
  const sides = bySide(g, plat, seg);
  const geom = segmentGeom(g.roads!, seg);

  it('bends at 40 m', () => {
    expect(tightestRadiusM(geom)).toBeCloseTo(40, 0);
  });

  it('keeps every chord on the outer kerb at least the frontage floor', () => {
    const kerb = kerbLine(geom, -1, HALF);
    expect(sides[-1].length).toBeGreaterThan(2);
    for (const p of sides[-1]) {
      expect(kerbChordM(kerb, p.frame, p.w)).toBeGreaterThanOrEqual(MIN_KERB_FRONTAGE_M);
    }
  });

  it('never overlaps two rectangles on the inner kerb, and leaves the gap at the kerb as verge', () => {
    // A gentler, longer turn, so the inner kerb holds more than one lot.
    const wide = 80 / (Math.SQRT2 / 2);
    const bend = world(
      a,
      { x: a.x + wide, z: a.z + wide },
      { x: a.x + wide, z: a.z },
      { x0: 0, z0: 0, w: 20, d: 20 },
      10,
    );
    const wideGeom = segmentGeom(bend.g.roads!, bend.seg);
    const inner = bySide(bend.g, platFor(bend.g), bend.seg)[1];
    expect(inner.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < inner.length; i++) {
      for (let j = i + 1; j < inner.length; j++) {
        expect(rectanglesOverlap(inner[i]!, inner[j]!)).toBe(false);
        expect(rectanglesOverlap(inner[j]!, inner[i]!)).toBe(false);
      }
    }
    const kerb = kerbLine(wideGeom, 1, HALF);
    const sAt = (p: Pt): number => {
      let best = kerb[0]!;
      for (const k of kerb) if (Math.hypot(k.x - p.x, k.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)) best = k;
      return best.s;
    };
    const gaps: number[] = [];
    for (let i = 1; i < inner.length; i++) {
      const prevEnd = sAt(toWorld(inner[i - 1]!.frame, inner[i - 1]!.w, 0));
      const start = sAt(toWorld(inner[i]!.frame, 0, 0));
      gaps.push(start - prevEnd);
    }
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...gaps)).toBeGreaterThan(0);
  });

  it('cuts nothing within the drive clearance of either node', () => {
    const nodes = [a, b];
    for (const p of plat.framed) {
      for (const n of nodes) {
        const nearest = Math.min(
          ...[toWorld(p.frame, 0, 0), toWorld(p.frame, p.w, 0)].map((c) =>
            Math.hypot(c.x - n.x, c.z - n.z),
          ),
        );
        expect(nearest).toBeGreaterThanOrEqual(CLEARANCE - 1e-6);
      }
    }
  });
});

describe('the plat along a kerb beside a grid street', () => {
  // A grid street along z = 4 plats the block below it first; the free road
  // runs through that block's reach and takes only what the grid left.
  const a = { x: 60, z: 160 };
  const b = { x: a.x + 200 * Math.cos(Math.PI / 6), z: a.z + 200 * Math.sin(Math.PI / 6) };
  const { g } = world(a, b, null, { x0: 0, z0: 5, w: 20, d: 15 });
  for (let x = 0; x < 20; x++) g.roadTier[tileIndex(x, 4)] = RoadTier.TwoLane;
  const plat = platFor(g);

  it('never claims a tile the grid plat holds', () => {
    expect(plat.parcels.length).toBeGreaterThan(0);
    expect(plat.framed.length).toBeGreaterThan(0);
    const grid = new Set<string>();
    for (const p of plat.parcels) {
      for (let dz = 0; dz < p.d; dz++) {
        for (let dx = 0; dx < p.w; dx++) grid.add(`${p.x + dx},${p.z + dz}`);
      }
    }
    for (const p of plat.framed) for (const k of tileKeys(p)) expect(grid.has(k)).toBe(false);
  });

  it('plats no grid parcel against the tiles the free road crosses', () => {
    for (const p of plat.parcels) expect(p.front).toBe('N');
  });
});

/** Whether two convex polygons overlap by more than a shared edge: the separating axis test. */
function polygonsOverlapSat(p: readonly Pt[], q: readonly Pt[]): boolean {
  const axes: Pt[] = [];
  for (const shape of [p, q]) {
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i]!;
      const b = shape[(i + 1) % shape.length]!;
      axes.push({ x: -(b.z - a.z), z: b.x - a.x });
    }
  }
  for (const axis of axes) {
    const len = Math.hypot(axis.x, axis.z);
    const span = (shape: readonly Pt[]): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of shape) {
        const t = (v.x * axis.x + v.z * axis.z) / len;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
      return [lo, hi];
    };
    const [a0, a1] = span(p);
    const [b0, b1] = span(q);
    if (a1 - b0 <= 1e-3 || b1 - a0 <= 1e-3) return false;
  }
  return true;
}

const cornersOf = (p: FramedParcel): Pt[] => [
  toWorld(p.frame, 0, 0),
  toWorld(p.frame, p.w, 0),
  toWorld(p.frame, p.w, p.d),
  toWorld(p.frame, 0, p.d),
];

/**
 * The S-bend the browser shots are taken of: two arcs off a grid street,
 * zoned low density within three tiles of the centre line but not under the
 * road, at the tool's tile offsets from an origin (X, Z).
 */
function sBend(X: number, Z: number): { g: GridState; net: RoadNet; zoned: TilePoint[] } {
  const g = createGrid();
  g.fields[FieldId.LandValue]!.fill(119);
  const GRID_Z = Z + 2;
  for (let i = 0; i < 24; i++) g.roadTier[tileIndex(X + 2 + i, GRID_Z)] = RoadTier.TwoLane;
  const centre = (tx: number, tz: number): Pt => ({ x: (tx + 0.5) * TILE_METERS, z: (tz + 0.5) * TILE_METERS });
  const join = centre(X + 25, GRID_Z);
  const mid = centre(X + 19, GRID_Z + 12);
  const end = centre(X + 27, GRID_Z + 24);
  const arcs = [
    { a: join, control: centre(X + 29, GRID_Z + 8), b: mid },
    { a: mid, control: centre(X + 13, GRID_Z + 18), b: end },
  ];
  const net = createRoadNetwork();
  const facts = { tier: RoadTier.TwoLane, profile: RoadTier.TwoLane, flow: 0 };
  const node = (p: Pt): number => addNode(net, { ...facts, x: cm(p.x), z: cm(p.z), height: 0 });
  const nJoin = node(join);
  const nMid = node(mid);
  const nEnd = node(end);
  const segs = [
    [nJoin, nMid],
    [nMid, nEnd],
  ] as const;
  arcs.forEach((arc, i) =>
    addSegment(net, {
      ...facts,
      a: segs[i]![0],
      b: segs[i]![1],
      h0: 0,
      h1: 0,
      control: { x: cm(arc.control.x), z: cm(arc.control.z) },
    }),
  );
  const line: Pt[] = [];
  for (const arc of arcs) {
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const u = 1 - t;
      line.push({
        x: (u * u * arc.a.x + 2 * u * t * arc.control.x + t * t * arc.b.x) / TILE_METERS,
        z: (u * u * arc.a.z + 2 * u * t * arc.control.z + t * t * arc.b.z) / TILE_METERS,
      });
    }
  }
  const zoned: TilePoint[] = [];
  for (let tz = GRID_Z + 1; tz <= X + 27 + 3 && tz <= Z + 2 + 24 + 3; tz++) {
    for (let tx = X + 8; tx <= X + 34; tx++) {
      let d = Infinity;
      for (const p of line) d = Math.min(d, Math.hypot(tx + 0.5 - p.x, tz + 0.5 - p.z));
      if (d > 0.75 && d <= 3) {
        zoned.push({ x: tx, z: tz });
        g.zone[tileIndex(tx, tz)] = ZoneType.ResLow;
      }
    }
  }
  g.roads = net;
  deriveRoadFootprint(g, net, () => null);
  return { g, net, zoned };
}

describe('the plat along the S-bend the browser shots are taken of', () => {
  const { g, net, zoned } = sBend(100, 100);
  const plat = platFor(g);

  it('cuts framed parcels along both arcs', () => {
    const geoms = [0, 1].map((s) => segmentGeom(net, s));
    const near = (p: FramedParcel, s: number): number => {
      const o = toWorld(p.frame, 0, 0);
      return Math.min(
        ...[1, -1].flatMap((side) =>
          kerbLine(geoms[s]!, side as 1 | -1, HALF).map((k) => Math.hypot(k.x - o.x, k.z - o.z)),
        ),
      );
    };
    const onFirst = plat.framed.filter((p) => near(p, 0) <= near(p, 1));
    expect(onFirst.length).toBeGreaterThan(2);
    expect(plat.framed.length - onFirst.length).toBeGreaterThan(2);
  });

  it.each([10, 119, 181, 240])(
    'never lets two framed parcels overlap at land value %i, on either side of either arc or across their node',
    (value) => {
      const lived = sBend(100, 100);
      lived.g.fields[FieldId.LandValue]!.fill(value);
      const corners = platFor(lived.g).framed.map(cornersOf);
      expect(corners.length).toBeGreaterThan(3);
      const crossing: string[] = [];
      for (let i = 0; i < corners.length; i++) {
        for (let j = i + 1; j < corners.length; j++) {
          if (polygonsOverlapSat(corners[i]!, corners[j]!)) crossing.push(`${i}x${j}`);
        }
      }
      expect(crossing).toEqual([]);
    },
  );

  it('stands every parcel on the kerb, on zoned ground', () => {
    const kerbs = [0, 1].flatMap((s) =>
      [1, -1].map((side) => kerbLine(segmentGeom(net, s), side as 1 | -1, HALF)),
    );
    for (const p of plat.framed) {
      const o = toWorld(p.frame, 0, 0);
      const d = Math.min(...kerbs.flatMap((k) => k.map((q) => Math.hypot(q.x - o.x, q.z - o.z))));
      expect(d).toBeLessThanOrEqual(0.5);
      for (const t of p.tiles) expect(g.zone[tileIndex(t.x, t.z)]).toBe(ZoneType.ResLow);
    }
    expect(zoned.length).toBeGreaterThan(0);
  });

  it('is the same plat through the render mirror as through the sim grid', () => {
    const n = MAP_SIZE * MAP_SIZE;
    const map: MapData = {
      name: 'bend',
      size: MAP_SIZE,
      height: new Float32Array(n),
      water: new Uint8Array(n),
      trees: new Uint8Array(n),
      seaLevel: 0,
      spawn: { x: 0, z: 0 },
    };
    const mirror = new ClientGridMirror(map);
    mirror.applyRoadNetwork(encodeRoadNetwork(net));
    mirror.applyZonePatches([
      { x: 0, z: 0, w: MAP_SIZE, h: MAP_SIZE, data: Uint8Array.from(g.zone) },
    ]);
    for (let i = 0; i < n; i++) mirror.roadTier[i] = g.roadTier[i]!;
    const cells = buildRoadCells(mirror.roads!, mirror.size);
    const viaMirror = platOf(
      platSourceOf(mirror, cells, g.fields[FieldId.LandValue], (id) => mirror.profileById(id)),
      ZoneType.ResLow,
    );
    expect(viaMirror.framed).toEqual(plat.framed);
    expect(viaMirror.parcels).toEqual(plat.parcels);
  });
});

describe('every zone but farmland takes the kerb plat on a curve', () => {
  const a = { x: 60, z: 160 };
  const b = { x: a.x + 200 * Math.cos(Math.PI / 6), z: a.z + 200 * Math.sin(Math.PI / 6) };
  /** The 30° straight zoned `zone` on both sides, read as the spawner reads it, with the curve's cells. */
  const zonedWorld = (zone: ZoneType, value = 119): { g: GridState; seg: number; plat: Plat } => {
    const built = world(a, b, null, { x0: 0, z0: 0, w: 20, d: 20 }, value);
    const { g } = built;
    for (let i = 0; i < g.zone.length; i++) if (g.zone[i] !== 0) g.zone[i] = zone;
    const cells = buildRoadCells(g.roads!, g.size);
    const plat = platOf(platSourceOf(g, cells, g.fields[FieldId.LandValue]), zone);
    return { g, seg: built.seg, plat };
  };

  it.each([
    ['medium density', ZoneType.ResMedium],
    ['row housing', ZoneType.ResMediumRow],
    ['high density', ZoneType.ResHigh],
    ['low commercial', ZoneType.ComLow],
    ['high commercial', ZoneType.ComHigh],
    ['mixed use', ZoneType.Mixed],
    ['industry', ZoneType.Industrial],
    ['heavy industry', ZoneType.IndHeavy],
  ])('cuts %s into framed parcels by its own ladder, and no grid parcel against the curve', (_, zone) => {
    const { g, seg, plat } = zonedWorld(zone);
    expect(plat.parcels).toHaveLength(0);
    const sides = bySide(g, plat, seg);
    expect(sides[1].length).toBeGreaterThanOrEqual(7);
    expect(sides[-1].length).toBeGreaterThanOrEqual(7);
    const allowed = lotsOfZone(zone);
    for (const p of plat.framed) {
      expect(allowed).toContain(p.lot);
      expect(p.seg).toBe(seg);
      for (const t of p.tiles) expect(g.zone[tileIndex(t.x, t.z)]).toBe(zone);
    }
    // The normal-lot zones are normal whatever the standing; the rest read the land.
    const expected = warrantedLot(zone, 119);
    for (const p of plat.framed) expect(p.lot).toBe(expected);
  });

  it('records the kerb each parcel was cut on, in arc-length order', () => {
    const { g, seg, plat } = zonedWorld(ZoneType.ComLow);
    const sides = bySide(g, plat, seg);
    for (const side of [1, -1] as const) {
      const cut = plat.framed.filter((p) => p.side === side);
      expect(cut).toEqual(sides[side]);
      for (let i = 1; i < cut.length; i++) {
        expect(cut[i]!.s).toBeGreaterThanOrEqual(cut[i - 1]!.s + cut[i - 1]!.w - 1e-6);
      }
    }
  });

  it('leaves farmland on its grid plat', () => {
    const { plat } = zonedWorld(ZoneType.Agriculture);
    expect(plat.framed).toHaveLength(0);
  });
});

describe('runs of parcels along a kerb', () => {
  const a = { x: 60, z: 160 };
  const b = { x: a.x + 200 * Math.cos(Math.PI / 6), z: a.z + 200 * Math.sin(Math.PI / 6) };
  const { g, seg } = world(a, b, null, { x0: 0, z0: 0, w: 20, d: 20 });
  for (let i = 0; i < g.zone.length; i++) if (g.zone[i] !== 0) g.zone[i] = ZoneType.ComLow;
  const plat = platFor(g, ZoneType.ComLow);
  const sides = bySide(g, plat, seg);

  it.each([2, 3])('returns every run of %i normal lots end to end on the 30° straight', (lots) => {
    const wM = lots * TILE_METERS;
    const runs = runsAlongKerbs(plat, wM);
    for (const side of [1, -1] as const) {
      const onSide = runs.filter((r) => plat.framed[r.parcels[0]!]!.side === side);
      expect(onSide.length).toBe(Math.max(0, sides[side].length - lots + 1));
    }
    for (const run of runs) {
      expect(run.parcels).toHaveLength(lots);
      expect(run.w).toBe(wM);
      expect(run.d).toBe(2 * TILE_METERS);
      const parcels = run.parcels.map((n) => plat.framed[n]!);
      for (let i = 1; i < parcels.length; i++) {
        expect(parcels[i]!.s).toBeCloseTo(parcels[i - 1]!.s + parcels[i - 1]!.w, 6);
      }
      // The run's frame: the corner of the parcel first along its own u, the
      // road's heading, and every parcel's tiles claimed once.
      const first = parcels[0]!.side === 1 ? parcels[0]! : parcels[parcels.length - 1]!;
      expect(run.frame.x).toBe(first.frame.x);
      expect(run.frame.z).toBe(first.frame.z);
      expect(run.frame.heading).toBeCloseTo(first.frame.heading, 9);
      const keys = new Set(parcels.flatMap(tileKeys));
      expect(run.tiles.map((t) => `${t.x},${t.z}`).sort()).toEqual([...keys].sort());
      // Every parcel lies within the run's rectangle.
      for (const p of parcels) {
        for (const u of [0, p.w]) {
          const l = toLocal(run.frame, toWorld(p.frame, u, 0).x, toWorld(p.frame, u, 0).z);
          expect(l.u).toBeGreaterThanOrEqual(-1e-6);
          expect(l.u).toBeLessThanOrEqual(wM + 1e-6);
          expect(Math.abs(l.v)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('is a run of one for a kind as wide as the parcel', () => {
    const runs = runsAlongKerbs(plat, TILE_METERS);
    expect(runs).toHaveLength(plat.framed.length);
    for (const run of runs) {
      const p = plat.framed[run.parcels[0]!]!;
      expect(run.frame).toEqual(p.frame);
      expect(run.tiles).toEqual(p.tiles);
    }
  });

  it('allows no run wider than one lot on a 40 m bend', () => {
    const r = 40 / (Math.SQRT2 / 2);
    const at = { x: 100, z: 100 };
    const bend = world(at, { x: at.x + r, z: at.z + r }, { x: at.x + r, z: at.z }, { x0: 0, z0: 0, w: 20, d: 20 }, 10);
    for (let i = 0; i < bend.g.zone.length; i++) if (bend.g.zone[i] !== 0) bend.g.zone[i] = ZoneType.ComLow;
    const bent = platFor(bend.g, ZoneType.ComLow);
    expect(bent.framed.length).toBeGreaterThan(2);
    expect(bent.framed.every((p) => p.w === TILE_METERS)).toBe(true);
    expect(runsAlongKerbs(bent, TILE_METERS).length).toBe(bent.framed.length);
    expect(runsAlongKerbs(bent, 2 * TILE_METERS)).toEqual([]);
    expect(runsAlongKerbs(bent, 3 * TILE_METERS)).toEqual([]);
  });

  it('bends no more than MAX_RUN_BEND_RAD between a run’s ends', () => {
    expect(MAX_RUN_BEND_RAD).toBeCloseTo((8 * Math.PI) / 180, 12);
  });
});

describe('a band painted through the zoning gate beside the 30° straight', () => {
  const a = { x: 60, z: 160 };
  const b = { x: a.x + 200 * Math.cos(Math.PI / 6), z: a.z + 200 * Math.sin(Math.PI / 6) };
  const everyTile: TilePoint[] = [];
  for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) everyTile.push({ x, z });

  it.each([ZoneType.ResLow, ZoneType.ComLow])(
    'cuts normal lots abutting along both kerbs, and every run of two, for zone %i',
    (zone) => {
      const { g, seg } = world(a, b, null, { x0: 0, z0: 0, w: 0, d: 0 });
      expect(setZones(g, everyTile, zone).length).toBeGreaterThan(50);
      const plat = platFor(g, zone);
      const sides = bySide(g, plat, seg);
      for (const side of [1, -1] as const) {
        expect(sides[side].length).toBeGreaterThanOrEqual(7);
        const s =sides[side].map((p) => p.s);
        for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]!).toBeCloseTo(TILE_METERS, 6);
      }
      for (const p of plat.framed) expect(p).toMatchObject({ lot: 'normal', w: 20, d: 40 });
      const runs = runsAlongKerbs(plat, 2 * TILE_METERS);
      for (const side of [1, -1] as const) {
        const onSide = runs.filter((r) => plat.framed[r.parcels[0]!]!.side === side);
        expect(onSide.length).toBe(sides[side].length - 1);
      }
    },
  );
});

describe('the S-bend plats every zone', () => {
  it.each([
    ['low density', ZoneType.ResLow],
    ['medium density', ZoneType.ResMedium],
    ['low commercial', ZoneType.ComLow],
    ['industry', ZoneType.Industrial],
    ['heavy industry', ZoneType.IndHeavy],
  ])('cuts %s along both arcs with no parcel overlapping another', (_, zone) => {
    const { g, zoned } = sBend(100, 100);
    for (const t of zoned) g.zone[tileIndex(t.x, t.z)] = zone;
    const plat = platFor(g, zone);
    expect(plat.framed.length).toBeGreaterThan(3);
    const corners = plat.framed.map(cornersOf);
    for (let i = 0; i < corners.length; i++) {
      for (let j = i + 1; j < corners.length; j++) {
        expect(polygonsOverlapSat(corners[i]!, corners[j]!)).toBe(false);
      }
    }
  });
});

describe('a gentle 400 m bend painted ComLow at one land value', () => {
  const tile = (tx: number, tz: number): Pt => ({ x: (tx + 0.5) * TILE_METERS, z: (tz + 0.5) * TILE_METERS });
  const X = 20;
  const Z = 20;
  const a = tile(X + 19, Z + 12.5);
  const control = tile(X + 19, Z + 16.5);
  const b = tile(X + 17.4, Z + 20.2);

  it('cuts normal lots abutting at 20 m on both kerbs and offers a run of two', () => {
    const { g, seg } = world(a, b, control, { x0: 0, z0: 0, w: 0, d: 0 }, 119);
    const line: Pt[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const u = 1 - t;
      line.push({
        x: (u * u * a.x + 2 * u * t * control.x + t * t * b.x) / TILE_METERS,
        z: (u * u * a.z + 2 * u * t * control.z + t * t * b.z) / TILE_METERS,
      });
    }
    const band: TilePoint[] = [];
    for (let tz = Z + 10; tz <= Z + 26; tz++) {
      for (let tx = X + 10; tx <= X + 28; tx++) {
        const d = Math.min(...line.map((p) => Math.hypot(tx + 0.5 - p.x, tz + 0.5 - p.z)));
        if (d > 0.28 && d <= 3) band.push({ x: tx, z: tz });
      }
    }
    expect(setZones(g, band, ZoneType.ComLow).length).toBeGreaterThan(20);
    const plat = platFor(g, ZoneType.ComLow);
    const sides = bySide(g, plat, seg);
    for (const side of [1, -1] as const) {
      expect(sides[side].length).toBeGreaterThanOrEqual(3);
      const s = sides[side].map((p) => p.s);
      for (let i = 1; i < s.length; i++) {
        expect(s[i]! - s[i - 1]!).toBeGreaterThanOrEqual(TILE_METERS - 1e-6);
        expect(s[i]! - s[i - 1]!).toBeLessThanOrEqual(TILE_METERS + 4 + 1e-6);
      }
    }
    for (const p of plat.framed) expect(p).toMatchObject({ lot: 'normal', w: 20, d: 40 });
    const runs = runsAlongKerbs(plat, 2 * TILE_METERS);
    for (const side of [1, -1] as const) {
      expect(runs.filter((r) => plat.framed[r.parcels[0]!]!.side === side).length).toBeGreaterThan(0);
    }
  });
});
