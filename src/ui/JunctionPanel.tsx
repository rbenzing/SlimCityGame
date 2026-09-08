/**
 * Junction inspector, floating left. Shows who gives way at the junction the
 * player has clicked and lets them change it.
 *
 * The default is a WARRANT — worked out from the roads that meet there and
 * what those roads have been carrying — so the first chip is Auto, and it says
 * what the warrant currently makes of the junction. Picking any other chip is
 * a decision, and a decision is sticky: the warrant never argues with it, and
 * the junction keeps it until the player hands it back.
 */
import type { JSX } from 'react';
import { controlName } from '../shared/junction';
import {
  armAllowed,
  armSlot,
  Movement,
  movementName,
  resolveLaneMovements,
  withArmAllowed,
  withLaneAllowed,
} from '../shared/approach';
import { RoadFlow } from '../shared/types';
import type { Command, JunctionControl } from '../shared/types';
import { Icon } from './icons';
import { useCityStore } from './store';
import { CARD_RADIUS, LABEL, PANEL_ROUNDED } from './theme';

/**
 * The controls the player may pick: the ladder least restrictive first — the
 * order a traffic engineer climbs — and then the roundabout, which is not on
 * the ladder at all. It changes the shape of the junction rather than only who
 * waits at it, which is why it is a choice and never a default.
 * Each carries the one line that says what it costs a driver.
 */
const CHOICES: ReadonlyArray<{ control: JunctionControl; hint: string }> = [
  { control: 'none', hint: 'Nobody stops. Quickest, and only safe where sight lines are good.' },
  {
    control: 'yield',
    hint: 'The minor road gives way. A few seconds, only for those arriving on it.',
  },
  { control: 'stop', hint: 'The minor road stops. The road running through pays nothing.' },
  { control: 'allWayStop', hint: 'Every arm stops. Fair, and slow once the junction is busy.' },
  {
    control: 'signal',
    hint: 'Signals hold each arm in turn. Slow when quiet, quickest when busy.',
  },
  {
    control: 'roundabout',
    hint: 'An island, and every entry gives way. Quick until it fills, then suddenly not.',
  },
];

/** The turns a player may take away. A U-turn is a separate matter and is not offered. */
const TURNS: readonly Movement[] = [Movement.Left, Movement.Through, Movement.Right];
const TURN_MASK = Movement.Left | Movement.Through | Movement.Right;
const TURN_GLYPHS: Readonly<Record<number, string>> = {
  [Movement.Left]: '←',
  [Movement.Through]: '↑',
  [Movement.Right]: '→',
};
const ARM_NAMES: Readonly<Record<number, string>> = {
  [RoadFlow.North]: 'From the north',
  [RoadFlow.East]: 'From the east',
  [RoadFlow.South]: 'From the south',
  [RoadFlow.West]: 'From the west',
};

