# Interactions

Traffic depends on `RoadNetworkApi` (`findPath`, `addVolume`, `getEdges`,
`decayVolumes`) as an injected interface, never importing `roads.ts`
directly — see [interfaces.md](../../interfaces/README.md) for the shape. A district's
`noHeavyTraffic` policy reaches routing through `RoadNetwork.setEdgeCostHook`,
composed with each trip's own jitter multiplier, so through-traffic can be
made to prefer routing around a district without changing the base cost
model.

`GraphEdge.volume`, once written, is read by three independent consumers with
three independent notions of "how full": `pathfind.ts`'s own
`approachSaturation` (profile-derived capacity, drives cost and delay),
`RoadNetwork.refreshControls`'s warrant (same capacity, decides whether a
junction gets a control at all), and `src/sim/fields.ts`'s `applyTraffic`,
which paints the `Traffic` scalar field that feeds land value and pollution —
see [traffic-model.md](../../../world-sim/traffic-model.md) for those effects. The vehicle buffer
(`TrafficSystem.vehicleBuffer`, a `Float32Array`) is the only thing sent
toward render; it is consumed as an instanced-mesh source, not read back into
the sim.

