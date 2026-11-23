export function checkViews(spec: {
  subjects: { id: string }[];
  frames?: {
    subject: string;
    view: string;
    shows?: string;
    full?: boolean;
    camera?: unknown;
  }[];
}): void;
export function expectNone(problems: unknown[]): void;
