import { describe, expect, it } from 'vitest';
import {
  cornerReturnRadius,
  junctionArmLayout,
  junctionArmPaint,
  noParkingReach,
} from './junctionpaint';
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

describe('junctionArmLayout', () => {
  it('starts the crossing where the kerb return ends, and keeps the stop line 1.2 m before it', () => {
    const layout = junctionArmLayout(3.75, 1.875, 4.5);
    expect(layout.boxEdge).toBe(3.75);
    expect(layout.crosswalkNear).toBeCloseTo(8.25, 9);
    expect(layout.crosswalkFar - layout.crosswalkNear).toBeCloseTo(1.875, 9);
    expect(layout.stopLineNear - layout.crosswalkFar).toBeCloseTo(1.2, 9);
  });

  it('moves the stop line back with the crossing', () => {
    const flat = junctionArmLayout(3.75, 1.875);
    const curved = junctionArmLayout(3.75, 1.875, 4.5);
    expect(curved.stopLineNear - flat.stopLineNear).toBeCloseTo(4.5, 9);
  });

  it('keeps the no-parking reach in step with the crossing it starts from', () => {
    const arm = { crossHalf: 6, footwayWidth: 1.875, crossed: true, stopLine: false };
    const flat = noParkingReach({ ...arm, corner: 0 });
    const curved = noParkingReach({ ...arm, corner: 2 });
    expect(curved - flat).toBeCloseTo(2, 9);
  });
});

describe('cornerReturnRadius', () => {
  it('is the class radius, cut back to the room either road leaves, never below nothing', () => {
    expect(cornerReturnRadius(9, 12, 12)).toBe(9);
    expect(cornerReturnRadius(9, 2.5, 12)).toBe(2.5);
    expect(cornerReturnRadius(9, 12, 4)).toBe(4);
    expect(cornerReturnRadius(9, -1, 4)).toBe(0);
  });
});

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
