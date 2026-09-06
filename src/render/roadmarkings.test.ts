import { describe, expect, it } from 'vitest';
import { presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import { CENTRE_PAIR_OFFSET_M, centrePair, markingPlan } from './roadmarkings';

const close = (xs: readonly { at: number }[] | number[], ys: number[]): void => {
  expect(xs.length).toBe(ys.length);
  xs.forEach((x, i) => expect(typeof x === 'number' ? x : x.at).toBeCloseTo(ys[i]!, 6));
};

describe('markingPlan paints every preset the way a US road is painted', () => {
  /** Every line at an offset, as a colour, so a test can name what it expects. */
  const lineAt = (lines: readonly { at: number; color: string }[], at: number): string | null =>
    lines.find((l) => Math.abs(l.at - at) < 1e-6)?.color ?? null;

  it('two-lane: a yellow dashed centre between the directions, white edge lines at the gutter', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.TwoLane));
    close(p.dashed, [0]);
    expect(lineAt(p.dashed, 0)).toBe('yellow');
    close(p.solid, [-3.25, 3.25]); // half a metre inside the 3.75 m half-width
    expect(p.solid.every((l) => l.color === 'white')).toBe(true);
  });

  it('one-way: a white lane line between its two same-way lanes, and white edges', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.OneWay));
    expect(lineAt(p.dashed, 0)).toBe('white');
    close(p.solid, [-3.25, 3.25]);
  });

  it('four-lane: a yellow double centre, white lane lines, white edges', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.FourLane));
    close(p.dashed, [-3.75, 3.75]);
    expect(p.dashed.every((l) => l.color === 'white')).toBe(true);
    expect(lineAt(p.solid, -CENTRE_PAIR_OFFSET_M)).toBe('yellow');
    expect(lineAt(p.solid, CENTRE_PAIR_OFFSET_M)).toBe('yellow');
    expect(lineAt(p.solid, -7)).toBe('white');
    expect(lineAt(p.solid, 7)).toBe('white');
    expect(centrePair(p)).not.toBeNull();
  });

  it('avenue: the same, with a median the mesh draws where the centre pair would go', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.Avenue));
    close(p.dashed, [-3.75, 3.75]);
    expect(lineAt(p.solid, CENTRE_PAIR_OFFSET_M)).toBe('yellow');
    expect(p.hasMedian).toBe(true);
  });

  it('highway: white lane lines and white edges, no yellow — every lane runs one way', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.Highway));
    expect(p.solid.every((l) => l.color === 'white')).toBe(true);
    expect(p.dashed.every((l) => l.color === 'white')).toBe(true);
    expect(lineAt(p.solid, -7)).toBe('white');
    expect(lineAt(p.solid, 7)).toBe('white');
    expect(p.barrier).toBe(true);
  });

  it('bus lane: the four-lane set plus a band on each kerb lane', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.BusLane));
    close(p.dashed, [-3.75, 3.75]);
    expect(lineAt(p.solid, CENTRE_PAIR_OFFSET_M)).toBe('yellow');
    expect(p.bands.map((b) => b.kind)).toEqual(['bus', 'bus']);
    close(
      p.bands.flatMap((b) => [b.from, b.to]),
      [-7.5, -3.75, 3.75, 7.5],
    );
  });

  it('bike lane: a yellow centre and 1.6 m of green at each kerb of the 1.875 m lane', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.BikeLane));
    expect(lineAt(p.dashed, 0)).toBe('yellow');
    expect(p.bands.map((b) => b.kind)).toEqual(['bike', 'bike']);
    close(
      p.bands.flatMap((b) => [b.from, b.to]),
      [-5.625, -5.625 + 1.6, 5.625 - 1.6, 5.625],
    );
  });

  it('an alley, a farm track and a railway carry no paint at all', () => {
    for (const tier of [RoadTier.Alley, RoadTier.Gravel, RoadTier.RailTrack]) {
      const p = markingPlan(presetProfileForTier(tier));
      expect(p.solid, `tier ${tier}`).toEqual([]);
      expect(p.dashed, `tier ${tier}`).toEqual([]);
    }
  });

  it('a tram street keeps its rails unpainted but still marks its edges', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.Tram));
    expect(p.dashed).toEqual([]); // the rails are the centre
    close(p.solid, [-3.25, 3.25]);
  });

  it('puts the edge line at the inside of a shoulder, which is where it is safe to pull over', () => {
    const p = markingPlan({
      class: 'highway',
      pieces: [
        { kind: 'shoulder', width: 3 },
        { kind: 'travel', width: 3.6, flow: 'fwd' },
        { kind: 'travel', width: 3.6, flow: 'fwd' },
        { kind: 'shoulder', width: 3 },
      ],
    });
    // Half-width 6.6: the lines sit at the shoulder edges, not half a metre in.
    close(
      p.solid.map((l) => l.at),
      [-3.6, 3.6],
    );
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
    // Traffic may enter the turn lane but never travel along it, so both its
    // boundaries are solid yellow — the lane faces opposing traffic on each
    // side. The white edge lines sit outside them.
    close(p.solid, [-4.75, -1.75, 1.75, 4.75]);
    expect(p.solid.filter((l) => l.color === 'yellow').map((l) => l.at)).toEqual([-1.75, 1.75]);
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
