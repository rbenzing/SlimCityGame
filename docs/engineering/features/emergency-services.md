# Emergency services — technical design

- **Status:** Built 2026-10-14 — the dispatcher; the station ladder
- **Date:** 2026-10-14
- **Author:** Claude Opus 5

Epic 4 of the municipal services programme
([municipal-services.md](municipal-services.md)), built on the capacity
foundation in [service-capacity.md](service-capacity.md). The design it is
written against is
[../../game-design/features/emergency-services.md](../../game-design/features/emergency-services.md),
which also records how the station sizes were settled.

The epic is two slices. **Slice 1, built,** is the dispatcher in
`src/sim/dispatch.ts`, working on the existing `police-station` and
`fire-station`. **Slice 2, built,** is the station ladder.

## What we are building, and why now

The first real behaviour in `src/sim/dispatch.ts`: a reach gate, busy stations,
calls nobody answered, and the real per-resident call rates. The dispatcher is the
largest piece of finished machinery in the simulation that did nothing, and this
is the only epic that changes a system somebody else's tests pin.

## The station sizes, resolved

An earlier draft of this document treated the 2×2, 12 m stations as the large
rung, with smaller posts below them, on a 4.2 relief factor, 55% on patrol and
2.4 sworn per 1,000. The built and sourced
[service-capacity.md](service-capacity.md) sizes them as the **first rung**
(police 25,000 people, fire 14,000), which the catalog already matches, and the
code and that document win:

- fire: one engine company, 4 × 4.5 relief = 18 firefighters ÷ NFPA's 1.30 per
  1,000 = 14,000; `responders` is **1**;
- police: 1.9 sworn per 1,000 × 25 = 48 sworn, 68% on patrol = 32, ÷ 5.5–6 per
  round-the-clock post, about 6 cars on duty; `responders` is **6**;
- slice 2 resized both to 6.4 m and added a large district rung above each. The
  draft's posts, its derived footprint table and its re-priced stations are
  withdrawn; they rested on the withdrawn figures.

## What slice 1 touches

