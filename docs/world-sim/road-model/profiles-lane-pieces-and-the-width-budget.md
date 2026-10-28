# Profiles: lane pieces and the width budget

A tile is 20 m. A profile is an ordered list of lane pieces, kerb to kerb,
each with a width in metres; what is left over is verge. The presets keep
the widths that reproduce their existing carriageways — 3.75 m lanes on
most, 3.3 m narrower where the avenue's median has to fit inside 15 m — so
their geometry is unchanged. A newly composed piece defaults to the real
widths urban design guidance uses:

| piece       | default width | real-world range                         |
| ----------- | ------------- | ---------------------------------------- |
| travel lane | 3.5 m         | 3.0–3.6 m                                |
| centre-turn | 3.6 m         | —                                        |
| parking     | 2.25 m        | 2.1–2.6 m parallel; see below for angled |
| bike        | 1.6 m         | 1.5–1.8 m                                |
| bus / tram  | 3.5 m         | —                                        |
| median      | 1.8 m         | 1.2 m minimum, 4.9 m to hold a turn lane |
| barrier     | 0.6 m         | —                                        |
| sound wall  | 0.6 m         | the safety barrier it stands on          |
| shoulder    | 1.5 m         | —                                        |
| sidewalk    | 1.9 m         | 1.8–2.4 m                                |
| rail        | 5.6 m         | —                                        |

A travel lane is also built to the width its class uses, from the US
lane-width standards: 12 ft (3.6 m) on an arterial, a divided road, a
highway and its ramps; 11 ft (3.35 m) on a rural road, an urban street and a
collector; 10 ft (3.05 m) on a local street, a one-way and an alley; 9 ft
(2.75 m) on a dirt road. A class also fixes which total lane counts it is
built in — not dialled a lane at a time, since a four-lane arterial is a
kind of road, not a three-lane with one added: an urban street or a collector
offers 2/4/6, an arterial or a divided road what its own range holds inside
those steps, a one-way 1/2/3, a rural or local street 2, a dirt or alley road
2 only. A motorway offers 3/4/5/6 — every step of its range, because those
are ONE carriageway's lanes and each is a road somebody builds.

A parking lane is laid in one of three **parking styles**, and the style is
part of the profile: a field on the parking piece, `parallel` where it is
absent, so a profile saved before styles existed reads exactly as it did. Both
kerbs of a road take the same style. Every style parks the same car, the
common 8.5 × 18 ft (2.6 × 5.5 m) stall, and the lane is as deep as that stall
needs at its angle:

| style    | angle to the kerb | lane depth | kerb per stall | where it comes from                                  |
| -------- | ----------------- | ---------- | -------------- | ---------------------------------------------------- |
| parallel | 0°                | 2.25 m     | 6.7 m          | the parking piece above                              |
| angled   | 60°, backed in    | 6.0 m      | 3.0 m          | 5.5·sin 60° + 2.6·cos 60° ≈ 6.0; 2.6 ÷ sin 60° ≈ 3.0 |
| head-in  | 90°               | 5.5 m      | 2.6 m          | the stall itself                                     |

An angled lane is parked by **backing in**: the driver passes the stall,
reverses into it, and leaves nose-first with the traffic, which is how a
back-in angle is signed (MUTCD R7-10, used beside bike lanes in §9B.10) and
why each stall's kerb end lies upstream of its travel end. The style's depth
counts against the tile like any other piece, so the width budget alone
decides what fits: a Two-Lane with footways is 11.25 m, which takes an angled
lane on one kerb (17.25 m) but not on both (23.25 m, too wide for the tile),
and head-in likewise (16.75 m one side, 22.25 m both).

A profile's width against the tile decides what it can be:

- **Fits one tile.** Two travel lanes plus two parking lanes plus two
  sidewalks is 15.3 m — a local street with parking both sides. Four travel
  lanes plus two sidewalks is 17.8 m, which does **not** fit, so a four-lane
  urban street gives up its footways for half-metre kerbs instead, exactly
  as the existing preset does. Three travel lanes plus a centre-turn lane
  plus two bike lanes plus kerbs is 15.7 m, which fits.
