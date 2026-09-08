# Environmental simulation

Nine scalar fields, one `Uint8Array` of `0..255` per tile each
(`GridState.fields`, indexed by `FieldId`), simulated by `FieldSim`
(`src/sim/fields.ts`). Eight of them emit, diffuse and decay; the ninth
(Happiness) only recomputes. The schema — which byte is which field, and
which single field (Traffic) is a save-time no-op — is
[../engineering/data-model.md](../engineering/data-model.md#the-scalar-fields);
this document is the simulation behavior that table explicitly defers to.

## The shared mechanism

Every diffusing field runs the same kernel
(`FieldSim.diffuseIntoScratch`): a 4-neighbor (von Neumann — N/E/S/W, no
corners) blend of `0.6 × self + 0.4 × neighborAverage`, computed in fixed
point as `(154 × self + 102 × neighborAverage) >> 8` (154 + 102 = 256
exactly, so the blend step alone conserves total mass), followed by that
field's own decay multiplier. A map-edge tile substitutes itself for any
missing neighbor rather than treating the edge as empty, which keeps every
tile's neighbor count exactly 4 and keeps the blend mass-preserving at the
border too, instead of artificially dragging edge tiles toward zero. All
arithmetic is integer/fixed-point specifically so the result is identical
across machines — see
[ADR-0002](../engineering/adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).

No field diffuses or decays every tick. Each one has a fixed `(period,
offset)` slot in `FieldSim`'s `DIFFUSING_FIELDS` schedule, and only runs
when `tickNo % period === offset`:

| Field                      | Period | Offset | Decay factor       | Decay (fixed-point /256) |
| -------------------------- | ------ | ------ | ------------------ | ------------------------ |
| LandValue                  | 8      | 0      | 0.995              | 255                      |
| Crime                      | 8      | 1      | 0.985              | 252                      |
| FireRisk                   | 8      | 2      | 0.99               | 253                      |
| Education                  | 8      | 3      | 0.99               | 253                      |
| Health                     | 8      | 4      | 0.99               | 253                      |
| Happiness (recompute only) | 8      | 5      | — (never diffused) | —                        |
| Pollution                  | 4      | 0      | 0.97               | 248                      |
| Noise                      | 4      | 1      | 0.90               | 230                      |
| Traffic                    | 4      | 2      | 0.92               | 236                      |

LandValue is listed first among the period-8 fields deliberately: on the
tick every 8 ticks where its slot coincides with Pollution's period-4 slot
(both land on offset 0), LandValue's own pass reads Pollution, Noise and
Crime as inputs — running it first in that same `tick()` call guarantees it
reads last tick's settled values rather than one Pollution's own pass just
mutated moments earlier. `emit()` (a saturating add at one tile, used by
every emitter below) and the diffusion/decay pass never share a call —
emission happens on whichever cadence the emitting system itself runs, and
is read into the next diffusion pass whenever that field's slot next comes
up.

## LandValue (`FieldId.LandValue = 0`)

Not emitted into by any building or service directly. Every diffusion pass
additionally applies a proximity formula on top of the generic
diffuse-and-decay result (`applyLandValueDecay`):

```
gain = (255 − pollution) >> 5        // rewards low ambient pollution, max +7
     + 6 if any orthogonal neighbor is water
     + trees >> 4                   // tree density / 16, max +15
loss = pollution >> 3                // −pollution/8
     + floor(noise / 12)
     + floor(crime / 10)
next = clamp(diffused + gain − loss)
```

A park's coverage additionally adds a flat bonus directly to this field
(quarter of coverage value, plus a one-time `landValueBonus` on the park's
own footprint) — see [services-model.md](services-model.md#coverage-and-funding).
**Readers:** growth's level-up thresholds (140 for level 2, 190 for level 3,
[../game-design/simulation-rules.md](../game-design/simulation-rules.md)),
growth's spawn desirability, the monthly tax `landValueFactor`
(`0.75 + (avgLandValue / 255) × 0.5`, averaged over occupied tiles —
[../game-design/economy.md](../game-design/economy.md)), a single building's
own monthly tax figure, and the Happiness formula below.

## Pollution (`FieldId.Pollution = 1`)

Emitted by every Active building's catalog `pollution` stat, on the
`EMIT_PERIOD = 4` / `EMIT_OFFSET = 3` cadence (see [tick.md](tick.md)) —
this includes an active incinerator, whose `pollution` figure is emitted
through this same ordinary per-building pass while it burns (see
[services-model.md](services-model.md#garbage-and-waste-management)). A
district's `greenEnergy` policy multiplies the emitted amount by
`GREEN_ENERGY_POLLUTION_MULT = 0.5` for buildings inside it
(`effectivePollution`, `src/sim/policy.ts`) before it ever reaches `emit()`.
Decays at 0.97/tick on its own slot. **Readers:** growth's `HighPollution`
problem (> 170, residential lots only) and spawn desirability weighting,
LandValue's loss term, the Happiness formula, and — as the closest existing
proxy for a "medical emergency rate," there being no dedicated health-risk
field — service dispatch's medical-incident spawn chance
([agent-behavior.md](agent-behavior.md)).

## Noise (`FieldId.Noise = 2`)

Emitted from two sources on the same `EMIT_PERIOD`/`EMIT_OFFSET` cadence:
every Active building's catalog `noise` stat, and every road edge with
positive assigned traffic volume, scaled by that edge's tier's `noiseMult`
(`roadNoiseEmission`, `src/sim/worker.entry.ts`):

```
roadNoiseEmission(volume, noiseMult) =
  min(40, ceil(volume / 4)) × noiseMult    // ROAD_NOISE_BASE_CAP=40, ROAD_NOISE_VOLUME_DIVISOR=4
```

capped so even an absurd-volume highway edge (`noiseMult` 3×) emits at most
120 per tile per emission pass — loud enough to saturate the byte through
repeated accumulation, never through overflow — and every tile of the edge
gets the same amount (volume lives per edge, not per tile). Zero-volume
edges are skipped outright. Decays at 0.90/tick, the fastest decay of any
field. **Reader:** LandValue's loss term only — Noise is not itself a
Happiness input.

## Traffic (`FieldId.Traffic = 3`)

The one field that is not additively emitted at all: `FieldSim.applyTraffic`
zeroes it and rebuilds it wholesale every `TRAFFIC_FIELD_PERIOD = 4` /
`TRAFFIC_FIELD_OFFSET = 1` ticks, straight from the road network's current
edge volumes:

```
level(edge) = clamp(255 × edge.volume / (edge.tier × 800))   // 0 if tier=0 and volume>0 -> 255
```

written saturating-additively per tile so a tile shared by two edges (an
intersection) combines both rather than one overwriting the other. This
`edge.tier × 800` capacity figure is a **separate, flatter model** from the
profile-derived capacity that actually drives routing and junction delay
(see [../engineering/systems/traffic.md](../engineering/systems/traffic.md)'s
"Where it breaks" — the two "percent full" readings are not on the same
scale, and editing a cross-section changes one without the other). One tick
after the bake, the field's own diffusion slot (period 4, offset 2) runs
over whatever `applyTraffic` just wrote. Decays at 0.92/tick. **Reader:**
the Happiness formula (capped at 180 before its own division, below) — this
is the only field whose diffusion is "of a computed reading" rather than "of
an emitted quantity."

## Crime (`FieldId.Crime = 4`)

Grows ambiently — `+2` (`CRIME_GROWTH`) per call — on any zoned tile whose
land value is below 90 (`CRIME_GROWTH_LAND_VALUE_CEILING`), and is reduced
by police coverage (half the coverage value subtracted). Both happen inside
`ServiceSim.tick`, gated at `SERVICE_PERIOD = 8` / `SERVICE_OFFSET = 6` — the
ambient growth is **not** applied every tick, only every 8th one, despite
being an "ambient" rate. See
[services-model.md](services-model.md#coverage-and-funding) for the
coverage mechanism itself. Decays at 0.985/tick, the slowest of any
actively-emitted field. **Readers:** growth's `HighCrime` problem (> 170),
LandValue's loss term, the Happiness formula, and service dispatch's
crime-incident spawn chance.

## FireRisk (`FieldId.FireRisk = 5`)

Grows ambiently — `+1` (`FIRE_GROWTH`) per call — on any tile carrying a
building at all (not just zoned tiles), and is reduced by fire-station
coverage the same way police reduces Crime. Also on the `SERVICE_PERIOD`
cadence, inside the same `ServiceSim.tick` call as Crime's growth. Decays at
0.99/tick. **Reader:** service dispatch's fire-incident spawn chance only —
FireRisk is not a growth problem flag and not a Happiness input.

## Education (`FieldId.Education = 6`)

Emitted only by school buildings' coverage, blended as a **ceiling** (max of
existing value and new coverage), never additive — a second school over the
same ground cannot double the field. No ambient growth or decay input
beyond the standard 0.99/tick. **Readers:** growth's residential
level-3 requirement (education field > 60, in addition to the land-value
threshold — [../game-design/simulation-rules.md](../game-design/simulation-rules.md)),
and the Happiness formula.

## Health (`FieldId.Health = 7`)

Emitted only by hospital buildings' coverage, same max-blend as Education,
same 0.99/tick decay. **Reader:** the Happiness formula only — Health is not
a growth-problem input.

## Happiness (`FieldId.Happiness = 8`)

Not emitted into by anything, and **never diffused** — `computeHappiness`
recomputes every tile purely from the other eight fields' _current_ values,
on its own `HAPPINESS_PERIOD = 8` / `HAPPINESS_OFFSET = 5` slot:

```
happiness = clamp(120
  + floor(education / 6)
  + floor(health / 6)
  + (landValue >> 3)
  − (pollution >> 2)
  − (crime >> 2)
  − floor(min(traffic, 180) / 6))
```

All divisions are integer floor (every input is an unsigned byte, so never
negative). The `min(traffic, 180)` cap means Traffic's drag on happiness
saturates well before the field itself does — a tile pegged at 255 Traffic
is not worse for happiness than one at 180. The per-tile byte this produces
is not itself what the player sees as "city happiness": `averageHappiness`
(`src/sim/worker.entry.ts`) recomputes a city-wide average over only
occupied tiles (`buildingId !== 0`) every time a snapshot posts (every
`SNAPSHOT_TICKS = 2` ticks — see [tick.md](tick.md)), reading whatever the
per-tile byte currently holds — which only actually changes content every 8
ticks, even though the reported average is recomputed far more often.
`CityStats.happiness` in turn feeds back into residential demand
(`(happiness − 50) / 150`,
[population-model.md](population-model.md#demand-what-decides-whether-a-building-appears-at-all)).

## What does not exist

**Weather, seasons and temperature do not exist in this simulation.** No
field above, and nothing else in `src/sim/`, models precipitation, wind,
temperature, or a calendar season — `VISUAL_DAY_TICKS`
([time-system.md](time-system.md)) is a lighting/clock cycle only, entirely
separate from any of the nine fields here, and has no seasonal variation of
its own. See [../DESIGN.md](../DESIGN.md)'s "Weather, seasons, flooding,
climate variation" entry under Deferred.
