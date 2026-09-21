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

GROUND TRUTHS

- ALWAYS read and follow docs/GROUND-TRUTHS.md before changing anything. It is the always/never rulebook for every part of the game (roads, sim, services, saves, architecture, rendering, art, UX, process).
- When code and a truth disagree, stop and flag it. Never silently pick one.
- When you learn a new invariant (a bug a rule would have prevented, or a rule the user states), add it to docs/GROUND-TRUTHS.md and to the spec that decides it, in the same change.
- The ones broken most often:
  - A tile carries exactly one road tier. Rail and street never share a tile; a rail tile between two street tiles breaks the street, it does not cross it.
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
