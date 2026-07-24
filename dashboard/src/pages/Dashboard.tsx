import { useState, useEffect } from 'react';
import FilterBar from '../components/FilterBar';
import PostCard from '../components/PostCard';
import { ShieldAlert, FileWarning, Flame, Shield } from 'lucide-react';

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
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, [page, filters]);

  async function fetchPosts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('size', '10');
      if (filters.language) params.set('language', filters.language);
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

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ language: '', geo_location: '', keyword: '', threat_category: '' });
    setPage(1);
  }

  // Stats from current data
  const threatCounts = posts.reduce((acc: Record<string, number>, p) => {
    const cat = p.classification.threat_category;
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">Threat Intelligence Feed</h2>
          <p className="page-subtitle">{total} posts detected · Page {page} of {totalPages || 1}</p>
        </div>
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
        posts.map((post) => <PostCard key={post.post_id} post={post} />)
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
