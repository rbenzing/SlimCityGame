/**
 * Toast stack, top-center. Info toasts auto-dismiss once
 * `stats.tick` has advanced ~6 simulated seconds past the notification's
 * tick — deterministic, no Date.now/wall-clock timers. Warnings/criticals
 * persist until the player dismisses them.
 */
import { useEffect } from 'react';
import { TICK_RATE } from '../shared/constants';
import type { CityNotification } from '../shared/types';
import { useCityStore } from './store';

const INFO_TTL_TICKS = 6 * TICK_RATE;

const SEVERITY_STYLES: Record<CityNotification['severity'], string> = {
  info: 'bg-slate-800/90 border-slate-500/40',
  warning: 'bg-amber-700/90 border-amber-400/50',
  critical: 'bg-red-800/90 border-red-400/60',
};

const SEVERITY_ICON: Record<CityNotification['severity'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🛑',
};

export function Toasts() {
  const notifications = useCityStore((s) => s.notifications);
  const tick = useCityStore((s) => s.stats.tick);
  const dismissNotification = useCityStore((s) => s.dismissNotification);

  useEffect(() => {
    for (const note of notifications) {
      if (note.severity === 'info' && tick - note.tick >= INFO_TTL_TICKS) {
        dismissNotification(note.id);
      }
    }
  }, [notifications, tick, dismissNotification]);

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 flex w-full max-w-md -translate-x-1/2 flex-col items-stretch gap-2">
      {notifications.map((note) => (
        <div
          key={note.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-white shadow-lg backdrop-blur ${SEVERITY_STYLES[note.severity]}`}
        >
          {/* Emoji only behind a data-placeholder marker, inventoried for icon-set replacement. */}
          <span aria-hidden="true" data-placeholder="emoji">
            {SEVERITY_ICON[note.severity]}
          </span>
          <div className="flex-1">
            <div className="font-semibold">{note.title}</div>
            <div className="text-white/80">{note.body}</div>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            data-placeholder="glyph"
            onClick={() => dismissNotification(note.id)}
            className="text-white/60 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
