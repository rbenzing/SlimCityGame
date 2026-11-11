/**
 * A grown plain building's door faces its street. The box draws its door on
 * its local +Z face, and growth stores only rotation 0 or 1, so the door would
 * otherwise show south or east whatever side the street is on. A box's lot is
 * the same after a half turn, so the building is drawn turned by one when its
 * street lies on the side opposite its door. Only what is drawn is turned: the
 * stored rotation, the lot, the car park and the sim never see it.
 */
import { footprintForRotation } from '../shared/footprint';
import { frontSideOf, NO_SENSORS } from '../shared/kitfront';
import type { Side } from '../shared/roadedge';
import type {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
} from '../shared/types';
import { findStreetFacingEdge, type StreetLookup } from './frontage';
import { partsFor, isFarmEntry, isHouseEntry } from './archetypes';

const BEHIND: Readonly<Record<Side, Side>> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/**
 * A zone-grown body drawn as the bare windowed box: no house lot, no farm and
 * no kit parts (mixed-use, and a home or a block of no known kind). A placed
 * building has no zone, and a kit keeps the street side its own kit declares.
 */
export function isPlainGrownBody(entry: BuildingCatalogEntry): boolean {
  return (
    entry.zone !== undefined &&
    !isFarmEntry(entry) &&
    !isHouseEntry(entry) &&
    partsFor(entry).length === 0
  );
}

/** The building as it is drawn: a half turn on, when its street is behind its door. */
export function faceStreet(
  entry: BuildingCatalogEntry,
  building: BuildingInstance,
  street: StreetLookup,
): BuildingInstance {
  if (building.frame || !isPlainGrownBody(entry)) return building;
  const door = frontSideOf(entry, building.x, building.z, building.rotation, NO_SENSORS);
  if (door === null) return building;
  const lot = footprintForRotation(entry, building.rotation);
  const edge = findStreetFacingEdge(building.x, building.z, lot.w, lot.d, street);
  if (edge === null || edge.side !== BEHIND[door]) return building;
  return { ...building, rotation: ((building.rotation + 2) % 4) as BuildingInstance['rotation'] };
}

/**
 * A delta with every added and updated plain body turned to its street, each
 * decided once, here; the removed ids pass through. The delta that carries a
 * building again after its street changed turns it again.
 */
export function faceStreets(
  delta: BuildingDelta,
  catalogById: ReadonlyMap<string, BuildingCatalogEntry>,
  street: StreetLookup,
): BuildingDelta {
  const face = (b: BuildingInstance): BuildingInstance => {
    const entry = catalogById.get(b.catalogId);
    return entry ? faceStreet(entry, b, street) : b;
  };
  return { added: delta.added.map(face), removed: delta.removed, updated: delta.updated.map(face) };
}
