# Traffic — system design

Traffic assigns and animates trips over the road network: it decides which
edges a trip's demand loads, and it decorates that assignment with cosmetic
vehicles. It is explicitly not a per-agent simulation — no citizen or vehicle
has a schedule, a body, or a life of its own; see
[ADR-0001](../../adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)
for why.

**Lives in:** `src/sim/traffic.ts` (assignment loop, cosmetic vehicle pool),
`src/world/pathfind.ts` (A\*, edge cost, junction delay), `src/world/roads.ts`
(the road graph itself: build, rebuild, volume storage), `src/shared/
roadprofile.ts` (speed and capacity per cross-section), `src/shared/
approach.ts` and `src/shared/approachzone.ts` (per-lane, per-movement delay
division), `src/shared/junction.ts` (control-delay formulas and the warrant
that picks a junction's control).

## Sections

| Section | Size |
| --- | --- |
| [The model](the-model.md) | 5,218 B |
| [How it runs](how-it-runs.md) | 4,200 B |
| [Invariants](invariants.md) | 2,312 B |
| [Interactions](interactions.md) | 1,181 B |
| [Cost](cost.md) | 1,648 B |
| [Where it breaks](where-it-breaks.md) | 3,277 B |
