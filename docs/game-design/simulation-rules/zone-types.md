# Zone types

Ten zone types exist, grouped into three demand sectors — residential,
commercial, and industrial — each gated behind a milestone (a city-size
tier reached by population; milestone 0 is reached at 0 population,
milestone 1 at 400, milestone 2 at 1,200, milestone 3 at 3,500, and
milestone 4 at 8,000):

- **Low Density Housing** (`ResLow`) — single and semi-detached houses.
  Milestone 0.
- **Medium Density Row Housing** (`ResMediumRow`) — narrow attached row
  houses, three homes on one normal 1×2 lot at every level. Milestone 1.
- **Medium Density Housing** (`ResMedium`) — small apartment blocks.
  Milestone 2.
- **Mixed Housing** (`Mixed`) — commercial ground floor with apartments
  above; a single building carries both residents and jobs, pulling on
  residential demand while its jobs count toward commercial demand like any
  other job. Milestone 3.
- **High Density Housing** (`ResHigh`) — large apartment towers.
  Milestone 4.
- **Low Density Business** (`ComLow`) — stores and shops. Milestone 0.
- **High Density Business** (`ComHigh`) — malls, offices, and hotels.
  Milestone 4.
- **Industrial** (`Industrial`) — light industry: workshops and warehouses
  from milestone 0, factories from Small Town (milestone 1), flex and R&D
  buildings from Big Town (milestone 3). Its jobs are the basic jobs a town
  lives by.
- **Heavy Industrial** (`IndHeavy`) — the plants that pollute and make
  noise, kept off the housing by the player's own hand: food plants, chemical
  plants, steelworks and paper mills. It pulls on industrial demand like the
  Industrial zone, its jobs are basic jobs, and it is zoned and served the
  same way. Milestone 2, Busy Township, when a town's workforce can staff a
  plant.
- **Agriculture** (`Agriculture`) — farmland off a dirt road, on soil that
  can be farmed. It pulls on industrial demand, and its farms' jobs are
  industrial jobs: a farm is the basic industry of a small town, as a mill
  is. The soil under a lot decides whether it grows row crops, an orchard or
  pasture. Milestone 0.

`ZoneType` numbers 1–5 (the original five zones), 6–8 (the next three), 9
(Agriculture) and 10 (Heavy Industrial) are stored in the tile grid, in
saves, and in zone-paint patches, so they are never renumbered or reused.

