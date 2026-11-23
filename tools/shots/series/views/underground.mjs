import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { buildSite } from '../../lib/site.mjs';

/** The kinds of power line (src/shared/types.ts PowerLineKind): the buried cable. */
const CABLE = 3;
/** Rows of the cross street, north of the street. */
const CROSS_ROWS = 4;
const ROW = [
  ['pump', 'water-pump'],
  ['home-a', 'res-low-1'],
  ['home-b', 'res-low-1'],
  ['flats', 'res-high-1-lot2x2'],
  ['shop', 'com-strip-1'],
  ['home-c', 'res-low-1'],
  ['drain', 'water-drain'],
  ['turbine', 'wind-turbine'],
];

const run = (x0, x1, z) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, z }));
const column = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));
const at = (site, as) => site.subjects.find((s) => s.name === as);

/** Put the player's tool in hand, and wait until the city is (or is not) underground. */
const takeTool = async ({ page }, tool, underground) => {
  await page.evaluate((t) => window.__slimcity.setTool(t), tool);
  await settle(page, {
    until: ([want]) => window.__slimcity.readUnderground().active === want,
    arg: [underground],
  });
};

async function scene(session, { tile, catalogBox }) {
  const boxes = ROW.map(([as, id]) => catalogBox({ id, as }));
  let cross = null;
  const site = await buildSite(session, boxes, tile, {
    ...civicSite,
    prepare: async (s, planned) => {
      await civicSite.prepare(s, planned);
      // A cross street in the first tile past the first home, so a pipe branches under it.
      const home = at(planned, 'home-a');
      cross = { x: home.x + home.w, z0: planned.roads[0] - CROSS_ROWS - 1 };
      await s.send('Cross street', [
        { kind: 'buildRoad', tier: 1, tiles: column(cross.x, cross.z0, planned.roads[0] - 1) },
      ]);
    },
  });
  const road = site.road;
  const pump = at(site, 'pump');
  const turbine = at(site, 'turbine');
  const first = pump.x;
  const last = turbine.x;
  // Water pipe under the whole street, a branch under the cross street and the drain's stub.
  const pipe = (label, tiles) => session.send(label, [{ kind: 'layWaterPipe', tiles, on: true }]);
  await pipe('Main', run(first, last, road));
  await pipe('Branch', column(cross.x, cross.z0, road - 1));
  // The buried cable: the street's own supply along its middle above the pipes, and a cable from
  // the turbine north over open ground.
  const flats = at(site, 'flats');
  await session.send('Buried street supply', [
    { kind: 'stringPowerLine', tiles: run(flats.x, last, road), on: true, lineKind: CABLE },
  ]);
  await session.send('Cable over open ground', [
    {
      kind: 'stringPowerLine',
      tiles: column(last, turbine.z - 6, turbine.z - 1),
      on: true,
      lineKind: CABLE,
    },
  ]);
  await settle(session.page);
  // Cars on the street for scale.
  await session.page.evaluate(
    ([t, x0, z, xs]) =>
      window.__slimcity.setVehicles(
        xs.map((dx, i) => ({
          x: (x0 + dx) * t,
          z: (z + (i % 2 ? 0.35 : 0.65)) * t,
          heading: i % 2 ? -Math.PI / 2 : Math.PI / 2,
          kind: 0,
        })),
      ),
    [tile, first, road, [3, 8, 14, 20]],
  );
  return {
    site,
    road,
    cross,
    pump,
    flats,
    shop: at(site, 'shop'),
    turbine,
    mid: at(site, 'home-b'),
  };
}

const street = (s, distance = 150) => ({
  tx: s.mid.cx,
  tz: s.road,
  distance,
  yaw: 0,
  pitch: 0.9,
});

