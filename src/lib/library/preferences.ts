'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_SYNC_MODE, isSyncMode, type SyncMode } from './versions';

const SYNC_MODE_KEY = 'namman_sync_mode';
const listeners = new Set<() => void>();

function readSyncMode(): SyncMode {
  try {
    const v = localStorage.getItem(SYNC_MODE_KEY);
    return isSyncMode(v) ? v : DEFAULT_SYNC_MODE;
  } catch {
    return DEFAULT_SYNC_MODE;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Which model versions to download. Shared by every page through localStorage. */
export function useSyncMode(): [SyncMode, (mode: SyncMode) => void] {
  const mode = useSyncExternalStore(subscribe, readSyncMode, () => DEFAULT_SYNC_MODE);
  const setMode = useCallback((next: SyncMode) => {
    try {
      localStorage.setItem(SYNC_MODE_KEY, next);
    } catch {
      // storage unavailable: the choice lasts for this page view only
    }
    listeners.forEach(l => l());
  }, []);
  return [mode, setMode];
}
