# Purpose-built kinds

- **Status:** Agreed

**Owns:** the purpose-built commercial and industrial kinds: what each is on the ground, how it enters the catalog, which are left out, and how a lot's plan varies from its neighbour's. Lot furniture and roomy lots are [the grounds](commercial-industrial-grounds.md); the car park is [parking-to-code.md](parking-to-code.md).

**Rules:**

- Add a kind only with its real size, site and marks from [the sources](../sources/commercial-industrial-grounds.md#the-new-kinds-as-they-stand-on-the-ground), and its jobs and draw by the catalog's method. `[R-world-043]`
- Leave out a kind with a figure that cannot be derived, and record what was found. `[R-world-043]`
- Unlock a new kind at Small Town or later, so a first town draws what it did. `[R-world-014]`
- Lay a drive-up lane or a queue court on no stall and no aisle, joined to the lot's drive at both ends. `[R-services-043]`
- Where a lot fits both with its building at the street and behind its car park, let the lot's place pick one, the same in the simulation and the renderer. `[R-world-056]`
- A plan variant never changes whether a lot fits or how many spaces it holds. `[R-world-056]`

**Numbers:** each kind's floor, jobs, utilities, spaces, roomy lot and draw weight are tabled in [the sources](../sources/commercial-industrial-grounds.md#the-auto-repair-shop-and-the-convenience-store-in-the-catalog).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Repair bay door | 3.7 | m | a bay is 12 by 25 ft |
| Lube bay | one to each 6.8 of street face | m | about 1,000 sq ft a bay |
| Stacking space | 2.4 by 6.1 (8 by 20 ft) | m | Durham NC §10.5.2.A |
| Cars in line | pharmacy 3, bank teller 4, cash machine 3; lube 3 a bay | cars | Durham NC §10.5.1.A; the lube's a dial |
| `STORAGE_ROW_COVER` | 0.5 of the yard | ratio | the rows as drawn |
| Storage drive | 7.3 (24 ft) | m | El Centro CA |
| Lots with their building at the street | one in three, where both plans fit | share | dial |
| `STREET_PLAN_SETBACK_M` | 1.9 | m | the store canopy's depth |

**Code:** `src/data/catalog.json` the entries, appended; `src/shared/parkingcode.ts` bays, a storage yard's units and each kind's spaces; `src/shared/floorarea.ts` `STORAGE_ROW_COVER`, `courtTiles` the lube's and the car wash's body; `src/shared/lotlayout.ts` `sideWindow` the lanes, the lube's court; `src/render/buildingkit.ts`, `src/render/archetypes.ts`, `src/render/facade.ts` `plainWalledBody` the kits; `src/shared/planvariant.ts` `planVariantAt` the pick, `src/shared/lotparking.ts` `lotParkingAt` where it enters the layout.

**Tests:** `src/shared/commercialkinds.test.ts`, `src/shared/storekinds.test.ts` each kind's catalog figures against the sources, lanes clear of aisles; `src/render/lowkindskit.test.ts`, `src/render/morekindskit.test.ts` kits clear of stalls, aisles and lot lines; `src/shared/autorepairparking.test.ts`, `src/shared/repairlot.test.ts` the repair shop's bays; `src/shared/planvariant.test.ts` both plans fit alike over the whole catalog; `src/render/planvariantplan.test.ts` the simulation's layout equals the renderer's.

**Open:** the contractor's yard is not added: its draw weight was not found. A car wash's water is the player's cap, since its cars a day were not found; its sign band does not glow at night. A lube's or a bank's compact lot has no room for its lane, so no car circulates there. A repair shop's accessible spaces are counted from the middle of its street face, not its office door, and its bay glass glows only faintly at night. A storage yard's roomy lot is mostly lawn, where a real one fills its site with rows, and its gate has no keypad post. A pharmacy's lane carries no marking. A bank's and a medical office's site sizes were not found. A strip is one straight range: an L needs a body of more than one rectangle. A strip, a supermarket and a medical office have one plan until their kits can stand at the street.

## Why the rules are what they are

### Ten kinds, nine built

Ten kinds are named in the sources with their real size, site and marks: the auto repair shop, the quick lube, the car wash, the convenience store, the pharmacy, the bank branch, the medical office, self-storage, the contractor's yard and the machine shop. Self-storage and the machine shop are industry; the rest are low commercial.

Each enters the catalog as existing kinds did: jobs from floor area per worker, utilities and noise from the same surveys, a draw weight from establishment or building counts. All have three levels.

The contractor's yard is [not added](../sources/commercial-industrial-grounds.md#the-kind-not-added): its draw weight could not be derived. The car wash's cars a day could not be either, so [its water is capped](../sources/commercial-industrial-grounds.md#the-car-wash-in-the-catalog) by the player's rule: no car wash draws more water than three households, and it is drawn rarely, from Busy Township on.

### What each is

- **The auto repair shop** is a row of roll-up bay doors on its street face, three to eleven of them, with a glazed office and its door at one end, a sign band over the bays, a tyre rack and a waste-oil tank on the side wall, and customers' cars on the lot. It has no window above its doors and no shopfront canopy; the walk, the bench and the bin go to its office door.
- **The convenience store** is a glazed front the width of the building under a bright canopy band, an ice locker and a propane cage against the front wall, bollards along the front walk, and condensers on the roof.
- **The pharmacy** is a large one-storey shop with its entrance in a taller corner tower, a sign band on two faces, and on one side wall a drive-through window under a canopy on two posts, over a lane that starts at the edge of the lot's drive.
- **The machine shop** is a small metal-sided works with no windows: grade-level roll-up doors and an office door on the street face, a short sign, an exhaust fan on the roof, a scrap bin in its fenced yard.
- **Self-storage** is not one building but rows on a paved yard: one-storey ranges about 8 m wide, each long wall a run of roll-up doors 3 m apart, with drives between them and a cross drive along the street end that every row drive opens onto. A small office is the street end of the first row; one fence runs along the yard's street face with one gate beside the office. It owes no loading berth: a tenant loads at the unit's own door.
- **The bank branch** is a small masonry building with a row of windows and a glazed entrance under a sign band, and beside it one canopy over two drive-up lanes with an island between them.
- **The medical office** is a low building under a hipped roof with a regular row of windows, an entrance canopy over the walk to its door, and a sign with a cross. It is a workplace: it gives no health cover.
- **The quick lube** is a body one tile deep on the front of its lot, a bay door on both long faces so a car drives through, a waiting room's door between two bays, a lane along one side wall, and a paved court behind where cars wait.

- **The car wash** is a long low body its cars drive through, an open portal at each end of a tunnel under a bright sign band, reached like the lube by a lane along one side wall and a court behind, with a pay kiosk at the lane and vacuum stalls under a canopy for its parking. It has no public door, so no walk is laid to it: a walk would end in a tunnel's mouth.

A wall with no shopfront is drawn in its own colour, not the dark frame a glazed front sits in.

### Lanes and courts

A lane that only enters is a trap: the first bank's wall lane had no way out. Every lane and court therefore meets the drive at its start and at its head, and is tested against the stalls and aisles at both turns of the lot.

A roomy lot is measured with the lanes or the full court on it. A compact lot lays what fits and no lane.

### A lot's plan varies

A street of shops all set behind identical car parks reads as one stamp. Real frontages mix: most suburban shops park in front, and some stand at the street with their car park behind or beside.

The usual plan is laid first. Where it fits, and the lot's place picks the street plan, the building is tried 1.9 m behind the street line, its awning's depth, with the stalls beside it; it is taken only if it fits too. A shop at the street line has no walk of its own: its front walk is on the footway.

A kind whose building is pinned by its own ground has one plan: the repair shop's apron, the lube's court, the bank's, the pharmacy's and the restaurant's lanes, a filling station's canopy, and the strip, the supermarket and the medical office, whose canopies and entrance need the ground in front. Industry and a lot on a curve keep the usual plan. That leaves the shop, the convenience store, the office and the hotel: about a quarter of the lots that fit can take either plan.

## Decided

- A kind without its derivation is left out over added with a guess: the catalog's figures are all traceable, and one invented figure makes none of them so.
- Place over a stored choice for the variant: nothing is saved, and the simulation and the renderer agree by construction.
- One building in a strip over an L: a body is one rectangle everywhere it is used.
