import { civicSite } from '../../lib/civic.mjs';
import { defineSeries } from '../../lib/series.mjs';
import { settle } from '../../lib/session.mjs';
import { buildSite } from '../../lib/site.mjs';
import {
  chipClearProblems,
  chooseLens,
  clipOf,
  controlProblems,
  dock,
  dockButton,
  expectNone,
  getView,
  hudProblems,
  infoviews,
  isUnderground,
  lensButton,
  markServicesPanel,
  panelProblems,
  pickWaterPipe,
  plain,
  press,
  viewChip,
} from '../../lib/views-ui.mjs';

/** The Health lens (src/shared/types.ts FieldId.Health): a service lens, which opens the Services panel. */
const HEALTH_LENS = 7;
const WIDTHS = [480, 360];
const NARROW_HEIGHT = 600;
const CLICK_MS = 15000;

const SERVICES = ['school', 'clinic', 'police-station', 'fire-station'];

async function scene(session, { tile, catalogBox }) {
  const site = await buildSite(
    session,
    SERVICES.map((id) => catalogBox({ id })),
    tile,
    civicSite,
  );
  const mid = site.subjects[Math.floor(SERVICES.length / 2)];
  return { site, mid };
}

/** The row of services, from the street. */
const overRow = (s) => ({ tx: s.mid.cx, tz: s.mid.cz + 1, distance: 260, yaw: 0, pitch: 0.75 });

const must = (ok, what) => {
  if (!ok) throw new Error(what);
};
const holds = async (check, what) => must(await check(), what);

const exitView = ({ page }) =>
  page.getByRole('button', { name: 'Exit view' }).click({ timeout: CLICK_MS });
const chipSays = (page, text) => viewChip(page).filter({ hasText: text }).isVisible();
const healthLens = async (page) => {
  await page.evaluate((f) => window.__slimcity.setOverlay(f), HEALTH_LENS);
  await settle(page, {
    until: () => !!document.querySelector('[data-testid="service-load-police"]'),
  });
};
const healthSlider = (page) => page.getByRole('slider', { name: /Health funding/i });

/** The frames of the services panel at the window's own size: its gauges and its sliders. */
const servicesFrames = [
  {
    subject: 'services',
    view: 'health',
    full: true,
    shows:
      'the Services panel over the facilities under the Health lens: a funding slider, a load and a worst figure on every row',
    camera: overRow,
    setup: async ({ page }) => healthLens(page),
    check: async ({ page }) =>
      expectNone(await panelProblems(page, 'Services panel', await markServicesPanel(page))),
  },
  {
    subject: 'services',
    view: 'panel',
    full: true,
    shows: 'the panel alone at its own size: every column readable, no row wrapped or squeezed',
    clip: async ({ page }) => clipOf(page, await markServicesPanel(page)),
  },
  {
    subject: 'services',
    view: 'funding',
    full: true,
    shows:
      'the Health slider at the end of its track: the multiplier beside it reads the new funding',
    setup: async (session, s) => {
      const { page } = session;
      const readout = page.locator('[data-testid="service-funding-health"]');
      s.funding = Number((await readout.textContent()).replace('×', ''));
      await healthSlider(page).focus();
      await page.keyboard.press('Home');
      await settle(page, {
        until: (was) => {
          const el = document.querySelector('[data-testid="service-funding-health"]');
          return Number(el.textContent.replace('×', '')) !== was;
        },
        arg: s.funding,
      });
    },
    clip: async ({ page }) => clipOf(page, await markServicesPanel(page)),
    after: async ({ page, send }, s) => {
      await send('Restore', [{ kind: 'setServiceFunding', service: 'health', funding: s.funding }]);
      await page.evaluate(() => window.__slimcity.setOverlay(null));
      await plain(page);
    },
  },
];

