# Residential kinds

Each kind is identifiable at the default camera pitch without its label, by
its body and by what stands on its lot. A body's size is set per kind, in
metres, and the lot takes the rest:

| Kind                 | Body                                                                                                                                     | Roof    | On the lot                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Detached house       | 4.75 m per lot tile each way, never under 9.5 m (9.5 × 9.5 m on a 1×1, 1×2 or 2×2 lot, 9.5 × 14.25 m on a 2×3, 14.25 × 14.25 m on a 3×3) | pitched | lawn, one drive and its cover, a yard                                                                                     |
| Duplex               | 60% of each lot axis, capped at 16 m (12 × 12 m on 1×1, 12 × 16 m on 1×2)                                                                | pitched | two front doors, one drive per home                                                                                       |
| Fourplex             | 70% of each lot axis, capped at 18 m (14 × 14 m on 1×1, 14 × 18 m on 1×2)                                                                | pitched | two front doors, one drive per door                                                                                       |
| Townhouse row        | 90% of each lot axis, capped at 18 m (18 × 18 m on its 1×2); three homes per 20 m of frontage, 6 m each                                  | pitched | a door, a front pad and by seed a garage door per home                                                                    |
| Multiplex            | 13.6 m per tile, capped at 24 m each way (24 × 24 m on its 2×2); one body at every level                                                 | hip     | a car park laid to code, 1.4 spaces a home                                                                                |
| Courtyard apartments | 13.6 m per tile (27.2 × 27.2 m on its 2×2 at every level); one body at every level                                                       | hip     | lawn; a car park laid to code only where the lot has room beside the body, which its 2×2 has not, so it parks at the kerb |
| Mid-rise flats       | 13.6 m per tile, rising from a one-storey podium at 85%; one body at every level                                                         | flat    | the podium fills the lot to the 85% ceiling; cars at the kerb                                                             |
| Tower                | 13.6 m per tile, rising from a two-storey podium at 85%; one body at every level                                                         | flat    | the podium fills the lot to the 85% ceiling; cars at the kerb                                                             |

The body sizes are the missing-middle types' own: a duplex is 28–55 ft by
28–60 ft, a fourplex 34–56 by 32–60, a multiplex 50–80 by 35–75, and a
townhouse 18–25 ft wide; a block fills its plate as the office and the
civic buildings do. No body exceeds 85% of its lot on either axis, so
neighbours never touch. A home whose body is drawn from a fill rather than a
per-tile rule stands centred across its frontage and at the house-kit setback
from the street like any other home.

Two homes share a duplex or a fourplex body: each has its own door, its
front pad and its drive across the verge, as the homes of a row do, whether
the body's long side or its 12 m end faces the street. Only a body too narrow
for a pad and a door per home — none in the catalog — falls back to one home
with a side drive. A fourplex's two upper homes are reached from inside, so
it shows the same two doors as a duplex and reads taller.

A tower's podium is a massing tier two storeys tall at the lot's full fill,
and a mid-rise's one storey tall (4.6 m, the 15 ft floor-to-floor a mixed-use
ground floor is zoned to, [Buena Park](https://gocodebook.com/library/us/ca/buena-park-zoning/title-19-zoning/division-7-mixed-use-zones/chapter-19.716-development-standards-building-form)),
drawn under the slab by the massing renderer, the one thing it still draws
now that the setback tiers are the body instancer's; it carries the body's
wall colour and lifecycle tint, so the tower reads as one building standing
on its base. None of the four block kinds steps: a walk-up under a hip roof
has nowhere to step, a 5-over-1 is one plate of wood storeys over its podium
and a tower is one slab, so each is one body at every level as a house is,
and its level reads in its height and its parts.

**What the US builds, by share.** The second pass
([rci-kits.md](../../../specs/rci-kits.md),
sources there) draws houses and blocks in the materials and colours the
Census Survey of Construction and the trade's own sales rankings give, each
share a constant with its source beside it, chosen by id hash:

| What                | Share or rule                                                                                                                                              | Chart materials                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Siding              | vinyl 26%, stucco 25%, fibre cement 23%, brick 16%, wood 6% (2024 starts); vinyl and fibre cement read as lap siding                                       | `sidingOffWhite`, `sidingWhite`, `sidingLightBrown`, `sidingLightGrey`, `sidingBlue`, `whitePlaster` (stucco), `redBrick`, `brightWood` |
| Siding colour       | off-white 18%, white 16%, light brown 13%, light grey 11%, medium blue 8%; the rest spread over the chart's plasters                                       | as above                                                                                                                                |
| Roof                | laminated asphalt shingle on two thirds; charcoal, weathered wood, pewter grey, barkwood by sales rank; tile 13% in the Sun Belt                           | `shingleCharcoal`, `shingleWeathered`, `shinglePewter`, `shingleBarkwood`, `clayRoof`                                                   |
| Storeys             | 52% two or more (ranch and cape one, colonial two)                                                                                                         |                                                                                                                                         |
| Garage              | two-car 65% (4.9 m door), three-car 15% (two doors), one-car 9% (2.7 m door); the rest none                                                                | `whitePlaster` door                                                                                                                     |
| Porch               | 67% of houses, 2.4 m deep; the craftsman's the full width on 0.4 m tapered columns on `stoneBrick` piers                                                   |                                                                                                                                         |
| Chimney             | under 40% (over 60% of new houses have no fireplace)                                                                                                       | `redBrick`                                                                                                                              |
| Windows             | 1 × 1.5 m panes on a 2.4 m bay (the night rule's), shutters on the colonial and the cape                                                                   |                                                                                                                                         |
| Townhouse           | units 4.9, 6.1 or 7.3 m wide (16, 20, 24 ft); colour by unit from the siding list                                                                          |                                                                                                                                         |
| Garden apartment    | balconies 1.8 m deep, a stair tower and breezeway per pair of stacks                                                                                       | `sidingLightGrey`, `redBrick` colour-blocked by stack                                                                                   |
| 5-over-1 (mid-rise) | the podium 4.6 m in `redBrick`; the storeys above in two or three colour-blocked panel fields                                                              | `sidingLightGrey`, `sidingOffWhite`, `darkPanel`                                                                                        |
| Tower               | 3.3–3.9 m a floor cut from its height (11, 16 and 21 floors by level, where the sim counts 3.2 m storeys); its lift penthouse is the one thing on its roof | `curtainWall`, `spandrelDark`                                                                                                           |

The new chart entries — `sidingOffWhite`, `sidingWhite`, `sidingLightBrown`,
`sidingLightGrey`, `sidingBlue`, `shingleCharcoal`, `shingleWeathered`,
`shinglePewter`, `shingleBarkwood` — are measured under the chart's rules;
siding "white" sits at the ceiling, never above it. The shares are the
house kit's dials and the only place a share is read; a house's form keeps
its own silhouette rules above. The one-storey house takes one of three
forms by seed, no catalog entry changing: the ranch; the craftsman, a low
gable with wide eaves and the deep porch on tapered columns; the
split-level, a two-storey block beside a one-storey wing with the garage on
the low level. The cape and the colonial stand at the levels above as they
do now.

## Sections

| Section | Size |
| --- | --- |
| [The house kit's parts](the-house-kits-parts.md) | 8,108 B |
| [The apartment kit's parts](the-apartment-kits-parts.md) | 9,267 B |
