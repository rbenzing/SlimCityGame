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
import { isApartmentKind, isHouseKind, isWalkUpKind } from '../shared/buildingkind';

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
  /** Denser housing: the walk-ups under a hip roof, the mid-rise and the tower on a podium, dressed by kind. */
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
  | 'stacker'
  | 'hipRoofBlock'
  | 'mailKiosk'
  | 'stoop'
  | 'entryHood'
  | 'breezeway'
  | 'landing'
  | 'landingGuard'
  | 'stairFlight'
  | 'balconySlab'
  | 'balconyGuard'
  | 'patio'
  | 'storefrontBand'
  | 'brickPier'
  | 'boxBay'
  | 'elevatorBulkhead'
  | 'penthouse'
  | 'parapetStep'
  | 'baseBand'
  | 'dockScreen'
  | 'featureWall'
  | 'accentBand'
  | 'mansardBand'
  | 'ribbonBand'
  | 'tiltBand'
  | 'dockTrailer'
  | 'trailerAxle'
  | 'guardBooth'
  | 'glassFront'
  | 'baghouse'
  | 'stack'
  | 'silo'
  | 'yardFence'
  | 'flare'
  | 'flareTip'
  | 'coolingFan'
  | 'scrapYard'
  | 'gantry'
  | 'recoveryStack';

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

/**
 * An apartment block of one of the four kinds the apartment kit dresses:
 * one body at every level, a hip roof on the walk-ups, a podium under the
 * mid-rise and the tower. No roof clutter: each carries its own roof parts.
 */
export function isApartmentEntry(entry: BuildingCatalogEntry): boolean {
  return isApartmentKind(entry.kind);
}

/** A multiplex or a garden walk-up: it parks a car park on its lot and lawns the rest. */
export function isWalkUpEntry(entry: BuildingCatalogEntry): boolean {
  return isWalkUpKind(entry.kind);
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
  office: ['lobbyPortal', 'ribbonBand', 'rooftopUnit', 'roofHatch'],
  hotel: ['porteCochere', 'baseBand', 'signageBand', 'rooftopUnit', 'roofHatch'],
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
    'baseBand',
    'signageBand',
    'anchorParapet',
    'parapetStep',
    'pylon',
    'signPole',
    'rooftopUnit',
    'roofHatch',
  ],
  supermarket: [
    'entryTower',
    'towerGlazing',
    'anchorParapet',
    'baseBand',
    'cartCorral',
    'dockScreen',
    'signPole',
    'signageBand',
    'rooftopUnit',
    'roofHatch',
  ],
  restaurant: [
    'featureWall',
    'awning',
    'signageBand',
    'accentBand',
    'mansardBand',
    'menuBoard',
    'clearanceBar',
    'pickupCanopy',
    'dumpsterEnclosure',
    'pylon',
    'signPole',
    'rooftopUnit',
    'roofHatch',
  ],
};

/** The old form's brown mansard dresses a restaurant at this level only; the levels above it have a flat parapet. */
export const MANSARD_LEVEL = 1;

/** Whether a restaurant wears the mansard band: its first level only. */
export function hasMansard(entry: BuildingCatalogEntry): boolean {
  return entry.kind === 'restaurant' && (entry.level ?? 1) === MANSARD_LEVEL;
}

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

/**
 * An industrial building of a known kind is dressed by its kind; one of no
 * kind keeps its archetype's plain parts. The reveals come before the band
 * that wraps every face, since a reveal is left out behind whatever already
 * stands on the wall.
 */
