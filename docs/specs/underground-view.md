# The underground view

- **Status:** Built

**Owns:** how the buried water system is seen: when the city goes underground, what shows there, how the surface fades to glass, and how a pipe drag snaps and reports. What carries water, where a pipe may go and what it costs are not decided here.

**Rules:**

- Draw no pipe at the surface: no strip, hub or marking; the tile over a pipe looks as it would without it. `[R-world-033]`
- Go underground exactly while the pipe tool, a water building, or the Water or Sewer lens is in hand; keep no stored state and no button. `[R-world-033]`
- Fade the surface by material opacity, never a shader, and restore every material exactly as it was, translucent ones included. `[R-world-033]`
- Snap each end of a pipe drag onto the nearest carrier within one tile; a drag along a street lays nothing and sends nothing. `[R-world-033]`
- Say what the run joins at each end, and lay a run that reaches nothing all the same. `[R-world-033]`
- Read what is wet and what is drained from the lens coverage the sim sent; add no sim state and no message. `[R-world-033]` `[R-world-032]`

**Numbers:**

| Constant | Value | Unit | Source |
| -------- | ----- | ---- | ------ |
| `SURFACE_GHOST_OPACITY` | 0.25 | opacity | dial, so a house reads without hiding the pipe under its lawn |
| `ROAD_GHOST_OPACITY` | 0.35 | opacity | dial, road plate with its markings off |
| `MAIN_OPACITY_SHARE` | 0.6 | of a pipe's opacity | dial, so the player's runs stand out from the town's |
| Pipe and main strip width | 1.2 | m | the overlay's strip, dial |
| Snap reach of a drag end | 1 | tile | the reach a lot's service has to a main |
| Strip height over terrain | 0.05 and 0.06 | m | dial; under the road plates at 0.15 m |
| Riser box | 3 × 2.5 × 3 | m | dial, one `InstancedMesh` grown by doubling |
| Flow meshes | 4 | meshes | pipes' water and sewer runs, mains' water and sewer runs |
| Pipe layer in the save | version 14 | save version | already saved; nothing added |

**Code:**

- `src/render/underground.ts` `UndergroundView`, `setActive`: walks the scene, fades every mesh whose role is not `'keep'`, records and restores materials and shadows.
- `src/render/pipes.ts` `PipeOverlayRenderer`: strips under the road plates; mains, leads, risers, connections; vertex colour by what reaches each run.
- `src/render/overlays.ts` `coverageAt(kind, x, z)`: reads the cached lens coverage.
- `src/render/*.ts` (ground, lenses): `userData.underground = 'keep'` on terrain, water, sky, clouds, the lens quad, the zone grid, districts, transit ribbons, ghosts and landfill marks; `'road'` on roads.
- `src/tools/pipe.ts` `snapPipeEnd`, `pipeJoinAt`, `planPipeRun`: the drag's ends, what is laid and charged, what the cursor says.
- `src/tools/tools.ts`: the pipe tool reads `env.pipeWorld` (`mainAt`, `pipeAt`, `buildingNameAt`) when there is one.
- `src/shared/types.ts` `CursorChip.note`; `src/app/cursorchip.ts`: the note line.
- `src/main.ts` `refreshEpicVisibility`, `pipeSystemView()`, the env's `pipeWorld`, `readUnderground` (dev hook): the switch and the system view.
- `src/world/waterpipe.ts`: what a pipe is (not changed here).

**Tests:**

- `src/render/underground.test.ts` — roles, fade and restore, the late mesh, the shared material, the shadow.
- `src/render/pipes.test.ts` — hub along the arms' axes, the lead strip, mains apart from pipes, connections, wet and dry colours, the risers' pool, the keep tags.
- `src/tools/pipe.test.ts`, `src/tools/tools.test.ts` — snapping, the plan, the note, a drag along a street sending nothing.
- `src/app/cursorchip.test.ts` — the note line.

**Open:** none.

## Why the rules are what they are

### Why the pipes go underground

