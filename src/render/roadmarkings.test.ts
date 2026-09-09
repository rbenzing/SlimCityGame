import { describe, expect, it } from 'vitest';
import { corridorHalfProfile, presetProfileForTier } from '../shared/roadprofile';
import { RoadFlow, RoadTier } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import {
  approachingLanes,
  approachingSpan,
  CENTRE_PAIR_OFFSET_M,
  centrePair,
  MEDIAN_EDGE_LINE_INSET_M,
  markingPlan,
  seamBetween,
  seamOffsets,
  travelLanes,
  travelLaneSpans,
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
    // Four full lanes about a 1.2 m refuge median: a lane line between each
    // pair running the same way.
    close(p.dashed, [-4.35, 4.35]);
    expect(p.hasMedian).toBe(true);
    // The median runs from -0.6 to 0.6, so each carriageway's left edge line
    // sits just inside it. Painted as a pair over the median's own centre —
    // which is what this was — both lines end up under the planting the mesh
    // draws there, and a straight avenue run carries no yellow at all.
    expect(lineAt(p.solid, -0.6 - MEDIAN_EDGE_LINE_INSET_M)).toBe('yellow');
    expect(lineAt(p.solid, 0.6 + MEDIAN_EDGE_LINE_INSET_M)).toBe('yellow');
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

  it('bus lane: a band on each kerb lane, bounded by a solid line rather than a dashed one', () => {
    const p = markingPlan(presetProfileForTier(RoadTier.BusLane));
    expect(lineAt(p.solid, CENTRE_PAIR_OFFSET_M)).toBe('yellow');
    expect(p.bands.map((b) => b.kind)).toEqual(['bus', 'bus']);
    close(
      p.bands.flatMap((b) => [b.from, b.to]),
      [-7.5, -3.75, 3.75, 7.5],
    );
    // A reserved lane is where general traffic ENDS, so its inner edge is the
    // edge line — solid, and the only line there. Painting it dashed, as a
    // boundary between two ordinary same-way lanes would be, invites the
    // traffic in; painting a dashed line over the solid one paints it twice.
    expect(lineAt(p.solid, -3.75)).toBe('white');
    expect(lineAt(p.solid, 3.75)).toBe('white');
    expect(p.dashed.map((l) => l.at)).not.toContain(-3.75);
    expect(p.dashed.map((l) => l.at)).not.toContain(3.75);
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

  it('keeps the edge line out of the bike lane, between it and the traffic', () => {
    const profile = presetProfileForTier(RoadTier.BikeLane);
    const p = markingPlan(profile);
    const green = p.bands.filter((b) => b.kind === 'bike');
    expect(green).toHaveLength(2);
    // Half-width 5.625, bike lanes 1.875 wide: the edge lines belong at the
    // bike lanes' inner edges (±3.75), not half a metre in from the kerb,
    // which would bury them in the green paint they are meant to bound.
    close(
      p.solid.map((l) => l.at),
      [-3.75, 3.75],
    );
    for (const line of p.solid) {
      for (const band of green) {
        const inside = line.at > Math.min(band.from, band.to) && line.at < Math.max(band.from, band.to);
        expect(inside, `a line at ${line.at} sits inside the bike paint`).toBe(false);
      }
    }
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

describe('the yellow edge of a one-way roadway (MUTCD 3B.07)', () => {
  const oneWay = (): RoadProfile => ({
    class: 'oneWay',
    pieces: [
      { kind: 'sidewalk', width: 1.875 },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'sidewalk', width: 1.875 },
    ],
  });
  const edges = (flow: RoadFlow): { low: string; high: string } => {
    const plan = markingPlan(oneWay(), flow);
    const sorted = [...plan.solid].sort((a, b) => a.at - b.at);
    return { low: sorted[0]!.color, high: sorted[sorted.length - 1]!.color };
  };

  // Offsets grow east and south. A driver's left is therefore the LOW offset
  // going north or east, and the HIGH offset going south or west — so the
  // yellow has to follow the direction the road was drawn, not the order of
  // its pieces.
  it('keeps the yellow on the driver’s left running north or east', () => {
    for (const flow of [RoadFlow.North, RoadFlow.East]) {
      expect(edges(flow).low, `flow ${flow}`).toBe('yellow');
      expect(edges(flow).high, `flow ${flow}`).toBe('white');
    }
  });

  it('moves it to the other edge running south or west', () => {
    for (const flow of [RoadFlow.South, RoadFlow.West]) {
      expect(edges(flow).high, `flow ${flow}`).toBe('yellow');
      expect(edges(flow).low, `flow ${flow}`).toBe('white');
    }
  });

  it('never paints both edges yellow, whichever way it runs', () => {
    for (const flow of [RoadFlow.None, RoadFlow.North, RoadFlow.East, RoadFlow.South, RoadFlow.West]) {
      const e = edges(flow);
      expect([e.low, e.high].filter((c) => c === 'yellow').length, `flow ${flow}`).toBe(1);
    }
  });
});

describe('the lanes an approach arrives in (MUTCD 3B.16)', () => {
  // A stop line goes across the approach and stops at the centreline. The
  // driver's left is the side a left turn hooks toward; the arriving lanes are
  // the ones on the other side of it, so their offsets carry the opposite sign.
  const LEFT_IS_POSITIVE = 1 as const;
  const LEFT_IS_NEGATIVE = -1 as const;

  it('covers the driver-right half of a two-way road, not the whole of it', () => {
    const p = presetProfileForTier(RoadTier.TwoLane);
    // Carriageway 7.5 m: the arriving lane is one 3.75 m lane on one side of
    // the centreline. Which side depends on which way the approach runs.
    expect(approachingSpan(p, p, true, LEFT_IS_POSITIVE)).toEqual({ from: -3.75, to: 0 });
    expect(approachingSpan(p, p, true, LEFT_IS_NEGATIVE)).toEqual({ from: 0, to: 3.75 });
  });

  it('covers a divided road up to its median and no further', () => {
    const p = presetProfileForTier(RoadTier.Avenue);
    // Two 3.75 m lanes each way about a 1.2 m median: the arriving pair
    // reaches the median's edge at 0.6 m from the centre, never across it.
    const span = approachingSpan(p, p, true, LEFT_IS_NEGATIVE)!;
    expect(span.from).toBeCloseTo(0.6, 6);
    expect(span.to).toBeCloseTo(8.1, 6);
    expect(approachingLanes(p, p, true, LEFT_IS_NEGATIVE)).toHaveLength(2);
  });

  it('covers the whole of a one-way running toward the junction, and none of one running away', () => {
    const p = presetProfileForTier(RoadTier.OneWay);
    expect(approachingSpan(p, p, true, LEFT_IS_NEGATIVE)).toEqual({ from: -3.75, to: 3.75 });
    // Nothing on this road ever reaches the junction, so there is nothing to
    // stop and no stop line to paint.
    expect(approachingSpan(p, p, false, LEFT_IS_NEGATIVE)).toBeNull();
    expect(approachingLanes(p, p, false, LEFT_IS_NEGATIVE)).toEqual([]);
  });

  it('follows a turn pocket off the centreline instead of splitting down the middle', () => {
    const own = presetProfileForTier(RoadTier.TwoLane);
    // The same road with a left-turn pocket carved beside the arriving lane:
    // three lanes, so the middle of the road is no longer the centreline. The
    // arriving side is the one whose lanes FLOW toward us, which is what keeps
    // the stop line off the lane leaving.
    const pocketed: RoadProfile = {
      class: own.class,
      pieces: [
        { kind: 'sidewalk', width: 1.875 },
        { kind: 'travel', width: 3.75, flow: 'back' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'travel', width: 3.75, flow: 'fwd' },
        { kind: 'sidewalk', width: 1.875 },
      ],
    };
    const arriving = approachingLanes(pocketed, own, true, LEFT_IS_NEGATIVE);
    expect(arriving.map((l) => l.flow)).toEqual(['fwd', 'fwd']);
    const span = approachingSpan(pocketed, own, true, LEFT_IS_NEGATIVE)!;
    // Two of the three lanes, on the far side of the one running the other way.
    expect(span.to - span.from).toBeCloseTo(7.5, 6);
    // And it never reaches the lane that flows away from the junction.
    const leaving = travelLaneSpans(pocketed).find((l) => l.flow === 'back')!;
    expect(span.from).toBeGreaterThanOrEqual(leaving.to - 1e-9);
  });

  it('agrees with travelLanes about where the lanes are', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.FourLane, RoadTier.Highway]) {
      const p = presetProfileForTier(tier);
      expect(travelLaneSpans(p).map((l) => l.centre)).toEqual(travelLanes(p).map((l) => l.centre));
      for (const lane of travelLaneSpans(p)) {
        expect((lane.from + lane.to) / 2).toBeCloseTo(lane.centre, 6);
      }
    }
  });
});
