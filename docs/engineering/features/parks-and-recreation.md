# Parks and recreation — technical design

- **Status:** Draft
- **Date:** 2026-09-18
- **Author:** Claude Opus 5

Epic 8 of [municipal-services.md](municipal-services.md), and the last of it. The
design it is written against is
[../../game-design/features/parks-and-recreation.md](../../game-design/features/parks-and-recreation.md),
which owns every number and its derivation; this owns how the code gets there.

## What we are building, and why now

Four new park entries above the existing pocket park, a capacity for each, a
city-wide open-space provision statistic, and one change to how park coverage
combines with itself. The player gets open space planned to a provision standard
instead of dotted for a bonus. Now, because it is last and cannot start earlier:
it is the first epic whose whole point is capacity, so it needs
[service-capacity.md](service-capacity.md) finished — and epic 0 shipped the park
entries **without** a capacity, leaving this hole to fill.

## What it touches

| Module                      | Change                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `src/data/catalog.json`     | 4 new `category: 'park'` entries; `small-park` gains range and capacity |
| `src/sim/services.ts`       | Park coverage max-blends across parks before one additive write         |
| `src/sim/worker.entry.ts`   | Open-space tiles and tiles-per-1,000 onto the snapshot                  |
| `src/shared/types.ts`       | `SimSnapshot.openSpace?`                                                |
| `src/render/utilitykits.ts` | 4 new kits; shared tree/bench pools; wear colour; 2 new part kinds      |
| `src/ui/` (panel, store)    | The parks row gains a provision line; mirror `openSpace`                |

**Save format: no.** `SAVE_VERSION` does not move; everything added is catalog
data or derived per tick. The additive rule holds and is what the loader relies
on: **a save written before this epic loads after it**, with the new parks absent
— never a rejected file. One caveat, because `GridState.fields` _are_ serialized:
a pre-epic save's `LandValue` array grew under the old additive blend. It is not
rejected and not migrated; land value is recomputed and diffused every tick, so
it re-settles — a balance correction for the release note, not a compatibility
break. **Worker protocol: yes, additively** — one new optional member on
`SimSnapshot`, see [../interfaces.md](../interfaces.md) and
[../data-model.md](../data-model.md). No new commands; parks use the existing
ploppable path.

## The design

### Data: five catalog entries

All five are `category: 'park'` with `service.kind: 'park'`; costs, strengths and
every derivation live in the design document. `height` is the lawn or paving
plate for four of them; the sports ground's 3.2 m is its changing pavilion, the
only floor area in the epic.

| `id`                    | Footprint | `height` | `range`         | `capacity` |
| ----------------------- | --------- | -------- | --------------- | ---------- |
| `small-park` (existing) | 1×1       | 2        | **18** (was 16) | 32         |
| `civic-plaza`           | 2×2       | 2        | 33              | 108        |
| `neighbourhood-park`    | 3×3       | 2        | 22              | 117        |
| `district-park`         | 5×5       | 2        | 34              | 250        |
| `sports-ground`         | 6×4       | 3.2      | 58              | 120        |

### Behaviour: park coverage max-blends with itself, then adds once

The only simulation change, and the mechanical core of the epic. Today
`applyCoverage` runs once per building and `park` does `field[tile] += value / 4`,
so two overlapping parks **stack** — which is why tiling the map with the
cheapest park is optimal. Every other kind avoids this: education and health take
a max, police and fire subtract a capped amount. The naive fix, copying
education's `Math.max(field[tile], value)`, is wrong here, because `LandValue` is
not a coverage field — it carries the whole land-value model, and flooring it at
a park's value would drop a tile worth 200 to 20. So the rule is **max across
parks, add once**:

```
parkContribution[tile] = max over park facilities of (coverage_f[tile] / 4)
LandValue[tile]       += parkContribution[tile]
```

Two overlapping parks give the better of the two, not the sum — overlap is waste
and spacing is the play — while land value still _gains_ from a park rather than
being replaced by it. This needs a per-tick scratch `Map<tile, number>` flushed
once; epic 0 already holds each coverage map to a resolve step so it can scale by
the catchment multiplier, and the max-reduce rides on that resolve rather than
adding a pass. The flat `landValueBonus` on a facility's own footprint stays
additive — it seeds diffusion from the park's tiles, a different thing.

### Behaviour: capacity

Nothing new. Parks take the mechanism epic 0 built: a facility's `capacity` joins
its catchment pool, `load = population / Σ capacity`, every facility in the
catchment contributes `strength × min(1, 1 / load)`, and funding scales capacity
and range together. The only park-specific consequence is that park facilities
move from **uncapped to capped** — a real behaviour change on every save, below.

