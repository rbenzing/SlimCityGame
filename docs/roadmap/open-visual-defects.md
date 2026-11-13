# Open visual defects

What a review of every screenshot the shot tools write found wrong in the game, worst first. A line leaves this list in the change that fixes it. The shot named is the one that shows it, under `tools/` (the folders are not committed; run the tool to see it). The tools' own faults are not here: they were fixed with the review.

## Critical

- Roofs, back fences, sound walls, trampolines, bus tops and shop canopies render near-black in daylight. The shingle colours are the roofs' cause: charcoal reads about (9, 11, 13) at noon, and `nightlook-shots` fails on it. `[R-render-020]` — `shots-town/04b-tram-crossing`, `shots-soundwalls/walled-oblique`
- Rail draws no rails through a crossing, a junction or a bend, only a ballast box. — `shots-roadmatrix/rail-cross`
- Tram track ends at a bend tile and at a junction box. — `shots-roadmatrix/tram-turn`
- Loose dark slabs lie on the grass both sides of a tram guideway's ramp; a raised station's lift tower hangs above the ground and its stair lands on grass. `[R-roads-011]` — `shots-tramways/guideway-ramp`, `station-junction`
- A divided corridor draws its right half's turn bay on the side its lanes leave by; the grid has it where they arrive. `corridor-shots` fails on it. `[R-roads-052]`

## Major: roads

- Bus-lane and bike-lane paint ends square at every junction and bend, and the far side of a T loses the lane. `[R-roads-065]` `[R-roads-046]` — `shots-roadmatrix/bus-lane-tee`
- An avenue's median is cut square at a bend and ends blunt at a width change, its yellow lines stopping short of it. `[R-roads-065]` — `shots-roadmatrix/avenue-turn`, `shots-transitions/avenue-to-twolane`
- Where an avenue becomes a one-way road the yellow lines cross, and a white line crosses them. `[R-roads-044]` — `shots-transitions/avenue-to-oneway`
- An alley carries a stop bar and a yellow stub and flares to twice its width; on an avenue it opens the median and takes stop lines, arrows and signals; at a street's dead end its lines run slanted across the whole street. `[R-roads-074]` — `shots-conformity/alley-t-twolane-box`, `alley-t-avenue-box`, `alley-corner-twolane-box`
- A gravel arm funnels into a junction with a crosswalk and a stop line at its mouth, and gravel changes colour tile to tile. `[R-roads-044]` — `shots-roadmatrix/gravel-mixCross`
- A one-way road's flow arrow is painted on the lane line between its two lanes. `[R-roads-069]` — `shots-oneway/arrow-northward`
- A ramp meets its motorway through a dogleg with kinked kerbs and notched corners; at a ramp's T an edge line runs diagonally through the box. `[R-roads-061]` — `shots-ramps/ramp-merge`, `shots-roadmatrix/ramp-tee`
- Kerbs and footways step at a width change where they should bend; a gore's chevrons run along both edges of one carriageway. `[R-roads-064]` — `shots-tapers/taper-head`, `gore-close`
- A sound wall ends blunt at a slip road, leaving gaps. `[R-roads-056]` — `shots-soundwalls/walled-far-side`
- A raised deck on a slope stands on dark slabs that miss the ground; the rail truss bridge reads as loose members; a four-lane road at grade carries a dark wall strip along its footway past a bend, and a shaded seam across its lanes. `[R-roads-004]` — `shots-roadclip/worst-intrusion`, `shots-bridges/rail-truss-side`, `shots-roadmatrix/four-lane-turn`
- Crosswalk ladders overlap inside a tram junction; a one-way arm carries turn arrows and no stop line. — `shots-roadmatrix/tram-cross`, `one-way-mixCross`
- A roundabout sits to one side of the crossing it replaces: its arms meet the ring along one edge, not toward its centre. An entry carries no crosswalk, and the ring has no lamp of its own. — `shots-roundabouts/fourway-above`, `fourway-night`
- Where a slip road leaves a motorway there is no gore paint, and the slip road's lines begin with a kink; the deck over the motorway is dark between its end lamps. `[R-roads-064]` — `shots-interchanges/gore-close`, `diamond-night`

## Major: transit

- A bus shelter on a street's south side turns its back to the road; a sign stop shows no sign plate. — `shots-busstops/kerbed-shelter-and-sign-south`
- Tram poles lean and carry no wire; in the tram depot they stand through the parked trams. — `shots-tramways/tramway-rails-detail`, `shots-depots/b2-tram-depot-yard`
- A bus depot's fence runs across its own door, and its buses stand through the fence. — `shots-depots/a2-bus-depot-close`
- The airport has no runway. Its terminal is one slab over the middle of the plot, aircraft stand half under its walls, and its car park is an outline on lawn. — `shots-airport/airport-above`
- A police car carries no light bar and reads as a plain blue car. An incident's pin stands over the back yard, not the building, and an answered pin differs from an open one only in colour. — `shots-servicevehicles/close-police`, `incident-pins`

