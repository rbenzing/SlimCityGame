# The road tool

The drawer's road category shows classes, not tiers; picking one lays its
default profile. The tool options panel grows a profile editor — lane
pieces as a strip across the tile's width budget, with per-side toggles for
parking, bike lanes, lamps and sidewalks, a parking style (parallel, angled
60° back-in or head-in 90°) while either kerb parks, and a median picker — and
its edits apply to the next drag. A choice that composes a road too wide for
the tile is offered disabled, with the reason. The path modes are `Straight`, `L-path`, `Grid`
(not for a motorway) and `Curve`, which lays a road off the grid
([road-network.md](../road-network/README.md),
[interaction.md](../../ux/interaction.md#curve-and-free-road-modes)). A replace
mode drags a new profile over an
existing run in place, keeping alignment, buildings and elevation; if the
new profile does not fit the tile the old one occupied, the drag refuses
rather than demolishing anything. Clicking a junction node opens the
junction inspector: a control picker, a per-approach lane movement grid,
turn restrictions, and the delay the current control is costing. Clicking a
ramp node shows its merge or diverge length. Every edit is a command
through the same worker queue as any other build action, and every one is
undoable.

