import { defineSeries } from '../../lib/series.mjs';
import { playthrough } from '../../lib/playthrough.mjs';

/** The steps of a first game that are photographed (the rest run in tools/probes/playthrough.mjs). */
const FRAMES = [
  'start',
  'two-lane-road',
  'gravel-road',
  'wind-turbine',
  'water-tower',
  'zone-homes',
  'zone-shops-industry',
  'grown',
  'power-lens',
  'substation',
  'power-line',
  'grown-on-the-line',
  'building-info',
  'junction-panel',
  'lens-land-value',
  'lens-water',
  'panel-city-stats',
  'milestones',
  'speed',
  'save',
  'load-browser',
  'loaded',
];

export default defineSeries({
  name: 'firstgame',
  type: 'town',
  purpose:
    'A new game played through the real controls (dock, drawer cards, pointer drags, clicks) reads at every step: the road, power and water, the zones, homes growing, a lens, the panels, a save and its load, with the HUD as a player sees it.',
  budgetS: 300,
  session: { fresh: true, seed: 12345 },
  subjects: FRAMES.map((id) => ({ id, views: ['full'], night: false })),
  play: async (session, { capture }) => {
    const failed = [];
    const check = (name, ok, detail = '') => {
      console.log(ok ? 'PASS' : 'FAIL', name, detail);
      if (!ok) failed.push(`${name} ${detail}`);
    };
    const taken = [];
    const { play } = await playthrough(session.page, {
      check,
      frame: async (name) => {
        await capture(`${name}-full`);
        taken.push(name);
      },
    });
    await play(true);
    if (failed.length > 0)
      throw new Error(`the first game did not go as clicked: ${failed.join('; ')}`);
    const missing = FRAMES.filter((f) => !taken.includes(f));
    if (missing.length > 0) throw new Error(`steps took no frame: ${missing.join(', ')}`);
    return FRAMES.map((id) => id);
  },
});
