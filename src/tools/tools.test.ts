import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, Command, RoadSpec, TilePoint } from '../shared/types';
import { TERRAFORM_COST_PER_METER_TILE, TILE_METERS } from '../shared/constants';
import {
  brushDiscTiles,
  brushRingTiles,
  DEFAULT_BRUSH_SETTINGS,
  ToolManager,
  type ToolEnv,
  type ToolPreview,
} from './tools';

const ROAD_SPECS: Partial<Record<RoadTier, RoadSpec>> = {
  [RoadTier.TwoLane]: {
    tier: RoadTier.TwoLane,
    name: 'Two-Lane Road',
    costPerTile: 20,
    upkeepPerTile: 0.4,
    speed: 14,
    capacity: 600,
    unlockMilestone: 0,
  },
  [RoadTier.Avenue]: {
    tier: RoadTier.Avenue,
    name: 'Avenue',
    costPerTile: 45,
    upkeepPerTile: 0.9,
    speed: 18,
    capacity: 1600,
    unlockMilestone: 1,
  },
  [RoadTier.Highway]: {
    tier: RoadTier.Highway,
    name: 'Highway',
    costPerTile: 90,
    upkeepPerTile: 1.8,
    speed: 28,
    capacity: 4000,
    unlockMilestone: 3,
  },
  // -- Roads catalog expansion (same numbers as roads.json) --
  [RoadTier.Gravel]: {
    tier: RoadTier.Gravel,
    name: 'Gravel Road',
    costPerTile: 8,
    upkeepPerTile: 0.15,
    speed: 8,
    capacity: 200,
    unlockMilestone: 0,
    noiseMult: 2,
    surface: 'gravel',
  },
  [RoadTier.Alley]: {
    tier: RoadTier.Alley,
    name: 'Alley',
    costPerTile: 14,
    upkeepPerTile: 0.3,
    speed: 10,
    capacity: 350,
    unlockMilestone: 1,
  },
  [RoadTier.OneWay]: {
    tier: RoadTier.OneWay,
    name: 'One-Way Road',
    costPerTile: 24,
    upkeepPerTile: 0.45,
    speed: 16,
    capacity: 1100,
    unlockMilestone: 1,
    oneWay: true,
  },
  [RoadTier.FourLane]: {
    tier: RoadTier.FourLane,
    name: 'Four-Lane Road',
    costPerTile: 32,
    upkeepPerTile: 0.7,
    speed: 17,
    capacity: 1200,
    unlockMilestone: 1,
  },
};

const CATALOG: Record<string, BuildingCatalogEntry> = {
  'long-shed': {
    id: 'long-shed',
    name: 'Long Shed',
    category: 'ind',
    footprint: { w: 3, d: 1 },
    height: 5,
    color: 0x888888,
    powerUse: 0,
    waterUse: 0,
    cost: 500,
    upkeep: 10,
    unlockMilestone: 0,
  },
  'police-station': {
    id: 'police-station',
    name: 'Police Station',
    category: 'service',
    footprint: { w: 2, d: 2 },
    height: 12,
    color: 0x223344,
    powerUse: 0.6,
    waterUse: 0.6,
    service: { kind: 'police', strength: 160, range: 48 },
    cost: 4000,
    upkeep: 300,
    unlockMilestone: 1,
  },
};

function makeEnv(): {
  env: ToolEnv;
  previews: Array<ToolPreview | null>;
  sent: Array<{ label: string; commands: Command[] }>;
} {
  const previews: Array<ToolPreview | null> = [];
  const sent: Array<{ label: string; commands: Command[] }> = [];
  const env: ToolEnv = {
    screenToTile: (sx, sy) => (sx < 0 || sy < 0 ? null : { x: sx, z: sy }),
    send: (label, commands) => {
      sent.push({ label, commands });
    },
    roadSpec: (tier) => {
      const spec = ROAD_SPECS[tier];
      if (!spec) throw new Error(`no fake road spec for tier ${tier}`);
      return spec;
    },
    entry: (catalogId) => CATALOG[catalogId],
    onPreview: (preview) => {
      previews.push(preview);
    },
  };
  return { env, previews, sent };
}

describe('ToolManager defaults', () => {
  it('starts on the select tool', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    expect(tm.tool).toBe('select');
  });
});

