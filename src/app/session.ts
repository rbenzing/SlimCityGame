/**
 * App-level game-session intent + persisted user settings for the start menu.
 *
 * "Quit / New Game / Load Game" are implemented as a genuine teardown: the
 * intent is written here and the page is reloaded, so the worker, WebGL
 * context, listeners and scene are all torn down by the browser (zero
 * leak risk) and `main.ts` re-reads this on the fresh boot to decide whether
 * to show the menu or start/load a game. Settings persist separately in
 * localStorage so they survive across games and reloads.
 */

/** What the next boot should show. Persisted in sessionStorage (per tab). */
export type AppSession =
  | { screen: 'menu' }
  | { screen: 'playing'; seed: number; mode: 'new' | 'load'; saveId?: number };

const SESSION_KEY = 'slimcity.session';
const SETTINGS_KEY = 'slimcity.settings';

/** Reads the persisted session intent; defaults to the menu on first visit. */
export function readAppSession(): AppSession {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppSession;
      if (parsed && (parsed.screen === 'menu' || parsed.screen === 'playing')) return parsed;
    }
  } catch {
    // ignore malformed/blocked storage — fall through to the menu default
  }
  return { screen: 'menu' };
}

export function writeAppSession(session: AppSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage blocked (private mode/quota) — non-fatal; the current tab keeps running
  }
}

/** A fresh 32-bit seed for New Game (app-layer entropy — never in the sim tick). */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! >>> 0;
}

/** Writes "start a fresh random city" intent and reloads into gameplay. */
export function startNewGame(): void {
  writeAppSession({ screen: 'playing', seed: randomSeed(), mode: 'new' });
  location.reload();
}

/** Writes "load this save" intent and reloads into gameplay. */
export function startLoadGame(saveId: number): void {
  writeAppSession({ screen: 'playing', seed: 0, mode: 'load', saveId });
  location.reload();
}

/** Writes "back to the menu" intent and reloads (tears the running game down). */
export function quitToMenu(): void {
  writeAppSession({ screen: 'menu' });
  location.reload();
}

// --- persisted user settings ------------------------------------------------

/** User-facing options; persisted in localStorage across games/reloads. */
export interface GameSettings {
  bloom: boolean;
  sandboxUnlockAll: boolean;
  /** Testing: ignore funds/costs so anything is buildable (cash flow still tracked; HUD shows ∞). */
  unlimitedMoney: boolean;
  masterVolume: number; // 0..1
  muted: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  bloom: true,
  sandboxUnlockAll: false,
  unlimitedMoney: false,
  masterVolume: 0.7,
  muted: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    // ignore — fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // non-fatal
  }
}
