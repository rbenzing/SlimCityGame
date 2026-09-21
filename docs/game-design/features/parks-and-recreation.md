# Parks and recreation — design

- **Status:** Draft
- **Date:** 2026-09-18

Epic 8 of [municipal-services.md](municipal-services.md), and the last of it; the
technical plan is
[../../engineering/features/parks-and-recreation.md](../../engineering/features/parks-and-recreation.md).

## What the player gets

Open space that has to be **planned** rather than sprinkled. Four new places to
put people — a neighbourhood park, a district park, a sports ground and a hard
civic plaza — and a rule that says how much of them a city of a given size needs
and how far anyone should have to walk to reach one. A readout that says "38
tiles of open space per 1,000 residents; the standard is 60", and a park that can
be **full**, which the player sees as worn grass before they see it in a panel.
The question stops being "have I dotted enough pocket parks" and becomes "how
much ground am I giving to open space, and is it where the people are".

## Why it earns its place

A park today is a land-value sticker. `small-park` is one tile, costs 400, and
adds land value both at its footprint and, additively, across everything within
16 tiles of road — so two overlapping pocket parks stack. The optimal play is not
to build a park system; it is to **tile the city with the cheapest park in the
catalog**. That is not a decision, it is arithmetic the player does once and
repeats.

Being last in the programme is the argument for taking it seriously, not against
it. Every other service answers a need the city fails without. Recreation is the
one it survives without, so if it ships as a bigger sticker it does not deserve a
slot at all. What replaces it comes from how open space is actually planned:
municipal standards are two rules, not one — a **quantity** in hectares per 1,000
residents, and an **accessibility** maximum walking distance to the nearest space
of each kind. Quantity alone is satisfied by one enormous park in a corner;
accessibility alone by a hundred dots. A city has to buy real ground **and**
spread it, and neither answer substitutes for the other. Serves the
**city is legible through data lenses** pillar in
[../gdd.md](../gdd.md): open-space provision becomes a number the player can
read, trace to a decision, and fix.

## How it works, for the player

**1. The city needs ground in proportion to its people.** The target is 60 tiles
of open space per 1,000 residents (derived below). A city of 8,000 needs about
480 tiles — nineteen district parks, or a mix. No buying that with dots.

**2. Open space serves the people who can walk to it.** Each rung carries its own
walking-distance standard: a pocket park reaches 400 m, a sports ground 1,200 m.
Coverage is road-network travel as it is everywhere else, so a park behind a
cul-de-sac serves the cul-de-sac.

**3. A park fills up.** Under [service-capacity.md](service-capacity.md) every
facility carries a capacity in people and overlapping facilities pool theirs into
one catchment. Parks are the one service epic 0 left uncapped; this epic caps
them. A catchment holding more people than its pool gives less, smoothly rather
than off a cliff.

### The ladder

| Rung                   | Footprint | Capacity | Reach   | What it is for                  |
| ---------------------- | --------- | -------- | ------- | ------------------------------- |
| **Pocket Park**        | 1×1       | 32       | 400 m   | Closing the last gap            |
| **Civic Plaza**        | 2×2       | 108      | 700 m   | Provision where grass is wrong  |
| **Neighbourhood Park** | 3×3       | 117      | 480 m   | The everyday one, built often   |
| **District Park**      | 5×5       | 250      | 710 m   | The flagship, and the value one |
| **Sports Ground**      | 6×4       | 120      | 1,200 m | Reach, bought with ground       |

Each rung is a different decision because the standard gives each a different
amount of ground per head, and the ranking is not the obvious one.

- **Pocket Park** is not a cheap park; it is a park for thirty-two people, which
  in a city of thousands is nothing. It exists to reach an address nothing else
  reaches, and thirty of them buy reach without buying provision.
- **Neighbourhood Park** has the shortest reach of the green rungs — 480 m — so
  it is the one you need **many** of, and a spreading city keeps buying it.
  **District Park** is its opposite: the most capacity of any facility and the
  largest land-value uplift, one per district, sited where value should rise.
- **Sports Ground** is the least efficient ground in the game — 24 tiles for 120
  people — and has by far the longest reach. It is how a sprawling city covers
  its sport obligation at all, and a mild disamenity up close, so the honest
  siting is a district's edge rather than its middle.
- **Civic Plaza** is the downtown answer. The standard asks far less
  hard-surfaced provision per head than parkland, so paving serves about 2.7
  times the people per tile that grass does and buys almost no land value: you
  keep a dense district provided rather than make it nicer.

### What an overloaded park looks like

The least obvious capacity in the programme, so it gets the most feedback — and
the most important of it is in the world, not in a panel. **The grass wears.**
Past a catchment load of 1.0 the lawn reads scuffed and then
bare: desire lines across the middle, worn edges at the entrances. Every player
has seen a real park worn out by use, so this is the primary read. It also gets
busy, with more pedestrians standing on it, using the walkers the city already
has. The land-value halo thins, visibly paler in the overlay than around a park
with headroom. And the panel says so, with catchment load and the provision line.
A player who ignores all four sees a district whose land value stops rising and
does not know why. A player who looks at the park sees worn grass and does.

