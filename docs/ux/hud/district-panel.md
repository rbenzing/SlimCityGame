# District panel

Floating at the left, just below the corner-button row — the same slot
the transit lines panel below also uses. It opens while the district
paint tool is in hand (picked from the Districts drawer, not merely by
opening that drawer) or while the Districts infoview lens is on, and
carries no close button of its own: it disappears again once neither
condition holds.

- **Header**: the districts icon and the "Districts" label.
- **Paint district**: a chip per district that already exists, each a
  color swatch in the district's own paint color plus its name; clicking
  one makes it the paint target. A trailing `+ New` chip always offers
  the next free id — once picked, the chip itself shows that pending id
  (e.g. `+ New (3)`) and takes the accent fill, since nothing has actually
  been painted with it yet. On a fresh city, with nothing painted at all,
  id 1 is already the pending selection.
- **Policies**: labeled with whichever district id is currently the paint
  target. Four independent toggles — Low Tax, High Tax, No Heavy Traffic,
  Green Energy — each a pill switch; toggling one sends the change and
  flips the local reading at once, ahead of the worker's own confirmation.
  None are enabled for a district nobody has touched yet. See
  [progression.md](../../game-design/progression.md#districts-and-policies) for
  what each policy actually changes.

