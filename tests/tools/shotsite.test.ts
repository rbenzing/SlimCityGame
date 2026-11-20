import { describe, expect, it } from 'vitest';
import { layoutRow } from '../../tools/shots/lib/site.mjs';
import { buildingView } from '../../tools/shots/lib/views.mjs';

const TILE = 20;
const box = (id: string, w: number, d: number, h: number) => ({ id, w, d, h });

describe('layoutRow', () => {
  it('keeps a row that fits on one street', () => {
    const { placed, bands } = layoutRow([box('a', 4, 4, 10), box('b', 5, 4, 10)], TILE);
    expect(bands).toHaveLength(1);
    expect(placed.map((s) => s.band)).toEqual([0, 0]);
    expect(placed[1]!.dx).toBeGreaterThan(placed[0]!.dx + 4);
  });

  it('wraps a row wider than a street into bands, each starting at the street end', () => {
    // Three airports: the first two share a street, the 183-tile one starts the next.
    const { placed, bands, width } = layoutRow(
      [box('airfield', 49, 9, 6), box('regional', 107, 23, 9), box('international', 183, 33, 14)],
      TILE,
    );
    expect(placed.map((s) => s.band)).toEqual([0, 0, 1]);
    expect(placed[2]!.dx).toBe(2);
    expect(bands.map((b) => b.deepest)).toEqual([23, 33]);
    expect(width).toBe(Math.max(...bands.map((b) => b.end)));
  });
});

describe('a view of a box much wider than it is deep', () => {
  it('stays centred on the box, not slid along the view axis', () => {
    const airfield = { w: 49, d: 9, h: 6, tile: TILE, cx: 0, cz: 0 };
    const cam = buildingView('above', airfield);
    // The box is 9 tiles deep; the target stays within a third of that of its centre.
    expect(Math.abs(cam.tz)).toBeLessThan(3.5);
  });
});
