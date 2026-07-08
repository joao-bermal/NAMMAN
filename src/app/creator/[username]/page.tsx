'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DownloadCloud, CheckCircle, Bookmark, Folder, ExternalLink,
  ArrowLeft, Users, Download, X, ChevronLeft, ChevronRight,
  Layers, CheckSquare, Square
} from 'lucide-react';

import { PUBLISHABLE_KEY, getRedirectUri } from '@/lib/tone3000/config';
import { T3KClient, startStandardFlow } from '@/lib/tone3000/tone3000-client';
import { Gear, TonesSort, type Tone, type Model, type ArchitectureVersion } from '@/lib/tone3000/types';

const client = new T3KClient(PUBLISHABLE_KEY, () => {
  if (typeof window !== 'undefined') startStandardFlow(PUBLISHABLE_KEY, getRedirectUri());
});

const PAGE_SIZE = 15;

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

type BulkItem = { id: number; title: string; status: 'pending' | 'syncing' | 'done' | 'error'; error?: string };

export default function CreatorPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [connected, setConnected] = useState<boolean | null>(null);
  const [tones, setTones] = useState<Tone[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTones, setTotalTones] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());
  const [downloadingItems, setDownloadingItems] = useState<Set<number>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Bulk progress panel
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // Toast
  const [toasts, setToasts] = useState<{ id: string; message: string; type: string }[]>([]);
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  // Sync job queue
  const syncQueueRef = useRef<(() => Promise<void>)[]>([]);
  const syncRunningRef = useRef(false);
  const processSyncQueue = useCallback(() => {
    if (syncRunningRef.current) return;
    const next = syncQueueRef.current.shift();
    if (!next) return;
    syncRunningRef.current = true;
    next().finally(() => {
      syncRunningRef.current = false;
      if (syncQueueRef.current.length > 0) {
        setTimeout(() => processSyncQueue(), 3000);
      }
    });
  }, []);

  // Bootstrap auth
  useEffect(() => {
    const tokens = client.getTokens();
    if (!tokens) {
      setConnected(false);
      return;
    }
    setConnected(true);
    // Load downloaded IDs
    (async () => {
      try {
        const ids = new Set<number>();
        let page = 1, pages = 1;
        do {
          const res = await client.listDownloadedTones({ page, pageSize: 100 });
          res.data.forEach(t => ids.add(t.id));
          pages = res.total_pages || 1;
          page++;
        } while (page <= pages && page <= 20);
        setDownloadedIds(ids);
      } catch { /* non-fatal */ }
    })();
  }, []);

  // Fetch tones for this creator
  const fetchTones = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      const res = await client.listUserTones(username, { page, pageSize: PAGE_SIZE });
      setTones(res.data);
      setTotalPages(res.total_pages || 1);
      setTotalTones(res.total || 0);
    } catch (err: any) {
      addToast(`Failed to load tones for ${username}: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [username, addToast]);

  useEffect(() => {
    if (connected) fetchTones(currentPage);
  }, [connected, currentPage, fetchTones]);

  // Load dir handle
  useEffect(() => {
    const load = async () => {
      try {
        const { get } = await import('idb-keyval');
        const handle = await get<FileSystemDirectoryHandle>('nam_profiles_handle');
        if (handle) setDirHandle(handle);
      } catch { /* ignore */ }
    };
    load();
  }, []);

  const gearFolder = (tone: Tone): string => {
    const g = tone.gear?.toLowerCase() || 'unknown';
    if (g === 'full-rig' || g === 'amp-cab') return 'Amp_and_Cab';
    if (g === 'amp' || g === 'amp-head') return 'Amps';
    if (g === 'cabinet' || g === 'cab') return 'Cabinets';
    if (g === 'pedal') return 'Pedals';
    if (g === 'ir') return 'IRs';
    if (g === 'spaces') return 'Spaces';
    return 'Other';
  };

  const doDownload = async (tone: Tone) => {
    try {
      const legacy = await client.listModels(tone.id, { pageSize: 100 });
      const a2 = await client.listModels(tone.id, { pageSize: 100, architecture: 2 });
      let models: Model[] = [...legacy.data, ...a2.data];

      const byName = new Map<string, Model>();
      for (const m of models) {
        const existing = byName.get(m.name);
        if (!existing || String(m.architecture_version ?? '1') > String(existing.architecture_version ?? '1')) {
          byName.set(m.name, m);
        }
      }
      models = Array.from(byName.values());

      if (models.length === 0) return;

      let packHandle: FileSystemDirectoryHandle | null = null;
      if (dirHandle) {
        const safePack = (tone.title || 'Unnamed').replace(/[^a-z0-9 _-]/gi, '_').trim();
        const catHandle = await dirHandle.getDirectoryHandle(gearFolder(tone), { create: true });
        packHandle = await catHandle.getDirectoryHandle(safePack, { create: true });
      }

      const usedNames = new Set<string>();
      for (const m of models) {
        try {
          if (!m.model_url) continue;
          const res = await client.directDownload(m.model_url);
          if (!res.ok) continue;
          const blob = await res.blob();
          let base = (m.name || 'model').replace(/[^a-z0-9 _-]/gi, '_').trim() || 'model';
          if (usedNames.has(base)) { let j = 2; while (usedNames.has(`${base}_${j}`)) j++; base = `${base}_${j}`; }
          usedNames.add(base);
          const ext = (new URL(m.model_url).pathname.match(/\.([a-z0-9]+)$/i)?.[0] ?? '.nam').toLowerCase();
          const filename = base + ext;
          if (packHandle) {
            const fh = await packHandle.getFileHandle(filename, { create: true });
            const w = await fh.createWritable();
            await w.write(blob);
            await w.close();
          } else {
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: filename });
            document.body.appendChild(a); a.click(); a.remove();
          }
        } catch { /* swallow individual file error */ }
      }

      await client.trackDownload(tone.id).catch(console.error);
      setDownloadedIds(prev => new Set(prev).add(tone.id));
      addToast(`Synced "${tone.title}" (${models.length} model${models.length > 1 ? 's' : ''}).`, 'success');
    } catch (err: any) {
      addToast(`Error syncing "${tone.title}": ${err.message}`, 'error');
      throw err;
    } finally {
      setDownloadingItems(prev => { const n = new Set(prev); n.delete(tone.id); return n; });
    }
  };

  const handleDownload = (tone: Tone) => {
    setDownloadingItems(prev => new Set(prev).add(tone.id));
    syncQueueRef.current.push(() => doDownload(tone));
    processSyncQueue();
  };

  const handleBulkDownload = async (ids: number[]) => {
    const tonesMap = new Map(tones.map(t => [t.id, t]));
    const items: BulkItem[] = ids.map(id => ({
      id, title: tonesMap.get(id)?.title ?? `Tone #${id}`, status: 'pending'
    }));
    setBulkItems(items);
    setIsPanelOpen(true);
    setSelectionMode(false);
    setSelectedIds(new Set());

    for (const item of items) {
      setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'syncing' } : i));
      const tone = tonesMap.get(item.id);
      if (!tone) continue;

      setDownloadingItems(prev => new Set(prev).add(item.id));
      try {
        await doDownload(tone);
        setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done' } : i));
      } catch {
        setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
      }
      // Cooldown between bulk jobs to respect Vercel WAF
      if (ids.indexOf(item.id) < ids.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  };

  const handleDownloadAll = async () => {
    // Collect all tone IDs across all pages
    setIsLoading(true);
    addToast('Collecting all tones from this creator...', 'info');
    try {
      const allToneIds: number[] = [];
      let page = 1, pages = 1;
      do {
        const res = await client.listUserTones(username, { page, pageSize: 100 });
        res.data.forEach(t => allToneIds.push(t.id));
        pages = res.total_pages || 1;
        page++;
      } while (page <= pages);
      setIsLoading(false);
      await handleBulkDownload(allToneIds);
    } catch (err: any) {
      setIsLoading(false);
      addToast(`Failed to collect tones: ${err.message}`, 'error');
    }
  };

  const toggleSelectTone = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      tones.forEach(t => next.add(t.id));
      return next;
    });
  };

  if (connected === false) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>Please log in to browse creators.</p>
          <button className="action-btn" onClick={() => router.push('/')}>Go to NAMMAN</button>
        </div>
      </main>
    );
  }

  const bulkDone = bulkItems.filter(i => i.status === 'done').length;
  const bulkErrors = bulkItems.filter(i => i.status === 'error').length;
  const bulkProgress = bulkItems.length > 0 ? Math.round(((bulkDone + bulkErrors) / bulkItems.length) * 100) : 0;

  return (
    <main className="container">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.5rem 0', marginBottom: '1.5rem' }}
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)', border: '2px solid var(--primary-color)' }}>
              {username[0]?.toUpperCase()}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '2rem' }}>{username}</h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                {totalTones} tone{totalTones !== 1 ? 's' : ''} on TONE3000
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="action-btn"
              onClick={() => { setSelectionMode(m => !m); setSelectedIds(new Set()); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: selectionMode ? 'var(--primary-color)' : undefined, color: selectionMode ? '#000' : undefined }}
            >
              <CheckSquare size={16} /> {selectionMode ? 'Cancel Selection' : 'Select'}
            </button>
            <button
              className="action-btn"
              onClick={handleDownloadAll}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary-color)', color: '#000', border: 'none' }}
            >
              <Download size={16} /> Download All ({totalTones})
            </button>
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectionMode && (
        <div style={{ background: 'var(--surface-color)', border: '1px solid var(--primary-color)', borderRadius: '12px', padding: '0.8rem 1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {selectedIds.size} selected
          </span>
          <button className="action-btn" onClick={selectAllOnPage} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
            Select This Page
          </button>
          <button className="action-btn" onClick={() => setSelectedIds(new Set())} style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem' }}>
            Clear
          </button>
        </div>
      )}

      {/* Tone list */}
      <div className="models-list">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="model-card" style={{ height: '120px', borderRadius: '16px', opacity: 0.4 }} />
          ))
          : tones.map(tone => {
            const isDownloaded = downloadedIds.has(tone.id);
            const isSyncing = downloadingItems.has(tone.id);
            const isSelected = selectedIds.has(tone.id);
            const image = tone.images?.[0] ?? null;

            return (
              <div
                key={tone.id}
                className="model-card"
                style={{
                  borderRadius: '16px', padding: '1.2rem 1.5rem', alignItems: 'center',
                  outline: isSelected ? '2px solid var(--primary-color)' : undefined,
                  background: isSelected ? 'rgba(var(--primary-rgb, 0,255,128), 0.05)' : undefined,
                }}
              >
                {selectionMode && (
                  <div
                    onClick={() => toggleSelectTone(tone.id)}
                    style={{ cursor: 'pointer', marginRight: '1rem', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', flexShrink: 0 }}
                  >
                    {isSelected ? <CheckSquare size={22} /> : <Square size={22} />}
                  </div>
                )}

                <div className="model-image-container" style={{ borderRadius: '12px', width: '100px', height: '100px', marginRight: '1.5rem', flexShrink: 0 }}>
                  {image ? <img src={image} alt={tone.title} className="model-image" /> : <Folder size={28} color="#555" />}
                </div>

                <div className="model-info" style={{ flex: 1 }}>
                  <h3 className="model-title" style={{ fontSize: '1.2rem', margin: '0 0 0.3rem' }}>
                    <a href={`https://www.tone3000.com/tones/${tone.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                      {tone.title} <ExternalLink size={13} style={{ opacity: 0.4 }} />
                    </a>
                  </h3>
                  <div className="model-gear" style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                    {tone.gear}
                    {(tone.a2_models_count ?? 0) > 0 && <span className="badge">NAM A2</span>}
                    {(tone.a1_models_count ?? 0) > 0 && <span className="badge">NAM A1</span>}
                  </div>
                  <div className="model-stats" style={{ margin: 0 }}>
                    <div className="stat-item"><DownloadCloud size={14} /> {tone.downloads_count}</div>
                    <div className="stat-item"><Folder size={14} /> {tone.models_count}</div>
                    {tone.created_at && <div className="stat-item" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{timeAgo(tone.created_at)}</div>}
                  </div>
                </div>

                <div style={{ paddingLeft: '1.5rem' }}>
                  <button
                    className="action-btn"
                    onClick={() => selectionMode ? toggleSelectTone(tone.id) : handleDownload(tone)}
                    disabled={isSyncing && !selectionMode}
                    style={{
                      color: isDownloaded ? '#10b981' : undefined,
                      borderColor: isDownloaded ? '#10b981' : undefined,
                      backgroundColor: isDownloaded ? 'rgba(16,185,129,0.1)' : undefined,
                      padding: '0.7rem 1.3rem', borderRadius: '50px', fontWeight: 600,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isSyncing ? 'Syncing...' : isDownloaded ? <><CheckCircle size={16} /> Re-sync</> : <><DownloadCloud size={16} /> Sync</>}
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button className="action-btn" disabled={currentPage === 1 || isLoading} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
            <ChevronLeft size={16} /> Previous
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Page {currentPage} of {totalPages}</span>
          <button className="action-btn" disabled={currentPage >= totalPages || isLoading} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Floating bulk bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-color)', border: '1px solid var(--primary-color)',
          borderRadius: '50px', padding: '0.8rem 1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 9000, whiteSpace: 'nowrap'
        }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button
            className="action-btn"
            onClick={() => handleBulkDownload(Array.from(selectedIds))}
            style={{ background: 'var(--primary-color)', color: '#000', border: 'none', borderRadius: '50px', padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Download size={16} /> Sync Selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Bulk progress panel */}
      {isPanelOpen && bulkItems.length > 0 && (
        <div style={{
          position: 'fixed', top: 0, right: 0, width: '360px', height: '100vh',
          background: 'var(--surface-color)', borderLeft: '1px solid var(--surface-border)',
          display: 'flex', flexDirection: 'column', zIndex: 9500,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          transform: isPanelOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease'
        }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Bulk Download</h3>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {bulkDone} / {bulkItems.length} completed {bulkErrors > 0 && `· ${bulkErrors} errors`}
              </p>
            </div>
            <button onClick={() => setIsPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ padding: '0.8rem 1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
            <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-color)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${bulkProgress}%`, background: 'var(--primary-color)', transition: 'width 0.4s ease', borderRadius: '3px' }} />
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>{bulkProgress}%</p>
          </div>

          {/* Item list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
            {bulkItems.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
                <div style={{ fontSize: '1rem', flexShrink: 0 }}>
                  {item.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>⏳</span>}
                  {item.status === 'syncing' && <span style={{ color: '#3b82f6', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>}
                  {item.status === 'done' && <span style={{ color: '#10b981' }}>✅</span>}
                  {item.status === 'error' && <span style={{ color: '#ef4444' }}>❌</span>}
                </div>
                <span style={{ fontSize: '0.85rem', color: item.status === 'error' ? '#ef4444' : item.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: '20px', right: isPanelOpen && bulkItems.length > 0 ? '380px' : '20px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 9999, transition: 'right 0.3s ease' }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{ background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
