# Airports — derivations and sources

The research behind [the spec](../specs/airports.md). The three FAA circulars are held in [Road Guides](../Road%20Guides/README.md): AC 150/5300-13B Change 1 (_Airport Design_), AC 150/5340-1M Change 1 (_Standards for Airport Markings_) and AC 150/5325-4B (_Runway Length Requirements for Airport Design_). A figure cited to one of them can be opened and read. One foot is 0.3048 m.

## Runway length

| Rung          | Length          | Where it comes from                                                                                                                                              |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Airfield      | 2,700 ft, 823 m | AC 150/5325-4B Figure 2-1: 95% of the small-airplane fleet (under 10 seats) at sea level and 59 °F. The whole fleet needs 3,200 ft.                              |
| Regional      | 5,000 ft, 1,524 m | The same circular, airplanes over 12,500 lb up to 60,000 lb: "at least 5,000-foot (1,524 m) runways" at sea level and 59 °F.                                    |
| International | 10,000 ft, 3,048 m | Real runways, below. The circular sends airplanes over 60,000 lb to their manufacturers' airport planning manuals and states no length.                       |

Runways at large airports, from the FAA's airport records as [AirNav](https://www.airnav.com/airport/KATL) lists them: Atlanta's five are 9,000 to 12,390 ft, one of them 9,999 ft, all 150 ft wide; [New York JFK](https://www.airnav.com/airport/KJFK) has one of 10,000 ft among four of 8,400 to 14,511 ft; [Boise](https://www.airnav.com/airport/KBOI) has 10,000 and 9,763 ft, both 150 ft wide. Ten thousand feet is inside every one of these ranges, and 150 ft is the width Appendix G gives group V.

**Not read:** Boeing's and Airbus's airport planning manuals. Their takeoff lengths are charts in large PDFs that could not be fetched. A figure from one would replace the real-runway check.

## Terminal and car park

The old airport's terminal was sized in [municipal services](municipal-services.md): one regional terminal of 125,000 sq ft serves 600,000 boardings a year (Minot), so 418,000 sq ft boards two million and sees four million. The international keeps that terminal, 38,800 m², on two floors. The regional takes the terminal the figure came from: 125,000 sq ft, 11,600 m², 1.2 million passengers. Power and water follow the same source by floor and by passengers.

The airfield's 150 m² pilots' building is the game's own. One real field with a 5,600 ft runway has a 14,800 sq ft terminal, 20 T-hangars and 45 tie-downs (Tweed-New Haven, from its master plan as reported); no norm for a single-runway field was found.

Car parks: an industry survey found 2.0 to 4.9 spaces for each 1,000 passengers starting their journey at the airport ([International Parking & Mobility Institute](https://www.parking-mobility.org/2016/01/02/2012-05-08-new-report-highlights-importance-of-parking/)). Boardings stand in for those passengers, since the game has no connecting traffic. At the low end, 2,000 a million: 4,000 spaces for two million boardings and 1,200 for 600,000. A surface space takes 30 m² all in ([parking to code](../specs/parking-to-code.md)).

## Aircraft positions

A stand is as wide as its group's widest wingspan plus the clearance of AC 150/5300-13B Table 5-1: 36.0 + 7.6 = 43.6 m for group III and 65.2 + 7.6 = 72.8 m for group V. The international's terminal is 320 m long (19,400 m² a floor at 60 m deep), which holds two wide stands and four narrow ones: 2 × 72.8 + 4 × 43.6 = 320 m.

The regional's four stands and the airfield's twenty tie-downs are the game's own counts. A tie-down's area is the circular's Table E-1: wingspan plus 10 ft by length plus 5 ft.

Stand depth is not sourced: an aircraft's length is in no held circular. The spec uses 40 m for group III and 76 m for group V and says so in its Open list. The three aircraft drawn are the game's own sizes, each inside its group's wingspan limit.

## Paint

Every size in the spec's paint table is from AC 150/5340-1M: numerals and the rule against a leading zero, the centreline, the threshold stripes and their doubled centre gap, the aiming point's place and widths by runway width, the touchdown zone's bars, the side stripes and the holding position's Pattern A. Two things are readings, not quotations: the touchdown groups' counts by step (the text gives the pattern and the 500 ft steps, and leaves the aiming point's step empty), and the digits' shape, which the circular gives only as a figure.

## Plots

Length is the runway plus the safety area beyond each end. Depth is the sum of the strips from the far side's object free area to the street, rounded up to whole 20 m tiles.

| Strip, m                                   | Airfield | Regional | International |
| ------------------------------------------ | -------- | -------- | ------------- |
| Half the object free area, far side        | 38.1     | 121.9    | 121.9         |
| Runway centre to taxiway centre            | 45.7     | 121.9    | 121.9         |
| Taxiway centre to apron edge or stand line | 13.6     | 26.1     | 76.0 + 41.1   |
| Apron: tie-downs or stand depth            | 52.0     | 40.0     | 76.0          |
| Buildings                                  | 15.0     | 40.0     | 60.0          |
| Kerb road and car park                     | 15.6     | 110.0    | 150.0         |
| **Depth**                                  | 180.0    | 459.9    | 646.9         |
| **Depth in tiles**                         | 9        | 23       | 33            |
| Runway plus both ends                      | 969.4    | 2,133.6  | 3,657.6       |
| **Length in tiles**                        | 49       | 107      | 183           |

The international's 76.0 + 41.1 is a second taxiway for the apron: Table 4-1's taxiway-to-taxiway separation for group V (249.5 ft), then half its taxilane object free area (135 ft). The airfield's apron is two rows of tie-downs either side of a group I taxilane (79 ft clear).

## Price

No published cost for building a runway was found, so each rung is priced from its terminal. Reported terminal costs: 111,000 sq ft for $84.6 million at [Northwest Arkansas](https://talkbusiness.net/?p=300478), about $760 a sq ft, which puts a 418,000 sq ft terminal near $318 million; [Mobile's new terminal](https://www.constructionequipmentguide.com/380m-modernization-project-under-way-to-transform-mobile-international-airport/67600) is about $362 million. A general aviation terminal of 26,082 sq ft cost $12.5 million at [Statesville](https://airportimprovement.com/article/statesville-regional-invests-in-itself-by-building-new-terminal/).

| Rung          | Ratio to the international             | Cost ₵ | Upkeep ₵ |
| ------------- | -------------------------------------- | ------ | -------- |
| International | 1, the old airport's price             | 60,000 | 2,500    |
| Regional      | 125,000 ÷ 418,000 sq ft = 0.30         | 18,000 | 750      |
| Airfield      | $12.5 million ÷ $318 million = 0.039   | 2,400  | 100      |

Each figure here is from one report and none was cross-checked; the ratios matter, not the dollars.
