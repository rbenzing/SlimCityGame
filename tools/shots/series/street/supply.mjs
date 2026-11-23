import { defineSeries } from '../../lib/series.mjs';
import { TIER } from '../../lib/roads.mjs';
import { FRONTS_NORTH, FRONTS_SOUTH, GENERATOR, SUBSTATION, supply } from '../../lib/street.mjs';

/** Grid byte of a buried cable (src/shared/types.ts PowerLineKind). */
const CABLE = 3;
/** A strung line's pole stands this tall, in metres (src/render/powerpoles.ts), the tallest thing in view. */
const POLE_M = 21;

/** The commands that string `tiles` (or bury them, with `lineKind`). */
const string = (tiles, lineKind) => ({
  kind: 'stringPowerLine',
  tiles,
  on: true,
  ...(lineKind ? { lineKind } : {}),
});

/** A powered street of `tier` along row `ROW`, with a street down column `CROSS` crossing it. */
const ROW = 6;
const CROSS = 6;
const crossing = (id, tier) => ({
  id,
  pad: { w: 13, h: 13 },
  view: { x0: 0, z0: 0, length: 13, width: 13, height: 12 },
  close: { x0: CROSS - 3, z0: CROSS - 2, length: 7, width: 5 },
  lay: (p) => [
    p.road(tier, p.row(ROW, 0, 12)),
    p.road(TIER.twoLane, p.col(CROSS, 0, 12)),
    supply(p, 10, ROW),
  ],
});

/** A street of 14 tiles along row 4 with the generator on its north kerb at `at`, and `then` laid beside it. */
const LENGTH = 14;
const SROW = 4;
const beside = (id, at, then, extra = {}) => ({
  id,
  pad: { w: LENGTH + 4, h: 11 },
  view: { x0: 0, z0: 0, length: LENGTH + 4, width: 11, height: POLE_M },
  ...extra,
  lay: (p) => [p.road(TIER.twoLane, p.row(SROW, 0, LENGTH - 1)), supply(p, at, SROW), ...then(p)],
});

export default defineSeries({
  name: 'supply',
  type: 'street',
  purpose:
    'Power reaches a street as it does in life: a supplied street carries its own pole line behind the kerb and lights, an unsupplied one stands dark, a strung line crosses open ground on poles to a lot no street reaches, a buried cable shows only its risers and boxes, and a line leaves a substation.',
  budgetS: 60,
  subjects: [
    // Shot at night: the avenue's lights hang on its power poles.
    crossing('avenue-poles', TIER.avenue),
    crossing('street-poles', TIER.twoLane),
    {
      id: 'street-unsupplied',
      pad: { w: 12, h: 9 },
      view: { x0: 0, z0: 0, length: 12, width: 9, height: 12 },
      close: { x0: 3, z0: 3, length: 6, width: 3, height: 12 },
      lay: (p) => [p.road(TIER.twoLane, p.row(4, 0, 11))],
    },
    {
      // A generator on a street of its own, a line over open ground, and a road far off that nothing joins.
      id: 'strung-line',
      pad: { w: 24, h: 9 },
      view: { x0: 0, z0: 0, length: 24, width: 9, height: POLE_M },
      close: { x0: 5, z0: 0, length: 14, width: 7, height: POLE_M },
      lay: (p) => [
        p.road(TIER.twoLane, p.row(5, 0, 4)),
        p.building(GENERATOR, 1, 3, FRONTS_SOUTH),
        p.road(TIER.twoLane, p.row(3, 18, 23)),
        string(p.row(3, 3, 18)),
      ],
    },
    {
      // A gravel road carries no cable: the line runs down the lane itself.
      id: 'gravel-line',
      pad: { w: 16, h: 9 },
      view: { x0: 0, z0: 0, length: 16, width: 9, height: POLE_M },
      close: { x0: 5, z0: 2, length: 10, width: 5, height: POLE_M },
      lay: (p) => [
        p.road(TIER.twoLane, p.row(2, 0, 4)),
        p.building(GENERATOR, 0, 0, FRONTS_SOUTH),
        p.road(TIER.gravel, p.row(6, 5, 15)),
        string([...p.row(1, 2, 5), ...p.col(5, 2, 6), ...p.row(6, 6, 15)]),
      ],
    },
    beside('buried-street', 10, (p) => [string(p.row(SROW, 3, 8), CABLE)], {
      close: { x0: 1, z0: SROW - 1, length: 9, width: 3, height: POLE_M },
    }),
    {
      // A cable from a substation over open ground into a gravel lane.
      id: 'cable-lane',
      pad: { w: 16, h: 11 },
      view: { x0: 0, z0: 0, length: 16, width: 11, height: 8 },
      close: { x0: 6, z0: 2, length: 9, width: 8, height: 8 },
      lay: (p) => [
        p.road(TIER.twoLane, p.row(2, 0, 11)),
        supply(p, 0, 2),
        p.building(SUBSTATION, 8, 3, FRONTS_NORTH),
        p.road(TIER.gravel, p.col(14, 4, 9)),
        string([...p.row(4, 10, 14), ...p.col(14, 5, 9)], CABLE),
      ],
    },
    {
      // A substation on the street's kerb, its front to the street, and a line leaving it over open ground.
      id: 'substation-line',
      pad: { w: 18, h: 9 },
      view: { x0: 0, z0: 0, length: 18, width: 9, height: POLE_M },
      close: { x0: 3, z0: 1, length: 12, width: 6, height: POLE_M },
      lay: (p) => [
        p.road(TIER.twoLane, p.row(SROW, 0, 12)),
        supply(p, 0, SROW),
        p.building(SUBSTATION, 5, SROW - 2, FRONTS_SOUTH),
        string(p.row(SROW - 2, 7, 17)),
      ],
    },
  ],
  details: [
    {
      subject: 'buried-street',
      name: 'riser',
      shows:
        'the riser pole where the overhead line goes underground, its guard and the pad transformer, at pedestrian scale',
      local: [-110, -12],
      distance: 40,
      yaw: 0.9,
      pitch: 0.4,
      scale: 2,
    },
    {
      subject: 'substation-line',
      name: 'yard',
      shows:
        'the substation yard and the pole its line leaves from, from the street at pedestrian scale',
      local: [-20, -20],
      distance: 40,
      yaw: 0.6,
      pitch: 0.4,
      scale: 2,
    },
  ],
});
