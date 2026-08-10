import { describe, it, expect, vi } from 'vitest';
import { AudioEngine } from './audio';
import {
  advanceIndex,
  isMusicFile,
  mergeTracks,
  MusicPlayer,
  parseManifest,
  shuffledOrder,
  titleFromFilename,
  trackIdForFile,
  type Track,
} from './music';

/** A stand-in for HTMLAudioElement: jsdom has no playback engine. */
function fakeElement(): HTMLAudioElement {
  const listeners = new Map<string, (() => void)[]>();
  const element = {
    src: '',
    preload: 'auto',
    paused: true,
    currentTime: 0,
    duration: NaN,
    play: vi.fn(function (this: { paused: boolean }) {
      this.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(function (this: { paused: boolean }) {
      this.paused = true;
    }),
    removeAttribute: vi.fn(function (this: { src: string }) {
      this.src = '';
    }),
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    /** Test hook: fire a media event. */
    emit: (type: string) => (listeners.get(type) ?? []).forEach((fn) => fn()),
  };
  return element as unknown as HTMLAudioElement;
}

interface Harness {
  player: MusicPlayer;
  element: HTMLAudioElement & { emit: (type: string) => void };
  revoked: string[];
  created: string[];
  setManifest: (files: string[]) => void;
  failManifest: () => void;
}

function harness(initial: string[] = []): Harness {
  const element = fakeElement() as HTMLAudioElement & { emit: (type: string) => void };
  const revoked: string[] = [];
  const created: string[] = [];
  let files = initial;
  let fails = false;
  let counter = 0;

  const player = new MusicPlayer(new AudioEngine({ createContext: () => null as never }), {
    createElement: () => element,
    fetchJson: () => (fails ? Promise.reject(new Error('404')) : Promise.resolve({ files })),
    createObjectURL: () => {
      const url = `blob:track-${counter++}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url) => revoked.push(url),
    rng: () => 0.5,
  });

  return {
    player,
    element,
    revoked,
    created,
    setManifest: (next) => {
      files = next;
    },
    failManifest: () => {
      fails = true;
    },
  };
}

function file(name: string, size = 100, lastModified = 1): File {
  return { name, size, lastModified } as File;
}

describe('manifest + track helpers', () => {
  it('parses a manifest into playable, url-encoded tracks', () => {
    const tracks = parseManifest({ files: ['Night Drive.mp3', 'theme.wav'] });
    expect(tracks).toHaveLength(2);
    expect(tracks[0]!.title).toBe('Night Drive');
    expect(tracks[0]!.url).toBe('/songs/Night%20Drive.mp3');
    expect(tracks[0]!.ephemeral).toBe(false);
  });

  it('honors a deployment base path', () => {
    const tracks = parseManifest({ files: ['a.mp3'] }, '/CitySim/');
    expect(tracks[0]!.url).toBe('/CitySim/songs/a.mp3');
  });

  it('ignores junk rather than throwing on a half-written manifest', () => {
    expect(parseManifest(null)).toEqual([]);
    expect(parseManifest({})).toEqual([]);
    expect(parseManifest({ files: 'nope' })).toEqual([]);
    expect(parseManifest({ files: ['notes.txt', 42, 'ok.mp3'] })).toHaveLength(1);
  });

  it('accepts only the documented formats', () => {
    expect(isMusicFile('a.mp3')).toBe(true);
    expect(isMusicFile('A.WAV')).toBe(true);
    expect(isMusicFile('cover.jpg')).toBe(false);
  });

  it('titles come from the filename, path and extension stripped', () => {
    expect(titleFromFilename('/songs/My Song.mp3')).toBe('My Song');
    expect(titleFromFilename('noext')).toBe('noext');
  });

  it('mergeTracks is idempotent: merging the same list twice changes nothing', () => {
    const a: Track[] = [{ id: '1', title: 'a', url: 'a', ephemeral: false }];
    const b: Track[] = [{ id: '2', title: 'b', url: 'b', ephemeral: false }];
    const once = mergeTracks(a, b);
    const twice = mergeTracks(once, b);
    expect(once).toHaveLength(2);
    expect(twice).toHaveLength(2);
    expect(mergeTracks(twice, twice)).toHaveLength(2);
  });

  it('the same file dropped twice has the same id', () => {
    expect(trackIdForFile(file('x.mp3'))).toBe(trackIdForFile(file('x.mp3')));
    expect(trackIdForFile(file('x.mp3', 200))).not.toBe(trackIdForFile(file('x.mp3', 100)));
  });
});

describe('advanceIndex', () => {
  it('stops at the end with repeat off, wraps with repeat all', () => {
    expect(advanceIndex(2, 3, 'off', 1, true)).toBeNull();
    expect(advanceIndex(2, 3, 'all', 1, true)).toBe(0);
    expect(advanceIndex(0, 3, 'off', 1, true)).toBe(1);
  });

  it('repeat one holds on a natural end but still skips on an explicit next', () => {
    expect(advanceIndex(1, 3, 'one', 1, true)).toBe(1);
    expect(advanceIndex(1, 3, 'one', 1, false)).toBe(2);
  });

  it('going back from the first track wraps to the last', () => {
    expect(advanceIndex(0, 3, 'off', -1, false)).toBe(2);
  });

  it('an empty playlist goes nowhere', () => {
    expect(advanceIndex(0, 0, 'all', 1, true)).toBeNull();
  });
});

describe('shuffledOrder', () => {
  it('is a permutation — every track appears exactly once', () => {
    const order = shuffledOrder(8, () => 0.42);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('is deterministic under an injected rng', () => {
    const rng = (): number => 0.7;
    expect(shuffledOrder(6, rng)).toEqual(shuffledOrder(6, rng));
  });
});

describe('MusicPlayer', () => {
  it('scan loads the folder into the playlist', async () => {
    const h = harness(['a.mp3', 'b.mp3']);
    await h.player.scan();
    expect(h.player.state().tracks.map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('scanning repeatedly never duplicates a track', async () => {
    const h = harness(['a.mp3', 'b.mp3']);
    await h.player.scan();
    await h.player.scan();
    await h.player.scan();
    expect(h.player.state().tracks).toHaveLength(2);
  });

  it('a rescan picks up new files and keeps the current track playing', async () => {
    const h = harness(['a.mp3', 'b.mp3']);
    await h.player.scan();
    h.player.play(1); // playing 'b'
    expect(h.player.state().playing).toBe(true);

    h.setManifest(['a.mp3', 'b.mp3', 'c.mp3']);
    await h.player.scan();

    const state = h.player.state();
    expect(state.tracks).toHaveLength(3);
    expect(state.tracks[state.index]!.title).toBe('b'); // still selected
    expect(state.playing).toBe(true); // and never interrupted
  });

  it('a missing manifest is an empty playlist, not an error', async () => {
    const h = harness();
    h.failManifest();
    await h.player.scan();
    expect(h.player.state().tracks).toEqual([]);
    expect(h.player.state().error).toBeNull();
  });

  it('dropped files play, and re-dropping the same file adds nothing', () => {
    const h = harness();
    expect(h.player.addFiles([file('song.mp3'), file('art.png')])).toBe(1);
    expect(h.player.addFiles([file('song.mp3')])).toBe(0);
    expect(h.player.state().tracks).toHaveLength(1);
    expect(h.player.state().tracks[0]!.ephemeral).toBe(true);
  });

  it('dropped tracks survive a folder rescan', async () => {
    const h = harness(['a.mp3']);
    await h.player.scan();
    h.player.addFiles([file('dropped.mp3')]);
    await h.player.scan();
    expect(h.player.state().tracks.map((t) => t.title)).toEqual(['a', 'dropped']);
  });

  it('clearDropped revokes every object URL it created', () => {
    const h = harness();
    h.player.addFiles([file('one.mp3'), file('two.mp3', 200)]);
    expect(h.created).toHaveLength(2);

    h.player.clearDropped();

    expect(h.revoked).toEqual(h.created); // nothing leaked
    expect(h.player.state().tracks).toEqual([]);
  });

  it('dispose revokes outstanding object URLs', () => {
    const h = harness();
    h.player.addFiles([file('one.mp3')]);
    h.player.dispose();
    expect(h.revoked).toEqual(h.created);
  });

  it('a track that ends advances to the next one', async () => {
    const h = harness(['a.mp3', 'b.mp3']);
    await h.player.scan();
    h.player.play(0);
    h.element.emit('ended');
    expect(h.player.state().index).toBe(1);
  });

  it('the last track stops with repeat off and wraps with repeat all', async () => {
    const h = harness(['a.mp3', 'b.mp3']);
    await h.player.scan();
    h.player.setRepeat('off');
    h.player.play(1);
    h.element.emit('ended');
    expect(h.player.state().playing).toBe(false);

    h.player.setRepeat('all');
    h.player.play(1);
    h.element.emit('ended');
    expect(h.player.state().index).toBe(0);
    expect(h.player.state().playing).toBe(true);
  });

  it('previous restarts the track once it is underway, and skips back when it is not', async () => {
    const h = harness(['a.mp3', 'b.mp3']);
    await h.player.scan();
    h.player.play(1);

    h.element.currentTime = 30;
    h.player.previous();
    expect(h.player.state().index).toBe(1);
    expect(h.element.currentTime).toBe(0);

    h.player.previous();
    expect(h.player.state().index).toBe(0);
  });

  it('toggle pauses and resumes without changing the track', async () => {
    const h = harness(['a.mp3']);
    await h.player.scan();
    h.player.play(0);

    h.player.toggle();
    expect(h.player.state().playing).toBe(false);
    h.player.toggle();
    expect(h.player.state().playing).toBe(true);
    expect(h.player.state().index).toBe(0);
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const h = harness(['a.mp3']);
    const seen: number[] = [];
    const unsubscribe = h.player.subscribe((state) => seen.push(state.tracks.length));
    expect(seen).toEqual([0]); // current state on subscribe

    await h.player.scan();
    expect(seen).toEqual([0, 1]);

    unsubscribe();
    h.player.addFiles([file('x.mp3')]);
    expect(seen).toEqual([0, 1]);
  });

  it('reports a playback failure instead of throwing', async () => {
    const h = harness(['a.mp3']);
    await h.player.scan();
    h.player.play(0);
    h.element.emit('error');
    expect(h.player.state().error).toContain('a');
  });
});
