# Lots and land: sources and derivations

The research behind [the lots-and-land spec](../specs/lots-and-land.md). A tile is
20 m square: 400 m², 4,306 sq ft, 0.099 acre, 65.6 ft a side. The figures below
are what American zoning codes and the building survey say, and the tile count
each one lands on.

## Residential standards

| Class, as codes name it         | Minimum lot the codes set                         | Width × depth the codes set         | On the tile       | m²    | Acre |
| ------------------------------- | ------------------------------------------------- | ----------------------------------- | ----------------- | ----- | ---- |
| Small lot / cottage             | 1,400–3,500 sq ft (Houston inside the Loop), 2,500–4,000 in small-lot districts | 25–40 ft × 80–100 ft | **1×1**           | 400   | 0.10 |
| Standard single-family (R-1)    | 5,000–7,200 sq ft (Hatch 5,000; Holtville 6,000; Redlands 7,200) | 50–60 ft × 100 ft    | **1×2**           | 800   | 0.20 |
| Large lot (R-1-15000 class)     | 12,000–15,000 sq ft                               | 80–100 ft × 150 ft                  | **2×2**           | 1,600 | 0.40 |
| Estate (R-1A, 20,000; RE, ½–1 acre) | 20,000–43,560 sq ft (Boise R-1A 20,000; Benbrook RE one acre; Troy 30–40,000, 150 ft wide) | 150 ft × 150–300 ft | **2×3** or **3×3** | 2,400–3,600 | 0.6–0.9 |

