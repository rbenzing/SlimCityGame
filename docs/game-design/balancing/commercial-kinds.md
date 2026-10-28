# Commercial kinds

Every figure is sourced in [specs/building-types.md](../../specs/building-types.md#the-commercial-kinds).

| Constant             | Value                                                                                    | Meaning                                                                                       | File                      |
| -------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| net floor            | 80% of the plate                                                                         | Corridors, stores and plant take the rest.                                                    | `src/data/catalog.json`   |
| retail jobs          | net ÷ 17.5 m² per FTE                                                                    | HCA: shops, food stores and restaurants at 15–20 m² NIA per FTE.                              | `src/data/catalog.json`   |
| office jobs          | net ÷ 13 m² per FTE                                                                      | HCA general office.                                                                           | `src/data/catalog.json`   |
| hotel rooms and jobs | plate ÷ 52 m² a room; 1 job per 5 / 3 / 2 rooms by level                                 | DOE small hotel 43,200 sq ft over 77 rooms; HCA limited-service, mid-scale, upscale staffing. | `src/data/catalog.json`   |
| power per sq ft      | retail 16.7, food service 44.2, lodging 14.4, convenience store 53.3, office 13.6 kWh/yr | CBECS 2018, by principal building activity (the first three derived from totals over stock).  | `src/data/catalog.json`   |
| restaurant water     | 22.0 kL a day sit-down, 7.3 quick-service                                                | EPA WaterSense 5,800 gallons a day and a third of it.                                         | `src/data/catalog.json`   |
| hotel water          | 0.5 kL a room a day                                                                      | EPA 132 gallons per room, every room taken.                                                   | `src/data/catalog.json`   |
| body caps            | restaurant 24 m a side; filling-station kiosk 35% of the lot to 16 m                     | A fast-food box and a convenience store on a lot that is mostly car park and forecourt.       | `src/shared/floorarea.ts` |
| `share`              | shop 350, restaurant 286, strip 166, fuel 123, supermarket 46; office 970, hotel 107     | CBECS 2018 building counts (thousands); NACS fuel-selling stores; FMI supermarkets.           | `src/data/catalog.json`   |

