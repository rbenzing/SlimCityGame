# SlimCity — Design & Technical Roadmap

**SlimCity** is a small-form-factor **city builder** for the browser: a
familiar city-builder play grammar and UI layout at reduced scale, built on
**Three.js** as a deliberate engine showcase — proof that a web engine can
deliver a living, data-rich city sim. Maps and texture sets are
**AI-generated raster assets** (terrain heightmaps + satellite-style
colormaps, facade/ground atlases).

Two identities, one build:

- **The game**: paint zones, grow a city, read it through infoviews — the
  genre's feel, browser-sized.
- **The demo**: instancing at scale, day/night, GPU-friendly sim fields,
  buttery RTS camera — Three.js flexing.

_Design rationale and scope guards (deferred / rejected directions) live in
[DESIGN.md](DESIGN.md). The specs themselves are organised by discipline —
start at the [documentation map](README.md); the player-facing how-to-play is
[USERGUIDE.md](userguide/README.md). This roadmap
is the single place delivery status and dates live — the specs and DESIGN describe
current behavior only and carry no dates of their own._

---

## Status (2026-09-29)

**Test suite:** 7,319 tests passing across 207 test files, run 2026-10-28.
This is the only test count in the documentation set. When the suite changes
again, update the figure here and nowhere else.

**Shipped:** the narrative of everything built, epic by epic, is in
[roadmap/0-what-is-shipped.md](roadmap/0-what-is-shipped.md); the
[history](history/README.md) holds each delivery and its date.

**Open:**

- The shipped industrial lots are too shallow for the yard the second pass
  gives the heavy kinds: a body fills 13.6 m of each 20 m lot tile, so no
  warehouse lot has the 18.7 m a 16 m van needs behind a dock door, and no
  4×3 heavy lot has room for a 20 × 12 m scrap yard or a 24 m chip pile.
  The kit omits what does not fit and parks the vans in the lot's trailer
  stalls. The real fix is deeper lots for the heavy kinds in the lot layout
  (truck courts run 120–135 ft), a lots-and-land change.
- A civic kit stands on a raised plinth, so its apron or yard meets the
  crossing to the road with a step at the footprint's edge; the plinth is
  the kits' pre-existing pad, and a ramp or a lowered pad is a kit
  follow-up. A tram depot declares no crossing (its gate faces the track)
  and the college no drive (its kit has no car park).
- A bus stop stands on grid street tiles only: its furniture frame reads a
  grid road axis, so a free-form curve takes no stop yet. The lamp renderer
  already lays furniture along a curve and is the frame to reuse.
- Beside a curve an industrial box can still grow on verge tiles outside
  any framed parcel, since industry has no frontage rule on the grid; a
  framed building never levels up into a larger footprint; and a framed lot
  that lays no car park still reads its kerbside allowance from grid edges.
  All three are curved-parcels follow-ups.
- The split-level's two-storey block is a wall-colour box: the facade's
  window grid covers the house body only, so the block's upper storey has no
  panes and reads blank up close and dark at night. Panes drawn by the house
  kit on the block are the follow-up.
- The incinerator's pollution of 120, now what it emits at its burn ceiling,
  and its 2 kL of water are dials: municipal waste-to-energy plants do not
  report to the Toxics Release Inventory, so there is no like-for-like
  figure, and no water figure was found. The pocket park's 0.2 kL is a dial
  too.
- The kerb paints stalls across curb cuts and house drives, so a lot's kerb
  credit can count a stall a driveway would block.
- A corner apron tile beside a road on a slope can keep a stale run-out
  height up to 0.4 m above the deck beside it (seen on a synthetic slope
  while tracing the junction step, not in the clipping sweep); the apron
  cap would read edge-adjacent roads first to close it.
- A kerb-credited lot's customers are drawn parked on the lot, not in the
  kerb stalls its credit counts.
- The district fire station's second company rolls as a second engine: there
  is no ladder-truck vehicle kind yet (an aerial is 51 ft and up, 13 ft high,
  per one feasibility study). The engines parked on station aprons are
  decoration and stay put when the station dispatches.
- A fire's on-scene time of 10–30 ticks (1.2–3.6 game hours) is a dial: no
  US figure for an engine's time on scene was found (NIST's fireground
  experiments give crew-size ratios, NFPA 1710 gives arrival targets).
- After the performance slice (2026-10-15) the Metropolis is triangle-bound
  on the measured laptop GPU: the city still adds 19–26 M triangles over the
  empty map's 8.4 M, and the overview still draws three times the oblique's
  calls (1,125 against 389). The next performance gain is triangles, in the
  roads' and lots' merged geometry and the wild trees, not calls.
- The frame tool reads frame time from animation-loop deltas, so a build
  that submits fewer calls shows alternating fast and slow frames (the
  browser queueing ahead of the GPU); the tool reports an eight-frame
  windowed 95th percentile for that reason. A GPU timestamp query would read
  the frame itself.