export function JunctionPanel(): JSX.Element | null {
  const junction = useCityStore((s) => s.selectedJunction);
  const setSelectedJunction = useCityStore((s) => s.setSelectedJunction);
  const bound = useCityStore((s) => s.bound);

  if (!junction) return null;

  const send = (control: JunctionControl | null): void => {
    const command: Command = { kind: 'setJunctionControl', x: junction.x, z: junction.z, control };
    bound?.sendCommands('Junction control', [command]);
    // Show the choice at once; the next snapshot confirms it, or corrects it
    // if the worker refused.
    setSelectedJunction({
      ...junction,
      control: control ?? junction.warranted,
      auto: control === null,
    });
  };

  const sendTurns = (arm: RoadFlow, allowed: number): void => {
    const next = allowed & TURN_MASK;
    if (next === 0) return; // an arm has to keep something
    bound?.sendCommands('Turn restriction', [
      { kind: 'setJunctionTurns', x: junction.x, z: junction.z, arm, allowed: next },
    ]);
    setSelectedJunction({ ...junction, turns: withArmAllowed(junction.turns, arm, next) });
  };

  /**
   * What one lane may do, or a null to hand it back to the set its approach
   * derives. The arm's own restriction still wins, so a lane can only ever
   * narrow what the arm already allows.
   */
  const sendLane = (arm: RoadFlow, lane: number, allowed: number | null): void => {
    const next = allowed === null ? null : allowed & TURN_MASK;
    if (next === 0) return; // a lane has to keep something
    bound?.sendCommands('Lane turns', [
      { kind: 'setJunctionLaneTurns', x: junction.x, z: junction.z, arm, lane, allowed: next },
    ]);
    const slot = armSlot(arm);
    if (slot === null) return;
    const laneTurns = [...(junction.laneTurns ?? [0, 0, 0, 0])];
    laneTurns[slot] = withLaneAllowed(laneTurns[slot] ?? 0, lane, next);
    setSelectedJunction({ ...junction, laneTurns });
  };

  /** The sets an arm's lanes actually carry: derived, then whatever was set. */
  const lanesOf = (arm: RoadFlow): number[] => {
    const derived = junction.armLaneSets?.[arm];
    if (!derived) return [];
    const slot = armSlot(arm);
    const packed = slot === null ? 0 : (junction.laneTurns?.[slot] ?? 0);
    return resolveLaneMovements(derived, packed, armAllowed(junction.turns, arm));
  };

  const chosen = CHOICES.find((c) => !junction.auto && c.control === junction.control);

  return (
    <div className="pointer-events-none fixed left-3 top-1/3 z-10 w-80">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
        data-testid="junction-panel"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="roads" className="h-5 w-5 shrink-0 text-white/70" />
            <div className="font-semibold">
              Junction{' '}
              <span className="font-normal text-white/50">
                · {junction.x}, {junction.z}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close junction inspector"
            onClick={() => setSelectedJunction(null)}
            className="text-white/60 transition-colors hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between py-0.5">
          <span className={LABEL}>Gives way</span>
          <span data-testid="junction-current">{controlName(junction.control)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className={LABEL}>Control</span>
          <button
            type="button"
            aria-pressed={junction.auto}
            onClick={() => send(null)}
            className={`${CARD_RADIUS} px-2 py-1.5 text-left transition-colors ${
              junction.auto
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span className="font-medium">Automatic</span>
            <span className="ml-1 text-white/50">
              · {controlName(junction.warranted)} as it stands
            </span>
          </button>
          <div className="flex flex-wrap gap-1">
            {CHOICES.map(({ control }) => {
              const active = chosen?.control === control;
              return (
                <button
                  key={control}
                  type="button"
                  aria-pressed={active}
                  onClick={() => send(control)}
                  className={`${CARD_RADIUS} px-2 py-1 text-xs transition-colors ${
                    active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {controlName(control)}
                </button>
              );
            })}
          </div>
        </div>

        {junction.arms.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className={LABEL}>Turns allowed</span>
            {junction.arms.map((arm) => {
              const allowed = armAllowed(junction.turns, arm);
              return (
                <div key={arm} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/60">{ARM_NAMES[arm]}</span>
                  <div className="flex gap-1">
                    {TURNS.map((movement) => {
                      const on = (allowed & movement) !== 0;
                      // The last turn an arm has cannot be taken away: a driver
                      // who arrives has to be able to leave.
                      const last = on && (allowed & ~movement & TURN_MASK) === 0;
                      return (
                        <button
                          key={movement}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${ARM_NAMES[arm]}: ${movementName(movement)}`}
                          disabled={last}
                          onClick={() => sendTurns(arm, allowed ^ movement)}
                          className={`${CARD_RADIUS} px-2 py-1 text-xs transition-colors ${
                            on
                              ? 'bg-white/20 text-white'
                              : 'bg-white/5 text-white/40 hover:bg-white/10'
                          } ${last ? 'cursor-default opacity-60' : ''}`}
                        >
                          {TURN_GLYPHS[movement]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {junction.arms.some((arm) => lanesOf(arm).length > 1) && (
          <div className="flex flex-col gap-1">
            <span className={LABEL}>Lanes</span>
            {junction.arms.map((arm) => {
              const lanes = lanesOf(arm);
              // One lane does everything the arm does, so there is nothing to
              // tell apart and no row worth showing.
              if (lanes.length < 2) return null;
              return (
                <div key={arm} className="flex flex-col gap-0.5">
                  <span className="text-xs text-white/60">{ARM_NAMES[arm]}</span>
                  {lanes.map((allowed, lane) => (
                    <div key={lane} className="flex items-center justify-between gap-2 pl-2">
                      <span className="text-xs text-white/40">
                        {lane === 0
                          ? 'Left lane'
                          : lane === lanes.length - 1
                            ? 'Right lane'
                            : `Lane ${lane + 1}`}
                      </span>
                      <div className="flex gap-1">
                        {TURNS.map((movement) => {
                          const on = (allowed & movement) !== 0;
                          // A lane cannot be left with nothing, and cannot
                          // offer what the whole arm has been told not to.
                          const last = on && (allowed & ~movement & TURN_MASK) === 0;
                          const barred = (armAllowed(junction.turns, arm) & movement) === 0;
                          return (
                            <button
                              key={movement}
                              type="button"
                              aria-pressed={on}
                              aria-label={`${ARM_NAMES[arm]}, lane ${lane + 1}: ${movementName(movement)}`}
                              disabled={last || barred}
                              onClick={() => sendLane(arm, lane, allowed ^ movement)}
                              className={`${CARD_RADIUS} px-2 py-0.5 text-xs transition-colors ${
                                on
                                  ? 'bg-white/20 text-white'
                                  : 'bg-white/5 text-white/40 hover:bg-white/10'
                              } ${last || barred ? 'cursor-default opacity-60' : ''}`}
                            >
                              {TURN_GLYPHS[movement]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-white/55">
          {chosen
            ? chosen.hint
            : 'The junction takes the control the roads that meet here warrant, and changes it as the traffic does.'}
        </p>
      </div>
    </div>
  );
}
