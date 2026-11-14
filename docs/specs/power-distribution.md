# Power distribution

- **Status:** Built

**Owns:** how electricity travels, and is drawn, between a generator and a building: the street's own supply, the lines and cables the player strings, the substation, and what each costs to build and to keep.

**Rules:**

- Keep every sealed street carrying power from a generator that touches it; a first town needs nothing more. `[R-services-001]`
- Draw what a powered street carries: a roadside pole line by default, a buried cable with its boxes where the player pays to bury it. `[R-services-039]`
- Stand a pole behind the kerb and outside the footway; never in a carriageway, a median, a junction tile or a drive. `[R-services-039]`
- Keep every wire 1.83 m, in any direction, from a lamp or a signal support it is not hung on; a lamp that would stand nearer hangs on the nearest power pole. `[R-services-042]`
- Carry power along a motorway, a ramp, a bridge deck and a tram guideway with nothing drawn; cross them, and rail, at right angles.
- Start a strung line or a laid cable at a power station, a substation or a line already live; it serves everything beside it. `[R-services-039]`
- Charge a cable about eight times a pole line to build and less each month to keep; an overhead line pays for its poles and its trees.
- Show buried cable only in the underground view; mark it on the surface with its boxes and riser poles.
- Draw every pole, wire, box and substation at its real size.

