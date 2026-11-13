/**
 * Active-view chip: says which view the city is drawn in (an Infoviews lens,
 * the underground view, or both) and carries the one-click way back to the
 * plain view. Sits in the top row between the two corner clusters and shrinks
 * (the text truncates) on a narrow window rather than reach under them. Its
 * legend hangs below it, so what the colours mean is on screen with the lens
 * picker open or shut.
 */
import type { JSX } from 'react';
import { isUnderground } from '../shared/view';
import { lensLabel } from './InfoviewGrid';
import { Icon } from './icons';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';
import { ViewLegend } from './ViewLegend';

export function ViewChip(): JSX.Element | null {
  const overlay = useCityStore((s) => s.overlay);
  const selectedTool = useCityStore((s) => s.selectedTool);
  const underground = isUnderground(overlay, selectedTool);
  if (overlay === null && !underground) return null;

  const text =
    overlay === null
      ? 'Underground view'
      : `${lensLabel(overlay)} lens${underground ? ' · underground' : ''}`;

  const leave = (): void => {
    const store = useCityStore.getState();
    store.setOverlay(null);
    // A tool that keeps the city underground would put it straight back.
    if (isUnderground(null, store.selectedTool)) store.setTool('select');
  };

  return (
    <div
      role="group"
      aria-label="Active view"
      className="pointer-events-none fixed left-14 top-3 z-20 flex max-w-[calc(100vw-4.25rem)] flex-col items-start gap-1"
    >
      <div
        className={`pointer-events-auto flex h-8 max-w-[calc(100vw-16.5rem)] items-center gap-2 pl-3 pr-1 text-xs text-white ${PANEL_ROUNDED}`}
      >
        <span className="truncate font-semibold" title={text}>
          {text}
        </span>
        <button
          type="button"
          aria-label="Exit view"
          onClick={leave}
          className="flex h-6 min-w-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-white/80 transition-colors hover:bg-white/10"
        >
          <Icon name="close" className="h-3 w-3" />
          <span className="hidden font-semibold sm:inline">Exit</span>
          <kbd className="hidden rounded border border-white/30 px-1 text-[10px] leading-4 tracking-wide text-white/60 sm:inline">
            Esc
          </kbd>
        </button>
      </div>
      <ViewLegend />
    </div>
  );
}
