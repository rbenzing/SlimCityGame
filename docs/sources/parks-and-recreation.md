# Parks and recreation — derivations and sources

The research behind [the spec](../specs/parks-and-recreation.md). Every figure is derived from a published municipal standard and our own scale ([art](../art/README.md)): tiles are 20 m, so **one tile is 400 m²** and **one hectare is 25 tiles**. The standards are the Fields in Trust benchmark guidelines from _Guidance for Outdoor Sport and Play: Beyond the Six Acre Standard_ (2015), which give per typology a quantity in hectares per 1,000 population and a maximum walking distance.

## Quantity, converted to capacity

| Typology (rung)                         | ha / 1,000 | m² / res. | Res. / tile | ÷ 5 | Tiles | **Capacity** |
| --------------------------------------- | ---------- | --------- | ----------- | --- | ----- | ------------ |
| Equipped play (Pocket Park)             | 0.25       | 2.5       | 160         | 32  | 1     | **32**       |
| Other outdoor provision (Civic Plaza)   | 0.30       | 3.0       | 133         | 27  | 25    | **675**      |
| Amenity greenspace (Neighbourhood Park) | 0.60       | 6.0       | 67          | 13  | 81    | **1,053**    |
| Parks and gardens (District Park)       | 0.80       | 8.0       | 50          | 10  | 400   | **4,000**    |
| All outdoor sports (Sports Ground)      | 1.60       | 16.0      | 25          | 5   | 24    | **120**      |

Residents per tile is 400 m² ÷ the m² each resident is owed, and it is the whole reason the rungs differ: the standard asks six times as much sports ground per head as equipped play, so a tile of pitch serves a sixth as many people. **Dividing by five is arithmetic, not a fudge.** The simulation has one `park` kind, and pooling the five typologies into it overstates capacity fivefold: a city provided exactly to standard would hold five separate provisions and a pooled load of 0.2. Dividing restores 1.0: for 1,000 residents at standard, 6 tiles of pocket park, 8 of plaza, 15 of neighbourhood park, 20 of district park and 40 of sports ground is 89 tiles, and 192+216+195+200+200 = 1,003 of capacity. **The headline figure** is the Six Acre Standard the guidance is named for: 2.4 ha per 1,000 population, so 2.4 × 25 tiles/ha = **60 tiles per 1,000 residents**, which is what the panel reports against. Capacity scales with the tiles a rung really covers, so a forty-acre district park carries four thousand people's provision, as forty acres do. A city of 8,000 needs about 480 tiles.

## Walking distance, converted to range

The guidance's distances are pedestrian route distances; it quotes 1,200 m as "15 minutes", which is 1.33 m/s, ordinary walking speed. Our coverage BFS is also route distance along roads, so the conversion is a division with no fudge factor. Coverage then radiates 2 tiles around each road tile it reaches (the walk from road to gate), so `range` is the standard minus those 2 tiles.

| Rung               | Standard | ÷ 20 m    | − 2 radiated | `range` |
| ------------------ | -------- | --------- | ------------ | ------- |
| Pocket Park (LEAP) | 400 m    | 20        | 18           | **18**  |
| Neighbourhood Park | 480 m    | 24        | 22           | **22**  |
| Civic Plaza        | 700 m    | 35        | 33           | **33**  |
| District Park      | 710 m    | 35.5 → 36 | 34           | **34**  |
| Sports Ground      | 1,200 m  | 60        | 58           | **58**  |

**Does `range: 16` survive? No, by one tile.** 16 plus the 2 radiated is 18 tiles, or 360 m, against a 400 m doorstep standard. The correction is `range: 18`, which lands on 400 m exactly: a small error, invisible until now because nothing checked a park's reach against anything.

## Sizes, from ground rather than floor area

Most of this feature is ground, not floor area, so the gross-floor-area formula in [civic massing](../art/civic-massing/README.md) does not apply to four of the five rungs: there is no floor, and its six-tile siting rule is a building's rule, from which open space is exempt. Their sizes are the real sizes of the US park types, from the NRPA park classification (Mertes & Hall, _Park, Recreation, Open Space and Greenway Guidelines_, as cities cite it: mini-park 2,500 sq ft to 1 acre, neighbourhood park 5 to 10 acres, community park 30 to 50 acres: [Wichita Falls](https://www.wichitafallstx.gov/DocumentView.aspx?DID=5509), [Little Rock](https://LittleRock.gov/media/20749/classifications-and-land-needs-assessment-part-1.pdf)), and for the pitch a dimension. One tile is 400 m², 0.099 acre; ten tiles are an acre.

