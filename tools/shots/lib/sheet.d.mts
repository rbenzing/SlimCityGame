export const ROWS_PER_SHEET: number;
export const CELL_WIDTH: number;
export interface SheetRow {
  row: string;
  cells: (string | null)[];
}
export function layoutSheets(
  rows: string[],
  frames: string[],
): { columns: number; sheets: SheetRow[][] };
