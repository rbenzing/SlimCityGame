import { describe, expect, it } from 'vitest';
import {
  ACCESSIBLE_AISLE_WIDTH_M,
  ACCESSIBLE_PARALLEL_STALL_M,
  ACCESSIBLE_STALL_WIDTH_M,
  accessibleStallCount,
  downstreamBeside,
  kerbOrientation,
  layKerbFace,
  PARKING_END_STALL_M,
  PARKING_STALL_LENGTH_M,
  PARKING_STALL_MAX_M,
  type KerbFace,
  type KerbOrientation,
} from './kerbstalls';
import {
  composeProfile,
  NO_EDITS,
  PARKING_STYLES,
  presetProfileForTier,
} from '../shared/roadprofile';
import { RoadFlow, RoadTier, storedFlow } from '../shared/types';
import type { RoadProfile } from '../shared/types';

const SIN60 = Math.sin(Math.PI / 3);

describe('accessibleStallCount — PROWAG Table R211', () => {
  it('asks one space per 25 to 100, one per 50 to 200, then 4% rounded up', () => {
    const table: [number, number][] = [
      [0, 0],
      [1, 1],
      [25, 1],
      [26, 2],
      [50, 2],
      [51, 3],
      [75, 3],
      [76, 4],
      [100, 4],
      [101, 5],
      [150, 5],
      [151, 6],
      [200, 6],
      [201, 9],
      [250, 10],
    ];
    for (const [marked, accessible] of table) {
      expect(accessibleStallCount(marked), `${marked} stalls`).toBe(accessible);
    }
  });
});

describe('which way the traffic beside a parking lane runs', () => {
  const twoWay = presetProfileForTier(RoadTier.TwoLane);
  const oneWay = presetProfileForTier(RoadTier.OneWay);

  it('keeps right on a two-way road: east on the high side along x, north on it along z', () => {
    expect(downstreamBeside(twoWay, RoadFlow.None, true, 'high')).toBe(1);
    expect(downstreamBeside(twoWay, RoadFlow.None, true, 'low')).toBe(-1);
    expect(downstreamBeside(twoWay, RoadFlow.None, false, 'high')).toBe(-1);
    expect(downstreamBeside(twoWay, RoadFlow.None, false, 'low')).toBe(1);
    // A two-way road's stored direction does not change which side runs which way.
    expect(downstreamBeside(twoWay, RoadFlow.West, true, 'high')).toBe(1);
  });

  it('follows a one-way road’s stored flow on both kerbs, masked', () => {
    for (const side of ['low', 'high'] as const) {
      expect(downstreamBeside(oneWay, RoadFlow.East, true, side)).toBe(1);
      expect(downstreamBeside(oneWay, RoadFlow.West, true, side)).toBe(-1);
      expect(downstreamBeside(oneWay, RoadFlow.North, false, side)).toBe(-1);
      expect(downstreamBeside(oneWay, storedFlow(RoadFlow.South, 'left'), false, side)).toBe(1);
    }
  });

  it('runs against the drawing on a corridor half whose lanes run back', () => {
    const back: RoadProfile = {
      ...oneWay,
      pieces: oneWay.pieces.map((p) => (p.kind === 'travel' ? { ...p, flow: 'back' } : p)),
    };
    expect(downstreamBeside(back, RoadFlow.East, true, 'high')).toBe(-1);
  });
});

describe('kerbOrientation — how a lane’s stalls and cars lie', () => {
  it('slants an angled stall’s kerb end upstream and backs the car out with the traffic', () => {
    for (const downstream of [1, -1] as const) {
      const o = kerbOrientation('angled', true, 'high', downstream);
      // The kerb end lies against the traffic: 1/tan 60° per metre of depth.
      expect(o.slant).toBeCloseTo(-downstream / Math.tan(Math.PI / 3), 9);
      // The nose points along the traffic and out toward the lane (−z on the high side).
      const yaw = o.yaw!;
      expect(Math.sign(Math.sin(yaw))).toBe(downstream);
      expect(Math.cos(yaw)).toBeLessThan(0);
      expect(Math.abs(Math.sin(yaw))).toBeCloseTo(0.5, 9);
    }
  });

  it('noses a head-in car at the kerb, square to it', () => {
    const high = kerbOrientation('headIn', true, 'high', 1);
    expect(high.slant).toBe(0);
    expect(Math.sin(high.yaw!)).toBeCloseTo(0, 9);
    expect(Math.cos(high.yaw!)).toBeCloseTo(1, 9);
    const lowZ = kerbOrientation('headIn', false, 'low', 1);
    expect(Math.sin(lowZ.yaw!)).toBeCloseTo(-1, 9);
  });

  it('puts the passenger door on the car’s right', () => {
    // Backed into the right kerb of eastbound traffic, a car faces east-ish:
    // its right is downstream. Nosed into the same kerb, it faces south and
    // its right is upstream.
    expect(kerbOrientation('angled', true, 'high', 1).passenger).toBe(1);
    expect(kerbOrientation('headIn', true, 'high', 1).passenger).toBe(-1);
    // On a one-way's left kerb the angled car's right is upstream.
    expect(kerbOrientation('angled', true, 'low', 1).passenger).toBe(-1);
  });

  it('leaves a parallel lane’s cars to the row', () => {
    expect(kerbOrientation('parallel', true, 'high', 1)).toMatchObject({ slant: 0, yaw: null });
  });
});

