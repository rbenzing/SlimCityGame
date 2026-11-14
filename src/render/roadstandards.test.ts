import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BIKE_LANE_PAINT_COLOR,
  carriagewayHalfWidthMeters,
  isLaneGlyphTile,
  MARKING_COLOR,
  RoadMeshRenderer,
  SIDEWALK_COLOR,
} from './roadsmesh';
import { junctionArmLayout } from '../shared/junctionpaint';
import { drawnSectionAt, halfAt } from '../shared/kerblayout';
import {
  NO_PARKING_BEFORE_STOP_M,
  NO_PARKING_FROM_CROSSWALK_M,
  PARKING_END_STALL_M,
  PARKING_STALL_MAX_M,
  PARKING_STALL_LENGTH_M,
  PARKING_TICK_KERB_CLEARANCE_M,
  parkingRunTicks,
} from '../shared/kerbstalls';
import { EDGE_LINE_MARGIN_M } from './roadmarkings';
import { RoadFlow, RoadTier } from '../shared/types';
import type { JunctionControl, RoadProfile } from '../shared/types';
import {
  carriagewayHalfWidthOf,
  carriagewayWidth,
  composeProfile,
  kerbWidthOf,
  NO_EDITS,
  presetProfileForTier,
} from '../shared/roadprofile';
import { TILE_METERS } from '../shared/constants';

const flatHeightAt = (): number => 0;
const N = 1;
const E = 2;
const S = 4;
const W = 8;

const key = (c: readonly [number, number, number]): string => c.map((q) => q.toFixed(2)).join(',');
const WHITE = key(MARKING_COLOR);
const GREEN = key(BIKE_LANE_PAINT_COLOR);
const KERB = key(SIDEWALK_COLOR);

/** The street in the report: two-way, no footways, a bike lane left and parking right. */
const CUSTOM = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
  ...NO_EDITS,
  bike: 'left',
  parking: 'right',
  footways: false,
});
const CUSTOM_ID = 100;
const CUSTOM_HALF = carriagewayHalfWidthOf(CUSTOM);
/** The same street with neither: what it narrows to along itself. */
const PLAIN = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
  ...NO_EDITS,
  footways: false,
});
const PLAIN_ID = 101;
/** A two-lane street parked on both kerbs, footways and all. */
const PARKED = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
  ...NO_EDITS,
  parking: 'both',
});
const PARKED_ID = 102;
/** A parallel parking lane's depth, and how far a corner mark's stem runs into it from the travel edge. */
const PARKED_LANE_M = 2.25;
const CORNER_STEM_M = 0.6;
const PROFILES = new Map<number, RoadProfile>([
  [CUSTOM_ID, CUSTOM],
  [PLAIN_ID, PLAIN],
  [PARKED_ID, PARKED],
]);

type Lay = { x: number; z: number; tier: RoadTier; profile?: number };

/** A renderer holding `tiles`, each joined to every road tile beside it. */
function layRoads(
  tiles: readonly Lay[],
  controls: { x: number; z: number; control: JunctionControl }[] = [],
  heightAt: (x: number, z: number) => number = flatHeightAt,
): RoadMeshRenderer {
  const at = new Set(tiles.map((t) => `${t.x},${t.z}`));
  const has = (x: number, z: number): boolean => at.has(`${x},${z}`);
  const renderer = new RoadMeshRenderer(
    new THREE.Scene(),
    heightAt,
    (id) => PROFILES.get(id) ?? null,
  );
  renderer.setJunctionControls(controls);
  renderer.apply(
    tiles.map((t) => ({
      x: t.x,
      z: t.z,
      tier: t.tier,
      mask:
        (has(t.x, t.z - 1) ? N : 0) |
        (has(t.x + 1, t.z) ? E : 0) |
        (has(t.x, t.z + 1) ? S : 0) |
        (has(t.x - 1, t.z) ? W : 0),
      elevation: 0,
      profile: t.profile ?? t.tier,
      flow: RoadFlow.None,
    })),
  );
  return renderer;
}