describe('road L-path generation', () => {
  it('goes long-axis-first for a horizontal drag', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 0, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ]);
  });

  it('goes long-axis-first for a vertical drag', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(0, 3, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
      { x: 0, z: 3 },
    ]);
  });

  it('takes the longer axis first, then the shorter axis, for a diagonal drag', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 2, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 1 },
      { x: 3, z: 2 },
    ]);
  });

  it('breaks ties between equal-length axes by going X first', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(2, 2, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
      { x: 2, z: 2 },
    ]);
  });

  it('breaks a negative-direction tie by going X first too', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(5, 5, 0);
    tm.pointerMove(3, 3, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 5, z: 5 },
      { x: 4, z: 5 },
      { x: 3, z: 5 },
      { x: 3, z: 4 },
      { x: 3, z: 3 },
    ]);
  });

  it('handles negative-direction drags', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(5, 5, 0);
    tm.pointerMove(2, 5, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 5, z: 5 },
      { x: 4, z: 5 },
      { x: 3, z: 5 },
      { x: 2, z: 5 },
    ]);
  });

  it('collapses to a single tile when start and current coincide', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(4, 4, 0);
    expect(previews.at(-1)?.tiles).toEqual([{ x: 4, z: 4 }]);
  });
});

describe('road preview cost + commit', () => {
  it('prices the preview at tiles.length * costPerTile and commits buildRoad', () => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 0, 0);
    expect(previews.at(-1)?.cost).toBe(4 * 20);
    expect(previews.at(-1)?.valid).toBe(true);
    tm.pointerUp(3, 0, 0);
    expect(sent).toEqual([
      {
        label: 'Two-Lane Road',
        commands: [
          {
            kind: 'buildRoad',
            tier: RoadTier.TwoLane,
            tiles: [
              { x: 0, z: 0 },
              { x: 1, z: 0 },
              { x: 2, z: 0 },
              { x: 3, z: 0 },
            ],
          },
        ],
      },
    ]);
    expect(previews.at(-1)).toBeNull();
  });

  it.each([
    ['road.avenue' as const, RoadTier.Avenue, 45],
    ['road.highway' as const, RoadTier.Highway, 90],
    // The four new catalog roads route through the exact same
    // preview/commit machinery as the original three.
    ['road.gravel' as const, RoadTier.Gravel, 8],
    ['road.alley' as const, RoadTier.Alley, 14],
    ['road.oneway' as const, RoadTier.OneWay, 24],
    ['road.four' as const, RoadTier.FourLane, 32],
  ])('uses the injected roadSpec for %s', (toolId, tier, costPerTile) => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool(toolId);
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    expect(previews.at(-1)?.cost).toBe(2 * costPerTile);
    tm.pointerUp(1, 0, 0);
    expect(sent[0]?.commands[0]).toMatchObject({ kind: 'buildRoad', tier });
  });
});

describe('zone rectangle preview + commit', () => {
  const cases: Array<[string, TilePoint, TilePoint]> = [
    ['top-left -> bottom-right', { x: 1, z: 1 }, { x: 3, z: 3 }],
    ['bottom-right -> top-left', { x: 3, z: 3 }, { x: 1, z: 1 }],
    ['top-right -> bottom-left', { x: 3, z: 1 }, { x: 1, z: 3 }],
    ['bottom-left -> top-right', { x: 1, z: 3 }, { x: 3, z: 1 }],
  ];

  it.each(cases)(
    '%s yields the same 3x3 tile set regardless of drag direction',
    (_label, start, end) => {
      const { env, previews } = makeEnv();
      const tm = new ToolManager(env);
      tm.setTool('zone.resLow');
      tm.pointerDown(start.x, start.z, 0);
      tm.pointerMove(end.x, end.z, 0);
      const got = new Set((previews.at(-1)?.tiles ?? []).map((t) => `${t.x},${t.z}`));
      const want = new Set<string>();
      for (let z = 1; z <= 3; z++) {
        for (let x = 1; x <= 3; x++) want.add(`${x},${z}`);
      }
      expect(got).toEqual(want);
      expect(previews.at(-1)?.cost).toBe(0);
    },
  );

  it('maps zone.dezone to ZoneType.None on commit', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('zone.dezone');
    tm.pointerDown(0, 0, 0);
    tm.pointerUp(1, 0, 0);
    expect(sent[0]?.commands[0]).toEqual({
      kind: 'paintZone',
      zone: ZoneType.None,
      tiles: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ],
    });
  });

  it('maps each zone tool id to its ZoneType', () => {
    const table: Array<[string, ZoneType]> = [
      ['zone.resLow', ZoneType.ResLow],
      ['zone.resHigh', ZoneType.ResHigh],
      ['zone.comLow', ZoneType.ComLow],
      ['zone.comHigh', ZoneType.ComHigh],
      ['zone.industrial', ZoneType.Industrial],
      // Zoning types expansion — the three appended zones.
      ['zone.resMediumRow', ZoneType.ResMediumRow],
      ['zone.resMedium', ZoneType.ResMedium],
      ['zone.mixed', ZoneType.Mixed],
    ];
    for (const [toolId, zone] of table) {
      const { env, sent } = makeEnv();
      const tm = new ToolManager(env);
      tm.setTool(toolId as Parameters<ToolManager['setTool']>[0]);
      tm.pointerDown(0, 0, 0);
      tm.pointerUp(0, 0, 0);
      expect(sent[0]?.commands[0]).toMatchObject({ kind: 'paintZone', zone });
    }
  });

  it('§6.21: the three new zone tools carry their display labels in the send/preview label', () => {
    const table: Array<[string, string]> = [
      ['zone.resMediumRow', 'Residential (Medium Row)'],
      ['zone.resMedium', 'Residential (Medium)'],
      ['zone.mixed', 'Mixed-Use'],
    ];
    for (const [toolId, label] of table) {
      const { env, sent, previews } = makeEnv();
      const tm = new ToolManager(env);
      tm.setTool(toolId as Parameters<ToolManager['setTool']>[0]);
      tm.pointerDown(0, 0, 0);
      expect(previews.at(-1)?.label).toBe(label);
      tm.pointerUp(0, 0, 0);
      expect(sent[0]?.label).toBe(label);
    }
  });
});

