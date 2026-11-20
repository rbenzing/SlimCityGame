# Shot series

How the game is photographed for review: what a series is, the views every subject gets, what a run may cost, and how to run one. A frame is evidence; a tool that exits 0 proves nothing until its frames have been looked at ([testing.md](testing.md#screenshots-not-read-backs)).

## What a series is

A **series** is one file that photographs one family of related things: the kits of one service, one class of road piece, one zone's buildings. It states its purpose, lays its scene with the game's own commands, and names its subjects. The views come from the standard below, never from hand-placed cameras.

- One family a series. A frame that belongs to another family moves there; a series is not a place to park a check that had nowhere to go.
- A series says what a reviewer judges in it, in one sentence (`purpose`). A series with no purpose a reviewer could fail is deleted.
- A series plops its subjects in a sandbox with the simulation paused. Only the `town` type grows anything.
- A subject's size is read from the catalog, never typed into a series.
- A measurement is not a series. Frame time, memory, growth figures and sound are probes; they write numbers, not frames.

## Types

| Type | What is judged | Series |
| --- | --- | --- |
| `roads` | The carriageway itself: surface, kerbs, paint, how pieces meet | classes, bends, junctions, ends, grade (bridges, ramps, interchanges, cut and fill) |
| `street` | What stands on and beside a street | furniture, power, transit |
| `zoned` | What zones grow, level by level | homes, apartments, shops, works, lots, building life |
| `civic` | What the player places | health, schools, first services, utilities, depots, parks, airport, farms |
| `views` | How the game shows itself | underground, night, ghosts, narrow windows, the way out of a view |
| `town` | Everything at once, in one small grown town | town, lenses |

A new family goes in the type that names what a reviewer judges. A seventh type needs a rule here first.

## The views every subject gets

A series lists subjects; the runner takes every view in the subject's set. A view is never skipped because the face is plain: the plain rear of a building is how a missing wall is found.

| Subject | Views | Frames |
| --- | --- | --- |
| A building or plot | `above`, `front`, `rear`, `left`, `right` | 5 |
| A road piece | `above`, `along` (low, down the centreline), `oblique` | 3 |
| A lens or panel | `full` | 1 |
| The series | `night`: its first subject at 22:00, the front view turned 30° | 1 |

- `front` is the street side; `left` and `right` are the viewer's own, standing at the front.
- A view frames the subject's footprint, 10 m of ground round it and its height, with a tenth of the frame clear at every edge and a further tenth above the bottom bar.
- Subjects stand far enough apart that no neighbour is between a camera and its subject.
- A **detail** is a frame the set cannot give: a doorway at 40 m, a stall row from straight above. It is declared with what it shows, and a subject has at most two; the runner refuses a third.
- A frame is named `<subject>-<view>.png`, a detail `<subject>-<what>.png`, in `tools/shots/out/<series>/`. A doc cites a frame as `<series>/<frame>`.

## What a run may cost

| Limit | Value |
| --- | --- |
| A plopped series, on an idle machine | 60 s; the first one takes 10 s for 25 frames |
| A `town` series | 300 s |
| A full run, three series at a time | 15 minutes |
| A fixed wait | 1 s, and only where no condition exists |

- A series declares its budget (`budgetS`). The runner fails one that runs over one and a half times it, and prints the seconds of each.
- Wait on a condition: the subject standing, the frame drawn, the clock at an hour. Set the clock (`pinDay`); never wait for it. A paused simulation does not relight the scene by itself.
- One page a series. Scenes stand side by side on one map and the camera moves; a series never reloads the page for its next subject.
- Lay what a player would, and check it was accepted (`cleanShot`). Two rail rows laid side by side with joining on drew as rings, and a review read it as a fault in the game.

## Run them

Start one dev server, then:

```
npm run shots -- http://localhost:5173
npm run shots -- http://localhost:5173 civic
npm run shots -- http://localhost:5173 health bends
npm run shots -- --list
```

A name is a type or a series; a series also runs alone, `node tools/shots/series/civic/health.mjs <url>`. Tools not yet moved to a series run with `npm run shots:old`. The runner prints one table when it ends: series, type, exit code, seconds, frames. It exits non-zero if any series failed, ran over, or wrote no frame. Never edit `src/` while a run is going: the server reloads the page under it.

## Adding or changing a series

- Copy the smallest series of the same type in `tools/shots/series/<type>/`.
- Before cutting a frame, look for its citation: `grep -rn "<series>/<frame>" docs`.
- Shared work belongs in `tools/shots/lib/`: opening the game, finding flat ground, laying a street, placing and checking subjects, the views. A series holds data and details, not setup.

**Code:** `tools/shots/run.mjs` the runner; `tools/shots/lib/series.mjs` the series and its runner, `views.mjs` the views, `site.mjs` the ground and the street, `session.mjs` the page, `camera.mjs` the camera and `cleanShot`.
