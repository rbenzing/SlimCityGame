import { defineSeries } from '../../lib/series.mjs';
import { districtBox, runUp } from '../../lib/town.mjs';

/** Vehicles on the streets before the lenses are read, so the traffic and noise fields hold a town in motion. */
const TRAFFIC = 12;
/** Bodies waiting in each of two homes by the hospital: the health lens must show the loss. */
const BACKLOG = [
  { x: 100, z: 102, count: 60 },
  { x: 101, z: 98, count: 60 },
];

/** Where each lens is judged: the town centre unless the lens belongs to one district. */
const centre = (T) => districtBox(T.main.x0, T.tram.z - 1, T.mainEast.x0 + 4, T.fourLane.z + 4, 25);
const district = {
  landfill: (T) => districtBox(T.rail.x0, T.rail.z - 2, T.rail.x1, T.stationRoad.z + 4, 15),
  farms: (T) => districtBox(T.dirt.x0, T.dirt.z - 2, T.dirt.x1, T.dirt.z + 10, 15),
  hospital: (T) =>
    districtBox(T.cemetery.x - 5, T.policeDistrict.z - 2, T.library.x + 6, T.hospital.z + 10, 25),
  parks: (T) =>
    districtBox(
      T.districtPark.x - 2,
      T.districtPark.z - 1,
      T.neighbourhoodPark.x + 12,
      T.airport.z - 1,
      15,
    ),
  schools: (T) =>
    districtBox(T.middleSchool.x - 3, T.highSchool.z - 3, T.highSchool.x + 8, T.college.z + 6, 25),
  industry: (T) =>
    districtBox(T.incinerator.x, T.fourLane.z - 6, T.recoveryFacility.x + 6, T.fourLane.z + 6, 40),
};

/** A lens frame: `lens` is the field id or lens name the game's lens picker sets. */
const lens = (id, value, where = centre) => ({
  id,
  lens: value,
  views: ['full'],
  night: false,
  box: ({ TOWN }) => where(TOWN),
});

export default defineSeries({
  name: 'lenses',
  type: 'town',
  purpose:
    'Every lens paints the grown town in its own ramp with its legend on screen: the colours match the legend, and each lens lights the district it is about.',
  budgetS: 240,
  plan: { interactionTown: true, backlog: BACKLOG },
  ready: ({ page }) =>
    runUp(page, (want) => window.__slimcity.readVehicles().length >= want, TRAFFIC, 90000),
  subjects: [
    // The town centre with no lens, by day and night: what each lens is laid over.
    { id: 'no-lens', box: ({ TOWN }) => centre(TOWN), views: ['full'], night: true },
    // The nine field lenses and the three schooling reaches, by their field ids.
    lens('landvalue', 0, district.parks),
    lens('pollution', 1, district.industry),
    lens('noise', 2),
    lens('traffic', 3),
    lens('crime', 4),
    lens('firerisk', 5),
    lens('education', 6, district.schools),
    lens('health', 7, district.hospital),
    lens('happiness', 8),
    lens('middle-school', 9, district.schools),
    lens('high-school', 10, district.schools),
    lens('college', 11, district.schools),
    lens('power', 'power'),
    lens('watered', 'watered'),
    lens('sewered', 'sewered'),
    lens('transit', 'transit'),
    lens('districts', 'districts'),
    lens('trash', 'trash', district.landfill),
    lens('soil', 'soil', district.farms),
  ],
});
