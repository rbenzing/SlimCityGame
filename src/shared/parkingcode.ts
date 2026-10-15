/**
 * What a suburban commercial or industrial lot owes the parking code: the
 * spaces its floor asks for, the accessible spaces among them, its loading
 * berths and its planting, and the stall, aisle and berth sizes the lot is
 * drawn with. One requirement for the lot layout, the paint, the cars and the
 * tests. Pure.
 */
import { ZoneType } from './types';
import type { BuildingCatalogEntry, BuildingKind } from './types';
import { grossFloorSqFt } from './floorarea';
import { isWalkUpKind } from './buildingkind';

/**
 * Spaces per 1,000 sq ft of gross floor, the modal minimum across US
 * municipal codes (St Charles MO, Wadsworth OH, Stacy MN, Canby OR, North
 * Reading MA, Columbus IN, Medfield MA). A filling station counts its kiosk's
 * floor; its pumps earn none. Flex space is half office at 3 and half
 * warehouse at 1. Office is the downtown kind and parks at the kerb, so its
 * figure stands for reference only.
 */
export const SPACES_PER_1000_SQ_FT: Readonly<Partial<Record<BuildingKind, number>>> = {
  shop: 5,
  strip: 5,
  supermarket: 5,
  fuel: 5,
  restaurant: 10,
  office: 3,
  workshop: 1,
  factory: 1,
  foodplant: 1,
  chemical: 1,
  metals: 1,
  paper: 1,
  warehouse: 0.5,
  flex: 2,
};

/** A commercial building of no kind parks as retail; a works of no kind as manufacturing. */
const RETAIL_SPACES_PER_1000_SQ_FT = 5;
const MANUFACTURING_SPACES_PER_1000_SQ_FT = 1;

/** The codes measure in feet; a foot is exactly this many metres. */
export const FOOT_M = 0.3048;
const INCH_M = FOOT_M / 12;

/** A standard stall: 9 × 18 ft (2.74 × 5.49 m). */
export const STALL_WIDTH_M = 9 * FOOT_M;
export const STALL_LENGTH_M = 18 * FOOT_M;
/** A two-way aisle between 90° stalls: 24 ft (7.32 m). */
export const AISLE_WIDTH_M = 24 * FOOT_M;
/** The ULI double-loaded 90° module, stall + aisle + stall: 60 ft (18.3 m). */
export const DOUBLE_MODULE_M = 2 * STALL_LENGTH_M + AISLE_WIDTH_M;
/** One row on one side of its aisle: 42 ft (12.8 m). */
export const SINGLE_MODULE_M = STALL_LENGTH_M + AISLE_WIDTH_M;

/** ADA 2010 §502.2: a car space 96 in wide, a van space 132 in, each beside a 60 in access aisle. */
export const ACCESSIBLE_CAR_WIDTH_M = 96 * INCH_M;
export const ACCESSIBLE_VAN_WIDTH_M = 132 * INCH_M;
export const ACCESSIBLE_AISLE_M = 60 * INCH_M;

/** A loading berth: 12 × 50 ft (3.66 × 15.24 m), with 14 ft (4.27 m) clear above it. */
export const BERTH_WIDTH_M = 12 * FOOT_M;
export const BERTH_LENGTH_M = 50 * FOOT_M;
export const BERTH_CLEARANCE_M = 14 * FOOT_M;

/** A planted island is at least 5 ft (1.52 m) wide, at every row end and after every 10 spaces in a row. */
export const ISLAND_WIDTH_M = 5 * FOOT_M;
export const SPACES_BETWEEN_ISLANDS = 10;
/** One tree for every 10 spaces, or part of ten. */
export const SPACES_PER_TREE = 10;

/** A two-way driveway is 24–36 ft (7.3–11 m) at the kerb; the lot's is its aisle's width, inside that. */
export const CURB_CUT_MIN_M = 24 * FOOT_M;
export const CURB_CUT_MAX_M = 36 * FOOT_M;
export const CURB_CUT_M = AISLE_WIDTH_M;

