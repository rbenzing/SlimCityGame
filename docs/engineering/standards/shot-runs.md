# Shot series

How the game is photographed for review: what a series is, the views every subject gets, what a run may cost, and how to run one. A frame is evidence; a tool that exits 0 proves nothing until its frames have been looked at ([testing.md](testing.md#screenshots-not-read-backs)).

## What a series is

A **series** is one file that photographs one family of related things: the kits of one service, one class of road piece, one zone's buildings. It states its purpose, lays its scene with the game's own commands, and names its subjects. The views come from the standard below, never from hand-placed cameras.

- One family a series. A frame that belongs to another family moves there; a series is not a place to park a check that had nowhere to go.
- A series says what a reviewer judges in it, in one sentence (`purpose`). A series with no purpose a reviewer could fail is deleted.
- A series plops its subjects in a sandbox with the simulation paused. Only the `town` type grows anything.
- A measurement is not a series. Frame time, memory, growth figures and sound are probes; they write numbers, not frames.

## Types

| Type | What is judged | Series |
| --- | --- | --- |
| `roads` | The carriageway itself: surface, kerbs, paint, how pieces meet | classes, bends, junctions, ends, grade (bridges, ramps, interchanges, cut and fill) |
| `street` | What stands on and beside a street | furniture, power, transit |
| `zoned` | What zones grow, level by level | homes, apartments, shops, works, lots, building life |
| `civic` | What the player places | health, schools, first services, utilities, depots, parks, airport, farms |
| `views` | How the game shows itself | lenses, underground, night, ghosts, narrow windows |
| `town` | Everything at once, in one small grown town | town |

A new family goes in the type that names what a reviewer judges. A seventh type needs a rule here first.

## The views every subject gets

A series lists subjects; the runner takes every view in the subject's set. A view is never skipped because the face is plain: the plain rear of a building is how a missing wall is found.

| Subject | Views | Frames |
| --- | --- | --- |
| A building or plot | `above`, `front`, `rear`, `left`, `right` | 5 |
| A road piece | `above`, `along` (low, down the centreline), `oblique` | 3 |
| A lens or panel | `full` | 1 |
| The series | `night`: its first subject, front three-quarter, at 22:00 | 1 |

- `front` is the street side. A view frames the whole subject with a margin of a tenth of the frame, from the subject's footprint and height.
- A **detail** is a frame the set cannot give: a doorway at 40 m, a stall row from straight above. It is declared with what it shows, and a series has at most two a subject.
- A frame is named `<subject>-<view>.png`, a detail `<subject>-<what>.png`, in `tools/shots/out/<series>/`. A doc cites a frame as `<series>/<frame>`.

## What a run may cost

| Limit | Value |
| --- | --- |
| One series, on an idle machine | 120 s |
| A full run, three series at a time | 15 minutes |
| A fixed wait | 1 s, and only where no condition exists |

- The runner fails a series that runs over one and a half times its limit, and prints the seconds of each.
- Wait on a condition: the subject standing, the frame drawn, the clock at an hour. Set the clock; never wait for it.
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

A name is a type or a series. The runner prints one table when it ends: series, type, exit code, seconds, frames. It exits non-zero if any series failed, ran over, or wrote no frame. Never edit `src/` while a run is going: the server reloads the page under it.

## Adding or changing a series

- Copy the smallest series of the same type in `tools/shots/series/<type>/`.
- Before cutting a frame, look for its citation: `grep -rn "<series>/<frame>" docs`.
- Shared work belongs in `tools/shots/lib/`: opening the game, finding flat ground, laying a street, placing and checking subjects, the views. A series holds data and details, not setup.

**Code:** `tools/shots/run.mjs` the runner; `tools/shots/lib/series.mjs` the series and its runner, `views.mjs` the views, `site.mjs` the ground and the street, `session.mjs` the page, `camera.mjs` the camera and `cleanShot`.
