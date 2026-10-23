/**
 * Services panel. Shown while a service ploppable is in hand or one of the
 * service lenses is on, in the same left slot as the district and transit
 * panels. One row per service kind, each carrying the funding slider and the
 * load gauge together: they are the two answers to one question, and splitting
 * them across two screens is what kept funding invisible — it has been in the
 * simulation since the start with no control anywhere reaching it.
 *
 * A last column, Out, reads the calls a kind has in flight over the calls it can
 * run at once, for the kinds whose stations cap them. It is a separate number
 * from the load: load counts the people who depend on a service, Out counts its
 * crews on calls.
 *
 * The slider emits setServiceFunding through the store's bound bridge and the
 * store flips its own reading at once, as the district policy toggles do; the
 * worker still owns the authoritative funding (it scales range, capacity and
 * upkeep) and confirms on the next snapshot.
 */
import type { JSX } from 'react';
import {
  OPEN_SPACE_TILES_PER_THOUSAND,
  SERVICE_FUNDING_MAX,
  SERVICE_FUNDING_MIN,
} from '../shared/constants';
import { FieldId, fundingKeyOf } from '../shared/types';
import type { LensId, ServiceKind } from '../shared/types';
import { catalogEntryForTool } from './categories';
import { Icon } from './icons';
import { useCityStore } from './store';
import { LABEL, PANEL_ROUNDED } from './theme';

/**
 * Every kind gets a row, capped or not — a park's row is where its slider is.
 * Education is one department with five rows: the elementary row carries its
 * slider, and the other schools and the library read the same funding.
 */
const SERVICE_DEFS: ReadonlyArray<{ kind: ServiceKind; label: string; department?: string }> = [
  { kind: 'police', label: 'Police' },
  { kind: 'fire', label: 'Fire' },
  { kind: 'health', label: 'Health' },
  { kind: 'education', label: 'Elementary', department: 'Education' },
  { kind: 'middle-education', label: 'Middle' },
  { kind: 'high-education', label: 'High' },
  { kind: 'college-education', label: 'College' },
  { kind: 'library', label: 'Library' },
  { kind: 'park', label: 'Parks' },
];

/** The lenses that read a service's own field; the panel answers what they ask. */
const SERVICE_LENSES: ReadonlySet<LensId> = new Set<LensId>([
  FieldId.Crime,
  FieldId.FireRisk,
  FieldId.Health,
  FieldId.Education,
  FieldId.MiddleEducation,
  FieldId.HighEducation,
  FieldId.CollegeEducation,
]);

/** Coarse enough to drag on a narrow panel, fine enough to land on 1.0 and 1.5. */
const FUNDING_STEP = 0.05;

/**
 * A kind with no capped facility has nothing to read and says so; one that has
 * any reads a real percentage, zero included. A stranded clinic that reaches
 * nobody is a mistake the player can fix, and reading it as an em dash hides it
 * behind the city that simply has no clinic.
 */
function loadText(value: number, capped: number): string {
  return capped > 0 ? `${Math.round(value * 100)}%` : '—';
}

/**
 * The parks row's second answer: not how full the parks are but how much
 * ground the city gives them, read against the provision standard. A mirror
 * that never received the figure reads an em dash rather than zero.
 */
function provisionText(perThousand: number | undefined): string {
  const reading = perThousand === undefined ? '—' : `${Math.round(perThousand)}`;
  return `${reading} tiles per 1,000 · standard ${OPEN_SPACE_TILES_PER_THOUSAND}`;
}

