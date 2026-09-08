# <Mechanic>

One sentence: what this mechanic governs.

**Lives in:** `src/…` — where the rule is implemented, and its tests.

## The rule

Stated once, precisely, in the present tense. This is the sentence the code and
the tests are both held against, so it must be unambiguous: say what the input
is, what the output is, and what happens at the boundary.

## Worked examples

Two or three concrete cases with real numbers, including at least one that sits
on a boundary. Examples are what stop two readers interpreting the same rule
differently, and they translate directly into tests.

## Edge cases

The cases that are easy to get wrong and the answer for each. If a case is
genuinely undecided, say so rather than implying the rule covers it.

## Why this rule and not another

The reasoning, briefly. If the alternative was rejected for a reason that will
outlive this mechanic, that is an ADR — see
[../../engineering/adr/README.md](../../engineering/adr/README.md).

## Tuning

Which numbers here are dials rather than rules, and where they are set. Dials
belong in [../balancing.md](../balancing.md).
