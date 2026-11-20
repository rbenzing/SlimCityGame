/** Contact sheets: a series' frames laid out so one image shows a whole subject.
 *
 * One row a subject, one column a view in the standard order, details after, the frame's name
 * under each cell, at most ROWS_PER_SHEET rows a sheet. The frames are loaded into a blank page of
 * the series' own browser and that page is photographed, so no image library is needed.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROWS_PER_SHEET = 6;
/** A cell is wide enough to see a missing wall or a cut top. */
export const CELL_WIDTH = 380;
const CELL_HEIGHT = Math.round((CELL_WIDTH * 800) / 1280);
const LABEL_HEIGHT = 22;
const GAP = 6;
/** The standard views, in the order the columns run. */
const VIEW_ORDER = ['above', 'front', 'rear', 'left', 'right', 'along', 'oblique', 'full'];

/**
 * The sheets' layout: `columns` the count of cells across, and sheets of rows `{ row, cells }`,
 * `cells` the frame names left to right (`null` where a row has none). A column a view used by
 * any row, then the row's own extras with no gap: its night frame, then its details.
 * `rows` are the subject names in order; a frame belongs to the row whose name is the longest
 * prefix of the frame's name.
 */
export function layoutSheets(rows, frames) {
  const byLength = [...rows].sort((a, b) => b.length - a.length);
  const found = new Map(rows.map((r) => [r, { views: new Map(), extras: [] }]));
  for (const frame of frames) {
    const row = byLength.find((r) => frame.startsWith(`${r}-`));
    if (!row) throw new Error(`frame '${frame}' belongs to no subject`);
    const column = frame.slice(row.length + 1);
    const { views, extras } = found.get(row);
    if (VIEW_ORDER.includes(column)) views.set(column, frame);
    else if (column === 'night') extras.unshift(frame);
    else extras.push(frame);
  }
  const live = rows.filter((r) => found.get(r).views.size + found.get(r).extras.length > 0);
  const standard = VIEW_ORDER.filter((v) => live.some((r) => found.get(r).views.has(v)));
  const columns = standard.length + Math.max(0, ...live.map((r) => found.get(r).extras.length));
  const laid = live.map((row) => {
    const { views, extras } = found.get(row);
    const cells = [...standard.map((v) => views.get(v) ?? null), ...extras];
    while (cells.length < columns) cells.push(null);
    return { row, cells };
  });
  const sheets = [];
  for (let i = 0; i < laid.length; i += ROWS_PER_SHEET)
    sheets.push(laid.slice(i, i + ROWS_PER_SHEET));
  return { columns, sheets };
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Cells across a sheet: up to the last one any of its rows fills. */
const acrossOf = (sheet) =>
  Math.max(...sheet.flatMap((r) => r.cells.map((frame, i) => (frame ? i + 1 : 0))));

const html = (sheet, across) => {
  const cell = (frame) =>
    frame
      ? `<div class="c"><img src="${frame}.png" width="${CELL_WIDTH}" height="${CELL_HEIGHT}"><p>${escape(frame)}</p></div>`
      : `<div class="c"><div class="none" style="height:${CELL_HEIGHT}px"></div><p>-</p></div>`;
  const body = sheet
    .map((r) => `<div class="r">${r.cells.slice(0, across).map(cell).join('')}</div>`)
    .join('');
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#222;color:#ddd;font:13px monospace}
.r{display:flex;gap:${GAP}px;margin-bottom:${GAP}px}
.c{width:${CELL_WIDTH}px}
.c p{margin:2px 0 0;height:${LABEL_HEIGHT - 2}px;overflow:hidden;white-space:nowrap}
.none{background:#333}
img{display:block;object-fit:contain;background:#111}</style>${body}`;
};

/**
 * Write `sheet-<n>.png` into `dir` for the frames `frames` (names without `.png`), laid out by
 * `rows`. Returns how many sheets were written.
 */
export async function writeSheets(browser, dir, rows, frames) {
  for (const f of readdirSync(dir)) if (/^sheet-\d+\.png$/.test(f)) rmSync(`${dir}/${f}`);
  const { sheets } = layoutSheets(rows, frames);
  const sheetPage = await browser.newPage();
  const file = `${dir}/sheet.html`;
  try {
    mkdirSync(dir, { recursive: true });
    for (const [i, sheet] of sheets.entries()) {
      const across = acrossOf(sheet);
      writeFileSync(file, html(sheet, across));
      const width = across * (CELL_WIDTH + GAP);
      const height = sheet.length * (CELL_HEIGHT + LABEL_HEIGHT + GAP);
      await sheetPage.setViewportSize({ width, height });
      await sheetPage.goto(pathToFileURL(file).href);
      await sheetPage.waitForFunction(
        () => [...document.images].every((img) => img.complete),
        null,
        {
          timeout: 30000,
        },
      );
      await sheetPage.screenshot({ path: `${dir}/sheet-${i + 1}.png` });
    }
  } finally {
    rmSync(file, { force: true });
    await sheetPage.close();
  }
  return sheets.length;
}
