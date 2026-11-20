import { describe, expect, it } from 'vitest';
import {
  ASPECT,
  BUILDING_VIEWS,
  FACE_PITCH,
  HUD,
  MARGIN,
  MAX_DISTANCE,
  MAX_PITCH,
  MIN_DISTANCE,
  MIN_PITCH,
  PAD,
  ROAD_VIEWS,
  buildingView,
  roadView,
  rowGaps,
  threeQuarterView,
  type BuildingBox,
  type Camera,
} from '../../tools/shots/lib/views.mjs';

const TILE = 20;
const EPS = 1e-6;

/** Where a world point lands in the frame (0..1 across, 0..1 down), by a look-at projection
 * built from the eye and target alone, so it shares no maths with the view code. */
function project(
  cam: Camera,
  p: [number, number, number],
): { x: number; y: number; depth: number } {
  const target = [(cam.tx + 0.5) * TILE, 0, (cam.tz + 0.5) * TILE];
  const eye = [
    target[0]! + cam.distance * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    target[1]! + cam.distance * Math.sin(cam.pitch),
    target[2]! + cam.distance * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  ];
  const norm = (v: number[]) => v.map((c) => c / Math.hypot(...v));
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const forward = norm(target.map((c, i) => c - eye[i]!));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const rel = p.map((c, i) => c - eye[i]!);
  const depth = dot(rel, forward);
  const half = Math.tan(Math.PI / 8);
  return {
    x: 0.5 + dot(rel, right) / (depth * half * ASPECT) / 2,
    y: 0.5 - dot(rel, up) / (depth * half) / 2,
    depth,
  };
}

/** The tile-coordinate box of a footprint whose top-left tile is (x, z), as the series builds it. */
const boxAt = (x: number, z: number, w: number, d: number, h: number): BuildingBox => ({
  w,
  d,
  h,
  tile: TILE,
  cx: x + (w - 1) / 2,
  cz: z + (d - 1) / 2,
});

/** World corners of a box: the footprint spans whole tiles from (x, z). */
function cornersOf(x: number, z: number, w: number, d: number, h: number, pad = 0) {
  const out: [number, number, number][] = [];
  for (const px of [x * TILE - pad, (x + w) * TILE + pad])
    for (const pz of [z * TILE - pad, (z + d) * TILE + pad])
      for (const py of [0, h]) out.push([px, py, pz]);
  return out;
}

const inside = (s: { x: number; y: number }) =>
  s.x >= MARGIN - EPS &&
  s.x <= 1 - MARGIN + EPS &&
  s.y >= MARGIN - EPS &&
  s.y <= 1 - MARGIN - HUD + EPS;

const SUBJECTS = [
  { name: 'a 1x1 hut', x: 60, z: 40, w: 1, d: 1, h: 3 },
  { name: 'a 5x3 hospital 27 m tall', x: 73, z: 22, w: 5, d: 3, h: 27 },
  { name: 'a 20x20 park', x: 30, z: 30, w: 20, d: 20, h: 0.5 },
];

