import { describe, expect, it } from 'vitest';
import {
  KERB_HEIGHT_M,
  crossingRamps,
  kerbRampBox,
  kerbRampRise,
  kerbRampRun,
  kerbRampWidth,
  onKerbRamp,
  warningPadOf,
  type KerbRamp,
} from './kerbramps';

describe('a kerb ramp’s size', () => {
  it('is as wide as the crossing is deep less 0.3 m each side, and never under 1.22 m', () => {
    expect(kerbRampWidth(3)).toBeCloseTo(2.4, 9);
    expect(kerbRampWidth(1.875)).toBeCloseTo(1.275, 9);
    expect(kerbRampWidth(1.8)).toBe(1.22);
    expect(kerbRampWidth(0.5)).toBe(1.22);
  });

  it('runs the kerb’s height at 1 in 12 into the footway, no further than the footway is wide', () => {
    expect(kerbRampRun(1.875)).toBeCloseTo(KERB_HEIGHT_M * 12, 9);
    expect(kerbRampRun(1.875)).toBeCloseTo(0.96, 9);
    expect(kerbRampRun(0.5)).toBe(0.5);
  });
});

describe('crossingRamps', () => {
  const base = {
    vertical: true,
    armSign: 1 as const,
    centre: { x: 100, z: 200 },
    near: 8,
    far: 9.875,
    footwayWidth: 1.875,
  };

  it('puts a ramp at each kerb, centred on the crossing and between its lines', () => {
    const [low, high] = crossingRamps({ ...base, kerbs: [-3.75, 3.75] }) as [KerbRamp, KerbRamp];
    for (const ramp of [low, high]) {
      expect(ramp.axis).toBe('x');
      expect((ramp.from + ramp.to) / 2).toBeCloseTo(200 + 8.9375, 9);
      expect(ramp.to - ramp.from).toBeCloseTo(1.275, 9);
      expect(ramp.from).toBeGreaterThanOrEqual(200 + 8 + 0.3 - 1e-9);
      expect(ramp.to).toBeLessThanOrEqual(200 + 9.875 - 0.3 + 1e-9);
    }
    expect(low.kerb).toBeCloseTo(96.25, 9);
    expect(low.back).toBeCloseTo(96.25 - 0.96, 9);
    expect(high.kerb).toBeCloseTo(103.75, 9);
    expect(high.back).toBeCloseTo(103.75 + 0.96, 9);
  });

  it('lies on the far side of the junction for an arm running the other way, and on x for a horizontal arm', () => {
    const [ramp] = crossingRamps({
      ...base,
      vertical: false,
      armSign: -1,
      kerbs: [3.75],
    }) as [KerbRamp];
    expect(ramp.axis).toBe('z');
    expect((ramp.from + ramp.to) / 2).toBeCloseTo(100 - 8.9375, 9);
    expect(ramp.kerb).toBeCloseTo(203.75, 9);
  });

  it('lays none where the crossing meets no kerb', () => {
    expect(crossingRamps({ ...base, kerbs: [] })).toEqual([]);
  });
});

describe('a ramp’s surface', () => {
  const ramp: KerbRamp = { axis: 'x', kerb: 10, back: 10.96, from: 0, to: 1.275 };

  it('rises from the kerb to the back and holds either side of them', () => {
    expect(kerbRampRise(ramp, 10)).toBe(0);
    expect(kerbRampRise(ramp, 10.48)).toBeCloseTo(0.5, 9);
    expect(kerbRampRise(ramp, 10.96)).toBe(1);
    expect(kerbRampRise(ramp, 9)).toBe(0);
    expect(kerbRampRise(ramp, 12)).toBe(1);
  });

  it('knows its rectangle and which points stand on it', () => {
    expect(kerbRampBox(ramp)).toEqual({ x0: 10, x1: 10.96, z0: 0, z1: 1.275 });
    expect(onKerbRamp(ramp, 10.5, 0.6)).toBe(true);
    expect(onKerbRamp(ramp, 11.2, 0.6)).toBe(false);
    expect(onKerbRamp(ramp, 11.2, 0.6, 0.3)).toBe(true);
  });

  it('carries a 0.61 m deep pad from the kerb, as wide as the ramp, or less where the ramp is short', () => {
    const pad = warningPadOf(ramp);
    expect(pad.kerb).toBe(10);
    expect(pad.back).toBeCloseTo(10.61, 9);
    expect(pad.from).toBe(0);
    expect(pad.to).toBe(1.275);
    const short = warningPadOf({ ...ramp, back: 10.4 });
    expect(short.back).toBeCloseTo(10.4, 9);
    const negative = warningPadOf({ ...ramp, kerb: 10, back: 9.04 });
    expect(negative.back).toBeCloseTo(9.39, 9);
  });
});
