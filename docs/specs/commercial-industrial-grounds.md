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
| Works' yard fence | 2.4 chain link, a 7.3 gate at the drive | m | dial |
| Entrance bed | 1.2 deep along the front wall, clear of doors | m | dial |
| Roomy lot, building over lot | 0.28 retail, 0.32 industry, 0.64 office, at most | ratio | Metropolitan Council medians |
| Compaction starts | Small City (8,000 residents), land value 224 and over | — | dial: the dense kinds' own unlock |

**Code:** to be built. `src/shared/lotgrounds.ts` the plan (pure, beside `lotlayout.ts`); `src/render/lotgrounds.ts` the pools; `src/sim/growth.ts` the lot choice; `src/data/catalog.json` the ladders and kinds.

**Tests:** to be built: the plan's keep-outs for every catalog kind and lot; the order of omission; the lot chosen either side of Small City; each ladder's first roomy rung.

**Open:** the new kinds' jobs, utilities and draw weights are not derived yet; a bank's and a medical office's site sizes were not found; no light level is modelled.

## Why the rules are what they are

### A lot is a property

A home's lot has a drive, a fence and trees, so a street of homes reads as properties. A shop's lot has a building, a car park and its island trees, and nothing else. What a real site adds is small and regular, and codes size most of it.

One plan lays it, in `src/shared`, from the lot's layout: the body, the stalls, the aisles, the islands, the drive and the doors. The renderer draws what the plan returns and decides nothing.

### What goes where

- **Lights** stand in the car park's islands first, then its perimeter strip, four mounting heights apart. Within 30 m of homes the pole is the short one.
- **The sign** stands in the frontage strip beside the drive, on the side traffic arrives from. A long strip, a market and a filling station carry a pylon; the rest a monument.
- **Planting.** Shrubs fill the perimeter strip; trees stand along the street frontage; a bed runs along the front wall between doors. A side facing homes gets the deeper buffer and a tree row.
- **The walk** runs from the street's footway to the main door, straight where it can, and crosses an aisle at right angles on a painted crossing.
- **Bench, bin and bicycles** stand beside the main door, off the walk's clear width.
- **Refuse** goes behind or beside the building, never on a street face, its gate on an aisle or the truck court.
- **A works' yard** is fenced on its lot line behind the building's front, with a gate at its drive. Its staff car park stays outside the fence where the lot allows.

### What is left out, and in what order

A piece that does not fit is omitted. The order kept is the order of need: walk, sign, lights, refuse, perimeter planting, entrance bed, bench and bin, bicycles. A one-tile corner shop keeps its walk, a wall sign it already has, and a bin.

### Roomy lots until the town is a city

At the game's body fill a one-storey shop covers 46% of its lot. The median US retail site is built to a ratio of 0.28, industry 0.32. The difference is the car park, the strips and the yard.

The catalog already holds, for the kinds whose car park did not fit, larger lots for the same building. This spec makes that the rule for every commercial and industrial kind: a ladder of lots, the first rung of which holds the building, the code car park and the grounds at or under the median ratio.

Growth takes that roomy rung while the town is below Small City, wherever the zoned block has the room. From Small City the dense kinds unlock, and land of the best standing is worth building tight: there a new building takes the compact lot and parks by its kerb credit or a garage. Nothing already standing is moved or shrunk.

A block too shallow or too short for the roomy rung grows the compact lot, as it does now. A first town never waits on grounds.

### More kinds

Ten kinds are named in [the sources](../sources/commercial-industrial-grounds.md#the-new-kinds-as-they-stand-on-the-ground) with their real size, site and marks: the auto repair shop, the quick lube, the car wash, the convenience store, the pharmacy, the bank branch, the medical office, self-storage, the contractor's yard and the machine shop. The first seven are low commercial; the last three are industry.

Each enters the catalog as existing kinds did: jobs from floor area per worker, utilities and noise from the same surveys, a draw weight from establishment counts. A kind with no derivation is not added.

A kind also varies in plan, not only in colour: the building at the street or behind its car park, a strip in a line or an L, storage in rows, a shop with a detached canopy. The variant comes from the lot's id, as the palette does.

## Decided

- One shared plan over a kit part per kind: the pieces are the same on every lot, and a plan can be tested against the layout's keep-outs.
- Omit over shrink: a half-size sign or a 0.6 m walk reads as a fault.
- Small City over a land-value test alone: the player's words were "unless the size is city", and the dense kinds unlock there already.
- Standing buildings keep their lots over a re-plat at the milestone: a town must not rearrange itself the day it grows.
- Roomy lots mean fewer jobs a tile, so a town needs more commercial and industrial land for the same work. The figure is measured before the lot rule is built and reported to the player.
