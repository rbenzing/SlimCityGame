import { describe, expect, it } from 'vitest';
import { junctionArmPaint } from './junctionpaint';
import type { JunctionArms } from './junctionpaint';
import { RoadTier } from './types';

const T = RoadTier.TwoLane;

/** A four-way junction on a two-lane street, with one arm swapped. */
function crossroads(
  arm: RoadTier,
  armFootway: boolean,
  control: JunctionArms['control'] = 'allWayStop',
): JunctionArms {
  return {
    tier: T,
    has: { n: true, e: true, s: true, w: true },
    roads: { n: arm, e: T, s: T, w: T },
    footways: { n: armFootway, e: true, s: true, w: true },
    ownFootway: true,
    control,
  };
}

describe('junctionArmPaint', () => {
  it('paints a crossing and a stop line over an ordinary street arm', () => {
    expect(junctionArmPaint(crossroads(T, true), 'n')).toEqual({ crossed: true, stops: true });
  });

  it('paints no crossing over a ramp arm, which has no footway, and leaves the street beside it its own', () => {
    const j = crossroads(RoadTier.Ramp, false);
    expect(junctionArmPaint(j, 'n').crossed).toBe(false);
    expect(junctionArmPaint(j, 'e').crossed).toBe(true);
    expect(junctionArmPaint(j, 'w').crossed).toBe(true);
  });

  it('paints nothing on a gravel arm, whatever controls the junction', () => {
    for (const control of ['stop', 'allWayStop', 'signal', 'yield'] as const) {
      const j = crossroads(RoadTier.Gravel, false, control);
      expect(junctionArmPaint(j, 'n')).toEqual({ crossed: false, stops: false });
    }
  });

  it('keeps the paved arms painted at a crossroads with a gravel arm', () => {
    const j = crossroads(RoadTier.Gravel, false, 'allWayStop');
    expect(junctionArmPaint(j, 'e').stops).toBe(true);
    expect(junctionArmPaint(j, 'e').crossed).toBe(true);
  });

  it('paints nothing at a street T with an alley, on any arm, whatever the control', () => {
    for (const control of ['stop', 'allWayStop', 'signal', 'yield'] as const) {
      const j: JunctionArms = {
        tier: T,
        has: { n: true, e: true, s: false, w: true },
        roads: { n: RoadTier.Alley, e: T, s: RoadTier.None, w: T },
        footways: { n: false, e: true, s: false, w: true },
        ownFootway: true,
        control,
      };
      for (const side of ['n', 'e', 'w'] as const)
        expect(junctionArmPaint(j, side)).toEqual({ crossed: false, stops: false });
    }
  });

  it('reads a real T beside an alley as the T alone', () => {
    const j: JunctionArms = {
      tier: T,
      has: { n: true, e: true, s: true, w: true },
      roads: { n: T, e: T, s: RoadTier.Alley, w: RoadTier.None },
      footways: { n: true, e: true, s: false, w: false },
      ownFootway: true,
      control: 'stop',
    };
    expect(junctionArmPaint(j, 's')).toEqual({ crossed: false, stops: false });
    expect(junctionArmPaint(j, 'e').stops).toBe(true);
  });
});
