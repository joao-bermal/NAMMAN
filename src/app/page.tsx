'use client';

/* This page intentionally synchronizes React state from external systems inside
 * effects — the OAuth callback / connection bootstrap on mount, and re-fetching
 * tones when the active tab or filters change. These are valid effect uses, so
 * the React-Compiler set-state-in-effect heuristic is disabled for this file. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { DownloadCloud, CheckCircle, Bookmark, Folder, FolderOpen, ExternalLink, LogOut, Layers, Server, Box, Sliders, Radio, Activity, Search, Grid } from 'lucide-react';
import { get, set } from 'idb-keyval';

import { PUBLISHABLE_KEY, getRedirectUri } from '@/lib/tone3000/config';
import {
  T3KClient,
  startStandardFlow,
  handleOAuthCallback,
} from '@/lib/tone3000/tone3000-client';
import { Gear, TonesSort, type Tone, type Model, type ArchitectureVersion } from '@/lib/tone3000/types';

// Single client instance. Tokens live in sessionStorage (see T3KClient).
// onAuthRequired fires when tokens are missing/expired beyond refresh — we
// silently restart the OAuth flow (no login screen if the TONE3000 session
// is still active).
const client = new T3KClient(PUBLISHABLE_KEY, () => {
  if (typeof window !== 'undefined') startStandardFlow(PUBLISHABLE_KEY, getRedirectUri());
});

const DOWNLOAD_HISTORY_KEY = 't3k_download_history';
const DIR_HANDLE_KEY = 'nam_profiles_handle';
const PAGE_SIZE = 15;

// The API's `tone.url` can come back malformed (e.g. `https://www.tone3000.com//<slug>-<id>`
// missing the `/tones/` segment), so rebuild the canonical public URL from its slug.
const toneHref = (tone: Tone): string => {
  try {
    const slug = new URL(tone.url).pathname.replace(/^\/+/, '').replace(/^tones\//, '');
    return `https://www.tone3000.com/tones/${slug}`;
  } catch {
    return tone.url;
  }
};

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 365) return `${Math.floor(days / 365)} years ago`;
  if (days > 30) return `${Math.floor(days / 30)} months ago`;
  if (days >= 14) return `${Math.floor(days / 7)} weeks ago`;
  if (days >= 7) return `1 week ago`;
  if (days > 0) return `${days} days ago`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `${hours} hours ago`;
  const minutes = Math.floor(diff / (1000 * 60));
  return `${Math.max(1, minutes)} minutes ago`;
}

const gearLabel = (gear: string): string =>
  gear === 'full-rig' ? 'Full Rig'
    : gear === 'amp' ? 'Amp Head'
    : gear === 'pedal' ? 'Pedal'
    : gear === 'ir' ? 'Cabinet / IR'
    : 'Outboard';

const gearFolder = (gear: string): string =>
  gear === 'full-rig' ? 'FullRig'
    : gear === 'amp' ? 'Amps'
    : gear === 'pedal' ? 'Pedals'
    : gear === 'ir' ? 'Cabinets_IRs'
    : 'Outboard';

const sortMap: Record<string, TonesSort> = {
  trending: TonesSort.Trending,
  newest: TonesSort.Newest,
  oldest: TonesSort.Oldest,
  downloads: TonesSort.DownloadsAllTime,
  'best-match': TonesSort.BestMatch,
};

type Tab = 'search' | 'favorites' | 'downloads';

// The File System Access API permission methods aren't in the default TS DOM
// lib yet, so we narrow to the bits we use.
type FsPermissionDescriptor = { mode?: 'read' | 'readwrite' };
interface DirectoryHandleWithPermissions extends FileSystemDirectoryHandle {
  queryPermission(descriptor?: FsPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FsPermissionDescriptor): Promise<PermissionState>;
}
type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options?: FsPermissionDescriptor): Promise<FileSystemDirectoryHandle>;
};

export default function Home() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState('');

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Tone[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeArchitecture, setActiveArchitecture] = useState<string>('2');
  const [sortBy, setSortBy] = useState<string>('trending');

  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [downloadHistory, setDownloadHistory] = useState<Tone[]>([]);
  const [downloadingItems, setDownloadingItems] = useState<Set<number>>(new Set());
  const [autoFavorite, setAutoFavorite] = useState(false);

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  // ── Local folder (File System Access API) ─────────────────────────────────
  const loadDirHandle = useCallback(async () => {
    try {
      const handle = await get<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
      if (handle) {
        const permission = await (handle as DirectoryHandleWithPermissions).queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') setDirHandle(handle);
      }
    } catch {
      // no previous handle
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('namman_auto_favorite');
      if (saved) setAutoFavorite(saved === 'true');
    }
  }, []);

  const toggleAutoFavorite = () => {
    const next = !autoFavorite;
    setAutoFavorite(next);
    localStorage.setItem('namman_auto_favorite', String(next));
  };

  const selectDirectory = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        addToast('Your browser does not support folder selection. Use Chrome or Edge.', 'error');
        return;
      }
      const handle = await (window as unknown as DirectoryPickerWindow).showDirectoryPicker({ mode: 'readwrite' });
      await set(DIR_HANDLE_KEY, handle);
      setDirHandle(handle);
    } catch {
      // cancelled
    }
  };

  // ── Auth / bootstrap ──────────────────────────────────────────────────────
  const loadFavoriteIds = useCallback(async () => {
    try {
      const ids = new Set<number>();
      let page = 1;
      let pages = 1;
      do {
        const res = await client.listFavoritedTones({ page, pageSize: 100 });
        res.data.forEach(t => ids.add(t.id));
        pages = res.total_pages || 1;
        page += 1;
      } while (page <= pages && page <= 10);
      setFavoriteIds(ids);
    } catch {
      // Non-fatal — bookmark state just won't be pre-filled
    }
  }, []);

  const bootstrapConnected = useCallback(async () => {
    setConnected(true);
    try {
      const user = await client.getUser();
      setUsername(user.username);
    } catch {
      // ignore — name is cosmetic
    }
    loadFavoriteIds();
    get<Tone[]>(DOWNLOAD_HISTORY_KEY).then(h => h && setDownloadHistory(h));
    loadDirHandle();
  }, [loadFavoriteIds, loadDirHandle]);

  useEffect(() => {
    if (!PUBLISHABLE_KEY) {
      setAuthError('Missing NEXT_PUBLIC_TONE3000_CLIENT_ID. Add your publishable key to .env.');
      setConnected(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hasCallback = params.has('code') || params.has('error') || params.has('state');

    if (hasCallback) {
      handleOAuthCallback(PUBLISHABLE_KEY, getRedirectUri()).then(result => {
        // Clean the OAuth params out of the URL regardless of outcome
        window.history.replaceState({}, '', window.location.pathname);
        if (result.ok) {
          client.setTokens(result.tokens);
          bootstrapConnected();
        } else if (result.error === 'canceled') {
          setConnected(client.isConnected());
          if (client.isConnected()) bootstrapConnected();
        } else {
          setAuthError(`Connection failed: ${result.error}`);
          setConnected(client.isConnected());
        }
      });
      return;
    }

    if (client.isConnected()) {
      bootstrapConnected();
    } else {
      setConnected(false);
    }
  }, [bootstrapConnected]);

  const connect = () => startStandardFlow(PUBLISHABLE_KEY, getRedirectUri());

  const disconnect = () => {
    client.clearTokens();
    setConnected(false);
    setUsername('');
    setResults([]);
    setFavoriteIds(new Set());
    setActiveTab('search');
    addToast('Disconnected from TONE3000', 'success');
  };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchResults = useCallback(async (tab: Tab, searchTerm: string, page: number, category: string, sort: string, architecture: string) => {
    if (tab === 'downloads') {
      const history = (await get<Tone[]>(DOWNLOAD_HISTORY_KEY)) ?? [];
      setDownloadHistory(history);
      setResults(history);
      setTotalPages(1);
      return;
    }

    setIsSearching(true);
    try {
      if (tab === 'favorites') {
        const res = await client.listFavoritedTones({ page, pageSize: PAGE_SIZE });
        setResults(res.data);
        setTotalPages(res.total_pages || 1);
      } else {
        const effectiveArchitecture = category === 'ir' ? undefined : architecture;
        const res = await client.searchTones({
          query: searchTerm || undefined,
          page,
          pageSize: PAGE_SIZE,
          sort: sortMap[sort] ?? TonesSort.Trending,
          gears: category ? [category as Gear] : undefined,
          architecture: (effectiveArchitecture || undefined) as ArchitectureVersion | undefined,
        });
        
        setResults(res.data);
        setTotalPages(res.total_pages || 1);
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to load tones from TONE3000.', 'error');
      setResults([]);
      setTotalPages(1);
    } finally {
      setIsSearching(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (connected) {
      // Re-fetch when the tab/filters/page change. `query` is applied only via
      // handleSearch so typing doesn't fire a request per keystroke.
      void fetchResults(activeTab, query, currentPage, activeCategory, sortBy, activeArchitecture);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, activeTab, currentPage, activeCategory, sortBy, activeArchitecture, fetchResults]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchResults('search', query, 1, activeCategory, sortBy, activeArchitecture);
  };

  // ── Favorites (synced to TONE3000) ────────────────────────────────────────
  const toggleFavorite = async (tone: Tone) => {
    const id = tone.id;
    const wasFavorited = favoriteIds.has(id);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(id); else next.add(id);
      return next;
    });

    try {
      if (wasFavorited) await client.unfavoriteTone(id);
      else await client.favoriteTone(id);

      if (activeTab === 'favorites' && wasFavorited) {
        setResults(prev => prev.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
      addToast('Could not update favorite on TONE3000.', 'error');
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (wasFavorited) next.add(id); else next.delete(id);
        return next;
      });
    }
  };

  // ── File sync (core feature) ──────────────────────────────────────────────
  const recordDownload = async (tone: Tone) => {
    const history = (await get<Tone[]>(DOWNLOAD_HISTORY_KEY)) ?? [];
    const next = [tone, ...history.filter(t => t.id !== tone.id)];
    await set(DOWNLOAD_HISTORY_KEY, next);
    setDownloadHistory(next);
  };

  const handleDownload = async (tone: Tone) => {
    const fsSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    if (fsSupported && !dirHandle) {
      addToast('Select a local folder above first.', 'info');
      return;
    }

    setDownloadingItems(prev => new Set(prev).add(tone.id));
    try {
      if (dirHandle) {
        const perm = await (dirHandle as DirectoryHandleWithPermissions).requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          addToast('Write permission to the folder was denied.', 'error');
          return;
        }
      }

      // Pull legacy (A1 + Custom) and A2 models, then merge — the API has no
      // single "all architectures" view.
      const [legacy, a2] = await Promise.all([
        client.listModels(tone.id, { pageSize: 100 }),
        client.listModels(tone.id, { pageSize: 100, architecture: 2 }),
      ]);
      let models: Model[] = [...legacy.data, ...a2.data];

      // Filter by the selected architecture (keep IRs/non-NAM regardless).
      if (activeArchitecture) {
        models = models.filter(m => m.architecture_version == null || String(m.architecture_version) === activeArchitecture);
      }

      // Deduplicate by name, keeping the highest architecture.
      const byName = new Map<string, Model>();
      for (const m of models) {
        const existing = byName.get(m.name);
        if (!existing || String(m.architecture_version ?? '1') > String(existing.architecture_version ?? '1')) {
          byName.set(m.name, m);
        }
      }
      models = Array.from(byName.values());

      if (models.length === 0) {
        addToast('No models matched the selected architecture.', 'info');
        return;
      }

      // Target folder: <root>/<Category>/<Pack name>/
      const safePack = (tone.title || 'Unnamed_Pack').replace(/[^a-z0-9 _-]/gi, '_').trim();
      let packHandle: FileSystemDirectoryHandle | null = null;
      if (dirHandle) {
        const categoryHandle = await dirHandle.getDirectoryHandle(gearFolder(tone.gear), { create: true });
        packHandle = await categoryHandle.getDirectoryHandle(safePack, { create: true });
      }

      const usedNames = new Set<string>();
      const CHUNK_SIZE = 3; // Reduced to 3 to be gentler on API rate limits

      for (let i = 0; i < models.length; i += CHUNK_SIZE) {
        const chunk = models.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (m) => {
          try {
            if (!m.model_url) return;
            const res = await client.fetch(m.model_url);
            if (!res.ok) throw new Error(`Failed to download ${m.name} (${res.status})`);
            const blob = await res.blob();

            let base = (m.name || 'model').replace(/[^a-z0-9 _-]/gi, '_').trim() || 'model';
            // Models are deduplicated by name, so race conditions here are extremely rare,
            // but we still ensure unique bases per file.
            if (usedNames.has(base)) {
              let j = 2;
              while (usedNames.has(`${base}_${j}`)) j++;
              base = `${base}_${j}`;
            }
            usedNames.add(base);

            const ext = (new URL(m.model_url).pathname.match(/\.([a-z0-9]+)$/i)?.[0] ?? '.nam').toLowerCase();
            const filename = base + ext;

            if (packHandle) {
              const fileHandle = await packHandle.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
            } else {
              // Fallback: browser download (no File System Access API)
              const url = URL.createObjectURL(blob);
              const a = Object.assign(document.createElement('a'), { href: url, download: filename });
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 10_000);
              await new Promise(r => setTimeout(r, 400));
            }
          } catch (err) {
            console.error(`Error downloading model ${m.name}:`, err);
            // We deliberately swallow the error so that one broken model 
            // doesn't cancel the entire pack's download.
          }
        }));

        // Add a small delay between chunks to prevent hitting API rate limits
        if (i + CHUNK_SIZE < models.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      await recordDownload(tone);
      if (autoFavorite && !favoriteIds.has(tone.id)) {
        await toggleFavorite(tone);
      }
      addToast(`Synced "${tone.title}" (${models.length} model${models.length > 1 ? 's' : ''}).`, 'success');
    } catch (err) {
      console.error(err);
      addToast(`Error syncing "${tone.title}".`, 'error');
    } finally {
      setDownloadingItems(prev => {
        const n = new Set(prev);
        n.delete(tone.id);
        return n;
      });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (connected === null) {
    return (
      <main>
        <div style={{ textAlign: 'center', padding: '6rem 1rem', color: 'var(--text-muted)' }}>Loading…</div>
      </main>
    );
  }

  if (!connected) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '450px' }}>
          <h1 style={{ fontSize: '4.5rem', margin: '0 0 0.5rem 0' }} className="t3k-logo">NAMMAN</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: 1.6, marginBottom: '3rem' }}>
            Manage your NAM profiles that are synced directly from <a href="https://tone3000.com" target="_blank" rel="noopener noreferrer" className="t3k-logo" style={{ textDecoration: 'none', fontSize: '1.3rem' }}>TONE3000</a>.
          </p>
          {authError && (
            <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', color: '#ff6b6b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              {authError}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button 
              className="action-btn" 
              onClick={connect} 
              disabled={!PUBLISHABLE_KEY}
              style={{ padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: 600, background: '#facc15', color: '#000', border: 'none', borderRadius: '50px', opacity: PUBLISHABLE_KEY ? 1 : 0.5 }}
            >
              Connect with Tone3000
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1 style={{ fontSize: '3rem', margin: 0 }} className="t3k-logo">NAMMAN</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            Manage your NAM profiles that are synced directly from{' '}
            <a href="https://www.tone3000.com" target="_blank" rel="noopener noreferrer" className="t3k-logo" style={{ fontSize: '1.2rem', textDecoration: 'none' }}>TONE3000</a>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-color)', padding: '0.8rem 1.5rem', borderRadius: '50px', border: '1px solid var(--surface-border)' }}>
          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
            Connected{username ? <> as <strong style={{ color: '#fff' }}>{username}</strong></> : ''}
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--surface-border)' }} />
          <button onClick={disconnect} className="action-btn" style={{ borderColor: 'transparent', background: 'transparent', padding: '0.2rem', color: '#ff6b6b' }} title="Disconnect">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', border: dirHandle ? '1px solid var(--primary-color)' : '1px solid var(--surface-border)' }}>
        <div>
          <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '1.5rem', color: dirHandle ? 'var(--primary-color)' : '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderOpen size={24} /> {dirHandle ? 'Synced Local Folder' : 'Local Sync Folder'}
          </h3>
          <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-muted)' }}>
            {dirHandle ? (
              <span style={{ color: '#fff' }}>Saving models directly to: <strong>{dirHandle.name}</strong></span>
            ) : (
              'Select a folder on your computer to enable direct sync.'
            )}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}>
            <input 
              type="checkbox" 
              checked={autoFavorite} 
              onChange={toggleAutoFavorite} 
              style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--primary-color)', cursor: 'pointer' }} 
            />
            Automatically favorite downloaded tones
          </label>
        </div>
        <button onClick={selectDirectory} className="search-button" style={{ background: dirHandle ? 'transparent' : 'var(--primary-color)', color: dirHandle ? 'var(--primary-color)' : '#000', border: dirHandle ? '1px solid var(--primary-color)' : 'none', fontSize: '1.1rem', padding: '1rem 2rem', borderRadius: '8px' }}>
          {dirHandle ? 'Change Folder' : 'Select Local Folder'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem' }}>
        <button className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`} onClick={() => { setActiveTab('search'); setCurrentPage(1); }}>Search</button>
        <button className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => { setActiveTab('favorites'); setCurrentPage(1); }}>My Favorites</button>
        <button className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`} onClick={() => { setActiveTab('downloads'); setCurrentPage(1); }}>My Downloads</button>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '1.5rem', color: '#fff' }}>Explore NAM Profiles & IR's</h2>
        
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {[
            { id: '', label: 'All', icon: <Grid size={16} /> },
            { id: 'full-rig', label: 'Full Rig', icon: <Server size={16} /> },
            { id: 'amp', label: 'Amp Head', icon: <Box size={16} /> },
            { id: 'pedal', label: 'Pedal', icon: <Sliders size={16} /> },
            { id: 'outboard', label: 'Outboard', icon: <Radio size={16} /> },
            { id: 'ir', label: 'IR', icon: <Activity size={16} /> }
          ].map(cat => (
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

        {activeTab === 'search' && (
          <form onSubmit={handleSearch} style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="search-input"
                placeholder="Search packages (e.g., Fender, 6505+, Bogner...)"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', borderRadius: '50px', fontSize: '1.1rem', background: 'var(--bg-color)' }}
              />
            </div>
            <button type="submit" className="search-button" disabled={isSearching} style={{ borderRadius: '50px', padding: '0 2rem' }}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: '1.3rem', margin: 0, color: '#fff' }}>Refine Your Search</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select className="sort-select" value={activeArchitecture} onChange={e => { setActiveArchitecture(e.target.value); setCurrentPage(1); }}>
              <option value="">All Versions</option>
              <option value="2">NAM A2 Only</option>
              <option value="1">NAM A1 (Legacy) Only</option>
              <option value="custom">Custom</option>
            </select>
            {activeTab === 'search' && (
              <select className="sort-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}>
                <option value="trending">Trending</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="downloads">Most Downloaded</option>
                <option value="best-match">Best Match</option>
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="models-list">
        {results.map(tone => {
          const isDownloaded = downloadHistory.some(t => t.id === tone.id);
          const isFavorited = favoriteIds.has(tone.id);
          const image = tone.images && tone.images.length > 0 ? tone.images[0] : null;
          const fsSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
          const downloadDisabled = downloadingItems.has(tone.id) || (fsSupported && !dirHandle);

          return (
            <div key={tone.id} className="model-card" style={{ borderRadius: '16px', padding: '1.2rem 1.5rem', alignItems: 'center' }}>
              <div className="model-image-container" style={{ borderRadius: '12px', width: '130px', height: '130px', marginRight: '2rem' }}>
                {image ? <img src={image} alt={tone.title} className="model-image" /> : <Folder size={32} color="#555" />}
              </div>
              <div className="model-info" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.5rem 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <h3 className="model-title" style={{ fontSize: '1.3rem', margin: 0, lineHeight: 1.2 }}>
                    <a href={toneHref(tone)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                      {tone.title} <ExternalLink size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
                    </a>
                  </h3>
                  
                  <div className="model-gear" style={{ margin: 0, fontSize: '0.9rem' }}>
                    {gearLabel(tone.gear)}
                    {(tone.a2_models_count ?? 0) > 0 && <span className="badge">NAM A2</span>}
                    {(tone.a1_models_count ?? 0) > 0 && <span className="badge">NAM A1</span>}
                    {(tone.irs_count ?? 0) > 0 && <span className="badge">IR</span>}
                  </div>
                </div>

                <div className="model-stats" style={{ margin: 0 }}>
                  <div className="stat-item"><DownloadCloud size={16} /> {tone.downloads_count}</div>
                  <div className={`stat-item stat-action ${isFavorited ? 'active' : ''}`} onClick={() => toggleFavorite(tone)}>
                    <Bookmark size={16} fill={isFavorited ? 'currentColor' : 'none'} /> {tone.favorites_count}
                  </div>
                  <div className="stat-item"><Folder size={16} /> {tone.models_count}</div>
                </div>

                <div className="model-author-row" style={{ marginTop: 0 }}>
                  {tone.user?.avatar_url ? (
                    <img src={tone.user.avatar_url} alt={tone.user.username} className="author-avatar" />
                  ) : (
                    <div className="author-avatar" />
                  )}
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{tone.user?.username}</span>
                  {tone.created_at && (
                    <>
                      <span style={{ color: 'var(--text-muted)' }}>•</span>
                      <span style={{ color: 'var(--text-muted)' }}>{timeAgo(tone.created_at)}</span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ paddingLeft: '2rem' }}>
                <button
                  className="action-btn"
                  onClick={() => handleDownload(tone)}
                  disabled={downloadDisabled}
                  style={{ 
                    color: isDownloaded ? '#10b981' : undefined, 
                    borderColor: isDownloaded ? '#10b981' : undefined, 
                    backgroundColor: isDownloaded ? 'rgba(16, 185, 129, 0.1)' : undefined,
                    opacity: downloadDisabled && !downloadingItems.has(tone.id) ? 0.5 : 1,
                    padding: '0.8rem 1.5rem',
                    borderRadius: '50px',
                    fontWeight: 600
                  }}
                  title={fsSupported && !dirHandle ? 'Select a folder above first' : isDownloaded ? 'Re-sync' : 'Sync to local folder'}
                >
                  {downloadingItems.has(tone.id)
                    ? 'Syncing...'
                    : isDownloaded
                      ? <><CheckCircle size={18} /> Re-sync</>
                      : <><DownloadCloud size={18} /> Sync</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && activeTab !== 'downloads' && (
        <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '3rem' }}>
          <button className="action-btn" disabled={currentPage === 1 || isSearching} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</button>
          <span style={{ fontSize: '0.9rem' }}>Page {currentPage} of {totalPages}</span>
          <button className="action-btn" disabled={currentPage >= totalPages || isSearching} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      )}

      {results.length === 0 && !isSearching && (
        <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
          {activeTab === 'favorites' ? 'No favorites yet — bookmark a tone to see it here.'
            : activeTab === 'downloads' ? 'No synced tones yet.'
            : query ? `No tones found for "${query}"` : 'No tones found.'}
        </div>
      )}

      <div style={{ position: 'fixed', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 9999 }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{ background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
