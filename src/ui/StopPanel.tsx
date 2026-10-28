/**
 * Bus stop inspector, floating left. Shows the stop the player clicked: sign
 * or shelter, the boardings a day the lines calling there carry, and whether a
 * shelter is warranted, which is what decides whether its advertising panel
 * sells. A sign can be upgraded to a shelter and either can be taken out.
 */
import type { JSX } from 'react';
import { SHELTER_WARRANT_BOARDINGS } from '../shared/types';
import type { Command } from '../shared/types';
import { Icon } from './icons';
import { useCityStore } from './store';
import { CARD_RADIUS, LABEL, PANEL_ROUNDED } from './theme';

const SIDE_NAME = { 0: 'low side', 1: 'high side' } as const;

export function StopPanel(): JSX.Element | null {
  const selected = useCityStore((s) => s.selectedStop);
  const stops = useCityStore((s) => s.stops);
  const setSelectedStop = useCityStore((s) => s.setSelectedStop);
  const bound = useCityStore((s) => s.bound);

  const stop = selected
    ? stops.find((s) => s.x === selected.x && s.z === selected.z && s.side === selected.side)
    : undefined;
  if (!stop) return null;

  const isShelter = stop.kind === 'shelter';
  const warranted = isShelter ? stop.warranted : stop.boardingsPerDay >= SHELTER_WARRANT_BOARDINGS;

  const send = (label: string, command: Command): void => {
    bound?.sendCommands(label, [command]);
  };

  return (
    <div className="pointer-events-none fixed left-3 top-1/3 z-10 w-72">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
        data-testid="stop-panel"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="transit" className="h-5 w-5 shrink-0 text-white/70" />
            <div className="font-semibold">
              {isShelter ? 'Bus shelter' : 'Bus stop sign'}{' '}
              <span className="font-normal text-white/50">
                · {stop.x}, {stop.z} · {SIDE_NAME[stop.side]}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close stop inspector"
            onClick={() => setSelectedStop(null)}
            className="text-white/60 transition-colors hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between py-0.5">
          <span className={LABEL}>Boardings a day</span>
          <span data-testid="stop-boardings">{Math.round(stop.boardingsPerDay)}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className={LABEL}>
            {isShelter ? 'Shelter warranted' : 'Shelter would be warranted'}
          </span>
          <span data-testid="stop-warranted">{warranted ? 'Yes' : 'No'}</span>
        </div>
        <p className="text-xs text-white/55">
          A shelter is warranted from {SHELTER_WARRANT_BOARDINGS} boardings a day, and a warranted
          shelter sells its advertising panel.
        </p>

        {!isShelter && (
          <button
            type="button"
            onClick={() =>
              send('Upgrade to shelter', {
                kind: 'placeStop',
                stop: { x: stop.x, z: stop.z, side: stop.side, kind: 'shelter' },
              })
            }
            className={`${CARD_RADIUS} bg-white/5 px-2 py-1.5 text-left text-white/80 transition-colors hover:bg-white/10`}
          >
            Upgrade to a shelter
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            send('Remove stop', { kind: 'removeStop', x: stop.x, z: stop.z, side: stop.side });
            setSelectedStop(null);
          }}
          className={`${CARD_RADIUS} bg-white/5 px-2 py-1.5 text-left text-white/80 transition-colors hover:bg-white/10`}
        >
          Remove the stop
        </button>
      </div>
    </div>
  );
}
