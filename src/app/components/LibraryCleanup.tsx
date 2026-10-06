'use client';

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { applyCleanup, planCleanup, type CleanupItem } from '@/lib/library/cleanup';
import { ARCHIVE_DIR } from '@/lib/library/fs';
import { SYNC_MODES, type SyncMode } from '@/lib/library/versions';

type State =
  | { step: 'idle' }
  | { step: 'scanning'; done: number; total: number }
  | { step: 'review'; items: CleanupItem[] }
  | { step: 'moving'; done: number; total: number };

interface Props {
  root: FileSystemDirectoryHandle;
  mode: SyncMode;
  /** Must run inside the click handler: asks for write access to the folder. */
  ensurePermission: () => Promise<boolean>;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
  onFinished: () => void;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label} {done.toLocaleString()} / {total.toLocaleString()}</span>
      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-color)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary-color)', transition: 'width 0.2s ease' }} />
      </div>
    </div>
  );
}

export default function LibraryCleanup({ root, mode, ensurePermission, notify, onFinished }: Props) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const modeLabel = SYNC_MODES.find(m => m.value === mode)?.label ?? mode;

  const scan = async () => {
    if (mode === 'all') {
      notify('"Every version" keeps all architectures, so there is nothing to clean up.', 'info');
      return;
    }
    if (!(await ensurePermission())) {
      notify('Write permission to the folder was denied.', 'error');
      return;
    }
    setState({ step: 'scanning', done: 0, total: 0 });
    try {
      const items = await planCleanup(root, mode, (done, total) => setState({ step: 'scanning', done, total }));
      setState({ step: 'review', items });
    } catch (err) {
      console.error(err);
      notify('Could not scan the library folder.', 'error');
      setState({ step: 'idle' });
    }
  };

  const apply = async (items: CleanupItem[]) => {
    if (!(await ensurePermission())) {
      notify('Write permission to the folder was denied.', 'error');
      return;
    }
    setState({ step: 'moving', done: 0, total: items.length });
    const { moved, failed } = await applyCleanup(root, items, (done, total) => setState({ step: 'moving', done, total }));
    setState({ step: 'idle' });
    notify(
      failed > 0
        ? `Moved ${plural(moved, 'file')} to ${ARCHIVE_DIR}; ${plural(failed, 'file')} could not be moved (see console).`
        : `Moved ${plural(moved, 'file')} to ${ARCHIVE_DIR}.`,
      failed > 0 ? 'error' : 'success',
    );
    onFinished();
  };

  if (state.step === 'idle') {
    return (
      <button
        className="action-btn"
        onClick={scan}
        title={`Find packs that keep more than one version of the same captures, using "${modeLabel}"`}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <Layers size={16} /> Clean up duplicate versions
      </button>
    );
  }

  return (
    <div style={{ flexBasis: '100%', marginTop: '0.5rem', padding: '1.2rem 1.5rem', borderRadius: '12px', border: '1px solid var(--surface-border)', background: 'var(--bg-card)' }}>
      {state.step === 'scanning' && <Progress label="Checking packs…" done={state.done} total={state.total} />}
      {state.step === 'moving' && <Progress label={`Moving files to ${ARCHIVE_DIR}…`} done={state.done} total={state.total} />}
      {state.step === 'review' && (() => {
        const { items } = state;
        const files = items.reduce((n, i) => n + i.files.length, 0);
        if (items.length === 0) {
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span>No extra versions found: every pack already has one version per capture ({modeLabel}).</span>
              <button className="action-btn" onClick={() => setState({ step: 'idle' })}>Close</button>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <strong style={{ fontSize: '1.1rem' }}>{plural(items.length, 'pack')} keep extra versions</strong>
              <p style={{ margin: '0.4rem 0 0', color: 'var(--text-muted)' }}>
                With &quot;{modeLabel}&quot;, {plural(files, 'model file')} would move to <code>{ARCHIVE_DIR}/</code> inside your library folder.
                Nothing is deleted, and IRs (.wav) and folders without a metadata.json are left alone.
              </p>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--surface-border)', borderRadius: '8px' }}>
              {items.map(item => (
                <details key={`${item.pack.category}/${item.pack.folder}`} style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--surface-border)' }}>
                  <summary style={{ cursor: 'pointer' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{item.pack.category} / </span>{item.pack.folder}
                    <span style={{ color: 'var(--text-muted)' }}> · {item.files.length} to archive, {item.kept} kept</span>
                  </summary>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {item.files.map(f => <li key={f}>{f}</li>)}
                  </ul>
                </details>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="action-btn" onClick={() => apply(items)} style={{ background: 'var(--primary-color)', color: '#000', border: 'none' }}>
                Move {plural(files, 'file')} to {ARCHIVE_DIR}
              </button>
              <button className="action-btn" onClick={() => setState({ step: 'idle' })}>Cancel</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
