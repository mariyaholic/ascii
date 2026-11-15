import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-md border border-amber-500/40 bg-[var(--pg-surface)] px-3 py-2 text-xs font-medium text-amber-300 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Offline Mode — Local processing active</span>
    </div>
  );
};
