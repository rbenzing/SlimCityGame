# Data model and schema

SlimCity's world is a flat grid of typed arrays — one array per layer,
`MAP_SIZE * MAP_SIZE` entries each, no per-tile objects. A save is those
arrays serialized behind a version number, plus a small JSON envelope for
everything that isn't a grid layer. This document is the shape of that data:
every layer's type, meaning and default, the save format's byte layout and
version history, the tables that live alongside the grid, and the JSON data
files that seed the catalogue. For what the simulation _does_ with any of
this, see the specs (start at the [documentation map](../../README.md)); this document only says what the data IS.

## The sections

| Section | Bytes |
| ------- | ----: |
| [The tile grid](the-tile-grid.md) | 14699 |
| [The save format](the-save-format.md) | 8740 |
| [Entities beyond the grid](entities-beyond-the-grid.md) | 9336 |
| [The data files](the-data-files.md) | 16153 |
| [The scalar fields](the-scalar-fields.md) | 3074 |
