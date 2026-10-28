# The conversion

A catalog `footprint` is in tiles and a catalog `height` is in metres, and the
renderer turns both into real floor area:

- A body fills `DEFAULT_BODY_M_PER_TILE = 13.6 m` of each 20 m tile it stands
  on, so **one tile of footprint is a 185 m² floor plate** (13.6²).
- A storey is 3.2 m, so **storeys = height ÷ 3.2**.

Which gives the only formula on this page:

```
gross floor area (m²) = footprint.w × footprint.d × 185 × (height ÷ 3.2)
```

A 2×2 lot 12 m tall would be 740 m² per floor over 3.75 storeys — about
2,800 m² gross; the stations were once that tall and are 6.4 m now. That is the
number a code figure has to be checked against, not the tile count, and it is
why a "small" civic building at this scale is still a substantial building.

Where a lot is set by its site, not its floor — bays and an apron, a car park —
the catalog's formula over-reads the floor, and the building's stated floor is
what its power and water are drawn from. The stations below are the case.

