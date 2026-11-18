# Open visual defects

What three reviews of every screenshot the shot tools write found wrong in the game, worst first. A line leaves this list in the change that fixes it. The shot named is the one that shows it, under `tools/` (the folders are not committed; run the tool to see it). A code pointer names where the picture is decided, where that is known. The tools' own faults that are still open are in the last section.

## Major: roads

- An auxiliary lane or a turn bay widens a road about its tile's centre, so the kerb on the other side bends outward by up to 1.6 m: a ramp's merge reads as a dogleg, and the far-side edge line of a ramp's T runs slanted. The road needs drawing from an anchored edge, widening on the lane's side only. `[R-roads-061]` `[R-roads-064]` — `shots-ramps/ramp-merge-above`, `shots-roadmatrix/ramp-tee`
- A sound wall opens for one 20 m tile at every slip road's mouth, as its spec decided; a real barrier overlaps there or follows the slip road, and the spec gives no overlap or end treatment to build one from. `[R-roads-056]` — `shots-soundwalls/walled-far-side`, `ramp-gap`

## Major: transit

- A tram reservation on a free (off-grid) road draws its median but no guideway, columns or beams. `[R-roads-088]` — `shots-bends/tram-90-above`
- An airport's terminal, cargo buildings and tanks are plain bodies; its car park and its garages' roofs hold no cars and its loop road no trees; the international's plot is longer than the camera's furthest view. — `shots-airport/international-airport-landside`

## Major: buildings and lots

- On sloping ground a civic or utility pad shows a dark footing wall along its low side, a storey high at the shore plants, and a drive's apron leaves grass wedges against the footway. `[R-render-034]` — `shots-civic-access/b2-fire-apron-low`, `shots-power/3a-reactor-from-across-the-water`
- At night the former airport's apron takes no night tint, and the landfill's mound and pad dim with the light alone, without the shared tint. — `shots-town/12-landfill-office-night`
- Where a zone has no room for its car park a level-1 office, hotel, mixed-use block or mid-rise still stands on a bare pad and parks at the kerb, and a level-2 hotel on its own 2 × 2 footprint has no garage. `[R-services-040]` — `shots-mixeduse/close-mixed-1`
- A reactor's intake forebay stands at plate height over a sloping beach, and where the shore lies further out than 6 m its crib stops short of the water. — `shots-power/3c-reactor-intake-close`

## Lesser

- Seen once and not since: terrain spiking through the cap of a raised road's dead end, in the frame `shots-roadmatrix/highway-viaduct-end` held before the tools were fixed. The regenerated frame stands clean, and the clipping sweep finds no ground above a deck. `[R-roads-004]`
- A tram depot's lead crosses the footway as a darker strip with no dropped kerb; a rail bend's first sleeper doubles the straight's last; a rail junction's turnouts are 10 m in radius, the tile's limit, and tram turns assume like lanes on both arms. `[R-roads-088]` — `shots-depots/b5-tram-turnout`, `shots-roadmatrix/rail-turn`, `rail-cross`
- A footway's kerb face runs unbroken across a drive and an alley's mouth: no dropped kerb shows there, and a car park's entrance meets the street square, with no return. A crossing has no ramp at a median's opening or a corridor's seam. `[R-roads-074]` `[R-roads-095]` — `shots-conformity/alley-t-twolane-box`, `shots-parking/com-strip-2-above`
- A highway's or a ramp's end cap wraps each edge line round as a half circle that ends loose on the other side, since the carriageway is not centred on the tile. `[R-roads-091]` — `shots-roadmatrix/highway-straight-end`
- A one-way approach paints a through arrow right behind its turn arrow: the run's arrow and the junction's fall on one tile. — `shots-conformity/oneway-x-twolane-box`
- A grid turn tile's white lane dashes are not in phase with the tiles beside it; a local street's turn bay stores 20 m, under the 30 m a left turn is given `[R-roads-093]`.
- Two rail rows laid side by side with joining on connect at every tile and draw as a ladder of rings.
- Street furniture takes no night tint: bus stops, sound walls, lamp poles, power lines and signs read day-bright under the moon. `[R-render-046]`
- Trees are planted in the avenue's 1.2 m median, narrower than a street tree's planting strip, and they stay there on a viaduct's deck. — `shots-bridges/viaduct-side`
- A viaduct's shadow lies detached from it; winter only dulls the trees' leaves a little, so the strip reads Winter over green ground.
- A street's parking lane stands empty beside homes: a home's cars stand only on its drive `[R-render-026]`. — `shots-parking/kerb-both-1`
- Angled and head-in stalls keep one rhythm for the whole street, so a driveway leaves up to a stall's width unmarked beside it; parallel stalls are laid run by run.
- Seen in the player's own screenshot and not reproduced on any road the tools build: a darker, drive-wide patch on the parking lane at a home's drive.
- A building on a curved parcel keeps a 2 m water and sewer lead, short of its wall. — `frontWallSetbackM` in `src/render/massing.ts`

