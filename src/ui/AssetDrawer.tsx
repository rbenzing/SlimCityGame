/**
 * Asset drawer: opens above the main dock when a category is
 * active. Sub-tab row (only non-empty groups) + a pictogram card grid, with
 * the locked/selected treatments. `category` is transient UI nav state owned
 * by the parent (App), same reasoning as MainDock.
 */
import { useState, type JSX } from 'react';
import { MILESTONES } from '../shared/constants';
import type { ToolId } from '../shared/types';
import { catalogEntryForTool, subTabsFor, type AssetCard, type DockCategory } from './categories';
import { Icon } from './icons';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';

export interface AssetDrawerProps {
  category: DockCategory | null;
  onClose: () => void;
}

function zoneClass(id: ToolId): string {
  switch (id) {
    case 'zone.resLow':
      return 'bg-[var(--color-rci-res)]/55';
    case 'zone.resHigh':
      return 'bg-[var(--color-rci-res)]';
    case 'zone.comLow':
      return 'bg-[var(--color-rci-com)]/55';
    case 'zone.comHigh':
      return 'bg-[var(--color-rci-com)]';
    case 'zone.industrial':
      return 'bg-[var(--color-rci-ind)]';
    case 'zone.dezone':
      return 'bg-[repeating-linear-gradient(45deg,#666_0px,#666_4px,#3a3a3a_4px,#3a3a3a_8px)]';
    default:
      return 'bg-white/20';
  }
}

function roadHeightClass(id: ToolId): string {
  switch (id) {
    case 'road.two':
      return 'h-4';
    case 'road.avenue':
      return 'h-6';
    case 'road.highway':
      return 'h-8';
    // Narrow tiers read thinner, four-lane reads avenue-width.
    case 'road.gravel':
    case 'road.alley':
      return 'h-3';
    case 'road.four':
    case 'road.bus':
      return 'h-6';
    default:
      return 'h-4'; // road.oneway / road.bike: two-lane look
  }
}

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function CardPictogram({ card }: { card: AssetCard }): JSX.Element {
  if (card.id === 'bulldoze') {
    return (
      <div
        className="flex h-11 items-center justify-center rounded-[6px] bg-[#1a2230] text-[#e5533f]"
        aria-hidden="true"
      >
        <Icon name="bulldoze" />
      </div>
    );
  }
  if (card.id.startsWith('zone.')) {
    return <div className={`h-11 rounded-[6px] ${zoneClass(card.id)}`} aria-hidden="true" />;
  }
  if (card.id.startsWith('road.')) {
    // Gravel is unpaved (dusty-tan strip); transit lanes read as their painted
    // color (terracotta bus / green bike); every other road is dashed white.
    const strip =
      card.id === 'road.gravel'
        ? 'bg-[#9e8c6b]'
        : card.id === 'road.bus'
          ? 'bg-[#b8492f]'
          : card.id === 'road.bike'
            ? 'bg-[#268a44]'
            : card.id === 'road.tram'
              ? 'bg-[repeating-linear-gradient(0deg,#b6b8bd_0px,#b6b8bd_2px,#4a4d53_2px,#4a4d53_7px)]'
              : 'bg-[repeating-linear-gradient(90deg,#fff_0px,#fff_6px,transparent_6px,transparent_12px)]';
    return (
      <div
        className="flex h-11 items-center justify-center rounded-[6px] bg-[#2a2f36]"
        aria-hidden="true"
      >
        <div className={`w-4/5 rounded-sm ${strip} ${roadHeightClass(card.id)}`} />
      </div>
    );
  }
  if (card.id === 'transit.line') {
    return (
      <div
        className="flex h-11 items-center justify-center rounded-[6px] bg-[#1a2230] text-[#4fc3f7]"
        aria-hidden="true"
      >
        <Icon name="transit" />
      </div>
    );
  }
  if (card.id === 'district.paint') {
    return (
      <div
        className="flex h-11 items-center justify-center rounded-[6px] bg-[#1a2230] text-[#ffb74d]"
        aria-hidden="true"
      >
        <Icon name="districts" />
      </div>
    );
  }
  if (card.id.startsWith('terraform.')) {
    const mode = card.id.slice('terraform.'.length);
    return (
      <div
        className="flex h-11 items-center justify-center rounded-[6px] bg-[#1a2230]"
        aria-hidden="true"
        data-testid={`terraform-pictogram-${mode}`}
      >
        {mode === 'raise' && (
          <div className="h-0 w-0 border-x-8 border-x-transparent border-b-[14px] border-b-[var(--color-positive)]" />
        )}
        {mode === 'lower' && (
          <div className="h-0 w-0 border-x-8 border-x-transparent border-t-[14px] border-t-[var(--color-danger)]" />
        )}
        {mode === 'level' && <div className="h-1.5 w-7 rounded-full bg-white/70" />}
        {mode === 'smooth' && (
          <div className="flex flex-col items-center gap-1">
            <div className="h-1 w-7 rounded-full bg-white/70" />
            <div className="h-1 w-5 rounded-full bg-white/40" />
            <div className="h-1 w-7 rounded-full bg-white/70" />
          </div>
        )}
      </div>
    );
  }
  const entry = catalogEntryForTool(card.id);
  const color = entry ? hexColor(entry.color) : '#666666';
  return (
    <div
      className="flex h-11 items-end justify-center rounded-[6px] bg-[#1a2230]"
      aria-hidden="true"
    >
      <div
        className="h-3/4 w-3/5"
        style={{
          backgroundColor: color,
          clipPath: 'polygon(15% 100%, 15% 35%, 50% 5%, 85% 35%, 85% 100%)',
        }}
      />
    </div>
  );
}

