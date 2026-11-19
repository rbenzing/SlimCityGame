# Buildings rise with the town

- **Status:** Agreed

**Owns:** how tall a zoned building may be for the town's size, how a standing building is replaced by a larger one, where its cars go when it builds up instead of out, and what a built-up building looks like. Lot choice for a new building is [the grounds](commercial-industrial-grounds.md); garages are [structured-parking.md](structured-parking.md); level-up conditions are [building-types.md](building-types.md).

**Rules:**

- Grow no building taller than the town's size allows: the ceiling rises with each milestone. `[R-world-057]`
- Leave a building that stands above a lowered ceiling as it is; never tear one down for the ceiling. `[R-world-057]`
- Rebuild a standing building at its next level in this order: on the lot it has, where the larger building and its code car park fit; on a larger lot, where the ground beside it is free; on the lot it has with its parking built in. `[R-world-058]`
- A rebuild is never refused for want of grounds, and never asked of a first town. `[R-world-058]` `[R-world-014]`
- Park a built-up building below ground first, then on its ground floor behind a shopfront or a lobby; show each by a ramp and a portal on a side or rear face. `[R-services-044]`
- Count every built-in space; a level parked above ground adds a storey to the building, and no floor is cut for it. `[R-services-044]` `[R-services-040]`
- Leave an abandoned building standing, boarded, for as long as demand for its zone is low; no clock removes it. `[R-world-059]`
- Demolish an abandoned building when demand for its zone is high enough, or when the player bulldozes it; the cleared lot regrows as any lot does. `[R-world-059]`

