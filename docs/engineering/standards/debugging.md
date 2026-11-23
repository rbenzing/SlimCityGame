# Debugging

Three real tools exist for inspecting a running game: a dev-only structural
read-back surface on `window`, the shot series that photograph the real app
in a real browser, and the probes that measure it there. None is a debugger
in the traditional sense — they exist because of the standing project rule
in [testing.md](testing.md#screenshots-not-read-backs): **render correctness
is judged by looking at a screenshot, not by an assertion passing.** These
tools are how that looking happens without doing it by hand every time.

## `window.__slimcity`: the dev read-back surface

Wired in `src/main.ts`, gated by `import.meta.env.DEV` in two places (so it
is entirely absent from a production build): once early, right after the
camera rig attaches, and again later once `screenToTile` exists. It exposes
functions a series, a probe or a developer can call from the page (via
`page.evaluate()` in Playwright, or the DevTools console by hand):

- **Deterministic input**, bypassing screen-space picking: `cmd(label,
commands)` sends a real `Command[]` through the same path the tools use
  (funds/milestone/overlap all still enforced), `setTool`, `setSpeed`,
  `setOverlay`, `setCamera(x, z, distance, yaw?, pitch?)`, `setDayT(t |
null)` to pin lighting for a screenshot instead of waiting on the sim
  clock, and `screenToTile(sx, sy)` for the inverse when a series does
  need to click somewhere specific.
- **Structural read-backs**, each named for what it answers and each
  commented with _why a screenshot alone can't answer that question_ —
  this comment-per-method is itself a convention worth following if you add
  one: `readGrid()` (per-tile road/zone/water/height/power arrays),
  `readTransit()` (lines + ridership), `readBuildings`, `readKit`/`readKitIds`
  (which archetype kit parts actually built — "a silhouette claim is
  exactly the kind a screenshot cannot settle on its own"), `readHouseKit`,
  `readHousePlan` and `readHouseCars` (what a home's lot holds and where —
  a trampoline too small to pick out, or a car tucked behind the house),
  `readParking` (stall occupancy — "a parked car and a moving one look alike
  in a shot"),
  `readJunctions`, `readApproach`, `readLampPoles`, `readPowerPoles`,
  `readCabinets`, `readFurnitureCounts`, `readKerbAudit`, `readDrawn`, and
  `readEmptyDraws()` — meshes that would submit a zero-vertex or
  zero-instance draw call, which WebGPU warns about without naming the
  culprit.
- **Fixed reference values** a series needs to convert tiles to world
  units without hardcoding a figure that drifts: `tileMeters()`.
- `audio: { engine, music }` — the live audio engine/player instances,
  because "audio can only be judged in a real browser (jsdom has no WebAudio
  and no playback)" (`main.ts`'s own comment), so
  `tools/probes/audio-check.mjs` drives real playback through this handle.

**If you add a new piece of state a series might need to verify, add a
`read*` method here rather than inferring it from a screenshot** — that is
the established idiom, and every existing one names precisely the thing a
picture cannot settle on its own.

## The shot series: what the library guards

What a series is, the views a subject gets and how to run one are in
[shot-runs.md](shot-runs.md). `tools/shots/lib/` holds what every series
shares, and four of its guards explain most failed runs:

- `cleanShot` takes every frame. The game answers a refused command only
  with a toast titled "… failed", so it reads the toasts first and **fails
  the run when one says a command failed**: a frame of a town that was never
  built proves nothing. A frame that is _about_ a refusal passes
  `{ allowRefusal: /pattern/ }`.
- A subject that is not standing, or a view the camera cannot frame, fails
  the series by name. A frame named for a thing shows that thing.
- `pinDay` sets the hour of the light. A paused simulation sends no
  snapshot, so it sends one command and waits for it; `setDayT` alone
  leaves a night frame lit as day.
- The session saves the options `unlimitedMoney` and `sandboxUnlockAll`
  before the page loads. The `setUnlimitedMoney` command alone leaves the
  red debt badge in every frame, and a tool locked behind a milestone does
  nothing on a click.

A series that fails on a refusal has a layout the game's rules have moved
past. Fix the layout; never loosen the guard.

Three things the hooks do that a series must allow for:

- `setVehicles` and `setIncidents` last until the next snapshot. A command
  sent after them clears what they stood; stand it again before the frame.
- Lamps light only on a powered street. A night frame needs a power source
  in its layout.
- A tool with no command of its own, such as the Interchange tool, is driven
  with `setTool` and real pointer input. Never copy its layout into a
  series: the copy is a second source of truth, and its faults read as the
  game's.

**Using one to debug a render issue:** run the series of the family
(`npm run shots -- <url> <series>`), open its sheets, then the frame, and
look. A series exiting 0 with no console errors is not evidence the render
is correct — only a look at the image is.

**Do not edit `src/` while a series is running.** Vite hot-reloads the
page, which drops `window.__slimcity` and the city built on it; the run
dies partway through with a hook that is suddenly undefined, and the frames
it did write are of a half-built map.

## The probes: numbers a picture cannot give

`tools/probes/` holds measurements that need the real browser and write
numbers, not frames. Each prints what it measured and exits non-zero when a
check fails. `npm run probes -- <url> [name ...]` runs them one at a time.

### `road-audit`: is a road the same road all the way along it?

It lays every laying tier in every topology a road goes down in — straight
run, right-angle turn, tee, crossroads with itself and with a different
class, a raised viaduct — and measures what came out.

What makes it different is where it takes its numbers. `readApproach` and
`readDrawn` ask what the cross-section _is_; `readPaint` asks how wide the
asphalt and the paint on it actually _came out_, by re-deriving the bands
from the chunk's vertex buffer. A band that steps in and out along a run
answers the first question correctly the whole way down. Three things are
checked: every plain tile of a run lays an identical section; no band's
edge moves more than its tolerance between neighbouring tiles, over the
whole run _including_ the junction approaches and end caps the first check
has to excuse; and the grid and the mesh agree about what is being drawn.

Two things it deliberately does not treat as defects. A run's own end tiles
and the tiles near a junction are excluded from the uniformity comparison,
because a taper, a turn pocket and a turnaround are cross-sections the road
is supposed to have for a few tiles and nowhere else. And an overpass is
_asked for_ and is either crossed over or refused whole (see
[../../world-sim/overpasses.md](../../world-sim/overpasses.md)): crossed
over means the crossing tile carries the deck on its over layer and the
road beneath is still exactly the road that was there; refused means no
tile of the deck stands in the air.

### `corner-map`: what a corner actually looks like

Where a SMALL road meets a BIG one, what do the kerb, the footway and the
paint do at the corner? `readPaint` only sees bands that run a tile's whole
length, and a kerb return is a couple of metres of corner that reaches no
tile edge — so the piece of geometry most often reported wrong was the one
no read-back could see, leaving a screenshot at a shallow angle, which has
been misread repeatedly. `readSurface` samples the mesh point by point and
reports the topmost surface over each, which draws the corner as a picture
made of numbers: `#` footway, `.` asphalt, `W`/`Y` paint, blank where the
terrain shows through.

It also answers the pedestrian question mechanically. Flood-filling the
footway cells into patches turns two claims into pass/fail. **Corners:** the
footway arriving on one edge must be the same patch as the footway arriving
on the next, or somebody walking round the corner steps into the road.
**Access mouths:** the pavement on the side an ALLEY joins must be one patch
from edge to edge, because the footway runs past an access rather than
breaking for it. A footway severed by an ordinary road is correct — that is
what a crossing is for. The counts are printed so a vacuous pass ("0 corners
checked") cannot be misread as a real one.

Print the junction's control before reading anything into a missing marking.
An arm that gives way carries the crossing and the stop bar and an arm
running through carries neither, a signal holds every arm, and an
uncontrolled crossroads is painted not at all — so "no crossing on this arm"
is usually the rule working, not a defect.

### The others

| Probe | What it measures |
| --- | --- |
| `frame-budget` | Frame time and draw calls over a synthetic Metropolis, by day and night ([performance-budget.md](../performance-budget.md)) |
| `stall` | The longest read-back from the page while a grown town runs at 4× |
| `memory-probe` | Heap growth over a run |
| `growth-probe` | What the growth pass did, as numbers |
| `playthrough` | A new game played through the real interface: each click must change the world the way it promised ([testing.md](testing.md)) |
| `visual-smoke` | The app boots and answers its hotkeys with no page error |
| `audio-check` | The audio context unlocks on a gesture, the ambient mix runs, mute reaches the master gain, and a dropped-in song plays. jsdom has no WebAudio, so nothing else can check it |

A taper's edge line against a moving kerb was a probe and is now a test
(`src/render/roadtaperedge.test.ts`). Its lesson stands for any new probe:
scan at a centimetre where the thing measured is 0.15 m wide — a first
attempt at ten centimetres reported the line MISSING on half the tiles,
which was the sampling and not the road.

## What this means for a change you're making

- Touching `src/render/*`: run the series of the family you touched and
  look at its sheets before calling the change done, regardless of whether
  `npm test` is green. Touching road geometry or paint: run `road-audit`
  and `corner-map` as well. Touching `src/app/audio.ts` or `music.ts`: run
  `audio-check`.
- Needing to verify sim-side state without a UI action to trigger it: reach
  for `window.__slimcity.cmd(...)` plus the relevant `read*` method rather
  than clicking through the UI by hand — it's deterministic and
  scriptable.
- Adding a visual check: add a subject to the series of its family, or a
  series ([shot-runs.md](shot-runs.md#adding-or-changing-a-series)). Adding
  a measurement: add a probe, or a test where it needs no browser.
