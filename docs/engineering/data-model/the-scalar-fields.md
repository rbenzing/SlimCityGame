# The scalar fields

Twelve `Uint8Array` layers, `0..255`, indexed by `FieldId`
(`src/shared/types.ts`) into `GridState.fields`; all twelve are persisted — the
first nine as the `fields[0..8]` grid layer, and the three education planes
added by v16 as `fields[9..11]`, **serialized at the end of the tile record**
and never between the first nine (see [The tile grid](the-tile-grid.md), and the
Traffic-field caveat in
[What survives a save, and what doesn't](the-tile-grid.md#what-survives-a-save-and-what-doesnt)).
`FieldSim` (`src/sim/fields.ts`) runs the simulation; the emission,
diffusion and decay formulas themselves are simulation behavior — see
the specs — but the shape below is part of the data model:

| Field       | `FieldId` | Emitted by                                                                                             | Decays       |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| `LandValue` | 0         | Its own proximity formula (pollution/water/trees), plus park coverage.                                 | 0.995/tick   |
| `Pollution` | 1         | Buildings' `pollution` stat, and incinerators' burn rate.                                              | 0.97/tick    |
| `Noise`     | 2         | Buildings' `noise` stat, and road traffic volume x tier `noiseMult`.                                   | 0.90/tick    |
| `Traffic`   | 3         | Rebuilt wholesale each pass from road-network edge volumes (not additive emission).                    | 0.92/tick    |
| `Crime`     | 4         | Ambient growth on zoned tiles below a land-value ceiling; reduced by police coverage.                  | 0.985/tick   |
| `FireRisk`  | 5         | Ambient growth on any occupied tile; reduced by fire-station coverage.                                 | 0.99/tick    |
| `Education` | 6         | Elementary school coverage only.                                                                       | 0.99/tick    |
| `Health`    | 7         | Hospital building coverage only.                                                                       | 0.99/tick    |
| `Happiness` | 8         | Not emitted into — a pure per-tile recompute from the other 8 fields each time its schedule slot runs. | not diffused |
| `MiddleEducation` | 9   | Middle school coverage only. Gates level 3 with `HighEducation` for dense housing, mixed use and local commercial. | 0.99/tick    |
| `HighEducation`   | 10  | High school coverage only.                                                                             | 0.99/tick    |
| `CollegeEducation` | 11 | College coverage only. Gates level 3 of high-density commercial.                                       | 0.99/tick    |

Every field but `Happiness` diffuses on its own staggered schedule via the
same 4-neighbor (von Neumann) blend — 0.6 self weight, 0.4 neighbor average —
before its own decay multiplier is applied; `Happiness` never diffuses, it
is only ever recomputed in place.
