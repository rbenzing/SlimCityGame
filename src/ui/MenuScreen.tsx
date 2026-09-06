/**
 * Start-menu container: composes StartMenu/OptionsPanel/SaveBrowser (all pure
 * presentational) over the store's screen/menuOpen/settings state and wires
 * them to session.ts (New/Load/Quit — genuine teardown-reload) and
 * persist.ts (the save-slot list). Self-gates: renders nothing unless the
 * menu-only screen is showing or the in-game pause overlay is open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { SimSpeed } from '../shared/types';
import BrandLogo from './BrandLogo';
import { OptionsPanel } from './OptionsPanel';
import { audioRuntime } from '../app/audioruntime';
import { SaveBrowser, type SaveRow } from './SaveBrowser';
import { StartMenu } from './StartMenu';
import { useCityStore } from './store';
import { deleteSave, listSaves, type SaveHeaderWithId } from '../app/persist';
import { quitToMenu, startLoadGame, startNewGame } from '../app/session';

type SubView = 'main' | 'options' | 'saves';

function toSaveRow(header: SaveHeaderWithId): SaveRow {
  return {
    id: header.id,
    name: header.mapName || 'City',
    timestamp: header.savedAt,
    population: header.population,
    funds: header.funds,
  };
}

export function MenuScreen(): JSX.Element | null {
  const screen = useCityStore((s) => s.screen);
  const menuOpen = useCityStore((s) => s.menuOpen);
  const settings = useCityStore((s) => s.settings);
  const [sub, setSub] = useState<SubView>('main');
  const [saves, setSaves] = useState<SaveRow[]>([]);

  const open = screen === 'menu' || menuOpen;

  // Back to the main list whenever the overlay closes, so reopening it never
  // strands the player on the Options/Saves sub-view. Adjusted during render
  // (React's documented pattern for "reset state when a prop/derived value
  // changes") rather than in an effect — same idiom as AssetDrawer's
  // prevCategory reset.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setSub('main');
  }

  // Refresh the save-slot list every time the menu opens, so a save made (or
  // deleted) mid-session is reflected the next time this is shown.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // A storage failure — a corrupt database, a quota refusal — leaves the
    // menu with no saves to offer rather than with an unhandled rejection.
    void listSaves()
      .then((headers) => {
        if (!cancelled) setSaves(headers.map(toSaveRow));
      })
      .catch(() => {
        if (!cancelled) setSaves([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Opening the pause overlay over a running game pauses the sim. The speed
  // the player was running at is remembered here so leaving the menu puts them
  // back exactly where they were — including still-paused, if that is how they
  // opened it.
  const resumeSpeed = useRef<SimSpeed>(1);
  useEffect(() => {
    if (screen !== 'playing' || !menuOpen) return;
    resumeSpeed.current = useCityStore.getState().speed;
    useCityStore.getState().setSpeed(0);
  }, [screen, menuOpen]);

  /** The single way back to the city: close the overlay, restore the clock. */
  const resumeGame = useCallback(() => {
    useCityStore.getState().setMenuOpen(false);
    useCityStore.getState().setSpeed(resumeSpeed.current);
  }, []);

  // Escape is the keyboard half of Resume Game — same effect, so the two can
  // never disagree. The menu-only screen has no running game to return to.
  useEffect(() => {
    if (!(screen === 'playing' && menuOpen)) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') resumeGame();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, menuOpen, resumeGame]);

  if (!open) return null;

  if (sub === 'options') {
    return (
      <OptionsPanel
        settings={settings}
        onChange={(patch) => useCityStore.getState().setSettings(patch)}
        onBack={() => setSub('main')}
        musicPlayer={audioRuntime().music}
      />
    );
  }

  if (sub === 'saves') {
    return (
      <SaveBrowser
        saves={saves}
        onLoad={(id) => startLoadGame(Number(id))}
        onDelete={async (id) => {
          try {
            await deleteSave(Number(id));
          } finally {
            setSaves(
              await listSaves()
                .then((headers) => headers.map(toSaveRow))
                .catch(() => []),
            );
          }
        }}
        onBack={() => setSub('main')}
      />
    );
  }

  return (
    <StartMenu
      hasActiveGame={screen === 'playing'}
      hasSaves={saves.length > 0}
      logoSlot={<BrandLogo className="text-white" />}
      onResume={resumeGame}
      onNewGame={startNewGame}
      onSaveGame={() => useCityStore.getState().bound?.saveGame()}
      onLoadGame={() => setSub('saves')}
      onOptions={() => setSub('options')}
      onQuit={quitToMenu}
    />
  );
}
