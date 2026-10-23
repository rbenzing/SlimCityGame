# Parks and recreation — design

- **Status:** Built 2026-10-23 (drafted 2026-09-18; the rungs re-sized to real
  park sizes and re-priced by real cost ratios at the player's choice; the
  rules in slice 1, the kits in slice 2)
- **Date:** 2026-10-23

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
480 tiles — one district park and a neighbourhood park, or six neighbourhood
parks, or a mix. No buying that with dots.

**Parks are real-sized.** A park is ground, not a building, so the siting rule
that keeps a civic building under six tiles of frontage does not apply to it:
a neighbourhood park is the five to ten acres a real one is, and a district
park is a real community park of forty acres, a quarter of a square mile that
a district is laid out around. The player chose this (2026-10-23) over the
earlier draft's parks shrunk to fit the building rule.

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

| Rung                   | Footprint | Acres | Capacity | Reach   | What it is for                  |
| ---------------------- | --------- | ----- | -------- | ------- | ------------------------------- |
| **Pocket Park**        | 1×1       | 0.1   | 32       | 400 m   | Closing the last gap            |
| **Civic Plaza**        | 5×5       | 2.5   | 675      | 700 m   | Provision where grass is wrong  |
| **Neighbourhood Park** | 9×9       | 8.0   | 1,053    | 480 m   | The everyday one, built often   |
| **District Park**      | 20×20     | 39.5  | 4,000    | 710 m   | The flagship, and the value one |
| **Sports Ground**      | 6×4       | 2.4   | 120      | 1,200 m | Reach, bought with ground       |

Each rung is a different decision because the standard gives each a different
amount of ground per head, and the ranking is not the obvious one.

- **Pocket Park** is not a cheap park; it is a park for thirty-two people, which
  in a city of thousands is nothing. It exists to reach an address nothing else
  reaches, and thirty of them buy reach without buying provision.
- **Neighbourhood Park** has the shortest reach of the green rungs — 480 m — so
  it is the one you need **many** of, and a spreading city keeps buying it: a
  thousand people's worth of amenity green on eight acres, every half mile.
  **District Park** is its opposite: forty acres and four thousand people's
  provision, the largest land-value uplift in the game, one per city or one
  per district in a big one, sited where value should rise and the city laid
  out around it.
- **Sports Ground** is the least efficient ground in the game — 24 tiles for 120
  people — and has by far the longest reach. It is how a sprawling city covers
  its sport obligation at all, and a mild disamenity up close, so the honest
  siting is a district's edge rather than its middle.
- **Civic Plaza** is the downtown answer: two and a half acres of paving, the
  size of a real city square. The standard asks far less hard-surfaced
  provision per head than parkland, so paving serves about 2.7 times the
  people per tile that grass does and buys almost no land value: you keep a
  dense district provided rather than make it nicer. It is also the dearest
  ground per acre the city can buy.

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

