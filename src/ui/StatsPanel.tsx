/**
 * Stats charts panel: draws simple SVG line charts (no external chart lib)
 * over a fed StatsSample history, with a key row per series that also toggles
 * it. Each series wears its own colour, dash pattern and end marker so none is
 * told apart by colour alone.
 * Deliberately takes `samples: StatsSample[]` as a prop rather than reading
 * ui/store.ts or statshistory.ts's StatsHistory class directly — the
 * integrator wires a StatsHistory instance (fed from each SimSnapshot) into
 * this prop, whether via a plain prop drill or a store selector.
 */
import { useState, type JSX } from 'react';
import type { StatsSample, StatsSeriesKey } from './statshistory';
import { formatFunds, formatMonthYear, formatPopulation } from './format';
import { Icon } from './icons';
import { PANEL_ROUNDED, SCROLL_FROM_TOP_16 } from './theme';

export interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Oldest-first samples, e.g. from `StatsHistory.samples()`. */
  samples: StatsSample[];
}

type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'ring' | 'hexagon';

interface SeriesConfig {
  key: StatsSeriesKey;
  label: string;
  /** What the series counts, said in the key. */
  unit: string;
  /** CSS colour, from the theme tokens. */
  color: string;
  /** SVG dash pattern; absent for a solid line. */
  dash?: string;
  shape: MarkerShape;
  defaultOn: boolean;
  /** A value as the key reads it. */
  format: (value: number) => string;
}

const signedFunds = (value: number): string => `${value < 0 ? '-' : '+'}${formatFunds(value)}`;
const level = (value: number): string => value.toFixed(2);

const SERIES: readonly SeriesConfig[] = [
  {
    key: 'population',
    label: 'Population',
    unit: 'people',
    color: 'var(--color-accent)',
    shape: 'circle',
    defaultOn: true,
    format: formatPopulation,
  },
  {
    key: 'happiness',
    label: 'Happiness',
    unit: 'points, 0 to 100',
    color: 'var(--color-warning)',
    dash: '5 3',
    shape: 'square',
    defaultOn: true,
    format: (v) => String(Math.round(v)),
  },
  {
    key: 'monthlyDelta',
    label: 'Funds / mo',
    unit: '¢ per month, income less costs',
    color: 'var(--color-positive)',
    dash: '1.5 3',
    shape: 'triangle',
    defaultOn: true,
    format: signedFunds,
  },
  {
    key: 'funds',
    label: 'Funds',
    unit: '¢ in the bank',
    color: 'var(--color-rci-ind-heavy)',
    dash: '8 3 1.5 3',
    shape: 'diamond',
    defaultOn: false,
    format: (v) => `${v < 0 ? '-' : ''}${formatFunds(v)}`,
  },
  {
    key: 'demandRes',
    label: 'Demand · Res',
    unit: 'level, -1 to 1',
    color: 'var(--color-rci-res)',
    dash: '3 2',
    shape: 'cross',
    defaultOn: false,
    format: level,
  },
  {
    key: 'demandCom',
    label: 'Demand · Com',
    unit: 'level, -1 to 1',
    color: 'var(--color-rci-com)',
    dash: '10 2',
    shape: 'ring',
    defaultOn: false,
    format: level,
  },
  {
    key: 'demandInd',
    label: 'Demand · Ind',
    unit: 'level, -1 to 1',
    color: 'var(--color-rci-ind)',
    dash: '2 2 6 2',
    shape: 'hexagon',
    defaultOn: false,
    format: level,
  },
];

const DEFAULT_ENABLED = Object.fromEntries(SERIES.map((s) => [s.key, s.defaultOn])) as Record<
  StatsSeriesKey,
  boolean
>;

// Internal SVG viewBox units (not pixels). The <svg> keeps its aspect ratio so
// the end markers stay true to shape; the panel gives it the width.
const CHART_W = 300;
const CHART_H = 100;
/** Room beside the line for an end marker at the chart's edge. */
const PAD = 5;
const MARKER_R = 4;

