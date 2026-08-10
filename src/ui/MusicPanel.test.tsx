// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicPanel, formatTime } from './MusicPanel';
import type { MusicPlayer, MusicPlayerState, Track } from '../app/music';

afterEach(() => {
  cleanup();
});

function track(id: string, title: string, ephemeral = false): Track {
  return { id, title, url: `/songs/${title}.mp3`, ephemeral };
}

/**
 * A fake player: the panel only ever talks to this surface, so the component
 * can be driven without any media stack.
 */
function fakePlayer(overrides: Partial<MusicPlayerState> = {}): MusicPlayer & {
  calls: string[];
  push: (state: Partial<MusicPlayerState>) => void;
} {
  let state: MusicPlayerState = {
    tracks: [],
    index: -1,
    playing: false,
    repeat: 'all',
    shuffle: false,
    currentTime: 0,
    duration: 0,
    error: null,
    ...overrides,
  };
  const listeners = new Set<(s: MusicPlayerState) => void>();
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(args.length ? `${name}:${String(args[0])}` : name);
    };

  return {
    calls,
    push: (partial: Partial<MusicPlayerState>) => {
      state = { ...state, ...partial };
      listeners.forEach((fn) => fn(state));
    },
    state: () => state,
    subscribe: (listener: (s: MusicPlayerState) => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    play: record('play'),
    pause: record('pause'),
    toggle: record('toggle'),
    next: record('next'),
    previous: record('previous'),
    seek: record('seek'),
    scan: vi.fn(() => {
      calls.push('scan');
      return Promise.resolve();
    }),
    addFiles: vi.fn((files: readonly File[]) => {
      calls.push(`addFiles:${files.length}`);
      return files.length;
    }),
    clearDropped: record('clearDropped'),
    setShuffle: record('setShuffle'),
    setRepeat: record('setRepeat'),
    dispose: record('dispose'),
  } as unknown as MusicPlayer & { calls: string[]; push: (s: Partial<MusicPlayerState>) => void };
}

function renderPanel(
  player: MusicPlayer,
  props: Partial<React.ComponentProps<typeof MusicPanel>> = {},
): { onModeChange: ReturnType<typeof vi.fn>; onVolumeChange: ReturnType<typeof vi.fn> } {
  const onModeChange = vi.fn();
  const onVolumeChange = vi.fn();
  render(
    <MusicPanel
      player={player}
      musicVolume={0.6}
      onVolumeChange={onVolumeChange}
      onModeChange={onModeChange}
      {...props}
    />,
  );
  return { onModeChange, onVolumeChange };
}

describe('formatTime', () => {
  it('renders mm:ss and floors to the second', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.7)).toBe('0:09');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('MusicPanel', () => {
  it('explains where to put files when the playlist is empty', () => {
    renderPanel(fakePlayer());
    expect(screen.getByText(/public\/songs\//)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next track' })).not.toBeInTheDocument();
  });

  it('shows the current track and drives the transport', () => {
    const player = fakePlayer({
      tracks: [track('1', 'Alpha'), track('2', 'Beta')],
      index: 1,
      playing: true,
    });
    renderPanel(player);

    expect(screen.getByLabelText('Now playing')).toHaveTextContent('Beta');
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' })); // playing -> pause label
    expect(player.calls).toEqual(expect.arrayContaining(['next', 'previous', 'toggle']));
  });

  it('re-renders from the player as playback advances', () => {
    const player = fakePlayer({ tracks: [track('1', 'Alpha')], index: 0, duration: 120 });
    renderPanel(player);
    expect(screen.getByText('0:00 / 2:00')).toBeInTheDocument();

    act(() => player.push({ currentTime: 65 }));
    expect(screen.getByText('1:05 / 2:00')).toBeInTheDocument();
  });

  it('marks the playing row and plays another when clicked', () => {
    const player = fakePlayer({ tracks: [track('1', 'Alpha'), track('2', 'Beta')], index: 0 });
    renderPanel(player);

    const rows = screen.getAllByRole('button', { name: /Alpha|Beta/ });
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(rows[1]!);
    expect(player.calls).toContain('play:1');
  });

  it('labels dropped tracks and offers to clear them', () => {
    const player = fakePlayer({ tracks: [track('d', 'Dropped', true)], index: -1 });
    renderPanel(player);

    expect(screen.getByText('dropped')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear dropped tracks' }));
    expect(player.calls).toContain('clearDropped');
  });

  it('hides Clear dropped when nothing was dropped', () => {
    renderPanel(fakePlayer({ tracks: [track('1', 'Alpha')] }));
    expect(screen.queryByRole('button', { name: 'Clear dropped tracks' })).not.toBeInTheDocument();
  });

  it('rescans on demand', () => {
    const player = fakePlayer();
    renderPanel(player);
    fireEvent.click(screen.getByRole('button', { name: 'Rescan songs folder' }));
    expect(player.calls).toContain('scan');
  });

  it('toggling shuffle updates the player and persists the preference', () => {
    const player = fakePlayer();
    const { onModeChange } = renderPanel(player);

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle: off' }));
    expect(player.calls).toContain('setShuffle:true');
    expect(onModeChange).toHaveBeenCalledWith({ musicShuffle: true });
  });

  it('repeat cycles off -> all -> one', () => {
    const player = fakePlayer({ repeat: 'off' });
    const { onModeChange } = renderPanel(player);

    fireEvent.click(screen.getByRole('button', { name: 'Repeat: off' }));
    expect(onModeChange).toHaveBeenCalledWith({ musicRepeat: 'all' });

    act(() => player.push({ repeat: 'all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Repeat: all' }));
    expect(onModeChange).toHaveBeenCalledWith({ musicRepeat: 'one' });
  });

  it('music volume reports up to the settings owner', () => {
    const { onVolumeChange } = renderPanel(fakePlayer());
    fireEvent.change(screen.getByRole('slider', { name: 'Music Volume' }), {
      target: { value: '0.25' },
    });
    expect(onVolumeChange).toHaveBeenCalledWith(0.25);
  });

  it('accepts files dropped onto the panel', () => {
    const player = fakePlayer();
    renderPanel(player);
    const zone = screen.getByText(/public\/songs\//).parentElement!;

    fireEvent.drop(zone, { dataTransfer: { files: [{ name: 'a.mp3' }] } });
    expect(player.calls).toContain('addFiles:1');
  });

  it('surfaces a playback error', () => {
    renderPanel(fakePlayer({ error: 'Could not play Alpha' }));
    expect(screen.getByText('Could not play Alpha')).toBeInTheDocument();
  });
});
