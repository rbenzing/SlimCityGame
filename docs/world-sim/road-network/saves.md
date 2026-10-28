# Saves

The network is saved: the node table and the segment table, appended after
the grid's tiles. The road tile layers — tier, mask, profile, flow, deck
height — and the overpass layers are not saved, because they are derived.
Stage 1 bumps `SAVE_VERSION` by exactly one for this. The per-tile junction
layers stay saved until stage 6 moves junction settings to the node, which is
the second bump.

A save from before converts on load. Every run of road tiles between two
node tiles becomes one segment, where a node tile is a junction, a bend, a
dead end, or a tile where the tier, profile, flow or grade changes. An
overpass's crossing tile is part of its run, so each overpass is one segment
passing over the road beneath. The conversion must derive exactly the tile
layers the save held: a save that converts to anything different is a
conversion bug.

Where two roads share a tile, the one with the higher deck is the road passing
over it, on the overpass layers. Nothing else in the network says which layer
a road is on, because nothing else needs to.

