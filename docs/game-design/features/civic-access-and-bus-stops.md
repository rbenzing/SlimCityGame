# Civic access and bus stops — design

- **Status:** Built 2026-10-28 (agreed 2026-10-27)
- **Date:** 2026-10-27

Two things the player sees from the street that read wrong today. A bus
stop is a building: a catalog ploppable that takes a tile of its own beside
the road and stands on it like a kiosk, where in a real town a stop is road
furniture on the footway, a sign on a pole or a shelter on a concrete pad.
And a service, transport, utility or park building stands on its lot with
no way in: nothing joins its doors, its bays or its car park to the road,
where every fire station has an apron to the kerb and every clinic a drive
to its car park. The technical plan is
[../../engineering/features/civic-access-and-bus-stops.md](../../engineering/features/civic-access-and-bus-stops.md).

## What the player gets

### A bus stop is furniture on the footway

The player places a bus stop on a street, on the side the pointer is on,
and it stands where a stop stands: on the footway, on an 8 ft by 5 ft
concrete boarding pad, the sign on its pole at the kerb and the shelter, if
there is one, at the back of the footway facing the road. It takes no land.
A street with no footway — a dirt or gravel road, a lane without kerbs —
gets the same pad at the shoulder, since a sign standing in grass is the
one thing a transit agency will not build. A bus line's stops are these
stops; placing a stop is how a line gets one.

Two kinds, by what they cost:

| Kind             | What it is                                            | Cost | Upkeep per month | Income when used               |
| ---------------- | ----------------------------------------------------- | ---- | ---------------- | ------------------------------ |
| Bus stop sign    | A sign on a pole on the boarding pad                  | ₵2   | ₵0               | none                           |
| Bus shelter      | The pad, the sign, a shelter with a bench and a bin   | ₵150 | ₵10              | ₵7 while boardings warrant it |

The shelter's income is advertising: a shelter that at least **25 riders a
day** board carries an ad panel the city sells, which pays most of its
upkeep; a shelter nobody uses costs its upkeep and earns nothing, which is
the choice the player makes when they put a shelter where a sign would do.

### A civic building has a way in

Every service, transport, utility and park building gets a drive from the
kerb to where its vehicles and visitors go, laid in its lot the way a
house's drive and a shop's car park already are, with a curb cut across the
footway:

- A **fire station** has an apparatus apron the full width of its bays and
  45 ft deep, from the bay doors to the kerb, so an engine pulls straight
  out; its staff park at the side or the rear.
- A **police station, clinic, hospital, school, library, depot, works or
  park with a car park** has a two-way 24 ft drive from the kerb to its car
  park, which lies beside or behind the building, never across its front,
  with a visitor pad by the door where the kit has one.
- A **school** has in addition a bus loop: a 24 ft one-way lane off the
  drive, round and back, where the lot has room.
- A building whose kit has a works yard or an apron already (the plants,
  the depots, the transfer station) gets the drive from the kerb to the
  yard's gate, so the yard joins the road instead of floating behind it.

## Why it earns its place

The stop is the thing the player places most and looks at closest, and it
is drawn wrong. The civic drive is the one piece every lot the player
places by hand lacks, now that every lot that grows has one.

## The standards, and what they are on the tile

