/**
 * The legend under the active-view chip: what the lens colours mean (a scale
 * with both ends named, or the named categories), a sentence when the lens has
 * nothing to show, and the things the underground view draws. It stays up
 * whether the lens picker is open or shut.
 */
import type { JSX } from 'react';
import { isUnderground } from '../shared/view';
import {
  emptyLensText,
  lensLegend,
  UNDERGROUND_LEGEND,
  type LegendEntry,
  type LensLegend,
} from './lensLegend';
import { useCityStore } from './store';

function Swatches({ entries }: { entries: readonly LegendEntry[] }): JSX.Element {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-sm border border-white/60"
            style={{ backgroundColor: entry.color }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function Scale({ legend }: { legend: Extract<LensLegend, { kind: 'ramp' }> }): JSX.Element {
  const gradient = legend.stops.map((stop) => `${stop.color} ${stop.at}%`).join(', ');
  return (
    <div className="flex flex-col gap-0.5">
      <div
        aria-hidden="true"
        className="h-2.5 w-full rounded-sm border border-white/60"
        style={{ backgroundImage: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="flex justify-between gap-3">
        <span>0 {legend.low}</span>
        <span>{legend.high} 255</span>
      </div>
      <span className="text-white/60">Scale: {legend.unit}</span>
    </div>
  );
}

export function ViewLegend(): JSX.Element | null {
  const overlay = useCityStore((s) => s.overlay);
  const selectedTool = useCityStore((s) => s.selectedTool);
  const lensEmpty = useCityStore((s) => s.lensEmpty);
  const transitLines = useCityStore((s) => s.transitLines);
  const districts = useCityStore((s) => s.districts);

  const legend = overlay === null ? null : lensLegend(overlay, { transitLines, districts });
  const underground = isUnderground(overlay, selectedTool);
  if (legend === null && !underground) return null;

  const empty =
    legend !== null &&
    legend.thing !== null &&
    (legend.kind === 'categories' && (overlay === 'transit' || overlay === 'districts')
      ? legend.entries.length === 0
      : lensEmpty);

  return (
    <section
      aria-label="Legend"
      className="pointer-events-auto flex max-h-40 w-72 max-w-full flex-col gap-1.5 overflow-y-auto rounded-[10px] border border-[#ffffff14] bg-panel/85 p-2 text-[11px] leading-snug text-white shadow-[0_4px_24px_#0008] backdrop-blur-md"
    >
      {legend !== null && (
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{legend.name}</span>
          {empty && legend.thing !== null ? (
            <p>{emptyLensText(legend.thing)}</p>
          ) : legend.kind === 'ramp' ? (
            <Scale legend={legend} />
          ) : (
            <Swatches entries={legend.entries} />
          )}
          {legend.note !== undefined && <p className="text-white/70">{legend.note}</p>}
        </div>
      )}
      {underground && (
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Underground</span>
          <Swatches entries={UNDERGROUND_LEGEND} />
        </div>
      )}
    </section>
  );
}
