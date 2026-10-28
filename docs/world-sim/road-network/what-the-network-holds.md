# What the network holds

- A **node** is a point in world space: an x and z in whole centimetres, and a
  deck height above the ground, zero on the ground. A node exists wherever a
  segment ends: at a junction, at a dead end, and wherever a road changes
  tier, profile, flow, grade or curvature.
- A **segment** joins two nodes. Its centre line is either straight or a
  quadratic curve with one control point, the point both end tangents aim at.
  It carries the road's **tier**, its **profile**, its **flow** (the stored
  flow byte, as on a tile today), and its deck height at each end, zero on the
  ground. Between its ends the deck climbs at an even grade.
- **While a node sits on the grid, it also carries the road on its own tile:**
  tier, profile and flow. A grid junction's surface is one road, the one last
  drawn through it, and that is what the tile model stores. When junction
  shapes are built from their roads (stage 6), this goes.
- Nodes and segments are identified by slot. A slot is stable for the life of
  what fills it and is reused only once free, lowest first.

Positions are whole centimetres so that the save holds integers and every
derived figure is computed from the same numbers on every machine. A grid
tile's centre is at 20 × _x_ + 10 m. A curve is sampled at a fixed spacing
along its length, and every system that needs the centre line reads the same
samples.

**Everything else about a road is derived:** its class, its lanes and width,
its length, which tiles it covers, what it grants frontage to, and its
junctions' shapes.