describe('bulldoze tool', () => {
  it('drags a rectangle at zero cost and commits a bulldoze command', () => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    const preview = previews.at(-1);
    expect(preview?.cost).toBe(0);
    expect(preview?.tiles).toHaveLength(4);
    tm.pointerUp(1, 1, 0);
    expect(sent).toEqual([
      { label: expect.any(String), commands: [{ kind: 'bulldoze', tiles: preview?.tiles }] },
    ]);
  });
});

describe('plop tool', () => {
  it('shows a hover preview at the current rotation before any click', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.long-shed');
    tm.pointerMove(10, 10, -1);
    const preview = previews.at(-1);
    expect(preview?.tiles).toEqual([
      { x: 10, z: 10 },
      { x: 11, z: 10 },
      { x: 12, z: 10 },
    ]);
    expect(preview?.cost).toBe(500);
    expect(preview?.valid).toBe(true);
    expect(preview?.label).toBe('Long Shed');
  });

  it('rotatePlop swaps footprint width/depth', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.long-shed');
    tm.pointerMove(10, 10, -1);
    tm.rotatePlop();
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 10, z: 10 },
      { x: 10, z: 11 },
      { x: 10, z: 12 },
    ]);
  });

  it('rotating a second time returns to the unswapped footprint', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.long-shed');
    tm.pointerMove(10, 10, -1);
    tm.rotatePlop();
    tm.rotatePlop();
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 10, z: 10 },
      { x: 11, z: 10 },
      { x: 12, z: 10 },
    ]);
  });

  it('commits placeBuilding at the hovered tile with the current rotation', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.long-shed');
    tm.rotatePlop();
    tm.pointerDown(4, 4, 0);
    tm.pointerUp(4, 4, 0);
    expect(sent).toEqual([
      {
        label: 'Long Shed',
        commands: [{ kind: 'placeBuilding', catalogId: 'long-shed', x: 4, z: 4, rotation: 1 }],
      },
    ]);
  });

  it('does not send a command for an unknown catalog id', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.nonexistent');
    tm.pointerDown(4, 4, 0);
    tm.pointerUp(4, 4, 0);
    expect(sent).toHaveLength(0);
  });

  it('marks the preview invalid when the footprint runs off the map', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.long-shed');
    tm.pointerMove(255, 0, -1);
    expect(previews.at(-1)?.valid).toBe(false);
  });
});

describe('pointer consumption + cancel semantics', () => {
  it('the select tool never consumes and never previews', () => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('select');
    expect(tm.pointerDown(1, 1, 0)).toBe(false);
    expect(tm.pointerMove(2, 2, 0)).toBe(false);
    expect(tm.pointerUp(2, 2, 0)).toBe(false);
    expect(previews.every((p) => p === null)).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('consumes left-button events for an active non-select tool', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    expect(tm.pointerDown(1, 1, 0)).toBe(true);
    expect(tm.pointerMove(2, 2, 0)).toBe(true);
    expect(tm.pointerUp(2, 2, 0)).toBe(true);
  });

  it('still consumes an off-grid press for a non-select tool, without emitting a new preview', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    const countAfterSetTool = previews.length;
    expect(tm.pointerDown(-1, -1, 0)).toBe(true);
    expect(previews).toHaveLength(countAfterSetTool);
  });

  it('does not consume a hover move with no button held', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    expect(tm.pointerMove(2, 2, -1)).toBe(false);
  });

  it('right button cancels the tool, does not consume, and blocks the pending commit', () => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    tm.pointerDown(1, 1, 0);
    tm.pointerMove(3, 3, 0);
    expect(tm.pointerDown(3, 3, 2)).toBe(false);
    expect(previews.at(-1)).toBeNull();
    tm.pointerUp(3, 3, 0);
    expect(sent).toHaveLength(0);
  });

  it('cancel() clears the preview and aborts an in-progress drag', () => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(2, 0, 0);
    tm.cancel();
    expect(previews.at(-1)).toBeNull();
    tm.pointerUp(2, 0, 0);
    expect(sent).toHaveLength(0);
  });

  it('setTool switches tools, clears the preview, and starts a clean gesture', () => {
    const { env, previews, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(2, 0, 0);
    tm.setTool('zone.resLow');
    expect(tm.tool).toBe('zone.resLow');
    expect(previews.at(-1)).toBeNull();
    tm.pointerDown(0, 0, 0);
    tm.pointerUp(1, 0, 0);
    expect(sent).toEqual([
      {
        label: expect.any(String),
        commands: [
          {
            kind: 'paintZone',
            zone: ZoneType.ResLow,
            tiles: [
              { x: 0, z: 0 },
              { x: 1, z: 0 },
            ],
          },
        ],
      },
    ]);
  });

  it('falls back to the last known hover tile when the pointer releases off-grid', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(1, 1, 0);
    tm.pointerMove(4, 1, 0);
    tm.pointerUp(-1, -1, 0);
    expect(sent).toEqual([
      {
        label: 'Two-Lane Road',
        commands: [
          {
            kind: 'buildRoad',
            tier: RoadTier.TwoLane,
            tiles: [
              { x: 1, z: 1 },
              { x: 2, z: 1 },
              { x: 3, z: 1 },
              { x: 4, z: 1 },
            ],
          },
        ],
      },
    ]);
  });
});

