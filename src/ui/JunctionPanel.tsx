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
import type { Command, JunctionControl } from '../shared/types';
import { Icon } from './icons';
import { useCityStore } from './store';
import { CARD_RADIUS, LABEL, PANEL_ROUNDED } from './theme';

/**
 * The controls the player may pick, least restrictive first — the order a
 * traffic engineer climbs, so the list reads as a ladder rather than a menu.
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
];

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

        <p className="text-xs text-white/55">
          {chosen
            ? chosen.hint
            : 'The junction takes the control the roads that meet here warrant, and changes it as the traffic does.'}
        </p>
      </div>
    </div>
  );
}
