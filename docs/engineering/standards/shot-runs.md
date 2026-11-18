# Running the shot tools

How to run every `tools/*-shots.mjs` harness at once, and what a frame must do to stay in a tool. What each harness is for is in [debugging.md](debugging.md).

## Run them

Start one dev server, then:

```
npm run shots -- http://localhost:5173
npm run shots -- http://localhost:5173 roadmatrix bend
npm run shots -- --list
```

A tool is named without its `-shots.mjs` ending.

| Option | Default | What it does |
| --- | --- | --- |
| `--shards N` | 3 | Tools run N at a time against the one server, longest first |
| `--timeout S` | 600 | Seconds a tool may take; a tool's own limit is in the table at the top of `tools/shots.mjs` |
| `--list` | | Prints the tools and exits |

The runner prints one table when it ends: tool, exit code, seconds, frames written. It exits non-zero if any tool failed, timed out or wrote no frame.

A full run writes about 850 frames. On a machine doing nothing else it takes under half an hour; other work on the machine slows it, because several tools wait on the simulation's clock.

- Run `services-shots`, `town-shots` and `tramway-shots` on their own when the machine is busy: they wait for the town to grow and for the clock to reach night, and starve under load.
- `services-shots` prints its stall figure as a warning. Pass `--strict-stall` to fail the run on it.
- Never edit `src/` while a run is going: the server reloads the page under the tool.

## What a frame must do

- **Show a fault if there is one.** A frame aimed at grass, cut off by the edge, hidden behind a panel, or too dark or too far to judge is fixed or removed.
- **Earn its place.** Where two frames show one subject from one side, keep the one that shows more. An oblique view stays only where height matters.
- **One night frame a kit family**, not one a building: night shows lit panes and the shared tint, and both are the same across a family.
- **Keep the name a doc cites.** Before cutting a frame, look for it: `grep -rhoE "shots-[a-z-]+/[A-Za-z0-9._-]+" docs`.
- **Lay what a player would.** A harness uses the game's own commands and checks they were accepted (`cleanShot` in `tools/shotcam.mjs`). Two rail rows laid side by side with joining on drew as rings, and a review read it as a fault in the game.
- **Wait on a condition, not a clock.** A fixed wait over 5 s is replaced by a wait on what it stands for: homes grown, a vehicle on its line, the clock at an hour.

## Adding a tool

Add its last known duration to the table in `tools/shots.mjs`, so the shards stay balanced. A tool that needs longer than the default limit says so there.