describe('road tool mode/flags (UI-SPEC §5)', () => {
  it('angleLock (90° lock) restricts the road drag to a single, straight, dominant-axis leg', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setFlags({ angleLock: true, straightMode: false });
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 2, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ]);
  });

  it('straightMode also restricts the road drag to a single axis-locked leg', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setFlags({ angleLock: false, straightMode: true });
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(2, 3, 0);
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
      { x: 0, z: 3 },
    ]);
  });

  it('commits the flag-restricted path, not the full L-path', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setFlags({ angleLock: true, straightMode: false });
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerUp(3, 2, 0);
    expect(sent[0]?.commands[0]).toMatchObject({
      kind: 'buildRoad',
      tiles: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 3, z: 0 },
      ],
    });
  });

  it('does not affect zone/plop/bulldoze tools', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setFlags({ angleLock: true, straightMode: true });
    tm.setTool('zone.resLow');
    tm.pointerDown(1, 1, 0);
    tm.pointerMove(3, 3, 0);
    const got = new Set((previews.at(-1)?.tiles ?? []).map((t) => `${t.x},${t.z}`));
    expect(got.size).toBe(9); // still the full 3x3 rect, unaffected by road-only flags
  });

  it('refreshes an already-hovered preview immediately when flags change', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 2, 0);
    expect(previews.at(-1)?.tiles).toHaveLength(6); // full L-path (existing default behavior)

    tm.setFlags({ angleLock: true, straightMode: false });
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 3, z: 0 },
    ]);
  });

  it('does not refresh anything when there is no current hover tile', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    const countBefore = previews.length;
    tm.setFlags({ angleLock: true, straightMode: true });
    expect(previews).toHaveLength(countBefore);
  });
});

describe('zone brush vs rect mode (UI-SPEC §5)', () => {
  it('brush mode paints only the tiles actually traversed by the drag, not the enclosing rect', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    tm.pointerMove(1, 1, 0);
    // An L-shaped path: {0,1} (part of the enclosing rect) was never visited.
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ]);
  });

  it('de-duplicates a tile revisited mid-drag', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    tm.pointerMove(0, 0, 0); // back to the start tile
    expect(previews.at(-1)?.tiles).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ]);
  });

  it('commits exactly the accumulated brush path', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    tm.pointerMove(1, 1, 0);
    tm.pointerUp(1, 1, 0);
    expect(sent[0]?.commands[0]).toEqual({
      kind: 'paintZone',
      zone: ZoneType.ResLow,
      tiles: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 1 },
      ],
    });
  });

  it('hovering before any press shows a single-tile preview, matching rect mode', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.pointerMove(5, 5, -1);
    expect(previews.at(-1)?.tiles).toEqual([{ x: 5, z: 5 }]);
  });

  it('a fresh drag after a commit starts a clean path with no leftover tiles', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    tm.pointerUp(1, 0, 0);
    tm.pointerDown(9, 9, 0);
    expect(previews.at(-1)?.tiles).toEqual([{ x: 9, z: 9 }]);
  });

  it('a fresh drag after cancel() also starts a clean path', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    tm.cancel();
    tm.pointerDown(2, 2, 0);
    expect(previews.at(-1)?.tiles).toEqual([{ x: 2, z: 2 }]);
  });

  it('switching back to rect mode restores enclosing-rectangle painting', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setZoneMode('brush');
    tm.setTool('zone.resLow');
    tm.setZoneMode('rect');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    const got = new Set((previews.at(-1)?.tiles ?? []).map((t) => `${t.x},${t.z}`));
    expect(got).toEqual(new Set(['0,0', '1,0', '0,1', '1,1']));
  });

  it('defaults to rect mode when setZoneMode is never called', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('zone.comLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.tiles).toHaveLength(4);
  });
});

