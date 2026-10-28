# Service capacity

Every figure is derived in [specs/service-capacity.md](../../specs/service-capacity.md).

| Building       | Capacity | Meaning                                                                                                                                                                                          | File                    |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| police station | 25,000   | A dial: the top of the FBI's 10,000–24,999 town class, whose 1.9 sworn per 1,000 is 48 officers and, at 68% on patrol (BJS) and 5.5–6 a post, six cars round the clock.                          | `src/data/catalog.json` |
| fire station   | 14,000   | One engine of 4 (NFPA 1710) at about 4.5 people a seat is 18 firefighters, over NFPA's median 1.30 career firefighters per 1,000 for 25,000–49,999.                                              | `src/data/catalog.json` |
| fire district  | 31,000   | An engine and a ladder (2 × 4 seats, NFPA 1710) and a battalion chief (1): 9 seats × 4.5 relief = 40.5 firefighters over 1.30 per 1,000. | `src/data/catalog.json` |
| police district | 47,000  | 90 sworn (Concord NH's new station) over 1.9 per 1,000 (FBI table 71).                                                                                                                           | `src/data/catalog.json` |
| clinic         | 8,000    | 4 physicians, a dial, at a panel of 2,000: between Altschuler's workable 1,947 and the US average of about 2,300.                                                                                | `src/data/catalog.json` |
| school         | 7,000    | The average US public elementary school's 456 pupils (NCES 216.75) over K–5's 62–64 pupils per 1,000 residents (NCES 203.10; 62.4 in fall 2020).                                                 | `src/data/catalog.json` |
| middle school  | 17,700   | 599 pupils (NCES 216.75) over grades 6–8's 33.8 per 1,000 (NCES 203.10, fall 2020).                                                                                                              | `src/data/catalog.json` |
| high school    | 15,200   | 693 pupils (NCES 216.75) over grades 9–12's 45.7 per 1,000 (NCES 203.10, fall 2022).                                                                                                             | `src/data/catalog.json` |
| college        | 50,000   | Sized to Metropolis: 50,000 × 5.46% (postsecondary enrolment 18.58 M over 340.1 M, NCES 303.10) = 2,730 places on one campus.                                                                    | `src/data/catalog.json` |
| library        | 20,500   | 340.1 M residents over 16,607 public library outlets (NCES 701.60, FY2019).                                                                                                                      | `src/data/catalog.json` |
| hospital       | 30,000   | 72 staffed beds over KFF's 2.28 community beds per 1,000 is 31,600; by AHA's 43.3 admissions a bed over KFF's 99 per 1,000, 31,500. About 5% under both. Range 72, strength 140 as the clinic's. | `src/data/catalog.json` |

