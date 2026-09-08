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

_None yet. The features built so far predate this folder; their behaviour is
described in the specs and their delivery in
[../../ROADMAP.md](../../ROADMAP.md)._