| Module                          | Change                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`           | `ServiceSpec.responders?`; `Incident.answered?`; `ResponderLoad`; `SimSnapshot.responders?`                     |
| `src/shared/constants.ts`       | The response times, the planning speed and `RESPONSE_REACH_TILES`, derived from `TILE_METERS`                   |
| `src/sim/dispatch.ts`           | Reach gate, station occupancy, unanswered incidents, the real spawn rate                                        |
| `src/sim/worker.entry.ts`       | Passes `serviceFunding` into `DispatchSystem.tick`; sends `responders` on the snapshot                          |
| `src/data/catalog.json`         | `responders` on the two stations                                                                                |
| `src/render/servicevehicles.ts` | The unanswered marker, a different colour on the same instanced mesh                                            |
| `src/ui/`                       | Responder occupancy beside the load gauge; the Advisor's unanswered-calls issue                                 |
| `src/sim/services.ts`           | Untouched: coverage is unchanged                                                                                |

**Save format: no.** `SAVE_VERSION` stays 15 and nothing new is persisted.
`responders` is catalog data, which ships with the build and has never been saved;
a station's in-flight count and a waiting call are runtime state, rebuilt within a
few ticks of a load like traffic volume and uncollected trash (see
[../data-model.md](../data-model.md)). A save written before slice 1 loads after
it and plays; the only visible change is the new call rate.

**Worker protocol: yes, additively.** `Incident` gains an optional `answered`
flag, and the snapshot gains an optional `responders` per-kind occupancy for the
panel. Both are optional fields on existing messages, so a mirror that ignores
them behaves as before. See [../interfaces.md](../interfaces.md).

## The design

### What the dispatcher did before

`DispatchSystem.tick({ grid, buildings, network })` runs `advance()` then
`trySpawn()` and returns the active list, which the worker drops into
`SimSnapshot.incidents`. It reads `GridState.fields` and the building registry and
nothing else: it never writes a field, never touches a `BuildingInstance`, never
calls `ServiceSim`, and `dispatch.test.ts` asserts that absence directly. Spawning
walks every Active non-service building in ascending id order and checks it once
per kind (fire, crime, medical in that order), reading FireRisk, Crime and
Pollution at the building's origin tile; a building already the target of an
unresolved incident is skipped, and at most one spawns per building per tick.

Before slice 1 the chance was a fixed `0.02 × field ÷ 255` per building per tick;
the responder was the nearest station by `path.cost` anywhere on the map with no
notion of busy; and with no station at all the incident did not spawn.

### Reach

NFPA 1710 gives the first engine **240 s** of travel at the 90th percentile; the
insurance rating schedule credits a first-due engine within **1.5 road miles
(2,414 m)**. 2,414 ÷ 240 = **10.06 m/s**; 2,414 ÷ `TILE_METERS` = **120 tiles**.
The 240 s figure is from secondary summaries; the NFPA text was not retrieved.
Medical uses NFPA 1710's 480 s for advanced life support at the same speed: 4,829
m, **241 tiles**. Police has no response-distance standard and borrows fire's 120.

`src/shared/constants.ts` holds the two times and the planning speed and derives
`RESPONSE_REACH_TILES` per incident kind from them and `TILE_METERS`, so the figure
is one derived fact in one place, not literals and not catalog copies.

`DispatchSystem.tick` takes `funding: Record<ServiceKind, number>`, which the
worker already holds, and the reach of a call is
`floor(RESPONSE_REACH_TILES[kind] × funding[service kind])`. A station is
skipped before pathing when its Manhattan distance to the incident exceeds the
reach, which is sound because road distance is never less. A station whose path is
longer than the reach is rejected, and the measure is the tile count,
`path.points.length - 1`, never `path.cost`: `cost` is congestion-scaled travel
time plus junction delay in the network's own units
([../../world-sim/pathfinding.md](../../world-sim/pathfinding.md)), and comparing
it to a tile figure is a unit error.

### Station occupancy

`ServiceSpec.responders?: number` is how many incidents a facility can have in
flight. Absent means unlimited. The dispatcher keeps a `Map<buildingId, number>`,
increments it when a call is dispatched, decrements it when the call resolves, and
skips a station at its limit before pathing to it.

### Unanswered calls

A call whose spawn roll succeeds spawns whether or not a responder exists. With
none in reach and free, it is held as `answered: false`:

- it takes no vehicle slot, and is capped separately at
  `MAX_UNANSWERED_INCIDENTS = 32` so it can never starve the answered pool of
  `MAX_SERVICE_VEHICLES`; a call that finds the answered pool full waits as an
  unanswered one;
- each tick, after `advance()`, waiting calls retry for a responder, oldest first,
  so a station that has just resolved a call picks up the one waiting without a
  re-roll, and a taken call joins the answered pool with its already-drawn
  severity;
- it lapses after `UNANSWERED_LAPSE_TICKS = 30`, the longest on-scene time of an
  answered call of any kind (fire at full severity, 10 + 20), and is visible for
  30 ticks. The lapse is a dial;
- the building stays in `activeTargets` until the call lapses or resolves, so no
  second call starts on it;
- a city with no fire station still sends police: the responder search is per
  kind.

### The call rate

Per resident per year: fire 0.042, medical 0.085, police 0.45; sources and the
cross-checks are in the design document. A building's chance per kind per tick:

> rate ÷ `TICKS_PER_YEAR` × occupants ÷ (1 + `EMPLOYMENT_RATE`) × field ÷
> `FIELD_REFERENCE`

with occupants = `occupiedResidents(spec, inst)` + `spec.jobs ?? 0`, using the
shared helper in `src/shared/occupancy.ts`, and `FIELD_REFERENCE = 128` a dial.
The kind-to-field mapping (fire to FireRisk, crime to Crime, medical to Pollution),
the ascending-id walk, one spawn per building per tick and the skip of service
buildings are unchanged. Coverage still lowers Crime and FireRisk, so good
coverage now reduces calls.

Checks: a one-engine town of 14,000 at reference fields makes about 588
non-medical fire calls a year, 1.6 a day; a 25,000-person town makes about 11,250
police calls a year, 31 a day, which keeps 6 cars about 9% busy at 26.4 minutes a call.

The on-scene time is `serviceTicksFor(kind, severity)` in `src/sim/dispatch.ts`.
Crime and medical use a per-kind mean in minutes (`ON_SCENE_MINUTES`: crime 26.4,
medical 29, the ambulance's scene plus transport time) and
round(minutes × (0.5 + severity) ÷ 7.2) ticks, 7.2 being the minutes in a tick.
Fire keeps 10 + severity × 20 ticks, a dial for want of a US figure. The sources
are in the design document.

### What does not change

The field reads, the vehicle model (one tile a tick, animation pacing, never a
travel-time model), the phase machine, and the read-only
contract.

### Visibility

`Incident.answered?: boolean` rides the snapshot; `false` is an unanswered call.
The render side draws the marker on the same `InstancedMesh` in a different
per-instance colour (no textures, no custom shaders). The snapshot also carries
`responders`: for each kind that has any, `{ inFlight, total }`, the calls in
flight over the sum of `responders` across Active stations. The Services panel
shows it beside the load gauge as its own number, never merged with it. The
Advisor gains an issue naming unanswered calls by kind when any are standing, a
pure function like the others in `src/ui/advisor.ts`.

## What could go wrong

**Incidents appear where none appeared before.** A building no station can path to
used to be immune to fire; now it catches fire and stands unanswered. The Advisor
names it and the lapse is short. The separate cap exists so a city with no fire
station cannot fill the answered pool and silence police and medical.

**Funding now bites twice.** One multiplier scales coverage range and response
reach, so an underfunded service loses field strength and answerability together,
a sharper cliff than the slider had, to be looked at on the gauge first.

**Two limits look like one.** A station can be inside its capacity and unable to
answer, or over capacity and idle. The panel shows them apart for that reason.

**The spawn rate is far lower than before.** A city sees a few incidents where it
saw a stream. That is the intended change, and it makes `answered: false` rarer
and so more worth noticing.

## Alternatives

**A per-entry `responseRange`, or rungs that differ by radius.** Rejected: reach
belongs to the appliance and the road, not the building.

**Gating on `path.cost`.** Rejected: `cost` is congestion-aware, so it would be a
travel-time isochrone that shrinks in traffic, and converting the network's units
to seconds is its own work with its own calibration.

**Making an unanswered incident damage its building.** Rejected: the dispatcher
would write into a `BuildingInstance` or a field, breaking a contract with
explicit tests, and it creates the first way a city loses buildings to a rolling
process, which belongs beside death care. **A prison** is rejected too: Crime is a
scalar field, not a stock of offenders.

## How we know it works

`src/sim/dispatch.test.ts`:

- a station 130 road tiles away does not answer, one 110 away does, and a
  congested route (a short path with a huge `cost`) still answers, so the gate
  reads tiles; funding at 0.6 cuts fire reach to 72;
- a fire station already running one call does not answer a second; a police
  station answers 6 and refuses the 7th; a waiting call is picked up when a call
  resolves, without a re-roll;
- with no station in reach a call spawns `answered: false`, takes no vehicle slot,
  is capped at 32 and lapses after 30 ticks; a city with no fire station still
  sends police; health, with no `responders`, behaves as before;
- one seed gives one incident sequence;
- spawn rates: a synthetic city of 10,000 balanced residents and jobs at the
  reference field over a game year (72,000 ticks) produces about 420 fire, 850
  medical and 4,500 police calls, within four standard deviations of a Poisson
  count; field 0 spawns nothing and doubling the field doubles the rate;
- the dispatcher still never writes a field or a `BuildingInstance`.

`ServicesPanel.test.tsx` and `advisor.test.ts` cover the responder number and the
unanswered-calls issue. **Looked at in a browser** because it renders: an
unanswered marker beside an answered one with its vehicle must be tellable apart.

## Slice 2: the station ladder

Built. The two stations are resized to 6.4 m and a large rung stands above each:
`fire-station-district` (3×2, 6.4 m, capacity 31,000, `responders` 2, ¢13,150, upkeep
¢720) and `police-station-district` (3×3, 9.6 m, 47,000, 11, ¢9,950, ¢563), both at the
`MILESTONES` entry named Small City. Every figure and its sources are in the design
document and [../../art/civic-massing.md](../../art/civic-massing.md#the-fire-and-police-stations).
The withdrawn draft's table is not reused.

| Module                    | Change                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/data/catalog.json`   | Two entries; the first rungs at 6.4 m with their draw re-derived on stated floors. Catalog shape unchanged.             |
| `src/render/utilitykits.ts` | The four stations are kit ids; `computeStationLayout` is the one pure layout, and the yard, building, lit panes, mast, appliance and car pools are drawn from it |
| `src/render/utilitykits.test.ts`, `stations.test.ts` | Registry, layout, bay door heights, lot containment at four rotations, the night light |
| `tests/support/town.ts`   | The regression town stands both district stations on main street's north side                                          |

