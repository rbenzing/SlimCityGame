# Animation specification

How things move: what is animated, by what mechanism, and the conventions
animated content must follow.

## There is no animation system

`src/` contains no `AnimationMixer`, no `AnimationClip`, no `SkinnedMesh` and
no skeleton. Nothing in the world is rigged, and no authored animation is
played back.

Everything that moves does so by having its transform written each frame:

- **Vehicles** are instanced meshes whose position and orientation are
  interpolated along a real computed route (`src/render/vehicles.ts`). The
  wheels do not turn and the body does not bank; at the camera distances this
  game is played at, neither is missed.
- **Water** moves by animated UV offsets and per-vertex displacement, not by an
  animation track. See [water.md](water.md).
- **The sun and sky** move because the day/night ramp writes their values from
  the clock. See [lighting.md](lighting.md) and
  [../world-sim/time-system.md](../world-sim/time-system.md).
- **Trees** do not sway.

The reason is the same one that governs everything else here: the world is
instanced geometry, and an `InstancedMesh` gives you a transform per instance
and nothing else. Per-instance skeletal animation would mean abandoning the
instancing that the whole render budget rests on. See
[../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md](../engineering/adr/0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md).

## When this document gets written

The first thing that needs to move in a way a transform cannot express — a
crane on a construction site, a level-crossing barrier, an opening door. At
that point the question to settle is not how to play a clip; it is which
objects leave the instanced path and what that costs, because the answer for
one object sets the precedent for all of them.

Rigging and animation conventions for authored assets would live in
[../art/animation-standards.md](../art/animation-standards.md), which is empty
for the same reason.
