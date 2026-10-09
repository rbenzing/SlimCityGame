# Interchanges — technical design

- **Status:** Built 2026-09-30
- **Date:** 2026-09-30
- **Author:** Claude, for the ROADMAP's road-composition pieces

## What we are building, and why now

An Interchange tool that lays a diamond, a partial cloverleaf or a full
cloverleaf on a motorway already there, in one click and one undo. It is the
first of the three road-composition pieces the ROADMAP lists as not built,
and the player chose it first and chose all three forms
([design](../../game-design/features/interchanges.md)).

## What it touches

| Module                             | Change                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `src/shared/interchange.ts`        | New. The site, the layout, the refusal and the commands, all pure. |
| `src/tools/tools.ts`               | The `interchange` tool: hover preview, click to lay.               |
| `src/shared/types.ts`              | `ToolId` gains `interchange`.                                      |
| `src/ui/categories.ts`, `AssetDrawer.tsx` | The Interchange card in the Highway tab.                    |
| `src/ui/InterchangeToolOptions.tsx`, `store.ts` | Its options row: form and crossing road.              |
| `src/main.ts`                      | The env reader over the client grid, and the options wiring.       |
| `src/world/grid.ts`                | `isRoadBuildable` reads only size, height and water.               |

Neither the **save format** nor the **worker protocol** changes. The stamp is
a batch of ordinary `buildRoad` commands.

## The design

Nothing is stored. An interchange is the roads it lays, and once laid it is
those roads and nothing else: no record of it survives, and the grid cannot
tell a stamped diamond from one drawn by hand.

### The site

`readInterchangeSite(at, ground)` reads the carriageways across the motorway
on the hovered tile's row. They are the run of motorway tiles on that row
whose flow runs along the same axis, grouped by direction. A six-lane
carriageway laid across two tiles is one group. The site is one group, or
two running opposite ways with each one's driver's right facing away from the
other. Anything else is refused with the reason.

### The frame

Each carriageway is laid out in its own frame:

- `u` counts columns outward on the driver's right, 0 being the column beside
  the carriageway;
- `v` runs along it, positive downstream, 0 being the street's row.

Every ramp is a list of corners in that frame. A two-carriageway motorway's
second half is the first read in its own frame, which turns it half round:
the right-hand rule and the frame between them put each exit and entrance on
the outer side, where it belongs.

### The street

- **Deck.** `interchangeDeck(tier)` is `overpassRise(tier, Highway)`, rounded
  up to `ROAD_ELEVATION_STEP_M`. That is 6 m for a two-lane or four-lane road.
- **Laid out above sea level.** Over the carriageways the surface stands the
  deck above the highest of their tiles. Out from each side it comes down
  `BRIDGE_MAX_GRADE` a tile until it meets the ground. Each tile's lift is
  that surface less its own ground. Laid out as lifts above each tile, the
  first browser check broke the bridge into pieces on uneven ground: a lift
  step of 2 m plus the ground's own fall is more than a grade step, and two
  decks that far apart do not join.
- **Where it meets the ground.** On flat ground the first column out at
  ground level is `g = deck / BRIDGE_MAX_GRADE − 1`, which is 2 for a 6 m
  deck. Where the ground falls away, that side's `g` is the first column at
  or past it where the surface has met the ground. It can be up to
  `FALLING_GROUND_TILES` (4) further out, and that side's ramps and junctions
  move out with it.
- **On past.** It runs on two tiles beyond the outermost junction, so every
  junction is a crossing and not a dead end.
- **Heights are given, not solved.** The street's heights go to the worker
  as exact elevations.

### The ramps

Corners in `(u, v)`, for one carriageway, `R = RAMP_REACH_TILES = 8`:

| Ramp        | Corners                                   | Joins the motorway | Meets the street |
| ----------- | ----------------------------------------- | ------------------ | ---------------- |
| diamond off | (0,−R) (0,−2) (g,−2) (g,−1)               | its start, at v=−R | at u=g           |
| diamond on  | (g,1) (g,2) (0,2) (0,R)                   | its end, at v=R    | at u=g           |
| loop on     | (g+1,−1) (g+1,−4) (0,−4) (0,−1)           | its end, at v=−1   | at u=g+1         |
| outer off   | (0,−R) (0,−6) (g+3,−6) (g+3,−1)           | its start, at v=−R | at u=g+3         |
| loop off    | (0,1) (0,4) (g+1,4) (g+1,1)               | its start, at v=1  | at u=g+1         |
| outer on    | (g+3,1) (g+3,6) (0,6) (0,R)               | its end, at v=R    | at u=g+3         |

- **Diamond:** diamond off and diamond on.
- **Partial cloverleaf:** outer off and loop on upstream, diamond on
  downstream. The loops take the two left turns onto the motorway.
- **Full cloverleaf:** outer off, loop on, loop off and outer on.

**Ground level, exactly.** Every ramp is laid at lift 0, given exactly. A
ramp left to solve its own profile climbs to meet the street's approach
beside its end, which joins the bridge instead of the motorway. This was
found in the first probe.

