'use client';

import { useEffect } from 'react';

/** Shows bulk progress in the tab title, so it can be followed with the tab in the background. */
export function useBulkTitle(done: number, total: number, status: 'idle' | 'running' | 'paused') {
  useEffect(() => {
    const original = 'NAMMAN';
    if (status === 'idle' || total === 0) {
      document.title = original;
      return;
    }
    document.title = `${status === 'paused' ? '⏸ ' : ''}(${done}/${total}) ${original}`;
    return () => {
      document.title = original;
    };
  }, [done, total, status]);
}

/** Chrome slows down (or, with Energy Saver, freezes) hidden tabs, which stalls a bulk download. */
export function KeepVisibleHint() {
  return (
    <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#facc15' }}>
      Keep this tab visible while it runs: Chrome slows down hidden tabs, and pauses them with Energy Saver on.
    </p>
  );
}
