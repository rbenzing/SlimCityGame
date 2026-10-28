DO

- keep our documentation up to date
- follow spec and architecture guidelines
- write meaningful documentation
- build and lint check at the end of every development task
- use Ephemeral and Idempotent strategies
- clean up scripts created to perform tasks that are not part of the codebase

DON'T

- write comments referencing documentation
- extend documentation with v2 or versioning per section, only overall documentation maintains version.
- write code unless we have solid documentation

READING THE DOCS (docs/engineering/documentation-strategy.md decides this)

- Read this file and docs/README.md on every task. Then read the section of docs/GROUND-TRUTHS.md for each area the task touches (roads, world and sim, utilities and services, saves, architecture, rendering and art, game design and UX, process) and nothing else of it.
- A scout reads a spec's card (its first 40 lines) and opens a section only when the ticket needs its why; it returns pointers (file#anchor, rule, src/file:line), never file dumps.
- A ticket cites rules and anchors, never "read the doc". A cook reads what the ticket cites. A reviewer reads the full spec of the area under review, once.
- Delivery history lives in docs/history/ (one file a month), never in a spec; docs/ROADMAP.md holds status, the Open list and the milestones. Read the Open list, not the history, to learn what exists.
- Every file has a byte budget by tier (4 KB for this file, docs/README.md and the truths index; 16 KB for a spec); `npm run lint:docs` reports the overshoots. A file over budget is split by section, never trimmed by dropping a rule or a number.
- Write for the reader who skims: rules as imperatives of at most two lines, numbers in tables with their source and constant, a code pointer instead of a paragraph about what code does, no dates in a spec, no sentence repeated from another file.

GROUND TRUTHS

- Follow docs/GROUND-TRUTHS.md. It is the always/never rulebook for every part of the game; read the sections for the areas you touch, as above.
- When code and a truth disagree, stop and flag it. Never silently pick one.
- When you learn a new invariant (a bug a rule would have prevented, or a rule the user states), add it to docs/GROUND-TRUTHS.md and to the spec that decides it, in the same change.
- The ones broken most often:
  - A tile carries one road, or two only where one passes over the other at right angles (an overpass, on the over layers, clearing 5 m over road / 7 m over rail). The two never join; a road is identified by tile AND layer (`RoadKey`). Roads join only at one level.
  - Rail and street never share a tile at grade; a rail tile between two street tiles breaks the street, it does not cross it.
  - A one-way road flows the way it was drawn (its stored roadFlow); never infer direction from geometry, and always mask the flow byte before comparing it.
  - Roads replace by class rank, never by tier number. A highway touches only a highway or a ramp. Highway and rail arms never take a junction control.
  - Yellow paint only separates opposing directions; everything else is white. Dirt, alley and rail carry no paint.
  - Power, water and every service reach the city along the street road network by BFS from adjacent road tiles, never by a straight-line radius.
  - Nothing in src/sim, src/world, src/core or src/render calls Math.random or Date.now. src/sim never imports src/render or src/ui.
  - Enum-like values are `as const` objects whose numbers are save bytes: never reorder or reuse one, only append. A new grid layer goes last and bumps SAVE_VERSION by exactly one.
  - Player Commands are the only way the world mutates, and every Command returns its exact inverse.
  - The tile is 20 m. Lane, vehicle and person sizes are absolute metres that never scale with it.
  - Every repeated placeable is an InstancedMesh. No custom shaders, no textures, no imported meshes.
  - Rule Zero: never ship a control that is not wired to real behaviour.
  - Never name or imitate a commercial city-builder.