## What it interacts with

**Land value, and only land value.** Recreation writes into `LandValue` as it
does today, and this epic gives it no second target. Two reasons, and the second
settles it. Land value is the _correct_ field: proximity to open space
capitalising into property value is the best-evidenced effect open space has. And
`Happiness` cannot be written to — it is recomputed from scratch every time its
slot comes up, education, health, land value, pollution, crime and traffic in and
a byte out, so anything a park wrote there is destroyed on the next pass. "Both"
is not an option the data model offers.

Recreation therefore reaches happiness the way it already does, through the
land-value term in that recompute. If it deserves more weight, the change is one
coefficient there — and this epic should not make it, because moving that
coefficient moves pollution, crime and traffic too. A tuning question for
[../balancing.md](../balancing.md). **And no new field:** a `Recreation` field
would be a whole map of bytes for something land value already carries, and the
programme has rejected per-service fields already.

**Growth and traffic.** Land value gates what a zone grows into, so a park
programme is a growth programme and an overloaded one stalls the district it was
meant to lift. Parks are also the only service that makes trips _shorter_ — they
generate walking, and none dispatches a vehicle — so this is the one epic in the
programme that adds no traffic.

**The catalog has a bug in this category.** `airport` — "International Airport",
8×6 — is filed as `category: 'park'` with `service: { kind: 'park' }`, so it
appears in the **Parks** drawer, contributes park coverage, and under this epic
would count as 48 tiles of open space with a recreation capacity. An airport is
not a park. Its category should be `'transit'`, which already exists and has a
drawer, and its `service` block should go — there is no `ServiceKind` for air
transport and recreation is not a substitute. **Fixing it is not part of this
epic**; it belongs with transport. But no parks work should sit on a catalog that
believes an airport is open space.

## Tuning

Every figure is derived from a published municipal standard and our own scale.
The scale is [../../art/README.md](../../art/README.md): tiles are 20 m, so **one
tile is 400 m²** and **one hectare is 25 tiles**. The standards are the Fields in
Trust benchmark guidelines from _Guidance for Outdoor Sport and Play: Beyond the
Six Acre Standard_ (2015), which give per typology a quantity in hectares per
1,000 population and a maximum walking distance.

### Quantity, converted to capacity

| Typology (rung)                         | ha / 1,000 | m² / res. | Res. / tile | ÷ 5 | Tiles | **Capacity** |
| --------------------------------------- | ---------- | --------- | ----------- | --- | ----- | ------------ |
| Equipped play (Pocket Park)             | 0.25       | 2.5       | 160         | 32  | 1     | **32**       |
| Other outdoor provision (Civic Plaza)   | 0.30       | 3.0       | 133         | 27  | 4     | **108**      |
| Amenity greenspace (Neighbourhood Park) | 0.60       | 6.0       | 67          | 13  | 9     | **117**      |
| Parks and gardens (District Park)       | 0.80       | 8.0       | 50          | 10  | 25    | **250**      |
| All outdoor sports (Sports Ground)      | 1.60       | 16.0      | 25          | 5   | 24    | **120**      |

Residents per tile is 400 m² ÷ the m² each resident is owed, and it is the whole
reason the rungs differ: the standard asks six times as much sports ground per
head as equipped play, so a tile of pitch serves a sixth as many people.
**Dividing by five is arithmetic, not a fudge.** The simulation has one `park`
kind, and pooling the five typologies into it overstates capacity fivefold — a city
provided exactly to standard would hold five separate provisions and a pooled
load of 0.2. Dividing restores 1.0: for 1,000 residents at standard, 6 tiles of
pocket park, 8 of plaza, 15 of neighbourhood park, 20 of district park and 40 of
sports ground is 89 tiles, and 192+216+195+200+200 = 1,003 of capacity. **The
headline figure** is the Six Acre Standard the guidance is named for: 2.4 ha per
1,000 population, so 2.4 × 25 tiles/ha = **60 tiles per 1,000 residents**, which
is what the panel reports against.

### Walking distance, converted to range

The guidance's distances are pedestrian route distances — it quotes 1,200 m as
"15 minutes", which is 1.33 m/s, ordinary walking speed. Our coverage BFS is also
route distance along roads, so the conversion is a division with no fudge factor.
Coverage then radiates 2 tiles around each road tile it reaches — the walk from
road to gate — so `range` is the standard minus those 2 tiles.

| Rung               | Standard | ÷ 20 m    | − 2 radiated | `range` |
| ------------------ | -------- | --------- | ------------ | ------- |
| Pocket Park (LEAP) | 400 m    | 20        | 18           | **18**  |
| Neighbourhood Park | 480 m    | 24        | 22           | **22**  |
| Civic Plaza        | 700 m    | 35        | 33           | **33**  |
| District Park      | 710 m    | 35.5 → 36 | 34           | **34**  |
| Sports Ground      | 1,200 m  | 60        | 58           | **58**  |

