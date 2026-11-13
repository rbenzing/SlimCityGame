# Open visual defects

What two reviews of every screenshot the shot tools write found wrong in the game, worst first. A line leaves this list in the change that fixes it. The shot named is the one that shows it, under `tools/` (the folders are not committed; run the tool to see it). A code pointer names where the picture is decided, where that is known. The tools' own faults that are still open are in the last section.

## Critical

- Rail draws no rails through a crossing, a junction or a bend, only a ballast box. — `shots-roadmatrix/rail-cross`
- Tram track ends at a bend tile and at a junction box. — `shots-roadmatrix/tram-turn`
- Loose dark slabs lie on the grass both sides of a tram guideway's ramp; a raised station's lift tower hangs above the ground and its stair lands on grass, or at a junction across the carriageway, with a guideway column in the approach lanes. `[R-roads-011]` — `shots-tramways/guideway-ramp`, `station-junction`
- A divided corridor draws its right half's turn bay on the side its lanes leave by; the grid has it where they arrive. `corridor-shots` fails on it. `[R-roads-052]`

## Major: roads

- Bus-lane and bike-lane paint ends square at every junction and bend, and the far side of a T loses the lane. The corner's painted edge arc sits inside the kerb return and leaves a bare wedge, a dead end leaves a bare crescent, and a bus lane takes no stop line. `[R-roads-065]` `[R-roads-046]` — `shots-roadmatrix/bus-lane-tee`, `bus-lane-straight-end`; `cornerRadius` against `kerbReturnFor` in `src/render/roadsmesh.ts`
- An avenue's median is cut square at a bend, ends blunt at a width change and stops flat against the crosswalk at every junction, with no nose, its yellow lines stopping with it; a corridor's median gets a rounded nose. On the grid it is a hairline that becomes a wide strip where a bend's arc begins, one of its lines turning from white to yellow. `[R-roads-065]` — `shots-roadmatrix/avenue-turn`, `shots-conformity/twolane-x-avenue-box`, `shots-bends/grid-avenue-90-above`; `emitAvenueMedian` in `src/render/roadsmesh.ts`, the median ribbon in `src/render/freeroadmesh.ts`
- Where an avenue becomes a one-way road the yellow lines cross, and a white line crosses them. `[R-roads-044]` — `shots-transitions/avenue-to-oneway`
- An alley carries a stop bar and a yellow stub and flares to twice its width; on an avenue it opens the median and takes stop lines, arrows and signals; at a street's dead end its lines run slanted across the whole street. `[R-roads-074]` — `shots-conformity/alley-t-twolane-box`, `alley-t-avenue-box`, `alley-corner-twolane-box`
- A gravel arm funnels into a junction with a crosswalk and a stop line at its mouth, and gravel changes colour tile to tile. `[R-roads-044]` — `shots-roadmatrix/gravel-mixCross`
- A one-way road's flow arrow is painted on the lane line between its two lanes. `[R-roads-069]` — `shots-oneway/arrow-northward`
- A ramp meets its motorway through a dogleg with kinked kerbs and notched corners; at a ramp's T an edge line runs diagonally through the box. At a street a ramp's arm takes crosswalks though it has no footway. `[R-roads-061]` — `shots-ramps/ramp-merge`, `shots-roadmatrix/ramp-tee`, `ramp-mixCross`
- Kerbs and footways step at a width change where they should bend; a gore's chevrons run along both edges of one carriageway. `[R-roads-064]` — `shots-tapers/taper-head`, `gore-close`
- A sound wall ends blunt at a slip road, leaving gaps. `[R-roads-056]` — `shots-soundwalls/walled-far-side`
- A raised deck on a slope stands on dark slabs that miss the ground; the rail truss bridge reads as loose members; a four-lane road at grade carries a dark wall strip along its footway past a bend, and a shaded seam across its lanes. Every viaduct's parapet stops short of the deck's end. `[R-roads-004]` — `shots-roadclip/worst-intrusion`, `shots-bridges/rail-truss-side`, `shots-roadmatrix/four-lane-turn`, `two-lane-viaduct-end`
- At a bend's seam the dashes start again: they touch or overlap on a four-lane road and leave an orphan stub on a two-lane one. `[R-roads-068]` — `shots-bends/four-lane-90-above`; `dashSegments(0, …)` in `drawBend`, `src/render/freeroadmesh.ts`
- A roundabout sits to one side of the crossing it replaces: its arms meet the ring along one edge, not toward its centre. An entry carries no crosswalk, its splitter is a flat wedge with no kerb, the ring has no edge line or lamp of its own, and a one-way arm enters with no yield line. — `shots-roundabouts/fourway-above`, `fourway-entry-close`, `oneway-above`
- Where a slip road leaves a motorway there is no gore paint, and the slip road's lines begin with a kink. The deck over the motorway has no parapet, its yellow lines weave into a diamond, it is dark between its end lamps, and a dark wall face stands between its end and the street. `[R-roads-064]` — `shots-interchanges/gore-close`, `deck-join-close`, `ramp-terminal-close`
- A street's poles and wires ignore what stands there: wires cross a junction through a lamp and at signal height, and a pole stands on a drive's apron, beside a substation's gate and at a bus stop's sign. `[R-render-036]` — `shots-powerline/avenue-junction`, `shots-curve/2-drive-at-the-bend`, `shots-busstops/kerbed-sign-south`
- The ghost of an avenue or a corridor is the same flat slab as a two-lane road's. — `shots-ghost/ghost-avenue-over-two-lane`

