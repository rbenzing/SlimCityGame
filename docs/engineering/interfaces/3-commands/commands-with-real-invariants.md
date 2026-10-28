# Commands with real invariants

**`buildRoad`** resolves `profile ?? tier` to a tier via
`tierForProfileId` (a preset's id is its own tier; a custom id resolves through
the save's profile table), rejects if that tier has no `RoadSpec` or is
locked behind an unmet milestone (unless sandbox), then solves the whole
drag's deck-height profile in one pass (`solveElevationProfile`) before
touching any tile — a tile's buildability depends on its _neighbors'_
resolved height, not the ground alone. Per tile it is one of: newly built,
_replaced_ (a different tier or composition wins over what was there),
_reprofiled_ (the tile keeps its road but changes deck height or direction),
or untouched. `changedCount === 0` (every tile untouched) acks `ok: true, cost:
0` if any tile was valid at all, else `ok: false, reason: 'invalid'`. The
inverse is assembled per prior-profile group so undo puts back the exact road
that was there (composition and id, not merely "a road of the same tier"),
plus a `terraformSet` restoring the deck heights an auto-flatten pass changed.

**`defineRoadProfile`** is checked against `layRefusal` (does the profile fit
its class's piece/lane rules and its tile or corridor width) and is
**idempotent for an identical redefinition** under an id that already holds
one: re-sending the exact same profile under the same id acks `ok: true, cost:
0, inverse: []`; sending a _different_ profile under an id that already holds
one is rejected (`reason: 'invalid'`) rather than silently reshaping every
road already laid with that id. It is not itself undoable — the profile stays
defined even if the `buildRoad` that used it is later undone, since another
tile drawn from the same custom-profile slot may still need it.

**`setJunctionControl` / `setJunctionTurns` / `setJunctionLaneTurns`** all
share the same gate: the tile must be a real junction of the street network
(`node.edges.length >= 3` — a dead end, mid-run tile, or bend has nobody to
give way to), and for the turn commands the named `arm` must point at an
in-bounds tile carrying a street tier. `setJunctionTurns`/`setJunctionLaneTurns`
additionally reject an `allowed` value that would leave the arm/lane nothing to
do (`allowed !== null && (allowed & 0xf) === 0`). All three are no-ops (`ok:
true, cost: 0, inverse: []`) when the new value equals what is already stored.
See [§4](../4-turn-and-junction-encoding.md) for what the packed values mean. All
three refuse a corner of a compact roundabout, which is one junction on four
tiles.

**`buildRoundabout` / `removeRoundabout`** make and take out a compact
roundabout on the 2×2 block whose north-west tile is `(x, z)`.
`buildRoundabout` is refused, with the site's own reason, unless
`roundaboutPlan` (`src/shared/roundabout.ts`) finds every tile laid and the
block a roundabout's site; it writes the roundabout control to the four tiles
and clears their turn and lane restrictions. `removeRoundabout` is refused
unless a compact roundabout stands there, and writes `junctions` back, or
clears the four tiles when it is absent. Bulldozing any corner takes the whole
roundabout out first, and its inverse sends `buildRoundabout` after the road is
laid back. See the [spec](../../../specs/roundabouts.md).

**`paintZone`** paints only where a player may: a buildable, road-free tile
with road frontage (a de-zone needs no frontage). A zone can outlive the road
that allowed it, so an inverse that puts zones back sends `restore`, which
skips the frontage test. Without it, undoing the de-zoning of such a tile was
refused and the zone was lost. Only an undo sends it, from `paintZone`'s own
inverse and from `bulldoze`'s.

**`bulldoze`** never funds-gates — it only rejects when every tile is
out-of-bounds. It refunds 50% of whatever stood there (roads, buildings, power
line), captures a player's junction-control override before clearing the road
under it so undo restores both the road and the override together, and always
tries to pull down any power line over the cleared tiles last. On each tile it
takes the road on top. A corridor half it takes brings its partner with it, on
the same layer, and a half at grade whose partner has a road passing over it is
refused (`bulldozeReach` in `src/shared/corridor.ts`, which the bulldoze
preview asks too). Every road its inverse lays back carries each tile's own
`flows` and `elevations`.

**`terraform`** is a brush stroke (`raise`/`lower`/`level`/`smooth`) funds-gated
by its computed kernel cost; its inverse is a `terraformSet` carrying the exact
pre-stroke heights as a `Float32Array`, not a re-solved brush, so undo is
bit-exact. **`terraformSet`** is that same primitive used directly: it applies
given heights with no cost and no kernel, and its own inverse is the heights
it is about to overwrite — which is what lets redo (a `terraformSet` undoing a
`terraformSet`) stay exact indefinitely.

**`createTransitLine`**: the `id` field on the incoming `TransitLine` is
**ignored** — the worker always assigns a fresh one when it creates the line.
The caller learns the real id from the ack's `inverse`
(`[{ kind: 'deleteTransitLine', id: <assigned> }]`), and from the line list in
every later `snapshot.transit`.

**`paintLandfill`** charges only for tiles that are actually new landfill
membership (dragging back over already-painted tiles is free) and additionally
refuses a paint batch that would leave a new, disconnected area smaller than
`LANDFILL_MIN_AREA_TILES` — not too small to _expand_ an existing area, only
too small to _create_ one. **`stringPowerLine`** charges only tiles that would
actually change, the same "redundant drag is free" rule.
