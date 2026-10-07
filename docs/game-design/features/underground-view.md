# The underground view — design

- **Status:** Draft for agreement, 2026-10-07
- **Date:** 2026-10-07

## What the player gets

Pipes are buried. From the surface the player never sees one: the street,
the lawn and the field over a pipe look exactly as they would without it.
When the player picks up the pipe tool, a water building or a water lens,
the city **goes underground**: the ground stays, everything standing on it
fades to a glass ghost, and the whole water system shows beneath it — the
mains under every street, the pipes the player laid, and each pumping
station, tower, drain and works as the point where the system meets the
surface. Laying a pipe in this view is a drag from one wet thing to another,
and the ghost says what the run will join before the click. Putting the tool
down brings the surface back.

## Why it earns its place

The pipe overlay today is drawn **on** the ground, a hair above the road
plates, and only while a water tool or lens is in hand: a pipe is a painted
strip on the surface, which is not what a pipe is, and the houses, trees and
roads standing over it hide most of a run anyway. Worse, the overlay draws
only the pipes the player laid. The mains under the streets — the larger
part of the network — are invisible, so a pipe looks like it ends in the
grass when it has in fact joined a main, and a shore building looks
connected when it is not. The player cannot see the system they are asked
to complete.

Pillars served: **the city is legible through data lenses** (the underground
is a lens on the whole water system, not a strip on the surface) and
**city-builder UI grammar** (the tool in hand decides what the city shows).
See [../gdd.md](../gdd.md).

## How it works, for the player

### Pipes are underground

A laid pipe draws nothing at the surface. No strip, no hub, no markings:
the tile it runs under looks as it did. A pipe is a layer the ground hides,
and the only way to see it is to go underground.

### Going underground

The city goes underground whenever the player's attention is on the water:

- the **pipe tool** is in hand;
- any **water building** is in hand — the tower, the pumping station, the
  drain, the works;
- the **Water** or **Sewer** lens is on.

It comes back up the moment none of those holds. Nothing else changes the
view: there is no separate button, since a control that only changes what
the player is already looking at is a control they would have to find.

Underground, the terrain and the water stay as they are, since they are
the ground the pipes run under. Everything standing on the ground —
buildings, their lot furniture, trees, road furniture, vehicles and people —
fades to a glass ghost at a fraction of its opacity, still in place so the
player knows where they are and what a pipe is serving, but no longer in
the way. Roads fade to a faint outline of their plates so the main under
each one reads as the pipe it is. The sky, the clock and the HUD are
untouched.

### What the underground shows

Every carrier of water, drawn as what it is:

- **Street mains.** Under every street that carries water, a run of pipe
  down the road's centre, muted — the system the town got for free.
- **Laid pipes.** The player's own runs, brighter than the mains, since
  they are the part the player is responsible for.
- **Service connections.** From each building on the mains, a short lead
  from the main to the building's lot, so a served building visibly hangs
  off the network and an unserved one visibly does not.
- **The water buildings.** A tower, a pumping station, a drain and a works
  each show a **riser**, the point where the buried system comes up into the
  building: the one place a pipe can be joined to it.
- **Flow.** The water half of every carrier is blue where water reaches it
  and grey where it does not; the sewer half brown where a drain reaches it
  and grey where none does. A break in the network reads as a run that
  changes from blue to grey, which is the bug the player is looking for.

The split carrier — blue beside brown — is the one the overlay draws today
and the one the drawer's pipe card shows; it moves underground unchanged.

### Laying a pipe

The pipe tool is a drag along tiles, as it is now. Underground it gains the
help it needs:

- **The ends snap.** The start of a drag snaps to the nearest carrier within
  a tile — a main, a laid pipe or a riser — so a run begins on the system
  rather than beside it. The end snaps the same way. A drag that begins in
  open ground still lays pipe there, since a run is sometimes laid before
  the thing it will serve.
- **The ghost says what it joins.** The cost readout names the connection at
  each end: "Joins the main under Mill Road", "Reaches the pumping station",
  "Joins your pipe", or "Reaches nothing" at an end that will hang free. A
  run that reaches nothing at either end is laid all the same, and says so,
  since the player may be about to place the building it is for.
- **A refused run says why.** Over water, through a building's footprint or
  across a deck overhead, the ghost draws red and the readout names the
  tile, as the road ghost does.
- **A run under a road is free of charge.** The street already carries a
  main; dragging a pipe along it lays nothing and costs nothing, and the
  readout says "The street carries a main". A pipe crossing a road is laid
  on the far side and joins the main on its way through, as it does now.

### Placing a water building

With a water building in hand the view is underground and the building's
riser shows in its ghost. The readout says whether the riser lands on the
system — "On the main under Harbour Street", "On your pipe" — or not — "Not
connected: lay a pipe to a street", in which case the building is still
placed, since a shore building has to go where the shore is, and the Advisor
already says a drain or an intake serves nothing until it is connected.

## What it interacts with

- **The utilities walk** is unchanged. What is wet and what is drained is
  what the Water and Sewer lenses already paint, read from the same coverage
  the sim sends; the underground draws the carriers that coverage runs
  along. No new sim state and no new message.
- **The water buildings' kits** are unchanged above ground; each gains a
  riser in its kit, drawn only underground, at the footprint tile the
  network reaches through.
- **The lenses.** The Water and Sewer lenses keep painting coverage over
  the terrain; underground they are read together with the carriers. The
  other lenses do not go underground.
- **Lot and road furniture, vehicles, people, trees** are instanced meshes
  with their own materials; fading them is a material opacity, not a new
  shader, and the same switch the pipe overlay's visibility already hangs
  off. Picking is unchanged: a ghost building is still the building under the
  cursor.
- **Photo mode** and screenshots take the surface view; the camera is not
  underground when the player is not working on the water.
- **Saves** are untouched: the pipe layer is already saved (version 14), and
  the mains, the connections and the flow are derived from what stands.
- **Audio.** Nothing; the city sounds the same from underground.

## Tuning

- The ghost opacity of what stands on the surface: around 0.25, a dial, set
  so a house reads as a house without hiding the pipe under its lawn.
- The road outline: the plate at around 0.35, its markings off.
- The main's and the pipe's strip widths: the overlay's 1.2 m strips, the
  main's at a lower opacity (around 0.6 of the pipe's) so the player's runs
  stand out from the town's.
- The snap reach for a drag end: one tile, the same reach a lot's service
  has to a main.

## What it is not

- Not a change to what carries water, where pipes may go, what they cost or
  how far the water reaches. The system is the system; this is the view of it.
- Not separate water and sewer pipes. One pipe carries both, as the design
  that built them decided, and the underground draws one carrier with two
  flows.
- Not a pipe layer on the lens grid as an infoview of its own: the
  underground comes with the water tools and lenses, and there is nothing to
  toggle.
- Not an underground for power. A power line is a line of poles above the
  ground and stays on the surface; the underground is the water's.
- Not a cutaway or a camera below ground: the camera stays where it is, the
  surface goes to glass.
