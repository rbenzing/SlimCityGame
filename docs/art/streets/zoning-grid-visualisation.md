# Zoning-grid visualisation

One shared predicate decides both what the visible grid highlights and what
the zone-paint tool accepts, so the grid never shows a shape the tool would
reject. A cell is zonable only within a fixed depth of 4 cells measured
perpendicular to a road's travel axis, off the road's SIDE frontage — never
the old uniform box around a road. The march steps outward from each
frontage cell and stops at the first blocking cell (water, another road, a
building, or a slope past budget), so cells sitting behind an obstacle are
never zonable. A dangling road end's frontage is only its two parallel
sides, never the open end, so nothing is zonable on or across a dead end —
the read is that a building always needs a real, direct approach from the
street, not just proximity to one.

The grid (all its layers) is visible only while a zone tool — or the
landfill brush, which paints into the same available-land mask — is in
hand; every other tool hides it. Every grid and tint vertex sits a small,
fixed positive band above the terrain height at its own position, with each
tile subdivided into 4 cells so the fill does not poke through sloped ground
near a road. New residential zone tints run in greens; Mixed tints a
distinct teal sitting between the residential green and the commercial blue
— see [buildings/README.md](../buildings/README.md) for what each zone actually builds.

