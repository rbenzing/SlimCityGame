import { describe, expect, it } from 'vitest';
import { BRIDGE_MAX_GRADE } from './constants';
import {
  RAMP_REACH_TILES,
  interchangeDeck,
  interchangeLayout,
  interchangeRefusal,
  readInterchangeSite,
  type InterchangeForm,
  type InterchangeGround,
  type InterchangeSite,
} from './interchange';
import { RoadFlow, RoadTier } from './types';
import type { TilePoint } from './types';

const SB = 40;
const NB = 41;
const ROW = 50;
const key = (t: TilePoint): string => `${t.x},${t.z}`;

/** A grid holding motorway carriageways down the given columns, and anything else asked for. */
function groundWith(
  columns: Array<[number, RoadFlow]>,
  extra: {
    roads?: TilePoint[];
    blocked?: TilePoint[];
    masks?: Map<string, number>;
    heightAt?: (x: number, z: number) => number;
  } = {},
): InterchangeGround {
  const flows = new Map<string, RoadFlow>();
  for (const [x, flow] of columns) for (let z = 0; z < 100; z++) flows.set(key({ x, z }), flow);
  const roads = new Set((extra.roads ?? []).map(key));
  const blocked = new Set((extra.blocked ?? []).map(key));
  return {
    motorwayFlowAt: (x, z) => flows.get(`${x},${z}`) ?? RoadFlow.None,
    maskAt: (x, z) => extra.masks?.get(`${x},${z}`) ?? (flows.has(`${x},${z}`) ? 0b0101 : 0),
    roadAt: (x, z) => flows.has(`${x},${z}`) || roads.has(`${x},${z}`),
    overRoadAt: () => false,
    buildableAt: (x, z) => !blocked.has(`${x},${z}`),
    heightAt: extra.heightAt ?? (() => 0),
  };
}
const dual = (): InterchangeGround =>
  groundWith([
    [SB, RoadFlow.South],
    [NB, RoadFlow.North],
  ]);
const siteOf = (ground: InterchangeGround): InterchangeSite => {
  const site = readInterchangeSite({ x: SB, z: ROW }, ground);
  if ('refusal' in site) throw new Error(site.refusal);
  return site;
};

describe('where an interchange may go', () => {
  it('reads a pair of carriageways with their outer sides outward', () => {
    const site = siteOf(dual());
    expect(site.vertical).toBe(true);
    expect(site.carriageways.map((c) => c.flow)).toEqual([RoadFlow.South, RoadFlow.North]);
  });

  it('reads a single carriageway', () => {
    const site = siteOf(groundWith([[SB, RoadFlow.South]]));
    expect(site.carriageways).toHaveLength(1);
  });

  it('refuses a tile that is not a motorway', () => {
    expect(readInterchangeSite({ x: 10, z: ROW }, dual())).toEqual({
      refusal: 'An interchange goes on a motorway',
    });
  });

  it('refuses carriageways running on each other’s left', () => {
    const swapped = groundWith([
      [SB, RoadFlow.North],
      [NB, RoadFlow.South],
    ]);
    expect(readInterchangeSite({ x: SB, z: ROW }, swapped)).toHaveProperty('refusal');
  });
});

describe('a diamond', () => {
  const layout = interchangeLayout('diamond', siteOf(dual()), RoadTier.TwoLane);

  it('carries the street over at its clearance and brings it down a grade step a tile', () => {
    expect(layout.deck).toBe(interchangeDeck(RoadTier.TwoLane));
    expect(layout.deck).toBe(6);
    expect(layout.street.tiles[0]).toEqual({ x: 35, z: ROW });
    expect(layout.street.tiles[layout.street.tiles.length - 1]).toEqual({ x: 46, z: ROW });
    expect(layout.street.elevations).toEqual([0, 0, 0, 2, 4, 6, 6, 4, 2, 0, 0, 0]);
  });

  it('lays an exit before the bridge and an entrance after it for each carriageway', () => {
    expect(layout.ramps.map((r) => r.exit)).toEqual([true, false, true, false]);
    // The southbound exit leaves beside the carriageway eight tiles north,
    // turns away two short of the street, and meets it on the ground.
    const exit = layout.ramps[0]!.tiles;
    expect(exit[0]).toEqual({ x: SB - 1, z: ROW - RAMP_REACH_TILES });
    expect(exit[exit.length - 1]).toEqual({ x: SB - 3, z: ROW - 1 });
    // The northbound one is the southbound's turned half round.
    const nbExit = layout.ramps[2]!.tiles;
    expect(nbExit[0]).toEqual({ x: NB + 1, z: ROW + RAMP_REACH_TILES });
    expect(nbExit[nbExit.length - 1]).toEqual({ x: NB + 3, z: ROW + 1 });
  });
});