## Major: interface and messages

- The Transit Lines panel gives a line that asks for no vehicles "0 of 0 vehicles, every 0.0 min", and a short tram line a headway of 0.1 minutes. — `src/ui/TransitLinesPanel.tsx`
- The advisor writes "a elementary school" and the panel "1 riders"; the advisor tells the player to build a school that is still locked. — `shots-playthrough/09-advisor-gravel`
- The city panel reads "POWER 0/0 MW" in a town its turbine powers. — `shots-playthrough/53-panel-city-info`
- A lens shows no legend or scale with its picker open, and a lens with nothing to show is blank without saying so. — `shots-playthrough/33-lens-land-value`
- The junction panel's lanes section runs under the toolbar; the Services panel cuts a label to "Educa…" and wraps its parks line to five. — `shots-playthrough/14-junction-panel`, `18-services`
- The help panel numbers the toolbar's categories 1 to 7; the toolbar shows fourteen.
- The interface has no layout for a narrow window: at 480 px wide the dock's left cluster lies over its category buttons, which cannot be clicked. — `tools/viewexit-shots.mjs` checks at 768 px for that reason

## Major: buildings and lots

- A building under construction is a low dark slab with no progress cue: nothing shows what is going up or how far it has got, and a house reads as a black hole in its lot. — `shots-construction/house-street`
- Flare stacks stand alone on open ground; a food plant's stack stands in its car park; steel tanks and pipe poles cross the side drive. — `shots-industry/chem`, `food-heavy-food-2-court`
- The office entrance is a slab two storeys tall. — `shots-storefronts/office`
- A garden walk-up's stair reaches only its lower landing; a tower's roof plant covers half the roof; its shopfront band and lobby stay dark at night; lit panes are slabs over whole bays. `[R-render-021]` — `shots-apartments/close-garden-breezeway`, `garden-res-medium-3-night`
- A colonial's chimney is a thin post leaning from the ridge to the ground; a car parks through a porch's columns. — `shots-houses/street-colonial-west`
- A row house's roof carries two loose diagonal bars; its stoop stairs stand at the head of its parking bays; a person stands inside a parked car. — `shots-houses/street-attached-west`
- In a park trees stand on a pitch's touchline, and a perimeter path has gaps. — `shots-parks/sports`
- A cemetery's gatehouse is a blank box; a civic crossing's kerb is not dropped. — `shots-cemetery/b-cemetery-pedestrian-scale`
- A restaurant's sign bar hangs skewed off its frame, and a black arch stands alone in grass beside it. — `shots-storefronts/close-restaurant`
- A street's light pool ends in a hard edge mid-road at night, and stall paint glows brighter than the buildings. — `shots-storefronts/main-night`
- A refused bridge or raised road says only that it cannot be built there.
- A mixed-use block's shopfront is plain glass with a black rectangle for a door, no sign and no awning. — `shots-mixeduse/street`, `close-mixed-1`
- Where a zone has no room for its car park a level-1 office, hotel, mixed-use block or mid-rise still stands on a bare pad and parks at the kerb, and a level-2 hotel on its own 2 × 2 footprint has no garage. `[R-services-040]` — `shots-mixeduse/close-mixed-1`
- A reactor's intake house stands about 6 m back from the water on bare beach; a drain one tile square lies on a 20 m pad. — `shots-power/3c-reactor-intake-close`, `shots-earliest-kits/h-drain-street`

## Lesser

- Seen once and not since: terrain spiking through the cap of a raised road's dead end, in the frame `shots-roadmatrix/highway-viaduct-end` held before the tools were fixed. The regenerated frame stands clean, and the clipping sweep finds no ground above a deck. `[R-roads-004]`
- A green hairline shows between carriageway and footway; footway corners carry notches; kerb arcs are faceted.
- A motorway's gantry carries blank boards where no ramp leaves; dead-end caps carry odd painted arcs; stray dashes lie in lanes.
- A tree stands in a median; a boulder lies on a footway; bins stand on the grass.
- A solar farm's transformer hut straddles its fence; a rail yard's shed stands on the railway.
- Ploughed field patches have jagged edges; a house lot carries a skewed lawn wedge.
- A shelter's roof overhangs a gravel road.
- The landfill reads as loose tiles; the neighbourhood park and the plaza are bare.
- A viaduct's shadow lies detached from it; a detached garage is a plain box; the season reads Winter over green ground.
- A street's parking lane is painted with stalls and stands empty beside homes. — `shots-parking/kerb-parking-close`
- A home's water and sewer leads stop short of the house; the water lens and the sewer lens draw the same picture. — `shots-underground/underground-view`, `lens-sewered`