## Major: transit

- A bus shelter on a street's south side turns its back to the road; a sign stop shows no sign plate. — `shots-busstops/kerbed-shelter-and-sign-south`
- Tram poles lean and carry no wire; in the tram depot they stand through the parked trams, which stand nose to tail with pantographs overlapping. — `shots-tramways/tramway-rails-detail`, `shots-depots/b2-tram-depot-yard`
- A flat rail yard's lead reaches the main line's ballast and stops, with no rails joining; a tram depot's lead ends square in the carriageway. `[R-roads-082]` — `shots-depots/c4-rail-lead-close`, `b4-tram-lead-close`
- A bus depot's fence runs across its own door, and its buses stand through the fence. — `shots-depots/a2-bus-depot-close`
- A station's platform canopy hides the building, and its ramp stops partway. — `shots-ploppables/b-station-track`
- The airport has no runway. Its terminal is one slab over the middle of the plot, aircraft stand half under its walls, and its car park is an outline on lawn. — `shots-airport/airport-above`

## Major: interface and messages

- Every lens paints its high end red, for good things too: a happy, healthy, well-schooled district reads as an alarm. The legend now says which end is which; the ramp should follow the meaning. — `src/shared/lenses.ts`

## Major: buildings and lots

- On sloping ground a civic or utility pad shows a dark footing wall along its low side, a storey high at the shore plants, and a drive's apron leaves grass wedges against the footway. `[R-render-034]` — `shots-civic-access/b2-fire-apron-low`, `shots-power/3a-reactor-from-across-the-water`
- In a shop's car park two cars share a stall, a tree and a pylon sign stand in stalls, and stalls run to the shopfront and the door with no walk between. At the funeral home's door vehicles stand through each other. — `shots-storefronts/close-fuel`, `close-strip`, `shots-parking/com-market-2-above`, `shots-cemetery/c-hearse-ambulance-car`
- Flare stacks stand alone on open ground; a food plant's stack stands in its car park; steel tanks and pipe poles cross the side drive. — `shots-industry/chem`, `food-heavy-food-2-court`
- The office entrance is a slab two storeys tall, and the tower and the mid-rise share it; neither has a walk from its door to the footway. — `shots-storefronts/office`, `shots-apartments/close-tower-podium`
- A garden walk-up's stair reaches only its lower landing, dark slabs lie on its lawn and no walk or car park reaches the street; a tower's roof plant covers half the roof; its shopfront band and lobby stay dark at night; lit panes are slabs over whole bays. `[R-render-021]` — `shots-apartments/close-garden-breezeway`, `garden-res-medium-3-night`
- A colonial's chimney is a thin post leaning from the ridge to the ground; a car parks through a porch's columns. — `shots-houses/street-colonial-west`
- A row house's roof carries two loose diagonal bars; its stoop stairs stand at the head of its parking bays; a person stands inside a parked car. — `shots-houses/street-attached-west`
- In a park trees stand on a pitch's touchline, a perimeter path has gaps, a grandstand stands over the footway and the road's edge, and a district park's pond is a flat blue rectangle. — `shots-parks/sports`, `district-pond`
- A cemetery's gatehouse is a blank box with trees through its roof; a civic crossing's kerb is not dropped. — `shots-cemetery/b2-cemetery-gatehouse`
- The crematorium is a stack of plain boxes with a door-sized entrance; the hospital's ambulance canopy has no door and its parking deck no ramp. — `shots-healthcare/crematorium-close`, `hospital-entrance-close`
- A garage's top deck runs into the building above it, and a mixed-use block's garage shows no way in from the street. — `shots-parking/com-office-2-rear`, `shots-mixeduse/rear`
- A farm's yard does not meet its dirt road, a strip of grass between. — `shots-industry/close-farm-pasture-2-yard`
- A restaurant's sign bar hangs skewed off its frame, and a black arch stands alone in grass beside it. — `shots-storefronts/close-restaurant`
- A street's light pool ends in a hard edge mid-road at night, and stall paint glows brighter than the buildings; shopfronts and the hospital stay dark. — `shots-storefronts/main-night`, `shots-healthcare/hospital-night`
- A mixed-use block's shopfront is plain glass with a black rectangle for a door, no sign and no awning. — `shots-mixeduse/street`, `close-mixed-1`
- Where a zone has no room for its car park a level-1 office, hotel, mixed-use block or mid-rise still stands on a bare pad and parks at the kerb, and a level-2 hotel on its own 2 × 2 footprint has no garage. `[R-services-040]` — `shots-mixeduse/close-mixed-1`
- A reactor's intake house stands about 6 m back from the water on bare beach; a drain one tile square lies on a 20 m pad. — `shots-power/3c-reactor-intake-close`, `shots-earliest-kits/h-drain-street`

