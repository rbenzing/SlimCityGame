# Water and sewage — technical design

- **Status:** Agreed 2026-10-02; pipes, the pumping station, the drain pipe and sewerage built 2026-10-02
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
and far-end cut that power and water have decide who is drained. A lot
grows only where a drain reaches; a building nothing drains stinks and is
never abandoned for it.

Now, because the building-types epic made every `waterUse` honest, so the
water figures and the sewage that follows from them finally mean something,
and because the first draft of this design, which collected sewage by a
radius, predates both that and the player's ask for pipes.

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
- **Growth.** `GrowthSupply.sewer`, `Spare.sewer` and `waiting.sewer` join
  power and water. A lot spawns only where `footprintServed(g.sewered)`
  holds for a kind that makes sewage, and `spawnIfSupplied` asks
  `suppliedFor` for the sewage it adds; a level-up asks for the difference.
  A lot or building held back by sewer alone is waiting for supply and is
  counted for the Advisor like the others. `zonedUnserved` gains `sewer`:
  an empty zoned tile beside a road with no drain reaching it.

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
| `water-tower` | Water Tower           | `waterKL` (re-derived) | 2×2    | —                |

Their figures are derived in the design document and checked by the
catalog contract test. The Water tab lists every utility entry with
`waterKL` or `sewerKL`, and the pipe card beside them with its cost per
tile, as the Electricity tab lists the power line.

### Rendering

- **Pipes are underground.** `PipeOverlayRenderer` draws each pipe tile as
  a strip through the tile centre, joined to the orthogonal neighbours that
  carry water (pipes, roads whose class carries water, and buildings), the
  strip split lengthwise into a blue half and a brown half, conforming to the
  terrain like the zone grid's lines. It is visible while a water tool
  (`water.pipe`, or a building on the Water tab) is in hand, and while the
  Water or Sewer lens is on; otherwise hidden, as the zone grid is.
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

### The rules the implementation must satisfy

1. A pipe conducts water and sewage between its tiles and into any road or
   building it touches; it stands on no water and no footprint; laying over
   a laid tile changes and charges nothing.
2. A building's sewage is `SEWAGE_RETURN_FRACTION` of its city water; a
   house on a well and a farm make none.
3. Drains reach along roads that carry water and along pipes, and the cut
   runs from the far end exactly as the water cut does.
4. A lot grows, and a building levels up, only where a drain reaches it
   with spare capacity for its sewage; a standing building nothing drains is
   flagged `NoSewer`, emits pollution in proportion to its sewage, and is
   never abandoned for it.
5. A pumping station and a drain pipe refuse a site with no adjacent water.
6. A v13 save loads with no pipes and every building standing; a v14 save
   round-trips its pipes.
7. The pipe overlay and the Sewer lens are visible only while a water tool
   or lens is active.

## Risks

- **Every existing city has no drain.** It loads with every home flagged
  `NoSewer`, a little dirtier, and stops growing until a drain is built; the
  Advisor says so. That is the designed behaviour, and it is why `NoSewer`
  is not a blocker.
- **Interaction tests on the flat map.** The test map has no water, so a
  test that grows buildings digs a pond with the terraform command and
  stands a drain on its bank, the way a player would.
- **The pipe overlay's cost.** One merged mesh rebuilt on pipe changes, like
  the zone grid; a city will have hundreds of pipe tiles, not thousands.
- **A fourth utility later.** The network module now has three near-identical
  passes; a fourth should turn them into a table first.
