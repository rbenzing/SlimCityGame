/**
 * Who gives way where roads meet, and what it costs to get through.
 *
 * A junction's control is not authored. It is WARRANTED: read off the roads
 * that meet — which of them is the minor one, and how much traffic each has
 * been carrying — the way an engineer picks the least restrictive control that
 * still works. The same two inputs give the delay a driver pays to cross,
 * which is added to the path cost so a city of all-way stops is measurably
 * slower than one that signals its arterials.
 *
 * Pure: offsets, seconds and classes, no grid and no graph.
 */
import { classRank } from './roadprofile';
import type { JunctionControl, RoadClassId } from './types';

/**
 * The ladder, least restrictive first. A warrant only ever climbs it, so two
 * rules that disagree resolve to the more restrictive answer. `roundabout` is
 * absent on purpose: it changes the geometry of the junction and is therefore
 * a choice, never a default.
 */
export const WARRANT_LADDER: readonly JunctionControl[] = [
  'none',
  'yield',
  'stop',
  'allWayStop',
  'signal',
];

/** Where a control sits on the ladder; a roundabout sits beside minor-road stop. */
export function restrictiveness(control: JunctionControl): number {
  if (control === 'roundabout') return WARRANT_LADDER.indexOf('stop');
  return WARRANT_LADDER.indexOf(control);
}

/** The more restrictive of two controls, which is how two warrants combine. */
export function stricterOf(a: JunctionControl, b: JunctionControl): JunctionControl {
  return restrictiveness(b) > restrictiveness(a) ? b : a;
}

/** One road arriving at a junction, as the warrant reads it. */
export interface JunctionApproach {
  /** The class of the road on this arm. */
  classId: RoadClassId;
  /** Travel lanes carrying traffic INTO the junction on this arm. */
  lanes: number;
  /** Volume over capacity on this arm, 0 when nothing has driven it yet. */
  vc: number;
}

/**
 * Classes that never take a node control. A motorway and its slip roads are
 * grade-separated — they meet other roads at an interchange, not at a junction
 * — and rail has its own network and its own crossings.
 */
const UNCONTROLLED_CLASSES: ReadonlySet<RoadClassId> = new Set(['highway', 'ramp', 'rail']);

/**
 * The widest class that meets other roads with nothing at all: an unpaved
 * track, a service alley, a country road. Two of them cross on sight lines.
 */
const UNSIGNED_CEILING = classRank('rural');

/** At and above this class, a junction is signalised rather than signed. */
const SIGNAL_FLOOR = classRank('collector');

/** At and above this class, any junction it touches is signalised. */
const ALWAYS_SIGNAL_FLOOR = classRank('arterial');

/**
 * Two roads of the same class and above this rank have no minor road to stop,
 * so they all stop — the four-way stop an American grid is full of. Below it,
 * two equal streets are quiet enough to meet on sight lines.
 */
const ALL_WAY_FLOOR = classRank('oneWay');

// The v/c a junction has to be carrying, sustained, before its default steps
// up a rung. The MUTCD states these as vehicles per hour — 500 major plus 150
// minor for a signal, 300 plus 200 for an all-way stop, and roughly 2,000
// vehicles a day combined before two minor roads are signed at all. Each of
// those is about a fixed fraction of what the approach lanes can carry, and a
// fraction survives any change to the sim's trip volume, so a fraction is what
// is stored.
/** Two minor roads carrying this much between them earn a give-way. */
export const YIELD_COMBINED_VC = 0.15;
/** A major road carrying this much makes the minor road stop. */
export const STOP_MAJOR_VC = 0.3;
/** Both arms this busy, and every one of them stops. */
export const ALL_WAY_MAJOR_VC = 0.4;
export const ALL_WAY_MINOR_VC = 0.3;
/** A busy major road with lanes to spare is signalised instead of stopped. */
export const SIGNAL_MINOR_VC = 0.25;
/** Lanes per direction on the major road below which a signal is not warranted. */
export const SIGNAL_MAJOR_LANES = 2;

/**
 * How the arms divide into the major road and the minor one. The minor road is
 * the lower functional classification, which is the first criterion the MUTCD
 * gives for choosing it; where every arm ranks the same there is no minor road
 * and the busiest arm stands in for the major one, which is how the "more
 * critical minor-street approach" is read.
 */