type Sample = { at: number; colour: string | null };

/** What the mesh shows along a line of constant z, `n` samples from x0 to x1. */
function rowAlongX(r: RoadMeshRenderer, z: number, x0: number, x1: number, n = 400): Sample[] {
  return r
    .surfaceGridAt(x0, z, x1, z, n)
    .slice(0, n)
    .map((colour, i) => ({ at: x0 + ((i + 0.5) * (x1 - x0)) / n, colour }));
}

/** The same down a line of constant x. */
function rowAlongZ(r: RoadMeshRenderer, x: number, z0: number, z1: number, n = 400): Sample[] {
  const grid = r.surfaceGridAt(x, z0, x, z1, n);
  return Array.from({ length: n }, (_, i) => ({
    at: z0 + ((i + 0.5) * (z1 - z0)) / n,
    colour: grid[i * n] ?? null,
  }));
}

/** How far either side of `centre` the carriageway runs on a row: everything paved but the kerb. */
function carriagewayReach(row: readonly Sample[], centre: number): { lo: number; hi: number } {
  const road = row
    .filter((s) => s.colour !== null && s.colour !== KERB)
    .map((s) => s.at)
    .sort((a, b) => a - b);
  let lo = centre;
  let hi = centre;
  for (const x of road) if (x >= hi && x - hi < 0.2) hi = x;
  for (const x of [...road].reverse()) if (x <= lo && lo - x < 0.2) lo = x;
  return { lo: centre - lo, hi: hi - centre };
}

/** A crossing road along z = 2 and the report's street running south from it at x = 4. */
function tee(crossing: RoadTier): RoadMeshRenderer {
  return layRoads([
    ...Array.from({ length: 9 }, (_, x) => ({ x, z: 2, tier: crossing })),
    ...Array.from({ length: 6 }, (_, k) => ({
      x: 4,
      z: 3 + k,
      tier: RoadTier.TwoLane,
      profile: CUSTOM_ID,
    })),
  ]);
}

describe('a road keeps its width up to a junction', () => {
  for (const crossing of [RoadTier.TwoLane, RoadTier.Avenue]) {
    const name = crossing === RoadTier.TwoLane ? 'a narrower two-lane road' : 'an avenue';

    it(`never narrows a wide street toward ${name} it meets`, () => {
      const r = tee(crossing);
      for (let z = 3; z <= 8; z++) {
        expect(r.drawnAt(4, z)!.width, `tile (4,${z})`).toBeCloseTo(2 * CUSTOM_HALF, 6);
      }
      // Drawn so, too: the last tile is as wide against the junction as at its back.
      const centre = 4.5 * TILE_METERS;
      for (const z of [3 * TILE_METERS + 0.2, 4 * TILE_METERS - 0.2]) {
        const reach = carriagewayReach(rowAlongX(r, z, 4 * TILE_METERS, 5 * TILE_METERS), centre);
        expect(reach.lo, `at z ${z}`).toBeCloseTo(CUSTOM_HALF, 1);
        expect(reach.hi, `at z ${z}`).toBeCloseTo(CUSTOM_HALF, 1);
      }
    });

    it(`draws the mouth on ${name} at the street's own width, footways or not`, () => {
      const r = tee(crossing);
      // Just inside the junction tile, where the street's arm meets it.
      const reach = carriagewayReach(
        rowAlongX(r, 3 * TILE_METERS - 0.3, 4 * TILE_METERS, 5 * TILE_METERS),
        4.5 * TILE_METERS,
      );
      expect(reach.lo).toBeCloseTo(CUSTOM_HALF, 1);
      expect(reach.hi).toBeCloseTo(CUSTOM_HALF, 1);
    });
  }
});

