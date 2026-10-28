# The spawner: how a lot is chosen

Growth runs a pass every `GROWTH_INTERVAL` = 10 ticks. Rather than rescan
the whole map on every pass, each pass sweeps one rotating 1-in-32 stride of
the map's tiles, so the full map is covered once every 32 passes.

A candidate tile must be zoned to a sector, carry no building yet, and sit
within Manhattan distance 3 of a street tile. The zone's level-1 catalog
entries unlocked at or below the current milestone are its **kinds** — a
detached house, a duplex and a fourplex on low-density land, say — and the
ones whose footprint fits unobstructed at the tile, every tile of it zoned
the same, are the lot's candidates. A building never spills onto ground
beside its zone, so a strip zoned one tile wide grows only what is one tile
wide. A commercial or industrial candidate must also fit the economy: its
jobs must be within the sector's room (see
[Demand](demand-the-rci-model.md)), except the smallest kind that fits the
lot, which is always a candidate so that growth never stalls at a gap smaller
than any building. The room counts down as the pass builds, like spare
supply, so two lots on one pass cannot both fill it.
A suburban commercial or industrial kind must also meet its parking code
where it would stand: its lot holds the spaces its floor asks for, less the
stalls the street paints along its frontage, with its accessible spaces and
loading berths. A kind whose own lot falls short has larger lots in the
catalog for the same building; it is a candidate if any of them fits, and it
stands on the smallest that does
([parking-to-code.md](../../specs/parking-to-code.md#which-kinds-fit-and-larger-lots)). Its larger
lots are never candidates of their own, so a kind is drawn by its `share`
once, however many lots it has.
A detached house stands on a parcel of the plat cut from its street: each run
of tiles along a street is cut a frontage at a time into the largest lot the
land value there warrants that fits (under 64 a half lot, 1×1; 64 to 159 a
normal lot, 1×2; 160 to 223 a double lot, 2×2; 224 and over an acre lot,
3×3, or an estate lot, 2×3, where only two tiles of frontage are free), turned
to run along its street, stepping over what already stands, and
only the tile a parcel starts on grows that lot. A tile no street's plat
reaches takes the lot its land warrants wherever it fits
([lots-and-land.md](../../specs/lots-and-land.md)).
One is drawn by its `share`, the kind's weight in the real stock, with one
roll of the growth rng against the candidates' cumulative weights in catalog
order; a kind alone among the candidates needs no roll. At least one tile of
the chosen footprint must already be reached by power, by piped water and,
once the city is a Big Town, by a drain — water and drain only where the
building draws city water, which a [house on a well](#a-house-on-a-well)
does not, and a drain never before Big Town, when the whole town is on
septic tanks — checking the whole
footprint rather than just its origin corner, so a lot's service does not
depend on which side of it the street happens to sit. A lot that fails the
checks after the draw is simply tried again on the next sweep, with a fresh
draw. The kinds, their weights and where they come from are in
[specs/building-types.md](../../specs/building-types.md).

Nobody moves into a home the grid cannot light or water. The grid must also
have spare supply for the entry's `powerUse` and `waterUse`: supply less
everything already in the utility line (see
[Brownouts](../../world-sim/utilities-model.md#brownouts)), less what this pass
has already built. A candidate that clears everything but that is **waiting
for supply**: no random draw is spent on it, and growth remembers it for one
full sweep of the map so the Advisor can count what is still waiting against
what the grid has spare now. Candidate lots overlap — a 2×2 home could start
on any of four tiles — so the count claims ground in tile order and a lot
counts only where no earlier one has claimed it: the count is the homes that
would fit, not the tiles that could start one. Zoning more land beside a full grid therefore
adds nothing; the player's own tools are never refused for a shortage.

If a candidate clears all of that, it spawns with probability equal to the
sector's demand multiplied by the tile's desirability: desirability is land
value (helping) net of pollution (hurting residential lots most, at weight
0.5; commercial some, at 0.2; industrial not at all), clamped to 0..1. A
single random draw against that probability decides the pass; a spawned
building enters the Constructing state.

A **farm** is chosen differently, from its land rather than its tile:

- **The lot.** It is the level-1 farm lot (4×5 tiles), and every tile of it
  must be zoned Agriculture on farmable soil.
- **Access.** A dirt road must lie within Manhattan distance 3 of the lot:
  of any tile of it, since a farm's gate can be anywhere along its edge.
- **Power.** The lot must be powered. A dirt road carries no power, so a
  farm on dirt roads needs a power line run out to it, or a paved street
  beside its land.
- **No water.** It needs no water at all: a building whose entry draws none
  is never refused for want of it, and a farm pumps its own well.
- **The kind.** The grade at least half the lot's tiles reach picks the farm:
  very fertile grows row crops, fertile an orchard, somewhat fertile pasture.
- **The draw.** The probability is industrial demand times the lot's soil
  desirability — 1.0, 0.8 or 0.6 by grade — in place of land value.

### A house on a well

A dirt road carries no water main, just as it carries no cable. The homes
along one are where the mains stop. More than 43 million people, about 15
percent of the US population, drink from a private domestic well
([USGS](https://www.usgs.gov/mission-areas/water-resources/science/domestic-private-supply-wells)).
So a low-density house draws no city water when both of these hold:

- **A dirt road serves it.** One lies within Manhattan distance 3 of any
  tile of its lot, the same reach a farm has to its road.
- **No main runs beside it.** No road that carries water lies orthogonally
  beside any tile of its lot. That is exactly where the network hands water
  to a lot, so a house that a main could reach is never on a well.

A house on a well is on a septic tank too, and needs only its road and
power. Nothing refuses it, holds it back or flags it for want of water or a
drain. So is every building in a town below Big Town (`SEWER_MILESTONE`,
3,500 people), whatever road it stands on: a small town makes no sewage for
the city, and sees no sewer until it has outgrown its tanks
([progression.md](../progression.md#milestones)). A house on a well takes no
place in the water line or the sewer line and adds
nothing to either demand. Only the roads and pipes decide, never the supply,
and they are read afresh every time. A house whose main is bulldozed goes
onto a well, and a house that levels up onto a lot a main runs beside goes
onto the mains. A shortage never puts a house on a well: a house the mains
serve stays in the water line and loses its water like any other.

A house with a main beside its lot — a road that carries water, or a water
pipe — is on the mains like any other, even where a dirt road also serves
it, and waits for water while that main is dry. Only the detached houses of
the low-density zone go on a well. Terraces, flats, mixed blocks, shops and
industry need the mains wherever they stand.

