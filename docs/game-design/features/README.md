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

| #   | Document                                                     | What it adds                                              |
| --- | ------------------------------------------------------------ | --------------------------------------------------------- |
| 0   | [service-capacity.md](service-capacity.md)                   | A facility serves people, not just an area                |
| 1   | [water-and-sewage.md](water-and-sewage.md)                   | The other half of the water loop                          |
| 2   | [healthcare-and-death-care.md](healthcare-and-death-care.md) | A hospital ladder, and the first population sink          |
| 3   | [education-ladder.md](education-ladder.md)                   | Primary, secondary, tertiary, each gating the next        |
| 4   | [emergency-services.md](emergency-services.md)               | Station ladders sized on response time                    |
| 5   | [garbage-recovery.md](garbage-recovery.md)                   | Recovery, so burying is the worst option and not the only |
| 6   | [power-generation.md](power-generation.md)                   | A thermal tier, and generation a city can outgrow         |
| 7   | [transport-depots.md](transport-depots.md)                   | Somewhere a line's vehicles come from                     |
| 8   | [parks-and-recreation.md](parks-and-recreation.md)           | Recreation as a service with a standard, not a sticker    |

The features built before this folder existed have no design document; their
behaviour is described in the specs and their delivery in
[../../ROADMAP.md](../../ROADMAP.md).
