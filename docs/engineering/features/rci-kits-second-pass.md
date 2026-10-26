# The RCI kits, second pass — technical design

- **Status:** Agreed 2026-10-23
- **Date:** 2026-10-23
- **Author:** Claude Fable 5.1

The design is
[../../game-design/features/rci-kits-second-pass.md](../../game-design/features/rci-kits-second-pass.md),
which owns what each kind is and the sources; this owns where the kits
change. The rules it lands in [../../art/buildings.md](../../art/buildings.md)
are the ones a cook reads.

## What we are building, and why now

Measured against the art spec, the kits are complete in parts and wrong in
weight: a commercial body is its catalog entry's one colour desaturated to a
saturation of 0.18 (`src/render/facade.ts:115`, `buildings.ts:296`); an
industrial body is one of three pale walls under a roof the same grey as one
of them (`facade.ts:133-139`); the identifying parts — a 0.9 m sign band, a
0.3 m strip fascia, a 0.6 m clerestory, a 1 m wainscot — are pixels at 40 m;
and the parts map (`src/render/archetypes.ts:226-300`) has no condensers,
silos, bund, bullet, stacks or office corner for the kinds the spec gives
them. The second pass changes the body colour source, the scale of the
identifying parts, and the parts map, inside the existing kit architecture
and triangle budget.

## What it touches

| Module                                                                | Slice   | Change                                                                                                                                    |
| --------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/render/facade.ts`                                                | 1, 2, 3 | Palettes per kind, not per entry: `bodyPaletteFor(kind)` with named colours from the design's tables; roof palettes per kind              |
| `src/render/buildings.ts`                                             | 1, 2, 3 | A body's colour comes from its kind's palette by id hash; the storefront pane row cut into 1.5 m bays with mullions over a 0.6 m bulkhead |
| `src/render/archetypes.ts`                                            | 1, 2    | Parts map completed: the parts the spec names for every kind                                                                              |
| `src/render/buildingkit.ts`                                           | 1, 2, 3 | New part geometries and recipes (below); sizes of the identifying parts raised to read at 40 m                                            |
| `src/render/servicevehicles.ts` or kit                                | 2       | A docked trailer part (53 ft dry van) at a share of a warehouse's dock doors                                                              |
| `src/render/houses.ts`, `houselot.ts`                                 | 3       | Siding and roof palettes by share; porch, garage and chimney shares; the craftsman porch                                                  |
| `docs/art/buildings.md`                                               | each    | Per-kind rows rewritten to the design's tables, with sizes                                                                                |
| `tools/storefront-shots.mjs`, `industry-shots.mjs`, `house-shots.mjs` | each    | A "line-up" shot per family at the 40 m reference distance, one of each kind in a row                                                     |

## The design

### Bodies read by kind

`bodyPaletteFor(kind)` returns the design's short list for that kind (a shop's
brick red-brown and painted masonry; a strip's EIFS cream and tan; a
warehouse's tilt-up white and light grey; a workshop's metal two-tone), and
the body takes one by id hash, as the industrial palette does today. The
desaturation clamp that flattened every commercial colour is lifted to the
palette's own saturation; the lightness clamp stays. A kind's roof palette
is its own: white TPO on a warehouse and a food plant, dark EPDM on an older
shop, galvanised on a shed.

### The identifying parts read at 40 m

The reference library's test is identification at about 40 m, which is
about 4 px per metre at the default pitch. Each identifying part is sized
to be at least 2 px there: a sign band 1.2 m, a strip fascia 0.9 m on a 2.1 m
canopy, the supermarket's entry tower a storey over the parapet, the pylon
6–11 m, a tilt-up colour band 2.4 m at the top third, a wall pack 0.4 m but
lit, a dock bumper pair under every door, a stack 12 m and a baghouse 6 m on
a frame, silos 4 m by 15 m, condensers 2.4 m on the roof, a dike wall 1 m
around the tanks, a pipe rack 5 m up on 6 m portals, a flare 30 m, a chip
pile 12 m high, a scrap yard with a 10 m gantry.

### The parts map completed

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

Every part is a box or a cylinder in an instanced pool, as the kit draws
today; the budget doc's per-building allowance holds, checked by the
existing `geometrybudget.test.ts` tiers.

### Residential shares

House siding and roof colours come from the design's share tables by id
hash (siding: off-white, white, light brown, light grey, medium blue, brick;
roof: charcoal, weathered wood, pewter grey, barkwood); a chimney stands on
under half of houses, a porch on two thirds, a two-car garage on two thirds
and a three-car on 15%, by the same hash — each share a constant with its
source beside it in the art doc.

## What could go wrong

- **Colour alone can read as noise.** A palette per kind with three to five
  colours keeps a street varied without losing the kind; the line-up shot is
  the check.
- **Parts that grow past their lot.** Silos, a flare and a chip pile stand in
  the yard the lot layout already reserves (forecourt, tank farm, truck
  court); a part that does not fit is omitted, as the drive-through is today.
- **Budget.** A trailer is one box and two cylinders; a pipe rack is a few
  boxes per portal; the heavy kinds' yards are the only place counts rise,
  and they are few.

## How we will know it works

- `bodyPaletteFor` returns the design's list for every kind and never the
  catalog colour for a commercial or industrial entry; two entries of one kind
  differ by hash, two kinds never share a palette.
- The storefront pane row has a mullion every 1.5 m and a 0.6 m bulkhead, and
  a house has none.
- The parts map holds every part the art doc names for each kind, asserted
  from the doc's table (a test that fails when one is edited without the
  other).
- Each new part's size matches its art-doc figure.
- A warehouse with six dock doors stands two trailers; a factory one stack and
  one baghouse; a food plant two silos; a chemical plant its dike, rack and
  flare.

**What has to be looked at in a browser**: a line-up per family at 40 m — one
of each commercial kind along one street, one of each industrial kind, one of
each house type — by day and at night. Each must be nameable without its
label; if two read the same, the pass failed for those two.

## Out of scope

New kinds, zones, sim rules, textures, imported meshes, budget changes.
