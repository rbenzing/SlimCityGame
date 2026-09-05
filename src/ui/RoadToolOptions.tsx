/**
 * Road tool options — path mode, elevation, and snapping — as an inline row
 * rather than a floating panel. It lives in the asset drawer's header beside
 * the close button, because it is the road panel's own state: which way the
 * next drag runs and how high it sits. Rule zero applies as it always did:
 * every control here flips real, currently-consumed behavior.
 */
import type { JSX } from 'react';
import { BRIDGE_MAX_ELEVATION, ROAD_ELEVATION_STEP_M, TILE_METERS } from '../shared/constants';
import {
  composeProfile,
  editsOf,
  isLayable,
  presetProfileForTier,
  profileWidth,
  roadClass,
  type SideChoice,
} from '../shared/roadprofile';
import { ROAD_TOOL_TO_TIER } from '../tools/tools';
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

const SIDE_CHOICES: readonly { value: SideChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];

/**
 * The Profile row: what the selected road's cross-section holds at its
 * kerbs — parking, bike lanes, footways — and the width that adds up to
 * against the tile. Only the pieces the road's class admits are offered, so
 * a motorway is never asked about parking. Every control composes a real
 * profile the next drag lays.
 */
function ProfileGroup(): JSX.Element | null {
  const tool = useCityStore((s) => s.selectedTool);
  const edits = useCityStore((s) => s.roadProfileEdits);
  const setEdits = useCityStore((s) => s.setRoadProfileEdits);
  const tier = ROAD_TOOL_TO_TIER[tool];
  if (tier === undefined) return null;

  const base = presetProfileForTier(tier);
  const admits = new Set(roadClass(base.class).admits);
  const offersParking = admits.has('parking');
  const offersBike = admits.has('bike');
  const offersFootways = admits.has('sidewalk');
  if (!offersParking && !offersBike && !offersFootways) return null;

  const composed = composeProfile(base, edits);
  const current = editsOf(composed);
  const width = profileWidth(composed);
  const fits = isLayable(composed);

  const sideRow = (label: string, key: 'parking' | 'bike', value: SideChoice): JSX.Element => (
    <Group label={label}>
      <div className="flex gap-1" role="group" aria-label={`${label} lanes`}>
        {SIDE_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={value === choice.value}
            onClick={() => setEdits({ [key]: choice.value })}
            className={`${CHIP} ${value === choice.value ? CHIP_ON : CHIP_OFF}`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </Group>
  );

  return (
    <>
      {offersParking ? sideRow('Parking', 'parking', current.parking ?? 'none') : null}
      {offersBike ? sideRow('Bike', 'bike', current.bike ?? 'none') : null}
      {offersFootways ? (
        <Group label="Footways">
          <button
            type="button"
            aria-pressed={current.footways === true}
            onClick={() => setEdits({ footways: !current.footways })}
            className={`${CHIP} ${current.footways ? CHIP_ON : CHIP_OFF}`}
          >
            {current.footways ? 'On' : 'Off'}
          </button>
        </Group>
      ) : null}
      <Group label="Width">
        <span
          aria-label="Profile width"
          title={fits ? 'Fits the tile' : 'Too wide for the tile'}
          className={`text-xs tabular-nums ${fits ? 'text-white/70' : 'font-semibold text-red-400'}`}
        >
          {width.toFixed(1)} / {TILE_METERS} m
        </span>
      </Group>
    </>
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

      <ProfileGroup />
    </div>
  );
}
