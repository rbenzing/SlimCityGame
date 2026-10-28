# Where it breaks

- **Two capacity models for one number.** Routing, congestion cost, and
  junction warrants all read `profileCapacity` (HCM-derived, per lane piece,
  from `roadprofile.ts`). The `Traffic` scalar field that drives land value
  and pollution (`fields.ts`'s `applyTraffic`) instead computes capacity as
  `edge.tier * TRAFFIC_CAPACITY_PER_TIER`, a flat per-tier constant that knows
  nothing about a profile's actual lane count or transit pieces. Editing a
  road's cross-section changes routing and junction delay immediately without
  changing how full that road paints in the pollution/land-value fields — the
  two "percent full" readings are not on the same scale, and nothing keeps
  them in sync.
- **Two day lengths.** Volume decay and junction-control re-warranting fire
  on `TICKS_PER_DAY` (200 ticks), while the rush-hour trip curve rides
  `VISUAL_DAY_TICKS` (2400 ticks) — twelve times longer. Volume decays twelve
  times over one full rush-hour cycle, and a junction's control can appear or
  disappear mid-visual-day with no corresponding change in the curve that is
  driving trip counts. Tuning one cadence does not move the other.
- **A road edit is always a full rebuild.** Every node and edge id is
  reassigned on the next query after any edit, anywhere on the map, despite
  `invalidateRegion` accepting bounds that suggest otherwise. Anything that
  held an edge or node id across the edit is holding a stale reference; the
  traffic system itself never checks for this because it never keeps one
  across a tick boundary, but a future consumer that does would break
  silently.
- **In-flight vehicles do not react to edits.** An `ActiveVehicle`'s route is
  captured once at spawn and never revalidated; bulldozing the road under a
  vehicle already animating does not reroute, despawn, or even flag it — it
  finishes driving a line that may no longer exist as a road. This is a
  purely visual bug with no test coverage, because nothing about it touches
  volume or determinism.
- **Cosmetic density is not what it looks like.** Spawning is gated by a
  citywide `vehicleDensityCap` and a fixed 1024-slot pool shared with other
  cosmetic systems (garbage trucks take the pool's tail); under load a spawn
  is silently skipped once either limit is hit, while the `volume` it would
  have represented is still added. A quiet-looking road can already be
  saturated in the numbers that drive delay, land value, and pollution — a
  screenshot is not evidence of what the assignment believes.
- **The route jitter is fixed per origin-destination pair.** `tripSeed`
  hashes only the endpoints, so every trip between the same two tiles prefers
  the same detour forever. It breaks up the single-tick "snake," but it never
  rebalances load between two parallel streets serving the same pair; only
  different endpoints shift which one is favored.
- **The `population`-less fallback is a different model, not a degraded one.**
  Any caller that omits `population` — every test double that does not wire
  it through — falls back to a flat `TRIPS_PER_TICK` = 4 with no rush-hour
  shape. Reading such a test in isolation from `worker.entry.ts`'s real wiring
  gives a false impression of how trip volume actually behaves live.
