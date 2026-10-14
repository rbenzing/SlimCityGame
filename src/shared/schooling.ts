/**
 * The education ladder's rungs and which of them a zone's level 3 waits on. One
 * source for the growth pass, the inspector and the Advisor, so what a building
 * is told it lacks is exactly what growth held it back for.
 */

import { FieldId, ZoneType, type ServiceKind } from './types';

/** A school's field must exceed this on a tile for the rung to count there. */
export const SCHOOLING_GATE = 60;

export interface EducationRung {
  /** The facility kind that writes this rung's field. */
  kind: ServiceKind;
  field: FieldId;
  /** What a player calls the building, as the inspector and the Advisor say it. */
  school: string;
}

export const ELEMENTARY: EducationRung = {
  kind: 'education',
  field: FieldId.Education,
  school: 'elementary school',
};
export const MIDDLE: EducationRung = {
  kind: 'middle-education',
  field: FieldId.MiddleEducation,
  school: 'middle school',
};
export const HIGH: EducationRung = {
  kind: 'high-education',
  field: FieldId.HighEducation,
  school: 'high school',
};
export const COLLEGE: EducationRung = {
  kind: 'college-education',
  field: FieldId.CollegeEducation,
  school: 'college',
};

/** Every rung, lowest first. */
export const EDUCATION_RUNGS: readonly EducationRung[] = [ELEMENTARY, MIDDLE, HIGH, COLLEGE];

/** What a player calls the school a facility kind is: "high school", or the kind itself for any other. */
export function schoolNameOf(kind: ServiceKind): string {
  return EDUCATION_RUNGS.find((rung) => rung.kind === kind)?.school ?? kind;
}

/** Every kind the Education department funds: the four schools, then the library. */
export const EDUCATION_KINDS: ReadonlySet<ServiceKind> = new Set<ServiceKind>([
  ...EDUCATION_RUNGS.map((rung) => rung.kind),
  'library',
]);

const SECONDARY: readonly EducationRung[] = [MIDDLE, HIGH];

/**
 * The rungs a zone's level 3 needs, each field over `SCHOOLING_GATE`. Level 2 is
 * never gated, and industry and farms never ask.
 */
export function level3Schooling(zone: ZoneType): readonly EducationRung[] {
  switch (zone) {
    case ZoneType.ResLow:
    case ZoneType.ResMediumRow:
      return [ELEMENTARY];
    case ZoneType.ResMedium:
    case ZoneType.ResHigh:
    case ZoneType.Mixed:
    case ZoneType.ComLow:
      return SECONDARY;
    case ZoneType.ComHigh:
      return [COLLEGE];
    default:
      return [];
  }
}

/** The rungs of a zone's level 3 that `fieldValue` does not carry over the gate. */
export function missingSchooling(
  zone: ZoneType,
  fieldValue: (field: FieldId) => number,
): EducationRung[] {
  return level3Schooling(zone).filter((rung) => fieldValue(rung.field) <= SCHOOLING_GATE);
}
