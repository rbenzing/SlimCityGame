/**
 * The transit depots as the registry holds them: which ones field vehicles
 * this tick, how many each mode's pool holds, and how many of a depot's
 * vehicles are out on the lines. A depot fields only while it stands built,
 * with power on its lot and its footprint touching the network its mode runs on — the
 * streets for a bus, the tram track for a tram, the railway for a train — by
 * the same tier predicates those networks are built from.
 */
import { footprintForRotation } from '../shared/footprint';
import { fieldsOf } from '../shared/transitfleet';
import {
  BuildingState,
  isRailTier,
  isStreetTier,
  isTramTier,
  type BuildingCatalogEntry,
  type BuildingInstance,
  type GridState,
  type TilePoint,
  type TransitMode,
} from '../shared/types';
import { hasAdjacentTier } from '../world/grid';
import { footprintServed } from './growth';

export interface ConnectedDepot {
  id: number;
  mode: TransitMode;
  /** The vehicles it holds. */
  holds: number;
  /** The vehicles it fields: its holding less the spare fifth. */
  fields: number;
  /** The tiles of its turned footprint, row by row; its gate is whichever lies nearest the network. */
  tiles: TilePoint[];
}

const NETWORK_OF: Readonly<Record<TransitMode, (tier: number) => boolean>> = {
  bus: isStreetTier,
  tram: isTramTier,
  rail: isRailTier,
};

/** Every depot fielding vehicles this tick, in ascending building id. */
export function connectedDepots(
  g: GridState,
  buildings: readonly BuildingInstance[],
  catalog: ReadonlyMap<string, BuildingCatalogEntry>,
): ConnectedDepot[] {
  const depots: ConnectedDepot[] = [];
  for (const b of buildings) {
    const entry = catalog.get(b.catalogId);
    const depot = entry?.depot;
    if (!entry || !depot) continue;
    if (b.state !== BuildingState.Active) continue;
    const { w, d } = footprintForRotation(entry, b.rotation);
    // Powered as growth judges it: the power layer reaches a tile of the lot.
    if (!footprintServed(g.power, b.x, b.z, w, d)) continue;
    if (!hasAdjacentTier(g, b.x, b.z, w, d, NETWORK_OF[depot.mode])) continue;
    const tiles: TilePoint[] = [];
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) tiles.push({ x: b.x + dx, z: b.z + dz });
    }
    depots.push({
      id: b.id,
      mode: depot.mode,
      holds: depot.fleet,
      fields: fieldsOf(depot.fleet),
      tiles,
    });
  }
  return depots.sort((a, b) => a.id - b.id);
}

/** The vehicles each mode's connected depots field, summed. */
export function fleetPools(depots: readonly ConnectedDepot[]): Record<TransitMode, number> {
  const pools: Record<TransitMode, number> = { bus: 0, rail: 0, tram: 0 };
  for (const depot of depots) pools[depot.mode] += depot.fields;
  return pools;
}

/**
 * How many of one depot's vehicles are out on its mode's lines: what the
 * transit tick's assignment says left it, and nothing for a depot that is not
 * fielding this tick, whatever the assignment remembers of it.
 */
export function inServiceAt(
  depots: readonly ConnectedDepot[],
  id: number,
  leftFrom: ReadonlyMap<number, number>,
): number {
  if (!depots.some((d) => d.id === id)) return 0;
  return leftFrom.get(id) ?? 0;
}
