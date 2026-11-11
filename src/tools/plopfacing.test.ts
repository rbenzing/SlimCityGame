import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { PLACEMENT_REFUSALS } from '../shared/placement';
import { RoadTier } from '../shared/types';
import type { BuildingCatalogEntry, Command } from '../shared/types';
import { createGrid, frontingTurns, frontTouchesStreet, touchesStreet } from '../world/grid';
import { ToolManager, type ToolEnv, type ToolPreview } from './tools';

const SIZE = 32;
const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const at = (x: number, z: number): number => z * SIZE + x;
type Tile = { x: number; z: number };

interface Rig {
  tm: ToolManager;
  previews: (ToolPreview | null)[];
  sent: Command[][];
}

/** A tool manager over a real grid, judging a plop by the same predicates the ghost uses in the app. */
function rig(streets: Tile[], catalogId = 'school'): Rig {
  const grid = createGrid(SIZE);
  for (const s of streets) grid.roadTier[at(s.x, s.z)] = RoadTier.TwoLane;
  const entryOf = (id: string): BuildingCatalogEntry | undefined =>
    catalog.find((e) => e.id === id);
  const refusal = (id: string, tiles: Tile[], rotation: 0 | 1 | 2 | 3): string | null => {
    if (!touchesStreet(grid, tiles)) return PLACEMENT_REFUSALS.needsStreet;
    const x0 = Math.min(...tiles.map((t) => t.x));
    const z0 = Math.min(...tiles.map((t) => t.z));
    return frontTouchesStreet(grid, entryOf(id)!, x0, z0, rotation)
      ? null
      : PLACEMENT_REFUSALS.frontsAway;
  };
  const previews: (ToolPreview | null)[] = [];
  const sent: Command[][] = [];
  const env: ToolEnv = {
    screenToTile: (sx, sy) => ({ x: sx, z: sy }),
    send: (_label, commands) => sent.push(commands),
    roadSpec: () => {
      throw new Error('no road spec');
    },
    entry: entryOf,
    onPreview: (p) => previews.push(p),
    canPlace: (tiles, rotation = 0) =>
      tiles.every((t) => grid.roadTier[at(t.x, t.z)] === RoadTier.None) &&
      refusal(catalogId, tiles, rotation) === null,
    placeRefusal: refusal,
    frontingTurns: (id, x, z) => frontingTurns(grid, entryOf(id)!, x, z),
  };
  const tm = new ToolManager(env);
  tm.setTool(`plop.${catalogId}`);
  return { tm, previews, sent };
}

const hover = (r: Rig, x: number, z: number): ToolPreview => {
  r.tm.pointerMove(x, z, -1);
  return r.previews.at(-1)!;
};
const place = (r: Rig, x: number, z: number): Command => {
  r.tm.pointerDown(x, z, 0);
  r.tm.pointerUp(x, z, 0);
  return r.sent.at(-1)![0]!;
};
const row = (z: number): Tile[] => Array.from({ length: SIZE }, (_, x) => ({ x, z }));

const NORTH_ST: Tile = { x: 11, z: 9 };
const WEST_ST: Tile = { x: 9, z: 11 };

/** The school is 3 x 3: at (10, 10) its ring is x 9..13, z 9..13. */
describe('the plop ghost turns its front to the street [R-world-050]', () => {
  it.each([
    ['north', { x: 11, z: 9 }, 2],
    ['east', { x: 13, z: 11 }, 1],
    ['south', { x: 11, z: 13 }, 0],
    ['west', { x: 9, z: 11 }, 3],
  ])(
    'takes the rotation whose front is on a street to its %s, with no key pressed',
    (_s, street, front) => {
      const r = rig([street]);
      expect(hover(r, 10, 10).valid).toBe(true);
      expect(place(r, 10, 10)).toMatchObject({
        kind: 'placeBuilding',
        x: 10,
        z: 10,
        rotation: front,
      });
    },
  );

  it('keeps the only fronting turn when rotate is pressed, so it never turns away from the street', () => {
    const r = rig([NORTH_ST]);
    hover(r, 10, 10);
    r.tm.rotatePlop();
    expect(r.previews.at(-1)!.valid).toBe(true);
    r.tm.rotatePlop();
    expect(r.previews.at(-1)!.valid).toBe(true);
    expect(place(r, 10, 10)).toMatchObject({ rotation: 2 });
  });

  it('prefers the street nearer the cursor at a corner, and reaches the other by the rotate key', () => {
    const corner = (): Rig => rig([NORTH_ST, WEST_ST]);
    const none = corner();
    hover(none, 10, 10);
    expect(place(none, 10, 10)).toMatchObject({ rotation: 2 }); // north, listed first at a tie

    const once = corner();
    hover(once, 10, 10);
    once.tm.rotatePlop();
    expect(place(once, 10, 10)).toMatchObject({ rotation: 3 });

    const twice = corner();
    hover(twice, 10, 10);
    twice.tm.rotatePlop();
    twice.tm.rotatePlop();
    expect(place(twice, 10, 10)).toMatchObject({ rotation: 2 }); // round again, never east or south
  });

  it('skips a turn that fronts no street when cycling', () => {
    const r = rig([...row(9), ...row(13)]);
    hover(r, 10, 10);
    r.tm.rotatePlop(); // north, then south: east and west front nothing
    expect(place(r, 10, 10)).toMatchObject({ rotation: 0 });
  });

  it('keeps the player’s turn as the cursor moves along the street', () => {
    const r = rig([...row(9), ...row(13)]);
    hover(r, 10, 10);
    r.tm.rotatePlop();
    hover(r, 15, 10);
    expect(r.previews.at(-1)!.valid).toBe(true);
    expect(place(r, 15, 10)).toMatchObject({ x: 15, z: 10, rotation: 0 });
  });

  it('slides one tile toward a street one tile off, and sends where it stood', () => {
    const r = rig([9, 10, 11, 12, 13].map((x) => ({ x, z: 8 })));
    const preview = hover(r, 11, 10); // footprint z 10..12; the street is at z 8, a tile off its ring
    expect(preview.valid).toBe(true);
    expect(preview.tiles[0]).toEqual({ x: 11, z: 9 });
    expect(place(r, 11, 10)).toMatchObject({ x: 11, z: 9, rotation: 2 });
  });

  it('does not slide two tiles', () => {
    const r = rig([9, 10, 11, 12, 13].map((x) => ({ x, z: 7 })));
    const preview = hover(r, 11, 10);
    expect(preview.tiles[0]).toEqual({ x: 11, z: 10 });
    expect(preview.valid).toBe(false);
    expect(preview.invalidReason).toBe(PLACEMENT_REFUSALS.needsStreet);
  });

  it('shows the refusal where no street is near', () => {
    const preview = hover(rig([]), 10, 10);
    expect(preview.valid).toBe(false);
    expect(preview.invalidReason).toBe(PLACEMENT_REFUSALS.needsStreet);
  });

  it('leaves a building that stands off the street where the cursor is, turned as it was', () => {
    const r = rig([], 'wind-turbine');
    expect(hover(r, 10, 10).tiles).toEqual([{ x: 10, z: 10 }]);
    expect(place(r, 10, 10)).toMatchObject({ x: 10, z: 10, rotation: 0 });
  });
});
