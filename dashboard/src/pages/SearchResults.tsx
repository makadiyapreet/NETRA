import { useState, useEffect } from 'react';
import { Search, FileWarning, Bell, TrendingUp, Network, ArrowRight } from 'lucide-react';
import PostCard from '../components/PostCard';

interface SearchResultsProps {
  query: string;
  onNavigate: (page: any) => void;
}

interface SearchResponse {
  keyword: string;
  matching_posts: any[];
  related_alerts: any[];
  trend_history: any[];
  related_clusters: any[];
}

export default function SearchResults({ query, onNavigate }: SearchResultsProps) {
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query) {
      performSearch(query);
    }
  }, [query]);

  async function performSearch(q: string) {
    setLoading(true);
    try {
      // 1. Fetch live data from external APIs (Twitter, YouTube) and classify them
      try {
        await fetch('/api/live/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, platforms: ['youtube', 'twitter', 'telegram'] }),
        });
      } catch (err) {
        console.warn('Live fetch failed, falling back to local data only:', err);
      }

      // 2. Query the DataStore for unified results
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!query) {
    return (
      <div className="search-empty-state">
        <Search size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <p>Enter a keyword to search across all posts, alerts, trends, and clusters.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="search-empty-state">
        <div className="animate-pulse">Searching for "{query}"...</div>
      </div>
    );
  }

  if (!results) return null;

  const totalResults =
    results.matching_posts.length +
    results.related_alerts.length +
    results.trend_history.length +
    results.related_clusters.length;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Search size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Results for "{results.keyword}"
          </h2>
          <p className="page-subtitle">
            {totalResults} results across {
              [
                results.matching_posts.length > 0 && 'posts',
                results.related_alerts.length > 0 && 'alerts',
                results.trend_history.length > 0 && 'trends',
                results.related_clusters.length > 0 && 'clusters',
              ].filter(Boolean).join(', ')
            }
          </p>
        </div>
      </div>

      {/* Matching Posts */}
      {results.matching_posts.length > 0 && (
        <div className="search-results-section">
          <div className="search-results-section-title">
            <FileWarning size={16} />
            Matching Posts
            <span className="count">{results.matching_posts.length}</span>
          </div>
          {results.matching_posts.slice(0, 10).map((post: any) => (
            <PostCard key={post.post_id} post={post} />
          ))}
          {results.matching_posts.length > 10 && (
            <p className="text-muted text-xs mt-2">
              Showing 10 of {results.matching_posts.length} matching posts
            </p>
          )}
        </div>
      )}

      {/* Related Alerts */}
      {results.related_alerts.length > 0 && (
        <div className="search-results-section">
          <div className="search-results-section-title">
            <Bell size={16} />
            Related Alerts
            <span className="count">{results.related_alerts.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {results.related_alerts.slice(0, 10).map((alert: any) => (
              <div key={alert.alert_id || alert.post_id} className={`glass-card alert-card sev-${alert.severity}`}>
                <div className="alert-header">
                  <div className="alert-title">
                    <span className={`badge severity-${alert.severity}`}>
                      SEV-{alert.severity}
                    </span>
                    {alert.title || alert.threat_category}
                  </div>
                </div>
                <div className="alert-description">
                  {alert.description || alert.triggering_reason}
                </div>
                <div className="alert-footer">
                  <span>{new Date(alert.timestamp || alert.created_at).toLocaleString()}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('alerts')}>
                    View in Alert Center <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend History */}
      {results.trend_history.length > 0 && (
        <div className="search-results-section">
          <div className="search-results-section-title">
            <TrendingUp size={16} />
            Trend Spikes
            <span className="count">{results.trend_history.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {results.trend_history.map((spike: any, i: number) => (
              <div key={i} className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>#{spike.keyword}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Z-Score: <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>{spike.z_score?.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {spike.geo_area && <span>📍 {spike.geo_area}</span>}
                  {spike.detected_at && <span> · {new Date(spike.detected_at).toLocaleString()}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Frequency: {spike.current_frequency || spike.frequency_timeseries?.length || 0}
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => onNavigate('trends')}>
            View in Trend Monitor <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Related Clusters */}
      {results.related_clusters.length > 0 && (
        <div className="search-results-section">
          <div className="search-results-section-title">
            <Network size={16} />
            Related Coordination Clusters
            <span className="count">{results.related_clusters.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {results.related_clusters.map((cluster: any) => (
              <div key={cluster.cluster_id} className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{cluster.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Accounts: {cluster.accounts?.length || 0}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Coordination Score: <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>
                    {((cluster.coordination_score || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => onNavigate('network')}
                >
                  View in Network Graph <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalResults === 0 && (
        <div className="search-empty-state">
          <Search size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>No results found for "{query}"</p>
          <p className="text-muted text-xs mt-2">Try different keywords or check your spelling</p>
        </div>
      )}
    </div>
  );
}