The old overlay drew a strip on the ground, a hair above the road plates, and only while a water tool or lens was in hand.

A pipe is not a painted strip, and the houses, trees and roads over a run hid most of it anyway. The overlay drew only the pipes the player laid, so the mains under the streets, the larger part of the network, were invisible. A pipe looked as if it ended in the grass when it had joined a main, and a shore building looked connected when it was not.

The pillars served are the city legible through data lenses, and the tool in hand decides what the city shows. The underground is a lens on the whole water system.

A laid pipe therefore draws nothing at the surface. It is a layer the ground hides, and the only way to see it is to go underground.

### When the city goes underground

The city goes underground whenever the player's attention is on the water: the pipe tool, any water building (tower, pumping station, drain, works), or the Water or Sewer lens. It comes back up the moment none holds.

There is no separate button: a control that only changes what the player is already looking at is a control they would have to find.

`refreshEpicVisibility` in `src/main.ts` already decided when the pipes showed. The same predicate now also puts the city underground, with no stored state.

Photo mode and screenshots take the surface view, since the player is then not working on the water. Audio is unchanged, and the other lenses do not go underground.

### Going to glass

The terrain and the water stay as they are, since they are the ground the pipes run under. The sky, the clock and the HUD are untouched.

Everything standing on the ground fades to a glass ghost: buildings and their lot furniture, trees, road furniture, vehicles and people. It stays in place so the player knows where it is and what a pipe is serving, but it is no longer in the way. Roads fade to a faint outline of their plates so the main under each one reads as the pipe it is.

`UndergroundView.setActive(true)` walks the scene. For every `THREE.Mesh` whose role is not `'keep'` it records the materials' `transparent`, `opacity` and `depthWrite`. It sets them translucent at 0.25, or 0.35 for a road, with no depth write, and switches the shadow off.

The role is read from `userData.underground` on the object or its nearest tagged ancestor; untagged is the surface. A material shared by several meshes is faded once.

The walk runs again every frame while the view is on, so a road chunk rebuilt or a car spawned underground comes in as a ghost. `setActive(false)` restores every record and clears them.

Opacity is a material property, so the no-custom-shaders rule holds. Lot and road furniture, vehicles, people and trees are instanced meshes with their own materials; fading them is the same switch the pipe overlay already hangs off. The depth write is turned off so the pipe strips on the terrain show through the plates and bodies over them. Picking is unchanged: a ghost building is still the building under the cursor.

### What the underground shows

Every carrier of water, drawn as what it is.

- **Street mains.** Under every street that carries water, a muted run of pipe down the road's centre: the system the town got for free.
- **Laid pipes.** The player's own runs, brighter than the mains, since they are the part the player is responsible for.
- **Service connections.** From each building on the mains, a short lead from the main to the building's lot, so a served building visibly hangs off the network and an unserved one does not.
- **Risers.** A tower, a pumping station, a drain and a works each show a riser, the point where the buried system comes up into the building and the one place a pipe can be joined to it. Each kit gains one, drawn only underground, at the footprint tile the network reaches through.
- **Flow.** The water half of every carrier is blue where water reaches it and grey where it does not; the sewer half is brown where a drain reaches it and grey where none does. A run that changes from blue to grey is the break the player is looking for.

The split carrier, blue beside brown, is the one the overlay drew before and the drawer's pipe card shows; it moves underground unchanged. One pipe carries both, so the underground draws one carrier with two flows.

### How the system view is built

`pipeSystemView()` in `src/main.ts` builds what the renderer draws from the client mirror.

- `mains`: every street tile whose class carries water.
- `pipes`: the laid pipe tiles.
- A `lead` for every building that draws water, from the road tile its road-facing edge meets, one step into its lot.
- A `riser` at the footprint centre of each water building (`water-*`, `sewage-works`).
- For each riser, a `connection` to every edge tile of its footprint with a main or a pipe beyond it: across first, then along, which keeps the run inside the rectangle.

