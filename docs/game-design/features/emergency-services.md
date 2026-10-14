# Emergency services — design

- **Status:** Partly built — the dispatcher: reach, busy stations, unanswered calls and real call rates (2026-10-14); the station ladder not built
- **Date:** 2026-10-14

Epic 4 of the municipal services programme
([municipal-services.md](municipal-services.md)), after the capacity
foundation in [service-capacity.md](service-capacity.md). The technical plan
is [../../engineering/features/emergency-services.md](../../engineering/features/emergency-services.md).

The epic is two slices. **Slice 1, built,** is the dispatcher: how far a station
answers, how many calls it can run at once, a call nobody answered, and how often
people really call. It works on the police and fire stations the game already has.
**Slice 2, not built,** is the station ladder: the two existing buildings are
resized to their sourced height and a large district rung is added above each.

## What the player gets

A police and a fire service whose reach and workload the player can read, and
the first honest answer to "is anyone coming?". Today every incident is answered
instantly by whichever station is nearest anywhere on the map, and a building no
station can reach is immune to fire. After slice 1 a station answers only what
it can reach by road, and only while it has a crew free; a call it cannot answer
still starts, still shows, and stands there marked as unanswered until it lapses
or a station frees up.

The player also stops seeing a constant rain of incidents. Today every building
rolls a fixed chance each tick, which runs to hundreds of times the real rate;
after slice 1 a city's calls follow what real towns of that size report.

## Why it earns its place

The city already spawns fires and crimes, drives vehicles to them and draws them
on screen, and none of it means anything. The incident is picked from the Crime
and FireRisk fields, answered by a station with no limit on distance and no limit
on how many calls it is already running, and when it resolves nothing has changed.
A player can watch a fire engine cross the entire city to a building that will be
exactly as it was either way.

That is a system the player can see and cannot reason about, which is the failure
the **city as a system** pillar in [../gdd.md](../gdd.md) exists to prevent.
Emergency services are the one service where the real municipal question is not
"how much" but "how far, how fast, and how many at once", and our coverage model
already works in road distance, so that question is one we can actually ask.

## How the stations are sized: the conflict, resolved

The first draft of this document treated today's 2×2, 12 m police and fire
stations as the large rung, with smaller posts added below. The built and sourced
[service-capacity.md](service-capacity.md#tuning) sizes them the other way, and
the catalog agrees (police 25,000, fire 14,000). The capacity document wins:

- the **fire station** is one engine company: NFPA 1710's 4 firefighters on
  an engine × 4.5 relief = 18 firefighters, over NFPA's 1.30 per 1,000, is 14,000
  people;
- the **police station** is a town's whole force: 1.9 sworn per 1,000 (FBI table
  71) × 25 = 48 sworn, 68% on patrol (BJS 2013) = 32, over 5.5–6 officers to staff
  one post round the clock (Seattle), is about 6 cars on duty;
- both should be 6.4 m tall, a resize the capacity document leaves to this epic.

So today's stations are the **first rung**, not the second. The draft's relief
factor of 4.2, its 55% on patrol and its 2.4 sworn per 1,000 are dropped: they
were figures for a bigger agency than the sourced ones this game has used from the
start. Slice 2 resizes the two stations to 6.4 m and adds a large district rung
above each, a multi-company fire station and a police district station, with
their own derivations from the same sources.

## How it works, for the player

**A station answers within its road reach.** Reach is a count of road tiles from
the station to the building, and it is set by what the road and the clock allow,
not by the building: a fire engine does not drive faster out of a bigger garage.
A fire station and a police station both answer within 120 tiles (2.4 km) of
road; a call that needs an ambulance is answered by a clinic or hospital within
241 tiles. A building farther than that, or with no road to it, is out of reach.

**A station has one crew's worth of calls at a time.** The fire station is one
engine company, so it runs one call; while the engine is out, a second fire in
the district waits for another station. The police station is about six cars on
duty and runs six calls at once and refuses the seventh. A clinic or hospital
has no limit of this kind: calls for the ambulance are answered as before.

**An incident you cannot reach looks like one.** A call with no station in reach,
or with every station in reach already busy, still starts. It shows as a grey
marker with no vehicle on its way, takes no vehicle slot, and waits. Each tick it
looks again, so a station that finishes a call picks up the one waiting. If
nobody comes within 30 ticks, the longest an answered call spends on scene, it
lapses. A city with no fire station at all still sends police to a crime.

