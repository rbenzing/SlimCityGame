import { describe, expect, it } from 'vitest';
import { TILE_METERS } from './constants';
import { carriagewayWidth, laneWidthFor, presetProfileForTier } from './roadprofile';
import {
  closedAt,
  dropWidth,
  laneTaperTiles,
  paintsGore,
  TAPER_MAX_TILES,
  taperedCrossSection,
  taperTilesFor,
} from './taper';
import { RoadTier } from './types';
import type { RoadClassId } from './types';

describe('how long a lane takes to close', () => {
  it('closes a motorway lane at 1:50 and a street lane over half a block', () => {
    // 3.6 m at 1:50 is 180 m, which is eleven 16 m tiles.
    expect(laneTaperTiles('highway')).toBe(11);
    // 3.05 m at 1:15 is 46 m: three tiles, the 35–50 m the standard gives.
    expect(laneTaperTiles('local')).toBe(3);
    expect(laneTaperTiles('urban')).toBe(3);
    expect(laneTaperTiles('arterial')).toBe(3);
  });

  it('gives a motorway a far longer taper than a street, because it is closed at speed', () => {
    expect(laneTaperTiles('highway')).toBeGreaterThan(laneTaperTiles('urban'));
    expect(laneTaperTiles('divided')).toBeGreaterThan(laneTaperTiles('local'));
  });

  it('is the ratio times the width, in tiles', () => {
    // Two motorway lanes would close over 350 m; the game stops at the length
    // a corridor can hold.
    expect(taperTilesFor('highway', 2 * laneWidthFor('highway'))).toBe(TAPER_MAX_TILES);
    expect(taperTilesFor('local', laneWidthFor('local') / 2)).toBe(
      Math.round((15 * laneWidthFor('local')) / 2 / TILE_METERS),
    );
  });

  it('closes nothing in no tiles, and anything at all in at least one', () => {
    expect(taperTilesFor('local', 0)).toBe(0);
    expect(taperTilesFor('local', 0.2)).toBe(1);
    expect(taperTilesFor('rail', 3)).toBe(0); // a railway has no lanes to drop
  });
});

describe('what a taper takes off the road', () => {
  const four = presetProfileForTier(RoadTier.FourLane);
  const two = presetProfileForTier(RoadTier.TwoLane);

  it('measures the drop across the carriageway, and reads a widening as no drop', () => {
    expect(dropWidth(four, two)).toBeCloseTo(carriagewayWidth(four) - carriagewayWidth(two), 6);
    expect(dropWidth(two, four)).toBe(0);
    expect(dropWidth(four, four)).toBe(0);
  });

  it('closes the kerbside lanes and leaves the ones by the centreline', () => {
    const closing = taperedCrossSection(four, 3);
    const widths = closing.pieces.filter((p) => p.kind === 'travel').map((p) => p.width);
    // Four lanes still, but the two outside ones have given up the width.
    expect(widths).toHaveLength(4);
    expect(widths[1]).toBe(3.75);
    expect(widths[2]).toBe(3.75);
    expect(widths[0]! + widths[3]!).toBeCloseTo(2 * 3.75 - 3, 6);
    expect(carriagewayWidth(closing)).toBeCloseTo(carriagewayWidth(four) - 3, 6);
  });

  it('drops a lane out of the section once it has closed to nothing', () => {
    const gone = taperedCrossSection(four, 2 * 3.75);
    expect(gone.pieces.filter((p) => p.kind === 'travel')).toHaveLength(2);
    expect(carriagewayWidth(gone)).toBeCloseTo(carriagewayWidth(four) - 7.5, 6);
  });

  it('leaves everything that is not a travel lane alone', () => {
    // A street with footways keeps them the whole way through the drop: they
    // are the road's, not the lane's.
    const closing = taperedCrossSection(two, 1.5);
    expect(closing.pieces.filter((p) => p.kind === 'sidewalk').map((p) => p.width)).toEqual([
      1.875, 1.875,
    ]);
  });

  it('hands back the same road when nothing closes', () => {
    expect(taperedCrossSection(four, 0)).toBe(four);
  });
});

describe('where along the taper a tile stands', () => {
  it('closes the lane linearly, and completely on the tile that meets the narrow road', () => {
    const step = { length: 4, closed: 4, remaining: 4 };
    expect(closedAt(step)).toBe(0); // the head of the taper: nothing closed yet
    expect(closedAt({ ...step, remaining: 2 })).toBe(2);
    expect(closedAt({ ...step, remaining: 0 })).toBe(4);
  });

  it('never closes more than the drop, however the tile counts fall', () => {
    expect(closedAt({ length: 3, closed: 3.5, remaining: -1 })).toBe(3.5);
    expect(closedAt({ length: 0, closed: 3.5, remaining: 0 })).toBe(3.5);
  });
});

describe('the gore in the wedge a closing lane leaves', () => {
  it('is painted where the road is closed at speed, and nowhere else', () => {
    expect(paintsGore('highway')).toBe(true);
    expect(paintsGore('ramp')).toBe(true);
    expect(paintsGore('divided')).toBe(true);
    expect(paintsGore('urban')).toBe(false);
    expect(paintsGore('local')).toBe(false);
  });

  it('is never painted on a surface that takes no paint', () => {
    const unpaved: RoadClassId[] = ['dirt', 'rail'];
    for (const id of unpaved) expect(paintsGore(id), id).toBe(false);
  });
});
