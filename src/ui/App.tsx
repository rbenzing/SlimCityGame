/**
 * UI shell: bottom-heavy two-bar layout (main dock + status strip) with
 * corner utility buttons.
 * `#ui-root > *` (see styles.css) makes each top-level panel pointer-events:
 * auto while the gaps stay click-through to the 3D viewport underneath.
 *
 * Category/drawer-open/popover-open state is transient UI navigation state
 * (not sim state — nothing outside src/ui needs to read it), so it lives
 * here as local state rather than in the zustand store.
 */
import { useEffect, useState } from 'react';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { AssetDrawer } from './AssetDrawer';
import type { DockCategory } from './categories';
import { CornerButtons } from './CornerButtons';
import { InfoPanel } from './InfoPanel';
import { InfoviewGrid } from './InfoviewGrid';
import { MainDock } from './MainDock';
import { CityInfoPopover, HelpPopover, MilestonePopover } from './Popovers';
import { DistrictPanel } from './DistrictPanel';
import { StatsPanel } from './StatsPanel';
import { StatusStrip } from './StatusStrip';
import { useCityStore } from './store';
import { Toasts } from './Toasts';
import { ToolOptionsPanel } from './ToolOptionsPanel';
import { TransitLinesPanel } from './TransitLinesPanel';

export default function App() {
  const [activeCategory, setActiveCategory] = useState<DockCategory | null>(null);
  const [infoviewOpen, setInfoviewOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [cityInfoOpen, setCityInfoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Stats charts + Photo mode. statsOpen/photoMode live in the store so
  // main.ts (which owns the StatsHistory feed + PhotoModeController/camera) can
  // read/drive them; photoMode true hides all DOM chrome for a clean shot.
  const statsOpen = useCityStore((s) => s.statsOpen);
  const setStatsOpen = useCityStore((s) => s.setStatsOpen);
  const statsSamples = useCityStore((s) => s.statsSamples);
  const photoMode = useCityStore((s) => s.photoMode);

  // The staged escape stack. Stage 1 (cancel an active drag) is
  // main.ts's tool-level concern: its window keydown listener registers
  // before this one and marks a consumed press via preventDefault(). The
  // remaining stages live here — one stage per press: stage 2 closes an open
  // drawer (which is the category selection in this layout); stage 3 drops
  // the tool back to `select` and deselects any selected building.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (activeCategory !== null) {
        setActiveCategory(null);
        return;
      }
      const store = useCityStore.getState();
      if (store.selectedTool !== 'select') store.setTool('select');
      if (store.selectedBuilding !== null) store.setSelectedBuilding(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeCategory]);

  // Photo mode: hide every DOM chrome element while active (exit via ESC,
  // handled by main.ts's global keydown -> PhotoModeController.handleKeyDown).
  if (photoMode) return null;

  return (
    <>
      <CornerButtons
        cityInfoOpen={cityInfoOpen}
        onToggleCityInfo={() => setCityInfoOpen((v) => !v)}
        helpOpen={helpOpen}
        onToggleHelp={() => setHelpOpen((v) => !v)}
        statsOpen={statsOpen}
        onToggleStats={() => setStatsOpen(!statsOpen)}
        photoActive={photoMode}
        onTogglePhoto={() => useCityStore.getState().bound?.togglePhoto()}
      />
      {cityInfoOpen && (
        <div className="pointer-events-none fixed left-3 top-14 z-20">
          <CityInfoPopover />
        </div>
      )}
      {helpOpen && (
        <div className="pointer-events-none fixed right-3 top-14 z-20">
          <HelpPopover />
        </div>
      )}

      <InfoPanel />
      <Toasts />
      <DistrictPanel />
      <TransitLinesPanel />
      <StatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} samples={statsSamples} />

      {milestoneOpen && (
        <div className="pointer-events-none fixed bottom-24 left-2 z-20">
          <MilestonePopover onClose={() => setMilestoneOpen(false)} />
        </div>
      )}
      {infoviewOpen && (
        <div className="pointer-events-none fixed bottom-24 right-2 z-20">
          <InfoviewGrid />
        </div>
      )}

      <ToolOptionsPanel />
      {/*
       * The drawer's own ✕ is a deliberate "I'm done placing" action (unlike
       * the staged Escape stack above): it closes the drawer AND drops the
       * active tool back to `select`, which exits placement mode and hides the
       * zoning grid (main.ts keys grid visibility off a zone tool being in
       * hand).
       */}
      <AssetDrawer
        category={activeCategory}
        onClose={() => {
          setActiveCategory(null);
          const store = useCityStore.getState();
          if (store.selectedTool !== 'select') store.setTool('select');
        }}
      />
      <MainDock
        activeCategory={activeCategory}
        onToggleCategory={(category) =>
          setActiveCategory((current) => {
            // Any dock navigation (open, switch, or close a category) drops the
            // active tool back to `select`, so placement mode only persists
            // while a card in the open drawer is actually selected — otherwise
            // a ploppable stayed "in hand" after the drawer closed and kept
            // placing on click.
            const store = useCityStore.getState();
            if (store.selectedTool !== 'select') store.setTool('select');
            return current === category ? null : category;
          })
        }
        infoviewOpen={infoviewOpen}
        onToggleInfoview={() => setInfoviewOpen((v) => !v)}
        onOpenMilestones={() => setMilestoneOpen((v) => !v)}
      />
      <StatusStrip />
    </>
  );
}

/** Mounts the SlimCity UI overlay into `rootEl` (the `#ui-root` element). */
export function mountUi(rootEl: HTMLElement): void {
  createRoot(rootEl).render(<App />);
}
