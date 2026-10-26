# Parcels follow the street — design

- **Status:** Agreed 2026-10-23
- **Date:** 2026-10-23

The free-form roads ADR left lots on the grid: "a road at an angle fronts grid
lots, which is less tidy than lots aligned to the road; aligned lots are a
later choice"
([ADR-0016](../../engineering/adr/0016-roads-are-a-network-of-nodes-and-segments.md)).
This is that choice. The lot standards it applies are the ones
[lots-and-land.md](lots-and-land.md) already sets; the technical plan is
[../../engineering/features/curved-parcels.md](../../engineering/features/curved-parcels.md).

## What the player gets

Zone beside a curved street and the lots come out the way a subdivision plat
draws them: each parcel square to the road where it fronts it, its side lines
running back from the kerb at right angles to the street, its house facing
the street with a drive down to the kerb. A bend reads as a bend of houses,
not a staircase of boxes with their backs to the road and no way in. The lot
ladder — cottage, normal, large, estate by land value — runs along a curve as
it runs along a grid street, and a shop or a plant on a curve lays its car
park and curb cut square to the road too.

## Why it earns its place

Today a parcel is a rectangle of whole tiles that fronts north, east, south
or west ([the plat](lots-and-land.md#the-plat-is-cut-from-the-street-built-2026-10-07)),
a grown building turns through 0° or 90° only, and a house's drive and a
shop's car park look for a grid road tile on one side of the lot. Beside a
free-form road none of that finds the road: the tiles the curve crosses count
as street, so lots are platted against them tile by tile, each facing the
grid side nearest a crossed tile. The result is what the player reported:
buildings at 30° to the street they are meant to face, square lots on a bend,
and no drive, since the lot planner finds no road along any of its four
sides. Every lot rule the game has is right and none of it is reaching the
curve.

## The standards, and what they are on the tile

Subdivision regulations have settled how a lot sits on a curve for a century,
and the rules are short.

- **Side lot lines run square to the street**, "at right angles or radial to
  street lines" ([Corry PA](https://codelibrary.amlegal.com/codes/corry/latest/corry_pa/0-0-0-14152),
  [Dunes City OR](https://codelibrary.amlegal.com/codes/dunescityor/latest/dunescity_or/0-0-0-5023)).
  On a straight street that is perpendicular; on a curve it is radial, so a
  parcel on an outer bend is a wedge that widens away from the road and one on
  an inner bend narrows.
- **Lot width is measured at the building line**, the front setback, not at
  the kerb — which is how a wedge on a cul-de-sac bulb meets a 50 ft minimum
  with far less at the street ([Fowler MI](https://codelibrary.amlegal.com/codes/fowler/latest/fowler_mi/0-0-0-6014),
  [Salina KS](https://salina-ks.gov/media/Construction%20Documents/Residential_Driveway_Design_Standards.pdf)).
- **The frontage at the kerb has a floor**: 35 ft on an outer curve or a bulb
  ([Provo UT](https://provo.municipal.codes/Code/14.17.050),
  [Midvale UT](https://midvale.municipal.codes/Code/Table17-7-4.4)), 40 ft in
  Fowler and Corry. The game takes **35 ft, 10.7 m**.
- **One drive per dwelling**, at least 20 ft from the end of a corner's curb
  radius ([Minneapolis](https://minneapolismn.gov/business-services/licenses-permits-inspections/construction-permits/building-requirements/curb-cuts/)),
  which on a curve means the drive runs square to the kerb from the garage
  and meets it where the parcel's own frontage is.

On the tile the lot ladder keeps its sizes, because the house, shop and plant
kits are built for them and nothing about a bend changes how big a lot a
household buys:

| Lot     | Width at the building line | Depth | As a grid lot |
| ------- | -------------------------- | ----- | ------------- |
| Cottage | 20 m                       | 20 m  | 1×1           |
| Normal  | 20 m                       | 40 m  | 1×2           |
| Large   | 40 m                       | 40 m  | 2×2           |
| Estate  | 40 m or 60 m               | 60 m  | 2×3, 3×3      |

A parcel on a curve is that rectangle, stood square to the road at the point
it fronts, measured at the building line 7 m in from the kerb (the front
yard the house kit draws). The wedge the radial side lines would add on an
outer bend, or take on an inner one, is not part of the parcel: the parcel is
a rectangle in its own frame, as every kit expects, and the sliver between
two parcels on an outer bend is open ground, the way a pie lot's side strip is
lawn nobody builds on. On an inner bend the rectangles' backs converge, so
parcels are spaced along the kerb far enough apart that no two overlap; the
gap that opens at the kerb between them is verge.

## How it works, for the player

### The plat runs along the kerb

When a free-form segment gains a zonable side, the plat walks that side's
kerb from the segment's start to its end, cutting parcels end to end by the
same ladder the grid plat uses — the land value under the parcel picks its
size — and skipping any stretch where the parcel would reach a grid road, a
junction's clearance, water, another parcel or a tile the zone does not
cover. A stretch shorter than a cottage's width is left as verge. A parcel
takes the direction of the road at the middle of its frontage; its frontage
at the kerb is the chord between its two front corners, and if that chord is
under 10.7 m on an outer bend the parcel is widened along the kerb until it
is. Parcels stop a car's length short of a junction node, as lots stop at the
corner clearance a drive needs.

### A building stands in its parcel's frame

A building on a curved parcel is placed as on a grid lot: at the parcel's
front, set back its front yard, facing the street — but the street is the
parcel's own front edge, and the building is turned to it by the road's
heading rather than by a quarter turn. Everything the lot draws — the drive
to the garage, the walk to the door, the yard and its trees, the car park and
its curb cut, the loading berths — is laid in the parcel's frame as it is laid
on a grid lot today, then turned with it. The drive meets the kerb square at
the parcel's frontage.

### The grid keeps its books

A curved parcel claims every tile its rectangle touches, so the world's one
rule — a tile holds one building — holds unchanged, and power, water,
services and the lot's road frontage walk the tiles as they do now. The
zoning lens draws the parcel outline turned, as the plat is, so the player
sees the lots before anything grows on them.

### What the player sees

A row of houses on a bend, each square to the street in front of it, with
drives meeting the kerb; on an outer bend a little more lawn between them,
on an inner bend a little less; the inspector names the lot as it does on a
grid street. A shop on a curve with its car park square to the road and its
curb cut on the kerb. Nothing on a grid street changes.

## What it interacts with

- [lots-and-land.md](lots-and-land.md) owns the ladder and its standards;
  this feature only moves the parcel's frame off the grid's four fronts.
- [parking-to-code.md](parking-to-code.md): a commercial or industrial lot on
  a curve lays its car park in the parcel's frame, its kerb credit read from
  the free road's own section along its frontage.
- [../../world-sim/road-network.md](../../world-sim/road-network.md): the
  plat reads a segment's centre line and width to find its kerb; zoning depth
  is still measured square to the road from the kerb.
- [building-types.md](building-types.md) and [building-detail.md](building-detail.md):
  the kits are unchanged; they are composed with a heading instead of a quarter
  turn.
- Saves: a building on a curved parcel carries its frame; a building on a
  grid lot carries none, and an older save loads as it did.

## Tuning

- The kerb frontage floor, 10.7 m, is the one figure that moves a parcel
  along the road; the sizes come from the ladder and are not re-tuned here.
- The junction clearance a parcel keeps from a node is the drive's 20 ft
  corner clearance, 6 m.

## What it is not

- **Not wedge-shaped parcels.** The parcel is a rectangle in its frame; the
  radial wedge is verge. A kit drawn into a trapezoid is a later choice, if
  the sliver ever reads wrong.
- **Not cul-de-sac bulbs.** A bulb is a node; parcels around a node are not
  cut in this feature. Parcels run along segments.
- **Not a change to grid lots.** A lot on a grid street is platted and drawn
  exactly as it is today.
- **Not parcels across a grid road or a segment end.** A parcel is cut
  shorter and dropped if it falls under a cottage, never bent.

## Slices

1. **Houses on a curve.** The plat along the kerb, the parcel frame, the
   low-density house with its drive, the lens outline, saves. The reported
   case fixed.
2. **The rest of the ladder and the car parks.** Medium and high residential,
   commercial and industrial parcels on a curve, their car parks and curb cuts
   square to the road, the kerb credit from the free road's section.
