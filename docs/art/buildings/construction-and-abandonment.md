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
| from 0.75    | sheathed walls; scaffold on one face above two storeys; a crane above eight      |

| Figure          | Value                     | Source                                                    |
| --------------- | ------------------------- | --------------------------------------------------------- |
| Site fence      | 1.8 m high, 3.66 m panels | the trade's 6 ft by 12 ft temporary chain-link panel      |
| Storey          | 3.2 m                     | `FLOOR_HEIGHT_METERS` `[R-render-013]`                    |
| Slab            | 0.3 m                     | dial                                                      |
| Timber frame    | up to 4 storeys           | dial: steel or concrete above, by the building's id       |
| Scaffold        | above 2 storeys           | dial                                                      |
| Tower crane     | above 8 storeys           | dial                                                      |
| Stud and column | 0.25 m and 0.5 m          | drawn oversize so a frame reads at the default camera     |

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
