import { useState, useEffect, useRef } from 'react';
import { List, Plus, Trash2, Search, Hash, MapPin, User, Globe, Eye, AlertTriangle, MessageSquare, ThumbsUp, Share2, ExternalLink, FlaskConical, RefreshCw, WifiOff } from 'lucide-react';

interface WatchlistManagerProps {
  role: 'Analyst' | 'Admin';
}

type EntryType = 'keyword' | 'hashtag' | 'geo_box' | 'profile';

interface WatchlistData {
  keywords: any[];
  hashtags: any[];
  geo_boxes: any[];
  profiles: any[];
}

interface MatchedPost {
  post_id: string;
  platform: string;
  author_handle: string;
  text: string;
  timestamp: string;
  detected_language: string;
  geo_location?: { city: string; lat: number; lng: number };
  engagement_counts: { likes: number; shares: number; comments: number };
  classification: {
    threat_category: string;
    sentiment: string;
    confidence: number;
    keywords: string[];
  };
}

const HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

export default function WatchlistManager({ role }: WatchlistManagerProps) {
  const [data, setData] = useState<WatchlistData>({ keywords: [], hashtags: [], geo_boxes: [], profiles: [] });
  const [activeTab, setActiveTab] = useState<EntryType>('keyword');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Matched content state
  const [matchedPosts, setMatchedPosts] = useState<MatchedPost[]>([]);
  const [matchKeyword, setMatchKeyword] = useState<string>('');
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchTotal, setMatchTotal] = useState(0);
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [liveFetching, setLiveFetching] = useState(false);

  // Form state
  const [formValue, setFormValue] = useState('');
  const [formPlatform, setFormPlatform] = useState('');
  const [formGeoArea, setFormGeoArea] = useState('');
  const [formProfileId, setFormProfileId] = useState('');
  const [formGeoName, setFormGeoName] = useState('');
  const [formLatMin, setFormLatMin] = useState('');
  const [formLatMax, setFormLatMax] = useState('');
  const [formLngMin, setFormLngMin] = useState('');
  const [formLngMax, setFormLngMax] = useState('');

  // Service status
  const [serviceError, setServiceError] = useState<string | null>(null);
  const matchRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchWatchlist();
    return () => {
      if (matchRefreshRef.current) clearInterval(matchRefreshRef.current);
    };
  }, []);

  // Auto-refresh matched posts every 15s when a keyword is selected
  useEffect(() => {
    if (matchRefreshRef.current) clearInterval(matchRefreshRef.current);
    if (matchKeyword) {
      matchRefreshRef.current = setInterval(() => {
        fetchMatches(matchKeyword, true);
      }, 15000);
    }
    return () => {
      if (matchRefreshRef.current) clearInterval(matchRefreshRef.current);
    };
  }, [matchKeyword]);

  async function fetchWatchlist() {
    setLoading(true);
    try {
      const res = await fetch('/api/watchlist', {
        headers: { 'X-User-Role': role },
      });
      if (!res.ok) {
        // Backend returned an error (e.g. 503 = upstream watchlist API down)
        let errorMsg = `Watchlist service returned ${res.status}`;
        try {
          const errBody = await res.json();
          errorMsg = errBody.message || errBody.error || errorMsg;
        } catch (_) { /* response wasn't JSON */ }
        setServiceError(errorMsg);
        setData({ keywords: [], hashtags: [], geo_boxes: [], profiles: [] });
        return;
      }
      const d = await res.json();
      setData(d);
      setServiceError(null);
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
      setServiceError('Cannot connect to the API gateway');
      setData({ keywords: [], hashtags: [], geo_boxes: [], profiles: [] });
    } finally {
      setLoading(false);
    }
  }

  async function fetchMatches(keyword: string, silent = false) {
    if (!keyword.trim()) return;
    if (!silent) {
      setMatchLoading(true);
      setShowMatchPanel(true);
    }
    setMatchKeyword(keyword);
    try {
      const res = await fetch(`/api/watchlist/matches/${encodeURIComponent(keyword)}`);
      const d = await res.json();
      setMatchedPosts(d.posts || []);
      setMatchTotal(d.total || 0);
    } catch (err) {
      console.error('Failed to fetch matches:', err);
      if (!silent) {
        setMatchedPosts([]);
        setMatchTotal(0);
      }
    } finally {
      if (!silent) setMatchLoading(false);
    }
  }

  // Trigger live YouTube fetch for the keyword, then retry matches
  async function liveFetchAndMatch(keyword: string) {
    setLiveFetching(true);
    try {
      await fetch('/api/live/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: keyword, platforms: ['youtube', 'telegram', 'twitter', 'facebook'] }),
      });
      // Wait a moment for DataStore to update, then re-search
      await new Promise(r => setTimeout(r, 500));
      await fetchMatches(keyword);
    } catch (err) {
      console.error('Live fetch failed:', err);
    } finally {
      setLiveFetching(false);
    }
  }

  async function addEntry() {
    if (!formValue && activeTab !== 'geo_box') return;

    let body: any = { type: activeTab };

    switch (activeTab) {
      case 'keyword':
        body.keyword = formValue;
        body.platform_filter = formPlatform || null;
        body.geo_area = formGeoArea || null;
        break;
      case 'hashtag':
        body.hashtag = formValue.startsWith('#') ? formValue : `#${formValue}`;
        body.platform_filter = formPlatform || null;
        body.geo_area = formGeoArea || null;
        break;
      case 'geo_box':
        body.name = formGeoName;
        body.lat_min = parseFloat(formLatMin);
        body.lat_max = parseFloat(formLatMax);
        body.lng_min = parseFloat(formLngMin);
        body.lng_max = parseFloat(formLngMax);
        break;
      case 'profile':
        body.platform = formPlatform || 'twitter';
        body.profile_id = formProfileId || formValue;
        body.handle = formValue;
        break;
    }

    try {
      await fetch('/api/watchlist', {
        method: 'POST',
        headers: { ...HEADERS, 'X-User-Role': role },
        body: JSON.stringify(body),
      });
      resetForm();
      fetchWatchlist();
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  }

  async function deleteEntry(id: number) {
    try {
      await fetch(`/api/watchlist/${id}`, {
        method: 'DELETE',
        headers: { 'X-User-Role': role },
      });
      fetchWatchlist();
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  }

  function resetForm() {
    setFormValue('');
    setFormPlatform('');
    setFormGeoArea('');
    setFormProfileId('');
    setFormGeoName('');
    setFormLatMin('');
    setFormLatMax('');
    setFormLngMin('');
    setFormLngMax('');
  }

  const tabs: { id: EntryType; label: string; icon: any }[] = [
    { id: 'keyword', label: 'Keywords', icon: Search },
    { id: 'hashtag', label: 'Hashtags', icon: Hash },
    { id: 'geo_box', label: 'Geo Boxes', icon: MapPin },
    { id: 'profile', label: 'Profiles', icon: User },
  ];

  // Get current items based on active tab
  const currentItems = (() => {
    switch (activeTab) {
      case 'keyword': return data.keywords || [];
      case 'hashtag': return data.hashtags || [];
      case 'geo_box': return data.geo_boxes || [];
      case 'profile': return data.profiles || [];
    }
  })();

  // Filter by search
  const filtered = currentItems.filter((item: any) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      item.keyword?.toLowerCase().includes(s) ||
      item.hashtag?.toLowerCase().includes(s) ||
      item.name?.toLowerCase().includes(s) ||
      item.handle?.toLowerCase().includes(s) ||
      item.platform?.toLowerCase().includes(s) ||
      item.geo_area?.toLowerCase().includes(s)
    );
  });

  const totalEntries =
    (data.keywords?.length || 0) +
    (data.hashtags?.length || 0) +
    (data.geo_boxes?.length || 0) +
    (data.profiles?.length || 0);

  // Helper: get clickable keyword from a watchlist item
  function getSearchableValue(item: any): string | null {
    if (item.keyword) return item.keyword;
    if (item.hashtag) return item.hashtag.replace('#', '');
    if (item.handle) return item.handle;
    return null;
  }

  // Threat badge colors
  function threatColor(cat: string): string {
    switch (cat) {
      case 'IncitementToViolence': return '#ef4444';
      case 'Inflammatory': return '#f97316';
      case 'FakeNews': return '#a855f7';
      default: return '#22c55e';
    }
  }

  function platformIcon(platform: string): string {
    switch (platform?.toLowerCase()) {
      case 'twitter': return '𝕏';
      case 'facebook': return 'f';
      case 'telegram': return '✈';
      case 'youtube': return '▶';
      case 'instagram': return '📷';
      default: return '🌐';
    }
  }

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <List size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Watchlist Manager
          </h2>
          <p className="page-subtitle">
            {totalEntries} entries tracked · {role === 'Admin' ? 'Full control' : 'Read-only'} · Click any entry to view matched content
          </p>
        </div>
      </div>

      {/* Service Error Banner */}
      {serviceError && (
        <div className="glass-card" style={{ padding: '12px 18px', marginBottom: 16, borderLeft: '3px solid #f59e0b', background: 'rgba(245,158,11,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WifiOff size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b' }}>Watchlist Service Offline</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
            {serviceError}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="stats-row">
        {tabs.map((tab) => {
          const count = (() => {
            switch (tab.id) {
              case 'keyword': return data.keywords?.length || 0;
              case 'hashtag': return data.hashtags?.length || 0;
              case 'geo_box': return data.geo_boxes?.length || 0;
              case 'profile': return data.profiles?.length || 0;
            }
          })();
          return (
            <div key={tab.id} className="glass-card stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab(tab.id)}>
              <div className="stat-card-label">
                <tab.icon size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {tab.label}
              </div>
              <div className="stat-card-value">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Type Tabs */}
      <div className="watchlist-type-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`watchlist-type-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add Form — Admin only */}
      {role === 'Admin' && (
        <div className="glass-card watchlist-form" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          {(activeTab === 'keyword' || activeTab === 'hashtag') && (
            <>
              <div className="filter-group">
                <label className="filter-label">{activeTab === 'keyword' ? 'Keyword' : 'Hashtag'}</label>
                <input
                  className="filter-input"
                  placeholder={activeTab === 'keyword' ? 'e.g. communal violence' : 'e.g. #fakenews'}
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label className="filter-label">Platform (optional)</label>
                <select className="filter-select" value={formPlatform} onChange={(e) => setFormPlatform(e.target.value)}>
                  <option value="">All Platforms</option>
                  <option value="twitter">Twitter</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">Geo Area (optional)</label>
                <input className="filter-input" placeholder="e.g. Gujarat" value={formGeoArea} onChange={(e) => setFormGeoArea(e.target.value)} />
              </div>
            </>
          )}

          {activeTab === 'profile' && (
            <>
              <div className="filter-group">
                <label className="filter-label">Handle</label>
                <input className="filter-input" placeholder="e.g. @username" value={formValue} onChange={(e) => setFormValue(e.target.value)} />
              </div>
              <div className="filter-group">
                <label className="filter-label">Platform</label>
                <select className="filter-select" value={formPlatform} onChange={(e) => setFormPlatform(e.target.value)}>
                  <option value="twitter">Twitter</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>
              <div className="filter-group">
                <label className="filter-label">Profile ID (optional)</label>
                <input className="filter-input" placeholder="Unique ID" value={formProfileId} onChange={(e) => setFormProfileId(e.target.value)} />
              </div>
            </>
          )}

          {activeTab === 'geo_box' && (
            <>
              <div className="filter-group">
                <label className="filter-label">Name</label>
                <input className="filter-input" placeholder="e.g. Ahmedabad Region" value={formGeoName} onChange={(e) => setFormGeoName(e.target.value)} />
              </div>
              <div className="filter-group">
                <label className="filter-label">Lat Min</label>
                <input className="filter-input" type="number" step="0.01" value={formLatMin} onChange={(e) => setFormLatMin(e.target.value)} />
              </div>
              <div className="filter-group">
                <label className="filter-label">Lat Max</label>
                <input className="filter-input" type="number" step="0.01" value={formLatMax} onChange={(e) => setFormLatMax(e.target.value)} />
              </div>
              <div className="filter-group">
                <label className="filter-label">Lng Min</label>
                <input className="filter-input" type="number" step="0.01" value={formLngMin} onChange={(e) => setFormLngMin(e.target.value)} />
              </div>
              <div className="filter-group">
                <label className="filter-label">Lng Max</label>
                <input className="filter-input" type="number" step="0.01" value={formLngMax} onChange={(e) => setFormLngMax(e.target.value)} />
              </div>
            </>
          )}

          <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-primary" onClick={addEntry}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}

      {/* Search within watchlist */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="filter-input"
          placeholder="Search within watchlist..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', maxWidth: 400 }}
        />
      </div>

      {/* Main Content: Table + Matched Content side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: showMatchPanel ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Watchlist Table */}
        <div>
          {loading ? (
            <div className="search-empty-state"><div className="animate-pulse">Loading watchlist...</div></div>
          ) : (
            <div className="glass-card" style={{ overflow: 'auto' }}>
              <table className="watchlist-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    {activeTab === 'keyword' && <><th>Keyword</th><th>Platform</th><th>Geo Area</th></>}
                    {activeTab === 'hashtag' && <><th>Hashtag</th><th>Platform</th><th>Geo Area</th></>}
                    {activeTab === 'geo_box' && <><th>Name</th><th>Lat Range</th><th>Lng Range</th></>}
                    {activeTab === 'profile' && <><th>Handle</th><th>Platform</th><th>Profile ID</th></>}
                    <th>Status</th>
                    <th>View</th>
                    {role === 'Admin' && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={role === 'Admin' ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                        No {activeTab.replace('_', ' ')} entries {searchTerm ? 'matching search' : 'yet'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item: any) => {
                      const searchVal = getSearchableValue(item);
                      const isActive = matchKeyword === searchVal;
                      return (
                        <tr key={item.id} style={{ background: isActive ? 'var(--accent-cyan-dim, rgba(0,212,255,0.06))' : undefined }}>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.id}</td>
                          {activeTab === 'keyword' && (
                            <>
                              <td style={{ fontWeight: 600 }}>{item.keyword}</td>
                              <td>{item.platform_filter || 'All'}</td>
                              <td>{item.geo_area || '—'}</td>
                            </>
                          )}
                          {activeTab === 'hashtag' && (
                            <>
                              <td style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{item.hashtag}</td>
                              <td>{item.platform_filter || 'All'}</td>
                              <td>{item.geo_area || '—'}</td>
                            </>
                          )}
                          {activeTab === 'geo_box' && (
                            <>
                              <td style={{ fontWeight: 600 }}>
                                <Globe size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                {item.name}
                              </td>
                              <td>{item.lat_min?.toFixed(2)}° — {item.lat_max?.toFixed(2)}°</td>
                              <td>{item.lng_min?.toFixed(2)}° — {item.lng_max?.toFixed(2)}°</td>
                            </>
                          )}
                          {activeTab === 'profile' && (
                            <>
                              <td style={{ fontWeight: 600 }}>@{item.handle}</td>
                              <td>
                                <span className={`platform-${item.platform}`}>{item.platform}</span>
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.profile_id}</td>
                            </>
                          )}
                          <td>
                            <span className={`badge ${item.is_active !== false ? 'badge-neutral' : 'badge-inflammatory'}`}>
                              {item.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            {searchVal && (
                              <button
                                onClick={() => fetchMatches(searchVal)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  borderRadius: 6,
                                  border: `1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                                  background: isActive ? 'var(--accent-cyan-dim, rgba(0,212,255,0.1))' : 'var(--bg-tertiary)',
                                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Eye size={12} /> View Posts
                              </button>
                            )}
                          </td>
                          {role === 'Admin' && (
                            <td>
                              <div className="watchlist-actions">
                                <button className="btn btn-danger btn-sm" onClick={() => deleteEntry(item.id)} title="Remove">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Matched Content Panel */}
        {showMatchPanel && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ExternalLink size={16} style={{ color: 'var(--accent-cyan)' }} />
                Matched Content
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                  — "{matchKeyword}"
                </span>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 12,
                  background: matchTotal > 0 ? 'rgba(239,68,68,0.1)' : 'var(--bg-tertiary)',
                  color: matchTotal > 0 ? '#ef4444' : 'var(--text-muted)',
                  border: `1px solid ${matchTotal > 0 ? '#ef444433' : 'var(--border-subtle)'}`,
                }}>
                  {matchTotal} match{matchTotal !== 1 ? 'es' : ''}
                </span>
                <button
                  onClick={() => { setShowMatchPanel(false); setMatchKeyword(''); setMatchedPosts([]); setMatchTotal(0); }}
                  style={{
                    padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                    border: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {matchLoading ? (
              <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="animate-pulse">Searching posts...</div>
              </div>
            ) : matchedPosts.length === 0 ? (
              <div className="glass-card" style={{ padding: 30, textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}>
                  No posts found matching "<strong>{matchKeyword}</strong>" in the current data store.
                </p>
                <button
                  onClick={() => liveFetchAndMatch(matchKeyword)}
                  disabled={liveFetching}
                  style={{
                    padding: '8px 18px', fontSize: 12, fontWeight: 700, borderRadius: 8,
                    border: '1px solid var(--accent-cyan)',
                    background: 'var(--accent-cyan-dim, rgba(0,212,255,0.1))',
                    color: 'var(--accent-cyan)', cursor: liveFetching ? 'wait' : 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {liveFetching ? (
                    <><RefreshCw size={12} className="animate-spin" /> Fetching from all platforms...</>
                  ) : (
                    <><Search size={12} /> Fetch Live Data</>
                  )}
                </button>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10 }}>
                  This will search all platforms (YouTube, Telegram, Twitter, Facebook) for "{matchKeyword}" and add matching posts to the data store.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
                {matchedPosts.map((post: any) => {
                  const isSynthetic = post.is_synthetic === true || post.source === 'mock_live' || post.source === 'fixture';
                  return (
                  <div
                    key={post.post_id}
                    className="glass-card"
                    style={{ padding: 14, transition: 'all 0.2s ease', ...(isSynthetic ? { borderLeft: '3px solid #f59e0b', opacity: 0.85 } : {}) }}
                  >
                    {/* Post Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Platform Badge */}
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          flexShrink: 0,
                        }}>
                          {platformIcon(post.platform)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                            {post.author_handle}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {post.platform} · {post.detected_language} · {post.geo_location?.city || 'Unknown'} · {new Date(post.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {/* Threat Badge + Synthetic Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {isSynthetic && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 2,
                            padding: '2px 6px', fontSize: 8, fontWeight: 800,
                            borderRadius: 4, letterSpacing: '0.5px',
                            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            border: '1px solid rgba(245,158,11,0.3)',
                            textTransform: 'uppercase',
                          }}>
                            <FlaskConical size={8} /> SIM
                          </span>
                        )}
                        <span style={{
                          padding: '3px 8px',
                          fontSize: 9,
                          fontWeight: 800,
                          borderRadius: 4,
                          background: `${threatColor(post.classification.threat_category)}15`,
                          color: threatColor(post.classification.threat_category),
                          border: `1px solid ${threatColor(post.classification.threat_category)}33`,
                          letterSpacing: '0.3px',
                          textTransform: 'uppercase',
                          flexShrink: 0,
                        }}>
                          {post.classification.threat_category === 'IncitementToViolence' ? 'INCITEMENT' : post.classification.threat_category}
                        </span>
                      </div>
                    </div>

                    {/* Post Text */}
                    <div style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--text-primary)',
                      marginBottom: 10,
                      padding: '8px 10px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 6,
                      borderLeft: `3px solid ${threatColor(post.classification.threat_category)}`,
                    }}>
                      {post.text.length > 200 ? post.text.slice(0, 200) + '...' : post.text}
                    </div>

                    {/* Keywords */}
                    {post.classification.keywords?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {post.classification.keywords.map((kw: string, i: number) => (
                          <span key={i} style={{
                            padding: '2px 7px',
                            fontSize: 10,
                            borderRadius: 4,
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Engagement + Confidence */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <ThumbsUp size={11} /> {post.engagement_counts.likes.toLocaleString()}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Share2 size={11} /> {post.engagement_counts.shares.toLocaleString()}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <MessageSquare size={11} /> {post.engagement_counts.comments.toLocaleString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={11} style={{ color: threatColor(post.classification.threat_category) }} />
                        <span style={{ fontWeight: 700, color: threatColor(post.classification.threat_category) }}>
                          {(post.classification.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    </div>

                    {/* Post URL link */}
                    {post.post_url && (
                      <div style={{ marginTop: 6 }}>
                        <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                          <ExternalLink size={11} /> View on {post.platform || 'Platform'}
                        </a>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
