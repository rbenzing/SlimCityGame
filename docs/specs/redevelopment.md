# Buildings rise with the town

- **Status:** Built

**Owns:** how tall a zoned building may be for the town's size, how a standing building is replaced by a larger one, where its cars go when it builds up instead of out, and what a built-up building looks like. Lot choice for a new building is [the grounds](commercial-industrial-grounds.md); garages are [structured-parking.md](structured-parking.md); level-up conditions are [building-types.md](building-types.md).

**Rules:**

- Grow no building taller than the town's size allows: the ceiling rises with each milestone. `[R-world-057]`
- Leave a building that stands above a lowered ceiling as it is; never tear one down for the ceiling. `[R-world-057]`
- Rebuild a standing building at its next level in this order: on the lot it has, where the larger building and its code car park fit; on a larger lot, where the ground beside it is free; on the lot it has with its parking built in. `[R-world-058]`
- A rebuild is never refused for want of grounds, and never asked of a first town. `[R-world-058]` `[R-world-014]`
- Give each kind that stacks one built-in form for every lot a building of the level below stands on; build none before Big Town. `[R-world-058]`
- Make no built-in form over the tallest in the catalog, and none with more parking storeys above ground than working storeys; that building waits for ground. `[R-services-044]`
- Park a built-up building below ground first, then on storeys over its ground floor; show it by one garage portal in a side wall, at the head of the lot's own drive. `[R-services-044]`
- Count every built-in space; a level parked above ground adds a storey to the building, and no floor is cut for it. `[R-services-044]` `[R-services-040]`
- Draw a zoned building taller than the Small City ceiling as a modern one: a curtain wall with a darker band at each floor, and a screen round its rooftop plant. `[R-render-049]`
- Leave a lower building its punched windows; never glaze a works for its height. `[R-render-049]`
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
| A storey of a building gone up | 3.2, working or parking | m | `FLOOR_HEIGHT_METERS` |
| Tallest a rebuild goes | 80 (25 storeys), the catalog's tallest | m | dial |
| `BUILT_IN_PARKING_MILESTONE` | Big Town (3,500): the earliest a building parks in itself | — | dial: where the first garages already appear |
| Levels below ground | 2 at most | levels | dial |
| Parking storeys above ground | no more than the working storeys | storeys | dial: no building is more garage than building |
| A built-in space | 30 (325 sq ft) | m² | the garage's own figure |
| A level below ground holds | the lot's area over 30, rounded down | spaces | — |
| A storey above ground holds | the building's plate over 30, rounded down | spaces | — |
| A parking level, floor to floor | 3.35 (11 ft) | m | the garage's own figure |
| Garage portal, `PORTAL_WIDTH_M`, `PORTAL_CLEAR_M` | 6.1 wide (20 ft, two-way), 2.5 clear | m | Evanston IL, Alhambra CA; van clearance |
| Drive and kerb cut of a built-in lot | 6.1 wide, free corner turned at 1.5 | m | the portal's width; the car park's corner |
| Portal from the rear corner, `PORTAL_REAR_WALL_M` | 1 | m | dial |
| Portal behind the street face, `PORTAL_DOOR_CLEAR_M` | 3 at least | m | dial |
| Sign band of a built-in shop, `BUILT_IN_SIGN_HEIGHT_M` | 0.8 | m | dial: fits between the awning and the first upper sills |
| Modern look from | over 19.2, the Small City ceiling | m | dial: what only a Grand City raises |
| Curtain wall module | 1.5 (5 ft) | m | unitized units of 1.2 to 1.5 m, 5 ft on a tower |
| Spandrel band at each floor | 0.9 (36 in) | m | the building code's fire separation at a floor line |
| Roof screen | 3, and 4.1 round a penthouse or a lift bulkhead | m | cities ask a screen as tall as the equipment |
| Roof screen set in from the roof edge | 2 | m | dial |
| Mullion | 0.06 | m | dial |

**Code:** what falls is built: `src/sim/growth.ts` the problems pass, `ABANDONED_MIN_PASSES`, `ABANDONED_CLEAR_DEMAND`; `cmdBulldoze` in `src/sim/worker.entry.ts` clears a derelict as it clears any building. The ceilings are built: `src/shared/constants.ts` `STOREY_CEILING_M` the table, `ceilingMilestone`; `unlockMilestone` on each entry of `src/data/catalog.json`, read where growth already reads it (`src/sim/growth.ts` `tryLevelUp`, the spawn pass). Going up is built: `src/shared/stacking.ts` `stackedFormsOf` makes the forms the catalog holds, each marked `stacked`; `src/shared/garage.ts` `builtInParking`; `src/sim/growth.ts` `tryLevelUp`, `builtInFormOf`; `src/shared/builtinportal.ts` the lot, its drive and the portal; `src/render/builtinkit.ts` and `src/render/builtins.ts` the portal and the garage band; `src/render/massing.ts` `tierCountOf` the one straight body. The modern look is built: `src/shared/modernlook.ts` `isModernTall`; `src/render/curtainwall.ts` the modules and the band, drawn by the wall material in `src/render/buildings.ts`; `crownScreen` in `src/render/buildingkit.ts`.

