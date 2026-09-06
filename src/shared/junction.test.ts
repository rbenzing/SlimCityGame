import { describe, expect, it } from 'vitest';
import {
  ALL_WAY_MAJOR_VC,
  ALL_WAY_MINOR_VC,
  SIGNAL_AMBER_S,
  SIGNAL_CYCLE_S,
  SIGNAL_CYCLE_WITH_LEFT_S,
  SIGNAL_MINOR_VC,
  STOP_MAJOR_VC,
  YIELD_COMBINED_VC,
  approachGivesWay,
  controlDelaySeconds,
  controlName,
  restrictiveness,
  signalAspect,
  stricterOf,
  warrantedControl,
} from './junction';
import type { JunctionApproach } from './junction';
import type { RoadClassId } from './types';

/** An arm of a junction: its class, its lanes in, and how busy it is. */
const arm = (classId: RoadClassId, vc = 0, lanes = 1): JunctionApproach => ({
  classId,
  lanes,
  vc,
});

/** The same class on every arm, all quiet. */
const legs = (classId: RoadClassId, count = 4): JunctionApproach[] =>
  Array.from({ length: count }, () => arm(classId));

describe('warrantedControl reads the classes that meet', () => {
  it('a bend or a dead end is not a junction and takes no control', () => {
    expect(warrantedControl([])).toBe('none');
    expect(warrantedControl(legs('arterial', 1))).toBe('none');
    expect(warrantedControl(legs('arterial', 2))).toBe('none');
  });

  it('two locals, and anything unpaved or rural, meet on sight lines', () => {
    expect(warrantedControl(legs('local'))).toBe('none');
    expect(warrantedControl(legs('dirt'))).toBe('none');
    expect(warrantedControl(legs('alley'))).toBe('none');
    expect(warrantedControl(legs('rural'))).toBe('none');
    expect(warrantedControl([arm('dirt'), arm('rural'), arm('alley')])).toBe('none');
  });

  it('a lesser road running onto a bigger one stops', () => {
    // MUTCD 2B.11: minor-road stop control where a lower functional
    // classification meets a higher one.
    expect(warrantedControl([arm('local'), arm('urban'), arm('urban')])).toBe('stop');
    expect(warrantedControl([arm('dirt'), arm('local'), arm('local')])).toBe('stop');
    expect(warrantedControl([arm('alley'), arm('urban'), arm('urban')])).toBe('stop');
  });

  it('two collectors, or any junction an arterial touches, is signalised', () => {
    expect(warrantedControl(legs('collector'))).toBe('signal');
    expect(warrantedControl([arm('local'), arm('arterial'), arm('arterial')])).toBe('signal');
    expect(warrantedControl([arm('dirt'), arm('divided'), arm('divided')])).toBe('signal');
  });

  it('but a local meeting a collector only stops — the minor road decides', () => {
    expect(warrantedControl([arm('local'), arm('collector'), arm('collector')])).toBe('stop');
  });

  it('two equal town streets have no minor road, so every arm stops', () => {
    expect(warrantedControl(legs('urban'))).toBe('allWayStop');
    expect(warrantedControl(legs('oneWay'))).toBe('allWayStop');
  });

  it('nothing that touches a motorway or a railway takes a control', () => {
    for (const c of ['highway', 'rail'] as const) {
      expect(warrantedControl([arm(c), arm('arterial'), arm('arterial')]), c).toBe('none');
    }
  });

  it('a slip road is uncontrolled where it meets the motorway and signalised where it leaves it', () => {
    // At the motorway end the motorway arm keeps the whole thing uncontrolled:
    // that end is a merge, and traffic is never stopped on a motorway.
    expect(warrantedControl([arm('ramp'), arm('highway'), arm('highway')])).toBe('none');
    // The other end is a ramp TERMINAL on the surface network — the busiest
    // junction an interchange has, and what the interchange is signalised at.
    expect(warrantedControl([arm('ramp'), arm('arterial'), arm('arterial')])).toBe('signal');
    expect(warrantedControl([arm('ramp'), arm('local'), arm('local')])).toBe('signal');
  });
});

