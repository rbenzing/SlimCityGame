# SlimCity — Player Guide

How to play SlimCity: lay roads, paint zones, keep the lights and water on, and
watch a city grow itself. You don't place houses — you set the conditions and the
simulation fills them in.

This guide is for playing. If you want to know how the game is built, start at
the [documentation map](README.md) — chiefly the [documentation map](README.md) for what everything is, [ROADMAP.md](ROADMAP.md) for what's built and what's next, and
[adr/](engineering/adr/README.md) for why it works this way.

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
  and water along their length (highways carry power only). Every road's
  options row sits on its own line under the tabs: pick how many lanes the
  road runs — a town street 2 or 4, an arterial 4 or 6, and a motorway 3, 4,
  5 or 6, which are the lanes of its ONE carriageway, all running the way you
  drag it (you build a dual carriageway as two runs side by side, each drawn in
  its own direction, and widen the side that needs it; a five- or six-lane
  motorway is too wide for one tile and takes two, but it is still one road,
  drawn edge to edge across both; so is a six-lane arterial built without a
  median, with its centre line down the middle and one junction where a street
  crosses it) — put a median or a two-way turn lane down the middle, post
  a speed inside the range its class allows, add a parking lane or a bike lane
  to either kerb, reserve a bus lane, run a tramway, or drop the footways.
  **A bus lane and a tramway are options on a road, not roads of their own** —
  there is no "Bus Lane" or "Tram Track" to pick from the list any more. Give a
  neighbourhood street a bus lane on one side, put a tramway down the middle of
  an avenue, or run a motorway's reserved lane up the inside where an express
  lane goes. A reserved lane is a lane, so it counts: a small street takes one
  bus lane and is refused two, and a town street trades general lanes away to
  make room for a twin-track tram reservation. **You pay for the street plus
  the lane**, and the road stays the road it was — a two-lane street with a bus
  lane is still a two-lane street, costing its own price and a little more,
  rather than becoming some other road that happens to have one. A reserved
  lane brings its own unlock too, so trams still wait for the milestone a
  tramway always needed. A neighbourhood street runs two lanes
  and is offered no count at all, since two is what it is; the third lane it
  can have is the turn lane down the middle. Each control offers only what
  that road allows — a count a road is never built in is never on the row —
  and the width readout shows whether the result still fits the 20 m tile,
  saying which rule refused it when it does not: too wide for the tile, or
  more lanes than that kind of road runs. A six- or eight-lane road is too wide
  for one tile, so it is laid as two carriageways side by side, one each way,
  in a straight run. Draw a street across it and the median opens there, so
  traffic crosses straight over; a street meeting it from one side only turns
  in and out with the traffic. Roads are grouped by family:
  Small, Medium, Highway and Transit. A road normally
  refuses to become a smaller one, so a stray drag can never flatten an
  avenue; turn on **Replace** when you mean to rebuild a road as something
  else. A one-way street runs the way you drew it, arrows and all — to turn
  one round, draw it again from the other end. Roads of different sizes join freely, and wherever a
  carriageway changes width the pavement beside it bends with the kerb, so the
  footway runs into its neighbour's instead of stepping; the only
  refusals are a highway or a ramp running straight onto a gravel road or an
  alley, and drawing a road THROUGH one bigger than it — an avenue's median
  leaves nowhere to cross — both of which the preview turns down and tells you
  why. Where roads meet, the bigger one runs through: it keeps its markings
  across the junction and the side street gets the stop bar and the crossing.
  Two equal roads crossing both stop, and a junction nothing controls is an
  open box with no paint on it at all. Underneath that, every junction decides
  who gives way, and it decides the way a traffic engineer would: two quiet
  streets, or anything unpaved, meet on sight lines; a smaller road running
  onto a bigger one gives way and then stops as the bigger one gets busy; two
  equal town streets stop all round; an avenue signalises everything it
  touches. Traffic is never stopped on a motorway — you reach one by **ramp**,
  the one-lane one-way slip road that unlocks alongside it. Draw one from the
  motorway down to a street and its two ends behave quite differently: at the
  motorway there is no stop line and no signal, because that end is a merge —
  nobody holds you, but joining still costs you the time to find a gap, and on
  a busy motorway that is most of your journey. At the street end it is a
  proper junction, signalised like any other place a big road meets a small
  one. Coming the other way is free: leaving a motorway costs nothing, and
  neither does staying on it. Where there is room, the motorway also grows an
  **extra lane** beside the slip road — one to get up to speed in where traffic
  joins, one to slow down in where it leaves — opening out of nothing over
  about eight tiles. A three-lane carriageway and its shoulders are 15.45 m of
  a 20 m tile, so there is room; a wider one spends the tile and gets none.
  A motorway is loud, and its noise drags down the land value of whatever
  lies beside it. Give it a **sound wall**: with the Highway or the Ramp
  selected, the Sound wall panel puts one on the left, the right or both sides
  of the carriageway, 3, 4.5 or 6 m tall. Taller walls cut more noise (5, 7 and
  9.5 dB, the figures US highway agencies build to) and cost more. Drag over
  a motorway with **Replace** on to give it one. The wall opens where a slip
  road leaves, as real walls do, and it takes the room the extra lane beside a
  slip road would use, so a walled motorway grows none. A motorway drawn at
  an angle or as a curve cannot carry one. Turn on the **Noise** lens to see the quiet a wall
  leaves behind it.
  Or lay a whole **interchange** at once: the Interchange card in the Highway
  tab, pointed at a motorway you have already laid, previews a street carried
  over it on a bridge with every slip road it needs, and one click lays it all
  — one undo takes it all away again. Pick the form beside the card: a
  **diamond**, which makes every turn at two junctions on the street; a
  **partial cloverleaf**, whose loops take the left turns onto the motorway
  off those junctions; or a **cloverleaf**, a loop for every left turn, at the
  price of a great deal of land. The preview says why it cannot go where it
  cannot. The decision is not
  cosmetic — crossing a signal costs a driver real seconds, and drivers reroute
  around a slow junction — and it follows the city: a crossroads that needs
  nothing today earns a give-way, then a stop, as the blocks around it fill,
  and loses them again if the traffic goes away. **Click any junction** and a
  panel tells you who gives way there and lets you change it: pick a control
  off the ladder — nothing, give way, stop, all-way stop, signals — and it
  sticks, saved with the city, until you hand the junction back to Automatic.
  The Automatic row always says what the city would choose if you did, so you
  can see what you are overriding. **Roundabout** is on the list too, and it
  is the one that rebuilds the junction: an island with a planted centre, a
  painted apron a lorry can track over, and a line of give-way triangles
  across every entry. It is quick until it fills up, and then it is not.
  That one fits on a single tile. For a proper **compact roundabout**, take
  the Roundabout card from the Small tab of the road drawer and point at a
  junction: it previews a ring 36 m across on the two-by-two block of tiles
  the pointer is nearest, laying the corner the junction is missing, and one
  click lays it. Traffic goes round it one way, anticlockwise, every road into
  it gives way at its edge behind a splitter island, and a left turn is the
  three-quarters of the ring it really is. It takes streets of one lane each
  way, three or four of them, one to a side, on ground no steeper than 4%.
  The roads all come in half a tile off the ring's centre; jog each one a tile
  before the ring, so it comes in to the left of the centre as drivers see it,
  and you have the pinwheel the guides prefer. Click any of its tiles to take
  it out again.
  On a road wide enough to have more than one lane in each direction, the last
  stretch before a junction is painted with **lane arrows** — which lane may
  turn and which runs straight on. A two-lane approach shares the turns; a
  wider one gets a lane for turning left, then one for turning right, which is
  the order a real junction spends its width in. The junction panel lists a
  row per arm with **the turns it allows** — left, straight, right — and
  switching one off is a real ban: the arrow for it stops being painted and
  traffic stops using it, so you can send through traffic round a corner
  instead of past a school. An arm always keeps its last turn; a driver who
  arrives has to be able to leave. A turn with no road to land on is not
  offered in the first place: the arm of a tee has open ground on one side and
  gets no arrow pointing at it, and the stem of one is a left and a right with
  no straight on. Lay the missing leg and the turn comes back on its own.
  Where a junction holds its traffic, an approach that can find the width also
  grows a **turn pocket** for the last few tiles: a lane of its own for the
  drivers waiting to turn left, so they stop holding up everyone going
  straight. It comes out of the verge, then the kerbside parking, then the
  width of the lanes themselves, and a road with none of that to spare simply
  does not get one — which is why a plain street earns a pocket at a signal
  and a four-lane road filling its tile does not. The pocket opens the way one
  is built rather than appearing at full width: the road widens into it over a
  tile or two and then holds that width up to the stop line, so there is
  always somewhere to queue. Nothing to switch on: give the junction a control
  it needs and the pocket appears with it.
  Put two junctions close together and you get something else. A pocket belongs
  to one side of the road, so a short block between two of them would widen on
  one side at one end and the other side at the other, narrowing in the middle.
  Instead the whole block gets a **shared turn lane** down the middle — one lane
  both directions turn from, the same width the whole way, with no taper at
  either end. It appears on its own wherever two junctions are within about
  160 m, and goes away again if you move one of them further off.
  A junction paints itself the way one is painted. **Crossings** go where
  somebody can actually walk: the people using a crossing are travelling the
  other way, so an arm is crossed only where the roads across from it have
  footways — a road built without one sends nobody over the street it meets,
  and gets no zebra. A crossing is the footway carried over the road, so it
  lies at the END of the approach, in the strip of tile between the junction
  and the pavement it continues, rather than out in the middle of the box. The
  **stop line** comes before it, back down the approach, which is the order you
  meet them in and where you actually have to stop; it is as wide as the road
  it is painted across rather than as wide as the junction. Under signals or an all-way
  stop every approach gets one, the main road included; under a give-way only
  the roads that give way do. **Signals and stop signs** stand on your right
  at the stop line, facing you — one per approach, never sharing a spot with
  a lamp post. And the **lane counts** the road tool offers are only the ones
  that fit a tile of 20 m, or a pair of tiles laid as two carriageways, rather
  than options that turn themselves down.
  Where a wide road runs into a narrower one, the extra lanes **close over a
  taper** instead of stopping dead: a four-lane road meeting a two-lane street
  spends six tiles closing its kerbside lanes, and a motorway spends far
  more, because a lane closed at speed needs the room. A shorter stretch, a
  wide stub between a junction and a narrow street, closes over the length it
  has, leaving the junction at its full width. The lane that is
  running out carries a merge arrow bending into the one beside it. A
  **motorway closes its lane differently**: the tarmac stays where it is, so
  there is still somewhere to go if you miss the taper, and the lane is shut by
  moving the line in and hatching the strip it leaves — the diagonal bars you
  see beside a motorway lane drop, sloping away from the traffic they are
  keeping out. The drop
  is a real bottleneck too — traffic heading into it queues for the narrow
  road rather than the wide one it is still on, so a four-lane road that ends
  in a village street backs up on the traffic lens exactly where it should.
  Traffic going the other way is unaffected: a road widening ahead of you
  never held anybody up.
  Roads snap to the
  grid, round their corners and dead-ends, and bank smoothly up slopes (the ground
  is graded under them automatically). A single tile on its own is a road too —
  a short stub, rounded at both ends, lying the way you dragged it (east-west if
  you just clicked), with the same lines and kerbs it would carry anywhere else.
