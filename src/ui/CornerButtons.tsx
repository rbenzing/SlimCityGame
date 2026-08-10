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
  advisorOpen: boolean;
  onToggleAdvisor: () => void;
  /** Critical issues right now — badged so a closed panel still says something is wrong. */
  advisorAlerts: number;
  /** Opens the in-game pause menu overlay (StartMenu shown over the running game). */
  onOpenMenu?: () => void;
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
  advisorOpen,
  onToggleAdvisor,
  advisorAlerts,
  onOpenMenu,
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
        <div className="pointer-events-none relative">
          <CornerButton
            label="Advisor"
            active={advisorOpen}
            onClick={onToggleAdvisor}
            icon="advisor"
          />
          {advisorAlerts > 0 && (
            <span
              aria-label={`${advisorAlerts} critical issue${advisorAlerts === 1 ? '' : 's'}`}
              className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
            >
              {advisorAlerts}
            </span>
          )}
        </div>
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
        {onOpenMenu && (
          <CornerButton label="Menu" active={false} onClick={onOpenMenu} icon="menu" />
        )}
      </div>
    </>
  );
}
