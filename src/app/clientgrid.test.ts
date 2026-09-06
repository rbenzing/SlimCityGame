/**
 * Render-thread grid mirror: accumulates the worker's snapshot deltas
 * (roads/zones/buildings) over the static map layers so integration can feed
 * ZoneGridRenderer.rebuild, LampRenderer.rebuild, and the plop-tool
 * "Overlapping items" check without asking the worker.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, MapData } from '../shared/types';
import { ClientGridMirror } from './clientgrid';
import { presetProfileForTier } from '../shared/roadprofile';

const SIZE = 32;

function makeMap(): MapData {
  const n = SIZE * SIZE;
  const map: MapData = {
    name: 'Test',
    size: SIZE,
    height: new Float32Array(n).fill(3),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    seaLevel: 0,
    spawn: { x: 0, z: 0 },
  };
  map.water[5 * SIZE + 5] = 1; // one water tile at (5,5)
  return map;
}

const plant: BuildingCatalogEntry = {
  id: 'plant',
  name: 'Plant',
  category: 'utility',
  footprint: { w: 2, d: 1 },
  height: 10,
  color: 0,
  powerUse: 0,
  waterUse: 0,
  cost: 100,
  upkeep: 1,
  unlockMilestone: 0,
};

function instance(id: number, x: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BuildingInstance {
  return { id, catalogId: 'plant', x, z, rotation, level: 1, state: 1, problems: 0 };
}

const entryFor = (id: string): BuildingCatalogEntry | undefined =>
  id === 'plant' ? plant : undefined;

describe('ClientGridMirror — road profiles', () => {
  it('resolves a preset tile to its catalogue profile and a custom tile to the worker table', () => {
    const mirror = new ClientGridMirror(makeMap());
    const custom = {
      class: 'local' as const,
      pieces: [{ kind: 'travel' as const, width: 3.5, flow: 'both' as const }],
    };
    mirror.applyRoadProfiles([{ id: 12, profile: custom }]);
    mirror.applyRoadDeltas([
      {
        x: 3,
        z: 4,
        tier: RoadTier.Avenue,
        mask: 0,
        elevation: 0,
        profile: RoadTier.Avenue,
        flow: 0,
      },
      { x: 4, z: 4, tier: RoadTier.TwoLane, mask: 0, elevation: 0, profile: 12, flow: 0 },
    ]);
    expect(mirror.profileAt(3, 4)?.class).toBe('arterial');
    expect(mirror.profileAt(4, 4)).toEqual(custom);
    expect(mirror.profileAt(5, 5)).toBeNull();
    expect(mirror.profileAt(-1, 0)).toBeNull();
    // A custom id the table no longer holds resolves to nothing rather than a guess.
    mirror.applyRoadProfiles([]);
    expect(mirror.profileAt(4, 4)).toBeNull();
  });

  it('reuses the id of an identical custom shape and otherwise proposes the next free one', () => {
    const mirror = new ClientGridMirror(makeMap());
    const shape = {
      class: 'local' as const,
      pieces: [
        { kind: 'sidewalk' as const, width: 1.9 },
        { kind: 'travel' as const, width: 3.5, flow: 'back' as const },
        { kind: 'travel' as const, width: 3.5, flow: 'fwd' as const },
        { kind: 'sidewalk' as const, width: 1.9 },
      ],
    };
    mirror.applyRoadProfiles([{ id: 12, profile: shape }]);
    // A structurally equal copy resolves to the existing id.
    expect(mirror.profileIdFor({ ...shape, pieces: shape.pieces.map((p) => ({ ...p })) })).toBe(12);
    // A different width is a different profile.
    const wider = { ...shape, pieces: shape.pieces.map((p) => ({ ...p, width: p.width + 0.5 })) };
    expect(mirror.profileIdFor(wider)).toBe(13);
  });

  it('proposes the lowest free custom id', () => {
    const mirror = new ClientGridMirror(makeMap());
    expect(mirror.nextCustomProfileId()).toBe(12);
    const p = { class: 'local' as const, pieces: [] };
    mirror.applyRoadProfiles([
      { id: 12, profile: p },
      { id: 14, profile: p },
    ]);
    expect(mirror.nextCustomProfileId()).toBe(13);
  });
});

describe('ClientGridMirror', () => {
  let mirror: ClientGridMirror;

  beforeEach(() => {
    mirror = new ClientGridMirror(makeMap());
  });

  it('copies the static map layers and starts with empty dynamic layers', () => {
    expect(mirror.size).toBe(SIZE);
    expect(mirror.height[0]).toBe(3);
    expect(mirror.water[5 * SIZE + 5]).toBe(1);
    expect(Array.from(mirror.roadTier).every((v) => v === 0)).toBe(true);
    expect(Array.from(mirror.zone).every((v) => v === 0)).toBe(true);
    expect(mirror.roadTiles()).toEqual([]);
  });

  it('applies road deltas, including removals (tier None)', () => {
    mirror.applyRoadDeltas([
      {
        x: 3,
        z: 4,
        tier: RoadTier.TwoLane,
        mask: 0,
        elevation: 0,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
      {
        x: 4,
        z: 4,
        tier: RoadTier.Avenue,
        mask: 0,
        elevation: 0,
        profile: RoadTier.Avenue,
        flow: 0,
      },
    ]);
    expect(mirror.roadTier[4 * SIZE + 3]).toBe(RoadTier.TwoLane);
    expect(mirror.roadTier[4 * SIZE + 4]).toBe(RoadTier.Avenue);
    expect(mirror.roadTiles()).toEqual([
      {
        x: 3,
        z: 4,
        tier: RoadTier.TwoLane,
        elevated: false,
        profile: presetProfileForTier(RoadTier.TwoLane),
      },
      {
        x: 4,
        z: 4,
        tier: RoadTier.Avenue,
        elevated: false,
        profile: presetProfileForTier(RoadTier.Avenue),
      },
    ]);

    mirror.applyRoadDeltas([
      { x: 3, z: 4, tier: RoadTier.None, mask: 0, elevation: 0, profile: 0, flow: 0 },
    ]);
    expect(mirror.roadTier[4 * SIZE + 3]).toBe(RoadTier.None);
    expect(mirror.roadTiles()).toEqual([
      {
        x: 4,
        z: 4,
        tier: RoadTier.Avenue,
        elevated: false,
        profile: presetProfileForTier(RoadTier.Avenue),
      },
    ]);
  });

  it('tracks deck heights and reports the elevated tiles as bridge structure', () => {
    mirror.applyRoadDeltas([
      {
        x: 6,
        z: 6,
        tier: RoadTier.TwoLane,
        mask: 1 | 4,
        elevation: 0,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
      {
        x: 6,
        z: 7,
        tier: RoadTier.TwoLane,
        mask: 1 | 4,
        elevation: 9,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
    ]);

    // The road surface rides the deck; the ground under it is untouched.
    expect(mirror.deckHeightAt(6, 7)).toBe(mirror.height[7 * SIZE + 6]! + 9);
    expect(mirror.deckHeightAt(6, 6)).toBe(mirror.height[6 * SIZE + 6]!);

    const decks = mirror.deckTiles();
    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({ x: 6, z: 7, tier: RoadTier.TwoLane, mask: 1 | 4 });

    // The at-grade tile is a neighbour of a deck, so the road mesh has to blend
    // across it rather than sampling raw terrain.
    expect(mirror.nearElevated(6, 6)).toBe(true);
    expect(mirror.nearElevated(0, 0)).toBe(false);
  });

  it('tags road tiles with whether they are up on a deck', () => {
    mirror.applyRoadDeltas([
      {
        x: 6,
        z: 6,
        tier: RoadTier.TwoLane,
        mask: 1 | 4,
        elevation: 0,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
      {
        x: 6,
        z: 7,
        tier: RoadTier.TwoLane,
        mask: 1 | 4,
        elevation: 9,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
    ]);
    const byTile = new Map(mirror.roadTiles().map((t) => [`${t.x},${t.z}`, t.elevated]));
    expect(byTile.get('6,6')).toBe(false);
    expect(byTile.get('6,7')).toBe(true);
  });

  it('reports which tiles changed height, so their baked geometry can be rebuilt', () => {
    // Raising a road moves the surface everything else was drawn against.
    const raised = mirror.applyRoadDeltas([
      {
        x: 6,
        z: 6,
        tier: RoadTier.TwoLane,
        mask: 1 | 4,
        elevation: 0,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
      {
        x: 6,
        z: 7,
        tier: RoadTier.TwoLane,
        mask: 1 | 4,
        elevation: 9,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
    ]);
    expect(raised).toEqual([{ x: 6, z: 7 }]);

    // Re-sending the same deltas moves nothing, so nothing needs rebuilding.
    expect(
      mirror.applyRoadDeltas([
        {
          x: 6,
          z: 7,
          tier: RoadTier.TwoLane,
          mask: 1 | 4,
          elevation: 9,
          profile: RoadTier.TwoLane,
          flow: 0,
        },
      ]),
    ).toEqual([]);

    // And dropping back to the ground is a height change in its own right.
    expect(
      mirror.applyRoadDeltas([
        { x: 6, z: 7, tier: RoadTier.None, mask: 0, elevation: 0, profile: 0, flow: 0 },
      ]),
    ).toEqual([{ x: 6, z: 7 }]);
  });

  describe('deckSurfaceAt', () => {
    const CENTRE = (t: number): number => (t + 0.5) * TILE_METERS;

    /** A north-south span at x=6 over a gouged-out riverbed, level at 9m. */
    function bridgeOverRiver(): void {
      for (let z = 4; z <= 10; z++) {
        for (let x = 4; x <= 8; x++) {
          const i = z * SIZE + x;
          mirror.water[i] = 1;
          mirror.height[i] = -7; // the bed the span crosses
        }
      }
      mirror.applyRoadDeltas(
        Array.from({ length: 7 }, (_, k) => ({
          x: 6,
          z: 4 + k,
          tier: RoadTier.TwoLane,
          mask: 1 | 4,
          elevation: 16, // -7 + 16 = 9m deck
          profile: RoadTier.TwoLane,
          flow: 0,
        })),
      );
    }

    it('reads the terrain where no deck governs the point', () => {
      expect(mirror.deckSurfaceAt(CENTRE(20), CENTRE(20))).toBeNull();
    });

    it('runs flat across the width of the deck, because a bridge has no camber', () => {
      bridgeOverRiver();
      const crown = mirror.deckSurfaceAt(CENTRE(6), CENTRE(7));
      expect(crown).toBeCloseTo(9, 5);

      // Out to where the structure's edge sits — past the carriageway, past
      // the footway, and on out over the water either side. Blending across
      // the run would drag every one of these down toward the -7m bed.
      for (const offset of [-7.9, -5.875, -3.75, 3.75, 5.875, 7.9]) {
        expect(mirror.deckSurfaceAt(CENTRE(6) + offset, CENTRE(7))).toBeCloseTo(9, 5);
      }
    });

    it('still reads the deck just past the tile edge, where a wide span oversails it', () => {
      bridgeOverRiver();
      // A tile beyond the ribbon: the structure of a big road reaches here.
      expect(mirror.deckSurfaceAt(CENTRE(7), CENTRE(7))).toBeCloseTo(9, 5);
    });

    it('slopes along the run, so an approach ramp is a slope and not a step', () => {
      // A ramp climbing 2m per tile northward off flat ground.
      mirror.applyRoadDeltas(
        Array.from({ length: 5 }, (_, k) => ({
          x: 12,
          z: 12 + k,
          tier: RoadTier.TwoLane,
          mask: 1 | 4,
          elevation: 2 * k,
          profile: RoadTier.TwoLane,
          flow: 0,
        })),
      );

      const at = (z: number): number => mirror.deckSurfaceAt(CENTRE(12), z)!;
      // Halfway between two tile centres is halfway up the step between them.
      const low = at(CENTRE(13));
      const high = at(CENTRE(14));
      expect(at((CENTRE(13) + CENTRE(14)) / 2)).toBeCloseTo((low + high) / 2, 5);
      expect(high).toBeGreaterThan(low);
    });
  });

  it('drops the deck when the road is bulldozed', () => {
    mirror.applyRoadDeltas([
      {
        x: 8,
        z: 8,
        tier: RoadTier.TwoLane,
        mask: 0,
        elevation: 12,
        profile: RoadTier.TwoLane,
        flow: 0,
      },
    ]);
    expect(mirror.deckTiles()).toHaveLength(1);

    mirror.applyRoadDeltas([
      { x: 8, z: 8, tier: RoadTier.None, mask: 0, elevation: 0, profile: 0, flow: 0 },
    ]);
    expect(mirror.deckTiles()).toEqual([]);
    expect(mirror.nearElevated(8, 8)).toBe(false);
  });

  it('applies zone patches into the zone layer', () => {
    mirror.applyZonePatches([{ x: 10, z: 10, w: 2, h: 2, data: new Uint8Array([1, 1, 3, 0]) }]);
    expect(mirror.zone[10 * SIZE + 10]).toBe(ZoneType.ResLow);
    expect(mirror.zone[10 * SIZE + 11]).toBe(ZoneType.ResLow);
    expect(mirror.zone[11 * SIZE + 10]).toBe(ZoneType.ComLow);
    expect(mirror.zone[11 * SIZE + 11]).toBe(ZoneType.None);
  });

  it('stamps building footprints on add (rotation swaps w/d) and clears them on remove', () => {
    mirror.applyBuildingDelta(
      { added: [instance(7, 8, 8, 0)], removed: [], updated: [] },
      entryFor,
    );
    // 2x1 footprint at rotation 0: (8,8) and (9,8).
    expect(mirror.buildingId[8 * SIZE + 8]).toBe(7);
    expect(mirror.buildingId[8 * SIZE + 9]).toBe(7);
    expect(mirror.buildingId[9 * SIZE + 8]).toBe(0);

    mirror.applyBuildingDelta(
      { added: [instance(9, 12, 12, 1)], removed: [], updated: [] },
      entryFor,
    );
    // Rotation 1 swaps to 1x2: (12,12) and (12,13).
    expect(mirror.buildingId[12 * SIZE + 12]).toBe(9);
    expect(mirror.buildingId[13 * SIZE + 12]).toBe(9);
    expect(mirror.buildingId[12 * SIZE + 13]).toBe(0);

    mirror.applyBuildingDelta({ added: [], removed: [7], updated: [] }, entryFor);
    expect(mirror.buildingId[8 * SIZE + 8]).toBe(0);
    expect(mirror.buildingId[8 * SIZE + 9]).toBe(0);
    // The other building is untouched.
    expect(mirror.buildingId[12 * SIZE + 12]).toBe(9);
  });

  it('re-stamps a building on update', () => {
    mirror.applyBuildingDelta(
      { added: [instance(7, 8, 8, 0)], removed: [], updated: [] },
      entryFor,
    );
    mirror.applyBuildingDelta(
      { added: [], removed: [], updated: [instance(7, 8, 8, 1)] },
      entryFor,
    );
    // Rotation now 1 -> footprint (8,8) + (8,9); old (9,8) slot cleared.
    expect(mirror.buildingId[8 * SIZE + 8]).toBe(7);
    expect(mirror.buildingId[9 * SIZE + 8]).toBe(7);
    expect(mirror.buildingId[8 * SIZE + 9]).toBe(0);
  });

  it('applies height patches into the height mirror (auto-flatten / terraform, UI-SPEC §6.18 #6)', () => {
    // A 2x2 flatten patch at (10,10) leveling those tiles to 7.5m; the
    // shape matches SimSnapshot.heightPatches / terraform's HeightPatch.
    mirror.applyHeightPatches([
      { x: 10, z: 10, w: 2, h: 2, heights: new Float32Array([7.5, 7.5, 7.5, 7.5]) },
    ]);
    expect(mirror.height[10 * SIZE + 10]).toBeCloseTo(7.5, 5);
    expect(mirror.height[10 * SIZE + 11]).toBeCloseTo(7.5, 5);
    expect(mirror.height[11 * SIZE + 10]).toBeCloseTo(7.5, 5);
    expect(mirror.height[11 * SIZE + 11]).toBeCloseTo(7.5, 5);
    // A tile outside the patch rect keeps its original map height (3).
    expect(mirror.height[0]).toBe(3);
  });

  it('clips height patches to the grid bounds without throwing', () => {
    // Patch rect partly off the +x/+z edge: in-bounds cells update, the
    // out-of-bounds portion is silently skipped.
    mirror.applyHeightPatches([
      {
        x: SIZE - 1,
        z: SIZE - 1,
        w: 2,
        h: 2,
        heights: new Float32Array([9, 9, 9, 9]),
      },
    ]);
    expect(mirror.height[(SIZE - 1) * SIZE + (SIZE - 1)]).toBeCloseTo(9, 5);
  });

  describe('isFreeForPlop', () => {
    it('accepts empty buildable land', () => {
      expect(
        mirror.isFreeForPlop([
          { x: 1, z: 1 },
          { x: 2, z: 1 },
        ]),
      ).toBe(true);
    });

    it('rejects out-of-bounds, water, road, and building tiles', () => {
      expect(mirror.isFreeForPlop([{ x: -1, z: 0 }])).toBe(false);
      expect(mirror.isFreeForPlop([{ x: SIZE, z: 0 }])).toBe(false);
      expect(mirror.isFreeForPlop([{ x: 5, z: 5 }])).toBe(false); // water
      mirror.applyRoadDeltas([
        {
          x: 6,
          z: 6,
          tier: RoadTier.TwoLane,
          mask: 0,
          elevation: 0,
          profile: RoadTier.TwoLane,
          flow: 0,
        },
      ]);
      expect(mirror.isFreeForPlop([{ x: 6, z: 6 }])).toBe(false); // road
      mirror.applyBuildingDelta(
        { added: [instance(1, 20, 20, 0)], removed: [], updated: [] },
        entryFor,
      );
      expect(mirror.isFreeForPlop([{ x: 20, z: 20 }])).toBe(false); // building
      // A mixed set fails as a whole.
      expect(
        mirror.isFreeForPlop([
          { x: 1, z: 1 },
          { x: 20, z: 20 },
        ]),
      ).toBe(false);
    });
  });
});