**Numbers:** derivations and every source are in [the sources](../sources/power-distribution.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Street pole, above ground | 10.4 | m | 40 ft pole set 6 ft, [PRE CNS 002](../sources/power-distribution.md#the-pole) |
| Street pole span | 40 | m | urban 100 to 150 ft, [same](../sources/power-distribution.md#the-pole) |
| Longest street span | 45.72 (150 ft) | m | the top of that range; an extra pole stands where a slide or a junction would pass it |
| Wire clear of a lamp or signal support | 1.83 (6 ft), radial | m | [California GO 95, Rule 37, Table 1, Case 10](https://ia.cpuc.ca.gov/GOs/Resmajor/SU10/SU10_GO95_rule_37-Table-1.html), 750 to 22,500 V |
| Pole-mounted light under the lowest wire | 0.76 (30 in) | m, least | National Grid's street-light standard, citing NESC Table 239 |
| Open-ground and gravel-road span | 80 | m | rural 250 to 300 ft, [same](../sources/power-distribution.md#the-pole) |
| Pole behind the kerb face | 0.6 | m, least | [Hawaii DOT rule](../sources/power-distribution.md#where-a-pole-stands) |
| Wire over a road | 4.7 | m, least | NESC 15.5 ft, [clearances](../sources/power-distribution.md#clearances) |
| Cross-country pole, above ground | 21 | m | 69 kV, 70 to 80 ft, [sub-transmission](../sources/power-distribution.md#the-cross-country-line) |
| Cross-country span | 100 | m | 300 to 400 ft, [same](../sources/power-distribution.md#the-cross-country-line) |
| Substation footprint | 2 × 2 | tiles | 25 MVA on half an acre, [substation](../sources/power-distribution.md#the-substation) |
| Substation price, upkeep | ¢300, ¢6 a month, from the first milestone | | $3 million, the least a 69 kV substation costs, at the wind turbine's ¢100 to the $1 million; upkeep a dial, [substation](../sources/power-distribution.md#the-substation) |
| Line layer's values | 1 a line an older save holds, live as before; 2 a line laid to the source-end rule; 3 kept for the cable | byte | `PowerLineKind`, `src/shared/types.ts` |
| Where power enters a line | a generator's or a substation's footprint, or a live line; never a street | | the source-end rule |
| Junction box | 1.9 × 1.8 × 1.15 | m | pad-mounted switchgear, [boxes](../sources/power-distribution.md#boxes-on-the-surface) |
| Pad-mounted transformer | 1.0 × 0.9 × 0.8 | m | [boxes](../sources/power-distribution.md#boxes-on-the-surface) |
| Clear space before a box's doors | 3 | m | 10 ft, [boxes](../sources/power-distribution.md#boxes-on-the-surface) |
| Cable depth | 0.9 | m | 36 in, [burial](../sources/power-distribution.md#burial) |
| Cable build cost | 8 | × pole line | $120k against $0.7M to $1.5M a mile, [cost](../sources/power-distribution.md#what-it-costs-to-build) |
| Poles replaced | 2.7 | % a year | [upkeep](../sources/power-distribution.md#what-it-costs-to-keep) |
| Upkeep a cable avoids | 370 | $ a mile a year | trees and pole inspection, [upkeep](../sources/power-distribution.md#what-it-costs-to-keep) |
| Cable price, upkeep | ¢96 a tile, eight times the line's ¢12; ¢0.25 a tile a month, half the line's | | `src/shared/constants.ts`; the half is a dial |
| A buried street | its cable charges no upkeep of its own, and the street's upkeep falls by ¢0.25 a tile a month, never below nothing | | a dial: what its poles cost to keep |
| Pad-mounted transformer along a buried street | one every fourth tile, on the side its poles stood | | a dial: no figure for homes a transformer serves was read |
| The cable in the line layer | value 3; the source-end rule holds for it as for a line, but under a sealed street it conducts as the street does | byte | `PowerLineKind.Cable` |
| The cable underground | drawn on the terrain with the pipes, not 0.9 m down; under the footway on the side the poles stood, 0.6 wide beside a pipe's 1.2 | m | `src/render/cables.ts` |

**Code:** `src/world/powerline.ts` the line layer, where a line may go and `alongStreetRefusal`; `src/sim/network.ts` `conductsPower` and the reach; `src/render/powerpoles.ts` where a pole, a wire and a guy stand; `src/render/powerlines.ts` the renderer, a slot a terrain chunk; `src/render/freeroadmesh.ts` `freeRoadPoleLay` the line along a curved street; `src/shared/placement.ts` `POWER_LINE_REFUSALS`; `src/sim/network.ts` the source-end rule: a line laid to it is entered only from a generator, a supplied substation or a live line; `src/data/catalog.json` `substation`; `src/render/substationkit.ts` its kit; `src/world/powerline.ts` `lineChanges` a line or a cable laid over the other; `src/sim/economy.ts` the cable's upkeep and a buried street's; `src/render/powerpoles.ts` a buried street's risers, pad transformers and a cable's boxes; `src/render/cables.ts` the cable in the underground view; `src/ui/categories.ts` the Buried Cable card; `tools/powerline-shots.mjs`, `tools/underground-shots.mjs`.

**Tests:** `src/render/powerpoles.test.ts` pole placement by road class, the side kept, spans, guys and the wire's height over a road; `tests/interaction/powerlinerefusal.test.ts` a line along a sealed street refused, a crossing accepted, an older save's line kept; `src/sim/network.test.ts`, `tests/interaction/powerlinesource.test.ts` the source-end rule, its refusal, undo and redo of mixed lines, a line whose source is gone; `src/world/grid.test.ts` both values saved and an older save's lines kept; `src/render/substationkit.test.ts` the kit; `tests/interaction/powercable.test.ts`, `src/sim/economy.test.ts` the cable's price, refund and upkeep, a buried street's upkeep, undo and redo, the saved value; `src/render/powerpoles.test.ts`, `src/render/cableboxes.test.ts` no pole on a buried street, risers at its ends, boxes at a cable's ends and branches, the underground overlay clear of the pipes.

**Open:** a line whose source is removed stays and delivers nothing; only the Power lens and the advisor say so. At a junction or a bend the cable underground keeps the tile's centre and lies on the sewer's strip. A cable end whose four neighbouring tiles are all road or built has no box, and a buried stretch that ends at a junction beside a drive has no riser. The riser's guard is thin. Alley pole practice, homes per transformer and manhole spacing have no citable figure and are dials. A pole sees only its own tile's strip when it keeps 1.5 m from a lamp or a mast; a curved street's wires end guyed at each node; a wire is drawn 0.1 m thick so it reads from afar.

## Why the rules are what they are

### The street already carries power

A sealed street conducts from any generator that touches it. That stays. A first town is a generator beside a road, and nothing here adds a step to it.

What changes is that the street shows it. Today nothing is drawn, so a town looks unwired, and the only wires are the ones a player strings. Those stand at the tile's centre, which on a road is the middle of the carriageway.

A powered street now draws its own supply. The player chooses how per street: overhead, which comes with the road, or underground, which costs more to lay and less to keep.

### Where a pole stands

Highway departments write this down. Hawaii puts a pole at least 2 ft behind the kerb's face, at or near the right-of-way line and outside the sidewalk. Maine asks 5 ft and allows 1.5 ft where there is no room.

So a pole stands at the outer edge of the footway, on one side of the street, and the line keeps that side between junctions. No pole stands in a median: the same rules want 30 ft from the travelled way there, which no median has.

A junction tile takes no pole, as no kerbside furniture does. A drive takes none either; the pole moves along the span to miss it.

On a road with no kerb, a gravel road, the pole stands at the tile's edge, about 10 m from the centreline. Rural rules ask 20 to 30 ft from the travelled way, which that clears.

### What a road can carry

A motorway carries no poles. Federal rules allow a line along one only in a strip outside its access control, so the line runs beside it on open ground or crosses it at right angles in one span.

A ramp, a bridge deck and a tram guideway are the same: the supply runs in the structure and nothing is drawn. Rail is crossed at right angles and never followed.

An alley takes a pole line along its edge, which is where American blocks keep theirs. No standard gave the offset; it uses the street's.

### True size

A 40 ft pole, the common one, stands 34 ft out of the ground. Poles on a street stand 100 to 150 ft apart, so one every second tile; in open country 250 to 300 ft, one every fourth.

Wires hang at least 15.5 ft over a road. They are drawn as wire with real sag over the real span, not as a line one pixel wide at every zoom.

A pole at a corner or a dead end is guyed, because that is what holds a real one up. A pole where a cable comes up is a riser, with the cable in a guard up its side.

### The line across open country

The line a player strings over open ground is a different thing from a street's. It is the 69 kV line a utility runs from a plant to a town: single poles 70 to 80 ft tall, 300 to 400 ft apart.

It serves what stands beside it, as a line does today. Strung along a gravel road it becomes a roadside pole line. Strung along a sealed street it is refused, since the street already carries power.

### What a line connects to

A line that begins nowhere delivers nothing. A strung line or a laid cable must start at a power station, a substation, or a line that already does. A line in an older save stays live.

A substation is the place a line may start that is not a power station. It stands beside a street like any building, takes its supply from the street or from a line that reaches it, and feeds the streets it touches. A real one of 25 MVA with one transformer fills half an acre, which is two tiles by two.

It makes no power and limits none. The city's supply stays one pool, cut from the far end when demand exceeds it.

### Underground

A cable does what a line does and cannot be seen. It appears in the underground view with the pipes. On the surface it shows where it must be reached: a green junction box at each end and each branch, a pad-mounted transformer along a buried street, a riser pole where it meets a line.

The boxes are the ones on any American verge: switchgear about 75 in wide and 45 in high, a transformer about 40 by 36 in, both in the same dull green, with 10 ft kept clear in front of their doors.

A cable may run under open ground and under any road. Laid under a street it buries that street's supply, and the poles go.

### What each costs

The published ratio is wide. A mile of overhead line averages $120,000; a mile underground runs from $700,000 to over $1.5 million. Eight times is the middle, and the cable is priced at eight times the line.

Upkeep runs the other way, and the evidence is narrower than the usual claim. Utilities replace 2 to 3% of their poles every year, and an overhead line has trees to cut and poles to inspect; one Florida filing prices what burying avoids at about $370 a mile a year. That is the saving a cable earns.

The evidence does not say a cable lasts longer. Cable life past forty years is unproven, a maintained pole line reaches seventy, and an underground fault takes about half as long again to repair. Underground has half the outages. The game charges the upkeep difference and claims no more.

A street's upkeep stays what it is today with its poles included. Burying it lowers that figure; nothing is added to a town that changes nothing.

## Decided

- Streets keep conducting and draw their supply, over making the player wire each street: a first town must not gain a step.
- Overhead is the default and burial is bought per street, over burial forced in dense districts: the player chose to choose.
- A line needs a source at one end only, over a substation at both: a line still serves what it passes.
- A substation limits nothing, over a capacity in MVA per substation: supply is one pool and a second limit would need its own lens.
- Pole replacement is charged inside monthly upkeep, over a saved condition for each pole: the rate is sourced, and a condition is a chore.
- The cable shares the line's saved layer as a second value, over a new layer: one tile holds a line or a cable, never both.
