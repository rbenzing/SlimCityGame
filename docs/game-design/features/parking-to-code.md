# Parking to code — design

- **Status:** Partly built — lots drawn to code (P1, 2026-10-08); kerb credit and larger lots for the kinds that fall short not built
- **Date:** 2026-10-08

## What the player gets

A suburban shop, restaurant, filling station, strip, supermarket or works
stands in the car park its zoning code asks for: the spaces its floor area
requires, the accessible spaces nearest its door, its loading berths, and
the planted islands and trees the landscaping rules put between the rows.
The building is the size its jobs come from; the lot is laid out around it.
Downtown — offices, hotels and mixed use — builds to the pavement and parks
at the kerb, as downtowns do.

## Why it earns its place

Until now a commercial or industrial lot drew a row of two to four car bays
along its frontage whatever its floor (one more than its level), so a
supermarket and a corner shop parked the same handful of cars, and the body
was cut back to make room for even that. The footprints were never sized
from parking: every body filled 13.6 m of each lot tile, 46% of its lot,
and a lot's 0.2–0.3 coverage claimed in
[lots-and-land.md](lots-and-land.md) was never true. Serves the **realism
grounded in published figures** pillar ([../gdd.md](../gdd.md)): a car park
is the biggest thing on a suburban commercial lot, and now it is the size
the code says.

## How it works, for the player

### The requirement

A lot's floor is its body's plate times its storeys: the plate is the
massing rule's (13.6 m a lot tile, or the kind's own rule), the storeys one
per 3.2 m for a shop or flex space and one high-bay floor for every other
works ([building-types.md](building-types.md)). From that floor:

| Kind                                      | Spaces per 1,000 sq ft of floor | Loading table |
| ----------------------------------------- | ------------------------------- | ------------- |
| Shop, strip, supermarket                  | 5                               | retail        |
| Restaurant                                | 10                              | retail        |
| Filling station (its kiosk; pumps earn none) | 5                            | retail        |
| Office (downtown, exempt; for reference)  | 3                               | —             |
| Workshop, factory, food, chemical, metals, paper (manufacturing) | 1        | industrial    |
| Warehouse                                 | 0.5                             | industrial    |
| Flex (half office at 3, half warehouse at 1) | 2                            | industrial    |

