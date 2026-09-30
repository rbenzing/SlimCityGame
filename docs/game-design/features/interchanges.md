# Interchanges — design

- **Status:** Draft
- **Date:** 2026-09-30

## What the player gets

A whole motorway interchange in one click. With the Interchange tool in hand
the player points at a motorway they have already laid and sees the
interchange that would go there: a street carried over the motorway on a
bridge, and the slip roads that join the two. It comes in three forms:

- a diamond;
- a partial cloverleaf;
- a full cloverleaf.

One click lays it, one undo takes it all away.

## Why it earns its place

An interchange is the one road layout a player cannot draw without knowing
the rules by heart. Every ramp has to run beside the motorway the way it flows
before it merges, turn away, and meet the street where the street has come
back down to the ground from its bridge. Get one tile wrong and the ramp is
refused, or joins the bridge instead of the ground. Laying the four ramps of a
diamond by hand took a dozen drags. It serves the pillar that the road network
is the city's skeleton ([../gdd.md](../gdd.md)): a motorway nobody can get on
or off is decoration.

## How it works, for the player

**Pick the tool.** The Interchange card sits in the Highway tab of the road
drawer, beside the motorway and the ramp. Its options row picks:

- the **form**: Diamond, Partial cloverleaf or Cloverleaf;
- the **crossing road**: a two-lane or a four-lane road.

**Point at a motorway.** Hovering a motorway tile previews the interchange
centred on it, with the street crossing the motorway on that row. The preview
reads the carriageways that are already there:

- **Two carriageways side by side**, one each way, get their ramps on each
  one's outer side: the driver's right, where every exit and entrance is.
- **A single carriageway** gets the ramps for its own direction only.

The street stands high enough over the motorway to clear it and comes down to
the ground at 2 m a tile. Every ramp is on the ground: it starts or ends
beside the motorway, and meets the street where the street is at ground level.
Where the ground falls away from the motorway the street takes longer to come
down, and the ramps on that side meet it further out.

**The three forms.** Each serves every movement between the street and the
motorway.

- **Diamond.** One ramp in each quadrant. An off-ramp leaves the motorway
  before the bridge and meets the street at a junction. An on-ramp leaves the
  street at the same junction and joins the motorway after the bridge. Every
  turn onto or off the street is made at those two junctions. It is the
  simplest, cheapest and commonest interchange there is.
- **Partial cloverleaf.** The diamond, but the two left turns onto the
  motorway are taken off the street's junctions and given a loop each: a
  three-quarter turn to the right, in the quadrant before the bridge. The loop
  sits inside the off-ramp, which runs round it.
- **Full cloverleaf.** Loops in all four quadrants, so every left turn is a
  loop, and outer ramps round each loop for every right turn. Nothing turning
  left crosses oncoming traffic. The price is land, and the weave on the
  motorway between one loop joining and the next leaving.

**Refused, with the reason.** The preview turns red and says why when:

- the pointer is not on a motorway;
- the motorway does not run straight the whole length the interchange needs;
- it already has a ramp or a junction inside that length;
- two carriageways run on each other's left, so their outer sides are where
  the other carriageway is;
- something is in the way: a building, a road, water, ground too steep to
  build on, or a road touching a ramp where it should not;
- the ground is too uneven for the street to come down to its junctions, or
  for its bridge to stay one road. Levelling the ground first fixes it.

**What it costs.** The same as the roads it lays: the street by the tile, its
bridge by the metre it stands up, and each ramp by the tile. The chip shows
the total before the click.

**Afterwards** it is ordinary road. Its junctions take controls by warrant
like any other, the player can change them, and every piece can be bulldozed
or rebuilt on its own.

## What it interacts with

- **Ramps and motorways.** Every ramp obeys the ramp rules
  ([../../world-sim/road-model.md](../../world-sim/road-model.md)): it joins
  the motorway alongside it, running its way, at its start for an exit and its
  end for an entrance. The motorway grows its auxiliary lanes beside them as
  it does for any ramp.
- **Overpasses.** The street crosses on the second road layer, clearing the
  motorway as any overpass does
  ([../../world-sim/overpasses.md](../../world-sim/overpasses.md)).
- **Traffic.** Nothing new. The router finds its way through the ramps and
  junctions as it does through any. A left turn at a diamond's junction is
  costed as a left turn; on a cloverleaf it is a longer drive round a loop and
  no turn across traffic.
- **Undo.** The interchange is one edit. Undo removes the street, its bridge
  and every ramp together.

## Tuning

Every figure is sourced, and scaled to the 20 m tile the way the rest of the
road model is.

- **Loops.** A loop runs round a block four tiles square, about 40 m in
  radius, or 130 ft. That is the loop a 25 mph design speed needs (134 ft),
  and inside the 100–170 ft range used for minor movements
  ([MoDOT 234.5](https://epg.modot.org/index.php/234.5_Cloverleaf_Interchanges);
  [INDOT Design Manual ch. 48](https://www.in.gov/dot/div/contracts/design/Part%203/Chapter%2048%20-%20Interchanges.pdf)).
- **Ramp terminals.** On a diamond the street's junctions are two tiles
  beyond the ramp column. That puts the nearest junction under 200 ft (61 m)
  from the bridge, which is a compressed diamond, the form used where land
  is tight
  ([MoDOT 234.2](https://epg.modot.org/index.php/234.2_Diamond_Interchanges)).
  The nearest junction is 50 m (164 ft) from the motorway's edge. A
  conventional diamond's two junctions are 800–1,200 ft apart; the game's are
  140 m (460 ft) apart across a pair of carriageways, because the 20 m grid
  compresses everything around a road.
- **The forms.** The diamond is the simplest, cheapest and commonest form. A
  partial cloverleaf puts loops in some quadrants to remove the worst
  conflicting turns, and a full cloverleaf in all four
  ([TxDOT, types of interchanges](https://www.txdot.gov/manuals/des/tsp/chapter-11-interchange-analysis/11-2-interchange-configuration-evaluation--ice----/11-2-1-types-of-interchanges.html)).
- **The ramps.** An exit leaves the motorway eight tiles (160 m) before the
  bridge, and an entrance joins it eight tiles after. The auxiliary lane beside
  each is the eight tiles the road model already gives one.
- **The street's height.** Clearance plus its girder, rounded up to the
  elevation control's 2 m step: 6 m for a two-lane or four-lane road.

## What it is not

- Not a collector-distributor road. A real cloverleaf with heavy weaving
  separates the weave from the motorway on a parallel road; that is called
  for when two adjoining loops carry about 1,000 vehicles an hour
  ([WisDOT FDM 11-30](https://wisconsindot.gov/rdwy/fdm/fd-11-30.pdf)). The
  game's cloverleaf weaves on the motorway itself.
- Not a motorway-to-motorway interchange. A stack or a turbine is a
  system interchange; this is a service interchange, a street meeting a
  motorway.
- Not free placement: it goes on a motorway already there, on the grid, at
  right angles.
- Not a new kind of road. Everything it lays is a street, a bridge or a ramp
  the player could have drawn.
