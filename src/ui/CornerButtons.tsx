/**
 * Top-corner utility buttons. Left: City info. Right cluster: Help, plus the
 * Stats charts toggle and Photo mode toggle. Rule zero: no dead gear/settings
 * button (no settings system exists yet).
 */
import type { JSX } from 'react';
import { Icon, type IconName } from './icons';
import { PANEL_ROUNDED } from './theme';

export interface CornerButtonsProps {
  cityInfoOpen: boolean;
  onToggleCityInfo: () => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  photoActive: boolean;
  onTogglePhoto: () => void;
}

function CornerButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: IconName;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition-colors ${
        active ? 'bg-accent text-white' : `${PANEL_ROUNDED} hover:bg-white/10`
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

export function CornerButtons({
  cityInfoOpen,
  onToggleCityInfo,
  helpOpen,
  onToggleHelp,
  statsOpen,
  onToggleStats,
  photoActive,
  onTogglePhoto,
}: CornerButtonsProps): JSX.Element {
  return (
    <>
      <div className="fixed left-3 top-3 z-20">
        <CornerButton
          label="City info"
          active={cityInfoOpen}
          onClick={onToggleCityInfo}
          icon="info"
        />
      </div>
      <div className="fixed right-3 top-3 z-20 flex items-center gap-1.5">
        <CornerButton
          label="City stats"
          active={statsOpen}
          onClick={onToggleStats}
          icon="infoviews"
        />
        <CornerButton
          label="Photo mode"
          active={photoActive}
          onClick={onTogglePhoto}
          icon="camera"
        />
        <CornerButton label="Help" active={helpOpen} onClick={onToggleHelp} icon="help" />
      </div>
    </>
  );
}
