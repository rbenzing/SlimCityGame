# Streets and ground detail

What a road looks like, not how it behaves. Roads graduate from tinted quads
to readable streets entirely through vertex-colour and geometry work on the
existing per-chunk road mesh — no textures. Lane composition, junction
control logic and capacity numbers are simulation facts and stay in
[road-model.md](../../world-sim/road-model/README.md); the road cross-section table lives in the
[scale bible](../README.md). This file is what a modeller or shader author needs
for the surface, the paint, the furniture and the zoning overlay.

## Sections

| Section | Size |
| --- | --- |
| [Asphalt and paint](asphalt-and-paint.md) | 14,415 B |
| [Median, dividers and kerbs](median-dividers-and-kerbs.md) | 3,240 B |
| [Junction and motorway signage](junction-and-motorway-signage.md) | 3,955 B |
| [Ground-cover transitions](ground-cover-transitions.md) | 473 B |
| [Zoning-grid visualisation](zoning-grid-visualisation.md) | 1,415 B |
| [Deferred](deferred.md) | 470 B |
