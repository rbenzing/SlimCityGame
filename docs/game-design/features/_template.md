# <Feature> — design

- **Status:** Draft
- **Date:** YYYY-MM-DD

## What the player gets

The feature in two or three sentences, from the player's side of the screen.
What can they do afterwards that they cannot do now?

## Why it earns its place

What problem in the current game this solves, or what it adds that the player
will actually notice. A feature that only makes the simulation more correct
without the player ever seeing the difference is not a gameplay feature — it is
engineering work, and belongs in
[../../engineering/features/](../../engineering/features/README.md).

Name the design pillar it serves; see [../gdd.md](../gdd.md).

## How it works, for the player

The rules, in the order a player meets them. What they place or draw, what it
costs, what changes, what feedback they get. Be concrete enough that someone
could play it on paper.

## What it interacts with

The existing systems it touches and how. This is where features usually go
wrong: a new mechanic that quietly makes an existing one pointless, or one that
only works if the player has already understood something the game never taught
them.

## Tuning

The numbers, and roughly where they should sit. They belong in
[../balancing.md](../balancing.md) once settled — one place for every dial.

## What it is not

The scope boundary, so review does not drift. If something here should never be
built, it belongs in [../../DESIGN.md](../../DESIGN.md) instead.
