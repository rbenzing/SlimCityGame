# Lots and land — design

- **Status:** Draft merged 2026-10-05; first slice built 2026-10-07 (the lot a
  detached house stands on, by the land's standing, kept through every
  level-up); second slice built 2026-10-07 (the plat cut from the street, and
  homes facing it); third slice built 2026-10-07 (the parcel lines on the
  zone lens); fourth slice built 2026-10-07 (the duplex and the fourplex on
  the plat); fifth slice built 2026-10-07 (medium density assembles two
  normal parcels, and the lens draws the plat for the zones whose kinds stand
  on it); sixth slice built 2026-10-07 (replatting holds: the plat is re-cut
  every pass and moves only empty ground); seventh slice built 2026-10-07
  (the inspector's lot line). Not yet built: the other densities' parcels
  (row housing, high density, mixed, commercial) and the 3×3 estate where a
  block is deep
- **Date:** 2026-10-05

## What the player gets

A zoned block is **platted into lots** the way a real subdivision is, and the
lots are the size the land's standing warrants. On cheap land at the edge of
town a low-density street fills with small homes on **half lots**; an
ordinary street with **normal lots**; a good street with **double lots**; and
the best land, by the park or the water, with **estate lots** three times the
normal size, one villa to each. A commercial block plats into the parcels its
format takes, and an industrial estate into the acreage a works needs. The
player still paints a density and lays out the blocks, as pillar one says;
what changes is that the land's value now decides how finely a block is cut,
and a building takes the land it would really take.

## Why it earns its place

Today every detached house, whatever the street, takes a 2×2 lot: 1,600 m²,
0.4 acre, twice the lot a new American house actually sits on and four times
a starter home's. There is no small home for a poor street and no estate for
a rich one, so the land-value field — which the sim computes every pass and
the player can see on a lens — decides whether a lot grows at all but never
what grows there. A level-up then grows the lot (2×2 to 2×3 to 3×3), which
no real house does: lots are platted once and buildings change on them.

Pillars served: **you paint zones, you don't place houses** (the zone and the
land decide the lot, the draw decides the building) and **realism grounded in
published figures**. See [../gdd.md](../gdd.md).

## The standards, and what they are on the tile

A tile is 20 m square: 400 m², 4,306 sq ft, 0.099 acre, 65.6 ft a side. The
figures below are what American zoning codes and the building survey say,
and the tile count each one lands on.

### Residential

| Class, as codes name it         | Minimum lot the codes set                         | Width × depth the codes set         | On the tile       | m²    | Acre |
| ------------------------------- | ------------------------------------------------- | ----------------------------------- | ----------------- | ----- | ---- |
| Small lot / cottage             | 1,400–3,500 sq ft (Houston inside the Loop), 2,500–4,000 in small-lot districts | 25–40 ft × 80–100 ft | **1×1**           | 400   | 0.10 |
| Standard single-family (R-1)    | 5,000–7,200 sq ft (Hatch 5,000; Holtville 6,000; Redlands 7,200) | 50–60 ft × 100 ft    | **1×2**           | 800   | 0.20 |
| Large lot (R-1-15000 class)     | 12,000–15,000 sq ft                               | 80–100 ft × 150 ft                  | **2×2**           | 1,600 | 0.40 |
| Estate (R-1A, 20,000; RE, ½–1 acre) | 20,000–43,560 sq ft (Boise R-1A 20,000; Benbrook RE one acre; Troy 30–40,000, 150 ft wide) | 150 ft × 150–300 ft | **2×3** or **3×3** | 2,400–3,600 | 0.6–0.9 |