**Tests:** `src/sim/growth.test.ts` a derelict stands at low demand, stands its minimum at high demand, is then cleared, and reopens when its power returns; `src/sim/abandonedbulldoze.test.ts` the bulldozer clears one. `src/shared/storeyceiling.test.ts` no entry above its milestone's ceiling, and none later than its ceiling asks; `src/sim/ceilinggrowth.test.ts` a level-up over the ceiling is refused and a standing building over a ceiling is kept. `src/shared/stacking.test.ts` every form recomputed from its bases, and spaces built in no fewer than spaces owed; `src/sim/goingup.test.ts` the rebuild order on a full block, a free block, a roomy lot and below Big Town; `src/shared/builtinportal.test.ts`, `src/render/builtinkit.test.ts` and `src/render/builtinbody.test.ts` the lot, the portal and the body. `src/shared/modernlook.test.ts` and `src/render/modernfamily.test.ts` which entries are modern, and every other entry's wall unchanged; `src/render/curtainwall.test.ts` module and band; `src/render/crown.test.ts` a screen no lower than its plant.

**Open:** no vacancy is modelled, so a building is abandoned only for want of power, water or a road, never for want of people. A lot on a curve never changes its footprint. The building panel says nothing of where any building parks, so the spaces built in are counted and not shown. A modern block's balconies and bays keep the older, wider grid and do not sit on its glass modules.

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

The catalog holds 24 built-in forms, named for the level they hold and the lot they stand on (`com-shop-2-up1x2`); a save names a building by its catalog entry, so each form is one. Three of them:

| Form | Storeys | Owes | Below ground | Above ground | Unlocks |
| ---- | ------- | ---- | ------------ | ------------ | ------- |
| Level-2 shop on 2 tiles | 1 | 5 spaces | 26 on one level | — | Big Town |
| Level-3 restaurant on 4 tiles | 2 | 95 | 106 on two levels | — | Big Town |
| Level-2 office on 4 tiles | 18 + 2 of parking, 64 m | 144 | 106 on two levels | 48 on two storeys | Metropolis |

Five forms are not made, and those buildings wait for ground. Four would pass 80 m: the level-3 mid-rise and mixed block on two tiles, the level-3 tower and the level-2 corporate tower on four. A level-3 restaurant on two tiles would stand six storeys of parking over four of restaurant.

A built-in building levels up again by the same order from its own lot: it spreads where ground has come free, and goes up again where none has.

### What falls

A building left without power, water or a road is abandoned and boarded up. It used to vanish after a fixed wait, which left a hole nobody chose. Now it stands, as a derelict does, until the land is wanted: when demand for its zone is at half or over, it is demolished and the lot is free to grow again. It still reopens the moment its services return.

It stands at least as long as it used to before demand may clear it. Without that floor a brownout in a growing town would demolish a building the pass after it went dark, and the lot would rebuild and go dark again.

The player can clear it sooner with the bulldozer, which takes the zone's paint with the building as it always has; the lot regrows once it is zoned again. A town that shrinks keeps its empty buildings until it grows back or the player clears them.

### Cars go under, then in

A building that builds up parks below ground first: nothing shows but a portal, and the lot keeps its front. What two levels below cannot hold goes on storeys just over the ground floor, drawn as a band of open garage decks, and the building stands a storey taller for each. The street face keeps its shopfront or lobby.

The body stands on one side line of its lot. A drive runs down the other side from the lot's kerb cut to a portal in the side wall near the rear; every lot the catalog holds leaves 6.4 m or more beside the body, so no portal opens on the street face. The lot has no stalls and no aisle: the rest is the walk to the door and the kind's planted ground.

The ramp down is inside the building and is not drawn: the ground is never cut, and a ramp outside would have to fall across the drive.

A built-in shop or restaurant is one straight-walled body, a row of windows to each working storey over the kind's own ground floor. Its sign band is lower than the kit's, to clear the first upper windows; a built-in restaurant has no drive-through and no dark end wall. A built-in block or tower stands a podium no wider than its slab, so the side drive stays clear, and no part of any built-in form passes its lot line.

### What a built-up building looks like

A building raised from Grand City on is a glazed slab: a curtain wall of floor-to-ceiling glass in a regular grid, a darker band at each floor, its shopfront or lobby and its garage portal at the street, and a screened crown that hides its plant. An older block keeps its punched windows. The parts are [building detail](building-detail.md)'s.

What marks a building modern is its height, not its kind: anything over the Small City ceiling of six storeys, which only a Grand City or a Metropolis raises. So the taller mid-rises, mixed blocks, hotels and offices are glazed with the towers, and a building gone up past six storeys is glazed where its spread form is not. A tower and a mid-rise keep their podium and balconies; the glass is the wall behind them.

The wall is cut into equal modules as near 1.5 m as its length allows, never under 1.2 or over 1.8, with one row to each floor and the band centred on the floor line. Only the vision glass lights at night. The 24 catalog entries over six storeys are modern; every other entry's wall is as it was.

The screen stands on all four sides of the roof's plant: units, a cooling tower, a lift bulkhead or a penthouse. A modern building that had no plant drawn gains rooftop units to screen; a roof with none gets no screen.

## Decided

- A storey ceiling by town size over a share of the town's people: a player can read "six storeys at Small City" off the skyline; a share cannot be seen.
- Keep what stands over a ceiling, over tearing it down: a rule that flattens a downtown is a punishment, not a simulation.
- Under before in: a basement costs the street nothing, a ground-floor garage costs it a floor of shops.
- Demand over a clock for clearing a derelict: the player's ruling. A derelict is cleared when someone would build there, not when a timer runs out.
