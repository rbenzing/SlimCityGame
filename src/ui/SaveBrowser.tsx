/**
 * Save-slot browser: lists saved cities with Load/Delete actions. Pure
 * presentational — no store/persistence access; the integrator supplies the
 * row data and click handlers via props.
 */
import type { JSX } from 'react';
import { formatFunds, formatPopulation } from './format';
import { PANEL_ROUNDED } from './theme';

export interface SaveRow {
  id: string | number;
  name: string;
  timestamp: number;
  population?: number;
  funds?: number;
}

export interface SaveBrowserProps {
  saves: SaveRow[];
  onLoad: (id: SaveRow['id']) => void;
  onDelete: (id: SaveRow['id']) => void;
  onBack: () => void;
}

function formatTimestamp(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(ms),
  );
}

export function SaveBrowser({ saves, onLoad, onDelete, onBack }: SaveBrowserProps): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#05070cd9] p-6 backdrop-blur-sm"
      role="dialog"
      aria-label="Load city"
    >
      <div className={`flex w-full max-w-md flex-col gap-3 p-4 text-white ${PANEL_ROUNDED}`}>
        <h2 className="text-lg font-semibold">Saved Cities</h2>
        {saves.length === 0 ? (
          <p className="text-sm text-white/60">No saved cities yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {saves.map((save) => (
              <li
                key={save.id}
                className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{save.name}</span>
                  <span className="text-xs text-white/50">{formatTimestamp(save.timestamp)}</span>
                  {(save.population !== undefined || save.funds !== undefined) && (
                    <span className="text-xs text-white/50">
                      {save.population !== undefined && `Pop ${formatPopulation(save.population)}`}
                      {save.population !== undefined && save.funds !== undefined && ' · '}
                      {save.funds !== undefined && formatFunds(save.funds)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`Load ${save.name}`}
                    onClick={() => onLoad(save.id)}
                    className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/80"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${save.name}`}
                    onClick={() => onDelete(save.id)}
                    className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-red-500/30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
      >
        Back
      </button>
    </div>
  );
}
