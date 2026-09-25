# Layout

SlimCity's UI grammar is bottom-heavy, the genre's familiar shape: the top
corners carry only small circular utility buttons, and everything
load-bearing lives in two stacked bars at the bottom of the screen.

```
┌─(ⓘ)───────────────────────────────(⚠)(◐)(📷)(?)(☰)─┐
│                                                       │
│                    3D VIEWPORT                       │
│  ┌ Building info ┐              ┌ Advisor (right, ┐  │
│  │ panel (left)  │              │ when opened)     │  │
│  └───────────────┘              └──────────────────┘  │
│           [tool options]  [asset drawer]              │
├───────────────────────────────────────────────────────┤
│ ◲ RCI▬▬▬ 🏆 MILESTONE │ ▩▦▤🛣⚡💧🚒👮🎓🌳💥 │ ◐ ⊘   │  ← main dock
├───────────────────────────────────────────────────────┤
│ ▶ ▶▶▶▶ │ 08:56 Sept 2025 │ ☀ Fall │ Riverton │ 👥 ¢ 🙂 │  ← status strip
└───────────────────────────────────────────────────────┘
```

This page walks the screen top to bottom, then left to right within each
region, so you can find whatever you're looking at by where it sits.

## Top corners

Two small button clusters, each button a filled circle roughly 32px across,
active state picked out in the accent color:

- **Left**: a single City info button, opening a popover with the city's
  vitals.
- **Right**, left to right: **Advisor** (a red badge counts current
  critical issues, so a closed panel still signals that something needs
  attention), **City stats** (opens the stats charts panel), **Photo
  mode**, **Help**, and — only once a game is running — **Menu**, which
  opens the pause overlay. There is no separate gear/settings button:
  Options lives inside that same Menu overlay, and Rule Zero (see
  [`interaction.md`](interaction.md)) forbids a settings icon with nothing behind
  it.

## City info and Help popovers

Both open from a top-corner button and share the same read-only popover
frame — a small floating card with a caps-label title (see
[`ui-style-guide.md`](../art/ui-style-guide.md) for the `PANEL_ROUNDED` chrome) — and neither
carries a close button of its own. Neither closes on an outside click
either: each is dismissed only by pressing its own corner button again.

- **City info** (left button): a fuller read of the city's live stats —
  `Jobs` (employed/total), `Power` and `Water` (supply/demand, in MW and
  kL), and `Loan` (the outstanding balance).
- **Help** (right cluster): only the keyboard shortcuts actually wired to
  a listener, no aspirational bindings — Play/Pause, Undo, Redo, Save,
  Load latest save, Rotate ploppable, the 1–7 toolbar-category jump keys,
  and the Escape stack (see [`interaction.md`](interaction.md) for what Escape
  does at each stage).

## Building info panel

Floating over the viewport at the left, roughly a third of the way down,
whenever a building is selected:

- **Header**: an icon for the building's kind, its catalog name plus
  `#{id}` (there are no street addresses yet, so the id is the
  disambiguator), and a close button.
- **Status line**: a happiness-face glyph next to a state word —
  Constructing, Content, or Abandoned.