export function AssetDrawer({ category, onClose }: AssetDrawerProps): JSX.Element | null {
  const selectedTool = useCityStore((s) => s.selectedTool);
  const setTool = useCityStore((s) => s.setTool);
  const milestoneLevel = useCityStore((s) => s.stats.milestoneLevel);
  const sandboxUnlockAll = useCityStore((s) => s.settings.sandboxUnlockAll);

  const groups = category ? subTabsFor(category) : [];

  // Reset the sub-tab selection when the category changes. Adjusting state
  // during render (React's documented pattern for "reset state when a prop
  // changes") rather than in a useEffect avoids an extra commit + the
  // set-state-in-effect cascading-render lint rule.
  const [prevCategory, setPrevCategory] = useState(category);
  const [activeSubTab, setActiveSubTab] = useState<string | null>(groups[0]?.id ?? null);
  if (category !== prevCategory) {
    setPrevCategory(category);
    setActiveSubTab(groups[0]?.id ?? null);
  }

  if (!category) return null;

  const showTabs = groups.length > 1;
  const cards: AssetCard[] = showTabs
    ? ((groups.find((g) => g.id === activeSubTab) ?? groups[0])?.cards ?? [])
    : groups.flatMap((g) => g.cards);

  return (
    <div
      className={`pointer-events-auto fixed bottom-24 left-2 right-2 z-10 flex max-h-64 flex-col p-3 text-white ${PANEL_ROUNDED}`}
      role="region"
      aria-label="Asset drawer"
    >
      <div className="flex items-center justify-between">
        {showTabs ? (
          <div className="flex gap-1" role="tablist">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={activeSubTab === g.id}
                onClick={() => setActiveSubTab(g.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeSubTab === g.id
                    ? 'bg-accent text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <button
          type="button"
          aria-label="Close asset drawer"
          onClick={onClose}
          className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 overflow-y-auto">
        {cards.map((card) => {
          const locked = !sandboxUnlockAll && card.unlockMilestone > milestoneLevel;
          const active = selectedTool === card.id;
          return (
            <button
              key={card.id}
              type="button"
              disabled={locked}
              aria-pressed={active}
              title={
                locked
                  ? `Unlocks at ${MILESTONES[card.unlockMilestone]?.name ?? 'a later milestone'}`
                  : undefined
              }
              onClick={() => setTool(card.id)}
              className={`relative flex w-24 flex-col gap-1 rounded-[6px] border p-1.5 text-left text-[11px] transition-colors ${
                active
                  ? 'border-accent bg-accent/25'
                  : 'border-transparent bg-white/5 hover:bg-white/10'
              } ${locked ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <CardPictogram card={card} />
              <span className="truncate font-medium">{card.name}</span>
              <div className="flex items-center justify-between">
                <span className="text-white/60">
                  {card.cost > 0 ? `¢${card.cost.toLocaleString('en-US')}` : ''}
                </span>
                {locked && <Icon name="lock" className="h-3 w-3 text-white/70" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
