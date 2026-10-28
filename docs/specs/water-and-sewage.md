# Water and sewage

- **Status:** Built

**Owns:** the water loop: pipes, the pumping station, the water tower, the drain pipe and the treatment works; sewage as the third utility; the septic era below Big Town; the water's fouling and the intake it cuts; and the sourced figures of each.

**Rules:**

- Carry water and sewage along every street tier but dirt, highway and ramp, and along laid pipes, by BFS; never a radius. `[R-services-001]` `[R-services-006]`
- Judge who draws city water by `cityWaterUse`, from roads and pipes only, never from supply. `[R-world-030]`
- Run sewage on the water's own network, cut from the far end when drains run out; the sewer pass runs before the water pass. `[R-world-031]`
- Below `SEWER_MILESTONE` make no sewage; from it grow and level up only where a drain reaches with room. `[R-world-030]` `[R-world-031]`
- Flag `NoSewer`, foul the ground, and never abandon for it. `[R-world-031]`
- Keep a pipe buried: seen only underground, which the city enters with a water tool, building or lens. `[R-world-033]`
- Spread fouling only over connected water as the worst of what reaches a tile, derived each pass, never saved; scale intakes by it. `[R-world-034]`
- Add no prerequisite to the first town; a pump and a drain touch water, and the first-town test is frozen. `[R-world-028]` `[R-world-032]` `[R-world-029]`

