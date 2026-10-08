# Water and sewage — technical design

- **Status:** Agreed 2026-10-02; pipes, the pumping station, the drain pipe and sewerage built 2026-10-02; the fouled water, the intake yield and the sewage treatment works built 2026-10-02
- **Date:** 2026-09-18, rewritten 2026-10-02
- **Author:** Claude, from the player-facing design in
  [../../game-design/features/water-and-sewage.md](../../game-design/features/water-and-sewage.md)

## What we are building, and why now

Three things on the water the city already has. A **pipe**, painted like a
power line, that carries water and sewage where the streets do not. A
**pumping station** that draws water from a shore and a **drain pipe** that
returns sewage to one, so the city's water starts and ends somewhere on the
map. And **sewage as the third utility**: every building that draws city
water makes sewage, a drain takes it, and the same network walk, supply line
and far-end cut that power and water have decide who is drained. Below
`SEWER_MILESTONE` (Big Town) the whole town is on septic tanks and makes no
sewage; from it, a lot grows only where a drain reaches, and a building
nothing drains stinks and is never abandoned for it.

Now, because the building-types epic made every `waterUse` honest, so the
water figures and the sewage that follows from them finally mean something,
and because the first draft of this design, which collected sewage by a
radius, predates both that and the player's ask for pipes.

The second change closes the loop on the water itself: a **fouling** value
on every water tile, spread along connected water from each discharge and
derived every utility pass; a **pumping station's yield** scaled by the
fouling at its intake; and a **sewage treatment works**, a drain whose
discharge carries a fraction of the raw load. The water surface tints with
the fouling, so the consequence is visible without a lens.

## What it touches

| Module                                             | Change                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                              | `GridState.waterPipe` (saved) and `GridState.sewered` (derived); `UtilitySpec.sewerKL`; `requiresAdjacent` widens to `'rail' \| 'water'`; `Problem.NoSewer`, `Problem.SewerShortage`; `Command` `layWaterPipe`; `ToolId` `water.pipe`; `LensId` `sewered`; `SimSnapshot.waterPipes`, `.sewered`; `CityStats.sewerSupply`, `.sewerDemand`; `SAVE_VERSION` 14 |
| `src/shared/constants.ts`                          | `WATER_PIPE_COST_PER_TILE`, `WATER_PIPE_UPKEEP_PER_TILE`, `SEWAGE_RETURN_FRACTION`, `UNSEWERED_POLLUTION_PER_KL`                                                                                                                                      |
| `src/world/grid.ts`                                | Allocates both layers; serializes `waterPipe` as the new trailing layer; `sewered` is derived like `roadFootprint` and never saved                                                                                                                      |
| `src/world/waterpipe.ts` (new)                     | `canLayPipe`, `layWaterPipe`, `waterPipeTiles`, `waterPipeCount`: the power line's module, for pipes                                                                                                                                                    |
| `src/sim/network.ts`                               | Pipes conduct water; `sewageOf`; a third reach and far-end cut seeded from drains, writing `g.sewered`; `UtilityTotals.sewer`; `utilityCanDeliver` for a drain                                                                                          |
| `src/sim/growth.ts`                                | Sewer in `GrowthSupply`, the spare bookkeeping and the waits; a lot grows and a building levels up only where drained, with spare drain for its sewage; `NoSewer` and `SewerShortage`; `zonedUnserved.sewer`                                              |
| `src/sim/worker.entry.ts`                          | `cmdLayWaterPipe`; bulldoze pulls pipes up; `waterPipes` and `sewered` snapshot channels; sewer stats; the water branch of the placement gate; an unsewered building's emission in the emit pass                                                        |
| `src/sim/economy.ts`                               | Pipe upkeep per tile beside the power line's                                                                                                                                                                                                            |
| `src/data/catalog.json`                            | `water-pump` (Water Pumping Station), `water-drain` (Water Drain Pipe); the water tower re-derived                                                                                                                                                      |
| `src/app/clientgrid.ts`, `src/main.ts`             | The pipe layer mirrored; the pipe overlay fed; the sewer lens and the `sewered` coverage fed                                                                                                                                                            |
| `src/render/pipes.ts` (new)                        | `PipeOverlayRenderer`: terrain-conforming strips along pipe runs, blue beside brown, shown while a water tool is in hand or a water lens is on                                                                                                           |
| `src/render/overlays.ts`                           | `CoverageKind` gains `sewered`                                                                                                                                                                                                                          |
| `src/render/utilitykits.ts`                        | Two kits: the pumping station's pump house and intake, the drain's headwall and outfall pipe, each turned to the water it touches                                                                                                                       |
| `src/tools/tools.ts`                               | The `water.pipe` tool: the power line's drag, preview and send                                                                                                                                                                                          |
| `src/ui/`                                          | The pipe card and the two buildings on the Water tab; the Sewer lens; the sewer rows in the inspector, the popover and the Advisor                                                                                                                       |
| Tests                                              | `waterpipe.test.ts`, `network.test.ts`, `growth.test.ts`, `grid.test.ts` (v13 loads with no pipes), `utilitykits.test.ts`, `pipes.test.ts`, `advisor.test.ts`, `categories.test.ts`, `tools.test.ts`; interaction `utilities.test.ts`; the small town |