Spaces round up. These are the modal minimums in US municipal codes (St
Charles MO, Wadsworth OH, Stacy MN, Canby OR, North Reading MA, Columbus IN,
Medfield MA; for example
[Wadsworth OH chapter 25](https://www.zoneomics.com/code/wadsworth-OH/chapter_25)).

- **Accessible spaces** follow ADA 2010 §208.2 over the spaces the lot
  provides — one per 25 to 100, one per 50 to 200, one per 100 to 500 —
  and one in six of them is a van space (§208.2.4). They are counted inside
  the total, never on top of it. A car space is 96 in (2.44 m) and a van
  space 132 in (3.35 m), each beside a 60 in (1.52 m) access aisle
  ([US Access Board](https://www.access-board.gov/ada/guides/chapter-5-parking/)).
  An accessible space is always on the lot: a lot that cannot lay one
  provides fewer spaces, and none at all if not even one fits.
- **Loading berths** are 12 × 50 ft (3.66 × 15.24 m) with 14 ft (4.27 m)
  clear, by floor, on Wadsworth OH's tables: retail, grocery and restaurant
  none to 5,000 sq ft, one to 20,000, two to 40,000, three to 100,000;
  industry one from 5,001 to 30,000, two to 80,000, three to 175,000.
- **Planting**: a planted island at least 5 ft wide at every row end and
  after every ten spaces in a row
  ([Tyler TX](https://codelibrary.amlegal.com/codes/tyler/latest/tyler_tx/0-0-0-81565)),
  and one tree for every ten spaces or part of ten (Moses Lake WA, Chardon
  OH, Raleigh NC).

### The car park

Every stall is 9 × 18 ft (2.74 × 5.49 m) at 90°, on a two-way 24 ft
(7.32 m) aisle: the ULI double-loaded module of stall, aisle, stall is
60 ft (18.3 m), and a single row on its aisle 42 ft (12.8 m)
([Forest Lake MN](https://codelibrary.amlegal.com/codes/forestlake/latest/forestlake_mn/0-0-0-40825)).
One curb cut, 24 ft wide — inside the 24–36 ft (7.3–11 m) codes allow for a
two-way driveway — opens onto one drive, and every aisle opens off that
drive.

The layout tries four arrangements, in this order:

1. rows along the street, off a drive running into the lot along one side,
   with a row of stalls on the drive's outer side;
2. rows running into the lot, off a drive along the street behind a row of
   stalls that backs onto the sidewalk (the curb cut is a gap in that row);
3. and 4. the same two without the outer row, for lots too narrow for it.

From the street the modules stack row, aisle, row; where a whole module will
not go, a last row and its aisle. A row runs from the drive until the body,
a berth or a yard stops it or its aisle. So where the lot is deep enough in
front of the body for a module, the parking is in front; where it is not, it
is beside the body, off the drive.

The body keeps its size and may stand anywhere on its lot. On each axis it
stands centred, held off the lot line by an island's 5 ft, or on the lot
line; the layout takes the least slide from the centre that lets the lot
meet its code (the body always to the far side from the drive), and for a
lot that cannot, the slide that holds the most spaces. A filling station
keeps a 12 m forecourt clear in front of its kiosk across its width, where
the canopy and pumps stand; a chemical plant and a paper mill keep 8 m
behind their body for the tank farm. A body on its lot line can meet its
neighbour's; that is the price of keeping the floor whole on a lot the code
fills.

The spaces are filled nearest the entrance first — the middle of the body's
street face: the rows nearest it first, each row's spaces as one block
centred on the door's place along it (held inside the row), and the
accessible spaces in the nearest row that holds them, where they come
nearest the door. A lot that
meets its code draws exactly the spaces it owes; the rest of its yard is
paved and unmarked.

Loading berths stand at the rear of the lot along the drive's side, end to
end, each beside the drive (or the first aisle) a truck reaches it from. A
lot that falls short keeps its berths too, unless keeping them would leave it
no space at all; then it draws the spaces and no berth.

### What the player sees

The lot's paved yard (asphalt for commerce, dark asphalt for industry) with
white stall lines down both sides of every space; the accessibility symbol in
each accessible space and its aisle hatched; the berths outlined; each
island a 6 in concrete kerb round grass, a young broadleaf in as many
islands as the tree rule asks, spread over them; and the drive's curb cut
across the sidewalk, with the apron paved across the verge the whole
frontage long. Cars stand one to a stall, nose in, filling over the trading
day or the shift as before; an industrial lot still mixes box trucks and
pickups in with its workers' cars, and a truck longer than its stall stands
with its nose at the stall's head and its tail over the aisle.

## The audit: which kinds fit

Measured on the layout itself, with each kind's catalog width along the
street (how growth turns every unlotted kind), every level:

| Kind        | L | Lot | Floor             | Spaces | Accessible | Berths | Laid | Fit / short |
| ----------- | - | --- | ----------------- | ------ | ---------- | ------ | ---- | ----------- |
| shop        | 1 | 1×1 | 185 m² (1,991 sf) | 10     | —          | 0      | 0    | −10         |
| shop        | 2 | 1×2 | 370 m² (3,982 sf) | 20     | 1          | 0      | 3    | −17         |
| shop        | 3 | 2×2 | 740 m² (7,964 sf) | 40     | 1          | 1      | 15   | −25         |
| restaurant  | 1 | 1×2 | 326 m² (3,513 sf) | 36     | 1          | 0      | 4    | −32         |
| restaurant  | 2 | 2×2 | 576 m² (6,200 sf) | 63     | 1          | 1      | 15   | −48         |
| restaurant  | 3 | 3×2 | 1,152 m² (12,400 sf) | 125 | 2          | 1      | 42   | −83         |
| fuel        | 1 | 2×2 | 196 m² (2,110 sf) | 11     | 1          | 0      | 11   | fits        |
| fuel        | 2 | 3×2 | 224 m² (2,411 sf) | 13     | 1          | 0      | 13   | fits        |
| fuel        | 3 | 3×3 | 256 m² (2,756 sf) | 14     | 1          | 0      | 14   | fits        |
| strip       | 1 | 3×2 | 1,110 m² (11,945 sf) | 60  | 1          | 1      | 25   | −35         |
| strip       | 2 | 4×2 | 1,480 m² (15,927 sf) | 80  | 2          | 1      | 37   | −43         |
| strip       | 3 | 5×2 | 1,850 m² (19,909 sf) | 100 | 2          | 1      | 50   | −50         |
| supermarket | 1 | 3×3 | 1,665 m² (17,918 sf) | 90  | 2          | 1      | 47   | −43         |
| supermarket | 2 | 4×3 | 2,220 m² (23,891 sf) | 120 | 3          | 2      | 63   | −57         |
| supermarket | 3 | 5×4 | 3,699 m² (39,818 sf) | 200 | 5          | 2      | 102  | −98         |
| workshop    | 1–3 | 2×2, 3×2, 3×3 | 740–1,665 m² | 8 / 12 / 18 | 1 | 1 | all | fits |
| warehouse   | 1–3 | 3×3, 4×3, 5×4 | 1,665–3,699 m² | 9 / 12 / 20 | 1 | 1 / 1 / 2 | all | fits |
| factory     | 1–3 | 2×3, 3×3, 4×3 | 1,110–2,220 m² | 12 / 18 / 24 | 1 | 1 | all | fits |
| flex        | 1 | 2×2 | 968 m² (10,420 sf) | 21    | 1          | 1      | 15   | −6          |
| flex        | 2 | 3×2 | 1,452 m² (15,629 sf) | 32  | 2          | 1      | 32   | fits        |
| flex        | 3 | 3×4 | 4,356 m² (46,888 sf) | 94  | 4          | 2      | 79   | −15         |
| food plant  | 1–3 | 3×3, 4×3, 5×4 | 1,665–3,699 m² | 18 / 24 / 40 | 1 / 1 / 2 | 1 / 1 / 2 | all | fits |
| chemical    | 1–3 | 3×3, 4×4, 5×4 | 900–2,000 m² | 10 / 18 / 22 | 1 | 1 | all | fits |
| steelworks  | 1–3 | 3×3, 4×3, 5×3 | 1,665–2,774 m² | 18 / 24 / 30 | 1 / 1 / 2 | 1 | all | fits |
| paper mill  | 1–3 | 3×3, 4×4, 5×4 | 1,665–3,699 m² | 18 / 32 / 40 | 1 / 2 / 2 | 1 / 2 / 2 | all | fits |

The fuel station and seven of the eight works fit at every level. The four
retail kinds fall short at every level, and so does flex at its first and
third: an area count (about 30 m² a space all in) said flex fits, but laid
out in 60 ft modules with its berths and islands it does not — a 22 m body
on a 40 m lot leaves 18 m in front, 0.3 m short of a module. Flex at its
second level fits only with its long side on the street, as growth turns it.
The corner shop's lot is too small for even one accessible space, so it
draws none and its customers use the kerb.

The planting rules give islands of 2–11% of the paved car park, drive and
aisles included; the codes' separate 5–10% interior-landscaping minimum
(Chardon 5, Redmond 5–7, Forest Grove 8, Defiance 10) is not applied on top.

## What it interacts with

- **The body renderers** (body, tiers, kit, roof clutter) all place the body
  where the lot plan puts it, and its plate is the whole plate the floor is
  counted on; nothing is cut off it for parking any more.
- **The kerb**: a lot that parks on site does not also line the kerb; a
  downtown building, and a suburban one whose lot holds no space, parks at
  the kerb where the street allows it, as before.
- **Kerb furniture** keeps off the road tile in front of the curb cut.
- **The sim** is untouched: it never reads floor area or parking, and no
  save or protocol changes.

## The next step (P2): kerb credit and bigger lots

The user chose bigger lots with kerb credit for the kinds that fall short
(shop, restaurant, strip, supermarket, and now flex):

- **Kerb credit**: one space for every full painted kerb stall on the lot's
  own side of the street whose midpoint lies within its frontage (the
  majority rule, as Hamilton MT and Bloomington IN apportion a stall between
  two lots); parallel, angled and head-in stalls all count one; no cap
  ([Bakersfield §17.58.100](https://bakersfield.municipal.codes/Code/17.58.100),
  [Schenectady §264-42](https://www.zoneomics.com/code/schenectady-NY/chapter_6),
  the SmartCode as El Paso, Petaluma and Chico adopt it). Accessible spaces
  are always on the lot. A lot whose kerb parking is later removed becomes
  legal nonconforming: it keeps trading, it is never abandoned for it.
- **Larger lots**: each short kind gains larger catalog variants (one sized
  for a parallel frontage credit, one for none); growth picks the smallest
  whose lot capacity plus its actual frontage credit meets the requirement.
  The sim counts the same painted stalls the road draws, through the kerb
  stall layout moved to shared code, and the lot capacity through this
  layout. Saved buildings keep their footprints.

## Tuning

Every figure above is a code figure, not a dial; they live in
`src/shared/parkingcode.ts` and the layout's in `src/shared/lotlayout.ts`,
named in [../balancing.md](../balancing.md#parking-to-code).

## What it is not

- Not a parking simulation: cars do not search for spaces and a full lot
  costs the business nothing.
- Not downtown parking: offices, hotels and mixed use park at the kerb, and
  the decks and garages a downtown builds are not modelled.
- Not parking maximums, shared-parking reductions or transit-area waivers
  (Minneapolis 2021, Austin 2023, California AB 2097 near major transit),
  which repeal minimums rather than draw them.
- Not angled lot stalls or one-way aisles: every lot stall is 90°.
