# Feature design documents

One document per gameplay feature, describing **what it is for the player**:
what they can do, what the game does back, and why it earns its place.

## The distinction that matters

There are two feature folders and they are not the same thing:

|                                                                     |                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **here**                                                            | What the feature is. What the player does, what they see, what it costs them, why it is worth building. Written for a designer. |
| [../../engineering/features/](../../engineering/features/README.md) | How it will be built. Modules touched, data shapes, save and protocol impact, risks. Written for a reviewer of the plan.        |

A substantial feature usually wants both, and the design document comes first —
it is what the technical one is designed against. A small feature may want
neither; the pull request is enough.

Once a feature ships, neither document describes the product any more. What it
does belongs to the specs under [../../world-sim/](../../world-sim/README.md)
and this folder's siblings; when it landed belongs to
[../../ROADMAP.md](../../ROADMAP.md). Leave the design document as a record of
intent — that is what it is for.

## Writing one

Copy [\_template.md](_template.md) to `<feature>.md`.

## The documents

The municipal services programme. [municipal-services.md](municipal-services.md)
is the frame; the nine below are its epics, in the order they are built.

| #   | Document                                                     | What it adds                                                                                      |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 0   | [service-capacity.md](service-capacity.md)                   | A facility serves people, not just an area (built)                                                |
| 1   | [water-and-sewage.md](water-and-sewage.md)                   | The other half of the water loop (built)                                                          |
| 2   | [healthcare-and-death-care.md](healthcare-and-death-care.md) | A hospital ladder, and the first population sink (built)                                          |
| 3   | [education-ladder.md](education-ladder.md)                   | Elementary, middle, high, college and a library, each rung its own field (built)                  |
| 4   | [emergency-services.md](emergency-services.md)               | Station ladders sized on response time (built)                                                    |
| 5   | [garbage-recovery.md](garbage-recovery.md)                   | Recovery, so burying is the worst option and not the only (built)                                 |
| 6   | [power-generation.md](power-generation.md)                   | A thermal tier, and generation a city can outgrow (built)                                         |
| 7   | [transport-depots.md](transport-depots.md)                   | Somewhere a line's vehicles come from (built)                                                     |
| 8   | [parks-and-recreation.md](parks-and-recreation.md)           | Recreation as a service with a standard, not a sticker (built; the programme complete 2026-10-23) |

Outside the programme:

| Document                                           | What it adds                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [farms.md](../../specs/farms.md)                               | Farmland off dirt roads, on soil the ground itself grades (built)                                                                                                                        |
| [interchanges.md](../../specs/interchanges.md)     | A motorway interchange laid in one click: diamond, partial cloverleaf or cloverleaf (built)                                                                                              |
| [roundabouts.md](../../specs/roundabouts.md)       | A compact roundabout 36 m across, laid on a street junction in one click (built)                                                                                                         |
| [sound-barriers.md](../../specs/sound-barriers.md) | A noise wall along a motorway or a slip road, 3 to 6 m tall, that cuts the noise behind it (built)                                                                                       |
| [building-types.md](building-types.md)             | A zoned lot grows a kind of building, drawn by lot fit and real-world share; residential, commercial and industrial kinds, sourced (built)                                               |
| [lots-and-land.md](../../specs/lots-and-land.md)               | A zoned block platted into lots the land's standing sizes, from half lots to estates, on US zoning standards (built)                                                                     |
| [parking-to-code.md](../../specs/parking-to-code.md)           | Suburban commercial and industrial lots drawn with the parking their code asks of their floor; downtown parks at the kerb (lots built; kerb credit and larger lots not built)            |
| [underground-view.md](underground-view.md)         | Pipes are buried: the city goes underground while the player works on the water, and shows the whole system beneath a glass surface (built)                                              |
| [building-detail.md](building-detail.md)           | Every zoned building and ploppable drawn as the US type it is, from a sourced reference library, inside a measured triangle budget (built)                                               |
| [tramways.md](../../specs/tramways.md)             | A street tramway drawn as a street cars share, and a tram reservation lifted onto an elevated guideway with raised stations; every tram lane routable (built)                            |
| [curved-parcels.md](../../specs/curved-parcels.md)             | Lots platted square to a free-form road, every zone's ladder and the car parks in the parcel's frame, wide kinds on runs where the road is near straight; the aligned lots the roads ADR deferred (built 2026-10-27) |
| [rci-kits-second-pass.md](rci-kits-second-pass.md) | Every zoned kind told apart at 40 m by its body material, its sized identifying parts and its yard, from sources; commercial, industrial and residential slices (built 2026-10-27) |
| [civic-access-and-bus-stops.md](civic-access-and-bus-stops.md) | Bus stops as footway furniture, a ₵2 sign or a ₵150 shelter that earns ad income when 25 board a day; every civic lot with a drive, apron or bus loop to the kerb (agreed 2026-10-27) |

The features built before this folder existed have no design document; their
behaviour is described in the specs and their delivery in
[../../ROADMAP.md](../../ROADMAP.md).
