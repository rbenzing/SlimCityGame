# Emergency services — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 4 of the municipal services programme
([municipal-services.md](municipal-services.md)), built on the capacity
foundation in [service-capacity.md](service-capacity.md). The design it is
written against is
[../../game-design/features/emergency-services.md](../../game-design/features/emergency-services.md).

## What we are building, and why now

A second rung on the police and fire ladders, and the first real behaviour in
`src/sim/dispatch.ts`. The player will be able to choose between a neighbourhood
post and a district station on the grounds of how many calls each answers at
once, and to see a call nobody answered. Now, because the dispatcher is the
largest piece of finished machinery in the simulation that does nothing — and
fourth rather than first for the same reason it is worth doing: it is the only
epic here that changes a system somebody else's tests pin.

## What it touches

| Module                          | Change                                              |
| ------------------------------- | --------------------------------------------------- |
| `src/shared/types.ts`           | `ServiceSpec.responders?`; `Incident.answered?`     |
| `src/shared/constants.ts`       | `RESPONSE_RANGE_TILES = 120`, derived below         |
| `src/sim/dispatch.ts`           | Reach gate, station occupancy, unanswered incidents |
| `src/sim/worker.ts`             | Passes `serviceFunding` into `DispatchSystem.tick`  |
| `src/data/catalog.json`         | Two new entries; two existing entries re-priced     |
| `src/render/servicevehicles.ts` | Bay-door and apron detail on the four stations      |
| `src/ui/`                       | Responder occupancy beside the load gauge           |
| `src/sim/services.ts`           | Untouched — coverage is unchanged                   |

**Save format: no.** Nothing new is persisted. `responders` is catalog data, which
ships with the build and has never been saved; a station's in-flight response
count is runtime state that rebuilds within a few ticks of a load, like traffic
volume and uncollected trash — see [../data-model.md](../data-model.md). The
additive rule still holds and is the thing to test first: **a save written before
this epic loads after it, with the new service absent rather than the save
rejected.** An older save has no `fire-post` or `police-post` instances, and its
`fire-station` and `police-station` instances keep their ids, footprints, tiles
and rotations untouched — which is why those two entries keep their 2×2 geometry
and become the large rung rather than being shrunk into the small one.

**Worker protocol: yes, additively.** `Incident` gains an optional `answered`
flag, and the snapshot gains an optional per-kind responder occupancy for the
panel. Both are optional fields on existing messages, so a render mirror that
ignores them behaves as it does today. See [../interfaces.md](../interfaces.md).

## The design

### What the dispatcher does today

Read this before the changes, because most of it stays.
`DispatchSystem.tick({ grid, buildings, network })` runs `advance()` then
`trySpawn()` and returns the active list, which the worker drops into
`SimSnapshot.incidents`. It reads `GridState.fields` and the building registry and
nothing else: it never writes a field, never touches a `BuildingInstance`, never
calls `ServiceSim`, and `dispatch.test.ts` asserts that absence directly. Spawning
walks every Active non-service building in ascending id order and checks it once
per incident kind — fire, crime, medical, in that fixed order — against
`SPAWN_BASE_CHANCE (0.02) × fieldValue / 255`, reading FireRisk, Crime and
Pollution at the building's origin tile; a building already the target of an
unresolved incident is skipped, and at most one spawns per building per tick.

The responder is chosen by `findNearestStation`, which is where the behaviour is
wrong in two ways at once. It scans **every** Active building whose catalog
`service.kind` matches, runs `network.findPath` from each to the incident, and
takes the lowest `cost`, ties broken by ascending id. There is **no distance
limit** — a station on the far side of the map answers. There is **no notion of a
station being busy** — one station answers any number of simultaneous incidents.
And if no station has a path the incident **does not spawn at all**, so a building
no station can reach is immune to fire.

