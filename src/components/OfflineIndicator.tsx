import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Plain chip: the studio's status rail owns positioning so this notice can
 * never collide with the update notice.
 */
export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-2 rounded-md border border-[var(--pg-warn)]/40 bg-[var(--pg-surface)]/95 px-3 py-2 text-xs font-medium text-[var(--pg-warn)] shadow-lg backdrop-blur"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Offline — rendering locally</span>
    </div>
  );
};
