/**
 * Status strip — bottom bar #2: a single 28px row, sim
 * controls / clock+date / season / city name / population / funds /
 * happiness, left to right, separated by subtle dividers.
 */
import type { JSX } from 'react';
import { tickToDate } from '../shared/constants';
import { FieldId } from '../shared/types';
import {
  formatClock,
  formatFunds,
  formatPopulation,
  happinessFace,
  seasonForMonth,
  trendOf,
} from './format';
import { Icon, type IconName } from './icons';
import { useCityStore } from './store';
import { PANEL } from './theme';

const CITY_NAME = 'Riverton'; // From map name — no map-select screen yet.

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const SPEED_OPTIONS: ReadonlyArray<{ value: 1 | 2 | 4; chevrons: number }> = [
  { value: 1, chevrons: 1 },
  { value: 2, chevrons: 2 },
  { value: 4, chevrons: 3 },
];

function Divider(): JSX.Element {
  return <div className="h-4 w-px shrink-0 bg-white/15" aria-hidden="true" />;
}

function TrendArrow({ trend, testId }: { trend: 'up' | 'down'; testId: string }): JSX.Element {
  return (
    <span
      data-testid={testId}
      aria-hidden="true"
      className={trend === 'up' ? 'text-[#5dd06b]' : 'text-[#e5533f]'}
    >
      {trend === 'up' ? '▲' : '▼'}
    </span>
  );
}

function SimControls(): JSX.Element {
  const speed = useCityStore((s) => s.speed);
  const setSpeed = useCityStore((s) => s.setSpeed);
  const canUndo = useCityStore((s) => s.canUndo);
  const canRedo = useCityStore((s) => s.canRedo);
  const bound = useCityStore((s) => s.bound);
  const paused = speed === 0;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={paused ? 'Play' : 'Pause'}
        onClick={() => setSpeed(paused ? 1 : 0)}
        className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:bg-white/10"
      >
        <Icon name={paused ? 'play' : 'pause'} className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-0.5" role="group" aria-label="Simulation speed">
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-label={`${opt.value}×`}
            aria-pressed={speed === opt.value}
            onClick={() => setSpeed(opt.value)}
            className={`rounded px-1 text-[11px] leading-none ${speed === opt.value ? 'text-[var(--color-positive)]' : 'text-white/50 hover:text-white/80'}`}
          >
            {'▶'.repeat(opt.chevrons)}
          </button>
        ))}
      </div>
      <Divider />
      <button
        type="button"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => bound?.undo()}
        className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Icon name="undo" className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => bound?.redo()}
        className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Icon name="redo" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function StatusStrip(): JSX.Element {
  const tick = useCityStore((s) => s.stats.tick);
  const population = useCityStore((s) => s.stats.population);
  const funds = useCityStore((s) => s.stats.funds);
  const monthlyIncome = useCityStore((s) => s.stats.monthlyIncome);
  const monthlyExpenses = useCityStore((s) => s.stats.monthlyExpenses);
  const happiness = useCityStore((s) => s.stats.happiness);
  const previousMonthPopulation = useCityStore((s) => s.previousMonthPopulation);
  const previousMonthFunds = useCityStore((s) => s.previousMonthFunds);
  const setOverlay = useCityStore((s) => s.setOverlay);

  const date = tickToDate(tick);
  const displayYear = 2025 + (date.year - 1);
  const season = seasonForMonth(date.month);
  const seasonIcon: IconName = season === 'Winter' || season === 'Fall' ? 'leaf' : 'sun';

  const populationTrend = trendOf(population, previousMonthPopulation);
  const fundsTrend = trendOf(funds, previousMonthFunds);
  const fundsNegative = funds < 0;
  const monthlyDelta = monthlyIncome - monthlyExpenses;
  const deltaPositive = monthlyDelta >= 0;

  return (
    <div
      className={`pointer-events-auto fixed bottom-0 left-0 right-0 z-10 flex h-7 items-center gap-3 px-3 text-xs text-white ${PANEL}`}
      role="contentinfo"
      aria-label="Status strip"
    >
      <SimControls />
      <Divider />
      <div className="flex shrink-0 items-center gap-2">
        <span>{formatClock(tick)}</span>
        <span className="text-white/70">
          {MONTH_NAMES[date.month - 1]} {displayYear}
        </span>
      </div>
      <Divider />
      <div className="flex shrink-0 items-center gap-1 text-white/80">
        <Icon name={seasonIcon} className="h-3.5 w-3.5" />
        <span>{season}</span>
      </div>
      <Divider />
      <div className="flex-1 text-center font-semibold tracking-wide">{CITY_NAME}</div>
      <Divider />
      <div className="flex shrink-0 items-center gap-1">
        <span aria-hidden="true">👥</span>
        <span>{formatPopulation(population)}</span>
        {populationTrend !== 'flat' && (
          <TrendArrow trend={populationTrend} testId="population-trend" />
        )}
      </div>
      <Divider />
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          data-testid="funds-amount"
          className={`font-medium ${fundsNegative ? 'funds-negative text-[#e5533f]' : ''}`}
        >
          {fundsNegative ? '-' : ''}
          {formatFunds(funds)}
        </span>
        {fundsTrend !== 'flat' && <TrendArrow trend={fundsTrend} testId="funds-trend" />}
        <span
          data-testid="funds-delta"
          className={
            deltaPositive ? 'delta-positive text-[#5dd06b]' : 'delta-negative text-[#e5533f]'
          }
        >
          {deltaPositive ? '+' : '-'}¢{Math.round(Math.abs(monthlyDelta)).toLocaleString('en-US')}
          /mo
        </span>
      </div>
      <Divider />
      <button
        type="button"
        aria-label={`Happiness: ${Math.round(happiness)}`}
        onClick={() => setOverlay(FieldId.Happiness)}
        className="flex shrink-0 items-center rounded px-1 hover:bg-white/10"
      >
        <span aria-hidden="true">{happinessFace(happiness)}</span>
      </button>
    </div>
  );
}