- **Zoning** — residential, commercial, industrial and agriculture. Denser residential
  variants (row / medium / mixed-use / high) unlock as you pass milestones. Zoned
  tiles only develop if they have road access, power, and water.
- **Agriculture** — farmland, painted like any zone, and the other way a small
  town earns its living besides a mill. It goes only on land a **dirt road**
  reaches, up to 8 tiles back from it, and only on soil that can be farmed:
  turn on the **Soil** lens to see it. Very fertile flats grow row crops,
  rolling slopes grow orchards, and poor or stony ground becomes fenced pasture
  with cattle. Beaches, the water's edge, rock and steep slopes grow nothing.
  A farm's gate opens only onto a dirt road, though its fields may run right
  up to a paved one. A dirt road carries no power, so string a **power line**
  along it out to the farms. A farm needs no water: it has its own well. Farm
  work counts as industry on the RCI bars, so the industrial bar asks for farms
  and workshops alike. A farm grows larger as the town wants more work, but
  only onto land as good as its kind needs.
- **Power & Water** — generators and water sources placed next to a road feed the
  connected network. If the city asks for more than it makes, the grid gives out
  from its far end: the buildings furthest along the wires from a plant go dark
  first, abandon if it lasts, and nothing new moves in until there is supply to
  spare. The Advisor says how far short you are.
