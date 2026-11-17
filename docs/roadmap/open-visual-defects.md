# Open visual defects

What two reviews of every screenshot the shot tools write found wrong in the game, worst first. A line leaves this list in the change that fixes it. The shot named is the one that shows it, under `tools/` (the folders are not committed; run the tool to see it). A code pointer names where the picture is decided, where that is known. The tools' own faults that are still open are in the last section.

## Major: roads

- An auxiliary lane or a turn bay widens a road about its tile's centre, so the kerb on the other side bends outward by up to 1.6 m: a ramp's merge reads as a dogleg, and the far-side edge line of a ramp's T runs slanted. The road needs drawing from an anchored edge, widening on the lane's side only. `[R-roads-061]` `[R-roads-064]` — `shots-ramps/ramp-merge-above`, `shots-roadmatrix/ramp-tee`
- A sound wall opens for one 20 m tile at every slip road's mouth, as its spec decided; a real barrier overlaps there or follows the slip road, and the spec gives no overlap or end treatment to build one from. `[R-roads-056]` — `shots-soundwalls/walled-far-side`, `ramp-gap`
- At an exit's gore the slip road is about 1.1 m wide between its lines at the nose, opening to full width a tile on; an entrance ramp's merge carries no channelizing lines. `[R-roads-089]` — `shots-interchanges/gore-close`

## Major: transit

- The airport has no runway. Its terminal is one slab over the middle of the plot, aircraft stand half under its walls, and its car park is an outline on lawn. — `shots-airport/airport-above`

## Major: buildings and lots

- On sloping ground a civic or utility pad shows a dark footing wall along its low side, a storey high at the shore plants, and a drive's apron leaves grass wedges against the footway. `[R-render-034]` — `shots-civic-access/b2-fire-apron-low`, `shots-power/3a-reactor-from-across-the-water`
- A chemical plant's bund wall runs 2 m past its paved tank farm onto lawn, and the food plant and the steelworks have no paved yard, so their yard parts stand on lawn; the paper mill's 60 m recovery stack is a plain pole. — `shots-industry/chem`, `paper`
- A street's light pool ends in a hard edge mid-road at night, and stall paint glows brighter than the buildings; shopfronts and the hospital stay dark. — `shots-storefronts/main-night`, `shots-healthcare/hospital-night`
- Where a zone has no room for its car park a level-1 office, hotel, mixed-use block or mid-rise still stands on a bare pad and parks at the kerb, and a level-2 hotel on its own 2 × 2 footprint has no garage. `[R-services-040]` — `shots-mixeduse/close-mixed-1`
- A reactor's intake forebay stands at plate height over a sloping beach, and where the shore lies further out than 6 m its crib stops short of the water. — `shots-power/3c-reactor-intake-close`

## Lesser

- Seen once and not since: terrain spiking through the cap of a raised road's dead end, in the frame `shots-roadmatrix/highway-viaduct-end` held before the tools were fixed. The regenerated frame stands clean, and the clipping sweep finds no ground above a deck. `[R-roads-004]`
- A green hairline shows between carriageway and footway; footway corners carry notches.
- A two-lane road's centre line stays broken through a sharp bend, where MUTCD 3B.03 marks no passing with a solid line, and a short bend paints no dash at all, a gap of about 20 m. `[R-roads-068]` — `shots-bends/two-lane-90-above`
- A tram depot's lead crosses the footway as a darker strip with no dropped kerb; a rail bend's first sleeper doubles the straight's last; a rail junction's turnouts are 10 m in radius, the tile's limit, and tram turns assume like lanes on both arms. `[R-roads-088]` — `shots-depots/b5-tram-turnout`, `shots-roadmatrix/rail-turn`, `rail-cross`
- Where two bike-lane extensions meet at a crossroads corner their marks crowd into a small L. — `shots-roadmatrix/bike-lane-cross`
- At a gravel road's mouth the street's kerb return ends about 0.7 m short of the gravel's edge, leaving a sliver of asphalt; an alley's mouth draws no dropped kerb across the footway. `[R-roads-074]` — `shots-conformity/gravel-t-twolane-box`, `alley-t-twolane-box`
- A motorway's gantry carries blank boards where no ramp leaves; dead-end caps carry odd painted arcs; stray dashes lie in lanes.
- A lamp's or a signal arm's shadow lies on the road as a jagged scribble; a vehicle's wheels are near-black boxes. — `shots-furniture/crossroads`
- Trees are planted in the avenue's 1.2 m median, narrower than a street tree's planting strip; a boulder lies on a footway; bins stand on the grass.
- A solar farm's transformer hut straddles its fence.
- Ploughed field patches have jagged edges; a house lot carries a skewed lawn wedge.
- The landfill reads as loose tiles; a sports ground's stand and a park's shelter are plain grey blocks.
- A viaduct's shadow lies detached from it; a detached garage is a plain box; winter only dulls the trees' leaves a little, so the strip reads Winter over green ground.
- A street's parking lane stands empty beside homes: a home's cars stand only on its drive `[R-render-026]`. — `shots-parking/kerb-both-1`
- Angled and head-in stalls keep one rhythm for the whole street, so a driveway leaves up to a stall's width unmarked beside it; parallel stalls are laid run by run.
- Seen in the player's own screenshot and not reproduced on any road the tools build: a darker, drive-wide patch on the parking lane at a home's drive.
- A home's water and sewer leads stop short of the house. — `shots-underground/underground-view`

## Shot tools

- Frames that do not show what they are named for: `shots-furniture/manholes-close`, `close-cover-lane`, `pedestal`, `cabinets` and `close-signal-corner`; `shots-powerline/buried-street-above` (no box or riser in frame); `shots-final/01` to `04`; `shots-transit/options-*`; `shots-apartments/roof-garden`; `shots-parking/res-tower-*-above`; `shots-power/3c` and `6b`.
- `deadend-shots` places no homes on its free (off-grid) dead end, and shoots no avenue's dead end.
- `bend-shots` shoots no alley, bus-lane, bike-lane, tram, motorway or ramp bend; `nightlook-shots` and `construction-shots` show a clock that does not match their light.
