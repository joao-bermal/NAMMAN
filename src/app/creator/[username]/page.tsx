'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DownloadCloud, CheckCircle, Bookmark, Folder, ExternalLink,
  ArrowLeft, Users, Download, X, ChevronLeft, ChevronRight,
  Layers, CheckSquare, Square, Search, Grid, Server, Box,
  Activity, Sliders, Radio
} from 'lucide-react';

import { PUBLISHABLE_KEY, getRedirectUri } from '@/lib/tone3000/config';
import { T3KClient, startStandardFlow } from '@/lib/tone3000/tone3000-client';
import { Gear, TonesSort, type Tone, type Model, type ArchitectureVersion } from '@/lib/tone3000/types';

const client = new T3KClient(PUBLISHABLE_KEY, () => {
  if (typeof window !== 'undefined') startStandardFlow(PUBLISHABLE_KEY, getRedirectUri());
});

const CATEGORIES = [
  { id: '', label: 'All', icon: <Grid size={16} /> },
  { id: 'amp-cab', label: 'Amp + Cab', icon: <Server size={16} /> },
  { id: 'amp', label: 'Amp Head', icon: <Box size={16} /> },
  { id: 'cab', label: 'Cabinet', icon: <Activity size={16} /> },
  { id: 'pedal', label: 'Pedal', icon: <Sliders size={16} /> },
  { id: 'outboard', label: 'Outboard', icon: <Radio size={16} /> },
  { id: 'spaces', label: 'Spaces', icon: <Box size={16} /> },
  { id: 'experimental', label: 'Experimental', icon: <Activity size={16} /> },
];

const gearLabel = (tone: Tone): string => {
  const g = tone.gear?.toLowerCase() || 'unknown';

  if (g === 'full-rig' || g === 'amp-cab' || g === 'amp_cab' || g === 'amp+cab') return 'Amp + Cab';
  if (g === 'amp' || g === 'amp-head' || g === 'amp_head') return 'Amp Head';
  if (g === 'pedal') return 'Pedal';
  if (g === 'ir' || g === 'cabinet' || g === 'cab') return 'Cabinet / IR';
  return tone.gear || 'Other';
};

const toneHref = (tone: Tone): string => {
  try {
    const slug = new URL(tone.url).pathname.replace(/^\/+/, '').replace(/^tones\//, '');
    return `https://www.tone3000.com/tones/${slug}`;
  } catch {
    return tone.url;
  }
};

const verifyFolderPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    const opts = { mode: 'readwrite' as const };
    if ((await (handle as any).queryPermission(opts)) === 'granted') {
      return true;
    }
    if ((await (handle as any).requestPermission(opts)) === 'granted') {
      return true;
    }
    return false;
  } catch (e) {
    console.error('Permission request failed:', e);
    return false;
  }
};

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

type BulkItem = { id: number; title: string; status: 'pending' | 'syncing' | 'done' | 'error'; tone?: Tone };

