export const JUNCTION_CLEARANCE: number;
export const WIDTH_TOLERANCE_M: number;
export const STEP_TOLERANCE_M: number;
export const FOOTWAY: string;
export const LEGEND: Record<string, string>;

export interface Span {
  from: number;
  to: number;
}
export interface Band {
  color: string;
  axis: 'x' | 'z';
  from: number;
  to: number;
  near: Span;
  far: Span;
}
export interface RunTile {
  at: number;
  x: number;
  z: number;
  paint: Band[];
  grid: { lanes: number; width: number; distance?: number } | null;
  mesh: { lanes: number; width: number } | null;
}
export interface Measured {
  axis: 'x' | 'z';
  x?: number;
  z?: number;
  from: number;
  to: number;
}
export interface SeamStep {
  label: string;
  step: number;
  leaving: Span;
  arriving: Span;
}

export function median(xs: number[]): number;
export function bandsOf(tile: RunTile, axis: string): Band[];
export function signatureOf(bands: Band[]): string;
export function describeTile(t: RunTile): string;
export function seamSteps(
  a: Band[],
  c: Band[],
  options?: { jittered?: boolean; tolerance?: number },
): SeamStep[];
export function auditRun(run: {
  tag: string;
  tiles: RunTile[];
  measured: Measured;
  junctions: { x: number; z: number }[];
  jittered?: boolean;
}): { failures: string[]; notes: string[]; stats: { seams: number; uniform: number } };
export function judgeOverpass(o: {
  tag: string;
  crossedOver: boolean;
  tierBeneath: number;
  expectedTier: number;
  raisedRows: number[];
}): { verdict: string; failure?: string };
export function classifyColour(c: string): string;
export function cornerText(grid: (string | null)[], n: number): { text: string; unknown: string[] };
export function footwayPatches(
  grid: (string | null)[],
  n: number,
): {
  edges: Record<'n' | 's' | 'e' | 'w', Set<number>>;
  shares: (a: string, b: string) => boolean;
  runsPast: (arm: string) => boolean | null;
  patches: number;
};
export function judgeFootway(
  walk: ReturnType<typeof footwayPatches>,
  serviceArms: string[],
): { corners: number; broken: string[]; mouths: number; cut: string[]; arriving: string };
export function crosswalkFindings(
  cells: (string | null)[],
  cols: number,
): { failures: string[]; bars: number };
export function rowLampOffsets(
  poles: { x: number; z: number }[],
  at: { z: number; x0: number; x1: number; tile: number },
): number[];
