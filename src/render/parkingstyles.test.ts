import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ACCESSIBLE_PAINT_COLOR, MARKING_COLOR, RoadMeshRenderer } from './roadsmesh';
import { PARKING_TICK_KERB_CLEARANCE_M, type KerbStall } from './kerbstalls';
import { RoadFlow, RoadTier } from '../shared/types';
import type { JunctionControl, ParkingStyle, RoadProfile } from '../shared/types';
import {
  carriagewayHalfWidthOf,
  composeProfile,
  NO_EDITS,
  PARKING_STYLES,
  presetProfileForTier,
  worldOrderedProfile,
  type SideChoice,
} from '../shared/roadprofile';
import { TILE_METERS } from '../shared/constants';

const key = (c: readonly [number, number, number]): string => c.map((q) => q.toFixed(2)).join(',');
const WHITE = key(MARKING_COLOR);
const BLUE = key(ACCESSIBLE_PAINT_COLOR);
const TAN60 = Math.tan(Math.PI / 3);

const ID = 100;

function styled(tier: RoadTier, parking: SideChoice, parkingStyle: ParkingStyle): RoadProfile {
  return composeProfile(presetProfileForTier(tier), { ...NO_EDITS, parking, parkingStyle });
}

/**
 * A street along z = 2 from x = 0 to 9 laid with `profile` and `flow`, and,
 * where `junction` is set, a side street joining from the north at x = 5.
 */
function street(
  profile: RoadProfile,
  flow: RoadFlow = RoadFlow.None,
  junction?: JunctionControl,
): RoadMeshRenderer {
  const tiles = [
    ...Array.from({ length: 10 }, (_, x) => ({ x, z: 2, profile: ID, flow })),
    ...(junction
      ? [0, 1].map((z) => ({ x: 5, z, profile: RoadTier.TwoLane, flow: RoadFlow.None }))
      : []),
  ];
  const at = new Set(tiles.map((t) => `${t.x},${t.z}`));
  const has = (x: number, z: number): boolean => at.has(`${x},${z}`);
  const renderer = new RoadMeshRenderer(
    new THREE.Scene(),
    () => 0,
    (id) => (id === ID ? profile : null),
  );
  renderer.setJunctionControls(junction ? [{ x: 5, z: 2, control: junction }] : []);
  renderer.apply(
    tiles.map((t) => ({
      x: t.x,
      z: t.z,
      tier: t.profile === ID ? RoadTier.TwoLane : RoadTier.TwoLane,
      mask:
        (has(t.x, t.z - 1) ? 1 : 0) |
        (has(t.x + 1, t.z) ? 2 : 0) |
        (has(t.x, t.z + 1) ? 4 : 0) |
        (has(t.x - 1, t.z) ? 8 : 0),
      elevation: 0,
      profile: t.profile,
      flow: t.flow,
    })),
  );
  return renderer;
}

/** The parking lane's travel edge and its kerb edge across the street, as world z, on the side that parks. */
function laneEdges(
  profile: RoadProfile,
  flow: RoadFlow,
): { side: 'low' | 'high'; inner: number; outer: number } {
  const drawn = worldOrderedProfile(profile, flow);
  let at = -carriagewayHalfWidthOf(drawn);
  for (const p of drawn.pieces) {
    if (p.kind === 'sidewalk' || p.kind === 'verge') continue;
    const from = at;
    at += p.width;
    if (p.kind !== 'parking') continue;
    const centre = 2.5 * TILE_METERS;
    return from < 0
      ? { side: 'low', inner: centre + at, outer: centre + from }
      : { side: 'high', inner: centre + from, outer: centre + at };
  }
  throw new Error('no parking lane');
}

