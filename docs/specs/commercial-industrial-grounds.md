# Commercial and industrial grounds

- **Status:** Agreed

**Owns:** what stands on a shop's, an office's and a works' lot besides the building and its car park: lights, signs, planting, walks, furniture, refuse and fences; how roomy that lot is before and after the town is a city; and the purpose-built kinds added with it. The car park is [parking-to-code.md](parking-to-code.md); the kits are [rci-kits.md](rci-kits.md).

**Rules:**

- Furnish every commercial and industrial lot from one plan, as a home's lot is: lights, a sign, planting, a walk to the door, a bench and a bin, a refuse enclosure, and a fence round a works' yard. `[R-render-048]`
- Lay a piece only where the lot has room, in a fixed order of need; omit what does not fit, and never move the building or a stall for one. `[R-render-048]`
- Keep every piece off stalls, aisles, drives, walks, berths and doors, and off the street's footway. A pole stands in an island or a planted strip. `[R-render-048]`
- Below Small City, grow a commercial or industrial kind on the first lot of its ladder that holds its building, its code car park and its grounds. `[R-world-055]`
- From Small City on, a dense kind, and any kind on land of the best standing, takes its compact lot; a building already standing keeps its lot. `[R-world-055]`
- A lot too small for the roomy form still grows the compact one: grounds are never a prerequisite for growth. `[R-world-055]`
- Add a kind only with its real size, site and marks from [the sources](../sources/commercial-industrial-grounds.md#the-new-kinds-as-they-stand-on-the-ground), and its jobs and draw by the catalog's method. `[R-world-043]`

**Numbers:** each is derived in [the sources](../sources/commercial-industrial-grounds.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `LOT_LIGHT_HEIGHT_M` | 7.6 (25 ft) | m | lighting ordinances |
| `LOT_LIGHT_NEAR_HOMES_M` | 4.3 (14 ft), within 30 m of a residential zone | m | same |
| `LOT_LIGHT_SPACING_HEIGHTS` | 4 mounting heights (30 m, 17 m near homes) | × | dial inside vendors' 2–5 |
| Lot light from a residential lot line | its own height | m | a Texas city's code |
| `LOT_PERIMETER_STRIP_M` | 1.5 (5 ft), where the car park holds ten spaces or more | m | Clallam County WA |
| `LOT_HOME_BUFFER_M` | 3.0 (10 ft), on a side that abuts a residential zone | m | Lindon UT |
| Shrub spacing in a strip | 1.5 | m | dial |
| Frontage tree spacing | 9 | m | dial |
| `MONUMENT_SIGN` | 1.8 high, 2.3 m² a face, 1.5 from the street line | m | Paoli IN |
| `PYLON_SIGN` | 7.6 high; 0.46 m² a metre of frontage, 14 m² at most; 0.6 from lot lines | m | Murray UT |
| Pylon, on a frontage of | 60 and over, for a strip, a market or a filling station | m | dial |
| Free-standing signs | one a street frontage | — | sign codes |
| `LOT_WALK_WIDTH_M` | 1.5 (60 in), street footway to the door | m | NACTO; ADA least 0.91 |
| Bench / litter bin | 1.8 by 0.6 / 0.6 across, beside the door, off the walk | m | dial |
| `BIKE_SPACE_M` | 0.6 by 1.8, two a lot, 1.5 to manoeuvre | m | Portland OR |
| `REFUSE_ENCLOSURE_M` | 2.4 by 3.7 inside, walls 1.8, gate 3.7, apron 2.4 | m | Brooklyn Park MN, Selma CA, Edmonds WA |
| Works' yard fence | 2.4 chain link, posts 3.05 (10 ft) apart at most, a gate the aisle's width and 7.3 at most | m | dial; every industrial kind but flex |
| Monument sign's body / pylon's cabinet | 2.0 by 0.4 / 4.0 tall | m | dial |
| Refuse enclosure, outside | 4.1 by 2.6 | m | the inside plus its walls |
| Bicycle rack | two spaces in a row, 3.6 by 0.6 | m | Portland OR |
| Bench and bin from a door | 0.2 beyond its 3 m clear | m | dial |
| Lot furniture ceiling | 600 a lot, its trees not counted | triangles | `geometrybudget.test.ts` |
| Entrance bed | 1.2 deep along the front wall, clear of doors | m | dial |
| Roomy lot, building over lot | 0.28 retail, 0.32 industry, 0.64 office, at most | ratio | Metropolitan Council medians |
| Compaction starts | Small City (8,000 residents), land value 224 and over | — | dial: the dense kinds' own unlock |

**Code:** the furniture is built: `src/shared/lotgrounds.ts` `planLotGrounds` the plan (pure, beside `lotlayout.ts`); `src/render/lotplan.ts` `groundsFactsFor` which sides face homes; `src/render/lotgrounds.ts` `LotGroundsRenderer` the pools. The roomy lots are built: `src/shared/roomylots.ts` `ROOMY_LOT_TILES` each kind's roomy lot; `src/data/catalog.json` the lot variants, appended; `src/shared/lotlayout.ts` the strip inside the lot lines; `src/sim/growth.ts` `growsRoomy`, `footprintsOf` the lot choice. Five kinds are built, the auto repair shop, the convenience store, the pharmacy, the machine shop and self-storage: `src/data/catalog.json`; `src/shared/parkingcode.ts` the repair shop's bays, a storage yard's units and each kind's spaces; `src/shared/floorarea.ts` `STORAGE_ROW_COVER` the floor in rows; `src/shared/lotlayout.ts` `sideWindow` the pharmacy's lane; `src/render/buildingkit.ts`, `src/render/archetypes.ts` their kits. To be built: the other five.

**Tests:** `src/shared/lotgrounds.test.ts`, `src/render/lotgroundsplan.test.ts` every catalog lot's keep-outs, the order of omission, short poles beside homes; `src/render/lotgrounds.test.ts` the pools; `src/render/geometrybudget.test.ts` the ceiling. `src/shared/roomylots.test.ts`, `src/shared/roomylayout.test.ts` every roomy lot laid to code with its strip; `src/sim/roomygrowth.test.ts` the lot chosen either side of Small City and the fall back to the compact lot; `src/sim/catalogsave.test.ts` an old save loads unchanged on the longer catalog. `src/shared/commercialkinds.test.ts`, `src/shared/storekinds.test.ts` each new kind's catalog figures against the sources; `src/render/lowkindskit.test.ts`, `src/render/morekindskit.test.ts` their kits clear of stalls, aisles and lot lines.

**Open:** five of the ten kinds are not built, and a car wash's cars a day and a contractor's yard's draw weight were not found; a repair shop's accessible spaces are counted from the middle of its street face, not its office door, and its bay glass glows only faintly at night; a storage yard's roomy lot is mostly lawn, where a real one fills its site with rows, and its gate has no keypad post; a pharmacy's lane is paved like its car park and carries no marking; a works that levels up on a full block builds up on the lot it has and loses its grounds; a bank's and a medical office's site sizes were not found; no light level is modelled. A lot is planned when it is drawn, so homes zoned beside it later do not shorten its poles. A tight strip or shop has no room for a refuse enclosure.

## Why the rules are what they are

### A lot is a property

A home's lot has a drive, a fence and trees, so a street of homes reads as properties. A shop's lot has a building, a car park and its island trees, and nothing else. What a real site adds is small and regular, and codes size most of it.

One plan lays it, in `src/shared`, from the lot's layout: the body, the stalls, the aisles, the islands, the drive and the doors. The renderer draws what the plan returns and decides nothing.

### What goes where

- **Lights** stand in the car park's islands first, then its perimeter strip, four mounting heights apart. Within 30 m of homes the pole is the short one.
- **The sign** stands in the frontage strip beside the drive, on the side traffic arrives from. A long strip, a market and a filling station carry a pylon; the rest a monument.
- **Planting.** Shrubs fill the perimeter strip; trees stand along the street frontage; a bed runs along the front wall between doors. A side facing homes gets the deeper buffer and a tree row.
- **The walk** runs from the street's footway to the main door, straight where it can, and crosses an aisle at right angles on a painted crossing. Where a row of stalls closes the frontage it passes through the row's planted island nearest the door, which is paved for it and loses its tree.
- **A kit's own pieces count.** Where a kind's kit already stands a sign, a refuse enclosure or a cart corral, the plan lays no second one and keeps clear of it.
- **Bench, bin and bicycles** stand beside the main door, off the walk's clear width.
- **Refuse** goes behind or beside the building, never on a street face, its gate on an aisle or the truck court.
- **A works' yard** is fenced on its lot line behind the building's front, with a gate at its drive. Its staff car park stays outside the fence where the lot allows.

### What is left out, and in what order

A piece that does not fit is omitted. The order kept is the order of need: walk, sign, lights, refuse, perimeter planting, entrance bed, bench and bin, bicycles. A one-tile corner shop keeps its walk, a wall sign it already has, and a bin.

### Roomy lots until the town is a city

At the game's body fill a one-storey shop covers 46% of its lot. The median US retail site is built to a ratio of 0.28, industry 0.32. The difference is the car park, the strips and the yard.

The catalog already holds, for the kinds whose car park did not fit, larger lots for the same building. This spec makes that the rule for every commercial and industrial kind: a ladder of lots, the first rung of which holds the building, the code car park and the grounds at or under the median ratio.

Growth takes that roomy rung while the town is below Small City, wherever the zoned block has the room. From Small City the dense kinds unlock, and land of the best standing is worth building tight: there a new building takes the compact lot and parks by its kerb credit or a garage. Nothing already standing is moved or shrunk.

A block too shallow or too short for the roomy rung grows the next rung down, and at last the compact lot, as it does now. A first town never waits on grounds.

A lot stands with its long side on its street. The platted zones always turned their lots; industry did not, so on a north-south street a works' roomy lot never fitted. Each rung is now tried long side on the street first, then the other way, before the next rung down. A lot larger than its building never lays a loading berth across a car park aisle.

Each kind's roomy lot is [measured on the layout](../sources/commercial-industrial-grounds.md#the-roomy-lot-of-each-kind). On a roomy rung the car park keeps a 1.5 m planted strip inside every lot line. A kind already under the target (the filling station, the chemical works) keeps its lot. A level-up takes the next level's roomy lot where the ground beside it is free, and otherwise builds up on the lot it has, as before: it never gives ground back and is never refused for want of grounds.

Roomy lots hold fewer jobs a tile: a zone keeps about three fifths of what it held, so the same town needs two thirds as much zoned land again for its shops and works. That is the price of the request, and the Demand panel shows it as room, not as a fault.

### More kinds

Ten kinds are named in [the sources](../sources/commercial-industrial-grounds.md#the-new-kinds-as-they-stand-on-the-ground) with their real size, site and marks: the auto repair shop, the quick lube, the car wash, the convenience store, the pharmacy, the bank branch, the medical office, self-storage, the contractor's yard and the machine shop. The first seven are low commercial; the last three are industry.

Each enters the catalog as existing kinds did: jobs from floor area per worker, utilities and noise from the same surveys, a draw weight from establishment counts. A kind with no derivation is not added.

The first two are derived in [the sources](../sources/commercial-industrial-grounds.md#the-auto-repair-shop-and-the-convenience-store-in-the-catalog), three levels each, from Small Town on so that a first town draws what it did:

- **The auto repair shop** is a row of roll-up bay doors 3.7 m wide on its street face, three to eleven of them, with a glazed office and its door at one end, a sign band over the bays, a tyre rack and a waste-oil tank on the side wall, and customers' cars on the lot. It has no shopfront canopy.
- **The convenience store** is a glazed front the width of the building under a bright canopy band, an ice locker and a propane cage against the front wall, bollards along the front walk, and condensers on the roof.

Three more are [derived the same way](../sources/commercial-industrial-grounds.md#the-pharmacy-the-machine-shop-and-self-storage-in-the-catalog):

- **The pharmacy** is a large one-storey shop with its entrance in a taller corner tower, a sign band on two faces, and on one side wall a drive-through window under a canopy on two posts, over a lane that starts at the edge of the lot's drive and holds three cars clear of the car park's aisles.
- **The machine shop** is a small metal-sided works with no windows: grade-level roll-up doors and an office door on the street face, a short sign, an exhaust fan on the roof, a scrap bin in its fenced yard.
- **Self-storage** is not one building but rows on a paved yard: one-storey ranges about 8 m wide, each long wall a run of roll-up doors 3 m apart, with 7.3 m drives between them and a 7.3 m cross drive along the street end that every row drive opens onto. A small office is the street end of the first row; one fence runs along the yard's street face with one gate, a drive wide, beside the office. It owes no loading berth: a tenant loads at the unit's own door.

Their roomy lots are measured and checked as every other kind's; a pharmacy's must hold its lane too. A repair shop is one storey with no window above its doors, its walls light so the doors read; the walk, the bench and the bin go to its office door, since the bay row is a door from end to end.

A kind also varies in plan, not only in colour: the building at the street or behind its car park, a strip in a line or an L, storage in rows, a shop with a detached canopy. The variant comes from the lot's id, as the palette does.

## Decided

- One shared plan over a kit part per kind: the pieces are the same on every lot, and a plan can be tested against the layout's keep-outs.
- Omit over shrink: a half-size sign or a 0.6 m walk reads as a fault.
- Small City over a land-value test alone: the player's words were "unless the size is city", and the dense kinds unlock there already.
- Standing buildings keep their lots over a re-plat at the milestone: a town must not rearrange itself the day it grows.
- Roomy lots mean fewer jobs a tile, so a town needs more commercial and industrial land for the same work. The figure is measured before the lot rule is built and reported to the player.