The survey agrees with the middle of that table: the median new detached
house in 2022 sat on **8,524 sq ft**, 792 m², which is the 1×2 lot to within
one percent; 65% of new houses in 2023 were on lots under 9,000 sq ft and
40% under 7,000, the highest shares on record, so the normal lot is getting
smaller, not larger
([NAHB on the Census Survey of Construction](https://eyeonhousing.org/2024/07/share-of-smaller-lots-is-at-new-high/)).
Houston cut its by-right minimum from 5,000 to 3,500 sq ft in 1998 and
allows 1,400 sq ft lots in qualifying subdivisions, and nearly 80,000 houses
have gone up on small lots since
([Mercatus](https://mercatus.org/research/policy-briefs/learning-houstons-townhouse-reforms),
[APA](https://planning.org/knowledgebase/resource/9293032)): the half lot
is not a stylised idea, it is where starter homes are built. At the other
end, estate districts run from 20,000 sq ft to five acres
([Boise R-1A](https://cityofboise.org/departments/planning-and-development-services/planning/zoning/zoning-districts/residential-large-lot/),
[Benbrook RE](https://www.zoneomics.com/code/benbrook-TX/chapter_8)); the
game stops at 0.9 acre, since a five-acre lot is a farm's business.

**Setbacks and coverage.** The common single-family envelope is a 20–25 ft
front yard, 5 ft sides and a 20 ft rear, with lot coverage capped at 40–50%
([Mesa, Winter Park, Clyde Hill](https://www.clydehill.org/departments/building/zoning-code---what-can-i-build-on-my-lot-/));
Houston allows 65–80% on its small lots. On a 1×2 lot that is a house of up
to 400 m² of plate behind a 7 m front yard, which is what the house kit's
front-yard rule already draws
([building-types.md](building-types.md#what-the-player-sees)).

**Blocks.** Subdivision regulations plat blocks no longer than 600 ft without a
mid-block path and never over 1,320 ft, two tiers of lots deep with the block
at least 220 ft wide, and lots no deeper than 2.5 to 3 times their width
([Elyria](https://codelibrary.amlegal.com/codes/elyria/latest/elyria_oh/0-0-0-82287),
[Stacy MN](https://codelibrary.amlegal.com/codes/stacy/latest/stacy_mn/0-0-0-18467)).
On the tile: blocks of 9 to 20 tiles between cross streets, lots two deep
either side, and no lot deeper than three tiles for one wide. "Two tiers of
lots deep" is one tier fronting each of the block's two streets, back to
back; it is never two tiers off the same street, since a lot that does not
front a street is not a lot. The game's zoning depth of three tiles from
the road holds one tier: a 1×2 normal lot with a tile of garden behind it,
or a 2×3 estate reaching to the depth.

### Commercial

| Class                         | Minimum lot the codes set                     | Frontage | FAR            | On the tile   |
| ----------------------------- | --------------------------------------------- | -------- | -------------- | ------------- |
| Neighbourhood commercial (C-1) | 8,000 sq ft, capped at 80,000 in some codes   | 70 ft    | 0.05–0.5       | 1×2 to 2×2    |
| General commercial (C-2)      | 8,000 sq ft, no cap; "Main Street" zero front setback | 70 ft | up to 1.5, 2.5 mixed | 2×2 up |
| Strip and supermarket         | by parking: 4–5 stalls per 1,000 sq ft puts the lot at 3–4 × the floor | — | 0.2–0.3 | 3×2 to 5×4 |

([Montgomery County C-2](https://www.montgomeryplanning.org/info/documents/C2_001.pdf),
[Millwood C-1/C-2](https://www.zoneomics.com/code/millwood-WA/chapter_9),
[Burbank](https://www.zoneomics.com/code/burbank-CA/chapter_7)). The
commercial kinds built on 2026-10-02 already sit on these: a corner shop on
1×1, a store on 2×2, the strip on 3×2 to 5×2 and the supermarket on 3×3 to
5×4, each sized from its parking ratio
([building-types.md](building-types.md#the-commercial-kinds)). Nothing in
this feature moves them; what it adds is that a commercial lot is platted
from the block, so a 2×2 store takes two of the block's 1×2 parcels, and a
strip takes a run of them.

### Industrial

| Class                        | Minimum lot the codes set                     | Setbacks                       | On the tile |
| ---------------------------- | --------------------------------------------- | ------------------------------ | ----------- |
| Light industrial (I-1)       | 5,000 sq ft to 1 acre; 1 acre common          | front 25–30 ft, side 10, rear 20–25 | 2×2 to 2×5 |
| Heavy industrial (I-2)       | 1–2 acres; 2 acres common                     | front 35–100 ft, side and rear 50 | 5×4 up   |

([Anchorage I-1](https://www.muni.org/Departments/OCPD/Planning/zoning/Pages/i.aspx),
[Calvert County](https://calvertcountymd.gov/DocumentCenter/View/42270/A8-Industrial-Districts),
[Naples UT](https://naplescityut.gov/wp-content/uploads/2021/02/02-28-Industrial-Zone-I-2020-11-12.pdf)).
The industrial kinds sit on 2×2 to 5×4, an acre at the top, and the heavy
kinds on 4×4 and up; a 2-acre heavy minimum would be 5×4 at the least. This
feature records the standard and leaves the heavy footprints to the epic
that built them, with one change proposed below.

## How it works, for the player

### A block is platted when it is zoned

When the player paints a zone along a street, the painted ground is cut into
**parcels** the way a plat does it: along the street, one frontage at a time,
to the depth the zone's lot takes, with the parcel size set by the **land's
standing** on that frontage. The plat is derived, never stored: it is the
same function the spawner and the zone lens both read, so the lens can draw
the parcel lines the moment the zone is painted and the player sees how the
block will cut before anything grows. The land's standing is the land-value
field, which the player already has a lens for, in four bands:

| Land value on the frontage | Standing   | Low-density lot | Who lives there                           |
| -------------------------- | ---------- | --------------- | ----------------------------------------- |
| under 64                   | poor       | **half, 1×1**   | a small home, a starter house, a cottage  |
| 64–159                     | ordinary   | **normal, 1×2** | a house on the median lot                 |
| 160–223                    | good       | **double, 2×2** | a family home with a yard                 |
| 224 and over               | the best   | **estate, 2×3** | a villa; 3×3 where the block is deep      |

The bands are the land-value field's own quartiles, which the lens already
colours; the thresholds are dials. Land value is what it is today: a diffused
field raised by parks, water, services and quiet and lowered by pollution,
noise and crime, so a poor street is one by a works or a motorway and a good
one is by a park on a quiet road. The field's equilibrium
([../../world-sim/environmental-simulation.md](../../world-sim/environmental-simulation.md#landvalue-fieldidlandvalue--0))
puts the bands where they read: bare clean ground settles at 119, an
ordinary lot; a river bank at 181, a double lot; a park or trees on a quiet
shore carry a tile past 224, an estate; and a block under a works' pollution
sits under 64, half lots. Before the field had that equilibrium it read 255
everywhere within thirty seconds of a new game, and every lot would have
been an estate. A zone painted across a gradient plats
small at one end and large at the other, as a real town does across the
tracks.

### A kind takes the lots it needs

The draw stays what it is ([building-types.md](building-types.md#a-lot-picks-its-building)):
among the zone's kinds that are unlocked and fit, one is drawn by its share
of the real stock. What "fits" now means is **whole parcels**: a building takes
one parcel or **assembles** adjacent ones, and never straddles half of one. A
detached house takes one parcel of whatever size the standing cut; a duplex
or a fourplex takes a normal or a half parcel, which is why the poor street
grows them; a multiplex or a courtyard block assembles two normal parcels
side by side, as a developer buying two lots does; a tower assembles four. The
land a kind takes is the land it would take, and the player reads it on the
lens.

### A house grows on its lot, not past it

A level-up keeps the parcel. A detached house on a normal lot levels up into
a bigger house on the same 1×2: more storeys, a better kit, a higher value,
never a 2×3. Today's catalog grows the lot with the level (2×2, 2×3, 3×3) and
that stops; the detached kinds become four **lot sizes** × three **levels**,
with the level changing storeys and value and the lot fixed at platting. The
same holds for every kind: the parcel is platted once, and what stands on it
improves.

### Land is acquired, and the plat can change

Built 2026-10-07: re-zoning and land value both replat, through the one
re-cut the plat already gets every pass; see
[the plat changes under empty ground](#the-plat-changes-under-empty-ground-built-2026-10-07).
Assembly is built for medium density only.

- **Re-zoning** replats. Paint a block from low to medium density and its
  normal lots pair up into the 2×2 parcels a multiplex takes; the standing
  houses stay until they are bulldozed or abandoned, as they do today, and
  the next growth takes the new parcels.
- **Land value moving** does not replat a parcel with a building on it, since
  the lot is the lot; it replats an **empty** one, so a poor edge that comes
  good grows bigger houses on its empty lots from then on and keeps its small
  ones until they go. A street that falls grows small ones in its gaps.
- **Assembly** is what growth does when a kind needs more than one parcel: it
  takes the parcels, and the lens shows the merged lot. There is no separate
  land market and no price; the land's standing is already in its value, and
  pillar one says the player never buys a lot.

### What the player sees

On the zone lens, the parcel lines: a block cut fine where the land is poor
and coarse where it is good, before anything grows. On the street, the
small homes on their small lots standing close, the villas on theirs standing
apart, and a multiplex plainly on two lots' worth of ground. In the inspector,
a building's lot: "Half lot, 400 m²", "Estate lot, 2,400 m²" (built, see
[the inspector names the lot](#the-inspector-names-the-lot-built-2026-10-07)). And in the
Advisor, nothing new: a poor street is a poor street for reasons the lenses
already show.

## What it interacts with

- **The spawner and the lot-fit draw.** `isZonedLot` and the fit check read
  parcels instead of raw tiles. The draw's weights are unchanged. A kind that
  fits no parcel on a block never grows there, which is how a strip of half
  lots stays a strip of small homes and duplexes.
- **The catalog.** The detached, duplex and fourplex kinds gain a lot-size
  axis (built for all three; the duplex and the fourplex take the half and
  normal lots, upright and turned): the level-1 house exists at 1×1, 1×2,
  2×2 and 2×3, with its storeys, value, residents and draw per level as
  today. Residents stay the household
  of 2.63; a small home holds a small household's fewer rooms, not fewer
  people, until the population model says otherwise.
- **Land value.** Read, never written. The feature adds no feedback into the
  field: a street of villas does not raise its own value by being villas.
  That loop is real and is deferred, see below.
- **The house kit** draws the front yard, the drive and the car from the
  lot plan ([../../art/buildings.md](../../art/buildings.md)); a 1×1 lot gets
  a shallow yard and a parking spot beside the house, a 2×3 a long drive.
- **The zoning depth** is three tiles, one tier of lots fronting the
  street, the deepest of them an estate; the tier behind fronts the street
  behind. A block painted only one tile deep plats half lots only, whatever
  the land, since a normal lot needs the depth.
- **Taxes.** Property tax is on the building as today; a lot has no separate
  value. Deferred with the land market.
- **Saves.** The plat is derived from the zone layer and the land-value field
  at spawn time and stored on the building as its footprint, as every footprint
  is today, so no save layer changes; an old save loads with its 2×2 houses
  standing, as oversized as they were.

## Tuning

- The four standing bands at 64, 160 and 224 on the 0–255 land-value field:
  dials, set so a fresh town with no parks or works plats normal lots.
- The lot per standing per zone: the table above for low density; row
  housing 1×2 always (a townhouse row is platted as one), medium density 2×2
  (two normal parcels; built), high density 2×2 and 3×3 as today.
- The commercial parcel: 1×2 at ordinary standing and 1×1 for the corner
  shop, assembled upward by format as today.
- Proposed with the record, not built here: the heavy industrial minimum
  raised to 5×4, two acres, where it is 4×4.

## What it is not

- Not a land market. No lot prices, no buying, no eminent domain. The
  land's standing is its value, and the player never places a house.
- Not an income simulation. "Poor" and "the best" are the land, not the
  household; there are no wealth classes, wages or rents. A small home on a
  poor street holds an ordinary household.
- Not land value feedback from what is built. A villa does not raise the
  value under it; that loop is deferred to the population model so the
  plat cannot run away with itself.
- Not new zones. The densities are the zones there are; the plat is inside
  them.
- Not a change to the commercial or industrial footprints, which were sized
  from parking and plant on 2026-10-02 and already sit on the standards.
- Not manufactured homes, which the half lot makes possible later and which
  stay in [../../DESIGN.md](../../DESIGN.md) until asked for.

### The plat is cut from the street (built 2026-10-07)

A lot forms from its street, and faces it. The rules, in
`src/world/plat.ts`:

- **A row fronts one side.** Every free tile beside a street fronts it. Where
  two streets border a tile, as on the inside of a bend, it fronts the one
  running longer through the neighbouring tile; a tie goes north, east, south,
  west. A deck overhead and a railway front nothing.
- **A run is cut from one end.** The tiles along a street that front the same
  side, in one zone, are a run. It is cut a frontage at a time into parcels,
  each the largest lot the land value at its first tile warrants that still
  fits the free, zoned ground in from the street, down to the half lot, which
  always fits. A building already standing is a parcel of its own and is
  stepped over, so the cut never moves a house. Round a bend each arm is its
  own run with its own front, and a cul-de-sac is two runs, one down each
  side, with no lot cut across its end.
- **The lot is turned to its street.** An upright catalog entry's `w` is
  the frontage and its `d` the depth. On a street running north to south the lot is its turned
  twin (`res-normal-t-N`, 2×1; `res-estate-t-N`, 3×2), so a normal lot is 20 m
  of frontage by 40 m deep whichever way its street runs. The square lots
  have no twin.
- **Only the row starts a lot.** The rows in from the first, up to the zoning
  depth, are yard behind or beside a lot: no parcel starts there, so a detached
  house is never platted behind another. A tile no grid or free street fronts
  within the depth keeps the first slice's rule, the lot its land warrants.
  The duplex and the fourplex take a half or a normal parcel, upright or
  turned, so a poor street grows small duplexes and fourplexes and a rich one
  grows none: a double or an estate parcel fits no plex.
- **Faces follow.** A home faces the street that borders the most of its edge
  ([buildings.md](../../art/buildings.md#residential-lots)), which is the street
  it was cut from, so a lot on a bend or beside a cul-de-sac turns its door to
  the street it runs along.

### The plat on the lens (built 2026-10-07)

With a low-density or medium-density zone tool in hand the zone grid draws
the plat: an amber outline round every parcel the block cuts into, the
moment the zone is painted and before anything grows. It is the same plat the spawner reads —
one function (`platOf` in `src/world/plat.ts`) over the render mirror's
zone, roads and buildings and the land-value field asked of the worker
while the tool is in hand — so the lines are exactly the lots that will
grow. A standing house is a parcel of its own and keeps no outline; the
rows behind the first, which no parcel starts on, show the grid alone. The
whole plat is cut once, run by run in map order, with a claimed-tile set,
so two streets fronting one corner never cut parcels that overlap; the
spawner cuts it once a pass the same way. The grid draws the plat only for
the zones whose kinds stand on it, low density and medium density; the other
zones' grids show no parcels until their kinds are lotted.

### The duplex and the fourplex on the plat (built 2026-10-07)

The two plex kinds carry the lot axis the detached house has. Each has three
lot variants, one footprint across all three levels: `res-duplex-N` and
`res-fourplex-N` on the normal lot (1×2), `res-duplex-h-N` and
`res-fourplex-h-N` on the half lot (1×1), and `res-duplex-t-N` and
`res-fourplex-t-N` on the normal lot turned (2×1, for a street running north
to south).

- **A half or a normal parcel.** The spawner matches a catalog entry to the
  parcel by lot and footprint, so exactly one variant of each kind matches a
  platted parcel. A half parcel on a poor street (land value under 64) grows
  a 1×1 duplex or fourplex; a normal parcel on a north–south street grows the
  2×1 twin. A double or an estate parcel fits no plex, so a good street grows
  houses and nothing else of the low-density kinds.
- **The draw is unchanged.** The weights stay 1.6 for the duplex and 1.2 for
  the fourplex on each level-1 entry, and one variant per kind matches, so the
  ratios between kinds are what they were.
- **The level never changes the lot.** The level-3 footprint went from 2×2 to
  1×2. A level-up keeps the parcel, as the detached house does; an old save
  keeps a standing 2×2 duplex as its stored footprint.
- **Homes do not change with the lot.** A duplex holds 2 homes and 5
  residents, a fourplex 4 homes and 9, on a half lot as on a normal one: a
  small home holds a small household's fewer rooms, not fewer people.
- **The massing rule is the same.** A duplex body is 60% of each lot axis
  capped at 16 m (12 × 12 m on a half lot, 12 × 16 m on a normal one); a
  fourplex 70% capped at 18 m (14 × 14 m on a half lot).

### Medium density assembles two parcels (built 2026-10-07)

The fifth slice: the multiplex and the courtyard block stand on the plat, and
the plat takes whole parcels only.

- **A normal lot at every standing.** Medium density (zone 7) is platted as
  normal lots, 1×2 (2×1 turned for a street running north to south), whatever
  the land's value: the standing bands are a low-density thing. A strip too
  shallow for a normal lot plats nothing in medium density; it never falls
  back to a half lot, so a block of one-tile depth grows no multiplex.
- **A kind takes whole parcels.** A lotted entry stands where parcels of its
  lot size, all fronting the same street, tile its footprint exactly. A
  detached house, a duplex or a fourplex takes one parcel. A multiplex
  (`res-multiplex-N`) or a courtyard block (`res-medium-N`), lot normal and
  2×2 at every level, assembles two normal parcels side by side, as a
  developer buying two lots does, and never half of one. The lens shows the
  parcels; the building stands across the pair.
- **The level never changes the lots.** The level-3 multiplex went from 2×3 to
  2×2 and the level-3 courtyard block from 3×3 to 2×2, so a level-up keeps
  the two parcels. Units, residents and heights are unchanged: 12 and 24
  homes at level 3. An old save keeps a standing 2×3 or 3×3 block as its
  stored footprint.
- **The draw is unchanged.** The weights stay 0.63 for the multiplex and 0.30
  for the courtyard block. A multiplex body is 13.6 m per tile capped at
  24 m, so 24 × 24 m on 2×2 as before.
- **The lens draws the plat where kinds stand on it.** The zone grid shows
  parcels for low density and medium density, the zones whose kinds are
  lotted, and nothing for the others. Before this slice the lens cut a
  low-density band under every zone tool, which nothing read.

### The plat changes under empty ground (built 2026-10-07)

The sixth slice needs no new machinery: the plat is derived, so it is re-cut
every growth pass from the zone, the roads, the buildings and the land value,
and what it reads changing is what replats.

- **Re-zoning replats the empty ground.** Painting a zone changes only empty
  land, and a building keeps the zone it grew on for life
  (`cmdPaintZone` in `src/sim/worker.entry.ts`). Paint a low-density block
  medium and the standing houses stay on their low-density lots; the empty
  ground is cut into normal parcels that a multiplex assembles in pairs.
- **Land value moving re-cuts empty parcels only.** A built parcel never
  moves, since a standing building is stepped over as a parcel of its own. A
  street that comes good grows bigger lots in its gaps and keeps its small
  houses until they go. A street that falls grows small homes in its gaps.
- **Nothing is stored.** No parcel is saved, so there is nothing to migrate
  and no save layer changes.
- **Proved in `src/sim/growth.test.ts`**, the describe "the plat changes
  under empty ground only".

### The inspector names the lot (built 2026-10-07)

The seventh slice: the building info panel shows a `Lot` row after the Zone
row, for a building whose catalog entry carries a lot.

- **The values.** "Half lot, 400 m²", "Normal lot, 800 m²", "Double lot,
  1,600 m²" and "Estate lot, 2,400 m²". A building assembled from parcels
  reads "Two normal lots, 1,600 m²".
- **It reads the catalog.** `lotLine(entry)` in `src/ui/format.ts` reads the
  entry's lot and footprint. The area is the footprint at 400 m² a tile,
  since the on-screen building carries no footprint of its own.
- **No lot, no row.** A building whose entry has no lot, as a service
  building or a kind not yet lotted, shows no row. The panel is
  `src/ui/InfoPanel.tsx`.

## What is built

The first slice, built 2026-10-07, is the detached house alone; the duplex
and the fourplex followed in the fourth slice, above. The 3×3 estate and the
other densities' parcels are still to build.

- **Eighteen entries, four lots.** The detached kind is the catalog's four lot
  sizes by three levels, the normal and the estate each with a turned twin
  for a street running north to south: `res-half-N` on 1×1, `res-normal-N` on 1×2,
  `res-low-N` on 2×2 (the old ids, so a saved city keeps its houses) and
  `res-estate-N` on 2×3, each entry carrying its `lot`. All three levels of
  a lot share its footprint; a level changes the storeys and the value. The
  3×3 estate where a block is deep waits for the parcel work.
- **The plat is read at the anchor tile.** When growth comes to an empty
  zoned tile it reads the land value there, takes the four bands above
  (`lotForStanding` in `src/shared/lots.ts`) and keeps only the detached
  entries on the largest lot the land warrants that fits. A strip too
  shallow or narrow for the warranted lot plats the next smaller one that
  fits, which is how a one-tile strip still grows half and normal lots, and
  nothing larger than the land warrants is ever platted. The duplex and the
  fourplex joined the plat in the fourth slice, below.
- **A level-up keeps the lot.** The next level is looked up by zone, kind
  and lot, and its footprint is the lot's, so a half-lot house becomes a
  better half-lot house and never a larger one.
- **The body does not shrink with the lot.** A house on a half or a normal
  lot is as wide as one on a double lot, 9.5 m, never above 85% of the lot;
  the estate's long side is 4.75 m per tile. The lot is what changes, and
  with it the yard, the drive and the room between neighbours.
- **What a fresh town plats.** Bare clean ground settles at 119 and plats
  normal lots; the small town the interaction tests grow plats mostly normal
  and half lots, with the odd double and estate lot where the river and the
  park raise the value.
