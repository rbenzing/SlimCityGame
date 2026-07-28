/**
 * Districts & policies panel. Shown while the
 * district.paint tool is in hand or the 'districts' lens is active. Lets the
 * player: pick which district id the paint tool stamps, start a new district
 * (next free id), and toggle the four per-district policies. Policy toggles
 * emit setDistrictPolicy commands (via the store's bound bridge) and mirror
 * the optimistic on/off state locally — the worker owns the authoritative
 * effect (economy tax, pathfind cost, pollution).
 */
import type { JSX } from 'react';
import type { Policy } from '../shared/types';
import { Icon } from './icons';
import { useCityStore } from './store';
import { LABEL, PANEL_ROUNDED } from './theme';

const POLICY_DEFS: ReadonlyArray<{ id: Policy; label: string }> = [
  { id: 'lowTax', label: 'Low Tax' },
  { id: 'highTax', label: 'High Tax' },
  { id: 'noHeavyTraffic', label: 'No Heavy Traffic' },
  { id: 'greenEnergy', label: 'Green Energy' },
];

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function DistrictPanel(): JSX.Element | null {
  const selectedTool = useCityStore((s) => s.selectedTool);
  const overlay = useCityStore((s) => s.overlay);
  const districts = useCityStore((s) => s.districts);
  const selectedDistrict = useCityStore((s) => s.selectedDistrict);
  const setSelectedDistrict = useCityStore((s) => s.setSelectedDistrict);
  const districtPolicies = useCityStore((s) => s.districtPolicies);
  const toggleDistrictPolicy = useCityStore((s) => s.toggleDistrictPolicy);

  const visible = selectedTool === 'district.paint' || overlay === 'districts';
  if (!visible) return null;

  const maxId = districts.reduce((m, d) => Math.max(m, d.id), 0);
  const activePolicies = districtPolicies[selectedDistrict] ?? [];

  return (
    <div className="pointer-events-none fixed left-3 top-16 z-10 w-64">
      <div
        className={`pointer-events-auto flex flex-col gap-2 p-3 text-sm text-white/92 ${PANEL_ROUNDED}`}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="districts" className="h-5 w-5 text-white/70" />
          Districts
        </div>

        <div className={LABEL}>Paint district</div>
        <div className="flex flex-wrap gap-1">
          {districts.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={selectedDistrict === d.id}
              onClick={() => setSelectedDistrict(d.id)}
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                selectedDistrict === d.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/10'
              }`}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: hexColor(d.color) }}
              />
              {d.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedDistrict(maxId + 1)}
            className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
              selectedDistrict > maxId ? 'bg-accent text-white' : 'text-white/60 hover:bg-white/10'
            }`}
          >
            + New{selectedDistrict > maxId ? ` (${selectedDistrict})` : ''}
          </button>
        </div>

        <div className={`${LABEL} mt-1`}>Policies · District {selectedDistrict}</div>
        <div className="flex flex-col gap-1">
          {POLICY_DEFS.map((p) => {
            const on = activePolicies.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDistrictPolicy(selectedDistrict, p.id)}
                className={`flex items-center justify-between rounded-md px-2 py-1 text-[12px] transition-colors ${
                  on ? 'bg-accent/25 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                <span>{p.label}</span>
                <span
                  className={`ml-2 inline-flex h-3.5 w-6 items-center rounded-full px-0.5 ${on ? 'bg-accent justify-end' : 'bg-white/15 justify-start'}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
