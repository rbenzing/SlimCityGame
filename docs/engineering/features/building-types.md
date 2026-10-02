# Building types — technical design

- **Status:** Agreed 2026-10-01; residential kinds built 2026-10-01; commercial kinds built 2026-10-02; industrial kinds and the Heavy Industrial zone built 2026-10-02
- **Date:** 2026-10-01
- **Author:** Claude, from the player-facing design in
  [../../game-design/features/building-types.md](../../game-design/features/building-types.md)

## What we are building, and why now

A zoned building has a **kind**, drawn at spawn from the kinds its zone grows
that fit the lot, weighted by the kind's share of the real stock, and kept
through every level-up. The catalog gains the residential kinds first, with
every figure re-derived from a published source; commercial and industrial
kinds follow in their own changes on the same mechanism. The farm's `farm`
field was this mechanism for one zone; it becomes the general one.

## What it touches

| Module                                                 | Change                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                                  | `BuildingKind`; `BuildingCatalogEntry.kind` replaces `farm` (`FarmKind` stays as the farm subset); `units` (homes) and `share` (draw weight, on level 1) on the entry                       |
| `src/shared/buildingkind.ts` (new)                     | `farmKindOf(entry)`, `isFarmKind`, `householdsOf(entry)`: the one place a kind is read into what it means                                                                                   |
| `src/data/catalog.json`                                | Residential kinds at three levels each; every zoned entry's residents, units, power and water re-derived; farms keep their ids with `kind` in place of `farm`                               |
| `src/sim/growth.ts`                                    | `spawnCandidates` lists the level-1 entries of the zone that are unlocked and fit; `drawKind` picks one by `share` with the growth rng; level-up matches `kind`                            |
| `src/sim/network.ts`                                   | Supply and use summed in millionths (watts, millilitres), so a 1.4 kW house is not rounded to 1 kW                                                                                         |
| `src/sim/worker.entry.ts`                              | `selectionOccupancy` reports households as the entry's `units`                                                                                                                              |
| `src/render/archetypes.ts`                             | `isHouseEntry` reads the kind (detached, duplex, fourplex, townhouse); `kindOf` for the renderers                                                                                           |
| `src/render/massing.ts`                                | `bodyMetresFor(entry)`: the body's size in metres per axis, by kind (fill and cap), which `footprintShrinkFor` now derives from; a tower's podium tier                                       |
| `src/render/houselot.ts`, `houses.ts`                  | Homes along the frontage by kind: two per tile for a townhouse row, two for a duplex or a fourplex; each with its door, pad and (by seed) garage door                                        |
| `src/render/buildings.ts`, `lots.ts`, `parked.ts`      | Read the per-axis body where they read the uniform fill                                                                                                                                     |
| `src/render/farmlot.ts`, `farms.ts`                    | Read `farmKindOf(entry)` where they read `entry.farm`                                                                                                                                       |
| `src/shared/types.ts`, `tools.ts`, `ui/categories.ts`  | `ZoneType.IndHeavy` (10), the `zone.indHeavy` tool, the Industrial (Heavy) card on the industrial sub-tab at M2                                                                            |
| `src/render/zonegrid.ts`, `ui/styles.css`, `AssetDrawer` | The heavy zone's rust tint and its `--color-rci-ind-heavy` token                                                                                                                          |
| `src/render/props.ts`, `buildingkit.ts`                | A stack at every level of a heavy plant, twice as tall; silos by kind; the tank-farm part                                                                                                   |
| `src/shared/contracts.zoning.test.ts`, growth tests    | Three levels per **kind**; residents monotonic with level for block kinds; house-scale kinds hold one household's worth                                                                     |
| Docs                                                   | simulation-rules (the spawner, levels, lots), population-model (households), utilities-model (units), data-model (catalog fields), balancing (residential kinds), art/buildings, GROUND-TRUTHS |

**Save format: unchanged.** A building is saved by catalog id, and every id
in a save made before this change is still in the catalog, with a kind; the
zone byte gains the value 10, appended, which an older save never holds.
**Worker protocol: unchanged.** The snapshot carries the same building
fields; the inspector's household count comes from the catalog the client
already holds.

## The design

