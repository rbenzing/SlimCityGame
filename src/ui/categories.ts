/**
 * Main-dock category -> asset-drawer data. Pure data derivation from the
 * catalog/road-spec JSON — no React here, so the sub-tab/lock/pricing logic
 * is unit-testable without rendering anything.
 */
import catalogData from '../data/catalog.json';
import roadsData from '../data/roads.json';
import type { BuildingCatalogEntry, RoadSpec, RoadTier, ToolId } from '../shared/types';
import { RoadTier as RoadTierValue } from '../shared/types';
import { LANDFILL_PAINT_COST_PER_TILE } from '../shared/constants';
import type { IconName } from './icons';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const roadSpecs = (roadsData as { specs: RoadSpec[] }).specs;
const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

/** The main-dock center-cluster categories, in display order. */
export type DockCategory =
  | 'zoning'
  | 'roads'
  | 'electricity'
  | 'water'
  | 'garbage'
  | 'health'
  | 'fire'
  | 'police'
  | 'education'
  | 'parks'
  | 'transit'
  | 'districts'
  | 'bulldoze'
  | 'landscaping';

export const CATEGORY_DEFS: ReadonlyArray<{ id: DockCategory; label: string; icon: IconName }> = [
  { id: 'zoning', label: 'Zoning', icon: 'zoning' },
  { id: 'roads', label: 'Roads', icon: 'roads' },
  { id: 'electricity', label: 'Electricity', icon: 'electricity' },
  { id: 'water', label: 'Water', icon: 'water' },
  { id: 'garbage', label: 'Garbage', icon: 'garbage' },
  { id: 'health', label: 'Health', icon: 'health' },
  { id: 'fire', label: 'Fire', icon: 'fire' },
  { id: 'police', label: 'Police', icon: 'police' },
  { id: 'education', label: 'Education', icon: 'education' },
  { id: 'parks', label: 'Parks', icon: 'parks' },
  // Transit + Districts dock categories.
  { id: 'transit', label: 'Transit', icon: 'transit' },
  { id: 'districts', label: 'Districts', icon: 'districts' },
  { id: 'bulldoze', label: 'Bulldoze', icon: 'bulldoze' },
  { id: 'landscaping', label: 'Landscaping', icon: 'landscaping' },
];

export interface AssetCard {
  id: ToolId;
  name: string;
  cost: number;
  unlockMilestone: number;
}

export interface AssetSubTab {
  id: string;
  label: string;
  cards: AssetCard[];
}

function roadToolId(tier: RoadTier): ToolId | null {
  switch (tier) {
    case RoadTierValue.TwoLane:
      return 'road.two';
    case RoadTierValue.Avenue:
      return 'road.avenue';
    case RoadTierValue.Highway:
      return 'road.highway';
    case RoadTierValue.Gravel:
      return 'road.gravel';
    case RoadTierValue.Alley:
      return 'road.alley';
    case RoadTierValue.OneWay:
      return 'road.oneway';
    case RoadTierValue.FourLane:
      return 'road.four';
    case RoadTierValue.BusLane:
      return 'road.bus';
    case RoadTierValue.BikeLane:
      return 'road.bike';
    case RoadTierValue.Tram:
      return 'road.tram';
    case RoadTierValue.RailTrack:
      return 'road.rail';
    default:
      return null;
  }
}

function roadCard(tier: RoadTier): AssetCard[] {
  const spec = roadSpecs.find((s) => s.tier === tier);
  const id = spec ? roadToolId(spec.tier) : null;
  return spec && id
    ? [{ id, name: spec.name, cost: spec.costPerTile, unlockMilestone: spec.unlockMilestone }]
    : [];
}

function catalogCards(predicate: (entry: BuildingCatalogEntry) => boolean): AssetCard[] {
  return catalog.filter(predicate).map((entry) => ({
    id: `plop.${entry.id}` as ToolId,
    name: entry.name,
    cost: entry.cost,
    unlockMilestone: entry.unlockMilestone,
  }));
}

/**
 * The zone set, milestone-gated to city size. High-density Residential and
 * Commercial unlock at M4 (large towers/malls arrive at Small City, not day
 * one). Costs stay 0 like every zone tool — zoning is free, growth pays
 * through the catalog.
 */