| Rung               | Size  | Acres | Derivation |
| ------------------ | ----- | ----- | ---------- |
| Pocket Park        | 1×1   | 0.1   | The Fields in Trust minimum activity zone for a Locally Equipped Area for Play is 400 m², one tile, inside the NRPA mini-park's range. Unchanged, so every save's pocket parks stand. |
| Civic Plaza        | 5×5   | 2.5   | A real city square: a sample of historic squares averages 2.45 acres ([Montgomery County](https://www.montgomeryplanning.org/community/ssgreenspace/documents/SSGreenSpaceGuidelinesAppendix4.pdf)), Union Square is 2.6, Campus Martius 1.6. 100 m across. |
| Neighbourhood Park | 9×9   | 8.0   | NRPA's 5 to 10 acres, toward the top of the range so a 1,000 m² play zone, a lawn and a treed edge all fit. 180 m across. |
| District Park      | 20×20 | 39.5  | NRPA's community park, 30 to 50 acres, at 40. 400 m across, a quarter of a square mile: the park a district is laid out around. |
| Sports Ground      | 6×4   | 2.4   | Sized by the pitch. FIFA's recommended field of play is 105 m × 68 m and The FA requires a 3 m minimum run-off all round, giving 111 m × 74 m graded = 5.55 × 3.7 tiles, 2.03 acres; the pavilion and its apron take the rest. The pitch alone is 5.25 tiles long, so this rung cannot be small. |

The only floor area is the sports ground's changing pavilion: 36 occupants × 4.6 m² (the vocational-room factor) = 166 m² net, ÷ 0.65 efficiency = 255 m² gross, over one storey = 255 ÷ 185 = 1.4 tiles, so a 2×1 block 3.2 m tall. The siting rule that keeps a civic building under six tiles of frontage does not apply to a park; a district park at the published 20 ha was rejected on the grid all the same: 500 tiles and 22 tiles of frontage.

## Cost

Each rung is priced off the pocket park by what the real thing costs, the player's standing choice for civic buildings. The anchor: a 400 m² equipped pocket park is about $366,000 to build (Lewisville, Texas, 6,612 sq ft for $556,000 in 2025–26, $84 a square foot, [TDLR](https://www.tdlr.texas.gov/TABS/Search/Print/TABS2025024601)), and about $6,000 a year to keep (a playground's $2,500–7,500 plus the NRPA median of $9,470 an acre, [NRPA 2026 Agency Performance Review](https://www.nrpa.org/globalassets/research/research-reports/2026-agency-performance-review.pdf)), so ¢400 and ¢20 stand for those. The rest scale by sourced cost per acre times the rung's real acreage, and by the NRPA median upkeep per acre.

| Rung               | Build, real | × pocket | Cost   | Keep, real | × pocket | Upkeep |
| ------------------ | ----------- | -------- | ------ | ---------- | -------- | ------ |
| Pocket Park        | $366k       | 1        | 400    | $6k        | 1        | 20     |
| Civic Plaza        | 2.5 ac × $5.2M/ac (Lakewood, Washington, Colonial Plaza: 18,972 sq ft of pavers, seat walls and lighting, engineer's estimate $2.25M in 2019, [City of Lakewood](https://cityoflakewood.us/wp-content/uploads/2019/04/Colonial-Plaza-presentation.pdf)) = $13.0M | 35.5 | 14,200 | 2.5 ac × $9,470 = $24k (the NRPA median; no hardscape figure was found) | 4 | 80 |
| Neighbourhood Park | 8.0 ac × $580k/ac (Dixon, California, park impact fee nexus study 2023, neighbourhood parks, [City of Dixon](https://www.cityofdixonca.gov/media/Parks%20Masterplan/Dixon%20Park%20Impact%20Fee%20Nexus%20Study%20December%202023.pdf); Hayward 2019 puts local parks at $1.1M/ac) = $4.6M | 12.7 | 5,100 | 8.0 ac × $9,470 = $76k | 12.6 | 250 |
| District Park      | 39.5 ac × $1.02M/ac (Dixon 2023, community parks) = $40.2M | 110 | 44,000 | 39.5 ac × $9,470 = $374k | 62 | 1,250 |
| Sports Ground      | a natural-grass field, $610k (2026 vendor range $400–820k, [Sports Venue Calculator](https://sportsvenuecalculator.com/knowledge/artificial-turf-field/how-much-does-a-turf-field-cost/)), plus a prefabricated restroom pavilion, $650k (Coconino County 2025, [Arizona Daily Sun](https://azdailysun.com/eedition/page-a3/page_306dc3d7-a1b2-5775-926c-b6362c1ef48c.html)) = $1.26M | 3.4 | 1,400 | a grass field's $27–35k a year plus the pavilion, about $36k | 6 | 120 |

The ranking is the real one: paving is the dearest ground per acre a city buys, developed parkland the cheapest, and a forty-acre park costs what a forty-acre park costs. Unlocks follow the ladder and are stated, not derived: the pocket park at the start, the neighbourhood park at the first milestone, the sports ground and the plaza at the second, the district park at the third.

## Strength and land-value bonus

| Rung               | Premium | `strength` | `landValueBonus` |
| ------------------ | ------- | ---------- | ---------------- |
| Pocket Park        | 8%      | 80         | 40               |
| Civic Plaza        | 5%      | 50         | 30               |
| Neighbourhood Park | 10%     | 100        | 60               |
| District Park      | 20%     | 200        | 100              |
| Sports Ground      | 5%      | 50         | 40               |

`strength` has no municipal standard. It is the size of the land-value uplift, and the published evidence is the hedonic-pricing literature on park proximity: roughly a 20% premium for property abutting a large well-kept park, falling with distance and with active use. 20% of the 255-byte field, against the `/4` the coverage blend applies, gives 204 for a district park, and the rungs scale by the premium each would command. The pocket park's existing 80 falls out unchanged: evidence the number was never wrong, only its range. `landValueBonus` seeds the diffusion from a facility's own tiles; it too is a dial with no standard. The affordability override does not bite: the pocket park at 400 is affordable at milestone 0, and the first real rung, the neighbourhood park at 5,100, is a town's purchase, priced like its clinic and school.

## Prop counts

Trees = perimeter ÷ 24 m; benches = path length ÷ 50 m, the resting-place interval pedestrian accessibility guidance uses, floored at 2. A 10,000-resident city at standard holds about 890 tiles of park, so roughly **900 tree instances and 240 benches**, one `InstancedMesh` each, about 72k triangles. An area-scaled rule would have put 75 trees on every district park.

| Rung               | Perimeter | Trees            | Benches |
| ------------------ | --------- | ---------------- | ------- |
| Pocket Park        | 80 m      | 2–3              | 2       |
| Civic Plaza        | 400 m     | 17 (in planters) | 8       |
| Neighbourhood Park | 720 m     | 30               | 7       |
| District Park      | 1,600 m   | 67 + 8 specimens | 16      |
| Sports Ground      | 400 m     | 17 (long sides)  | 2       |

Draw calls: 3 ground pools + `parkTree` + `parkBench` + `pitchGoal` + `pavilionBlock` + `playFrame` = **8 draw calls plus one per draped park**, against a frame cap of roughly 300.

## Looked at in a browser

1. All five rungs side by side at the default camera pitch. Each must be identifiable without its label: a square with a cross path; paving with planters; a lawn with a treed edge; open ground ringed with trees; a marked pitch with a pavilion at the edge.
2. The sports ground with a 4.0 m car and a 1.75 m pedestrian on the adjacent road. The pitch must read as 105 m long, five and a quarter tiles, with the 3 m run-off visible as unmarked turf inside the footprint. A pitch reading as a tennis court is what this catches.
3. A district park at load 0.5 and load 3, same camera and light. The worn state must be obviously different, and read as wear rather than a bug.
4. A district park abutting a road, edge-on and close. The plate must sit flush, not float above the footway or z-fight with it.
5. The land-value overlay over one district park, and over six pocket parks on the same ground. Under the old blend the six dots won; under the new one the single park must visibly win.
6. A plaza between two towers at the default pitch. It must read as a public square; if it reads as an unzoned lot, the paving and planters are wrong.

## Why the old pocket park was a sticker

`small-park` was one tile, cost 400, and added land value at its footprint and, additively, across everything within 16 tiles of road, so two overlapping pocket parks stacked.
