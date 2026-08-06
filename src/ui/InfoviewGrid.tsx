/**
 * Infoviews lens grid: opened from the main dock's ◐ toggle. The 9 FieldId
 * heatmap lenses plus the Power/Watered coverage lenses and a None entry.
 * Selecting a lens sets the store's overlay; clicking the
 * active lens again turns it back off.
 */
import type { JSX } from 'react';
import { FieldId } from '../shared/types';
import type { LensId } from '../shared/types';
import { Icon, type IconName } from './icons';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';

const LENSES: ReadonlyArray<{ id: LensId; label: string; icon: IconName }> = [
  { id: FieldId.LandValue, label: 'Land Value', icon: 'land-value' },
  { id: FieldId.Pollution, label: 'Pollution', icon: 'pollution' },
  { id: FieldId.Noise, label: 'Noise', icon: 'noise' },
  { id: FieldId.Traffic, label: 'Traffic', icon: 'traffic' },
  { id: FieldId.Crime, label: 'Crime', icon: 'crime' },
  { id: FieldId.FireRisk, label: 'Fire Risk', icon: 'fire' },
  { id: FieldId.Education, label: 'Education', icon: 'education' },
  { id: FieldId.Health, label: 'Health', icon: 'health' },
  { id: FieldId.Happiness, label: 'Happiness', icon: 'happiness' },
  { id: 'power', label: 'Power', icon: 'electricity' },
  { id: 'watered', label: 'Water', icon: 'water' },
  { id: 'trash', label: 'Trash', icon: 'pollution' },
  // Transit / Districts overlays.
  { id: 'transit', label: 'Transit', icon: 'transit' },
  { id: 'districts', label: 'Districts', icon: 'districts' },
];

function lensButtonClass(active: boolean): string {
  return `flex flex-col items-center gap-1 rounded-md px-2.5 py-2 text-[10px] leading-tight transition-colors ${
    active ? 'bg-accent text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
  }`;
}

export function InfoviewGrid(): JSX.Element {
  const overlay = useCityStore((s) => s.overlay);
  const setOverlay = useCityStore((s) => s.setOverlay);

  return (
    <div
      className={`pointer-events-auto grid grid-cols-4 gap-1.5 p-2 text-white ${PANEL_ROUNDED}`}
      role="menu"
      aria-label="Infoviews"
    >
      <button
        type="button"
        aria-pressed={overlay === null}
        onClick={() => setOverlay(null)}
        className={lensButtonClass(overlay === null)}
      >
        <span aria-hidden="true">∅</span>
        <span>None</span>
      </button>
      {LENSES.map((lens) => {
        const active = overlay === lens.id;
        return (
          <button
            key={String(lens.id)}
            type="button"
            aria-pressed={active}
            onClick={() => setOverlay(active ? null : lens.id)}
            className={lensButtonClass(active)}
          >
            <Icon name={lens.icon} className="h-4 w-4" />
            <span>{lens.label}</span>
          </button>
        );
      })}
    </div>
  );
}
