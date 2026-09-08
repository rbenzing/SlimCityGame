# Vegetation specification

Trees and ground cover. Everything here is deterministic — seeded from map
data, tile coordinates or a building id, never `Math.random` — so the same map
always looks the same.

## Trees

Four low-poly species, each one merged geometry on its own InstancedMesh, no
textures:

- **Broadleaf** (2–3 offset canopy blobs on a trunk, broad) is the default.
- **Pine** (3 stacked narrowing cones, tall) appears above 18 m elevation.
- **Poplar** (a single tall, columnar ellipsoid) appears within 2 tiles of
  water.
- **Shrub** (a low single blob, near-groundcover) appears where tree density is
  below 128 — forest edges.
- A hash tiebreak mixes the bands naturally instead of drawing a hard species
  line, and everywhere else falls back to broadleaf.

Placement reads as natural stands rather than a lattice. A smooth, seeded
value-noise field over tile coordinates multiplies each tile's base tree count
by 0.0–1.6×, so equal-density map regions still produce clearings, thickets and
lone trees instead of a uniform per-tile count; the result clamps to 0–4 trees
per tile (the base count itself comes from the density thresholds above — 1–2
normally, up to 3 where density is 200 or higher, the "forest" read). Each
tree's offset jitters across the FULL tile — up to ±0.46 of a tile, with a
minimum same-tile separation so a multi-tree tile doesn't self-overlap — rather
than being confined near the tile centre. A per-tile "stand maturity" draw
(0–1) shifts the scale range: a mature stand draws 1.0–1.6 with the odd
sapling, a young stand draws 0.45–0.9, so a clump of trees reads as a stand of
a particular age rather than identical clones. Lean and rotation carry a slight
seeded jitter on top.

Colour is a species base green (deep green or olive) with a further ±6%
per-instance hue/value jitter, plus a seasonal tint keyed to the calendar
month: spring fresh, summer deep, autumn olive-brown on broadleaf and shrub
only (pines stay green year-round), winter desaturated. Leaf-drop geometry is
deferred — winter is a tint, not a change of silhouette, and is described here
as exactly that.

## Ground cover

All vertex-colour work on the existing terrain chunks — no new geometry:

- **Grass tint** blends three hues (fresh green, olive, yellow-green) by a
  low-frequency, seeded value-noise field over world coordinates — the
  "different grass types" read.
- **Dry patches**: a second, higher-frequency splotch noise pushes ground
  toward dry brown, biased to appear more often in open plains (low tree
  density) and at higher elevation, and less in lush low ground.
- **Manicured vs. wild**: tiles under a park footprint, or within 1 tile of a
  road, render the uniform fresh-green "mown lawn" variant regardless of the
  noise above; everywhere else gets the full hue and patch variation.
- Ground under a dense tree cluster darkens slightly — a canopy-shadow read.

See [../art/streets.md](../art/streets.md) for how this ground cover
transitions into a road's kerb and the dirt ring around a rounded dead end.
