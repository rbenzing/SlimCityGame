# Game design

What the game asks of the player, what it gives back, and how it is tuned.

This folder is about the _game_. The rules of the simulated world live in
[../world-sim/](../world-sim/README.md); how any of it is built lives in
[../engineering/](../engineering/README.md). The line between this folder and
`world-sim/` is worth stating: the simulation's rules are there, and what those
rules ask of a player is here. Demand and growth are simulation; whether the
demand curve makes for a good first hour is design.

## The whole game

| Document                             | Covers                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| [gdd.md](gdd.md)                     | The game design document: vision, pillars, and what the game deliberately is not |
| [gameplay-loop.md](gameplay-loop.md) | The core loop, minute to minute                                                  |

## Systems the player feels

| Document                                   | Covers                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| [simulation-rules.md](simulation-rules.md) | Zoning, demand, growth, levels and abandonment                            |
| [economy.md](economy.md)                   | The monthly cycle, tax, upkeep, loans                                     |
| [progression.md](progression.md)           | Milestones and what each unlocks, districts and policies, the Advisor     |
| [balancing.md](balancing.md)               | Every tuning constant, and the file it lives in                           |
| [difficulty.md](difficulty.md)             | There are no difficulty levels — why, and what would change if there were |

## Per-item documents

| Folder                            | For                                                            |
| --------------------------------- | -------------------------------------------------------------- |
| [features/](features/README.md)   | One document per gameplay feature: what it is for the player   |
| [mechanics/](mechanics/README.md) | One document per mechanic: the exact rules governing one thing |

## Where the dials are

Every tuning number in the game is gathered in [balancing.md](balancing.md)
with the file it lives in. If you are about to change how the game _feels_
rather than how it _works_, start there — and change the number in the code,
not the document, since the document names the code as the authority.
