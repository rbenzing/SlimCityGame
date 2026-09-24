# Overpasses

A road that crosses another road, or a railway, without meeting it. This is
specified and not yet built; [ROADMAP](../ROADMAP.md) carries its status. The
decision to store a second road on a tile is
[ADR-0015](../engineering/adr/0015-a-crossing-tile-may-carry-a-second-road-passing-over.md).

## What an overpass is

An overpass is an ordinary elevated road, built with the bridge machinery in
[road-model.md](road-model.md), that passes over another road on the tiles
where the two overlap. Only those **crossing tiles** hold two roads. Every
other tile of the overpass, including the ramps up and down, is a normal
elevated road tile holding one road.

On a crossing tile:

- The **under road** is the road that was there. It keeps its tier, profile,
  flow, deck height and everything else, exactly as if nothing were overhead.
- The **over road** is stored in its own trailing layers: tier, profile, flow
  and deck height. Its neighbour mask is derived, like every mask: it joins
  only the tiles before and after it along its own run.
- The two never join. No traffic, utility, junction control or frontage passes
  between them.

A tile holds at most two roads. An overpass never crosses another overpass's
crossing tile, and nothing tunnels.

## Where one may be built

- **It crosses straight over.** On a crossing tile the over road runs straight
  through, at right angles to the under road. It does not turn, end, or have a
  junction there. A crossing that meets the under road at an angle, or an over
  road that bends on the crossing tile, is refused.
- **It crosses a road or a railway.** Any road class that may be elevated may
  pass over any road class or rail, and rail may pass over a road. Water is not
  a crossing; that is a bridge.
- **It clears what is under it.** The over road's deck surface must stand at
  least the clearance plus its own girder depth above the under road's deck
  surface, both in world height, so that the gap from the under road's surface
  to the underside of the girder is at least the clearance:

  | Under the overpass | Clearance |
  | ------------------ | --------- |
  | any road           | 5.0 m     |
  | rail               | 7.0 m     |

  The girder depth is the over road's bridge style: 0.3 m plank, 0.75 m beam,
  1.5 m box, and 0.55 m for the truss a railway crosses on. Those depths are already what the bridge renderer draws; they move
  to shared code so that the clearance check and the picture read one table.
  The road figure is chosen to clear the tallest vehicle the game draws with
  room to spare, and the rail figure to clear a train. Both are the game's own
  choice: the AASHTO and AREMA clearance standards they stand in for are not
  held in [Road Guides](../Road%20Guides/README.md), so they cannot be checked
  here.

- **The approaches are bridge approaches.** The deck climbs from the ground at
  `BRIDGE_MAX_GRADE` (2 m per 20 m tile, 10%), solved over the whole drag the
  way a bridge already is. Clearing a road at ground level with a 1.5 m box
  girder needs a 6.5 m deck. The approach tiles climb 2, 4 and 6 m, and the
  crossing is within one grade of the last, so a motorway overpass rises over
  three tiles each side of the crossing at the least. A deck raised by hand
  climbs in the control's 2 m steps and reaches 8 m, which takes four. A drag
  too short to climb that high is refused whole with the reason, never laid
  part-way.
- **Nothing else changes about the tiles either side.** An approach tile is
  an elevated road tile and follows every bridge rule: it grants no frontage,
  it costs the bridge premium per metre of deck, and the ground under it is
  occupied.

## How the player builds one

A drag crosses a road at grade by default, and meets it the way roads always
meet: a junction, or a refusal where the classes may not meet.

It crosses **over** in two cases:

1. The player has raised the drag's deck with the elevation control, and the
   solved deck clears the road it crosses.
2. The two roads may not meet at grade, and an overpass is what the player
   drew them for. A street drawn across a motorway is the example: today it is
   refused; with this, the tool offers it as an overpass and the ghost shows
   the ramps. The player confirms by building; nothing is laid silently.

Every crossing a drag makes is decided the same way, and the ghost shows it
before anything is built: at grade, over, or refused, with the reason on the
cursor chip. On each tile that already holds a road, the drag's solved deck
is compared with that road's:

- **At the same height:** the roads meet, as they always have.
- **Higher, where the road below runs straight across:** an overpass, if it
  clears; refused with the height it needs if it does not.
- **Higher, but not cleanly across:** refused. The drag turns or ends on the
  tile, the road below ends there, or a road below joins it along the drag's
  line.
- **Lower than the road it crosses:** refused. A road cannot yet be drawn
  under a bridge that is already there; the lower road is built first and the
  upper one crosses over it.

The deck solver does not treat the road being crossed as something the deck
must join, so a raised deck is free to pass over it. A drag that ends on a
road still has to come down and meet it there, which is why an overpass never
ends on the road it crosses.

A road below cannot be re-laid up into an overpass: a ground-level deck that
would leave the road above less than its clearance is refused.

A drag **along** a road, onto its crossing tile, only ever touches the road
that runs that way. Replacing or re-profiling the under road at a crossing
changes the under layer only, and the over road likewise. Rank still decides
replacement, layer by layer.

**Bulldozing** a crossing tile removes the over road first, because it is the
one on top and the one the cursor picks. A second bulldoze removes the under
road. Both are ordinary commands, and each returns its exact inverse, which
puts back the layer it took with its deck height and flow.

## Commands

`buildRoad` and `bulldoze` gain an optional `layer: 'over'`, appended to the
command shape. The road tool never sends it for a new drag: the worker decides
which layer a crossing goes on, by the rules above, and the worker is the
authority. The field exists so that an inverse can put back exactly the layer
it removed. A command that asks for the over layer where no under road exists,
or where the crossing rules fail, is refused.

## What every system has to learn

Each of these today assumes one road per tile, and each is a place a missed
layer would quietly treat two roads as one:

- **The road graph.** A node is identified by its tile. On a crossing tile the
  over road has its own node identity, and edges on the two layers never share
  a node. Pathfinding, the traffic assignment and cosmetic vehicles route on
  the layer they are on.
- **Traffic volume and congestion,** keyed by tile today, are keyed by tile and
  layer.
- **Masks.** The over road's mask comes from its own layer only. The under
  road's mask ignores the over road entirely.
- **Utilities and frontage.** The over road conducts nothing into the under
  road at a crossing, and neither grants frontage there. Along its own length an
  over road conducts exactly as an elevated road does today.
- **Rendering.** The under road draws exactly as it would alone. The over road
  draws its deck at its height with the existing deck renderer. A pier never
  stands on a crossing tile or in the under road's carriageway: the span is
  carried by the piers either side, and the `PIER_SPACING_TILES` rhythm
  re-phases so that it never lands on one.
- **Furniture.** None stands on the over road's crossing tile. The under road's
  furniture is placed as if the overpass were not there.
- **Picking.** A pick on a crossing tile returns the over road first.

## Saves

The four over-road layers are appended after every existing layer, and
`SAVE_VERSION` goes up by exactly one from whatever it is when this ships. A
save from before loads with the layers empty, which is exactly what it held.

## What does not change

- Motorways stay limited access. An overpass is not a join, so a street over a
  motorway does not break the rule that a motorway touches only a highway or a
  ramp.
- Two motorways drawn across each other still meet at grade, as a crossroads,
  because a motorway may meet a motorway. A player who wants them separated
  raises one over the other with the elevation control.
- Ramps, merges and diverges are unchanged, and are still never on a crossing
  tile.
- Tunnels, a third level, and interchange templates stay deferred. See
  [../DESIGN.md](../DESIGN.md).

## Truths this replaces when it ships

These statements are true today and become false with this. Each is rewritten
in the same change that ships the second layer:

- [GROUND-TRUTHS.md](../GROUND-TRUTHS.md): "Two roads never share a tile: no
  overpass", and "One deck height per tile, no tunnels, no stacked decks".
- [constraints.md](../engineering/constraints.md): "One deck height per tile".
- [DESIGN.md](../DESIGN.md): "One tile carries one road tier at one deck
  height."
- [road-model.md](road-model.md): the bridges section's deferral of overpasses.
- [debugging.md](../engineering/standards/debugging.md): an overpass "is asked
  for and expected to be refused".
