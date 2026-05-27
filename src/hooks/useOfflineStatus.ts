import { useCallback, useEffect, useState } from 'react';
import { getPendingOfflineChanges, isMockLocal, isRuntimeOffline } from '@/lib/localWarehouseData';
import { syncPendingOfflineChanges } from '@/hooks/useSupabaseData';

function readStatus() {
  return {
    offline: isRuntimeOffline(),
    pendingCount: getPendingOfflineChanges().length,
  };
}

export function useOfflineStatus() {
  const [status, setStatus] = useState(readStatus);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setStatus(readStatus());
  }, []);

  const syncNow = useCallback(async () => {
    if (isMockLocal || isRuntimeOffline() || getPendingOfflineChanges().length === 0) {
      refresh();
      return { synced: 0, pending: getPendingOfflineChanges().length };
    }

    setSyncing(true);
    try {
      return await syncPendingOfflineChanges();
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => {
      void syncNow();
    };
    const handleChange = () => refresh();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleChange);
    window.addEventListener('storage', handleChange);
    const interval = window.setInterval(refresh, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleChange);
      window.removeEventListener('storage', handleChange);
      window.clearInterval(interval);
    };
  }, [refresh, syncNow]);

  return {
    isLocalDemo: isMockLocal,
    isOffline: status.offline,
    pendingCount: status.pendingCount,
    syncing,
    syncNow,
  };
}