**Real call rates.** A building calls in proportion to the people in it and to
how far its field is above the reference: a good coverage network, which lowers
Crime and FireRisk, now really does cut the number of calls. A town of 14,000 at
the reference fields has about 1.6 fire calls a day for its engine; a town of
25,000 has about 31 police calls a day across its six cars.

**Underfunding shortens the drive.** The funding slider already scales coverage
range and upkeep; it now also scales how far a station will answer. A fire
service at 60% funding reaches 72 tiles instead of 120.

**The panel names the two limits apart.** The Services panel's load gauge says
how many people depend on a service. A separate number beside it says how many of
its crews are out on calls. They are different limits: a station can be inside its
capacity and have nothing free to send, or over capacity and idle, and the player
cannot work out which is biting if the two are one figure. The Advisor names
unanswered calls by kind while any stand.

## What it interacts with

**The incident dispatcher.** The first epic to change it. Everything above lives
there. What the dispatcher still does not do is make an incident hurt: an
unanswered fire does not destroy a building. See [What it is not](#what-it-is-not).

**Service capacity.** The `capacity` figures are ordinary capacity from epic 0
and feed the same load gauge as every other service. The number of crews is a
second, separate limit, as above.

**Crime and FireRisk.** Unchanged. Both still grow passively and both are still
reduced by coverage; see [../../world-sim/services-model.md](../../world-sim/services-model.md).
The consequence of a fire nobody answers already exists, quietly: FireRisk keeps
climbing on that tile, so more calls start there.

**Traffic.** A station is pruned by road distance, so a district cut off by a
missing road link is a district no station answers.

## Tuning

Every figure below comes from a published source and our own 20 m tile; where no
source was found it is labelled a dial. The settled values belong in
[../balancing.md](../balancing.md).

**Reach, from response time.** NFPA 1710 gives the first arriving engine company
**240 seconds of travel time** at the 90th percentile, travel measured from
leaving the station. The insurance rating schedule for fire protection (ISO's
Fire Suppression Rating Schedule,
[criteria for deployment analysis of companies](https://www.isomitigation.com/ppc/technical/criteria-for-deployment-analysis-of-companies/))
gives full distribution credit for a first-due engine within **1.5 road miles
(2,414 m)**. The two pin a speed between them: 2,414 m ÷ 240 s = **10.06 m/s
(36.2 km/h)**, a plausible urban average with junctions and traffic yielding, and
one we did not have to assume. The distance follows: 2,414 m ÷ `TILE_METERS` (20
m) = **120 tiles**. The 240 s figure is taken from secondary summaries
([Fire Engineering](https://www.fireengineering.com/?p=719759); the North Davis
Fire District 2018 agenda,
[northdavisfireut.gov](https://www.northdavisfireut.gov/files/0933ea062/2018_agenda_amended.pdf));
the NFPA 1710 text itself was not retrieved.

Both the standard and our dispatcher measure along roads, so there is no
circuity factor and no isochrone to approximate: 120 hops of the road graph is
what the standard describes.

**Medical** takes NFPA 1710's **480 s** for an advanced-life-support unit at the
same speed: 480 × 10.06 = 4,829 m, or **241 tiles**.

**Police** has no national response-distance standard that we found, so it
**borrows fire's 120 tiles**. That is a borrowing, stated plainly, not a derived
figure.

The old `range: 48` is the coverage radius of the building's field and is
untouched; it was never a response distance.

**Responders.** `responders` is the number of calls a facility can have in flight
at once. The fire station is **1**: one engine company
([service-capacity.md](service-capacity.md#tuning)). The police station is **6**:
about six cars on duty at any hour, from the same document. A kind with no
`responders` figure is unlimited, so health and the rest behave as they do today.

**Call rates, per resident per year.** Real US figures, replacing a fixed
2% per building per tick at the field's maximum, which ran at hundreds of times
reality.

| Kind                                  | Rate  | Source                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fire (non-medical fire-dept calls)    | 0.042 | NFPA 2023 fire-department calls: 42,412,500 total, 28,405,000 medical aid, 1,388,500 fires, cited by [CFSI](https://cfsi.org/legislation-advocacy/current-legislation/afg-and-safer/). Non-medical is 14.0 M ÷ about 334.9 M US residents = 0.042.                                          |
| Medical                               | 0.085 | The same source: 28.4 M ÷ 334.9 M = 0.085, a floor, since it counts fire-department EMS only.                                                                                                                                                                                             |
| Police (phone-in calls for service)   | 0.45  | The Benchmark Cities average, 451.8 per 1,000 in 2019 (via Henderson NV's benchmark report). Vera's "more than 240 million 911 calls a year" ([Vera](https://vera.org/newsroom/vera-report-defines-landscape-of-911-calls-for-police-service)) is a ceiling: it includes non-police traffic. |

NFPA's own tables were unreadable, so the NFPA figures are as CFSI cites them.
The 2023 population is an estimate not confirmed on a Census page; the Census's
Vintage 2025 figure of 341.8 M gives 0.041 and 0.083. The USFA's NFIRS 2020 run
profile ([fire department run
profile](https://www.usfa.fema.gov/statistics/reports/firefighters-departments/fire-department-run-profile-v22i1.html))
is the cross-check: EMS 64.2% of runs, fire 3.9%.

A building's chance of a call each tick is:

> rate ÷ `TICKS_PER_YEAR` × occupants ÷ (1 + `EMPLOYMENT_RATE`) × field ÷ `FIELD_REFERENCE`

where occupants are the residents living in it plus the jobs it holds. Dividing
by 1 + the employment rate makes a balanced city's occupants add up to about its
population, so the city-wide rate matches the per-resident figure above.
`FIELD_REFERENCE` is **128**, the field value at which a building calls at the
national average, and a **dial**: no source ties a field byte to a rate.

Checks. A one-engine town of 14,000 at reference fields makes 14,000 × 0.042 =
**588 non-medical fire calls a year, 1.6 a day**; at the existing on-scene time
(below) that keeps its one engine busy about 16% of the time. A town of 25,000
makes 25,000 × 0.45 = **11,250 police calls a year, 31 a day**; at an hour a call
that is 11,250 car-hours of 6 × 8,760 = 52,560, **about 21% busy**.

**On-scene time is unchanged.** A call still takes 10 + severity × 20 ticks on
scene, 1.2 to 3.6 game hours. That is longer than an average police call:
Austin's assessment gives about 26 minutes for responsive calls. It is flagged
for a later slice and not changed here; at the current figure the six police cars
would be about half busy rather than a fifth.

**The lapse.** An unanswered call lapses after **30 ticks**, the longest an
answered call spends on scene (10 + 20). It is a **dial**: it makes an unanswered
call visible for as long as an answered one would have been. Unanswered calls are
capped at 32, so they can never starve the pool the answered calls use.

## Slice 2: the station ladder

Not built. Slice 2 resizes the police and fire stations to 6.4 m, as
[service-capacity.md](service-capacity.md#do-the-existing-buildings-match) asks,
and adds a large rung above each: a multi-company fire station and a police
district station. What the large rung buys is simultaneity, more calls at once
inside the same reach, since a bigger building does not make an engine faster.
Its footprint, capacity, `responders`, cost and unlock milestone are to be derived
from the same sourced figures, and the station models drawn then. Nothing about
the large rung is settled in this document.

## What it is not

- **Not consequential incidents.** An unanswered fire does not destroy the
  building it started in. Making it do so means the dispatcher writing into
  buildings and fields for the first time, which breaks its read-only contract,
  and it means designing how a city loses buildings to a rolling process, a
  question that belongs beside death care.
- **Not a prison.** Detention above a few hours is a county or state function,
  and a prison in our model could only subtract from Crime, which the police
  station already does. Crime is a scalar field, not a stock of offenders.
- **Not disaster response.** No catastrophe exists to respond to; see the note in
  [municipal-services.md](municipal-services.md).
- **Not simulated travel time.** A calendar day is 200 ticks, so one tick is 7.2
  game minutes and a four-minute drive is half a tick. The standard gives us a
  distance we can test and a duration we can hold; it cannot give us a stopwatch.
- **Not a rework of coverage or of the Crime and FireRisk fields.** Both work
  exactly as they do now.
