# Architecture decision records

A decision record captures **one choice, the pressure that forced it, and what
it cost** — at the moment it was taken. It is a log entry, not a description of
the system. If you want to know how SlimCity works today, read
the specs — start at the [documentation map](../../README.md); if you want to know _why it is that way and what else was
on the table_, read here.

## The rules that make this folder worth trusting

**One decision per record.** A record that decides three things cannot be
superseded, because two thirds of it may still be right.

**Numbers are permanent.** Take the next free one. Never reuse, never renumber,
never fill a gap — the numbers appear in commit messages and review comments,
and a renumber turns those into lies.

**An accepted record is never rewritten.** Not to fix its reasoning, not to
bring it up to date. A decision that changes gets a _new_ record that supersedes
the old one, and the old one is marked `Superseded by ADR-NNNN` and otherwise
left exactly as it was. This is the single most important rule here. It is what
lets you read a record from a year ago and know you are seeing what was actually
believed then, rather than a version quietly edited to look correct.

Typos and broken links may be fixed. Reasoning may not.

**Status is one of:** `Proposed` · `Accepted` · `Superseded by ADR-NNNN` ·
`Deprecated` (the decision no longer applies and nothing replaced it).

**Write the title as the decision.** "Simulation runs in a worker, render on the
main thread" — not "Threading model". A reader scanning the index should be able
to learn the architecture from the titles alone.

**Not everything is an ADR.** A choice earns a record when it is _costly to
reverse_ and _not obvious from the code_. Which colour a button is, is not an
ADR. Which thread owns the world state, is. If a decision only makes sense
alongside a rule the code must obey, the rule belongs in the relevant spec and the record
links to it — state each fact in exactly one place.

## Adding one

Copy [0000-template.md](0000-template.md) to `NNNN-kebab-case-title.md`, fill it
in, and add the row below. Keep the table in numeric order.

## Index

| #                                                                              | Decision                                                                                                        | Status   | Date       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-traffic-is-statistical-assignment-with-cosmetic-agents.md)         | Traffic is statistical assignment with cosmetic agents, not per-agent simulation                                | Accepted | 2026-09-08 |
| [0002](0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md)              | The sim runs on a deterministic fixed timestep in a Web Worker; render never owns state                         | Accepted | 2026-09-08 |
| [0003](0003-world-state-is-layered-flat-typed-arrays.md)                       | World state is layered flat typed arrays (SoA), not an ECS or an object graph                                   | Accepted | 2026-09-08 |
| [0004](0004-dom-overlay-is-react-3d-world-stays-imperative-three.md)           | The DOM overlay is React; the 3D world stays imperative three.js                                                | Accepted | 2026-09-08 |
| [0005](0005-roads-are-grid-aligned-no-freeform-curves.md)                      | Roads are grid-aligned; free-form curves are out                                                                | Accepted | 2026-09-08 |
| [0006](0006-rendering-is-instancedmesh-everywhere-with-gpu-id-picking.md)      | Rendering is InstancedMesh everywhere with GPU ID-buffer picking                                                | Accepted | 2026-09-08 |
| [0007](0007-saves-are-versioned-typed-arrays-with-trailing-additive-layers.md) | Saves are versioned typed arrays with per-version migrations and trailing additive layers                       | Accepted | 2026-09-08 |
| [0008](0008-every-tool-commit-is-a-reversible-command.md)                      | Every tool commit is a reversible command; undo/redo is the command log                                         | Accepted | 2026-09-08 |
| [0009](0009-utilities-propagate-along-roads.md)                                | Utilities propagate along roads rather than as separately-drawn networks                                        | Accepted | 2026-09-08 |
| [0010](0010-map-size-is-capped.md)                                             | Map size is capped at 256² tiles, 512² at most later                                                            | Accepted | 2026-09-08 |
| [0011](0011-rule-zero-every-control-is-wired-to-real-behaviour.md)             | Rule zero — every rendered control is wired to real behaviour                                                   | Accepted | 2026-09-08 |
| [0012](0012-a-road-is-a-class-a-cross-section-and-junctions.md)                | A road is a class, a cross-section, and a set of junctions — not a tier                                         | Accepted | 2026-09-08 |
| [0013](0013-traffic-figures-come-from-published-standards.md)                  | Traffic engineering figures come from published standards, tied to game units by one constant                   | Accepted | 2026-09-08 |
| [0014](0014-genre-grammar-is-deliberate-originality-is-elsewhere.md)           | Genre grammar is adopted deliberately; originality applies to names, assets, and branding, not genre vocabulary | Accepted | 2026-09-08 |
