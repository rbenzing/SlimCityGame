/**
 * What each lens, and the underground view, paints and how to read it. The
 * colours come from src/shared/lenses.ts, the tables the renderers paint from,
 * so a legend never describes a colour the map does not use. Pure: no React.
 */
import {
  COVERAGE_COVERED_HEX,
  COVERAGE_UNCOVERED_DIM_FACTOR,
  COVERAGE_UNCOVERED_HEX,
  LENS_MEANING,
  LENS_RAMP_STOPS,
  SOIL_LENS_COLORS,
  UNDERGROUND_CABLE_FOOT_HEX,
  UNDERGROUND_CABLE_HEX,
  UNDERGROUND_DRY_HEX,
  UNDERGROUND_SEWER_HEX,
  UNDERGROUND_WATER_HEX,
  dimHex,
  type LensMeaning,
} from '../shared/lenses';
import { FieldId } from '../shared/types';
import type { District, LensId, TransitLine, TransitMode } from '../shared/types';
import { hexColor } from './format';
import { lensLabel } from './InfoviewGrid';

export interface LegendEntry {
  label: string;
  /** CSS colour of the swatch. */
  color: string;
}

/** What a lens paints: a graded scale with its two ends named, or named categories. */
export type LensLegend =
  | {
      kind: 'ramp';
      name: string;
      /** What the scale measures, and its range. */
      unit: string;
      low: string;
      high: string;
      /** The ramp's stops, left (low) to right (high), as CSS colours at a 0..100 position. */
      stops: ReadonlyArray<{ at: number; color: string }>;
      /** What the empty lens is missing: "no <thing> built". Null when it cannot be empty. */
      thing: string | null;
      note?: string;
    }
  | {
      kind: 'categories';
      name: string;
      entries: readonly LegendEntry[];
      thing: string | null;
      note?: string;
    };

const rgbCss = (r: number, g: number, b: number): string =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

const rampCss = (meaning: LensMeaning): ReadonlyArray<{ at: number; color: string }> =>
  LENS_RAMP_STOPS[meaning].map(([value, [r, g, b]]) => ({
    at: (value / 255) * 100,
    color: rgbCss(r, g, b),
  }));

const RAMP_CSS: Readonly<Record<LensMeaning, ReadonlyArray<{ at: number; color: string }>>> = {
  worse: rampCss('worse'),
  better: rampCss('better'),
};

interface RampWords {
  unit: string;
  low: string;
  high: string;
  thing: string;
}

/** Each graded lens's scale: its bytes run 0..255 and the ramp paints low to high. */
const RAMPS: Readonly<Partial<Record<LensId, RampWords>>> = {
  [FieldId.LandValue]: {
    unit: 'land value, 0 to 255',
    low: 'Cheap',
    high: 'Dear',
    thing: 'buildings',
  },
  [FieldId.Pollution]: {
    unit: 'pollution, 0 to 255',
    low: 'Clean',
    high: 'Heavy',
    thing: 'polluters',
  },
  [FieldId.Noise]: { unit: 'noise, 0 to 255', low: 'Quiet', high: 'Loud', thing: 'noise makers' },
  [FieldId.Traffic]: {
    unit: 'traffic, 0 to 255',
    low: 'Empty',
    high: 'Jammed',
    thing: 'roads in use',
  },
  [FieldId.Crime]: {
    unit: 'crime, 0 to 255',
    low: 'Safe',
    high: 'Dangerous',
    thing: 'buildings',
  },
  [FieldId.FireRisk]: {
    unit: 'fire risk, 0 to 255',
    low: 'Low risk',
    high: 'High risk',
    thing: 'buildings',
  },
  [FieldId.Education]: {
    unit: 'elementary reach, 0 to 255',
    low: 'No school',
    high: 'Well served',
    thing: 'elementary schools',
  },
  [FieldId.MiddleEducation]: {
    unit: 'middle school reach, 0 to 255',
    low: 'No school',
    high: 'Well served',
    thing: 'middle schools',
  },
  [FieldId.HighEducation]: {
    unit: 'high school reach, 0 to 255',
    low: 'No school',
    high: 'Well served',
    thing: 'high schools',
  },
  [FieldId.CollegeEducation]: {
    unit: 'college reach, 0 to 255',
    low: 'No college',
    high: 'Well served',
    thing: 'colleges',
  },
  [FieldId.Health]: {
    unit: 'health care reach, 0 to 255',
    low: 'No care',
    high: 'Well served',
    thing: 'clinics or hospitals',
  },
  [FieldId.Happiness]: {
    unit: 'happiness, 0 to 255',
    low: 'Unhappy',
    high: 'Happy',
    thing: 'homes',
  },
  trash: {
    unit: 'trash piled up, 0 to 255',
    low: 'None',
    high: 'Heaps',
    thing: 'trash producers',
  },
};

