# Nature and terrain

Trees, ground cover, terrain, water, and the sky above all of it. Everything
here is deterministic — seeded from map data, tile coordinates or a building
id, never `Math.random` — so the same map always looks the same.

## Trees

Four low-poly species, each one merged geometry on its own InstancedMesh, no
textures:

- **Broadleaf** (2–3 offset canopy blobs on a trunk, broad) is the default.
- **Pine** (3 stacked narrowing cones, tall) appears above 18 m elevation.
- **Poplar** (a single tall, columnar ellipsoid) appears within 2 tiles of
  water.
- **Shrub** (a low single blob, near-groundcover) appears where tree density
  is below 128 — forest edges.
- A hash tiebreak mixes the bands naturally instead of drawing a hard species
  line, and everywhere else falls back to broadleaf.

Placement reads as natural stands rather than a lattice. A smooth, seeded
value-noise field over tile coordinates multiplies each tile's base tree
count by 0.0–1.6×, so equal-density map regions still produce clearings,
thickets and lone trees instead of a uniform per-tile count; the result
clamps to 0–4 trees per tile (the base count itself comes from the density
thresholds above — 1–2 normally, up to 3 where density is 200 or higher, the
"forest" read). Each tree's offset jitters across the FULL tile — up to
±0.46 of a tile, with a minimum same-tile separation so a multi-tree tile
doesn't self-overlap — rather than being confined near the tile centre. A
per-tile "stand maturity" draw (0–1) shifts the scale range: a mature stand
draws 1.0–1.6 with the odd sapling, a young stand draws 0.45–0.9, so a clump
of trees reads as a stand of a particular age rather than identical clones.
Lean and rotation carry a slight seeded jitter on top.

Colour is a species base green (deep green or olive) with a further ±6%
per-instance hue/value jitter, plus a seasonal tint keyed to the calendar
month: spring fresh, summer deep, autumn olive-brown on broadleaf and shrub
only (pines stay green year-round), winter desaturated. Leaf-drop geometry is
deferred — winter is a tint, not a change of silhouette, and is described
here as exactly that.

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

See [streets.md](streets.md) for how this ground cover transitions into a
road's kerb and the dirt ring around a rounded dead end.

## Terrain

Placing a road or a building levels its own footprint — plus a 1-tile apron
around a road — to the mean height of the tiles it covers, so the new
structure sits flat instead of a terrain "diamond" poking up through it.
Because a rendered terrain corner is shared by the two chunks that meet
there, dirtying one tile always dirties its neighbours' chunks too: rebuild
only the edited chunk and the shared edge would show the old height on one
side and the new one on the other — a crack that shows the water plane
straight through the ground.

At the edge of the map, a perimeter skirt wall closes the view from outside:
for every boundary-chunk edge vertex, a vertical quad strip drops from the
surface down to a fixed base (−18 m), vertex-coloured as an earth
cross-section — a thin topsoil band matching the local ground colour, then
dirt brown, then darker rock at the base. It follows the terrain height, and
a terraform edit touching an edge row rebuilds just that skirt segment.
Below the waterline the strata read straight through the translucent water,
closing what would otherwise look like a set of floating layers.

## Water

- **Seabed**: the terrain continues visibly under the surface — underwater
  vertex colours ramp blue-green with depth, fully tinted at a maximum
  visible depth of 12 m — so the land-to-water line reads under the surface
  exactly as it does above it.
- **Shoreline**: a static foam band draws every coastline where the height is
  within 0.4 m of sea level, and a second, animated band of scrolling foam
  brightens and pulses against it wherever the baked depth is under roughly
  0.8 m.
- **Surface animation**: three scrolling wave/normal layers — two shorter
  ones plus a long, ~35–60 m wavelength chop layer — combine with a
  sine-sum vertex swell (total swell amplitude budget ≤0.35 m) so the
  surface visibly moves at the default RTS camera distance (~600 m).
  Colour is depth-keyed (shallow teal to deep navy) with glancing-angle
  opacity and a broad, two-lobe sun glint tied to the day/night ramp (see
  [lighting.md](lighting.md)).
- **Sky reflection**: an analytic, fresnel-weighted blend of the sky's
  zenith and horizon colours into the water's own colour, fed every frame
  from the same time-of-day ramp — no render pass, no cubemap.
- **Explicit non-goal**: dynamic fluid flow (flowing rivers, a flood
  simulation) is not planned — a heightfield flow model is a performance tar
  pit, and the sea-level model above already covers seas, lakes and dug
  canals.

## Sky, sun and clouds

Three layers sit on top of the day/night ramp described in
[lighting.md](lighting.md):

- **Sky dome**: a gradient dome replaces the flat background colour — deep
  blue at the zenith falling to a pale haze at the horizon — driven by the
  same keyframe ramp as the light (a warm horizon at golden hour and dusk,
  deep navy behind the stars at night). One inverted-sphere shader, no
  textures.
- **Sun disc and glow**: a visible sun billboard (a bright core plus a soft
  glow sprite) sits along the directional light's own direction — warm and
  enlarged near the horizon, white at noon — and swaps to a dim, pale moon
  disc at night. The light itself is unchanged; this is only the visible
  body it was missing.
- **Cumulus clouds, sometimes**: an instanced pool of 20–40 cloud billboards,
  built from 2–3 procedural puff sprites baked once at boot (canvas noise, no
  external assets), vertically squashed with a grey underside gradient for
  the flat-bottomed cumulus look, drifting slowly and tinted by the
  time-of-day ramp (white at noon, orange at dusk, near-invisible at night).
  Coverage itself varies: a slow, seeded noise on the simulation tick
  (roughly a 10-game-day period) sweeps between clear skies and scattered
  cover, without simulating weather.

## Deferred

Planar water reflections (a true mirror render pass) and soft cloud-shadow
blobs drifting with the clouds are both designed for but not built.
[DESIGN.md](../DESIGN.md) owns this backlog and its reasoning.
