# Difficulty specification

Difficulty levels, what each changes, and how systems scale across them.

## There are no difficulty levels

The game has one setting. `src/` contains no difficulty concept: no selector,
no multiplier, no per-level tuning table. A new city starts with the same
funds, the same costs, the same tax rates and the same demand response as
every other city.

What the game has instead is **progression**, which is not the same thing. A
city gets harder as it grows because the simulation gets harder to satisfy —
services cost more to cover a wider area, traffic congests the routes that used
to be quick, and pollution and land value start pulling against each other.
Difficulty is emergent from the city's own size rather than chosen up front.
See [progression.md](progression.md) and [economy.md](economy.md).

The one thing a player can vary is **game speed** — pause, 1×, 2×, 4× — and
that changes only how fast time passes, never the rules. See
[../world-sim/time-system.md](../world-sim/time-system.md).

## When this document gets written

If difficulty levels are ever added. The dials already exist and are gathered
in [balancing.md](balancing.md) — starting funds, tax rates, service upkeep,
demand weights, the abandonment thresholds — so the work would be choosing
which of them a level is allowed to touch, not finding them.

The design question that would need settling first, and the reason this is not
merely unbuilt: a city builder's difficulty is usually about how forgiving the
economy is, and this game's economy is also its main feedback signal. Making it
more forgiving risks making it silent. That trade is not currently decided
anywhere, and it belongs in [../DESIGN.md](../DESIGN.md) or an ADR when it is.
