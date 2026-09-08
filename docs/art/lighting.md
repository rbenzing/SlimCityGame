# Day/night cycle and lighting

The night look is three deterministic layers — patterns seeded by building or
instance id, zero per-frame randomness — plus the bloom pass that ties them
together. This file is its own document because it cuts across every other
one: it governs how buildings ([buildings.md](buildings.md)), streets and
lamps ([streets.md](streets.md), [props-and-vehicles.md](props-and-vehicles.md))
and the sky ([nature.md](nature.md)) all look at any given moment.

## Sky and light ramp

A single keyframed ramp drives everything: day (a warm sun, a light-blue
sky) → golden hour (a low warm sun, an orange horizon) → dusk (violet) →
night (a deep navy `#0a1224`, star points on a static shader/point layer, a
dim blue moon-directional light at ~8% intensity, fog colour following the
sky). The hemisphere light and the shadow intensity both lerp along the same
ramp, and the sky dome, sun/moon disc and cloud tinting in
[nature.md](nature.md) all read from it too.

## Emissive building windows

The window grid described in [buildings.md](buildings.md) carries a
per-archetype procedural emissive on the same instanced material used for
its day-side glass tint. A hash of the building id and window index decides
each window's lit threshold, so roughly 40–70% of a building's windows are
lit at once, warm `#ffd9a0` with the occasional cool `#cfe4ff`. Windows
switch on progressively across dusk — the lit threshold sweeps with the
night factor rather than popping all at once, so the whole city "wakes up"
over roughly 20 seconds. `WINDOW_EMISSIVE_STRENGTH` (2.2) pushes this hard
enough to drive the bloom pass below.

A building's base wall colour also multiplies toward a dimmed, cool tint at
night (`NIGHT_BODY_TINT`, roughly 34/38/46% of the daytime colour) — a
shaded version of its true daytime colour, not black, so walls stay
colour-legible after dark while the windows keep their own emissive glow
independently of the wall tint. An Abandoned building's windows stay dark
regardless of the hour — a lit window is the one signal that a building is
Active (see [buildings.md](buildings.md)). The whole system runs as one TSL
node material plus an instance-index hash, one material per archetype
family, at zero extra draw calls.

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

**Spacing**: a lamp stands every 2 tiles (32 m), alternating sides of the
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
[props-and-vehicles.md](props-and-vehicles.md) for the vehicle kit itself).

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