The survey agrees with the middle of that table: the median new detached house
in 2022 sat on **8,524 sq ft**, 792 m², which is the 1×2 lot to within one
percent; 65% of new houses in 2023 were on lots under 9,000 sq ft and 40% under
7,000, the highest shares on record, so the normal lot is getting smaller, not
larger
([NAHB on the Census Survey of Construction](https://eyeonhousing.org/2024/07/share-of-smaller-lots-is-at-new-high/)).
Houston cut its by-right minimum from 5,000 to 3,500 sq ft in 1998 and allows
1,400 sq ft lots in qualifying subdivisions, and nearly 80,000 houses have gone
up on small lots since
([Mercatus](https://mercatus.org/research/policy-briefs/learning-houstons-townhouse-reforms),
[APA](https://planning.org/knowledgebase/resource/9293032)): the half lot is not
a stylised idea, it is where starter homes are built. At the other end, estate
districts run from 20,000 sq ft to five acres
([Boise R-1A](https://cityofboise.org/departments/planning-and-development-services/planning/zoning/zoning-districts/residential-large-lot/),
[Benbrook RE](https://www.zoneomics.com/code/benbrook-TX/chapter_8)); the game
stops at 0.9 acre, since a five-acre lot is a farm's business.

**Setbacks and coverage.** The common single-family envelope is a 20–25 ft front
yard, 5 ft sides and a 20 ft rear, with lot coverage capped at 40–50%
([Mesa, Winter Park, Clyde Hill](https://www.clydehill.org/departments/building/zoning-code---what-can-i-build-on-my-lot-/));
Houston allows 65–80% on its small lots. On a 1×2 lot that is a house of up to
400 m² of plate behind a 7 m front yard, which is what the house kit's
front-yard rule already draws
([building-types.md](../game-design/features/building-types.md#what-the-player-sees)).

**Blocks.** Subdivision regulations plat blocks no longer than 600 ft without a
mid-block path and never over 1,320 ft, two tiers of lots deep with the block at
least 220 ft wide, and lots no deeper than 2.5 to 3 times their width
([Elyria](https://codelibrary.amlegal.com/codes/elyria/latest/elyria_oh/0-0-0-82287),
[Stacy MN](https://codelibrary.amlegal.com/codes/stacy/latest/stacy_mn/0-0-0-18467)).
On the tile: blocks of 9 to 20 tiles between cross streets, lots two deep either
side, and no lot deeper than three tiles for one wide. "Two tiers of lots deep"
is one tier fronting each of the block's two streets, back to back; it is never
two tiers off the same street, since a lot that does not front a street is not a
lot. The game's zoning depth of three tiles from the road holds one tier: a 1×2
normal lot with a tile of garden behind it, or a 2×3 estate reaching to the
depth.

## Commercial standards

| Class                         | Minimum lot the codes set                     | Frontage | FAR            | On the tile   |
| ----------------------------- | --------------------------------------------- | -------- | -------------- | ------------- |
| Neighbourhood commercial (C-1) | 8,000 sq ft, capped at 80,000 in some codes   | 70 ft    | 0.05–0.5       | 1×2 to 2×2    |
| General commercial (C-2)      | 8,000 sq ft, no cap; "Main Street" zero front setback | 70 ft | up to 1.5, 2.5 mixed | 2×2 up |
| Strip and supermarket         | by parking: 4–5 stalls per 1,000 sq ft puts the lot at 3–4 × the floor | — | 0.2–0.3 | 3×2 to 5×4 |

([Montgomery County C-2](https://www.montgomeryplanning.org/info/documents/C2_001.pdf),
[Millwood C-1/C-2](https://www.zoneomics.com/code/millwood-WA/chapter_9),
[Burbank](https://www.zoneomics.com/code/burbank-CA/chapter_7)). The commercial
kinds take a corner shop on 1×1, a store on 2×2, the strip on 3×2 to 5×2 and the
supermarket on 3×3 to 5×4, but those footprints were never sized from parking:
every body fills 13.6 m of each lot tile, 46% of its lot, not the 0.2–0.3
coverage above. Measured against its code, every shop, restaurant, strip and
supermarket lot is short of the spaces its floor asks for; the lots are now drawn
to code and the shortfall belongs to
[parking-to-code.md](../specs/parking-to-code.md). The lots decide
where a footprint may stand, never its size.

## Industrial standards

| Class                        | Minimum lot the codes set                     | Setbacks                       | On the tile |
| ---------------------------- | --------------------------------------------- | ------------------------------ | ----------- |
| Light industrial (I-1)       | 5,000 sq ft to 1 acre; 1 acre common          | front 25–30 ft, side 10, rear 20–25 | 2×2 to 2×5 |
| Heavy industrial (I-2)       | 1–2 acres; 2 acres common                     | front 35–100 ft, side and rear 50 | 5×4 up   |

([Anchorage I-1](https://www.muni.org/Departments/OCPD/Planning/zoning/Pages/i.aspx),
[Calvert County](https://calvertcountymd.gov/DocumentCenter/View/42270/A8-Industrial-Districts),
[Naples UT](https://naplescityut.gov/wp-content/uploads/2021/02/02-28-Industrial-Zone-I-2020-11-12.pdf)).
The industrial kinds sit on 2×2 to 5×4, an acre at the top, and the heavy kinds
on 4×4 and up; a 2-acre heavy minimum would be 5×4 at the least. The standard is
recorded and the heavy footprints are left as they stand: raising the heavy
industrial minimum to 5×4, two acres, where it is 4×4, is proposed and not built.

## Frontage lots for commercial and dense kinds

Real sites intensify by demolishing and assembling neighbouring lots, not by
growing in place
([Montgomery County on land assembly](https://www.montgomerycountymd.gov/council/resources/files/res/2013/20131105_17-932.pdf)).
A change of format is a relocation or a redevelopment, and only 3–5% of stores
remodel in place a year (FMI via Supermarket News; NACS puts it at 2.8% in 2023,
[How much does it cost to build](https://www.nacsmagazine.com/Issues/May-2025/How-Much-Does-It-Cost-to-Build)).
So a level that outgrows its footprint takes more lots, and a level that does not
improves in place.

Why a normal lot. Main-street lots are 24–25 ft minimum width and 100–150 ft deep
([Petaluma SmartCode](https://petaluma.municipal.codes/SmartCode/4.80.140)), so
one normal lot, 65 ft by 130 ft, holds two or three storefronts. Fast-food and
bank pads run 0.5–1.2 acres and a filling station 1–3 acres
([Sheetz](https://www.sheetz.com/real-estate)), a few lots; a grocery-anchored
centre is one master-planned assembled site of 12–15 acres. Podium mid-rise runs
60–120 homes an acre ([WBDG](https://www.wbdg.org/node/3401)).

Worked footprints: a corner shop stands on one lot, its back half a yard; a
shopping strip (3×2) takes three lots; a grocery (3×3) takes three and the row
behind; a superstore (5×4) takes five and two rows behind.

## Row housing

A row on its normal lot (20 m frontage by 40 m deep, 0.198 acre) holds three
homes and 8 residents at every level, each home about 6 m (20–22 ft) wide: 15
homes an acre, inside the type's net 11–25. It stands 7, 9 and 11 m tall at 2, 3
and 3.5 storeys, so a taller row is more floor per home. Opticos gives units
18–25 ft wide on lots 85–120 ft deep at 2–3.5 storeys
([townhouse](https://missingmiddlehousing.com/types/townhouse/)); fee-simple
townhouse lots run 20–24 ft wide
([Alva, OK](https://codelibrary.amlegal.com/codes/alvaok/latest/alva_ok/0-0-0-12052),
[Big Timber, MT](https://www.zoneomics.com/code/big-timber-MT/chapter_16));
zoning caps a row at 4–8 units
([Garfield, NJ](https://www.zoneomics.com/code/garfield-NJ/chapter_12),
[Utah toolkit](https://luau.utah.gov/wp-content/uploads/UMH_MMH-Toolkit_NeighborhoodTypes_Central.pdf));
the median new attached home is 1,800 sq ft
([NAHB](https://www.nahb.org/blog/2020/12/where-are-the-largest-homes-built)).

Why not 4, 8 and 12. Those homes belonged to rows that grew along the street, two
homes a tile at 1×2, 1×4 and 1×6, about 20 an acre. On a fixed 20 m frontage they
would have packed four units into 20 m and tripled the density by level 3.

## Where a block starts

Each kind's first level was checked against the smallest site that kind is really
built on.

- **Mid-rise flats on one normal lot.** A five-storey walk-up on one urban lot is a
  long-standing American form, and Seattle's single-stair rule builds up to six
  storeys of flats on a 50 × 100 ft lot, four homes a floor
  ([Mercatus](https://www.mercatus.org/research/policy-briefs/seattle-special-us-citys-unique-approach-small-infill-lots));
  one such building holds 21 homes on 5,000 sq ft
  ([Sightline](https://www.sightline.org/2025/01/08/sunlight-suites-a-simple-change-could-unlock-these-beautiful-homes-photos/)).
  A normal lot is 65 × 131 ft, so the first mid-rise is five storeys on one lot,
  17 homes by the floor rule. Its second level assembles a second lot (2×2) and
  its third a 3×3.
- **Shopfront flats on one normal lot.** A main-street building is one lot wide,
  two to four storeys, shops below and flats above
  ([Petaluma SmartCode](https://petaluma.municipal.codes/SmartCode/4.80.140),
  [Parolek, form-based codes](https://newpartners.org/2012/docs/presentations//Thursday/10.30am%20-%2012pm/Thursday%202nd%20%20%2010.30%20-Noon%20%20Rural%20to%20Urban/NP12_Parolek.pdf)):
  the first is four storeys on one lot, a shop floor of 17 jobs under 10 homes,
  and it grows to 2×2 and then 3×3 as the mid-rise does.
- **The tower does not start smaller.** A residential tower is held 24–25 m from
  its neighbours and its site wants at least 130 ft (39.6 m) of frontage
  ([Vancouver West End](https://guidelines.vancouver.ca/bulletins/bulletin-west-end-tower-form-siting-setbacks.pdf),
  [Toronto](https://www.toronto.ca/legdocs/mmis/2014/te/bgrd/backgroundfile-68799.pdf)),
  two tiles: it stays 2×2, 2×2, 3×3.
- **Nor do the multiplex and the courtyard building.** They take lots 95–135 ft
  wide ([multiplex](https://missingmiddlehousing.com/?p=4283),
  [courtyard](https://missingmiddlehousing.com/?p=4286)), wider than one normal
  lot, so they keep their two lots at every level.
- **Either neighbour.** Land is assembled lot by lot from whichever owner sells
  ([Lindenthal et al., land assembly in Amsterdam](https://www.repository.cam.ac.uk/handle/1810/263523)).

## Teardown to a plex

A house is a teardown when the building is a small share of what the property is
worth. In Vancouver's single-family stock a healthy share is 60–70%; below about
10%, around a quarter of houses are replaced, and at 4% a buyer is as likely to
tear the house down as to keep it
([UBC, Dahmen and von Bergmann](https://news.ubc.ca/2017/03/10/could-this-be-the-end-of-single-family-houses-in-vancouver/)).
The houses torn down are the small old ones, and they sell for the land
([Dye and McMillen, Chicago](https://ideas.repec.org/a/eee/juecon/v61y2007i1p45-63.html)).

What the house becomes. Portland's first year of plexes in its single-dwelling
zones permitted 271 middle-housing homes, most in fourplexes, against 102 new
houses
([Portland](https://www.portland.gov/bps/planning/rip/news/2023/7/5/new-study-shows-promising-housing-production-results-residential)),
California's lot-split law found most uptake in its high-price towns
([Terner Center](https://ternercenter.berkeley.edu/research-and-policy/sb-9-turns-one-applications/)),
and Houston's townhouse rebuilds took one old house's lot each
([Cityscape](https://www.huduser.gov/PORTAL/periodicals/cityscape/vol25num2/ch8.pdf)).

The pace. About a quarter of the most at-risk Vancouver houses over some thirteen
years is about 2% a year, so each such house converts with a 2% chance a year (a
game year is 72,000 ticks).

## The acre lot

Estate districts run from half an acre to an acre and more: Boise's R-1A at
20,000 sq ft, Benbrook's RE at one acre, Troy at 30,000–40,000 sq ft and 150 ft
wide (the residential table above). The 2×3, 25,800 sq ft and 131 ft wide, is the
half-acre class; the 3×3, 197 ft by 197 ft, is the acre class. The 3×3 is 60 m by
60 m, 3,600 m² (38,750 sq ft, 0.89 acre). The zoning depth is three tiles, so
both reach it; what the acre adds is frontage.

## Medium-density multiplex sizes

A multiplex body is 13.6 m per tile capped at 24 m, so 24 × 24 m on 2×2. A duplex
body is 60% of each lot axis capped at 16 m (12 × 12 m on a half lot, 12 × 16 m on
a normal one); a fourplex 70% capped at 18 m (14 × 14 m on a half lot). A house
body on a half or a normal lot is as wide as one on a double lot, 9.5 m, never
above 85% of the lot; the estate's long side is 4.75 m per tile, and the acre's
body is 4.75 m per lot tile, 14.25 m a side, a two-storey villa of about 4,400 sq
ft.
