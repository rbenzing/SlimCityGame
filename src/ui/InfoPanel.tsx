/**
 * Building info panel, floating left. Base rows (name, zone,
 * level, coverage/output, upkeep, problems) come from `selectedBuilding` +
 * the catalog alone. The richer rows (happiness face,
 * occupancy, tax) only need `selectionInfo` — the Integrate phase wires the
 * worker payload that fills it; until then those rows simply don't render.
 */
import type { JSX } from 'react';
import catalogData from '../data/catalog.json';
import { BuildingState, Problem, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingState as BuildingStateValue } from '../shared/types';
import { happinessFace } from './format';
import { Icon, type IconName } from './icons';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

// The status word is "Content", not the raw BuildingState.Active name.
const STATE_LABELS: Record<BuildingStateValue, string> = {
  [BuildingState.Constructing]: 'Constructing',
  [BuildingState.Active]: 'Content',
  [BuildingState.Abandoned]: 'Abandoned',
};

const PROBLEM_LABELS: ReadonlyArray<{ flag: number; label: string }> = [
  { flag: Problem.NoPower, label: 'No Power' },
  { flag: Problem.NoWater, label: 'No Water' },
  { flag: Problem.NoRoad, label: 'No Road' },
  { flag: Problem.HighCrime, label: 'High Crime' },
  { flag: Problem.HighPollution, label: 'High Pollution' },
  { flag: Problem.LowDemand, label: 'Low Demand' },
];

function zoneDisplayName(entry: BuildingCatalogEntry | undefined): string {
  switch (entry?.zone) {
    case ZoneType.ResLow:
      return 'Low Density Residential';
    case ZoneType.ResHigh:
      return 'High Density Residential';
    case ZoneType.ComLow:
      return 'Low Density Commercial';
    case ZoneType.ComHigh:
      return 'High Density Commercial';
    case ZoneType.Industrial:
      return 'Industrial';
    default:
      break;
  }
  switch (entry?.category) {
    case 'service':
      return 'Service';
    case 'utility':
      return 'Utility';
    case 'park':
      return 'Park';
    default:
      return 'Unzoned';
  }
}

function iconForEntry(entry: BuildingCatalogEntry | undefined): IconName {
  if (!entry) return 'city';
  switch (entry.category) {
    case 'res':
    case 'com':
    case 'ind':
      return 'zoning';
    case 'park':
      return 'parks';
    case 'utility':
      return entry.utility?.waterKL !== undefined ? 'water' : 'electricity';
    case 'service':
      switch (entry.service?.kind) {
        case 'police':
          return 'police';
        case 'fire':
          return 'fire';
        case 'health':
          return 'health';
        case 'education':
          return 'education';
        case 'park':
          return 'parks';
        default:
          return 'city';
      }
    default:
      return 'city';
  }
}

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-0.5" data-testid={testId}>
      <span className="uppercase text-[10px] tracking-wide text-white/60">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function InfoPanel(): JSX.Element | null {
  const building = useCityStore((s) => s.selectedBuilding);
  const setSelectedBuilding = useCityStore((s) => s.setSelectedBuilding);
  const setTool = useCityStore((s) => s.setTool);
  const selectionInfo = useCityStore((s) => s.selectionInfo);

  if (!building) return null;

  /**
   * Closing the panel returns to a fully neutral state: drop the selected
   * building AND put the neutral `select` tool in hand (picks only, never
   * places — ToolManager treats 'select' as no-op on pointer down/up), so
   * after the X only camera pan/zoom and picking work and nothing can be
   * accidentally placed.
   */
  const close = (): void => {
    setSelectedBuilding(null);
    setTool('select');
  };

  const entry = catalogById.get(building.catalogId);
  const name = entry?.name ?? building.catalogId;
  const info = selectionInfo && selectionInfo.building.id === building.id ? selectionInfo : null;
  const activeProblems = PROBLEM_LABELS.filter((p) => (building.problems & p.flag) !== 0);
  const isZoned = entry?.zone !== undefined;

  return (
    <div className="pointer-events-none fixed left-3 top-1/3 z-10 w-80">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name={iconForEntry(entry)} className="h-5 w-5 shrink-0 text-white/70" />
            <div className="font-semibold">
              {name} <span className="font-normal text-white/50">· #{building.id}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close building info"
            onClick={close}
            className="text-white/60 transition-colors hover:text-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-white/70">
          {info && <span aria-hidden="true">{happinessFace(info.happiness)}</span>}
          <span>{STATE_LABELS[building.state]}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <Row label="Zone" value={zoneDisplayName(entry)} />

          <div className="flex items-center justify-between py-0.5">
            <span className="uppercase text-[10px] tracking-wide text-white/60">Level</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((p) => (
                <span
                  key={p}
                  data-testid="level-pip"
                  data-filled={p <= building.level}
                  className={`h-3.5 w-1.5 rounded-sm ${p <= building.level ? 'bg-[var(--color-positive)]' : 'bg-[#ffffff1f]'}`}
                />
              ))}
            </div>
          </div>

          {entry?.service && (
            <Row label="Coverage" value={`${entry.service.kind} · ${entry.service.range}m`} />
          )}
          {entry?.utility?.powerMW !== undefined && (
            <Row label="Output" value={`${entry.utility.powerMW} MW`} />
          )}
          {entry?.utility?.waterKL !== undefined && (
            <Row label="Output" value={`${entry.utility.waterKL} kL`} />
          )}

          {info?.occupancy.households && (
            <Row
              label="Households"
              value={`${info.occupancy.households.occupied}/${info.occupancy.households.capacity}`}
            />
          )}
          {info?.occupancy.residents !== undefined && (
            <Row label="Residents" value={`${info.occupancy.residents}`} />
          )}
          {info?.occupancy.jobs !== undefined && (
            <Row label="Jobs" value={`${info.occupancy.jobs}`} />
          )}

          {entry && <Row label="Upkeep" value={`¢${entry.upkeep}/mo`} />}
          {info && isZoned && (
            <Row label="Tax" value={`¢${Math.round(info.monthlyTax)}/mo`} testId="tax-row" />
          )}
        </div>

        {activeProblems.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeProblems.map((p) => (
              <span
                key={p.label}
                className="rounded-full bg-[#e5533f]/20 px-2 py-0.5 text-xs text-[#e5533f]"
              >
                {p.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
