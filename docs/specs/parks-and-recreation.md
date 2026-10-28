# Parks and recreation

- **Status:** Built

**Owns:** the five park rungs (size, capacity, reach, price, strength), the open-space provision standard, how park coverage combines into land value, parks keeping their ground, and the park kits. Coverage and capacity mechanics are [service-capacity.md](service-capacity.md) and [services-model.md](../world-sim/services-model.md); the programme is [municipal-services.md](municipal-services.md).

**Rules:**

- Size a park as the real park type is, and exempt open space from the six-tile building siting rule; a `drape` entry is never levelled, only paving and a pitch level theirs. `[R-roads-009]`
- Take the best of overlapping parks and add once into LandValue, never the sum; never floor LandValue at a park value. `[R-roads-009]` `[R-services-015]`
- Walk coverage from every road tile within reach of the footprint, never one nearest tile. `[R-roads-010]`
- Cap a park by its catalog capacity and degrade smoothly over capacity: never a cliff, queue or refusal. `[R-services-012]`
- Pool capacity per tile by proportional allocation, never by overlapping coverage groups. `[R-services-014]`
- Write recreation into LandValue only; no `Recreation` field and no write into `Happiness`.
- Keep an airport out of the Parks drawer and out of open space: it is `transit` with no `service` block.
- Draw every park from instanced or one merged plate; props scale with perimeter, never area.

