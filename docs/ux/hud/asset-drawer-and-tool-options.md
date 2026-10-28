# Asset drawer and tool options

These float just above the main dock, appearing only while a build
category or tool is active.

**Asset drawer** — opens when a dock category is active:

- A dark translucent panel with rounded top corners and a close button.
- A **sub-tab row** at the top for categories with more than one real
  group (Roads: small roads / large roads / maintenance; Zoning:
  residential / commercial / industrial / agriculture / mixed-use /
  de-zone, the industrial tab holding the light and the heavy zone). A
  category with only one group renders no tab row at all.
- A **card grid** below: thumbnail cards roughly 96×72, each a flat-shaded
  pictogram of the item — a road's cross-section as tier-width stripes, a
  zone as a colored cell block, a building as a simple tinted silhouette —
  the item's name beneath, and a cost chip at the bottom right (zones
  carry no cost chip, since zoning itself is free). The name is cut to the
  card's width, so every card carries its full name as a tooltip. A
  selected card gets the accent border-and-fill treatment; a card gated by
  milestone renders at 40% opacity with a lock icon, and its tooltip adds
  the milestone that unlocks it after the name (see
  [`interaction.md`](../interaction.md) for the disabled-vs-gated distinction).
- A selected card is always on the sub-tab in view. The drawer opens on the
  sub-tab holding the selected tool, and opening a sub-tab that does not hold
  it puts the tool down (back to select), so no card is left selected out of
  sight with its options still on screen.
- The roads drawer shows its tool options beside the cards, and only while a
  road is selected, as panels in the same card treatment rather than a
  separate floating panel:
  - **Drawing** — path mode (`Straight`, `L-path`, `Grid` — not offered
    for a motorway — or `Curve`), three snap
    toggles (a 90° lock; `Guide`, which pulls a drag into line with a
    road it nearly continues; and `Roads`, on by default, which snaps a drag
    onto the roads it reaches and joins it to them, or with it off lays the
    road as a road of its own — see
    [Snapping to roads](../interaction.md#snapping-to-roads)), elevation (`Raise`/`Lower`, reading `Ground`
    or a meter height, up to the bridge deck limit), and whether a drag
    replaces whatever road is already there.
  - **Carriageway** — lane count, median or turn lane, posted speed, and
    the width the section adds up to against the tile (or the two-tile
    corridor).
  - **Kerbside** — parking and bike lane sides, the footway toggle, and,
    while either kerb parks, the parking style: `Parallel`, `Angled 60°`
    (backed in) or `Head-in 90°`. The deeper styles widen the road, so a
    style that would overrun the tile is disabled with the reason.
  - **Transit** — bus lane sides and the tramway.
  - **Sound wall** — on a motorway or a ramp only: which sides carry a noise
    wall, and, while one does, its height (3, 4.5 or 6 m), each height's
    tooltip naming the noise it cuts.

  A panel or row appears only where the selected road's class admits what it
  sets. Of what is offered, a choice that would compose a road the tool
  refuses — more lanes than the class runs, or wider than the tile or
  corridor — is disabled, with the reason as its tooltip, and opens again as
  soon as another choice makes room for it. The choice already made is never
  disabled.

- The **Roundabout** card in the Small tab lays a compact roundabout on a
  street junction ([roundabouts](../../specs/roundabouts.md)).
  Like the interchange it is placed, not drawn, and has no panel of its own:
  hovering a junction previews the 2×2 block on the quarter of its tile the
  pointer is nearest, with the cost of the corner tiles it lays on the cursor,
  or the reason it cannot go there. Its card carries no cost chip.
- The **Interchange** card in the Highway tab lays a whole interchange on a
  motorway ([interchanges](../../specs/interchanges.md)). It is
  not drawn but placed, so none of a drawn road's panels apply; its own
  **Interchange** panel picks the **form** (Diamond, Partial cloverleaf,
  Cloverleaf) and the **crossing** road (Two-lane, Four-lane). Its card
  carries no cost chip, since an interchange costs the roads it lays: the
  cursor quotes that total over the motorway before the click, or says why it
  cannot go there.

**Tool options panel** — a small floating panel to the left of the drawer,
rendered only for terraform tools (brush radius, strength, and — for the
Level tool — the sampled target height). Road options used to live here
too; they moved into the roads drawer's own header above, and a second
floating panel beside it would have been chrome for its own sake. Zone
tools have exactly one real mode (`Rect`) and Bulldoze is `Rect`-only, so
neither renders an options panel at all.

