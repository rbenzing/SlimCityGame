import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { buildSite } from '../../lib/site.mjs';
import {
  dragPreview,
  closeDrawer,
  endPreview,
  ghostSize,
  hoverPreview,
  pickRoad,
} from '../../lib/views-ui.mjs';

/** Two 3.75 m lanes and two 1.875 m footways. */
const TWO_LANE_M = 11.25;
/** Four 3.6 m lanes, a 1.2 m median, two footways and their kerbs: still inside the 20 m tile. */
const AVENUE_M = 19.95;
const TILE_M = 20;
const GROUND = { w: 18, d: 14 };
/** The drag along a row, in tiles from the ground's west edge. */
const FROM = 5;
const TO = 8;
/** The drag through the water tower, which stands on the ground's fifth column. */
const THROUGH = [3, 6];
const TOLERANCE_M = 0.01;
/** Rows north of the street the open-ground drags and the dead ends stand on. */
const OPEN_ROW = 6;

const column = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => ({ x, z: z0 + i }));

async function scene(session, { tile, catalogBox }) {
  const site = await buildSite(
    session,
    [catalogBox({ id: 'ground', plot: { ...GROUND, h: 1 } })],
    tile,
  );
  const ground = site.subjects[0];
  const road = site.road;
  // Two dead-end streets north of the main one: the first has clear ground beyond its end, the
  // second a water tower standing where its turning circle would go.
  const clear = { x: ground.x + 14, end: road - OPEN_ROW };
  const blocked = { x: ground.x + 4, end: road - OPEN_ROW };
  for (const s of [clear, blocked])
    await session.send('Dead end', [
      { kind: 'buildRoad', tier: 1, tiles: column(s.x, s.end, road - 1) },
    ]);
  const tower = { x: blocked.x, z: blocked.end - 1 };
  await session.send('Water tower', [
    { kind: 'placeBuilding', catalogId: 'water-tower', ...tower, rotation: 0 },
  ]);
  await settle(session.page, {
    until: ([x, z]) =>
      window.__slimcity
        .readBuildings()
        .some((b) => b.catalogId === 'water-tower' && b.x === x && b.z === z),
    arg: [tower.x, tower.z],
  });
  return { road, ground, clear, blocked, tower };
}

/** Tiles the camera looks south of the drag, so the row stands in the upper part of the window,
 * clear of the drawer a road tool opens over the lower part. */
const DROP = 1.7;

/** A camera looking down on row `z` of the drag, from `distance` metres. */
const over = (s, z, [from, to] = [FROM, TO], distance = 110) => ({
  tx: s.ground.x + (from + to) / 2,
  tz: z + DROP,
  distance,
  yaw: 0,
  pitch: 1.0,
});

/** Drag the tool in hand along row `z` of the ground, from tile `from` to `to`. */
const dragAlong = ({ page }, s, z, [from, to] = [FROM, TO]) =>
  dragPreview(page, { x: s.ground.x + from, z }, { x: s.ground.x + to, z });

const lanes = async (page, n) => {
  await page.getByRole('group', { name: 'Lanes' }).getByText(String(n), { exact: true }).click();
  await settle(page);
};

const near = (a, b) => Math.abs(a - b) <= TOLERANCE_M;
const after = ({ page }) => endPreview(page);
/** A row of open ground, clear of the street's dead ends and of the tower. */
const openRow = (s) => s.road - OPEN_ROW - 4;

