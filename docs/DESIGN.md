# SlimCity — Scope guards

What we are deliberately **not** building, and why. Two lists: things deferred
to a later year, and things rejected outright. Treat the rejected list as
settled — decisions already made, not open questions to relitigate.

Nothing on these lists is a description of the product. When something here
ships it leaves this file entirely: its behaviour goes to [SPEC.md](SPEC.md) and
its delivery to [ROADMAP.md](ROADMAP.md). A shipped feature lingering in a
deferred list is how a scope guard turns into misinformation.

The reasoning behind the load-bearing calls lives in [adr/](adr/README.md); this
file is the index to what they foreclose, not a second copy of the argument.

## Core stance

- **Population is a number, not a fleet of agents.** Statistical assignment plus
  cosmetic vehicles, never per-citizen or per-car physical simulation. This is
  the single decision that keeps the sim inside a browser budget —
  [ADR-0001](adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md).
- **Genre grammar, original everything else.** Layout and mechanic conventions
  follow the genre; names, assets and branding stay original —
  [ADR-0014](adr/0014-genre-grammar-is-deliberate-originality-is-elsewhere.md).
- **Browser-honest budgets.** The targets are chosen to be met on a laptop, not
  to be impressive; field diffusion and instance counts scale quadratically, so
  map size is capped deliberately —
  [ADR-0010](adr/0010-map-size-is-capped.md). The figures themselves are in
  [ROADMAP.md](ROADMAP.md).
- **The 3D world stays imperative three.js.** No React in the render path — the
  engine showcase must not pay per-frame reconciliation —
  [ADR-0004](adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md).

## Deferred — good ideas, wrong year

- **Metro and ferry**, and a richer transit route editor with per-line stats.
- **Freight rail**, which belongs with the deeper-industry epic below.
- **Signal phase simulation** — a signal that actually cycles and holds traffic.
  Signal heads, stop and give-way boards, and motorway gantries are built; what
  is deferred is the phasing behind them.
- **Weather, seasons, flooding, climate variation.**
- **Supply chains, imports and exports; deeper industry.**
- **Tunnels**, and a **third deck level** — so interchange stacks and turbines
  are out. One tile carries one road tier at one deck height.
- **Free-form road geometry** — curves off the tile grid
  ([ADR-0005](adr/0005-roads-are-grid-aligned-no-freeform-curves.md)) — along
  with signal-phase design, reversible and contraflow lanes, and per-lane speed
  limits.
- **Terrain painting**, and a procedural map generator complementing the curated
  maps.
- **Dynamic water flow simulation.** Heightfield flow is a performance tar pit,
  and the derived sea-level model already covers seas, lakes and dug canals.
- **Sewage, recycling, internet and heating as distinct networks.** Garbage is
  built, but as a service-radius collection system with landfills and an
  incinerator — not as a utility network.
- **Citizen cohorts** — age, education and wealth demographics colouring the
  demand model. Still not agents.
- **Modding and a plugin API** — TypeScript plugins, custom JSON assets.
- **Multiplayer and any backend.** Nothing server-side before there is a game.

## Rejected — with rationale

- **100k scheduled citizens and 50k physically-simulated vehicles** with
  collision avoidance, parking and fuel: the browser-killing tar pit. Replaced
  by statistical assignment plus cosmetic agents; the genre itself fakes beyond
  its agent cap —
  [ADR-0001](adr/0001-traffic-is-statistical-assignment-with-cosmetic-agents.md).
- **500 km² or infinite maps**: field diffusion and instance counts scale
  quadratically —
  [ADR-0010](adr/0010-map-size-is-capped.md).
- **UI last, traffic before buildings exist**: dependency-inverted and
  unplayable for months. Replaced by playable-every-milestone ordering.
- **React Three Fiber for the world**: per-frame reconciliation contradicts the
  engine-showcase goal —
  [ADR-0004](adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md).
- **"Original UI, no genre conventions"**: the project's identity _is_ the
  genre's grammar. Originality applies to names, assets and branding, not to
  genre vocabulary —
  [ADR-0014](adr/0014-genre-grammar-is-deliberate-originality-is-elsewhere.md).
- **Occlusion culling and screen-space reflections**: low value from an RTS
  camera; frustum culling and LOD suffice. Revisit only if profiling demands it.
- **Terrain clipmaps and streaming**: pointless at these map sizes; chunking
  covers it.
- **A full ECS framework and DI containers**: the typed-array layers already
  give the data-oriented wins without the ceremony —
  [ADR-0003](adr/0003-world-state-is-layered-flat-typed-arrays.md).
- **A resizable, dockable window manager with search and filters**: a fixed
  city-builder shell instead.
- **16× game speed**: a sim-stability and balance risk; 4×, with 8× as a
  stretch, covers the need.
- **100 fps / 30 TPS / 100k buildings**: replaced by budgets that can actually
  be met — see [ROADMAP.md](ROADMAP.md).