const covered = (label: string): LegendEntry => ({
  label,
  color: hexColor(COVERAGE_COVERED_HEX),
});
const uncovered = (label: string): LegendEntry => ({
  label,
  color: hexColor(dimHex(COVERAGE_UNCOVERED_HEX, COVERAGE_UNCOVERED_DIM_FACTOR)),
});

const MODE_NAME: Readonly<Record<TransitMode, string>> = { bus: 'Bus', rail: 'Rail', tram: 'Tram' };

/** The live lists the Transit and Districts lenses draw their categories from. */
export interface LensContext {
  transitLines: readonly TransitLine[];
  districts: readonly District[];
}

/** The legend for `lens`, or null for a lens this table has no entry for. */
export function lensLegend(lens: LensId, context: LensContext): LensLegend | null {
  const name = lensLabel(lens);
  const ramp = RAMPS[lens];
  if (ramp) {
    const meaning = LENS_MEANING[lens] ?? 'better';
    return {
      kind: 'ramp',
      name,
      unit: ramp.unit,
      low: ramp.low,
      high: ramp.high,
      stops: RAMP_CSS[meaning],
      thing: ramp.thing,
    };
  }
  switch (lens) {
    case 'power':
      return {
        kind: 'categories',
        name,
        entries: [covered('Powered'), uncovered('No power')],
        thing: 'power station',
      };
    case 'watered':
      return {
        kind: 'categories',
        name,
        entries: [covered('Water reaches'), uncovered('No water')],
        thing: 'water pumping station',
        note: 'One pipe carries both flows. This lens tints the ground by where the water reaches; the Sewer lens tints it by where a drain does.',
      };
    case 'sewered':
      return {
        kind: 'categories',
        name,
        entries: [covered('Drain reaches'), uncovered('No drain')],
        thing: 'sewage drain',
        note: 'One pipe carries both flows. This lens tints the ground by where a drain reaches; the Water lens tints it by where the water does.',
      };
    case 'soil':
      return {
        kind: 'categories',
        name,
        entries: SOIL_LENS_COLORS.map((grade) => ({
          label: grade.label,
          color: hexColor(grade.hex),
        })),
        thing: null,
      };
    case 'transit':
      return {
        kind: 'categories',
        name,
        entries: context.transitLines.map((line) => ({
          label: `${MODE_NAME[line.mode ?? 'bus']} ${line.id}`,
          color: hexColor(line.color),
        })),
        thing: 'transit lines',
      };
    case 'districts':
      return {
        kind: 'categories',
        name,
        entries: context.districts.map((district) => ({
          label: district.name,
          color: hexColor(district.color),
        })),
        thing: 'districts',
      };
    default:
      return null;
  }
}

/** The empty lens's sentence. */
export function emptyLensText(thing: string): string {
  return `Nothing to show yet: no ${thing} built`;
}

/** Everything the underground view draws, named. */
export const UNDERGROUND_LEGEND: readonly LegendEntry[] = [
  { label: 'Water pipe', color: hexColor(UNDERGROUND_WATER_HEX) },
  { label: 'Sewer', color: hexColor(UNDERGROUND_SEWER_HEX) },
  { label: 'Run nothing reaches', color: hexColor(UNDERGROUND_DRY_HEX) },
  { label: 'Buried cable', color: hexColor(UNDERGROUND_CABLE_HEX) },
  { label: 'Junction box or riser foot', color: hexColor(UNDERGROUND_CABLE_FOOT_HEX) },
];
