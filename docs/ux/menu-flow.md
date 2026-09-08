# Start menu and game lifecycle

How the game boots, pauses, saves, and quits — verified against
`src/ui/MenuScreen.tsx`, `StartMenu.tsx`, `OptionsPanel.tsx`,
`SaveBrowser.tsx`, and `src/app/session.ts`. What each screen looks like
is covered in [hud.md](hud.md); this page is the flow between them.

## One component, two contexts

`MenuScreen.tsx` is the single component behind both the first-load start
screen and the in-game pause overlay — it self-gates on
`screen === 'menu' || menuOpen` from the store, rendering nothing
otherwise. It holds one piece of local state, `sub: 'main' | 'options' |
'saves'`, and renders exactly one of `StartMenu`, `OptionsPanel`, or
`SaveBrowser` at a time; opening the overlay always resets `sub` back to
`'main'`, so reopening it after a visit to Options never strands the
player on a sub-view. `StartMenu`, `OptionsPanel`, and `SaveBrowser` are
themselves pure presentational components with no store or persistence
access of their own — `MenuScreen` supplies every prop and callback,
which is what keeps them independently testable.

## New Game, Load Game, and Quit are a real teardown

`startNewGame`, `startLoadGame`, and `quitToMenu` (`src/app/session.ts`)
all follow the same shape: write an intent object to `sessionStorage`,
then call `location.reload()`. The browser's own page reload tears down
the worker, the WebGL context, and every event listener for free — there
is no in-app teardown path for any of these to get wrong. The fresh boot
reads the intent back (`readAppSession`) and decides whether to show the
menu or start/load a game.

- **New Game** writes a fresh random seed (`randomSeed()`, drawn from
  `crypto.getRandomValues` — app-layer entropy, never inside the
  deterministic sim tick) and mode `'new'`.
- **Load Game** writes mode `'load'` with the chosen save's id and a
  placeholder seed of `0`; the real seed comes back out of that save's own
  header once `main.ts`'s boot reads the save, so the exact same terrain
  regenerates before the save data itself is applied.
- **Quit** writes `{ screen: 'menu' }` with no seed — the next boot shows
  the start screen.

**Save Game** and **Options**, by contrast, act on the live game in place
rather than reloading — there is a running game to save or a setting to
apply immediately, so neither wants to tear anything down.

## The button stack

`StartMenu.tsx` composes a self-generated brand mark
(`BrandLogo`) over up to five stacked buttons, `hasActiveGame` and
`hasSaves` deciding what is enabled:

| Button      | Shown                                                                    | Enabled                     |
| ----------- | ------------------------------------------------------------------------ | --------------------------- |
| Resume Game | Only over a running game (`hasActiveGame`), and first in the stack there | Always, when shown          |
| New Game    | Always                                                                   | Always                      |
| Save Game   | Always                                                                   | Only with an active game    |
| Load Game   | Always                                                                   | Only with at least one save |
| Options     | Always                                                                   | Always                      |
| Quit        | Always                                                                   | Only with an active game    |

Resume Game is first, not last, when it appears — leaving is the most
common reason to open the overlay over a running game, so it is the first
thing the eye lands on.

## Escape and Back

- Inside a sub-view (Options, Saves), that sub-view's own **Back** button
  returns to the main list — it does not close the whole overlay.
- **Escape never stops at a sub-view.** From anywhere in the overlay,
  Escape means only one thing: Resume. Over a running game, it closes the
  whole overlay outright and resumes play, skipping past whatever sub-view
  is open. `MenuScreen.tsx` wires this with its own `keydown` listener,
  registered only while `screen === 'playing' && menuOpen` — so on the
  menu-only start screen, with no running game to resume to, Escape does
  nothing at all.
- Opening the pause overlay pauses the sim at whatever speed it was
  running (remembered in a `ref`, not reset to a default); Resume — by
  button or by Escape — restores that exact speed, including staying
  paused if that is how the player left it. The two exits can never
  disagree, since both call the same `resumeGame` callback.

## Save-slot list

`SaveBrowser.tsx` lists every save (`listSaves()`, read fresh every time
the overlay opens, so a save made mid-session shows up the next time the
list opens) with its name, a formatted timestamp, and — where the header
carries them — population and funds. Each row has its own **Load** and
**Delete** actions; deleting refreshes the list in place rather than
requiring the overlay to be reopened. With zero saves, the list reads "No
saved cities yet." instead of rendering an empty list.

## Options

`OptionsPanel.tsx` is a flat set of controls, each wired straight to a
patch on the store's `settings` (persisted to `localStorage` on every
change via `setSettings`):

- **Bloom** — a checkbox toggling the post-process bloom pipeline.
- **Sandbox: unlock all build items** — a checkbox bypassing every
  milestone gate on every asset-drawer card, for testing.
- **Unlimited money** — a checkbox that makes every cost readout show `∞`
  and ignores funds when validating a placement; cash flow is still
  tracked underneath.
- **Audio** — a master-volume slider and a mute checkbox, plus the
  embedded music player (see below).

Sandbox and unlimited money are both explicit bypasses of a real gate
rather than a second, weaker version of it — see
[ux-design.md](ux-design.md#rule-zero-nothing-renders-that-is-not-wired-to-real-behaviour)
for why that distinction matters.

### The embedded music player

`MusicPanel.tsx`, rendered inside Options: transport controls (previous,
play/pause, next, a seek bar disabled until a track is actually chosen,
elapsed/total time), the full playlist with the current track picked out
(`aria-current`) and reading "Nothing playing" until one actually is,
shuffle and repeat toggles (repeat cycles `off → all → one`) that persist
alongside the rest of `settings`, a Rescan action for the `public/songs/`
folder, and a music-volume slider that mixes independently of the rest of
the audio bed. A drop zone on the panel accepts `.mp3`/`.wav` files
dragged in anywhere on the window for the current session only — those
tracks are labelled `dropped`, and a Clear-dropped action appears once at
least one exists. With no tracks at all, the transport and playlist give
way to a line explaining where to put files; Rescan, Shuffle, Repeat, and
the volume slider stay available either way. A playback error the browser
reports surfaces as its own line beneath the drop zone.
