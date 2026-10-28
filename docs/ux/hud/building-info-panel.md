# Building info panel

Floating over the viewport at the left, roughly a third of the way down,
whenever a building is selected:

- **Header**: an icon for the building's kind, its catalog name plus
  `#{id}` (there are no street addresses yet, so the id is the
  disambiguator), and a close button.
- **Status line**: a happiness-face glyph next to a state word —
  Constructing, Content, or Abandoned.
- **Rows**, label left in the uppercase label style, value right:
  - `ZONE` — the zone's display name ("Low Density Residential").
  - `LOT` — the lot the building stands on, after ZONE: "Half lot, 400 m²",
    "Normal lot, 800 m²", "Double lot, 1,600 m²", "Estate lot, 2,400 m²", "Acre lot, 3,600 m²", and
    "Two normal lots, 1,600 m²" for a building assembled from two parcels. It
    reads the catalog entry's lot and footprint at 400 m² a tile
    (`lotLine` in `src/ui/format.ts`). A building with no lot in the catalog
    shows no row.
  - `LEVEL` — three rounded pips, filled up to the building's level (see
    [`ui-style-guide.md`](../../art/ui-style-guide.md) for the pip token).
  - Residential buildings show `HOUSEHOLDS occupied/capacity` (capacity is
    residents ÷ 4, rounded up) and `RESIDENTS n`; commercial and industrial
    show `JOBS n`; a service building shows `COVERAGE kind + range`; a
    utility shows its `OUTPUT` in MW or kL.
  - `LOAD n%` on a service building that has one: the people living in
    that facility's own reach against the places it offers them, which is
    the per-building half of what the [Services panel](services-panel.md)
    shows per kind. A facility with no capacity figure, or one nothing can
    reach, has no load and the row simply doesn't render. `0%` is a real
    reading and means nobody in reach depends on it.
  - `UPKEEP ¢n/mo` always; a grown (zoned) building also shows `TAX ¢n/mo`
    — occupants × tax rate × the land-value factor, the same formula the
    economy itself uses, so the number on the panel is never a
    simplification of the real one.
- **Problems**: active problem flags render as orange chips with an icon —
  No Power, No Water, No Road, High Crime, High Pollution, Low Demand.

The panel does not show household name lists, wealth tiers, rent, or
per-building color customization — see
[Not built yet](not-built-yet.md).