const ZONE_CARDS = {
  resLow: { id: 'zone.resLow', name: 'Residential (Low)', cost: 0, unlockMilestone: 0 },
  resMediumRow: {
    id: 'zone.resMediumRow',
    name: 'Residential (Medium Row)',
    cost: 0,
    unlockMilestone: 1,
  },
  resMedium: { id: 'zone.resMedium', name: 'Residential (Medium)', cost: 0, unlockMilestone: 2 },
  resHigh: { id: 'zone.resHigh', name: 'Residential (High)', cost: 0, unlockMilestone: 4 },
  comLow: { id: 'zone.comLow', name: 'Commercial (Low)', cost: 0, unlockMilestone: 0 },
  comHigh: { id: 'zone.comHigh', name: 'Commercial (High)', cost: 0, unlockMilestone: 4 },
  industrial: { id: 'zone.industrial', name: 'Industrial', cost: 0, unlockMilestone: 0 },
  mixed: { id: 'zone.mixed', name: 'Mixed-Use', cost: 0, unlockMilestone: 3 },
  dezone: { id: 'zone.dezone', name: 'De-zone', cost: 0, unlockMilestone: 0 },
} satisfies Record<string, AssetCard>;

const BULLDOZE_CARD: AssetCard = { id: 'bulldoze', name: 'Bulldoze', cost: 0, unlockMilestone: 0 };

/**
 * The bus-line drawing tool card (bus stops come from the catalog via the
 * 'transit' building category). Unlocks with the bus stop (M1).
 */
const TRANSIT_LINE_CARD: AssetCard = {
  id: 'transit.line',
  name: 'Bus Line',
  cost: 0,
  unlockMilestone: 1,
};

/**
 * The district paint-brush tool card. Zero cost, always available — districts
 * are administrative regions, painted onto any tile.
 */
const DISTRICT_PAINT_CARD: AssetCard = {
  id: 'district.paint',
  name: 'Paint District',
  cost: 0,
  unlockMilestone: 0,
};

/** Landfill area brush (paints GridState.landfill); cost is per painted tile. */
const LANDFILL_PAINT_CARD: AssetCard = {
  id: 'landfill.paint',
  name: 'Landfill',
  cost: LANDFILL_PAINT_COST_PER_TILE,
  unlockMilestone: 1,
};

/**
 * The four real terraform brushes. Zero cost/unlockMilestone, same reasoning
 * as zone cards — a terraform stroke's real charge depends on the volume
 * actually edited, so
 * it has no flat catalog price and is shown live via the cursor chip
 * instead (fed by the ToolManager's running-cost preview).
 */
const TERRAFORM_CARDS: AssetCard[] = [
  { id: 'terraform.raise', name: 'Raise', cost: 0, unlockMilestone: 0 },
  { id: 'terraform.lower', name: 'Lower', cost: 0, unlockMilestone: 0 },
  { id: 'terraform.level', name: 'Level', cost: 0, unlockMilestone: 0 },
  { id: 'terraform.smooth', name: 'Smooth', cost: 0, unlockMilestone: 0 },
];

/**
 * Every category's theoretical sub-tab groups, including ones that currently
 * have zero real items (e.g. Roads' "Maintenance" — no maintenance tool
 * exists yet). `subTabsFor` filters those out, rendering only sub-tabs that
 * have >=1 real item.
 */