- **Fits a two-tile corridor.** Six and eight lanes never fit one tile and
  are not made to. A road that wide is laid as a **corridor**: two
  carriageways side by side, each a tile wide, each centred on its own tile
  and carrying half the cross-section — the piece straddling the middle
  (almost always the median) is split between them, so each half is
  finished on its inner edge by its own share of it. A class earns a
  corridor only by needing one — only a class whose own largest road does
  not fit one tile gets a second, so a local street with parking on both
  kerbs stays too wide rather than quietly becoming a corridor with acres of
  verge. The corridor half a tile carries, and the profile id that says the
  two halves are one road, live in the tile's stored flow byte (below); the
  road tool lays both runs from one drag, ghosted and refused together if
  either half cannot fit.

  The two halves are one road, and a drag never takes one away from the
  other. A road laid over a corridor half, whether it replaces it or re-lays
  it with another direction or another pairing, has to take that half's
  partner with it, as its partner. Otherwise it is refused ("That would split
  a corridor"). A corridor dragged one row off the one already there would
  pair the row they share with a new row and leave the other old row as half
  a road with nothing beside it. Re-laying the same corridor, turning it
  round, or crossing both its halves is fine.

  A bulldoze never takes one away from the other either. A bulldoze over
  one row of a corridor takes the other row with it, on the layer it takes
  the first from: on each tile a bulldoze takes the road on top, so a
  corridor bridging another road goes with its bridged partner, and one at
  grade with its partner at grade. The preview outlines both rows, and the
  refund covers both. The one bulldoze refused is a row at grade whose
  partner has a road passing over it ("That would split a corridor"). The
  bulldoze would take that road and leave the half beneath, so the player
  takes the bridge down first. Its undo lays the corridor back as it stood,
  each tile with its own stored flow and deck height, both halves paired
  again.

  **A motorway laid across two tiles is still one carriageway.** A five- or
  six-lane motorway does not fit a tile either, but nothing divides it: it is
  one road running one way, and a second motorway laid beside it is what
  carries the other direction. So its halves are not two carriageways centred
  on their tiles with grass between. Each half is pushed against the tile edge
  the two share, so the asphalt runs unbroken across it: one set of shoulders
  at the outer edges, the yellow edge line on the driver's left and the white
  on the right, and lane lines between every pair of lanes, whichever tile
  they fall on. The shared edge is not an edge: no edge line, no kerb and no
  roadside furniture stand on it. Drawn centred, a six-lane motorway read as
  two three-lane carriageways side by side, both running the same way.

  The same is true of any corridor that nothing divides: an undivided
  six-lane arterial, or a divided road built without its median. A corridor
  is divided only where a median or a barrier lies at its middle; otherwise
  its halves are pushed against the edge they share, the same way. The line
  on that edge is the one the whole road paints there: the centre line where
  the lanes either side run opposite ways (the double solid yellow of an
  undivided multi-lane road), a broken lane line where they run the same way,
  and nothing where the middle falls inside a lane. The low half paints it
  for both.

  Such a road meets streets at junctions. A street joining one half from
  outside makes a T with that half, and the other half runs straight past. A
  street crossing it passes through both halves, which are then two junction
  tiles side by side, drawn as one junction:
  - Kerb returns only at the road's outer edges, and none at the shared edge.
  - The crossing street centred on its own line.
  - Crossings on the outer arms only.
  - A stop line across the lanes that arrive, and no crossing, stop line or
    kerb on the shared edge.
    A road this wide ends square, kerbed across the whole of it, rather than
    in a turning head on each half.

  Each half carries one direction. Half of a two-way corridor may carry the
  lanes running against the way the road was drawn (`runsAgainstDrawing`),
  and those arrive at a junction from the other end. Its arrows, its stop
  line and its turn bay are at that end, not at the end the drawing faces.

- **Does not fit at all.** A class that admits no corridor and cannot fit
  one tile, or a cross-section wider than two tiles even on a
  corridor-eligible class, is refused outright with a reason on the cursor
  chip ("too wide for the tile" / "too wide for a corridor").

