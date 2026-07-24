import { useState, useEffect } from 'react';
import PostCard from '../components/PostCard';
import { FileText, Download, AlertTriangle, CheckCircle, Loader } from 'lucide-react';

interface IncidentReportProps {
  role: 'Analyst' | 'Admin';
}

interface ReportData {
  report_id: string;
  generated_at: string;
  generated_by: string;
  format: string;
  summary: {
    total_posts: number;
    threat_breakdown: Record<string, number>;
    languages: string[];
    platforms: string[];
    date_range: { from: string; to: string };
    avg_confidence: number;
    total_engagement: number;
  };
  posts: {
    post_id: string;
    platform: string;
    author: string;
    threat_category: string;
    confidence: number;
    text_preview: string;
    geo: string;
  }[];
  recommendations: string[];
}

export default function IncidentReport({ role }: IncidentReportProps) {
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const res = await fetch('/api/posts?size=100');
      const data = await res.json();
      setPosts(data.data);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  function selectAll() {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p.post_id)));
    }
  }

  async function generateReport() {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    setError('');
    setReport(null);

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': role,
          'X-User-Name': 'demo_admin',
        },
        body: JSON.stringify({ post_ids: [...selectedIds], format: 'json' }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Failed to generate report');
      }

      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <FileText size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Incident Report Generator
          </h2>
          <p className="page-subtitle">
            Select posts to include in an incident report · {selectedIds.size} selected
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>
            {selectedIds.size === posts.length ? 'Deselect All' : 'Select All'}
          </button>
          {role === 'Admin' ? (
            <button
              className="btn btn-primary"
              onClick={generateReport}
              disabled={selectedIds.size === 0 || generating}
            >
              {generating ? (
                <>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Generating...
                </>
              ) : (
                <>
                  <FileText size={14} />
                  Generate Report ({selectedIds.size})
                </>
              )}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
              <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> Admin role required to generate
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: 14, marginBottom: 16, borderColor: 'var(--accent-red)', color: 'var(--accent-red)', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          {error}
        </div>
      )}

      {/* Report Preview */}
      {report && (
        <div className="glass-card" style={{ padding: 24, marginBottom: 24, border: '1px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={18} style={{ color: 'var(--accent-green)' }} />
                Report Generated — {report.report_id}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Generated at {new Date(report.generated_at).toLocaleString()} by {report.generated_by}
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={downloadReport}>
              <Download size={14} /> Download JSON
            </button>
          </div>

          <div className="stats-row" style={{ marginBottom: 20 }}>
            <div className="glass-card stat-card">
              <div className="stat-card-label">Posts Analyzed</div>
              <div className="stat-card-value">{report.summary.total_posts}</div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-card-label">Avg Confidence</div>
              <div className="stat-card-value">{(report.summary.avg_confidence * 100).toFixed(0)}%</div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-card-label">Total Engagement</div>
              <div className="stat-card-value">{report.summary.total_engagement.toLocaleString()}</div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-card-label">Platforms</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>{report.summary.platforms.join(', ')}</div>
            </div>
          </div>

          {/* Threat Breakdown */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Threat Breakdown</h4>
            <div className="flex flex-wrap gap-3">
              {Object.entries(report.summary.threat_breakdown).map(([cat, count]) => (
                <span key={cat} className={`badge badge-${cat.toLowerCase()}`} style={{ fontSize: 12, padding: '5px 14px' }}>
                  {cat}: {count}
                </span>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recommendations</h4>
            <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {report.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Post selection */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div className="animate-pulse">Loading posts...</div>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.post_id}
            post={post}
            selectable
            selected={selectedIds.has(post.post_id)}
            onSelect={toggleSelect}
          />
        ))
      )}
    </div>
  );
}
