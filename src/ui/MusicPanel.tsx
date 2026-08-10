/**
 * Music player UI: transport, playlist, and the controls that decide how the
 * queue behaves. Presentational — it holds no music state of its own, it
 * subscribes to the player it is handed and calls back into it.
 */
import { useEffect, useState, type DragEvent, type JSX } from 'react';
import type { MusicPlayer, MusicPlayerState, RepeatMode } from '../app/music';
import { LABEL } from './theme';

export interface MusicPanelProps {
  player: MusicPlayer;
  musicVolume: number;
  onVolumeChange: (volume: number) => void;
  /** Persisted alongside the rest of the settings, so the queue behaves the same next session. */
  onModeChange: (mode: { musicShuffle?: boolean; musicRepeat?: RepeatMode }) => void;
}

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repeat: off',
  all: 'Repeat: all',
  one: 'Repeat: one',
};

const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

const BUTTON = 'rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20';

/** mm:ss for the transport readout; blank until the media reports a duration. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function MusicPanel({
  player,
  musicVolume,
  onVolumeChange,
  onModeChange,
}: MusicPanelProps): JSX.Element {
  const [state, setState] = useState<MusicPlayerState>(() => player.state());
  const [dragging, setDragging] = useState(false);

  useEffect(() => player.subscribe(setState), [player]);

  const current = state.index >= 0 ? state.tracks[state.index] : undefined;
  const hasTracks = state.tracks.length > 0;

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    player.addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={LABEL}>Music</div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col gap-2 rounded-md border border-dashed p-2 ${
          dragging ? 'border-accent bg-white/10' : 'border-white/15'
        }`}
      >
        {hasTracks ? (
          <>
            <div className="truncate text-sm" aria-label="Now playing">
              {current ? current.title : 'Nothing playing'}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous track"
                className={BUTTON}
                onClick={() => player.previous()}
              >
                ⏮
              </button>
              <button
                type="button"
                aria-label={state.playing ? 'Pause' : 'Play'}
                className={BUTTON}
                onClick={() => player.toggle()}
              >
                {state.playing ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                aria-label="Next track"
                className={BUTTON}
                onClick={() => player.next()}
              >
                ⏭
              </button>
              <span className="ml-auto text-[11px] tabular-nums text-white/50">
                {formatTime(state.currentTime)} / {formatTime(state.duration)}
              </span>
            </div>

            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={Math.max(1, state.duration)}
              step={1}
              value={Math.min(state.currentTime, state.duration || 0)}
              onChange={(e) => player.seek(Number(e.target.value))}
              disabled={!current}
              className="accent-accent"
            />

            <ul className="max-h-32 overflow-y-auto text-xs" aria-label="Playlist">
              {state.tracks.map((track, index) => (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => player.play(index)}
                    aria-current={index === state.index}
                    className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10 ${
                      index === state.index ? 'text-accent' : 'text-white/70'
                    }`}
                  >
                    <span className="truncate">{track.title}</span>
                    {track.ephemeral && (
                      <span className="ml-auto shrink-0 text-[10px] text-white/40">dropped</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[11px] text-white/50">
            No music yet. Drop <code>.mp3</code> or <code>.wav</code> files into{' '}
            <code>public/songs/</code> and hit Rescan — or drag them here to play them for this
            session.
          </p>
        )}
      </div>

      {state.error && <p className="text-[11px] text-amber-300">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Rescan songs folder"
          className={BUTTON}
          onClick={() => void player.scan()}
        >
          Rescan
        </button>
        <button
          type="button"
          aria-label={`Shuffle: ${state.shuffle ? 'on' : 'off'}`}
          aria-pressed={state.shuffle}
          className={`${BUTTON} ${state.shuffle ? 'text-accent' : ''}`}
          onClick={() => {
            player.setShuffle(!state.shuffle);
            onModeChange({ musicShuffle: !state.shuffle });
          }}
        >
          Shuffle
        </button>
        <button
          type="button"
          aria-label={REPEAT_LABEL[state.repeat]}
          className={BUTTON}
          onClick={() => {
            const next = REPEAT_NEXT[state.repeat];
            player.setRepeat(next);
            onModeChange({ musicRepeat: next });
          }}
        >
          {REPEAT_LABEL[state.repeat]}
        </button>
        {state.tracks.some((track) => track.ephemeral) && (
          <button
            type="button"
            aria-label="Clear dropped tracks"
            className={BUTTON}
            onClick={() => player.clearDropped()}
          >
            Clear dropped
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span>Music Volume</span>
        <input
          type="range"
          aria-label="Music Volume"
          min={0}
          max={1}
          step={0.01}
          value={musicVolume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="accent-accent"
        />
      </div>
    </div>
  );
}
