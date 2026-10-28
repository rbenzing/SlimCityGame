# The RCI kits

- **Status:** Built

**Owns:** what tells each commercial, industrial and residential kind apart at 40 m: its body palette, the size of its identifying parts and the yard objects it stands among.

**Rules:**

- Draw a kind's body colour from its own palette by id hash, never from the catalog colour; a chart pick is a measured swatch and skips the desaturation and lightness clamps. `[R-render-018]`
- Size every identifying part to at least 2 px at 40 m (about 4 px per metre); a part that does not fit its lot's yard is omitted. `[R-render-032]`
- Build every part as a box or cylinder in an instanced pool, never a texture or an imported mesh; the per-building triangle budget holds. `[R-render-001]` `[R-render-006]`
- Keep every kind's parts map equal to the art table's parts for that kind; a test fails when one is edited without the other.
- Make a lit part glow in its own colour; a wall, roof, porch or garage door never glows. `[R-render-019]` `[R-render-021]`
- Give a house its siding, roof colour, chimney, porch and garage by the share tables, from the id hash; vary only by transform and colour. `[R-render-007]`
- Add no kind, zone or sim rule; a kit pass changes colours, materials, part sizes and yard objects only.
- Call a render change done only when a 40 m line-up per family has been looked at in a browser, by day and at night. `[R-render-032]`

**Numbers:**

