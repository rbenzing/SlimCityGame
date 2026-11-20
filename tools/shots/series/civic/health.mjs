import { defineSeries } from '../../lib/series.mjs';

/** Vehicle kinds (src/shared/types.ts VehicleKind). */
const HEARSE = 8;
const GRAVES = 420;
/** Metres from a front wall to the middle of the near lane, and the hearse's offset along the street. */
const STREET_LANE = 9;
const HEARSE_ALONG = 30;

export default defineSeries({
  name: 'health',
  type: 'civic',
  purpose:
    'Each health and death-care building reads as one on its lot: street face, doors, drive, stalls and grounds all drawn, no wall missing from any side.',
  budgetS: 60,
  subjects: [{ id: 'hospital' }, { id: 'clinic' }, { id: 'crematorium' }, { id: 'cemetery' }],
  scene: async ({ page }, site) => {
    const T = site.tile;
    const of = (id) => site.subjects.find((s) => s.id === id);
    // Metres: a point on the street side of a subject, `out` beyond its front wall.
    const front = (id, out, along) => {
      const s = of(id);
      return {
        x: (s.cx + 0.5) * T + along,
        z: (s.cz + 0.5) * T + (s.d * T) / 2 + out,
      };
    };
    // The hearse stands in the near lane beside the crematorium's drive, clear of its face.
    await page.evaluate(
      ([vehicles, cemetery, graves]) => {
        window.__slimcity.setVehicles(vehicles);
        window.__slimcity.setInterments(cemetery, graves);
      },
      [
        [{ ...front('crematorium', STREET_LANE, HEARSE_ALONG), heading: Math.PI, kind: HEARSE }],
        of('cemetery').buildingId,
        GRAVES,
      ],
    );
  },
  details: [
    {
      subject: 'hospital',
      name: 'entrance',
      shows: 'the main entrance, canopy and walk at pedestrian scale',
      local: [-18, 24],
      distance: 40,
      yaw: 0.25,
      pitch: 0.5,
      scale: 2,
    },
    {
      subject: 'hospital',
      name: 'deck',
      shows: "the parking deck's roof tier from above: one car to a stall or not",
      local: [40, 5],
      distance: 60,
      yaw: 0,
      pitch: 1.4,
      scale: 2,
    },
    {
      subject: 'cemetery',
      name: 'graves',
      shows: 'a section of headstones against a 1.75 m person: stone height and spacing',
      local: [16, 8],
      distance: 40,
      yaw: -Math.PI + Math.PI / 6,
      pitch: 0.45,
      scale: 2,
    },
    {
      subject: 'cemetery',
      name: 'gatehouse',
      shows: 'the gatehouse door (2.1 m) and gate from the grounds side',
      local: [-10, 6],
      distance: 40,
      yaw: -Math.PI / 3,
      pitch: 0.35,
      scale: 2,
    },
  ],
});
