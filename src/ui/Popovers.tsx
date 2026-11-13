/**
 * Small read-only informational popovers opened from the main dock's
 * milestone badge and the corner utility buttons. Each shows only genuinely
 * real data already flowing through the store/constants — no invented systems.
 */
import type { JSX, ReactNode } from 'react';
import { MILESTONES } from '../shared/constants';
import { CATEGORY_DEFS, CATEGORY_HOTKEYS } from './categories';
import { amount, formatFunds } from './format';
import { Icon } from './icons';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';

function PopoverFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`pointer-events-auto flex w-64 flex-col gap-2 p-3 text-sm text-white ${PANEL_ROUNDED}`}
      role="dialog"
      aria-label={title}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/70">{title}</span>
        {onClose && (
          <button
            type="button"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Clicking the milestone badge opens the milestone toast history. */
export function MilestonePopover({ onClose }: { onClose: () => void }): JSX.Element {
  const milestoneLevel = useCityStore((s) => s.stats.milestoneLevel);

  return (
    <PopoverFrame title="Milestones" onClose={onClose}>
      <ul className="flex flex-col gap-1">
        {MILESTONES.map((m, i) => (
          <li key={m.name} className="flex items-center justify-between">
            <span className={i <= milestoneLevel ? 'text-white' : 'text-white/50'}>{m.name}</span>
            <span
              className={i <= milestoneLevel ? 'text-[var(--color-positive)]' : 'text-white/40'}
            >
              {i <= milestoneLevel ? 'Reached' : `${m.population.toLocaleString('en-US')} pop`}
            </span>
          </li>
        ))}
      </ul>
    </PopoverFrame>
  );
}

/** Top-left corner: a fuller read of the live CityStats already in the store. */
export function CityInfoPopover(): JSX.Element {
  const stats = useCityStore((s) => s.stats);

  const row = (label: string, value: string): JSX.Element => (
    <div className="flex items-center justify-between">
      <span className="uppercase text-[10px] tracking-wide text-white/60">{label}</span>
      <span>{value}</span>
    </div>
  );

  /** A utility's supply and use, and in words how far use runs past supply. */
  const utility = (
    label: string,
    supply: number,
    demand: number,
    unit: string,
    shortfall: string,
    note = '',
  ): JSX.Element => (
    <>
      {row(label, `${amount(supply, unit)} made, ${amount(demand, unit)} used${note}`)}
      {demand > supply && (
        <div className="text-right text-[11px] text-[#e5533f]">
          Short by {amount(demand - supply, unit)}: {shortfall}
        </div>
      )}
    </>
  );

  return (
    <PopoverFrame title="City Info">
      {row('Jobs', `${Math.round(stats.employed)}/${Math.round(stats.jobs)}`)}
      {utility('Power', stats.powerSupply, stats.powerDemand, 'MW', 'some buildings go dark')}
      {utility(
        'Water',
        stats.waterSupply,
        stats.waterDemand,
        'kL',
        'some buildings go dry',
        stats.waterFouled > 0 ? ` (${Math.round(stats.waterFouled)} kL lost to fouled water)` : '',
      )}
      {utility('Sewer', stats.sewerSupply, stats.sewerDemand, 'kL', 'sewage backs up')}
      {row('Loan', formatFunds(stats.loanBalance))}
    </PopoverFrame>
  );
}

const SHORTCUTS: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: 'Space', label: 'Play / Pause' },
  { keys: 'Esc', label: 'Cancel drag / close drawer / deselect' },
  { keys: 'R', label: 'Rotate ploppable' },
  { keys: 'Ctrl+Z', label: 'Undo' },
  { keys: 'Ctrl+Y / Ctrl+Shift+Z', label: 'Redo' },
  { keys: 'Ctrl+S', label: 'Save' },
  { keys: 'Ctrl+Shift+L', label: 'Load latest save' },
];

/** Top-right corner: only bindings actually wired in main.ts's keydown handler. */
export function HelpPopover(): JSX.Element {
  return (
    <PopoverFrame title="Keyboard Shortcuts">
      <ul className="flex flex-col gap-1">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-3">
            <span className="text-white/60">{s.label}</span>
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px]">{s.keys}</span>
          </li>
        ))}
      </ul>
      <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
        Toolbar categories
      </div>
      <ul className="flex flex-col gap-1">
        {CATEGORY_DEFS.map((c) => {
          const code = Object.entries(CATEGORY_HOTKEYS).find(([, b]) => b.category === c.id)?.[0];
          return (
            <li
              key={c.id}
              data-testid={`help-category-${c.id}`}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-white/60">{c.label}</span>
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px]">
                {code ? code.replace('Digit', '') : 'Click its icon'}
              </span>
            </li>
          );
        })}
      </ul>
    </PopoverFrame>
  );
}