- **Rows**, label left in the uppercase label style, value right:
  - `ZONE` — the zone's display name ("Low Density Residential").
  - `LEVEL` — three rounded pips, filled up to the building's level (see
    [`ui-style-guide.md`](../art/ui-style-guide.md) for the pip token).
  - Residential buildings show `HOUSEHOLDS occupied/capacity` (capacity is
    residents ÷ 4, rounded up) and `RESIDENTS n`; commercial and industrial
    show `JOBS n`; a service building shows `COVERAGE kind + range`; a
    utility shows its `OUTPUT` in MW or kL.
  - `LOAD n%` on a service building that has one: the people living in
    that facility's own reach against the places it offers them, which is
    the per-building half of what the [Services panel](#services-panel)
    shows per kind. A facility with no capacity figure, or one nothing can
    reach, has no load and the row simply doesn't render. `0%` is a real
    reading and means nobody in reach depends on it.
  - `UPKEEP ¢n/mo` always; a grown (zoned) building also shows `TAX ¢n/mo`
    — occupants × tax rate × the land-value factor, the same formula the
    economy itself uses, so the number on the panel is never a
    simplification of the real one.
- **Problems**: active problem flags render as orange chips with an icon —
  No Power, No Water, No Road, High Crime, High Pollution, Low Demand.

The panel does not show household name lists, wealth tiers, rent, or
per-building color customization — see
[Not built yet](#not-built-yet).

## Junction panel

Floating over the viewport at the left, in the exact same slot as the
building info panel above (roughly a third of the way down) — the two are
mutually exclusive by construction, since a building under the click
always wins over the junction beneath it. It opens with the `select` tool
active, on a click that lands on a real junction (three or more roads
meeting; a plain stretch of road is not one) with no building there.
Escape does not close it — unlike the building info panel, nothing in the
Escape stack (see [`interaction.md`](interaction.md)) touches it. It closes via
its own close button, or automatically once the click resolves to
something else (a building, empty ground, a plain road tile) or the
junction itself is gone (bulldozed away).

- **Header**: the roads icon, `Junction · {x}, {z}`, and a close button.
- **Gives way**: names the control the junction currently resolves to.
  See [road-model.md](../world-sim/road-model.md) for how a junction is warranted and what each
  control costs a driver.
- **Control**: an `Automatic` chip, always first and labeled with what the
  warrant currently makes of the junction (e.g. "Signals as it stands") —
  it keeps saying this even while the player has overridden it, since that
  is what handing the junction back would mean. Beside it, the explicit
  ladder — Uncontrolled, Give way, Stop, All-way stop, Signals — least
  restrictive first, then Roundabout off the end of the ladder, since it
  changes the junction's shape rather than only who waits at it and is
  therefore never a default. A line beneath the chips explains whichever
  one is active, in a driver's terms. Picking Automatic hands the junction
  back to the warrant; picking any explicit control is a decision the
  warrant will not later argue with.
- **Turns allowed**: one row per arm the junction actually has (no row for
  a cardinal with no road on it), each a Left/Through/Right toggle — a
  U-turn is a separate matter and is not offered here. Every turn is on by
  default. A toggle disables itself once it is the only movement its arm
  has left, since an arm has to be leavable by whoever arrives on it.
- **Lanes**: shown only where at least one arm actually has more than one
  lane serving it — a single-lane arm already does everything the arm
  allows, so it earns no row. Where it appears, one row per lane
  (`Left lane`, `Lane 2`, …, `Right lane`), each with its own
  Left/Through/Right toggles.
  - What a lane shows starts from what its real lane count derives by
    default (a dedicated left from three lanes on, a dedicated right from
    four on — see [SPEC.md](../README.md)) and then takes on whatever the
    player has explicitly set for that lane.
  - A lane can only ever narrow what its arm currently allows: the arm's
    own restriction always wins, so a lane can never offer a turn its arm
    has just banned.
  - A toggle disables itself for either of two reasons: it is the last
    movement that lane has, or the whole arm has already banned it — in
    the second case it stays unavailable regardless of what the lane
    itself would otherwise offer.
  - A lane change is sent for that one lane only; it never touches its
    neighbors or the arm's own restriction.

## District panel

Floating at the left, just below the corner-button row — the same slot
the transit lines panel below also uses. It opens while the district
paint tool is in hand (picked from the Districts drawer, not merely by
opening that drawer) or while the Districts infoview lens is on, and
carries no close button of its own: it disappears again once neither
condition holds.

- **Header**: the districts icon and the "Districts" label.
- **Paint district**: a chip per district that already exists, each a
  color swatch in the district's own paint color plus its name; clicking
  one makes it the paint target. A trailing `+ New` chip always offers
  the next free id — once picked, the chip itself shows that pending id
  (e.g. `+ New (3)`) and takes the accent fill, since nothing has actually
  been painted with it yet. On a fresh city, with nothing painted at all,
  id 1 is already the pending selection.
- **Policies**: labeled with whichever district id is currently the paint
  target. Four independent toggles — Low Tax, High Tax, No Heavy Traffic,
  Green Energy — each a pill switch; toggling one sends the change and
  flips the local reading at once, ahead of the worker's own confirmation.
  None are enabled for a district nobody has touched yet. See
  [SPEC.md](../README.md) for what each policy actually changes.

## Transit lines panel

Floating in the same left slot as the district panel above. It opens
while a transit line-drawing tool is in hand — Bus Line, Rail Line, or
Tram Line, not a stop or station ploppable — or while the Transit
infoview lens is on. Like the district panel, it has no close button of
its own.

- **Header**: the transit icon and the "Transit Lines" label.
- While a line tool is in hand, a hint row reads "Click stops in order ·
  right-click to finish", naming the drawing gesture itself.
- Below that, every committed line the worker knows about: a swatch in
  the line's own color, its mode (`Bus`, `Rail`, or `Tram` — a line with
  no recorded mode reads as `Bus`) and id, its live ridership rounded to
  the nearest rider, and a delete button that removes it at once, with no
  confirmation step.
- With no lines committed yet, the list reads "No lines yet" instead,
  regardless of whether a line tool is currently in hand.

## Services panel

Floating in the same left slot as the district and transit panels above,
and opening on the same terms: while a service building is in hand — a
police station, fire station, clinic, school or park, picked from any of
those dock drawers — or while one of the service lenses (Crime, Fire Risk,
Health, Education) is on. Like them it carries no close button.

- **Header**: the city glyph and the "Services" label, then a caption row
  naming the four columns — Service, Funding, Load, Worst.
- **One row per service** — Police, Fire, Health, Education, Parks — each
  carrying all four together, because the slider and the gauge are the two
  answers to one question and splitting them across screens is what kept
  funding invisible:
  - a **funding slider**, 0 to 1.5 in steps of 0.05, with its value beside
    it as `×1.00`. Moving it sends the change and flips the local reading
    at once, ahead of the worker's confirmation, exactly as the district
    policy toggles do. Funding buys range, capacity and upkeep together —
    the upkeep charge the economy already makes.
  - a **load gauge** as a percentage of the capacity in reach: `138%` means
    the city's facilities of that kind are asked for 38% more than they can
    give. Under 100% takes the positive color and is not styled as a
    problem; over 100% takes the danger color.
  - the **worst district** figure beside it, the highest load over any tile
    that holds residents. A city can sit at 95% overall with one district
    at 240% because its facilities are the wrong side of a river, which is
    the whole reason the gauge is two numbers.
- Either figure reads `—` only where there is **nothing to read**: an
  uncapped kind (Parks, always), a kind with no capped facility built yet,
  and every row before the first service pass has run or on a mirror fed by
  a snapshot that never carried the field. The row is still there, because
  the funding slider is.
- A capped facility that reaches nobody reads **`0%`, not `—`**. The two are
  different answers and the panel must not blur them: `—` says the city has
  no facility of that kind whose load can be measured, and `0%` says it has
  one and nobody depends on it. A clinic stranded up a lane with no houses
  in reach is a mistake the player can fix; no clinic at all is a different
  mistake. Reading both as `—` hides the first behind the second.

## Advisor panel

Floating at the right, near the top, opened from its corner button. It is
the panel that answers "what is actually wrong with the city right now" —
distinct from toasts, which report one-off events. Each row is a severity
dot (critical / warning / info), a title, and a one-line detail; rows with
a known location are clickable and fly the camera to the offending
building. An empty city shows a plain "nothing needs your attention"
rather than manufacturing a problem to look busy — an advisor that invents
work trains players to stop reading it. The ranking itself (severity, then
how many buildings are affected, tie-broken on a stable id so the list
never reshuffles under the player's cursor) is a pure function of the
building list and the city stats, so it updates without touching the
simulation.

## Asset drawer and tool options

These float just above the main dock, appearing only while a build
category or tool is active.

**Asset drawer** — opens when a dock category is active:

- A dark translucent panel with rounded top corners and a close button.
- A **sub-tab row** at the top for categories with more than one real
  group (Roads: small roads / large roads / maintenance; Zoning:
  residential / commercial / industrial / de-zone). A category with only
  one group renders no tab row at all.
- A **card grid** below: thumbnail cards roughly 96×72, each a flat-shaded
  pictogram of the item — a road's cross-section as tier-width stripes, a
  zone as a colored cell block, a building as a simple tinted silhouette —
  the item's name beneath, and a cost chip at the bottom right (zones
  carry no cost chip, since zoning itself is free). A selected card gets
  the accent border-and-fill treatment; a card gated by milestone renders
  at 40% opacity with a lock icon and a tooltip naming the milestone that
  unlocks it (see [`interaction.md`](interaction.md) for the disabled-vs-gated
  distinction).
- A selected card is always on the sub-tab in view. The drawer opens on the
  sub-tab holding the selected tool, and opening a sub-tab that does not hold
  it puts the tool down (back to select), so no card is left selected out of
  sight with its options still on screen.
- The roads drawer shows its tool options beside the cards, and only while a
  road is selected, as panels in the same card treatment rather than a
  separate floating panel:
  - **Drawing** — path mode (`Straight`, `L-path`, `Grid` — not offered
    for a motorway — or `Curve`), two snap
    toggles (a 90° lock and `Guide`, which pulls a drag into line with a
    road it nearly continues), elevation (`Raise`/`Lower`, reading `Ground`
    or a meter height, up to the bridge deck limit), and whether a drag
    replaces whatever road is already there.
  - **Carriageway** — lane count, median or turn lane, posted speed, and
    the width the section adds up to against the tile (or the two-tile
    corridor).
  - **Kerbside** — parking and bike lane sides, and the footway toggle.
  - **Transit** — bus lane sides and the tramway.

  A panel or row appears only where the selected road's class admits what it
  sets. Of what is offered, a choice that would compose a road the tool
  refuses — more lanes than the class runs, or wider than the tile or
  corridor — is disabled, with the reason as its tooltip, and opens again as
  soon as another choice makes room for it. The choice already made is never
  disabled.

**Tool options panel** — a small floating panel to the left of the drawer,
rendered only for terraform tools (brush radius, strength, and — for the
Level tool — the sampled target height). Road options used to live here
too; they moved into the roads drawer's own header above, and a second
floating panel beside it would have been chrome for its own sake. Zone
tools have exactly one real mode (`Rect`) and Bulldoze is `Rect`-only, so
neither renders an options panel at all.

## Main dock (bottom bar #1)

Left to right:

- **Left cluster**: a small city glyph; three horizontal RCI demand bars
  stacked vertically (green residential, blue commercial, orange
  industrial), each filled from its demand value; a milestone badge — a
  circular progress ring around a trophy icon, with the milestone's name
  in caps beside it. Clicking the badge opens the milestone history
  popover.
- **Center**: one row of category icon buttons — Zoning, Roads,
  Electricity, Water, Garbage, Health, Fire, Police, Education, Parks,
  Transit, Districts, Bulldoze, Landscaping. The active category gets a
  filled accent circle, the genre's standard active-tool treatment;
  clicking a category toggles its asset drawer. Several of them also gate
  a companion panel of their own — the [district panel](#district-panel),
  the [transit lines panel](#transit-lines-panel), and, from any of the
  five service categories, the [Services panel](#services-panel) — once
  the category's own tool is actually in hand, not merely while its drawer
  is open.
- **Right cluster**: an Infoviews toggle (opens the lens grid of overlay
  choices) and an overlay-off button that clears whatever infoview is
  active.

## Milestone popover

Opens from the main dock's milestone badge, toggled by the same click — a
second click on the badge, or the popover's own close button, both close
it. It lists every milestone in order against its population threshold: a
milestone at or below the city's current milestone level reads "Reached"
in the positive color, and everything still ahead reads its population
requirement instead (e.g. "50,000 pop"), dimmed.

## Status strip (bottom bar #2)

A single 28px row, left to right, each group separated by a subtle
divider:

- **Sim controls**: a play/pause button plus speed as a chevron count
  (`▶` = 1×, `▶▶` = 2×, `▶▶▶` = 4×, active speed picked out in the positive
  color), and undo/redo.
- **Clock and date**: `HH:MM` derived from the simulation's time-of-day,
  and `MMM YYYY` derived from the tick — the displayed year is an offset
  from a fixed base year.
- **Season chip**: a sun or leaf glyph plus a season name, derived purely
  from the in-game month — a display flavor, not a separate weather
  system.
- **City name**: centered, from the map's name.
- **Population**: a count plus a trend arrow against last month's
  snapshot.
- **Funds**: the current balance plus a monthly delta chip (positive or
  danger colored, labeled `/mo` rather than faking an hourly rate).
- **Happiness face**: a single emoji-style face stepped from the city's
  happiness score. Clicking it opens the Happiness infoview.

## Start menu and game lifecycle

A full-screen overlay, distinct from every panel above in that it replaces
the whole screen rather than floating over the viewport. It shows on first
load as the start screen, and reopens as a pause overlay over a running
game (from the corner Menu button, or Escape). Either way it is the same
component, composing a self-generated **SlimCity** brand mark over five
stacked actions: **Resume Game** (present only over a running game, and
first in the stack there, since leaving is the common reason to open the
overlay), **New Game**, **Save Game**, **Load Game**, and **Options**, plus
**Quit**. Save and Quit are disabled without an active game; Load is
disabled with no saves to offer.

New Game seeds a fresh procedural map from a fresh random seed; that seed
is stored in the save header, so Load reconstructs the exact terrain by
reading it back before the save itself loads. New Game, Load, and Quit all
work by writing an intent and reloading the page — the browser tears down
the worker, the WebGL context, and every listener for free, and the fresh
boot reads the intent back — so there is no in-app teardown path to keep
correct. Save and Options act on the live game instead. The save browser
lists each slot's name and timestamp with Load and Delete actions.

Options covers rendering (Bloom), gameplay (an unlock-everything sandbox
toggle, and an unlimited-money toggle for testing — both bypass their
respective gates rather than replacing them), and audio (master volume,
mute). It renders as a full-screen dialog like the rest of the menu; its
own Back action returns to the main list, but Escape does not stop
there — as from every sub-view, Escape only ever means Resume: over a
running game it closes the whole overlay and resumes play outright,
skipping past Back entirely, and on the menu-only start screen, with no
game to resume, Escape does nothing at all.

Audio also embeds a full music player, wherever one is wired in:
transport (previous, play/pause, next, a seek bar disabled until a track
is actually chosen, and an elapsed/total time readout), the full playlist
with the current track picked out — reading "Nothing playing" until one
actually is — shuffle and repeat toggles (repeat cycles off → all → one)
that persist alongside the rest of the settings, and a Rescan action for
the `public/songs/` folder. A drop zone on the panel accepts `.mp3`/`.wav`
files dragged in for the current session only; those tracks are labeled
`dropped`, and a Clear dropped action appears once at least one exists.
With no tracks at all, the transport and playlist give way to a line
explaining where to put files — Rescan, Shuffle, Repeat, and the Music
Volume slider stay put either way. A playback error the browser reports
surfaces as its own line beneath the drop zone.

Opening the pause overlay pauses the city at whatever speed it was
running; closing it — by Resume, or by Escape — restores that same speed,
including staying paused if that is how the player left it, so the two
exits can never disagree.

## In-world tool feedback (render-side, not DOM)

Everything above is DOM. This is the part of the same interaction language
that is drawn into the 3D scene instead, alongside whatever tool is
active:

- **Ghost preview**: a translucent accent-blue ribbon or cell block
  replaces the plain tiles under a tool — a white dashed centerline marks a
  road preview, an orange-red tint marks an invalid one. Zone painting
  shows as a bright green cell fill with darker borders; de-zoning shows
  grey. The crisp outer-border treatment on top of this ghost is a
  cross-cutting rule — see [`interaction.md`](interaction.md).
- **A road ghost is drawn at the road's own width**, not the tile's, because
  the width is what the player is choosing and every road would otherwise
  preview identically: a neighbourhood street reads as the 11 m it is inside
  its 20 m tile, and an avenue nearly fills that tile. Replacing one with the
  other is where it earns its keep — the ghost is what says beforehand that
  the new road is twice the street it is going over. A section too wide for a
  tile is laid as two carriageways on two rows of tiles, and the ghost shows
  both, so the extra ground a corridor claims is visible before it is taken.
  The tile frame is still drawn around the tiles themselves, so which tiles
  are claimed and how much of them the road covers are both readable at once.
- **Cursor chips**: a small DOM chip stack follows the pointer (see
  [`interaction.md`](interaction.md) for what it shows).
- **Zoning grid visualization**: while a zone tool is active, every
  zonable cell along a road renders as a faint translucent grid square —
  the classic zoning grid — tinted green where the hovered brush will
  paint. It is fed from grid data as an instanced layer and disappears the
  moment the tool goes inactive.
- **Selection highlight**: a selected building gets a green edge outline
  plus a floating map-pin sprite above its roof for as long as its info
  panel stays open.

## Not built yet

A few things this system describes as intended shape are not implemented,
and none of them are silently promoted to sound finished above. The
backlog and its priority live in `docs/DESIGN.md`, not here:

- **Save file export/import**: saves stay in the browser's IndexedDB store
  only. Save/load plus autosave already meet the bar of "ship a save,
  reload it, keep playing," and a browser city builder is not a
  file-management app.
- **Household name lists, wealth tiers, rent, and per-building color
  customization** on the building info panel: the panel reports what the
  simulation already tracks, and none of those are tracked yet.