### The kind

```ts
export type FarmKind = 'crops' | 'orchard' | 'pasture';
export type ResidentialKind =
  | 'detached' | 'duplex' | 'fourplex' | 'townhouse'
  | 'multiplex' | 'garden' | 'midrise' | 'tower' | 'mixed';
export type BuildingKind = FarmKind | ResidentialKind | CommercialKind | IndustrialKind;

interface BuildingCatalogEntry {
  kind?: BuildingKind;   // every zoned entry; absent on a ploppable
  units?: number;        // homes in the building; residential and mixed, and 1 on a farm
  share?: number;        // the kind's draw weight, on its level-1 entry
  …
}
```

`kind` replaces `farm`. A farm's kind is still one of the three farm kinds,
and `farmKindOf(entry)` returns it (or null off an Agriculture entry) for
the farm renderers and growth's soil rules, so no caller has to narrow the
union by hand. A zoned entry without a kind is a contract violation and the
catalog test says so.

### The draw

In `runSpawnScan`, for an empty tile zoned `zone`:

1. `spawnCandidates(g, zone, x, z, milestone)`: every catalog entry with
   `zone`, `level === 1`, `unlockMilestone <= milestone`, whose footprint at
   rotation 0 passes `canPlace` at (x, z). Farms keep their own lot test
   (`isFarmLot`) inside this.
2. `drawKind(candidates, roll)`: one roll from the growth rng against the
   cumulative `share` of the candidates, in catalog order. A candidate with
   no `share` weighs 1. One candidate needs no roll.
3. The chosen entry goes through the checks that follow today, unchanged:
   road reach, power and water on the footprint, demand, the desirability
   draw and spare supply.

The roll is taken before the desirability roll, so growth's random stream
shifts by one draw per visited lot with more than one fitting kind; tests
that pin a sequence use a constant rng, which still picks the first
candidate.

Level-up (`tryLevelUp`) finds the next entry by `zone`, `level` and `kind`,
where it found it by `zone`, `level` and `farm`.

### The numbers

Derived in the design document; the catalog carries the results. The rules
that the balancing page states and the contract test checks:

- `residents = round(units × household)`, household 2.63 (detached,
  townhouse, farm) or 2.26 (every other kind);
- `powerUse` (MW) = units × per-home kW ÷ 1000, by kind, plus a retail
  floor's draw on a mixed block;
- `waterUse` (kL a day) = residents × 0.34, plus 0.104 per job on a mixed
  block; 0 on a farm.

Supply and use were summed in thousandths of a MW and a kL; a 1.4 kW house
rounds to 1 kW there, 30% out on the commonest building, so the line now
sums in millionths. Nothing reads the units outside `network.ts` and the
growth supply bookkeeping, which compares them to each other.

### The renderer

- **Body size by kind.** `bodyMetresFor(entry): { w, d }` in metres, per
  lot axis: a detached house 4.75 m per tile as today; a duplex 60% of each
  axis capped at 16 m (12 × 16 m on a 1×2 lot); a fourplex 70% capped at
  18 m; a multiplex 13.6 m per tile capped at 24 m; everything else 13.6 m
  per tile under the 85% ceiling. `footprintShrinkFor` keeps its callers but
  is now the body divided by the lot, per axis, so nothing else moves.
- **Homes along the frontage.** `homesAcrossFrontage(kind, tiles)`: a
  townhouse row has two homes per frontage tile; a duplex and a fourplex have
  two; a detached house one. The row plan already lays a door, a front pad
  and a seeded integral garage door per home, each pad at its home's near
  edge and its door at the far one so a 6.8 m home holds both; the duplex and
  the fourplex take that plan.
- **House kinds.** `isHouseEntry` is true for detached, duplex, fourplex and
  townhouse, which carry the pitched roof and the lot plan; the block kinds
  are `apartment` and flat-roofed.
- **Podium.** `computeSetbacks` returns, for a `tower`, a `podium` beside
  its tiers: a box at ground two storeys tall at the lot's full fill, under
  the slab the body already draws; the massing renderer instances it like
  any upper tier.