describe('an edge line breaks only across the mouth of a road that joins', () => {
  it('paints the far side of a grid T along the whole junction tile', () => {
    const r = tee(RoadTier.TwoLane);
    const two = carriagewayHalfWidthMeters(RoadTier.TwoLane);
    const far = rowAlongX(
      r,
      2.5 * TILE_METERS - (two - EDGE_LINE_MARGIN_M),
      4 * TILE_METERS,
      5 * TILE_METERS,
    );
    expect(far.every((s) => s.colour === WHITE)).toBe(true);
  });

  it('breaks the near side across the mouth and nowhere else', () => {
    const r = tee(RoadTier.TwoLane);
    const two = carriagewayHalfWidthMeters(RoadTier.TwoLane);
    const near = rowAlongX(
      r,
      2.5 * TILE_METERS + (two - EDGE_LINE_MARGIN_M),
      4 * TILE_METERS,
      5 * TILE_METERS,
    );
    const mouth = near.filter((s) => Math.abs(s.at - 4.5 * TILE_METERS) < CUSTOM_HALF - 0.2);
    expect(mouth.length).toBeGreaterThan(0);
    expect(mouth.some((s) => s.colour === WHITE)).toBe(false);
    // The line itself is still there either side, turning away round the corners.
    expect(near.some((s) => s.colour === WHITE)).toBe(true);
  });
});

describe('the Bike Lane street, footways and all, into a T', () => {
  const bikeTee = (): RoadMeshRenderer =>
    layRoads([
      ...Array.from({ length: 9 }, (_, x) => ({ x, z: 2, tier: RoadTier.TwoLane })),
      ...Array.from({ length: 6 }, (_, k) => ({ x: 4, z: 3 + k, tier: RoadTier.BikeLane })),
    ]);
  const HALF = carriagewayHalfWidthMeters(RoadTier.BikeLane);
  const centre = 4.5 * TILE_METERS;

  it('keeps its whole carriageway, bike lanes included, up to and through the mouth', () => {
    const r = bikeTee();
    // The stem's last tile against the junction, and the junction's own arm.
    for (const z of [3 * TILE_METERS + 0.3, 3 * TILE_METERS + 3, 3 * TILE_METERS - 0.3]) {
      const reach = carriagewayReach(rowAlongX(r, z, 4 * TILE_METERS, 5 * TILE_METERS), centre);
      expect(reach.lo, `at z ${z}`).toBeCloseTo(HALF, 1);
      expect(reach.hi, `at z ${z}`).toBeCloseTo(HALF, 1);
    }
  });

  it('carries its green on into the junction, up to where the kerb turns', () => {
    const r = bikeTee();
    const greenAt = (z: number): number =>
      rowAlongX(r, z, 4 * TILE_METERS, 5 * TILE_METERS).filter((s) => s.colour === GREEN).length;
    // Half a metre into the junction tile the lane is still there, both sides.
    expect(greenAt(3 * TILE_METERS - 0.5)).toBeGreaterThan(40);
    // Past the corner's tangent the kerb has turned away and the lane follows it
    // round the return: it stays against the kerb and never crosses the box.
    const round = rowAlongX(r, 3 * TILE_METERS - 4, 4 * TILE_METERS, 5 * TILE_METERS).filter(
      (s) => s.colour === GREEN,
    );
    expect(round.length).toBeGreaterThan(0);
    for (const s of round) expect(Math.abs(s.at - centre)).toBeGreaterThan(HALF - 1.7);
  });
});

