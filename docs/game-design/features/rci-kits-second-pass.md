# The RCI kits, second pass — design

- **Status:** Built 2026-10-27 (agreed 2026-10-23)
- **Date:** 2026-10-23

The building-detail programme ([building-detail.md](building-detail.md), complete
2026-10-16) gave every zoned building its parts. The player's verdict on the
result: the commercial and industrial buildings "don't look realistic or show
distinguishable features of what type of building they are", and the models
"could be way better". This feature is the second pass: each kind gets the
one massing cue, the cladding and the colour that tell it apart at the 40 m
the reference library was written for, from sources. The technical plan is
[../../engineering/features/rci-kits-second-pass.md](../../engineering/features/rci-kits-second-pass.md);
the art rules land in [../../art/buildings.md](../../art/buildings.md).

## What the player gets

A street of shops, a strip centre, a supermarket, a drive-through, an office
and a hotel that can be told apart from across the map by their shape and
colour, not their label; an industrial park where a warehouse, a factory, a
food plant and a chemical plant each read as what they are by their yard —
trailers at a dock bank, a stack and a baghouse, rooftop condensers and
silos, a tank farm inside its dike. Houses keep their types and gain the
siding colours, roof colours, garages and porches US homes actually have.

## Why it earns its place

What the kits draw today is right in its parts and wrong in its weight. The
parts are there — bulkhead, awning, sign band, cornice, canopy, porte-cochère,
dock bank, monitor roof, tanks — but every commercial body takes one catalog
colour desaturated to nothing, every industrial body one of three pale greys
under a grey roof, and the identifying parts are 0.3 to 1 m tall on 14 to
80 m fronts: at 40 m they are a pixel. The reference library said what
identifies each type at 40 m; the kits never gave those features the size or
the colour to be seen. Worse, the parts a food plant and a chemical plant
need to differ from a warehouse — condensers, silos, a bund, stacks — are
named in the art spec and absent from the parts map.

## The references, and what each kind is

Every figure below is sourced; the ones marked _single_ rest on one source.

### Commercial

| Kind             | What identifies it at 40 m                                                                                                                                  | Cladding and colour                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Main Street shop | A glass storefront a storey tall on a 0.6 m bulkhead under a sign band, punched windows above, a cornice; an awning per storefront                          | Brick red-brown or painted masonry; sign band in the tenant's colour; awnings dark green, burgundy, black                     |
| Strip centre     | One long low parapet box, a continuous canopy with a tenant sign band, a pylon sign at the road, parapet stepping up at entries                             | EIFS cream or tan over a masonry base; canopies black, dark grey or dark bronze; sign band white or cream with coloured signs |
| Supermarket      | A big blank box with one tall entry tower, split-face block base, cart corrals in the parking field, a screened dock at the back                            | Split-face CMU grey base, painted EIFS tan or grey, dark bronze trim; the entry tower the tenant's colour                     |
| Fast food        | A small box with a drive-through loop, a menu board and a pickup window, a pylon; the old form a brown mansard, the new a flat box with a dark feature wall | EIFS or stucco in beige and dark grey, a red and yellow accent band and pylon                                                 |
| Filling station  | A flat canopy on columns beside a small store, a price pylon with lit digits                                                                                | Canopy fascia a colour band 0.76 m tall; store cream or white; pylon the brand's colour                                       |
| Suburban office  | A 2–4 storey slab of ribbon windows between precast bands on a 1.5 m mullion module, a glazed lobby                                                         | Precast grey or buff bands, tinted glass; no sign band                                                                        |
| Office tower     | A curtain wall of vision glass over spandrel, a 12 m glass lobby at the street                                                                              | Blue-green or grey glass, spandrels a darker tone                                                                             |
| Hotel            | A flat-roofed 4-storey block with a porte-cochère on columns at the entrance, a sign band high on the facade                                                | EIFS beige with a stone veneer base, navy or dark green sign band                                                             |

