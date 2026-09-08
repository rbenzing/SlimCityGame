# ADR-0000: Short declarative title — the decision, not the topic

- **Status:** Proposed
- **Date:** YYYY-MM-DD
- **Deciders:** who agreed
- **Supersedes:** ADR-XXXX, or none
- **Superseded by:** ADR-XXXX, or none

## Context

The forces in play, written so someone who joins in a year understands the
pressure without having to have been here. What was true when the decision was
taken: the constraints, the thing that hurt, the numbers that mattered. State
the problem, not the answer.

## Decision

One paragraph, active voice, present tense: **we do X**. If there is a rule a
reader must be able to check code against, state it as a rule, once, here — and
nowhere else in the documentation set.

## Consequences

What follows from this, honestly, including what it costs.

- **Good:** what this buys.
- **Bad:** what it forecloses or makes harder.
- **Neutral:** what merely changes shape.

## Alternatives considered

- **The alternative:** why it was not taken. An alternative with no stated
  reason is not an alternative, it is a list item — leave it out.

---

<!--
How to use this template

1. Copy to `NNNN-kebab-case-title.md`, taking the next free number. Numbers are
   never reused and never renumbered, because links to them live in commit
   messages and code review.
2. Fill in the sections. Delete none of them; write "None" where a section is
   genuinely empty.
3. Add the row to the table in README.md.
4. Once a record is Accepted it is not rewritten. A decision that changes gets
   a NEW record that supersedes the old one, and the old one is marked
   Superseded rather than deleted. That is what keeps this folder trustworthy:
   it is a log of what was decided and when, not a description of the present.
   The present lives in SPEC.md.
-->
