# Debugging

Two real tools exist for inspecting a running game: a dev-only structural
read-back surface on `window`, and a family of Playwright scripts that
drive the real app in a real browser. Neither is a debugger in the
traditional sense — both exist because of the standing project rule in
[testing.md](testing.md#screenshots-not-read-backs): **render correctness
is judged by looking at a screenshot, not by an assertion passing.** These
tools are how that looking happens without doing it by hand every time.

## `window.__slimcity`: the dev read-back surface

Wired in `src/main.ts`, gated by `import.meta.env.DEV` in two places (so it
is entirely absent from a production build): once early, right after the
camera rig attaches, and again later once `screenToTile` exists. It exposes
functions a harness or a developer can call from the page (via
`page.evaluate()` in Playwright, or the DevTools console by hand):

- **Deterministic input**, bypassing screen-space picking: `cmd(label,
commands)` sends a real `Command[]` through the same path the tools use
  (funds/milestone/overlap all still enforced), `setTool`, `setSpeed`,
  `setOverlay`, `setCamera(x, z, distance, yaw?, pitch?)`, `setDayT(t |
null)` to pin lighting for a screenshot instead of waiting on the sim
  clock, and `screenToTile(sx, sy)` for the inverse when a harness does
  need to click somewhere specific.
- **Structural read-backs**, each named for what it answers and each
  commented with _why a screenshot alone can't answer that question_ —
  this comment-per-method is itself a convention worth following if you add
  one: `readGrid()` (per-tile road/zone/water/height/power arrays),
  `readTransit()` (lines + ridership), `readBuildings`, `readKit`/`readKitIds`
  (which archetype kit parts actually built — "a silhouette claim is
  exactly the kind a screenshot cannot settle on its own"), `readParking`
  (stall occupancy — "a parked car and a moving one look alike in a shot"),
  `readJunctions`, `readApproach`, `readLampPoles`, `readPowerPoles`,
  `readCabinets`, `readFurnitureCounts`, `readKerbAudit`, `readDrawn`, and
  `readEmptyDraws()` — meshes that would submit a zero-vertex or
  zero-instance draw call, which WebGPU warns about without naming the
  culprit.
- **Fixed reference values** a harness needs to convert tiles to world
  units without hardcoding a figure that drifts: `tileMeters()`.
- `audio: { engine, music }` — the live audio engine/player instances,
  because "audio can only be judged in a real browser (jsdom has no WebAudio
  and no playback)" (`main.ts`'s own comment), so `tools/audio-check.mjs`
  drives real playback through this handle.

**If you add a new piece of state a harness might need to verify, add a
`read*` method here rather than inferring it from a screenshot** — that is
the established idiom, and every existing one names precisely the thing a
picture cannot settle on its own.

## `tools/*-shots.mjs`: the visual harnesses

Playwright scripts, run with `node tools/<name>-shots.mjs [url] [outDir]`
against a running `npm run dev` server. The shared shape, from
`tools/visual-smoke.mjs`: launch headless Chromium with WebGPU flags
enabled, capture `console`/`pageerror` events into a log, navigate to the
app, wait for `#viewport canvas`, drive the game via keyboard hotkeys and
`window.__slimcity.cmd`/`setCamera`/`setDayT`, and screenshot after each
step into `outDir`. Output lands in a matching `tools/shots-<name>/`
directory, which is gitignored (`tools/shots-*/*.png` etc. in
`.gitignore`) — the harness scripts are tracked, their captured images
never are.

There is one harness per feature area — `archetype-shots.mjs`,
`bridge-shots.mjs`, `corridor-shots.mjs`, `junction-shots.mjs`,
`lamppower-shots.mjs`, `oneway-shots.mjs`, `powerline-shots.mjs`,
`roadslope-shots.mjs`, `tram-shots.mjs`, `transition-shots.mjs`, and about
a dozen more — rather than one generic harness with flags, matching the
one-system-per-file convention in `src/render/`.

**Using one to debug a render issue:** run the matching harness (or write a
new one following the pattern above if none exists for the area), open the
resulting PNGs, and look. A harness exiting 0 with no console errors is not
evidence the render is correct — only a look at the image is. This is the
same rule stated from the testing side in
[testing.md](testing.md#screenshots-not-read-backs); this document is the
"how," that one is the "why."

## `tools/audio-check.mjs`: the audio-specific case

Audio cannot be judged from a screenshot at all, and cannot be tested under
Vitest either — jsdom has no WebAudio and no real playback, which is why
the unit tests that do exist for audio drive fakes. `audio-check.mjs`
generates its own throwaway WAV tone, drops it where the manifest expects
player-supplied songs, and drives the real `AudioContext` through
`window.__slimcity.audio` in a real browser to confirm the context
unlocks on a gesture, the ambient mix runs, mute reaches the master gain,
and a dropped-in song is discovered and plays.

## What this means for a change you're making

- Touching `src/render/*` or `src/app/audio.ts`/`music.ts`: run the
  matching harness and look at its output before calling the change done,
  regardless of whether `npm test` is green.
- Needing to verify sim-side state without a UI action to trigger it: reach
  for `window.__slimcity.cmd(...)` plus the relevant `read*` method rather
  than clicking through the UI by hand — it's deterministic and
  scriptable.
- Adding a new harness: follow `tools/visual-smoke.mjs`'s shape (console
  capture, `waitForSelector('#viewport canvas')`, a `shot(name)` helper)
  and put its output directory under the `tools/shots-*` gitignore pattern.
