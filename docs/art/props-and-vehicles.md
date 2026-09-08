# Props and vehicles

The vehicle kit, parked cars, landmark ploppables, utility and service
silhouettes, and the street furniture and lamp kit. Night emissive and glow
treatments (headlights, taillights, the lamp's own light) are described fully
in [lighting.md](lighting.md); this file covers the models themselves.

## Vehicle kit

Vehicles are multi-part merged geometry, still one InstancedMesh per kind —
no draw-call growth:

- **Construction**: a merged BufferGeometry of 3 parts per kind — a body
  slab, a darker inset cabin/window mass (`#1a1f26`), and wheel cylinders. A
  region-mask vertex attribute lets the per-instance colour tint ONLY the
  body vertices; windows and wheels keep their fixed colours.
- **Kind mapping**: Car picks a sedan, wagon or hatchback silhouette by a
  slot-index hash; Truck picks a box-truck or pickup variant; Bus is a long
  body with a window band. Every variant is a geometry offset inside its
  kind's merged mesh, chosen deterministically.
- **Palette**: a curated ~10-colour saturated list (red, blue, teal, green,
  magenta, pink, yellow, orange, white, charcoal) picked by a slot hash — a
  deliberate saturation contrast against the desaturated city in
  [buildings.md](buildings.md). Yellow reads as a taxi without needing a
  separate livery.
- **Heading**: a vehicle's mesh has its nose at +Z, so its facing yaw is
  `atan2(dx, dz)` — a car's long axis always aligns with the direction it is
  actually travelling.
- **Lane position**: a cosmetic vehicle is offset perpendicular to its travel
  direction into its own right-hand lane, by a tier-derived half-lane, so
  opposing flows separate onto the carriageway instead of overlapping on the
  centre paint.
- **No wheel spin** — imperceptible at RTS zoom, skipped deliberately.

**Service liveries.** Fire, Police, Ambulance and Garbage vehicles carry a
fixed, baked livery per kind rather than the randomized civilian palette
above, built from the same body + cabin-band + wheel-box parts:

- **Fire** — red body, red roof light-bar, the largest of the four bodies.
- **Police** — blue body, blue roof light-bar, sedan-sized.
- **Ambulance** — white body, the same red light-bar as fire, plus a small
  red-cross accent on the roof in front of the bar.
- **Garbage** — municipal green body, no light-bar; instead a raised rear
  hopper/compactor box in a darker green over the back ~40% of the body, plus
  a small amber beacon.

All four share the dark cabin/window band and simple wheel boxes from the
civilian kit's construction above.

## Parked cars and lot life

Static parked cars are an occupancy signal, not decoration:

- **Placement**: along an Active building's road-facing edge, inset 0.3 tile
  from it and spaced roughly every 0.45 tile. Count is the building's level
  plus one, capped by the edge's capacity. Constructing and Abandoned
  buildings park zero cars — an empty lot is legible sim state, matching the
  dark-window rule for abandonment in [buildings.md](buildings.md).
- **Look**: simple two-box cars (body plus cabin) in the vehicle kit's
  saturated palette, picked by a hash of the building id and stall index,
  standing on a near-white stall-line strip quad — the parking-lot read.
  Industrial lots park box trucks instead of cars, at a scaled-up
  ~2.4×2.4×7 m, using the same parked-vehicle silhouette; commercial lots
  park cars. Homes never street-park — see the garage/driveway kit in
  [buildings.md](buildings.md).
- **Orientation**: a stall is parallel street parking — the car's long axis
  runs along the road, not perpendicular to it — the standard read for a car
  actually parked at a kerb or in a row.
- **A car stands on its own lot, or at the kerb, never both.** Where a
  building's own frontage doesn't serve its parking (no bay row, no garage),
  its cars park at the kerb instead: past the verge and the sidewalk and half
  a car into the carriageway, parallel, with no apron and no painted bay,
  since the road itself is already paved. Kerbside cars, like the lamps and
  signs in [streets.md](streets.md), never stand on a tile with road on both
  axes.

## Landmark ploppables

The **airport** is a large-footprint (~8×6 tile) landmark, not a functional
transit system: a terminal slab with rooftop monitor boxes, a control tower,
an apron ground plate with taxiway striping, 2–3 static parked planes at jet
bridges (props, exactly like the trees in [nature.md](nature.md) — no flight
simulation), and a row of parked cars at the entrance in the style above.
More landmarks (a stadium, an observatory) are planned to reuse the same
landmark-mesh path.

## Utility and service silhouettes

A ploppable whose real-world silhouette IS its identity gets its own detail
kit — merged low-poly geometry, deterministic from the instance id — instead
of the generic building facade box:

- **Wind turbine**: a tapered mast, a nacelle, and a 3-blade rotor that spins
  slowly (a deterministic phase per instance), in pale bone-white.
- **Water tower**: 4 splayed legs, a banded cylindrical tank, a domed cap.
- **Coal plant**: a dark boiler hall, 2 striped smokestacks in the industrial
  chimney language from [buildings.md](buildings.md), and a coal-heap wedge.
- **Small park**: a flat lawn plate, a cross-shaped walking path, 2–3 trees,
  and benches, replacing a plain slab.
- Everything else — police, fire, clinic, school, and every zoned-growth
  building — keeps the standard facade system, because those genuinely are
  buildings.

For a kit-owned catalog entry, the building instancer draws a low plinth
(about 8% of the catalog height, a plain desaturated slab with no window
shader) beneath the kit instead of a full facade box, so the kit carries the
visual identity while selection and outline still land on the right
footprint. Kit parts stay unlit at night, except a small red beacon on the
wind turbine's nacelle.

**The landfill** renders as an operated facility rather than a tint. Its
office tile — the area's street-adjacent entrance — carries a gatehouse kit:
a terrain-conforming concrete yard pad, a small office box with a roof cap
and a street-facing door, a two-bay striped nose-in parking row, and a yard
light with a glowing head, laid out in a road-facing frame so it fits its
tile at any orientation. Every other tile in the area is dumping ground: a
tint plus a pile that scales with how full it is. The renderer is always
visible — a facility, not a data lens the player has to switch on.

## Street furniture and lamp kit

- **Bus-stop shelter**: a roof canopy on 2 posts, a bench, and a stop
  sign/pole — low-poly, instanced, deterministic per stop.
- **Pedestrians**: cosmetic low-poly people, a few idling at each shelter and
  a sparse scatter walking the sidewalks near Active buildings — instanced,
  deterministic, with a slow walk-cycle offset. Idling people cluster around
  the shelter's own ground anchor on the sidewalk, matching how far the
  shelter itself sits from the carriageway, rather than around the stop's
  road-tile centre. A walker's path is a loop stretched hard along the street
  it fronts and kept narrow across it — an equal-radius loop reads as
  orbiting the building, not walking a street — and it stays a loop rather
  than a there-and-back path so the turn at each end stays smooth; which way
  "along" the street points is read from the road tile itself, so a corner
  lot's walker still follows the street it is actually standing on. Lamps
  skip any tile a driveway crosses, so a lamp never ends up standing in the
  kerb cut cars drive through.
- **Lamp model**: a tapered pole, an arm bracket, and a real modeled lamp
  housing, not a bare box. The pole itself renders a mid charcoal (`0x50555d`)
  rather than a near-black — a tone that dark sits below the point where
  Lambert shading reads at all, and a slim pole disappears into a flat dark
  line at that colour — so the lighter charcoal still takes visible sun
  shading and reads as painted metal. Poles alternate sides of the street.
  See [lighting.md](lighting.md) for the glow the housing itself carries at
  night, the spacing between poles, and the night schedule.

## Deferred

Headlight cones and their ground pools stay deferred (see
[lighting.md](lighting.md) for the lamp's own ground pool, which is
unrelated and already ships). A taxi still reads only from the plain yellow
civilian palette above — no separate roof sign has been built for it — and
no aerial ladder has been built for the fire truck. [DESIGN.md](../DESIGN.md)
owns this backlog and its reasoning.
