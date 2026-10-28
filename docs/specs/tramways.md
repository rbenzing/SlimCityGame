# Tramways

- **Status:** Built

**Owns:** how a street tramway is drawn and routed, how a tram reservation becomes an elevated guideway with raised stations, and why every composed tram lane is track.

**Rules:**

- Treat a tram lane composed onto any road, mixed or reserved, as tram track read from the tile's profile, never the tier alone. [R-roads-007]
- Keep mixed running at grade; lift a reservation onto two beams over a 2.4 m median, passing over every street it crosses and never meeting one at grade. [R-roads-008]
- Charge a reservation a median, not a lane; price a guideway track at 2.25 times a street track. [R-roads-043]
- Draw a street tramway's track as grooved rails flush in a 2.7 m concrete slab with no sleepers, and stand contact poles every 22 m at the kerb. [R-roads-013]
- Cross a street straight over the junction at grade; a guideway's beams span it overhead. [R-roads-014]
- Draw a stop on a full-height guideway tile as a raised station, derived every rebuild and never saved; no shelter, lamp or pole under it. [R-roads-011]
- Refuse an overpass across a guideway and a guideway under an overpass. [R-roads-012]
- Ramp a guideway to grade over the five tiles next to a street tramway so a line may run on both.

**Numbers:**

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| rail gauge | 1,435 | mm | standard gauge |
| rail head width (59R2) | 0.056 | m | dial |
| rail offset from lane centre | ±0.7175 | m | half the gauge |
| rail top above slab | 0.004 | m | dial |
| groove strip beside each head | 0.042 | m | dial |
| track slab width | 2.7 | m | [Toronto TS 3.75](https://www.toronto.ca/wp-content/uploads/2025/09/90dc-ecs-specs-roadspecs-TS-3.75-Sep2025.pdf): outer rails plus 560 mm each side; [Portland Streetcar standards](https://www.portland.gov/transportation/development/documents/portland-streetcar-development-standards-2025-edition/download) |
| track allowance beyond outer rails | 560 | mm | Toronto TS 3.75 |
| contact pole height | 10.7 | m | [Kansas City](https://www.valmontstructures.com/resources/valmont-structures-product-spotlight/kc-streetcar---kansas-city-mo) |
| pole bracket arm | 1.9 | m | Kansas City |
| bracket height | 6.0 | m | 19 ft contact wire (DC and Portland standards) rounded up |
| pole thickness | 0.25 | m | dial |
| pole spacing | 22 | m | El Paso 420 poles over 29,500 ft, [RailWorks](https://www.railworks.com/projects/el-paso-streetcar); Oklahoma City 243 over 18,000 ft, [C3M](https://www.c3mpowersystems.com/oklahoma-city-streetcar) |
| pole replaces a lamp within | 2 | m | dial |
| beam width | 0.66 | m | [Monorail Society, beams](https://monorails.org/tMspages/TPBeams.html) |
| beam depth | 1.22 | m | Monorail Society, beams |
| beam spacing, centre to centre | 3.66 | m | [WDW](https://monorails.org/tMspages/TPDisney.html) |
| beam offset from median centre | ±1.83 | m | half the spacing |
| T-column spacing | 30 | m | 90 to 110 ft girders, columns about 110 ft apart, [Disney](https://disneygeek.com/news/releases/2014/2014_05_01_monorail.php); one column under both beams as [Seattle ALWEG](https://monorails.org/tMspages/TPAlwfo.html) |
| crosshead underside above road (`OVERPASS_CLEARANCE_M`) | 5 | m | the game's overpass clearance |
| crosshead depth | 1.0 | m | dial |
| beam soffit | 6.0 | m | clearance plus crosshead |
| beam top | 7.2 (7.22) | m | clearance + crosshead + beam depth |
| median width (`DEFAULT_PIECE_WIDTHS.tram` 1.2 each, was 3.5) | 2.4 | m | dial; two tram pieces |
| column stem | 0.9 (36 in) | m | [Seattle Monorail Plan](https://www.monorails.org/pdfs/Seattle%20Monorail%20Plan.pdf); no built system states its own |
| clearance, stem to kerb face | 0.75 each side | m | between 1.5 ft minimum and 3 ft at intersections, [VDOT Appendix A2](https://www.vdot.virginia.gov/media/vdotvirginiagov/doing-business/technical-guidance-and-support/location-and-design/traffic-design/Appendix_a2_acc09142023_PM.pdf), after the AASHTO Roadside Design Guide |
| elevated vs at-grade light rail cost | 2 to 2.5 | ratio | [Flyvbjerg, Bruzelius & van Wee 2008](https://journals.open.tudelft.nl/ejtir/article/view/3327), EJTIR 8(1), Table 6 |
| `GUIDEWAY_TRACK_PRICE` | 2.25 | x street track | midpoint of the range above |
| guideway upkeep | 1 | x street track | no source gave a ratio |
| ramp length | 5 | tiles | dial |
| ramp rise | 7.2 in 100 | m, about 7% | grade light rail runs to; no monorail figure found |
| minimum crosshead clearance to draw a column | 0.5 | m | dial |
| reservation length that reaches full height | 10 | tiles | two ramps of five |
| platform floor above beam top | 0.45 | m | [Innovia 300](https://monorails.org/tMspages/TPInnovia300.html) |
| platform width | 3 | m | dial |
| platform length | 26 | m | dial |
| platform thickness | 0.25 | m | dial |
| platform inner edge from guideway centre | ±3.2 | m | clears a 2.6 m car straddling a beam at ±1.83 m |
| canopy thickness | 0.15 | m | dial |
| canopy height above platform | 2.7 | m | dial |
| canopy overhang | 0.3 | m | dial |
| canopy post | 0.15 | m square | dial |
| canopy post spacing | 6.5 | m | dial |
| stair width | 1.5 | m | dial |
| stair slope | 32 | degrees | dial |
| stair run | about 12 | m | from 7.67 m up |
| lift tower | 2.4 | m square | dial |

**Code:**

- `src/shared/roadprofile.ts` `carriesTram`, `isTramTrack`, `isTramTile`, `carriesGuideway`, `laneCount`, `DEFAULT_PIECE_WIDTHS`, `GUIDEWAY_TRACK_PRICE` — tram profile predicates, median width, guideway price.
- `src/shared/types.ts` `tramCrossingAxes` (`types.ts`) — tram crossings over roads classified by the profile predicates.
- `src/world/roadgraph.ts` `tramShape` — the tram graph read from the tile's profile.
- `src/sim/depots.ts`, worker gate — tram depot adjacency reads `isTramTile`.
- `src/render/roadsmesh.ts` `emitStreetTrack` — slab and rails; a reservation as a raised median with no slab or rails; no crossing slab under a spanned junction.
- `src/render/roadfurniture.ts` `computeTramPolePlacements` — contact poles and arms.
- `src/render/guideway.ts` `computeGuideway`, `GuidewayRenderer.beamTopAt` — beams, stems, crossheads, ramp, beam height; `guideway.ts` is the `bridges.ts` pattern.
- `src/render/tramstations.ts` `computeTramStations`, `TramStationRenderer` — platforms, canopies, stair, lift, sign.
- `src/render/transit.ts` `TransitRenderer.apply` — trams ride the beam; `isStation(x, z)` beside `hasStopBuilding` suppresses the kerb shelter.
- `src/main.ts` `keepOff` (`main.ts`) — lamps and poles stay off the stop and landing tiles.
- `src/sim/worker.entry.ts`, tools preview — the overpass and guideway refusals.
- `tools/tramway-shots.mjs` — the screenshots that judge the look.

**Tests:**

- `src/render/guideway.test.ts` — beam and column geometry, ramp, crossings, `beamTopAt`.
- `src/render/tramstations.test.ts` — platforms, canopies, stair and lift, shortening, ramp and street-tramway stops, `keepOff`.
- `src/render/roadsmesh.test.ts` — slab and rails per tram lane, no sleepers, railway sleepers unchanged.
- `src/render/roadfurniture.test.ts` — poles at 22 m, never in a junction box, on the right side.
- `src/shared/roadprofile.test.ts` — composed mixed and reserved roads are tram track, a plain street is not; median width, lane count, price.
- `src/sim/depots.test.ts` — a depot touching a composed tram road fields it.
- Transit tests — a tram line on a composed road routes and draws trams; tram crossings unchanged.
- `src/tools/tools.test.ts` — the overpass-across-guideway preview refusal.

**Open:** none.

## Why the rules are what they are

### Two tramways, each drawn as itself

- **Street tramway.** The Tramway preset, and any road whose trams share its lanes, is a street: cars drive it, footways and lamps stay.
- **Elevated guideway.** Any road giving its trams a reservation lifts it onto two concrete beams on columns over the median, the Walt Disney World monorail's form.
- **Every tram lane is track.** A tram lane composed onto any road, mixed or reserved, is track a tram line can run on.
- **Why the split.** A reservation is the road giving trams their own lanes, so it goes up. Mixed running shares lanes and stays down.
- **Why now.** Sleepers across asphalt read as a railway to anyone who has seen a street. A street-running tram's rails are grooved girder rails flush with the paving.
- **Why every lane.** Only the Tramway preset's tier joined the tram graph, so a composed reservation offered a lane that did nothing. That is a control not wired to behaviour.
- **The pillar.** The tramway the player builds is the tramway the trams run on, and the one over the traffic does not wait at its lights.
- **The dedicated railway.** It was already separate from roads, with no kerbs or lamps, and keeps its sleepers and ballast.

### The street tramway

- **Track.** Per tram lane, a slab band centred on the lane, a shade lighter than the asphalt. Two dark-steel grooved rails per track sit at the gauge, flush with the surface; the groove is a darker strip.
- **Slab width.** Toronto's allowance is the outer rails plus 560 mm each side; Portland's track sits in a visible concrete slab.
- **No sleepers show.** Only the railway has them.
- **Crossings.** A tramway crosses another street at grade, straight over the junction; slab and rails run on across the junction box.
- **Poles.** Along each kerb of a mixed tram road stands a pole with a bracket arm out over the carriageway.
- **Pole phase.** Phase is anchored at world-metre zero so poles line up across tiles.
- **Pole placement.** Never in a junction box or across a driveway; alternate sides on a two-way road so one stands every 22 m on one side or the other.
- **Pole instancing.** One instanced pole and one instanced arm.
- **Wire.** The wire is not drawn, as the game draws no wires.
- **Lamps.** A pole replaces the street lamp only where it would stand within 2 m of one; the lamp rule stands otherwise.
- **Bracket height.** The 19 ft contact wire of the DC and Portland standards, rounded up to clear the arm.

### The tram graph

- **Profile, not tier.** `isTramTier` alone no longer decides; `tramShape` asks whether the tile's profile carries a tram lane, through the same lookup the road mesh uses. The Tramway preset still answers yes.
- **One predicate.** `tramCrossingAxes` and the depot adjacency read the same predicate.
- **A tram depot** touches tram track as before, now any tram lane, and fields a guideway line through the ramp.
- **Graph growth.** Every composed tram road joins the graph, so lines that failed to route may start routing, and a save with a decorative reservation gains track. That is the fix.
- **Transit.** The tram graph is built from the profile, not the tier. A tram on a guideway is not slowed by traffic below, so its route time runs at the reservation's speed.

### The guideway

- **The data stays.** A reservation is still the profile's two `tram` pieces, one each way, so a saved reservation loads as a guideway, and the tram graph, `editsOf` and `isTramTrack` read it as before. Nothing new is saved.
- **Structure.** Beams, stems and crossheads are instanced boxes on the `bridges.ts` pattern, one pool each. The trams' bodies straddle the beams as a monorail's do.
- **Columns.** One T-column under both beams, as Seattle's carry theirs, stands in the median. Columns are phased from world-metre zero, on straight tiles only, never in a junction box or on a turn.
- **Clearance.** The crosshead underside stands 5 m clear, the overpass clearance the game uses; soffits are at 6.0 m and tops at 7.22 m.
- **On a deck.** A guideway road on a deck or an overpass stands its columns on the deck, since height is read from the road surface. A road over a railway is already on a deck, so no 7 m case arises.
- **Stem and kerb gap.** The 0.9 m stem is Seattle's 36 in; 0.75 m each side sits between the 1.5 ft minimum lateral offset from a curb and the 3 ft at intersections.
- **Route.** The beams run on over junctions and turn where the road turns, along the median's centre.
- **The road below.** It keeps its footways and lamps. The reservation draws as a raised median, with the avenue median's kerb and grass, no slab or rails, and the median's yellow edge lines. Lamps stand as for a median.
- **Median, not lanes.** The ground the reservation took becomes a median. The width goes from two lanes to a median, and `laneCount` skips `tram` pieces since nothing drives on them. A small street once refused a reservation as a bigger road may now carry one.
- **Old saves.** A reservation saved at the old width keeps that width, as every saved piece does.
- **Cost.** Elevated light rail costs 2 to 2.5 times at grade, so a guideway track is priced at the 2.25 midpoint.
- **Upkeep.** The street track's, since no source gave a ratio.
- **Trams.** On a guideway tile a tram rides the right-hand beam, the one on the side it keeps to. Its floor is at beam top plus 0.45 m, following the ramp's grade.
- **Sampler.** `TransitRenderer` takes a guideway sampler from the guideway renderer.

### Passing over, and the overpass refusal

- **Never at grade.** Where a guideway's road meets another, the beams run on over the junction and the crossing street passes under, with no column in the box.
- **Spanned crossings.** Where a reservation crosses a street that is not tram track, the beams span the one or two street tiles at their own height. Nothing is drawn at grade there: no slab, no rails across the box.
- **Only guideway to guideway.** A crossing is spanned only where the track at both ends is a guideway. With a street tramway at either end it stays at grade, and the guideway ramps down to it.
- **Overpasses.** The guideway is not an overpass: it runs along its own road's tile, not across another at right angles. It clears what passes under it by the overpass figure.
- **Refusal.** An overpass deck 5 m up would cut through beams 6 to 7.22 m up. The worker refuses an overpass across a guideway ("An overpass can't cross a guideway"), a guideway under one ("A guideway can't pass under an overpass"), and a reservation composed onto a tile with an overpass above. The tool's preview gives the same refusal.
- **Saves.** A save with an overpass over a reserved tile loads with the beams through the deck; the refusal stops new ones and no saved road is rewritten.

### The ramp where guideway meets street tramway

- **Distance.** Each guideway tile's distance from at-grade tram track (a mixed tram tile) is counted in tiles along the guideway, by breadth-first search.
- **Height.** The beam top at a tile edge is 7.22 m times min(1, d ÷ 5), where d is the lesser distance of the two tiles that edge joins. The five tiles next to a street tramway descend linearly and the beams meet the street slab.
- **Grade.** 7.2 m in 100 m, about 7%, the grade light rail runs to, stated as the game's own since no monorail figure was found.
- **Columns** shorten with the beams and are not drawn where the crosshead would stand less than 0.5 m clear of the road.
- **Short reservations.** One shorter than ten tiles between two street tramways peaks below full height. A street crossing under that low span passes under beams clearing it by less than 5 m. This is stated in the road model, not refused.
- **So** a line may run on both.

### The raised station

- **Which stops.** A stop whose tile carries a guideway (`carriesGuideway` on the drawn profile), with beams at full height across the tile, is a station. Not a ramp tile, not the tile a ramp ends on.
- **Other stops.** One on a ramp tile, a junction box or a turn draws neither station nor kerb shelter; the sim serves it as before.
- **Derived.** The station comes from the stop and the road every rebuild, as shelters do. A street tramway's stop keeps its kerb shelter.
- **Form.** Side platforms at the trams' floor, 0.45 m above the beam tops, as a Bombardier monorail's beam-to-floor. A canopy covers each, with a stair and a lift down to the footway as at Las Vegas and [Honolulu, Halawa](https://www.honolulu.gov/dts/stations/station-9-halawa-aloha-stadium-station/).
- **Along the run.** The platform is centred on the stop tile and shortened to the straight guideway run available through the neighbours, never shorter than the tile.
- **Across the run.** The inner edge stands clear of a car body straddling a beam. Canopy posts stand at the outer edge; lit panes are on the stations' material.
- **Stair and lift.** At each platform's low-coordinate end a stair descends along the run to the footway, drawn as one sloped box with a closed stringer face. Beside it a lift tower runs from the footway to the canopy with a glazed pane on its road face in the shelter's glass colour.
- **Landing.** Both land on the tile past the platform end, at the kerb line where the road has no footway.
- **Sign.** The shelters' sign board in the line's colour hangs from the canopy edge at the platform's centre.
- **Heights** come from `beamTopAt` (the mean of the tile's beam ends at its centre, null off the guideway) and the ground from `roadSurfaceAt`.
- **The street below.** It keeps its kerb furniture. Lamps and tram poles keep off the stop and landing tiles, and no shelter stands under a station.
- **Dwell.** Trams do not dwell; the station is the stop's picture, as the shelter is.

### What it interacts with

- **Road model** ([road-model](../world-sim/road-model/README.md)): a reservation's tracks stop counting against the class's lane range.
- **Overpasses** ([overpasses.md](../world-sim/overpasses.md)): see the refusal above.
- **Transit** ([transit-model.md](../world-sim/transit-model.md)): the graph is built from the profile.
- **Transport depots** ([transport-depots.md](transport-depots.md)): a depot touches any tram lane.
- **Streets art** ([streets.md](../art/streets/README.md)): what the drawn result looks like.
- **Truths** ([roads](../truths/roads-transit.md)): the rules above.
- **Saves and worker protocol:** neither changes; the profile already stores the tram choice per tile.
- **Pillar:** city as a system ([gdd.md](../game-design/gdd.md)).

## Decided

- The elevated form goes to the reservation, not mixed running: a road giving trams their own lanes goes up, a shared road stays down.
- The shared tramway stays a street that looks like cars can drive over it, not a railway with sidewalks.
- Not a third kind of road: both tramways are a road's composition.
- Not drawn: overhead contact wire and span wires.
- Not a monorail vehicle: the trams the lines already run ride the beams.
- Not a ramp from a guideway to a railway: rail stays its own network, and a guideway never runs over a railway line's own tiles.
- Not built: grade separation of a street tramway.
- Guideway upkeep equals the street track's, since no source gave a ratio.
