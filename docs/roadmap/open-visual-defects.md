# Open visual defects

What three reviews of every screenshot the shot tools write found wrong in the game, worst first. A line leaves this list in the change that fixes it. The shot named is the one that shows it: `<series>/<frame>` is under `tools/shots/out/` (run `npm run shots`), and `shots-<tool>/<frame>` is a tool not yet moved to a series, under `tools/`. Neither folder is committed. A code pointer names where the picture is decided, where that is known. The tools' own faults that are still open are in the last section.

## Major: roads

- An auxiliary lane or a turn bay widens a road about its tile's centre, so the kerb on the other side bends outward by up to 1.6 m: a ramp's merge reads as a dogleg, and the far-side edge line of a ramp's T runs slanted. The road needs drawing from an anchored edge, widening on the lane's side only. `[R-roads-061]` `[R-roads-064]` — `grade/ramps-merge`, `shots-roadmatrix/ramp-tee`
- A sound wall opens for one 20 m tile at every slip road's mouth, as its spec decided; a real barrier overlaps there or follows the slip road, and the spec gives no overlap or end treatment to build one from. `[R-roads-056]` — `shots-soundwalls/walled-far-side`, `ramp-gap`

## Major: transit

- A tram reservation on a free (off-grid) road draws its median but no guideway, columns or beams, and a street tramway there has its track but no wire or poles: both are laid on grid tiles only. `[R-roads-088]` — `shots-bends/tram-90-above`, `tram-street-30-above`
- An airport's terminal, cargo buildings and tanks are plain bodies; its car park and its garages' roofs hold no cars and its loop road no trees; the international's plot is longer than the camera's furthest view. — `airport/international-airport-terminal-front`

## Major: buildings and lots

- On sloping ground a civic or utility pad shows a dark footing wall along its low side, a storey high at the shore plants, and a drive's apron leaves grass wedges against the footway. `[R-render-034]` — `power/nuclear-plant-rear`; the slope case has no frame until a series stands a civic pad on a slope
- Garden apartments have no breezeway: the slot is a dark panel on a solid body, so the stair runs across the facade in front of windows, and the mail kiosk stands in line with a unit's door. A passage cut through the body, with the stair inside it, is a change to the body, its roof and its lot. — `apartments/res-medium-2-breezeway`
- Where a zone has no room for its car park a level-1 office, hotel, mixed-use block or mid-rise still stands on a bare pad and parks at the kerb, and a level-2 hotel on its own 2 × 2 footprint has no garage. `[R-services-040]` — `apartments/mixed-1-shopfront`
- A reactor's intake forebay stands at plate height over a sloping beach, and where the shore lies further out than 6 m its crib stops short of the water. — `power/nuclear-plant-intake`

## Lesser

- Seen once and not since: terrain spiking through the cap of a raised road's dead end, in the frame `shots-roadmatrix/highway-viaduct-end` held before the tools were fixed. The regenerated frame stands clean, and the clipping sweep finds no ground above a deck. `[R-roads-004]`
- A tram depot's lead crosses the footway as a darker strip with no dropped kerb; a rail bend's first sleeper doubles the straight's last; a rail junction's turnouts are 10 m in radius, the tile's limit, and tram turns assume like lanes on both arms. `[R-roads-088]` — `depots/tram-depot-lead`, `shots-roadmatrix/rail-turn`, `rail-cross`
- A footway's kerb face runs unbroken across a drive and an alley's mouth: no dropped kerb shows there, and a car park's entrance meets the street square, with no return. A crossing has no ramp at a median's opening or a corridor's seam. `[R-roads-074]` `[R-roads-095]` — `junctions/alley-t-twolane-above`, `shots-parking/com-strip-2-above`
- A local street's turn bay stores 20 m, under the 30 m a left turn is given `[R-roads-093]`.
- A raised tram station's lift tower is 2.4 m square on a 1.9 m footway, so it stands 0.5 m onto the verge. — `shots-tramways/station-close`
- A pole line's last span stops at its end pole outside a substation and does not drop to the gantry, whose insulators hang unconnected. `[R-services-039]` — `shots-powerline/substation-60m`
- A viaduct's shadow lies detached from it; winter only dulls the trees' leaves a little, so the strip reads Winter over green ground.
- A street's parking lane stands empty beside homes: a home's cars stand only on its drive `[R-render-026]`. — `shots-parking/kerb-both-1`
- Angled and head-in stalls keep one rhythm for the whole street, so a driveway leaves up to a stall's width unmarked beside it; parallel stalls are laid run by run.
- Seen in the player's own screenshot and not reproduced on any road the tools build: a darker, drive-wide patch on the parking lane at a home's drive.
- The hospital's block stands 1 m inside its plot's rear and west lines and half a metre off its deck: no service yard, dock, generator or oxygen store fits, no door opens on three faces, and the next tile's trees stand at its rear wall. A deeper plot is a catalog change. — `health/hospital-rear`
- A building site's fence has no gate and its lot no drive; a large works' graded pad still reads mostly bare round its cabin, skips and heap. — `shots-construction/works-earth-above`
- A modern block's balconies and bays keep the older 6.8 m grid, so they do not sit on its 1.5 m glass modules, and a mid-rise's piers and bays hide most of its glass. — `apartments/res-high-2-row`
- A building on a curved parcel keeps a 2 m water and sewer lead, short of its wall. — `frontWallSetbackM` in `src/render/massing.ts`

## Reported by the third review, not yet measured

A reviewer saw each of these in two frames or more; none has been checked against the geometry, and some will prove to be the camera.

- Empty ground on a plot: the gas turbine's 12 × 5 tiles round one small building, the depot's and the recovery plant's aprons, the plaza's 160 m of paving, the district park's lawns (`power/gas-turbine-above`, `utilities/recycling-depot-front`, `parks/civic-plaza-above`).

- Seen in the first series, not yet measured: the cars on the clinic's and the crematorium's stalls draw black where the hospital's are coloured (`health/clinic-front`); a level-3 car wash has a car park at its rear and none at its front (`roadside/com-carwash-3-rear`); an alley's or a gravel road's arm at a T reads as a hairline from above (`junctions/alley-t-twolane-above`); a road across a slope leaves a grey cut-and-fill scar across the whole pad (`grade/slope-cross-twolane-above`).
- Eleven models stand above the height the catalog gives them, a coal plant's stack by 68 m (22 against 90), an incinerator's by 50, a wind turbine's blade by 36; the list is `DRAWN_TOPS` in `tools/shots/lib/tops.mjs`, read off frames and not measured.

## Shot tools

- No series stands a civic pad on a slope, so a footing wall or an apron's wedge on sloping ground has no frame.
- A road piece's `along` view fills its foreground with the run's rounded end; a row's `left` and `right` views show the next, taller subject behind (`apartments/res-tower-1-left`).
- 31 tools are not yet series: road classes and bends, street furniture and transit, lenses and views, the grown town. They run with `npm run shots:old`.
