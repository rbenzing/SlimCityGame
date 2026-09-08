# World and simulation

The rules of the simulated world: what exists in it, how it behaves, and what
happens each tick. This is the largest documentation area because it is the
largest part of the game.

Everything here is **what the simulation does**. How it is coded lives in
[../engineering/](../engineering/README.md); how it looks lives in
[../visual-render/](../visual-render/README.md); how it is tuned and what it
asks of the player lives in [../game-design/](../game-design/README.md).

## The world

| Document                         | Covers                                                                    |
| -------------------------------- | ------------------------------------------------------------------------- |
| [world-model.md](world-model.md) | The tile grid, terrain and height, terraforming, water, the map edge      |
| [time-system.md](time-system.md) | The clock, day length, speed multipliers                                  |
| [entities.md](entities.md)       | Every thing the world holds, how it is identified and whether it persists |

## What runs

| Document                                                   | Covers                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| [tick.md](tick.md)                                         | What runs each tick, in what order, on what cadence          |
| [agent-behavior.md](agent-behavior.md)                     | What moves and why — and what is merely drawn                |
| [population-model.md](population-model.md)                 | How population arises and moves                              |
| [environmental-simulation.md](environmental-simulation.md) | The scalar fields: pollution, crime, land value and the rest |
| [lod-strategy.md](lod-strategy.md)                         | Why simulation fidelity does not vary with distance          |

## Networks

| Document                                 | Covers                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| [road-model.md](road-model.md)           | Classes, profiles, junctions, ramps, markings, and the traffic-engineering formulas |
| [pathfinding.md](pathfinding.md)         | The graph, the A\* search, and the cost function                                    |
| [traffic-model.md](traffic-model.md)     | Statistical assignment, congestion feedback, cosmetic vehicles                      |
| [transit-model.md](transit-model.md)     | Rail, trams and buses                                                               |
| [utilities-model.md](utilities-model.md) | Power and water, and what carries them                                              |
| [services-model.md](services-model.md)   | Coverage, funding, and waste                                                        |

## The thing to understand first

**Population is a number, not a fleet of agents.** There are no citizens in
this simulation. Trips are generated statistically from building occupancy and
assigned over a road graph; the vehicles you can see are cosmetic, animated
along real computed routes but simulating nothing. Several documents here would
mean something quite different in a game that worked the other way, and this is
the decision that shapes all of them — see
[../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md](../engineering/adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md).
