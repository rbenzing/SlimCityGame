/**
 * Terraform options panel, floating left of the asset drawer: the brush
 * radius / strength sliders plus Level's sampled-height readout. Rule zero
 * applies — only controls that flip real, currently-consumed behavior render.
 *
 * Road options used to live here too and now sit in the roads drawer's own
 * header (see RoadToolOptions), where they belong. Terraform has no drawer
 * header to ride in — its cards are brush pictograms — so it keeps the panel.
 * Zone tools have one real mode (Rect; Brush isn't implemented) and Bulldoze is
 * Rect-only, so neither renders anything.
 */
import type { JSX } from 'react';
import {
  TERRAFORM_BRUSH_MAX,
  TERRAFORM_BRUSH_MIN,
  TERRAFORM_STRENGTH_MAX,
  TERRAFORM_STRENGTH_MIN,
} from '../shared/constants';

import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';


function isTerraformTool(tool: string): boolean {
  return tool.startsWith('terraform.');
}

function TerraformOptions(): JSX.Element {
  const tool = useCityStore((s) => s.selectedTool);
  const brushSettings = useCityStore((s) => s.brushSettings);
  const setBrushSettings = useCityStore((s) => s.setBrushSettings);
  const preview = useCityStore((s) => s.preview);

  return (
    <div
      className={`pointer-events-auto fixed bottom-28 left-2 z-10 flex w-52 flex-col gap-2.5 p-3 text-white ${PANEL_ROUNDED}`}
      role="group"
      aria-label="Tool options"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-white/60">Brush radius</span>
          <span className="text-xs text-white/80">{brushSettings.radius}</span>
        </div>
        <input
          type="range"
          aria-label="Brush radius"
          min={TERRAFORM_BRUSH_MIN}
          max={TERRAFORM_BRUSH_MAX}
          step={1}
          value={brushSettings.radius}
          onChange={(e) => setBrushSettings({ radius: Number(e.target.value) })}
          className="accent-accent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-white/60">Strength</span>
          <span className="text-xs text-white/80">{brushSettings.strength}</span>
        </div>
        <input
          type="range"
          aria-label="Strength"
          min={TERRAFORM_STRENGTH_MIN}
          max={TERRAFORM_STRENGTH_MAX}
          step={1}
          value={brushSettings.strength}
          onChange={(e) => setBrushSettings({ strength: Number(e.target.value) })}
          className="accent-accent"
        />
      </div>
      {tool === 'terraform.level' && (
        <div className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1 text-xs">
          <span className="text-white/60">Target height</span>
          <span>{preview?.label ?? 'Level'}</span>
        </div>
      )}
    </div>
  );
}

export function ToolOptionsPanel(): JSX.Element | null {
  const tool = useCityStore((s) => s.selectedTool);

  if (isTerraformTool(tool)) return <TerraformOptions />;
  // Road options moved into the roads drawer's own header (RoadToolOptions):
  // they are that panel's state, and a second floating panel beside it was
  // chrome for its own sake.
  return null;
}
