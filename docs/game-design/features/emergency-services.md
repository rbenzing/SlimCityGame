# Emergency services — design

- **Status:** Draft
- **Date:** 2026-09-18

Epic 4 of the municipal services programme
([municipal-services.md](municipal-services.md)), after the capacity
foundation in [service-capacity.md](service-capacity.md). The technical plan
is [../../engineering/features/emergency-services.md](../../engineering/features/emergency-services.md).

## What the player gets

A police and a fire service the player sizes to a district instead of ticking
off once. Each gets a small neighbourhood station and a large district one, and
the difference between them is how many calls they can answer at the same time —
not how far they reach, because how far an appliance reaches is set by the road
and the clock, and a bigger building does not change either.

The player also gets the first honest answer to "is anyone coming?". Today every
incident is answered, instantly, by whichever station is nearest anywhere on the
map. After this epic a station answers only what it can reach, and only while it
has an appliance free.

## Why it earns its place

The city already spawns fires and crimes, drives vehicles to them and draws them
on screen, and none of it means anything. The incident is decorative: it is
picked from the Crime and FireRisk fields, answered by a station with no limit on
distance and no limit on how many calls it is already running, and when it
resolves nothing has changed. A player can watch a fire engine cross the entire
city to a building that will be exactly as it was either way.

That is a system the player can see and cannot reason about, which is the
failure the **city as a system** pillar in [../gdd.md](../gdd.md) exists to
prevent. Emergency services are also the one service where the real municipal
question is not "how much" but "how far, how fast, and how many at once" — and
our coverage model already works in road distance, so that question is one we
can actually ask.

## How it works, for the player

**Two ladders, four buildings.** Each service offers a post and a station.

|                           | Fire post  | Fire station         | Police post | Police station |
| ------------------------- | ---------- | -------------------- | ----------- | -------------- |
| Footprint                 | 2×1        | 2×2                  | 2×1         | 2×2            |
| Height                    | 8 m        | 12 m                 | 7 m         | 12 m           |
| Appliances / patrol units | 1 engine   | 2 engines + 1 aerial | 3 units     | 9 units        |
| Serves                    | 13,000     | 38,000               | 10,000      | 30,000         |
| Cost                      | ¢3,600     | ¢8,600               | ¢3,200      | ¢7,700         |
| Upkeep                    | ¢240       | ¢700                 | ¢220        | ¢630           |
| Unlocks at                | Small Town | Small City           | Small Town  | Small City     |

**Reach is the same for both rungs.** A fire post and a fire station both cover
48 tiles of road network; both police buildings cover 42. A station does not see
further because a fire engine does not drive faster out of a larger garage.

**What the large one buys is simultaneity.** A post has one engine. While that
engine is out, a second fire in its district waits for another station. The
district station has three appliances and answers three calls at once. That is
the decision the ladder creates: three posts spread across three neighbourhoods
cover three separate patches of the city, while one station covers one patch
three calls deep. A sprawling town wants posts; a dense core wants a station.

**The large one is cheaper per person, but only to build.** A fire station costs
¢8,600 for 38,000 people — ¢0.226 each — against the post's ¢3,600 for 13,000,
or ¢0.277 each: 18% less capital per person served, because one site, one apron,
one watch room and one set of plant carry three appliances instead of one. The
police numbers are the same shape: ¢0.257 against ¢0.320, 20% less. Upkeep does
not follow, and should not: a fire service's running cost is its crews, and three
appliances need three crews wherever they are parked. Both rungs cost about
¢0.0185 per person per month for fire and ¢0.021 for police. Buying big saves on
the building and nothing on the people.

**An incident you cannot reach now looks like one.** A fire outside every
station's reach still starts, still shows its marker, and no vehicle comes. It
sits there until it lapses. That is the feedback the service panel's load gauge
cannot give, because a district with no station has no load to report.

**Underfunding shortens the drive.** The funding slider already scales coverage
range and upkeep; it now also scales how far a station will answer. A fire
service at 60% funding reaches 72 tiles instead of 120, and the edges of the city
stop being answerable before the field turns red.

## What it interacts with