## Lesser

- Seen once and not since: terrain spiking through the cap of a raised road's dead end, in the frame `shots-roadmatrix/highway-viaduct-end` held before the tools were fixed. The regenerated frame stands clean, and the clipping sweep finds no ground above a deck. `[R-roads-004]`
- A green hairline shows between carriageway and footway; footway corners carry notches; kerb arcs are faceted.
- A motorway's gantry carries blank boards where no ramp leaves; dead-end caps carry odd painted arcs; stray dashes lie in lanes.
- Short white stubs lie beside the edge line where a road narrows. — `shots-transitions/fourlane-to-twolane-run`
- A lamp's or a signal arm's shadow lies on the road as a jagged scribble; a vehicle's wheels are near-black boxes. — `shots-furniture/crossroads`
- One two-lane street's broken centre line reads white, not yellow, beside a free curve. — `shots-curve/4b-grid-street-above`
- A tree stands in a median; a boulder lies on a footway; bins stand on the grass.
- A solar farm's transformer hut straddles its fence; a rail yard's shed stands on the railway.
- Ploughed field patches have jagged edges; a house lot carries a skewed lawn wedge.
- A shelter's roof overhangs a gravel road.
- The landfill reads as loose tiles; the neighbourhood park and the plaza are bare.
- A viaduct's shadow lies detached from it; a detached garage is a plain box; winter only dulls the trees' leaves a little, so the strip reads Winter over green ground.
- A street's parking lane stands empty beside homes: a home's cars stand only on its drive `[R-render-026]`. — `shots-parking/kerb-both-1`
- Angled and head-in stalls keep one rhythm for the whole street, so a driveway leaves up to a stall's width unmarked beside it; parallel stalls are laid run by run.
- Seen in the player's own screenshot and not reproduced on any road the tools build: a darker, drive-wide patch on the parking lane at a home's drive.
- A home's water and sewer leads stop short of the house. — `shots-underground/underground-view`

## Shot tools

- Frames that do not show what they are named for: `shots-furniture/manholes-close`, `close-cover-lane`, `pedestal`, `cabinets` and `close-signal-corner`; `shots-powerline/buried-street-above` (no box or riser in frame); `shots-final/01` to `04`; `shots-transit/options-*`; `shots-apartments/roof-garden`; `shots-parking/res-tower-*-above`; `shots-power/3c` and `6b`.
- `bend-shots` shoots no alley, bus-lane, bike-lane, tram, motorway or ramp bend; `nightlook-shots` and `construction-shots` show a clock that does not match their light.
- `corridor-shots` shoots no T onto a corridor nothing divides, so the crossing over its two halves there is unchecked.