**Numbers:** the ceilings are dials; what was found is in [the sources](../sources/redevelopment.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Ceiling, up to Busy Township | 3 storeys (11.2) | m | dial |
| Ceiling, Big Town (3,500) | 4 storeys (12.8) | m | dial |
| Ceiling, Small City (8,000) | 6 storeys (19.2) | m | dial |
| Ceiling, Grand City (20,000) | 12 storeys (38.4) | m | dial |
| Ceiling, Metropolis (50,000) | none | — | dial |
| Works and plants | no ceiling: a hall is one tall storey | — | — |
| `ABANDONED_CLEAR_DEMAND` | 0: the zone's demand bar at half or over | −1 to 1 | dial: the player's "high enough" |
| `ABANDONED_MIN_PASSES` | 10 growth passes (100 ticks) abandoned before it may be cleared | passes | the old wait, now a floor |
| Storeys of a building gone up | the next level's floor over this lot's plate, rounded up | storeys | the same floor, stacked |
| Tallest a rebuild goes | 80 (25 storeys), the catalog's tallest | m | dial |
| Earliest a building parks in itself | Big Town (3,500) | — | dial: where the first garages already appear |
| Levels below ground | 2 at most | levels | dial |
| A built-in space | 30 (325 sq ft) | m² | the garage's own figure |
| A parking level, floor to floor | 3.35 (11 ft) | m | the garage's own figure |
| Garage portal | 6.1 wide (20 ft, two-way), 2.5 clear | m | Evanston IL, Alhambra CA; van clearance |
| Ramp to a level below | 1 in 8 (12.5%), no stall on it | slope | parking design guidance |

**Code:** what falls is built: `src/sim/growth.ts` the problems pass, `ABANDONED_MIN_PASSES`, `ABANDONED_CLEAR_DEMAND`; `cmdBulldoze` in `src/sim/worker.entry.ts` clears a derelict as it clears any building. The ceilings are built: `src/shared/constants.ts` `STOREY_CEILING_M` the table, `ceilingMilestone`; `unlockMilestone` on each entry of `src/data/catalog.json`, read where growth already reads it (`src/sim/growth.ts` `tryLevelUp`, the spawn pass). To be built: the rebuild order (`tryLevelUp`, `footprintsOf`, `levelUpSite`); built-in parking (`src/shared/garage.ts` `parksInGarage`, `garageRequirement`; `src/render/massing.ts` the podium); the tower look.

**Tests:** `src/sim/growth.test.ts` a derelict stands at low demand, stands its minimum at high demand, is then cleared, and reopens when its power returns; `src/sim/abandonedbulldoze.test.ts` the bulldozer clears one. `src/shared/storeyceiling.test.ts` no entry above its milestone's ceiling, and none later than its ceiling asks; `src/sim/ceilinggrowth.test.ts` a level-up over the ceiling is refused and a standing building over a ceiling is kept. To be written with each later slice: the rebuild order on a free block, a full block and a roomy lot; spaces built in equal spaces owed.

**Open:** no vacancy is modelled, so a building is abandoned only for want of power, water or a road, never for want of people. A lot on a curve never changes its footprint.

## Why the rules are what they are

### A town's size sets its skyline

Every dense kind unlocked at once at Small City: a town of 8,000 could raise a 25-storey tower holding one resident in twelve, and an office block employing one in five. No town that size fills them.

The ceiling ties height to the milestone the player has reached:

| Town | Tallest | What it adds |
| ---- | ------- | ------------ |
| Big Town | 4 storeys | the first mixed block |
| Small City | 6 storeys | the first mid-rise, office block and hotels |
| Grand City | 12 storeys | taller mid-rises and mixed blocks, the office tower, the grand hotel, the first residential tower |
| Metropolis | no ceiling | the 18 and 25-storey towers, the corporate tower |

At its unlock no building houses more than about one resident in 75 of its town, or holds more than one job to every 24 residents. Ten storeys and over are 16 thousand of the country's 5.9 million commercial buildings, so a tower is rare everywhere; here it is also late.

A building already standing above a ceiling stays. Saves made before the ceilings keep their skylines, and nothing is demolished by a rule the player did not see coming.

### A building is replaced by a larger one

A level-up already demolishes and rebuilds: the old building goes, a site stands for the build, the new one opens. What it lacked was an order of preference and a way up when the block is full.

Roomy lots are the room to grow into. A shop on a lot twice its size is rebuilt larger on that lot before it asks for a neighbour's ground, so a town thickens where it stands. Where the larger building's car park no longer fits on the ground, and no ground is free beside it, the building goes up and takes its cars with it.

Of the catalog's level-ups, 57 of 84 need a larger lot than the building's compact one. A roomy lot is often as large as the next level's compact lot, but that lot's car park does not fit on it without kerb stalls: measured, a level-1 shop on its roomy lot with no free ground beside it never rebuilt at all. So the way up is needed at the first rebuild, not only the second.

### Going up

A kind that stacks goes up: the shop, the restaurant, the office, the hotel, the mid-rise, the mixed block and the tower. The building it becomes holds the next level's floor, jobs and homes on the lot it already has, in as many storeys as that floor needs, with its parking built in. A shop that would have spread over four tiles stands two storeys on two; on a lot already large enough it keeps one storey and only its cars go below.

No town below Big Town builds one: an underground garage in a village is wrong, and a first town grows as it always has.

A kind that cannot stack waits for ground: a filling station, a strip, a supermarket, a works, and the purpose-built kinds are one storey by their trade.

The taller form answers to the ceiling like any building, so in a town too small for it the building stays as it is. No rebuild goes over the tallest building the catalog holds.

### What falls

A building left without power, water or a road is abandoned and boarded up. It used to vanish after a fixed wait, which left a hole nobody chose. Now it stands, as a derelict does, until the land is wanted: when demand for its zone is at half or over, it is demolished and the lot is free to grow again. It still reopens the moment its services return.

It stands at least as long as it used to before demand may clear it. Without that floor a brownout in a growing town would demolish a building the pass after it went dark, and the lot would rebuild and go dark again.

The player can clear it sooner with the bulldozer, which takes the zone's paint with the building as it always has; the lot regrows once it is zoned again. A town that shrinks keeps its empty buildings until it grows back or the player clears them.

### Cars go under, then in

A building that builds up parks below ground first: nothing shows but a ramp and a portal, and the lot keeps its front. What two levels below cannot hold goes on the ground floor, behind the street face's shopfront or lobby, and the building stands one storey taller for it. A mid-rise's and a tower's podium is that ground-floor garage already.

The portal is on a side or rear face where the lot has one clear of the door, and on the street face beside the lobby where it has not. Its drive is the lot's own kerb cut.

### What a built-up building looks like

A tower raised from Grand City on is a glazed slab over a podium: a curtain wall of floor-to-ceiling glass in a regular grid, a darker band at each floor, the podium's shopfront and garage portal at the street, and a screened crown that hides its plant. An older block keeps its punched windows. The parts are [building detail](building-detail.md)'s.

## Decided

- A storey ceiling by town size over a share of the town's people: a player can read "six storeys at Small City" off the skyline; a share cannot be seen.
- Keep what stands over a ceiling, over tearing it down: a rule that flattens a downtown is a punishment, not a simulation.
- Under before in: a basement costs the street nothing, a ground-floor garage costs it a floor of shops.
- Demand over a clock for clearing a derelict: the player's ruling. A derelict is cleared when someone would build there, not when a timer runs out.
