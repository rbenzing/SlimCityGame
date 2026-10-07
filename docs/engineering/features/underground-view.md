# The underground view — technical design

- **Status:** Built 2026-10-07
- **Date:** 2026-10-07
- **Author:** Claude, from the agreed design in
  [../../game-design/features/underground-view.md](../../game-design/features/underground-view.md)

## What we are building, and why now

Pipes are buried, so nothing on the surface shows them; the city goes
underground while the player works on the water and shows the whole system
there. The pipe overlay drew a strip above the road plates and only the
player's own pipes, so the system the player was asked to complete could
not be seen. This is the view of it, with no change to what carries water.

## What it touches

| Module                                  | Change                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/render/underground.ts` (new)       | `UndergroundView`: fades every surface mesh to glass and restores it exactly                                                                                        |
| `src/render/pipes.ts`                   | Strips under the road plates; mains, leads, risers and connections; vertex colour by what reaches each run                                                          |
| `src/render/overlays.ts`                | `coverageAt(kind, x, z)` reads the cached coverage                                                                                                                  |
| `src/render/*.ts` (ground, lenses)      | `userData.underground = 'keep'` on terrain, water, sky, clouds, the lens quad, the zone grid, districts, transit ribbons, ghosts, landfill marks; `'road'` on roads  |
| `src/tools/pipe.ts` (new)               | `snapPipeEnd`, `pipeJoinAt`, `planPipeRun`: the drag's ends, what is laid and charged, what the cursor says                                                          |
| `src/tools/tools.ts`                    | The pipe tool reads `env.pipeWorld` when there is one                                                                                                               |
| `src/shared/types.ts`                   | `CursorChip.note`                                                                                                                                                   |
| `src/app/cursorchip.ts`                 | The note line                                                                                                                                                       |
| `src/main.ts`                           | The switch, the system view, the env's `pipeWorld`, `readUnderground` for the dev hook                                                                              |

Neither the **save format** nor the **worker protocol** changes: the pipe
layer, the coverage patches and the buildings the view reads already travel.

## The design

**The switch.** `refreshEpicVisibility` in `main.ts` already decided when
the pipes showed: the Water or Sewer lens, the pipe tool, or a Water-tab
building in hand. The same predicate now also puts the city underground.
There is no stored state and no new control.

**Going to glass.** `UndergroundView.setActive(true)` walks the scene and,
for every `THREE.Mesh` whose role is not `'keep'`, records its materials'
`transparent`, `opacity` and `depthWrite`, sets them to translucent at
`SURFACE_GHOST_OPACITY` (0.25) or `ROAD_GHOST_OPACITY` (0.35) with no depth
write, and switches its shadow off. The role is read from
`userData.underground` on the object or its nearest tagged ancestor; untagged
is the surface. The walk runs again every frame while the view is on, so a
road chunk rebuilt or a car spawned underground comes in as a ghost; a
material is faded once, however many meshes share it. `setActive(false)`
restores every record and clears them. Opacity is a material property, so
the no-custom-shaders rule holds; the depth write is turned off so the
pipe strips on the terrain show through the plates and bodies over them.

**The system view.** `pipeSystemView()` in `main.ts` builds what the
renderer draws from the client mirror: every street tile whose class carries
water (`mains`), the laid pipe tiles (`pipes`), a `lead` for every building
that draws water from the road tile its road-facing edge meets one step into
its lot, a `riser` at the footprint centre of each water building
(`water-*`, `sewage-works`), and for each riser a `connection` to every edge
tile of its footprint that has a main or a pipe beyond it — across first,
then along, which keeps the run inside the rectangle. `wet` and `drained`
read the lens coverage cache, so a run's colour is what the sim last said
reached it. The view is rebuilt lazily: a change marks it dirty and it is
rebuilt only while the pipes can be seen, or on the frame they come on.

**Drawing.** Four flow meshes — the pipes' water and sewer runs, and the
mains' at `MAIN_OPACITY_SHARE` (0.6) of their opacity — carry vertex colours:
the water accent where `wet`, the drain brown where `drained`, a grey where
not. A carrier draws a hub along the axes its arms leave on and an arm to
each neighbour that carries water, so a straight run is one strip and never
a row of cross ticks; a lone tile draws a hub both ways. The strips sit at
0.05 and 0.06 m over the terrain, under the road plates at 0.15, so at the
surface a street covers its main. Risers are one `InstancedMesh` of
3 × 2.5 × 3 m boxes, grown by doubling. Every mesh of the overlay is tagged
`'keep'`.

**The pipe tool.** With `env.pipeWorld` present — `mainAt`, `pipeAt`,
`buildingNameAt` — the tool snaps each end of the drag onto the nearest
carrier within a tile (`snapPipeEnd`, the tile itself first, then north,
east, south, west), plans the run (`planPipeRun`: the tiles that are neither
a main nor a pipe are laid and charged), and puts the plan's note on the
cursor chip: "Joins a street main · reaches the Water Pumping Station",
"Reaches nothing", "The street carries a main". A commit sends only the
laid tiles, and nothing at all when there are none. Without `pipeWorld` the
tool lays the raw drag as before, which is what the older tests hold it to.

### The rules the implementation must satisfy

- Nothing on the surface shows a pipe: the overlay is hidden and under the
  plates whenever the city is not underground.
- Entering and leaving the underground leaves every material exactly as it
  was, including ones that were already translucent.
- A mesh that enters the scene underground is faded on the next walk.
- A run is grey where the coverage the sim sent does not reach it.
- A drag along a street lays nothing and sends nothing.

## What could go wrong

- **The per-frame walk.** `scene.traverse` over a few hundred objects with a
  `Map` lookup each; measured as negligible, but it is the one per-frame cost
  the view adds. If the scene ever grows to thousands of objects, the walk
  can move to the rebuild paths instead.
- **Sorting.** Faded materials no longer write depth, so a ghost behind
  another ghost draws in scene order rather than depth order. At 0.25 opacity
  it does not read; it would at 0.6.
- **Risers at the footprint centre.** A kit may stand its intake elsewhere;
  the riser is the system's point, not the kit's, and the connection runs
  from it to wherever the pipe actually meets the lot.

## Tests

- `underground.test.ts`: roles, fade and restore, the late mesh, the shared
  material, the shadow.
- `pipes.test.ts`: the hub along the arms' axes, the lead strip, mains apart
  from pipes, leads, connections, the wet and dry colours, the risers' pool,
  the keep tags.
- `tools/pipe.test.ts`, `tools.test.ts`: snapping, the plan, the note, a drag
  along a street sending nothing.
- `cursorchip.test.ts`: the note line.