export default function CreatorPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [connected, setConnected] = useState<boolean | null>(null);
  const [allTones, setAllTones] = useState<Tone[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTones, setTotalTones] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Local Filter States
  const [activeCategory, setActiveCategory] = useState('');
  const [activeArchitecture, setActiveArchitecture] = useState('2');
  const [sortBy, setSortBy] = useState('newest');
  const [query, setQuery] = useState('');

  const filteredTones = useMemo(() => {
    let list = [...allTones];

    // Local Search Query filter
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (activeCategory) {
      list = list.filter(t => {
        const g = t.gear?.toLowerCase() || '';
        if (activeCategory === 'amp-cab') {
          return g === 'amp-cab' || g === 'full-rig' || g === 'amp_cab' || g === 'amp+cab';
        }
        if (activeCategory === 'amp') {
          return g === 'amp' || g === 'amp-head' || g === 'amp_head';
        }
        if (activeCategory === 'cab') {
          return g === 'cab' || g === 'cabinet' || g === 'ir';
        }
        return g === activeCategory;
      });
    }

    // Architecture filter
    if (activeArchitecture) {
      list = list.filter(t => {
        if (activeArchitecture === '2') return (t.a2_models_count ?? 0) > 0;
        if (activeArchitecture === '1') return (t.a1_models_count ?? 0) > 0;
        if (activeArchitecture === 'custom') return (t.custom_models_count ?? 0) > 0;
        return true;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'newest') {
        const dateA = new Date((a as any).published_at || a.created_at || 0).getTime();
        const dateB = new Date((b as any).published_at || b.created_at || 0).getTime();
        return dateB - dateA;
      }
      if (sortBy === 'oldest') {
        const dateA = new Date((a as any).published_at || a.created_at || 0).getTime();
        const dateB = new Date((b as any).published_at || b.created_at || 0).getTime();
        return dateA - dateB;
      }
      if (sortBy === 'downloads') {
        return b.downloads_count - a.downloads_count;
      }
      if (sortBy === 'trending') {
        return b.favorites_count - a.favorites_count;
      }
      return 0;
    });

    return list;
  }, [allTones, query, activeCategory, activeArchitecture, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredTones.length / PAGE_SIZE));

  const tones = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredTones.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredTones, currentPage]);

  const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());
  const [downloadingItems, setDownloadingItems] = useState<Set<number>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Bulk progress panel
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const bulkStatusRef = useRef(bulkStatus);
  const bulkItemsRef = useRef<BulkItem[]>([]);
  const bulkLoopActiveRef = useRef(false);

  const handleRemoveBulkItem = useCallback((id: number) => {
    setBulkItems(prev => {
      const next = prev.filter(item => item.id !== id);
      bulkItemsRef.current = next;
      if (next.length === 0) {
        setBulkStatus('idle');
        bulkStatusRef.current = 'idle';
        setIsPanelOpen(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    bulkStatusRef.current = bulkStatus;
  }, [bulkStatus]);

  // Load saved bulk progress from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('namman_bulk_download_creator_' + username);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          setBulkItems(parsed.items);
          bulkItemsRef.current = parsed.items;
          setBulkStatus('paused'); // Always restore as paused
          setIsPanelOpen(true);
        }
      }
    } catch (e) {
      console.error('Failed to load saved bulk progress:', e);
    }
  }, [username]);

  // Save bulk progress to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = 'namman_bulk_download_creator_' + username;
    if (bulkItems.length === 0 || bulkStatus === 'idle') {
      localStorage.removeItem(key);
    } else {
      const serializedItems = bulkItems.map(item => ({
        id: item.id,
        title: item.title,
        status: item.status === 'syncing' ? 'pending' : item.status
      }));
      localStorage.setItem(key, JSON.stringify({
        status: bulkStatus === 'running' ? 'paused' : bulkStatus,
        items: serializedItems
      }));
    }
  }, [username, bulkStatus, bulkItems]);

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
  const fetchTones = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resA2, resAll] = await Promise.all([
        client.listUserTones(username, { page: 1, pageSize: 1000, architecture: '2' }),
        client.listUserTones(username, { page: 1, pageSize: 1000, architecture: 'all' })
      ]);

      const mergedMap = new Map<number, Tone>();
      resAll.data.forEach(t => mergedMap.set(t.id, t));
      resA2.data.forEach(t => mergedMap.set(t.id, t));

      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => {
        const dateA = new Date((a as any).published_at || a.created_at || 0).getTime();
        const dateB = new Date((b as any).published_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });

      setAllTones(mergedList);
      setTotalTones(mergedList.length);
    } catch (err: any) {
      addToast(`Failed to load tones for ${username}: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [username, addToast]);

  useEffect(() => {
    if (connected) fetchTones();
  }, [connected, fetchTones]);

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
    if (g === 'cabinet' || g === 'cab' || g === 'ir') return 'Cabinets_IRs';
    if (g === 'pedal') return 'Pedals';
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
      const downloadedModelsInfo: any[] = [];

      for (const m of models) {
        try {
          if (!m.model_url) continue;
          const res = await client.directDownload(m.model_url);
          if (!res.ok) continue;
          const blob = await res.blob();

          let internalMetadata: any = null;
          let fileArchitecture: string | null = null;
          try {
            const text = await blob.text();
            const parsed = JSON.parse(text);
            internalMetadata = parsed.metadata || null;
            fileArchitecture = parsed.architecture || null;
          } catch {
            // Not a JSON file (e.g. .wav / IR file)
          }

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

          downloadedModelsInfo.push({
            id: m.id,
            name: m.name,
            size: m.size,
            architecture: m.architecture_version || '1',
            filename: filename,
            internal_metadata: internalMetadata,
            internal_architecture: fileArchitecture
          });
        } catch { /* swallow individual file error */ }
      }

      const metaObj = {
        id: tone.id,
        title: tone.title,
        description: tone.description,
        gear: tone.gear,
        platform: tone.platform,
        creator: tone.user?.username || 'unknown',
        creator_id: tone.user_id,
        url: toneHref(tone),
        downloads_count: tone.downloads_count,
        favorites_count: tone.favorites_count,
        makes: tone.makes || [],
        tags: tone.tags || [],
        models: downloadedModelsInfo,
        synced_at: new Date().toISOString()
      };

      if (packHandle) {
        const metaFileHandle = await packHandle.getFileHandle('metadata.json', { create: true });
        const metaWritable = await metaFileHandle.createWritable();
        await metaWritable.write(JSON.stringify(metaObj, null, 2));
        await metaWritable.close();
      } else {
        const metaBlob = new Blob([JSON.stringify(metaObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(metaBlob);
        const a = Object.assign(document.createElement('a'), { href: url, download: 'metadata.json' });
        document.body.appendChild(a); a.click(); a.remove();
      }

      await client.trackDownload(tone.id).catch(err => {
        console.error('Tracking failed:', err);
        addToast(`Synced "${tone.title}", but failed to register download: ${err.message || err}`, 'error');
      });
      setDownloadedIds(prev => new Set(prev).add(tone.id));
      addToast(`Synced "${tone.title}" (${models.length} model${models.length > 1 ? 's' : ''}).`, 'success');
    } catch (err: any) {
      addToast(`Error syncing "${tone.title}": ${err.message}`, 'error');
      throw err;
    } finally {
      setDownloadingItems(prev => { const n = new Set(prev); n.delete(tone.id); return n; });
    }
  };

  const handleDownload = async (tone: Tone) => {
    if (dirHandle) {
      const hasPerm = await verifyFolderPermission(dirHandle);
      if (!hasPerm) {
        addToast('Write permission to the folder was denied.', 'error');
        return;
      }
    }
    setDownloadingItems(prev => new Set(prev).add(tone.id));
    syncQueueRef.current.push(() => doDownload(tone));
    processSyncQueue();
  };

  const runBulkLoop = async () => {
    if (bulkStatusRef.current !== 'running') return;
    if (bulkLoopActiveRef.current) return;

    bulkLoopActiveRef.current = true;
    try {
      const items = bulkItemsRef.current;
      const nextIndex = items.findIndex(item => item.status === 'pending');
      if (nextIndex === -1) {
        setBulkStatus('idle');
        return;
      }

      const item = items[nextIndex];
      
      // Update status to syncing
      item.status = 'syncing';
      setBulkItems([...items]);

      setDownloadingItems(prev => new Set(prev).add(item.id));

      try {
        let tone = item.tone;
        if (!tone) {
          tone = await client.getTone(item.id);
          if (tone) {
            item.title = tone.title;
            item.tone = tone;
            setBulkItems([...items]);
          }
        }

        if (tone) {
          await doDownload(tone);
          item.status = 'done';
        } else {
          throw new Error('Tone not found');
        }
      } catch (err) {
        console.error(`Bulk download failed for id ${item.id}:`, err);
        item.status = 'error';
      } finally {
        setDownloadingItems(prev => {
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });

        setBulkItems([...items]);
      }
    } finally {
      bulkLoopActiveRef.current = false;

      // Wait 3s cooldown before next item
      if (bulkStatusRef.current === 'running') {
        setTimeout(() => runBulkLoop(), 3000);
      }
    }
  };

  const handleBulkDownload = async (tonesOrIds: (number | Tone)[]) => {
    if (dirHandle) {
      const hasPerm = await verifyFolderPermission(dirHandle);
      if (!hasPerm) {
        addToast('Write permission to the folder was denied.', 'error');
        return;
      }
    }
    const tonesMap = new Map(allTones.map(t => [t.id, t]));
    const initialItems: BulkItem[] = tonesOrIds.map(x => {
      const id = typeof x === 'number' ? x : x.id;
      const title = typeof x === 'number' ? tonesMap.get(id)?.title : x.title;
      const tone = typeof x === 'number' ? tonesMap.get(id) : x;
      return {
        id,
        title: title ?? `Tone #${id}`,
        status: 'pending' as const,
        tone
      };
    });

    bulkItemsRef.current = initialItems;
    setBulkItems(initialItems);
    setBulkStatus('running');
    setIsPanelOpen(true);
    setSelectionMode(false);
    setSelectedIds(new Set());

    // Start loop
    setTimeout(() => runBulkLoop(), 0);
  };

  const handlePauseBulk = () => {
    setBulkStatus('paused');
  };

  const handleResumeBulk = async () => {
    if (dirHandle) {
      const hasPerm = await verifyFolderPermission(dirHandle);
      if (!hasPerm) {
        addToast('Write permission to the folder was denied.', 'error');
        return;
      }
    }
    setBulkStatus('running');
    bulkStatusRef.current = 'running';
    setTimeout(() => runBulkLoop(), 0);
  };

  const handleCancelBulk = () => {
    setBulkStatus('idle');
    bulkStatusRef.current = 'idle';
    setBulkItems([]);
    bulkItemsRef.current = [];
    setIsPanelOpen(false);
  };

  const handleDownloadAll = async () => {
    await handleBulkDownload(filteredTones);
  };

  const toggleSelectTone = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    const toneIds = tones.map(t => t.id);
    const allSelected = toneIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        toneIds.forEach(id => next.delete(id));
      } else {
        toneIds.forEach(id => next.add(id));
      }
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
    <main className="container" style={{ paddingBottom: selectionMode ? '100px' : '40px' }}>
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
              disabled={filteredTones.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary-color)', color: '#000', border: 'none', opacity: filteredTones.length === 0 ? 0.6 : 1, cursor: filteredTones.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <Download size={16} /> Download All ({filteredTones.length})
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '1.5rem', color: '#fff' }}>Explore Creator's Tones</h2>
        
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id || 'all'}
              className={`filter-btn ${activeCategory === cat.id ? 'active' : ''}`}
              style={{ borderRadius: '50px', padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
              onClick={() => { setActiveCategory(cat.id); setCurrentPage(1); }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <form onSubmit={e => e.preventDefault()} style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="search-input"
              placeholder="Search creator's tones..."
              value={query}
              onChange={e => { setQuery(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '50px', fontSize: '1.1rem', background: 'var(--bg-color)' }}
            />
          </div>
          <button type="submit" className="search-button" style={{ borderRadius: '50px', padding: '0 2rem' }}>
            Search
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: '1.3rem', margin: 0, color: '#fff' }}>Refine Your Search</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select className="sort-select" value={activeArchitecture} onChange={e => { setActiveArchitecture(e.target.value); setCurrentPage(1); }}>
              <option value="">All Versions</option>
              <option value="2">NAM A2 Only</option>
              <option value="1">NAM A1 (Legacy) Only</option>
              <option value="custom">Custom</option>
            </select>
            <select className="sort-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}>
              <option value="trending">Trending</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="downloads">Most Downloaded</option>
            </select>
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
                onClick={() => {
                  if (selectionMode) {
                    toggleSelectTone(tone.id);
                  }
                }}
                style={{
                  borderRadius: '16px', padding: '1.2rem 1.5rem', alignItems: 'center',
                  outline: isSelected ? '2px solid var(--primary-color)' : undefined,
                  background: isSelected ? 'rgba(var(--primary-rgb, 0,255,128), 0.05)' : undefined,
                  cursor: selectionMode ? 'pointer' : 'default'
                }}
              >
                {selectionMode && (
                  <div
                    style={{ marginRight: '1rem', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', flexShrink: 0 }}
                  >
                    {isSelected ? <CheckSquare size={22} /> : <Square size={22} />}
                  </div>
                )}

                <div className="model-image-container" style={{ borderRadius: '12px', width: '100px', height: '100px', marginRight: '1.5rem', flexShrink: 0 }}>
                  {image ? <img src={image} alt={tone.title} className="model-image" /> : <Folder size={28} color="#555" />}
                </div>

                <div className="model-info" style={{ flex: 1 }}>
                  <h3 className="model-title" style={{ fontSize: '1.2rem', margin: '0 0 0.3rem' }}>
                    <a href={`https://www.tone3000.com/tones/${tone.id}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {tone.title} <ExternalLink size={13} style={{ opacity: 0.4 }} />
                    </a>
                  </h3>
                  <div className="model-gear" style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                    {gearLabel(tone)}
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
                    onClick={(e) => {
                      if (!selectionMode) {
                        e.stopPropagation();
                        handleDownload(tone);
                      }
                    }}
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
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>
                Bulk Download {bulkStatus === 'paused' ? '(Paused)' : bulkStatus === 'running' ? '(Running)' : ''}
              </h3>
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

          {/* Controls */}
          <div style={{ padding: '0.8rem 1.5rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.02)' }}>
            {bulkStatus === 'running' ? (
              <button
                className="action-btn"
                onClick={handlePauseBulk}
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', borderColor: '#facc15', color: '#facc15', background: 'transparent' }}
              >
                Pause
              </button>
            ) : (
              <button
                className="action-btn"
                onClick={handleResumeBulk}
                disabled={bulkItems.every(i => i.status !== 'pending')}
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', borderColor: '#10b981', color: '#10b981', background: 'transparent', opacity: bulkItems.every(i => i.status !== 'pending') ? 0.5 : 1 }}
              >
                Resume
              </button>
            )}
            <button
              className="action-btn"
              onClick={handleCancelBulk}
              style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', borderColor: '#ef4444', color: '#ef4444', background: 'transparent' }}
            >
              Cancel
            </button>
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
                {item.status !== 'syncing' && (
                  <button
                    onClick={() => handleRemoveBulkItem(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Remove from list"
                  >
                    <X size={14} />
                  </button>
                )}
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