An answered incident takes one slot from a pool of `MAX_SERVICE_VEHICLES = 32`,
which is also `MAX_ACTIVE_INCIDENTS`, walks `toIncident` → `servicing` →
`toStation`, and resolves, freeing the slot. `severity` is `rng.next()` and its
only job is the on-scene duration, `10 + severity × 20` ticks, and resolution
changes nothing anywhere. Both time constants are already right and stay: a
calendar day is `TICKS_PER_DAY = 200`, so one tick is 432 game seconds and 10–30
ticks is 1.2–3.6 game hours, against a published mean commitment of about an hour
for a structure fire; and the vehicle's one tile per tick is animation pacing,
about 38 real seconds to cross the map at 1×, which must not become a travel-time
model because 240 seconds of travel is 0.56 of a tick.

### Reach, derived

Published fire-service practice gives the first arriving engine company **240 s
of travel time** at the 90th percentile; the insurance schedule that grades fire
protection credits built-upon area within **1.5 road miles (2,414 m)** of an
engine company. Dividing one by the other gives the planning speed — 2,414 ÷ 240
= **10.06 m/s (36.2 km/h)** — so we assume no speed of our own. The distance is
240 × 10.06 = 2,414 m, and 2,414 ÷ `TILE_METERS` (20) = **120.7 → 120 tiles**.
Both the standard and our dispatcher measure along roads, so there is no circuity
factor and no isochrone to approximate. `RESPONSE_RANGE_TILES = 120` lives in
`src/shared/constants.ts` as one derived fact rather than four catalog copies — a
larger building does not make an appliance faster. The existing `range: 48` is
960 m, or 95 s of travel: 40% of the standard, and never used as a response
distance anyway. It survives as what it is, the district a station works; the
arithmetic tying it to a one-engine station's 13,000 residents, and police's move
to 42, is in the design document.

### What changes in the dispatcher

**1. A reach gate.** `findNearestStation` takes the range
`Math.floor(RESPONSE_RANGE_TILES × funding[kind])` and rejects any station whose
path is longer. The measure is `path.points.length - 1`, the tile count, not
`path.cost` — `cost` is congestion-scaled travel time plus junction delay in the
network's own units ([../../world-sim/pathfinding.md](../../world-sim/pathfinding.md)),
and comparing it against a tile figure would be a unit error. A station whose
Manhattan distance exceeds the range is skipped before pathing, which is sound
because road distance is never less and makes the pass cheaper than today's.

**2. Station occupancy.** `ServiceSpec` gains `responders?: number` — how many
incidents a facility can have in flight. The dispatcher keeps a
`Map<buildingId, number>`, increments on dispatch, decrements on resolve, and
skips a station at its limit before pathing to it. **Absent means unlimited**, so
every service kind except police and fire behaves exactly as it does now.

**3. Unanswered incidents.** An incident whose field roll succeeds now spawns
whether or not a responder exists, carrying `answered: false`. It takes no vehicle
slot, because there is no vehicle, and is capped separately at
`MAX_UNANSWERED_INCIDENTS = 32` so it can never starve the answered pool. It
re-attempts a responder each tick — so a station finishing a call picks up the one
that was waiting — and lapses after `UNANSWERED_LAPSE_TICKS`.

**4. Funding reaches the dispatcher.** `tick()` gains
`funding: Record<ServiceKind, number>`, which the worker already holds. What does
**not** change: the spawn rule, the field reads, the vehicle model, the phase
machine, the on-scene duration, and above all the read-only contract.

### Sizes, derived

By [../../art/civic-massing.md](../../art/civic-massing.md): a body fills 13.6 m
of each 20 m tile, one tile of footprint is a 185 m² plate, a storey is 3.2 m, and
gross floor area = w × d × 185 × (height ÷ 3.2). A fire station is its bays —
back-in 4.9 × 14.0 m, drive-through 4.9 × 18.3 m, 4.1 m clear over a fire access
route, 4.6 m for an aerial. The catalog figures each row lands on are below.

