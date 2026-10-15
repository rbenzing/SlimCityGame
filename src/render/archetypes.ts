/**
 * Building archetypes: what a building IS, decided from its catalog entry, and
 * which parts its silhouette is assembled from.
 *
 * A warehouse, a factory and an office differ today only in height and wall
 * colour, so the skyline never says what anything does. An archetype is a
 * recipe over one shared kit of parts — a loading dock, a monitor roof, a stack,
 * a roof array, a canopy, a signage band — not a bespoke model per building.
 *
 * Pure: every export is a function of the catalog entry alone, so archetype
 * choice is testable without a scene and identical on every machine.
 */
import { ZoneType, type BuildingCatalogEntry } from '../shared/types';
import { isHouseKind } from '../shared/buildingkind';

export type BuildingArchetype =
  /** Small industrial units: a low shed with roller doors at grade and no dock. */
  | 'workshop'
  /** Low slab, roll-up doors, a loading dock. Distribution, and kindless industry at its first level. */
  | 'warehouse'
  /** Monitor roof and a stack: industry that processes something. */
  | 'factory'
  /** Clean industry — flex and R&D — a roof array and, pointedly, no stack. */
  | 'greenWorks'
  /** A food plant: a dock and doors like a warehouse, with silos and a stack. */
  | 'foodPlant'
  /** A chemical plant: a block with a tank farm in its yard and a stack. */
  | 'chemicalPlant'
  /** A steelworks: a long, tall monitor-roofed shed and a stack. */
  | 'steelworks'
  /** A paper mill: a tall monitor-roofed hall with tanks behind it and a stack. */
  | 'paperMill'
  /** A shop, strip, supermarket or restaurant: dressed by its kind, awnings or canopy, bands, and rooftop units. */
  | 'storefront'
  /** Bigger retail and offices: a signage band, no canopy. */
  | 'retailBlock'
  /** A filling station: a kiosk behind a tall canopy over the pump islands. */
  | 'fuelStation'
  /** An office block or tower: a lit lobby portal, and rooftop units or a screened cooling tower. */
  | 'office'
  /** A hotel: a porte-cochere at its entrance and a lit sign, on a tall body. */
  | 'hotel'
  /** Detached and row housing, which already carries a pitched roof. */
  | 'house'
  /** Denser housing: flat-roofed, no shopfront. */
  | 'apartment'
  /** A farmstead: its own kit of barn, silos, fields and stock (farms.ts), no industrial parts. */
  | 'farm'
  /** Everything the kit has nothing to say about. */
  | 'plain';

/** Parts the kit can hang on a building. An archetype is a set of these. */
export type BuildingPart =
  | 'loadingDock'
  | 'rollUpDoors'
  | 'monitorRoof'
  | 'roofArray'
  | 'canopy'
  | 'signageBand'
  | 'fuelCanopy'
  | 'tanks'
  | 'awning'
  | 'bulkhead'
  | 'cornice'
  | 'stripCanopy'
  | 'stripColumn'
  | 'anchorParapet'
  | 'pylon'
  | 'entryTower'
  | 'towerGlazing'
  | 'brickBase'
  | 'cartCorral'
  | 'menuBoard'
  | 'clearanceBar'
  | 'pickupCanopy'
  | 'dumpsterEnclosure'
  | 'fuelFascia'
  | 'fuelIsland'
  | 'dispenser'
  | 'bollard'
  | 'priceSign'
  | 'signPole'
  | 'lobbyPortal'
  | 'roofScreen'
  | 'coolingTower'
  | 'porteCochere'
  | 'rooftopUnit'
  | 'roofHatch'
  | 'wainscot'
  | 'walkDoor'
  | 'gutter'
  | 'downspout'
  | 'ridgeVent'
  | 'dockShelter'
  | 'dockBumper'
  | 'dockLight'
  | 'officeCorner'
  | 'officeCanopy'
  | 'panelReveal'
  | 'parapetBand'
  | 'clerestory'
  | 'entryCanopy'
  | 'condenser'
  | 'bundWall'
  | 'bullet'
  | 'pipeRack'
  | 'processColumn'
  | 'furnace'
  | 'stove'
  | 'skipBridge'
  | 'duct'
  | 'chipPile'
  | 'stacker';

/**
 * Whether an industrial building is the CLEAN kind, taken from whether it
 * actually pollutes rather than from a name or a level. Tying the silhouette to
 * the simulated property is the point: a building with no stack is a building
 * that emits nothing, and the player can read the difference from the air.
 */
export function isCleanIndustry(entry: BuildingCatalogEntry): boolean {
  return entry.category === 'ind' && !isFarmEntry(entry) && (entry.pollution ?? 0) === 0;
}

/**
 * A farm. Its jobs count as industry, but nothing about it looks like a works:
 * every renderer that dresses industry asks this first and leaves a farm to
 * its own kit.
 */
export function isFarmEntry(entry: BuildingCatalogEntry): boolean {
  return entry.zone === ZoneType.Agriculture;
}

/** A plant of the Heavy Industrial zone, which carries a stack at every level. */
export function isHeavyIndustryEntry(entry: BuildingCatalogEntry): boolean {
  return entry.zone === ZoneType.IndHeavy;
}

/**
 * A home rather than a block: a detached house, a duplex, a fourplex or a row
 * of townhouses, by the entry's kind. A home keeps a pitched roof and a lot
 * laid out from its street; anything denser is flat-topped.
 */
export function isHouseEntry(entry: BuildingCatalogEntry): boolean {
  return isHouseKind(entry.kind);
}