## Reported by the third review, not yet measured

A reviewer saw each of these in two frames or more; none has been checked against the geometry, and some will prove to be the camera.

- Roads: the change from paving to gravel is a 5 m blur that the centre dashes run onto, and the footway ends in a square stub (`shots-conformity/gravel-t-twolane-box`); a bike lane narrows to a sliver at a corner and stops (`shots-roadmatrix/bike-lane-mixCross`); a street tram on a free bend has no wire, poles or lane paint (`shots-bends/tram-street-90-above`); where an avenue becomes a one-way street a yellow edge line runs diagonally over the pavement (`shots-transitions/avenue-to-oneway`).
- Stops and stations: a bus stop's pad and sign on a gravel road stand on grass 3 m from it, and a kerbed shelter's pad lies mostly off the footway (`shots-busstops/gravel-sign-north`, `shots-furniture/close-busstop-poles-top`); a raised tram station's stair tower is a solid block whose stair ends on the verge, and the tram's nose passes through the platform canopy (`shots-tramways/station-junction`, `station-close`).
- Power: a wood pole and its guy stand inside the substation's fence (`shots-powerline/substation-60m`); a buried cable breaks sideways with a gap and stops short of its riser (`shots-underground/cable-underground-street`, `cable-underground-riser`); wires pass through roofs and upper storeys (`shots-curve/2-drive-at-the-bend`, `shots-mixeduse/close-mixed-1`).
- Kits that read as plain boxes: the hospital's four identical faces, the crematorium, the schools' and the college's bare roofs, the rail yard's shed, the enclosed stage of every building site (`shots-healthcare/hospital-street`, `shots-education/c-college-in-the-grid`, `shots-depots/c-rail-yard-track`, `shots-construction/tall-enclosed-street`).
- Kits with parts adrift: garden apartments' stairs are bare planks across windows, with a box in the entry path and no car park (`shots-apartments/close-garden-breezeway`); a fuel station's pumps stand beside its canopy, not under it, and its sign in the aisle (`shots-storefronts/fuel`); a restaurant has a sign wall standing 1 m off the building (`shots-storefronts/close-restaurant-low`); a fence line crosses the solar farm's transformer pad (`shots-power/4c-solar-gate-track-and-skid`).
- Empty ground on a plot: the gas turbine's 12 × 5 tiles round one small building, the depot's and the recovery plant's aprons, the plaza's 160 m of paving, the district park's lawns, building sites of 100 × 60 m (`shots-power/1-gas-turbine-beside-police-station`, `shots-earliest-kits/e-depot-street`, `shots-parks/plaza`, `shots-construction/works-earth-street`).
- A house reaches 1.5 to 3 m past its rear fence, and a fence runs into a corner house's roof (`shots-kerbdrive/two-lane-parallel`, `shots-deadend/culdesac-grown-north-oblique-east`).
- The services panel shows a park load of "worst 2178%" (`shots-education/e-high-school-lens-over-campuses`).

## Shot tools

- None open.