- **Services** — fire, police, health, education, and parks. Each projects a
  coverage/effect field around it; gaps in coverage show up in the infoview
  lenses and drag down happiness.
- **Transit** — bus lines with stops and cosmetic buses; ridership depends on
  stops being close enough to demand. (Place stops within a few tiles of where
  people are.) Later, **rail**: lay rail track like any road, plop **stations**
  along it — a station must touch the track, or it is just a shed — and draw a
  **Rail Line** between them the same way you draw a bus line. Trains run it.
  People walk further to a train than to a bus stop and a train carries more of
  them, so a rail line serving a busy district takes real traffic off the
  streets around its stations. Your lines are saved with the city now.
  **Trams** sit between the two: give a street a tramway from the road tool's
  options row — it is still a street, so cars keep using it — and draw a
  **Tram Line** along it. A tram needs no station and
  takes no land; its stops get a shelter like a bus stop's. It only runs where
  the track goes, so a break in the track breaks the line even though a car
  could drive around it, and it relieves the very streets it runs down. A
  tramway drawn straight across another street crosses it: the rails run over
  the junction and the tram goes straight on, while the street keeps its own
  lanes — a six-lane road included, whose median opens for it. A tram cannot
  turn onto a street that has no track.
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
  Industrial. Full bars mean that zone type is in demand; paint more of it. A
  town grows like a real one: its first homes come before any work, then it
  needs industry — the mills and factories it lives by — and shops only follow
  once there are wages to spend, about four shop jobs for every five industrial
  ones. People go where the work is, so a town of homes with no industry stops
  growing until it has some.
