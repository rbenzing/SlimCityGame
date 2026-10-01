import { describe, expect, it } from 'vitest';
import { WALL_EDGE, type SoundWallSite } from '../shared/soundwallsites';
import { layOutWalls, type PlacedWall } from './soundwalls';

const site = (over: Partial<SoundWallSite> = {}): SoundWallSite => ({
  edge: WALL_EDGE.south,
  heightM: 4.5,
  faceOffsetM: 7.725,
  outward: 1,
  alongX: true,
  ...over,
});

const flat = (): number => 2;

describe('laying out a wall', () => {
  it('stands four 5 m bays to a tile, and closes the wall with an end post', () => {
    const layout = layOutWalls([{ x: 3, z: 4, site: site() }], flat);
    expect(layout.bases).toHaveLength(4);
    expect(layout.panels).toHaveLength(4);
    expect(layout.posts).toHaveLength(5);
    expect(layout.bases.map((b) => b.x)).toEqual([62.5, 67.5, 72.5, 77.5]);
    expect(layout.posts.map((p) => p.x)).toEqual([60, 65, 70, 75, 80]);
  });

  it('shares a post between tiles where the wall carries on', () => {
    const walls: PlacedWall[] = [
      { x: 3, z: 4, site: site() },
      { x: 4, z: 4, site: site() },
    ];
    const posts = layOutWalls(walls, flat)
      .posts.map((p) => p.x)
      .sort((a, b) => a - b);
    expect(posts).toEqual([60, 65, 70, 75, 80, 85, 90, 95, 100]);
  });

  it('stands the barrier at the carriageway’s edge and the panel at its back', () => {
    const layout = layOutWalls([{ x: 3, z: 4, site: site() }], flat);
    const centre = 4.5 * 20;
    expect(layout.bases[0]!.z).toBeCloseTo(centre + 7.725, 9);
    expect(layout.panels[0]!.z).toBeCloseTo(centre + 7.725 + 0.45, 9);
    expect(layout.panels[0]!.height).toBe(4.5);
  });

  it('faces the wall away from the road on either side, and either way it runs', () => {
    const away = (s: SoundWallSite): [number, number] => {
      const yaw = layOutWalls([{ x: 0, z: 0, site: s }], flat).bases[0]!.yaw;
      // The part's local +x, turned by its yaw about the vertical.
      return [Math.round(Math.cos(yaw)) + 0, Math.round(-Math.sin(yaw)) + 0];
    };
    expect(away(site({ outward: 1 }))).toEqual([0, 1]);
    expect(away(site({ outward: -1, edge: WALL_EDGE.north, faceOffsetM: -7.725 }))).toEqual([
      0, -1,
    ]);
    expect(away(site({ alongX: false, outward: 1, edge: WALL_EDGE.east }))).toEqual([1, 0]);
    expect(away(site({ alongX: false, outward: -1, edge: WALL_EDGE.west }))).toEqual([-1, 0]);
  });

  it('sets each bay on the surface where it stands', () => {
    const slope = (wx: number): number => wx / 10;
    const layout = layOutWalls([{ x: 3, z: 4, site: site() }], slope);
    expect(layout.bases.map((b) => b.y)).toEqual([6.25, 6.75, 7.25, 7.75]);
  });
});
