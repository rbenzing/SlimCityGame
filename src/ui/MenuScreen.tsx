/**
 * Start-menu container: composes StartMenu/OptionsPanel/SaveBrowser (all pure
 * presentational) over the store's screen/menuOpen/settings state and wires
 * them to session.ts (New/Load/Quit — genuine teardown-reload) and
 * persist.ts (the save-slot list). Self-gates: renders nothing unless the
 * menu-only screen is showing or the in-game pause overlay is open.
 */
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import BrandLogo from './BrandLogo';
import { OptionsPanel } from './OptionsPanel';
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
    void listSaves().then((headers) => {
      if (!cancelled) setSaves(headers.map(toSaveRow));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Opening the pause overlay over a running game pauses the sim; closing it
  // (Escape, below) leaves speed as-is — Space still resumes it.
  useEffect(() => {
    if (screen === 'playing' && menuOpen) useCityStore.getState().setSpeed(0);
  }, [screen, menuOpen]);

  // Escape resumes gameplay by closing the in-game pause overlay. The
  // menu-only screen has no running game to return to, so it's a no-op there.
  useEffect(() => {
    if (!(screen === 'playing' && menuOpen)) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') useCityStore.getState().setMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, menuOpen]);

  if (!open) return null;

  if (sub === 'options') {
    return (
      <OptionsPanel
        settings={settings}
        onChange={(patch) => useCityStore.getState().setSettings(patch)}
        onBack={() => setSub('main')}
      />
    );
  }

  if (sub === 'saves') {
    return (
      <SaveBrowser
        saves={saves}
        onLoad={(id) => startLoadGame(Number(id))}
        onDelete={async (id) => {
          await deleteSave(Number(id));
          setSaves(await listSaves().then((headers) => headers.map(toSaveRow)));
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
      onNewGame={startNewGame}
      onSaveGame={() => useCityStore.getState().bound?.saveGame()}
      onLoadGame={() => setSub('saves')}
      onOptions={() => setSub('options')}
      onQuit={quitToMenu}
    />
  );
}