function splitByRank(approaches: readonly JunctionApproach[]): {
  major: JunctionApproach[];
  minor: JunctionApproach[];
  allEqual: boolean;
} {
  const top = Math.max(...approaches.map((a) => classRank(a.classId)));
  const major = approaches.filter((a) => classRank(a.classId) === top);
  const minor = approaches.filter((a) => classRank(a.classId) < top);
  return { major, minor, allEqual: minor.length === 0 };
}

/** The largest v/c among some arms, or 0 when there are none. */
function peakVc(arms: readonly JunctionApproach[]): number {
  return arms.reduce((max, a) => Math.max(max, a.vc), 0);
}

/**
 * What the classes alone call for, before anyone has driven through. Two
 * locals, or anything unpaved or rural, meet with no control; a lesser road
 * running onto a bigger one stops; two collectors, or any junction an arterial
 * touches, is signalised. Two equal town streets have no minor road to stop,
 * so every arm stops — the four-way stop an American grid is full of.
 */
function classWarrant(approaches: readonly JunctionApproach[]): JunctionControl {
  const ranks = approaches.map((a) => classRank(a.classId));
  if (ranks.every((r) => r <= UNSIGNED_CEILING)) return 'none';
  if (ranks.some((r) => r >= ALWAYS_SIGNAL_FLOOR)) return 'signal';

  const { minor, allEqual } = splitByRank(approaches);
  const deciding = allEqual
    ? Math.max(...ranks)
    : Math.max(...minor.map((a) => classRank(a.classId)));
  if (deciding >= SIGNAL_FLOOR) return 'signal';
  if (!allEqual) return 'stop';
  return Math.max(...ranks) >= ALL_WAY_FLOOR ? 'allWayStop' : 'none';
}

/**
 * What the traffic alone calls for. Each rung mirrors a warrant engineers
 * actually apply, restated as a share of what the arms can carry.
 */
function volumeWarrant(approaches: readonly JunctionApproach[]): JunctionControl {
  const { major, minor, allEqual } = splitByRank(approaches);
  const majorVc = peakVc(major);
  // With no minor road, the busiest arm is the major one and the next busiest
  // stands in for the minor: the more critical minor-street approach.
  const sorted = [...approaches].sort((a, b) => b.vc - a.vc);
  const minorVc = allEqual ? (sorted[1]?.vc ?? 0) : peakVc(minor);
  const majorLanes = major.reduce((max, a) => Math.max(max, a.lanes), 0);

  let control: JunctionControl = 'none';
  const combined = approaches.reduce((sum, a) => sum + a.vc, 0);
  if (combined >= YIELD_COMBINED_VC) control = stricterOf(control, 'yield');
  if (!allEqual && majorVc >= STOP_MAJOR_VC) control = stricterOf(control, 'stop');
  if (majorVc >= ALL_WAY_MAJOR_VC && minorVc >= ALL_WAY_MINOR_VC) {
    control = stricterOf(control, 'allWayStop');
  }
  if (
    majorVc >= ALL_WAY_MAJOR_VC &&
    minorVc >= SIGNAL_MINOR_VC &&
    majorLanes >= SIGNAL_MAJOR_LANES
  ) {
    control = stricterOf(control, 'signal');
  }
  return control;
}

/**
 * The control a junction gets when nobody has said otherwise: the more
 * restrictive of what the classes call for and what the traffic calls for.
 *
 * Fewer than three arms is not a junction — it is a bend, or the end of a
 * road — and nothing that touches a motorway, a slip road or a railway takes
 * a control at all.
 */
export function warrantedControl(approaches: readonly JunctionApproach[]): JunctionControl {
  if (approaches.length < 3) return 'none';
  if (approaches.some((a) => UNCONTROLLED_CLASSES.has(a.classId))) return 'none';
  return stricterOf(classWarrant(approaches), volumeWarrant(approaches));
}

/**
 * Whether a driver arriving on this arm has to give way. Under a give-way or a
 * minor-road stop only the minor road does; under an all-way stop, a signal or
 * a roundabout everybody does.
 */
export function approachGivesWay(
  control: JunctionControl,
  approach: JunctionApproach,
  approaches: readonly JunctionApproach[],
): boolean {
  if (control === 'none') return false;
  if (control === 'yield' || control === 'stop') {
    const { allEqual } = splitByRank(approaches);
    if (allEqual) return true;
    const top = Math.max(...approaches.map((a) => classRank(a.classId)));
    return classRank(approach.classId) < top;
  }
  return true;
}

