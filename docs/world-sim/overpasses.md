# Overpasses

A road that crosses another road, or a railway, without meeting it. The
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
   drew them for: a street drawn across a motorway, anything a ramp may not
   touch, a road drawn across a railway. The tool raises the deck to what the
   road beneath needs, in the elevation control's 2 m steps, and the preview
   names it an overpass and gives its height. The player confirms by
   building; nothing is laid silently. The ghost itself carries no heights —
   for an overpass or any raised road — so it does not show the ramps.

The tool asks the same questions before anything is sent, with the reason on
the cursor chip: a crossing that is not straight across is refused, and so is
a drag too short to climb to the height before it reaches the crossing. The
worker then decides every crossing a command makes, whatever sent it. On each
tile that already holds a road, the drag's solved deck is compared with that
road's:

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
one on top. A second bulldoze removes the under road. Both are ordinary
commands, and each returns its exact inverse, which puts back the layer it
took with its deck height and flow. An approach left standing in the air
joins nothing: roads join only at one level.

## Commands

`buildRoad` and `bulldoze` take an optional `layer: 'over'`. The road tool
never sends it for a new drag: the worker decides which layer a crossing goes
on, by the rules above, and the worker is the authority. The field exists so
that an inverse can put back exactly the layer it removed; a `buildRoad` on the
over layer where no road lies beneath is refused.

## How every system tells the two roads apart

A road is identified by its tile and its layer — a `RoadKey`, the tile index
for the road on a tile and the tile index plus the tile count for the road
passing over it. Because the two roads on a crossing tile always run at right
angles and nothing turns there, the direction of a step says which one it
meets: along the overpass's line, the overpass; any other way, the road on the
tile. `roadStep` in `src/world/roads.ts` is that rule on the tiles, and the
road network's cells (`roadCellsOf`), which the graph and the spreads walk,
link the two roads the same way.

- **The road graph.** Nodes and runs are keyed by road, not tile. The over
  road is never a node on its crossing tile — it runs straight through — so an
  overpass is one run from approach to approach, and the road beneath runs on
  untouched. A run records which of its tiles are on the over layer
  (`GraphEdge.overTiles`) and reads its class, lanes and direction from the
  right layer.
- **Traffic volume and congestion** are per run, so the two roads carry their
  own.
- **Masks.** The road beneath never joins along the overpass's line; the
  overpass joins only its own approaches.
- **Utilities, coverage and frontage.** Power, water and service coverage run
  along an overpass and never down into the road beneath. Neither road grants
  frontage on the crossing tile.
- **Rendering.** The road beneath draws exactly as it would alone. The
  overpass draws as a second pass on its crossing tile, on a surface that
  follows its own line, and the approach tiles see it as their neighbour. Its
  girder and parapets come from its own deck, and no pier stands on a crossing
  tile: the span rests on the piers either side.
- **The approach walk** is told which way a road passes over a tile, so the
  road beneath gets no junction arrows, stop lines or bays at a crossing.
- **Vehicles.** A car on a crossing tile rides the overpass when it is driving
  along the overpass's line, and the road beneath when driving across it.
- **The road tool** recognises the tiles a drag crosses over from the crossed
  road's mask, so a pair of carriageways is two crossings and not a junction.

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
