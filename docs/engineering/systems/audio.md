# Audio — system design

Audio is an app-layer concern: it reads snapshots and settings, and nothing
under `src/sim` or `src/render` ever imports it, so it cannot touch
determinism.

**Lives in:** `src/app/audio.ts`, `src/app/audioruntime.ts`, `src/app/music.ts`,
with the player-facing surface in `src/ui/MusicPanel.tsx` and
`src/ui/OptionsPanel.tsx`.

## The model

One `AudioContext` feeds a master gain into three independent sub-gains —
ambient, UI, and music — so each layer mixes on top of one master level.

Nothing is created at import time: a context built outside a user gesture
starts suspended. The engine unlocks on the first `pointerdown` or `keydown`
and resumes the context; any play call before that is a silent no-op rather
than an error, so starting a game from the menu (itself a click) is enough to
guarantee sound by the time the city is on screen. Master gain is
`muted ? 0 : masterVolume`, applied live through the same settings-binding path
that already drives bloom and sandbox mode.

## Every built-in sound is synthesized

There is no audio asset pipeline and no shipped audio bytes: every built-in
sound is generated from WebAudio primitives — oscillators, envelopes, and
filtered noise — so the built-in sound layer costs zero bytes and zero load
time.

The ambient bed is remixed once per snapshot from the city's hour, population
and night factor: a lowpassed-noise traffic layer whose gain scales with
population and the day's commute curve (loud at rush hour, near-silent at
3 a.m.), plus a constant quiet wind floor — both broadband noise, the only kind
of sound that survives being looped forever.

Wildlife is scheduled rather than looped: individual calls are committed a
couple of seconds ahead on the audio clock, at freshly drawn gaps, birdsong by
day and cricket ticks after dark, thinning as the city fills in.

Four short synthesized UI cues cover `click` (tool or dock selection), `build`
(a successful command), `denied` (a rejected command, or a warning or error
notification), and `notify` (an info notification).

## Music: a `public/songs/` folder the player owns

The game ships no music. Dropping `.mp3`/`.wav` files into `public/songs/`
makes them the in-game playlist, discovered through a generated manifest — a
small Vite plugin scans the folder and serves it, regenerating on add or remove
in dev and once at build — plus an explicit Rescan.

A track's identity is its manifest path, or for a dropped file its name, size
and last-modified time, so rescanning, re-dropping the same file, or
reinitialising the player all converge on the same playlist with no duplicates;
a rescan keeps the current track playing if it still exists rather than
restarting the queue. Dragging files onto the window adds them to the session
playlist alongside the folder's own tracks.

Nothing about the music is persisted or copied: tracks stream from disk through
an `HTMLAudioElement` rather than being decoded into memory, dropped files live
only as object URLs that are revoked on replace or unload, and the audio file
formats are excluded from version control so no one's music is ever committed.

## Invariants

- **Audio cannot break determinism.** Nothing in `src/sim` or `src/render`
  imports it, so the simulation cannot observe it. See
  [../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md](../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).
- **Shuffle may use `Math.random`.** It takes an injected random source
  defaulting to `Math.random`, which is legitimate here precisely because this
  is app-layer code sitting outside the simulation's no-`Math.random` rule.
  That exception is worth knowing about, because the rule is otherwise absolute
  — see [../standards/architecture-rules.md](../standards/architecture-rules.md).
- **A play call before unlock is a no-op, never an error.** Anything calling
  into audio must be safe to call at any time.

## Settings

Persisted to local storage: `masterVolume` (0–1, default 0.7) and `muted` for
the ambient and UI mix; independently `musicVolume` (0–1, default 0.6),
`musicShuffle` (default off) and `musicRepeat` (`'off' | 'all' | 'one'`,
default `'all'`) for the music player. Only listening preferences persist —
never the playlist.

See [../../ux/hud.md](../../ux/hud.md) for the Options panel's Audio
section and the compact now-playing transport.
