# Architecture overview

SlimCity runs as three cooperating execution contexts inside one browser tab:
a deterministic simulation in a Web Worker, an imperative three.js render
thread on the main thread, and a React DOM overlay on that same main thread.
This document is the map of how those three are put together — what each
owns, what crosses between them, and where the seams are. For _why_ a given
split was chosen, follow the ADR links rather than re-deriving the argument
here; for the exact shape of a message or a save file, see
[interfaces.md](../interfaces/README.md) and [data-model.md](../data-model/README.md).

## Sections

| Section | Size |
| --- | --- |
| [The three execution contexts](the-three-execution-contexts.md) | 4,716 B |
| [`src/main.ts`: the spine](srcmaints-the-spine.md) | 1,289 B |
| [The module map](the-module-map.md) | 5,659 B |
| [One frame](one-frame.md) | 1,681 B |
| [One tick, traced end to end](one-tick-traced-end-to-end.md) | 3,607 B |
| [Extension points](extension-points.md) | 2,778 B |
| [Where to look next](where-to-look-next.md) | 494 B |
