# The cemetery

The 3×3 lot at 3.2 m is one lawn plate on the highest ground under the lot (as
the paved kits stand), with:

- **One gatehouse tile**, on the street side beside the drive: one storey, 12 ×
  10.67 m (128 m², the design figure), gabled to 3.2 m, with a small paved
  forecourt before its door.
- **Eight burial sections** of 14 × 7 = 98 graves each, 784 spaces; the first 780
  are used. Each space is 1.07 × 2.44 m, the 42 × 96 in minimum of Florida
  Statutes 497.274, with 0.08 m between neighbours and a 0.3 m aisle between rows,
  drawn as a darker turf patch so the rows read from the default pitch.
- **An interior drive** 20 ft (6.1 m) wide, two-way, along the line between the
  last two columns of tiles from the street edge to the back fence (Montgomery
  County MD private interior road standard). It crosses sections and so takes
  their margin; each still holds 98 graves.
- **A perimeter fence** 1.5 m high (cemetery fences run 4-6 ft; Roslyn WA caps
  them at 6 ft; 1.5 m is the game's choice), posts, rails and pickets, with a
  gap as wide as the drive and a stone pier either side.
- **Trees**, the park's tree, in the lane between sections and beside the
  gatehouse.
- **Headstones**, one instanced mesh for every cemetery: an upright 0.61 × 0.20 ×
  0.76 m (24 × 8 × 30 in, inside the common US single-upright range of 24-36 in
  tall, 20-30 in wide and 6-8 in thick) on a 0.1 m wider, 0.1 m high base, grey
  granite, standing at the head (back) end of its space. A cemetery shows exactly
  as many as its interments, in fill order: the front section first, each from
  its front row, never more than 780. The count follows the snapshot's
  `deathCare.facilities`, not the building delta.

The lot's local +Z is the street side; the player turns the lot to face the road
like the other kits. Layout is a pure function of the footprint, at all four
rotations. The grave colours, fence and gatehouse colours are the game's own.

