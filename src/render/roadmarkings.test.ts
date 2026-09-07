import { describe, expect, it } from 'vitest';
import { corridorHalfProfile, presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import {
  CENTRE_PAIR_OFFSET_M,
  centrePair,
  MEDIAN_EDGE_LINE_INSET_M,
  markingPlan,
  seamBetween,
  seamOffsets,
  travelLanes,
  type MarkingPlan as MarkingProfile,
} from './roadmarkings';

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

  it('avenue: a yellow left edge line down each side of the median it is divided by', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.Avenue));
    // Four 3.05 m lanes about a 0.8 m median: a lane line between each pair
    // running the same way.
    close(p.dashed, [-3.45, 3.45]);
    expect(p.hasMedian).toBe(true);
    // The median runs from -0.4 to 0.4, so each carriageway's left edge line
    // sits just inside it. Painted as a pair over the median's own centre —
    // which is what this was — both lines end up under the planting the mesh
    // draws there, and a straight avenue run carries no yellow at all.
    expect(lineAt(p.solid, -0.4 - MEDIAN_EDGE_LINE_INSET_M)).toBe('yellow');
    expect(lineAt(p.solid, 0.4 + MEDIAN_EDGE_LINE_INSET_M)).toBe('yellow');
    expect(lineAt(p.solid, CENTRE_PAIR_OFFSET_M)).toBe(null);
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
    // Each side of a turn lane carries a solid yellow line toward the through
    // lane and a broken yellow one toward the turn lane: traffic may cross
    // into it to turn but never travel along it. The white edge lines sit
    // outside them.
    close(p.solid, [-4.75, -1.75, 1.75, 4.75]);
    expect(p.solid.filter((l) => l.color === 'yellow').map((l) => l.at)).toEqual([-1.75, 1.75]);
    close(p.dashed, [-1.45, 1.45]);
    expect(p.dashed.every((l) => l.color === 'yellow')).toBe(true);
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

describe('a line crosses a seam where the road changes', () => {
  const line = (at: number, color: 'white' | 'yellow' = 'white'): { at: number; color: typeof color } => ({ at, color });

  it('meets its opposite number half way, so both tiles put the seam in one place', () => {
    const here = [line(-3), line(3)];
    const there = [line(-2), line(2)];
    // Whichever side asks, the seam is the same place — which is what makes
    // the line unbroken rather than a step at the boundary.
    expect(seamOffsets(here, there, 5)).toEqual([-2.5, 2.5]);
    expect(seamOffsets(there, here, 6)).toEqual([-2.5, 2.5]);
  });

  it('leaves a road that does not change exactly where it was', () => {
    const same = [line(-3), line(0, 'yellow'), line(3)];
    expect(seamOffsets(same, same, 5)).toEqual([-3, 0, 3]);
  });

  it('never drags a line across to a different colour', () => {
    // A white lane line has no white to meet, and the yellow centre is not a
    // candidate however close it is.
    const here = [line(2)];
    const there = [line(0, 'yellow')];
    expect(seamOffsets(here, there, 4)).toEqual([4]);
  });

  it('closes a dropped lane onto the line it merges into, all the way', () => {
    // Two lanes a side becoming one: the outer lane line has no partner and
    // runs into the edge line rather than stopping in mid-road.
    const here = [line(-6), line(-3), line(3), line(6)];
    const there = [line(-3), line(3)];
    const at = seamOffsets(here, there, 3);
    // The inner pair carries on; the outer pair merges onto it.
    expect(at).toEqual([-3, -3, 3, 3]);
  });

  it('converges a double centre onto the single one that replaces it', () => {
    const doubleCentre = [line(-0.22, 'yellow'), line(0.22, 'yellow')];
    const singleCentre = [line(0, 'yellow')];
    const at = seamOffsets(doubleCentre, singleCentre, 3.75);
    // One of the pair carries on AS the centre, meeting the single line half
    // way — and the single line, asked from its own side, names that same
    // place, so that one is unbroken. The other has no partner left and
    // merges onto the centre. Both end within a hand's breadth of the middle,
    // which is the point: neither wanders off across the road.
    expect(seamOffsets(singleCentre, doubleCentre, 7.5)[0]).toBeCloseTo(-0.11, 6);
    expect(at[0]).toBeCloseTo(-0.11, 6);
    expect(at[1]).toBeCloseTo(0, 6);
    for (const o of at) expect(Math.abs(o)).toBeLessThan(CENTRE_PAIR_OFFSET_M);
  });

  it('matches a solid line to a dashed one, since a style change is still one line', () => {
    const solidCentre: MarkingProfile = {
      solid: [line(-0.22, 'yellow'), line(0.22, 'yellow')],
      dashed: [],
      bands: [],
      turnLane: null,
      hasMedian: false,
      barrier: false,
    };
    const dashedCentre: MarkingProfile = {
      solid: [],
      dashed: [line(0, 'yellow')],
      bands: [],
      turnLane: null,
      hasMedian: false,
      barrier: false,
    };
    // Matched across the two lists, the pair stays on the centre. Matched only
    // within its own list it would find no yellow at all and set off for the
    // kerb, which is the bug this rule exists to prevent — so what the test
    // pins is that both lines stay in the middle of the road.
    for (const o of seamBetween(solidCentre, dashedCentre, 3.75).solid) {
      expect(Math.abs(o)).toBeLessThan(CENTRE_PAIR_OFFSET_M);
    }
  });

  it('holds a line still where there is no road on the other side', () => {
    const here: MarkingProfile = {
      solid: [line(-3), line(3)],
      dashed: [line(0, 'yellow')],
      bands: [],
      turnLane: null,
      hasMedian: false,
      barrier: false,
    };
    expect(seamBetween(here, null, 0)).toEqual({ solid: [-3, 3], dashed: [0] });
  });
});