| Constant / part                             | Value                                  | Unit      | Source                                                                       |
| ------------------------------------------- | -------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| Reference distance, legibility              | 40, about 4, at least 2                | m, px/m, px | dial: the reference library's test                                         |
| Storefront bay, `SHOP_BAY_M`                | 1.5 mullion module; bulkhead 0.6       | m         | [sources](../sources/rci-kits.md#commercial): bulkhead 18 to 42 in by code   |
| Sign band                                   | 1.2                                    | m         | dial, raised from 0.9 to read at 40 m                                        |
| Strip fascia, `STRIP_CANOPY_FASCIA_M`       | 0.9 on a 2.1 canopy (`STRIP_CANOPY_DEPTH_M`) | m   | dial, raised from 0.3                                                        |
| Pylon sign                                  | 6–11                                   | m         | [sources](../sources/rci-kits.md#commercial): 20–36 ft                       |
| Supermarket entry tower                     | a storey over the parapet              | m         | dial                                                                         |
| Tilt-up colour band, `TILT_BAND_M`          | 2.4 at the top third                   | m         | [sources](../sources/rci-kits.md#industrial): banded painted panels          |
| Wall pack, dock bumpers                     | 0.4 but lit; a pair under every door   | m         | [sources](../sources/rci-kits.md#industrial): mounted 12–20 ft               |
| Trailer at the dock, `TRAILER_DOOR_STEP`    | 1 in 3 doors; 53 ft dry van            | doors     | dial                                                                         |
| Stack, baghouse                             | 12; 6 on a frame                       | m         | [sources](../sources/rci-kits.md#industrial): mini-mill and permit stacks    |
| Silo                                        | 4 by 15                                | m         | [sources](../sources/rci-kits.md#industrial): 4–4.5 m by 15–23 m             |
| Condenser                                   | 2.4 on the roof, 2–4 a plant           | m         | [sources](../sources/rci-kits.md#industrial): Evapco penthouse               |
| Dike wall                                   | 1 round the tanks                      | m         | [sources](../sources/rci-kits.md#industrial): DLA, about a metre             |
| Pipe rack                                   | 5 up on 6 portals                      | m         | [sources](../sources/rci-kits.md#industrial): bays 4–8 m, tier 4–5.5 m       |
| Flare                                       | 30                                     | m         | [sources](../sources/rci-kits.md#industrial): to 60 m self-supported         |
| Chip pile; scrap gantry                     | 12 high; 10                            | m         | [sources](../sources/rci-kits.md#industrial): chips to 15 m                  |
| Chimney, porch, two-car, three-car garage   | under half; two thirds; two thirds; 15 | share     | [sources](../sources/rci-kits.md#residential): NAHB, Census                  |
| Commercial colour desaturation (old)        | 0.18                                   | saturation | `src/render/facade.ts`; now bypassed for a chart pick                       |

**Code:** `src/render/facade.ts` `bodyPaletteFor` — body and roof palettes per kind, chart picks by id hash.
`src/render/buildings.ts` — a body takes its colour from its kind's palette; the storefront pane row is cut into bays.
`src/render/archetypes.ts` — the parts map per kind.
`src/render/buildingkit.ts` — part geometries, recipes and sizes (`SHOP_BAY_M`, `BULKHEAD_HEIGHT_M`, `TILT_BAND_M`, `TRAILER_DOOR_STEP`).
`src/render/servicevehicles.ts` — the docked trailer.
`src/render/houses.ts`, `src/render/houselot.ts` — shingles, porch, garage and chimney shares; craftsman and split-level forms.
`src/render/massing.ts`, `src/render/palette.ts` — the 5-over-1 podium, siding and shingle chart entries, window rows capped per kind.
`tools/storefront-shots.mjs`, `tools/industry-shots.mjs`, `tools/house-shots.mjs` — the line-up shot per family.

**Tests:** `src/render/facade.test.ts` — a kind body never takes the old industrial palette or the catalog colour; kindless and farm entries keep the old one.
`src/render/archetypes.test.ts` — the parts map holds every part the art table names for each kind.
`src/render/buildingkit.test.ts` — part sizes and counts.
`src/render/geometrybudget.test.ts` — the per-building triangle tiers.

**Open:**

- The shipped industrial lots are too shallow for the heavy kinds' yard: no warehouse lot has the 18.7 m a 16 m van needs, no 4×3 heavy lot a 20 × 12 m scrap yard; the kit omits what does not fit.
- The split-level's two-storey block has no panes, so its upper storey reads blank up close and dark at night.

The reference tables and the research behind them are in [the source digests](../sources/rci-kits.md). The per-kind art rows are in [the buildings art spec](../art/buildings/README.md).

## Why the kits are re-drawn

The building-detail programme ([building-detail.md](building-detail.md)) gave every zoned building its parts. The player's verdict: the commercial and industrial buildings "don't look realistic or show distinguishable features of what type of building they are", and the models "could be way better". This pass gives each kind the one massing cue, the cladding and the colour that tell it apart at the 40 m the reference library was written for, from sources.

The kits were right in their parts and wrong in their weight. Every commercial body took one catalog colour desaturated to a saturation of 0.18 (`src/render/facade.ts:115`, `buildings.ts:296`); every industrial body one of three pale walls under a roof the same grey as one of them (`facade.ts:133-139`). The identifying parts, a 0.9 m sign band, a 0.3 m strip fascia, a 0.6 m clerestory, a 1 m wainscot, stood 0.3 to 1 m tall on 14 to 80 m fronts: at 40 m a pixel. The parts map (`src/render/archetypes.ts:226-300`) had no condensers, silos, bund, bullet, stacks or office corner for the kinds that need them to differ from a warehouse.

The player gets a street of shops, a strip centre, a supermarket, a drive-through, an office and a hotel told apart from across the map by shape and colour, not label. An industrial park shows a warehouse, a factory, a food plant and a chemical plant by their yard: trailers at a dock bank, a stack and a baghouse, rooftop condensers and silos, a tank farm inside its dike. Houses keep their types and gain the siding colours, roof colours, garages and porches US homes have. Nothing a player does changes: a zoned lot grows the kind it grows today.

## What each kind is

Every figure is sourced in [the digests](../sources/rci-kits.md); no source gives a palette by tenant class, so the colours here are the game's own choice, except fast food's red and yellow. Steel-mill and paper-mill colours were not sourced either.

### Commercial

| Kind             | What identifies it at 40 m                                                                                                                                  | Cladding and colour                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Main Street shop | A glass storefront a storey tall on a 0.6 m bulkhead under a sign band, punched windows above, a cornice; an awning per storefront                          | Brick red-brown or painted masonry; sign band in the tenant's colour; awnings dark green, burgundy, black                     |
| Strip centre     | One long low parapet box, a continuous canopy with a tenant sign band, a pylon sign at the road, parapet stepping up at entries                             | EIFS cream or tan over a masonry base; canopies black, dark grey or dark bronze; sign band white or cream with coloured signs |
| Supermarket      | A big blank box with one tall entry tower, split-face block base, cart corrals in the parking field, a screened dock at the back                            | Split-face CMU grey base, painted EIFS tan or grey, dark bronze trim; the entry tower the tenant's colour                     |
| Fast food        | A small box with a drive-through loop, a menu board and a pickup window, a pylon; the old form a brown mansard, the new a flat box with a dark feature wall | EIFS or stucco in beige and dark grey, a red and yellow accent band and pylon                                                 |
| Filling station  | A flat canopy on columns beside a small store, a price pylon with lit digits                                                                                | Canopy fascia a colour band 0.76 m tall; store cream or white; pylon the brand's colour                                       |
| Suburban office  | A 2–4 storey slab of ribbon windows between precast bands on a 1.5 m mullion module, a glazed lobby                                                         | Precast grey or buff bands, tinted glass; no sign band                                                                        |
| Office tower     | A curtain wall of vision glass over spandrel, a 12 m glass lobby at the street                                                                              | Blue-green or grey glass, spandrels a darker tone                                                                             |
| Hotel            | A flat-roofed 4-storey block with a porte-cochère on columns at the entrance, a sign band high on the facade                                                | EIFS beige with a stone veneer base, navy or dark green sign band                                                             |

### Industrial

| Kind            | What identifies it at 40 m                                                                                                        | Cladding and colour                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Workshop / flex | A low metal shed, a glazed office front, roll-up doors at grade at the back                                                       | Ribbed metal panel in two tones: body light stone, ash grey or polar white; wainscot rustic red, slate, evergreen or blue      |
| Warehouse       | A long low tilt-up box, a bank of dock doors on 3.7–4.3 m centres with trailers in a concrete truck court, a glazed office corner | Painted tilt-up white or light grey with a coloured band at the top third; white roof; pale concrete apron, dark asphalt drive |
| Factory         | A metal or block box with a baghouse and a stack outside, a silo, a fenced material yard; monitors only on an old one             | Ribbed panel or CMU in grey-blue or tan; galvanised stack; oxide-red baghouse                                                  |
| Food plant      | A windowless white box with condensers and penthouses on the roof and stainless silos beside it, a dock bank                      | Flat insulated metal panel, white; silos aluminium-clad                                                                        |
| Chemical plant  | Short buildings beside a tank farm inside a dike, a pipe rack, a flare stack, a cooling tower                                     | White tanks, grey rack steel, a concrete dike wall; the flare's tip                                                            |
| Steelworks      | A 30 m melt shop with a ridge vent, a baghouse stack, an open scrap yard with a gantry crane                                      | Oxide red and dark grey panel, rust-brown yard                                                                                 |
| Paper mill      | A chip pile up to 15 m high beside a monitor hall, a recovery boiler with a 90 m stack, tanks                                     | Grey and white panel, the chip pile tan                                                                                        |

### Residential

| Kind             | What identifies it at 40 m                                                                                   | Cladding and colour                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Ranch            | One storey, a low gable or hip, an attached front garage, a porch on two thirds of them                      | Siding by region; roof charcoal, weathered wood, pewter grey or barkwood |
| Cape Cod         | One and a half storeys, a steep side gable with two dormers                                                  | Siding, white trim                                                       |
| Colonial         | Two full storeys, symmetrical, side-gabled, no dormers                                                       | Siding or brick, shutters                                                |
| Split-level      | A two-storey block beside a one-storey wing, the garage on the lowest level                                  | Siding over a brick base                                                 |
| Craftsman        | A low gable with wide eaves and a deep front porch on tapered columns on stone piers                         | Clapboard or shingle in olive, brown or sage                             |
| Townhouse        | Units 16–24 ft wide, front- or rear-loaded garages                                                           | Brick or fibre cement, colour by unit                                    |
| Duplex, fourplex | A house's form on a wider lot, two or four doors                                                             | As houses                                                                |
| Garden apartment | Two or three storeys of walk-ups off exterior breezeways and stair towers, balconies 6 ft deep               | Fibre cement and brick, colour-blocked                                   |
| 5-over-1         | Five storeys of flat-windowed cladding in colour-blocked panels over a 13–15 ft commercial or parking podium | Fibre cement panels in two or three colours, a brick podium              |
| Tower            | A flat-plate slab, 3.3–3.9 m a floor, a screened mechanical penthouse                                        | Curtain wall or panel                                                    |

## Bodies read by kind

`bodyPaletteFor(kind)` returns the short list for that kind: a shop's brick red-brown and painted masonry, a strip's EIFS cream and tan, a warehouse's tilt-up white and light grey, a workshop's metal two-tone. The body takes one by id hash, as the industrial palette did before. The desaturation and lightness clamps that flattened every commercial colour do not touch a chart pick: a brick below the lightness floor stays brick. The clamps still govern a body that takes its catalog colour. A kind's roof palette is its own: white TPO on a warehouse and a food plant, dark EPDM on an older shop, galvanised on a shed.

Body palettes are the one place taste enters: each is a short list of named colours from the sources, three to five a kind so a street stays varied without losing the kind, and the list is the dial.

## The identifying parts read at 40 m

The test is identification at about 40 m, which is about 4 px per metre at the default pitch, so each identifying part is at least 2 px there: a sign band 1.2 m, a strip fascia 0.9 m on a 2.1 m canopy, the supermarket's entry tower a storey over the parapet, the pylon 6–11 m, a tilt-up colour band 2.4 m at the top third, a wall pack 0.4 m but lit, a dock bumper pair under every door, a stack 12 m and a baghouse 6 m on a frame, silos 4 m by 15 m, condensers 2.4 m on the roof, a dike wall 1 m around the tanks, a pipe rack 5 m up on 6 m portals, a flare 30 m, a chip pile 12 m high, a scrap yard with a 10 m gantry.

Silos, a flare and a chip pile stand in the yard the lot layout already reserves (forecourt, tank farm, truck court); a part that does not fit is omitted, as the drive-through is.

## The parts map

| Kind          | Parts added                                                             |
| ------------- | ----------------------------------------------------------------------- |
| Shop          | `storefrontMullion` (in the facade pane row), `awning` per bay          |
| Strip         | `pylonSign` (shared with fuel), canopy fascia                           |
| Supermarket   | `cartCorral` ×2 in the lot, `dockScreen`, entry tower raised            |
| Fast food     | `featureWall` (dark end wall), `menuBoard`, `pylonSign`                 |
| Office        | `ribbonBand` precast bands between glass                                |
| Hotel         | stone base band, `signageBand` raised to the top floor                  |
| Workshop/flex | `wainscot` two-tone, glazed office front                                |
| Warehouse     | `tiltBand`, `dockTrailer` at 1 in 3 doors, `officeCorner`, `guardBooth` |
| Factory       | `baghouse`, `stack`, `silo`, `yardFence`                                |
| Food plant    | `condenser` ×2–4, `penthouse`, `silo` ×2                                |
| Chemical      | `bund` (exists), `pipeRack`, `flare`, `coolingTower`                    |
| Steelworks    | `scrapYard` + `gantry`, `baghouse` stack                                |
| Paper mill    | `chipPile` (exists), recovery stack                                     |

Every part is a box or a cylinder in an instanced pool; the budget doc's per-building allowance holds, checked by the `geometrybudget.test.ts` tiers. A trailer is one box and two cylinders and a pipe rack a few boxes per portal; only the heavy kinds' yards raise counts, and they are few. The storefront pane row has a mullion every 1.5 m over a 0.6 m bulkhead, and a house has none.

## Residential shares

House siding and roof colours come from the share tables by id hash (siding: off-white, white, light brown, light grey, medium blue, brick; roof: charcoal, weathered wood, pewter grey, barkwood). A chimney stands on under half of houses, a porch on two thirds, a two-car garage on two thirds and a three-car on 15%, by the same hash. Each share is a constant with its source beside it in the art doc.

## What it touches

- [building-detail.md](building-detail.md) and [building-types.md](building-types.md): the kinds, the reference library and the triangle budget stay; the kits change inside them.
- [lighting.md](../visual-render/lighting.md): a coloured sign band glows in its own colour; a wall pack over a dock door; a lit storefront is a row of bays.
- [parking-to-code.md](parking-to-code.md): the car park, drive-through lane and truck court are laid already; the pass dresses them with corrals, a menu board, trailers at the dock and a guard booth.

## Decided

- Colour per kind from a short chart, not per catalog entry: one catalog colour desaturated to nothing made every kind alike.
- Parts that would outgrow their lot are omitted, not squeezed.
- Not new kinds, zones or sim rules; not textures or imported meshes; not a budget change.
- Slices, in play order: commercial (bodies, storefront bays, strip canopy and pylon, supermarket tower, corrals and dock screen, fast-food feature wall, office ribbon bands, hotel base and band); industrial (tilt-up bands, white roof, trailers and apron, factory baghouse, stack and yard, food-plant condensers and silos, tank-farm dike, rack and flare, mill scrap yard and chip pile, two-tone sheds); residential (siding and roof palettes, garages and porches at their shares, chimneys on fewer than half, the craftsman's porch, the 5-over-1's colour blocking and podium, the tower's screened penthouse).
- The nine siding and shingle chart entries and the tower's window rows are capped per kind inside the seed slot, so a kind never grows a new topology.
- Verified by tests: `bodyPaletteFor` returns the kind's list and never the catalog colour; two kinds never share a palette; a warehouse with six dock doors stands two trailers, a factory one stack and one baghouse, a food plant two silos, a chemical plant its dike, rack and flare.
