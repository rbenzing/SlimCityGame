import type { BuildingInstance, SimSnapshot } from '../shared/types';

/** True when `next` differs from `known` in its construction progress and nothing else. */
export function isProgressOnly(
  known: BuildingInstance | undefined,
  next: BuildingInstance,
): boolean {
  if (!known || known.state !== next.state || next.progress === undefined) return false;
  return (
    known.catalogId === next.catalogId &&
    known.x === next.x &&
    known.z === next.z &&
    known.rotation === next.rotation &&
    known.level === next.level &&
    known.problems === next.problems &&
    known.vacancies === next.vacancies &&
    known.frame?.x === next.frame?.x &&
    known.frame?.z === next.frame?.z &&
    known.frame?.heading === next.frame?.heading
  );
}

/**
 * Takes the buildings whose only change is how far they have got out of a
 * snapshot: those need their site redrawn and nothing else, so everything
 * keyed on the building list is spared. The snapshot returned has no
 * `buildings` when nothing else is left in its delta.
 */
export function withoutProgressOnly(
  snap: SimSnapshot,
  known: ReadonlyMap<number, BuildingInstance>,
): { snapshot: SimSnapshot; progressOnly: BuildingInstance[] } {
  const delta = snap.buildings;
  if (!delta || delta.updated.length === 0) return { snapshot: snap, progressOnly: [] };
  const progressOnly: BuildingInstance[] = [];
  const rest: BuildingInstance[] = [];
  for (const inst of delta.updated) {
    (isProgressOnly(known.get(inst.id), inst) ? progressOnly : rest).push(inst);
  }
  if (progressOnly.length === 0) return { snapshot: snap, progressOnly };
  const empty = delta.added.length === 0 && delta.removed.length === 0 && rest.length === 0;
  const snapshot: SimSnapshot = {
    ...snap,
    buildings: empty ? undefined : { ...delta, updated: rest },
  };
  if (empty) delete snapshot.buildings;
  return { snapshot, progressOnly };
}
