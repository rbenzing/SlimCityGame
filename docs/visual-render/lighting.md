# Day/night cycle and lighting

The night look is three deterministic layers — patterns seeded by building or
instance id, zero per-frame randomness — plus the bloom pass that ties them
together. This file is its own document because it cuts across every other
one: it governs how buildings ([../art/buildings.md](../art/buildings.md)), streets and
lamps ([../art/streets.md](../art/streets.md), [../art/props-and-vehicles.md](../art/props-and-vehicles.md))
and the sky ([vegetation.md](vegetation.md)) all look at any given moment.

## Sky and light ramp

A single keyframed ramp drives everything: day (a warm sun, a light-blue
sky) → golden hour (a low warm sun, an orange horizon) → dusk (violet) →
night (a deep navy `#0a1224`, star points on a static shader/point layer, a
blue moon-directional light, fog colour following the sky). The hemisphere
light and the shadow intensity both lerp along the same ramp, and the sky
dome, sun/moon disc and cloud tinting in [vegetation.md](vegetation.md) all
read from it too. Once the sun is under the horizon the directional light is
the moon, and over the dusk ramp it slews from where the sun set to the noon
sun's own place overhead (`moonDirection`, `moonBlend` in `scene.ts`): lit
from where noon lit them, a roof, a wall and a slope each keep the same share
of their day value at night, whichever way a building faces. The night
keyframe is the moon at `sunIntensity` 0.55 in `[0.6, 0.7, 1.0]` and the
hemisphere at `hemiIntensity` 0.5 with sky `[0.49, 0.55, 0.78]` over ground
`[0.06, 0.07, 0.1]`, shadows at 0.2; the dusk keyframe matches those
strengths in a violet hue (sky `[0.56, 0.53, 0.73]`, shadows 0.3), because
03:00 is lerped halfway from night toward dusk and a dusk darker than night
would drag the small hours under the legibility floor below.

## Emissive building windows

The window grid described in [../art/buildings.md](../art/buildings.md) carries a
per-archetype procedural emissive on the same instanced material used for
its day-side glass tint. A hash of the building id and window index decides
each window's lit threshold, so roughly 40–70% of a building's windows are
lit at once, warm `#ffd9a0` with the occasional cool `#cfe4ff`. Windows
switch on progressively across dusk — the lit threshold sweeps with the
night factor rather than popping all at once, so the whole city "wakes up"
over roughly 20 seconds. A lit pane keeps its colour: `WINDOW_EMISSIVE_STRENGTH`
(1.5) is set so that a lit pane's pixel at full night reads warm, never
clipped to white under the renderer's neutral tone mapping, and the bloom
pass below gives it its halo rather than the strength doing so. A pane is
window-sized against the art anchors — on a house 1 m wide and 1.5 m tall
(`HOUSE_PANE_WIDTH_M`, `HOUSE_PANE_HEIGHT_M`), one to a bay every 2.4 m
(`HOUSE_BAY_M`), its margins worked out in metres from the body the house
kit sizes — so a lit window is a pane in a wall, never a slab across a
storey; a house has no storefront band, its ground floor is cut like the
floors above, and the kit's shutters stand on the same pane. A shop's
storefront glazing is the exception to the hash: every bay of it is lit from
inside, warm, from `STOREFRONT_LIT_FROM` (0.3) of the dusk sweep, with the
floors above following the per-window hash, which is what tells a shop from
an office at night. It is still glass, not a slab: the storefront is cut into
bays of about 1.5 m (`STOREFRONT_BAY_M`) by 0.12 m dark mullions
(`STOREFRONT_MULLION_M`) over a 0.6 m dark bulkhead (`STOREFRONT_BULKHEAD_M`,
the same figure the kit's bulkhead part stands) under a 0.3 m head
(`STOREFRONT_HEAD_M`) — `storefrontCut` in `facade.ts`, the parts
[../art/buildings.md](../art/buildings.md) gives a storefront — so a lit
shopfront at 40 m reads as a row of lit windows under a sign band, and the
sign band glows in its own livery colour above it.

**A building stays legible at night, and the night stays night.** A body at
full night reads at 18 to 30% of its noon brightness, measured on a facade
pixel in the harness — a shaded version of its true daytime colour, not
black, and not a dull afternoon either. The night sky's hemisphere and moon
light and one cool tint (`NIGHT_TINT` `[0.55, 0.6, 0.78]` in
`src/render/nightlook.ts`) deliver that together and are tuned as one, since
each on its own would dim the scene twice over. The tint is one shared
constant that **every sunlit
surface reads** — bodies and every kit part (walls, roof, garage, porch,
dock, plant, prop) through `nightTintNode`/`nightBodyMaterial`, and the
terrain, the roads, the lots' ground, the park plates and the trees alike —
so the whole world dims on the one dial and the ground reads no brighter than
the bodies: at full night the ground sits at 12 to 25% of its noon
brightness, and the bright things are the lit panes, the lit parts and the
lamps' pools. The sky dome stays the keyframe's navy and the fog follows it.
`tools/nightlook-shots.mjs` is the measurement: a colonial and a shop shot
from one pinned camera at noon, 03:00 and midnight, a wall, a shutter, a
roof, a lawn and a road pixel read back from each, failing on a body outside
18–30%, ground outside 12–25%, or a pane that clips or is not warm. The
share is of the light on the surface — the pixel taken back through sRGB and
the neutral tone mapping's toe — because the toe spreads one and the same
share across display values by how dark the surface is (a navy wall shows
9% where a lawn shows 33% of the same light); as tuned, a wall, a shutter
and a shop wall keep 20–22% and a roof, a lawn and the road 18–19% at 03:00.
Only window panes and the lit parts below glow; a garage door, a porch, a
roof or a wall never does. A farmhouse, drawn by the farm kit rather than on
the facade material, lights its panes by the same hash and threshold
([../engineering/features/farms.md](../engineering/features/farms.md)). An Abandoned building's windows stay dark
regardless of the hour — a lit window is the one signal that a building is
Active (see [../art/buildings.md](../art/buildings.md)). The whole system runs as one TSL
node material plus an instance-index hash, one material per archetype
family, at zero extra draw calls.

The commercial kit's lit parts (sign bands and storefront bands, the pylon
and price-sign faces, the supermarket tower's glazing and the office lobby
portal) follow the window rule: they stand only on an Active building, their
emissive is driven by the night factor, and like a pane they keep their
colour rather than clipping to white — a lit part glows in its own livery
colour, warm-shifted (`LIT_WARM_SHIFT` `[1, 0.88, 0.7]` times the instance
colour), so a white band reads cream and a red one red, never a flat white
slab. An industrial building lights few windows — the factory's clerestory
and the warehouse's office corner — but carries a wall-pack over each dock
door and each walk door (`dockLight`, on the lit material), the small warm
block a real yard reads by at night. A car park has no lot lights to glow:
the lot kit stands no poles.