- **Zoned lots.** `isZonedLot` requires every tile of a candidate's footprint
  to carry the lot's zone, at spawn and at level-up, as `isFarmLot` always
  did for farms; a building no longer spills from one zoned tile onto the
  ground beside it. This is what makes a one-tile strip grow one-tile kinds.
- Names in the catalog say the kind, so the inspector needs no change.

### The commercial kinds

- `CommercialKind` joins `BuildingKind`: `shop`, `strip`, `supermarket`,
  `restaurant`, `fuel`, `office`, `hotel`. The catalog keeps `com-low-1` as
  the first low-commercial entry (the shop's first level), since
  `COMMERCIAL_SPAN_JOBS` is read from it, and keeps `com-low-2`, `com-high-1`
  and `com-high-2` as the shop's and the office's other levels so saves load.
- **Room.** `jobRoom(input: DemandInput): JobsBySector` in `demand.ts`
  returns the two gaps the demand formulas already compute, in jobs. The
  worker computes it beside `computeDemand` every tick and passes it to
  `growth.tick` as `room`, which defaults to unlimited for callers without an
  economy. Growth copies it per pass and counts down as it builds, as `spare`
  does. In `runSpawnScan`, after the lot-fit filter, a `com` or `ind`
  candidate must have `jobs <= room[sector]`, or be the candidate with the
  fewest jobs; `tryLevelUp` requires `next.jobs - entry.jobs <= room[sector]`
  for those sectors. Residential kinds and farms are untouched.
- **Archetypes.** `archetypeFor` reads the kind: `storefront` for shop,
  strip, supermarket and restaurant; `fuelStation` (parts `fuelCanopy`,
  `pumps`) for fuel; `office` (no parts); `hotel` (canopy, signage band). A
  commercial entry without a kind keeps the level rule.
- **Kit.** `computePartPlacements` lays the fuel canopy as a slab 2 m off the
  frontage wall, 10 m deep, 90% of the span, 5.2 m up, with four posts and
  two pump islands, all against the frontage side like the dock and canopy.
- **Bodies.** `BODY_RULES` adds `restaurant` (13.6 m per tile, cap 24 m) and
  `fuel` (fill 0.35, cap 16 m).

### The industrial kinds, and the Heavy Industrial zone

- `IndustrialKind` joins `BuildingKind`: `workshop`, `warehouse`, `factory`,
  `flex` in the Industrial zone; `foodplant`, `chemical`, `metals`, `paper`
  in the Heavy Industrial zone. The catalog keeps `ind-1` as the first
  Industrial entry (the workshop's first level, 16 jobs as before) since
  `INDUSTRIAL_SPAN_JOBS` is read from it, and keeps `ind-2` and `ind-3` as
  the factory's second level and the flex building's third so saves load.
- **The zone.** `ZoneType.IndHeavy = 10`, appended. `zoneSector` answers
  `'ind'` for it, so demand, the room rule, taxes, growth's problems and the
  Advisor's unserved-zone count need no other change; `zonableMaskFor`
  treats it as any paved-road zone. The tool `zone.indHeavy` maps to it in
  `ZONE_TOOL_TO_TYPE`, the card `Industrial (Heavy)` sits second on the
  industrial sub-tab with `unlockMilestone: 2`, `zoneTintColor` gives it a
  rust shade of the industrial amber, the drawer reads the same colour from
  the `--color-rci-ind-heavy` token, and the inspector names it "Heavy
  Industrial" (and now names the medium and mixed zones too, which it
  called "Unzoned").
- **Industry levels up on demand.** In `tryLevelUp`, a building whose sector
  is `'ind'` needs `demand.ind > 0` and skips `meetsLevelUpRequirement`, as a
  farm already did; the room rule still gates the jobs it adds. Homes and
  shops are unchanged.
- **Archetypes.** `archetypeFor` reads an industrial entry's kind:
  `workshop` (parts `rollUpDoors`), `warehouse` (`loadingDock`,
  `rollUpDoors`), `factory` (`monitorRoof`), `greenWorks` for `flex`
  (`roofArray`), `foodPlant` (`loadingDock`, `rollUpDoors`),
  `chemicalPlant` (`tanks`), `steelworks` (`monitorRoof`), `paperMill`
  (`monitorRoof`, `tanks`). An industrial entry with no kind keeps the old
  level-and-pollution rule. `isHeavyIndustryEntry` is `zone === IndHeavy`.
- **Kit.** The `tanks` part is three cylinders (the kit's first non-box, via
  `PART_GEOMETRY`), 6 m across and 5 m tall, standing 2 m off the wall
  opposite the frontage at 7.5 m centres; skipped, like a dock, where the
  building fronts no road. Roller doors stand on the dock where the
  archetype has one and on the ground where it has not (`doorSill`).
- **Props.** `hasSmokestack` is true at every level of a heavy plant and
  for a kindless polluting industrial entry at level 2 and up; the light
  kinds raise none. `smokestackSize` gives a heavy plant a 2 × 12 m stack
  against the kindless 1.6 × 6 m. `hasSiloCluster` is true for a food
  plant, or a kindless industrial entry, on a footprint 3×3 or bigger; a
  warehouse or a steelworks gets none.
- **Bodies.** `BODY_RULES` adds `flex` (fill 0.55) and `chemical` (fill
  0.5); every other industrial kind fills its plate at 13.6 m per tile.
- **Numbers.** The contract test derives each kind's jobs from its plate and
  density, its power from its sector's kWh per job (or per square foot for a
  warehouse and a flex building), its water from its sector's gallons per
  job, its pollution from its sector's releases per plant at 140 per
  484,000 lb scaled by jobs against the level-2 plant, and its noise from the
  75 dBA and 68 dB figures against a motorway's 120.

