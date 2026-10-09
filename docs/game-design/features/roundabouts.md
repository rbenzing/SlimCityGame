# Compact roundabouts — design

- **Status:** Built 2026-09-30
- **Date:** 2026-09-30

## What the player gets

A proper roundabout in one click. With the Roundabout tool in hand the player
points at a street junction they have already laid and sees the roundabout
that would go there: a ring 36 m across round a planted island, filling a
block of two tiles by two. The ring takes the quarter of the junction's tile
nearest the pointer. One click lays it, one undo takes it away.

The one-tile mini roundabout, chosen in the junction inspector, stays as it
is. The two are different sizes of the same thing, and the guides treat them
as different things too: a mini roundabout's island is small enough to drive
over, a compact one's is not.

## Why it earns its place

A mini roundabout on a 20 m tile is the smallest roundabout there is, and
reads as a dot in a crossroads. The roundabout most towns actually build is
bigger than a tile. Without this the roundabout the road model describes
could not be built at all. It serves the pillar that the road network is the
city's skeleton ([../gdd.md](../gdd.md)): a roundabout is the junction that
moves traffic without stopping it.

## How it works, for the player

**Pick the tool.** The Roundabout card sits in the Small tab of the road
drawer, beside the streets of one lane each way it serves. It has no options.

**Point at a junction.** Hovering a street junction previews a block of two
tiles by two: the junction's own tile and the three beside it on the side the
pointer is nearest. The ring is centred on the corner those four tiles share.
Any of the three that has no road yet is laid with the junction's own road,
which is how a crossroads becomes a square; nothing else about the roads
changes.

**What it is.**

- **The ring** runs anticlockwise round the island, the way right-hand traffic
  goes round, one lane wide.
- **Every road into it gives way** to the traffic already on the ring, at a
  line of white triangles across its entry, with a give-way board beside it.
- **Every road into it that runs both ways gets a splitter island** where it
  meets the ring, between the traffic coming in and the traffic going out.
- **A left turn goes three-quarters round**, straight on goes halfway, and a
  right turn a quarter. Nobody turns across oncoming traffic, and nobody
  stops for a signal.

**Refused, with the reason.** The preview turns red and says why when:

- the pointer is not on a street junction;
- a tile of the block is already a roundabout, is on a bridge or under one,
  or has a road off the grid meeting it;
- something is in the way of a tile to be laid: a building, water or ground
  too steep for a road;
- a road on the block, or into it, has more than one lane each way. A compact
  roundabout is a single-lane roundabout, and a wider road needs a two-lane
  one, which the game does not build;
- a motorway, a corridor or a tramway would meet it;
- it would have fewer than three roads into it, or two on the same side;
- a road into it has another junction on its first tile;
- the ground rises or falls more than 4% across it.

**What it costs.** Only the road it lays, at that road's price. The
roundabout itself, like any control, is free.

**Afterwards.** Its roads are ordinary roads. The junction inspector, opened
on one of its tiles, names it and offers one action, **Take out the
roundabout**, which leaves its four tiles as four junctions under their
warrants. Bulldozing any of its tiles takes the roundabout out with it, and
undo puts it back.

## What it interacts with

- **Traffic.** The router drives round the ring the one way it goes. A
  driver entering pays the roundabout's delay, quick until the ring fills and
  then suddenly not, the curve the mini roundabout already uses; nobody
  already on the ring pays anything to carry on round. Going round is
  driven, so a left turn costs the three-quarters of a circle it takes.
- **Cars on screen** drive round the ring on the circle, not across the
  island.
- **Signs and lamps.** Every road into it carries a give-way board. Nothing
  stands on the ring itself.
- **Undo.** The roundabout is one edit, the road it laid included.

## Tuning

Every figure is sourced, and scaled to the 20 m tile the way the rest of the
road model is.