describe('warrantedControl steps up when the traffic warrants it', () => {
  it('two quiet locals earn a give-way once they carry enough between them', () => {
    const busy = YIELD_COMBINED_VC / 4 + 0.001;
    expect(warrantedControl(legs('local'))).toBe('none');
    expect(
      warrantedControl([
        arm('local', busy),
        arm('local', busy),
        arm('local', busy),
        arm('local', busy),
      ]),
    ).toBe('yield');
  });

  it('a rural crossroads carrying real traffic is signed rather than left bare', () => {
    expect(warrantedControl([arm('rural', 0.08), arm('rural', 0.08), arm('rural', 0.08)])).toBe(
      'yield',
    );
  });

  it('a busy major road makes its minor arm stop even where the classes would not', () => {
    // Two locals meeting a rural road: the classes alone say nothing, the
    // volume on the through road says stop.
    const before = warrantedControl([arm('dirt'), arm('rural'), arm('rural')]);
    expect(before).toBe('none');
    expect(
      warrantedControl([arm('dirt'), arm('rural', STOP_MAJOR_VC), arm('rural', STOP_MAJOR_VC)]),
    ).toBe('stop');
  });

  it('both arms busy on single-lane roads earns an all-way stop', () => {
    expect(
      warrantedControl([
        arm('local', ALL_WAY_MINOR_VC),
        arm('urban', ALL_WAY_MAJOR_VC),
        arm('urban', ALL_WAY_MAJOR_VC),
      ]),
    ).toBe('allWayStop');
  });

  it('the same traffic on a major road with lanes to spare earns a signal instead', () => {
    expect(
      warrantedControl([
        arm('local', SIGNAL_MINOR_VC),
        arm('urban', ALL_WAY_MAJOR_VC, 2),
        arm('urban', ALL_WAY_MAJOR_VC, 2),
      ]),
    ).toBe('signal');
  });

  it('never steps a motorway junction up, however busy it gets', () => {
    expect(
      warrantedControl([arm('highway', 0.9, 4), arm('urban', 0.9, 2), arm('urban', 0.9, 2)]),
    ).toBe('none');
  });
});

describe('the ladder', () => {
  it('climbs from nothing to a signal', () => {
    const ladder = ['none', 'yield', 'stop', 'allWayStop', 'signal'] as const;
    const ranks = ladder.map(restrictiveness);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ladder.length);
  });

  it('combines two warrants by taking the more restrictive', () => {
    expect(stricterOf('none', 'stop')).toBe('stop');
    expect(stricterOf('signal', 'yield')).toBe('signal');
    expect(stricterOf('stop', 'stop')).toBe('stop');
  });

  it('names every control for the inspector', () => {
    for (const c of ['none', 'yield', 'stop', 'allWayStop', 'signal', 'roundabout'] as const) {
      expect(controlName(c).length).toBeGreaterThan(0);
    }
  });
});

describe('approachGivesWay says who has to give way', () => {
  const junction = [arm('local'), arm('urban'), arm('urban')];

  it('under a give-way or a minor-road stop, only the minor road does', () => {
    for (const control of ['yield', 'stop'] as const) {
      expect(approachGivesWay(control, junction[0]!, junction), control).toBe(true);
      expect(approachGivesWay(control, junction[1]!, junction), control).toBe(false);
    }
  });

  it('under an all-way stop, a signal or a roundabout, everybody does', () => {
    for (const control of ['allWayStop', 'signal', 'roundabout'] as const) {
      expect(approachGivesWay(control, junction[1]!, junction), control).toBe(true);
    }
  });

  it('with no minor road to pick, a stop falls on every arm', () => {
    const equal = legs('urban', 3);
    expect(approachGivesWay('stop', equal[0]!, equal)).toBe(true);
  });

  it('nobody gives way where there is no control', () => {
    expect(approachGivesWay('none', junction[0]!, junction)).toBe(false);
  });
});