/** Each way into a view shows a chip that says so, and each way out ends in the plain view. */
const exitFrames = [
  {
    subject: 'exit',
    view: 'lens',
    full: true,
    shows:
      'the Pollution lens: the chip names it and says Esc leaves, the Infoviews button reads on',
    camera: overRow,
    setup: async ({ page }) => chooseLens(page, 'Pollution'),
    check: async ({ page }) => {
      await holds(() => chipSays(page, 'Pollution lens'), 'no "Pollution lens" chip');
      must(
        (await dockButton(page, 'Infoviews').getAttribute('aria-pressed')) === 'true',
        'the Infoviews button does not read as on under a lens',
      );
    },
    after: async ({ page }) => {
      await press(page, 'Escape');
      must((await getView(page)).overlay === null, 'Escape did not clear the lens');
      must((await viewChip(page).count()) === 0, 'the chip stayed after the lens went');
    },
  },
  {
    subject: 'exit',
    view: 'underground',
    full: true,
    shows: 'the pipe tool in hand with the city underground: the chip says Underground view',
    setup: async ({ page }) => {
      await pickWaterPipe(page);
      await press(page, 'Escape');
    },
    check: async ({ page }) => {
      must((await getView(page)).tool === 'water.pipe', 'Escape on the drawer dropped the tool');
      must(await isUnderground(page), 'the pipe tool did not take the city underground');
      await holds(() => chipSays(page, 'Underground view'), 'no "Underground view" chip');
    },
    after: async ({ page }) => {
      await press(page, 'Escape');
      must((await getView(page)).tool === 'select', 'Escape did not drop the pipe tool');
      must(!(await isUnderground(page)), 'the city stayed underground after the tool went');
    },
  },
  {
    subject: 'exit',
    view: 'water',
    full: true,
    shows: 'the Water lens with the pipe tool: one chip for both, the Exit button clears both',
    setup: async ({ page }) => {
      await chooseLens(page, 'Water');
      await pickWaterPipe(page);
      await press(page, 'Escape');
    },
    check: async ({ page }) => {
      const v = await getView(page);
      must(
        v.overlay === 'watered' && v.tool === 'water.pipe',
        `setup wrong (${JSON.stringify(v)})`,
      );
      await holds(
        () => chipSays(page, 'Water lens · underground'),
        'no "Water lens · underground" chip',
      );
    },
    after: async (session) => {
      await exitView(session);
      await settle(session.page);
      const v = await getView(session.page);
      must(v.overlay === null && v.tool === 'select', `Exit left ${JSON.stringify(v)}`);
      must(!(await isUnderground(session.page)), 'the city stayed underground after Exit');
      must((await viewChip(session.page).count()) === 0, 'the chip stayed after Exit');
    },
  },
  {
    subject: 'exit',
    view: 'narrow',
    full: true,
    viewport: { width: 768, height: 800 },
    shows:
      'the same chip at 768 px wide: clear of the dock, the status strip and the corner buttons',
    camera: overRow,
    setup: async ({ page }) => {
      await chooseLens(page, 'Sewer');
      await pickWaterPipe(page);
      await press(page, 'Escape');
    },
    check: async ({ page }) => expectNone(await chipClearProblems(page)),
    after: async (session) => {
      await exitView(session);
      await plain(session.page);
    },
  },
];

/** The HUD at one narrow width: every control reachable, each panel inside the window. */
const narrowFrames = (width) => {
  const subject = `narrow-${width}`;
  const viewport = { width, height: NARROW_HEIGHT };
  return [
    {
      subject,
      view: 'plain',
      full: true,
      viewport,
      shows: `the plain HUD at ${width} px: dock, status strip and corner buttons reachable and at least 24 px`,
      camera: overRow,
      check: async ({ page }) => expectNone(await hudProblems(page)),
    },
    {
      subject,
      view: 'stats',
      full: true,
      viewport,
      shows: `the City Stats panel at ${width} px, inside the window and clear of the dock`,
      setup: async ({ page }) => {
        await page
          .getByRole('button', { name: 'City stats', exact: true })
          .click({ timeout: CLICK_MS });
        await settle(page);
      },
      check: async ({ page }) =>
        expectNone([
          ...(await panelProblems(page, 'City Stats panel', '[aria-label="Chart axes"]')),
          ...(await controlProblems(
            'City Stats close',
            page.getByRole('button', { name: 'Close stats' }),
          )),
        ]),
      after: async ({ page }) => {
        await page.getByRole('button', { name: 'Close stats' }).click({ timeout: CLICK_MS });
        await settle(page);
      },
    },
    {
      subject,
      view: 'lens',
      full: true,
      viewport,
      shows: `the lens picker open over a lens at ${width} px, with its legend and the chip's Exit button`,
      setup: async ({ page }) => {
        await dock(page, 'Infoviews');
        await lensButton(page, 'Pollution').click({ timeout: CLICK_MS });
        await settle(page);
      },
      check: async ({ page }) =>
        expectNone([
          ...(await panelProblems(page, 'lens picker', '[role="menu"][aria-label="Infoviews"]')),
          ...(await controlProblems('lens Pollution', lensButton(page, 'Pollution'))),
          ...(await panelProblems(page, 'legend', '[aria-label="Legend"]')),
          ...(await controlProblems('Exit view', page.getByRole('button', { name: 'Exit view' }))),
        ]),
      after: async ({ page }) => {
        await dock(page, 'Infoviews');
        must(!(await infoviews(page).isVisible()), 'the picker did not shut');
        expectNone(await panelProblems(page, 'legend (picker shut)', '[aria-label="Legend"]'));
        await plain(page);
      },
    },
    {
      subject,
      view: 'services',
      full: true,
      viewport,
      shows: `the Services panel under the Health lens at ${width} px, inside the window and clear of the dock`,
      setup: async ({ page }) => healthLens(page),
      check: async ({ page }) =>
        expectNone([
          ...(await panelProblems(page, 'legend (Health lens)', '[aria-label="Legend"]')),
          ...(await panelProblems(page, 'Services panel', await markServicesPanel(page))),
        ]),
      after: async ({ page }) => {
        await page.evaluate(() => window.__slimcity.setOverlay(null));
        await plain(page);
      },
    },
  ];
};

export default defineSeries({
  name: 'panels',
  type: 'views',
  purpose:
    'The HUD stays usable and says where the player is: the Services panel reads at its own size, every view shows a chip with its way out, and from 360 px wide every control is reachable and every panel inside the window.',
  budgetS: 60,
  subjects: [{ id: 'services' }, { id: 'exit' }, ...WIDTHS.map((w) => ({ id: `narrow-${w}` }))],
  scene,
  frames: [...servicesFrames, ...exitFrames, ...WIDTHS.flatMap(narrowFrames)],
});
