# <Feature> — technical design

- **Status:** Draft
- **Date:** YYYY-MM-DD
- **Author:** who wrote it

## What we are building, and why now

Two or three sentences. What the player will be able to do that they cannot
today, and what makes it worth doing before the other things on the list.

## What it touches

The modules that change, and how much. A short table is ideal — a reader should
be able to see the blast radius before reading the plan.

| Module  | Change |
| ------- | ------ |
| `src/…` |        |

Call out explicitly whether this changes the **save format** or the **worker
protocol**. Both are contracts other things depend on, and both are far cheaper
to get right on paper — see
[data-model.md](../data-model.md) and [interfaces.md](../interfaces.md).

## The design

How it works. Data first: what is stored, what is derived, and where the line
falls between them. Then behaviour: the path through the code, named concretely
enough that someone could start writing.

State the rules the implementation must satisfy, because these become the tests
and, once it ships, the spec entry; start at the [documentation map](../../README.md).

## What could go wrong

The parts you are least sure about. Performance, save compatibility, an
interaction with a system you do not own, an edge case with no obvious right
answer. Naming these is the main thing a reviewer can help with — a design
document with no uncertainty in it has usually hidden it rather than resolved it.

## Alternatives

The other shapes considered, and why this one. Where a rejected alternative
would be a costly thing to revisit later, it belongs in a decision record too.

## How we will know it works

The tests that pin the rules above, and — for anything that renders — what has
to be **looked at** in a browser rather than asserted. A read-back passing is
not the same as the thing being right on screen.

## Out of scope

What this deliberately does not do, so review does not drift into it. If
something here should never be built, it belongs in
[DESIGN.md](../../DESIGN.md) instead.