/** Where a stall's footprint runs along the kerb, its slant included. */
function footprint(face: KerbFace, depth: number, s: { from: number; to: number }) {
  const reach = face.slant * depth;
  return { from: s.from + Math.min(0, reach), to: s.to + Math.max(0, reach) };
}

describe('layKerbFace — an angled or head-in block face', () => {
  const depth = PARKING_STYLES.angled.laneWidth;
  const eastbound: KerbOrientation = kerbOrientation('angled', true, 'high', 1);

  it('pitches its stalls 3.0 m from world metre 0, every footprint inside the face', () => {
    const face = layKerbFace({
      style: 'angled',
      orientation: eastbound,
      depth,
      lo: 100.4,
      hi: 161.3,
      accessibleEnd: 'hi',
    });
    const regular = face.stalls.filter((s) => !s.accessible);
    expect(regular.length).toBeGreaterThan(10);
    for (const s of regular) {
      expect(s.to - s.from).toBeCloseTo(PARKING_STYLES.angled.pitch, 9);
      expect(Math.abs(s.from / 3 - Math.round(s.from / 3))).toBeLessThan(1e-9);
    }
    for (const s of face.stalls) {
      const f = footprint(face, depth, s);
      expect(f.from).toBeGreaterThanOrEqual(100.4 - 1e-6);
      expect(f.to).toBeLessThanOrEqual(161.3 + 1e-6);
      // The car stands in the middle of the parallelogram.
      expect(s.centre).toBeCloseTo((s.from + s.to) / 2 + (face.slant * depth) / 2, 9);
    }
    // Every stall is bounded by two of the face's lines.
    for (const s of face.stalls) {
      expect(face.lines.some((l) => Math.abs(l - s.from) < 1e-6)).toBe(true);
      expect(face.lines.some((l) => Math.abs(l - s.to) < 1e-6)).toBe(true);
    }
  });

  it('marks no stall whose footprint reaches where the lane is not its full depth', () => {
    const shallow = { from: 120, to: 130 };
    const face = layKerbFace({
      style: 'angled',
      orientation: eastbound,
      depth,
      lo: 100,
      hi: 160,
      accessibleEnd: 'lo',
      fullDepth: (from, to) => to <= shallow.from || from >= shallow.to,
    });
    for (const s of face.stalls) {
      const f = footprint(face, depth, s);
      expect(f.to <= shallow.from + 1e-6 || f.from >= shallow.to - 1e-6).toBe(true);
    }
  });

  it('puts its accessible stall at the asked end: 3.35 m wide with a 1.5 m aisle on the passenger side', () => {
    for (const end of ['lo', 'hi'] as const) {
      for (const orientation of [eastbound, kerbOrientation('angled', true, 'low', -1)]) {
        const face = layKerbFace({
          style: 'angled',
          orientation,
          depth,
          lo: 100,
          hi: 160,
          accessibleEnd: end,
        });
        const accessible = face.stalls.filter((s) => s.accessible);
        expect(accessible).toHaveLength(1);
        const stall = accessible[0]!;
        expect(stall.to - stall.from).toBeCloseTo(ACCESSIBLE_STALL_WIDTH_M.angled / SIN60, 9);
        const aisle = stall.aisle!;
        expect(aisle.to - aisle.from).toBeCloseTo(ACCESSIBLE_AISLE_WIDTH_M.angled / SIN60, 9);
        // The aisle lies on the passenger side, against the stall.
        if (orientation.passenger > 0) expect(aisle.from).toBeCloseTo(stall.to, 9);
        else expect(aisle.to).toBeCloseTo(stall.from, 9);
        // It stands at the asked end, before every regular stall.
        const regular = face.stalls.filter((s) => !s.accessible);
        if (end === 'lo') expect(Math.min(stall.from, aisle.from)).toBeLessThan(regular[0]!.from);
        else expect(Math.max(stall.to, aisle.to)).toBeGreaterThan(regular.at(-1)!.to);
        // The regular stalls resume on the pitch, beside the group.
        const groupEdge =
          end === 'lo' ? Math.max(stall.to, aisle.to) : Math.min(stall.from, aisle.from);
        expect(Math.abs(groupEdge / 3 - Math.round(groupEdge / 3))).toBeLessThan(1e-9);
      }
    }
  });

  it('gives a head-in face 2.6 m stalls and an accessible one with a 2.4 m aisle', () => {
    const orientation = kerbOrientation('headIn', false, 'low', 1);
    const face = layKerbFace({
      style: 'headIn',
      orientation,
      depth: PARKING_STYLES.headIn.laneWidth,
      lo: 0,
      hi: 120,
      accessibleEnd: 'lo',
    });
    expect(face.slant).toBe(0);
    const regular = face.stalls.filter((s) => !s.accessible);
    for (const s of regular) expect(s.to - s.from).toBeCloseTo(2.6, 9);
    // 46 regular stalls ask two accessible ones.
    const accessible = face.stalls.filter((s) => s.accessible);
    expect(accessible).toHaveLength(2);
    for (const s of accessible) {
      expect(s.to - s.from).toBeCloseTo(2.6, 9);
      expect(s.aisle!.to - s.aisle!.from).toBeCloseTo(2.4, 9);
    }
  });
});

