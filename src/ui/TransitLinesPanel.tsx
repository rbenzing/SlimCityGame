/**
 * Bus transit line list. Shown while the
 * transit.line tool is in hand or the 'transit' lens is active. Lists each
 * committed bus line with its color swatch + statistical ridership, a delete
 * affordance (emits deleteTransitLine), and a one-line hint for the click-to-
 * place-stops / right-click-to-finish drawing flow.
 */
import type { JSX } from 'react';
import { Icon } from './icons';
import { useCityStore } from './store';
import { LABEL, PANEL_ROUNDED } from './theme';

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function TransitLinesPanel(): JSX.Element | null {
  const selectedTool = useCityStore((s) => s.selectedTool);
  const overlay = useCityStore((s) => s.overlay);
  const lines = useCityStore((s) => s.transitLines);
  const ridership = useCityStore((s) => s.transitRidership);
  const deleteLine = useCityStore((s) => s.deleteTransitLine);

  const visible = selectedTool === 'transit.line' || overlay === 'transit';
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed left-3 top-16 z-10 w-64">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="transit" className="h-5 w-5 text-white/70" />
          Bus Lines
        </div>

        {selectedTool === 'transit.line' && (
          <div className={LABEL}>Click stops in order · right-click to finish</div>
        )}

        {lines.length === 0 ? (
          <div className={LABEL}>No lines yet</div>
        ) : (
          <div className="flex flex-col gap-1">
            {lines.map((line, i) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1 text-[12px]"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: hexColor(line.color) }}
                  />
                  Line {line.id}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