export function archetypeFor(entry: BuildingCatalogEntry): BuildingArchetype {
  if (isFarmEntry(entry)) return 'farm';
  if (entry.category === 'ind') {
    switch (entry.kind) {
      case 'workshop':
        return 'workshop';
      case 'warehouse':
        return 'warehouse';
      case 'factory':
        return 'factory';
      case 'flex':
        return 'greenWorks';
      case 'foodplant':
        return 'foodPlant';
      case 'chemical':
        return 'chemicalPlant';
      case 'metals':
        return 'steelworks';
      case 'paper':
        return 'paperMill';
      default:
        if (isCleanIndustry(entry)) return 'greenWorks';
        return (entry.level ?? 1) >= 2 ? 'factory' : 'warehouse';
    }
  }
  if (entry.category === 'com') {
    switch (entry.kind) {
      case 'fuel':
        return 'fuelStation';
      case 'office':
        return 'office';
      case 'hotel':
        return 'hotel';
      case 'shop':
      case 'strip':
      case 'supermarket':
      case 'restaurant':
        return 'storefront';
      default:
        return (entry.level ?? 1) >= 2 ? 'retailBlock' : 'storefront';
    }
  }
  if (entry.category === 'res') {
    return isHouseEntry(entry) ? 'house' : 'apartment';
  }
  return 'plain';
}

const PARTS: Readonly<Record<BuildingArchetype, readonly BuildingPart[]>> = {
  workshop: ['rollUpDoors'],
  warehouse: ['loadingDock', 'rollUpDoors'],
  factory: ['monitorRoof'],
  greenWorks: ['roofArray'],
  foodPlant: ['loadingDock', 'rollUpDoors'],
  chemicalPlant: ['tanks'],
  steelworks: ['monitorRoof'],
  paperMill: ['monitorRoof', 'tanks'],
  storefront: ['canopy', 'signageBand'],
  retailBlock: ['signageBand'],
  fuelStation: [
    'fuelCanopy',
    'fuelFascia',
    'fuelIsland',
    'dispenser',
    'bollard',
    'priceSign',
    'signPole',
    'awning',
    'rooftopUnit',
    'roofHatch',
  ],
  office: ['lobbyPortal', 'rooftopUnit', 'roofHatch'],
  hotel: ['porteCochere', 'signageBand', 'rooftopUnit', 'roofHatch'],
  house: [],
  apartment: [],
  farm: [],
  plain: [],
};

/** A storefront of a known kind is dressed by its kind; one of no kind keeps the plain canopy and band. */
const STOREFRONT_PARTS: Readonly<Record<string, readonly BuildingPart[]>> = {
  shop: ['bulkhead', 'awning', 'signageBand', 'cornice', 'rooftopUnit', 'roofHatch'],
  strip: [
    'stripCanopy',
    'stripColumn',
    'signageBand',
    'anchorParapet',
    'pylon',
    'signPole',
    'rooftopUnit',
    'roofHatch',
  ],
  supermarket: [
    'entryTower',
    'towerGlazing',
    'anchorParapet',
    'brickBase',
    'cartCorral',
    'signPole',
    'signageBand',
    'rooftopUnit',
    'roofHatch',
  ],
  restaurant: [
    'awning',
    'signageBand',
    'menuBoard',
    'clearanceBar',
    'pickupCanopy',
    'dumpsterEnclosure',
    'signPole',
    'rooftopUnit',
    'roofHatch',
  ],
};

/** The dock bank a distribution centre and a food plant share: doors on a platform, each framed, bumped and lit. */
const DOCK_BANK_PARTS: readonly BuildingPart[] = [
  'loadingDock',
  'rollUpDoors',
  'dockShelter',
  'dockBumper',
  'dockLight',
  'officeCorner',
  'officeCanopy',
];

/** An industrial building of a known kind is dressed by its kind; one of no kind keeps its archetype's plain parts. */
const INDUSTRY_PARTS: Readonly<Record<string, readonly BuildingPart[]>> = {
  workshop: ['rollUpDoors', 'walkDoor', 'wainscot', 'gutter', 'downspout', 'ridgeVent'],
  warehouse: [...DOCK_BANK_PARTS, 'panelReveal', 'parapetBand'],
  factory: [
    'monitorRoof',
    'clerestory',
    'rollUpDoors',
    'walkDoor',
    'wainscot',
    'gutter',
    'downspout',
  ],
  flex: ['roofArray', 'entryCanopy', 'wainscot'],
  foodplant: [...DOCK_BANK_PARTS, 'condenser'],
  chemical: ['tanks', 'bundWall', 'bullet', 'pipeRack', 'processColumn'],
  metals: ['monitorRoof', 'furnace', 'stove', 'skipBridge', 'duct'],
  paper: ['monitorRoof', 'tanks', 'chipPile', 'stacker'],
};

/** An office tower, the third level, stands a screened cooling tower on its roof in place of rooftop units. */
const OFFICE_TOWER_PARTS: readonly BuildingPart[] = [
  'lobbyPortal',
  'roofScreen',
  'coolingTower',
  'roofHatch',
];

export function partsFor(entry: BuildingCatalogEntry): readonly BuildingPart[] {
  const archetype = archetypeFor(entry);
  if (archetype === 'storefront') return STOREFRONT_PARTS[entry.kind ?? ''] ?? PARTS.storefront;
  if (entry.category === 'ind' && !isFarmEntry(entry)) {
    return INDUSTRY_PARTS[entry.kind ?? ''] ?? PARTS[archetype];
  }
  if (archetype === 'office' && isOfficeTower(entry)) return OFFICE_TOWER_PARTS;
  return PARTS[archetype];
}

/** An office of the third level, the tower. */
export function isOfficeTower(entry: BuildingCatalogEntry): boolean {
  return entry.kind === 'office' && (entry.level ?? 1) >= 3;
}

export function hasPart(entry: BuildingCatalogEntry, part: BuildingPart): boolean {
  return partsFor(entry).includes(part);
}