**Does `range: 16` survive? No, by one tile.** 16 plus the 2 radiated is 18
tiles, or 360 m, against a 400 m doorstep standard. The correction is
`range: 18`, which lands on 400 m exactly — a small error, invisible until now
because nothing checked a park's reach against anything.

### Sizes, from ground rather than floor area

Most of this epic is **ground, not floor area**, so the gross-floor-area formula
in [../../art/civic-massing.md](../../art/civic-massing.md) does not apply to
four of the five rungs — there is no floor. Their sizes come from area standards,
and for the pitch a dimension:

| Rung               | Size | Derivation                                                                                                                                                                                                                                           |
| ------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pocket Park        | 1×1  | The Fields in Trust minimum activity zone for a Locally Equipped Area for Play is 400 m², which is one tile. Unchanged, now justified.                                                                                                               |
| Civic Plaza        | 2×2  | 40 m across; a square below about 25 m reads as a forecourt and one tile is 20 m. **Assumption:** the capacity is derived, the footprint is a scale judgement.                                                                                       |
| Neighbourhood Park | 3×3  | 3,600 m² = 0.36 ha, just under the 0.4 ha ceiling the published hierarchies put on their smallest named park, and big enough for a 1,000 m² play zone with ground around it.                                                                         |
| District Park      | 5×5  | Exactly 1 ha. **Override:** the published district park is 20 ha — 500 tiles, 447 m across, twenty-two tiles of frontage — which breaks civic-massing's 6-tile siting rule outright, so 1 ha is taken instead.                                       |
| Sports Ground      | 6×4  | Sized by the pitch. FIFA's recommended field of play is 105 m × 68 m and The FA requires a 3 m minimum run-off all round, giving 111 m × 74 m graded = 5.55 × 3.7 tiles. The pitch alone is 5.25 tiles long, which is why this rung cannot be small. |

The **only** floor area in the epic is the sports ground's changing pavilion: 36
occupants × 4.6 m² (the vocational-room factor) = 166 m² net, ÷ 0.65 efficiency =
255 m² gross, over one storey = 255 ÷ 185 = 1.4 tiles, so a 2×1 block 3.2 m tall.
Per civic-massing's campus-services rule a grounds-led facility is read by its
grounds, so the pavilion sits at the site edge, never mid-pitch.

### Cost and strength

Cost is ground plus edge, the shape of the real thing: paths, gates and planting
scale with perimeter while turf scales with area. Calibrated on the pocket park —
120 per tile of ground and 70 per perimeter tile gives its catalog cost of 400
exactly — varying only the ground rate. Upkeep is that park's own 5%-of-cost
ratio, halved for the plaza because open space's recurring cost is mowing.

| Rung               | Ground rate        | Cost  | Upkeep | Premium | `strength` | `landValueBonus` |
| ------------------ | ------------------ | ----- | ------ | ------- | ---------- | ---------------- |
| Pocket Park        | 120                | 400   | 20     | 8%      | 80         | 40               |
| Civic Plaza        | 320 (paving)       | 1,850 | 45     | 5%      | 50         | 30               |
| Neighbourhood Park | 100                | 1,750 | 90     | 10%     | 100        | 60               |
| District Park      | 90                 | 3,650 | 180    | 20%     | 200        | 100              |
| Sports Ground      | 60 + 800 pitch kit | 3,600 | 180    | 5%      | 50         | 40               |

**`strength` has no municipal standard, and that is said rather than hidden.** It
is the size of the land-value uplift, and the published evidence for it is the
hedonic-pricing literature on park proximity: roughly a 20% premium for property
abutting a large well-kept park, falling with distance and with active use. 20%
of the 255-byte field, against the `/4` the coverage blend applies, gives 204 for
a district park, and the rungs scale by the premium each would command. The
pocket park's existing 80 falls out unchanged — evidence the number was never
wrong, only its range. `landValueBonus` seeds the diffusion from a facility's own
tiles; it too is a dial with no standard, settled in
[../balancing.md](../balancing.md). **The affordability override does not bite:**
the pocket park at 400 is affordable at milestone 0, and the first real rung —
the neighbourhood park at 1,750 — sits below the existing clinic and school.

## What it is not

- **Not a decoration system.** No flowerbeds, statues or fountains whose only
  effect is a land-value number — the thing this epic exists to replace.
- **Not tourism, and not landmarks.** A park drawing visitors from outside the
  city is a different system, and the city has no visitors.
- **Not per-citizen leisure.** Nobody is tracked to a park; capacity is an
  aggregate against a catchment. **Not an airport fix** either — that is named
  above because parks work sits on top of it, but correcting it is transport's.
- **Not a new scalar field**, and **not a coverage rework**. BFS is untouched;
  the one change to how park coverage _combines_ is in the technical plan.