describe('layKerbFace — a parallel block face', () => {
  const orientation = kerbOrientation('parallel', true, 'high', 1);
  /** Ticks on the 6.7 m pitch, the end stall from a junction zone at 100. */
  const ticks = [100, 107.2, 113.9, 120.6, 127.3, 134, 140.7, 147.4];

  it('lengthens the stall at the asked end to 7.3 m, and keeps the rest 6.1–7.9 m', () => {
    for (const end of ['lo', 'hi'] as const) {
      const face = layKerbFace({
        style: 'parallel',
        orientation,
        depth: 2.25,
        lo: 100,
        hi: 147.4,
        ticks,
        accessibleEnd: end,
      });
      const accessible = face.stalls.filter((s) => s.accessible);
      expect(accessible).toHaveLength(1);
      const stall = accessible[0]!;
      expect(stall.to - stall.from).toBeCloseTo(ACCESSIBLE_PARALLEL_STALL_M, 9);
      expect(stall.aisle).toBeNull();
      if (end === 'lo') expect(stall).toBe(face.stalls[0]);
      else expect(stall).toBe(face.stalls.at(-1));
      for (const s of face.stalls) {
        expect(s.to - s.from).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
        expect(s.to - s.from).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
        expect(s.from).toBeGreaterThanOrEqual(100 - 1e-6);
        expect(s.to).toBeLessThanOrEqual(147.4 + 1e-6);
      }
    }
  });

  it('grows the zone rather than leave a stall shorter than 6.1 m beside it', () => {
    // An end stall of 6.3 m: lengthened to 7.3 m it would leave 5.7 m before
    // the next tick, so it ends on that tick and the zone grows by the rest.
    const face = layKerbFace({
      style: 'parallel',
      orientation,
      depth: 2.25,
      lo: 100,
      hi: 140,
      ticks: [100, 106.3, 113, 119.7, 126.4, 133.1],
      accessibleEnd: 'lo',
    });
    expect(face.stalls[0]).toMatchObject({ accessible: true });
    expect(face.stalls[0]!.to).toBeCloseTo(113, 9);
    expect(face.stalls[0]!.from).toBeCloseTo(113 - ACCESSIBLE_PARALLEL_STALL_M, 9);
    expect(face.stalls[1]!.to - face.stalls[1]!.from).toBeCloseTo(PARKING_STALL_LENGTH_M, 9);
  });

  it('counts the accessible stalls from the face’s marked stalls', () => {
    const many = Array.from({ length: 40 }, (_, k) => 1000 + k * PARKING_STALL_LENGTH_M);
    const face = layKerbFace({
      style: 'parallel',
      orientation,
      depth: 2.25,
      lo: 1000,
      hi: many.at(-1)!,
      ticks: many,
      accessibleEnd: 'lo',
    });
    // 39 stalls ask two.
    expect(face.stalls.filter((s) => s.accessible)).toHaveLength(2);
  });
});

describe('a composed profile parks in the style it asks for', () => {
  it('composes and reads the style through the parking piece', () => {
    const angled = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
      ...NO_EDITS,
      parking: 'right',
      parkingStyle: 'angled',
    });
    expect(angled.pieces.filter((p) => p.kind === 'parking')).toEqual([
      { kind: 'parking', width: 6, parking: 'angled' },
    ]);
  });
});
