import { useState, useEffect } from 'react';
import FilterBar from '../components/FilterBar';
import PostCard from '../components/PostCard';
import { ShieldAlert, FileWarning, Flame, Shield, Radio, Loader2, ExternalLink, Video } from 'lucide-react';

interface DashboardProps {
  role: 'Analyst' | 'Admin';
}

const API = '/api';

export default function Dashboard({ role }: DashboardProps) {
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    language: '',
    geo_location: '',
    keyword: '',
    threat_category: '',
    platform: '',
  });
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);

  // Live fetch state
  const [liveQuery, setLiveQuery] = useState('');
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveResult, setLiveResult] = useState<{ total: number; errors: string[] } | null>(null);
  const [apiStatus, setApiStatus] = useState<any>(null);

  useEffect(() => {
    fetchPosts();
    fetchApiStatus();

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchPosts(true); // silent fetch to avoid loading flash
      setCountdown(10);
    }, 10000);
    
    const tick = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 10));
    }, 1000);

    return () => { clearInterval(interval); clearInterval(tick); };
  }, [page, filters]);

  async function fetchPosts(silent = false) {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('size', '100'); // 100 most recent posts
      if (filters.language) params.set('language', filters.language);
      if (filters.platform) params.set('platform', filters.platform);
      if (filters.geo_location) params.set('geo_location', filters.geo_location);
      if (filters.keyword) params.set('keyword', filters.keyword);
      if (filters.threat_category) params.set('threat_category', filters.threat_category);

      const res = await fetch(`${API}/posts?${params}`);
      const data = await res.json();
      setPosts(data.data);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchApiStatus() {
    try {
      const res = await fetch(`${API}/live/status`);
      const data = await res.json();
      setApiStatus(data);
    } catch {
      // Live fetch not available
    }
  }

  async function handleLiveFetch() {
    if (!liveQuery.trim()) return;
    setLiveFetching(true);
    setLiveResult(null);
    try {
      const res = await fetch(`${API}/live/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: liveQuery.trim() }),
      });
      const data = await res.json();
      setLiveResult({ total: data.total, errors: data.errors || [] });
      // Refresh posts to include newly fetched data
      if (data.total > 0) {
        setTimeout(() => fetchPosts(), 500);
      }
    } catch (err) {
      setLiveResult({ total: 0, errors: ['Failed to connect to live fetch API'] });
    } finally {
      setLiveFetching(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ language: '', geo_location: '', keyword: '', threat_category: '', platform: '' });
    setPage(1);
  }

  // Stats from current data
  const threatCounts = posts.reduce((acc: Record<string, number>, p) => {
    const cat = p.classification?.threat_category;
    if (cat) acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const totalPages = Math.ceil(total / 100);

  return (
    <div className="animate-fade">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 className="page-title">Live Data Feed</h2>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Real-time multi-platform OSINT aggregation
            <span style={{ fontSize: 12, opacity: 0.7, background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(0,212,255,0.3)' }}>
              Next refresh in {countdown}s
            </span>
          </p>
        </div>
      </div>

      {/* Live Fetch Panel */}
      <div className="glass-card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Radio size={16} style={{ color: '#22c55e' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Live Data Fetch</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— Pull real posts from Twitter/X & YouTube APIs</span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="filter-input"
            placeholder="Enter keyword to search (e.g. communal violence, protest, election)"
            value={liveQuery}
            onChange={(e) => setLiveQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLiveFetch()}
            style={{ flex: 1, minWidth: 250 }}
          />
          <button
            onClick={handleLiveFetch}
            disabled={liveFetching || !liveQuery.trim()}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 8,
              border: 'none',
              background: liveFetching ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: liveFetching ? 'var(--text-muted)' : 'white',
              cursor: liveFetching ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            {liveFetching ? <Loader2 size={14} className="animate-pulse" /> : <Radio size={14} />}
            {liveFetching ? 'Fetching...' : 'Fetch Live Data'}
          </button>
        </div>

        {/* API Status Indicators */}
        {apiStatus && (
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, flexWrap: 'wrap' }}>
            {Object.entries(apiStatus).filter(([k]) => k !== 'nlp_service').map(([key, val]: [string, any]) => {
              const hasWarning = !!val.warning;
              const dotColor = !val.configured ? '#ef4444' : hasWarning ? '#f59e0b' : '#22c55e';
              const textColor = !val.configured ? 'var(--text-muted)' : hasWarning ? '#f59e0b' : '#22c55e';
              const statusText = !val.configured 
                ? 'No API Key' 
                : hasWarning 
                  ? (key === 'twitter' ? 'Auth Only (Free tier — no search)' : 'Fallback Mode')
                  : 'Connected';
              return (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, color: textColor }} title={val.warning || ''}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                  {val.label || key}: {statusText}
                </span>
              );
            })}
          </div>
        )}

        {/* Live Fetch Result */}
        {liveResult && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            background: liveResult.total > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${liveResult.total > 0 ? '#22c55e33' : '#ef444433'}`,
            color: liveResult.total > 0 ? '#22c55e' : '#ef4444',
          }}>
            {liveResult.total > 0 ? (
              <span>✅ Fetched & classified <strong>{liveResult.total}</strong> live posts. They are now visible in the feed below.</span>
            ) : (
              <span>⚠️ No posts fetched. {liveResult.errors.join('. ')}</span>
            )}
          </div>
        )}
      </div>

      <div className="stats-row">
        <div className="glass-card stat-card">
          <div className="stat-card-label">Total Posts</div>
          <div className="stat-card-value">{total}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-label" style={{ color: '#f87171' }}>
            <Flame size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Incitement
          </div>
          <div className="stat-card-value" style={{ color: '#f87171' }}>{threatCounts['IncitementToViolence'] || 0}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-label" style={{ color: '#fb923c' }}>
            <ShieldAlert size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Inflammatory
          </div>
          <div className="stat-card-value" style={{ color: '#fb923c' }}>{threatCounts['Inflammatory'] || 0}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-label" style={{ color: '#c084fc' }}>
            <FileWarning size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Fake News
          </div>
          <div className="stat-card-value" style={{ color: '#c084fc' }}>{threatCounts['FakeNews'] || 0}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-label" style={{ color: '#4ade80' }}>
            <Shield size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Neutral
          </div>
          <div className="stat-card-value" style={{ color: '#4ade80' }}>{threatCounts['Neutral'] || 0}</div>
        </div>
      </div>

      <FilterBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div className="animate-pulse">Loading posts...</div>
        </div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          No posts match your filters.
        </div>
      ) : (
        posts.map((post) => (
          <div key={post.post_id}>
            <PostCard post={post} />
            {/* Show media link for YouTube posts */}
            {post.media_url && (
              <div style={{ marginTop: -8, marginBottom: 14, paddingLeft: 16 }}>
                <a
                  href={post.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    border: '1px solid #ef444433',
                    textDecoration: 'none',
                  }}
                >
                  <Video size={12} /> Watch on YouTube <ExternalLink size={10} />
                </a>
              </div>
            )}
          </div>
        ))
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