/** Each run of a colour along a row of constant z from x0 to x1, as [start, end]. */
function runsAlong(
  r: RoadMeshRenderer,
  z: number,
  x0: number,
  x1: number,
  colour: string,
  n = 1600,
): [number, number][] {
  const step = (x1 - x0) / n;
  // A grid query samples n × n, so a long row is read in short pieces.
  const piece = 40;
  const row: (string | null)[] = [];
  for (let i = 0; i < n; i += piece) {
    const count = Math.min(piece, n - i);
    row.push(
      ...r.surfaceGridAt(x0 + i * step, z, x0 + (i + count) * step, z, count).slice(0, count),
    );
  }
  const runs: [number, number][] = [];
  let start = -1;
  row.forEach((c, i) => {
    if (c === colour && start < 0) start = i;
    if (c !== colour && start >= 0) {
      runs.push([x0 + start * step, x0 + i * step]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([x0 + start * step, x1]);
  return runs;
}

/** How many of a 24 × 24 grid of samples over a box show `colour`. */
function colourIn(
  r: RoadMeshRenderer,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  colour: string,
): number {
  return r.surfaceGridAt(x0, z0, x1, z1, 24).filter((c) => c === colour).length;
}

function stallsOf(r: RoadMeshRenderer, side: 'low' | 'high'): KerbStall[] {
  return Array.from({ length: 10 }, (_, x) => r.parkingStallsAt(x, 2, side) ?? []).flat();
}

describe('angled and head-in stall lines on the ground', () => {
  const cases: {
    name: string;
    tier: RoadTier;
    parking: SideChoice;
    flow: RoadFlow;
    downstream: 1 | -1;
  }[] = [
    {
      name: 'a two-way street’s right kerb',
      tier: RoadTier.TwoLane,
      parking: 'right',
      flow: RoadFlow.None,
      downstream: 1,
    },
    {
      name: 'a two-way street’s left kerb',
      tier: RoadTier.TwoLane,
      parking: 'left',
      flow: RoadFlow.None,
      downstream: -1,
    },
    {
      name: 'a one-way street drawn east',
      tier: RoadTier.OneWay,
      parking: 'right',
      flow: RoadFlow.East,
      downstream: 1,
    },
    {
      name: 'a one-way street drawn west',
      tier: RoadTier.OneWay,
      parking: 'right',
      flow: RoadFlow.West,
      downstream: -1,
    },
  ];

  for (const c of cases) {
    it(`slants every angled line 60° with its kerb end upstream on ${c.name}`, () => {
      const profile = styled(c.tier, c.parking, 'angled');
      const r = street(profile, c.flow);
      const { side, inner, outer } = laneEdges(profile, c.flow);
      const sign = Math.sign(outer - inner);
      const stalls = stallsOf(r, side);
      expect(stalls.length).toBeGreaterThan(20);
      const regular = stalls.filter((s) => !s.accessible && s.from > 70 && s.to < 130);
      expect(regular.length).toBeGreaterThan(5);
      // Two rows down the lane, 1 m and 4.5 m in from its travel edge.
      const near = runsAlong(r, inner + sign * 1, 60, 140, WHITE);
      const far = runsAlong(r, inner + sign * 4.5, 60, 140, WHITE);
      const has = (runs: [number, number][], x: number): boolean =>
        runs.some(([a, b]) => x >= a - 0.12 && x <= b + 0.12);
      for (const s of regular) {
        for (const line of [s.from, s.to]) {
          // Upstream is against the traffic: −downstream per metre at 1/tan 60°.
          const at = (depth: number): number => line - (c.downstream * depth) / TAN60;
          expect(has(near, at(1)), `line ${line} at 1 m`).toBe(true);
          expect(has(far, at(4.5)), `line ${line} at 4.5 m`).toBe(true);
          // Not the other way.
          expect(has(far, line + (c.downstream * 4.5) / TAN60), `line ${line} slants back`).toBe(
            false,
          );
        }
      }
      // The lines stop short of the lane's outer edge.
      const edge = runsAlong(
        r,
        outer - sign * (PARKING_TICK_KERB_CLEARANCE_M - 0.05),
        60,
        140,
        WHITE,
      );
      expect(edge).toEqual([]);
    });
  }

  it('lays head-in lines square to the kerb, every 2.6 m', () => {
    const profile = styled(RoadTier.OneWay, 'right', 'headIn');
    const r = street(profile, RoadFlow.East);
    const { side, inner, outer } = laneEdges(profile, RoadFlow.East);
    expect(Math.abs(outer - inner)).toBeCloseTo(PARKING_STYLES.headIn.laneWidth, 9);
    const sign = Math.sign(outer - inner);
    const regular = stallsOf(r, side).filter((s) => !s.accessible && s.from > 70 && s.to < 130);
    expect(regular.length).toBeGreaterThan(10);
    const near = runsAlong(r, inner + sign * 1, 60, 140, WHITE);
    const far = runsAlong(r, inner + sign * 4.5, 60, 140, WHITE);
    for (const s of regular) {
      expect(s.to - s.from).toBeCloseTo(2.6, 9);
      for (const runs of [near, far]) {
        expect(runs.some(([a, b]) => s.from >= a - 0.12 && s.from <= b + 0.12)).toBe(true);
      }
    }
  });
});

describe('a block face’s accessible stalls on the ground', () => {
  it('marks no angled stall whose footprint reaches into a junction’s no-parking zone', () => {
    const profile = styled(RoadTier.TwoLane, 'right', 'angled');
    const r = street(profile, RoadFlow.None, 'allWayStop');
    const { side, inner, outer } = laneEdges(profile, RoadFlow.None);
    const s = side === 'low' ? 0 : 1;
    const before = r.parkingSetbacksAt(4, 2)!.hi![s];
    const after = r.parkingSetbacksAt(6, 2)!.lo![s];
    const zoneFrom = 5 * TILE_METERS - before;
    const zoneTo = 6 * TILE_METERS + after;
    const depth = Math.abs(outer - inner);
    for (const stall of stallsOf(r, side)) {
      const reach = (-1 / TAN60) * depth;
      const from = stall.from + Math.min(0, reach);
      const to = stall.to + Math.max(0, reach);
      expect(to <= zoneFrom + 1e-6 || from >= zoneTo - 1e-6, `stall ${stall.from}`).toBe(true);
    }
    // No paint across the lane inside the zone.
    const sign = Math.sign(outer - inner);
    for (const d of [1, 3, 5]) {
      const white = runsAlong(r, inner + sign * d, zoneFrom + 0.2, zoneTo - 0.2, WHITE);
      expect(white, `${d} m into the lane`).toEqual([]);
    }
  });

  it('puts one symbol in each accessible stall, at the end beside the crossing, and hatches its aisle', () => {
    const profile = styled(RoadTier.TwoLane, 'right', 'angled');
    const r = street(profile, RoadFlow.None, 'allWayStop');
    const { side, inner, outer } = laneEdges(profile, RoadFlow.None);
    const depth = Math.abs(outer - inner);
    const middle = (inner + outer) / 2;
    const stalls = stallsOf(r, side);
    const west = stalls.filter((s) => s.centre < 5 * TILE_METERS);
    const east = stalls.filter((s) => s.centre > 6 * TILE_METERS);
    for (const [face, junctionEnd] of [
      [west, 'hi'],
      [east, 'lo'],
    ] as const) {
      const ordered = [...face].sort((a, b) => a.from - b.from);
      const count = ordered.filter((s) => s.accessible).length;
      expect(count).toBeGreaterThanOrEqual(1);
      // Together, at the block face's end at the junction, which has the crossing.
      const end = junctionEnd === 'hi' ? ordered.slice(-count) : ordered.slice(0, count);
      expect(end.every((s) => s.accessible)).toBe(true);
    }
    for (const s of stalls) {
      // The symbol is centred in the stall, and only an accessible one has it.
      const blue = colourIn(r, s.centre - 1, middle - 1, s.centre + 1, middle + 1, BLUE);
      expect(blue > 0, `symbol in the stall at ${s.centre}`).toBe(s.accessible);
      if (!s.accessible) continue;
      // Its aisle is hatched: white inside it, clear of the lines bounding it.
      const aisle = s.aisle!;
      const mid = (aisle.from + aisle.to) / 2 + (-1 / TAN60) * (depth / 2);
      const half = (aisle.to - aisle.from) / 2 - 0.45;
      expect(
        colourIn(r, mid - half, middle - 0.4, mid + half, middle + 0.4, WHITE),
      ).toBeGreaterThan(0);
    }
  });

  it('marks a parallel lane’s accessible stall 7.3 m long, inside the 6.1–7.9 m rule, with its symbol', () => {
    const profile = styled(RoadTier.TwoLane, 'right', 'parallel');
    const r = street(profile, RoadFlow.None, 'allWayStop');
    const { side, inner, outer } = laneEdges(profile, RoadFlow.None);
    const middle = (inner + outer) / 2;
    const stalls = stallsOf(r, side);
    expect(stalls.filter((s) => s.accessible)).toHaveLength(2);
    for (const s of stalls) {
      expect(s.to - s.from).toBeGreaterThanOrEqual(6.1 - 1e-6);
      expect(s.to - s.from).toBeLessThanOrEqual(7.9 + 1e-6);
      if (s.accessible) expect(s.to - s.from).toBeCloseTo(7.3, 9);
      const blue = colourIn(r, s.centre - 1, middle - 1.2, s.centre + 1, middle + 1.2, BLUE);
      expect(blue > 0, `symbol in the stall at ${s.centre}`).toBe(s.accessible);
    }
  });
});