- **Milestone badge** — the circular XP chip; click it for milestone history.
  Progress unlocks new zones, roads, and services.
- **Infoview lenses** — overlays for land value, pollution, traffic, service
  coverage, trash and soil. Turn a lens on to see the city as data — the trash lens
  reddens where garbage is going uncollected, and the soil lens shades the
  ground from deep green cropland through orchard slopes and amber pasture to
  red land nothing grows on.
- **Stats panel** — line charts of population, money, and other trends over time.
- **Roads sign themselves** — a junction carries the boards its control calls
  for and no others: a signal head on every approach where the junction is
  signalised, a stop board on every arm of a four-way stop, a stop or give-way
  on the arms that give way with nothing facing the road that runs through, and
  nothing at all where the junction is uncontrolled. Two quiet streets crossing
  are unsigned, which is how they are in life. **The signals run.** One
  direction gets the green, ambers, and hands it to the other, on a real
  sixty-second cycle — so at 1× you can sit and watch a junction change, and at
  4× it changes four times as fast. Pause the city and the lights hold where
  they are. Highways are signed as highways:
  cantilevered exit boards where a road leaves, and overhead gantries along the
  run. While you drag a one-way or a highway, translucent arrows show which way
  traffic will run, so you can catch a road laid backwards before you build it.
