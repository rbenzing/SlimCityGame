import { describe, expect, it } from 'vitest';
import {
  roadTileVertices,
  BIKE_LANE_PAINT_COLOR,
  BUS_LANE_PAINT_COLOR,
  MARKING_COLOR,
  kerbReturnFor,
  RoadMeshRenderer,
} from './roadsmesh';
import * as THREE from 'three';
import { RoadFlow, RoadTier } from '../shared/types';
import type { JunctionControl } from '../shared/types';
import { carriagewaySpans } from '../shared/travellanes';
import { carriagewayHalfWidthOf, kerbWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { junctionArmLayout } from '../shared/junctionpaint';
import { TILE_METERS } from '../shared/constants';

const flatHeightAt = (): number => 0;
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const centre = 5.5 * TILE_METERS;

type Buf = { positions: number[]; colors: number[] };
type Box = { x0: number; x1: number; z0: number; z1: number };

const near = (c: ArrayLike<number>, k: readonly [number, number, number]): boolean =>
  Math.abs(c[0]! - k[0]) < 0.02 && Math.abs(c[1]! - k[1]) < 0.02 && Math.abs(c[2]! - k[2]) < 0.02;

/** Every axis-aligned rectangle (a pair of triangles) of the given colour, in tile-local metres. */
function rectsOf(v: Buf, colour: readonly [number, number, number]): Box[] {
  const out: Box[] = [];
  for (let q = 0; q + 18 <= v.positions.length; q += 18) {
    if (!near(v.colors.slice(q, q + 3), colour)) continue;
    const xs: number[] = [];
    const zs: number[] = [];
    for (let k = 0; k < 6; k++) {
      xs.push(v.positions[q + k * 3]! - centre);
      zs.push(v.positions[q + k * 3 + 2]! - centre);
    }
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    const tri = (a: number, b: number, c: number): number =>
      Math.abs((xs[b]! - xs[a]!) * (zs[c]! - zs[a]!) - (xs[c]! - xs[a]!) * (zs[b]! - zs[a]!)) / 2;
    if (Math.abs(tri(0, 1, 2) + tri(3, 4, 5) - (x1 - x0) * (z1 - z0)) > 1e-6) continue;
    out.push({ x0, x1, z0, z1 });
  }
  return out;
}

const WHITE = MARKING_COLOR;

function crossroads(tier: RoadTier, mask = N | E | S | W): Buf {
  return roadTileVertices(
    5,
    5,
    tier,
    mask,
    flatHeightAt,
    { n: tier, s: tier, e: tier, w: tier },
    undefined,
    undefined,
    undefined,
    'allWayStop',
  );
}

describe('a stop line crosses every lane arriving, reserved lanes included', () => {
  for (const [name, tier, kind] of [
    ['bus lane', RoadTier.BusLane, 'bus'],
    ['bike lane', RoadTier.BikeLane, 'bike'],
  ] as const) {
    it(`spans the ${name} beside the travel lane on the arriving side`, () => {
      const v = crossroads(tier);
      const stops = rectsOf(v, WHITE).filter(
        (b) => Math.abs(b.z1 - b.z0 - 0.4) < 0.02 && b.x1 - b.x0 > 3 && b.z1 < 0,
      );
      expect(stops.length).toBeGreaterThan(0);
      const reserved = carriagewaySpans(presetProfileForTier(tier)).filter(
        (s) => s.piece.kind === kind,
      );
      expect(reserved.length).toBeGreaterThan(0);
      const covered = reserved.filter((r) =>
        stops.some((s) => s.x0 <= r.from + 1e-6 && s.x1 >= r.to - 1e-6),
      );
      expect(covered.length).toBeGreaterThan(0);
    });
  }
});

/** Every vertex of one colour, in tile-local metres. */
function vertsOf(v: Buf, colour: readonly [number, number, number]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < v.colors.length; i += 3) {
    if (near(v.colors.slice(i, i + 3), colour))
      out.push([v.positions[i]! - centre, v.positions[i + 2]! - centre]);
  }
  return out;
}