- Placing a district-edge column of road across the street rows in
  `tools/frame-budget.mjs` logs about 27 "road network (command): tile(s)
  derived differently … roadMask" errors at the junctions; the city stands,
  but the conversion disagrees with itself there.
- A multiplex's stoop step stands 0.6 m into its car park's aisle and its
  mail kiosk on the front walk the aisle overlaps by 1.2 m; the lot layout
  should hold the aisle off the entrance walk. The courtyard apartments have
  no walk from the sidewalk to their street breezeway. The mid-rise and the
  tower now draw one body at the catalog height, which holds more floor than
  their `units` were counted on when they stepped; the unit counts were left
  as they were. `window.__slimcity.readKit()` reports only the kit's first
  six part kinds.
- A ground truth says `VISUAL_DAY_TICKS` never drives a sim rule, but the
  traffic system's rush hour reads the visual clock and the transit dead
  runs now follow it for their 05:00 and 23:00 crossings, since the
  renderer's hiding of the loop has to match the sim to the hour. Either the
  truth gains the exception or both systems move to the calendar day; the
  player decides.
- The crematorium's upkeep of ¢600 is the design's dial: no US operating
  cost for a crematory was found (gas is 12.5–28.5 therms a cremation by one
  maker's metering, staff unpublished).

Before writing "not built" anywhere in this document, check the code.

**Next:** garbage recovery
([garbage-recovery.md](specs/garbage-recovery.md)), the
municipal-services epic the player chose, is complete: the garbage chain on
one real unit, the kerbside recycling depot, the materials recovery facility
and the transfer station. So is healthcare and death care
([healthcare-and-death-care.md](specs/healthcare-and-death-care.md)):
the clinic and hospital ladder, deaths that empty homes, a regional funeral
service until Big Town, the cemetery, the hearse and the crematorium. So is
emergency services
([emergency-services.md](specs/emergency-services.md)): road
reach, crews, real call rates and a two-rung station ladder. So is the
education ladder
([education-ladder.md](specs/education-ladder.md)): elementary,
middle and high schools, a college and a library, each gating level 3 for the
zones that need it and drawn as a campus. So is power generation
([power-generation.md](specs/power-generation.md)): a solar
farm, a gas turbine, a combined-cycle station and a reactor, each a real small
unit sized to the game's cities. So is building detail, at the player's
request (2026-10-14, complete 2026-10-16;
[building-detail.md](specs/building-detail.md)): every
zoned building and ploppable drawn as the US type it is, to the water tower's
standard, from a sourced reference library and inside a measured triangle
budget; eight slices, the budget measured first, then the performance
slice, houses, storefronts, industry and farms, blocks and towers, the
kitless ploppables, and the earliest kits redone. So is transport depots,
at the player's choice (complete 2026-10-16;
[transport-depots.md](specs/transport-depots.md)): a depot
fields a line's vehicles over its own network, a mode with no depot runs
nothing, every vehicle in service is charged its operating cost, buses
pull out at dawn and home at night, and the fleet at home stands on the
apron. **In progress, at the player's request (2026-10-16): tramways**
([tramways.md](specs/tramways.md)) — a street tramway drawn
as a street cars share, a tram reservation lifted onto an elevated guideway
in the Disney World monorail's form with raised stations, and every tram
lane routable; complete 2026-10-23 with the raised stations. **The
programme's last epic, parks and recreation, is complete (2026-10-23;
[parks-and-recreation.md](specs/parks-and-recreation.md))** —
parks at the real sizes of the US park types, planned to a provision
standard, capped like every other service, drawn as five kits that read
apart and worn when full. **The municipal services programme is complete.**
Next, the [DESIGN.md](DESIGN.md) deferred backlog (weather, deeper industry,
more transit modes) and AI raster map packs, facade-atlas stage 2 and
screen-space AO/reflections are the shelf to pick from.

---

## The numbered sections

| Section | Size |
| --- | --- |
| [1. Current state audit (what exists today)](roadmap/1-current-state-audit-what-exists-today.md) | 2,226 B |
| [2. Design pillars (what "feels like a city builder" actually means)](roadmap/2-design-pillars-what-feels-like-a-city-builder-actually-means.md) | 1,031 B |
| [3. Architecture decisions](roadmap/3-architecture-decisions.md) | 395 B |
| [4. Interface](roadmap/4-interface.md) | 281 B |
| [5. AI raster asset pipeline](roadmap/5-ai-raster-asset-pipeline.md) | 1,872 B |
| [6. Module structure](roadmap/6-module-structure.md) | 256 B |
| [7. Milestones (each ends playable)](roadmap/7-milestones-each-ends-playable.md) | 4,049 B |
| [8. Performance budgets](roadmap/8-performance-budgets.md) | 396 B |
| [9. Risks & scope guards](roadmap/9-risks--scope-guards.md) | 769 B |

## 10. History

Delivered work, newest first, one file a month, lives in
[history/README.md](history/README.md); this roadmap keeps only status and what is open.