- **Bridges** — drag a road across a river and it crosses on a deck, on piers,
  ramping down onto each bank. Start the drag well back from the water: the
  approach needs room to climb, and a crossing that would end in mid-air is
  refused rather than half-built. To build one deliberately, use **Raise** and
  **Lower** in the roads panel header — or Page Up / Page Down, which work while
  you are still dragging. Ground is as low as it goes for now; anything above it
  builds as a bridge, and the style follows the road: planking for a track, a
  concrete beam for a street, a deep box girder for a motorway, steel truss for
  rail. Every road type can be raised, from a gravel track to a rail line.
  Height is what costs. Up on a deck a road keeps its lamps and the signs that
  govern right of way — stop boards, signals, and a motorway's overhead gantries
  — but loses the kerbside things that need a verge: no parking meters, utility
  boxes, manholes, grass or trees on a bridge. Nothing zones off a bridge, the
  ground underneath is left alone, and the setting drops back to Ground when you
  put the road tool down so it can't surprise you on the next drag.
- **Advisor** — the warning-triangle button (top right) lists what is actually
  wrong right now, worst first: buildings cut off from a road, power, or water,
  buildings dark because the grid is too small (and by how much), growth waiting
  on power or water, zoned land whose road brings it no power or water (a
  gravel road, say), a budget bleeding out. A red badge counts the
  critical problems while the panel is closed. Click any entry and the camera
  flies to a building, or a patch of zoned land, suffering from it. An empty list means nothing needs you.
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
street lamps and windows light up after dark. Only streets the power grid has
actually reached carry lamps at all, so after dark the lit part of the map is
the powered part — and a district that browns out goes dark with it.

Your city **autosaves** every couple of game-months to the browser (IndexedDB),
and you can save/load manually. There's also a **photo mode** that hides the UI
for a clean screenshot.

## Sound and music

The city has an ambient soundscape — traffic that swells at rush hour and falls
away by 3am, a steady wind floor under it, and wildlife calling at odd intervals
out toward the quiet edges: birds through the day, loudest around dawn, crickets
after dark. Plus short cues when you select a tool, build something, or a build
is refused. Master volume and mute live in **Options → Audio**. Browsers only
allow sound after you interact with the page, so audio starts at your first
click.

**Your own music:** the game ships none. Drop `.mp3` or `.wav` files into the
`public/songs/` folder and press **Rescan** in Options → Audio → Music; they
appear as a playlist with play/pause, skip, seek, shuffle, repeat, and a music
volume separate from the rest. Adding files never needs a restart, and
rescanning won't interrupt whatever is playing. You can also **drag files onto
the game window** to play them for the current session only. Your music is
never copied or uploaded anywhere, and the audio formats are git-ignored so
nothing you add gets committed.

## Tips

- If a zone won't develop, check the three requirements in order: **road access,
  power, water**. The most common mistake is a utility placed a tile or two away
  from any road — move it flush against one.
- **Gravel roads carry no electricity** — there is no cable in a dirt track.
  Anything down a gravel lane stays dark until you run a power line to it, and
  power won't travel _through_ a gravel stretch to the paved road beyond. Water
  still runs down one; a pipe and a cable are not the same thing.
- **Power lines** (Electricity) reach what a road cannot: drag a run from your
  generators out to the lot, the district or the pump that a street doesn't
  connect. A line is cheaper per tile than the cheapest road, but it charges a
  small upkeep every month for as long as it stands — so a sprawling rural grid
  is a standing bill, not a one-off. Dragging back over a run you've already
  strung costs nothing, and the bulldozer takes the wire down with a refund.
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
