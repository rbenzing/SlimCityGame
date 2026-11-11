# Vehicle kit

Vehicles are multi-part merged geometry, still one InstancedMesh per kind —
no draw-call growth:

- **Construction**: a merged BufferGeometry of 3 parts per kind — a body
  slab, a darker inset cabin/window mass (`#1a1f26`), and wheel cylinders. A
  region-mask vertex attribute lets the per-instance colour tint ONLY the
  body vertices; windows and wheels keep their fixed colours.
- **Kind mapping**: Car picks a sedan, wagon or hatchback silhouette by a
  slot-index hash; Truck picks a box-truck or pickup variant; Bus is a long
  body with a window band. Every variant is a geometry offset inside its
  kind's merged mesh, chosen deterministically.
- **Palette**: a curated ~10-colour saturated list (red, blue, teal, green,
  magenta, pink, yellow, orange, white, charcoal) picked by a slot hash — a
  deliberate saturation contrast against the desaturated city in
  [buildings/README.md](../buildings/README.md). Yellow reads as a taxi without needing a
  separate livery.
- **Heading**: a vehicle's mesh has its nose at +Z, so its facing yaw is
  `atan2(dx, dz)` — a car's long axis always aligns with the direction it is
  actually travelling.
- **Lane position**: a cosmetic vehicle is offset perpendicular to its travel
  direction into its own right-hand lane, by a tier-derived half-lane, so
  opposing flows separate onto the carriageway instead of overlapping on the
  centre paint.
- **No wheel spin** — imperceptible at RTS zoom, skipped deliberately.

**Service liveries.** Fire, Police, Ambulance and Garbage vehicles carry a
fixed, baked livery per kind rather than the randomized civilian palette
above, built from the same body + cabin-band + wheel-box parts:

- **Fire** — red body, red roof light-bar, the largest of the four bodies.
- **Police** — blue body, blue roof light-bar, sedan-sized.
- **Ambulance** — white body, the same red light-bar as fire, plus a small
  red-cross accent on the roof in front of the bar; a US Type III box on a
  van chassis, 6.9 × 2.5 × 2.7 m (the figure is derived in
  [healthcare-and-death-care.md](../../specs/healthcare-and-death-care.md)).
- **Garbage** — municipal green body, no light-bar; instead a raised rear
  hopper/compactor box in a darker green over the back ~40% of the body, plus
  a small amber beacon.

All four share the dark cabin/window band and simple wheel boxes from the
civilian kit's construction above.

**The hearse** is a fifth service body with its own construction, **6.2 × 1.9 ×
1.9 m** at real size: a long hood, a short glazed cabin and a closed landau coach
behind it with a padded roof, tinted rear glass and chrome landau bars, chrome
bumpers and grille, a black body. No light bar and no cross. 6.2 m is the
simulation's own figure, between a Cadillac XTS-based US coach (6.32 m) and a UK
Coleman Milne coach. The **livery, black with chrome-grey trim, is the game's own
choice**; no source for a coach colour was found. It reads apart from the
ambulance (white, red light-bar, 2.7 m tall) by height and colour, and from a car
(4.0 m, 1.5 m tall) by length.

| Kind      | Size (w × h × l, m) | Livery                          |
| --------- | ------------------- | ------------------------------- |
| Car       | 1.8 × 1.5 × 4.0     | randomized palette              |
| Ambulance | 2.5 × 2.7 × 6.9     | white, red light-bar, red cross |
| Hearse    | 1.9 × 1.9 × 6.2     | black, chrome-grey trim, no bar |

Like every kind it is one InstancedMesh, in the service-vehicle renderer.

## Rail and tram cars

A train and a tram have their own geometry. Neither is a bus made longer.

- **A rail car** is a flat-sided body over two bogies set in from its ends,
  the body overhanging both. No wheel arch cuts its side. One window band
  runs its length, broken by two doors a side.
- **A train** is three cars. Each end car carries a cab: a raked nose, a
  windscreen, lights under it and a coupler. An inner end is blunt and meets
  the next through a gangway bellows; no cab faces another car.
- **A tram** is two low-floor sections joined at a bellows over a shared
  middle bogie, three bogies in all. Skirts cover its wheels, a cab stands at
  each end, and one pantograph stands raised on its roof.
- **The roof** carries equipment pods narrower than the body and nothing
  else.
- **Colour.** The body takes the line's colour. Glass, bogies, bellows,
  couplers and roof gear keep their own.
- A set stabled in a yard or a depot is the same geometry as one in service.

| Part | Size | Source |
| ---- | ---- | ------ |
| Train car (w × h × l) | 3.2 × 3.8 × 14.0 m, three to a set at 15.2 m | `TRAIN_CAR_SIZE`, `TRAIN_CAR_PITCH` |
| Bogie centres | 0.70 of the car's length, 9.8 m | [rail cars](../../sources/transport-depots.md#rail-and-tram-cars) |
| Bogie wheelbase, wheel | 2.6 m, 0.91 m | same |
| Floor over the rail | 1.3 m | same |
| Tram section (w × h × l) | 2.6 × 3.4 × 11.0 m, two to a set at 11.4 m | `TRAM_CAR_SIZE`, `TRAM_CAR_PITCH` |
| Tram bogie wheelbase, wheel | 1.9 m, 0.66 m | same |
| Pantograph head over the roof | 1.6 m | dial |
| Bellows past a blunt end | half the gap: 0.6 m on a train, 0.2 m on a tram | the pitch less the car |

Code: the builders in `src/render/railcars.ts`; `TRAIN_SET`, `TRAM_SET` in
`src/render/transit.ts`; the stabled sets in `src/render/utilitykits.ts`.

