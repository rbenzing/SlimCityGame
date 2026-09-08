# In-world art direction

This folder is the art bible: the visual language everything in SlimCity is
built to — buildings, streets, props, vehicles, and the standards an asset must
meet. How that language is actually rendered — lighting, terrain, water,
vegetation, the pipeline — is in
[../visual-render/](../visual-render/README.md). How the DOM overlay behaves is
in [../ux/](../ux/README.md); its visual tokens are here, in
[ui-style-guide.md](ui-style-guide.md).

Every fact here lives in exactly one file; where a fact would overlap another
file, that file links rather than repeats.

## The scale bible

The world reads as one consistent scale, anchored on the **cosmetic car — 4.0 m
long × 1.8 m wide** — as the human-scale unit. Every other proportion in the
world is read against that car.

`TILE_METERS = 20` is load-bearing (grid, fields, pathfinding, saves). It is
20 rather than 16 because the widest street the game builds has to fit inside
one tile complete with its pavements, and at 16 m it could not: an urban
street 15 m wide had a metre left for two footways, so the four-lane and the
bus lane declared a kerb with nowhere to walk behind it.

Lane and vehicle sizes are real metres and do **not** scale with the tile;
building footprints are given in tiles and do. A building's floor count is
its height divided by 3.2 m per floor, so a taller catalog entry reads as
more storeys rather than one stretched box (see
[buildings.md](buildings.md)). Residential homes are re-proportioned against
the same anchor: 1–2 storeys with a visible yard, sized against the narrower
local-street sections below and the 4 m car parked on the driveway (see
[buildings.md](buildings.md) and [props-and-vehicles.md](props-and-vehicles.md)).
Whatever the carriageway does not use is footway and grass verge — the
intended suburban look, not wasted space.

**Roads** — a road's cross-section is composed piece by piece and lives in
`src/data/roads.json`; that file is the source, and the table below is a
reading of it kept here for proportion. The paved _carriageway_ is the travel
lanes plus anything between them (median, turn lane, bus or bike lane); the
rest of the tile is footway and verge. Standard lane width is 3.75 m.
Half-width fraction = carriageway ÷ (2 × `TILE_METERS`):

| Tier      | Lanes         | Carriageway | Full section | Half-width fraction |
| --------- | ------------- | ----------- | ------------ | ------------------- |
| Alley     | 1             | 3.75 m      | 3.75 m       | 0.094               |
| Gravel    | 2 narrow      | 5.63 m      | 5.63 m       | 0.141               |
| RailTrack | —             | 5.63 m      | 5.63 m       | 0.141               |
| Ramp      | 1 + shoulders | 7.80 m      | 7.80 m       | 0.195               |
| TwoLane   | 2             | 7.50 m      | 11.25 m      | 0.188               |
| OneWay    | 2             | 7.50 m      | 11.25 m      | 0.188               |
| Tram      | 2             | 7.50 m      | 11.25 m      | 0.188               |
| BikeLane  | 2 + cycle     | 11.25 m     | 15.00 m      | 0.281               |
| Highway   | 4             | 15.00 m     | 15.00 m      | 0.375               |
| FourLane  | 4             | 15.00 m     | 18.75 m      | 0.375               |
| BusLane   | 2 + bus       | 15.00 m     | 18.75 m      | 0.375               |
| Avenue    | 4 + median    | 16.20 m     | 19.95 m      | 0.405               |

Only the tiers with kerbs carry a footway, and it is 1.875 m where present —
the difference between the carriageway and the full section. The avenue is
the widest thing the game builds and the reason the tile is the size it is:
four 3.75 m lanes, a 1.2 m refuge and a full footway each side come to
19.95 m, which fits a 20 m tile with 5 cm to spare and would not fit anything
smaller. Local streets stay visibly narrower than arterials — the contrast is
the point. Cosmetic-vehicle lane centers re-derive from the carriageway, so
cars track their lanes at any width. Deep lane composition, junction control
and capacity numbers are simulation facts, not art direction; they stay in
[../world-sim/road-model.md](../world-sim/road-model.md).

## Environmental art

| File                                           | Covers                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [buildings.md](buildings.md)                   | Massing, facades, windows, rooflines, archetype families, procedural houses, construction/abandoned states, lots.    |
| [streets.md](streets.md)                       | Road surface and paint, medians and kerbs, junction and motorway signage, ground-cover transitions, the zoning grid. |
| [props-and-vehicles.md](props-and-vehicles.md) | The vehicle kit, parked cars, utility and service silhouettes, landmark ploppables, street furniture and lamps.      |

These three together are the environmental art guide. They are kept apart
rather than fused into one file because five hundred lines under a single
heading serves nobody.

## Standards

| File                                             | Covers                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| [asset-guidelines.md](asset-guidelines.md)       | How an asset is actually constructed for this project     |
| [modeling-standards.md](modeling-standards.md)   | Geometry budgets, topology, scale                         |
| [texture-standards.md](texture-standards.md)     | Resolution, formats, palette calibration                  |
| [naming-conventions.md](naming-conventions.md)   | File and symbol naming for assets and render modules      |
| [prefab-standards.md](prefab-standards.md)       | There are no prefabs — what stands in for them            |
| [animation-standards.md](animation-standards.md) | Nothing is rigged — what would need settling if it were   |
| [ui-style-guide.md](ui-style-guide.md)           | The DOM overlay's colour, type, spacing and radius tokens |
| [iconography.md](iconography.md)                 | Icons and symbols                                         |

Rendering — lighting, terrain, water, vegetation and the pipeline itself — is
in [../visual-render/](../visual-render/README.md).

Deferred visual work (things this documentation deliberately does not describe
as shipping) is noted at the end of the file it would otherwise belong to; the
backlog itself, with its reasoning, is owned by [DESIGN.md](../DESIGN.md).