- **Size.** An inscribed circle 36 m (118 ft) across, inside the block's 40 m,
  leaving room for a footway round it. NCHRP 1043 calls 80–120 ft (24–37 m) a
  compact roundabout (as reproduced in
  [WisDOT FDM 11-26](https://wisconsindot.gov/rdwy/fdm/fd-11-26.pdf), Table
  2.2); FHWA's first guide calls 30–40 m an urban single-lane roundabout
  ([FHWA-RD-00-067](https://www.fhwa.dot.gov/publications/research/safety/00067/000676.pdf),
  Exhibit 6-19). It is favoured on roads posted at 40 mph or less.
- **The ring.** A circulatory roadway 5.5 m (18 ft) wide, which is the 120% of
  the entry width FHWA allows (§6.3.3) and inside NCHRP 672's 16–20 ft. Inside
  it, a truck apron 3.7 m (12 ft) wide, which a long vehicle's rear wheels
  track over: FHWA gives 1–4 m (§6.3.4) and WisDOT at least 12 ft. The raised,
  planted island inside the apron is 17.6 m across.
- **Entries.** One lane, 4.65 m wide at the yield line: the road's own lane
  and half the splitter island's width. FHWA gives 4.3–4.9 m for a
  single-lane entry (§6.3.2).
- **Splitter islands.** 1.8 m (6 ft) wide where they meet the ring, the
  narrowest refuge FHWA allows (§6.3.8). FHWA asks for 15 m (50 ft) of
  splitter; the ring's own tile holds about 5 m of it, and the rest would lie
  on the road beyond, which the game does not draw. That is the grid's
  compression, stated rather than hidden.
- **The yield line** stands at the edge of the circulatory roadway, across the
  entry (FHWA Exhibit 6-1; MUTCD 3D.04).
- **Kerbs into the ring.** The kerb on the side of a road away from the ring's
  centre curves into the ring at 15 m (50 ft) where the tile holds it, FHWA's
  least exit radius (§6.3.6.1). The kerb toward the centre meets the ring
  almost square, half a tile off it, and has room only for a kerb return of up
  to 3 m; FHWA's entry radius is 10–30 m (§6.3.5.1), and the grid does not
  leave room for it.
- **One lane each way.** A single-lane roundabout has single-lane entries and
  exits; a wider road needs a multilane roundabout.
- **Three or four legs, one to a side.** FHWA spaces legs equally, 90° apart
  for four, and sizes its roundabouts for four legs or fewer (§6.2.4).
- **Legs off centre.** Every road reaches the ring 10 m off its centre, half a
  tile. Offset to the entering driver's left is acceptable; offset to the
  right FHWA's first guide calls "almost never acceptable" (§6.2.4), and
  NCHRP 672 "not a fatal flaw" where speeds are kept down (as reproduced by
  [SCDOT](https://www.scdot.org/business/pdf/I26Widening/AttachB/Roadway/Roundabout_Criteria.pdf)).
  On a straight crossroads two legs come in each way. A player who wants all
  four offset to the left jogs each road a tile before it reaches the ring,
  the pinwheel, and the tool accepts it.
- **No junction on a leg's first tile.** The guides give no figure; WisDOT
  advises against driveways cut into the ring (§10.11.5). A tile of plain road
  between the ring and the next junction is the game's own rule.
- **Grade.** No more than 4% across the block along either road. FHWA:
  "generally not desirable to locate roundabouts ... where grades through the
  intersection are greater than four percent" (§6.3.11.3).
- **Anticlockwise.** The circulatory roadway runs counterclockwise round the
  island for right-hand traffic (WisDOT Table 2.1).
- **Capacity and delay.** The entry delay is the roundabout curve the mini
  roundabout already uses. A compact roundabout carries up to about 15,000
  vehicles a day (WisDOT Table 8.1, from NCHRP 1043 Exhibit 8.2).
- **An entry is as good as the gaps in the ring.** Each entry carries the
  Highway Capacity Manual's single-lane entry capacity, 1,380 · e^(−0.00102
  · v_c) veh/h, where v_c is the traffic circulating in front of it (HCM 7th
  edition, Eq. 22-1, which NCHRP 1043 follows). An entry on an empty ring
  takes 1,380 veh/h. With 1,000 veh/h going round in front of it, it takes
  about 500, so a roundabout whose ring is busy queues at the quiet legs
  too. On the compact roundabout the circulating traffic is the ring's own.
  On the mini roundabout, which is one tile, it is worked out from the other
  legs' traffic.

## What it is not

- Not a two-lane roundabout. A road of two lanes each way, or a two-tile
  corridor, would need one, and it is not built.
- Not crossings. A roundabout's pedestrian crossings stand a car length back
  from the yield line (FHWA §6.3.7); the mini roundabout paints none and
  neither does this.
- Not lit round its ring, and not signed in advance with a roundabout-ahead
  warning.
- Not a tramway's crossing: a tramway may not meet it.
- Not a new kind of road. The ring is the four tiles' own roads, read as a
  roundabout because each carries the roundabout control.
