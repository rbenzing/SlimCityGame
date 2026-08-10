/**
 * Music: plays whatever the player drops into `public/songs/` (or onto the
 * window). The game ships no music of its own.
 *
 * Two rules shape this module.
 *
 * IDEMPOTENT — a track's identity is its URL path (dropped files: name + size
 * + mtime). Rescanning the folder, re-dropping a file, or re-running scan()
 * converges on the same playlist: no duplicate rows, no stacked elements or
 * listeners, and the track currently playing keeps playing across a rescan
 * instead of the queue restarting.
 *
 * EPHEMERAL — nothing is persisted or copied. Audio streams from disk through
 * an HTMLAudioElement (so a long album never sits decoded in memory and
 * seeking is free), dropped files exist only as object URLs that are revoked
 * the moment they leave the playlist, and only preferences — volume, shuffle,
 * repeat — outlive the session.
 */
import type { AudioEngine } from './audio';

export interface Track {
  /** Stable identity; also the dedupe key. */
  id: string;
  title: string;
  /** Where to stream from: a /songs/ path, or an object URL for dropped files. */
  url: string;
  /** Object URLs must be revoked when dropped from the playlist; folder tracks must not. */
  ephemeral: boolean;
}

export type RepeatMode = 'off' | 'all' | 'one';

export const SONGS_MANIFEST_URL = 'songs/manifest.json';
/** What the folder scanner and the drop zone accept. */
export const MUSIC_EXTENSIONS = ['.mp3', '.wav'] as const;

export function isMusicFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MUSIC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Strips the extension for display; the filename is the only title we have. */
export function titleFromFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Turns the generated manifest into tracks. Tolerant by design: a hand-edited
 * or half-written manifest yields the tracks it can rather than throwing.
 */
export function parseManifest(data: unknown, base = '/'): Track[] {
  const files = (data as { files?: unknown })?.files;
  if (!Array.isArray(files)) return [];
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const tracks: Track[] = [];
  for (const entry of files) {
    if (typeof entry !== 'string' || !isMusicFile(entry)) continue;
    const url = `${prefix}songs/${encodeURIComponent(entry)}`;
    tracks.push({ id: url, title: titleFromFilename(entry), url, ephemeral: false });
  }
  return tracks;
}

