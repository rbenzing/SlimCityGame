export interface Colour {
  r: number;
  g: number;
  b: number;
}
export interface Sampled extends Colour {
  max: number;
}
export interface Png {
  width: number;
  height: number;
  at(x: number, y: number): number[];
}
export const BODY_BAND: [number, number];
export const GROUND_BAND: [number, number];
export const NOON_LUMA: [number, number];
export function decodePng(buf: Buffer): Png;
export function readPng(path: string): Png;
export function sample(png: Png, box: { x: number; y: number; w: number; h: number }): Sampled;
export function luma(c: Colour): number;
export function show(c: Colour): string;
export function toLight(c: Colour): Colour;
export function lightRatio(night: Colour, noon: Colour): number;
export function noonProblem(noon: Colour): string | null;
export function bandProblem(ratio: number, band: [number, number]): string | null;