**The catalog has a bug in this category, and this epic fixes it.** `airport`
— "International Airport", 8×6 — is filed as `category: 'park'` with
`service: { kind: 'park' }`, so it appears in the **Parks** drawer, contributes
park coverage, and would count as 48 tiles of open space with a recreation
capacity. An airport is not a park. Its category becomes `'transit'`, which
already exists and has a drawer, and its `service` block goes — there is no
`ServiceKind` for air transport and recreation is not a substitute. The player
chose to fix it here (2026-10-23) rather than ship a provision figure that
lies while an airport stands; an airport in a save keeps its tiles, loses its
park coverage and the land-value bonus it stamped on its own ground, and no
longer counts as open space. An airport at 160 noise was never a reason for
land value to rise.

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
| Other outdoor provision (Civic Plaza)   | 0.30       | 3.0       | 133         | 27  | 25    | **675**      |
| Amenity greenspace (Neighbourhood Park) | 0.60       | 6.0       | 67          | 13  | 81    | **1,053**    |
| Parks and gardens (District Park)       | 0.80       | 8.0       | 50          | 10  | 400   | **4,000**    |
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
is what the panel reports against. Capacity scales with the tiles a rung
really covers, so a forty-acre district park carries four thousand people's
provision, as forty acres do.

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
four of the five rungs — there is no floor, and its six-tile siting rule is a
building's rule, from which open space is exempt. Their sizes are the real
sizes of the US park types, from the NRPA park classification (Mertes & Hall,
_Park, Recreation, Open Space and Greenway Guidelines_, as cities cite it:
mini-park 2,500 sq ft to 1 acre, neighbourhood park 5 to 10 acres,
community park 30 to 50 acres —
[Wichita Falls](https://www.wichitafallstx.gov/DocumentView.aspx?DID=5509),
[Little Rock](https://LittleRock.gov/media/20749/classifications-and-land-needs-assessment-part-1.pdf)),
and for the pitch a dimension. One tile is 400 m², 0.099 acre; ten tiles are
an acre.

| Rung               | Size  | Acres | Derivation                                                                                                                                                                                                                                                                                       |
| ------------------ | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pocket Park        | 1×1   | 0.1   | The Fields in Trust minimum activity zone for a Locally Equipped Area for Play is 400 m², one tile, inside the NRPA mini-park's range. Unchanged, so every save's pocket parks stand.                                                                                                            |
| Civic Plaza        | 5×5   | 2.5   | A real city square: a sample of historic squares averages 2.45 acres ([Montgomery County](https://www.montgomeryplanning.org/community/ssgreenspace/documents/SSGreenSpaceGuidelinesAppendix4.pdf)), Union Square is 2.6, Campus Martius 1.6. 100 m across.                                      |
| Neighbourhood Park | 9×9   | 8.0   | NRPA's 5 to 10 acres, toward the top of the range so a 1,000 m² play zone, a lawn and a treed edge all fit. 180 m across.                                                                                                                                                                        |
| District Park      | 20×20 | 39.5  | NRPA's community park, 30 to 50 acres, at 40. 400 m across, a quarter of a square mile: the park a district is laid out around.                                                                                                                                                                  |
| Sports Ground      | 6×4   | 2.4   | Sized by the pitch. FIFA's recommended field of play is 105 m × 68 m and The FA requires a 3 m minimum run-off all round, giving 111 m × 74 m graded = 5.55 × 3.7 tiles, 2.03 acres; the pavilion and its apron take the rest. The pitch alone is 5.25 tiles long, so this rung cannot be small. |

**A park drapes on the ground.** A ploppable levels its footprint to one
height; forty acres levelled would be a plateau. A park keeps the ground it
is laid on, lawn, paths and trees following the terrain, as a lot's lawn
does. Only what has to be flat is: the sports ground's pitch and pavilion,
and the plaza's paving, level their own ground, and nothing else does.

The **only** floor area in the epic is the sports ground's changing pavilion: 36
occupants × 4.6 m² (the vocational-room factor) = 166 m² net, ÷ 0.65 efficiency =
255 m² gross, over one storey = 255 ÷ 185 = 1.4 tiles, so a 2×1 block 3.2 m tall.
Per civic-massing's campus-services rule a grounds-led facility is read by its
grounds, so the pavilion sits at the site edge, never mid-pitch.

### Cost and strength

Each rung is priced off the pocket park by what the real thing costs, the
player's standing choice for civic buildings. The anchor: a 400 m² equipped
pocket park is about $366,000 to build (Lewisville, Texas, 6,612 sq ft for
$556,000 in 2025–26, $84 a square foot,
[TDLR](https://www.tdlr.texas.gov/TABS/Search/Print/TABS2025024601)), and
about $6,000 a year to keep (a playground's $2,500–7,500 plus the NRPA median
of $9,470 an acre,
[NRPA 2026 Agency Performance Review](https://www.nrpa.org/globalassets/research/research-reports/2026-agency-performance-review.pdf)),
so ¢400 and ¢20 stand for those. The rest scale by sourced cost per acre
times the rung's real acreage, and by the NRPA median upkeep per acre:

| Rung               | Build, real                                                                                                                                                                                                                                                                                                                                                                           | × pocket | Cost   | Keep, real                                                              | × pocket | Upkeep |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------------- | -------- | ------ |
| Pocket Park        | $366k                                                                                                                                                                                                                                                                                                                                                                                 | 1        | 400    | $6k                                                                     | 1        | 20     |
| Civic Plaza        | 2.5 ac × $5.2M/ac (Lakewood, Washington, Colonial Plaza: 18,972 sq ft of pavers, seat walls and lighting, engineer's estimate $2.25M in 2019, [City of Lakewood](https://cityoflakewood.us/wp-content/uploads/2019/04/Colonial-Plaza-presentation.pdf)) = $13.0M                                                                                                                      | 35.5     | 14,200 | 2.5 ac × $9,470 = $24k (the NRPA median; no hardscape figure was found) | 4        | 80     |
| Neighbourhood Park | 8.0 ac × $580k/ac (Dixon, California, park impact fee nexus study 2023, neighbourhood parks, [City of Dixon](https://www.cityofdixonca.gov/media/Parks%20Masterplan/Dixon%20Park%20Impact%20Fee%20Nexus%20Study%20December%202023.pdf); Hayward 2019 puts local parks at $1.1M/ac) = $4.6M                                                                                            | 12.7     | 5,100  | 8.0 ac × $9,470 = $76k                                                  | 12.6     | 250    |
| District Park      | 39.5 ac × $1.02M/ac (Dixon 2023, community parks) = $40.2M                                                                                                                                                                                                                                                                                                                            | 110      | 44,000 | 39.5 ac × $9,470 = $374k                                                | 62       | 1,250  |
| Sports Ground      | a natural-grass field, $610k (2026 vendor range $400–820k, [Sports Venue Calculator](https://sportsvenuecalculator.com/knowledge/artificial-turf-field/how-much-does-a-turf-field-cost/)), plus a prefabricated restroom pavilion, $650k (Coconino County 2025, [Arizona Daily Sun](https://azdailysun.com/eedition/page-a3/page_306dc3d7-a1b2-5775-926c-b6362c1ef48c.html)) = $1.26M | 3.4      | 1,400  | a grass field's $27–35k a year plus the pavilion, about $36k            | 6        | 120    |

The ranking is the real one: paving is the dearest ground per acre a city
buys, developed parkland the cheapest, and a forty-acre park costs what a
forty-acre park costs. Unlocks follow the ladder: the pocket park at the
start as now, the neighbourhood park at the first milestone, the sports
ground and the plaza at the second, the district park at the third — stated,
not derived.

| Rung               | Premium | `strength` | `landValueBonus` |
| ------------------ | ------- | ---------- | ---------------- |
| Pocket Park        | 8%      | 80         | 40               |
| Civic Plaza        | 5%      | 50         | 30               |
| Neighbourhood Park | 10%     | 100        | 60               |
| District Park      | 20%     | 200        | 100              |
| Sports Ground      | 5%      | 50         | 40               |

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
the neighbourhood park at 5,100 — is a town's purchase, priced like its
clinic and school.

## What it is not

- **Not a decoration system.** No flowerbeds, statues or fountains whose only
  effect is a land-value number — the thing this epic exists to replace.
- **Not tourism, and not landmarks.** A park drawing visitors from outside the
  city is a different system, and the city has no visitors.
- **Not per-citizen leisure.** Nobody is tracked to a park; capacity is an
  aggregate against a catchment.
- **Not a new scalar field**, and **not a coverage rework**. BFS is untouched;
  the one change to how park coverage _combines_ is in the technical plan.