**Numbers:** derivations and sources are in [the sources](../sources/water-and-sewage.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `SEWAGE_RETURN_FRACTION` | 0.88 | share | [USGS](../sources/water-and-sewage.md#return-to-sewer) |
| `SEWER_MILESTONE` (Big Town) | 3,500 | people | dial; Census urban line 2,500 |
| Water a person | 0.34 | kL a day | building types |
| Tower: tank / supply / people / power | 100,000 gal / 378.5 kL / 1,100 / 7.5 kW | | [the tower](../sources/water-and-sewage.md#the-tower) |
| Pumping station: supply / power / footprint | 3,785 kL a day / 62.5 kW / 2×2 | | [pumping station](../sources/water-and-sewage.md#the-pumping-station) |
| Drain: takes / footprint / pollution | 3,785 kL a day / 1×1 / 176 | | [the drain](../sources/water-and-sewage.md#the-drain) |
| Works: takes / effluent / pollution / power | 3,785 kL a day / 0.15 / 26 / 93 kW | | [the works](../sources/water-and-sewage.md#the-works) |
| Station cost / upkeep | 3,600 / 180 | ¢ / ¢ a month | dial |
| Drain cost / upkeep | 1,800 / 90 | ¢ / ¢ a month | dial |
| Works cost / upkeep | 9,000 / 520 | ¢ / ¢ a month | dial |
| `WATER_PIPE_COST_PER_TILE` / `WATER_PIPE_UPKEEP_PER_TILE` | 12 / 0.5 | ¢ / ¢ a month | [pipe](../sources/water-and-sewage.md#pipe) |
| `UNSEWERED_POLLUTION_PER_KL` | 0.0466 | field a kL a day | [fouling](../sources/water-and-sewage.md#what-raw-sewage-fouls) |
| `WATER_FOUL_PER_KL` | 255 / 3,785 | field a kL | [reach](../sources/water-and-sewage.md#what-the-water-carries-and-how-far) |
| `WATER_FOUL_REACH_TILES` | 25 (500 m) | tiles | same |
| Intake yield | `waterKL × (1 − foul / 255)` | kL | [fouled intake](../sources/water-and-sewage.md#a-fouled-intake) |
| Unlocks | tower and pipe, Small Town pump, Busy Township works | milestone | drain from the first day |
| `Problem.NoSewer` / `SewerShortage` | 256 / 512 | bytes | code |
| `SAVE_VERSION` | 14 | version | pipe layer last |

**Code:** `src/shared/types.ts` — `GridState.waterPipe`, `GridState.sewered`, `GridState.waterFoul`, `UtilitySpec.sewerKL`, `UtilitySpec.effluent`, `requiresAdjacent`, `Problem.NoSewer`, `Command` `layWaterPipe`, `ToolId` `water.pipe`, `LensId` `sewered`.
`src/data/catalog.json` — `water-pump` (2×2), `water-drain` (1×1), `water-tower` (re-derived), `sewage-works` (`effluent: 0.15`); each building's `waterUse`.
`src/shared/constants.ts` — the constants above. `src/world/waterpipe.ts` `canLayPipe`, `layWaterPipe`, `waterPipeTiles`, `waterPipeCount`; `hasAdjacentWater` in `src/world/grid.ts`.
`src/sim/network.ts` `recomputeUtilities`, `sewageOf`, `cityWaterUse`, `spreadFouling`, `utilityCanDeliver`, `cutFromTheFarEnd`, `computeReach` — conduction, sewer, fouling, yield.
`src/sim/growth.ts` `tryLevelUp`, `runSpawnScan`, `zonedUnserved`, `GrowthSupply` — sewer in the gate and the waits.
`src/sim/worker.entry.ts` `cmdLayWaterPipe`, `cmdPlaceBuilding` — pipes, bulldoze, snapshot channels, the emit pass. `src/sim/economy.ts` — pipe upkeep.
`src/render/pipes.ts` `PipeOverlayRenderer`; `src/render/underground.ts` `UndergroundView`; `src/tools/pipe.ts` `planPipeRun`; `src/render/water.ts` `setFouling`; `src/render/utilitykits.ts` — pump, drain, works kits; `waterSideOf`.
`src/render/overlays.ts` `CoverageKind`; `src/tools/tools.ts`; `src/app/clientgrid.ts`, `src/main.ts`; `src/ui/` — cards, lens, rows, Advisor rules `septic-outgrown`, `intake-fouled`.

**Tests:** `tests/interaction/firsttown.test.ts` — the first town grows on power and water alone, frozen. `waterpipe.test.ts`, `network.test.ts` (spread, share, yield, order), `growth.test.ts`, `grid.test.ts` (v13 loads with no pipes), `water.test.ts` (foul colour), `contracts.test.ts` (works' figures), `utilitykits.test.ts`, `pipes.test.ts`.
`advisor.test.ts`, `categories.test.ts`, `tools.test.ts`, `InfoPanel.test.tsx`; interaction `utilities.test.ts` — a sewer test boots at `SEWER_MILESTONE`, digs a pond with the terraform command and stands a drain on its bank.

**Open:** none

## Why the rules are what they are

### The loop

Water becomes a loop instead of a tap. A pumping station on a shore or a water tower on its borehole draws it; streets and laid pipes carry it; what the city drank returns as sewage along the same mains to a drain on a shore. Before, the only question about water was "have I built enough towers?", one dial with one right answer.

Now sewage has to go somewhere, somewhere is always water, and water is where the city's own intake is. The pipe makes both reachable, since the shore is rarely where the streets are. The Water and Sewer lenses make it legible.

### Pipes

A water pipe is painted like a power line, for a few coins a tile. It carries water and the returning sewage between its own tiles and into any street or building it touches. On the ground it shows as a blue run beside a brown one, only while the city is underground.

Streets keep their mains, so a town that never laid a pipe loses nothing. Pipe reaches a shore, crosses a motorway or railway that carries no main, or serves a lot down a lane no main runs along. A pipe is a painted layer, not a road, standing on no water and no footprint. Laying over a laid tile changes and charges nothing, so a drag back over a run costs nothing. Bulldoze pulls it up with a refund; undo lays it back.

`src/world/waterpipe.ts` is the power line's module with the names changed. A pipe may go on any dry tile with no building: under a road, across a field, through a landfill. It may not cross open water, since intake and outfall are the buildings that meet water.

`conductsWater` is true for a pipe tile as `conductsPower` is for a line, and `reachableNetworkTiles` takes the "is this tile a line" predicate so one walk serves both. `mainBeside`, which decides mains or well, counts a pipe as a main; `utilityCanDeliver` seeds from pipes as well as roads.

Cost matches the power line's, ¢12 a tile and ¢0.5 a month: the cheapest thing that reaches a shore, or a street gets laid to the water instead. Re-piping every street would have put every existing city dry, so a street carries its own main.

### Pipes are underground

Nothing on the surface ever shows a pipe `[R-world-033]`. `PipeOverlayRenderer` draws each carrier as a strip through the tile centre, joined to the orthogonal neighbours that carry water, split lengthwise into a blue half and a brown half, conforming to terrain under road plates.

It shows only while a water tool is in hand or the Water or Sewer lens is on, when the surface goes to glass. The pipe overlay is one merged mesh rebuilt on pipe changes, like the zone grid; a city has hundreds of pipe tiles, not thousands. The Sewer lens paints drained coverage with the Water lens's two-tone ramp. The full view is in [the underground view](underground-view.md).

### Water in

- **Water Tower.** A 100,000-gallon elevated tank on its borehole stands anywhere and supplies 378.5 kL a day, one day's average demand: about 1,100 people. It takes one tile. The tower is never scaled by fouling.
- **Water Pumping Station.** A surface-water intake of the smallest class, one million gallons a day, 3,785 kL, which must stand with its footprint touching the water it draws from. From Small Town.

`requiresAdjacent` widens to `'rail' | 'water'`. `cmdPlaceBuilding` refuses a footprint with no orthogonally adjacent water tile, read from `g.water`, exactly as it refuses a station off the rails. The pump and the drain take it; the tower does not.

### Sewage out

Every building that draws city water makes sewage: 88% of what it draws, the share public supply does not consume. `sewageOf(g, entry, x, z, w, d)` is `SEWAGE_RETURN_FRACTION × cityWaterUse(...)`. Nothing is stored, since it is a fraction of a catalog figure. A house on a well is on a septic tank and makes none; a farm makes none.

- **Water Drain Pipe.** An outfall of the same one-million-gallon class that must stand on a shore, taking 3,785 kL of sewage a day and emptying it, raw, into the water. Available from the first day. It fouls the ground at 176, so nobody wants to live beside it.
- **Sewage Treatment Works.** A secondary plant of the same class that must also stand on a shore. It takes the same sewage at five times the price and real upkeep, draws power for its aeration, and discharges 15% of the raw load: it fouls the ground at 26 and the water at a seventh of a drain's rate. From Busy Township.

The two are deliberately the same size, so the choice is only what comes out. The drain is always the cheaper answer to the question the player is actually asked, which is why real cities built outfalls for a century. The works at five times the drain understates the real cost gap. Drain upkeep is the programme's ladder dial.

### Sewage, the third utility

A drain reaches buildings along the streets and pipes connected to it, as a tower reaches theirs. `computeReach` seeds from every drain's footprint over tiles that carry water: a street whose main is also its sewer, and a pipe. A road that carries water carries a sewer.

`cutFromTheFarEnd` writes `g.sewered` and lines reached buildings up by steps from the nearest drain, nearest first, ties by id. The first past the supply and every one after loses its sewer. `UtilityTotals.sewer` carries the cut set and the spare; `sewerDemand` is the running total. `sewerSupply` sums `UtilitySpec.sewerKL` over Active and Constructing drains. `sewered` is derived like `roadFootprint` and never saved.

`Problem.NoSewer` (256) marks a sewage-making building on no sewered tile; `Problem.SewerShortage` (512) marks one the network reaches but the drains ran out. Neither is a blocker: abandonment counts only `NoPower`, `NoWater` and `NoRoad`.

The City Info popover reads sewage drained against made, the inspector reads what a drain takes, and the Sewer lens paints what the drains reach.

### Septic tanks until Big Town

A town of a few hundred or a couple of thousand is on septic tanks, as about one American household in five still is. Below Big Town (3,500) nothing makes sewage: no drain to want, nothing flagged, nothing stinks, and a street with power and water grows `[R-world-028]`.

`sewageOf` takes the city's `milestoneLevel` and returns zero below `SEWER_MILESTONE`, so every sewer figure downstream is zero without a second switch. `recomputeUtilities` and `GrowthSystem.zonedUnserved` take the level as a parameter, and `worker.entry.ts` passes `stats.milestoneLevel` at all three. A caller running no economy (the network tests) gets a sewered city by default.

The drain's `unlockMilestone` is `SEWER_MILESTONE - 1`, as the works' already was. A Busy Township with no drain hears from the Advisor (`septic-outgrown` in `cityWideIssues`, while `sewerSupply` is zero) that it is outgrowing its tanks and where to build one.

The tick the city becomes a Big Town every building on the mains is on the sewer at once. A town that listened is ready; one that did not stops growing until it builds a drain. A city loaded past that line without a drain does the same.

Why not a sewer from day one: both drains want a shore, so an inland new town could never grow and nothing on screen said why. The first cut shipped that way and the first-town guard now forbids it.

### What happens without a drain, from Big Town

- **Nothing new grows there.** A lot grows and a building levels up only where a drain reaches it with room for its sewage, as they need power and water. `footprintServed(g.sewered)` must hold for a kind that makes sewage; `spawnIfSupplied` asks `suppliedFor` for the sewage it adds, and a level-up asks for the difference. The Advisor counts the zoned land and growth held back; `zonedUnserved` gains `sewer`, and the waits count it.
- **What stands, stinks.** An Active building with `NoSewer` emits `ceil(sewageOf × UNSEWERED_POLLUTION_PER_KL)` into the Pollution field at its tile, never less than one unit, so a cesspit is never nothing. Land value falls, the lens shows it, and the building is never abandoned for it.

An existing city past Big Town loads with every home flagged `NoSewer`, a little dirtier, and stops growing until a drain is built. That is designed, and why `NoSewer` is not a blocker. A smaller city notices nothing.

`GrowthSupply.sewer`, `Spare.sewer` and `waiting.sewer` join power and water. A lot held back only by a drain is waiting for supply, like one held back by a tower. A fouled intake lowers the water the spawner has to hand out, and nothing else.

### What the water carries

Fouling spreads along the water, and only along the water. Each drain and works empties the sewage it takes into the water tile beside it. The fouling is strongest at the mouth and fades to nothing 25 tiles, 500 m, away. It never crosses land: a lake over a ridge is untouched. Two stains that meet take the worse.

The water shows it without a lens, the surface going from blue toward murky brown, so a spoiled shore reads from the air as a smoking plant does. A drain that takes nothing fouls nothing, so a village's first outfall is a smudge and a city's a brown reach, and treating the sewage shrinks it the day the works opens.

There is no current and no downstream: the world model rejects flow on cost. The fading is linear and the player's lever is distance, or treatment. Our 500 m sits between real setbacks on purpose; at the eight-tile Texas setback a station below a works keeps 90% of its yield and one below a raw outfall a third. A works 25 tiles from the intake keeps the water clean enough.

Mechanism. `waterFoul` is 0..255 where `water[i] === 1`, derived each pass, never saved, so a loaded city's water is as fouled as its drains make it the moment it loads.

- **Order.** The utility pass runs power, then sewer, then water. The sewer cut decides how much sewage is taken; that sets the fouling; the fouling sets intake yield; the water cut runs on that. `sewageOf` reads the catalog, not the water delivered, so there is no cycle.
- **Discharge.** Sewage drained is `min(sewerDemand, sewerSupply)`. Each drain discharges `drained × sewerKL / sewerSupply` times its `effluent` (1 when absent), emitting `discharge × WATER_FOUL_PER_KL`, saturating at 255, at every water tile beside its footprint.
- **Spread.** `spreadFouling(g, emitters)` zeroes `g.waterFoul`, then one multi-source four-connected walk over water tiles writes `max(held, emit × (1 − hops / WATER_FOUL_REACH_TILES))` and stops at the reach.
- **Rendering.** The water plane has one vertex every two tiles. `setFouling` gives each the worst fouling of the tiles meeting there as a 0..1 attribute; the colour graph mixes the base colour toward foul by its square root before the sky reflection. The attribute rewrites only when the snapshot carries a new layer.

### A fouled intake delivers less

A pumping station delivers its rating scaled by how clean the water beside it is: five tiles from a drain emptying a full million gallons it delivers a fifth; 25 tiles away, all of it. The yield is `waterKL × (1 − foul / 255)`, where `foul` is the worst on the water tiles beside the footprint. Utilities really derate or shut intakes when the raw water turns.

The yield, not the rating, goes into `waterSupply`; the difference sums into `waterFouled`; `intakeYield` keeps each intake's fraction for the inspector. The inspector reads what the station delivers against its rating, the popover's water line counts what fouling cost, and the Advisor (`intake-fouled`) names the two remedies: move the outfall, or treat the sewage.

Nothing is abandoned for it directly: a city short of water from a fouled intake is short of water, and the ordinary far-end cut and its advice apply. The works wants a shore too, so a town with one short bank crowds intake, drain and works onto it, which is the siting problem the feature exists for.

### Wells, pollution and saves

A low-density house on a dirt road with no main beside its lot is on a well; a pipe beside the lot is a main and puts it on the mains and the sewer both. An undrained building, an outfall and a works emit into the ordinary Pollution field, so land value and happiness respond with no new machinery. The water's fouling is its own layer, read by intakes and the water surface and nothing else: no illness system, so a fouled shore costs the city its water, not its health.

The pipe layer is appended last at `SAVE_VERSION` 14; a v13 save loads with no pipes and every building standing. `sewered` and `waterFoul` are derived. The worker protocol is additive: command `layWaterPipe` (the `stringPowerLine` shape and inverse), optional snapshot channels `SimSnapshot.waterPipes` (the pipe layer as `ZonePatch[]`, like `powerLines`), `sewered` (coverage, like `watered`) and `SimSnapshot.waterFoul`, stats `CityStats.sewerSupply`, `sewerDemand` and `CityStats.waterFouled`, and `SelectionInfo.intakeYield`. `UtilityTotals.intakeYield` carries each intake's fraction; the growth pass reads `zonedUnserved.sewer`. `waterpipe.ts` mirrors `powerline.ts`. The sewer is the one place a milestone changes a rule rather than an unlock.

### The kits

Two kits and a third for the works join `UTILITY_KIT_CATALOG_IDS`: the pump house with a round intake pipe out of its water-facing wall, the drain's low headwall and pipe mouth, and the works' two clarifier tanks and control house with an outfall toward the water. `waterSideOf(footprint, waterAt)` picks the side the footprint touches, testable without a scene.

### Risks

A sewer test boots at `SEWER_MILESTONE`, digs a pond and stands a drain on its bank, as a player would. A growth test does neither: giving every growth test a pond and a drain is how a gate that stopped every new town shipped unnoticed. A fourth utility should turn the network's three near-identical passes into a table first.

## Decided

- Sewage on the water's own network, over a radius: a street's main is its sewer.
- Septic until Big Town, over a sewer from the first house: a gate with no shore stopped inland towns.
- Drain and works the same size, over a bigger works: the choice is only what comes out.
- Fouling spread evenly over connected water, over a flow model: flow is a heightfield simulation the world model rejects.
- Intake yield falls linearly with fouling, over closing the intake: a short city is short, and the cut applies.
- `NoSewer` never abandons, over abandonment: an older city loads whole.
- No drinking-water treatment plant, no illness, no pipes instead of streets.