**The boarding pad** is 96 in measured out from the kerb face by 60 in
along it, firm and level, joined to the footway
([ADA Standards 810.2](https://www.access-board.gov/ada/),
[Arlington VA](https://www.arlingtonva.us/Government/Programs/Transportation/Vision-Zero/Action/Tools-and-Guidelines/Tools/Transit-Stops)).
The game's pad is **2.44 m deep from the kerb face by 3.66 m along it**,
the shelter's length, so the shelter stands on it. A pole and every other
vertical element keeps **18 in, 0.46 m, off the kerb face**
([AASHTO via Lane Transit District](https://www.ltd.org/wp-content/uploads/2026/03/Attachment-B-Exhibit-E-2022-06-01_Bus-Stop-Standards_Final.pdf));
a shelter keeps a **3 ft, 0.9 m, path between it and the kerb** and stands
at the back of the footway
([NYC Street Design Manual](https://www.nycstreetdesign.info/index.php/node/143)).
On a road with no footway an agency pours the same pad at the shoulder and
a stub of walk to it
([Montgomery County MD](https://www.masstransitmag.com/bus/press-release/11499151/montgomery-county-maryland-md-bus-stop-improvement-program-has-improved-safety-and-accessibility-at-nearly-3000-stops),
[Raleigh UDO 8.11.3](https://udo.raleighnc.gov/sec-8113-determining-required-transit-infrastructure));
grass or gravel never counts as a pad
([Omnitrans](https://omnitrans.org/wp-content/uploads/2023/10/Appendix-E-F-ADA-Compliance-Checklist-and-Stop-Gallery.pdf)).

**Where a stop may stand.** A stop stands clear of a junction: a 40 ft bus
needs 90 ft of kerb on the far side of a crossing or 100 ft on the near
side ([LA Metro](https://busstophub.metro.net/wp-content/uploads/2025/07/Metro_Bus-Stop-Hub_Street-side-Factors.pdf),
[NACTO](https://nacto.org/publication/urban-street-design-guide/street-design-elements/transit-streets/bus-stops/)),
so on the tile **a stop never stands on a junction tile**; the tile beside
one is the far-side stop the manuals prefer. Stops are typically 750 ft
apart on an urban street and 1,000 ft in a suburb
([TCRP Report 19](https://www.njtpa.org/NJTPA/media/Documents/Planning/Regional-Programs/Studies/Pedestrian%20Safety%20at%20and%20Near%20Bus%20Stops%20Study/Bus-Stop-Safety-Tool-Box_final13.pdf)),
which the player chooses; the game does not space them. A stop never
stands on a motorway or a ramp, on rail, or on a tram reservation (a tram
stop is the tramway's own).

**Sign against shelter.** A sign, pole and timetable case cost $296 with
$126 to install ([UTA 2023](https://buyapass.rideuta.com/-/media/Files/About-UTA/Reports/2023_BSMP_Compressed_a.pdf));
a shelter costs $30,000–40,000 bought and installed and $4,000–7,000 a
year to clean, repair and clear
([MBTA](https://commonwealthbeacon.org/transportation/t-notes-bus-shelter-maintenance-pricey/),
[Sarasota](https://www.yourobserver.com/news/2013/jan/31/scat-pitches-strategic-plan/)).
The shelter keeps its present price, ₵150 and ₵10 a month, as the anchor;
the sign is priced by the real ratio, 1 to 83, at ₵2 and nothing a month.
Shelter advertising pays a city a flat $100–300 a shelter a month or
15–35% of the gross ([Pasadena $300](https://ww2.cityofpasadena.net/2015%20Agendas/Aug_17_15/AR%209.pdf),
[Burbank 20% with a $100 floor](https://web2.burbankca.gov/cityclerk/agendas/ag_council/2003/sr021103_10.html),
[Maryland MTA 35%](https://mgaleg.maryland.gov/2005rs/fnotes/bil_0008/sb0158.pdf)),
against $417 a month of upkeep: the game pays ₵7 of the ₵10, the same
seven tenths. Agencies warrant a shelter at **25 boardings a day** in a
suburb and 40 downtown ([Metro Transit](https://www.metrotransit.org/Data/Sites/1/media/about/improvements/shelters/shelter-placement-guidelines-update-november-2017.pdf),
[Spokane Transit](https://spokanetransit.com/files/projects-plans/PassengerFacilities_Report_4thEd_REV.PDF));
the game takes 25, so an ad panel sells where a shelter was warranted.

**The civic drive.** A two-way commercial or civic driveway is 24 ft wide
at least and 30–36 ft at most ([Hurricane UT](https://www.zoneomics.com/code/hurricane-UT/chapter_25),
[Genesee County MI](https://www.gcrc.org/forms-documents/forms/gcrc-driveway-policies/169-rules-governing-the-granting-of-permits-for-driveways-in-the-genesee-county-road-system/file),
[Olathe KS](https://olathe.municipal.codes/UDO/18.30.050)); the game's is
**7.3 m**. A fire apparatus road is 20 ft clear and a two-way fire lane
24 ft ([NFPA 1141 via Santa Clara County Fire](https://sccfd.org/wp-content/uploads/2024/08/A-1-Fire-Department-Apparatus-Access-05.12.2021.pdf));
a station's front apron is 45–50 ft deep from the bay doors
([Arlington VA Fire Station 8](https://arlingtonva.us/wp-content/uploads/sites/31/2016/02/FS8-Proposed-Program-020316.pdf),
[Fire Engineering](https://www.fireengineering.com/firefighting/from-the-ground-up-constructing-or-reconstructing-a-modern-firehouse-2/)),
the game's **14 m**, and its staff park at the rear or side with a visitor
lot by the door ([Fire Apparatus](https://www.fireapparatusmagazine.com/the-fire-station/the-station-articles/five-station-tips/)).
A school bus loop is a 24 ft lane on a 50 ft radius, one way
counter-clockwise ([Montgomery County MD](https://www.montgomerycountymd.gov/OLO/Resources/Files/clarksburg/h140.pdf),
[California Department of Education](https://www.cde.ca.gov/ls/fa/documents/busdrvwy.pdf)).
Codes put a civic car park beside or behind the building
([Mocksville NC](https://www.zoneomics.com/code/mocksville-NC/chapter_19),
[Milpitas CA](https://www.milpitas.gov/DocumentCenter/View/1198)).

## How it works, for the player

### Placing a stop

The bus stop sign and the bus shelter are two tools in the transport
panel. In hand, the ghost snaps to the nearest street tile under or beside
the pointer and to the side of the road the pointer is on, and shows the
pad, pole and shelter where they will stand; it turns red on a junction
tile, a motorway, a ramp, rail, a tram reservation, or a tile that already
holds a stop on that side. A stop is a point on the street with a side and
a kind; a line's stop list names it. Bulldozing a stop takes it off every
line that calls at it. A sign upgrades to a shelter by placing the shelter
on it, for the difference.

### The stop on the street

On a street with a footway the whole stop stands at the outer edge of the
footway, the footway itself kept clear for walking: the pad begins at the
back of the footway and runs 2.44 m beyond it into the verge or the lot's
edge, the pole stands at the pad's road-side edge at its leading end, the
shelter along the back of the pad facing the road, the bin beside the
shelter. On a street with no footway the pad comes up to the road, its
near edge at the edge of the carriageway's kerb reserve, and the pole and
shelter stand on it the same way. A one-tile street holds a stop on each
side.

### Riders and the ad panel

The transit model already counts a line's riders stop by stop; each stop
now keeps its boardings a day, the sum over the lines calling at it, and
the inspector shows it. A shelter whose boardings reach 25 a day earns its
₵7 a month, listed in the budget as advertising; the inspector names the
shelter "warranted" or not. A sign earns nothing and costs nothing.

### A civic building's drive

When a civic building is placed its lot plan lays the drive from the kerb
to the building's access point — its bay doors, its car park, its yard
gate or its front door's visitor pad — with a curb cut across the footway,
square to the street it fronts, on the frontage the kit faces. The kit's
own apron or yard is unchanged; the drive meets it. A fire station's apron
replaces the drive. On a lot with no road frontage (placed by hand off the
road) nothing is drawn, as nothing grows there.

### What the player sees

Stops on footways with poles at the kerb and shelters at the back, pads at
the shoulder of a gravel road; a fire station with its engines facing an
apron to the street; a school with a bus loop; every clinic, station and
depot with a drive to its car park and a curb cut on the kerb.

## What it interacts with

- [../../world-sim/transit-model.md](../../world-sim/transit-model.md):
  a line's stop is a point on the street tile, not the kerb tile beside it;
  snapping already accepts a point on a run.
- [parking-to-code.md](parking-to-code.md): the civic drive reuses the
  lot layout's drive and curb cut; the car park the kit draws is the kit's.
- [transport-depots.md](transport-depots.md): the depots' yards get the
  drive to their gate.
- [lots-and-land.md](lots-and-land.md): the civic drive keeps the 20 ft
  corner clearance a house's drive keeps.
- Saves: stops ride in the save as a list beside the lines; an older save's
  bus-stop buildings become shelters on the street tile they front, on the
  side facing where they stood, and their tiles are freed.
- Budget: the shelter's advertising is an income line.

## Tuning

- The shelter warrant, 25 boardings a day, and the ad income, ₵7 a month,
  are the two dials; both sourced above.
- The sign's ₵2 is the real cost ratio against the shelter's ₵150; neither
  is re-tuned here.
- Drive width 7.3 m, apron depth 14 m, bus loop radius 15 m.

## What it is not

- **Not stop spacing.** The game never spaces stops; the player does.
- **Not a bus bay or a bulb-out.** A stop is on the footway; the
  carriageway is unchanged.
- **Not civic car-park sizing to code.** The kit's car park stays what the
  kit draws; this adds the way in. Parking ratios for civic kinds are a
  later choice.
- **Not a change to rail stations or tram stops.**

## Slices

1. **Bus stops as furniture.** The sign and the shelter, placement on the
   street with a side, with and without a footway, lines calling at stops,
   boardings a stop, the ad income, the save migration, the inspector.
2. **Civic drives.** The access point per kit, the drive and curb cut, the
   fire apron, the school bus loop, the yard gate for the plants and depots.
