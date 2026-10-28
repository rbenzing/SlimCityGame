/**
 * The way in to a civic building: where along its front edge it wants a
 * crossing over the verge and the footway to the carriageway, and what sort.
 * Positions are local metres along the kit's edge from its low-X corner (its
 * front-left corner seen from the street, the street side being local +Z),
 * so a span's u grows with the kit's local +X on either edge.
 *
 * The span table is the one place a kit's gate, apron or door says where it
 * meets the street; the renderer lays the crossing from it, and a test holds
 * every span to its kit's own layout.
 */

/** A two-way vehicle crossing: 24 ft. */
export const CIVIC_DRIVE_WIDTH_M = 7.3;
/** A pedestrian crossing: the 1.8 m walk of an accessible route. */
export const CIVIC_WALK_WIDTH_M = 1.8;

export type CivicSpanKind = 'drive' | 'apron' | 'walk';

export interface CivicSpan {
  u0: number;
  u1: number;
  /** A drive is 7.3 m wide about the span's middle, an apron is the span's width, a walk is 1.8 m about the middle. */
  kind: CivicSpanKind;
}

export interface CivicAccess {
  spans: readonly CivicSpan[];
  /** Which of the kit's local edges the spans lie on: its front (+Z, the default) or its back (-Z, a shore kit's land side, an airport's terminal). */
  edge?: 'front' | 'back';
  /** What decides the kit's turn: its placed rotation (the default), the water beside it, or the track beside a station or a rail yard. */
  turn?: 'placed' | 'water' | 'station' | 'yard';
  /** Spans are metres from the middle of the edge, for a kit whose width changes with its frame. */
  centred?: true;
}

const walk = (middle: number, wide = CIVIC_WALK_WIDTH_M): CivicSpan => ({
  u0: middle - wide / 2,
  u1: middle + wide / 2,
  kind: 'walk',
});
const drive = (u0: number, u1: number): CivicSpan => ({ u0, u1, kind: 'drive' });
const apron = (u0: number, u1: number): CivicSpan => ({ u0, u1, kind: 'apron' });

/** A park's walk is its path cross's arm, at the middle of its front. */
const parkWalk = (widthTiles: number): CivicAccess => ({ spans: [walk(widthTiles * 10)] });

const SHORE: Pick<CivicAccess, 'edge' | 'turn'> = { edge: 'back', turn: 'water' };

/**
 * Every civic catalog id: the utility kits (UTILITY_KIT_CATALOG_IDS) and the
 * airport. Spans are measured on each kit's own footprint in tiles of 20 m.
 */
export const CIVIC_ACCESS_BY_ID: Readonly<Record<string, CivicAccess>> = {
  'wind-turbine': { spans: [walk(10)] },
  'water-tower': { spans: [walk(10)] },
  'water-pump': { ...SHORE, spans: [drive(21.5, 26.5)] },
  'water-drain': { ...SHORE, spans: [walk(10)] },
  'sewage-works': { ...SHORE, spans: [drive(31, 39)] },
  'coal-plant': { spans: [drive(41, 47)] },
  incinerator: { spans: [drive(66, 72)] },
  'recycling-depot': { spans: [drive(27, 33)] },
  'materials-recovery-facility': { spans: [drive(75.3, 78.7)] },
  'transfer-station': { spans: [drive(68.1, 71.5)] },
  hospital: { spans: [apron(5, 21), walk(32, 6), drive(65.01, 72.33)] },
  cemetery: { spans: [drive(36.95, 43.05)] },
  crematorium: { spans: [drive(15.5, 24.5)] },
  'fire-station': { spans: [apron(3, 14.97), walk(17.49, 2.44)] },
  'fire-station-district': { spans: [apron(3, 20.46), walk(29.53, 2.44)] },
  'police-station': { spans: [walk(20, 2.44), drive(27.87, 34.13)] },
  'police-station-district': { spans: [walk(30, 2.44), drive(46.87, 53.13)] },
  school: { spans: [drive(2, 28.85), walk(32.35, 2.44)] },
  'middle-school': { spans: [drive(22.7, 54), drive(54.5, 78)] },
  'high-school': { spans: [drive(22.7, 66), drive(66.5, 98)] },
  college: { spans: [walk(60, 3)] },
  library: { spans: [walk(23, 2.44), drive(44.5, 58)] },
  'solar-farm': { spans: [drive(57.5, 62.5)] },
  'gas-turbine': { spans: [drive(17.5, 22.5)] },
  'combined-cycle': { spans: [drive(56, 62)] },
  'nuclear-plant': { spans: [drive(55, 65)] },
  'small-park': parkWalk(1),
  'civic-plaza': parkWalk(5),
  'neighbourhood-park': parkWalk(9),
  'district-park': parkWalk(20),
  'sports-ground': parkWalk(6),
  clinic: { spans: [drive(0, 6.1), drive(13.9, 20)] },
  'rail-station': { turn: 'station', centred: true, spans: [drive(-3.66, 3.66)] },
  'bus-depot': { spans: [drive(18.6, 25.8)] },
  'bus-garage': { spans: [drive(33, 40.2)] },
  'tram-depot': { turn: 'yard', spans: [] },
  'rail-yard': { turn: 'yard', spans: [drive(71.2, 78.4)] },
  airport: { edge: 'back', spans: [drive(76.35, 83.65)] },
};

/** A civic entry's access, or null for any other catalog entry. */
export function civicAccessFor(entry: { id: string }): CivicAccess | null {
  return CIVIC_ACCESS_BY_ID[entry.id] ?? null;
}

/**
 * The width a span crosses the footway at, in metres: a drive's 7.3 m and a
 * walk's 1.8 m about the span's middle, an apron the span's own width.
 */
export function civicCrossingWidth(span: CivicSpan): number {
  switch (span.kind) {
    case 'drive':
      return CIVIC_DRIVE_WIDTH_M;
    case 'walk':
      return CIVIC_WALK_WIDTH_M;
    case 'apron':
      return span.u1 - span.u0;
  }
}