### Tests

- `contracts.zoning.test.ts`: every residential kind has exactly three
  levels in one zone; residents, units and footprint follow the stated rules;
  block kinds' residents rise with level; a house-scale kind's do not fall.
  Every commercial and industrial kind likewise, with jobs, power, water,
  pollution and noise checked against their derivations; the heavy plants,
  and only they, pollute.
- `growth.test.ts`, `tests/interaction/growth.test.ts`: a heavy estate at
  milestone 5 grows plants of the four heavy kinds, every tile on the
  estate, and the pollution field over an active plant reads above zero.
- `archetypes.test.ts`, `buildingkit.test.ts`, `props.test.ts`,
  `massing.test.ts`: industrial archetypes by kind; the tank farm's
  placement and the workshop's doors at grade; heavy stacks and silos by
  kind; the flex and chemical bodies.
- `categories.test.ts`, `tools.test.ts`, `zonegrid.test.ts`,
  `contracts.zoning.test.ts`: the heavy zone's card, tool, tint and number.
- The small town zones heavy industry north of its four-lane road.
- `growth.test.ts`: the draw lists only fitting, unlocked kinds; a narrow
  lot grows the kind that fits it; a constant rng picks the first; a
  level-up keeps the kind; farms unchanged through `kind`.
- `network.test.ts`: a 1.4 kW house counts as 1,400 W in the line.
- `massing.test.ts`, `houselot.test.ts`: body sizes by kind; two homes on a
  duplex frontage; the tower's podium tier.
- Interaction: the small town still grows, with the new counts; a strip one
  tile wide grows duplexes and fourplexes and no detached house.

### Risks

- **Pacing.** A detached house holds 3 where it held 4; a tower up to 848
  where it held 150. Milestones move. The town tests are rerun and their
  expectations re-read, not loosened.
- **Water.** A 400 kL water tower now serves about 1,200 people. The tower is
  a ploppable outside this change; its rating is flagged in the ROADMAP.
- **Variety.** With national weights a duplex is one low-density building in
  forty. The lot fit is what makes them show: they take the slivers. The
  weight is a catalog field if that proves too few.
- **Thirst.** A heavy plant draws 80–770 kL of water a day from the mains,
  up to twice a water tower's 400 kL, so a heavy estate stalls for want of
  water until the player builds towers for it. That is the sourced figure
  and the intended consequence, but it leans on the tower's unsourced
  rating, flagged in the ROADMAP.
- **Clean light industry.** A workshop or a factory now emits 1–5 where it
  emitted 60–90, so a town's air no longer goes bad around its Industrial
  zone. That follows the inventory; a player who misses the smog zones heavy
  industry.
