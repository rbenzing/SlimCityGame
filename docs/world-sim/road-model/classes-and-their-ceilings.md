# Classes and their ceilings

A class fixes a posted-speed range and default, a per-lane throughput input,
a lane-count range (both directions summed), which lane pieces it admits,
whether it zones, and whether it carries water and power along the road
graph:

| class     | lanes | posted km/h (default) → m/s | throughput input        | per-lane cap | admits                                                  | zonable | utilities   |
| --------- | ----- | --------------------------- | ----------------------- | ------------ | ------------------------------------------------------- | ------- | ----------- |
| dirt      | 1–2   | 20–40 (30) → 8              | 250 veh/h (free-flow)   | 100          | travel, verge                                           | yes     | water only  |
| alley     | 1–2   | 20–40 (35) → 10             | 400 veh/h (free-flow)   | 175          | travel, parking                                         | yes     | water+power |
| rural     | 2     | 50–90 (60) → 17             | g/C 0.50                | 400          | travel, shoulder, verge                                 | yes     | water+power |
| local     | 2–3   | 30–50 (50) → 14             | g/C 0.37                | 300          | travel, centre-turn, parking, bike, sidewalk, verge     | yes     | water+power |
| urban     | 2–4   | 40–60 (60) → 17             | g/C 0.37                | 300          | + bus, tram, median                                     | yes     | water+power |
| collector | 2–5   | 50–70 (60) → 17             | g/C 0.43                | 350          | + centre-turn                                           | yes     | water+power |
| arterial  | 4–6   | 60–80 (65) → 18             | g/C 0.49                | 400          | bike, bus, tram, median, sidewalk, verge (no parking)   | yes     | water+power |
| divided   | 4–8   | 70–90 (80) → 22             | g/C 0.55                | 450          | travel, bus, median, barrier, shoulder, sidewalk, verge | yes     | water+power |
| one-way   | 1–5   | 40–60 (58) → 16             | g/C 0.67                | 550          | travel (one dir), parking, bike, bus, sidewalk, verge   | yes     | water+power |
| highway   | 3–6   | 90–120 (100) → 28           | 2,350 veh/h (free-flow) | 1,000        | travel (one dir), bus, shoulder, barrier, sound wall    | no      | power only  |
| ramp      | 1–2   | 50–80 (60) → 17             | 2,000 veh/h (free-flow) | 850          | travel (one dir), shoulder, sound wall                  | no      | power only  |

**A motorway is one carriageway, not a road with two halves.** Every other
class in the table counts both directions together; highway and ramp count
one, and they are the only classes that do. A dual carriageway is two
highway runs laid beside each other, each drawn in its own direction with
the direction arrows, the same way a real one is built and the same way it
is widened — a third lane is added to the side that needs it, not to both at
once. That is why the class admits no median piece: the median is the ground
between two carriageways, not a stripe inside one, and a highway that could
hold a median inside a single tile would be a road pretending to be two.

**Two carriageways may lie on adjacent tiles, and they do not connect.** A
highway beside a highway is two roads, not one wide one, so neither counts
the other as an arm: there is no mask bit between them, no graph edge, and no
junction. Counted as neighbours they would read as a junction their whole
length — drawn as one unpainted slab with no lane or edge lines, and joined by
a graph edge that let traffic drift sideways out of one carriageway into the
oncoming one. The only way onto or off a motorway is a ramp, so a ramp lying
alongside IS an arm, and that is how an interchange is built. See
[How roads meet: rank, replacement and transitions](how-roads-meet-rank-replacement-and-transitions.md).

Three lanes is the floor because a motorway with two is an expressway. Six is
the ceiling because of the width budget: three lanes and their shoulders come
to 15.45 m and four to 19.2 m, both inside the 20 m tile, while five reach
22.95 m and six 26.7 m — so a five- or six-lane carriageway is a two-tile
corridor, which is exactly the case the corridor rule already admits, and a
seventh lane is past anything this grid can draw honestly.

A motorway also has no sewer beneath it. It drains off the shoulder to the
verge rather than to a buried line under the running surface, which is why
the class carries no water, and why no manhole cover belongs on it — see
[Furniture and what gates it](furniture-and-what-gates-it.md).

Rail is a twelfth class (5.6 m gauge-and-ballast piece, its own network, no
lane range) — see [transit-model.md](../transit-model.md). Every figure in this
table is derived once from the formulas in
[Capacity, control delay and warrants — the formulas](capacity-control-delay-and-warrants--the-formulas.md)
and rounded to the nearest 25, so it reads as a catalog number rather than a
decimal.

Nine of these twelve classes ship a preset the drawer offers today: dirt
(Gravel Road), alley (Alley), local (Two-Lane Road, Bike Lane), urban
(Four-Lane Road, Tram Track), arterial (Avenue, Bus Lane), one-way (One-Way
Road), highway (Highway), ramp (Ramp) and rail (Rail Track). Rural,
collector and divided are fully specified in the class table above — they
already drive the capacity, delay and warrant formulas below wherever a
composed profile names them — but neither the road drawer nor the profile
editor currently offers a way to compose one from scratch, so a player
cannot yet build a rural road, a collector or a divided road.

