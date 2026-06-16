'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadCloud, CheckCircle, Bookmark, Folder, PlayCircle, FolderOpen, ExternalLink, LogOut } from 'lucide-react';
import { get, set } from 'idb-keyval';

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [downloadingItems, setDownloadingItems] = useState<Set<number>>(new Set());
  const [toasts, setToasts] = useState<{id: string, message: string, type: 'success' | 'error' | 'info'}[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'downloads' | 'favorites'>('search');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeArchitecture, setActiveArchitecture] = useState<string>('2'); // Default A2
  const [sortBy, setSortBy] = useState<string>('trending');
  
  // User Data State
  const [userData, setUserData] = useState<any>({ settings: {}, favorites: [], downloads: [], username: '' });

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const checkAuth = async () => {
    try {
      const res = await fetch(`/api/auth/me?_=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 401) {
        setIsGuest(true);
        return false;
      }
      return true;
    } catch (e) {
      setIsGuest(true);
      return false;
    }
  };

  const loadDirHandle = async () => {
    try {
      const handle = await get('nam_profiles_handle');
      if (handle) {
        // Request permission silently
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          setDirHandle(handle);
        }
      }
    } catch (e) {
      console.log('No previous dir handle found');
    }
  };

  const selectDirectory = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support native folder selection. Use Google Chrome or Edge.');
        return;
      }
      
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await set('nam_profiles_handle', handle);
      setDirHandle(handle);
    } catch (e) {
      console.log('Folder selection cancelled or failed', e);
    }
  };

  const fetchUserData = async () => {
    try {
      const res = await fetch(`/api/user?_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUserData({ ...data.data, username: data.username || 'admin' });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchResults = useCallback(async (searchTerm: string, page: number, tab: string, category: string, sort: string, architecture: string) => {
    setIsSearching(true);
    try {
      if (tab === 'downloads' || tab === 'favorites') {
        const idsToFetch = tab === 'downloads' ? userData.downloads : userData.favorites;
        if (!idsToFetch || idsToFetch.length === 0) {
          setResults([]);
          setTotalPages(1);
          setIsSearching(false);
          return;
        }

        const res = await fetch('/api/tones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: idsToFetch })
        });
        const data = await res.json();
        if (data.success) {
          let mapped = data.items.map((item: any) => ({
            id: item.id,
            name: item.title,
            slug: item.slug || item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
            author: item.username,
            avatar_url: item.avatar_url,
            isA2: item.a2_models_count > 0,
            models_count: item.models_count,
            downloads_count: item.downloads_count,
            favorites_count: item.favorites_count,
            created_at: new Date(item.created_at).toLocaleDateString(),
            image: item.images && item.images.length > 0 ? item.images[0] : null,
            type: item.gear === 'full-rig' ? 'Full Rig' : item.gear === 'amp' ? 'Amp Head' : item.gear === 'pedal' ? 'Pedal' : item.gear === 'ir' ? 'Cabinet / IR' : 'Outboard'
          }));
          
          if (category) {
            mapped = mapped.filter((m: any) => 
              m.type.toLowerCase().replace(' ', '-') === category || 
              (category === 'full-rig' && m.type === 'Full Rig') || 
              (category === 'amp' && m.type === 'Amp Head') ||
              (category === 'ir' && m.type === 'Cabinet / IR')
            );
          }
          if (sort === 'newest') mapped.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          if (sort === 'oldest') mapped.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          if (sort === 'downloads' || sort === 'trending') mapped.sort((a: any, b: any) => b.downloads_count - a.downloads_count);

          setResults(mapped);
          setTotalPages(1);
        } else {
          setResults([]);
          setTotalPages(1);
        }
      } else {
        const payload: any = {
          query_term: searchTerm,
          page_number: page,
          page_size: 15,
          order_by: sort === 'downloads' ? 'downloads-all-time' : sort,
          tag_names: null,
          make_names: null,
          gear_filters: category ? [category] : null,
          is_calibrated: false,
          size_filters: null,
          usernames: null
        };
        if (architecture) {
          payload.architecture_filter = architecture;
        }

        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (res.ok && data.success && data.items) {
          const totalCount = data.items[0]?.total_count || 0;
          setTotalPages(Math.max(1, Math.ceil(totalCount / 15)));

          const mappedResults = data.items.map((item: any) => ({
            id: item.id,
            name: item.title,
            slug: item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
            author: item.user?.username || item.username,
            avatar_url: item.user?.avatar_url || item.avatar_url,
            isA2: item.a2_models_count > 0,
            hasA1: item.a1_models_count > 0,
            hasIR: item.irs_count > 0,
            models_count: item.models_count,
            downloads_count: item.downloads_count,
            favorites_count: item.favorites_count,
            created_at: new Date(item.created_at).toLocaleDateString(),
            image: item.images && item.images.length > 0 ? item.images[0] : null,
            type: item.gear === 'full-rig' ? 'Full Rig' : item.gear === 'amp' ? 'Amp Head' : item.gear === 'pedal' ? 'Pedal' : item.gear === 'ir' ? 'Cabinet / IR' : 'Outboard'
          }));
          setResults(mappedResults);
        } else {
          if (res.status === 401 || res.status === 403) {
            alert("Your Tone3000 session has expired. Reconnecting...");
            window.location.href = '/api/auth/tone3000';
            return;
          }
          setResults([]);
          setTotalPages(1);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  }, [userData]);

  useEffect(() => {
    checkAuth().then(isOk => {
      if (isOk) {
        fetchUserData();
        loadDirHandle();
      }
    });
  }, []);

  useEffect(() => {
    if (!isGuest || activeTab === 'search') {
      fetchResults(query, currentPage, activeTab, activeCategory, sortBy, activeArchitecture);
    }
  }, [currentPage, fetchResults, isGuest, activeTab, activeCategory, sortBy, activeArchitecture]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchResults(query, 1, activeTab, activeCategory, sortBy, activeArchitecture);
  };

  const toggleFavorite = async (id: number) => {
    if (isGuest) {
      addToast('🔒 Please login or create an account to save favorites!', 'info');
      return;
    }
    setUserData((prev: any) => ({
      ...prev,
      favorites: prev.favorites.includes(id) 
        ? prev.favorites.filter((fid: number) => fid !== id)
        : [...prev.favorites, id]
    }));

    try {
      await fetch('/api/user/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toneId: id })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async (model: any) => {
    const isFileSystemSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    
    if (isFileSystemSupported && !dirHandle) {
      alert('Please select a local folder using the button above first.');
      return;
    }

    setDownloadingItems(prev => new Set(prev).add(model.id));
    
    try {
      // 1. Get permissions explicitly if not granted
      if (dirHandle) {
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          alert('Write permission to the folder was denied.');
          return;
        }
      }
      // 2. Fetch models URLs from backend proxy
      const res = await fetch(`/api/models?tone_id=${model.id}`);
      const data = await res.json();
      
      if (!data.success || !data.models || data.models.length === 0) {
        alert('No models found for this capture.');
        setDownloadingItems(prev => { const n = new Set(prev); n.delete(model.id); return n; });
        return;
      }

      // 3. Create subdirectories
      const safeToneName = model.name.replace(/[^a-z0-9 _-]/gi, '_').trim() || 'Unnamed_Pack';
      const categoryFolderName = model.type === 'Full Rig' ? 'FullRig' : model.type === 'Amp Head' ? 'Amps' : model.type === 'Pedal' ? 'Pedals' : model.type === 'Cabinet / IR' ? 'Cabinets_IRs' : 'Outboard';
      
      let packHandle: any = null;
      if (dirHandle) {
        const categoryHandle = await dirHandle.getDirectoryHandle(categoryFolderName, { create: true });
        packHandle = await categoryHandle.getDirectoryHandle(safeToneName, { create: true });
      }

      // 4. Filter by architecture and deduplicate models
      let filteredModels = data.models;
      if (activeArchitecture === '1') {
        filteredModels = data.models.filter((m: any) => m.model_url?.toLowerCase().endsWith('.wav') || String(m.architecture_version || '1') === '1');
      } else if (activeArchitecture === '2') {
        filteredModels = data.models.filter((m: any) => m.model_url?.toLowerCase().endsWith('.wav') || String(m.architecture_version) === '2');
      }

      const nameToHighestArch = new Map<string, any>();
      for (const m of filteredModels) {
        const arch = String(m.architecture_version || '1');
        const existing = nameToHighestArch.get(m.name);
        if (!existing || arch > String(existing.architecture_version || '1')) {
          nameToHighestArch.set(m.name, m);
        }
      }
      filteredModels = Array.from(nameToHighestArch.values());

      if (filteredModels.length === 0) {
        alert('No models matching the selected architecture were found in this pack.');
        setDownloadingItems(prev => { const n = new Set(prev); n.delete(model.id); return n; });
        return;
      }

      const usedNames = new Set<string>();
      for (const m of filteredModels) {
        if (!m.model_url) continue;
        
        const fileRes = await fetch(`/api/download?url=${encodeURIComponent(m.model_url)}`);
        if (!fileRes.ok) {
          throw new Error(`Failed to download model ${m.name}`);
        }
        const blob = await fileRes.blob();
        
        let baseName = m.name.replace(/[^a-z0-9 _-]/gi, '_').trim() || 'model';
        if (usedNames.has(baseName)) {
          let i = 2;
          while (usedNames.has(`${baseName}_${i}`)) i++;
          baseName = `${baseName}_${i}`;
        }
        usedNames.add(baseName);
        
        let ext = '.nam';
        if (m.model_url) {
          const urlObj = new URL(m.model_url);
          const pathname = urlObj.pathname;
          const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
          if (match) ext = '.' + match[1].toLowerCase();
        }
        
        const safeModelName = baseName + ext;
        
        if (packHandle) {
          const fileHandle = await packHandle.getFileHandle(safeModelName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          // Fallback: Browser default download
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = safeModelName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
          
          // Wait a tiny bit to prevent browser from blocking rapid multiple downloads
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // 5. Update backend tracking
      if (userData?.username) {
        await fetch('/api/user/downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toneId: model.id })
        });
        setUserData((prev: any) => ({ ...prev, downloads: [...(prev.downloads || []), model.id] }));
      }
      
      addToast(`✅ Pack "${model.name}" downloaded successfully!`, 'success');

    } catch (err) {
      console.error(err);
      addToast(`❌ Error downloading pack "${model.name}".`, 'error');
    } finally {
      setDownloadingItems(prev => { const n = new Set(prev); n.delete(model.id); return n; });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsGuest(true);
      setUserData({ settings: {}, favorites: [], downloads: [], username: '' });
      setActiveTab('search'); // Reset to search tab to avoid showing locked screens unnecessarily
      addToast('Logged out successfully', 'success');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <main>
      <div className="header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h1 style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem', fontSize: '2.5rem', margin: 0 }}>
            ToneManager 
            <span style={{ fontSize: '1.2rem', fontWeight: 'normal', color: 'var(--primary-color)' }}>
              v3.0 PRO
            </span>
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            A tool to help you organize NAM profiles from <a href="https://www.tone3000.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 'bold' }}>tone3000</a>.
          </p>
        </div>
        
        {isGuest ? (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--surface-color)', padding: '0.8rem 1.5rem', borderRadius: '50px', border: '1px solid var(--primary-color)' }}>
            <div className="guest-login-msg" style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
              Login with your Tone3000 account
            </div>
            <a href="/api/auth/tone3000" className="action-btn" style={{ background: 'var(--primary-color)', color: '#000', padding: '0.5rem 1.2rem', border: 'none', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}>
              Login with Tone3000
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-color)', padding: '0.8rem 1.5rem', borderRadius: '50px', border: '1px solid var(--surface-border)' }}>
            <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
              Welcome, <strong style={{ color: '#fff' }}>{userData.username}</strong>
            </div>
            
            {userData.username && userData.tone3000Connected === false && (
              <a href="/api/auth/tone3000" style={{ background: 'var(--primary-color)', color: '#000', padding: '0.4rem 1rem', borderRadius: '50px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.9rem', boxShadow: '0 0 10px rgba(102, 252, 241, 0.4)' }}>
                Connect Tone3000
              </a>
            )}

            <div style={{ width: '1px', height: '24px', background: 'var(--surface-border)' }}></div>
            <button onClick={handleLogout} className="action-btn" style={{ borderColor: 'transparent', background: 'transparent', padding: '0.2rem', color: '#ff6b6b' }} title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: dirHandle ? '1px solid var(--primary-color)' : '1px solid var(--surface-border)' }}>
        <div>
          <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '1.5rem', color: dirHandle ? 'var(--primary-color)' : '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderOpen size={24} /> {dirHandle ? 'Synced Local Folder' : 'Local Sync Required'}
          </h3>
          <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-muted)' }}>
            {dirHandle ? (
              <span style={{ color: '#fff' }}>Saving downloads directly to: <strong>{dirHandle.name}</strong></span>
            ) : (
              'Select a folder on your computer to allow direct downloads.'
            )}
          </p>
        </div>
        <button 
          onClick={selectDirectory} 
          className="search-button" 
          style={{ 
            background: dirHandle ? 'transparent' : 'var(--primary-color)', 
            color: dirHandle ? 'var(--primary-color)' : '#000',
            border: dirHandle ? '1px solid var(--primary-color)' : 'none',
            fontSize: '1.1rem',
            padding: '1rem 2rem',
            borderRadius: '8px'
          }}
        >
          {dirHandle ? 'Change Folder' : 'Select Local Folder Now'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem' }}>
        <button className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>Search</button>
        <button className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`} onClick={() => setActiveTab('downloads')}>My Downloads</button>
        <button className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>My Favorites</button>
      </div>

      {(activeTab === 'downloads' || activeTab === 'favorites') && isGuest ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', background: 'var(--surface-color)', borderRadius: '12px', border: '1px solid var(--surface-border)', marginBottom: '2rem' }}>
          <Bookmark size={48} color="var(--primary-color)" style={{ margin: '0 auto 1.5rem auto', opacity: 0.8 }} />
          <h2 style={{ marginBottom: '1rem', fontSize: '2rem' }}>Unlock {activeTab === 'downloads' ? 'Download History' : 'Favorites'}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.2rem', maxWidth: '500px', margin: '0 auto 2rem auto' }}>
            You need an account to view and manage your {activeTab === 'downloads' ? 'download history' : 'favorite models'}.
          </p>
          <a href="/api/auth/tone3000" className="search-button" style={{ display: 'inline-block', padding: '1rem 2rem', fontSize: '1.1rem', textDecoration: 'none' }}>
            Login with Tone3000
          </a>
        </div>
      ) : !isGuest && userData.username && userData.tone3000Connected === false ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', background: 'var(--surface-color)', borderRadius: '12px', border: '1px solid rgba(102, 252, 241, 0.4)', marginBottom: '2rem', boxShadow: '0 0 30px rgba(102, 252, 241, 0.1)' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '2.5rem', color: 'var(--primary-color)' }}>Connect Tone3000</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto 2rem auto', lineHeight: 1.6 }}>
            To comply with Tone3000 API guidelines and enable seamless downloads, you must securely connect your Tone3000 account. This allows you to browse and download models directly to your local folder.
          </p>
          <a href="/api/auth/tone3000" className="search-button" style={{ display: 'inline-block', padding: '1rem 2rem', fontSize: '1.2rem', textDecoration: 'none', background: 'var(--primary-color)', color: '#000', fontWeight: 'bold' }}>
            Link Tone3000 Account Now
          </a>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className={`filter-btn ${activeCategory === '' ? 'active' : ''}`} onClick={() => setActiveCategory('')}>All</button>
              <button className={`filter-btn ${activeCategory === 'full-rig' ? 'active' : ''}`} onClick={() => setActiveCategory('full-rig')}>Full Rig</button>
              <button className={`filter-btn ${activeCategory === 'amp' ? 'active' : ''}`} onClick={() => setActiveCategory('amp')}>Amp Head</button>
              <button className={`filter-btn ${activeCategory === 'pedal' ? 'active' : ''}`} onClick={() => setActiveCategory('pedal')}>Pedal</button>
              <button className={`filter-btn ${activeCategory === 'outboard' ? 'active' : ''}`} onClick={() => setActiveCategory('outboard')}>Outboard</button>
              <button className={`filter-btn ${activeCategory === 'ir' ? 'active' : ''}`} onClick={() => setActiveCategory('ir')}>Cabinet / IR</button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <select 
                className="sort-select" 
                value={activeArchitecture} 
                onChange={(e) => setActiveArchitecture(e.target.value)}
              >
                <option value="">All Versions</option>
                <option value="2">NAM A2 Only</option>
                <option value="1">NAM A1 (Legacy) Only</option>
                <option value="custom">Custom</option>
              </select>

              <select 
                className="sort-select" 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="trending">Trending</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="downloads">Most Downloaded</option>
                <option value="best-match">Best Match</option>
              </select>
            </div>
          </div>

      {activeTab === 'search' && (
        <form className="search-container" onSubmit={handleSearch}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search packages (e.g., Fender, 6505+, Bogner...)" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-button" disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>
      )}

      <div className="models-list">
        {results.map(model => {
          const isDownloaded = userData.downloads?.includes(model.id);
          const isFavorited = userData.favorites?.includes(model.id);

          return (
            <div key={model.id} className="model-card">
              <div className="model-image-container">
                {model.image ? (
                  <img src={model.image} alt={model.name} className="model-image" />
                ) : (
                  <Folder size={32} color="#555" />
                )}
              </div>
              
              <div className="model-info">
                <div>
                  <div className="model-header">
                    <h3 className="model-title">
                      <a href={`https://www.tone3000.com/tones/${model.slug}-${model.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                        {model.name} <ExternalLink size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
                      </a>
                    </h3>
                  </div>
                  
                  <div className="model-gear">
                    {model.type}
                    {model.isA2 && <span className="badge">NAM A2</span>}
                    {model.hasA1 && <span className="badge">NAM A1</span>}
                    {model.hasIR && <span className="badge">IR</span>}
                    {!model.isA2 && !model.hasA1 && !model.hasIR && <span className="badge">NAM</span>}
                  </div>
                  
                  <div className="model-stats">
                    <div className="stat-item">
                      <DownloadCloud size={14} /> {model.downloads_count}
                    </div>
                    <div 
                      className={`stat-item stat-action ${isFavorited ? 'active' : ''}`}
                      onClick={() => toggleFavorite(model.id)}
                    >
                      <Bookmark size={14} fill={isFavorited ? "currentColor" : "none"} /> {model.favorites_count}
                    </div>
                    <div className="stat-item">
                      <Folder size={14} /> {model.models_count}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div className="model-author-row">
                    {model.avatar_url ? (
                      <img src={model.avatar_url} alt={model.author} className="author-avatar" />
                    ) : (
                      <div className="author-avatar" />
                    )}
                    <span>{model.author}</span>
                    <span>·</span>
                    <span>{model.created_at}</span>
                  </div>

                  {isDownloaded ? (
                    <button 
                      className="action-btn" 
                      onClick={() => handleDownload(model)}
                      disabled={downloadingItems.has(model.id) || (typeof window !== 'undefined' && 'showDirectoryPicker' in window && !dirHandle)}
                      style={{ color: 'var(--primary-color)', borderColor: 'var(--primary-color)', opacity: (typeof window !== 'undefined' && 'showDirectoryPicker' in window && !dirHandle) ? 0.5 : 1 }}
                      title={(typeof window !== 'undefined' && 'showDirectoryPicker' in window && !dirHandle) ? 'Select a folder above first' : 'Redownload'}
                    >
                      {downloadingItems.has(model.id) ? 'Downloading...' : <><CheckCircle size={16} /> Redownload</>}
                    </button>
                  ) : (
                    <button 
                      className="action-btn"
                      onClick={() => handleDownload(model)}
                      disabled={downloadingItems.has(model.id) || (typeof window !== 'undefined' && 'showDirectoryPicker' in window && !dirHandle)}
                      style={{ opacity: (typeof window !== 'undefined' && 'showDirectoryPicker' in window && !dirHandle) ? 0.5 : 1 }}
                      title={(typeof window !== 'undefined' && 'showDirectoryPicker' in window && !dirHandle) ? 'Select a folder above first' : ''}
                    >
                      {downloadingItems.has(model.id) ? 'Downloading...' : <><DownloadCloud size={16} /> Download</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {totalPages > 1 && (
        <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '3rem' }}>
          <button 
            className="action-btn" 
            disabled={currentPage === 1 || isSearching}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button 
            className="action-btn" 
            disabled={currentPage >= totalPages || isSearching}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {results.length === 0 && !isSearching && (
        <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)' }}>
          {query ? `No models found for "${query}"` : "No models found."}
        </div>
      )}
      </>
      )}

      {/* Toasts Container */}
      <div style={{
        position: 'fixed', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 9999
      }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
            color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
            transition: 'opacity 0.3s ease-out'
          }}>
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  );
}
