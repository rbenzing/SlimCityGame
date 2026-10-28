# Lots and land

- **Status:** Built

**Owns:** how a zoned block is platted into lots from its street and the land's standing, which kinds take which parcels, how a building grows or is redeveloped on them, and how the lens and inspector name them. The kerb plat beside free-form roads is [curved-parcels.md](curved-parcels.md).

**Rules:**

- Plat each run of tiles fronting one street, one frontage at a time, from one end, into the largest lot the land value warrants that fits. The plat is derived and never stored. `[R-world-039]`
- Pick a detached house's lot by land value: half under 64, normal 64–159, double 160–223, acre 224 and over. A level-up keeps the lot; no building grows its lot. `[R-world-037]`
- A kind takes whole parcels fronting one street, never half of one. Medium density, row housing and the dense and commercial zones plat normal lots at every standing. `[R-world-037]` `[R-world-042]`
- A commercial or dense kind (no `lot`) takes whole lots along its frontage; a level that grows its footprint is a redevelopment onto free lots only. `[R-world-042]`
- A house on a half or normal lot at land value 224 and over converts to a plex of its own zone at 2% a year, on the same lot. `[R-world-038]`
- Re-cut only empty ground: a standing building is a parcel the cut steps over, and no two parcels share a tile. `[R-world-039]`
- The zone lens draws the same plat function the spawner reads, for the platted zones only. `[R-world-039]` `[R-world-041]`
- Read land value, never write it: a street of villas does not raise its own value.

