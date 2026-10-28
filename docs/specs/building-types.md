# Building types

- **Status:** Built

**Owns:** what kind of building a zoned lot grows: the kind catalog and its draw weights, the room rule for businesses, the Heavy Industrial zone, industry's order book, and the sourced households, jobs, power, water, pollution and noise of every kind. Lots are [lots-and-land.md](lots-and-land.md).

**Rules:**

- Draw a kind per lot: one growth-rng roll over the unlocked level-1 entries of the zone that fit, by `share`. The player never picks one. `[R-world-036]`
- A commercial or industrial kind is a candidate only if its jobs fit the sector's room; the smallest fitting kind always is. `[R-world-036]`
- Keep the kind through every level-up; the one change of kind is a house torn down for a plex. `[R-world-036]` `[R-world-038]`
- A kind takes whole parcels; houses, plexes and rows keep their lot at every level. `[R-world-037]` `[R-world-042]`
- Derive every zoned catalog figure from a published source; a figure with no derivation is a bug. `[R-world-043]`
- Count a block's homes from its drawn floor at 85% over 93 m², never every storey at the ground plate. `[R-world-044]`
- Level industry up on demand and room, never on land value. `[R-world-045]`
- Build only into spare power and water, counted down as a pass builds. `[R-world-047]`

**Numbers:** per-kind tables (zone, milestone, weight, lot, storeys, homes, residents, jobs, heights) and every derivation are in [the sources](../sources/building-types.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Tile | 20 | m | dial `[R-world-001]` |
| Detached house weight | 61.1 | share | [weights](../sources/building-types.md#weight) |
| Duplex / fourplex / row weight | 1.6 / 1.2 / 1.6 | share | same |
| Multiplex / courtyard / mid-rise / tower weight | 0.63 / 0.30 / 0.11 / 0.07 | share | same |
| Household owned / rented | 2.63 / 2.26 | people | [residents](../sources/building-types.md#residents) |
| Farm household | 3 | people | same |
| Home electricity detached / attached / 2–4 units / 5+ units | 1.4 / 0.97 / 0.76 / 0.70 | kW | [home draw](../sources/building-types.md#what-a-home-draws-from-the-grid) |
| Water a person | 90 gal (0.34 kL) a day | kL | same |
| Water a job on a mixed block | 0.104 | kL a day | same |
| Water a commercial employee | 27.5 | gal a day | [business draw](../sources/building-types.md#what-a-business-draws-from-the-grid) |
| Storey | 3.2 | m | [homes per block](../sources/building-types.md#homes-per-block) |
| Apartment | 93 | m² | same |
| Homes share of a floor | 85 | % | same |
| Upper tier setback | 15 | % | same |
| Body plate | 13.6 a tile | m | same |
| Net floor of a plate | 80 | % | [jobs](../sources/building-types.md#jobs) |
| Shop floor a job | 17.5 | m² | same |
| Hotel room | 52 gross | m² | [lots and bodies](../sources/building-types.md#lots-and-bodies) |
| Restaurant body cap | 24 | m | same |
| Filling station kiosk | 35% of lot (fill 0.35), cap 16 | m | same |
| Flex body / chemical body | 55 / 50 of each side | % | [industrial lots](../sources/building-types.md#lots-bodies-and-heights) |
| Duplex body | 60% of each axis, cap 16 (12×12 on 1×1, 12×16 on 1×2) | m | dial `BODY_RULES` |
| Fourplex body | 70% cap 18 (14×14 on 1×1) | m | dial |
| Townhouse row body | 90% cap 18 (18×18 on 1×2 or 2×1, three 6 m homes) | m | dial |
| Detached body | 4.75 a tile, never under 9.5 (`DETACHED_BODY_MIN_M`) | m | dial |
| Multiplex body | 13.6 a tile, cap 24 | m | dial |
| Everything else | 13.6 a tile under the 85% ceiling | m | dial |
| Fuel canopy | 2 off the frontage wall, 10 deep, 90% of span, 5.2 up, four posts, two pump islands | m | dial |
| Tank farm | three cylinders 6 across, 5 tall, 2 off the back wall, 7.5 centres | m | dial |
| Heavy stack / kindless stack | 2 × 12 / 1.6 × 6 | m | dial |
| Tower podium | two storeys, full fill | storeys | dial |
| Heavy Industrial unlock | Busy Township, 1,200 people (M2) | people | dial `ZoneType.IndHeavy` = 10 |
| Missing-middle / factory unlock | Small Town (M1) | milestone | dial |
| Flex and R&D unlock | Big Town (M3) | milestone | dial |
| Pollution scale | 140 per 484,000 lb | units | [pollution](../sources/building-types.md#what-a-works-draws-from-the-grid-and-what-it-puts-into-the-air) |
| Noise: motorway 80 dBA; works 75 dBA, emits 38; dock 68 dB, emits 8 | 120 a motorway tile | units | [noise](../sources/building-types.md#what-a-works-draws-from-the-grid-and-what-it-puts-into-the-air) |
| Kinds a level | 3 levels each | levels | dial |
| Power and water units in the line | millionths | W, mL | dial |

**Code:**

- `src/shared/types.ts` `BuildingKind`, `FarmKind`, `IndustrialKind`, `ZoneType.IndHeavy`, `BuildingCatalogEntry.kind` (with `units`, `share`, `lot`): the kind and its fields; `kind` replaces `entry.farm`.
- `src/shared/buildingkind.ts` `farmKindOf`, `isFarmKind`, `householdsOf`: where a kind is read into what it means.
- `src/data/catalog.json`: the entries, three levels a kind, farms keeping their ids.
- `src/sim/growth.ts` `spawnCandidates`, `drawKind`, `runSpawnScan`, `tryLevelUp`, `isZonedLot`: the draw, the room test, the kind-matched level-up; `canPlace` fits a footprint, `isFarmLot` is the farm's own lot test.
- `src/sim/demand.ts` `jobRoom`, `COMMERCIAL_SPAN_JOBS`, `INDUSTRIAL_SPAN_JOBS`: the room a business needs.
- `src/sim/network.ts`: supply and use in millionths.
- `src/sim/worker.entry.ts` `selectionOccupancy`: households as `units`.
- `src/tools/tools.ts` `ZONE_TOOL_TO_TYPE`, `zone.indHeavy`; `src/ui/categories.ts`: the heavy zone's tool and card; `zoneSector` answers `'ind'`.
- `src/world/plat.ts` `takesWholeParcels`, `takesFrontageLots`; `src/shared/lots.ts` `warrantedLot`, `lotsOfZone`, `PLATTED_ZONES`: what a kind may take; `platReaches`, `Plat.parcelAt` and the plat's `reached` mask bound the search.
- `src/shared/floorarea.ts` `bodyMetresFor`: homes per block.
- `src/render/massing.ts` `bodyMetresFor`, `footprintShrinkFor`, `computeSetbacks`, `BODY_RULES`: body per kind, tiers, podium.
- `src/render/archetypes.ts` `isHouseEntry`, `kindOf`, `archetypeFor`, `isHeavyIndustryEntry`: renderer by kind.
- `src/render/houselot.ts`, `houses.ts` `homesAcrossFrontage`: homes along the frontage.
- `src/render/buildings.ts`, `lots.ts`, `parked.ts`: read the per-axis body.
- `src/render/farmlot.ts`, `farms.ts`: read `farmKindOf`.
- `src/render/buildingkit.ts` `computePartPlacements`, `PART_GEOMETRY`, `doorSill`; `src/render/props.ts` `hasSmokestack`, `smokestackSize`, `hasSiloCluster`: parts and stacks.
- `src/render/zonegrid.ts` `ZoneGridRenderer.setParcels`, `src/ui/styles.css`, `AssetDrawer`: the heavy zone's tint, `--color-rci-ind-heavy`.

**Tests:**

- `src/shared/contracts.zoning.test.ts` — three levels per kind; residents, units, footprint, jobs, power, water, pollution, noise follow their derivations; only heavy plants pollute; the heavy zone's number.
- `src/sim/growth.test.ts`, `tests/interaction/growth.test.ts` — only fitting unlocked kinds drawn; a narrow lot grows what fits; constant rng picks the first; level-up keeps the kind; farms unchanged; a heavy estate grows its four kinds and pollutes; a one-tile strip grows half and normal lots, duplexes and fourplexes.
- `src/sim/network.test.ts` — a 1.4 kW house counts 1,400 W.
- `src/render/archetypes.test.ts`, `buildingkit.test.ts`, `props.test.ts`, `massing.test.ts`, `houselot.test.ts` — archetypes, tank farm, doors at grade, stacks, silos, bodies, two homes on a duplex frontage, podium.
- `src/ui/categories.test.ts`, `src/tools/tools.test.ts`, `src/render/zonegrid.test.ts` — the heavy zone's card, tool and tint.

**Open:**

- The water tower's rating is unsourced; heavy plants draw up to twice it.
- Not built, by choice: manufactured homes, supply chains, malls and big-box stores, households as agents.

## Why the rules are what they are

### What the player gets

A zoned lot grows a kind of building, not just a level of one. Paint a low-density street and it fills with detached houses, the odd duplex and fourplex where a house would not fit. Row housing comes up as townhouses, medium density as multiplexes and courtyard apartments, high density as mid-rise slabs and towers on podiums.

Commercial zones grow the formats a real high street and strip have: shops, strips with car parks in front, supermarkets, restaurants, filling stations, offices and hotels. Industry grows by the business it is: workshops, warehouses, factories, flex buildings, and in the Heavy Industrial zone food, chemical, steel and paper plants.

Every figure comes from a published source, so a city of ten thousand people is not three houses repeated. Variety serves the pillars that you paint zones and never place houses, and that realism is grounded in published figures ([gdd](../game-design/gdd.md)).

### A lot picks its building

Growth reaches an empty zoned tile and lists the zone's level-1 kinds that are unlocked and whose lot fits: buildable, free, every tile zoned the same. A building never spills onto the ground beside its zone, which is why a one-tile strip grows one-tile kinds.

It draws one by `share`, the kind's share of the real stock by building ([weights](../sources/building-types.md#weight)). The pick then passes every check growth always made: a street in reach, power and water on the lot, demand, spare supply, the desirability draw.

- A wide block grows mostly detached houses, since that is most of the stock. A sliver where no double or estate lot fits grows a house on a half or normal lot, a duplex or a fourplex.
- `drawKind` takes one roll against the cumulative share, in catalog order. A candidate with no `share` weighs 1; one candidate needs no roll.
- The roll comes before the desirability roll, so the random stream shifts one draw per visited lot with several kinds. Tests that pin a sequence use a constant rng, which picks the first.
- The player paints a density and lays out blocks; the shape of the blocks shapes the town.

### A kind is kept through every level-up

A building keeps its kind, as a farm keeps being a crop farm; a duplex levels up into a better duplex, never a house or a block. `tryLevelUp` finds the next entry by zone, level and kind, where it once used the farm field.

A house-scale level-up gives a bigger or better house for the same household; a block gets more storeys and more homes. The one change of kind is the teardown of a house on prime land, at 2% a year, to a plex ([lots-and-land](lots-and-land.md#a-small-house-on-prime-land-becomes-a-plex)). A commercial or dense level that grows on the ground is a redevelopment onto free lots ([lots-and-land](lots-and-land.md#commercial-and-dense-land-is-cut-into-frontage-lots)).

The kind is `kind` on the catalog entry; every zoned entry has one, and the catalog test fails one without. `farmKindOf(entry)` returns the farm subset or null, so no caller narrows the union by hand. Save format is unchanged: a building is saved by catalog id, every old id is still in the catalog with a kind, and the zone byte gains 10, appended.

Old ids map to kinds: old low-density houses are detached houses, old row houses townhouses, old medium blocks courtyard apartments, old high blocks mid-rise flats. The old Workshop Yard is a workshop, the old Factory Hall a factory, the old Green Works a flex building, the Research Campus. Their residents and draw change to the sourced figures on load, like any catalog change.

### The residential kinds

The types are those the building code and the housing survey already distinguish, with the missing-middle typology between house and block ([where the kinds come from](../sources/building-types.md#where-the-kinds-come-from)). The kind table, its lots and its storeys are in [the sources](../sources/building-types.md#the-residential-kinds).

- Detached houses are owned, townhouses owned; everything from the duplex up is rented. Residents are `round(units × household)`.
- The townhouse row holds three homes at every level: the level adds storeys, never homes or length. A long terrace is neighbouring parcels in a run.
- A multiplex or courtyard block is two normal parcels assembled side by side, and stays two at every level.
- Detached houses hold 3 people where they held 4, and a tower up to 644 where it held 150. The level ladder no longer adds people to a house; it adds homes to a block.
- A block's homes are its drawn floor × 0.85 ÷ 93 m², rounded. Each tier above the first is 15% narrower on both sides, so a tower's 25 storeys come to 285 homes, not 375. A podium and a shopfront block's shops hold no homes.
- Power and water per home are the survey's averages, so a 1.4 kW house is not rounded to 1 kW: the line sums in millionths. Nothing outside `network.ts` and growth's supply bookkeeping reads those units.
- A farm's `powerUse` keeps its ratio to the detached house; a farm and a house on a well draw no water ([simulation-rules](../game-design/simulation-rules.md#a-house-on-a-well)).

### A business opens where the town has room

A shop or office is drawn as a home is, with one more test. The demand model knows how many local jobs the town's industry supports and how many basic jobs its workforce calls for ([simulation-rules](../game-design/simulation-rules.md#demand-the-rci-model)). The gap to the jobs already open or going up is the room.

- `jobRoom(input)` returns the two gaps the demand formulas already compute, in jobs. The worker computes it beside `computeDemand` every tick and passes it to `growth.tick` as `room`, unlimited for callers with no economy.
- Growth copies it per pass and counts it down as it builds, as `spare` does, so two lots on one pass cannot both fill it.
- In `runSpawnScan` a `com` or `ind` candidate needs `jobs <= room[sector]`, or is the candidate with the fewest jobs, so growth never stalls at a gap smaller than any building.
- `tryLevelUp` needs `next.jobs - entry.jobs <= room[sector]` for those sectors. Homes and farms are untouched.
- A village of forty gets a corner shop, not a shopping strip; the strip comes when the town supports its eighty jobs.

### The commercial kinds

Seven kinds: shop, restaurant, filling station, strip, supermarket, in low commercial; office and hotel in high. Weights are the survey's building counts; the table, lots, bodies, jobs and draws are in [the sources](../sources/building-types.md#the-commercial-kinds).

- A level whose footprint is larger is a redevelopment taking whole lots beside it, only where free.
- The catalog keeps `com-low-1` as the shop's first level, since `COMMERCIAL_SPAN_JOBS` is read from it, and `com-low-2`, `com-high-1` and `com-high-2` so saves load.
- `CommercialKind`: `shop`, `strip`, `supermarket`, `restaurant`, `fuel`, `office`, `hotel`. `BODY_RULES` adds `restaurant` and `fuel`.
- `archetypeFor` reads the kind: `storefront` for shop, strip, supermarket and restaurant; `fuelStation` (parts `fuelCanopy`, `pumps`); `office` with no parts; `hotel` (canopy, signage band). An entry without a kind keeps the level rule.
- `computePartPlacements` lays the fuel canopy against the frontage side like the dock and canopy.
- On the street: a shop is a storefront with canopy, sign band and car park in front; a strip long and low; a supermarket a tall single storey; a restaurant a small storefront on a lot of car park; a filling station a kiosk behind a canopy on four posts with the cars at the pumps; an office a glass block with no shopfront; a hotel a block with an entrance canopy and a sign.

### Heavy industry gets its own zone

The Industrial zone grows light industry. Plants that pollute and make noise grow only in Heavy Industrial, a tenth zone painted like any other on the industrial sub-tab. It unlocks at Busy Township (1,200 people), when a workforce can staff a plant, and pulls on industrial demand like a mill or a farm. Nothing stops zoning it beside homes: the zone is the choice, the air and noise the consequence.

- `ZoneType.IndHeavy = 10`, appended. `zoneSector` answers `'ind'`, so demand, the room rule, taxes, growth's problems and the Advisor's unserved-zone count need no change. `zonableMaskFor` treats it as any paved-road zone.
- `zone.indHeavy` maps to it in `ZONE_TOOL_TO_TYPE`; the Industrial (Heavy) card sits second on the sub-tab with `unlockMilestone: 2`; `zoneTintColor` gives a rust shade of the industrial amber, the drawer reading it from `--color-rci-ind-heavy`.
- The inspector names it "Heavy Industrial", and now names the medium and mixed zones, which it called "Unzoned".
- The small town zones heavy industry north of its four-lane road.

### Industry grows on its order book

A home or shop levels up where land value has risen; industry never did that in life. A works, plant or farm levels up while industrial demand is above zero and the town has room for the added jobs. Land value, which pushes real industry out of town, plays no part.

The land-value gate once meant a polluting factory, which lowers the land value around itself, could never reach level 3. In `tryLevelUp` a building whose sector is `'ind'` needs `demand.ind > 0` and skips `meetsLevelUpRequirement`, as a farm already did.

### The industrial kinds

Eight kinds. Light zone: workshop, warehouse, factory, flex. Heavy zone: `foodplant`, `chemical`, `metals`, `paper`. Weights, lots, heights and jobs are in [the sources](../sources/building-types.md#the-industrial-kinds).

- The catalog keeps `ind-1` as the first Industrial entry (the workshop's first level, 16 jobs) since `INDUSTRIAL_SPAN_JOBS` is read from it, and `ind-2`, `ind-3` as the factory's second level and the flex building's third so saves load.
- `archetypeFor` reads the kind: `workshop` (`rollUpDoors`), `warehouse` (`loadingDock`, `rollUpDoors`), `factory` (`monitorRoof`), `greenWorks` for `flex` (`roofArray`), `foodPlant` (`loadingDock`, `rollUpDoors`), `chemicalPlant` (`tanks`), `steelworks` (`monitorRoof`), `paperMill` (`monitorRoof`, `tanks`). A kindless entry keeps the old level-and-pollution rule.
- `isHeavyIndustryEntry` is `zone === IndHeavy`. The `tanks` part is the kit's first non-box (`PART_GEOMETRY`), skipped where the building fronts no road. Roller doors stand on the dock where there is one, on the ground where not (`doorSill`).
- `hasSmokestack` is true at every level of a heavy plant, and for a kindless polluting entry at level 2 up; light kinds raise none. `hasSiloCluster` is true for a food plant, or a kindless entry, on a footprint 3×3 or bigger; a warehouse or steelworks gets none.
- Bodies: `BODY_RULES` adds `flex` (fill 0.55) and `chemical` (fill 0.5); every other kind fills its plate.
- Light industry draws tens of kilowatts, a heavy plant 0.3–2.4 MW and hundreds of kL of water a day, so a heavy estate stalls for water until the player builds towers for it. That is the intended consequence.
- A workshop or factory now emits 1–5 where it emitted 60–90; a player who misses the smog zones heavy industry.
- The contract test derives each kind's jobs from plate and density, power from kWh per job (per square foot for warehouse and flex), water from gallons per job, pollution from releases per plant at 140 per 484,000 lb scaled by jobs against the level-2 plant, noise from 75 dBA and 68 dB against a motorway's 120.
- On the estate: a workshop a low shed with roller doors; a warehouse a tall slab with a dock and doors above, taller each level; a factory a shed under a monitor roof; flex a two- or three-storey block with a roof array in its car park; a food plant a dock with a silo cluster and a tall stack; a chemical plant a block with three tanks and a stack; a steelworks a long tall monitor-roofed shed with a stack; a paper mill a tall monitor hall with tanks and a stack. The inspector names the kind and the zone, "Heavy Industrial".

### How a kind is drawn

- **Body size by kind.** `bodyMetresFor(entry)` gives `{ w, d }` in metres per lot axis; `footprintShrinkFor` is now the body over the lot, per axis, so nothing else moves. The detached body does not shrink with the lot: yard, drive and room between neighbours change instead.
- **Homes along the frontage.** `homesAcrossFrontage(kind)`: a row has three homes of about 6 m whichever edge meets the street, a duplex and a fourplex two, a detached house one. The row plan lays a door, a front pad and a seeded integral garage door per home, pad at the home's near edge, door at the far one. Duplex and fourplex take that plan.
- **House kinds.** `isHouseEntry` is true for detached, duplex, fourplex and townhouse, which carry the pitched roof and lot plan; block kinds are `apartment` and flat-roofed.
- **Podium.** `computeSetbacks` returns for a `tower` a `podium` beside its tiers, instanced like any upper tier.
- Each kind reads as itself at the default camera, without a label ([buildings](../art/buildings/residential-kinds/README.md)): a detached house on its lawn with drive, garage and yard; a duplex two homes in one body with two doors and two drives; a fourplex a house-form block with two doors and two drives; a row three attached homes to a 20 m frontage; a multiplex a low flat-roofed block; courtyard apartments wider and lower; a mid-rise a slab; a tower rising from a podium. The inspector names the kind and its household count is the building's homes.

### What it interacts with

- **Zoning.** Where a zone may be painted is unchanged; kinds take the lots the zone offers. A player wanting duplexes zones narrow strips, towers high density on big blocks. Heavy Industrial sits beside Industrial.
- **Milestones.** Missing-middle kinds arrive at Small Town (M1), denser blocks with their zones, so a Tiny Village is detached houses only. Factories arrive at M1, Heavy Industrial at Busy Township (M2), flex at Big Town (M3); a village's industry is workshops and depots.
- **Utilities.** One wind turbine at 1.1 MW lights about 800 houses; a 400 kL water tower serves about 1,200 people. Its rating is unsourced and logged open.
- **Pollution.** A town's air goes bad where the player zoned heavy industry, the power station and the incinerator, and nowhere else.
- **Saves.** Unchanged; the worker protocol is unchanged, since the household count comes from the catalog the client holds.
- **Lots.** [lots-and-land.md](lots-and-land.md) decides parcels; `isZonedLot` requires every tile of a footprint to carry the lot's zone, at spawn and level-up.
- **Tuning.** The weights, on each kind's first level (`share`), are the dial: raise the duplex and fourplex weights, or zone narrow lots, for variety. The other dial is the pollution scale, which is the coal plant's figure and moves with it. Rules are in [balancing](../game-design/balancing.md#residential-kinds).

## Decided

- A kind drawn by real stock share, over one building per level: a level ladder gave size without variety.
- Weights are national shares; a duplex is one low-density building in forty and shows by taking slivers. The weight is a catalog field if that proves too few.
- Households by catalog count, over simulated households: a home count is for display and the grid draw, not an agent.
- Heavy Industrial is the one new zone, over density zones: what it separates is the player's to decide.
- Industry levels up on demand and room, over land value, which pushed polluting works to a dead end.
- Supply and use in millionths, over thousandths: 1.4 kW rounded to 1 kW was 30% out on the commonest building.
- No malls or big-box stores: an enclosed mall is under 1% of mercantile buildings and a supercentre averages 178,000 sq ft, on a lot no zone depth holds; the superstore at 40,000 sq ft is the largest low-rise retail.
- No supply chains: a plant is a typology and its figures, not a consumer of ore; deeper industry stays in [DESIGN.md](../DESIGN.md).
- Not every industrial type: truck terminals and data centres employ almost nobody per lot, refineries and mines are resource-sited, cold storage is a warehouse drawing four times the power.
- No type picker and no player-placed housing: pillar one.
- No manufactured homes or mobile-home parks, 5.4% of the stock: they belong where land is cheap and need a land-value rule the draw lacks.
- Pacing risk accepted: milestones move; town tests are rerun and their expectations re-read, never loosened.
