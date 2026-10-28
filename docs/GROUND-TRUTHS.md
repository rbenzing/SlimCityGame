# Ground truths

The always/never rules of SlimCity, one bullet and one id each, split by area.

How to use it:

- Follow every rule of the areas you touch. If code disagrees with a rule,
  stop and flag the rule by id.
- A truth is not tuning. Dials live in
  [balancing.md](game-design/balancing.md) and the code it names.
- Change a truth here and in its spec in the same commit.
- Each rule ends with where it is decided; it has no line numbers.

| Area                                   | File                                          | Rules | Ids                                  |
| -------------------------------------- | --------------------------------------------- | ----: | ------------------------------------ |
| Roads: network and profiles            | [roads-network.md](truths/roads-network.md)   | 38    | `R-roads-001–006, 009, 010, 015–028, 040–043, 051–055, 057–060, 076, 077, 080` |
| Roads: junctions, markings, ramps      | [roads-junctions.md](truths/roads-junctions.md) | 33  | `R-roads-029–036, 044–050, 056, 061–075, 078, 079` |
| Roads: rail, tram and transit          | [roads-transit.md](truths/roads-transit.md)   | 9     | `R-roads-007, 008, 011–014, 037–039` |
| World: grid and simulation core        | [world-grid.md](truths/world-grid.md)         | 19    | `R-world-001–006, 019–024, 027, 030–035` |
| World: growth, lots and population     | [world-growth.md](truths/world-growth.md)     | 29    | `R-world-007–018, 025, 026, 028, 029, 036–048` |
| Utilities and services                 | [services.md](truths/services.md)             | 38    | `R-services-001` to `R-services-038` |
| Saves and the data model               | [saves.md](truths/saves.md)                   | 12    | `R-saves-001` to `R-saves-012`       |
| Architecture and the thread boundary   | [architecture.md](truths/architecture.md)     | 16    | `R-architecture-001` to `R-architecture-016` |
| Rendering and art                      | [render.md](truths/render.md)                 | 33    | `R-render-001` to `R-render-033`     |
| Game design and interface              | [design.md](truths/design.md)                 | 17    | `R-design-001` to `R-design-017`     |
| Process                                | [process.md](truths/process.md)               | 10    | `R-process-001` to `R-process-010`   |

Read the file of every area a task touches, and nothing else of the truths.

Broken most often (their text is in `CLAUDE.md`): `R-roads-001`,
`R-roads-005`, `R-roads-021`, `R-roads-023`, `R-roads-044`, `R-services-001`,
`R-world-003`, `R-saves-002`, `R-architecture-004`, `R-architecture-008`,
`R-world-001`, `R-render-001`, `R-design-001`.
