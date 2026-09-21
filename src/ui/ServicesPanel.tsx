/**
 * Services panel. Shown while a service ploppable is in hand or one of the
 * service lenses is on, in the same left slot as the district and transit
 * panels. One row per service kind, each carrying the funding slider and the
 * load gauge together: they are the two answers to one question, and splitting
 * them across two screens is what kept funding invisible — it has been in the
 * simulation since the start with no control anywhere reaching it.
 *
 * The slider emits setServiceFunding through the store's bound bridge and the
 * store flips its own reading at once, as the district policy toggles do; the
 * worker still owns the authoritative funding (it scales range, capacity and
 * upkeep) and confirms on the next snapshot.
 */
import type { JSX } from 'react';
import { SERVICE_FUNDING_MAX, SERVICE_FUNDING_MIN } from '../shared/constants';
import { FieldId } from '../shared/types';
import type { LensId, ServiceKind } from '../shared/types';
import { catalogEntryForTool } from './categories';
import { Icon } from './icons';
import { useCityStore } from './store';
import { LABEL, PANEL_ROUNDED } from './theme';

/** Every kind gets a row, capped or not — a park's row is where its slider is. */
const SERVICE_DEFS: ReadonlyArray<{ kind: ServiceKind; label: string }> = [
  { kind: 'police', label: 'Police' },
  { kind: 'fire', label: 'Fire' },
  { kind: 'health', label: 'Health' },
  { kind: 'education', label: 'Education' },
  { kind: 'park', label: 'Parks' },
];

/** The lenses that read a service's own field; the panel answers what they ask. */
const SERVICE_LENSES: ReadonlySet<LensId> = new Set<LensId>([
  FieldId.Crime,
  FieldId.FireRisk,
  FieldId.Health,
  FieldId.Education,
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

export function ServicesPanel(): JSX.Element | null {
  const selectedTool = useCityStore((s) => s.selectedTool);
  const overlay = useCityStore((s) => s.overlay);
  const serviceFunding = useCityStore((s) => s.stats.serviceFunding);
  const serviceLoad = useCityStore((s) => s.serviceLoad);
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
          <span className={`${LABEL} w-14 shrink-0`}>Service</span>
          <span className={`${LABEL} min-w-0 flex-1`}>Funding</span>
          <span className={`${LABEL} w-9 shrink-0 text-right`}>Load</span>
          <span className={`${LABEL} w-9 shrink-0 text-right`}>Worst</span>
        </div>

        <div className="flex flex-col gap-1">
          {SERVICE_DEFS.map(({ kind, label }) => {
            const funding = serviceFunding[kind];
            const reading = serviceLoad?.[kind];
            const load = reading?.load ?? 0;
            const worst = reading?.worst ?? 0;
            const capped = reading?.capped ?? 0;
            // Under capacity is a fine reading, not a quiet problem; only over
            // it takes the danger token. 0% is the least leaned-on a service
            // can be, so it reads like any other healthy figure.
            const over = capped > 0 && load > 1;
            return (
              <div
                key={kind}
                className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[12px]"
              >
                <span className="w-14 shrink-0">{label}</span>
                <input
                  type="range"
                  aria-label={`${label} funding`}
                  min={SERVICE_FUNDING_MIN}
                  max={SERVICE_FUNDING_MAX}
                  step={FUNDING_STEP}
                  value={funding}
                  onChange={(e) => setServiceFunding(kind, Number(e.target.value))}
                  className="min-w-0 flex-1 accent-accent"
                />
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