`wet` and `drained` read the lens coverage cache, so a run's colour is what the sim last said reached it. The view is rebuilt lazily: a change marks it dirty, and it is rebuilt only while the pipes can be seen, or on the frame they come on.

The four flow meshes carry vertex colours: the water accent where `wet`, the drain brown where `drained`, grey where not. A carrier draws a hub along the axes its arms leave on and an arm to each neighbour that carries water. A straight run is one strip, never a row of cross ticks; a lone tile draws a hub both ways.

The strips sit at 0.05 and 0.06 m over the terrain, under the road plates at 0.15 m, so at the surface a street covers its main. Every mesh of the overlay is tagged `'keep'`.

### Laying a pipe

The pipe tool is a drag along tiles. Underground it gains the help it needs.

- **The ends snap.** With `env.pipeWorld` present, each end snaps onto the nearest carrier within a tile: the tile itself first, then north, east, south, west. A drag that begins in open ground still lays pipe there, since a run is sometimes laid before the thing it will serve.
- **The ghost says what it joins.** The cursor chip names the connection at each end: "Joins the main under Mill Road", "Reaches the pumping station", "Joins your pipe", or "Reaches nothing" at an end that will hang free.
- **A run that reaches nothing is laid all the same,** and says so, since the player may be about to place the building it is for.
- **A refused run says why.** Over water, through a building's footprint or across a deck overhead, the ghost draws red and the readout names the tile, as the road ghost does.
- **A run under a road is free.** The street already carries a main, so dragging along it lays nothing and costs nothing, and the readout says "The street carries a main". A pipe crossing a road is laid on the far side and joins the main on its way through.

`planPipeRun` lays and charges the tiles that are neither a main nor a pipe, and puts the plan's note on the chip. A commit sends only the laid tiles, and nothing at all when there are none. Without `pipeWorld` the tool lays the raw drag, which is what the older tests hold it to.

### Placing a water building

With a water building in hand the view is underground and the building's riser shows in its ghost. The readout says whether the riser lands on the system: "On the main under Harbour Street" or "On your pipe". Otherwise it says "Not connected: lay a pipe to a street".

The building is placed all the same, since a shore building has to go where the shore is, and the Advisor already says a drain or an intake serves nothing until it is connected.

### What it leaves alone

- The utilities walk is unchanged. The underground draws the carriers the Water and Sewer coverage runs along, and the lenses keep painting coverage over the terrain.
- The save format and the worker protocol are unchanged: the pipe layer (save version 14), the coverage patches and the buildings the view reads already travel, and the mains, connections and flow are derived from what stands.
- Not a change to what carries water, where pipes go, what they cost or how far the water reaches.
- Not an underground for power: a power line is a line of poles above the ground and stays on the surface.
- Not a cutaway or a camera below ground: the camera stays where it is and the surface goes to glass.
- Not a lens-grid infoview of its own: there is nothing to toggle.

### The implementation must satisfy

- Nothing on the surface shows a pipe: the overlay is hidden and under the plates whenever the city is not underground.
- Entering and leaving the underground leaves every material exactly as it was.
- A mesh that enters the scene underground is faded on the next walk.
- A run is grey where the coverage the sim sent does not reach it.
- A drag along a street lays nothing and sends nothing.

## Decided

- Underground comes with the water tools and lenses, not a toggle: a control that only changes the view is one the player must find.
- The ghost opacity is a dial: 0.25, not 0.6. A faded mesh no longer writes depth, so ghosts sort in scene order; at 0.25 it does not read, at 0.6 it would.
- The per-frame scene walk stays: it is a `scene.traverse` over a few hundred objects with a `Map` lookup each, measured as negligible. If the scene grows to thousands of objects, move it to the rebuild paths.
- The riser sits at the footprint centre, the system's point and not the kit's: a kit may stand its intake elsewhere, and the connection runs from the riser to wherever the pipe meets the lot.
- Pipes share one carrier with two flows: separate water and sewer pipes were not drawn, because one pipe carries both.
