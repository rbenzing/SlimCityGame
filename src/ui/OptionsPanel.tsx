/**
 * Options panel: rendering + gameplay + audio toggles. Pure presentational —
 * no store access; the integrator supplies the current settings and receives
 * partial patches via onChange so it can decide how/where to persist them.
 */
import type { JSX } from 'react';
import { LABEL, PANEL_ROUNDED } from './theme';
import type { GameSettings } from '../app/session';

export type { GameSettings };

export interface OptionsPanelProps {
  settings: GameSettings;
  onChange: (partial: Partial<GameSettings>) => void;
  onBack: () => void;
}

export function OptionsPanel({ settings, onChange, onBack }: OptionsPanelProps): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#05070cd9] p-6 backdrop-blur-sm"
      role="dialog"
      aria-label="Options"
    >
      <div className={`flex w-full max-w-sm flex-col gap-4 p-4 text-white ${PANEL_ROUNDED}`}>
        <h2 className="text-lg font-semibold">Options</h2>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Bloom</span>
          <input
            type="checkbox"
            aria-label="Bloom"
            checked={settings.bloom}
            onChange={(e) => onChange({ bloom: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Sandbox: unlock all build items</span>
          <input
            type="checkbox"
            aria-label="Sandbox: unlock all build items"
            checked={settings.sandboxUnlockAll}
            onChange={(e) => onChange({ sandboxUnlockAll: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
        </label>

        <div className="flex flex-col gap-2">
          <div className={LABEL}>Audio</div>
          <p className="text-[11px] text-white/50">Minimal audio settings for now.</p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Master Volume</span>
            <input
              type="range"
              aria-label="Master Volume"
              min={0}
              max={1}
              step={0.01}
              value={settings.masterVolume}
              onChange={(e) => onChange({ masterVolume: Number(e.target.value) })}
              className="accent-accent"
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Mute</span>
            <input
              type="checkbox"
              aria-label="Mute"
              checked={settings.muted}
              onChange={(e) => onChange({ muted: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
          </label>
        </div>

        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="self-start rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
        >
          Back
        </button>
      </div>
    </div>
  );
}