export default defineSeries({
  name: 'ghosts',
  type: 'views',
  purpose:
    'The placement preview says what a click would do before it is done: a road is drawn at its real width (and over the street it replaces, and over open ground in its parts), a refused placement is red, a cul-de-sac shows its turning circle or why it cannot be built, and a shore plant shows it will not stand on dry land.',
  budgetS: 60,
  subjects: [
    { id: 'road-width' },
    { id: 'road-parts' },
    { id: 'refused' },
    { id: 'culdesac' },
    { id: 'plant' },
  ],
  scene,
  frames: [
    {
      subject: 'road-width',
      view: 'same',
      full: true,
      shows: 'a two-lane ghost over the two-lane street it already is: its own width, not the tile',
      camera: (s) => over(s, s.road),
      setup: async (session, s) => {
        await pickRoad(session.page, 'Small', 'Two-Lane Road');
        await dragAlong(session, s, s.road);
      },
      check: async ({ page }) => {
        const { across } = await ghostSize(page);
        if (!near(across, TWO_LANE_M))
          throw new Error(`a two-lane ghost measures ${across.toFixed(2)} m, not ${TWO_LANE_M}`);
      },
      after,
    },
    {
      subject: 'road-width',
      view: 'replace',
      full: true,
      shows:
        'an avenue ghost over the two-lane street: visibly wider than the road it will replace',
      camera: (s) => over(s, s.road),
      setup: async (session, s) => {
        await pickRoad(session.page, 'Medium', 'Avenue');
        await dragAlong(session, s, s.road);
      },
      check: async ({ page }) => {
        const { across } = await ghostSize(page);
        if (!near(across, AVENUE_M) || across > TILE_M)
          throw new Error(`an avenue ghost measures ${across.toFixed(2)} m, not ${AVENUE_M}`);
      },
      after,
    },
    {
      subject: 'road-width',
      view: 'corridor',
      full: true,
      shows:
        'a six-lane ghost over the street: both rows of tiles it will take, one carriageway each',
      camera: (s) => over(s, s.road + 0.5),
      setup: async (session, s) => {
        await pickRoad(session.page, 'Medium', 'Avenue');
        await lanes(session.page, 6);
        await dragAlong(session, s, s.road);
      },
      check: async ({ page }) => {
        const { across } = await ghostSize(page);
        if (across <= TILE_M)
          throw new Error(
            `a corridor ghost spans ${across.toFixed(2)} m: the second row is missing`,
          );
      },
      after,
    },
    {
      subject: 'road-parts',
      view: 'corridor',
      full: true,
      shows:
        'the six-lane ghost over open ground: carriageways, footways and the median between, not a slab',
      camera: (s) => over(s, openRow(s) + 0.5),
      setup: (session, s) => dragAlong(session, s, openRow(s)),
      after,
    },
    {
      subject: 'road-parts',
      view: 'highway',
      full: true,
      shows: 'the highway ghost over open ground: one carriageway with shoulders',
      camera: (s) => over(s, openRow(s) + 0.5),
      setup: async (session, s) => {
        await pickRoad(session.page, 'Highway', 'Highway');
        await dragAlong(session, s, openRow(s));
      },
      after,
    },
    {
      subject: 'road-parts',
      view: 'avenue',
      full: true,
      shows: 'the four-lane avenue ghost over open ground: a median between two carriageways',
      camera: (s) => over(s, openRow(s)),
      setup: async (session, s) => {
        await pickRoad(session.page, 'Medium', 'Avenue');
        await lanes(session.page, 4);
        await dragAlong(session, s, openRow(s));
      },
      after,
    },
    {
      subject: 'refused',
      view: 'building',
      full: true,
      shows: 'a street dragged through a water tower: the preview is red, nothing is laid',
      camera: (s) => over(s, s.tower.z, THROUGH),
      setup: async (session, s) => {
        await pickRoad(session.page, 'Small', 'Two-Lane Road');
        await dragAlong(session, s, s.tower.z, THROUGH);
      },
      after,
    },
    {
      subject: 'culdesac',
      view: 'ghost',
      full: true,
      shows:
        'the cul-de-sac tool over a dead end with clear ground: the turning circle it would lay',
      camera: (s) => ({ tx: s.clear.x, tz: s.clear.end - 1, distance: 60, yaw: 0, pitch: 1.0 }),
      setup: async ({ page }, s) => {
        await closeDrawer(page);
        await page.evaluate(() => window.__slimcity.setTool('culdesac'));
        await hoverPreview(page, { x: s.clear.x, z: s.clear.end }, [0.7, 0.3]);
      },
    },
    {
      subject: 'culdesac',
      view: 'refused',
      full: true,
      shows:
        'the cul-de-sac tool over a dead end with a building where the circle would go: red, with its reason',
      camera: (s) => ({ tx: s.blocked.x, tz: s.blocked.end - 1, distance: 60, yaw: 0, pitch: 1.0 }),
      setup: async ({ page }, s) => {
        await hoverPreview(page, { x: s.blocked.x, z: s.blocked.end }, [0.7, 0.3]);
      },
    },
    {
      subject: 'plant',
      view: 'dry',
      full: true,
      shows: 'a pumping station over dry land: red, as it needs water beside it',
      camera: (s) => ({
        tx: s.ground.x + GROUND.w / 2,
        tz: s.road - 9,
        distance: 70,
        yaw: 0,
        pitch: 1.0,
      }),
      setup: async ({ page }, s) => {
        await closeDrawer(page);
        await page.evaluate(() => window.__slimcity.setTool('plop.water-pump'));
        await hoverPreview(page, { x: s.ground.x + GROUND.w / 2, z: s.road - 9 });
      },
      after: ({ page }) => page.evaluate(() => window.__slimcity.setTool('select')),
    },
  ],
});
