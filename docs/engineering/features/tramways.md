# Tramways — technical design

- **Status:** Specified 2026-10-16; slice 1 built 2026-10-16; slice 2 built 2026-10-19
- **Date:** 2026-10-16
- **Author:** Claude Opus 5.5

Written against
[../../game-design/features/tramways.md](../../game-design/features/tramways.md),
which holds the figures and their sources; this document holds the code.

## What we are building, and why now

Three things, in three slices, at the player's request (2026-10-16):

1. **The street tramway, and every tram lane is track.** Mixed running drawn
   with grooved rails flush in a concrete slab, no sleepers across the
   paving, and contact poles at the kerb; and the tram graph built from the
   tile's profile, so a tram lane composed onto any road is routable.
2. **The elevated guideway.** A reservation's tracks drawn on two beams over
   a median on T-columns, the trams riding them at beam height, the beams
   passing over junctions, the ramp to grade where a reservation meets street
   track, and the width rule that a reservation costs a median.
3. **The raised stations.** A tram stop on a guideway road drawn as side
   platforms with a canopy, a stair and a lift.

## What it touches

| Module                            | Slice | Change                                                                                                                                                              |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/render/roadsmesh.ts`         | 1     | Mixed-running track: two grooved rails per track flush in a 2.7 m concrete slab band in the lane; no sleepers on a tram lane (the railway keeps its sleepers)       |
| `src/render/roadfurniture.ts`     | 1     | Contact poles 10.7 m with a 1.9 m bracket every 22 m along the kerb of a mixed tram road, phase anchored at world-metre zero, clear of junction boxes and driveways |
| `src/world/roadgraph.ts`          | 1     | `tramShape` reads the tile's profile: a tile is tram track when its profile carries a tram lane (mixed or reserved), not only `isTramTier`                          |
| `src/shared/roadprofile.ts`       | 1     | `carriesTram`, `isTramTrack(tier, profile)` and `isTramTile(roads, i, custom)`; `tramCrossingAxes` in `types.ts` takes roads classified by them                     |
| `src/sim/depots.ts`, worker gate  | 1     | The tram depot's adjacency reads `isTramTile`                                                                                                                       |
| `src/shared/roadprofile.ts`       | 2     | A tram piece is 1.2 m, so the reservation is a 2.4 m median; `laneCount` skips tram pieces; `carriesGuideway`; the guideway track price                             |
| `src/render/guideway.ts` (new)    | 2     | Beams, columns, the ramp, on the `bridges.ts` pattern; beam segments, stems and crossheads each one instanced pool                                                  |
| `src/render/roadsmesh.ts`         | 2     | A reservation draws as a raised median, with no slab or rails; no tram crossing slab across a junction box the guideway spans                                       |
| `src/sim/worker.entry.ts`, tools  | 2     | No overpass across a guideway, no guideway under one                                                                                                                |
| `src/render/transit.ts`           | 2     | A tram on a guideway tile rides the beam at height; down the ramp it follows the ramp's grade                                                                       |
| `src/render/transit.ts`, stations | 3     | A guideway stop draws platforms, canopy, stair and lift instead of the kerb shelter                                                                                 |
| Docs                              | each  | GROUND-TRUTHS, road-model, streets, transit-model, overpasses, in the slice that changes them                                                                       |

**Save format: no.** The profile already stores the tram choice per tile.
**Worker protocol: no.**

## The design

### Slice 1: the street tramway

- **Track.** Per tram lane, a concrete slab band 2.7 m wide centred on the
  lane, a shade lighter than the asphalt; in it two rails 0.056 m wide (the
  59R2 head) at ±0.7175 m (half the 1,435 mm gauge), their tops 0.004 m above
  the slab, dark steel, with a 0.042 m groove line beside each head drawn as
  a darker strip; no sleepers. Over a tram crossing the slab and rails run on
  across the junction box as the rails do today. The dedicated railway keeps
  its sleepers and ballast unchanged.
- **Poles.** Along each kerb of a mixed tram road, a pole 10.7 m tall, 0.25 m
  across, with a bracket arm 1.9 m out over the carriageway at 6.0 m (the
  19 ft contact wire of the DC and Portland standards, rounded up to clear
  the arm), every 22 m along the road, phase anchored at world-metre zero so
  poles line up across tiles, never in a junction box or across a driveway,
  and alternating sides on a two-way road so one stands every 22 m on one
  side or the other. One instanced pole and one instanced arm. They replace
  the street lamp only where they would stand within 2 m of one; the lamp
  rule stands otherwise.
- **The tram graph.** `tramShape` asks whether the tile's profile carries a
  tram lane (`lanes.some(l => l.kind === 'tram' || l.tram)`), through the
  same profile lookup the road mesh uses; the Tramway preset still answers
  yes. `tramCrossingAxes` and the depot adjacency read the same predicate.
  A tram line drawn on a composed road now routes; one drawn across a mixed
  road and a reserved one routes over both until slice 2 lifts the
  reservation.
- **Tests:** the slab and rails per tram lane and no sleepers; the railway's
  sleepers unchanged; poles at 22 m, never in a junction box, on the right
  side; a composed mixed and a composed reserved road are tram track, a plain
  street is not; a tram line on a composed road routes and draws trams; a
  depot touching a composed tram road fields it; tram crossings unchanged.
- **Shots:** a mixed tramway at the default pitch with a car and a tram in
  the same lane, from the street and close; a composed reserved road at
  grade (until slice 2); night.

### Slice 2: the elevated guideway

- **The data stays.** A reservation is still the profile's two `tram`
  pieces, one each way, so a saved reservation loads as a guideway and the
  tram graph, `editsOf` and `isTramTrack` read it as before. What changes is
  what the pieces are on the ground: the column line, not running lanes.
- **Width.** `DEFAULT_PIECE_WIDTHS.tram` goes from 3.5 m to 1.2 m, so the
  two pieces lay a 2.4 m median in the reservation's place. `laneCount` stops
  counting `tram` pieces, since nothing drives on them, so the class's lane
  range is the general lanes alone. A road gives up a median for a guideway,
  not two of its lanes. A reservation saved at the old width keeps that width,
  as every saved piece does.
- **Price.** A reserved track is priced at the aerial guideway's cost against
  street track: `GUIDEWAY_TRACK_PRICE`, the street tram track's figure times
  the FTA ratio of aerial structure to at-grade guideway (the figure and its
  source are in the design document).
- **Structure** (`src/render/guideway.ts`, all instanced boxes on the
  `bridges.ts` pattern: beam segments, stems, crossheads). Beams 0.66 × 1.22 m
  at ±1.83 m from the median's centre. They sit on a crosshead 1.0 m deep
  whose underside is 5 m above the road surface (`OVERPASS_CLEARANCE_M`), so
  the beam soffits are at 6.0 m and the tops at 7.22 m. A guideway road on a
  deck stands its columns on the deck, since the height is read from the road
  surface; a road over a railway is already on a deck, so no 7 m case
  arises. T-columns stand in the median every 30 m along the run, phase
  anchored at world-metre zero, on straight tiles only, never in a junction
  box or on a turn. The beams run on over junctions and turn where the road
  turns, along the median's centre.
- **Crossings.** Where a reservation crosses a street that is not tram track
  (the tram crossing of slice 1, `tramCrossingAxes`), the beams span the one
  or two street tiles at their own height and nothing is drawn at grade there:
  no slab and no rails across the junction box, no column in it.
- **Ramp.** Each guideway tile's distance from at-grade tram track (a mixed
  tram tile) is counted in tiles along the guideway, by breadth-first search.
  The beam top at a tile edge is 7.22 m × min(1, d ÷ 5), where d is the lesser
  distance of the two tiles that edge joins, so the five tiles next to a
  street tramway descend linearly to the road and the beams meet slice 1's
  slab. Columns shorten with the beams and are not drawn where the crosshead
  would stand less than 0.5 m clear of the road. A reservation shorter than
  ten tiles between two street tramways peaks below full height; that is
  stated, not refused.
- **The road below.** The road mesh draws a reservation's span as a raised
  median (the avenue median's kerb and grass), with no slab and no rails, and
  the markings give it a median's yellow edge lines. Its lamps stand as for a
  median. A crossing is spanned only where the track at both ends is a
  guideway; one with a street tramway at either end stays at grade, and the
  guideway ramps down to it.
- **Overpasses.** A beam 6 to 7.22 m up cannot pass under a deck 5 m up, so
  the worker refuses an overpass across a guideway tile ("An overpass can't
  cross a guideway"), a guideway laid under an existing overpass ("A guideway
  can't pass under an overpass"), and a reservation composed onto a tile with
  an overpass above it. The tool's preview gives the same refusal.
- **Trams** on a guideway tile ride the right-hand beam (the beam at
  +1.83 m on the side the tram keeps to), with the floor at beam top +
  0.45 m and the body straddling the beam, following the ramp's grade.
  `TransitRenderer` takes a guideway sampler from the guideway renderer.
- **Ground truths** in the same change: "tram track is a street" holds for
  mixed running; a reservation is a guideway above its street, passing over
  the streets it crosses and never at grade; a tram reservation costs a
  median, not a lane; no overpass crosses a guideway.

### Slice 3: the raised stations

A stop on a reserved tile: two side platforms 3 m wide and 26 m long at the
trams' floor outside the beams, a canopy over each, a stair and a lift tower
from one platform end to the footway, lit panes on the stations' material.
The kerb shelter is not drawn there.

## What could go wrong

- **The tram graph grows.** Every composed tram road joins it, so lines that
  failed to route may start routing; a save with a reservation drawn as
  decoration gains track. That is the fix; the transit test holds it.
- **Poles and lamps crowd the kerb.** The pole replaces a lamp within 2 m;
  the shot is the check.
- **The ramp needs five tiles.** A reservation shorter than ten tiles that
  meets street track at both ends cannot reach full height; it peaks lower,
  and a street crossing under that low span is drawn under beams that clear
  it by less than 5 m. That is a known limit of the slice, stated in the
  road model.
- **A city with overpasses over its reservations.** A save with an overpass
  across a reserved tile loads with the beams through the deck; the refusal
  stops new ones. The slice does not rewrite saved roads.
- **Draw calls.** Beams are merged per chunk with the roads, columns one
  instanced pool; the frame tool is run before and after slice 2.

## How we will know it works

Each slice's tests above, the gate, and its shots looked at: the street
tramway reads as a street a car and a tram share; the guideway reads as a
monorail over a street that keeps its traffic; the station reads as one.

## Out of scope

Overhead wires, span wires, a monorail vehicle, a guideway over a railway
line's own tiles, a guideway joining a railway, grade separation of a street
tramway.