### Derived: the open-space provision statistic

One number, not a field. Each tick, sum the footprint tile count of every
`Active` building whose catalog entry has `service.kind === 'park'` and divide by
population, as `openSpace?: { tiles: number; perThousand: number }` on
`SimSnapshot`. `perThousand` is `tiles / population * 1000` and **0 at population
0**, not `NaN`; the parks row reads it against the 60 tiles per 1,000 standard.
It goes on `SimSnapshot` and not `CityStats` for the reason epic 0 gave for load:
`CityStats` is carried into saves, where a derived figure can go stale. Note what
that selector means today — it includes the 8×6 `airport`, so the statistic would
credit a city with 48 tiles of open space for building one. That entry is
miscategorised (it belongs in `transit`) and fixing it is transport's work, so
provision tests run against a fixture catalog and pin the rule, not the bug.

### Rendering

These are the largest ground-level assets in the game and
[../performance-budget.md](../performance-budget.md) caps the frame at roughly
300 draw calls. Four rules keep the epic inside it, all four extending the
pocket-park kit in `src/render/utilitykits.ts` — see
[../../art/props-and-vehicles.md](../../art/props-and-vehicles.md).
**1. A park's ground is one instance, not one per tile.**
`buildParkGroundGeometry(footprint)` already merges the lawn plate and path cross
into one `BufferGeometry` sized from the footprint, so a 25-tile district park is
**one** instance — the most important budget fact, and already how the code
works. **2. Footprint-independent parts share one pool across all five kits.**
Each kit today builds its own `InstancedSlotPool` per part, so five park kits
would mean five tree and five bench pools for identical geometry. `parkTree` and
`parkBench` do not depend on the footprint, so the whole cost becomes 5 ground
pools + `parkTree` + `parkBench` + `pitchGoal` + `pavilionBlock` = **9 draw
calls, for any number of parks**.

**3. Prop counts scale with perimeter, not area** — trees ring the edge and the
paths, the middle stays open, and that is both the correct read and what keeps
the count down. Trees = perimeter ÷ 24 m; benches = path length ÷ 50 m, the
resting-place interval pedestrian accessibility guidance uses, floored at 2. A
10,000-resident city at standard holds about 890 tiles of park, so roughly **900
tree instances and 240 benches** — one `InstancedMesh` each, about 72k triangles.
An area-scaled rule would have put 75 trees on every district park.

| Rung               | Perimeter | Trees            | Benches |
| ------------------ | --------- | ---------------- | ------- |
| Pocket Park        | 80 m      | 3                | 2       |
| Civic Plaza        | 160 m     | 7 (in planters)  | 3       |
| Neighbourhood Park | 240 m     | 10               | 2       |
| District Park      | 400 m     | 17 + 4 specimens | 4       |
| Sports Ground      | 400 m     | 17 (long sides)  | 2       |

**4. Markings and wear cost nothing.** Pitch lines are vertex-colour strips
merged into the sports ground's plate, exactly as the path cross already is, and
the overload read — worn, then bare grass — is a per-instance colour on the
ground pool via `setColorAt`, which it already supports. Only `pitchGoal` (two
per sports ground) and `pavilionBlock` (one) are new part kinds; per the
campus-services rule in [../../art/civic-massing.md](../../art/civic-massing.md)
a grounds-led facility is read by its grounds, so the pavilion is a low block at
the site edge. Kit trees stay self-contained and do not import
[../../visual-render/vegetation.md](../../visual-render/vegetation.md).

## What could go wrong

