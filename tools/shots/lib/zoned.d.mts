export interface CatalogEntry {
  id: string;
  category: string;
  zone?: number;
  level?: number;
  kind?: string;
  lot?: string;
  footprint: { w: number; d: number };
  stacked?: { workingStoreys: number };
}
export interface Subject {
  id: string;
  as?: string;
}
export function catalog(): CatalogEntry[];
export function standard(kind: string, level: number): CatalogEntry;
export function roomiest(kind: string): CatalogEntry | undefined;
export function kindSubjects(kinds: string[]): Subject[];
export function stackedSubjects(kinds: string[]): Subject[];
export function subjectsOf(...ids: string[]): Subject[];
export function formOf(buildingId: number): 'ranch' | 'craftsman' | 'splitLevel';
