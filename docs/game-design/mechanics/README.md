# Mechanic specifications

One document per mechanic: the exact rules governing a single thing the player
interacts with, stated precisely enough to implement and to test.

## What is a mechanic, as opposed to a feature

A **feature** is something a player can do — see
[../features/](../features/README.md). A **mechanic** is a rule that governs
how something behaves once it exists. Zoning is a feature; the rule that a road
zones the four tiles perpendicular to it is a mechanic. Roads are a feature;
the rule that a road refuses to become a smaller one unless Replace is on is a
mechanic.

The test is whether it can be stated as a rule with no verbs belonging to the
player. If it can, it goes here.

## What belongs here, and what does not

Most mechanics that already ship are documented inside the specs they belong
to — the zoning frontage rule lives in
[../simulation-rules.md](../simulation-rules.md), the junction control ladder
in [../../world-sim/road-model.md](../../world-sim/road-model.md). That is
correct and they should stay there: a rule read in the context of its system is
easier to understand than one read alone.

This folder is for a mechanic that is **too large or too contested** to sit
inside another document — one that needs its own space to state edge cases,
worked examples and the reasoning behind a threshold. Reach for it when a rule
starts crowding out the document it lives in.

If a mechanic is settled and small, leave it where it is. A folder of
one-paragraph documents is worse than a paragraph in the right place.

## Writing one

Copy [\_template.md](_template.md) to `<mechanic>.md`, and remove the rule from
wherever it previously lived so it is stated once.

## The documents

_None yet — every mechanic that ships is currently stated inside the spec for
its own system._
