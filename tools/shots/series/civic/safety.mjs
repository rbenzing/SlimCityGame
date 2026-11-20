import { civicSite, plopOn, streetPoint } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';

/** Vehicle kinds (src/shared/types.ts VehicleKind). */
const FIRE = 3;
const POLICE = 4;
/** Metres from a front wall to a vehicle standing on the apron, and the engines' spacing along it. */
const APRON = 9;
const BAY_SPACING = 12;
/** The homes the incident pins stand over, left to right, and the pins' severity (0..1). */
const HOMES = [0, 3, 6];
const PINS = [
  { kind: 'fire', severity: 0.8, answered: false },
  { kind: 'crime', severity: 0.5, answered: true },
  { kind: 'medical', severity: 0.9, answered: false },
];
const HEADING_SOUTH = 0;

export default defineSeries({
  name: 'safety',
  type: 'civic',
  purpose:
    'Fire and police stations of every rung read as stations: bay doors, apron and walk drawn, an engine or a car standing on the apron at its true size, and an incident pin standing over its home.',
  budgetS: 60,
  site: civicSite,
  subjects: [
    { id: 'police-station' },
    { id: 'police-station-district' },
    { id: 'fire-station' },
    { id: 'fire-station-district' },
    { id: 'incidents', plot: { w: 8, d: 2, h: 8 } },
  ],
  scene: async (session, site) => {
    const { page } = session;
    const vehicle = (id, kind, along) => ({
      ...streetPoint(site, id, APRON, along),
      heading: HEADING_SOUTH,
      kind,
    });
    await page.evaluate(
      (list) => window.__slimcity.setVehicles(list),
      [
        vehicle('police-station', POLICE, 0),
        vehicle('police-station-district', POLICE, 0),
        vehicle('fire-station', FIRE, 0),
        vehicle('fire-station-district', FIRE, -BAY_SPACING),
        vehicle('fire-station-district', FIRE, BAY_SPACING),
      ],
    );
    const homes = await plopOn(
      session,
      site,
      'incidents',
      HOMES.map((dx) => ({ id: 'res-low-1', dx, dz: 0 })),
    );
    await page.evaluate(
      (pins) => window.__slimcity.setIncidents(pins),
      homes.map((h, i) => ({ ...PINS[i], x: h.x, z: h.z })),
    );
  },
  details: [
    {
      subject: 'fire-station-district',
      name: 'bays',
      shows: 'the engines at their bay doors (4.6 m doors, 10 m engines) at pedestrian scale',
      local: [0, 24],
      distance: 40,
      yaw: 0.5,
      pitch: 0.2,
      scale: 2,
    },
    {
      subject: 'incidents',
      name: 'pins',
      shows:
        'the three incident pins over their homes: unanswered fire, answered crime, unanswered medical',
      local: [0, 0],
      distance: 90,
      yaw: 0,
      pitch: 0.7,
      scale: 1,
    },
  ],
});
