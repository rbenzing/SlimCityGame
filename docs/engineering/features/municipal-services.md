# Municipal services — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Programme-level plan. The design it is written against is
[../../game-design/features/municipal-services.md](../../game-design/features/municipal-services.md).
Each epic below gets its own pair of documents; this one covers what they
**share**, and the order they have to be built in.

## What we are building, and why now

Service buildings today are a flat list: one entry per service kind, one radius
each, satisfied by one building. The programme turns each service into a ladder
with capacity behind it, and closes three open loops (sewage, death, waste
recovery).

Now, because the road epic is closed and the service model is the largest part
of the simulation that has never been extended. It is also the part most likely
to be got wrong on paper — it touches the save format, the worker protocol, the
economy and the dispatcher — which is exactly what these documents are for.

## What it touches

The shared foundation only. Per-epic blast radius lives in each epic's document.

| Module | Change |
| --- | --- |
| `src/shared/types.ts` | `ServiceKind` gains members; `ServiceSpec` gains capacity |
| `src/sim/services.ts` | Coverage unchanged; load/capacity resolved alongside it |
| `src/sim/economy.ts` | Upkeep already per-building; funding meaning widens |
| `src/data/catalog.json` | New entries per epic |
| `src/ui/` | Service panel reports load, not just coverage |
| `src/app/persist.ts` | Per-epic state; see save rule below |

**Save format: yes, additively.** Every epic adds state. The rule the road model
held to applies unchanged — a save written before an epic loads after it, with
the new service absent rather than the save rejected. A missing field means "the
city never had this", never "reject the file".

**Worker protocol: yes.** New commands per epic, and the snapshot grows to carry
per-service load. Both are additive; see [../interfaces.md](../interfaces.md).

## The design

### The one shared concept: capacity

Coverage answers *how well served is this tile*. It cannot answer *how many
people are asking*, and every epic needs that second answer — a hospital that
serves a district and a clinic that serves a street both write `health`, and
nothing today distinguishes them once the field is written.

So `ServiceSpec` gains a capacity, in people:

```ts
export interface ServiceSpec {
  kind: ServiceKind;
  strength: number;   // unchanged: 0..255 written into the field at the source
  range: number;      // unchanged: road-network BFS distance in tiles
  capacity: number;   // NEW: people this facility can serve
}
```

Each tick, alongside the existing coverage pass, the sim accumulates for every
service kind the **population within reach** of each facility, and divides it by
that facility's capacity to get a **load**. Load above 1 means oversubscribed.

Load feeds back into the field as a multiplier on `strength`, so an overloaded
service degrades smoothly instead of failing at a cliff:

```
effectiveStrength = strength × min(1, 1 / load)
```

This is deliberately the simplest rule that produces the wanted behaviour, and
it has one property worth stating: **two half-loaded clinics and one fully
loaded clinic covering the same people give the same result**, which is what
makes "build another one" a real answer to a service problem.

Where a tile is in reach of several facilities, their capacities sum before the
division. Coverage strength still takes the existing per-kind blend — capacity
changes what each source contributes, not how sources combine.

### Deriving the numbers

Every capacity and range in this programme comes from a published figure and our
own scale, and each epic's document shows its arithmetic. The method, once:

- A **range** comes from a response-time standard and a speed. A fire service
  standard of four minutes' travel, against the posted speed of the roads
  between, is a distance; that distance over 20 m tiles is a tile count.
- A **capacity** comes from a per-capita provision figure. Beds per thousand
  residents, school places per thousand dwellings, litres per person per day —
  each gives people-per-facility once the facility's own size is fixed.

The override, also once: if a derived figure makes the *small* facility
unaffordable at the milestone that unlocks it, the plan says so and states what
it took instead. A standard that produces an unbuyable first school is the wrong
standard for a 20 m-tile toy city, and hiding that in a rounded number is how
balance rots.

### Sequencing

The foundation is built alone and first, because every epic consumes it and
because it is the only change to an existing contract. After that the order is
by **how much each closes a loop**, not by size:

| # | Epic | Why here |
| --- | --- | --- |
| 0 | **Service capacity** | Shared foundation; nothing else starts until it lands |
| 1 | **Water & sewage** | Closes the biggest open loop; pure system, no new UI idioms |
| 2 | **Healthcare & death care** | Closes the birth/death loop; needs capacity most |
| 3 | **Education ladder** | Extends existing growth gating; lowest risk |
| 4 | **Emergency services** | Police and fire ladders; touches the dispatcher |
| 5 | **Garbage recovery** | Closes the waste loop; existing garbage system extends |
| 6 | **Power generation** | Smallest — a tier and a ceiling; can slot anywhere after 0 |
| 7 | **Transport depots** | Vehicles get an origin; interacts with traffic most |
| 8 | **Road maintenance** | Entirely new; roads must first be able to degrade |

**Disaster services are deliberately absent from this list.** The reference this
programme was scoped against carries them only as paid add-on content, which we
agreed to skip, so there is no base set to model from. They are also a different
kind of thing: a disaster service without disasters to respond to is a building
with no behaviour. If we want them, the honest route is to derive them from
public emergency-management practice and to build the *events* first — and that
is its own design question, not a line item here.

## What could go wrong

**Capacity makes every existing city worse.** Adding load to a save built
before it will oversubscribe services that were fine, and a player's city
degrades on upgrade. Mitigation is that a facility with no capacity figure —
every building in an old save — is treated as uncapped rather than as capacity
zero. That must be the default in the loader, not a special case bolted on
after.

**Population-in-reach is a per-tick cost we have not paid before.** Coverage is
already a BFS per facility per tick. Summing population within reach doubles the
work unless it rides on the same traversal. It must ride on the same traversal;
a second pass is the obvious wrong turn, and the budget in
[../performance-budget.md](../performance-budget.md) is the gate.

**Nine epics is a programme, not a feature.** The risk is that the foundation is
built for all nine and fits none of them well. Mitigation: epic 0 is built for
epics 1 and 2 only, and is allowed to change when epic 4 arrives with the
dispatcher's needs. A foundation designed against two real consumers is worth
more than one designed against nine imagined ones.

**Death care creates the first population sink.** Growth has only ever gone up.
An epic that can reduce population will find assumptions in demand and economy
that nobody has had to question, and those are more likely to be where the bugs
are than anything in the service code itself.

## Alternatives

**Capacity as a new field per service.** Rejected: fields are a grid-sized
allocation each, and load is per-facility, not per-tile. It would cost a map of
memory to store something already known at the source.

**A hard cap instead of a smooth multiplier.** Rejected: a service that works
perfectly at 1.0 load and not at all at 1.01 is a cliff the player cannot see
coming, and it makes the panel a pass/fail light rather than a gauge.

**One big services epic.** Rejected: it would touch the save format, the
dispatcher, the economy and the growth rules in one change, and nothing that
size has ever been reviewable. The sequence above is the point.

**Modelling the reference catalogue directly.** Rejected on two grounds. It is
another product's content, and it is balanced for a different tile scale and a
different simulation — its figures would not survive contact with a 20 m tile.
The taxonomy of municipal services is public knowledge and real; the numbers
should come from the same place the road model's did.

## How we will know it works

Per-epic tests live in each epic's document. The foundation's own:

- A facility with capacity for 1,000 people, covering 2,000, halves its
  effective strength — and covering 500 does not double it.
- Two facilities covering the same tiles sum their capacity before the division.
- A building with no capacity figure is uncapped, so a save from before this
  change behaves exactly as it did. This is the test that protects every
  existing city and it is written first.
- The load pass adds no second traversal: a profile over a city at the
  performance-budget size shows coverage cost within budget after the change.

Nothing here renders, so nothing here needs a screenshot. Every epic that places
a building does, and each says which shots.

## Out of scope

- Disasters as events, and the services that respond to them — see above.
- Per-citizen simulation. Capacity is an aggregate; nothing here tracks an
  individual to a facility.
- Reworking coverage. Road-network BFS from the nearest road tile is unchanged.
- Service vehicles as a general system. Each epic that needs vehicles uses the
  dispatcher that already exists.