**Numbers:** every standard below is derived in [the sources](../sources/lots-and-land.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Tile | 20 (400 m², 4,306 sq ft, 0.099 acre, 65.6 ft a side) | m | dial: `TILE_METERS` `[R-world-001]` |
| `LOT_STANDING_FLOOR` poor / ordinary / good / best | 64 / 160 / 224, on the 0–255 land-value field | value | dial, the field's quartiles |
| Half lot | 1×1, 400 m², 0.10 acre | tiles | [residential standards](../sources/lots-and-land.md#residential-standards) |
| Normal lot | 1×2, 800 m², 0.20 acre | tiles | same; NAHB median new lot 8,524 sq ft (792 m²) |
| Double lot | 2×2, 1,600 m², 0.40 acre | tiles | same |
| Estate lot | 2×3, 2,400 m², 0.6 acre | tiles | same |
| Acre lot | 3×3, 60 m by 60 m, 3,600 m² (38,750 sq ft, 0.89 acre) | tiles | [the acre lot](../sources/lots-and-land.md#the-acre-lot) |
| Lot area in the inspector | 400 m² a tile | m² | `lotLine` |
| Bare clean ground | settles at 119 (an ordinary lot) | value | [the field](../world-sim/environmental-simulation.md#landvalue-fieldidlandvalue--0) |
| River bank | 181 (a double lot) | value | same |
| Zoning depth | 3 tiles, one tier of lots fronting the street | tiles | dial |
| Medium-density, row and dense zones | normal lot at every standing | — | dial |
| Low commercial on a strip one tile deep | half lot | — | dial |
| Commercial body fill | 13.6 m of each 20 m tile, 46% of the lot, never sized from parking | m | [commercial standards](../sources/lots-and-land.md#commercial-standards) |
| Store remodel in place | 3–5% a year (NACS 2.8% in 2023) | % | [frontage lots](../sources/lots-and-land.md#frontage-lots-for-commercial-and-dense-kinds) |
| Plex draw weights | duplex 1.6, fourplex 1.2 on each level-1 entry | share | catalog |
| Plex homes and residents | duplex 2 homes 5 residents; fourplex 4 homes 9, on any lot | — | catalog |
| Household | 2.63 residents | people | catalog |
| Multiplex / courtyard draw | 0.63 / 0.30 | share | catalog |
| Multiplex / courtyard homes at level 3 | 12 / 24 | homes | catalog |
| Multiplex body | 13.6 m a tile, capped at 24 m (24 × 24 m on 2×2) | m | [sizes](../sources/lots-and-land.md#medium-density-multiplex-sizes) |
| Duplex / fourplex body | 60% capped at 16 m / 70% capped at 18 m of each lot axis | m | same |
| House body | 9.5 m across the front, at most 85% of the lot; estate 4.75 m a tile; acre 14.25 m a side (about 4,400 sq ft) | m | same |
| Row on a normal lot | 3 homes, 8 residents at every level; 7, 9, 11 m at 2, 3, 3.5 storeys; 15 homes an acre (net 11–25) | — | [row housing](../sources/lots-and-land.md#row-housing) |
| Row draw weight | 1.6 on level 1 | share | catalog |
| Mid-rise first level | five storeys on one normal lot, 17 homes | — | [where a block starts](../sources/lots-and-land.md#where-a-block-starts) |
| Shopfront flats first level | four storeys on one lot, 17 jobs under 10 homes | — | same |
| Tower | 2×2, 2×2, 3×3; site at least 130 ft (39.6 m) frontage | tiles | same |
| Teardown chance | 2% a year; a game year is 72,000 ticks | % | [teardown](../sources/lots-and-land.md#teardown-to-a-plex) |
| Construction time of the plex | 100 ticks | ticks | dial |
| Heavy industrial minimum | 2 acres would be 5×4; stays 4×4 | tiles | [industrial](../sources/lots-and-land.md#industrial-standards) |

**Code:**

- `src/shared/lots.ts` `LOT_SIZES`, `LOT_STANDING_FLOOR`, `LOT_EXTENT`, `lotForStanding`, `PLATTED_ZONES`, `lotsOfZone`, `warrantedLot`, `platCandidates`: the ladder and which zones plat.
- `src/world/plat.ts` `platOf`, `parcelsAnchoredAt`, `takesWholeParcels`, `platReaches`, `takesFrontageLots`: the one plat function and what a kind may take.
- `src/sim/growth.ts` `tryLevelUp`, `tryConvert`, `spawnCandidates`, `drawKind`: the lot-fit draw, level-up keeping a lot, redevelopment, teardown to a plex.
- `src/sim/worker.entry.ts` `cmdPaintZone`: a building keeps the zone it grew on.
- `src/render/zonegrid.ts` `setParcels`: the amber outline of each parcel.
- `src/main.ts` `rebuildPlat`: the plat under a ploppable in hand.
- `src/ui/format.ts` `lotLine`: the inspector's Lot row; `src/ui/InfoPanel.tsx`: the panel.

**Tests:**

- `src/shared/lots.test.ts` — the bands, lot extents, zone ladders.
- `src/world/plat.test.ts` — runs cut from one end, bends, cul-de-sacs, no shared tile, whole parcels, frontage lots.
- `src/sim/growth.test.ts` — the lot a house stands on, level-up keeping it, redevelopment, teardown, "the plat changes under empty ground only".
- `src/ui/format.test.ts` — the lot line text.

**Open:**

- Industrial lots are too shallow for the yard the heavy kinds are given; deeper lots in the lot layout (truck courts run 120–135 ft) are a lots-and-land change.
- Not built, by choice: land market, wealth classes, land-value feedback from what is built, manufactured homes.

## Why the rules are what they are

### What the player gets

A zoned block is platted into lots the way a real subdivision is, and the land's standing sets their size. Cheap edge land fills with small homes on half lots, ordinary streets with normal lots, good streets with double lots. The best land, by the park or the water, gets acre or estate lots, one villa each. The player still paints a density; land value now decides how finely a block is cut.

Before this, every detached house took a 2×2 lot, 1,600 m², 0.4 acre, twice the lot a new American house sits on. Land value decided whether a lot grew, never what grew. A level-up grew the lot, which no real house does: lots are platted once and buildings change on them. It serves the pillars that you paint zones and never place houses, and that realism is grounded in published figures ([gdd](../game-design/gdd.md)).

### A block is platted when it is zoned

Painting a zone cuts the painted ground into parcels along the street, to the depth the zone's lot takes. The land value on the frontage picks the size. The plat is the same function the spawner and the zone lens read, so the lens draws the lines before anything grows.

| Land value | Standing | Low-density lot | Who lives there |
| ---------- | -------- | --------------- | --------------- |
| under 64 | poor | half, 1×1 | a small home, a starter house, a cottage |
| 64–159 | ordinary | normal, 1×2 | a house on the median lot |
| 160–223 | good | double, 2×2 | a family home with a yard |
| 224 and over | the best | acre, 3×3; estate, 2×3, where only two tiles of frontage are free | a villa on its acre |

The bands are the land-value field's own quartiles, which the lens already colours. The field is diffused, raised by parks, water, services and quiet, lowered by pollution, noise and crime. A poor street is one by a works or a motorway; a good one is by a park on a quiet road. Its equilibrium puts bare clean ground at 119, a river bank at 181, a park or trees on a quiet shore past 224, and a block under a works' pollution under 64. Before the field had that equilibrium it read 255 everywhere within thirty seconds of a new game, and every lot would have been an estate. A zone painted across a gradient plats small at one end and large at the other, as a real town does across the tracks.

The standards each lot matches, the survey, setbacks, block lengths and commercial and industrial codes are in [the sources](../sources/lots-and-land.md). A block is two tiers deep, one tier fronting each of its two streets, back to back. Zoning depth is three tiles, so one tier holds a 1×2 normal lot with a garden tile behind, or a 2×3 estate reaching the depth. A block painted one tile deep plats half lots only, whatever the land, since a normal lot needs the depth.

### The plat is cut from the street

A lot forms from its street and faces it.

- **A row fronts one side.** Every free tile beside a street fronts it. Where two streets border a tile, as inside a bend, it fronts the one running longer through the neighbouring tile; a tie goes north, east, south, west. A deck overhead and a railway front nothing.
- **A run is cut from one end.** The tiles along a street that front the same side, in one zone, are a run. It is cut a frontage at a time, each parcel the largest lot the land value at its first tile warrants that still fits the free, zoned ground in from the street, down to the half lot, which always fits.
- **A standing building is a parcel of its own** and is stepped over, so the cut never moves a house. Round a bend each arm is its own run, and a cul-de-sac is two runs, one down each side, with no lot cut across its end.
- **The lot is turned to its street.** An upright catalog entry's `w` is the frontage and its `d` the depth. On a street running north to south the lot is its turned twin (`res-normal-t-N`, 2×1; `res-estate-t-N`, 3×2), so a normal lot is 20 m of frontage by 40 m deep whichever way its street runs. The square lots have no twin.
- **Only the row starts a lot.** The rows behind the first, up to the zoning depth, are yard: no parcel starts there, so a house is never platted behind another. A tile no street fronts within the depth keeps the lot its land warrants.
- **Faces follow.** A home faces the street that borders most of its edge ([buildings.md](../art/buildings/residential-lots.md)), the street it was cut from.

The whole plat is cut once, run by run in map order, with a claimed-tile set, so two streets fronting one corner never cut overlapping parcels. The spawner cuts it once a pass the same way.

### A kind takes the lots it needs

The draw stays what it is ([building-types.md](building-types.md#a-lot-picks-its-building)): among the zone's kinds that are unlocked and fit, one is drawn by its share of the real stock. "Fits" now means whole parcels: a building takes one parcel or assembles adjacent ones, never half of one. A kind that fits no parcel on a block never grows there, so a strip of half lots stays small homes and duplexes. Weights are unchanged.

- A detached house takes one parcel of whatever size the standing cut.
- A duplex or fourplex takes a half or a normal parcel, upright or turned, so a poor street grows small plexes and a rich one none: a double or estate parcel fits no plex.
- A multiplex or courtyard block assembles two normal parcels side by side, as a developer buying two lots does. A tower assembles four.

### The detached house and the plexes

The detached kind is five lot sizes by three levels, the normal and estate each with a turned twin: `res-half-N` on 1×1, `res-normal-N` on 1×2, `res-low-N` on 2×2 (the old ids, so a saved city keeps its houses), `res-estate-N` on 2×3, `res-acre-N` on 3×3. Each entry carries its `lot`; the three levels share its footprint, and a level changes storeys and value.

- Growth reads the land value at the anchor tile, takes the four bands and keeps only the entries on the largest lot that fits. A strip too shallow or narrow plats the next smaller lot, so a one-tile strip still grows half and normal lots.
- A level-up looks up the next level by zone, kind and lot. A half-lot house becomes a better half-lot house, never a larger one.
- The body does not shrink with the lot: yard, drive and room between neighbours change instead.
- A fresh town plats mostly normal lots; the interaction-test town plats normal and half lots with the odd double and estate where river and park raise the value.
- A plex has three variants: normal (1×2), half (1×1) and normal turned (2×1) for a street running north to south. The spawner matches an entry to the parcel by lot and footprint, so exactly one variant of each kind matches.
- The level never changes the lot. The level-3 plex footprint went from 2×2 to 1×2, and an old save keeps a standing 2×2 duplex as its stored footprint.
- Homes do not change with the lot: a small home holds a small household's fewer rooms, not fewer people, until the population model says otherwise.

### Medium density and row housing

Medium density (zone 7) plats normal lots, 1×2 or 2×1 turned, whatever the land's value. The standing bands are a low-density thing. A strip too shallow for a normal lot plats nothing and never falls back to a half lot, so a one-tile block grows no multiplex.

A lotted entry stands where parcels of its lot size, all fronting one street, tile its footprint exactly. The multiplex and courtyard block are lot normal and 2×2 at every level. The level-3 multiplex went from 2×3 to 2×2 and the courtyard from 3×3 to 2×2, so a level-up keeps the two parcels; units, residents and heights are unchanged. An old save keeps a standing 2×3 or 3×3 block as its stored footprint.

Row housing (zone 6) is platted like medium density. A townhouse row (`res-medium-row-N`, or the turned `res-medium-row-t-N`) takes one normal parcel at every level. It was 1×2, 1×4 and 1×6 by level, which broke "a level keeps its lot". It holds three homes at every level; the level adds storeys, never homes or length. A long terrace is neighbouring parcels in a run, each building a run of three with side yards between runs. The derivation is in [the sources](../sources/lots-and-land.md#row-housing).

The lens draws the plat where kinds stand on it: low density, row housing, medium density, low and high commercial, high density and mixed use (`PLATTED_ZONES`). Industrial and farm grids show no parcels. A standing house keeps no outline, and the rows behind the first show the grid alone.

### A house grows on its lot, not past it

A level-up keeps the parcel. A detached house on a normal lot levels up into a bigger house on the same 1×2: more storeys, a better kit, a higher value, never a 2×3. The parcel is platted once; what stands on it improves. The same holds for every home built on a parcel.

### Commercial and dense land is cut into frontage lots

Low commercial (zone 3), high commercial (4), high density (2) and mixed use (8) are cut into normal lots at every standing. Low commercial falls back to a half lot on a strip one tile deep, so a corner shop still grows there. Real sites intensify by assembling neighbouring lots, not by growing in place, hence redevelopment; the evidence and the case for the normal lot are in [the sources](../sources/lots-and-land.md#frontage-lots-for-commercial-and-dense-kinds).

- **A building takes whole lots along its frontage.** A catalog entry with no `lot` stands where whole lots tile its frontage (`takesFrontageLots`): every lot it touches fronts the same street, lies wholly within its width and starts at its front edge. It never takes half a lot's frontage.
- **Depth.** Where the building is shallower than its lots the rest is its yard, for parking and service. Where it is deeper it runs into the unparcelled ground behind.
- **Turned to the street.** On a street running north to south these buildings stand at a quarter turn; the catalog has no turned twins for them.
- **A level-up that grows is a redevelopment.** One that keeps its footprint improves in place. One that grows must take whole lots by the same rule, only where free, the old building's ground part of it. A fast-food restaurant becomes a restaurant on two lots only when the lot beside it is empty.
- **Either neighbour.** A level-up growing along its street may take the free lots on either side, keeping its street edge and trying its own corner first. Where both neighbours stand, it waits.
- **What does not change.** Houses, plexes, rows and medium-density blocks tile their parcels exactly. Industrial and farm zones are not platted. The catalog footprints and draw weights stand.

### A block starts on one lot

A building can start on less ground and take more as it grows; each kind's first level matches the smallest site it is really built on ([sources](../sources/lots-and-land.md#where-a-block-starts)).

- Mid-rise flats start on one normal lot, then assemble a second (2×2) and a third (3×3).
- Shopfront flats start on one normal lot and grow to 2×2 and then 3×3.
- The tower stays 2×2, 2×2, 3×3: its site wants two tiles of frontage.
- The multiplex and courtyard building keep their two lots at every level: they take lots wider than one.
- Commercial and industrial kinds already start small and grow by level.

### The plat changes under empty ground

The plat is re-cut every growth pass from the zone, roads, buildings and land value, and what it reads changing is what replats. Nothing is stored, so no save layer changes.

- **Re-zoning replats the empty ground.** Painting changes only empty land, and a building keeps the zone it grew on for life. Paint a low-density block medium and the houses stay; the empty ground is cut into normal parcels a multiplex assembles in pairs.
- **Land value moving re-cuts empty parcels only.** A street that comes good grows bigger lots in its gaps and keeps its small houses until they go; a street that falls grows small homes in its gaps.
- **Assembly is what growth does** when a kind needs more than one parcel. There is no land market and no price: the land's standing is already in its value, and the player never buys a lot.

### A small house on prime land becomes a plex

A house is a teardown when it is a small share of what the property is worth ([sources](../sources/lots-and-land.md#teardown-to-a-plex)). Land value carries no money scale, so the share is read off the plat. A detached house on a half or normal lot whose land has reached the estate band, 224 and over, is a small house on an estate's land. That land only occurs beside a park, trees or the shore on a quiet clean street: the city's prime ground.

- **It becomes a plex.** The house comes down for a duplex or fourplex on the same lot, drawn by their shares as any lot is, and starts at level 1. A house rebuilt as a bigger house is what a level-up already is, so conversion is only to a plex. The lot never changes.
- **The pace.** Each such house converts with a 2% chance a year, so the town turns over its prime small houses over decades. Like a level-up, the plex needs spare supply for the homes it adds, and waits for it.
- **Only within the zone.** A building keeps its zone, so a house becomes the plexes its low-density zone grows. It never becomes a multiplex, and a block of flats is never torn down for a bigger one.
- **The player sees** a house come down and a plex go up on its lot, under construction for the usual 100 ticks; the inspector names its kind and lot.

### The acre lot

The best land is cut into a 3×3 lot where its run has three tiles of frontage free. Land at 224 and over warrants the acre, so a run on the best land is cut into acres, and a stretch only two tiles wide, between a standing house and the run's end, into a 2×3 estate. The acre is square, so it has no turned twin.

It has the same three levels as the estate, one storey then two, with the same household. The rest of the lot is lawn and drive. A house on an acre is not torn down for a plex, as an estate's is not: no plex fits it.

### The inspector names the lot

The building info panel shows a `Lot` row after the Zone row, for a building whose catalog entry carries a lot.

- The values: "Half lot, 400 m²", "Normal lot, 800 m²", "Double lot, 1,600 m²", "Estate lot, 2,400 m²", "Acre lot, 3,600 m²". An assembled building reads "Two normal lots, 1,600 m²".
- `lotLine(entry)` reads the entry's lot and footprint, at 400 m² a tile, since the on-screen building carries no footprint of its own.
- A building with no lot, as a service building, shows no row.

### What it interacts with

- **The spawner.** `isZonedLot` and the fit check read parcels instead of raw tiles.
- **The catalog.** The detached, duplex and fourplex kinds carry a lot axis. A small home holds a small household's fewer rooms, not fewer people.
- **Land value.** Read, never written; the feedback loop is real and deferred with the population model, so the plat cannot run away with itself.
- **The house kit** draws the front yard, drive and car from the lot plan ([buildings.md](../art/buildings/README.md)): a 1×1 lot gets a shallow yard and a parking spot beside the house, a 2×3 a long drive.
- **Taxes.** Property tax is on the building as today; a lot has no separate value.
- **Saves.** The plat is derived at spawn time and stored on the building as its footprint, so no save layer changes; an old save loads with its 2×2 houses standing.
- **Parking.** Whether a lot holds its code parking is [parking-to-code.md](parking-to-code.md)'s; this feature moves no footprint.

## Decided

- Platted lots with a lot axis in the catalog, over growing the lot with the level: no real house does.
- Redevelopment onto assembled lots for commercial and dense kinds, over growing in place: real sites intensify by assembly.
- Land value as the teardown trigger, over a money scale: the sim has none.
- No land market, no lot prices, no eminent domain: the land's standing is its value, and the player never places a house.
- No income simulation: "poor" and "the best" describe the land, not the household; there are no wealth classes, wages or rents.
- No new zones: the densities are the zones there are, the plat is inside them.
- Manufactured homes, which the half lot makes possible later, stay in [DESIGN.md](../DESIGN.md) until asked for.