describe.each(['diamond', 'parclo', 'cloverleaf'] as InterchangeForm[])('a %s', (form) => {
  const layout = interchangeLayout(form, siteOf(dual()), RoadTier.TwoLane);
  const streetAt = new Map(
    layout.street.tiles.map((t, i) => [key(t), layout.street.elevations[i]!]),
  );
  const neighbours = (t: TilePoint): TilePoint[] => [
    { x: t.x, z: t.z - 1 },
    { x: t.x + 1, z: t.z },
    { x: t.x, z: t.z + 1 },
    { x: t.x - 1, z: t.z },
  ];

  it('runs every ramp as one line of neighbouring tiles, on no tile twice', () => {
    for (const ramp of layout.ramps) {
      expect(new Set(ramp.tiles.map(key)).size).toBe(ramp.tiles.length);
      for (let i = 1; i < ramp.tiles.length; i++) {
        const a = ramp.tiles[i - 1]!;
        const b = ramp.tiles[i]!;
        expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
      }
    }
  });

  it('keeps every ramp off the motorway, off the street and off every other ramp', () => {
    const owner = new Map<string, number>();
    layout.ramps.forEach((r, i) => r.tiles.forEach((t) => owner.set(key(t), i)));
    expect(owner.size).toBe(layout.ramps.reduce((n, r) => n + r.tiles.length, 0));
    for (const t of owner.keys()) {
      const [x] = t.split(',').map(Number);
      expect(x === SB || x === NB).toBe(false);
      expect(streetAt.has(t)).toBe(false);
    }
    // Two ramps side by side would join each other.
    layout.ramps.forEach((r, i) => {
      for (const t of r.tiles) {
        for (const n of neighbours(t)) {
          const other = owner.get(key(n));
          expect(other === undefined || other === i).toBe(true);
        }
      }
    });
  });

  it('meets the street only at a ramp’s end, where the street is on the ground', () => {
    for (const ramp of layout.ramps) {
      ramp.tiles.forEach((t, i) => {
        const end = ramp.exit ? i === ramp.tiles.length - 1 : i === 0;
        for (const n of neighbours(t)) {
          const lift = streetAt.get(key(n));
          if (lift === undefined) continue;
          // Anywhere else the street is at least two grade steps up, and a
          // deck that far above passes by without meeting it.
          if (end) expect(lift).toBe(0);
          else expect(lift).toBeGreaterThan(BRIDGE_MAX_GRADE);
        }
      });
    }
  });

  it('joins the motorway beside it at an exit’s start and an entrance’s end, running its way', () => {
    for (const ramp of layout.ramps) {
      const node = ramp.exit ? ramp.tiles[0]! : ramp.tiles[ramp.tiles.length - 1]!;
      const beside = node.x === SB - 1 ? SB : node.x === NB + 1 ? NB : null;
      expect(beside).not.toBeNull();
      // Its first or last step runs along the carriageway, the way it flows.
      const [a, b] = ramp.exit ? [ramp.tiles[0]!, ramp.tiles[1]!] : ramp.tiles.slice(-2);
      const flow = beside === SB ? 1 : -1;
      expect(b!.x - a!.x).toBe(0);
      expect(b!.z - a!.z).toBe(flow);
    }
  });

  it('loops only where the form has loops', () => {
    const loops = layout.ramps.filter((r) => r.loop).length;
    expect(loops).toBe({ diamond: 0, parclo: 2, cloverleaf: 4 }[form]);
    expect(layout.ramps).toHaveLength({ diamond: 4, parclo: 6, cloverleaf: 8 }[form]);
  });

  it('may be laid on open ground beside a plain motorway', () => {
    expect(interchangeRefusal(siteOf(dual()), layout, dual())).toBeNull();
  });
});

