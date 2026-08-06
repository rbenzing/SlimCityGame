# SlimCity — Player Guide

How to play SlimCity: lay roads, paint zones, keep the lights and water on, and
watch a city grow itself. You don't place houses — you set the conditions and the
simulation fills them in.

Companion docs: [SPEC.md](SPEC.md) (what everything is), [ROADMAP.md](ROADMAP.md)
(what's built and what's next), [DESIGN.md](DESIGN.md) (why it works this way).

## The core loop

1. **Roads are the skeleton.** Everything needs road access. Lay roads first;
   the buildable grid appears alongside them.
2. **Paint zones, don't build houses.** Mark land residential, commercial, or
   industrial. Demand (the RCI bars) decides whether and how fast it fills in.
3. **Power and water flow through roads.** Connect a generator and a water source
   to the road network and the whole connected network is served.
4. **Watch it grow, then read it.** Buildings construct, upgrade, and occasionally
   abandon on their own. Use the infoview lenses and stats to see why.
5. **Hit milestones.** Growth earns milestone progress, which unlocks denser
   zones, bigger roads, and more services.

## First five minutes

1. Draw a **two-lane road** out into the map (Roads category, or press `1`).
2. Place a **power source** (a wind turbine to start) and a **water source**
   (a water tower) — **each must sit on a tile directly next to a road**, or the
   road network won't carry its power/water and nothing will grow.
3. **Paint a residential zone** (Zoning, or `2`) in a band along the road, then a
   little **commercial** and **industry** so residents have shops and jobs.
4. Unpause (`Space`) and let it run. Keep an eye on the RCI demand bars and your
   money.

## Tools

- **Roads** — a hierarchy from gravel up through two-lane, avenue, one-way,
  four-lane, and highway. Wider roads carry more traffic; most roads carry power
  and water along their length (highways carry power only). Roads snap to the
  grid, round their corners and dead-ends, and bank smoothly up slopes (the ground
  is graded under them automatically).
- **Zoning** — residential, commercial, and industrial. Denser residential
  variants (row / medium / mixed-use / high) unlock as you pass milestones. Zoned
  tiles only develop if they have road access, power, and water.
- **Power & Water** — generators and water sources placed next to a road feed the
  connected network. If a district browns out or runs dry, growth stalls and
  buildings can abandon.
- **Services** — fire, police, health, education, and parks. Each projects a
  coverage/effect field around it; gaps in coverage show up in the infoview
  lenses and drag down happiness.
- **Transit** — bus lines with stops and cosmetic buses; ridership depends on
  stops being close enough to demand. (Place stops within a few tiles of where
  people are.)
- **Districts & Policies** — paint districts over areas, then set policies
  (e.g. tax and traffic rules) that apply within them.
- **Landscaping** — raise / lower / level / smooth the terrain, with real water
  that floods below sea level. Roads and buildings auto-flatten the ground they
  sit on.
- **Garbage** — every zone generates trash. Paint a **landfill** area (in the
  Garbage tools) where trash piles up to a maximum height; total capacity grows
  with the painted area. Or, at a later milestone, plop an **incinerator** — it
  collects trash within a road radius into a large buffer and **burns** it down
  over time (a permanent fix while it keeps ahead of the city), at the cost of
  some air pollution, and ships with its own garbage-truck fleet. When a landfill
  fills up or an incinerator's buffer maxes out, collection in its area stops
  until you expand the landfill or add another facility. Cosmetic garbage trucks
  drive out from each facility to the blocks they service.
- **Bulldoze** — remove roads, buildings, and zoning. Player edits are undoable.

## Reading your city

- **RCI demand bars** (bottom-left) — green Residential, blue Commercial, orange
  Industrial. Full bars mean that zone type is in demand; paint more of it.
- **Milestone badge** — the circular XP chip; click it for milestone history.
  Progress unlocks new zones, roads, and services.
- **Infoview lenses** — overlays for land value, pollution, traffic, service
  coverage, and trash. Turn a lens on to see the city as data — the trash lens
  reddens where garbage is going uncollected.
- **Stats panel** — line charts of population, money, and other trends over time.
- **Money & happiness** — the status strip shows funds and monthly balance
  (upkeep vs. income) and a city happiness face. Watch for a red monthly balance.

## Camera & controls

| Input                      | Action                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| Left drag                  | Active tool (draw road / paint zone / bulldoze)                    |
| Left click                 | Select a building (opens its info panel)                           |
| Middle / right drag, wheel | Rotate / zoom-to-cursor; `WASD` + edge-scroll to pan               |
| `Space`                    | Pause / resume                                                     |
| `1`–`7`                    | Jump to a tool category (roads / zoning / power / … / landscaping) |
| `R`                        | Rotate the ploppable you're placing                                |
| `Esc`                      | Cancel the current tool / deselect                                 |
| `Ctrl+Z` / `Ctrl+Y`        | Undo / redo (refunds are exact)                                    |
| `Ctrl+S` / `Ctrl+Shift+L`  | Save / load latest                                                 |

Speed controls (status strip): pause and stepped speeds up to 4×. `1×` is a calm,
real-time-ish pace; higher steps fast-forward. Day and night cycle continuously —
street lamps and windows light up after dark.

Your city **autosaves** every couple of game-months to the browser (IndexedDB),
and you can save/load manually. There's also a **photo mode** that hides the UI
for a clean screenshot.

## Tips

- If a zone won't develop, check the three requirements in order: **road access,
  power, water**. The most common mistake is a utility placed a tile or two away
  from any road — move it flush against one.
- Keep commercial and industrial in proportion to residential; if a demand bar is
  empty, stop zoning that type.
- Services and parks raise happiness and land value in a radius — spread them out
  rather than clustering.
- Use the infoview lenses before expanding: fix pollution, traffic, and coverage
  gaps in what you have before painting more.
- Watch **garbage** the way you watch power and water: a landfill that fills up
  or an overwhelmed incinerator silently stops collecting its area. Check the
  trash lens, then expand the landfill or add a facility across town.
- **Sandbox / testing options** (Options menu): _"Sandbox: unlock all build
  items"_ ignores milestone locks, and _"Unlimited money"_ ignores funds and
  costs — the money readout shows ∞, though cash flow is still tracked, so you
  can build anything even in the red. Handy for experimenting with a layout.