**Numbers:** derivations and sources are in [the sources](../sources/parks-and-recreation.md).

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| Tile / hectare | 400 m² / 25 tiles | | [scale](../sources/parks-and-recreation.md) |
| Open-space standard | 2.4 ha per 1,000 = 60 tiles per 1,000 | residents | [Fields in Trust, Six Acre Standard](../sources/parks-and-recreation.md#quantity-converted-to-capacity) |
| Capacity divisor | 5 | typologies | same |
| Pocket Park | 1×1, 0.1 ac, capacity 32, `range` 18, 400 m, ¢400 / ¢20, strength 80, bonus 40, 8% premium, M0, height 2, level | | [sizes](../sources/parks-and-recreation.md#sizes-from-ground-rather-than-floor-area) |
| Civic Plaza | 5×5, 2.5 ac, capacity 675, `range` 33, 700 m, ¢14,200 / ¢80, strength 50, bonus 30, 5% premium, M2, level | | same |
| Neighbourhood Park | 9×9, 8.0 ac, capacity 1,053, `range` 22, 480 m, ¢5,100 / ¢250, strength 100, bonus 60, 10% premium, M1, drape | | same |
| District Park | 20×20, 39.5 ac, capacity 4,000, `range` 34, 710 m, ¢44,000 / ¢1,250, strength 200, bonus 100, 20% premium, M3, drape | | same |
| Sports Ground | 6×4, 2.4 ac, capacity 120, `range` 58, 1,200 m, ¢1,400 / ¢120, strength 50, bonus 40, 5% premium, M2, 3.2 m pavilion, level | | same |
| Walk radiated by coverage | 2 | tiles | [range](../sources/parks-and-recreation.md#walking-distance-converted-to-range) |
| Walking speed | 1.33 (1,200 m in 15 min) | m/s | same |
| Pitch | 105 × 68, 3 m run-off, 111 × 74 | m | [FIFA, The FA](../sources/parks-and-recreation.md#sizes-from-ground-rather-than-floor-area) |
| Pavilion | 36 occupants × 4.6 m², 0.65 efficiency, 255 m², 2×1 | | same |
| Pocket park anchor | $366k build, $6k a year | $ | [Lewisville TDLR, NRPA](../sources/parks-and-recreation.md#cost) |
| Real cost a rung | $13.0M / $4.6M / $40.2M / $1.26M | plaza / neighbourhood / district / sports | same |
| Upkeep a rung real | $24k / $76k / $374k / $36k | $ a year | NRPA $9,470 an acre |
| Pocket park land value uplift | 20% of 255 over `/4` = 204 at a district park | byte | hedonic pricing |
| Coverage blend into LandValue | `/ 4` | | `[R-services-015]` |
| Draped lattice vertex spacing | 4 (district park 10) | m | dial |
| District park plate | ~4k | triangles | derived |
| Tree spacing / bench spacing | perimeter ÷ 24 / path ÷ 50, floor 2 | m | [props](../sources/parks-and-recreation.md#prop-counts) |
| Draw calls | 8 plus 1 per draped park, of about 300 | calls | same |
| City at standard, 10,000 residents | ~890 tiles, ~900 trees, 240 benches, ~72k triangles | | same |
| Tick-time `perThousand` at population 0 | 0 | not NaN | |
| `SAVE_VERSION` | unchanged | | saves |

**Code:**

- `src/data/catalog.json` — the five `category: 'park'` entries (`small-park`, `civic-plaza`, `neighbourhood-park`, `district-park`, `sports-ground`); `airport` moved to `transit`.
- `src/shared/types.ts` `BuildingCatalogEntry.ground` (`'level' | 'drape'`), `SimSnapshot.openSpace`.
- `src/sim/services.ts` `applyCoverage`, `nearestRoadTile`, `NEAR_ROAD_RADIUS` — multi-source BFS from every road tile near the footprint; max across parks, add once.
- `src/sim/worker.entry.ts` `cmdPlaceBuilding`, `flattenFootprint` — a `drape` entry skips levelling; open-space tiles and tiles-per-1,000 onto the snapshot.
- `src/ui/` panel and store — the parks row's provision line; mirror `openSpace`; the Parks drawer.
- `src/render/utilitykits.ts` `InstancedSlotPool`, `parkGround`, `plazaGround`, `sportsGround`, `parkTree`, `parkBench`, `pitchGoal`, `pavilionBlock`, `playFrame`, `setColorAt` wear colour — the draped plate and the five kits.
- `src/shared/contracts.parks.test.ts` pins which entries drape; `minHeightOverRect` sinks the pick pad.

**Tests:**

- `src/shared/contracts.parks.test.ts` — every entry's `capacity` equals tiles × residents per tile ÷ 5; which entries drape; the Parks drawer and catalog contract with the airport moved.
- `src/sim/services.test.ts` — overlapping parks do not stack, a park still adds, range 18 reaches 20 tiles and nothing at 21, load 2 halves a district park.
- `tests/interaction/parks.test.ts` — provision from a fixture catalog, 0 at population 0; first-town unchanged.
- `src/render/utilitykits.test.ts` — tree and bench counts by footprint (17/8, 30/7, 67+8/16, 17/2), slots freed on removal.

**Open:**

- The pocket park's 0.2 kL water draw is a dial.
- A civic kit's plinth leaves a step at the road crossing (parks are draped or plated and not affected).

## Why the rules are what they are

### Why it earns its place

A park was a land-value sticker: `small-park` was one tile, cost 400, and added land value at its footprint and, additively, across everything within 16 tiles of road, so two overlapping pocket parks stacked. The optimal play was to tile the city with the cheapest park: arithmetic the player does once and repeats. Recreation is the one service a city survives without, so if it ships as a bigger sticker it does not deserve a slot. Municipal standards are two rules, not one: a quantity in hectares per 1,000 residents and an accessibility maximum walk to the nearest space of each kind. Quantity alone is satisfied by one park in a corner; accessibility alone by a hundred dots. A city must buy real ground and spread it. This serves the legible-through-data-lenses pillar: provision becomes a number the player can read, trace and fix. A readout says "38 tiles of open space per 1,000 residents; the standard is 60".

### Provision and capacity

The target is 60 tiles per 1,000 residents, the Six Acre Standard's 2.4 ha at 25 tiles a hectare. A city of 8,000 needs about 480 tiles: a district park and a neighbourhood park, or six neighbourhood parks. Capacity per rung is 400 m² over the m² each resident is owed, divided by five. Dividing is arithmetic: the simulation has one `park` kind, so pooling five typologies overstates capacity fivefold and a city at standard would read a load of 0.2. The standard asks six times as much sports ground per head as equipped play, so a tile of pitch serves a sixth as many people. Derivation in [the sources](../sources/parks-and-recreation.md#quantity-converted-to-capacity).

Parks were the one service the capacity foundation left uncapped; this feature caps them. A catchment holding more people than its pool gives less, smoothly. Capacity joins the catchment pool, `load = population / Σ capacity`, every facility contributes `strength × min(1, 1 / load)`, and funding scales capacity and range together. A park entry with no `capacity` leaves its catchment uncapped, so a pre-feature save behaves as it did. The only park-specific consequence is the move from uncapped to capped, a behaviour change on every save: a mature save's first tick shows catchments at a load of three or more, because those cities were built against no provision rule, and the panel copy has to make "my parks are all red" legible rather than alarming.

`openSpace?: { tiles; perThousand }` on `SimSnapshot` is the sum of the footprint tile count of every `Active` building whose entry has `service.kind === 'park'` over population; `perThousand` is `tiles / population * 1000`, 0 at population 0, never `NaN`. It rides the snapshot and not `CityStats`, because `CityStats` is carried into saves where a derived figure goes stale. With the airport moved, only parks count.

### Reach

Each rung carries its own walking standard. The guidance's distances are pedestrian route distances (1,200 m as "15 minutes" is 1.33 m/s) and our coverage BFS is route distance along roads, so the conversion is a division, no fudge. Coverage radiates 2 tiles around each road tile it reaches, so `range` is the standard ÷ 20 m minus 2. The pocket park's old `range: 16` was wrong by a tile: 16 + 2 is 360 m against a 400 m standard; 18 lands on 400 m. A park behind a cul-de-sac serves the cul-de-sac.

Coverage seeds from every road tile within `NEAR_ROAD_RADIUS` of the footprint at distance 0, a multi-source search over the same graph with the same range. `nearestRoadTile` picked one tile, so a 400 m park fronting four streets served from one corner. Every service gains the same way (a hospital on a corner reaches both its streets); it widens coverage a little and narrows nothing, and the first-town regression checks it changes no prerequisite.

### Max across parks, add once

Applying coverage once per building with `field[tile] += value / 4` let overlapping parks stack, the exploit. Education and health take a max and police and fire subtract a capped amount. Copying education's `Math.max(field[tile], value)` is wrong here: `LandValue` carries the whole land-value model, and flooring it at a park's value would drop a tile worth 200 to 20. So:

```
parkContribution[tile] = max over park facilities of (coverage_f[tile] / 4)
LandValue[tile]       += parkContribution[tile]
```

Overlap is waste and spacing is the play, while land value still gains from a park. A per-tick scratch `Map<tile, number>` is flushed once and rides the existing resolve step. The flat `landValueBonus` on a facility's own footprint stays additive: it seeds diffusion from the park's tiles. A pure max, or keeping the additive blend and fixing sprinkling with price, was rejected: the exploit scales with overlap, not count. With ranges up to 58 tiles the scratch map can cover most of the map; if it shows in a profile the answer is a reused `Float32Array` over tile indices, not a second pass. `GridState.fields` are serialized, so a pre-feature save's `LandValue` grew under the old blend; it is not migrated, and re-settles because land value is recomputed and diffused every tick. It is a balance correction for the release note, not a compatibility break; a player who tiled pocket parks loses the stacked bonus on load, and land value gates growth.

### Land value, and only land value

Recreation writes into `LandValue` and has no second target. Land value is the correct field: proximity capitalising into property value is the best-evidenced effect of open space. And `Happiness` cannot be written to: `computeHappiness` recomputes it from scratch when its slot comes up from education, health, land value, pollution, crime and traffic, so anything a park wrote there dies on the next pass. Recreation reaches happiness through the land-value term; more weight would be one coefficient there, which also moves pollution, crime and traffic, so it is a balancing question. No `Recreation` field: a whole map of bytes for something land value carries, and the programme has rejected per-service fields. No five `ServiceKind` members one per typology: five kinds of concept for the one service the city survives without, when the typologies already earn their keep through per-rung capacity per tile.

Land value gates what a zone grows into, so a park programme is a growth programme and an overloaded one stalls its district. Parks make trips shorter, generating walking and dispatching no vehicle, so this adds no traffic.

`strength` has no municipal standard; it derives from the hedonic-pricing premium (about 20% for property abutting a large well-kept park, falling with distance and use), 20% of 255 over the `/4` gives 204 for a district park and the rungs scale by premium. It is the softest figure and the likeliest to move; `landValueBonus` is a dial too. See [the sources](../sources/parks-and-recreation.md#strength-and-land-value-bonus).

### The ladder

Each rung is a different decision because the standard gives each a different ground per head.

- **Pocket Park** is a park for thirty-two people: it reaches an address nothing else reaches, and thirty of them buy reach without provision.
- **Neighbourhood Park** has the shortest reach of the green rungs (480 m), so a spreading city keeps buying it: a thousand people's amenity green on eight acres, every half mile.
- **District Park** is forty acres and four thousand people's provision, the largest land-value uplift, one per city or district, sited where value should rise.
- **Sports Ground** is the least efficient ground (24 tiles for 120 people) with by far the longest reach; it is how a sprawling city covers its sport obligation, a mild disamenity up close, so its honest siting is a district's edge.
- **Civic Plaza** is the downtown answer: 2.5 acres of paving, a real city square. The standard asks far less hard-surfaced provision per head, so paving serves about 2.7 times the people per tile and buys almost no land value; it keeps a dense district provided rather than nicer, and is the dearest ground per acre. It is the second-worst buy per head (17.1 against the district park's 14.6) and by far the best per tile, so where land binds it always wins; intended, and the figure most likely to need moving.

Parks are real-sized because a park is ground, not a building. The player chose a neighbourhood park of five to ten acres and a community park of forty (a quarter of a square mile) over parks shrunk to fit the building rule. A district park at the published 20 ha was rejected: 500 tiles. A park keeps its ground: a ploppable levels its footprint to one height and forty acres levelled would be a plateau. A `drape` entry skips `flattenFootprint` and is placed as terrain lies, subject only to the per-tile buildable test; only the sports ground's pitch and pavilion and the plaza's paving level theirs. The flag is catalog data, nothing saved. The pavilion is the only floor area and sits at the site edge, as the campus-services rule reads a grounds-led facility by its grounds. Sizes in [the sources](../sources/parks-and-recreation.md#sizes-from-ground-rather-than-floor-area).

Prices follow the civic rule: each rung priced off the pocket park's $366k ($84 a sq ft in Lewisville) by real cost per acre times its acreage; upkeep by the NRPA median per acre. Paving is dearest per acre, developed parkland cheapest. Unlocks follow the ladder, stated not derived. See [cost](../sources/parks-and-recreation.md#cost).

### The airport

`airport` ("International Airport", 8×6) was filed as `category: 'park'` with `service: { kind: 'park' }`, so it sat in the Parks drawer, contributed park coverage and would count as 48 tiles of open space. Its category becomes `'transit'` and its `service` block goes: there is no `ServiceKind` for air transport and recreation is no substitute. The player chose to fix it here rather than ship a provision figure that lies. An airport in a save keeps its tiles and loses its park coverage and the land-value bonus it stamped on its own ground; its id, footprint and cost stand. An airport at 160 noise was never a reason for land value to rise.

### What an overloaded park looks like

The grass wears: past a catchment load of 1.0 the lawn reads scuffed and then bare, desire lines across the middle, worn edges at the entrances. It also gets busier, with more walkers standing on it. The land-value halo thins, paler in the overlay. And the panel says so. A player who ignores all four sees land value stop rising and does not know why; a player who looks at the park sees worn grass and does. Wear is a per-instance colour on the ground pool via `setColorAt`.

### Rendering

These are the largest ground-level assets in the game and [the performance budget](../engineering/performance-budget.md) caps the frame at roughly 300 draw calls. The kits extend the pocket-park kit ([props and vehicles](../art/props-and-vehicles.md)).

- **One plate a park.** A flat rung merges its plate, paths and markings into one `BufferGeometry` sized from the footprint and instances it, one slot a park. A draped rung's heights are the terrain's under it, so it is one merged mesh of its own: a lattice at a vertex every 4 m (10 m on the district park, keeping its plate near 4k triangles) with each height read from the terrain, so lawn and paths lie on the hillside. A 400-tile district park is one draw call. The instancer's pick pad under a draped entry sinks below the lowest ground (`minHeightOverRect`), so the lawn hides it and a click still finds the park.
- **Shared pools.** `parkTree` and `parkBench` do not depend on the footprint, so five kits share one pool each: 3 ground pools plus tree, bench, `pitchGoal`, `pavilionBlock`, `playFrame` is 8 draw calls plus one per draped park. Planters and the pitch fence merge into their plate.
- **Props by perimeter.** Trees ring the edge and paths and the middle stays open: perimeter ÷ 24 m trees, path ÷ 50 m benches (floored at 2), roughly 900 trees and 240 benches in a 10,000-resident city. An area rule would put 75 trees on every district park. Per-rung counts are in [the sources](../sources/parks-and-recreation.md#prop-counts). Trees stand on the terrain at their own vertex height; kit trees stay self-contained and do not import [vegetation](../visual-render/vegetation.md).
- **Markings and wear cost nothing.** Pitch lines are vertex-colour strips merged into the plate, as the path cross is. Only `pitchGoal` (two a ground) and `pavilionBlock` (one) are new part kinds.

The six browser checks that judge the kits are in [the sources](../sources/parks-and-recreation.md#looked-at-in-a-browser).

### Persistence and protocol

`SAVE_VERSION` does not move: everything added is catalog data or derived per tick. A save written before this feature loads with the new parks absent, never rejected. One new optional `SimSnapshot` member, no new commands; parks use the ploppable path ([interfaces](../engineering/interfaces/README.md), [data model](../engineering/data-model/README.md)).

## Decided

- Real-sized parks over parks shrunk to the building rule (the player's choice); each priced by real cost ratios.
- Fix the airport in this feature over shipping a provision figure that lies (the player's choice).
- Max across parks, add once, over a pure max or an additive blend with a price fix.
- LandValue only: `Happiness` is recomputed so a write dies, and a `Recreation` field is a `MAP_SIZE²` byte array for something land value carries.
- One `park` kind with per-rung capacity over five `ServiceKind` members.
- Not built: decoration ploppables (fountains, statues, flowerbeds whose only effect is a land-value number; see [DESIGN.md](../DESIGN.md)); tourism, landmarks and per-citizen leisure (no visitors exist, nobody is tracked to a park); a new scalar field or `ServiceKind`, or a coverage rework; park-specific pedestrian behaviour beyond walker density following load, water features, seasonal planting beyond the existing tint.