Sources: a two-part commercial block is a storefront zone under upper floors
of evenly spaced windows and a cornice
([Brunswick GA guidelines](https://www.brunswickga.org/media/6721), _single_);
its storefront is bulkhead, display windows, recessed entry, transom and a
sign board ([Winchester VA](https://www.winchesterva.gov/files/assets/public/v/1/community-development/planning/2026-guidelines/brochure-5.-commercial-buildings.pdf),
[Muncie IN](https://www.muncie.in.gov/egov/documents/1620182633_8458.pdf)),
the bulkhead 18 to 42 in by code ([Knoxville](https://knoxplanning.org/cases/9-G-18-HZ),
[Tulare](https://codelibrary.amlegal.com/codes/tulare/latest/tulare_ca/0-0-0-40411)).
A neighbourhood centre is a 30,000–125,000 sq ft open-air strip on a
supermarket ([ICSC](https://www.icsc.com/uploads/research/general/US_CENTER_CLASSIFICATION.pdf));
its single-storey parapet runs to 28 ft and steps at entries, canopies black,
dark grey or dark bronze ([Hanover County](https://www.hanovercounty.gov/DocumentCenter/View/13740/Design-Guidelines),
_single_); tenant signs are 24 in channel letters, 30–36 in for anchors, on
a band ([Brixmor sign criteria](https://brixmor.com/api/documents/file/Ordering%20Your%20Storefront%20Sign.pdf));
pylons 20–36 ft, one per 500 ft of frontage ([ecode360](https://ecode360.com/40084305),
[Ivins UT](https://codelibrary.amlegal.com/codes/ivinsut/latest/ivins_ut/0-0-0-9272)).
Big-box codes want no facade over 100 ft uninterrupted, a 3-D cornice, an
entry feature, neutral base colours with primary accents, and a dock 60 ft
from the right-of-way behind a 6 ft screen ([Elk Grove big-box standards](https://gocodebook.com/library/us/ca/elk-grove-zoning/chapter-23.74-big-box-retail-design-standards),
[Fort Worth](https://dev-codelibrary.amlegal.com/codes/ftworth/latest/ftworth_tx/0-0-0-38309));
a 2026 grocery elevation is a gabled entry tower on a split-face base under
grey EIFS with dark bronze trim ([Goodyear AZ submittal](https://public.destinyhosted.com/goodydocs/2026/PZ/20260415_2282/3195_Attachment_E_-_Conceptual_Building_Elevations.pdf),
_single_); a cart corral is one or two 9×19 ft stalls
([DeCA](https://prod.commissaries.com/sites/default/files/2021-08/2E11%20Cart%20Corral.docx)).
A fast-food site is 3,700–4,500 sq ft on a corner, drive-through lanes 10–12
ft with six stacking spaces before the menu board
([McDonald's site criteria](https://mcdonalds.com/content/dam/sites/usa/nfl/pdfs/ICSC_Brochure_2025_Updates_r3.pdf),
[Goodyear](https://goodyear.municipal.codes/ZoningOrds/4-2-18)); the brown
double mansard of 1969 gave way to a flat box with EIFS, metal panel and a
dark feature wall ([Madison Preservation](https://www.madisonpreservation.org/blog/2021/12/31/raising-the-roof),
[Yorktown NY approval](https://www.yorktownny.gov/sites/default/files/fileattachments/planning/page/11262/revised_and_approved_building_architecture.pdf)).
A fuel canopy clears 14–16 ft with a fascia of up to 30 in
([Elk Grove](https://www.codepublishing.com/CA/ElkGrove/html/ElkGrove23/ElkGrove2372.html)),
four dispensers under it beside a 2,000–5,000 sq ft store
([NACS testimony](https://science.house.gov/sites/republicans.science.house.gov/files/documents/hearings/013007_eichberger.pdf)).
A suburban office is 12–14 ft floor to floor with mullions 5 ft on centre
([A.CRE](https://www.adventuresincre.com/glossary/floor-floor-height/),
[NEREJ](https://nerej.com/print/15389), _single_) in precast and ribbon glass
([PCI](https://www.pci.org/PCI/PCI/Project_Resources/Project_Profile/Project_Profile_Details.aspx?ID=235149),
_single_); a tower's curtain wall is vision glass over spandrel with a 40 ft
glass lobby ([Architectural Record](https://www.architecturalrecord.com/articles/5908-continuing-education-large-flat-glass),
[Architectural Record, Chicago lobby](https://www.architecturalrecord.com/articles/16478-a-glass-enclosed-entry-for-a-chicago-office-tower-eschews-glare)).
A limited-service hotel is four storeys of wood frame in EIFS over a stone
base with a flat roof and a porte-cochère clearing 13 ft 6 in
([Ithaca HIE](https://ithacating.com/2016/05/25/holiday-inn-express-construction-update-52016/),
[Hampton prototype](https://www.costar.com/article/2046609887/hilton-reveals-new-hampton-inn-prototype),
[Everett WA](https://lfportal.everettwa.gov/WebLink/0/doc/1786433/Page12.aspx)).
No source gives a palette by tenant class; the colours above are the game's
own choice, stated as such, except fast food's red and yellow
([Karen Haller](https://karenhaller.com/blog/branding-why-red-yellow-is-used-by-the-fast-food-industry/),
_single_, a consultant).

### Industrial

| Kind            | What identifies it at 40 m                                                                                                        | Cladding and colour                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Workshop / flex | A low metal shed, a glazed office front, roll-up doors at grade at the back                                                       | Ribbed metal panel in two tones: body light stone, ash grey or polar white; wainscot rustic red, slate, evergreen or blue      |
| Warehouse       | A long low tilt-up box, a bank of dock doors on 3.7–4.3 m centres with trailers in a concrete truck court, a glazed office corner | Painted tilt-up white or light grey with a coloured band at the top third; white roof; pale concrete apron, dark asphalt drive |
| Factory         | A metal or block box with a baghouse and a stack outside, a silo, a fenced material yard; monitors only on an old one             | Ribbed panel or CMU in grey-blue or tan; galvanised stack; oxide-red baghouse                                                  |
| Food plant      | A windowless white box with condensers and penthouses on the roof and stainless silos beside it, a dock bank                      | Flat insulated metal panel, white; silos aluminium-clad                                                                        |
| Chemical plant  | Short buildings beside a tank farm inside a dike, a pipe rack, a flare stack, a cooling tower                                     | White tanks, grey rack steel, a concrete dike wall; the flare's tip                                                            |
| Steelworks      | A 30 m melt shop with a ridge vent, a baghouse stack, an open scrap yard with a gantry crane                                      | Oxide red and dark grey panel, rust-brown yard                                                                                 |
| Paper mill      | A chip pile up to 15 m high beside a monitor hall, a recovery boiler with a 90 m stack, tanks                                     | Grey and white panel, the chip pile tan                                                                                        |

Sources: new warehouses clear 32–36 ft and more
([NAIOP](https://naiop.org/research-and-publications/magazine/2018/spring-2018/business-trends/raising-the-roof));
dock doors are 8–9 by 10 ft on 12–14 ft centres above a 48–55 in dock
([Blue Giant](https://www.bluegiant.com/architects/planning-and-design/truck-berths/),
[Legal Clarity](https://legalclarity.org/dock-high-loading-doors-in-industrial-properties-explained/));
truck courts run 120–135 ft deep, the docks in 7 in concrete and the court
in asphalt ([RETS](https://rets.ai/glossary/truck-court),
[Everett WA standard](https://lfportal.everettwa.gov/WebLink/0/doc/1320921/Page20.aspx));
tilt-up panels are up to 42 ft tall and 26–28 ft wide, painted over reveal
joints in banded patterns ([Tilt-Up Concrete Association](https://concretebuildings.org/tiltup/faq.html),
[TCA project profile](https://tilt-up.org/projects/profile/?id=6462)); white
TPO is the leading low-slope roof, EPDM black a tenth of the market
([Western Roofing](https://westernroofing.net/?p=7137)); the office portion
is 40% glazed, entries canopied, colours low-reflectance neutrals with bright
accents ([Fulton County GA](https://www.zoneomics.com/code/fulton-county-unincorporated-GA/chapter_37)).
Flex space clears 14–24 ft behind a glass office front with one or two grade
doors a suite ([Cove](https://cove.is/glossary/industrial-flex)); metal
buildings come in polar white, light stone, ash grey, desert sand, rustic
red, burnished slate, evergreen and aztec blue
([MBCI](https://mbci.com/products/pbr), [Buck Steel](https://www.bucksteel.com/metal-building-color-options/)),
and design review wants two colours and two elements on a metal wall
([Weiser ID](https://codelibrary.amlegal.com/codes/weiserid/latest/weiser_id/0-0-0-5793),
_single_). Monitor and sawtooth roofs are the pre-1950 factory's daylighting;
a modern plant is a box with its baghouse outside on a steel frame
([Oxford, _The Works_](https://academic.oup.com/book/47986/chapter/420466920),
[Michigan EGLE permit](https://www.egle.state.mi.us/aps/downloads/SRN/N7263/N7263_RVN_20160628.pdf)).
A food plant is flat insulated metal panel for washdown with ammonia
condensers and penthouses on the roof and 4–4.5 m by 15–23 m aluminium-clad
silos ([Refrigerated & Frozen Foods](https://www.refrigeratedfrozenfood.com/articles/89185-how-insulated-metal-panels-help-the-workflow-for-food-processing-facilities),
[Evapco](https://www.evapco.com/products/evapcoldr/lcr-p-penthouse),
[Paul Mueller](https://en.paulmueller.com/dairy-processing-equipment/silo-storage-tank)).
A tank farm's dike holds its largest tank, about a metre high, tanks half a
diameter apart, pipe racks 4–8 m bays with the bottom tier 4–5.5 m up, a
flare to 60 m self-supported ([DLA fuel facilities guide](https://www.dla.mil/Portals/104/Documents/Energy/Publications/Environmental%20Guide%20for%20Fuel%20Facilities/Chapter4_AbovegroundStorageTanksandContainers_Mar2019.pdf),
[What Is Piping](https://www.whatispiping.com/rack-piping),
[Oil & Gas Journal](https://www.ogj.com/home/article/17219054/flare-systems1-design-alternatives-components-key-to-optimum-flares)).
A mini-mill vents its melt shop at 28 m with a 30 m reheat stack and a 120 ft
baghouse stack over an open scrap yard ([EPA, Nucor Auburn](https://epa.gov/nsr/nucor-steel-auburn-inc-permitting-information),
[AISC](https://www.aisc.org/globalassets/modern-steel/archives/2014/02/2014v02_keep_on.pdf),
_single_); a kraft mill piles chips to 15 m and stacks its recovery boiler at
300 ft ([Arkansas DEQ permit](https://www.adeq.state.ar.us/downloads/WebDatabases/PermitsOnline/Air/0287-AR-2.pdf),
[bulk-online](https://www.bulk-online.com/en/node/66480)). Wall packs mount
12–20 ft up and yard poles 20–30 m ([1000Bulbs](https://blog.1000bulbs.com/home/the-complete-guide-to-led-wall-pack-fixtures),
[Utkarsh](https://utkarshindia.in/application/large-area-and-yard-lighting)).
Steel-mill and paper-mill colours were not sourced and are the game's own.

### Residential

| Kind             | What identifies it at 40 m                                                                                   | Cladding and colour                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Ranch            | One storey, a low gable or hip, an attached front garage, a porch on two thirds of them                      | Siding by region; roof charcoal, weathered wood, pewter grey or barkwood |
| Cape Cod         | One and a half storeys, a steep side gable with two dormers                                                  | Siding, white trim                                                       |
| Colonial         | Two full storeys, symmetrical, side-gabled, no dormers                                                       | Siding or brick, shutters                                                |
| Split-level      | A two-storey block beside a one-storey wing, the garage on the lowest level                                  | Siding over a brick base                                                 |
| Craftsman        | A low gable with wide eaves and a deep front porch on tapered columns on stone piers                         | Clapboard or shingle in olive, brown or sage                             |
| Townhouse        | Units 16–24 ft wide, front- or rear-loaded garages                                                           | Brick or fibre cement, colour by unit                                    |
| Duplex, fourplex | A house's form on a wider lot, two or four doors                                                             | As houses                                                                |
| Garden apartment | Two or three storeys of walk-ups off exterior breezeways and stair towers, balconies 6 ft deep               | Fibre cement and brick, colour-blocked                                   |
| 5-over-1         | Five storeys of flat-windowed cladding in colour-blocked panels over a 13–15 ft commercial or parking podium | Fibre cement panels in two or three colours, a brick podium              |
| Tower            | A flat-plate slab, 3.3–3.9 m a floor, a screened mechanical penthouse                                        | Curtain wall or panel                                                    |

Sources: 2024 starts were sided in vinyl 26%, stucco 25%, fibre cement 23%,
brick 16%, wood 6%, with vinyl at 73% in New England and stucco at 64% in
the Pacific ([NAHB on the Census SOC](https://eyeonhousing.org/2025/10/vinyl-surpasses-stucco-as-most-used-principal-exterior-wall-material/));
52.5% of 2024 starts had two or more storeys
([NAHB](https://eyeonhousing.org/2025/07/two-or-more-story-home-starts-rebound-in-2024/)),
65% of completions a two-car garage and 15% three or more
([NAHB](https://eyeonhousing.org/2025/09/parking-trends-in-newly-completed-single-family-homes-2024/)),
67% a porch ([NAHB](https://eyeonhousing.org/2025/10/where-are-porches-most-common-for-newly-built-homes/)),
and over 60% no fireplace, so most new houses have no chimney
([Census characteristics of new housing](https://www.census.gov/construction/chars/highlights.html)).
Laminated asphalt shingle covers two thirds of new single-family roofs
([Home Innovation](https://www.homeinnovation.com/insights/trends_data/up-on-the-rooftop-building-trends-that-matter-to-santa/43816),
_single_), in charcoal, weathered wood, pewter grey and barkwood by sales
rank ([GAF](https://www.gaf.com/en-us/blog/your-home/2025-shingle-color-trends-by-region-281474980440836),
_single_); siding colours are led by off-white, white, light brown, light
grey and medium blue ([Alside survey](https://roofingcontractor.com/articles/99988-alside-predicts-2025-top-siding-color-neutrals-best-the-bolds),
_single_). The craftsman form is the Pennsylvania SHPO's description
([PHMC](https://www.phmc.state.pa.us/portal/communities/architecture/styles/bungalow.html));
the split-level's, Wikipedia's and History Colorado's
([History Colorado](https://historycolorado.org/node/3843)). Townhouses run
16, 20 and 24 ft wide ([Fairfax VA](https://fairfaxva.gov/home/showpublisheddocument/15032/637207526518330000),
_single_); garage doors are 9×7 single and 16×7 double
([trade](https://mtrx.poff.ee/post/standard-garage-door-sizes-rough-opening),
_single_); a porch is 8 ft deep by form-based codes
([Edmonds WA](https://edmonds.municipal.codes/ECDC/16.20.055),
[Petaluma SmartCode](https://petaluma.municipal.codes/SmartCode/4.40.060));
an apartment balcony 6 ft and 60 sq ft ([Santa Ana](https://cc-publicdocs.santa-ana.org/WebLink/1/doc/18168/Page4.aspx));
a 5-over-1 is five combustible storeys over a podium with a 13–15 ft ground
floor ([Wikipedia, 5-over-1](https://en.wikipedia.org/wiki/5-over-1),
[Kirkland WA](https://codepublishing.com/WA/Kirkland/html/KirklandZ54/KirklandZ54.html));
a tower floor is 3.3–3.9 m with its rooftop plant screened
([Redmond WA](https://redmond.municipal.codes/RZC/21.58.5200.B)). No US study
counts lit windows by hour; a CIE paper caps lit windows at 50% of a facade
([CIE 2025](https://files.cie.co.at/x051_2025/P0796_ID298TomasNovak_OA_with_cover.pdf),
_single_), which the night rule's 40–70% already brackets. Residential street
lamps stand 200–250 ft apart on 25 ft poles where codes name a figure
([Yolo County](https://yolocounty.gov/home/showpublisheddocument/6565/635289380535200000),
[Minooka IL](https://www.minooka.com/media/e1ej3qiv/lighting-standards.pdf)),
though cities disagree widely.

## How it works, for the player

Nothing a player does changes. A zoned lot grows the kind it grows today;
what grows reads as its type from across the map. The second pass adds no
new kinds, no new zones and no new sim rules; it changes bodies' colours and
materials per kind, the size of the parts that identify a kind so they read
at 40 m, and the missing yard objects.

## What it interacts with

- [building-detail.md](building-detail.md) and [building-types.md](building-types.md):
  the kinds, the reference library and the triangle budget stay; the kits
  change inside them.
- [../../visual-render/lighting.md](../../visual-render/lighting.md): a
  coloured sign band glows in its own colour; a wall pack over a dock door;
  a lit storefront is a row of bays.
- [parking-to-code.md](../../specs/parking-to-code.md): the car park, drive-through lane
  and truck court are laid already; the pass dresses them (corrals, menu
  board, trailers at the dock, a guard booth).

## Tuning

Body palettes per kind are the one place taste enters: each is a short list
of named colours from the sources above, chosen by id hash, and the list is
the dial.

## What it is not

- Not new kinds, zones or sim rules.
- Not textures or imported meshes; the kits stay boxes and parts.
- Not a budget change: the triangle budget per building holds.

## Slices

1. **Commercial.** Bodies and palettes per kind; the storefront in bays; the
   strip's canopy and pylon; the supermarket's tower, corrals and dock
   screen; the fast-food box and feature wall; the office's ribbon bands;
   the hotel's base and band.
2. **Industrial.** Tilt-up bands and the white roof; trailers at the dock
   and the concrete apron; the factory's baghouse, stack and yard; the food
   plant's condensers and silos; the tank farm's dike, rack and flare; the
   mill's scrap yard and chip pile; two-tone metal sheds.
3. **Residential.** Siding and roof palettes by the shares above, garages and
   porches at their shares, chimneys on fewer than half; the craftsman's
   porch; the 5-over-1's colour blocking and podium; the tower's screened
   penthouse.
