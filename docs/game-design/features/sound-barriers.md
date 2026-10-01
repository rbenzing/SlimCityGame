# Sound barriers — design

- **Status:** Draft
- **Date:** 2026-10-01

## What the player gets

A noise wall along a motorway or a slip road. With the motorway or ramp
selected in the road drawer, a **Sound wall** panel asks which side of the
carriageway gets one (none, left, right, both) and how tall it stands (3 m,
4.5 m or 6 m). The next drag lays the road with its wall, and Replace puts a
wall up along a motorway already laid. Behind it, the motorway's noise is cut,
and land value, which noise drags down, recovers.

## Why it earns its place

A motorway is the loudest thing in the game, three times a street's noise per
car, and noise is one of the three things that pull land value down. Today the
only answer to a motorway beside a neighbourhood is to move one of them. Real
cities build a wall: the United States has built 3,866 miles of them since
1963 ([FHWA noise barrier inventory](https://www.fhwa.dot.gov/environment/noise/noise_barriers/inventory/)).
It is the last unbuilt piece of road composition, and it is a cross-section
piece like any other, so it costs the road model nothing new to carry. It
serves the pillar that the city is read through its data: the noise lens
shows the shadow a wall casts.

## How it works, for the player

1. **Choose it.** The Sound wall panel appears for the two classes real walls
   are built along, the motorway and the ramp, and only there. "Left" and
   "right" are the driver's, the way every other side choice in the drawer
   reads. On a dual carriageway that is usually the right, the side away from
   the other carriageway.
2. **Pick a height.** 3 m, 4.5 m or 6 m. A taller wall cuts more noise and
   costs more. Each height says in its tooltip how much it cuts.
3. **Lay it.** The wall goes up with the road and comes down with it.
   Bulldozing the road takes the wall too, and undo puts both back. To add
   one to a motorway already laid, drag over it with Replace on.
4. **What it does.** Noise crossing a wall is cut by the wall's insertion loss.
   The road side gets no relief; a plain concrete wall reflects. The ground
   behind it is quieter and its land value rises toward what it would be with
   no motorway there.
5. **Where it stops.** A wall runs along the side of the road, so it opens
   where a slip road leaves or joins, and wherever the motorway turns a
   corner on that side. Real walls break at ramps for the same reason, and
   the gap lets noise through, as gaps in real walls do.
6. **Where it cannot go.** There has to be room beside the carriageway. Every
   motorway the tool composes has it. Three or four lanes and their shoulders
   leave 0.6 m a side on the tile, and a five- or six-lane motorway is laid
   across two tiles, with room at its outer edges. A section that already
   reaches the tile's edge has none, and the side and height chips say so
   rather than letting the drag be refused. A wall also goes only along a road
   laid on the grid. A
   motorway drawn at an angle or as a curve is refused with a wall, and the
   tool says so.

On screen the wall stands on a concrete safety barrier at the edge of the
shoulder, as walls inside a motorway's clear zone do. Precast panels stand
between steel posts every 5 m. Lamp columns stand on the barrier in front of
it, and a gantry's legs stand behind it.

## What it interacts with

- **Noise and land value.** Noise is a field that spreads from tile to tile.
  A wall cuts what crosses the tile edge it stands on, in both directions.
  Noise is read only by land value's loss term (noise ÷ 12), so that is what
  a wall changes, and through land value, level-ups and tax.
- **The road tool and the profile.** A wall is a cross-section piece, saved
  in the road's profile like a parking lane. No new save layer, no new
  command, and no save-format change.
- **Price.** A wall adds its price per tile to the road it stands beside, per
  side, shown in the cursor chip like a bus lane's.
- **Ramps and interchanges.** A wall stops on the tile where a ramp leaves.
  An interchange stamp lays its roads without walls.
- **Bridges.** A wall carries on along a deck, at deck height.

## Tuning

| Figure                     | Value                                                       | Source                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heights offered            | 3 m, 4.5 m, 6 m                                             | US average 14 ft (4.3 m), states 7–18 ft ([FHWA inventory](https://www.fhwa.dot.gov/environment/noise/noise_barriers/inventory/)); WSDOT builds 6–20 ft, normally 12–15 ft ([WSDOT](https://wsdot.wa.gov/construction-planning/protecting-environment/noise-walls-barriers)); "usually limited to eight meters" ([FHWA, Keeping the Noise Down](https://www.fhwa.dot.gov/environment/noise/noise_barriers/design_construction/keepdown.cfm))   |
| Insertion loss             | 5 dB + 1.5 dB per metre over 3 m: 5, 7.25 and 9.5 dB        | "5 dB(A) … when the barrier height just breaks the line-of-sight", "1.5 dB(A) for each additional meter" ([FHWA Noise Barrier Design Handbook §3.5.1](https://www.fhwa.dot.gov/Environment/noise/noise_barriers/design_construction/design/design03.cfm))                                                                                                                                                                                      |
| Line-of-sight height       | 3 m                                                         | A heavy truck's exhaust stack, 3.66 m (FHWA TNM), seen from a ground-floor window 1.5 m up across a wall at the shoulder: the line crosses the wall at about 3.1 m.                                                                                                                                                                                                                                                                            |
| What the three heights are | feasible, design goal, top of the goal                      | 23 CFR 772.13(d): a wall is feasible at 5 dB(A); the design goal is 7–10 dB(A) ([eCFR](https://www.law.cornell.edu/cfr/text/23/772.13))                                                                                                                                                                                                                                                                                                        |
| Wall base                  | 0.6 m concrete safety barrier                               | A wall inside the clear zone stands behind or on a concrete safety-shape barrier ([Handbook §9](https://www.fhwa.dot.gov/Environment/noise/noise_barriers/design_construction/design/design09.cfm)); 0.6 m is the barrier piece's width already                                                                                                                                                                                                |
| Panels                     | 0.15 m precast, posts every 5 m                             | Precast panels about 125 mm, cast walls 150–200 mm, panels about 4.5 m long for shipping ([Handbook §5.1.1](https://www.fhwa.dot.gov/environment/noise/noise_barriers/design_construction/design/design05.cfm))                                                                                                                                                                                                                                |
| Price                      | ¢5.4 per metre of height, per side, per tile: ¢16, ¢24, ¢32 | $48.76/ft² ($525/m²), the 2020–22 national average ([FHWA inventory](https://www.fhwa.dot.gov/environment/noise/noise_barriers/inventory/)), against $3.551M a lane-mile for a rural freeway on new alignment ([FHWA C&P, Exhibit A-1](https://www.fhwa.dot.gov/policy/23cpr/appendixa.cfm)), scaled to the game's three-lane motorway at ¢68 a tile. The two are in different dollar years (2020–22 and 2014), so a wall reads a little dear. |
| Upkeep                     | 2% of its price a month                                     | The motorway's own upkeep against its price.                                                                                                                                                                                                                                                                                                                                                                                                   |

How much noise a cut lets through: insertion loss is in decibels, and the noise
field adds up like sound energy (a road's emission is proportional to the
traffic on it, as acoustic energy is), so a wall passes 10^(−loss/10) of what
crosses it: 32% at 3 m, 19% at 4.5 m and 11% at 6 m. A 10 dB cut is heard as
half as loud ([FHWA Noise Fundamentals](https://www.fhwa.dot.gov/environment/noise/regulations_and_guidance/polguide/polguide02.cfm)).

## What it is not

- Not a wall the player draws anywhere. It belongs to the road and stands at
  its edge. A wall at the bottom of the gardens behind a row of houses, or an
  earth berm, is not built.
- Not on a street. Only the motorway and the ramp carry one.
- Not absorptive. There is one kind of wall, plain reflective concrete, and
  the reflection it would send across to the other side is not modelled.
- Not a cure for air pollution. A wall cuts noise only.
- Not on a road off the grid.