**The incident dispatcher.** This is the first epic to change it, and the reason
this epic sits fourth. Everything above — reach limits, busy stations, unanswered
incidents — lives there. What the dispatcher still does not do is make an
incident hurt: an unanswered fire does not destroy a building in this epic. See
[What it is not](#what-it-is-not).

**Service capacity.** The `capacity` figures above are ordinary capacity from
epic 0 and feed the same load gauge as every other service. Appliance count is a
second, separate limit — a station can be within its capacity and still have
nothing free to send, which is exactly the difference between how many people
depend on you and how many emergencies are happening at once.

**Crime and FireRisk.** Unchanged. Both still grow passively and both are still
reduced by coverage; see [../../world-sim/services-model.md](../../world-sim/services-model.md).
The consequence of a fire nobody answers already exists, quietly: FireRisk keeps
climbing on that tile, so more incidents spawn there. It is a slow statistical
punishment rather than a dramatic one, and for this epic that is the whole of it.

**Traffic.** More appliances mean more responding vehicles on the road, which is
the interaction the programme said not to smooth away. It also cuts the other
way: a station is now pruned by road distance, so a district cut off by a missing
road link is a district no station answers.

## Tuning

Every figure below comes from a published standard and our own 20 m tile. The
settled values belong in [../balancing.md](../balancing.md).

**Reach, from response time.** Published fire-service practice gives the first
arriving engine company **240 seconds of travel time** at the 90th percentile —
travel, measured from leaving the station, not the whole response. The same
standards set 240 seconds for a first-responder unit with a defibrillator and 480
for an advanced-life-support unit. Separately, the insurance rating schedule that
grades fire protection credits built-upon area within **1.5 road miles (2,414 m)**
of an engine company. Those two published figures pin a speed between them:
2,414 m ÷ 240 s = **10.06 m/s, or 36.2 km/h** — a plausible average through an
urban network with junctions and traffic yielding, and one we did not have to
assume. The distance follows: 240 s × 10.06 m/s = 2,414 m, and 2,414 ÷ 20 m
= **120 tiles**.

That number applies to us more directly than it would elsewhere, because our
coverage and our dispatcher both measure in road-network hops, not straight
lines. The standard is stated in _road_ miles for the same reason. There is no
circuity factor to apply and no isochrone to approximate: 120 hops of our road
graph is what the standard describes.

**Does `range: 48` survive?** Not as a response distance. Forty-eight tiles is
960 m, which at 10.06 m/s is 95 seconds of travel — 40% of the standard. But
`range` was never a response distance: the dispatcher ignores it entirely and
will drive an engine across the map. What 48 turns out to be is a capacity
district, almost exactly. The tiles within R road-hops form a diamond of about
2R² tiles, so 48 hops reach 2 × 48² = 4,608 tiles. Our residential catalog puts
about 8.0 residents on a residential building tile across a mixed town (1.8 at
low density, 12.5 at medium, 17.5 at high), and roughly 35% of a covered district
is residential building rather than road, shop, works or verge — so 2.8 residents
per covered tile, and 4,608 × 2.8 = **12,900 people**. That is the fire post's
derived capacity to within 1%. So `range: 48` stays for fire, as the district a
one-engine station works, and 120 becomes a separate, new figure the dispatcher
uses. Police moves to 42, derived below.

**Fire capacity.** Published national profiles put career firefighters at
1.1–1.7 per 1,000 protected residents depending on community size; we take
**1.3**. The suppression standard requires **4 firefighters** on an engine
company and 4 on a ladder company. Covering a seat around the clock takes
8,760 hours a year against about 2,080 worked, net of leave and training — a
relief factor of **4.2 people per seat**.

- Post: 1 engine = 4 seats × 4.2 = **17 firefighters**; 17 ÷ 1.3 per 1,000 =
  **13,000 residents**.
- Station: 2 engines + 1 aerial = 12 seats × 4.2 = **50 firefighters**;
  50 ÷ 1.3 = **38,000 residents**.

Cross-check against workload: national figures give about 0.11 incidents per
resident per year across all call types, so a post serving 13,000 answers about
1,430 a year, or **3.9 runs a day** for one engine — the ordinary range for a
single-company station.

Cross-check against density: a dense core runs 17.5 residents per residential
tile at 50% residential, so 8.75 per covered tile, and 4,608 × 8.75 = 40,300
against the station's derived 38,000 — 6% apart. The two rungs are the same
district at two densities, which is precisely why the ladder is appliances and
not radius.

**Police capacity.** Published national figures give about **2.4 full-time sworn
officers per 1,000 residents** in cities, of which roughly **55%** are assigned
to patrol. That is 1.32 patrol officers per 1,000; at the same 4.2 relief factor,
a round-the-clock one-officer unit needs 4.2 of them, so the city fields
1.32 ÷ 4.2 = 0.314 units per 1,000 residents — **one unit per 3,180 people**.

- Post: 3 units × 3,180 = **10,000 residents**; roster 3 × 4.2 ÷ 0.55 =
  **24 sworn**.
- Station: 9 units × 3,180 = **30,000 residents**; roster 9 × 4.2 ÷ 0.55 =
  **69 sworn**.

Police range follows from those capacities and the same density: 10,000 ÷ 2.8 =
3,571 tiles, and 2R² = 3,571 gives R = 42.3, so **42 tiles**. The dense-core
check agrees: 30,000 ÷ 8.75 = 3,429 tiles, R = 41.4. Police reach is smaller
than fire because a patrol unit covers fewer people than an engine company does,
which is what the per-1,000 figures say.

A calls-per-officer cross-check is weaker and we flag it as an assumption:
municipal agencies report calls for service in the region of 0.75 per resident
per year, which puts 7,500 calls a year against the post's 12.6 patrol officers,
or 1.6 per officer per day. It is the right order of magnitude and no more.

**Sizes, from the massing rule.** All four are derived by
[../../art/civic-massing.md](../../art/civic-massing.md); the arithmetic is in
[the technical plan](../../engineering/features/emergency-services.md). The
short version is that a fire station is its apparatus bays. A back-in bay is
4.9 × 14.0 m and a drive-through bay 4.9 × 18.3 m, so the post's two bays are
137 m² and the station's three are 269 m² before a single office is drawn, and
the bay hall alone sets both the width and the height. Three 4.9 m bays plus
piers are 16.5 m wide, which does not fit the 13.6 m body of a one-tile-wide
building — that is what makes the district station 2×2 and the post 2×1.

The existing catalog entries are both 2×2 and 12 m. Checked against the
derivation they are **correct for the district station and wrong for the post**:
2×2 at 12 m is 2,775 m² gross, which is a three-bay fire station, not a
one-engine one. So the existing `fire-station` and `police-station` entries keep
their geometry and become the large rung, and the two posts are new and smaller.
Their prices move with them, which is a balance change on existing cities and is
called out in the technical plan.

**The affordability override.** The post must be buyable at the milestone that
unlocks it. Small Town pays ¢10,000 on arrival, so ¢3,600 and ¢3,200 leave a city
able to build one of each and still lay road. That is why the post, not the
station, unlocks first, and why the station waits for Small City.

## What it is not

- **Not consequential incidents.** An unanswered fire does not destroy the
  building it started in, and this epic does not add one. Making it do so means
  the dispatcher writing into buildings and fields for the first time, which
  breaks its read-only contract, and it means designing how a city loses
  buildings to a rolling process — a question that belongs beside death care,
  not bolted onto a reach limit. The smaller thing that is worth shipping is
  reach, busy stations and a visibly unanswered call.
- **Not a prison.** It is a real municipal facility and it is still the wrong
  building here. Detention above a few hours is a county or state function, not a
  city one; the municipal part is the holding cells, and those are already inside
  the police station's derived floor area. More to the point, a prison in our
  model could only subtract from Crime, which the police station already does —
  a second building doing the first one's job with a larger number, which is
  exactly what the programme said an epic slot is not for. Crime here is a scalar
  field with passive growth, not a stock of offenders, so there is nothing for a
  prison to hold. Giving it something would mean modelling arrests and a detained
  population, and that has an ugly failure mode: one full building raising crime
  across the whole city is a global coupling from a local decision. If that model
  is ever wanted it is its own epic.
- **Not disaster response.** No catastrophe exists to respond to; see the note
  in [municipal-services.md](municipal-services.md).
- **Not simulated travel time.** A calendar day is 200 ticks, so one tick is 7.2
  game minutes and a four-minute drive is half a tick. The standard gives us a
  distance we can test and a duration we can hold; it cannot give us a stopwatch.
- **Not a rework of coverage or of the Crime and FireRisk fields.** Both work
  exactly as they do now.
