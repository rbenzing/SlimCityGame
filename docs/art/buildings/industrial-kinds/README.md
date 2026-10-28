# Industrial kinds

| Kind           | Zone  | Body                                           | Height (m)       | Parts                       | Props                    |
| -------------- | ----- | ---------------------------------------------- | ---------------- | --------------------------- | ------------------------ |
| Workshop       | light | 13.6 m per tile (2×2, 3×2, 3×3)                | 6.1              | roller doors at grade       | none                     |
| Warehouse      | light | 13.6 m per tile (3×3, 4×3, 5×4)                | 7.3 / 9.8 / 12.2 | loading dock, roll-up doors | none                     |
| Factory        | light | 13.6 m per tile (2×3, 3×3, 4×3)                | 6.1 / 7.3 / 7.3  | monitor roof                | none                     |
| Flex / R&D     | light | 55% of the lot each way (2×2, 3×2, 3×4)        | 6.4 / 6.4 / 9.6  | roof array                  | none                     |
| Food plant     | heavy | 13.6 m per tile (3×3, 4×3, 5×4)                | 8 / 9 / 10       | loading dock, roll-up doors | tall stack, silo cluster |
| Chemical plant | heavy | 50% of the lot each way (3×3, 4×4, 5×4)        | 10 / 12 / 15     | tank farm behind the body   | tall stack               |
| Steelworks     | heavy | 13.6 m per tile, long and shallow (3×3 to 5×3) | 12 / 15 / 18     | monitor roof                | tall stack               |
| Paper mill     | heavy | 13.6 m per tile (3×3, 4×4, 5×4)                | 10 / 13 / 15     | monitor roof, tank farm     | tall stack               |

A warehouse's heights are the clear heights of its generation — 24, 32 and
40 ft — and the flex building's are two and three storeys; the rest are the
ceiling heights of the type (ULI: light manufacturing 14–24 ft clear, heavy
16–60 ft). A tank farm is three cylinders 6 m across and 5 m tall standing
2 m off the wall opposite the street, in the yard the body leaves behind
it; the roller doors of a workshop stand on the ground, where a warehouse's
stand on its dock. The tall stack is 12 m to the kindless works' 6. Every
other part is the shared kit's box, in the chart's colours: tanks in white
plaster like the silos.

**What tells the kinds apart, at 40 m.** The second pass
([rci-kits.md](../../../specs/rci-kits.md),
sources there) gives each industrial kind its own body material and roof
and the yard object that names it; the three-colour pale palette under one
grey roof goes. The parts map carries every part listed here.

| Kind           | Body materials (chart)                                                                                             | Roof            | The parts that identify it, sized                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workshop       | `ribbedStone`, `ribbedAsh`, `ribbedWhite`; a 2.4 m wainscot in `ribbedRed`, `ribbedSlate` or `ribbedGreen`         | `galvanised`    | the two-tone shed; roll-up doors 3.05 m at grade; a glazed office front on the street                                                                                                               |
| Flex / R&D     | as the workshop, the office front two storeys of `tintedGlass`                                                     | `galvanised`    | the glass front; one or two grade doors at the back                                                                                                                                                 |
| Warehouse      | `tiltUpWhite`, `tiltUpGrey` with a 2.4 m `tiltBandBlue` or `tiltBandRed` at the top third, reveal joints every 8 m | `whiteMembrane` | the dock bank on 4 m centres with bumpers and a wall pack per door; a 16 m trailer at one door in three; a glazed office corner; the concrete apron pale, the court dark; a guard booth at the gate |
| Factory        | `ribbedBlue`, `concreteBlock`                                                                                      | `greyMembrane`  | a baghouse 6 m on a frame and a 12 m stack in `galvanised`; a 4 m silo; a fenced material yard; a monitor roof only on level 1, the old plant                                                       |
| Food plant     | `insulatedWhite`, flat, no windows                                                                                 | `whiteMembrane` | two to four 2.4 m condensers and a penthouse on the roof; two 4 × 15 m `aluminiumClad` silos beside it; the dock bank                                                                               |
| Chemical plant | `insulatedWhite`, `concreteBlock`                                                                                  | `greyMembrane`  | the tank farm inside a 1 m `concreteDike`; a pipe rack 5 m up on 6 m portals in `rackSteel`; a 30 m flare; a cooling tower                                                                          |
| Steelworks     | `oxideRed`, `darkPanel`                                                                                            | `darkPanel`     | the 30 m melt shop with a ridge vent; a 36 m baghouse stack; an open scrap yard under a 10 m gantry                                                                                                 |
| Paper mill     | `ribbedAsh`, `insulatedWhite`                                                                                      | `greyMembrane`  | a chip pile 12 m high in `woodChip`; the monitor hall; a recovery boiler with a 90 m stack; tanks                                                                                                   |

The new chart entries (`ribbedStone`, `ribbedAsh`, `ribbedWhite`,
`ribbedRed`, `ribbedSlate`, `ribbedGreen`, `ribbedBlue`, `galvanised`,
`tiltUpWhite`, `tiltUpGrey`, `tiltBandBlue`, `tiltBandRed`,
`concreteBlock`, `insulatedWhite`, `aluminiumClad`, `concreteDike`,
`rackSteel`, `oxideRed`, `darkPanel`, `woodChip`) are measured from swatches
under the chart's rules; the metal-building names follow the makers'
standard colours (polar white, light stone, ash grey, rustic red, burnished
slate, evergreen, aztec blue). The steel and paper mills' colours have no
source and are the game's own.

## Sections

| Section | Size |
| --- | --- |
| [The industrial kit's parts](the-industrial-kits-parts.md) | 9,541 B |
| [The farmstead's parts](the-farmsteads-parts.md) | 2,256 B |