describe('a coloured lane on sloping ground', () => {
  /**
   * Ground the way the terrain mesh is: each 20 m tile two planes meeting on
   * its u + v = 1 diagonal, the corners at heights from a fixed pattern.
   */
  const corner = (ix: number, iz: number): number => ((ix * 7 + iz * 13) % 5) * 0.9;
  const ground = (x: number, z: number): number => {
    const ix = Math.floor(x / TILE_METERS);
    const iz = Math.floor(z / TILE_METERS);
    const u = x / TILE_METERS - ix;
    const v = z / TILE_METERS - iz;
    if (u + v <= 1) {
      const h00 = corner(ix, iz);
      return h00 + u * (corner(ix + 1, iz) - h00) + v * (corner(ix, iz + 1) - h00);
    }
    const h11 = corner(ix + 1, iz + 1);
    return h11 + (1 - u) * (corner(ix, iz + 1) - h11) + (1 - v) * (corner(ix + 1, iz) - h11);
  };

  it('never lets the asphalt beneath show through it', () => {
    const r = layRoads(
      Array.from({ length: 8 }, (_, z) => ({ x: 4, z, tier: RoadTier.BikeLane })),
      [],
      ground,
    );
    const half = carriagewayHalfWidthMeters(RoadTier.BikeLane);
    const centre = 4.5 * TILE_METERS;
    // Down the middle of each green strip, the whole length of three tiles.
    for (const across of [-1, 1]) {
      const x = centre + across * (half - 0.8);
      const down = rowAlongZ(r, x, 2 * TILE_METERS, 5 * TILE_METERS, 600);
      const bare = down.filter((s) => s.colour !== GREEN && s.colour !== WHITE);
      expect(
        bare.map((s) => s.at.toFixed(2)),
        `asphalt through the green at x ${x}`,
      ).toEqual([]);
    }
  });
});

describe('a bike lane lies between two white lines', () => {
  it('lays its green strictly between the bike-lane line and the edge line', () => {
    const r = tee(RoadTier.TwoLane);
    // A tile with no bicycle stencil on it, which would cross the row.
    const z = [5, 6, 7].find((k) => !isLaneGlyphTile(k))!;
    const row = rowAlongX(r, (z + 0.5) * TILE_METERS, 4 * TILE_METERS, 5 * TILE_METERS, 800);
    const green = row.map((s, i) => (s.colour === GREEN ? i : -1)).filter((i) => i >= 0);
    expect(green.length).toBeGreaterThan(0);
    const first = green[0]!;
    const last = green[green.length - 1]!;
    // One unbroken run, a white line either side of it, and the line on the
    // outside inset from the edge of the pavement.
    expect(last - first + 1).toBe(green.length);
    expect(row[first - 1]!.colour).toBe(WHITE);
    expect(row[last + 1]!.colour).toBe(WHITE);
    const edge = row.findIndex((s) => s.colour !== null);
    expect(edge).toBeLessThan(first - 1);
    expect(row[edge]!.colour).not.toBe(WHITE);
  });
});

describe('a taper along one road', () => {
  /** The report's street running on as a plain one: its bike and parking lanes end. */
  const narrowing = (): RoadMeshRenderer =>
    layRoads(
      Array.from({ length: 13 }, (_, z) => ({
        x: 4,
        z,
        tier: RoadTier.TwoLane,
        profile: z <= 5 ? CUSTOM_ID : PLAIN_ID,
      })),
    );

  it('still tapers, into the narrower stretch of the same road', () => {
    const r = narrowing();
    expect(r.drawnAt(4, 2)!.width).toBeCloseTo(2 * CUSTOM_HALF, 6);
    expect(r.drawnAt(4, 4)!.width).toBeLessThan(2 * CUSTOM_HALF - 0.5);
    expect(r.drawnAt(4, 6)!.width).toBeCloseTo(carriagewayWidth(PLAIN), 6);
  });

  it('keeps every coloured lane and every line on the pavement, all along each tile', () => {
    const r = narrowing();
    const centre = 4.5 * TILE_METERS;
    for (let z = 3 * TILE_METERS + 0.5; z < 6 * TILE_METERS; z += 2.5) {
      const row = rowAlongX(r, z, 4 * TILE_METERS, 5 * TILE_METERS);
      const paved = row.filter((s) => s.colour !== null).map((s) => s.at);
      const lo = Math.min(...paved);
      const hi = Math.max(...paved);
      for (const s of row) {
        if (s.colour !== GREEN && s.colour !== WHITE) continue;
        expect(s.at, `paint off the pavement at z ${z}`).toBeGreaterThanOrEqual(lo);
        expect(s.at, `paint off the pavement at z ${z}`).toBeLessThanOrEqual(hi);
      }
      // Parking is on the high side: no stall mark reaches the edge.
      for (const s of row.filter((t) => t.colour === WHITE && t.at > centre + 1)) {
        expect(s.at, `a stall mark at the edge at z ${z}`).toBeLessThan(
          hi - PARKING_TICK_KERB_CLEARANCE_M + 0.1,
        );
      }
    }
  });

  it('lays the green in the same place either side of every seam', () => {
    const r = narrowing();
    const span = (z: number): number[] =>
      rowAlongX(r, z, 4 * TILE_METERS, 5 * TILE_METERS)
        .filter((s) => s.colour === GREEN)
        .map((s) => s.at);
    for (const seam of [3, 4, 5].map((k) => k * TILE_METERS)) {
      const before = span(seam - 0.05);
      const after = span(seam + 0.05);
      if (before.length === 0 || after.length === 0) {
        expect(Math.abs(before.length - after.length), `at seam ${seam}`).toBeLessThanOrEqual(3);
        continue;
      }
      expect(Math.abs(Math.min(...before) - Math.min(...after))).toBeLessThan(0.15);
      expect(Math.abs(Math.max(...before) - Math.max(...after))).toBeLessThan(0.15);
    }
  });
});