**Every existing city's land value falls**, because the blend change is the
point: a player who tiled pocket parks loses the stacked bonus on load, and land
value gates growth. Intended, and it belongs in the release note rather than
being discovered. **And every existing park becomes capped on the same day**,
since epic 0 left parks uncapped. A mature save's first tick after upgrade will
show catchments at a load of three or more, because those cities were built
against no provision rule at all; the degradation is smooth by construction, but
the first experience is "my parks are all red" and the panel copy has to make
that legible rather than alarming. **The scratch map for the max-reduce is the
largest transient the service pass allocates** — one `Map` per tick rather than
one per facility, but with ranges up to 58 tiles the union of park-covered tiles
can be most of the map. If it shows up in a profile the answer is a reused
`Float32Array` over tile indices, not a second pass. **The plaza may dominate
downtown.** Per head it is the second-worst buy (17.1
against the district park's 14.6); per _tile_ it is far the best, so where land
binds — exactly where a plaza belongs — it always wins. Intended, but the figure
most likely to need moving. **And the number I am least happy with is
`strength`:** everything else derives from a published standard, while `strength`
derives from a hedonic-pricing premium, a much softer figure than a pitch.

## Alternatives

**Keep the additive blend and fix sprinkling with price.** Rejected: the exploit
scales with overlap, not count, so no price stops it. **A pure max against
`LandValue`, as education and health do**, is rejected above — it floors the
land-value model at the park's value wherever a park reaches. **A `Recreation`
scalar field** is rejected as a `MAP_SIZE²` byte array for something `LandValue`
already carries. **Writing recreation into `Happiness` as well** is
rejected because it is not possible — `computeHappiness` recomputes the whole
array from the other fields each time its slot comes up, so any write dies on the
next pass. Recreation reaches happiness through the land-value term, and changing
its weight is a coefficient change there, a tuning question for
[../../game-design/balancing.md](../../game-design/balancing.md).
**Five `ServiceKind` members, one per published typology** are rejected: five kinds'
worth of concept, panel and coverage for the one service the city survives
without, when the typologies already earn their keep by giving each rung its own
capacity per tile. **A district park at the published 20 ha** is rejected on the
grid too — 500 tiles and 22 tiles of frontage against the 6-tile siting rule.

## How we will know it works

The rules above, as behaviour statements; the
[documentation map](../../README.md) says where they land once shipped.

- Two overlapping pocket parks raise a shared tile by the same amount as one
  does — the exploit being closed, and written first. But a park still _adds_: a
  tile at land value 200 under a strength-80 park ends above 200, never at 20.
- `small-park` at `range: 18` reaches exactly 20 tiles of road distance once the
  2-tile radiation is counted, and nothing at 21.
- A district park alone in a catchment of 500 residents runs at load 2 and gives
  half its strength; a second district park restores both to full.
- A park entry with no `capacity` leaves its catchment uncapped, so a pre-epic
  save behaves exactly as it did, and `SAVE_VERSION` is unchanged.
- Every entry's `capacity` equals its tile count × its typology's
  residents-per-tile ÷ 5 — table-driven, so it fails if a number is edited alone.
- Provision reports park tiles per 1,000 residents from a fixture catalog, and is
  0 rather than `NaN` at population 0.
- Tree and bench counts are pure functions of footprint — 3/2, 7/3, 10/2, 21/4,
  17/2 — asserted without a scene; and removing a park frees every slot it owned.

**What has to be looked at in a browser** — this epic is almost entirely visual
and a read-back proves none of it.

1. **All five rungs side by side at the default camera pitch.** Each must be
   identifiable without its label: a square with a cross path; paving with
   planters; a lawn with a treed edge; open ground ringed with trees; a marked
   pitch with a pavilion at the edge. If two read the same, the ladder failed.
2. **The sports ground with a 4.0 m car and a 1.75 m pedestrian on the adjacent
   road.** The pitch must read as 105 m long — five and a quarter tiles — with
   the 3 m run-off visible as unmarked turf inside the footprint. A pitch reading
   as a tennis court is what this catches.
3. **A district park at load 0.5 and load 3, same camera and light.** The worn
   state must be obviously different, and read as wear rather than a bug.
4. **A district park abutting a road, edge-on and close.** The plate must sit
   flush, not float above the footway or z-fight with it; the road epic's
   ground-versus-deck sweep is the precedent for how this goes wrong.
5. **The land-value overlay over one district park, and over six pocket parks on
   the same ground.** Under the old blend the six dots won; under the new one the
   single park must visibly win. The design change, and it has to be seen.
6. **A plaza between two towers at the default pitch.** It must read as a public
   square; if it reads as an unzoned lot, the paving and planters are wrong.

## Out of scope

- **Fixing the `airport` entry** — named in the design document because parks
  work sits on top of it, but correcting its category and dropping its bogus
  `service` block belongs with transport.
- **Decoration ploppables** — fountains, statues and flowerbeds whose only effect
  is a land-value number. Anything that should never be built belongs in
  [../../DESIGN.md](../../DESIGN.md).
- **Tourism, landmarks and per-citizen leisure.** No visitors exist, and nobody
  is tracked to a park.
- **A new scalar field, a new `ServiceKind`, or reworking coverage.** Argued
  above; BFS is untouched and only how contributions combine changes.
- **Park-specific pedestrian behaviour** beyond walker density following load;
  water features; seasonal planting beyond the existing tint.