## Street lamps

A lamp's glow at night comes entirely from a hot luminaire and a ground
pool — there is no light-cone beam volume over the road. Two emitters fade
together on the lamp schedule below:

- The **housing** (cap and cowl) ramps its emissive to
  `HOUSING_EMISSIVE_STRENGTH` (3.2 — past a lit window's own strength, so the
  fixture itself blooms).
- A **lens** — a warm sphere seated in the cowl's mouth, offset along the
  housing's own tilted-down axis so it stays seated however the lamp is
  oriented — ramps to `LENS_EMISSIVE_STRENGTH` (14). The lens is the
  over-threshold core the bloom pass smears into a halo; the housing is the
  supporting glow around it. Because bloom is a blur of the thresholded
  frame, emitter AREA matters as much as intensity: the lens is sized to
  roughly the cowl's own width (`LENS_RADIUS` 0.26 m) — at a pinprick size
  the halo stays invisible at play zoom no matter how hot it burns. Both are
  near-black by day; neither is a real point light, and the lens casts no
  shadow.

Bloom alone cannot brighten pavement that has no brightness of its own, so
each lamp additionally lays warm light on the pavement beneath it — an
additive, non-depth-writing ground pool (`POOL_MAX_OPACITY` 0.55, a
sodium-warm `POOL_COLOR`) fading on the same schedule. Three properties keep
it reading as light on a street rather than a painted shape:

- **Elliptical, aligned down the roadway** (`POOL_RADIUS` 4.5 m ×
  `POOL_ALONG_SCALE` 3 along the road × `POOL_ACROSS_SCALE` 1 across it) — a
  real cantilever luminaire throws a long oval down the road; equal-radius
  circles read as isolated puddles with dark road between them.
- **Brightness from per-vertex colour on concentric rings**
  (`POOL_RINGS`): a hot point decaying steeply and trailing to zero at the
  rim, so the pool never shows a hard edge against ground it can't quite
  match.
- **Terrain-conforming** — every vertex samples the real ground height,
  because one flat disc at a single Y would slice through a road running
  across a slope. This is the one lamp layer that is NOT instanced: a single
  merged mesh is rebuilt with the lamp set and disposed on each rebuild. It
  is also the lamp's single largest bright area, and so its widest bloom
  source.

**Spacing**: a lamp stands every 2 tiles (40 m), alternating sides of the
street for a staggered arrangement — close enough that successive pools
light a continuous corridor down the road.