describe('ClientGridMirror — junction control', () => {
  let mirror: ClientGridMirror;
  beforeEach(() => {
    mirror = new ClientGridMirror(makeMap());
  });

  const road = (x: number, z: number) => ({
    x,
    z,
    tier: RoadTier.TwoLane,
    profile: RoadTier.TwoLane,
    flow: 0,
    mask: 0,
    elevation: 0,
  });

  it('knows nothing until the worker says, and then reports what it said', () => {
    expect(mirror.junctionAt(4, 4)?.control).toBeUndefined();
    expect(
      mirror.applyJunctions([
        { x: 4, z: 4, control: 'signal', warranted: 'signal', auto: true, turns: 0 },
      ]),
    ).toBe(true);
    expect(mirror.junctionAt(4, 4)?.control).toBe('signal');
    expect(mirror.junctionAt(4, 5)?.control).toBeUndefined();
  });

  it('reports whether the answer actually moved, since no tile changes when it does', () => {
    mirror.applyJunctions([
      { x: 4, z: 4, control: 'stop', warranted: 'stop', auto: true, turns: 0 },
    ]);
    expect(
      mirror.applyJunctions([
        { x: 4, z: 4, control: 'stop', warranted: 'stop', auto: true, turns: 0 },
      ]),
    ).toBe(false);
    expect(
      mirror.applyJunctions([
        { x: 4, z: 4, control: 'allWayStop', warranted: 'allWayStop', auto: true, turns: 0 },
      ]),
    ).toBe(true);
    expect(mirror.applyJunctions([])).toBe(true);
    expect(mirror.junctionAt(4, 4)?.control).toBeUndefined();
  });

  it('drops a junction outside the map rather than indexing off the end', () => {
    const off = (x: number) => [
      { x, z: 0, control: 'stop' as const, warranted: 'stop' as const, auto: true, turns: 0 },
    ];
    expect(mirror.applyJunctions(off(-1))).toBe(false);
    expect(mirror.applyJunctions(off(SIZE))).toBe(false);
  });

  it('reports a junction the player set apart from one on its warrant', () => {
    mirror.applyJunctions([
      { x: 4, z: 4, control: 'stop', warranted: 'stop', auto: false, turns: 0 },
    ]);
    expect(mirror.junctionAt(4, 4)?.auto).toBe(false);
    // The same control, now the warrant's, is a change the render has to see:
    // the inspector reads it differently even though the road looks the same.
    expect(
      mirror.applyJunctions([
        { x: 4, z: 4, control: 'stop', warranted: 'stop', auto: true, turns: 0 },
      ]),
    ).toBe(true);
    expect(mirror.junctionAt(4, 4)?.auto).toBe(true);
  });

  it('hands the control to the road tile that carries it, and to no other', () => {
    mirror.applyRoadDeltas([road(4, 4), road(4, 5)]);
    mirror.applyJunctions([
      { x: 4, z: 4, control: 'allWayStop', warranted: 'allWayStop', auto: true, turns: 0 },
    ]);
    const tiles = mirror.roadTiles();
    expect(tiles.find((t) => t.x === 4 && t.z === 4)?.control).toBe('allWayStop');
    expect(tiles.find((t) => t.x === 4 && t.z === 5)?.control).toBeUndefined();
  });
});