describe('a corridor half is painted as the carriageway it is', () => {
  const SIX_LANE: RoadProfile = {
    class: 'divided',
    pieces: [
      { kind: 'sidewalk', width: 1.9 },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'travel', width: 3.6, flow: 'back' },
      { kind: 'median', width: 2 },
      { kind: 'travel', width: 3.6, flow: 'fwd' },
      { kind: 'travel', width: 3.6, flow: 'fwd' },
      { kind: 'travel', width: 3.6, flow: 'fwd' },
      { kind: 'sidewalk', width: 1.9 },
    ],
  };
  /** The colour of the edge line furthest to each side. */
  const edges = (p: RoadProfile): { outer: string; inner: string } => {
    const plan = markingPlan(corridorHalfProfile(p, 'left'));
    const lo = plan.solid[0]!;
    const hi = plan.solid[plan.solid.length - 1]!;
    return { outer: lo.color, inner: hi.color };
  };

  it('puts the yellow edge on the side the median is on, not always on the left', () => {
    // The near half carries the median at its RIGHT edge, so that is the edge
    // facing opposing traffic; its left edge faces the roadside and is white.
    const near = markingPlan(corridorHalfProfile(SIX_LANE, 'left'));
    expect(near.solid[0]!.color).toBe('white');
    expect(near.solid[near.solid.length - 1]!.color).toBe('yellow');

    // The far half is the mirror of it.
    const far = markingPlan(corridorHalfProfile(SIX_LANE, 'right'));
    expect(far.solid[0]!.color).toBe('yellow');
    expect(far.solid[far.solid.length - 1]!.color).toBe('white');
  });

  it('leaves a whole divided road painted the way it always was', () => {
    // The median is in the MIDDLE of this one, so neither edge faces it and
    // the left-hand convention still decides.
    const whole = markingPlan(SIX_LANE);
    expect(whole.solid[0]!.color).toBe('yellow');
    expect(whole.solid[whole.solid.length - 1]!.color).toBe('white');
  });

  it('still marks each half between its own lanes', () => {
    const near = markingPlan(corridorHalfProfile(SIX_LANE, 'left'));
    // Three lanes running the same way: two dashed white lines between them.
    expect(near.dashed).toHaveLength(2);
    expect(near.dashed.every((l) => l.color === 'white')).toBe(true);
    expect(edges(SIX_LANE).outer).toBe('white');
  });
});

describe('travelLanes finds where each lane actually is', () => {
  it('splits a two-lane street either side of its centreline', () => {
    const lanes = travelLanes(presetProfileForTier(RoadTier.TwoLane));
    expect(lanes.map((l) => l.flow)).toEqual(['back', 'fwd']);
    close(
      lanes.map((l) => l.centre),
      [-1.875, 1.875],
    );
  });

  it('places all four lanes of a four-lane road, inner pair either side of the centre', () => {
    const lanes = travelLanes(presetProfileForTier(RoadTier.FourLane));
    expect(lanes).toHaveLength(4);
    // Symmetric about the centreline, and each centre inside the carriageway.
    const centres = lanes.map((l) => l.centre);
    close(centres, centres.map((c) => -c).reverse());
    expect(centres[0]).toBeLessThan(0);
    expect(centres[3]).toBeGreaterThan(0);
  });

  it('measures a lane from the pieces beside it, not from an even split', () => {
    // A kerbside parking lane pushes the travel lanes inward; the arrow has to
    // land on the lane, not where an even split would put it.
    const lanes = travelLanes({
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
    close(
      lanes.map((l) => l.centre),
      [-1.875, 1.875],
    );
  });

  it('counts a bus or bike lane as neither: they are not travel lanes', () => {
    const lanes = travelLanes(presetProfileForTier(RoadTier.BusLane));
    expect(lanes.every((l) => l.flow === 'fwd' || l.flow === 'back')).toBe(true);
    expect(lanes.length).toBeLessThan(presetProfileForTier(RoadTier.BusLane).pieces.length);
  });

  it('has no lanes on a railway', () => {
    expect(travelLanes(presetProfileForTier(RoadTier.RailTrack))).toEqual([]);
  });
});
