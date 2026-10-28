# Invariants

- **Determinism.** Neither `traffic.ts` nor `pathfind.ts` calls
  `Math.random` or `Date.now`; `TrafficSystem` takes an injected seeded `Rng`
  and the route-jitter is a pure hash rather than an `Rng` draw specifically
  so it can never perturb the RNG sequence the rest of the sim depends on.
  `describe('TrafficSystem determinism', …)` in `src/sim/traffic.test.ts`
  pins it directly: "produces identical vehicle buffers and network calls for
  two runs sharing a seed" runs two independently constructed systems off the
  same seed for `TICKS_PER_DAY + 10` ticks and asserts the vehicle buffers and
  the recorded sequences of `addVolume`/`decayVolumes` calls are exactly
  equal; a companion test asserts two different seeds diverge. This is the
  traffic-specific instance of the project-wide guarantee in
  [ADR-0002](../../adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)
  that a seed plus a command log always reproduces the same state.
- **Graph changes under in-flight routes.** `RoadNetwork.invalidateRegion`
  only sets a dirty flag; despite taking region bounds, the next query
  (`findPath`/`getEdges`/`getNodes`/`addVolume`) rebuilds the **entire** graph
  from the road network (`ensureFresh` → `buildGraph`), which it also does
  whenever the network's version has moved on since the last build,
  reassigning every node and
  edge id. A cosmetic vehicle already animating holds its own captured
  `points`/`segmentLengths` from the tick it spawned and has no reference
  back to the network — it keeps driving its captured line to the end even
  if the road under it is bulldozed mid-route; nothing reroutes, removes, or
  teleports it. Only trips sampled _after_ the edit see the rebuilt graph.
- **On-road guarantee for animation.** The real `RoadNetwork` gives every
  path a `route` built from the roads' own shapes, so a vehicle stays on the
  road by construction, round a curve off the grid as much as along a grid
  street. An injected `RoadNetworkApi` that gives no route has its tile path
  cut at the first non-cardinally-adjacent seam (`truncateToAdjacentChain`),
  so it can never animate a vehicle in a straight line across non-road
  terrain. Service vehicles and garbage trucks drive the same route
  (`pathRoute` in `src/shared/types.ts`).

