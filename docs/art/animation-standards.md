# Animation standards

Rigging and animation conventions for authored assets.

## Nothing is rigged and nothing is animated

There are no skeletons, no animation clips and no authored motion anywhere in
the project. Everything that appears to move is a transform written per frame
by the renderer — vehicles along their routes, the sun across the sky, the
water surface. The mechanism, and why it is that way, is in
[../visual-render/animation.md](../visual-render/animation.md).

Since no asset is animated, there is nothing for a rigging convention to
govern: no joint-naming scheme, no bind-pose rule, no clip-naming or
frame-rate standard, no root-motion policy.

## When this document gets written

The first authored animated asset. The conventions to settle at that point:

- Joint naming and hierarchy, so a rig is swappable between assets that share
  a silhouette.
- Bind pose and scale, which must agree with the scale bible in
  [README.md](README.md) — a rig authored at the wrong scale is the classic way
  a pipeline gets a permanent conversion factor baked into it.
- Clip naming and frame rate.
- Whether the asset leaves the instanced render path, which is the real cost
  and is a decision rather than a standard. See
  [../visual-render/animation.md](../visual-render/animation.md).
