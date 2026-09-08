# ADR-0006: Rendering is InstancedMesh everywhere with GPU ID-buffer picking

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Project owner
- **Supersedes:** none
- **Superseded by:** none

## Context

Decided at project inception (repo created 2026-07-28), as part of the
rendering architecture (ROADMAP §3.9). The performance budget targets 10k+
buildings, trees, props, and vehicles at 60 fps with roughly 300 draw
calls — a target individual (non-instanced) meshes per object cannot hit.
Picking (resolving a screen click to a game entity) has the same scaling
problem if it walks every object with a per-mesh raycast: cost grows with
scene complexity rather than staying flat as the city grows.

## Decision

Every class of repeated world object — buildings by archetype, trees,
props, vehicles — renders through `InstancedMesh` rather than individual
meshes, so draw-call count stays flat regardless of instance count within
a bucket. Picking is designed around a stable per-instance id rather than
per-object identity: each instance carries an id encoded as a 24-bit RGB
triple alongside its transform, with the design's endpoint being a GPU
id-buffer pass — render instance ids to a small offscreen target and read
back one pixel — so a pick resolves in O(1) regardless of city size, with
no per-mesh raycast walk.

## Consequences

- **Good:** draw-call count stays bounded as the city grows, which is
  what makes the 10k-building/60 fps target reachable at all; the
  id-encoding scheme is already exercised by tests and cross-checked
  against the instancer's own slot bookkeeping, so it is ready to back a
  GPU readback pass without a redesign.
- **Bad:** the GPU id-buffer readback described above has not shipped.
  Today's picking (`IdPicker.pickBuilding` in `src/render/picking.ts`)
  raycasts against `InstancedMesh` objects on the CPU and decodes the
  id-color attribute only to cross-check the hit, so pick cost still
  scales with the number of instances raycast against, not O(1) as the
  decision's name implies; the file's own comment names the GPU pass as
  future work.
- **Neutral:** the id-color codec is a 24-bit space (16,777,215 ids), far
  beyond any planned city size, but a ceiling nonetheless.

## Alternatives considered

None recorded. The sources state InstancedMesh plus GPU id-buffer picking
directly as the target architecture, without naming a rejected
alternative with a stated reason.

---
