# 5. Road composition

A road is a **class** (`RoadClassId`, functional hierarchy), a **profile**
(`RoadProfile`, an ordered cross-section of `LanePiece`s), and — for the 12
built-in tiers — a **preset** (`RoadSpec`, `src/data/roads.json`). `RoadTier`
runs `None = 0` through `Ramp = 12`; a preset's profile id always equals its
tier. Player-composed profiles are numbered from `FIRST_CUSTOM_PROFILE_ID =
13` up (`src/shared/roadprofile.ts:62`), in the save's own table
(`customRoadProfiles`, echoed in full as `SimSnapshot.roadProfiles` whenever
it changes).

```ts
export interface LanePiece {
  kind: LanePieceKind; // 'travel' | 'centreTurn' | 'parking' | 'bike' | ...
  width: number; // metres across the tile
  flow?: LaneFlow; // 'fwd' | 'back' | 'both'; omitted = 'both'
  tram?: boolean; // a travel lane with rails embedded in it
}

export interface RoadProfile {
  class: RoadClassId;
  postedKmh?: number; // omitted = the class default
  pieces: LanePiece[]; // kerb to kerb, in order
  kerbs?: boolean; // omitted = true when the profile has a sidewalk piece
}
```

A profile is validated by `layRefusal` (`src/shared/roadprofile.ts:993`),
which returns `null` when the profile may be laid or a player-facing string
when it may not: every piece kind must be one its class `admits`, the
travel-lane count must sit in the class's `lanes` range, and the profile's
total width must fit one tile (`fitsTile`) or, for the classes wide enough to
need one (`classAdmitsCorridor`), two tiles as a **corridor** (`fitsCorridor`,
`CORRIDOR_METERS = 2 * TILE_METERS`). Two tests in the `roadprofile.test.ts`
suite (lines 836 and 1222) pin the distinct refusal messages this produces:
"too wide" vs. "too many lanes" vs. "too wide for even a corridor".

A corridor is two ordinary `buildRoad` commands, not a new `Command` kind: the
tool splits a drag into a **near** run (the drag itself, carrying the LEFT
half of the cross-section) and a **far** run one tile across
(`corridorRunsFor`, `src/shared/corridor.ts:40`), each stamped with a stored
flow byte that also records which half it is (`CORRIDOR_BIT`,
`CORRIDOR_RIGHT_BIT`, `storedFlow`, `src/shared/types.ts:84-114`). Only a
straight drag gets one — the two halves have to lie beside each other across
the direction of travel for the render/network/approach code to read them as
one road (`corridorPartners`, `src/shared/corridor.ts:90`), and a bend is
refused rather than laid as a row of phantom crossroads.

On load, `adoptCustomProfiles` (`src/shared/roadprofile.ts:81`) renumbers any
custom profile whose id has since been claimed by a new preset tier (the
custom-id floor moves up every time the catalogue gains a tier) and rewrites
the affected tiles in place — idempotent for a table already clear of preset
ids.