/**
 * The same rule as `approachGivesWay`, read off the hierarchy ranks alone —
 * what the render has to work with, since it draws a junction from the tiers
 * around a tile and knows nothing of classes or volumes. An arm below the top
 * rank gives way to it; where every arm ranks the same there is no road that
 * runs through, so they all do.
 */
export function armGivesWay(armRank: number, armRanks: readonly number[]): boolean {
  if (armRanks.length === 0) return true;
  const top = Math.max(...armRanks);
  return armRanks.every((r) => r === top) || armRank < top;
}

/** A two-phase signal cycle; a third phase for a dedicated left makes it 90. */
export const SIGNAL_CYCLE_S = 60;
export const SIGNAL_CYCLE_WITH_LEFT_S = 90;
/** How long the amber that ends each green runs for. */
export const SIGNAL_AMBER_S = 3;

/** What a signal head is showing. */
export type SignalAspect = 'red' | 'amber' | 'green';

/**
 * The aspect an approach shows at `seconds` into the cycle. Two phases: the
 * north-south movement runs for the first half and the east-west for the
 * second, each ending in amber — the two-phase junction the delay formula
 * already assumes, made visible. Every signalised junction in the city runs
 * the same clock, which is what a coordinated arterial does anyway.
 */
export function signalAspect(
  runsNorthSouth: boolean,
  seconds: number,
  cycleSeconds: number = SIGNAL_CYCLE_S,
): SignalAspect {
  const half = cycleSeconds / 2;
  const t = ((seconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
  const mine = runsNorthSouth ? t < half : t >= half;
  if (!mine) return 'red';
  const into = runsNorthSouth ? t : t - half;
  return into >= half - SIGNAL_AMBER_S ? 'amber' : 'green';
}

export interface DelayInputs {
  /** Volume over capacity on the arm the driver arrives on. */
  vc: number;
  /** The share of the cycle this arm is green for — the class's own g/C. */
  greenShare: number;
  /** Cycle length in seconds; 90 once any arm has a dedicated left turn. */
  cycleSeconds?: number;
}

/**
 * Seconds a driver loses crossing this junction, from the Highway Capacity
 * Manual's forms reduced to the two numbers the sim has. Everything below a
 * signal is the manual's quadratic in v/c; a signal is Webster's uniform
 * delay, which is why a signal with a generous green beats a four-way stop and
 * a signal with a mean one does not.
 *
 * `givesWay` is false for a driver on the road that runs through, who pays
 * nothing at a give-way or a minor-road stop and pays in full at everything
 * else.
 */
export function controlDelaySeconds(
  control: JunctionControl,
  givesWay: boolean,
  inputs: DelayInputs,
): number {
  const x = Math.max(0, Math.min(1, inputs.vc));
  switch (control) {
    case 'none':
      return 0;
    case 'yield':
      return givesWay ? 3 + 4 * x * x : 0;
    case 'stop':
      return givesWay ? 9 + 12 * x * x : 0;
    case 'allWayStop':
      return 10 + 15 * x * x;
    case 'roundabout':
      return 4 + 10 * x * x * x;
    case 'signal': {
      const g = Math.max(0.05, Math.min(0.95, inputs.greenShare));
      const c = inputs.cycleSeconds ?? SIGNAL_CYCLE_S;
      return (0.5 * c * (1 - g) * (1 - g)) / (1 - x * g);
    }
  }
}

/**
 * How a player's override is stored: one byte per tile, 0 meaning they have
 * not overridden anything and the warrant decides. The order is fixed, since
 * a save holds these numbers.
 */
const CONTROL_BY_CODE: readonly JunctionControl[] = [
  'none',
  'yield',
  'stop',
  'allWayStop',
  'signal',
  'roundabout',
];

/** The byte a stored override holds; 0 for no override. */
export function codeForControl(control: JunctionControl | null): number {
  if (control === null) return 0;
  return CONTROL_BY_CODE.indexOf(control) + 1;
}

/** The override a stored byte names, or null when the warrant decides. */
export function controlFromCode(code: number): JunctionControl | null {
  return CONTROL_BY_CODE[code - 1] ?? null;
}

/** How a control reads in the advisor and the junction inspector. */
const CONTROL_NAMES: Readonly<Record<JunctionControl, string>> = {
  none: 'Uncontrolled',
  yield: 'Give way',
  stop: 'Stop',
  allWayStop: 'All-way stop',
  signal: 'Signals',
  roundabout: 'Roundabout',
};

export function controlName(control: JunctionControl): string {
  return CONTROL_NAMES[control];
}