**Save format: no.** `SAVE_VERSION` stays 15. A building is saved by id, tile and
rotation, so a save with first-rung stations loads with those unchanged
(`tests/interaction/emergency.test.ts`); only the height and the drawing differ.

**The kit.** The station is a paved lot with the building on its back and left;
local +Z is the street. The bay doors are 16 × 15 ft, framed and lighter than the
wall, taller than the 3.3 m engine and over the 14 × 14 ft least. The windows and the
door panes are one merged mesh on a shared emissive material that follows
`setNightFactor`, the same pattern as the turbine beacon. Everything is an
`InstancedMesh`; there are no textures and no custom shaders. Appliances and cars on
the lot are static decoration, like the hospital's ambulance: the dispatcher's own
vehicles still leave from the station's origin and are drawn by the service-vehicle
renderer.

## Out of scope

- A ladder truck. The district station is sized on an engine and a ladder, but the
  game has no ladder-truck `VehicleKind`: its second responder is drawn as a second
  engine. A follow-up would append one `VehicleKind` and a body for it.
- Consequences. No building is damaged, abandoned or destroyed by an incident, and
  there is no travel-time model.
- Disasters, and any service that exists only to respond to them.
- Reworking coverage, or the Crime and FireRisk growth rules.
- A US figure for fire on-scene time; fire stays a dial until one is found.
