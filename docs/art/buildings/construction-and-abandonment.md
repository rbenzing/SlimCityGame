# Construction and abandonment

A building under construction is drawn as a building site, and its stage is
read without a label `[R-render-039]`. Drawn as a squat grey copy of itself,
a site showed neither what was going up nor how far it had got, and a house
read as a hole in its lot.

| Progress     | The site shows                                                                   |
| ------------ | -------------------------------------------------------------------------------- |
| under 0.15   | graded earth over the whole footprint, inside a site fence                       |
| 0.15 to 0.30 | a concrete slab where the body will stand                                        |
| 0.30 to 0.75 | an open frame rising to the building's own height, in at most five lifts         |
| from 0.75    | sheathed walls with their openings cut; scaffold on one face above two storeys; a crane above eight |

A site is never bare ground round a box. From the first stage a site
cabin, a skip and a portable toilet stand inside the fence where the lot
has ground free of the body, largest piece first, gathered in one back
corner, none on the body's footprint or across the gate. A house's site
has the skip and the toilet only. A lot of 2,000 m² or more also holds a
spoil heap beside the body until the frame rises. The open frame carries a guardrail at every deck's edge, the scaffold
one at every platform, and the sheathed walls show a dark, unglazed opening
to each bay of each storey and a door opening on the street face. A
building tall enough for a crane has a hoist on one face.

| Figure          | Value                     | Source                                                    |
| --------------- | ------------------------- | --------------------------------------------------------- |
| Site fence      | 1.8 m high, 3.66 m panels | the trade's 6 ft by 12 ft temporary chain-link panel      |
| Storey          | 3.2 m                     | `FLOOR_HEIGHT_METERS` `[R-render-013]`                    |
| Slab            | 0.3 m                     | dial                                                      |
| Timber frame    | up to 4 storeys           | dial: steel or concrete above, by the building's id       |
| Scaffold        | above 2 storeys           | dial                                                      |
| Tower crane     | above 8 storeys           | dial                                                      |
| Stud and column | 0.25 m and 0.5 m          | drawn oversize so a frame reads at the default camera     |
| Guardrail       | 1.07 m to its top rail    | 29 CFR 1926.502(b)(1): 42 in; a scaffold's is 38 to 45 in |
| Site cabin      | 6.1 × 2.4 m, 2.6 m high   | a hirer's 8 by 20 ft office; the height is a dial         |
| Skip            | 6.7 × 2.4 m, 1.4 m high   | hauliers' 20 yd roll-off, 22 × 8 × 4.5 ft                 |
| Portable toilet | 1.2 × 1.2 m, 2.3 m high   | a hirer's standard unit, 4 × 4 × 7.5 ft                   |
| Hoist           | car 1.5 × 3.2 m, 2.3 m high | a maker's twin-mast car, 1.5 m wide and 2.8 to 5 m long |
| Wall opening    | one a bay a storey, half a bay wide, sill 0.9 m, head 2.1 m | dial                    |
| Clearances      | 1 m from the body, the fence and each other; a 6 m gate strip | dial                  |
| Spoil heap      | 6 × 4 m, 1.5 m high       | dial                                                      |

The stage comes from the sim's own construction progress. The sim sends it
only when the picture changes (`pictureKey` in
`src/shared/constructionstages.ts`): three stage changes and up to five
frame lifts a building. A progress-only update reaches the site renderer
and nothing else (`withoutProgressOnly` in `src/render/progressdelta.ts`),
so a growing city pays nothing more for it `[R-render-037]`. The finished
building replaces the site. A farm keeps its low barn while it builds.

An Abandoned building is boarded: its window cells go dark and its walls
desaturate, and — unlike an Active building — it stays fully dark at night,
because a lit window is the one signal that a building is Active (see
[lighting.md](../../visual-render/lighting.md)). Both Constructing and
Abandoned buildings park zero cars, so an idle lot is legible on sight (see
[props-and-vehicles.md](../props-and-vehicles/README.md)).