const RAW_GROUPS: Record<DockCategory, AssetSubTab[]> = {
  zoning: [
    // City-size progression order — Low / Medium Row / Medium / High.
    {
      id: 'residential',
      label: 'Residential',
      cards: [ZONE_CARDS.resLow, ZONE_CARDS.resMediumRow, ZONE_CARDS.resMedium, ZONE_CARDS.resHigh],
    },
    { id: 'commercial', label: 'Commercial', cards: [ZONE_CARDS.comLow, ZONE_CARDS.comHigh] },
    { id: 'industrial', label: 'Industrial', cards: [ZONE_CARDS.industrial] },
    // Mixed Housing gets its own sub-tab (carries both residents+jobs).
    { id: 'mixed', label: 'Mixed-Use', cards: [ZONE_CARDS.mixed] },
    { id: 'dezone', label: 'De-zone', cards: [ZONE_CARDS.dezone] },
  ],
  roads: [
    // The small/large split follows carriageway class, each
    // tab in cost order — gravel/alley/two-lane/one-way are all narrow
    // (two-lane-or-less footprints), four-lane joins the multi-lane tab.
    {
      id: 'small',
      label: 'Small Roads',
      cards: [
        ...roadCard(RoadTierValue.Gravel),
        ...roadCard(RoadTierValue.Alley),
        ...roadCard(RoadTierValue.TwoLane),
        ...roadCard(RoadTierValue.OneWay),
      ],
    },
    {
      id: 'large',
      label: 'Large Roads',
      cards: [
        ...roadCard(RoadTierValue.FourLane),
        ...roadCard(RoadTierValue.Avenue),
        ...roadCard(RoadTierValue.Highway),
      ],
    },
    // Transit lane variants (roads epic) — bus/bike lanes, later joined by
    // trams/trains. Cheaper bike lane first, then the bus lane.
    {
      id: 'transit',
      label: 'Transit Lanes',
      cards: [
        ...roadCard(RoadTierValue.BikeLane),
        ...roadCard(RoadTierValue.BusLane),
        ...roadCard(RoadTierValue.Tram),
        ...roadCard(RoadTierValue.RailTrack),
      ],
    },
  ],
  electricity: [
    {
      id: 'all',
      label: 'Electricity',
      cards: catalogCards((e) => e.category === 'utility' && e.utility?.powerMW !== undefined),
    },
  ],
  water: [
    {
      id: 'all',
      label: 'Water',
      cards: catalogCards((e) => e.category === 'utility' && e.utility?.waterKL !== undefined),
    },
  ],
  // Garbage: the landfill-area brush + garbage-processing ploppables (incinerator).
  garbage: [
    {
      id: 'all',
      label: 'Garbage',
      cards: [LANDFILL_PAINT_CARD, ...catalogCards((e) => !!e.garbage)],
    },
  ],
  health: [
    {
      id: 'all',
      label: 'Health',
      cards: catalogCards((e) => e.category === 'service' && e.service?.kind === 'health'),
    },
  ],
  fire: [
    {
      id: 'all',
      label: 'Fire',
      cards: catalogCards((e) => e.category === 'service' && e.service?.kind === 'fire'),
    },
  ],
  police: [
    {
      id: 'all',
      label: 'Police',
      cards: catalogCards((e) => e.category === 'service' && e.service?.kind === 'police'),
    },
  ],
  education: [
    {
      id: 'all',
      label: 'Education',
      cards: catalogCards((e) => e.category === 'service' && e.service?.kind === 'education'),
    },
  ],
  parks: [{ id: 'all', label: 'Parks', cards: catalogCards((e) => e.category === 'park') }],
  // Transit: bus-stop ploppable(s) from the catalog + the Bus Line tool.
  transit: [
    {
      id: 'all',
      label: 'Transit',
      cards: [...catalogCards((e) => e.category === 'transit'), TRANSIT_LINE_CARD],
    },
  ],
  // Districts: the paint tool (district selection + policies live in the DistrictPanel).
  districts: [{ id: 'all', label: 'Districts', cards: [DISTRICT_PAINT_CARD] }],
  bulldoze: [{ id: 'all', label: 'Bulldoze', cards: [BULLDOZE_CARD] }],
  landscaping: [{ id: 'all', label: 'Landscaping', cards: [...TERRAFORM_CARDS] }],
};

/** Non-empty sub-tab groups for a category. Length <= 1 means "no tab row — one flat grid". */
export function subTabsFor(category: DockCategory): AssetSubTab[] {
  return RAW_GROUPS[category].filter((group) => group.cards.length > 0);
}

/** All cards in a category, flattened across its sub-tabs (tabbed or not). */
export function allCardsFor(category: DockCategory): AssetCard[] {
  return subTabsFor(category).flatMap((group) => group.cards);
}

/** Resolves a `plop.<id>` tool back to its catalog entry; undefined for non-catalog tools. */
export function catalogEntryForTool(id: ToolId): BuildingCatalogEntry | undefined {
  return id.startsWith('plop.') ? catalogById.get(id.slice('plop.'.length)) : undefined;
}
