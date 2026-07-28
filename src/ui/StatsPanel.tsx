/**
 * Stats charts panel: draws simple SVG line charts (no external chart lib)
 * over a fed StatsSample history, with a toggle button per series.
 * Deliberately takes `samples: StatsSample[]` as a prop rather than reading
 * ui/store.ts or statshistory.ts's StatsHistory class directly — the
 * integrator wires a StatsHistory instance (fed from each SimSnapshot) into
 * this prop, whether via a plain prop drill or a store selector.
 */
import { useState, type JSX } from 'react';
import type { StatsSample, StatsSeriesKey } from './statshistory';
import { Icon } from './icons';
import { LABEL, PANEL_ROUNDED } from './theme';

export interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Oldest-first samples, e.g. from `StatsHistory.samples()`. */
  samples: StatsSample[];
}

interface SeriesConfig {
  key: StatsSeriesKey;
  label: string;
  color: string;
  defaultOn: boolean;
}

const SERIES: readonly SeriesConfig[] = [
  { key: 'population', label: 'Population', color: '#6fb3ff', defaultOn: true },
  { key: 'happiness', label: 'Happiness', color: '#ffcf5f', defaultOn: true },
  { key: 'monthlyDelta', label: 'Funds / mo', color: '#7fe08a', defaultOn: true },
  { key: 'funds', label: 'Funds', color: '#9ad1ff', defaultOn: false },
  { key: 'demandRes', label: 'Demand · Res', color: '#ff8a65', defaultOn: false },
  { key: 'demandCom', label: 'Demand · Com', color: '#64d9ff', defaultOn: false },
  { key: 'demandInd', label: 'Demand · Ind', color: '#c98cff', defaultOn: false },
];

const DEFAULT_ENABLED = Object.fromEntries(SERIES.map((s) => [s.key, s.defaultOn])) as Record<
  StatsSeriesKey,
  boolean
>;

// Internal SVG viewBox units (not pixels) — the <svg> itself is styled to
// whatever CSS size the panel gives it, preserveAspectRatio="none" stretches
// this coordinate space to fill it.
const CHART_W = 300;
const CHART_H = 100;

/**
 * Per-series min/max normalization (each line independently fills the chart
 * height) so wildly different-scaled series (population in the thousands vs.
 * happiness 0..100) are all readable at once. Returns null (no line drawn)
 * when there are fewer than 2 samples — a single point has no line to draw,
 * and dividing by a zero sample count would be meaningless.
 */
function seriesPoints(samples: StatsSample[], key: StatsSeriesKey): string | null {
  if (samples.length < 2) return null;
  const values = samples.map((s) => s[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // flat series: draw a flat mid-height line, not NaN
  const stepX = CHART_W / (samples.length - 1);
  return values
    .map(
      (v, i) => `${(i * stepX).toFixed(2)},${(CHART_H - ((v - min) / range) * CHART_H).toFixed(2)}`,
    )
    .join(' ');
}

export function StatsPanel({ open, onClose, samples }: StatsPanelProps): JSX.Element | null {
  const [enabled, setEnabled] = useState<Record<StatsSeriesKey, boolean>>(DEFAULT_ENABLED);

  if (!open) return null;

  const toggle = (key: StatsSeriesKey): void =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-10 w-96">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="infoviews" className="h-5 w-5 text-white/70" />
            City Stats
          </div>
          <button
            type="button"
            aria-label="Close stats"
            onClick={onClose}
            className="text-white/60 transition-colors hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="h-32 w-full"
          preserveAspectRatio="none"
        >
          {SERIES.filter((s) => enabled[s.key]).map((s) => {
            const points = seriesPoints(samples, s.key);
            if (!points) return null;
            return (
              <polyline
                key={s.key}
                data-testid={`chart-series-${s.key}`}
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        <div className="flex flex-wrap gap-1">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={enabled[s.key]}
              onClick={() => toggle(s.key)}
              className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                enabled[s.key] ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10'
              }`}
              style={enabled[s.key] ? { boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}
            >
              {s.label}
            </button>
          ))}
        </div>

        {samples.length === 0 && <div className={LABEL}>No data yet</div>}
      </div>
    </div>
  );
}