/** A tile of `tier` with the arms in `mask` carried by the same tier, drawn with a control. */
function tile(tier: RoadTier, mask: number, control: JunctionControl = 'allWayStop'): Buf {
  const arm = (bit: number): RoadTier => ((mask & bit) !== 0 ? tier : RoadTier.None);
  return roadTileVertices(
    5,
    5,
    tier,
    mask,
    flatHeightAt,
    { n: arm(N), e: arm(E), s: arm(S), w: arm(W) },
    undefined,
    undefined,
    undefined,
    control,
  );
}

describe('the far side of a T keeps the reserved lane, its colour and its lines', () => {
  for (const [name, tier, colour] of [
    ['bus lane', RoadTier.BusLane, BUS_LANE_PAINT_COLOR],
    ['bike lane', RoadTier.BikeLane, BIKE_LANE_PAINT_COLOR],
  ] as const) {
    it(`carries a ${name} across the whole tile on the side with no arm`, () => {
      // The arm to the south is missing, so the east-west road runs past on that side.
      // Nothing controls the junction, so no crossing or stop line interrupts the lane.
      const v = tile(tier, N | E | W, 'none');
      const south = rectsOf(v, colour)
        .filter((b) => b.z0 > 0 && b.z1 - b.z0 > 1)
        .sort((a, b) => a.x0 - b.x0);
      expect(south.length).toBeGreaterThan(0);
      let reach = -TILE_METERS / 2;
      for (const b of south) {
        expect(b.x0).toBeLessThanOrEqual(reach + 1e-6);
        reach = Math.max(reach, b.x1);
      }
      expect(reach).toBeGreaterThanOrEqual(TILE_METERS / 2 - 1e-6);
    });
  }
});

describe('a bend carries the reserved lane on the road’s arc', () => {
  for (const [name, tier, colour] of [
    ['bus lane', RoadTier.BusLane, BUS_LANE_PAINT_COLOR],
    ['bike lane', RoadTier.BikeLane, BIKE_LANE_PAINT_COLOR],
  ] as const) {
    it(`paints the ${name} from one opening of the turn to the other`, () => {
      const v = tile(tier, S | E, 'none');
      const pts = vertsOf(v, colour);
      expect(pts.length).toBeGreaterThan(0);
      const half = TILE_METERS / 2;
      expect(pts.some(([x]) => Math.abs(Math.abs(x) - half) < 1e-6)).toBe(true);
      expect(pts.some(([, z]) => Math.abs(Math.abs(z) - half) < 1e-6)).toBe(true);
    });
  }
});

