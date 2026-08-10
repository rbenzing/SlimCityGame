/**
 * The one audio engine + music player the app uses, created on first request.
 *
 * A singleton because audio outlives any single screen: the menu, the game and
 * the in-game overlay all reach the same player, so music keeps going across
 * them. The lazy guard also makes repeated calls (React re-renders, HMR
 * re-execution, main() running twice) idempotent — there is never a second
 * context or a second <audio> element.
 */
import { AudioEngine } from './audio';
import { MusicPlayer } from './music';

export interface AudioRuntime {
  engine: AudioEngine;
  music: MusicPlayer;
}

let runtime: AudioRuntime | null = null;

export function audioRuntime(): AudioRuntime {
  if (!runtime) {
    const engine = new AudioEngine();
    const music = new MusicPlayer(engine, { base: import.meta.env.BASE_URL });
    runtime = { engine, music };
    // Read the songs folder as soon as anything wants audio, so the playlist
    // is populated whether the player opens Options from the start menu or
    // starts a game. scan() is idempotent, so a later rescan costs nothing.
    void music.scan();
  }
  return runtime;
}

/** Tears the runtime down; the next audioRuntime() builds a fresh one. */
export function disposeAudioRuntime(): void {
  runtime?.music.dispose();
  runtime?.engine.dispose();
  runtime = null;
}
