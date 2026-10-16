# Tramways — design

- **Status:** Specified 2026-10-16; slice 1 (the street tramway and the tram graph) built 2026-10-16
- **Date:** 2026-10-16

## What the player gets

Two kinds of tramway, each drawn as the thing it is. A **street tramway** —
the Tramway preset, and any road whose trams share its traffic lanes — is a
street: cars drive it, its footways and lamps stay, and its rails lie flush in
the asphalt in a concrete track slab, the way a modern American streetcar
runs. An **elevated guideway** — any road that gives its trams a reservation
of their own — lifts the reservation off the road onto a pair of concrete
beams on columns over the median, the Walt Disney World monorail's form,
clearing the street below as an overpass does; its stops are raised
platforms with a stair and a lift, and it passes over the streets it meets.
And a tram lane composed onto any road, mixed or reserved, is track a tram
line can run on, which today it is not.

## Why it earns its place

The player asked for it (2026-10-16): "it looks like in our screenshots the
rail uses sidewalks and light poles / we need to separate roads from rails
and if the road includes a tram it should be raised tram like disney world."
What read as a railway with sidewalks was the tramway: a street cars share,
drawn with railway sleepers across its whole paving. The dedicated railway
was already separate from roads, with no kerbs or lamps. The player chose
the elevated guideway for a road that carries a tram, and chose that the
shared tramway stays a street "but we need it to look more realistic so it
looks like cars can drive over it or share the road with a tram." A
reservation is the road giving its trams their own lanes, so it is the one
that goes up; mixed running shares the lanes and stays down.

Two lies go with it. Sleepers across asphalt say "railway" to anyone who has
seen a street; a street-running tram's rails are grooved girder rails flush
with the paving, set in a concrete slab. And a road the player composed with
a tram reservation draws rails no tram can use: only the Tramway preset's
own tier joins the tram graph today, so the composition offers a lane that
does nothing — a control not wired to behaviour.

Serves the **city as a system** pillar in [../gdd.md](../gdd.md): the
tramway the player builds is the tramway the trams run on, and the one that
goes over the traffic does not wait at its lights.

## How it works, for the player

**1. A street tramway is a street.** Cars drive it, it carries utilities and
frontage, and the trams share its lanes. Its rails are drawn as a modern
streetcar's are: two grooved rails per track at the standard 1,435 mm gauge,
their heads flush with the surface, in a **concrete track slab** about
2.7 m wide down the lane, lighter than the asphalt either side (Toronto's
track allowance is the outer rails plus 560 mm each side,
[Toronto TS 3.75](https://www.toronto.ca/wp-content/uploads/2025/09/90dc-ecs-specs-roadspecs-TS-3.75-Sep2025.pdf);
Portland's track sits in a visible concrete slab,
[Portland Streetcar standards](https://www.portland.gov/transportation/development/documents/portland-streetcar-development-standards-2025-edition/download)).
No sleepers show. **Overhead contact poles** stand along the kerb, about
10.7 m tall with a 1.9 m bracket arm over the track
([Kansas City](https://www.valmontstructures.com/resources/valmont-structures-product-spotlight/kc-streetcar---kansas-city-mo)),
one every 22 m (El Paso's 420 poles over 29,500 ft and Oklahoma City's 243
over 18,000 ft, [RailWorks](https://www.railworks.com/projects/el-paso-streetcar),
[C3M](https://www.c3mpowersystems.com/oklahoma-city-streetcar)), the wire
itself not drawn, as the game draws no wires. A tramway crosses another
street at grade, straight over the junction, as it does today.

**2. A road with a tram reservation carries it on an elevated guideway.** The
reservation's two tracks leave the carriageway and go up onto **two straddle
beams**, 0.66 m wide and 1.22 m deep, 3.66 m apart centre to centre — the
Walt Disney World and Las Vegas beam and spacing
([Monorail Society, beams](https://monorails.org/tMspages/TPBeams.html),
[WDW](https://monorails.org/tMspages/TPDisney.html)) — on **T-columns** in
the median, one column under both beams as Seattle's carry theirs
([Seattle ALWEG](https://monorails.org/tMspages/TPAlwfo.html)), one every
30 m (the 27–33 m of the Disney spans). The column's crosshead stands 5 m
clear of the road, the overpass clearance the game already uses, and 7 m over
a railway; the beam tops are then 7.2 m up. The road below keeps its footways
and its lamps, and the ground the reservation took becomes a **median** wide
enough for the columns, so a reservation now costs the road a median rather
than two of its lanes. The trams ride the beams, their bodies straddling
them as a monorail's do.

**3. The guideway passes over.** It never meets a street at grade: where its
road meets another the beams run on over the junction and the crossing street
passes under, with no column in the junction box. A guideway turns where its
road turns.

**4. A guideway stop is a raised station.** A tram stop placed on a guideway
road is a pair of **side platforms** at the trams' floor, 0.45 m above the
beam tops (a Bombardier monorail's beam-to-floor,
[Innovia 300](https://monorails.org/tMspages/TPInnovia300.html)), 3 m wide
and 26 m long under a canopy, with a **stair and a lift** down to the
footway at one end, as the elevated stations of the Las Vegas monorail and
Honolulu's Skyline are reached
([Honolulu, Halawa](https://www.honolulu.gov/dts/stations/station-9-halawa-aloha-stadium-station/)).
A street tramway's stop keeps its shelter at the kerb.

**5. The two meet by a ramp.** Where a reserved road joins a street tramway,
the guideway comes down to grade over the reserved road's last five tiles,
7.2 m in 100 m, about 7% — the grade light rail runs to, stated as the
game's own since no monorail figure was found — and its tracks run on into
the street's lanes. So a line may run on both, and a tram depot at grade
fields a guideway line through the ramp.

**6. Every tram lane is track.** A tram lane composed onto any road, mixed or
reserved, joins the tram graph. A tram line can be drawn on it and a tram
depot touching it fields it, which today only the Tramway preset allows.

## What it interacts with

- **The road model** ([../../world-sim/road-model.md](../../world-sim/road-model.md)):
  a reservation's width moves from two lanes to a median; the lane range rule
  that offers the reservation from the town street up stands.
- **Overpasses** ([../../world-sim/overpasses.md](../../world-sim/overpasses.md)):
  the guideway is not an overpass — it runs along its own road's tile, not
  across another at right angles — but it clears what passes under it by the
  overpass figures, and an overpass over a guideway road clears the beams.
- **Transit** ([../../world-sim/transit-model.md](../../world-sim/transit-model.md)):
  the tram graph is built from the profile, not the tier; a tram on a
  guideway is not slowed by the traffic below, so its route time on the
  reservation runs at the reservation's speed.
- **Transport depots** ([transport-depots.md](transport-depots.md)): a tram
  depot touches tram track as before, now any tram lane.
- **Saves:** nothing new is saved. A reservation already saved is a guideway
  on load.

## What it is not

- Not a third kind of road: both tramways are a road's composition, as now.
- Not a wire: no overhead contact wire and no span wires are drawn.
- Not a monorail vehicle: the trams the lines already run ride the beams.
- Not a ramp from a guideway to a railway: rail stays its own network.