describe('CursorChip payload (UI-SPEC §6)', () => {
  it('road previews carry lengthMeters = tiles.length * TILE_METERS', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 0, 0);
    expect(previews.at(-1)?.lengthMeters).toBe(4 * TILE_METERS);
  });

  it('non-road previews never carry lengthMeters', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('zone.resLow');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.lengthMeters).toBeUndefined();

    tm.setTool('bulldoze');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.lengthMeters).toBeUndefined();
  });

  it('omits invalidReason and stays valid when the env implements none of funds/milestoneLevel/canPlace', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 0, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();
  });

  it('reports "Insufficient funds" when the previewed cost exceeds injected funds', () => {
    const { env, previews } = makeEnv();
    env.funds = () => 10; // a 4-tile two-lane road costs 4 * 20 = 80
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 0, 0);
    expect(previews.at(-1)?.valid).toBe(false);
    expect(previews.at(-1)?.invalidReason).toBe('Insufficient funds');
  });

  it('does not flag insufficient funds when the cost is affordable', () => {
    const { env, previews } = makeEnv();
    env.funds = () => 1_000_000;
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(3, 0, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();
  });

  it('reports "Locked" when the tool\'s unlockMilestone is beyond the injected milestone level', () => {
    const { env, previews } = makeEnv();
    env.milestoneLevel = () => 0;
    const tm = new ToolManager(env);
    tm.setTool('road.avenue'); // fake ROAD_SPECS: unlockMilestone 1
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    expect(previews.at(-1)?.valid).toBe(false);
    expect(previews.at(-1)?.invalidReason).toBe('Locked');
  });

  it('does not lock a tool whose unlockMilestone is already reached', () => {
    const { env, previews } = makeEnv();
    env.milestoneLevel = () => 1;
    const tm = new ToolManager(env);
    tm.setTool('road.avenue');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();
  });

  it('locked takes priority over insufficient funds', () => {
    const { env, previews } = makeEnv();
    env.milestoneLevel = () => 0;
    env.funds = () => 0;
    const tm = new ToolManager(env);
    tm.setTool('road.avenue');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    expect(previews.at(-1)?.invalidReason).toBe('Locked');
  });

  it('reports "Overlapping items" when the injected canPlace check fails', () => {
    const { env, previews } = makeEnv();
    env.canPlace = () => false;
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.valid).toBe(false);
    expect(previews.at(-1)?.invalidReason).toBe('Overlapping items');
  });

  it('overlap invalidity takes priority over insufficient funds', () => {
    const { env, previews } = makeEnv();
    env.canPlace = () => false;
    env.funds = () => 0;
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 0, 0);
    expect(previews.at(-1)?.invalidReason).toBe('Overlapping items');
  });

  it('an off-map plop footprint reports "Overlapping items"', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('plop.long-shed');
    tm.pointerMove(255, 0, -1);
    expect(previews.at(-1)?.valid).toBe(false);
    expect(previews.at(-1)?.invalidReason).toBe('Overlapping items');
  });

  it('zone and bulldoze tools are never locked or over-budget (zero cost, no unlockMilestone)', () => {
    const { env, previews } = makeEnv();
    env.funds = () => 0;
    env.milestoneLevel = () => 0;
    const tm = new ToolManager(env);
    tm.setTool('bulldoze');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();

    tm.setTool('zone.industrial');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Landscaping & water — terraform tool family
// ---------------------------------------------------------------------------

describe('brushRingTiles / brushDiscTiles (UI-SPEC §6.11 brush geometry)', () => {
  it('brushRingTiles(radius 2) is exactly the 12-tile circle outline, not the filled disc', () => {
    const ring = brushRingTiles({ x: 5, z: 5 }, 2);
    const got = new Set(ring.map((t) => `${t.x},${t.z}`));
    expect(got).toEqual(
      new Set(['4,3', '5,3', '6,3', '3,4', '7,4', '3,5', '7,5', '3,6', '7,6', '4,7', '5,7', '6,7']),
    );
    expect(ring).toHaveLength(12);
  });

  it('brushDiscTiles(radius 2) is the 13-tile filled circle', () => {
    const disc = brushDiscTiles({ x: 5, z: 5 }, 2);
    const got = new Set(disc.map((t) => `${t.x},${t.z}`));
    expect(got).toEqual(
      new Set([
        '5,3',
        '4,4',
        '5,4',
        '6,4',
        '3,5',
        '4,5',
        '5,5',
        '6,5',
        '7,5',
        '4,6',
        '5,6',
        '6,6',
        '5,7',
      ]),
    );
    expect(disc).toHaveLength(13);
  });

  it('clips both shapes to the map bounds near a corner', () => {
    const ring = brushRingTiles({ x: 0, z: 0 }, 2);
    expect(new Set(ring.map((t) => `${t.x},${t.z}`))).toEqual(
      new Set(['2,0', '2,1', '0,2', '1,2']),
    );

    const disc = brushDiscTiles({ x: 0, z: 0 }, 2);
    expect(new Set(disc.map((t) => `${t.x},${t.z}`))).toEqual(
      new Set(['0,0', '1,0', '2,0', '0,1', '1,1', '0,2']),
    );
  });

  it('the disc always contains strictly more tiles than the ring, for the same radius', () => {
    expect(brushDiscTiles({ x: 50, z: 50 }, 5).length).toBeGreaterThan(
      brushRingTiles({ x: 50, z: 50 }, 5).length,
    );
  });
});

describe('terraform hover preview (ghost ring, UI-SPEC §6.11)', () => {
  it('previews the brush ring (not the filled disc) at the hovered tile', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.tiles).toHaveLength(12);
    expect(new Set(previews.at(-1)?.tiles.map((t) => `${t.x},${t.z}`))).toEqual(
      new Set(brushRingTiles({ x: 5, z: 5 }, 2).map((t) => `${t.x},${t.z}`)),
    );
  });

  it('follows the hovered tile, not any fixed drag-start point', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(20, 20, -1, 0);
    const first = new Set(previews.at(-1)?.tiles.map((t) => `${t.x},${t.z}`));
    tm.pointerMove(40, 40, -1, 0);
    const second = new Set(previews.at(-1)?.tiles.map((t) => `${t.x},${t.z}`));
    expect(first).not.toEqual(second);
    expect(second).toEqual(
      new Set(brushRingTiles({ x: 40, z: 40 }, 2).map((t) => `${t.x},${t.z}`)),
    );
  });
});