describe('through a junction box nothing solid continues', () => {
  const box = (tier: RoadTier): number => carriagewayHalfWidthOf(presetProfileForTier(tier));
  const inBox = (b: Box, h: number): boolean =>
    b.x0 > -h + 0.05 && b.x1 < h - 0.05 && b.z0 > -h + 0.05 && b.z1 < h - 0.05;

  it('runs a bike lane through a crossroads as dotted lines of 0.6 m with green only between each pair', () => {
    const v = crossroads(RoadTier.BikeLane);
    const h = box(RoadTier.BikeLane);
    // The kerb-side dash lies on the box's edge, so the box here is a hair wider.
    const white = rectsOf(v, WHITE).filter((b) => inBox(b, h + 0.3));
    const dashes = white.filter((b) => Math.max(b.x1 - b.x0, b.z1 - b.z0) < 1);
    expect(dashes.length).toBeGreaterThan(4);
    for (const b of white) expect(Math.max(b.x1 - b.x0, b.z1 - b.z0)).toBeCloseTo(0.6, 3);
    const cells = rectsOf(v, BIKE_LANE_PAINT_COLOR).filter((b) => inBox(b, h));
    expect(cells.length).toBeGreaterThan(2);
    // Every dash has a partner across the lane, and green fills exactly that span.
    expect(cells.length).toBe(dashes.length / 2);
    const near01 = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
    for (const c of cells) {
      // A cell is as long as one dash, and spans the lane in the other direction.
      const alongZ = Math.abs(c.z1 - c.z0 - 0.6) < 1e-3;
      const alongX = Math.abs(c.x1 - c.x0 - 0.6) < 1e-3;
      expect(alongZ || alongX).toBe(true);
      const partners = dashes.filter((d) =>
        alongZ
          ? near01(d.z0, c.z0) && near01(d.z1, c.z1)
          : near01(d.x0, c.x0) && near01(d.x1, c.x1),
      );
      const low = partners.some((d) => near01(alongZ ? d.x1 : d.z1, alongZ ? c.x0 : c.z0));
      const high = partners.some((d) => near01(alongZ ? d.x0 : d.z0, alongZ ? c.x1 : c.z1));
      expect(low).toBe(true);
      expect(high).toBe(true);
    }
  });

  it('keeps a bike lane whole on the side of a T that has no arm, dotted only across an arm', () => {
    // The arm to the south is missing: the lane south of the box is the plain lane.
    const v = tile(RoadTier.BikeLane, N | E | W);
    const h = box(RoadTier.BikeLane);
    const dashes = rectsOf(v, WHITE).filter(
      (b) => inBox(b, h) && Math.max(b.x1 - b.x0, b.z1 - b.z0) < 1,
    );
    expect(dashes.filter((b) => b.z0 > 0)).toEqual([]);
    expect(dashes.filter((b) => b.z1 < 0).length).toBeGreaterThan(0);
  });

  it('carries nothing through the box on an axis whose far side has no lane', () => {
    // No west arm: the east arm's lane has nowhere to go, so nothing runs east-west in the box.
    const v = tile(RoadTier.BikeLane, N | E | S);
    const h = box(RoadTier.BikeLane);
    const eastWest = [...rectsOf(v, WHITE), ...rectsOf(v, BIKE_LANE_PAINT_COLOR)].filter(
      (b) => inBox(b, h) && b.x1 - b.x0 <= 1.2 + 1e-6 && b.x1 - b.x0 > b.z1 - b.z0,
    );
    expect(eastWest).toEqual([]);
  });

  it('never lays a lane colour in a crosswalk', () => {
    for (const [tier, colour] of [
      [RoadTier.BikeLane, BIKE_LANE_PAINT_COLOR],
      [RoadTier.BusLane, BUS_LANE_PAINT_COLOR],
    ] as const) {
      const v = crossroads(tier);
      const bars = rectsOf(v, WHITE).filter(
        (b) => Math.abs(Math.min(b.x1 - b.x0, b.z1 - b.z0) - 0.45) < 0.02,
      );
      expect(bars.length).toBeGreaterThan(8);
      for (const p of vertsOf(v, colour)) {
        for (const b of bars) {
          const inside =
            p[0] > b.x0 + 1e-3 && p[0] < b.x1 - 1e-3 && p[1] > b.z0 + 1e-3 && p[1] < b.z1 - 1e-3;
          expect(inside).toBe(false);
        }
      }
    }
  });
});

