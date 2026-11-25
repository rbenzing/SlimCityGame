# Shot series

How the game is photographed for review: what a series is, the views every subject gets, what a run may cost, and how to run one. A frame is evidence; a tool that exits 0 proves nothing until its frames have been looked at ([testing.md](testing.md#screenshots-not-read-backs)).

## What a series is

A **series** is one file that photographs one family of related things: the kits of one service, one class of road piece, one zone's buildings. It states its purpose, lays its scene with the game's own commands, and names its subjects. The views come from the standard below, never from hand-placed cameras.

- One family a series. A frame that belongs to another family moves there; a series is not a place to park a check that had nowhere to go.
- A series says what a reviewer judges in it, in one sentence (`purpose`). A series with no purpose a reviewer could fail is deleted.
- A series plops its subjects in a sandbox with the simulation paused. Only the `town` type grows anything.
- A subject's size is read from the catalog, never typed into a series.
- A measurement is not a series. Frame time, memory, the road audit, a click-through of the interface and sound are probes (`tools/probes/`, `npm run probes`): they write numbers, not frames, and fail on a number. A check that needs pixels or page layout stays in its series as a `check` beside the frame it reads.

## Types

| Type | What is judged | Series |
| --- | --- | --- |
| `roads` | The carriageway itself: surface, kerbs, paint, how pieces meet | classes, paint, bends, edges, junctions, changes (one road becoming another), ends, grade (bridges, ramps, the interchange, slopes) |
| `street` | What stands on and beside a street | furniture, stops, supply (pole lines, buried cable, a substation's feed), transit |
| `zoned` | What zones grow, every kind at each level | homes, attached, apartments; shops, plazas, roadside, offices, downtown; works, stores, plants, heavy; the three stacked series |
| `civic` | What the player places | health, schools, safety, power, utilities, depots, parks, airport, farms |
| `views` | How the game shows itself | underground, night, ghosts, panels (narrow windows, the services panel, the way out of a view), water (ocean, lake, river and a river's mouth, on the first generator's map with a dug canal), watercoast (the same frames on a coast map's own river), coast (a coast map: beach, river mouth, valley, lake, a bridge, a first town, the sea past the edge, and six seeds' whole maps drawn from the generator's arrays, since the camera cannot rise high enough to show one) |
| `town` | What only a running town shows | town (district by district), lenses, life (a building going up and standing derelict), lots (curved streets, yards, a cul-de-sac), circles (an offset and a centred cul-de-sac with homes grown round them), firstgame (a new game through the interface) |

A new family goes in the type that names what a reviewer judges. A seventh type needs a rule here first. A series' name is its folder of frames, so no two share one, whatever their types: the runner refuses to start when two do.

## The views every subject gets

A series lists subjects; the runner takes every view in the subject's set. A view is never skipped because the face is plain: the plain rear of a building is how a missing wall is found.

| Subject | Views | Frames |
| --- | --- | --- |
| A building or plot | `above`, `front`, `rear`, `left`, `right` | 5 |
| A road piece | `above`, `along` (low, down the centreline), `oblique` | 3 |
| A run of street with things on it | the road piece's three, and a detail for a single object | 3 |
| A lens, a panel, a step of play | `full`: the page as the player sees it, after its `setup` | 1 |
| A district of the grown town | `above`, `oblique` | 2 |
| The series | `night`: its first subject at 22:00, the front view turned 30° | 1 |

- `front` is the street side; `left` and `right` are the viewer's own, standing at the front.
- A view frames the subject's footprint, 10 m of ground round it and its height, with a tenth of the frame clear at every edge and a further tenth above the bottom bar.
- A road piece is framed by what is judged, as close as it fits: a junction's box and two tiles of each arm, a change's seam and three tiles each way, an end and its last three tiles, a span and its abutments.
- A top is never cut. Where a model stands above its catalog height (a stack, a mast, a turbine's blade) the drawn top is listed in `tools/shots/lib/tops.mjs`; every entry there is a fault in the catalog's height.
- A plot wider than the camera can frame is taken in named parts (`parts`), each with `above`, `front` and `rear`. The runner refuses a view it cannot frame.
- Subjects stand far enough apart that no neighbour is between a camera and its subject.
- Every series ends by laying its frames on **sheets**, one row a subject and one column a view, subjects of a single frame five to a row: `sheet-<n>.png` beside the frames. A reviewer opens the sheets first, and a frame where a sheet shows something.
- A **detail** is a frame the set cannot give: a doorway at 40 m, a stall row from straight above. It is declared with what it shows, and a subject has at most two; the runner refuses a third.
- A frame is named `<subject>-<view>.png`, a detail `<subject>-<what>.png`, in `tools/shots/out/<series>/`. A doc cites a frame as `<series>/<frame>`.

## What a run may cost

| Limit | Value |
| --- | --- |
| A plopped series, as the runner runs it | 60 s; the slowest takes 28 s for 98 frames |
| A `town` series | 300 s; the slowest takes 76 s |
| A full run, two series at a time | 15 minutes; 45 series and 1,875 frames take 7 to 8 |
| A fixed wait | 1 s, and only where no condition exists |

- A series declares its budget (`budgetS`). One over its budget is printed `slow` and fails the run; one at three times its budget is taken for hung and killed.
- Two series run at a time, the largest first. Three at once fill the graphics card and every frame takes four times as long.
- Wait on a condition: the subject standing, the frame drawn, the clock at an hour. Set the clock (`pinDay`); never wait for it. A paused simulation does not relight the scene by itself.
- One page a series. Scenes stand side by side on one map and the camera moves; a series never reloads the page for its next subject.
- A `town` series grows its own town once: the interaction tests' town (`tests/support/town.ts`), grown in the page, saved and loaded as the Load Game menu does. A building under construction cannot be saved, so `life` grows live and holds each stage.
- Lay what a player would, and check it was accepted (`cleanShot`). Two rail rows laid side by side with joining on drew as rings, and a review read it as a fault in the game.

## Run them

Start one dev server, then:

```
npm run shots -- http://localhost:5173
npm run shots -- http://localhost:5173 civic
npm run shots -- http://localhost:5173 health bends
npm run shots -- --list
```

A name is a type or a series; a series also runs alone, `node tools/shots/series/civic/health.mjs <url>`. The runner prints one table when it ends: series, type, exit code, seconds, frames, sheets. It exits non-zero if any series failed, ran over, or wrote no frame or no sheet. Never edit `src/` while a run is going: the server reloads the page under it.

A series draws without the bloom pass unless its session asks for it (`bloom: true`, as `water` does, since the water reads the frame the pass draws); `SHOTS_BLOOM=1` asks for it in any series. `SHOTS_WEBGL=1` hides WebGPU, so the page takes its WebGL2 backend.

**Which backend a series runs on.** Every series runs on WebGPU, the backend players' browsers use, in full Chromium `[R-process-011]`. The bundled headless browser cannot give the page a WebGPU canvas and falls back to WebGL2 without saying so in the frame, which is how a mesh WebGPU refused once shipped unseen. `webgl2: true` on a session, or `SHOTS_WEBGL=1` for any series, takes the fallback on purpose; `panels` does, so the fallback stays exercised. A run that cannot get WebGPU fails. On either backend a console error from the renderer, or a GPU validation error, fails the series with the message.

The runner prints a `page:` block for each series: backend, graphics adapter, console errors and GPU warnings. Full Chromium takes the integrated card where a machine has two, as a player's Chrome does; `SHOTS_DISCRETE_GPU=1` asks for the discrete one. A loaded town is paused before the page waits on anything, or it ages while the series looks for what grew. A settle waits for the page's queued street work before it counts frames.

## Adding or changing a series

- Copy the smallest series of the same type in `tools/shots/series/<type>/`.
- Before cutting a frame, look for its citation: `grep -rn "<series>/<frame>" docs`.
- Shared work belongs in `tools/shots/lib/`: opening the game, finding flat ground, laying a street, placing and checking subjects, the views. A series holds data and details, not setup.

**Code:** `tools/shots/run.mjs` the runner; `tools/shots/lib/series.mjs` the series and its runner, `views.mjs` the views, `site.mjs` the ground and the street, `session.mjs` the page, `camera.mjs` the camera and `cleanShot`, `sheet.mjs` the sheets, `tops.mjs` the drawn tops; `roads.mjs`, `civic.mjs` and `zoned.mjs` each type's scenes.
