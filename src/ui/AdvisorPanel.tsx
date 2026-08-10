/**
 * Advisor panel: the ranked city problems, worst first, each one clickable to
 * put the camera on it. Presentational — it takes the issues as a prop and
 * calls back; the ranking lives in advisor.ts and the wiring in main.ts.
 */
import type { JSX } from 'react';
import type { CityIssue, IssueSeverity } from './advisor';
import { PANEL_ROUNDED } from './theme';

export interface AdvisorPanelProps {
  open: boolean;
  onClose: () => void;
  issues: readonly CityIssue[];
  /** Sends the camera to an issue's location. */
  onFocus: (x: number, z: number) => void;
}

const SEVERITY_DOT: Record<IssueSeverity, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-300',
  info: 'bg-sky-300',
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Note',
};

export function AdvisorPanel({ open, onClose, issues, onFocus }: AdvisorPanelProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-16 z-10 w-96">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
        role="dialog"
        aria-label="Advisor"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Advisor</h2>
          <button
            type="button"
            aria-label="Close advisor"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {issues.length === 0 ? (
          <p className="py-2 text-xs text-white/50">
            Nothing needs your attention. The city is running clean.
          </p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {issues.map((issue) => {
              const canFocus = issue.focus !== undefined;
              const Row = canFocus ? 'button' : 'div';
              return (
                <li key={issue.id}>
                  <Row
                    {...(canFocus
                      ? {
                          type: 'button' as const,
                          onClick: () => onFocus(issue.focus!.x, issue.focus!.z),
                          'aria-label': `${issue.title} — show me`,
                        }
                      : {})}
                    className={`flex w-full gap-2 rounded px-2 py-1.5 text-left ${
                      canFocus ? 'hover:bg-white/10' : ''
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[issue.severity]}`}
                      aria-label={SEVERITY_LABEL[issue.severity]}
                      role="img"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">{issue.title}</span>
                      <span className="text-[11px] text-white/55">{issue.detail}</span>
                    </span>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
