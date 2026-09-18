# Garbage recovery — design

- **Status:** Draft
- **Date:** 2026-09-18

## What the player gets

Rubbish stops being one dial. Today the city buries it or burns it, and the only
question is how many burners to buy. After this epic the stream can be taken
apart first: a drop-off yard a small town can afford, a sorting plant a city
can, and a transfer station that lets a facility serve ground its own collection
round cannot reach. Every tonne recovered is a tonne of landfill not painted, a
tonne not burned, and a credit on the statement.

Epic 5 of the programme in [municipal-services.md](municipal-services.md).

## Why it earns its place

The waste loop is open at the far end. Collection works — trash accumulates,
trucks run, a landfill fills, an incinerator burns — and then nothing comes back
out. Burning is the only sustainable outcome, so the system reduces to one
purchase repeated, which is a decision the player makes once.

Worse, burying is not currently a _worse_ option. It is not an option at all. A
painted landfill tile holds 600 units and a village of 400 people generates
4,000 units a game day, so the smallest legal landfill fills in about **six real
seconds** at 1× speed and then stops collecting forever. This epic makes burying
a real, cheap, finite, visibly-consumed option so recovery has something to be
better than.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md): a recovery
facility is the first waste building whose benefit the player can trace in three
places at once — the pile that grows slower, the burner that runs cooler, a line
on the budget.

## How it works, for the player

**Every facility that is not a hole in the ground forwards what it cannot
keep.** That is the one new rule and it covers both new buildings. A recovery
facility collects along the road network exactly as the landfill and the
incinerator already do, keeps the fraction it can recover, and sends the rest to
the nearest final disposal site it can reach. A transfer station keeps nothing
and forwards everything. A landfill and an incinerator forward nothing, which is
what makes them final.

**A recovery facility with nothing behind it fills up and stops.** The residue
has to go somewhere. Build a sorting plant and no landfill and it backs up
within a week, and the trash lens shows it — the incinerator's existing
full-buffer rule, which means the ladder cannot be climbed by skipping its
bottom rung.

**Two rounds, not one truck.** Recovery adds a second collection round with its
own livery rather than a split-body vehicle. A recycling round carries about a
fifth of the weight of a refuse round and wants a different route size; a split
body forces the two into the same one.

### The ladder

| Building                    | Serves | Diverts | Reach    | Cost / upkeep    | Unlocks at    |
| --------------------------- | ------ | ------- | -------- | ---------------- | ------------- |
| Recycling Centre            | 12,000 | 7%      | 32 tiles | ¢3,200 / ¢260    | Busy Township |
| Transfer Station            | 20,000 | none    | 40 tiles | ¢7,500 / ¢540    | Small City    |
| Materials Recovery Facility | 40,000 | 21%     | 48 tiles | ¢24,000 / ¢1,750 | Grand City    |

The recycling centre is a staffed drop-off yard — six roll-off containers, a
baler, a gatehouse — and does no processing, which is why it diverts so little
and covers so many people for so little. The transfer station diverts nothing at
all, because what it sells is **reach**. **Overlapping catchments do not
stack**: paper cannot be recycled twice, so a building in reach of both is
diverted at the better rate, once.

**What the player sees**, in order: the landfill pile grows visibly slower, on
the terrain rather than in a panel; the incinerator's plume shrinks, because
burn rate drives emission; a monthly credit appears; a second livery runs.

## What it interacts with

**The existing waste system, extended rather than replaced.** Landfill painting,
per-tile accumulation, the road-network collection radius, the incinerator's
buffer and burn, and the cosmetic fleet all stay as they are. The account in
[../../world-sim/services-model.md](../../world-sim/services-model.md) stays
accurate; recovery adds a step in front of it.

**The trash unit, which has to be fixed first.** A diversion percentage is
meaningless against a base rate that is wrong, and it is wrong in two ways — see
Tuning. Correcting it belongs here, because 21% of an incoherent number is an
incoherent number.

**Epic 0, service capacity.** Waste already has a capacity-like mechanic in the
incinerator's buffer, and the two are **not** the same quantity: a buffer is a
stock of material, epic 0's capacity is a population. They stay separate in the
data and unify at their source — a facility's buffer _and_ its people-served
figure both fall out of its daily throughput, so there is one dial with two
readings. See [service-capacity.md](service-capacity.md).