describe('a parking lane', () => {
  /** A four-way all-way stop of the parked street at (4, 2). */
  const crossroads = (): RoadMeshRenderer =>
    layRoads(
      [
        ...Array.from({ length: 9 }, (_, x) => ({
          x,
          z: 2,
          tier: RoadTier.TwoLane,
          profile: PARKED_ID,
        })),
        ...[0, 1, 3, 4, 5, 6].map((z) => ({
          x: 4,
          z,
          tier: RoadTier.TwoLane,
          profile: PARKED_ID,
        })),
      ],
      [{ x: 4, z: 2, control: 'allWayStop' }],
    );
  // What the junction lays on each arm: a crossing as deep as its footway
  // against the kerb line, and a stop line 1.2 m in advance of it.
  // The road crossing the west arm is the street running north-south, drawn
  // as wide as it is at the junction's mouth, turn bays included.
  const mouth = crossroads().kerbSurroundings();
  const layout = junctionArmLayout(
    Math.max(halfAt(4, 1, mouth), halfAt(4, 3, mouth)),
    kerbWidthOf(drawnSectionAt(4, 2, mouth)!),
  );
  const BEFORE_STOP = NO_PARKING_BEFORE_STOP_M - (TILE_METERS / 2 - layout.stopLineFar);
  const FROM_CROSSING = NO_PARKING_FROM_CROSSWALK_M - (TILE_METERS / 2 - layout.crosswalkNear);

  it('is kept clear 9.1 m before a stop line and 6.1 m from a crossing, on both sides', () => {
    const r = crossroads();
    // West of the junction, eastbound traffic arrives on the south (high) side.
    expect(r.parkingSetbacksAt(3, 2)).toEqual({
      alongX: true,
      lo: null,
      hi: [expect.closeTo(FROM_CROSSING, 6), expect.closeTo(BEFORE_STOP, 6)],
    });
    // East of it, westbound traffic arrives on the north (low) side.
    expect(r.parkingSetbacksAt(5, 2)).toEqual({
      alongX: true,
      lo: [expect.closeTo(BEFORE_STOP, 6), expect.closeTo(FROM_CROSSING, 6)],
      hi: null,
    });
    // A tile further out is clear of both, and knows where the zone lies a
    // tile beyond its end, since the stall beside the end stall may reach it.
    expect(r.parkingSetbacksAt(2, 2)).toEqual({
      alongX: true,
      lo: null,
      hi: [
        expect.closeTo(FROM_CROSSING - TILE_METERS, 6),
        expect.closeTo(BEFORE_STOP - TILE_METERS, 6),
      ],
    });
    expect(r.parkingSetbacksAt(1, 2)).toEqual({ alongX: true, lo: null, hi: null });
  });

  it('marks no stall inside the zone, and every stall up to it 6.1–7.9 m long', () => {
    const r = crossroads();
    const edge = 4 * TILE_METERS; // where the west arm meets the junction tile
    for (const [side, reach] of [
      ['high', BEFORE_STOP],
      ['low', FROM_CROSSING],
    ] as const) {
      // The stalls the corner marks are painted from, west of the junction.
      const stalls = [0, 1, 2, 3].flatMap((x) => r.parkingStallsAt(x, 2, side) ?? []);
      expect(stalls.length).toBeGreaterThan(2);
      const last = Math.max(...stalls.map((s) => s.to));
      expect(last, 'a stall marked inside the zone').toBeLessThanOrEqual(edge - reach + 0.05);
      for (const s of stalls) {
        expect(s.to - s.from).toBeGreaterThan(PARKING_END_STALL_M - 0.1);
        expect(s.to - s.from).toBeLessThan(PARKING_STALL_MAX_M + 0.1);
      }
    }
  });

  it('lays a run with 6.1 m end stalls and 6.7 m stalls between, flush to the run’s upstream end', () => {
    const r = layRoads(
      Array.from({ length: 9 }, (_, z) => ({
        x: 4,
        z,
        tier: RoadTier.TwoLane,
        profile: PARKED_ID,
      })),
    );
    const stalls = Array.from(
      { length: 9 },
      (_, z) => r.parkingStallsAt(4, z, 'high') ?? [],
    ).flat();
    expect(stalls.length).toBeGreaterThan(15);
    const lengths = stalls.map((s) => s.to - s.from);
    // The stalls between the ends are 6.7 m; the ends and the accessible stall differ.
    const interior = lengths.filter((l) => Math.abs(l - PARKING_STALL_LENGTH_M) < 1e-6);
    expect(interior.length).toBeGreaterThan(lengths.length - 5);
    for (const l of lengths) {
      expect(l).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
      expect(l).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
    }
  });

  it('marks its stalls with corner marks on the travel edge and paints no line along the lane', () => {
    const r = layRoads(
      Array.from({ length: 9 }, (_, z) => ({
        x: 4,
        z,
        tier: RoadTier.TwoLane,
        profile: PARKED_ID,
      })),
    );
    const half = carriagewayHalfWidthOf(PARKED);
    const centre = 4.5 * TILE_METERS;
    // Across the road at a corner mark: where two plain stalls meet.
    const stalls = (r.parkingStallsAt(4, 4, 'high') ?? []).filter((s) => !s.accessible);
    const z = stalls[1]!.to;
    const stall = stalls[1]!.to - stalls[1]!.from;
    const row = rowAlongX(r, z, 4 * TILE_METERS, 5 * TILE_METERS, 800);
    const white = row.filter((s) => s.colour === WHITE).map((s) => Math.abs(s.at - centre));
    const edge = half - PARKED_LANE_M;
    // The stem runs 0.6 m from the travel edge toward the kerb and stops there.
    expect(Math.max(...white)).toBeGreaterThan(edge + CORNER_STEM_M - 0.2);
    expect(Math.max(...white)).toBeLessThanOrEqual(edge + CORNER_STEM_M + 0.05);
    // Half way along a stall nothing is painted on the lane at all.
    const mid = z - stall / 2;
    const between = rowAlongX(r, mid, 4 * TILE_METERS, 5 * TILE_METERS, 800);
    expect(between.some((s) => s.colour === WHITE)).toBe(false);
  });

  it('lays its stalls round a drive and paints nothing on the lane across its mouth', () => {
    const r = layRoads(
      Array.from({ length: 9 }, (_, z) => ({
        x: 4,
        z,
        tier: RoadTier.TwoLane,
        profile: PARKED_ID,
      })),
    );
    const before = [2, 3, 4, 5, 6].flatMap((z) => r.parkingStallsAt(4, z, 'high') ?? []);
    const cut = { side: 'high' as const, from: 100, to: 103 };
    // The cut lies on tile z = 5 only, and the run it shapes is redrawn.
    expect(r.setDriveCuts([{ x: 4, z: 5, cut }]).size).toBeGreaterThan(0);
    const stalls = [2, 3, 4, 5, 6].flatMap((z) => r.parkingStallsAt(4, z, 'high') ?? []);
    expect(stalls.length).toBeGreaterThan(0);
    expect(before.some((s) => s.to > cut.from - 1.5 && s.from < cut.to + 1.5)).toBe(true);
    for (const s of stalls) {
      expect(s.to <= cut.from - 1.5 + 1e-6 || s.from >= cut.to + 1.5 - 1e-6).toBe(true);
    }
    // Nothing is painted down the lane between the last stall before the drive and the first after it.
    const gapFrom = Math.max(...stalls.filter((s) => s.to <= cut.from).map((s) => s.to));
    const gapTo = Math.min(...stalls.filter((s) => s.from >= cut.to).map((s) => s.from));
    const edge = carriagewayHalfWidthOf(PARKED) - PARKED_LANE_M;
    for (const across of [0.05, 0.3, 0.55]) {
      const row = rowAlongZ(r, 4.5 * TILE_METERS + edge + across, gapFrom + 0.3, gapTo - 0.3, 200);
      expect(
        row.some((s) => s.colour === WHITE),
        `paint ${across} m into the lane`,
      ).toBe(false);
    }
  });
});