export function ServicesPanel(): JSX.Element | null {
  const selectedTool = useCityStore((s) => s.selectedTool);
  const overlay = useCityStore((s) => s.overlay);
  const serviceFunding = useCityStore((s) => s.stats.serviceFunding);
  const serviceLoad = useCityStore((s) => s.serviceLoad);
  const responders = useCityStore((s) => s.responders);
  const openSpace = useCityStore((s) => s.openSpace);
  const setServiceFunding = useCityStore((s) => s.setServiceFunding);

  const holdingService = catalogEntryForTool(selectedTool)?.service !== undefined;
  const visible = holdingService || (overlay !== null && SERVICE_LENSES.has(overlay));
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed left-3 top-16 z-10 w-80">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="city" className="h-5 w-5 text-white/70" />
          Services
        </div>

        <div className="flex items-center gap-1.5 px-2">
          <span className={`${LABEL} w-16 shrink-0`}>Service</span>
          <span className={`${LABEL} min-w-0 flex-1`}>Funding</span>
          <span className={`${LABEL} w-9 shrink-0 text-right`}>Load</span>
          <span className={`${LABEL} w-9 shrink-0 text-right`}>Worst</span>
          <span className={`${LABEL} w-9 shrink-0 text-right`}>Out</span>
        </div>

        <div className="flex flex-col gap-1">
          {SERVICE_DEFS.map(({ kind, label, department }) => {
            const key = fundingKeyOf(kind);
            const ownsSlider = key === kind;
            const funding = serviceFunding[key];
            const reading = serviceLoad?.[kind];
            const load = reading?.load ?? 0;
            const worst = reading?.worst ?? 0;
            const capped = reading?.capped ?? 0;
            // Under capacity is a fine reading, not a quiet problem; only over
            // it takes the danger token. 0% is the least leaned-on a service
            // can be, so it reads like any other healthy figure.
            const over = capped > 0 && load > 1;
            // Responders are calls at once, not people: shown apart from the
            // load, and flagged only when every one is out.
            const crew = responders?.[kind];
            const busy = crew !== undefined && crew.total > 0 && crew.inFlight >= crew.total;
            return (
              <div
                key={kind}
                className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[12px]"
              >
                <span className="w-16 shrink-0">{label}</span>
                {ownsSlider ? (
                  <input
                    type="range"
                    aria-label={`${department ?? label} funding`}
                    min={SERVICE_FUNDING_MIN}
                    max={SERVICE_FUNDING_MAX}
                    step={FUNDING_STEP}
                    value={funding}
                    onChange={(e) => setServiceFunding(key, Number(e.target.value))}
                    className="min-w-0 flex-1 accent-accent"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white/40">
                    Education funding
                  </span>
                )}
                <span
                  data-testid={`service-funding-${kind}`}
                  className="w-9 shrink-0 text-right text-[11px] text-white/60"
                >
                  ×{funding.toFixed(2)}
                </span>
                <span
                  data-testid={`service-load-${kind}`}
                  data-over={over ? 'true' : 'false'}
                  className={`w-9 shrink-0 text-right ${
                    capped <= 0 ? 'text-white/60' : over ? 'text-danger' : 'text-positive'
                  }`}
                >
                  {loadText(load, capped)}
                </span>
                <span
                  data-testid={`service-worst-${kind}`}
                  aria-label={`${label} worst district load`}
                  className="w-9 shrink-0 text-right text-[11px] text-white/60"
                >
                  {loadText(worst, capped)}
                </span>
                <span
                  data-testid={`service-responders-${kind}`}
                  data-busy={busy ? 'true' : 'false'}
                  aria-label={`${label} responders out on calls`}
                  className={`w-9 shrink-0 text-right text-[11px] ${
                    busy ? 'text-danger' : 'text-white/60'
                  }`}
                >
                  {crew ? `${crew.inFlight}/${crew.total}` : '—'}
                </span>
                {kind === 'park' && (
                  <span
                    data-testid="service-provision-park"
                    data-short={
                      openSpace !== undefined &&
                      openSpace !== null &&
                      openSpace.perThousand < OPEN_SPACE_TILES_PER_THOUSAND
                        ? 'true'
                        : 'false'
                    }
                    className="basis-full text-[11px] text-white/60"
                  >
                    {provisionText(openSpace?.perThousand)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