**The budget.** No funding slider: a sorting line that runs at half speed
because the budget says so is not a thing that happens to a sorting line. The
money here is capital, upkeep and the credit, booked through the existing pass
in [../economy.md](../economy.md). Nothing new gates growth — uncollected trash
does not feed land value or happiness today and this epic does not change that.

## Tuning

Every figure is derived from a published municipal standard and our own 20 m
tile. Settled values belong in [../balancing.md](../balancing.md).

### What a trash unit is, and what the existing numbers mean

Published municipal solid waste generation is **2.2 kg per person per day**
(4.9 lb, the national figure in the waste characterisation used throughout; the
global average is 0.74 and the high-income average 1.57, so this is the top of
the published band and the right end for a car-scaled city).

The code generates trash **per building**: 2 units a pass for a residential
building, times its level, 20 passes a game day. Divided by residents that is 10
units per resident-day for a level-1 house, 7.5 for a level-3 house, 5 for a
terrace and 0.8 for a level-3 tower — **a 12.5× spread** in which a flat-dweller
makes an eighth of a householder's rubbish. No published figure supports that;
generation becomes per resident and per job.

Taking the low-density house as the rung that is right, 10 units = 2.2 kg, so
**one unit is a shade over 0.2 kg**. We settle on **0.25 kg**, which makes 4,000
units a tonne and **9 units a resident-day**. On that reading the incinerator's
catalog entry says:

| Catalog figure           | In units   | Real terms                      | Verdict                            |
| ------------------------ | ---------- | ------------------------------- | ---------------------------------- |
| `burnRate: 4000` a pass  | 80,000/day | **20 t/day**, serving **9,100** | Too small by 15–30×                |
| `bufferCapacity: 400000` | 5 days     | **100 t** of pit storage        | Right — published storage is 3–5 d |
| `trucks: 4`              | —          | a fleet for **50,000** (below)  | Cosmetic; not a capacity           |
| 4×4 tiles at 20 m        | 18,500 m²  | a **300–600 t/day** plant       | The building is right              |

Three dimensions describing three plants, 15× apart. We trust the building: it
is what the player looks at, and
[../../art/civic-massing.md](../../art/civic-massing.md) is the only one of the
three with a rule behind it. `burnRate` is re-derived from it; `trucks` stays at
4, a render budget rather than a capacity.

**The landfill is short by 5,000×.** A tile renders a pile up to 6 m over
20 × 20 m — 2,400 m³ — and holds 600 units, which is 150 kg: 0.06 kg/m³, lighter
than air. Published in-place density for a lightly compacted municipal fill is
**0.3–0.5 t/m³** (0.6–0.9 with heavy compaction and daily cover); at the bottom
of the light band, 0.31 t/m³, a tile holds 2,400 × 310 ÷ 0.25 = **2,976,000
units**, settled at **3,000,000**. A city at the top milestone then consumes 54
tiles a game year; after a decade its fill is a 23-tile square, plainly visible
on a 256-tile map, and its upkeep is about 3% of income — where a published
municipal budget puts solid waste. Burying becomes cheap, finite and visible.

### The recovery rates

Diversion comes from published recovery rates by material weighted by published
composition. Nothing here is chosen.

| Material                  | Share | Recovered | Contribution |
| ------------------------- | ----- | --------- | ------------ |
| Paper and paperboard      | 23.1% | 68.2%     | 15.7 pp      |
| Food                      | 21.6% | 4.1%      | 0.9 pp       |
| Plastics                  | 12.2% | 8.7%      | 1.1 pp       |
| Yard trimmings            | 12.1% | 63.0%     | 7.6 pp       |
| Rubber, leather, textiles | 11.1% | 13.3%     | 1.5 pp       |
| Metals                    | 8.8%  | 34.0%     | 3.0 pp       |
| Wood                      | 6.2%  | 17.1%     | 1.1 pp       |
| Glass                     | 4.2%  | 31.3%     | 1.3 pp       |

The eight sum to **32.2%** against the published national recycling-and-
composting headline of 32.1% — the derivation checks against its own source.
**The recovery facility takes the four dry streams** — paper, plastics, metals,
glass — for **21.1%**, settled at **21%**; the 8.5 pp in food and yard trimmings
is composting, a different building, out of scope.

