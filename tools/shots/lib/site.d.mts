export interface RowSubject {
  id: string;
  w: number;
  d: number;
  h: number;
}
export interface PlacedSubject extends RowSubject {
  dx: number;
  band: number;
}
export function layoutRow(
  subjects: RowSubject[],
  tile: number,
): {
  placed: PlacedSubject[];
  width: number;
  bands: { deepest: number; end: number }[];
};
