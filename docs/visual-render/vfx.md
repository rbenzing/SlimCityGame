# VFX specification

Smoke, fire, dust, weather and other transient visual effects: what they look
like, what triggers them, and what they cost.

## There is no particle system

`src/` contains no particle emitter, no sprite pool, and no transient-effect
system of any kind. Nothing in the world puffs, sparks or burns.

Several things a player might expect to produce an effect currently do not:

- An **incinerator** consumes rubbish without a plume.
- A **fire risk** field exists and feeds land value and desirability, but no
  building ever visibly catches fire — the field is a statistical pressure, not
  an event. See [../world-sim/environmental-simulation.md](../world-sim/environmental-simulation.md).
- **Construction** is shown by swapping the building's own geometry through
  construction states, not by dust or scaffolding effects. See
  [../art/buildings.md](../art/buildings.md).

Weather, seasons and flooding are deliberately deferred rather than merely
unbuilt — [../DESIGN.md](../DESIGN.md) owns that decision and the reasoning.

## When this document gets written

The first effect that needs to appear and disappear on its own. The design
questions that will need answering then, none of which are settled today:

- Pooling and instancing, since the renderer allocates nothing per frame and an
  effect system is the obvious way to break that. See
  [../engineering/performance-budget.md](../engineering/performance-budget.md).
- Whether an effect is simulation state (and therefore must be deterministic
  and may need saving) or purely cosmetic (and therefore may use the render
  thread's own RNG and is never saved). The same split already governs
  vehicles — see [../world-sim/agent-behavior.md](../world-sim/agent-behavior.md).
- How an effect reads under the day/night ramp, which every other material
  follows automatically. See [lighting.md](lighting.md).