**The recycling centre takes the same four but only what residents bring.**
Published participation in drop-off-only programmes runs 20–30% of households
against 70–90% for kerbside; at the middle of each band it captures 25/80 = 31%
of what kerbside would, so 0.31 × 21.1 = 6.5%, settled at **7%**. This is the
softest figure here — if those bands are wrong, this number moves.

### Catchments, and the one figure we could not derive

A collection round's published time budget is roughly four hours on route, two
hauling and one at the disposal site across 4.3 round trips — 14 minutes one
way, about 9 km. Our whole map is 5.12 km across, so the published haul says
every facility is within reach of every round, and the existing 28-tile landfill
and 40-tile incinerator radii are a **game** constraint, not a physical one. The
three new reaches are calibrated against those two — 32, 40 and 48 tiles by
facility size — an assumption, stated rather than dressed up.

The transfer station inherits the finding. It pays for itself once the one-way
haul exceeds a published 15–25 km, three to five times the width of the map, so
the honest translation is that it **forwards to any facility on the map at no
distance penalty** — trailer economics never bind at our scale — and its value
is purely that it collects where the disposal site cannot.

### What a recovered unit is worth

A recovered tonne earns a blended commodity value of about **$75** for a
residential single-stream mix against a processing cost of about **$80**, and
prices have ranged from $40 to $180 within a decade. The two cancel _inside
their own volatility_, so the commodity cheque is not what recovery is for. What
recovery is for is the **avoided landfill tipping fee, about $55 a tonne** —
stable, and paid whether or not anyone wants the city's cardboard. The player is
not running a scrap business; they are not buying ground and not filling it.

In ¢ the credit is derived the same way, from what burying the unit would have
cost us in our own published-in-code figures. A landfill tile costs ¢40 to paint
and ¢3/month indefinitely, and post-closure care is a published 30-year
obligation, so a tile's whole-life cost is ¢40 + 360 × ¢3 = ¢1,120 across
3,000,000 units: **¢0.00037 a unit**, settled at **¢0.0004**, or **¢1.60 a tonne
recovered**. A 50,000-person city then diverts 2,835,000 units a month and earns
¢1,134 against ¢1,750 of upkeep — the credit covers two thirds of the plant and
the landfill not painted pays the rest, the real relation arrived at
independently.

### Building sizes

Derived by the civic-massing formula with one departure: a recovery building is
a single clear-span hall, so it is sized by **throughput and vehicle movement**
and the occupant-load method only confirms the staff fit, which it does by an
order of magnitude every time. Arithmetic in the
[technical document](../../engineering/features/garbage-recovery.md).

| Building                    | Plan area | Footprint | Height | Staff |
| --------------------------- | --------- | --------- | ------ | ----- |
| Recycling Centre            | 892 m²    | 2×3       | 8 m    | 3     |
| Transfer Station            | 1,870 m²  | 3×4       | 9 m    | 4     |
| Materials Recovery Facility | 3,785 m²  | 4×6       | 11 m   | 15    |

The affordability override holds at the bottom: ¢3,200 at Busy Township, whose
milestone reward alone is ¢15,000. Per tonne recovered the large facility costs
25% less to build and 33% less to run than the small one — the ladder rule.

**Pollution** is proportional to site vehicle movements, since none of the three
burns: 5 for the recycling centre at roughly one container pull a day, 20 for
the recovery facility at three inbound loads plus diesel loaders and a glass
breaker, and **25 for the transfer station** — dirtiest of the three despite
doing the least, because it handles the whole stream in an open hall.

## What it is not

- **Not composting.** The 8.5 pp in food and yard waste is a larger prize than
  half of what this epic recovers, and a different building with a different
  process. The number is stated above so the next epic need not derive it again.
- **Not a per-material simulation.** One stream, one diversion rate. Eight
  materials through three facilities is eight times the state for a figure the
  player reads as one percentage.
- **Not a rework of collection**, and not a payload model for trucks. The BFS,
  the building-id order and the full-buffer stop rule are unchanged, and a
  split-body vehicle would need trucks to carry something, which they do not.
- **Not waste export.** Shipping rubbish out of the city is real municipal
  practice and an interesting mechanic, and it needs somewhere to ship to. There
  is no outside world; see [../../DESIGN.md](../../DESIGN.md).
