'use client';

import { SYNC_MODES, type SyncMode } from '@/lib/library/versions';

export default function SyncModeSelect({ value, onChange }: { value: SyncMode; onChange: (mode: SyncMode) => void }) {
  const current = SYNC_MODES.find(m => m.value === value);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem', color: 'var(--text-muted)' }} title={current?.hint}>
      Versions
      <select className="sort-select" value={value} onChange={e => onChange(e.target.value as SyncMode)}>
        {SYNC_MODES.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </label>
  );
}