**The rules the layout keeps**, each a test:

1. Every ramp is one line of neighbouring tiles, on no tile twice.
2. No ramp stands on the motorway or the street, and no two ramps touch.
   Ramps side by side would join.
3. A ramp meets the street only at its end, where the street is on the
   ground. Anywhere else a ramp passes the street, the street is more than a
   grade step up, and passes by without meeting it.
4. An exit joins the motorway at its start and an entrance at its end, on
   the column beside it, running its way.

### The refusal

`interchangeRefusal(site, layout, ground)` returns the first reason, or null:

- the motorway does not run straight, with the flow the site read, for
  `R + 1` tiles either side;
- it has a ramp, a junction or a bridge inside that reach;
- a tile the interchange takes holds a road;
- a tile holds a building or water, or is too steep for a road
  (`isRoadBuildable`);
- a road outside the interchange touches a ramp, or the street anywhere but
  its two ends;
- the ground falls away so steeply that the street has not met it where a
  ramp meets the street;
- two neighbouring tiles of the bridge are more than a grade step apart;
- the ground brings a ramp to within a grade step of the street beside it,
  anywhere but the ramp's end, where they would join.

The tool asks it in the preview and again at commit, and sends nothing if it
refuses. Batches are not atomic
([ROADMAP Open](../../ROADMAP.md)), so the world laying half an interchange
is prevented the only way it can be: by not sending one that would fail.

### The commands

`interchangeCommands(layout, tier)` is one batch:

1. the street, first, so the ramps find it to meet;
2. then every ramp, as a `Ramp` `buildRoad`.

The worker lays each by its existing rules, and refuses anything they refuse.
The street crosses the motorway on the over layer as any overpass does. The
batch's inverse is every command's inverse, so one undo takes the whole
interchange away.

### The tool

`interchange` is a tool of its own, not a road tier.

- **Preview.** Hovering a tile reads the site, lays out the chosen form and
  previews every tile of it, the street at its deck heights.
- **Label and cost.** The chip names the form and quotes the cost:
  - the street's tiles at its tier's price;
  - its bridge at `BRIDGE_COST_PER_METER_TILE` for each metre of lift;
  - each ramp's tiles at the ramp's price.
- **Refusal.** Anything refused is red, with the reason.
- **Laying.** A click commits the batch under the label "Diamond
  interchange", "Partial cloverleaf" or "Cloverleaf".

Its options row, beside the cards, picks:

- the **form**: Diamond, Partial cloverleaf, Cloverleaf;
- the **crossing road**: Two-lane or Four-lane.

The store holds both and hands them to the tool. The drawer's road options,
drawing mode and elevation, do not apply, and are not shown.

## What could go wrong

- **Weaving on a cloverleaf.** The loop joining before the bridge and the
  loop leaving after it are two tiles apart, so their auxiliary lanes
  overlap. The drawing takes the nearer junction's lane on each tile. A real
  cloverleaf with this much weave would have a collector-distributor road,
  which is out of scope.
- **Uneven ground.** The street's surface is laid out above sea level, and
  the refusal checks the joins the ground could break. The worker levels the
  ground under the ramps and the street's at-grade tiles as it lays them, which
  moves a tile's ground after the layout read it; the bridge's joins keep a
  millimetre of tolerance, and nothing more.
- **An existing street on the row.** Only the street's two ends may meet a
  road already there. One further in is refused rather than laid through.

## Alternatives

- **A stored interchange object.** Rejected. It would need a save version
  and a second truth beside the roads, and bulldozing one ramp would have to
  decide what happens to it.
- **Ramps left to solve their own heights.** Rejected, for the reason above.
- **Free-form curved loops.** The loops would be round rather than square,
  but a free road does not yet join a grid ramp alongside a motorway. The
  square loop encloses the 40 m radius the design speed needs.

## How we will know it works

- **Unit tests** (`src/shared/interchange.test.ts`):
  - the site: one and two carriageways, left-hand carriageways, not a motorway;
  - the diamond's exact tiles and heights;
  - the four layout rules above, for every form;
  - a single carriageway;
  - a slope: the bridge one road a grade step a tile, clearing the motorway,
    and the downhill side's ramps further out;
  - every refusal, the ground's included, and the street's ends meeting a
    road.
- **Worker tests** (`tests/interaction/interchanges.test.ts`), for every
  form, laid through the real commands:
  - all eight movements route: onto each carriageway from each side of the
    street, and off each to each side;
  - straight across stays on the street, and straight down stays on the
    motorway;
  - one undo puts the grid back exactly.
- **Tool tests:** the preview's refusal, label and cost, and commit sending
  nothing when refused.
- **Looked at in a browser:** each form on a motorway on uneven ground, from
  above and at an angle to see the bridge, laid through the drawer's card and
  its options.

## Out of scope

- Collector-distributor roads and motorway-to-motorway interchanges.
- An interchange placed anywhere but a motorway already laid, or at an angle
  to it.
- Signals at the terminals by default: they take controls by warrant, as any
  junction does.