describe('terraform structure-exclusion validity (UI-SPEC §6.11)', () => {
  it('is valid when the env omits hasStructure entirely', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();
  });

  it('stays valid when only part of the brush disc is structure-excluded', () => {
    const { env, previews } = makeEnv();
    env.hasStructure = (tile) => tile.x === 5 && tile.z === 5; // just the center tile
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.valid).toBe(true);
    expect(previews.at(-1)?.invalidReason).toBeUndefined();
  });

  it('goes invalid ("Overlapping items") only when the whole brush disc is structure-excluded', () => {
    const { env, previews } = makeEnv();
    env.hasStructure = () => true;
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.valid).toBe(false);
    expect(previews.at(-1)?.invalidReason).toBe('Overlapping items');
  });

  it('the ghost preview keeps showing the ring even when the brush is fully excluded', () => {
    const { env, previews } = makeEnv();
    env.hasStructure = () => true;
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.tiles).toHaveLength(12);
  });
});

describe('terraform cost estimate + running total (cursor chip, UI-SPEC §6.11)', () => {
  it('a hover-only preview shows the single-dab estimate: editable tiles * strength * ¢/m/tile', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 3 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.cost).toBeCloseTo(13 * 3 * TERRAFORM_COST_PER_METER_TILE);
  });

  it('excludes structure-covered tiles from the cost estimate', () => {
    const { env, previews } = makeEnv();
    env.hasStructure = (tile) => tile.x === 5 && tile.z === 5; // 1 of the 13 disc tiles
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 3 });
    tm.setTool('terraform.raise');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.cost).toBeCloseTo(12 * 3 * TERRAFORM_COST_PER_METER_TILE);
  });

  it('accumulates a running total across every dab sent so far during a drag', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 3 });
    tm.setTool('terraform.raise');
    const perDab = 13 * 3 * TERRAFORM_COST_PER_METER_TILE;

    tm.pointerDown(5, 5, 0, 0);
    expect(previews.at(-1)?.cost).toBeCloseTo(perDab);

    tm.pointerMove(6, 5, 0, 6); // >= 6 ticks since the down-dab -> dab #2
    expect(previews.at(-1)?.cost).toBeCloseTo(perDab * 2);

    tm.pointerMove(7, 5, 0, 8); // < 6 ticks since dab #2 -> no dab #3, total unchanged
    expect(previews.at(-1)?.cost).toBeCloseTo(perDab * 2);
  });

  it('a fresh drag starts the running total over from zero', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 3 });
    tm.setTool('terraform.raise');
    const perDab = 13 * 3 * TERRAFORM_COST_PER_METER_TILE;

    tm.pointerDown(5, 5, 0, 0);
    tm.pointerUp(5, 5, 0);
    tm.pointerDown(6, 6, 0, 100);
    expect(previews.at(-1)?.cost).toBeCloseTo(perDab);
  });

  it('leftover terraform running cost never bleeds into a subsequently selected tool', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(5, 5, 0, 0);
    tm.setTool('bulldoze');
    tm.pointerDown(0, 0, 0);
    tm.pointerMove(1, 1, 0);
    expect(previews.at(-1)?.cost).toBe(0);
  });
});

