/**
 * The built-in forms: for a kind that stacks, the next level's building stood
 * on a lot the kind already stands on, in as many storeys as its floor needs,
 * with its parking built in. One form for every (kind, next level, lot); the
 * catalog holds them as entries because a save names a building by catalog id.
 * Pure: the catalog's data and its test both come from here.
 */
import { BUILT_IN_PARKING_MILESTONE, ceilingMilestone } from './constants';
import { builtInParking } from './garage';
import { bodyPlateM2, FLOOR_HEIGHT_METERS, grossFloorM2, storeysOf } from './floorarea';
import type { BuildingCatalogEntry, BuildingKind } from './types';

/** The kinds that go up when they cannot spread. */
export const STACKING_KINDS: ReadonlySet<BuildingKind> = new Set([
  'shop',
  'restaurant',
  'office',
  'hotel',
  'midrise',
  'mixed',
  'tower',
]);

/** The tallest a rebuild goes, the catalog's tallest building. */
export const MAX_STACKED_HEIGHT_M = 80;

/** The id of the built-in form of `next` on a lot of `w` by `d` tiles. */
export function stackedId(next: BuildingCatalogEntry, w: number, d: number): string {
  return `${next.id}-up${w}x${d}`;
}

/** Whether a catalog entry is a built-in form. */
export function isStacked(entry: BuildingCatalogEntry): boolean {
  return entry.stacked !== undefined;
}

/**
 * The built-in form of `next` standing on `footprint` tiles. Its body fills the
 * lot's plate; its working storeys are the next level's floor over that plate,
 * rounded up, and every parking storey above ground stands on top of them.
 */
export function stackedFormOf(
  next: BuildingCatalogEntry,
  footprint: { w: number; d: number },
): BuildingCatalogEntry {
  const draft: BuildingCatalogEntry = { ...next, footprint: { ...footprint } };
  delete draft.bodyFootprint;
  const workingStoreys = Math.max(1, Math.ceil(grossFloorM2(next) / bodyPlateM2(draft) - 1e-9));
  draft.stacked = { workingStoreys };
  const { aboveStoreys } = builtInParking(draft);
  const storeys = workingStoreys + aboveStoreys;
  const height =
    workingStoreys === storeysOf(next) && aboveStoreys === 0
      ? next.height
      : Math.round(storeys * FLOOR_HEIGHT_METERS * 10) / 10;
  return {
    ...draft,
    id: stackedId(next, footprint.w, footprint.d),
    height,
    unlockMilestone: Math.max(
      next.unlockMilestone,
      ceilingMilestone(height),
      BUILT_IN_PARKING_MILESTONE,
    ),
  };
}

/** Why a form is left out: over the tallest a rebuild goes, or more garage than building. Null when it stands. */
function skipReason(form: BuildingCatalogEntry): 'height' | 'garage' | null {
  if (form.height > MAX_STACKED_HEIGHT_M) return 'height';
  if (builtInParking(form).aboveStoreys > form.stacked!.workingStoreys) return 'garage';
  return null;
}

/** The forms the generator left out, by id, with the reason. */
export interface StackedForms {
  entries: BuildingCatalogEntry[];
  skipped: { id: string; heightM: number; reason: 'height' | 'garage' }[];
}

/**
 * Every built-in form of the catalog, from the catalog without them: for each
 * stacking kind and each level above its first, one form for every footprint a
 * building of the level below can stand on (its base, its larger lots and its
 * own built-in forms), the form even where the spread next level would fit.
 * Kinds in catalog order, levels ascending, lots smallest first.
 */
export function stackedFormsOf(catalog: readonly BuildingCatalogEntry[]): StackedForms {
  const spread = catalog.filter((e) => !isStacked(e));
  const kinds: BuildingKind[] = [];
  for (const e of spread) {
    if (e.kind && STACKING_KINDS.has(e.kind) && !kinds.includes(e.kind)) kinds.push(e.kind);
  }
  const result: StackedForms = { entries: [], skipped: [] };
  for (const kind of kinds) {
    const ofKind = spread.filter((e) => e.kind === kind);
    const levels = Math.max(...ofKind.map((e) => e.level ?? 1));
    let built: BuildingCatalogEntry[] = [];
    for (let level = 1; level < levels; level++) {
      const next = ofKind.find((e) => e.level === level + 1 && e.bodyFootprint === undefined);
      if (!next) continue;
      const lots = new Map<string, { w: number; d: number }>();
      for (const e of [...ofKind.filter((s) => s.level === level), ...built]) {
        lots.set(`${e.footprint.w}x${e.footprint.d}`, e.footprint);
      }
      const area = (f: { w: number; d: number }): number => f.w * f.d;
      const formed: BuildingCatalogEntry[] = [];
      for (const lot of [...lots.values()].sort((a, b) => area(a) - area(b) || a.w - b.w)) {
        const form = stackedFormOf(next, lot);
        const reason = skipReason(form);
        if (reason) result.skipped.push({ id: form.id, heightM: form.height, reason });
        else formed.push(form);
      }
      result.entries.push(...formed);
      built = formed;
    }
  }
  return result;
}