| Derivation                      | Fire post          | Fire station             | Police post          | Police station         |
| ------------------------------- | ------------------ | ------------------------ | -------------------- | ---------------------- |
| Bays, +15% piers and alcoves    | 2 back-in → 158 m² | 3 drive-through → 309 m² | —                    | —                      |
| Bay hall width + piers          | 11.0 m             | **16.5 m**               | —                    | —                      |
| Occupant load × 13.9 m²         | 5 → 70 m²          | 13 → 181 m²              | 17 → 236 m²          | 46 → 639 m²            |
| Programme beyond egress         | 120 m² quarters    | 500 m² quarters          | ×2 → 472 m²          | ×2 → 1,278 m²          |
| Ground floor needed             | 278 m²             | 309 m² + support         | 236 m²               | 426 m²                 |
| Tiles = area ÷ 185 ÷ storeys    | 278 ÷ 185 = 1.5    | width forces 2 wide      | 472 ÷ 185 ÷ 2 = 1.28 | 1,278 ÷ 185 ÷ 3 = 2.30 |
| **Footprint**, body area        | **2×1**, 370 m²    | **2×2**, 740 m²          | **2×1**, 370 m²      | **2×2**, 740 m²        |
| Site margin vs apron or parking | 430 vs 132 m²      | 860 vs 198 m²            | 430 vs 375 m²        | 860 vs 944 m²          |
| **Height**, gross floor area    | **8 m**, 925 m²    | **12 m**, 2,775 m²       | **7 m**, 810 m²      | **12 m**, 2,544 m²     |

**The bays alone justify the fire footprints.** At the post they are 57% of the
ground floor and a 1×1 body at 185 m² cannot hold them; at the station three
4.9 m bays plus piers are 16.5 m across, which **does not fit a 13.6 m body**, so
that footprint is two tiles wide before any floor-area sum is done. Heights are
the bays too: 4.1 m clear plus 1.0 m of door head is a 5.1 m hall, plus parapet
and hose-drying face = 8 m; an aerial's 4.6 m door gives a 5.6 m hall plus two
3.2 m storeys = 12 m. Net of the double-height hall the formula counts twice, the
post is 767 m² against the 500–900 m² a real one- or two-bay station runs to and
the station 2,466 m² against 1,400–2,300 — 7% over, taken rather than churn a
placed entry for one metre. Two figures are assumptions: a police station's
programme is **twice** its egress minimum, because cells, evidence, sally port
and armoury are not occupant-load driven, and the large station's parking is
84 m² over its margin, taken as a sally port inside the ground floor.

**The existing entries therefore agree with the derivation for the district rung
and not for the post** — 2,775 m² gross is a three-bay fire station, not a
one-engine one. Both keep their geometry, become the large rung, and are re-priced
to their derived rosters, with the posts as new ids beneath them: a balance change
on load, not a load failure.

| id               | footprint | height | range | capacity | responders | cost  | upkeep | milestone |
| ---------------- | --------- | ------ | ----- | -------- | ---------- | ----- | ------ | --------- |
| `fire-post`      | 2×1       | 8      | 48    | 13,000   | 1          | 3,600 | 240    | 1         |
| `fire-station`   | 2×2       | 12     | 48    | 38,000   | 3          | 8,600 | 700    | 4         |
| `police-post`    | 2×1       | 7      | 42    | 10,000   | 3          | 3,200 | 220    | 1         |
| `police-station` | 2×2       | 12     | 42    | 30,000   | 9          | 7,700 | 630    | 4         |

Upkeep tracks roster, where a service's money goes: 17 against 50 firefighters is
2.94 and 240 × 2.94 ≈ 700; 24 against 69 sworn is 2.88 and 220 × 2.88 ≈ 630.
Capital does not, because one site carries three appliances — ¢0.226 per person
served against ¢0.277 for fire, ¢0.257 against ¢0.320 for police.

## What could go wrong

