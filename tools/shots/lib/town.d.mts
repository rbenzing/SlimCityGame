export interface Tile {
  x: number;
  z: number;
}
/** A box turned to face its street: `facing` radians from the street on +z. */
export interface TurnedBox {
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
  facing: number;
}
export interface View {
  tx: number;
  tz: number;
  distance: number;
  yaw: number;
  pitch: number;
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
export function gridBox(b: {
  catalogId: string;
  x: number;
  z: number;
  rotation: number;
}): TurnedBox;
export function framedBox(
  b: { frame: { x: number; z: number; heading: number } },
  entry: { footprint: { w: number; d: number }; height: number },
  tile: number,
): TurnedBox;
export function viewOf(name: string, box: Record<string, unknown>): View;
