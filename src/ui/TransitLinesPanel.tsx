/**
 * Transit line list. Shown while any line tool is in hand or the 'transit' lens
 * is active. Lists each committed line with its mode, color swatch, the riders
 * it carries, the vehicles it runs over the vehicles it asked for, its headway
 * and the month's running cost — or, where no depot of its mode fields it,
 * which depot to build — with a delete affordance (emits deleteTransitLine)
 * and a one-line hint for the click-to-place-stops / right-click-to-finish
 * drawing flow. The footer sums the running cost the budget is charged, and
 * the advertising the warranted bus shelters earn it.
 */
import type { JSX } from 'react';
import { Icon } from './icons';
import { useCityStore } from './store';
import { LABEL, PANEL_ROUNDED } from './theme';
import type { TransitMode } from '../shared/types';

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Which mode a line runs as — the swatch alone cannot say bus from tram. */
const MODE_LABEL: Record<TransitMode, string> = { bus: 'Bus', rail: 'Rail', tram: 'Tram' };

/** The depot that fields each mode, named as its card is. */
const DEPOT_LABEL: Record<TransitMode, string> = {
  bus: 'Bus Depot',
  rail: 'Rail Yard',
  tram: 'Tram Depot',
};

export function TransitLinesPanel(): JSX.Element | null {
  const selectedTool = useCityStore((s) => s.selectedTool);
  const overlay = useCityStore((s) => s.overlay);
  const lines = useCityStore((s) => s.transitLines);
  const ridership = useCityStore((s) => s.transitRidership);
  const fleet = useCityStore((s) => s.transitFleet);
  const deleteLine = useCityStore((s) => s.deleteTransitLine);
  const advertising = useCityStore((s) => s.stats.advertising ?? 0);

  const drawing = selectedTool.startsWith('transit.');
  const visible = drawing || overlay === 'transit';
  if (!visible) return null;

  const runningTotal = fleet.runningCost.reduce((sum, c) => sum + c, 0);

  return (
    <div className="pointer-events-none fixed left-3 top-16 z-10 w-72">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="transit" className="h-5 w-5 text-white/70" />
          Transit Lines
        </div>

        {drawing && <div className={LABEL}>Click stops in order · right-click to finish</div>}

        {lines.length === 0 ? (
          <div className={LABEL}>No lines yet</div>
        ) : (
          <div className="flex flex-col gap-1">
            {lines.map((line, i) => {
              const mode = line.mode ?? 'bus';
              const served = fleet.served[i] ?? 0;
              const requested = fleet.requested[i] ?? 0;
              const headway = fleet.headwayMin[i] ?? 0;
              const cost = fleet.runningCost[i] ?? 0;
              const depot = fleet.depotId?.[i] ?? null;
              const noDepot = served === 0 && requested > 0;
              return (
                <div
                  key={line.id}
                  className="flex flex-col gap-0.5 rounded-md bg-white/5 px-2 py-1 text-[12px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: hexColor(line.color) }}
                      />
                      {MODE_LABEL[mode]} {line.id}
                    </span>
                    <span className="text-white/60">{Math.round(ridership[i] ?? 0)} riders</span>
                    <button
                      type="button"
                      aria-label={`Delete line ${line.id}`}
                      onClick={() => deleteLine(line.id)}
                      className="text-white/50 transition-colors hover:text-white"
                    >
                      <Icon name="close" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {noDepot ? (
                    <div
                      className="text-[11px] text-[#e5533f]"
                      data-testid={`line-${line.id}-no-depot`}
                    >
                      No depot — build a {DEPOT_LABEL[mode]}
                    </div>
                  ) : (
                    <div
                      className="text-[11px] text-white/60"
                      data-testid={`line-${line.id}-service`}
                    >
                      {served} of {requested} vehicles · every {headway.toFixed(1)} min · ¢{cost}/mo
                      {depot !== null && ` · from ${DEPOT_LABEL[mode]}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {lines.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span className="uppercase tracking-wide">Transit running</span>
            <span data-testid="transit-running-total">¢{runningTotal}/mo</span>
          </div>
        )}
        {advertising > 0 && (
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span className="uppercase tracking-wide">Shelter advertising</span>
            <span data-testid="shelter-advertising" className="text-[#5dd06b]">
              +¢{Math.round(advertising)}/mo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
