# Game Design Document

## Vision

SlimCity is a small-form-factor city builder for the browser: a familiar
city-builder play grammar and UI layout at reduced scale, built on Three.js
as a deliberate engine showcase — proof that a web engine can deliver a
living, data-rich city simulation. It targets a laptop in a browser tab, not
a gaming rig: every budget in the project is chosen to be met, not to be
impressive.

## Two identities, one build

SlimCity is built to be two things at once, and every system is expected to
serve both:

- **The game.** Paint zones, grow a city, read it through infoview lenses —
  the genre's feel, browser-sized. The player never places a house; they set
  the conditions — roads, zoning, power and water — and the simulation fills
  them in.
- **The demo.** Instancing at scale, day/night, GPU-friendly simulation
  fields, a buttery RTS camera — Three.js flexing. Every system doubles as a
  Three.js demonstration: thousands of instanced buildings, animated vehicle
  fleets, heatmap overlays, a full day/night cycle, smooth in a browser tab.
  If a feature cannot run pretty at 60 fps, it is designed down until it can.

## Design pillars

1. **You paint zones, you don't place houses.** RCI demand drives growth;
   the city surprises you.
2. **Roads are the skeleton.** Everything needs road access; the network is
   the circulatory system and traffic is its visible pulse.
3. **The city is legible through data lenses.** Land value, pollution,
   traffic, coverage — heatmap overlays turn the sim into information.
4. **The city looks alive.** Vehicles moving, buildings
   constructing/upgrading/abandoning, day/night, ambient sound.
5. **City-builder UI grammar.** Bottom toolbar with category tabs and an
   asset-card panel, top-left city info with a milestone XP bar, top-right
   time/weather controls, infoview lenses, demand bars docked at the zoning
   tools.
6. **Engine showcase.** Every system doubles as a Three.js demo — instanced
   buildings, animated vehicle fleets, heatmap overlays, day/night — smooth
   in a browser tab.

Genre grammar is deliberate; everything else about the presentation —
names, assets, branding — stays original. The layout and mechanic
conventions of the genre are the point, not something to reinvent.

## What the player does: the shape of a session

A session starts from an empty map and a single question — where does the
first road go. From there the loop repeats at whatever pace the player
sets it: lay a road, paint a zone along it, connect power and water to the
network, unpause, and watch. Buildings construct, level up, and occasionally
abandon on their own; demand (the RCI bars) decides whether and how fast a
zone fills in, not the player's placement of individual buildings.

Growth earns milestone progress, measured in population, and each milestone
unlocks denser zones, bigger roads, and more services — the game paces
itself by what the city has actually grown into rather than by playtime.
Alongside growth the player reads the city back: infoview lenses for land
value, pollution, traffic and coverage; a stats panel of population, money
and trends; and an Advisor that surfaces the worst problems first so a
session never turns into a hunt through the whole map for what's wrong.
Districts and policies let a player shape a sub-area's tax rate, traffic
routing, or pollution without touching the rules everywhere else.

There is no scripted end to a session — no win state, no final score. A
session ends when the player is done watching the city they built, saved
automatically every couple of game-months and resumable exactly where it
left off.

## What the game deliberately is not

- **Not a citizen simulator.** Population is a number, not a fleet of
  agents — statistical assignment plus cosmetic vehicles, never per-citizen
  or per-car physical simulation. This is the decision that keeps the whole
  simulation inside a browser budget.
- **Not an original-mechanics genre exercise.** Layout and mechanic
  conventions follow the city-builder genre on purpose; originality belongs
  to names, assets and branding, not to genre vocabulary.
- **Not built to impress on a gaming rig.** Every performance budget is
  chosen to be met on a laptop, and map size is capped deliberately rather
  than left to grow until it stops running well.
- **Not a React 3D world.** The 3D world stays imperative Three.js; no
  per-frame reconciliation framework sits in the render path, because the
  engine showcase cannot afford to pay for one.

The full list of what is deferred to a later year and what has been
rejected outright, with its reasoning, lives in [../DESIGN.md](../DESIGN.md).
What is actually built and what is next lives in [../ROADMAP.md](../ROADMAP.md).