const INDUSTRY_PARTS: Readonly<Record<string, readonly BuildingPart[]>> = {
  workshop: [
    'rollUpDoors',
    'walkDoor',
    'glassFront',
    'wainscot',
    'gutter',
    'downspout',
    'ridgeVent',
  ],
  warehouse: [
    ...DOCK_BANK_PARTS,
    'panelReveal',
    'tiltBand',
    'parapetBand',
    'dockTrailer',
    'trailerAxle',
    'guardBooth',
  ],
  factory: [
    'monitorRoof',
    'clerestory',
    'rollUpDoors',
    'walkDoor',
    'wainscot',
    'gutter',
    'downspout',
    'baghouse',
    'stack',
    'silo',
    'yardFence',
  ],
  flex: ['roofArray', 'entryCanopy', 'glassFront', 'rollUpDoors', 'wainscot'],
  foodplant: [...DOCK_BANK_PARTS, 'condenser', 'penthouse', 'silo'],
  chemical: [
    'tanks',
    'bundWall',
    'bullet',
    'pipeRack',
    'processColumn',
    'flare',
    'flareTip',
    'coolingTower',
    'coolingFan',
  ],
  metals: [
    'monitorRoof',
    'ridgeVent',
    'furnace',
    'stove',
    'skipBridge',
    'duct',
    'stack',
    'scrapYard',
    'gantry',
  ],
  paper: ['monitorRoof', 'tanks', 'chipPile', 'stacker', 'recoveryStack'],
};

/** The old plant's monitor roof dresses a factory at this level only; the levels above it are flat-roofed. */
export const OLD_PLANT_LEVEL = 1;

/** Whether a factory wears the monitor roof: its first level only. */
export function hasMonitorRoof(entry: BuildingCatalogEntry): boolean {
  return entry.kind === 'factory' && (entry.level ?? 1) === OLD_PLANT_LEVEL;
}

/** The walk-ups' shared parts: a hip roof, a brick base and the mail kiosk by the walk. */
const WALK_UP_PARTS: readonly BuildingPart[] = ['hipRoofBlock', 'brickBase', 'mailKiosk'];

/** The storefront band of a podium: lit glazing over a bulkhead between brick piers. */
const PODIUM_BAND_PARTS: readonly BuildingPart[] = ['bulkhead', 'storefrontBand', 'brickPier'];

/** An apartment block of a known kind is dressed by its kind; one of no kind keeps the plain body. */
const APARTMENT_PARTS: Readonly<Record<string, readonly BuildingPart[]>> = {
  multiplex: [...WALK_UP_PARTS, 'stoop', 'entryHood', 'signPole'],
  garden: [
    ...WALK_UP_PARTS,
    'breezeway',
    'landing',
    'landingGuard',
    'stairFlight',
    'balconySlab',
    'balconyGuard',
    'patio',
  ],
  midrise: [
    ...PODIUM_BAND_PARTS,
    'boxBay',
    'balconySlab',
    'balconyGuard',
    'parapetBand',
    'elevatorBulkhead',
    'rooftopUnit',
    'roofHatch',
  ],
  tower: [
    'lobbyPortal',
    ...PODIUM_BAND_PARTS,
    'balconySlab',
    'balconyGuard',
    'parapetBand',
    'penthouse',
  ],
};

/** An office tower, the third level, stands a screened cooling tower on its roof in place of rooftop units. */
const OFFICE_TOWER_PARTS: readonly BuildingPart[] = [
  'lobbyPortal',
  'ribbonBand',
  'roofScreen',
  'coolingTower',
  'roofHatch',
];

export function partsFor(entry: BuildingCatalogEntry): readonly BuildingPart[] {
  const archetype = archetypeFor(entry);
  if (archetype === 'storefront') {
    const parts = STOREFRONT_PARTS[entry.kind ?? ''] ?? PARTS.storefront;
    return hasMansard(entry) || entry.kind !== 'restaurant'
      ? parts
      : parts.filter((p) => p !== 'mansardBand');
  }
  if (entry.category === 'ind' && !isFarmEntry(entry)) {
    const parts = INDUSTRY_PARTS[entry.kind ?? ''] ?? PARTS[archetype];
    return hasMonitorRoof(entry) || entry.kind !== 'factory'
      ? parts
      : parts.filter((p) => p !== 'monitorRoof');
  }
  if (archetype === 'office' && isOfficeTower(entry)) return OFFICE_TOWER_PARTS;
  if (archetype === 'apartment') return APARTMENT_PARTS[entry.kind ?? ''] ?? PARTS.apartment;
  return PARTS[archetype];
}

/** An office of the third level, the tower. */
export function isOfficeTower(entry: BuildingCatalogEntry): boolean {
  return entry.kind === 'office' && (entry.level ?? 1) >= 3;
}

export function hasPart(entry: BuildingCatalogEntry, part: BuildingPart): boolean {
  return partsFor(entry).includes(part);
}
