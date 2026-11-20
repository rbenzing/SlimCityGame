export interface Camera {
  tx: number;
  tz: number;
  distance: number;
  yaw: number;
  pitch: number;
}
export interface BuildingBox {
  w: number;
  d: number;
  h: number;
  tile: number;
  cx: number;
  cz: number;
  street?: 'S' | 'E' | 'N' | 'W';
}
export interface RoadRun {
  x0: number;
  z0: number;
  length: number;
  tile: number;
  axis?: 'x' | 'z';
  width?: number;
  height?: number;
  line?: number;
}
export const MIN_DISTANCE: number;
export const MAX_DISTANCE: number;
export const MIN_PITCH: number;
export const MAX_PITCH: number;
export const ASPECT: number;
export const MARGIN: number;
export const HUD: number;
export const FACE_PITCH: number;
export const PAD: number;
export const BUILDING_VIEWS: string[];
export const ROAD_VIEWS: string[];
export function buildingView(view: string, box: BuildingBox): Camera;
export function threeQuarterView(box: BuildingBox): Camera;
export function roadView(view: string, run: RoadRun): Camera;
export function rowGaps(boxes: Omit<BuildingBox, 'cx' | 'cz'>[]): number[];
