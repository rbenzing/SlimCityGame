# Emergency services

- **Status:** Built

**Owns:** how far a police or fire station answers, how many calls it runs at once, a call nobody answered, how often people really call, and the two-rung station ladder. Coverage and the Crime and FireRisk fields are [services-model.md](../world-sim/services-model.md); capacity and the load gauge are [service-capacity.md](service-capacity.md); the programme is [municipal-services.md](municipal-services.md).

**Rules:**

- Keep dispatch read-only: it never writes a field, a building, coverage or the economy. `[R-services-018]`
- Answer only within road reach, counted in path tiles and scaled by funding, never by straight line or `path.cost`. `[R-services-019]` `[R-services-005]`
- Cap a facility's calls in flight by `responders`; a call nobody can answer still spawns as unanswered, takes no vehicle slot and lapses. `[R-services-020]`
- Spawn incidents at the real per-resident rates, scaled by occupants and field ÷ `FIELD_REFERENCE`, never a flat chance a building. `[R-services-021]`
- Show crews out beside the load gauge as its own number, never merged with it.
- Derive a civic footprint and height from occupant-load arithmetic, and make the station readable by its bay doors or its entrance. `[R-render-015]`
- Buy the large rung crews at once, never reach and never a cheaper person; reach belongs to the appliance and the road.