describe('a reserved lane on the side of a signalised T with no arm', () => {
  const hex = (c: readonly [number, number, number]): string =>
    c.map((q) => q.toFixed(2)).join(',');
  for (const [name, tier, kind, colour] of [
    ['bus lane', RoadTier.BusLane, 'bus', BUS_LANE_PAINT_COLOR],
    ['bike lane', RoadTier.BikeLane, 'bike', BIKE_LANE_PAINT_COLOR],
  ] as const) {
    it(`lays no ${name} colour in a crosswalk`, () => {
      const v = tile(tier, N | E | W, 'signal');
      const bars = rectsOf(v, WHITE).filter(
        (b) => Math.abs(Math.min(b.x1 - b.x0, b.z1 - b.z0) - 0.45) < 0.02,
      );
      expect(bars.length).toBeGreaterThan(8);
      for (const p of vertsOf(v, colour)) {
        for (const b of bars) {
          const inside =
            p[0] > b.x0 + 1e-3 && p[0] < b.x1 - 1e-3 && p[1] > b.z0 + 1e-3 && p[1] < b.z1 - 1e-3;
          expect(inside).toBe(false);
        }
      }
    });

    it(`keeps the ${name} bare only from the stop line to the crossing, and inside it`, () => {
      // Arms west, east and north of (5, 5); nothing south, so the east-west road runs past there.
      const tiles = [
        [4, 5],
        [5, 5],
        [6, 5],
        [5, 4],
      ];
      const has = (x: number, z: number): boolean => tiles.some(([a, b]) => a === x && b === z);
      const renderer = new RoadMeshRenderer(new THREE.Scene(), flatHeightAt);
      renderer.setJunctionControls([{ x: 5, z: 5, control: 'signal' }]);
      renderer.apply(
        tiles.map(([x, z]) => ({
          x: x!,
          z: z!,
          tier,
          mask:
            (has(x!, z! - 1) ? N : 0) |
            (has(x! + 1, z!) ? E : 0) |
            (has(x!, z! + 1) ? S : 0) |
            (has(x! - 1, z!) ? W : 0),
          elevation: 0,
          profile: tier,
          flow: RoadFlow.None,
        })),
      );
      const south = carriagewaySpans(presetProfileForTier(tier)).find(
        (s) => s.piece.kind === kind && s.from > 0,
      )!;
      const z = 5.5 * TILE_METERS + (south.from + south.to) / 2;
      const profile = presetProfileForTier(tier);
      const layout = junctionArmLayout(carriagewayHalfWidthOf(profile), kerbWidthOf(profile));
      const centreX = 5.5 * TILE_METERS;
      const colourAt = (d: number): string | null =>
        renderer.surfaceGridAt(centreX + d, z, centreX + d, z, 1)[0]!;
      const lane = hex(colour);
      for (const sign of [-1, 1]) {
        const at = (d: number): string | null => colourAt(sign * d);
        // Red or green through the middle, up to the crossing, and past the stop line.
        expect(at(0)).toBe(lane);
        expect(at(layout.crosswalkNear - 0.3)).toBe(lane);
        expect(at(layout.stopLineFar + 0.3)).toBe(lane);
        // Inside the crossing the lane is bare: between its bars is asphalt.
        for (let d = layout.crosswalkNear + 0.05; d < layout.crosswalkFar - 0.05; d += 0.1) {
          expect(at(d)).not.toBe(lane);
        }
      }
      // Only the arriving end has a stop line, and the lane is bare up to it from the crossing.
      const gap = (layout.crosswalkFar + layout.stopLineNear) / 2;
      const bareGaps = [-1, 1].filter((sign) => colourAt(sign * gap) !== lane);
      expect(bareGaps.length).toBe(1);
    });
  }
});

describe('the painted edge lies on the kerb return', () => {
  it('fills the lane between the edge line and the kerb all the way round a corner', () => {
    const tier = RoadTier.BikeLane;
    const profile = presetProfileForTier(tier);
    const half = carriagewayHalfWidthOf(profile);
    const R = kerbReturnFor(profile, TILE_METERS / 2 - half);
    const anchor = half + R;
    const v = tile(tier, N | E | S | W, 'none');
    // The corner at +x, -z: its kerb arc is centred on (anchor, -anchor).
    const dist = ([x, z]: [number, number]): number => Math.hypot(x - anchor, z + anchor);
    const inCorner = ([x, z]: [number, number]): boolean =>
      x > half + 0.01 && x < anchor - 0.01 && z < -half - 0.01 && z > -anchor + 0.01;
    const green = vertsOf(v, BIKE_LANE_PAINT_COLOR).filter(inCorner);
    expect(green.length).toBeGreaterThan(8);
    // Nothing past the kerb, and the colour reaches it: it fills the return up to the edge line.
    for (const p of green) expect(dist(p)).toBeGreaterThanOrEqual(R - 1e-6);
    expect(Math.min(...green.map(dist))).toBeLessThan(R + 0.05);
    // The edge line is the same arc, one lane's width in from the kerb: it bounds the colour.
    const arc = ([x, z]: [number, number]): boolean => x < anchor - 1 && z > -anchor + 1;
    const widest = Math.max(...green.map(dist));
    // The colour is the lane's 1.6 m and the line stands just inside it, as on the straight.
    expect(widest).toBeCloseTo(R + 1.6, 2);
    // The line (3.75 m from the centre, 1.875 m in from the kerb) is the same arc at that offset.
    const line = vertsOf(v, WHITE).filter((p) => arc(p) && Math.abs(dist(p) - (R + 1.875)) < 0.2);
    expect(line.length).toBeGreaterThan(12);
    for (const p of line) expect(Math.abs(dist(p) - (R + 1.875))).toBeLessThan(0.1);
  });
});