**Bloom pass tuning**: `BLOOM_RADIUS` is 0.9 (up from 0.4) for a wider,
softer spread on every night light in the scene. `BLOOM_NIGHT_STRENGTH`
stays at 0.25 — a lamp's glow is bought with a brighter, larger emitter
rather than a stronger pass, which would blow out windows that already
read correctly. Strength scales with the night factor, so none of this
affects daylight.

**Lamp schedule**: lamps do not follow the raw night factor, which never
reaches zero until noon. Instead a dedicated ramp, keyed to the status-strip
clock, runs the lamps: full on from 19:30 through 06:00, ramping up from
sunset (18:00 → 19:30), and fading out over the hour after sunrise to fully
off at 07:00 — then off through the day.

Cosmetic vehicles carry their own, much simpler night lights — warm
headlight-emissive quads at the front and red taillights at the rear,
switched on by the same night-factor threshold (see
[../art/props-and-vehicles.md](../art/props-and-vehicles.md) for the vehicle kit itself).

## Clock and morning boot

Visual time of day runs on its own constant, `VISUAL_DAY_TICKS` — about 2
real minutes per full day/night cycle at 1× speed — decoupled from the
calendar day used for simulation ticks; coupling them directly would strobe
day and night every 10 seconds. The status-strip clock displays visual time;
the calendar date advances on simulation days instead.

Tick 0 reads as **09:00**, not midnight: a fresh city that booted into a
fully night-factor sky would be a near-black screen with every placed model
invisible. A single shared constant, `CLOCK_START_OFFSET_TICKS =
round(VISUAL_DAY_TICKS × 9/24)`, is added to the tick everywhere visual time
is derived — both the lighting rig and the status-strip clock — so the
displayed clock and the lighting always agree. It is a pure display shift:
simulation ticks, saves and the calendar are untouched.

## Shadows and grounding

Every small element that stands in the world casts and receives a shadow so
it reads as grounded: lamps, bus-stop shelters, pedestrians, cosmetic and
service vehicles, trees, buildings, and every instanced prop pool (house,
utility and park kits) cast; terrain and water receive. An InstancedMesh
casts as a single draw call regardless of instance count, so this costs
nothing extra per instance.

Road and parking-apron surfaces render with a lit (Lambert) material rather
than an unlit one specifically so they can receive a cast shadow — the
pavement geometry gained computed vertex normals for this, and stays
single-sided. Daylight reads almost exactly as before, since road faces are
flat and evenly lit, but the surface now takes real shading and shadows from
the sun, cars and lamps; the night-factor dim from the ramp above still
layers on top of that lighting rather than replacing it. The sun's own
shadow camera is a focused span of about 360 m that follows the camera
target, at roughly 0.35 m per shadow-map texel — fine enough to resolve lamp
poles and other small props.

## Sky, sun and clouds

Three layers sit on top of the day/night ramp above:

- **Sky dome**: a gradient dome replaces the flat background colour — deep blue
  at the zenith falling to a pale haze at the horizon — driven by the same
  keyframe ramp as the light (a warm horizon at golden hour and dusk, deep navy
  behind the stars at night). One inverted sphere, no textures.
- **Sun disc and glow**: a visible sun billboard (a bright core plus a soft glow
  sprite) sits along the directional light's own direction — warm and enlarged
  near the horizon, white at noon — and swaps to a dim, pale moon disc at
  night. The light itself is unchanged; this is only the visible body it was
  missing.
- **Cumulus clouds, sometimes**: an instanced pool of 20–40 cloud billboards,
  built from 2–3 procedural puff sprites baked once at boot (canvas noise, no
  external assets), vertically squashed with a grey underside gradient for the
  flat-bottomed cumulus look, drifting slowly and tinted by the time-of-day
  ramp (white at noon, orange at dusk, near-invisible at night). Coverage
  itself varies: a slow, seeded noise on the simulation tick (roughly a
  10-game-day period) sweeps between clear skies and scattered cover — without
  simulating weather, which does not exist. See
  [../world-sim/environmental-simulation.md](../world-sim/environmental-simulation.md).

Soft cloud-shadow blobs drifting with the clouds are designed for but not
built; [../DESIGN.md](../DESIGN.md) owns that backlog.

## An honest approximation, not a limitation

None of this is real-time ray or path tracing: tracing a full interactive
city at 60 fps in a browser is not a realistic target, and this system does
not claim to do it. The perceptual goals a "night lighting" request is
really asking for are delivered instead through cheap, instanced or
post-process techniques: each lamp's own hot luminaire and ground pool
(above), a bloom/glow pass across every emissive surface — windows, lamps,
vehicle lights — so lit sources bleed softly at night, and a tuned,
already-dynamic shadow-mapped sun and moon. This is a deliberate
approximation, not a gap to close later.