/** Identity for a dropped file — same file dropped twice is the same track. */
export function trackIdForFile(file: { name: string; size: number; lastModified: number }): string {
  return `dropped:${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Merges incoming tracks into an existing playlist, keeping the existing entry
 * whenever ids collide. This is what makes scan() and drop idempotent.
 */
export function mergeTracks(existing: readonly Track[], incoming: readonly Track[]): Track[] {
  const byId = new Map(existing.map((track) => [track.id, track]));
  const merged = [...existing];
  for (const track of incoming) {
    if (byId.has(track.id)) continue;
    byId.set(track.id, track);
    merged.push(track);
  }
  return merged;
}

/**
 * Where the queue goes next. `null` means stop — the end of the list with
 * repeat off. `one` only repeats on natural end, never on an explicit skip.
 */
export function advanceIndex(
  index: number,
  count: number,
  repeat: RepeatMode,
  direction: 1 | -1,
  natural: boolean,
): number | null {
  if (count === 0) return null;
  if (natural && repeat === 'one') return index;
  const next = index + direction;
  if (next >= count) return repeat === 'off' ? null : 0;
  if (next < 0) return count - 1;
  return next;
}

/** Deterministic under an injected rng; app layer only, never the sim. */
export function shuffledOrder(count: number, rng: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }
  return order;
}

export interface MusicPlayerState {
  tracks: readonly Track[];
  /** Index into `tracks`, or -1 when nothing is loaded. */
  index: number;
  playing: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  currentTime: number;
  duration: number;
  /** Set when the last scan or load failed, for the UI to show. */
  error: string | null;
}

export interface MusicPlayerOptions {
  createElement?: () => HTMLAudioElement;
  fetchJson?: (url: string) => Promise<unknown>;
  createObjectURL?: (file: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  rng?: () => number;
  base?: string;
}

export class MusicPlayer {
  private readonly engine: AudioEngine;
  private readonly element: HTMLAudioElement;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly createObjectURL: (file: Blob) => string;
  private readonly revokeObjectURL: (url: string) => void;
  private readonly rng: () => number;
  private readonly base: string;

  private list: Track[] = [];
  private index = -1;
  private repeat: RepeatMode = 'off';
  private shuffle = false;
  private order: number[] = [];
  private error: string | null = null;
  private listeners = new Set<(state: MusicPlayerState) => void>();
  /**
   * A media element can be adopted by createMediaElementSource exactly once —
   * a second call throws. Built on the first unlocked play and kept forever.
   */
  private source: MediaElementAudioSourceNode | null = null;

  constructor(engine: AudioEngine, options: MusicPlayerOptions = {}) {
    this.engine = engine;
    this.element = options.createElement?.() ?? new Audio();
    this.element.preload = 'none'; // stream on demand; never prefetch an album
    this.fetchJson =
      options.fetchJson ??
      (async (url: string): Promise<unknown> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status}`);
        return (await response.json()) as unknown;
      });
    this.createObjectURL = options.createObjectURL ?? ((file) => URL.createObjectURL(file));
    this.revokeObjectURL = options.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
    this.rng = options.rng ?? Math.random;
    this.base = options.base ?? '/';

    this.element.addEventListener('ended', () => this.step(1, true));
    this.element.addEventListener('timeupdate', () => this.emit());
    this.element.addEventListener('loadedmetadata', () => this.emit());
    this.element.addEventListener('error', () => {
      if (this.index >= 0) this.error = `Could not play ${this.list[this.index]?.title ?? 'track'}`;
      this.emit();
    });
  }

  state(): MusicPlayerState {
    return {
      tracks: this.list,
      index: this.index,
      playing: !this.element.paused && this.index >= 0,
      repeat: this.repeat,
      shuffle: this.shuffle,
      currentTime: this.element.currentTime || 0,
      duration: Number.isFinite(this.element.duration) ? this.element.duration : 0,
      error: this.error,
    };
  }

  subscribe(listener: (state: MusicPlayerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state());
    return () => this.listeners.delete(listener);
  }

  /**
   * Re-reads the songs folder. Idempotent: existing tracks keep their place and
   * the current track keeps playing; only genuinely new files are appended, and
   * folder tracks that disappeared are dropped (unless one is playing).
   */
  async scan(): Promise<void> {
    let found: Track[] = [];
    try {
      const data = await this.fetchJson(`${this.base}${SONGS_MANIFEST_URL}`);
      found = parseManifest(data, this.base);
      this.error = null;
    } catch {
      // No manifest yet (plugin not run, or an empty folder) is not an error
      // worth shouting about — the panel's empty state explains what to do.
      found = [];
    }
    const playing = this.index >= 0 ? this.list[this.index] : undefined;
    const kept = this.list.filter(
      (track) =>
        track.ephemeral || track.id === playing?.id || found.some((f) => f.id === track.id),
    );
    this.setList(mergeTracks(kept, found), playing);
    this.emit();
  }

  /** Adds dropped files as ephemeral tracks. Re-dropping the same file is a no-op. */
  addFiles(files: readonly File[]): number {
    const playing = this.index >= 0 ? this.list[this.index] : undefined;
    const incoming: Track[] = [];
    for (const file of files) {
      if (!isMusicFile(file.name)) continue;
      const id = trackIdForFile(file);
      if (this.list.some((track) => track.id === id)) continue;
      if (incoming.some((track) => track.id === id)) continue;
      incoming.push({
        id,
        title: titleFromFilename(file.name),
        url: this.createObjectURL(file),
        ephemeral: true,
      });
    }
    if (incoming.length === 0) return 0;
    this.setList(mergeTracks(this.list, incoming), playing);
    this.emit();
    return incoming.length;
  }

  /** Removes every dropped track and releases its object URL. */
  clearDropped(): void {
    const playing = this.index >= 0 ? this.list[this.index] : undefined;
    const keep = this.list.filter((track) => !track.ephemeral);
    for (const track of this.list) {
      if (track.ephemeral) this.revokeObjectURL(track.url);
    }
    if (playing?.ephemeral) this.stop();
    this.setList(keep, playing?.ephemeral ? undefined : playing);
    this.emit();
  }

  play(index = this.index): void {
    if (this.list.length === 0) return;
    const target = index < 0 ? this.firstInOrder() : index;
    const track = this.list[target];
    if (!track) return;
    // Hitting play IS the user gesture, so this is the moment the engine can
    // legally start — without it, music opened from the start menu (where no
    // gameplay listeners exist yet) would bypass the master volume and mute.
    this.engine.unlock();
    this.attach();
    if (target !== this.index || !this.element.src) {
      this.index = target;
      this.element.src = track.url;
      this.error = null;
    }
    void this.element.play()?.catch(() => {
      // Autoplay policy or a decode failure: surface it rather than throwing.
      this.error = `Could not play ${track.title}`;
      this.emit();
    });
    this.emit();
  }

  pause(): void {
    this.element.pause();
    this.emit();
  }

  toggle(): void {
    if (this.element.paused) this.play();
    else this.pause();
  }

  next(): void {
    this.step(1, false);
  }

  previous(): void {
    // The familiar transport behaviour: restart this track unless you hit it
    // again quickly.
    if (this.element.currentTime > 3) {
      this.element.currentTime = 0;
      this.emit();
      return;
    }
    this.step(-1, false);
  }

  seek(seconds: number): void {
    if (this.index < 0) return;
    this.element.currentTime = Math.max(0, seconds);
    this.emit();
  }

  setRepeat(mode: RepeatMode): void {
    this.repeat = mode;
    this.emit();
  }

  setShuffle(on: boolean): void {
    this.shuffle = on;
    this.order = on ? shuffledOrder(this.list.length, this.rng) : [];
    this.emit();
  }

  /** Stops playback and releases every object URL this player created. */
  dispose(): void {
    this.stop();
    for (const track of this.list) {
      if (track.ephemeral) this.revokeObjectURL(track.url);
    }
    this.list = [];
    this.listeners.clear();
  }

  private stop(): void {
    this.element.pause();
    this.element.removeAttribute('src');
    this.index = -1;
  }

  /**
   * Routes the element through the engine's music bus. Deferred until the
   * engine has unlocked (there is no context before that) and done at most
   * once — createMediaElementSource throws on a second adoption.
   */
  private attach(): void {
    if (this.source) return;
    const ctx = this.engine.context();
    const bus = this.engine.musicBus();
    if (!ctx || !bus) return; // still inert; plays through the element directly
    this.source = ctx.createMediaElementSource(this.element);
    this.source.connect(bus);
  }

  private step(direction: 1 | -1, natural: boolean): void {
    const count = this.list.length;
    if (count === 0) return;
    if (natural && this.repeat === 'one') {
      this.element.currentTime = 0;
      void this.element.play()?.catch(() => undefined);
      this.emit();
      return;
    }
    const position = this.shuffle ? this.orderPositionOf(this.index) : this.index;
    const nextPosition = advanceIndex(position, count, this.repeat, direction, natural);
    if (nextPosition === null) {
      this.element.pause();
      this.emit();
      return;
    }
    this.play(this.shuffle ? (this.order[nextPosition] ?? nextPosition) : nextPosition);
  }

  private orderPositionOf(index: number): number {
    const at = this.order.indexOf(index);
    return at >= 0 ? at : 0;
  }

  private firstInOrder(): number {
    return this.shuffle ? (this.order[0] ?? 0) : 0;
  }

  /** Swaps the list in, keeping `playing` selected wherever it landed. */
  private setList(next: Track[], playing: Track | undefined): void {
    this.list = next;
    this.index = playing ? next.findIndex((track) => track.id === playing.id) : -1;
    if (this.shuffle) this.order = shuffledOrder(next.length, this.rng);
  }

  private emit(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}