The second change touches these again, and nothing new:

| Module                                 | Change                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                  | `GridState.waterFoul` (derived); `UtilitySpec.effluent`; `SimSnapshot.waterFoul`; `CityStats.waterFouled`; `SelectionInfo.intakeYield`                                                                                                     |
| `src/shared/constants.ts`              | `WATER_FOUL_PER_KL`, `WATER_FOUL_REACH_TILES`                                                                                                                                                                                                |
| `src/world/grid.ts`                    | Allocates `waterFoul` beside `sewered`; never serialized                                                                                                                                                                                     |
| `src/sim/network.ts`                   | The sewer pass runs before the water pass; each drain's discharge is its share of the sewage drained; `spreadFouling` writes `g.waterFoul`; an intake's `waterKL` is scaled by the fouling beside it; `UtilityTotals.intakeYield`, `.waterFouled` |
| `src/sim/worker.entry.ts`              | `waterFoul` snapshot channel when it changes; `waterFouled` stat; `intakeYield` on a selected intake                                                                                                                                         |
| `src/data/catalog.json`                | `sewage-works` (Sewage Treatment Works): `sewerKL`, `effluent: 0.15`, `requiresAdjacent: "water"`                                                                                                                                            |
| `src/app/clientgrid.ts`, `src/main.ts` | The fouling layer mirrored and handed to the water renderer                                                                                                                                                                                  |
| `src/render/water.ts`                  | A per-vertex `waterFoul` attribute mixed into the surface colour toward a murky brown; `setFouling(layer)`                                                                                                                                  |
| `src/render/utilitykits.ts`            | The works' kit: two clarifier tanks and a control house, with the drain's outfall pipe toward the water                                                                                                                                      |
| `src/ui/`                              | The works' card on the Water tab; the inspector's Delivers row on an intake and Effluent row on a works; the popover's water line counts what fouling cost; Advisor rule `intake-fouled`                                                       |
| Tests                                  | `network.test.ts` (spread, share, yield, order), `water.test.ts` (foul colour), `contracts.test.ts` (the works' figures), `utilitykits.test.ts`, `advisor.test.ts`, `InfoPanel.test.tsx`, `categories.test.ts`; interaction `utilities.test.ts`; the small town builds the works |

**Save format: additive.** `waterPipe` is appended as the last tile layer at
`SAVE_VERSION` 14; a v13 save loads with no pipes. `sewered` is derived on
every utility pass, as `roadFootprint` is derived from the network, so it is
not saved. A city saved before this change loads with its buildings
standing: nothing abandons for want of a sewer (the rule below), and the
Advisor says what it lacks.

**Worker protocol: additive.** One new command, `layWaterPipe`, with the
`stringPowerLine` shape and inverse; two new optional snapshot channels,
`waterPipes` (the pipe layer as `ZonePatch[]`, like `powerLines`) and
`sewered` (coverage, like `watered`); two new stats. See
[../interfaces.md](../interfaces.md).

## The design

### The pipe

```ts
// GridState. 1 where a pipe is laid. ADDITIVE layer, serialized last (v14).
waterPipe: Uint8Array;
// GridState. 1 where a drain's reach covers the tile. Derived each utility pass; never saved.
sewered: Uint8Array;

| { kind: 'layWaterPipe'; tiles: TilePoint[]; on: boolean }
```

`src/world/waterpipe.ts` is `powerline.ts` with the names changed. A pipe
may be laid on any dry tile that holds no building: under a road, across a
field, through a landfill, beside a lot. It may not cross open water (the
intake and the outfall are the buildings that meet the water) and it may not
stand on a footprint, which has its own connection. `layWaterPipe` returns
the tiles that changed, which is what the command charges for and what its
inverse puts back, so a drag back over a run costs nothing. Bulldozing a
tile pulls its pipe up with the same refund rate as a line, and the inverse
lays it back.

**Conduction.** `conductsWater` in `network.ts` becomes true for a pipe tile
as `conductsPower` is for a line tile, and `reachableNetworkTiles` takes the
"is this tile a line" predicate as a parameter so the same walk serves both:
a pipe hands water (and sewage) to the roads and pipes beside it, on the
grid or off it, and to whatever stands next to it. `mainBeside`, which
decides whether a low-density house is on the mains or a well, counts a
pipe as a main. `utilityCanDeliver` seeds a water source's or a drain's
check from pipes as well as roads.

### Sewage, the third utility

- **What a building makes.** `sewageOf(g, entry, x, z, w, d) =
  SEWAGE_RETURN_FRACTION × cityWaterUse(...)`. A house on a well is on a
  septic tank and makes none for the city; a farm makes none; nothing is
  stored, since the figure is a fraction of one the catalog carries.
- **Supply.** `UtilitySpec.sewerKL` on a drain: the sewage it takes a day.
  Summed over Active and Constructing drains into `sewerSupply`, as water
  is.
- **Reach.** `computeReach` from every drain's footprint over the tiles that
  carry water — a street whose main is also its sewer, and a pipe. The
  manhole truth already says a road that carries water carries a sewer.
- **The cut.** `cutFromTheFarEnd` writes `g.sewered` and lines the reached
  buildings up by steps from the nearest drain, nearest first, ties by id;
  the first building past the supply and every one after it loses its
  sewer. `UtilityTotals.sewer: UtilityLine` carries the cut set and the
  spare, and `sewerDemand` the running total.
- **Flags.** `Problem.NoSewer` (256) where a building that makes sewage
  stands on no sewered tile; `Problem.SewerShortage` (512) beside it where
  the network reaches it but the drains ran out. Neither is a blocker:
  abandonment still counts only `NoPower`, `NoWater` and `NoRoad`.
- **The stink.** In the worker's emit pass, an Active building carrying
  `NoSewer` emits `ceil(sewageOf × UNSEWERED_POLLUTION_PER_KL)` into the
  Pollution field at its tile, on the cadence buildings' own `pollution`
  uses: the pounds of oxygen demand its raw sewage carries a year on the
  scale the coal plant sets, and never less than one unit, so a cesspit is
  never nothing.
- **The septic era.** `sewageOf` takes the city's `milestoneLevel` and
  returns zero below `SEWER_MILESTONE`, so every sewer figure downstream is
  zero for a small town without a second switch anywhere: `recomputeUtilities`
  and `GrowthSystem.zonedUnserved` take the level as a parameter, the growth
  pass already had it, and `worker.entry.ts` passes `stats.milestoneLevel` at
  all three. A caller running no economy (the network tests) gets a sewered
  city by default. The drain's `unlockMilestone` is `SEWER_MILESTONE - 1`,
  as the works' already was, and `cityWideIssues` adds `septic-outgrown` on
  that rung while `sewerSupply` is zero.
- **Growth.** `GrowthSupply.sewer`, `Spare.sewer` and `waiting.sewer` join
  power and water. A lot spawns only where `footprintServed(g.sewered)`
  holds for a kind that makes sewage, and `spawnIfSupplied` asks
  `suppliedFor` for the sewage it adds; a level-up asks for the difference.
  A lot or building held back by sewer alone is waiting for supply and is
  counted for the Advisor like the others. `zonedUnserved` gains `sewer`:
  an empty zoned tile beside a road with no drain reaching it. All of it is
  idle below the milestone, since nothing makes sewage.

### The buildings

`requiresAdjacent` widens to `'rail' | 'water'`, the branch the
power-generation draft planned: `cmdPlaceBuilding` refuses a footprint with
no orthogonally adjacent water tile, read from `g.water`, exactly as it
refuses a station off the rails. Both new entries take it; the water tower
does not.

| id            | name                  | utility             | footprint | requiresAdjacent |
| ------------- | --------------------- | ------------------- | --------- | ---------------- |
| `water-pump`  | Water Pumping Station | `waterKL`           | 2×2       | `water`          |
| `water-drain` | Water Drain Pipe      | `sewerKL`           | 1×1       | `water`          |
| `water-tower` | Water Tower           | `waterKL` (re-derived) | 1×1    | —                |

Their figures are derived in the design document and checked by the
catalog contract test. The Water tab lists every utility entry with
`waterKL` or `sewerKL`, and the pipe card beside them with its cost per
tile, as the Electricity tab lists the power line.

### Rendering

- **Pipes are underground.** `PipeOverlayRenderer` draws each carrier as a
  strip through the tile centre, joined to the orthogonal neighbours that
  carry water (pipes, roads whose class carries water, and buildings), the
  strip split lengthwise into a blue half and a brown half, conforming to the
  terrain under the road plates. It shows only while the city is underground
  — a water tool in hand or the Water or Sewer lens on — when the surface
  goes to glass; the full view, with the mains, the leads and the risers, is
  in [underground-view.md](underground-view.md).
- **Lenses.** `LensId` gains `'sewered'` and `CoverageKind` gains
  `'sewered'`; the Sewer lens paints the drained coverage with the same
  two-tone ramp the Water lens uses.
- **Kits.** Two more entries in `UTILITY_KIT_CATALOG_IDS`. The pumping
  station is a pump house with a round intake pipe running out of its
  water-facing wall to the shore; the drain pipe a low concrete headwall
  with a pipe mouth toward the water. The kit renderer gains a `waterAt`
  lookup so each turns to the water side its footprint touches; a pure
  `waterSideOf(footprint, waterAt)` picks it, so it is testable without a
  scene.

### The fouled water

```ts
// GridState. 0..255 where water[i] === 1, 0 elsewhere: how fouled the water
// is. Derived each utility pass from what the drains discharge; never saved.
waterFoul: Uint8Array;

// UtilitySpec. The share of a drain's sewage load that reaches the water:
// absent means 1 (a raw outfall); the works carries 0.15.
effluent?: number;
```

- **Order.** The utility pass runs power, then sewer, then water. The sewer
  cut decides how much sewage the drains actually take; that discharge sets
  the fouling; the fouling sets what the intakes yield; the water cut runs on
  that supply. `sewageOf` reads the catalog, not the water delivered, so
  there is no cycle.
- **Discharge.** The sewage drained is `min(sewerDemand, sewerSupply)`. Each
  drain or works discharges its share of it, `drained × sewerKL / sewerSupply`,
  times its `effluent` (1 when absent). The fouling it emits is
  `discharge × WATER_FOUL_PER_KL`, saturating at 255, at every water tile
  orthogonally beside its footprint. A drain taking nothing emits nothing.
- **Spread.** `spreadFouling(g, emitters)`: `g.waterFoul` is zeroed, then one
  multi-source walk over tiles with `water[i] === 1`, four-connected, seeded
  from every emitter at once with its emission, writing
  `max(held, emit × (1 − hops / WATER_FOUL_REACH_TILES))` and stopping at the
  reach. It never leaves the water, and two stains meeting take the worse. It
  is a pure function of the grid and the discharges, so a loaded city's water
  is as fouled as its drains make it the moment it loads.
- **Yield.** An intake is a utility building with `waterKL` and
  `requiresAdjacent: 'water'`. Its yield is `waterKL × (1 − foul / 255)`,
  where `foul` is the worst fouling on the water tiles beside its footprint,
  the water it draws. Its yield, not its rating, goes into `waterSupply`;
  the difference sums into `waterFouled`; `intakeYield` keeps each intake's
  fraction for the inspector. The tower has no water beside it to read and
  is never scaled.
- **Rendering.** The water plane has one vertex every two tiles; `setFouling`
  gives each vertex the worst fouling of the tiles that meet at it, as a
  0..1 attribute, and the colour graph mixes the depth-keyed base colour
  toward the foul colour by the square root of it before the sky
  reflection, so a few units read and a full outfall is brown. Nothing else
  in the graph changes, and the attribute is rewritten only when the
  snapshot carries a new layer.
- **Catalog.** `sewage-works` is a drain with `effluent: 0.15`: the same
  `sewerKL` as the outfall, its own cost, upkeep, power and `pollution`, from
  Busy Township. The contract test checks its pollution is the drain's
  times its effluent, and the works and the drain take the same sewage.

### The rules the implementation must satisfy

1. A pipe conducts water and sewage between its tiles and into any road or
   building it touches; it stands on no water and no footprint; laying over
   a laid tile changes and charges nothing.
2. A building's sewage is `SEWAGE_RETURN_FRACTION` of its city water; a
   house on a well and a farm make none.
3. Drains reach along roads that carry water and along pipes, and the cut
   runs from the far end exactly as the water cut does.
4. From `SEWER_MILESTONE`, a lot grows, and a building levels up, only where
   a drain reaches it with spare capacity for its sewage; a standing
   building nothing drains is flagged `NoSewer`, emits pollution in
   proportion to its sewage, and is never abandoned for it. Below it no
   building makes sewage, and the first town grows on power and water alone
   (`tests/interaction/firsttown.test.ts`).
5. A pumping station and a drain pipe refuse a site with no adjacent water.
6. A v13 save loads with no pipes and every building standing; a v14 save
   round-trips its pipes.
7. The pipe overlay and the Sewer lens are visible only while a water tool
   or lens is active.
8. Fouling spreads only over connected water, fades to nothing at the reach,
   and is the worst of what reaches a tile, never the sum; a drain that takes
   no sewage fouls nothing, and a works fouls at its effluent share.
9. An intake yields its rating scaled by the worst fouling beside it, the
   tower is never scaled, and the water cut runs on the yield.
10. The fouling layer is derived every utility pass and never saved; a save
    from before this change loads and fouls its water from its own drains.
11. The sewer pass runs before the water pass.

## Risks

- **The works wants a shore too.** Every sewage building discharges to
  water, so a town with one short bank crowds its intake, its drain and its
  works onto it, which is exactly the siting problem the feature is for. A
  works 25 tiles from the intake keeps the water clean enough; the Advisor
  says so when it is not.

- **Every existing city has no drain.** One past Big Town loads with every
  home flagged `NoSewer`, a little dirtier, and stops growing until a drain
  is built; the Advisor says so. That is the designed behaviour, and it is
  why `NoSewer` is not a blocker. A smaller one is on septic tanks and
  notices nothing.
- **Interaction tests on the flat map.** The test map has no water, so a
  test about the sewer boots at `SEWER_MILESTONE`, digs a pond with the
  terraform command and stands a drain on its bank, the way a player would.
  A test about growth does neither: the first cut of this feature gave every
  growth test a pond and a drain to keep it passing, which is how a gate
  that stopped every new town growing shipped unnoticed, and the rule
  against that is now in GROUND-TRUTHS.
- **The pipe overlay's cost.** One merged mesh rebuilt on pipe changes, like
  the zone grid; a city will have hundreds of pipe tiles, not thousands.
- **A fourth utility later.** The network module now has three near-identical
  passes; a fourth should turn them into a table first.
