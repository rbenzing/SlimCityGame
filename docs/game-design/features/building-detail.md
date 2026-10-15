# Building detail — design

- **Status:** Planned 2026-10-14; nothing built
- **Date:** 2026-10-14

## What the player gets

Every building in the city drawn the way the water tower is: as the thing it
is, with the parts that make its kind recognisable from the default camera
without a label, at the dimensions the real building has. Today a ranch
house, a supermarket and a warehouse are one box at three sizes, with a sign
band or a gable to tell them apart, standing on lots that are drawn to code
down to the accessible stall. The lots are ahead of the buildings on them.
This programme brings the buildings level.

The standard is the one the water tower, the stations and the schools set:
look at a real one, find the four to six things that identify it from across
the street — the roof form, the porch, the canopy, the dock doors, the
rooftop units — build those at their measured size, and nothing else. A
house gets a porch and a garage door; it does not get a doorknob.

## Why it earns its place

The city reads as a toy where the buildings are boxes, however exact the
roads and lots beneath them. The player's eye lands on the buildings first,
and the detached house — 61% of homes, the first thing a player grows — is
the plainest object in the game. Every rule the art bible holds, scale above
all, was written so that a building beside a 4 m car looks like a building;
the boxes satisfy the scale and fail the read.

The player asked for this (2026-10-14), naming the water tower as the bar.

## How it works, for the player

Nothing changes in the simulation. A lot grows the kind it grows today
([building-types.md](building-types.md)), on the lot it has
([lots-and-land.md](lots-and-land.md)), and draws what it draws from the
grid. What changes is what stands on the lot. Each kind gains a **recipe** of
real parts, and a building's level, lot and seeded variants pick among them,
so a street of detached houses reads as a street of houses — a ranch, a
two-storey colonial, a porch here and a side garage there — not twelve
copies of one.

### The reference library

Every kind is drawn against a real US type. The table names the type, the
features that identify it at about 40 m, and the measured figures the parts
take; the sources are the ones the figures came from, and a figure with no
source is marked as the game's own. This is the brief each slice builds
from; the slice's art document restates the dimensions it uses and nothing
here is repeated there.

**Residential**

