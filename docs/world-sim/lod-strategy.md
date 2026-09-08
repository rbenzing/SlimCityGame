# Simulation level-of-detail strategy

How simulation fidelity varies with distance from the camera or with city size.

## It does not vary

The simulation has no notion of the camera. It runs in a Web Worker that is
never told where the player is looking, and every tile, road edge and building
is simulated identically whether it is filling the screen or off the edge of
the map. There is no near/far tier, no frozen region, no reduced update rate
for distant districts.

This falls out of the architecture rather than being a separate decision. The
worker owns the world and the render thread owns the camera, and the firewall
between them means the simulation _cannot_ see the camera without breaking the
rule that makes it deterministic and testable. See
[../engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md](../engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).

It is affordable because the simulation is statistical rather than per-agent.
There are no citizens to update — population is a number, and traffic is an
assignment over a graph whose nodes exist only at junctions. The cost scales
with the size of the road network, not with how much of it is on screen. See
[agent-behavior.md](agent-behavior.md) and
[../engineering/systems/traffic.md](../engineering/systems/traffic.md).

What _does_ vary by cadence is which systems run on which tick — several run on
their own interval rather than every tick. That is a fixed schedule, not a
distance-based one, and it is documented in [tick.md](tick.md).

Rendering has no LOD either, for its own separate reasons; see
[../visual-render/lod.md](../visual-render/lod.md).

## When this document gets written

If the map cap rises. Map size is capped at 256×256 precisely so that uniform
simulation stays affordable — field diffusion and instance counts both scale
quadratically. See
[../engineering/adr/0010-map-size-is-capped.md](../engineering/adr/0010-map-size-is-capped.md).
Raising the cap is the event that would force a fidelity tier, and the decision
to record then is which systems may be approximated far from the player without
the city drifting into a state the player notices when they pan back.
