# Open visual defects

What two reviews of every screenshot the shot tools write found wrong in the game, worst first. A line leaves this list in the change that fixes it. The shot named is the one that shows it, under `tools/` (the folders are not committed; run the tool to see it). A code pointer names where the picture is decided, where that is known. The tools' own faults that are still open are in the last section.

## Major: roads

- An auxiliary lane or a turn bay widens a road about its tile's centre, so the kerb on the other side bends outward by up to 1.6 m: a ramp's merge reads as a dogleg, and the far-side edge line of a ramp's T runs slanted. The road needs drawing from an anchored edge, widening on the lane's side only. `[R-roads-061]` `[R-roads-064]` — `shots-ramps/ramp-merge-above`, `shots-roadmatrix/ramp-tee`
- A sound wall opens for one 20 m tile at every slip road's mouth, as its spec decided; a real barrier overlaps there or follows the slip road, and the spec gives no overlap or end treatment to build one from. `[R-roads-056]` — `shots-soundwalls/walled-far-side`, `ramp-gap`

## Major: transit

- A tram reservation on a free (off-grid) road draws no track: two yellow lines with bare asphalt between, on the straight and round the bend. `[R-roads-088]` — `shots-bends/tram-90-above`
- The airport has no runway. Its terminal is one slab over the middle of the plot, aircraft stand half under its walls, and its car park is an outline on lawn. — `shots-airport/airport-above`

## Major: buildings and lots

- On sloping ground a civic or utility pad shows a dark footing wall along its low side, a storey high at the shore plants, and a drive's apron leaves grass wedges against the footway. `[R-render-034]` — `shots-civic-access/b2-fire-apron-low`, `shots-power/3a-reactor-from-across-the-water`
- A level-1 food plant has no yard and no silos. — `shots-industry/food`
- At night the airport's apron and the landfill's stall stripes take no night tint, and a market's ground floor reads dark. — `shots-storefronts/market-car-park-night`
- Where a zone has no room for its car park a level-1 office, hotel, mixed-use block or mid-rise still stands on a bare pad and parks at the kerb, and a level-2 hotel on its own 2 × 2 footprint has no garage. `[R-services-040]` — `shots-mixeduse/close-mixed-1`
- A reactor's intake forebay stands at plate height over a sloping beach, and where the shore lies further out than 6 m its crib stops short of the water. — `shots-power/3c-reactor-intake-close`

## Lesser

- Seen once and not since: terrain spiking through the cap of a raised road's dead end, in the frame `shots-roadmatrix/highway-viaduct-end` held before the tools were fixed. The regenerated frame stands clean, and the clipping sweep finds no ground above a deck. `[R-roads-004]`
- A green hairline shows between carriageway and footway; footway corners carry notches.
- A grid road's straight leaves its last gap open before a turn tile's solid pair; a free road's runs up to it. `[R-roads-090]` — `emitCurvedMarkings` in `src/render/roadsmesh.ts`
- A tram depot's lead crosses the footway as a darker strip with no dropped kerb; a rail bend's first sleeper doubles the straight's last; a rail junction's turnouts are 10 m in radius, the tile's limit, and tram turns assume like lanes on both arms. `[R-roads-088]` — `shots-depots/b5-tram-turnout`, `shots-roadmatrix/rail-turn`, `rail-cross`
- A footway is one flat strip with no kerb face, so no dropped kerb shows where a drive or an alley's mouth crosses it. `[R-roads-074]` — `shots-conformity/alley-t-twolane-box`
- A street's overhead power line crosses a junction's corner through a signal's mast arm. `[R-services-042]` — `shots-final/01`
- A residential tower's rear car park carries a pale unmarked slab. — `shots-parking/res-tower-3-above`
- A lamp's or a signal arm's shadow lies on the road as a jagged scribble; a vehicle's wheels are near-black boxes. — `shots-furniture/crossroads`
- Trees are planted in the avenue's 1.2 m median, narrower than a street tree's planting strip.
- A viaduct's shadow lies detached from it; winter only dulls the trees' leaves a little, so the strip reads Winter over green ground.
- A street's parking lane stands empty beside homes: a home's cars stand only on its drive `[R-render-026]`. — `shots-parking/kerb-both-1`
- Angled and head-in stalls keep one rhythm for the whole street, so a driveway leaves up to a stall's width unmarked beside it; parallel stalls are laid run by run.
- Seen in the player's own screenshot and not reproduced on any road the tools build: a darker, drive-wide patch on the parking lane at a home's drive.
- An apartment block's and a business's water and sewer leads stop 2 m into the lot, short of the building. — `shots-underground/underground-view`

## Shot tools

- `construction-shots` never gets a shop or a works to begin building in its second stage, so it shoots only the house and the tall frame.
- `curve-shots` and `tramway-shots` do not check that their subject is in frame (`requireInFrame` in `tools/shotcam.mjs`).
