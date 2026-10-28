# Emergency services — derivations and sources

The research behind [the spec](../specs/emergency-services.md). Every figure comes from a published source and our own 20 m tile; where no source was found it is labelled a dial. The sizes and models of the stations are derived in [the fire and police stations](../art/civic-massing/reading-a-civic-building-at-a-glance/the-fire-and-police-stations.md).

## Reach, from response time

NFPA 1710 gives the first arriving engine company **240 seconds of travel time** at the 90th percentile, travel measured from leaving the station. The insurance rating schedule for fire protection (ISO's Fire Suppression Rating Schedule, [criteria for deployment analysis of companies](https://www.isomitigation.com/ppc/technical/criteria-for-deployment-analysis-of-companies/)) gives full distribution credit for a first-due engine within **1.5 road miles (2,414 m)**. The two pin a speed between them: 2,414 m ÷ 240 s = **10.06 m/s (36.2 km/h)**, a plausible urban average with junctions and traffic yielding, and one we did not have to assume. The distance follows: 2,414 m ÷ `TILE_METERS` (20 m) = **120 tiles**. The 240 s figure is taken from secondary summaries ([Fire Engineering](https://www.fireengineering.com/?p=719759); the North Davis Fire District 2018 agenda, [northdavisfireut.gov](https://www.northdavisfireut.gov/files/0933ea062/2018_agenda_amended.pdf)); the NFPA 1710 text itself was not retrieved.

Both the standard and our dispatcher measure along roads, so there is no circuity factor and no isochrone to approximate: 120 hops of the road graph is what the standard describes.

**Medical** takes NFPA 1710's **480 s** for an advanced-life-support unit at the same speed: 480 × 10.06 = 4,829 m, or **241 tiles**.

**Police** has no national response-distance standard that we found, so it **borrows fire's 120 tiles**: a borrowing, not a derived figure.

The old `range: 48` is the coverage radius of the building's field and is untouched; it was never a response distance.

## Responders

`responders` is the number of calls a facility can have in flight at once. The fire station is **1**: one engine company ([service-capacity.md](../specs/service-capacity.md)). The police station is **6**: about six cars on duty at any hour, from the same document. A kind with no `responders` figure is unlimited, so health and the rest behave as they do today.

The first rungs derive from the capacity document:

- the **fire station** is one engine company: NFPA 1710's 4 firefighters on an engine × 4.5 relief = 18 firefighters, over NFPA's 1.30 per 1,000, is 14,000 people;
- the **police station** is a town's whole force: 1.9 sworn per 1,000 (FBI table 71) × 25 = 48 sworn, 68% on patrol (BJS 2013) = 32, over 5.5–6 officers to staff one post round the clock (Seattle), is about 6 cars on duty;
- both are 6.4 m tall, the resize the capacity document left to this feature.

An earlier draft treated the 2×2, 12 m stations as the large rung, with smaller posts below, on a relief factor of 4.2, 55% on patrol and 2.4 sworn per 1,000. Those were figures for a bigger agency than the sourced ones the game has used from the start; they are dropped, and so are the draft's posts, derived footprint table and re-priced stations.

## Call rates, per resident per year

Real US figures, replacing a fixed 2% per building per tick at the field's maximum (`0.02 × field ÷ 255`), which ran at hundreds of times reality.

| Kind                                | Rate  | Source |
| ----------------------------------- | ----- | ------ |
| Fire (non-medical fire-dept calls)  | 0.042 | NFPA 2023 fire-department calls: 42,412,500 total, 28,405,000 medical aid, 1,388,500 fires, cited by [CFSI](https://cfsi.org/legislation-advocacy/current-legislation/afg-and-safer/). Non-medical is 14.0 M ÷ about 334.9 M US residents = 0.042. |
| Medical                             | 0.085 | The same source: 28.4 M ÷ 334.9 M = 0.085, a floor, since it counts fire-department EMS only. |
| Police (phone-in calls for service) | 0.45  | The Benchmark Cities average, 451.8 per 1,000 in 2019 (via Henderson NV's benchmark report). Vera's "more than 240 million 911 calls a year" ([Vera](https://vera.org/newsroom/vera-report-defines-landscape-of-911-calls-for-police-service)) is a ceiling: it includes non-police traffic. |

NFPA's own tables were unreadable, so the NFPA figures are as CFSI cites them. The 2023 population is an estimate not confirmed on a Census page; the Census's Vintage 2025 figure of 341.8 M gives 0.041 and 0.083. The USFA's NFIRS 2020 run profile ([fire department run profile](https://www.usfa.fema.gov/statistics/reports/firefighters-departments/fire-department-run-profile-v22i1.html)) is the cross-check: EMS 64.2% of runs, fire 3.9%.

A building's chance of a call each tick is `rate ÷ TICKS_PER_YEAR × occupants ÷ (1 + EMPLOYMENT_RATE) × field ÷ FIELD_REFERENCE`, where occupants are the residents living in it plus the jobs it holds. Dividing by 1 + the employment rate makes a balanced city's occupants add up to about its population, so the city-wide rate matches the per-resident figure. `FIELD_REFERENCE` is **128**, the field value at which a building calls at the national average, and a **dial**: no source ties a field byte to a rate.

Checks. A one-engine town of 14,000 at reference fields makes 14,000 × 0.042 = **588 non-medical fire calls a year, 1.6 a day**; at the fire on-scene time that keeps its one engine busy about 16% of the time. A town of 25,000 makes 25,000 × 0.45 = **11,250 police calls a year, 31 a day**; at 26.4 minutes a call that is 4,950 car-hours of 6 × 8,760 = 52,560, **about 9% busy**.

## On-scene time, per kind

A tick is 7.2 game minutes. Police take a mean of **26.4 minutes** a call, arrival to clear (CSG Justice Center, Assessment of Austin Police Calls for Service, 2021, average time spent on responsive calls). An ambulance is off the road **29 minutes**: a 16 minute median on scene plus a 13 minute median transport (NEMSIS 2015-16 national chest-pain encounters, Duke); the sim returns it to its station rather than a hospital, so both count. Severity spreads each mean from 0.5× to 1.5×. Fire has no US on-scene figure found (NIST's fireground experiments give crew-size ratios, NFPA 1710 gives arrival targets), so it keeps 10 + severity × 20 ticks, 1.2 to 3.6 game hours, as a **dial**.

## The lapse

An unanswered call lapses after **30 ticks**, the longest an answered call spends on scene (fire at full severity, 10 + 20). It is a **dial**: it makes an unanswered call visible for as long as an answered one would have been. Unanswered calls are capped at 32, so they can never starve the pool the answered calls use.

## Spawn-rate test

A synthetic city of 10,000 balanced residents and jobs at the reference field over a game year (72,000 ticks) produces about 420 fire, 850 medical and 4,500 police calls, within four standard deviations of a Poisson count.

## The district fire station: Indianapolis Fire Station 20

The exemplar is Indianapolis Fire Station 20, groundbreaking April 2025: $8M, 15,733 sf of operating space, three apparatus bays, housing Engine 20, Ladder 20 and a battalion chief ([Fire Apparatus Magazine](https://www.fireapparatusmagazine.com/the-fire-station/indianapolis-in-fd-breaks-ground-on-new-8m-fire-station-20/)), about $509 a square foot. Cross-checks: Indianapolis Station 32, about $7.5M for about 14,000 sf and three bays; Hambden Township OH, 2026, $8.75M, about 18,000 sf, five bays; Montgomery County MD's Glenmont FS18, 22,564 sf, four double-deep drive-through bays.

- **Capacity.** An engine and a ladder at NFPA 1710's 4 seats each, and a battalion chief: 9 seats × 4.5 relief = 40.5 firefighters, over NFPA's 1.30 per 1,000 = 31,154, taken down to **31,000**.
- **`responders` 2.** The two companies roll; the chief is not a call unit. Range stays **48**, strength 160: reach belongs to the appliance and the road.
- **Cost.** Priced by floor at one source's dollars a square foot: 15,733 ÷ 5,380 sf (today's ~500 m²) = 2.92 × ¢4,500 = ¢13,160, to the nearest ¢50 **¢13,150**.
- **Upkeep.** By staffing: 40.5 ÷ 18 = 2.25 × ¢320 = **¢720**.
- **Draw.** 15,733 sf at CBECS's public order and safety 13.9 kWh/sf over the year = 25 kW; the fire-station water median, 28.9 gal/sf a year, = 4.7 kL a day.

The first rung's draw is re-derived on its ~500 m² (5,382 sf): 8.5 kW and 1.6 kL. It had been 47 kW and 9 kL on the 12 m box's 2,775 m², a floor the building never had.

## The district police station: Concord NH

The exemplar is Concord NH's new police station, about 38,000 sf for its 90 sworn officers, where the existing station is 20,000 sf (groundbreaking April 2026, [concordnh.gov](https://www.concordnh.gov/2069)). The cross-check is Glen Ellyn IL, 29,000 sf for 40 sworn, $13.5M in 2017, about $466 a square foot.

- **Capacity.** 90 sworn over the FBI's 1.9 per 1,000 (table 71) = 47,368, taken down to **47,000**.
- **`responders` 11.** 68% on patrol of 90 is 61, over 5.5 to staff one post round the clock: 11 cars. Range 48, strength 160.
- **Cost.** 38,000 ÷ 15,280 sf (today's 1,420 m²) = 2.49 × ¢4,000 = ¢9,948, **¢9,950**.
- **Upkeep.** 90 ÷ 48 sworn = 1.875 × ¢300 = **¢563**.
- **Draw.** 38,000 sf: 60 kW at 13.9 kWh/sf, 5.7 kL a day at the office benchmark of 14.48 gal/sf.

## The ladder's cost per person

| Station                 | Capacity | Responders | Cost    | Upkeep | Build per person | Upkeep per 1,000 |
| ----------------------- | -------- | ---------- | ------- | ------ | ---------------- | ---------------- |
| Fire station            | 14,000   | 1          | ¢4,500  | ¢320   | ¢0.32            | ¢22.9            |
| District fire station   | 31,000   | 2          | ¢13,150 | ¢720   | ¢0.42            | ¢23.2            |
| Police station          | 25,000   | 6          | ¢4,000  | ¢300   | ¢0.16            | ¢12.0            |
| Police district station | 47,000   | 11         | ¢9,950  | ¢563   | ¢0.21            | ¢12.0            |

The draft's rule that a large rung is 18 to 20% cheaper per person is withdrawn: the figures do not support it.

## Looked at in a browser

An unanswered marker beside an answered one with its vehicle must be tellable apart.