**Incidents appear where none appeared before.** Today a building no station can
path to never catches fire; after this it does, and stands unanswered. A player
upgrading a city with a badly connected industrial estate sees a row of fires on
load — intended feedback, and still a change nobody asked for, so the panel has to
name it and the lapse timer has to be short. Worse, the 32 existing slots are
shared by incident and vehicle: letting unanswered incidents into that pool would
let a city with no fire station fill it and silence police and medical entirely,
which is what the separate cap exists to prevent.

**Funding now bites twice.** One multiplier scales coverage range and response
reach, so an underfunded service loses field strength and answerability together —
a sharper cliff than the slider has had, to be looked at on the gauge first.

**Two derived changes land on live saves, and two limits look like one.** Police
range moving 48 → 42 weakens crime coverage in every existing city by about 12%
of reach, and the re-priced stations cost more to run: small, derived, and still
a city getting worse on upgrade. Separately, a station can be inside its capacity
and unable to answer, or over capacity and idle — if the panel shows `responders`
and `capacity` as one number the player will never work out which is biting.

## Alternatives

**A per-entry `responseRange`, or rungs that differ by radius.** Both rejected for
the same reason: reach belongs to the appliance and the road, not the building.
Four catalog copies would be four places to keep one derived fact in step, and a
larger garage does not make an engine faster.

**Gating on `path.cost` instead of tile count.** Rejected for now, and the more
interesting of the two: `cost` is congestion-aware, so gating on it would give a
travel-time isochrone that shrinks in traffic. Converting the network's own units
to seconds is its own work with its own calibration.

**Making an unanswered incident damage its building.** Rejected for this epic: it
means the dispatcher writing into a `BuildingInstance` or a field, which breaks a
contract with explicit tests, raises an ordering question against the coverage
pass, and creates the first way a city loses buildings to a rolling process —
which belongs beside death care. **A prison** is rejected too: Crime is a scalar
field, not a stock of offenders, so there is nothing for one to hold.

## How we will know it works

- A save written before this epic loads after it, stations intact, and plays
  identically apart from the priced and derived changes. Written first.
- A station 130 tiles of road away does not answer an incident; one 110 tiles
  away does, and a congested route proves the gate reads tiles, not `cost`.
- A fire post already running one incident does not answer a second; a fire
  station answers three, refuses the fourth, and picks the waiting one up when a
  call finishes, without that incident having to re-roll.
- An incident with no station in range spawns, reports `answered: false`, takes no
  vehicle slot, and lapses — and a city with no fire station still sends police.
- A service kind with no `responders` figure — health, education, park — behaves
  exactly as today, and one seed still gives one incident sequence.
- The responder pass costs no more than today's: the Manhattan prefilter removes
  more `findPath` calls than the occupancy check adds, at the city size in
  [../performance-budget.md](../performance-budget.md).

**Looked at in a browser**, because this epic renders:

- The four stations in a row at the default camera pitch: the two rungs must read
  as visibly different buildings and the bay doors as doors, not dark rectangles.
- A 10 m appliance on the apron with a 4 m car and a pedestrian in frame: if it
  does not read as two and a half cars long the anchors in
  [../../art/README.md](../../art/README.md) have been broken. Then the same
  appliance in the bay doorway, where the door has to be visibly taller than it —
  the failure the massing guide names by name.
- A responding vehicle mid-route, to confirm the apron joins the street rather
  than floating beside it.
- An unanswered incident: its marker, no vehicle en route and none arriving. This
  is the one new thing the player is meant to notice, and a screenshot is the
  only way to know it is noticeable.
- The same stations at night: bay doors are the lit face of a fire station and
  the emissive pass has not seen one before.

## Out of scope

- Consequences. No building is damaged, abandoned or destroyed by an incident,
  and no travel-time model: the vehicle speed constant stays animation pacing.
- Medical response. `medical` incidents route to `health` buildings and stay as
  they are; the advanced-life-support figure of 480 s of travel is 4,829 m or 241
  tiles by the same chain, and is handed to the healthcare epic.
- Disasters, and any service that exists only to respond to them.
- Reworking coverage, the Crime and FireRisk growth rules, or the spawn rule.