describe('parkingRunTicks — how a kerb’s stalls are laid', () => {
  it('lays an open run with 6.1 m end stalls and 6.7 m stalls between, from its upstream end', () => {
    const low = parkingRunTicks(100, 130, [], true);
    expect(low[0]).toBeCloseTo(100, 9);
    expect(low[1]! - low[0]!).toBeCloseTo(PARKING_END_STALL_M, 9);
    for (let i = 2; i < low.length - 1; i++) {
      expect(low[i]! - low[i - 1]!).toBeCloseTo(PARKING_STALL_LENGTH_M, 9);
    }
    // Traffic arriving from the high end lays the same run from there.
    const high = parkingRunTicks(100, 130, [], false);
    expect(high[high.length - 1]).toBeCloseTo(130, 9);
  });

  it('marks every stall 6.1–7.9 m long, whatever the length of the run and the zones round it', () => {
    for (let room = 0; room <= 60; room += 0.37) {
      for (const upstreamLow of [true, false]) {
        const at = parkingRunTicks(200, 200 + room, [], upstreamLow);
        for (let i = 1; i < at.length; i++) {
          const gap = at[i]! - at[i - 1]!;
          expect(gap, `run ${room.toFixed(2)}`).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
          expect(gap, `run ${room.toFixed(2)}`).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
        }
        if (at.length > 0) {
          expect(at[0]!).toBeGreaterThanOrEqual(200 - 1e-6);
          expect(at[at.length - 1]!).toBeLessThanOrEqual(200 + room + 1e-6);
        }
      }
    }
  });

  it('marks nothing inside a zone, and lays each run between zones on its own', () => {
    const at = parkingRunTicks(0, 60, [{ from: 20, to: 26 }], true);
    expect(at.some((t) => t > 20 + 1e-6 && t < 26 - 1e-6)).toBe(false);
    // The run above the zone starts flush at its edge.
    expect(at).toContain(26);
    // The run below it, laid from the same upstream end, starts at the kerb's end.
    expect(at[0]).toBeCloseTo(0, 9);
  });

  it('marks nothing where a run is too short for a stall', () => {
    expect(parkingRunTicks(0, PARKING_END_STALL_M - 0.1, [], true)).toEqual([]);
    expect(parkingRunTicks(0, 30, [{ from: 5, to: 25 }], true)).toEqual([]);
  });
});