describe('on uneven ground', () => {
  const columns: Array<[number, RoadFlow]> = [
    [SB, RoadFlow.South],
    [NB, RoadFlow.North],
  ];
  /** Heights above sea level along the street's row, as the deck lays them. */
  const deckOf = (heightAt: (x: number, z: number) => number) => {
    const ground = groundWith(columns, { heightAt });
    const site = siteOf(ground);
    const layout = interchangeLayout('diamond', site, RoadTier.TwoLane, heightAt);
    const y = layout.street.tiles.map((t, i) => heightAt(t.x, t.z) + layout.street.elevations[i]!);
    return { ground, site, layout, y };
  };

  it('keeps the bridge one road down a slope, a grade step a tile, and clears the motorway', () => {
    // The ground falls a metre a tile to the east.
    const { site, layout, y, ground } = deckOf((x) => 60 - x);
    for (let i = 1; i < y.length; i++) {
      expect(Math.abs(y[i]! - y[i - 1]!)).toBeLessThanOrEqual(BRIDGE_MAX_GRADE + 1e-9);
    }
    layout.street.tiles.forEach((t, i) => {
      if (t.x === SB || t.x === NB)
        expect(layout.street.elevations[i]).toBeGreaterThanOrEqual(layout.deck);
    });
    expect(interchangeRefusal(site, layout, ground)).toBeNull();
    // Downhill, to the east, the street takes longer to come down, and the
    // northbound ramps meet it further out than the southbound ones do.
    const westExit = layout.ramps[0]!.tiles.at(-1)!;
    const eastExit = layout.ramps[2]!.tiles.at(-1)!;
    expect(eastExit.x - NB).toBeGreaterThan(SB - westExit.x);
  });

  it('refuses ground falling away so steeply the street cannot come down to its junctions', () => {
    // Four metres a tile down on each side of the motorway.
    const { site, layout, ground } = deckOf((x) => 100 - 4 * Math.abs(x - 40.5));
    expect(interchangeRefusal(site, layout, ground)).toBe(
      'The ground falls away too steeply for the street to come down to its junctions',
    );
  });

  it('refuses ground rising so steeply beside the motorway that the bridge would break', () => {
    const { site, layout, ground } = deckOf((x) => (x < SB - 1 ? 30 : 0));
    expect(interchangeRefusal(site, layout, ground)).toBe(
      'The ground is too steep for the street’s bridge',
    );
  });
});

describe('a single carriageway', () => {
  it('gets the ramps for its own direction, and a street down to the ground on both sides', () => {
    const ground = groundWith([[SB, RoadFlow.South]]);
    const layout = interchangeLayout('diamond', siteOf(ground), RoadTier.TwoLane);
    expect(layout.ramps).toHaveLength(2);
    const lifts = layout.street.elevations;
    expect(lifts[0]).toBe(0);
    expect(lifts[lifts.length - 1]).toBe(0);
    expect(Math.max(...lifts)).toBe(layout.deck);
  });
});

describe('an interchange refused', () => {
  const layout = interchangeLayout('diamond', siteOf(dual()), RoadTier.TwoLane);

  it('where a building, water or steep ground is in the way', () => {
    const ground = groundWith(
      [
        [SB, RoadFlow.South],
        [NB, RoadFlow.North],
      ],
      { blocked: [layout.ramps[1]!.tiles[3]!] },
    );
    expect(interchangeRefusal(siteOf(ground), layout, ground)).toBe(
      'A building, water or steep ground is in the way',
    );
  });

  it('where another road stands on it, or touches a ramp', () => {
    const on = groundWith(
      [
        [SB, RoadFlow.South],
        [NB, RoadFlow.North],
      ],
      { roads: [layout.ramps[0]!.tiles[5]!] },
    );
    expect(interchangeRefusal(siteOf(on), layout, on)).toBe('Another road is in the way');
    const t = layout.ramps[0]!.tiles[layout.ramps[0]!.tiles.length - 2]!;
    const beside = groundWith(
      [
        [SB, RoadFlow.South],
        [NB, RoadFlow.North],
      ],
      { roads: [{ x: t.x - 1, z: t.z }] },
    );
    expect(interchangeRefusal(siteOf(beside), layout, beside)).toBe(
      'Another road touches the interchange where it would join it',
    );
  });

  it('where the motorway already has a junction within the ramps’ reach', () => {
    const masks = new Map([[key({ x: SB, z: ROW + 3 }), 0b0111]]);
    const ground = groundWith(
      [
        [SB, RoadFlow.South],
        [NB, RoadFlow.North],
      ],
      { masks },
    );
    expect(interchangeRefusal(siteOf(ground), layout, ground)).toBe(
      'The motorway already has a ramp, a junction or a bridge there',
    );
  });

  it('where the motorway ends before the ramps’ reach', () => {
    const ground = groundWith([[SB, RoadFlow.South]]);
    const short = readInterchangeSite({ x: SB, z: 4 }, ground);
    if ('refusal' in short) throw new Error(short.refusal);
    const l = interchangeLayout('diamond', short, RoadTier.TwoLane);
    expect(interchangeRefusal(short, l, ground)).toBe(
      `The motorway has to run straight for ${RAMP_REACH_TILES + 1} tiles either side`,
    );
  });

  it('but lets the street’s ends meet a road already there', () => {
    const end = layout.street.tiles[0]!;
    const ground = groundWith(
      [
        [SB, RoadFlow.South],
        [NB, RoadFlow.North],
      ],
      { roads: [{ x: end.x - 1, z: end.z }] },
    );
    expect(interchangeRefusal(siteOf(ground), layout, ground)).toBeNull();
  });
});