/**
 * The walk along a facade with a customer entrance, and from the public
 * sidewalk to that entrance: 8 ft (2.44 m), the large-retail design
 * standards' figure (Fort Collins Land Use Code 3.5.4, widely copied).
 */
export const ENTRANCE_WALK_M = 8 * FOOT_M;

/**
 * How many accessible spaces an off-street lot or deck of `provided` spaces
 * marks, from ADA 2010 Table 208.2: one per 25 up to 100, one per 50 up to
 * 200, one per 100 up to 500, 2% up to 1,000, and 20 plus one per 100 over
 * 1,000 beyond. Not the kerbside table: the two part above 200 spaces.
 */
export function adaAccessibleSpaces(provided: number): number {
  if (provided <= 0) return 0;
  const upTo = [25, 50, 75, 100, 150, 200, 300, 400, 500];
  const at = upTo.findIndex((n) => provided <= n);
  if (at >= 0) return at + 1;
  if (provided <= 1_000) return Math.ceil(provided * 0.02);
  return 20 + Math.ceil((provided - 1_000) / 100);
}

/** Of a lot's accessible spaces, how many are van-accessible: one in six, or a fraction of six (ADA 2010 §208.2.4). */
export function adaVanSpaces(accessible: number): number {
  return Math.ceil(accessible / 6);
}

/** Whether a building parks on its own lot to code: suburban commerce and industry, never downtown or a farm. */
export function drawsLotParking(entry: BuildingCatalogEntry): boolean {
  if (entry.category !== 'com' && entry.category !== 'ind') return false;
  if (entry.zone === ZoneType.Agriculture) return false;
  if (entry.zone === ZoneType.ComHigh || entry.zone === ZoneType.Mixed) return false;
  return entry.kind !== 'office' && entry.kind !== 'hotel';
}

/**
 * The floor a small single-tenant shop or restaurant parks nothing for: the
 * median of thirteen US codes surveyed (1,500–10,000 sq ft; Baltimore
 * 16-601(c), Spokane SMC 17C.230.130, Hampton VA, New Orleans CZO 22.5.A).
 * The floor above it parks at the full rate. A strip or a supermarket is a
 * multi-tenant or shopping-centre configuration those codes exclude, and
 * industry has no such exemption.
 */
export const SMALL_USE_EXEMPT_SQ_FT = 3_000;
const SMALL_USE_EXEMPT_KINDS: ReadonlySet<BuildingKind> = new Set(['shop', 'restaurant']);

/** Spaces a floor of `grossSqFt` asks of a kind, rounded up as the codes round. */
export function requiredSpaces(
  kind: BuildingKind | undefined,
  grossSqFt: number,
  category: 'com' | 'ind' = 'com',
): number {
  const fallback =
    category === 'ind' ? MANUFACTURING_SPACES_PER_1000_SQ_FT : RETAIL_SPACES_PER_1000_SQ_FT;
  const rate = (kind && SPACES_PER_1000_SQ_FT[kind]) ?? fallback;
  const exempt = kind && SMALL_USE_EXEMPT_KINDS.has(kind) ? SMALL_USE_EXEMPT_SQ_FT : 0;
  return Math.max(0, Math.ceil((rate * Math.max(0, grossSqFt - exempt)) / 1000 - 1e-9));
}

/**
 * Spaces a lot must hold on site once the kerb stalls the street paints along
 * its frontage are credited, one for one. The accessible spaces a lot owes are
 * counted within what it holds, never met at the kerb.
 */
export function onSiteSpaces(required: number, kerbCredit: number): number {
  return Math.max(0, required - kerbCredit);
}

/** Which loading table a lot reads. */
export type BerthClass = 'retail' | 'industrial';

/**
 * Off-street loading berths by gross floor, Wadsworth OH: retail, grocery and
 * restaurant none to 5,000 sq ft, 1 to 20,000, 2 to 40,000, 3 to 100,000;
 * industry 1 from 5,001 to 30,000, 2 to 80,000, 3 to 175,000. The tables stop
 * there, and so does every floor in the game.
 */
