/**
 * Main dock — bottom bar #1. Left cluster: city glyph + RCI
 * demand bars + milestone badge. Center: the ten build-category buttons.
 * Right: infoviews toggle + overlay-off shortcut. Category/drawer-open state
 * is transient UI navigation, not sim state, so it's owned by the parent
 * (App) and passed down as props.
 */
import type { JSX } from 'react';
import { MILESTONES } from '../shared/constants';
import { CATEGORY_DEFS, type DockCategory } from './categories';
import { demandPct } from './format';
import { Icon } from './icons';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';

export interface MainDockProps {
  activeCategory: DockCategory | null;
  onToggleCategory: (category: DockCategory) => void;
  infoviewOpen: boolean;
  onToggleInfoview: () => void;
  onOpenMilestones: () => void;
}

function DemandBar({
  label,
  value,
  className,
  testId,
}: {
  label: string;
  value: number;
  className: string;
  testId: string;
}): JSX.Element {
  return (
    <div className="h-2 w-20 overflow-hidden rounded-full bg-white/10" title={`${label} demand`}>
      <div
        data-testid={testId}
        className={`h-full rounded-full ${className}`}
        style={{ width: `${demandPct(value)}%` }}
      />
    </div>
  );
}

function MilestoneRing({ progressPct }: { progressPct: number }): JSX.Element {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progressPct / 100);
  return (
    <div className="relative flex h-9 w-9 items-center justify-center">
      <svg
        viewBox="0 0 36 36"
        className="h-9 w-9 -rotate-90"
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <circle cx="18" cy="18" r={radius} fill="none" stroke="#ffffff26" strokeWidth={3} />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="var(--color-positive)"
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <Icon name="trophy" className="absolute h-4 w-4 text-[#f0a13c]" />
    </div>
  );
}

export function MainDock({
  activeCategory,
  onToggleCategory,
  infoviewOpen,
  onToggleInfoview,
  onOpenMilestones,
}: MainDockProps): JSX.Element {
  const demand = useCityStore((s) => s.stats.demand);
  const milestoneLevel = useCityStore((s) => s.stats.milestoneLevel);
  const milestoneProgress = useCityStore((s) => s.stats.milestoneProgress);
  const overlay = useCityStore((s) => s.overlay);
  const setOverlay = useCityStore((s) => s.setOverlay);

  const milestone = MILESTONES[milestoneLevel] ?? MILESTONES[0];
  const progressPct = Math.max(0, Math.min(1, milestoneProgress)) * 100;

  return (
    <div
      className={`pointer-events-auto fixed bottom-7 left-2 right-2 z-10 flex h-16 items-center justify-between gap-4 px-3 text-white ${PANEL_ROUNDED}`}
      role="toolbar"
      aria-label="Main dock"
    >
      <div className="flex shrink-0 items-center gap-3">
        <Icon name="city" className="h-6 w-6 text-white/70" />
        <div className="flex flex-col gap-1" aria-label="RCI demand">
          <DemandBar
            label="Residential"
            value={demand.res}
            className="bg-[var(--color-rci-res)]"
            testId="demand-res"
          />
          <DemandBar
            label="Commercial"
            value={demand.com}
            className="bg-[var(--color-rci-com)]"
            testId="demand-com"
          />
          <DemandBar
            label="Industrial"
            value={demand.ind}
            className="bg-[var(--color-rci-ind)]"
            testId="demand-ind"
          />
        </div>
        <button
          type="button"
          onClick={onOpenMilestones}
          aria-label={`Milestone progress: ${milestone?.name ?? ''}`}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10"
        >
          <MilestoneRing progressPct={progressPct} />
          <span className="text-xs font-semibold tracking-wide">
            {(milestone?.name ?? '').toUpperCase()}
          </span>
        </button>
      </div>

      <div
        className="flex flex-1 items-center justify-center gap-1.5 overflow-x-auto"
        role="group"
        aria-label="Build categories"
      >
        {CATEGORY_DEFS.map((c) => {
          const active = activeCategory === c.id;
          return (
            <button
              key={c.id}
              type="button"
              title={c.label}
              aria-label={c.label}
              aria-pressed={active}
              onClick={() => onToggleCategory(c.id)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                active ? 'bg-accent text-white' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <Icon name={c.icon} />
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Infoviews"
          aria-pressed={infoviewOpen}
          onClick={onToggleInfoview}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            infoviewOpen ? 'bg-accent text-white' : 'text-white/80 hover:bg-white/10'
          }`}
        >
          <Icon name="infoviews" />
        </button>
        <button
          type="button"
          aria-label="Turn off overlay"
          disabled={overlay === null}
          onClick={() => setOverlay(null)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon name="overlay-off" />
        </button>
      </div>
    </div>
  );
}
