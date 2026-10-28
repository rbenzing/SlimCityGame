# Commercial kinds

| Kind            | Body                                           | Storeys    | Parts                                                                              | On the lot                                         |
| --------------- | ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Shop            | 13.6 m per tile (1×1, 1×2, 2×2)                | 1          | bulkhead, awnings, lit sign band, cornice                                          | car park to code, short of it (the 1×1 draws none) |
| Shopping strip  | 13.6 m per tile, long and shallow (3×2 to 5×2) | 1          | continuous canopy, tenant sign bands, anchor, pylon sign, rooftop units            | car park to code, short of it                      |
| Supermarket     | 13.6 m per tile (3×3 to 5×4), 4.7 m tall       | 1          | entry tower, brick base, cart corrals, lit sign band, rooftop units                | car park to code, short of it                      |
| Restaurant      | 13.6 m per tile capped at 24 m a side          | 1 / 1 / 2  | drive-through, dumpster enclosure, awnings, lit sign band, rooftop units           | car park to code, short of it                      |
| Filling station | 35% of the lot each way, capped at 16 m        | 1          | fuel canopy with its fascia on four posts, two islands with dispensers, price sign | forecourt; car park to code beside it              |
| Office          | 13.6 m per tile                                | 5 / 8 / 16 | lobby portal; rooftop units, or a screen and cooling tower on the tower            | none: downtown, cars at the kerb                   |
| Hotel           | 13.6 m per tile                                | 4 / 6 / 8  | porte-cochère, lit sign band, rooftop units                                        | none: downtown, cars at the kerb                   |

The parts are specified under [the storefront kit's parts](the-storefront-kits-parts.md).

**What tells the kinds apart, at 40 m.** The second pass
([rci-kits.md](../../../specs/rci-kits.md),
which carries the sources) gives each kind its own body material from the
chart and sizes the one or two parts that identify it so they read at the
reference distance, about 4 px a metre at the default pitch: an identifying
part is never under 0.5 m. A body takes one material of its kind's list by
id hash, never the catalog entry's colour; every material is a chart entry
under the albedo ceiling, and the accents sit in the saturated block.

| Kind            | Body materials (chart)                                        | Roof            | The parts that identify it, sized                                                                                                                                     |
| --------------- | ------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shop            | `redBrick`, `brownBrick`, `paintedMasonry` (bone)             | `brightBitumen` | the storefront a storey tall in 1.5 m bays on a 0.6 m bulkhead; a 1.2 m sign band in the tenant's accent; an awning per bay, dark green, burgundy or black; a cornice |
| Shopping strip  | `eifsCream`, `eifsTan` over a 1.2 m `splitFaceGrey` base      | `brightBitumen` | a continuous 2.1 m canopy with a 0.9 m fascia in `canopyBronze`; tenant bands; the parapet stepping 1.2 m up at each entry; a 6 m pylon at the road                   |
| Supermarket     | `eifsTan`, `eifsGrey` over a 2.4 m `splitFaceGrey` base       | `whiteMembrane` | an entry tower a storey over the parapet in the tenant's accent; two cart corrals in the car park; a 1.8 m screen wall at the dock; the sign band 1.2 m               |
| Restaurant      | `eifsBeige`, `paintedMasonry`; one `darkFeatureWall` end      | `brightBitumen` | the drive-through lane with a 2.4 m menu board and a pickup window; a red-and-yellow accent band and a 6 m pylon; the old form's brown mansard on level 1             |
| Filling station | `paintedMasonry`, `whiteBrick`                                | `whiteMembrane` | the canopy's fascia 0.76 m in the brand accent; a 6 m price pylon with lit digits                                                                                     |
| Office          | `precastGrey`, `precastBuff` bands with `tintedGlass` ribbons | `greyMembrane`  | ribbon windows between 1.2 m precast bands on a 1.5 m mullion module; a glazed lobby two storeys tall; the tower a `curtainWall` of vision glass over `spandrelDark`  |
| Hotel           | `eifsBeige` over a 1.2 m `stoneVeneer` base                   | `greyMembrane`  | the porte-cochère 6 × 6 m clearing 4.1 m on four columns; the sign band 1.2 m on the top floor in `navyAccent` or `greenAccent`                                       |

The materials named here that the chart does not yet hold — `redBrick`,
`brownBrick`, `paintedMasonry`, `eifsCream`, `eifsTan`, `eifsGrey`,
`eifsBeige`, `splitFaceGrey`, `canopyBronze`, `darkFeatureWall`,
`whiteMembrane`, `greyMembrane`, `precastGrey`, `precastBuff`,
`tintedGlass`, `curtainWall`, `spandrelDark`, `stoneVeneer`, `navyAccent`,
`greenAccent` — are measured from swatches and added under the chart's rules
([texture-standards.md](../../texture-standards.md#the-real-texture-standard-the-calibrated-material-chart)),
not picked by eye. No source gives a palette by tenant class; the accents
are the game's own, except fast food's red and yellow.

The fuel canopy stands 2 m off the kiosk's frontage wall and runs 10 m out
over the forecourt and 90% of the way across it, on four 0.4 m posts inset
at its corners; the two pump islands stand under it a quarter of its span
either side of centre. Every part is from the shared kit, in the chart's
colours.

## Sections

| Section | Size |
| --- | --- |
| [The storefront kit's parts](the-storefront-kits-parts.md) | 12,946 B |