const BERTH_TIERS: Readonly<Record<BerthClass, readonly number[]>> = {
  retail: [5_000, 20_000, 40_000, 100_000],
  industrial: [5_000, 30_000, 80_000, 175_000],
};

export function loadingBerths(berthClass: BerthClass, grossSqFt: number): number {
  const tiers = BERTH_TIERS[berthClass];
  const at = tiers.findIndex((limit) => grossSqFt <= limit);
  return at >= 0 ? at : tiers.length - 1;
}

/** The largest floor a berth table covers. */
export function berthTableLimit(berthClass: BerthClass): number {
  const tiers = BERTH_TIERS[berthClass];
  return tiers[tiers.length - 1]!;
}

/** Planted islands a row of `spaces` takes: one at each end and one after every 10. */
export function islandsInRow(spaces: number): number {
  return spaces <= 0 ? 0 : Math.ceil(spaces / SPACES_BETWEEN_ISLANDS) + 1;
}

/** Trees a lot of `spaces` plants. */
export function treesFor(spaces: number): number {
  return Math.ceil(spaces / SPACES_PER_TREE);
}

/** What one lot owes the code. */
export interface ParkingRequirement {
  grossSqFt: number;
  spaces: number;
  berths: number;
}

/** The requirement a building's floor sets, or null for one that parks at the kerb or nowhere. */
export function lotParkingRequirement(entry: BuildingCatalogEntry): ParkingRequirement | null {
  if (!drawsLotParking(entry)) return null;
  const category = entry.category === 'ind' ? 'ind' : 'com';
  const grossSqFt = grossFloorSqFt(entry);
  return {
    grossSqFt,
    spaces: requiredSpaces(entry.kind, grossSqFt, category),
    berths: loadingBerths(category === 'ind' ? 'industrial' : 'retail', grossSqFt),
  };
}

/**
 * Spaces a walk-up lays per home: the 1.41 a 2023 study of garden apartments
 * measured in use, rounded up as a code would. It is what the lot is drawn
 * with and never a condition of growth: a walk-up short of it paints what fits.
 */
export const WALK_UP_SPACES_PER_HOME = 1.4;

/** The car park a multiplex or a garden walk-up lays for its homes, with no berths; null for any other building. */
export function walkUpParkingRequirement(entry: BuildingCatalogEntry): ParkingRequirement | null {
  if (!isWalkUpKind(entry.kind)) return null;
  return {
    grossSqFt: grossFloorSqFt(entry),
    spaces: Math.ceil(WALK_UP_SPACES_PER_HOME * (entry.units ?? 0) - 1e-9),
    berths: 0,
  };
}

/**
 * The ground a walk-up keeps behind its body for what hangs off its rear
 * face, as lawn: a garden's balconies and landings, 1.8 m past its
 * breezeway's 0.05 m; a multiplex's 0.45 m eaves. The kit's own figures, which
 * its test holds to these. On a 2×2 lot a garden's 27.2 m body and this yard
 * leave no room for a parking module, so it lays no car park and its
 * residents park at the kerb.
 */
export const WALK_UP_REAR_YARD_M: Readonly<Record<'multiplex' | 'garden', number>> = {
  multiplex: 0.45,
  garden: 1.85,
};

/**
 * The least a walk-up's body stands in from each side lot line, its eaves. A
 * layout that would park the body on a side line, as a module beside a
 * 27.2 m garden on a 2×2 lot does, is no car park for a walk-up: its lot
 * stays lawn and its residents park at the kerb.
 */
export const WALK_UP_SIDE_YARD_M = 0.45;

/** What a lot lays its car park for: the code's requirement for commerce and industry, a walk-up's homes, null for the rest. */
export function lotSpacesFor(entry: BuildingCatalogEntry): ParkingRequirement | null {
  return lotParkingRequirement(entry) ?? walkUpParkingRequirement(entry);
}
