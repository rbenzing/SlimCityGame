export function framesOf(spec: {
  type: string;
  subjects?: { id: string; views?: string[]; night?: boolean }[];
  details?: unknown[];
  frames?: unknown[];
}): number;
