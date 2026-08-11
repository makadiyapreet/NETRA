import { useState, useEffect } from 'react';
import PostCard from '../components/PostCard';
import FilterBar from '../components/FilterBar';
import { FileText, Download, AlertTriangle, CheckCircle, Loader, FileSpreadsheet, Scale, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    full_text: string;
    geo: string;
    post_url?: string;
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

  // FIR and AI Summary state
  const [generatingFir, setGeneratingFir] = useState(false);
  const [fir, setFir] = useState<any>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState<any>(null);

  const [filters, setFilters] = useState({
    language: '',
    geo_location: '',
    keyword: '',
    threat_category: '',
    platform: '',
  });

  useEffect(() => {
    fetchPosts();
  }, [filters]);

  async function fetchPosts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('size', '100');
      if (filters.language) params.set('language', filters.language);
      if (filters.platform) params.set('platform', filters.platform);
      if (filters.geo_location) params.set('geo_location', filters.geo_location);
      if (filters.keyword) params.set('keyword', filters.keyword);
      if (filters.threat_category) params.set('threat_category', filters.threat_category);

      const res = await fetch(`/api/posts?${params}`);
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

  async function generateFIR() {
    if (selectedIds.size === 0) return;
    setGeneratingFir(true);
    setError('');
    setFir(null);
    try {
      const res = await fetch('/api/reports/generate-fir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': role,
          'X-User-Name': 'demo_admin',
        },
        body: JSON.stringify({ post_ids: [...selectedIds] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate FIR');
      }
      setFir(await res.json());
    } catch (err: any) {
      setError(err.message || 'FIR generation failed');
    } finally {
      setGeneratingFir(false);
    }
  }

  async function generateAISummary() {
    if (selectedIds.size === 0) return;
    setGeneratingSummary(true);
    setError('');
    setAiSummary(null);
    try {
      const res = await fetch('/api/ai/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_ids: [...selectedIds] }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate summary');
      }
      setAiSummary(await res.json());
    } catch (err: any) {
      setError(err.message || 'AI summary generation failed');
    } finally {
      setGeneratingSummary(false);
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

  function downloadExcel() {
    if (!report) return;
    const data = report.posts.map((p) => ({
      'Post ID': p.post_id,
      'Platform': p.platform,
      'Author': p.author,
      'Threat Category': p.threat_category,
      'Confidence': (p.confidence * 100).toFixed(1) + '%',
      'Location': p.geo,
      'Text': p.full_text,
      'URL': p.post_url || 'N/A',
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Incident Report');
    XLSX.writeFile(workbook, `${report.report_id}.xlsx`);
  }

  function downloadPDF() {
    if (!report) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Incident Report: ${report.report_id}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated at: ${new Date(report.generated_at).toLocaleString()}`, 14, 30);
    doc.text(`Generated by: ${report.generated_by}`, 14, 36);
    
    autoTable(doc, {
      startY: 45,
      head: [['Author', 'Platform', 'Category', 'Post Content', 'Link']],
      body: report.posts.map(p => [
        p.author,
        p.platform,
        `${p.threat_category}\nConf: ${(p.confidence * 100).toFixed(0)}%`,
        p.full_text,
        p.post_url || 'N/A'
      ]),
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 25 },
        3: { cellWidth: 80 },
        4: { cellWidth: 35, overflow: 'linebreak' }
      },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [0, 217, 255], textColor: [10, 14, 20] }
    });
    
    doc.save(`${report.report_id}.pdf`);
  }

  function downloadCSV() {
    if (posts.length === 0) return;
    const header = ['Post ID', 'Platform', 'Author', 'Threat Category', 'Confidence', 'Language', 'Timestamp', 'Text', 'URL'];
    const rows = posts.map(p => [
      p.post_id,
      p.platform,
      p.author_handle,
      p.classification?.threat_category,
      p.classification?.confidence,
      p.detected_language,
      p.timestamp,
      `"${p.text.replace(/"/g, '""')}"`,
      p.post_url || ''
    ]);
    const csvContent = [header, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NETRA_Export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({ language: '', geo_location: '', keyword: '', threat_category: '', platform: '' });
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
          {role === 'Admin' && (
            <>
              <button
                className="btn btn-secondary"
                onClick={generateFIR}
                disabled={selectedIds.size === 0 || generatingFir}
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
              >
                {generatingFir ? (
                  <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</>
                ) : (
                  <><Scale size={14} /> Analyze Legal Violations ({selectedIds.size})</>
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={generateAISummary}
                disabled={selectedIds.size === 0 || generatingSummary}
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {generatingSummary ? (
                  <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
                ) : (
                  <><Sparkles size={14} /> AI Summary ({selectedIds.size})</>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: 14, marginBottom: 16, borderColor: 'var(--accent-red)', color: 'var(--accent-red)', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" onClick={downloadCSV} disabled={posts.length === 0}>
          <Download size={14} /> Export CSV ({posts.length} posts)
        </button>
      </div>

      <FilterBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} />

      {/* AI Summary Result */}
      {aiSummary && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 20, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.05)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: '#10b981' }} />
            AI-Generated Incident Summary
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.7, fontStyle: 'italic', marginBottom: 12, color: 'var(--text-primary)' }}>
            "{aiSummary.summary}"
          </p>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span>Model: {aiSummary.model}</span>
            <span>Source posts: {aiSummary.source_posts}</span>
            <span>Generated: {new Date(aiSummary.generated_at).toLocaleTimeString()}</span>
            {aiSummary.tokens_used > 0 && <span>Tokens: {aiSummary.tokens_used}</span>}
          </div>
        </div>
      )}

      {/* FIR Result */}
      {fir && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 20, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Scale size={18} style={{ color: '#8b5cf6' }} />
                Legal Violation Analysis — {fir.fir_id}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Status: {fir.status} · Jurisdiction: {fir.complainant?.jurisdiction} · Generated {new Date(fir.generated_at).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Applicable Law */}
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
              Applicable IPC / IT Act Sections
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {fir.applicable_law?.sections?.map((s: string, i: number) => (
                <span key={s} style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: 12, fontWeight: 600,
                  background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)',
                }}>
                  {s}
                  <span style={{ fontWeight: 400, marginLeft: 4, fontSize: 11, opacity: 0.8 }}>
                    — {fir.applicable_law?.descriptions?.[i]?.slice(0, 50)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Incident Summary */}
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Incident</h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {fir.incident?.description}
            </p>
          </div>

          {/* Evidence Chain */}
          <div style={{ marginBottom: 10 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Evidence Hash Chain</h4>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              Chain length: {fir.evidence_chain?.chain_length} · Latest hash: {fir.evidence_chain?.latest_hash?.slice(0, 24)}...
            </p>
          </div>

          {/* Recommendations */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>Recommendations</h4>
            {fir.recommendations?.map((r: string, i: number) => (
              <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                • {r}
              </p>
            ))}
          </div>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={downloadReport}>
                <Download size={14} /> JSON
              </button>
              <button className="btn btn-secondary btn-sm" onClick={downloadExcel}>
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button className="btn btn-primary btn-sm" onClick={downloadPDF}>
                <Download size={14} /> PDF
              </button>
            </div>
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