**Numbers:** derivations, sources and the cost ladder are in [the sources](../sources/emergency-services.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| First-engine travel time | 240 | s | [NFPA 1710](../sources/emergency-services.md#reach-from-response-time) |
| First-due distance | 1.5 road miles, 2,414 | m | [ISO FSRS](../sources/emergency-services.md#reach-from-response-time) |
| Planning speed | 10.06 (36.2 km/h) | m/s | same |
| `RESPONSE_REACH_TILES` fire / crime | 120 (2.4 km) | tiles | same; police borrows fire |
| `RESPONSE_REACH_TILES` medical | 241 (480 s, 4,829 m) | tiles | same |
| Reach at 60% funding, fire | 72 | tiles | `floor(120 × 0.6)` |
| Coverage `range` | 48 | tiles | untouched, never a response distance |
| Fire calls | 0.042 | per resident a year | [NFPA via CFSI](../sources/emergency-services.md#call-rates-per-resident-per-year) |
| Medical calls | 0.085 | per resident a year | same |
| Police calls | 0.45 | per resident a year | same, Benchmark Cities |
| `FIELD_REFERENCE` | 128 | field byte | dial |
| Police on-scene mean | 26.4 | min a call | [CSG Austin](../sources/emergency-services.md#on-scene-time-per-kind) |
| Ambulance off the road | 29 (16 + 13) | min | same, NEMSIS |
| On-scene spread | 0.5 to 1.5 | × mean | severity |
| Fire on-scene | 10 + severity × 20 (1.2 to 3.6 game hours) | ticks | dial |
| Tick | 7.2 | game min | calendar |
| `UNANSWERED_LAPSE_TICKS` | 30 | ticks | dial |
| `MAX_UNANSWERED_INCIDENTS` | 32 | calls | dial |
| Fire station | 14,000 people, `responders` 1, 2×2, 6.4 m, ¢4,500, upkeep ¢320, 8.5 kW, 1.6 kL | | [responders](../sources/emergency-services.md#responders) |
| Police station | 25,000 people, `responders` 6, 2×2, 6.4 m, ¢4,000, upkeep ¢300 | | same |
| District fire station | 31,000 people, `responders` 2, 3×2, 6.4 m, two storeys, ¢13,150, upkeep ¢720, 25 kW, 4.7 kL, strength 160 | | [Indianapolis FS 20](../sources/emergency-services.md#the-district-fire-station-indianapolis-fire-station-20) |
| District police station | 47,000 people, `responders` 11, 3×3, 9.6 m, three storeys, ¢9,950, upkeep ¢563, 60 kW, 5.7 kL, strength 160 | | [Concord NH](../sources/emergency-services.md#the-district-police-station-concord-nh) |
| Large rungs unlock | Small City milestone | | `MILESTONES` |
| Bay door | 16 × 15 ft, over 14 × 14 ft least; engine 3.3 m | | kit |
| Building area, fire / police first rung | ~500 m² (5,382 sf), 1,420 m² | | [sources](../sources/emergency-services.md#the-district-fire-station-indianapolis-fire-station-20) |
| `SAVE_VERSION` | 15, unchanged | | saves |

**Code:**

- `src/shared/types.ts` `ServiceSpec.responders`, `Incident.answered`, `ResponderLoad`, `SimSnapshot.responders` — the data shapes.
- `src/shared/constants.ts` `RESPONSE_REACH_TILES`, `FIELD_REFERENCE`, `TICKS_PER_YEAR`, `EMPLOYMENT_RATE` — response times, planning speed and reach derived from `TILE_METERS`.
- `src/shared/occupancy.ts` `occupiedResidents` — occupants of a building.
- `src/sim/dispatch.ts` `DispatchSystem.tick`, `serviceTicksFor`, `ON_SCENE_MINUTES`, `MAX_UNANSWERED_INCIDENTS`, `UNANSWERED_LAPSE_TICKS` — reach gate, occupancy, unanswered calls, the real spawn rate.
- `src/sim/worker.entry.ts` — passes `serviceFunding` into the tick; sends `responders` on the snapshot.
- `src/sim/services.ts` — untouched: coverage is unchanged.
- `src/data/catalog.json` — `responders` on the stations; `fire-station-district`, `police-station-district`.
- `src/render/servicevehicles.ts` — the unanswered marker, a different colour on the same instanced mesh.
- `src/render/utilitykits.ts` `computeStationLayout` — the one pure layout of the four station kits.
- `src/ui/advisor.ts` — the unanswered-calls issue; `src/ui/` Services panel shows responder occupancy.
- `tests/support/town.ts` — the regression town stands both district stations on main street's north side.

**Tests:**

- `src/sim/dispatch.test.ts` — a station 130 road tiles away does not answer and one 110 away does, a short congested path still answers; reach in tiles not cost, funding, busy stations, waiting calls, unanswered cap and lapse, rates, determinism, read-only.
- `src/render/utilitykits.test.ts`, `src/render/stations.test.ts` — registry, layout, bay door heights, lot containment at four rotations, the night light.
- `tests/interaction/emergency.test.ts` — a save with first-rung stations loads unchanged.
- `src/ui/ServicesPanel.test.tsx`, `src/ui/advisor.test.ts` — the responder number and the unanswered-calls issue.

**Open:**

- The district fire station's second company rolls as a second engine: no ladder-truck vehicle kind yet (an aerial is 51 ft and up, 13 ft high); engines parked on station aprons are decoration and stay put.
- A fire's on-scene time of 10–30 ticks (1.2–3.6 game hours) is a dial: no US engine on-scene figure was found.
- A civic kit's plinth leaves a step at the road crossing; the college has no drive.

## Why the rules are what they are

### Why it earns its place

The city already spawned fires and crimes, drove vehicles to them and drew them, and none of it meant anything. An incident was answered by the nearest station anywhere with no limit on distance or on calls it was already running, and a building no station could reach was immune to fire. A player could watch an engine cross the city to a building exactly as it was either way. That is a system the player can see and cannot reason about, the failure the city-as-a-system pillar prevents. Emergency services are the one service where the question is "how far, how fast, how many at once", and coverage already works in road distance, so the question can be asked.

### The read-only dispatcher

`DispatchSystem.tick` runs `advance()` then `trySpawn()` and returns the active list, which the worker drops into `SimSnapshot.incidents`. It reads `GridState.fields` and the registry only: it never writes a field, never touches a `BuildingInstance`, never calls `ServiceSim`, and `dispatch.test.ts` asserts that absence. Spawning walks every Active non-service building in ascending id, checks it once per kind (fire, crime, medical), skips a building already the target of an unresolved incident, and spawns at most one per building per tick. The vehicle model (one tile a tick, animation pacing, never a travel-time model) and the phase machine are unchanged. Before, the responder was the nearest station by `path.cost` anywhere with no notion of busy, and with no station an incident did not spawn. Looked at in a browser, because it renders.

### Reach

A station answers within a count of road tiles set by what the road and the clock allow, not by the building: an engine does not drive faster out of a bigger garage. A per-entry `responseRange`, or rungs differing by radius, was rejected on that ground. Fire and police answer within 120 tiles (2.4 km) of road; an ambulance call is answered by a clinic or hospital within 241 tiles. A building beyond that, or with no road, is out of reach, so a district cut off by a missing road link is a district no station answers.

NFPA 1710's 240 s and the insurance schedule's 1.5 road miles pin a speed of 10.06 m/s, which we did not have to assume; the distance is that over `TILE_METERS`. Both the standard and the dispatcher measure along roads, so there is no circuity factor. Police has no standard and borrows fire's figure, stated as a borrowing. Derivation in [the sources](../sources/emergency-services.md#reach-from-response-time).

`DispatchSystem.tick` takes the funding the worker already holds, and the reach of a call is `floor(RESPONSE_REACH_TILES[kind] × funding[service kind])`: a fire service at 60% reaches 72 tiles, not 120. One multiplier now scales coverage range and answerability together, a sharper cliff than the slider had, to be read on the gauge first. A station is skipped before pathing when its Manhattan distance exceeds the reach, which is sound because road distance is never less. A path is rejected on its tile count, `path.points.length - 1`, never `path.cost`: cost is congestion-scaled time plus junction delay in the network's units ([pathfinding](../world-sim/pathfinding.md)), so comparing it to a tile figure is a unit error, and gating on it would make an isochrone that shrinks in traffic. `RESPONSE_REACH_TILES` is derived in one place from the response times, the speed and `TILE_METERS`, not literals and not catalog copies.

### Crews: one call at a time

The fire station is one engine company and runs one call; while it is out, a second fire waits for another station. The police station is about six cars on duty and runs six calls, refusing the seventh. `ServiceSpec.responders` is the count in flight; absent means unlimited, so health and the rest behave as before. The dispatcher keeps a map of building id to calls in flight, increments on dispatch, decrements on resolve, and skips a station at its limit before pathing to it. The first rungs derive from the capacity document: 18 firefighters over 1.30 per 1,000 is 14,000; 48 sworn at 68% on patrol over 5.5 to 6 a post is about 6 cars.

The panel names the two limits apart. The load gauge says how many people depend on a service; the responder number says how many crews are out. A station can be inside its capacity with nothing free to send, or over capacity and idle, and the player cannot tell which is biting if the two are one figure. Capacity feeds the same gauge as every service; crews are a second, separate limit.

### Calls nobody answers

A call whose spawn roll succeeds spawns whether or not a responder exists. With none in reach and free, it is held as `answered: false`, shown as a grey marker with no vehicle on its way. The building stays in `activeTargets` until the call lapses or resolves, so no second call starts on it. The Advisor names unanswered calls by kind while any stand.

- It takes no vehicle slot, and is capped separately at 32 so it can never starve the answered pool of `MAX_SERVICE_VEHICLES`; a call that finds the answered pool full waits as unanswered.
- Each tick, after `advance()`, waiting calls retry, oldest first, so a station that has just resolved a call picks up the one waiting without a re-roll, with its already-drawn severity.
- It lapses after 30 ticks, the longest an answered call spends on scene (fire at full severity, 10 + 20): it is visible as long as an answered call would have been. The lapse is a dial.
- The responder search is per kind, so a city with no fire station still sends police to a crime.

A building no station could reach used to be immune to fire; now it catches fire and stands unanswered, which is the intent. The separate cap stops a city with no fire station filling the answered pool and silencing police and medical. FireRisk keeps climbing on that tile, so more calls start there.

### Real call rates

Before, a building rolled `0.02 × field ÷ 255` a tick, hundreds of times reality, a constant rain of incidents. A building now calls in proportion to its occupants and how far its field is above the reference: `rate ÷ TICKS_PER_YEAR × occupants ÷ (1 + EMPLOYMENT_RATE) × field ÷ FIELD_REFERENCE`, occupants being `occupiedResidents(spec, inst)` plus `spec.jobs ?? 0`. Dividing by 1 + employment makes a balanced city's occupants sum to its population, so the city rate matches the per-resident figure. Good coverage lowers Crime and FireRisk and so really cuts calls. The kind-to-field mapping (fire to FireRisk, crime to Crime, medical to Pollution), the ascending-id walk, one spawn per building per tick and the skip of service buildings are unchanged. A town of 14,000 has about 588 fire calls a year (1.6 a day) for its one engine, busy about 16%; a town of 25,000 about 11,250 police calls (31 a day), 6 cars about 9% busy. A city now sees a few incidents where it saw a stream, which makes `answered: false` rarer and more worth noticing. The spawn-rate test and sources are in [the sources](../sources/emergency-services.md#call-rates-per-resident-per-year).

On-scene time is `serviceTicksFor(kind, severity)`: crime and medical use a per-kind mean in minutes (`ON_SCENE_MINUTES`: crime 26.4, medical 29, scene plus transport) and `round(minutes × (0.5 + severity) ÷ 7.2)` ticks. Fire keeps `10 + severity × 20` ticks, a dial for want of a US figure.

### The ladder

The two existing stations are the first rung, not the second, as the sourced capacity document sizes them and the catalog matches; it wins over an earlier draft's bigger-agency figures. Both are resized to 6.4 m and a large district rung stands above each, a multi-company fire station and a police district station, unlocked at Small City. A first-rung save loads unchanged: same id, 2×2 lot, tiles and rotation; only height and drawing change. A building saves by id, tile and rotation, so no `SAVE_VERSION` bump.

The large rung buys crews at once (2 and 11 where the first rungs have 1 and 6) from one site inside the same reach, and not a cheaper person: on real figures a large rung costs more per person to build (¢0.42 against ¢0.32 for fire, ¢0.21 against ¢0.16 for police) because a modern station carries more floor per crew member. The rule that a large rung is 18 to 20% cheaper per person is withdrawn. Capacity, cost, upkeep and draw derive from Indianapolis Station 20 and Concord NH in [the sources](../sources/emergency-services.md#the-district-fire-station-indianapolis-fire-station-20). The first rung's draw was re-derived on its real ~500 m² (8.5 kW, 1.6 kL, down from 47 kW and 9 kL on the 12 m box's 2,775 m²).

Lots come from floors, bays and apron ([the fire and police stations](../art/civic-massing/reading-a-civic-building-at-a-glance/the-fire-and-police-stations.md)): the district fire station is 3×2 at two storeys, the district police station 3×3 at three; first rungs keep 2×2. A fire station is read by framed bay doors lighter than the wall and taller than the engine (two on the first rung, three on the district one), the apron before them with the appliance, and the district station a hose tower. A police station is read by its entrance with a canopy, its sally port and the stalls before it.

The kit is a paved lot with the building on its back and left; local +Z is the street. Bay doors are 16 × 15 ft, over the 14 × 14 ft least. Windows and door panes are one merged mesh on a shared emissive material that follows `setNightFactor`, as the turbine beacon does. Everything is an `InstancedMesh`; no textures, no custom shaders. Appliances and cars on the lot are static decoration like the hospital's ambulance: dispatched vehicles leave from the station's origin and are drawn by the service-vehicle renderer. A save with the first rungs loads unchanged by `emergency.test.ts`.

### Persistence and protocol

`SAVE_VERSION` stays 15. `responders` is catalog data, never saved; an in-flight count and a waiting call are runtime state rebuilt within a few ticks of a load, like traffic volume and uncollected trash ([data model](../engineering/data-model/README.md)). `Incident` gains an optional `answered` flag and the snapshot an optional per-kind `{ inFlight, total }`, the calls in flight over the sum of `responders` across Active stations; a mirror that ignores them behaves as before ([interfaces](../engineering/interfaces/README.md)).

## Decided

- Reach per appliance and road, over a per-entry `responseRange`.
- Gate on path tile count, over `path.cost`: cost is congestion-aware and its conversion to seconds needs its own calibration.
- An unanswered incident does not damage its building: it would break the read-only dispatcher and start a rolling-process loss of buildings that belongs beside death care. Not built: prison (Crime is a scalar field, not a stock of offenders and detention above a few hours is a county or state function); disaster response; simulated travel time (a calendar day is 200 ticks, a tick 7.2 game minutes, a four-minute drive half a tick); a rework of coverage or the Crime and FireRisk growth rules; a ladder truck (would append one `VehicleKind` and a body); a US fire on-scene figure.
- The sourced first rungs over the draft's posts and its 4.2 relief, 55% on patrol and 2.4 sworn per 1,000.