describe('terraform level target sampling (UI-SPEC §6.11)', () => {
  it('samples heightAt(tile) at drag start and embeds it as the command targetHeight', () => {
    const { env, sent } = makeEnv();
    env.heightAt = (tile) => (tile.x === 10 && tile.z === 10 ? 42.34 : 0);
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerDown(10, 10, 0, 0);
    expect(sent[0]?.commands[0]).toMatchObject({
      kind: 'terraform',
      mode: 'level',
      targetHeight: 42.34,
    });
  });

  it('keeps the drag-start target for every dab in the stroke, even as the hovered tile changes', () => {
    const { env, sent } = makeEnv();
    env.heightAt = (tile) => (tile.x === 10 ? 42.34 : 7);
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerDown(10, 10, 0, 0); // samples 42.34 at (10,10)
    tm.pointerMove(20, 10, 0, 6); // would sample 7 here, but must not re-sample
    expect(sent).toHaveLength(2);
    expect(sent[1]?.commands[0]).toMatchObject({
      kind: 'terraform',
      mode: 'level',
      targetHeight: 42.34,
      center: { x: 20, z: 10 },
    });
  });

  it('defaults the sampled target to 0 when the env omits heightAt', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerDown(3, 3, 0, 0);
    expect(sent[0]?.commands[0]).toMatchObject({ targetHeight: 0 });
  });

  it('re-samples a fresh target on a new drag', () => {
    const { env, sent } = makeEnv();
    let sample = 10;
    env.heightAt = () => sample;
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerDown(3, 3, 0, 0);
    tm.pointerUp(3, 3, 0);
    sample = 25;
    tm.pointerDown(4, 4, 0, 0);
    expect(sent[0]?.commands[0]).toMatchObject({ targetHeight: 10 });
    expect(sent[1]?.commands[0]).toMatchObject({ targetHeight: 25 });
  });

  it('non-level terraform commands never carry a targetHeight key', () => {
    const { env, sent } = makeEnv();
    env.heightAt = () => 99;
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(3, 3, 0, 0);
    expect(sent[0]?.commands[0]).not.toHaveProperty('targetHeight');
  });
});

describe('terraform preview label (Level sampled-height readout, UI-SPEC §5/§6.11)', () => {
  it('shows the plain tool name while only hovering, before any drag', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerMove(5, 5, -1, 0);
    expect(previews.at(-1)?.label).toBe('Level');
  });

  it('embeds the sampled target height in the label once a drag starts', () => {
    const { env, previews } = makeEnv();
    env.heightAt = () => 12.34;
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerDown(5, 5, 0, 0);
    expect(previews.at(-1)?.label).toBe('Level → 12.3m');
  });

  it('reverts to the plain name once the drag ends', () => {
    const { env, previews } = makeEnv();
    env.heightAt = () => 12.34;
    const tm = new ToolManager(env);
    tm.setTool('terraform.level');
    tm.pointerDown(5, 5, 0, 0);
    tm.pointerUp(5, 5, 0);
    tm.pointerMove(6, 6, -1, 0);
    expect(previews.at(-1)?.label).toBe('Level');
  });

  it.each([
    ['terraform.raise', 'Raise'],
    ['terraform.lower', 'Lower'],
    ['terraform.smooth', 'Smooth'],
  ] as const)('%s always shows its plain name, never a sampled readout', (toolId, label) => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool(toolId);
    tm.pointerDown(5, 5, 0, 0);
    expect(previews.at(-1)?.label).toBe(label);
  });
});

