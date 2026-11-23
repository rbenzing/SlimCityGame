import { defineSeries } from '../../lib/series.mjs';
import { districtBox, runUp } from '../../lib/town.mjs';

/** Vehicles the town shows moving before the frames are taken. */
const TRAFFIC = 12;

/** A district box from tile corners of the interaction town's own map (tests/support/town.ts). */
const at = (x0, z0, x1, z1, h) => () => districtBox(x0, z0, x1, z1, h);

export default defineSeries({
  name: 'town',
  type: 'town',
  purpose:
    'The small grown town reads as a town district by district: every road type, zone, service, line and the farms stand where the map puts them, with traffic on the streets and a tram on the line, by day and by night.',
  budgetS: 120,
  plan: { interactionTown: true },
  // Cars on the streets and a tram on the tramway, then the clock stops with them in frame.
  ready: async ({ page }, town) => {
    const { TOWN, tile } = town;
    // A transit vehicle on the tramway's row, off the avenue where buses cross it.
    const onLine = ([tram, avenueX, t, want]) => {
      const tramCar = window.__slimcity
        .readTransitRender()
        .positions.find(
          (v) =>
            Math.abs(v.z - (tram.z + 0.5) * t) < t / 4 &&
            v.x > tram.x0 * t &&
            v.x < tram.x1 * t &&
            Math.abs(v.x - (avenueX + 0.5) * t) > 2 * t,
        );
      return window.__slimcity.readVehicles().length >= want && tramCar
        ? { x: tramCar.x / t - 0.5, z: tramCar.z / t - 0.5 }
        : null;
    };
    const args = [TOWN.tram, TOWN.avenue.x, tile, TRAFFIC];
    await runUp(page, onLine, args, 90000);
    town.tram = await page.evaluate(onLine, args);
    if (!town.tram) throw new Error('the tram left the tramway before the clock stopped');
  },
  subjects: [
    { id: 'town-north', box: at(50, 38, 155, 100, 30), night: true },
    { id: 'town-south', box: at(50, 100, 155, 162, 30) },
    { id: 'downtown', box: at(88, 94, 122, 112, 30), night: true },
    { id: 'schools', box: at(58, 98, 72, 113, 25) },
    { id: 'railway', box: at(58, 38, 126, 48, 15) },
    {
      id: 'landfill',
      box: ({ TOWN: T }) =>
        districtBox(
          T.landfill.x0,
          T.landfill.z0,
          T.landfill.x0 + T.landfill.w,
          T.landfill.z0 + T.landfill.d,
          12,
        ),
      night: true,
    },
    // The stretch of line the tram stands on, a tile or two each side of it.
    {
      id: 'tramway',
      box: ({ tram }) =>
        districtBox(
          Math.round(tram.x) - 6,
          Math.round(tram.z) - 3,
          Math.round(tram.x) + 6,
          Math.round(tram.z) + 3,
          12,
        ),
    },
    { id: 'tram-crossing', box: at(82, 80, 98, 90, 12) },
    { id: 'median-opening', box: at(129, 95, 140, 105, 12) },
    { id: 'avenue-bridge', box: at(84, 64, 96, 80, 12) },
    { id: 'industry', box: at(91, 124, 125, 134, 40), night: true },
    { id: 'parks', box: at(68, 134, 101, 156, 20) },
    { id: 'airfield', box: at(88, 144, 100, 153, 20) },
    { id: 'farms', box: at(50, 158, 130, 170, 20), night: true },
    { id: 'motorway-ramp', box: at(128, 55, 154, 66, 15) },
    { id: 'sound-wall', box: at(145, 78, 155, 92, 12) },
  ],
});
