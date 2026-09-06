import { describe, expect, it } from 'vitest';
import { presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import { CENTRE_PAIR_OFFSET_M, centrePair, markingPlan } from './roadmarkings';

const close = (xs: number[], ys: number[]): void => {
  expect(xs.length).toBe(ys.length);
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i]!, 6));
};

describe('markingPlan reproduces what every preset has always painted', () => {
  it('two-lane: one dashed centre line, nothing else', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.TwoLane));
    close(p.dashed, [0]);
    expect(p.solid).toEqual([]);
    expect(p.bands).toEqual([]);
    expect(p.hasMedian).toBe(false);
  });

  it('one-way: the line between its two same-way lanes, dashed, at the centre', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.OneWay));
    close(p.dashed, [0]);
    expect(p.solid).toEqual([]);
  });

  it('four-lane: a double solid centre and dashed lane lines at ±3.75', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.FourLane));
    close(p.dashed, [-3.75, 3.75]);
    close(p.solid, [-CENTRE_PAIR_OFFSET_M, CENTRE_PAIR_OFFSET_M]);
    expect(centrePair(p)).not.toBeNull();
  });

  it('avenue: dashed lane lines at ±3.75, a median, and the centre pair the mesh paints only where the median breaks', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.Avenue));
    close(p.dashed, [-3.75, 3.75]);
    close(p.solid, [-CENTRE_PAIR_OFFSET_M, CENTRE_PAIR_OFFSET_M]);
    expect(p.hasMedian).toBe(true);
  });

  it('highway: solid edge lines half a metre in, no centre, no lane lines, a divider', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.Highway));
    close(p.solid, [-7, 7]);
    expect(p.dashed).toEqual([]);
    expect(p.barrier).toBe(true);
  });

  it('bus lane: the four-lane white set plus terracotta bands on the kerb lanes', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.BusLane));
    close(p.dashed, [-3.75, 3.75]);
    close(p.solid, [-CENTRE_PAIR_OFFSET_M, CENTRE_PAIR_OFFSET_M]);
    expect(p.bands.map((b) => b.kind)).toEqual(['bus', 'bus']);
    close(
      p.bands.flatMap((b) => [b.from, b.to]),
      [-7.5, -3.75, 3.75, 7.5],
    );
  });

  it('bike lane: a dashed centre and 1.6 m of green at each kerb of the 1.875 m lane', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.BikeLane));
    close(p.dashed, [0]);
    expect(p.bands.map((b) => b.kind)).toEqual(['bike', 'bike']);
    close(
      p.bands.flatMap((b) => [b.from, b.to]),
      [-5.625, -5.625 + 1.6, 5.625 - 1.6, 5.625],
    );
  });

  it('tram, alley, gravel and rail paint no lines down the run', () => {
    for (const tier of [RoadTier.Tram, RoadTier.Alley, RoadTier.Gravel, RoadTier.RailTrack]) {
      const p = markingPlan(presetProfileForTier(tier));
      expect(p.solid).toEqual([]);
      expect(p.dashed).toEqual([]);
    }
  });
});

describe('markingPlan for composed profiles', () => {
  it('a two-lane with parking lanes keeps its dashed centre and ticks its bays', () => {
    const p = markingPlan({
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'parking', width: 2.25 },
        { kind: 'sidewalk', width: 1.875 },
      ],
    });
    close(p.dashed, [0]);
    expect(p.bands.map((b) => b.kind)).toEqual(['parking', 'parking']);
    close(
      p.bands.flatMap((b) => [b.from, b.to]),
      [-6, -3.75, 3.75, 6],
    );
  });

  it('a three-lane local bounds its centre turn lane with a solid line each side', () => {
    const p = markingPlan({
      class: 'local',
      pieces: [
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'centreTurn', width: 3.5 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
      ],
    });
    // Traffic may enter the turn lane but never travel along it, so neither
    // boundary is a passing line.
    close(p.solid, [-1.75, 1.75]);
    expect(p.dashed).toEqual([]);
    expect(centrePair(p)).toBeNull();
  });

  it('a class that paints nothing paints nothing around a turn lane either', () => {
    const p = markingPlan({
      class: 'alley',
      pieces: [
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'centreTurn', width: 3.5 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
      ],
    });
    expect(p.solid).toEqual([]);
  });

  it('two lanes a side on an urban street earns a double solid centre; one a side, a dashed one', () => {
    const lanes = (n: number): RoadProfile => ({
      class: 'urban',
      pieces: Array.from({ length: 2 * n }, (_, i) => ({
        kind: 'travel' as const,
        width: 3.5,
        flow: i < n ? ('back' as const) : ('fwd' as const),
      })),
    });
    expect(centrePair(markingPlan(lanes(2)))).not.toBeNull();
    expect(centrePair(markingPlan(lanes(1)))).toBeNull();
    close(markingPlan(lanes(1)).dashed, [0]);
  });

  it('a composed bike lane narrower than the paint cap is painted edge to edge', () => {
    const p = markingPlan({
      class: 'local',
      pieces: [
        { kind: 'bike', width: 1.6, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
      ],
    });
    const band = p.bands[0]!;
    expect(band.to - band.from).toBeCloseTo(1.6, 6);
  });
});
