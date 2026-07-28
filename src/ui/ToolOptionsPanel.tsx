/**
 * Tool options panel, floating left of the asset drawer. Rule zero: only
 * rows whose toggles flip real, currently-consumed behavior are rendered.
 * That's road tools (the Tool Mode segmented control and the 90° lock
 * snapping chip) and the terraform brush family (Brush
 * radius / Strength sliders, plus Level's sampled-height readout). Zone
 * tools only have one real mode (Rect — Brush isn't implemented), and
 * Bulldoze is explicitly "Rect only -> row hidden", so this panel renders
 * nothing for any other tool.
 */
import type { JSX } from 'react';
import {
  TERRAFORM_BRUSH_MAX,
  TERRAFORM_BRUSH_MIN,
  TERRAFORM_STRENGTH_MAX,
  TERRAFORM_STRENGTH_MIN,
} from '../shared/constants';
import type { ToolMode } from './store';
import { useCityStore } from './store';
import { PANEL_ROUNDED } from './theme';

function isRoadTool(tool: string): boolean {
  return tool.startsWith('road.');
}

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
  const toolMode = useCityStore((s) => s.toolMode);
  const toolFlags = useCityStore((s) => s.toolFlags);
  const setToolMode = useCityStore((s) => s.setToolMode);
  const setToolFlags = useCityStore((s) => s.setToolFlags);

  if (isTerraformTool(tool)) return <TerraformOptions />;
  if (!isRoadTool(tool)) return null;

  const modeButton = (mode: ToolMode, label: string): JSX.Element => (
    <button
      type="button"
      aria-pressed={toolMode === mode}
      onClick={() => setToolMode(mode)}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        toolMode === mode ? 'bg-accent text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`pointer-events-auto fixed bottom-28 left-2 z-10 flex w-52 flex-col gap-2.5 p-3 text-white ${PANEL_ROUNDED}`}
      role="group"
      aria-label="Tool options"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-white/60">Tool Mode</span>
        <div className="flex gap-1">
          {modeButton('straight', 'Straight')}
          {modeButton('lpath', 'L-path')}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-white/60">Snapping</span>
        <button
          type="button"
          aria-pressed={toolFlags.angleLock}
          onClick={() => setToolFlags({ angleLock: !toolFlags.angleLock })}
          className={`self-start rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            toolFlags.angleLock
              ? 'bg-accent text-white'
              : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
        >
          90° lock
        </button>
      </div>
    </div>
  );
}
