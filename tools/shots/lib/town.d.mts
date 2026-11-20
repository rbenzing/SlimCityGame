export interface Tile {
  x: number;
  z: number;
}
export function row(x0: number, z: number, n: number): Tile[];
export function column(x: number, z0: number, n: number): Tile[];
export function rect(x0: number, z0: number, w: number, d: number): Tile[];
export function districtBox(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h?: number,
): { x0: number; z0: number; x1: number; z1: number; h: number };
