/**
 * Main start-menu overlay: a full-screen backdrop with the brand mark and
 * five stacked actions. Pure presentational — no store/persistence access;
 * the integrator supplies availability flags and click handlers via props.
 */
import type { JSX, ReactNode } from 'react';
import { PANEL_ROUNDED } from './theme';

export interface StartMenuProps {
  /** Save Game + Quit are only enabled when a game is currently running. */
  hasActiveGame: boolean;
  /** Load Game is only enabled when at least one save exists. */
  hasSaves: boolean;
  /** Rendered above the button stack; falls back to a plain text heading. */
  logoSlot?: ReactNode;
  /** Closes the pause overlay and hands the city back. Absent on the start screen. */
  onResume?: () => void;
  onNewGame: () => void;
  onSaveGame: () => void;
  onLoadGame: () => void;
  onOptions: () => void;
  onQuit: () => void;
}

function MenuButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide transition-colors ${
        disabled
          ? 'cursor-not-allowed bg-white/5 text-white/30'
          : 'bg-white/10 text-white hover:bg-accent'
      }`}
    >
      {label}
    </button>
  );
}

export function StartMenu({
  hasActiveGame,
  hasSaves,
  logoSlot,
  onResume,
  onNewGame,
  onSaveGame,
  onLoadGame,
  onOptions,
  onQuit,
}: StartMenuProps): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[#05070cd9] backdrop-blur-sm"
      role="dialog"
      aria-label="Main menu"
    >
      <div className="w-64">
        {logoSlot ?? <h1 className="text-center text-3xl font-bold text-white">SlimCity</h1>}
      </div>
      <div className={`flex w-64 flex-col gap-3 p-4 ${PANEL_ROUNDED}`}>
        {/* Only over a running game, where it is the way back to the city —
            and the first thing the eye lands on, since leaving is the common
            reason to open this overlay. */}
        {hasActiveGame && onResume && <MenuButton label="Resume Game" onClick={onResume} />}
        <MenuButton label="New Game" onClick={onNewGame} />
        <MenuButton label="Save Game" onClick={onSaveGame} disabled={!hasActiveGame} />
        <MenuButton label="Load Game" onClick={onLoadGame} disabled={!hasSaves} />
        <MenuButton label="Options" onClick={onOptions} />
        <MenuButton label="Quit" onClick={onQuit} disabled={!hasActiveGame} />
        {/* Which build this is, under the buttons — the thing you read out
            when reporting that something is wrong with it. Quiet enough to
            ignore while playing, and it is a label rather than a control, so
            it is not part of the button run above. */}
        <p className="pt-1 text-center text-xs font-medium tracking-wide text-white/40">
          v{__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
