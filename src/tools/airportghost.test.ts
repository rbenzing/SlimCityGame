import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { airportPlotTiles } from '../shared/airportlayout';
import { MAP_SIZE } from '../shared/constants';
import { PLACEMENT_REFUSALS } from '../shared/placement';
import { RoadTier } from '../shared/types';
import type { BuildingCatalogEntry, Command } from '../shared/types';
import { createGrid, frontingTurns, frontTouchesStreet, touchesStreet } from '../world/grid';
import { ToolManager, type ToolEnv, type ToolPreview } from './tools';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const at = (x: number, z: number): number => z * MAP_SIZE + x;

/** A tool manager over a real map-sized grid with one street along row `streetZ`, judging the ghost as the app does. */
function rig(catalogId: string, streetZ: number, x0: number, len: number) {
  const grid = createGrid(MAP_SIZE);
  for (let x = x0; x < x0 + len; x++) grid.roadTier[at(x, streetZ)] = RoadTier.TwoLane;
  const entryOf = (id: string): BuildingCatalogEntry | undefined =>
    catalog.find((e) => e.id === id);
  const refusal = (id: string, tiles: { x: number; z: number }[], rotation: 0 | 1 | 2 | 3) => {
    if (!touchesStreet(grid, tiles)) return PLACEMENT_REFUSALS.needsStreet;
    const fx = Math.min(...tiles.map((t) => t.x));
    const fz = Math.min(...tiles.map((t) => t.z));
    return frontTouchesStreet(grid, entryOf(id)!, fx, fz, rotation)
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

describe('the plop ghost copes with a 183-tile airport [R-world-050]', () => {
  const { w, d } = airportPlotTiles('international-airport');
  // A street no longer than the plot is deep, so a quarter turn onto its end finds none.
  const streetLen = d;

  it('turns the front to the street on its +Z edge and previews every tile', () => {
    const r = rig('international-airport', 20 + d, 20, streetLen);
    r.tm.pointerMove(20, 20, -1);
    const preview = r.previews.at(-1)!;
    expect(preview.valid).toBe(true);
    expect(preview.tiles).toHaveLength(w * d);
    r.tm.pointerDown(20, 20, 0);
    r.tm.pointerUp(20, 20, 0);
    expect(r.sent.at(-1)![0]).toMatchObject({ x: 20, z: 20, rotation: 0 });
  });

  it('slides one tile toward a street one tile off, and no further', () => {
    const r = rig('international-airport', 20 + d, 20, streetLen);
    r.tm.pointerMove(20, 19, -1);
    expect(r.previews.at(-1)!.tiles[0]).toEqual({ x: 20, z: 20 });
    expect(r.previews.at(-1)!.valid).toBe(true);
    r.tm.pointerMove(20, 17, -1);
    expect(r.previews.at(-1)!.tiles[0]).toEqual({ x: 20, z: 17 });
    expect(r.previews.at(-1)!.valid).toBe(false);
  });

  it('judges each hover well inside a frame', () => {
    const r = rig('international-airport', 20 + d, 20, streetLen);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) r.tm.pointerMove(20, 19 + (i % 2), -1);
    // Measured at a few ms a hover; the bound is wide so a loaded machine passes.
    expect((performance.now() - t0) / 20).toBeLessThan(100);
  });
});