/** Where each sample of `key` sits in the chart, scaled to that series' own range. */
function seriesPlot(samples: StatsSample[], key: StatsSeriesKey): [number, number][] | null {
  if (samples.length < 2) return null;
  const values = samples.map((s) => s[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const stepX = (CHART_W - 2 * PAD) / (samples.length - 1);
  return values.map((v, i) => [
    PAD + i * stepX,
    // A series that never moved has no range to scale by: it runs along the Mid line.
    span === 0 ? CHART_H / 2 : CHART_H - PAD - ((v - min) / span) * (CHART_H - 2 * PAD),
  ]);
}

function Marker({ shape, x, y }: { shape: MarkerShape; x: number; y: number }): JSX.Element {
  const r = MARKER_R;
  const at = (dx: number, dy: number): string => `${x + dx},${y + dy}`;
  switch (shape) {
    case 'circle':
      return <circle cx={x} cy={y} r={r} />;
    case 'ring':
      return <circle cx={x} cy={y} r={r - 0.75} fill="none" strokeWidth={1.5} />;
    case 'square':
      return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} />;
    case 'triangle':
      return <polygon points={`${at(0, -r)} ${at(r, r)} ${at(-r, r)}`} />;
    case 'diamond':
      return (
        <polygon points={`${at(0, -r - 1)} ${at(r + 1, 0)} ${at(0, r + 1)} ${at(-r - 1, 0)}`} />
      );
    case 'cross':
      return (
        <path
          d={`M${x - r},${y} L${x + r},${y} M${x},${y - r} L${x},${y + r}`}
          fill="none"
          strokeWidth={2}
        />
      );
    case 'hexagon':
      return (
        <polygon
          points={`${at(-r, 0)} ${at(-r / 2, -r)} ${at(r / 2, -r)} ${at(r, 0)} ${at(r / 2, r)} ${at(-r / 2, r)}`}
        />
      );
  }
}

const range = (samples: StatsSample[], key: StatsSeriesKey): [number, number] => {
  const values = samples.map((s) => s[key]);
  return [Math.min(...values), Math.max(...values)];
};

export function StatsPanel({ open, onClose, samples }: StatsPanelProps): JSX.Element | null {
  const [enabled, setEnabled] = useState<Record<StatsSeriesKey, boolean>>(DEFAULT_ENABLED);

  if (!open) return null;

  const toggle = (key: StatsSeriesKey): void =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const first = samples[0];
  const last = samples[samples.length - 1];
  const middle = samples[Math.floor((samples.length - 1) / 2)];
  const plotted = samples.length >= 2;

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-10 w-96 max-w-[calc(100vw-1.5rem)]">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${SCROLL_FROM_TOP_16} ${PANEL_ROUNDED}`}
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
            className="flex h-6 w-6 items-center justify-center text-white/60 transition-colors hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div role="group" aria-label="Chart axes" className="flex flex-col gap-1">
          <div className="flex gap-1.5">
            <div
              className="flex flex-col justify-between py-0.5 text-right text-[10px] text-white/70"
              aria-hidden="true"
            >
              <span>High</span>
              <span>Mid</span>
              <span>Low</span>
            </div>
            <div className="relative aspect-[3/1] min-w-0 flex-1">
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="h-full w-full"
                role="img"
                aria-label="Chart of the city's history"
              >
                <g className="stroke-white/20" strokeWidth={0.75}>
                  <line x1={0} y1={PAD} x2={CHART_W} y2={PAD} />
                  <line x1={0} y1={CHART_H / 2} x2={CHART_W} y2={CHART_H / 2} />
                  <line x1={0} y1={CHART_H - PAD} x2={CHART_W} y2={CHART_H - PAD} />
                </g>
                <line
                  className="stroke-white/50"
                  strokeWidth={1}
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={CHART_H}
                />
                <line
                  className="stroke-white/50"
                  strokeWidth={1}
                  x1={0}
                  y1={CHART_H}
                  x2={CHART_W}
                  y2={CHART_H}
                />
                {SERIES.filter((s) => enabled[s.key]).map((s) => {
                  const plot = seriesPlot(samples, s.key);
                  if (!plot) return null;
                  const end = plot[plot.length - 1]!;
                  return (
                    <g key={s.key} stroke={s.color} fill={s.color}>
                      <polyline
                        data-testid={`chart-series-${s.key}`}
                        points={plot.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
                        fill="none"
                        strokeWidth={1.5}
                        strokeDasharray={s.dash ?? 'none'}
                      />
                      <g data-testid={`chart-end-${s.key}`}>
                        <Marker shape={s.shape} x={end[0]} y={end[1]} />
                      </g>
                    </g>
                  );
                })}
              </svg>
              {!plotted && (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-white/70">
                  {samples.length === 0
                    ? 'Nothing to plot yet: the lines draw as the city runs.'
                    : 'Nothing to plot yet: a line needs a second sample.'}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="invisible text-[10px]" aria-hidden="true">
              High
            </div>
            <div className="flex min-w-0 flex-1 justify-between text-[10px] text-white/70">
              <span data-testid="x-tick-start">
                {first ? formatMonthYear(first.tick) : 'Start'}
              </span>
              {plotted && middle && <span>{formatMonthYear(middle.tick)}</span>}
              <span data-testid="x-tick-end">{last ? formatMonthYear(last.tick) : 'Now'}</span>
            </div>
          </div>
          <div className="text-center text-[10px] text-white/60">
            Game date. Each line is scaled to its own range, low to high.
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {SERIES.map((s) => {
            const on = enabled[s.key];
            const [lo, hi] = last ? range(samples, s.key) : [0, 0];
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.key)}
                className={`flex min-h-6 items-center gap-2 rounded-md px-2 py-0.5 text-left text-[11px] transition-colors ${
                  on ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10'
                }`}
              >
                <svg
                  viewBox="0 0 32 12"
                  className="h-3 w-8 shrink-0"
                  aria-hidden="true"
                  data-testid={`series-marker-${s.key}`}
                  data-shape={s.shape}
                  data-dash={s.dash ?? 'solid'}
                  stroke={s.color}
                  fill={s.color}
                >
                  <line
                    x1={0}
                    y1={6}
                    x2={26}
                    y2={6}
                    strokeWidth={1.5}
                    strokeDasharray={s.dash ?? 'none'}
                  />
                  <Marker shape={s.shape} x={27} y={6} />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-white/60"> · {s.unit}</span>
                </span>
                {last && (
                  <span className="shrink-0 text-right text-white/70">
                    {s.format(last[s.key])}
                    {samples.length > 1 && (
                      <span className="block text-[10px] text-white/50">
                        {s.format(lo)} to {s.format(hi)}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
