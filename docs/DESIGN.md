# SlimCity — Design decisions & scope guards

Design intent that is **not inferable from the code**: the deferred backlog and
the deliberately-rejected directions, with the reasoning behind each. Treat the
rejected list as scope guards — decisions already made, not open questions to
relitigate. For what currently ships, see [ROADMAP.md](ROADMAP.md); for the
visual/systems spec, see [SPEC.md](SPEC.md).

## Core stance

- **Population is a number, not a fleet of agents.** Statistical assignment +
  cosmetic vehicles, never per-citizen or per-car physical simulation. This is
  the single decision that keeps the sim inside a browser budget.
- **Genre grammar, original everything else.** Layout and mechanic conventions
  follow the genre; names, assets, and branding stay original.
- **Browser-honest budgets.** 60 fps / 20 TPS / 10k+ buildings on a 256²
  (≈4×4 km) map, 512² at most later. Field diffusion and instance counts scale
  quadratically, so map size is capped deliberately.
- **The 3D world stays imperative three.js.** No React in the render path — the
  engine showcase must not pay per-frame reconciliation.

## Deferred to v2+ (good ideas, wrong year)

- Metro and ferry; richer route editor + stats. (Bus lines, districts &
  policies, one-way roads, cosmetic service dispatch have since shipped — see
  ROADMAP. Passenger **rail** shipped as SPEC §26 and **trams** as SPEC §27, each
  over a tier the roads epic had already laid; freight rail stays deferred with
  the deeper-industry epic it belongs to.)
- Signal _phase_ simulation. (The signals and boards themselves have since
  shipped, cosmetic-first as intended — a junction approach earns a signal head
  on the multi-lane tiers and a stop or give-way board on the smaller ones, and
  a motorway is signed with exit boards and gantries instead; see SPEC §6.7.
  What stays deferred is a signal that actually cycles and holds traffic.)
- Weather, seasons, flooding; climate variation.
- Supply chains, imports/exports; deeper industry.
- Tunnels. (Bridges + elevated roads have since shipped — a deck-height layer
  over the existing 1-tile road model, per SPEC §25. Roundabouts are no longer
  deferred: SPEC §29 makes them a junction CONTROL rather than a road, on one
  tile or a 2×2 block. Road-over-road crossings arrive with §29's ramps as
  bridges over the highway; what stays deferred is a third deck level, so
  stacks and turbines are out.)
- Free-form road geometry (curves off the tile grid), signal-phase design,
  reversible and contraflow lanes, per-lane speed limits. (SPEC §29 gives the
  player lanes, junction control, ramps and interchange stamps ON the tile
  grid; the grid is the decision that keeps that tractable, and a two-tile
  corridor is as wide as it goes.)
- Terrain painting; a procedural map generator complementing curated maps.
  (Dynamic water _flow_ simulation stays deferred — a perf tar pit; the derived
  sea-level model already covers seas/lakes/canals.)
- Sewage / recycling / internet / heating as distinct networks. (Garbage has
  since shipped — but as a service-radius collection system, landfills + an
  incinerator + cosmetic trucks, not a utility network; see ROADMAP / SPEC §21.)
- Citizen _cohorts_ (age/education/wealth demographics coloring the demand
  model — still not agents).
- Modding / plugin API (TS plugins, custom JSON assets).
- Multiplayer and any backend — nothing server-side before there's a game.

## Rejected — with rationale

- **100k scheduled citizens / 50k physically-simulated vehicles** (collision
  avoidance, parking, fuel): the browser-killing tar pit. Replaced by
  statistical assignment + cosmetic agents. The genre itself fakes beyond its agent cap.
- **500 km² / infinite maps**: field diffusion and instance counts scale
  quadratically; 256² now, 512² at most later.
- **UI last, traffic before buildings exist**: dependency-inverted and
  unplayable for months. Replaced by playable-every-milestone ordering.
- **React Three Fiber for the world**: per-frame reconciliation contradicts the
  engine-showcase goal.
- **"Original UI / no genre conventions"**: the project's identity _is_ the genre's
  grammar. Originality applies to names/assets/branding, not to genre vocabulary.
- **Occlusion culling + screen-space reflections**: low value from an RTS
  camera; frustum culling + LOD suffice. Revisit only if profiling demands.
- **Terrain clipmaps / streaming**: pointless at these map sizes; chunking covers it.
- **Full ECS framework + DI containers**: SoA typed-array layers already give the
  data-oriented wins without the ceremony.
- **Resizable/dockable window manager, search/filters**: fixed city-builder shell instead.
- **16× speed**: sim-stability and balance risk; 4× (8× stretch) covers the need.
- **100 FPS / 30 TPS / 100k buildings**: replaced by browser-honest budgets
  (60 fps / 20 TPS / 10k+ buildings).
