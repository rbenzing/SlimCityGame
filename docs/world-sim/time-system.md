# Time system

The clock, day length, speed multipliers, and the two different day lengths
the code actually uses. For the tile grid these ticks run over, see
[world-model.md](world-model.md).

## Game time

The simulation core ticks at a fixed `TICK_RATE` = 20 per real second at its
reference multiplier of 1.0; a calendar day is `TICKS_PER_DAY` = 200 ticks
and a calendar month is `DAYS_PER_MONTH` = 30 days. The player never runs
the sim at that reference rate directly: the 1×/2×/4× speed control instead
maps each button through `SPEED_MULTIPLIERS` to its own real-time
multiplier — roughly 1/3 at 1×, 4/3 at 2×, and 16/3 at 4×, each step exactly
four times the one before it — with pause mapping to zero. The tick logic
itself is identical at every speed; only how many ticks are fed per real
second changes, so determinism does not depend on the pacing chosen.

The visible time of day runs on its own, longer cycle, deliberately
decoupled from the calendar: one full day/night sweep is `VISUAL_DAY_TICKS`
= 2,400 ticks — about six real minutes at the 1× speed button — rather than
tracking the 200-tick calendar day, which would otherwise strobe day into
night every few real seconds. The status-strip clock displays this visual
time; the calendar date advances on calendar days regardless of what the
visual clock shows.

Two sim rules follow the day the player sees and not the calendar's, by the
player's choice: traffic's rush curve and a transit line's service span both
read `dayHourFromTick`, so the morning peak comes with the morning light and
a fleet goes home in the dark. On the calendar day, half a minute at the 1×
button, both would turn over twelve times in one sweep of the sky. Every
other sim rule counts calendar days `[R-world-006]`.

A fresh city boots reading 09:00, not midnight: the lighting, the
status-strip clock and `dayHourFromTick` add the same
`CLOCK_START_OFFSET_TICKS` (900 ticks, 9/24 of the visual day) before
mapping the tick onto the 24-hour visual day, so the clock, the light and
the rush hour always agree. The offset moves no tick, save or date.
