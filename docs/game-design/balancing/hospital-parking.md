# Hospital parking

Every figure is derived in [specs/healthcare-and-death-care.md](../../specs/healthcare-and-death-care.md).

| Constant          | Value                       | Meaning                                                                                                                                     | File                        |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| spaces per bed    | 2                           | The common US zoning minimum for a hospital: 144 spaces for 72 beds.                                                                        | `src/render/utilitykits.ts` |
| deck              | 3×2 tiles, 2 levels, 3.35 m | Ground and roof, 11 ft floor to floor, over the 2.49 m a van's route needs (ADA); 40.48 m across, half a metre past its tiles.              | `src/render/utilitykits.ts` |
| stall, aisle      | 2.74 × 5.49 m, 7.32 m       | 9 × 18 ft stalls on 24 ft two-way aisles (the 60 ft module): 72 a level after the ramp, cross-aisle and cores, 144 in all; 33.7 m² a space. | `src/render/utilitykits.ts` |
| accessible spaces | 5, 1 van                    | ADA 2010 §208.2 for 101–150 spaces provided (144 + 5), 1 van in 6; car 2.44 m, van 3.35 m, aisle 1.52 m.                                    | `src/shared/parkingcode.ts` |

