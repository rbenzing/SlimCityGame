import { describe, expect, it } from 'vitest';
import { layoutSheets, ROWS_PER_SHEET } from '../../tools/shots/lib/sheet.mjs';
import { MAX_DISTANCE, buildingView, roadView } from '../../tools/shots/lib/views.mjs';

const VIEWS = ['above', 'front', 'rear', 'left', 'right'];
const frames = (subject: string) => VIEWS.map((v) => `${subject}-${v}`);

describe('layoutSheets', () => {
  it('lays one row a subject: the views, then night, then details, with no empty column between', () => {
    const { columns, sheets } = layoutSheets(
      ['a', 'b'],
      [...frames('a'), 'a-yard', 'a-door', ...frames('b'), 'a-night'],
    );
    expect(columns).toBe(8);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.map((r) => r.row)).toEqual(['a', 'b']);
    expect(sheets[0]![0]!.cells.slice(5)).toEqual(['a-night', 'a-yard', 'a-door']);
    expect(sheets[0]![1]!.cells.slice(5)).toEqual([null, null, null]);
  });

  it('leaves out a standard view no row has', () => {
    const { sheets } = layoutSheets(['r'], ['r-above', 'r-along', 'r-oblique', 'r-corner']);
    expect(sheets[0]![0]!.cells).toEqual(['r-above', 'r-along', 'r-oblique', 'r-corner']);
  });

  it('starts a new sheet after the row limit', () => {
    const rows = Array.from({ length: ROWS_PER_SHEET + 1 }, (_, i) => `s${i}`);
    const { sheets } = layoutSheets(rows, rows.flatMap(frames));
    expect(sheets.map((s) => s.length)).toEqual([ROWS_PER_SHEET, 1]);
  });

  it('gives a frame to the longest subject name that prefixes it', () => {
    const { sheets } = layoutSheets(['hall', 'hall-east'], ['hall-above', 'hall-east-above']);
    expect(sheets[0]!.find((r) => r.row === 'hall-east')!.cells).toEqual(['hall-east-above']);
    expect(sheets[0]!.find((r) => r.row === 'hall')!.cells).toEqual(['hall-above']);
  });

  it('refuses a frame no subject owns', () => {
    expect(() => layoutSheets(['a'], ['b-above'])).toThrow(/belongs to no subject/);
  });
});

describe('a road piece judged close up', () => {
  const run = (length: number, width: number) => ({ x0: 0, z0: 0, length, width, tile: 20 });

  it('frames the junction and its arms nearer than the whole pad', () => {
    for (const view of ['above', 'oblique']) {
      expect(roadView(view, run(5, 5)).distance).toBeLessThan(roadView(view, run(11, 11)).distance);
    }
  });
});

describe('a box wider than the camera reaches', () => {
  const view = (w: number) => buildingView('above', { w, d: 33, h: 14, tile: 20, cx: 0, cz: 0 });

  it('reports the distance it wanted past the camera limit', () => {
    expect(view(183).needed!).toBeGreaterThan(MAX_DISTANCE);
    expect(view(183).distance).toBe(MAX_DISTANCE);
  });

  it('is within reach as a slice of the plot', () => {
    expect(view(183 * 0.4).needed!).toBeLessThanOrEqual(MAX_DISTANCE);
  });
});
