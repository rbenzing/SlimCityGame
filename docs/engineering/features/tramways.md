# Tramways — technical design

- **Status:** Specified 2026-10-16; slice 1 built 2026-10-16
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
| `src/shared/roadprofile.ts`       | 2     | `reserved` builds a median for the columns and keeps the general lanes; the width budget and its tests move                                                         |
| `src/render/guideway.ts` (new)    | 2     | Beams, columns, the ramp, on the `bridges.ts` pier pattern; instanced columns, beams as merged geometry per chunk                                                   |
| `src/render/transit.ts`           | 2     | A tram on a guideway tile rides at beam height; down the ramp it follows the ramp's grade                                                                           |
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

- **Width.** `reserved` lays a median the columns' width plus their
  clearance, 2.4 m, in the reservation's place and keeps the class's general
  lanes; the "costs two general lanes" rule and its tests become "costs a
  median".
- **Structure.** Beams 0.66 × 1.22 m at ±1.83 m from the median's centre,
  their soffits on a crosshead whose underside is 5 m above the road (7 m
  where the tile crosses a railway), so the beam tops are at 7.22 m; T-columns
  in the median every 30 m, phase anchored at world-metre zero, never in a
  junction box; beams continuous over junctions and turns along the road's
  centreline.
- **Ramp.** On the five reserved tiles before a tile whose tram lanes are
  mixed, the beam tops descend linearly from 7.22 m to the road, the columns
  shortening with them, the last tile's beams meeting the slab of slice 1.
- **Trams** on a reserved tile ride at beam top + 0.45 m, straddling the
  beam (the car body's skirt below the floor), following the ramp's grade.
- **Ground truths** in the same change: "tram track is a street" becomes
  true of mixed running only; a reservation is a guideway that passes over
  and never crosses at grade; the reserved-lane width rule.

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
- **The ramp needs five tiles.** A reservation shorter than five tiles that
  meets street track at both ends cannot rise and fall; it stays at grade
  (drawn as slice 1's slab) and the road tool's hint says why.
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