describe('controlDelaySeconds costs what the manual costs', () => {
  const quiet = { vc: 0, greenShare: 0.5 };

  it('an uncontrolled junction is free', () => {
    expect(controlDelaySeconds('none', false, quiet)).toBe(0);
  });

  it('the road that runs through pays nothing at a give-way or a minor-road stop', () => {
    expect(controlDelaySeconds('yield', false, { vc: 0.9, greenShare: 0.5 })).toBe(0);
    expect(controlDelaySeconds('stop', false, { vc: 0.9, greenShare: 0.5 })).toBe(0);
  });

  it('a give-way costs less than a stop, which costs less than an all-way stop', () => {
    const y = controlDelaySeconds('yield', true, quiet);
    const s = controlDelaySeconds('stop', true, quiet);
    const a = controlDelaySeconds('allWayStop', true, quiet);
    expect(y).toBeCloseTo(3, 6);
    expect(s).toBeCloseTo(9, 6);
    expect(a).toBeCloseTo(10, 6);
    expect(y).toBeLessThan(s);
    expect(s).toBeLessThan(a);
  });

  it('every control gets worse as the arm fills up', () => {
    for (const c of ['yield', 'stop', 'allWayStop', 'roundabout', 'signal'] as const) {
      const empty = controlDelaySeconds(c, true, { vc: 0, greenShare: 0.5 });
      const full = controlDelaySeconds(c, true, { vc: 1, greenShare: 0.5 });
      expect(full, c).toBeGreaterThan(empty);
    }
  });

  it('a roundabout is quick until it is suddenly not', () => {
    const half = controlDelaySeconds('roundabout', true, { vc: 0.5, greenShare: 0.5 });
    const full = controlDelaySeconds('roundabout', true, { vc: 1, greenShare: 0.5 });
    expect(half).toBeCloseTo(4 + 10 * 0.125, 6);
    expect(full).toBeCloseTo(14, 6);
    // At half capacity it beats a four-way stop; at capacity it does not.
    expect(half).toBeLessThan(
      controlDelaySeconds('allWayStop', true, { vc: 0.5, greenShare: 0.5 }),
    );
    expect(full).toBeGreaterThan(
      controlDelaySeconds('allWayStop', true, { vc: 0, greenShare: 0.5 }),
    );
  });

  it("a signal is Webster's uniform delay on the arm's own green", () => {
    // 0.5 · 60 · (1 − 0.5)² / (1 − 0) = 7.5 s on an empty arm with half the cycle.
    expect(controlDelaySeconds('signal', true, { vc: 0, greenShare: 0.5 })).toBeCloseTo(7.5, 6);
    // A generous green is quicker than a mean one, both ways round.
    const generous = controlDelaySeconds('signal', true, { vc: 0.5, greenShare: 0.7 });
    const mean = controlDelaySeconds('signal', true, { vc: 0.5, greenShare: 0.3 });
    expect(generous).toBeLessThan(mean);
  });

  it('a third phase for a dedicated left costs the whole junction more', () => {
    const two = controlDelaySeconds('signal', true, {
      vc: 0.4,
      greenShare: 0.45,
      cycleSeconds: SIGNAL_CYCLE_S,
    });
    const three = controlDelaySeconds('signal', true, {
      vc: 0.4,
      greenShare: 0.45,
      cycleSeconds: SIGNAL_CYCLE_WITH_LEFT_S,
    });
    expect(three / two).toBeCloseTo(SIGNAL_CYCLE_WITH_LEFT_S / SIGNAL_CYCLE_S, 6);
  });

  it('a signalised arterial beats a four-way stop, which is why it is warranted', () => {
    const busy = { vc: 0.8, greenShare: 0.49 };
    expect(controlDelaySeconds('signal', true, busy)).toBeLessThan(
      controlDelaySeconds('allWayStop', true, busy),
    );
  });

  it('stays finite past capacity rather than dividing by nothing', () => {
    for (const c of ['yield', 'stop', 'allWayStop', 'signal', 'roundabout'] as const) {
      const d = controlDelaySeconds(c, true, { vc: 5, greenShare: 0.99 });
      expect(Number.isFinite(d), c).toBe(true);
      expect(d, c).toBeGreaterThan(0);
    }
  });
});

describe('signalAspect cycles the two phases the delay formula assumes', () => {
  it('gives the north-south movement the first half of the cycle', () => {
    expect(signalAspect(true, 0)).toBe('green');
    expect(signalAspect(false, 0)).toBe('red');
    expect(signalAspect(true, SIGNAL_CYCLE_S / 2)).toBe('red');
    expect(signalAspect(false, SIGNAL_CYCLE_S / 2)).toBe('green');
  });

  it('ends each green with an amber, and never shows two greens at once', () => {
    const half = SIGNAL_CYCLE_S / 2;
    expect(signalAspect(true, half - SIGNAL_AMBER_S)).toBe('amber');
    expect(signalAspect(true, half - SIGNAL_AMBER_S - 0.1)).toBe('green');
    expect(signalAspect(false, SIGNAL_CYCLE_S - 1)).toBe('amber');
    for (let t = 0; t < SIGNAL_CYCLE_S; t += 0.5) {
      const both = signalAspect(true, t) !== 'red' && signalAspect(false, t) !== 'red';
      expect(both, `t=${t}`).toBe(false);
    }
  });

  it('repeats, and reads a negative or huge clock the same as any other', () => {
    for (const t of [7, 7.5, 31]) {
      expect(signalAspect(true, t + SIGNAL_CYCLE_S * 3)).toBe(signalAspect(true, t));
      expect(signalAspect(true, t - SIGNAL_CYCLE_S * 3)).toBe(signalAspect(true, t));
    }
  });

  it('stretches to a longer cycle rather than running the same clock faster', () => {
    // A three-phase junction holds its green longer, not more often.
    expect(signalAspect(true, 40, SIGNAL_CYCLE_WITH_LEFT_S)).toBe('green');
    expect(signalAspect(true, 40)).toBe('red'); // past halfway on the 60 s cycle
  });
});