| Kind                            | Reference type                                                                                                                                                                                                                                                                                | Identifying features                                                                                                                                                                   | Figures                                                                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detached house, level 1         | 1950s ranch ([Roanoke](https://www.roanokeva.gov/DocumentCenter/View/1474/Architectural-Patterns---Ranch-PDF), [Florence AL](https://florenceal.org/wp-content/uploads/2023/10/Ranch-House-Style-Guide.pdf))                                                                                  | one storey, long and low; hipped or side-gabled roof at 4:12–5:12 with wide eaves; off-centre door; one large picture window; attached garage or carport                               | door 6 ft 8 in; plate height 8 ft is the game's own (unsourced)                                                                                                                                                                                                               |
| Detached house, levels 2–3      | two-storey colonial / builder's traditional ([Effingham NH](https://effinghamnh.net/uploads/hd-hc-design-and-style-resource-guide-6-10-2024-version.pdf), [plan 62511DJ](https://www.architecturaldesigns.com/house-plans/two-story-colonial-house-plan-with-home-office-1998-sq-ft-62511dj)) | five-bay symmetry; centred door with a surround; paired double-hung windows with shutters; side gable at 7:12–12:12 with narrow eaves; a chimney                                       | foundation to top plate 17–20 ft; ridge 30–33 ft; pitch is regional ([Santa Barbara](https://santabarbaraca.gov/sites/default/files/documents/Services/Historic%20Resources%20Design%20Guidelines/Historic_Design_Guidelines_American%20Colonial%20Revival.pdf) says shallow) |
| Duplex                          | missing-middle duplex ([Utah toolkit](https://luau.utah.gov/wp-content/uploads/UMH_MMH-Toolkit_NeighborhoodTypes_Suburban.pdf))                                                                                                                                                               | house-scale, 1–2 storeys; two street doors side by side under one roof; two drives                                                                                                     | lot 50–75 ft                                                                                                                                                                                                                                                                  |
| Fourplex                        | missing-middle fourplex ([Utah toolkit](https://luau.utah.gov/wp-content/uploads/UMH_MMH-Toolkit_NeighborhoodTypes_Suburban.pdf), [AARP](https://www.aarp.org/livable-communities/housing/missing-middle/missing-middle-housing-factsheet-download/))                                         | two storeys, two over two; one shared street entry with a stoop; four windows across                                                                                                   | 40–50 ft wide                                                                                                                                                                                                                                                                 |
| Townhouse row                   | rowhouse ([Paso Robles](https://www.prcity.com/DocumentCenter/View/39501/Building-Type---Rowhouse-pp-5-57-58), [18 ft units](https://beverlywillis.com/architecture-project/0570/))                                                                                                           | 14–25 ft units in a run; three storeys; a front-loaded garage filling most of the frontage with a 6 ft entry beside it; the living floor's window over the garage; party-wall parapets | unit 14–25 ft; run ≤ 125 ft                                                                                                                                                                                                                                                   |
| Multiplex, courtyard apartments | garden apartment ([Fire Engineering](https://www.fireengineering.com/fire-safety/building-construction/building-comprehension-for-the-fire-service-understanding-garden-apartments/), [glossary](https://www.apartmentbuildings.com/glossary/garden-style-apartment-buildings/))              | 2–3 storey walk-up; open breezeway or exterior stair at each entry; ground units opening onto lawn; long low blocks around a court                                                     | 3 vs 4 storeys disputed between the two                                                                                                                                                                                                                                       |
| Mid-rise flats, shopfront flats | 5-over-1 ([Wikipedia](https://en.wikipedia.org/wiki/5-over-1), [Structure](https://structuremag.org/?p=10934))                                                                                                                                                                                | four or five wood storeys over a concrete podium of retail or parking; flat punched windows; fibre-cement panels in alternating colours by bay; a flat roof with a parapet             | about 65 ft                                                                                                                                                                                                                                                                   |
| Tower                           | post-2000 residential tower ([Penn State thesis](https://engr.psu.edu/ae/Thesis/portfolios/2006/ars233/PROPOSAL.pdf), [SAH point tower](https://sah-archipedia.org/buildings/IL-01-031-0051))                                                                                                 | slender plate; full-height glazing with projecting balconies and glass rails; a brick or concrete base                                                                                 | floor-to-floor 9 ft 4 in (single-source)                                                                                                                                                                                                                                      |

**Commercial**

| Kind                    | Reference type                                                                                                                                                                                                                                                                                                    | Identifying features                                                                                                                                                                                | Figures                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shop, restaurant        | Main Street two-part block ([WA DAHP](https://dahp.wa.gov/sites/default/files/Anatomy_of_MainStreet.pdf), [Roanoke](https://www.bizroanoke.com/DocumentCenter/View/1094/Building-Forms-and-Styles-PDF), [Texas HC](https://www.thc.texas.gov/public/upload/preserve/survey/survey/Commercial%20Architecture.pdf)) | zero lot line; storefront of bulkhead, display glass and transom; a belt course; punched upper windows; a projecting cornice or parapet                                                             | 2–4 storeys                                                                                                                                        |
| Restaurant, stand-alone | fast food with drive-through ([Wasco](https://wasco.municipal.codes/Code/17.40.100), [Elk Grove 23.78](https://codepublishing.com/CA/ElkGrove/html/ElkGrove23/ElkGrove2378.html), [Huey Magoo's](https://www.qsrmagazine.com/news/huey-magoos-unveils-free-standing-drive-thru-prototype-to-lower-build-costs/))  | a 40 × 50 ft box with a pitched or mansard roof; a drive-through lane wrapping the building with a menu board and a pick-up window; a tall entry feature                                            | lane 12 ft, 10 ft inner radius; 4–6 car stack at 19–22 ft; menu board ≤ 7–8 ft; clearance bar 9 ft (vendor); min height 23 ft 4 in (single-source) |
| Shopping strip          | neighbourhood centre ([ICSC](https://www.icsc.com/uploads/research/general/US_CENTER_CLASSIFICATION.pdf), [Ankeny sign code](https://codelibrary.amlegal.com/codes/ankeny/latest/ankeny_ia/0-0-0-10181))                                                                                                          | a straight or L strip with parking in front; a continuous canopy joining the storefronts; a sign band per tenant; an anchor at one end; a pylon sign at the drive                                   | pylon 20–30 ft; canopy depth 10 ft (one case)                                                                                                      |
| Supermarket             | big-box grocery ([Quick Chek drawings](https://northbrunswicknj.gov/wp-content/uploads/2025/09/Quick-Chek-Application-Architecture-Drawings.pdf), [Elk Grove 23.74](https://codepublishing.com/CA/ElkGrove/html/ElkGrove23/ElkGrove2374.html))                                                                    | a flat box with a raised, corniced entry tower; storefront glazing at the entry only; brick veneer base under grey panel; condensers on the roof by the dock; a cart corral at the door (unsourced) | parapet 23 ft 6 in; entry parapet 27 ft 6 in; entry tower 30 ft; glazing 18 ft 4 in                                                                |
| Filling station         | fuel canopy ([Elk Grove 23.72](https://www.codepublishing.com/CA/ElkGrove/html/ElkGrove23/ElkGrove2372.html), [Pinole](https://codelibrary.amlegal.com/codes/pinole/latest/pinole_ca/0-0-0-9830))                                                                                                                 | a flat canopy on masonry-based columns over the pump islands; a fascia band matching the kiosk; a price sign at the street                                                                          | clearance 14–16 ft; fascia ≤ 30 in; column spacing not found                                                                                       |
| Office                  | suburban office park ([Glenstar](https://mcshaneconstruction.com/portfolio/glenstar-ohare-office/)) and downtown tower ([PIMCO](https://pcfandp.com/projects/650-newport-center-drive-pimco-headquarters/), [Fox Tower](https://www.aisc.org/globalassets/modern-steel/archives/2001/02/2001v02_foxtower.pdf))    | precast panels with ribbon windows at 3–4 storeys; curtain wall with spandrels and a mechanical floor above; a glazed lobby                                                                         | floor-to-floor 10–14 ft low-rise, 12–14 ft tower                                                                                                   |
| Hotel                   | (no new reference; the canopy and sign band stay)                                                                                                                                                                                                                                                                 | a porte-cochère at the entrance; a sign band; a pool and lot behind                                                                                                                                 | —                                                                                                                                                  |

**Industrial**

| Kind                                   | Reference type                                                                                                                                                                                                                                                                                                                                                                                       | Identifying features                                                                                                                                                    | Figures                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Warehouse, food plant                  | tilt-up distribution centre ([Cove](https://cove.is/glossary/warehouse), [NAI](https://naiglobal.com/cre-terms-11-logistics-terminology), [WareCRE](https://www.warecre.com/loading-docks-ceiling-heights-and-power-requirements-understanding-industrial-property-specs/))                                                                                                                          | a parapet box with painted panel bands; a bank of dock doors with levellers and bumpers; a truck court with trailer stalls; a small office corner with the only windows | clear 32–40 ft; dock door 8–9 × 9–10 ft at 12–16 ft centres; dock 48–52 in above grade; truck court 120–135 ft       |
| Food plant, cold                       | cold storage ([Cushman & Wakefield](https://assets.cushmanwakefield.com/-/pmedia/201529/0/ventureparkcold-at-isp-9-2026.pdf), [FreezPak](https://designandbuildwithmetal.com/featured-projects/freezpak-logistics))                                                                                                                                                                                  | a windowless insulated-panel box; a lower cold-dock wing; refrigeration plant on the roof or the side; faux windows for code                                            | clear 32–40 ft; dock wing 28 ft                                                                                      |
| Workshop, flex                         | pre-engineered metal building ([Keen's](https://keensbuildings.com/metal-buildings/titan-series-goldhawk-50x100-metal-building/), [Sealy AGO plans](https://www.sratx.org/wp-content/uploads/AGO-Maintenance-Building-Plans-and-Specs.pdf))                                                                                                                                                          | ribbed metal walls and roof at 1:12–2:12; roll-up doors at grade; a brick or block office front                                                                         | eave 14–16 ft; bays 20–25 ft; doors 10 × 10 and 14 × 12 ft                                                           |
| Chemical plant, steelworks, paper mill | heavy plant ([pipe rack](https://en.wikipedia.org/wiki/Pipe_rack), [flare](https://ejurnal.ppsdmmigas.esdm.go.id/sp/index.php/swarapatra/article/download/106/107/118), [blast furnace](https://morgantownmag.com/beauty-in-the-burn/), [cooling tower cells](https://surplusrecord.com/listing/790-ton-spx-marley-nc8409u-crossflow-cooling-tower-6600-gpm-50-hp-1800-rpm-230-460-v-2018-1028030/)) | pipe racks on bents; tanks; a flare or stack; a blast furnace flanked by stoves with a cast house and skip hoist; cooling-tower cells                                   | rack bents 20 ft, 5–5.5 m clear; furnace 85–100 ft (disputed), bosh 23 ft; fan cells 12 ft                           |
| Farms                                  | farmstead ([silo](https://en.wikipedia.org/wiki/Silo), [gambrel barn](https://www.barnyard.com/structures/post-and-beam-barns/gambrel-barn-series), [pole barn](https://www.hansenpolebuildings.com/eave-height-3/))                                                                                                                                                                                 | a gambrel barn with a loft door; a tower silo with a domed cap; a pole barn with an open side; a farmhouse                                                              | silo 12–30 ft across, 20–80 ft tall; barn 24–36 ft wide, 11 ft 2 in plate (vendor); pole barn eave 10–20 ft (vendor) |

**Ploppables without a kit, and the earliest kits**

| Building                        | Reference type                                                                                                                                                                                                                                  | Identifying features                                                                                                                 | Figures                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Clinic                          | community clinic ([Valleywise](https://www.dwlarchitects.com/portfolio/valleywise-mesa/), [Clinica Sierra Vista](https://www.boulderassociates.com/projects/clinica-sierra-vista-fresno-blackstone-clinic/))                                    | one storey; a shaded entry canopy at the drop-off; storefront glazing at the entry; a pod plan with a courtyard                      | 11,000–27,000 sf                                                         |
| Rail station                    | small-town depot ([NRHP depot](https://npgallery.nps.gov/GetAsset/d90a47fa-28d3-418f-a726-8f0336ccca72), [Amtrak 75C](https://en.wikipedia.org/wiki/Amtrak_Standard_Stations_Program))                                                          | a long low building with deep knee-braced eaves; a trackside operator's bay window; a platform with a canopy; board-and-batten walls | depot 90 × 20 ft; 75C 81 × 45 ft; platform 8 in above rail               |
| Bus stop                        | (shelter; no new reference)                                                                                                                                                                                                                     | a glazed shelter with a bench, a flag sign and a bin                                                                                 | —                                                                        |
| Airport                         | (deferred to its own epic)                                                                                                                                                                                                                      | —                                                                                                                                    | —                                                                        |
| Coal plant                      | (the kit exists; its stacks are already the read)                                                                                                                                                                                               | add a coal conveyor, a precipitator and a cooling tower cell                                                                         | —                                                                        |
| Incinerator                     | waste-to-energy ([Essex](https://wtert.org/wp-content/uploads/2019/11/Essex-WTE.pdf), [Power Engineering](https://www.power-eng.com/environmental-emissions/from-trash-to-energy-treasure/))                                                    | an enclosed tipping hall; a taller boiler hall; a single stack; a truck ramp into the hall                                           | tipping hall 18–25 m; boiler hall 40–48 m; stack 80–105 m (UK figures)   |
| Recycling depot, MRF            | materials recovery facility ([Waste Advantage](https://wasteadvantagemag.com/optimal-building-design-from-the-floor-up/), [Dem-Con](https://greystoneconstruction.com/success-stories/dem-con-materials-recovery-facility-metal-building.html)) | a rigid-frame metal box; a row of inbound overhead doors; bale docks out; a 10 ft wainscot; bales stacked outside                    | tipping clear ≥ 25 ft; 5 doors in, 10 bale docks                         |
| Transfer station                | transfer station ([Waste360](https://www.waste360.com/design-construction/transfer-transfer-station-design-tips), [EPA Region 6](https://19january2025snapshot.epa.gov/system/files/documents/2024-05/region-6-transfer-station-guidance.pdf))  | an enclosed shed with a tipping floor raised over a trailer bay; push walls; a ramp up and a ramp down; 14 ft doors                  | clear 28 ft; tipping floor about 15 ft over the bay; push walls 12–14 ft |
| Water pump, drain, sewage works | (the kits exist; the works' clarifiers are the read)                                                                                                                                                                                            | add a screen house, a walkway on the clarifiers, a chlorine building                                                                 | —                                                                        |
| Every commercial roof           | rooftop units ([Trane J4PRG](https://www.tranetechnologies.com/content/dam/common/oxbox/light-commercial-packaged-units/gas_electric_package_unit_%28j4prg4xxxa%29/Submittals_J4PRG4120A3ELA.pdf))                                              | packaged units on curbs; a parapet; a roof hatch                                                                                     | 10-ton unit 88 × 49–60 × 49 in                                           |

Figures tagged single-source or vendor stay so until a slice finds a better
one; the slice's document says which it used.

### The slices, in the order the player chose

1. **The budget, measured.** No model lands before a frame-time test exists
   at a full Metropolis, and the modeling standard is rewritten on what it
   measures. Today it says a kit part is a 12-triangle box; the water tower
   is about two thousand triangles. The player chose a **tiered, measured**
   budget: a house about 600 triangles, a block or shed about 1,500, a
   ploppable about 3,000, each tier held by the test rather than by the
   number.
2. **Houses.** The detached house as a ranch at level 1 and a colonial above
   it; the duplex, fourplex and townhouse row. Porches, garages, chimneys,
   dormers, eaves, shutters, trim; the parts that vary by seed. The first
   thing the player sees, and the most numerous.
3. **Storefronts.** The Main Street shop, the drive-through restaurant, the
   strip with its canopy and pylon, the supermarket's entry tower, the fuel
   canopy on real columns, the office's ribbon windows and lobby, the hotel's
   porte-cochère; rooftop units on every flat roof.
4. **Industry and farms.** Dock doors at centres, truck courts, the metal
   building's ribs and roll-ups, pipe racks, the furnace and stoves, the
   gambrel barn and silo.
5. **Apartment blocks and towers.** The garden apartment's breezeways, the
   5-over-1's panel bays and podium, the tower's balconies and base.
6. **The kitless ploppables.** Clinic, rail station and bus stop. The airport
   stays a box until it has an epic of its own.
7. **The earliest kits, redone.** Coal plant, incinerator, water pump, drain,
   sewage works, recycling depot, MRF and transfer station, against the
   references above. The player chose to include them, last.

Each slice is one gated PR: its art document first, with every dimension and
its source; then the kit, its tests, and screenshots by day and night looked
at against the reference; then the frame test at the Metropolis.

## What it interacts with

**The simulation: nothing.** No catalog figure, lot, capacity, draw or save
byte changes. The programme is render-only.

**The lots.** A house's porch and garage stand where
[lots-and-land.md](lots-and-land.md) already puts its door, pad and drive; a
dock bank stands where [parking-to-code.md](parking-to-code.md) already puts
the truck court. The lot layouts are the sites the buildings are drawn onto,
not redrawn.

**Night.** Windows keep lighting from the facade material, as
[../../visual-render/lighting.md](../../visual-render/lighting.md) describes;
new window geometry on a house or a storefront lights the same way, on the
stations' emissive material, so a street at night does not change character.

**Performance.** Every house in a Metropolis carries its parts, so the
budget is the programme's one real constraint, and slice 1 exists to measure
it before anything spends it.

## What it is not

- **Not new kinds or new buildings.** Every kind in the catalog stays; the
  pass draws them.
- **Not textures or imported models.** The art bible's rule holds: boxes,
  lathes and merged low-poly geometry on stock materials, instance colour
  and the facade's node material. A brick wall is a colour, not an image.
- **Not interiors, signage text, or props at the doorknob scale.** A part
  earns its place by being readable at the default pitch.
- **Not the airport**, which needs a design of its own.
- **Not a change to the first town.** A village grows exactly as before and
  looks like a village sooner.
- Technical plan: [../../engineering/features/building-detail.md](../../engineering/features/building-detail.md).
  The art bible pages each slice writes into:
  [../../art/buildings.md](../../art/buildings.md),
  [../../art/civic-massing.md](../../art/civic-massing.md),
  [../../art/props-and-vehicles.md](../../art/props-and-vehicles.md),
  [../../art/modeling-standards.md](../../art/modeling-standards.md).
