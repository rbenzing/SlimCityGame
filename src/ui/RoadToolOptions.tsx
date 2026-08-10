/**
 * Road tool options — path mode, elevation, and snapping — as an inline row
 * rather than a floating panel. It lives in the asset drawer's header beside
 * the close button, because it is the road panel's own state: which way the
 * next drag runs and how high it sits. Rule zero applies as it always did:
 * every control here flips real, currently-consumed behavior.
 */
import type { JSX } from 'react';
import { BRIDGE_MAX_ELEVATION, ROAD_ELEVATION_STEP_M } from '../shared/constants';
import type { ToolMode } from './store';
import { useCityStore } from './store';

const CHIP = 'rounded-md px-2 py-1 text-xs font-medium transition-colors';
const CHIP_ON = 'bg-accent text-white';
const CHIP_OFF = 'bg-white/10 text-white/80 hover:bg-white/20';
const CHIP_STEP = `${CHIP} ${CHIP_OFF} disabled:opacity-40 disabled:hover:bg-white/10`;

/** A labelled cluster, so the row reads as groups rather than a wall of chips. */
function Group({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-white/45">{label}</span>
      {children}
    </div>
  );
}

export function RoadToolOptions(): JSX.Element {
  const toolMode = useCityStore((s) => s.toolMode);
  const setToolMode = useCityStore((s) => s.setToolMode);
  const toolFlags = useCityStore((s) => s.toolFlags);
  const setToolFlags = useCityStore((s) => s.setToolFlags);
  const roadElevation = useCityStore((s) => s.roadElevation);
  const setRoadElevation = useCityStore((s) => s.setRoadElevation);

  const modeButton = (mode: ToolMode, label: string): JSX.Element => (
    <button
      type="button"
      aria-pressed={toolMode === mode}
      onClick={() => setToolMode(mode)}
      className={`${CHIP} ${toolMode === mode ? CHIP_ON : CHIP_OFF}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Road tool options">
      <Group label="Path">
        <div className="flex gap-1">
          {modeButton('straight', 'Straight')}
          {modeButton('lpath', 'L-path')}
        </div>
      </Group>

      <Group label="Elevation">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Lower the road"
            title="Lower the road (Page Down)"
            disabled={roadElevation === 0}
            onClick={() => setRoadElevation(roadElevation - ROAD_ELEVATION_STEP_M)}
            className={CHIP_STEP}
          >
            Lower
          </button>
          <span
            aria-live="polite"
            className={`min-w-14 text-center text-xs tabular-nums ${
              roadElevation > 0 ? 'font-semibold text-accent' : 'text-white/70'
            }`}
          >
            {roadElevation === 0 ? 'Ground' : `${roadElevation} m`}
          </span>
          <button
            type="button"
            aria-label="Raise the road"
            title={`Raise the road (Page Up) — up to ${BRIDGE_MAX_ELEVATION} m`}
            disabled={roadElevation >= BRIDGE_MAX_ELEVATION}
            onClick={() => setRoadElevation(roadElevation + ROAD_ELEVATION_STEP_M)}
            className={CHIP_STEP}
          >
            Raise
          </button>
        </div>
      </Group>

      <Group label="Snap">
        <button
          type="button"
          aria-pressed={toolFlags.angleLock}
          onClick={() => setToolFlags({ angleLock: !toolFlags.angleLock })}
          className={`${CHIP} ${toolFlags.angleLock ? CHIP_ON : CHIP_OFF}`}
        >
          90°
        </button>
      </Group>
    </div>
  );
}
