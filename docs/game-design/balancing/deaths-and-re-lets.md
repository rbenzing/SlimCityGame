# Deaths and re-lets

Derived and argued in [specs/healthcare-and-death-care.md](../../specs/healthcare-and-death-care.md).

| Constant                           | Value       | Meaning                                                                                                                                                                                                                                                      | File                      |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `DEATHS_PER_1000_PER_YEAR`         | 9           | The US crude death rate, 9.03 per 1,000 in 2024 (CDC/NCHS FastStats), taken as 9 because the population has no age structure to skew it older.                                                                                                               | `src/shared/constants.ts` |
| `DEATH_RATE_PER_RESIDENT_PER_TICK` | 1.25 × 10⁻⁷ | Derived: 9 ÷ 1,000 ÷ `TICKS_PER_YEAR` (72,000); a city of 10,000 loses 90 residents a game year.                                                                                                                                                             | `src/shared/constants.ts` |
| `VACANCY_RELET_DAYS`               | 41          | RentCafe 2025: 41 days on average to rent a vacant apartment, 137 markets; NAR 2025 Profile of Home Buyers and Sellers, a median 4 weeks on market, as the cross-check. Applies only while residential demand is above zero, and never scales with its size. | `src/shared/constants.ts` |