describe('terraform continuous brushing: throttled command emission (UI-SPEC §6.11)', () => {
  it('sends the first dab immediately on pointerDown, at the down tile with the current brush settings', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 3, strength: 2 });
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    expect(sent).toEqual([
      {
        label: 'Raise',
        commands: [
          { kind: 'terraform', mode: 'raise', center: { x: 10, z: 10 }, radius: 3, strength: 2 },
        ],
      },
    ]);
  });

  it('does not send again before TERRAFORM_EMIT_INTERVAL_TICKS (6) have elapsed', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    tm.pointerMove(11, 10, 0, 5);
    expect(sent).toHaveLength(1);
  });

  it('sends a second dab once 6 ticks have elapsed, at the newly hovered tile', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 3, strength: 2 });
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    tm.pointerMove(12, 10, 0, 6);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.commands[0]).toMatchObject({
      kind: 'terraform',
      mode: 'raise',
      center: { x: 12, z: 10 },
      radius: 3,
      strength: 2,
    });
  });

  it('throttles again after the second emission, only firing once another 6 ticks pass', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    tm.pointerMove(11, 10, 0, 6); // dab #2 (tick 6)
    tm.pointerMove(12, 10, 0, 8); // only 2 ticks since dab #2 -> no dab #3
    expect(sent).toHaveLength(2);
    tm.pointerMove(13, 10, 0, 12); // 6 ticks since dab #2 -> dab #3
    expect(sent).toHaveLength(3);
  });

  it('never emits while hovering without the button ever having been held', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerMove(10, 10, -1, 100);
    expect(sent).toHaveLength(0);
  });

  it('stops emitting once the button is released; pointerUp sends no extra "commit"', () => {
    const { env, sent, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    tm.pointerUp(10, 10, 0);
    expect(sent).toHaveLength(1);
    expect(previews.at(-1)).toBeNull();
    tm.pointerMove(10, 10, -1, 1000);
    expect(sent).toHaveLength(1);
  });

  it('switching tools mid-drag aborts further emission', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    tm.setTool('terraform.lower');
    tm.pointerMove(11, 10, 0, 100);
    expect(sent).toHaveLength(1);
  });

  it('cancel() mid-drag stops further emission', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(10, 10, 0, 0);
    tm.cancel();
    tm.pointerMove(11, 10, 0, 100);
    expect(sent).toHaveLength(1);
  });

  it.each(['terraform.lower', 'terraform.level', 'terraform.smooth'] as const)(
    'routes %s to its own terraform mode',
    (toolId) => {
      const { env, sent } = makeEnv();
      const tm = new ToolManager(env);
      tm.setTool(toolId);
      tm.pointerDown(4, 4, 0, 0);
      const expectedMode = toolId.slice('terraform.'.length);
      expect(sent[0]?.commands[0]).toMatchObject({
        kind: 'terraform',
        mode: expectedMode,
        center: { x: 4, z: 4 },
      });
    },
  );

  it('an off-grid pointerDown consumes but sends nothing', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    expect(tm.pointerDown(-1, -1, 0, 0)).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe('ToolManager.setBrush (UI-SPEC §6.11 tool-options plumbing)', () => {
  it('starts from DEFAULT_BRUSH_SETTINGS before setBrush is ever called', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(50, 50, 0, 0);
    expect(sent[0]?.commands[0]).toMatchObject({
      radius: DEFAULT_BRUSH_SETTINGS.radius,
      strength: DEFAULT_BRUSH_SETTINGS.strength,
    });
  });

  it('changes the radius/strength used by subsequent dabs', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 6, strength: 4 });
    tm.setTool('terraform.raise');
    tm.pointerDown(50, 50, 0, 0);
    expect(sent[0]?.commands[0]).toMatchObject({ radius: 6, strength: 4 });
  });

  it('refreshes an already-hovered preview immediately (the ring resizes live)', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    tm.setBrush({ radius: 2, strength: 1 });
    tm.setTool('terraform.raise');
    tm.pointerMove(50, 50, -1, 0);
    expect(previews.at(-1)?.tiles).toHaveLength(12);

    tm.setBrush({ radius: 3, strength: 1 });
    expect(previews.at(-1)?.tiles.length).toBeGreaterThan(12);
  });

  it('does not emit a spurious preview when there is no current hover tile', () => {
    const { env, previews } = makeEnv();
    const tm = new ToolManager(env);
    const countBefore = previews.length;
    tm.setBrush({ radius: 5, strength: 2 });
    expect(previews).toHaveLength(countBefore);
  });

  it('a mid-drag brush change is reflected by the very next dab', () => {
    const { env, sent } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('terraform.raise');
    tm.pointerDown(50, 50, 0, 0);
    tm.setBrush({ radius: 10, strength: 5 });
    tm.pointerMove(51, 50, 0, 6);
    expect(sent[1]?.commands[0]).toMatchObject({ radius: 10, strength: 5 });
  });
});

describe('ToolManager.dragActive (UI-SPEC §4 staged ESC, stage 1)', () => {
  it('is false initially and during a plain hover', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    expect(tm.dragActive).toBe(false);
    tm.pointerMove(3, 3, -1);
    expect(tm.dragActive).toBe(false);
  });

  it('is true while a primary-button drag is armed and false again after pointerUp', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('road.two');
    tm.pointerDown(2, 2, 0);
    expect(tm.dragActive).toBe(true);
    tm.pointerMove(5, 2, 0);
    expect(tm.dragActive).toBe(true);
    tm.pointerUp(5, 2, 0);
    expect(tm.dragActive).toBe(false);
  });

  it('is cleared by cancel()', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    tm.setTool('zone.resLow');
    tm.pointerDown(4, 4, 0);
    expect(tm.dragActive).toBe(true);
    tm.cancel();
    expect(tm.dragActive).toBe(false);
  });

  it('never arms for the select tool or an off-grid pointerDown', () => {
    const { env } = makeEnv();
    const tm = new ToolManager(env);
    tm.pointerDown(2, 2, 0); // select tool: not consumed
    expect(tm.dragActive).toBe(false);
    tm.setTool('road.two');
    tm.pointerDown(-1, -1, 0); // off-grid: null tile, not armed
    expect(tm.dragActive).toBe(false);
  });
});