describe('building views', () => {
  for (const s of SUBJECTS) {
    describe(s.name, () => {
      const box = boxAt(s.x, s.z, s.w, s.d, s.h);
      for (const view of BUILDING_VIEWS) {
        it(`${view} keeps every corner inside the margins and the camera inside its limits`, () => {
          const cam = buildingView(view, box);
          for (const c of cornersOf(s.x, s.z, s.w, s.d, s.h))
            expect(inside(project(cam, c))).toBe(true);
          expect(cam.distance).toBeGreaterThanOrEqual(MIN_DISTANCE);
          expect(cam.distance).toBeLessThanOrEqual(MAX_DISTANCE);
          expect(cam.pitch).toBeGreaterThanOrEqual(MIN_PITCH);
          expect(cam.pitch).toBeLessThanOrEqual(MAX_PITCH);
        });
      }
      it('the night three-quarter frames the whole box too', () => {
        const cam = threeQuarterView(box);
        for (const c of cornersOf(s.x, s.z, s.w, s.d, s.h))
          expect(inside(project(cam, c))).toBe(true);
      });
    });
  }

  it('keeps the verge, drive and first lane in frame: the footprint plus PAD metres fits every view', () => {
    for (const s of SUBJECTS) {
      for (const view of BUILDING_VIEWS) {
        const cam = buildingView(view, boxAt(s.x, s.z, s.w, s.d, s.h));
        for (const c of cornersOf(s.x, s.z, s.w, s.d, s.h, PAD))
          expect(inside(project(cam, c))).toBe(true);
      }
    }
  });

  it('is no further away than it must be: the hospital front fills its limiting margin', () => {
    const s = SUBJECTS[1]!;
    const cam = buildingView('front', boxAt(s.x, s.z, s.w, s.d, s.h));
    const pts = cornersOf(s.x, s.z, s.w, s.d, s.h, PAD).map((c) => project(cam, c));
    const slack = Math.min(
      ...pts.flatMap((p) => [p.x - MARGIN, 1 - MARGIN - p.x, p.y - MARGIN, 1 - MARGIN - HUD - p.y]),
    );
    expect(slack).toBeLessThan(0.01);
  });

  it('puts the front on the street side: the camera stands on the street side of the box', () => {
    const s = SUBJECTS[1]!;
    for (const [street, axis, sign] of [
      ['S', 'z', 1],
      ['N', 'z', -1],
      ['E', 'x', 1],
      ['W', 'x', -1],
    ] as const) {
      const cam = buildingView('front', { ...boxAt(s.x, s.z, s.w, s.d, s.h), street });
      const eye =
        axis === 'z'
          ? Math.cos(cam.pitch) * Math.cos(cam.yaw)
          : Math.cos(cam.pitch) * Math.sin(cam.yaw);
      expect(Math.sign(eye)).toBe(sign);
    }
  });

  it('keeps the box inside the margins when the street is east or west', () => {
    const s = SUBJECTS[1]!;
    for (const street of ['E', 'W'] as const) {
      // Turned a quarter: the footprint is 3 wide and 5 deep on the map.
      const cam = buildingView('front', {
        ...boxAt(s.x, s.z, s.d, s.w, s.h),
        w: s.w,
        d: s.d,
        street,
      });
      for (const c of cornersOf(s.x, s.z, s.d, s.w, s.h))
        expect(inside(project(cam, c))).toBe(true);
    }
  });

  it('rejects a view that does not exist', () => {
    expect(() => buildingView('below', boxAt(1, 1, 1, 1, 3))).toThrow(/unknown building view/);
  });
});

describe('road views', () => {
  for (const axis of ['x', 'z'] as const) {
    for (const view of ROAD_VIEWS) {
      it(`${view} keeps a ${axis} run of six tiles inside the margins`, () => {
        const run = { x0: 50, z0: 70, length: 6, tile: TILE, axis };
        const cam = roadView(view, run);
        const sx = axis === 'x' ? 6 : 1;
        const sz = axis === 'x' ? 1 : 6;
        for (const c of cornersOf(run.x0, run.z0, sx, sz, 0))
          expect(inside(project(cam, c))).toBe(true);
      });
    }
  }

  it('looks down the centreline in the along view: the eye is level with the run', () => {
    const cam = roadView('along', { x0: 50, z0: 70, length: 6, tile: TILE });
    expect(Math.abs(Math.cos(cam.yaw))).toBeLessThan(EPS);
    expect(cam.pitch).toBeLessThan(FACE_PITCH);
  });
});

describe('row spacing', () => {
  const row = [
    { w: 5, d: 3, h: 27 },
    { w: 1, d: 2, h: 6.4 },
    { w: 2, d: 2, h: 6.4 },
    { w: 3, d: 3, h: 3.2 },
  ].map((b) => ({ ...b, tile: TILE }));

  it('leaves one gap per pair, wider beside the tall building', () => {
    const gaps = rowGaps(row);
    expect(gaps).toHaveLength(3);
    expect(gaps[0]!).toBeGreaterThan(gaps[2]!);
  });

  it('keeps every neighbour out of a side view: its corners fall below the frame', () => {
    const gaps = rowGaps(row);
    // Subject i stands at the origin; its east neighbour starts `gap` tiles past its east wall
    // and is seen from the east, where the camera looks back over it.
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i]!;
      const b = row[i + 1]!;
      const cam = buildingView('right', { ...a, cx: 0, cz: 0 });
      // Tile 0's centre is at TILE / 2 metres; the neighbour shares its z centre.
      const west = TILE / 2 + (a.w * TILE) / 2 + gaps[i]! * TILE;
      for (const x of [west, west + b.w * TILE])
        for (const z of [TILE / 2 - (b.d * TILE) / 2, TILE / 2 + (b.d * TILE) / 2])
          for (const y of [0, b.h]) {
            const s = project(cam, [x, y, z]);
            expect(s.depth <= 0 || s.y > 1 || s.x < 0 || s.x > 1).toBe(true);
          }
    }
  });
});