export default defineSeries({
  name: 'underground',
  type: 'views',
  purpose:
    'The city goes underground when a pipe or cable tool is in hand: water pipe, mains, leads to each front wall and buried cable with its boxes and risers are drawn under the street, and on the surface none of it shows.',
  budgetS: 40,
  subjects: [{ id: 'pipes' }, { id: 'leads' }, { id: 'cable' }],
  scene,
  frames: [
    {
      subject: 'pipes',
      view: 'surface',
      shows: 'the plain view of the street with the pipes laid: no pipe may show',
      setup: async (session) => takeTool(session, 'select', false),
      check: async ({ page }) => {
        const u = await page.evaluate(() => window.__slimcity.readUnderground());
        if (u.active || u.pipesVisible) throw new Error('the surface frame is not the plain view');
      },
      camera: (s) => street(s),
    },
    {
      subject: 'pipes',
      view: 'view',
      shows:
        'the view the pipe tool gives: mains under the street and its branch, the pump and drain stubs',
      setup: async (session) => takeTool(session, 'water.pipe', true),
      check: async ({ page }) => {
        const u = await page.evaluate(() => window.__slimcity.readUnderground());
        const t = u.triangles;
        if (!u.pipesVisible || t.water + t.sewer + t.mainWater + t.mainSewer === 0)
          throw new Error('the pipe tool drew no pipe underground');
      },
      camera: (s) => street(s),
    },
    {
      subject: 'pipes',
      view: 'close',
      shows: 'a pipe junction under the street where the cross street branches, from 40 m',
      camera: (s) => ({ tx: s.cross.x, tz: s.road, distance: 40, yaw: 0, pitch: 1.0 }),
    },
    {
      subject: 'pipes',
      view: 'pump',
      shows: 'the pumping station at the west end of the main, where the water enters the pipe',
      camera: (s) => ({ tx: s.pump.cx, tz: s.road, distance: 55, yaw: 0, pitch: 0.9 }),
    },
    {
      subject: 'pipes',
      view: 'full',
      full: true,
      shows: 'the page as the player sees the pipe tool: chip, drawer and the underground city',
      setup: async (session) => takeTool(session, 'water.pipe', true),
      camera: (s) => street(s, 110),
    },
    {
      subject: 'leads',
      view: 'view',
      shows:
        'each building of a row has its lead running on to its own front wall, not a stub and not under the building',
      camera: (s) => ({ tx: s.flats.cx + 1, tz: s.road, distance: 60, yaw: 0, pitch: 0.8 }),
    },
    {
      subject: 'cable',
      view: 'surface',
      shows: 'the buried supply on the surface: nothing of it shows but its boxes',
      setup: async (session) => takeTool(session, 'select', false),
      check: async ({ page }) => {
        const c = await page.evaluate(() => window.__slimcity.readPowerCables());
        if (c.overlay.visible) throw new Error('the cable overlay shows on the surface');
        if (c.boxes.length < 1) throw new Error('no cable boxes stand on the surface');
      },
      camera: (s) => ({ tx: s.flats.cx + 4, tz: s.road, distance: 60, yaw: 0, pitch: 0.6 }),
    },
    {
      subject: 'cable',
      view: 'street',
      shows:
        'the cable tool underground: the supply along the street above the pipes, boxes and risers marked',
      setup: async (session) => takeTool(session, 'power.cable', true),
      check: async ({ page }) => {
        const c = await page.evaluate(() => window.__slimcity.readPowerCables());
        if (!c.overlay.visible || c.overlay.tiles === 0)
          throw new Error(`the cable overlay is not drawn (${c.overlay.tiles} tiles)`);
        if (c.overlay.feet < 2)
          throw new Error(`feet of boxes and risers not marked (${c.overlay.feet})`);
      },
      camera: (s) => ({ tx: s.flats.cx + 4, tz: s.road, distance: 60, yaw: 0, pitch: 0.9 }),
    },
    {
      subject: 'cable',
      view: 'riser',
      shows: 'a cable riser at the street, close',
      camera: (s) => ({ tx: s.flats.x, tz: s.road, distance: 40, yaw: 0, pitch: 1.0 }),
    },
    {
      subject: 'cable',
      view: 'open',
      shows: 'the cable running from the turbine across open ground',
      camera: (s) => ({
        tx: s.turbine.x,
        tz: s.turbine.z - 3,
        distance: 55,
        yaw: 0,
        pitch: 1.0,
      }),
    },
    {
      subject: 'cable',
      view: 'full',
      full: true,
      shows: 'the page as the player sees the cable tool in hand',
      camera: (s) => ({ tx: s.flats.cx + 4, tz: s.road, distance: 90, yaw: 0, pitch: 0.8 }),
    },
  ],
});
