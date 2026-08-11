import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Play, Pause, RefreshCw, Zap, CheckCircle, XCircle, AlertTriangle, Loader, ChevronDown, ChevronUp, ExternalLink, Shield } from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface CrawlSchedule {
  id: string;
  query: string;
  platforms: string[];
  interval_seconds: number;
  enabled: boolean;
  created_at: string;
  created_by: string;
  last_run_at: string | null;
  next_run_at: string;
  run_count: number;
  last_result: { posts_fetched: number; error?: string } | null;
}

interface FetchedPost {
  post_id: string;
  text: string;
  platform: string;
  author_handle: string;
  post_url?: string;
  classification?: {
    threat_category: string;
    confidence: number;
  };
  engagement?: { likes?: number; shares?: number; comments?: number };
  created_at?: string;
}

const PLATFORM_OPTIONS = [
  { id: 'youtube', label: 'YouTube', emoji: '📺' },
  { id: 'twitter', label: 'Twitter/X', emoji: '🐦' },
  { id: 'telegram', label: 'Telegram', emoji: '✈️' },
  { id: 'facebook', label: 'Facebook', emoji: '📘' },
];

const INTERVAL_OPTIONS = [
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
  { label: '10 minutes', value: 600 },
  { label: '15 minutes', value: 900 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
];

const THREAT_COLORS: Record<string, string> = {
  IncitementToViolence: '#ef4444',
  Inflammatory: '#f59e0b',
  FakeNews: '#8b5cf6',
  Neutral: '#10b981',
};

export default function CrawlScheduler() {
  const { theme } = useTheme();
  const [schedules, setSchedules] = useState<CrawlSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formQuery, setFormQuery] = useState('');
  const [formPlatforms, setFormPlatforms] = useState<string[]>(['youtube']);
  const [formInterval, setFormInterval] = useState(300);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Expandable state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<FetchedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const isDark = theme === 'dark';
  const cardBg = isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)';
  const borderColor = isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)';
  const textPrimary = isDark ? '#e5e7eb' : '#111827';
  const textSecondary = isDark ? '#9ca3af' : '#6b7280';
  const accentBlue = '#3b82f6';
  const accentGreen = '#10b981';
  const accentRed = '#ef4444';

  useEffect(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  function getHeaders(): Record<string, string> {
    const role = localStorage.getItem('netra_role') || 'Admin';
    return {
      'Content-Type': 'application/json',
      'X-User-Role': role,
      'X-User-Name': 'admin',
    };
  }

  async function fetchSchedules() {
    try {
      const res = await fetch('/api/scheduled-crawls', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.data || []);
      }
    } catch {
      // Service unavailable
    } finally {
      setLoading(false);
    }
  }

  async function createSchedule() {
    if (!formQuery.trim() || formPlatforms.length === 0) {
      setFeedback({ type: 'error', message: 'Please enter a search query and select at least one platform.' });
      return;
    }
    setCreating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/scheduled-crawls', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          query: formQuery.trim(),
          platforms: formPlatforms,
          interval_seconds: formInterval,
        }),
      });
      if (res.ok) {
        setFormQuery('');
        setShowForm(false);
        setFeedback({
          type: 'success',
          message: `Schedule created! First crawl running now — posts will appear in ~30-60 seconds. Click the card to view results.`,
        });
        fetchSchedules();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', message: err.message || err.error || `Failed (HTTP ${res.status})` });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error creating schedule' });
    } finally {
      setCreating(false);
    }
  }

  async function deleteSchedule(id: string) {
    try {
      await fetch(`/api/scheduled-crawls/${id}`, { method: 'DELETE', headers: getHeaders() });
      setFeedback({ type: 'success', message: `Schedule deleted.` });
      if (expandedId === id) setExpandedId(null);
      fetchSchedules();
    } catch {
      setFeedback({ type: 'error', message: 'Failed to delete schedule' });
    }
  }

  async function toggleSchedule(id: string, enabled: boolean) {
    try {
      await fetch(`/api/scheduled-crawls/${id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ enabled }),
      });
      fetchSchedules();
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  }

  async function toggleExpand(schedule: CrawlSchedule) {
    if (expandedId === schedule.id) {
      setExpandedId(null);
      setExpandedPosts([]);
      return;
    }
    setExpandedId(schedule.id);
    setLoadingPosts(true);
    setExpandedPosts([]);

    try {
      // Fetch posts from the data store matching the schedule's query
      const res = await fetch(`/api/posts?keyword=${encodeURIComponent(schedule.query)}&size=50`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setExpandedPosts(data.data || []);
      }
    } catch {
      setExpandedPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }

  function formatInterval(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)} hr`;
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    return `${Math.round(diff / 3600000)}h ago`;
  }

  function togglePlatform(id: string) {
    setFormPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function truncateText(text: string, maxLen: number = 180): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '…';
  }

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: textPrimary, display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Clock size={28} color={accentBlue} />
            Crawl Scheduler
          </h1>
          <p style={{ fontSize: '14px', color: textSecondary, marginTop: '4px' }}>
            Define recurring crawl schedules — posts flow through the classify → store → alert pipeline automatically.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: `linear-gradient(135deg, ${accentBlue}, #6366f1)`,
            color: '#fff', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
            transition: 'transform 0.15s', fontSize: '14px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <Plus size={18} />
          Add Schedule
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px',
          background: feedback.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${feedback.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: feedback.type === 'success' ? accentGreen : accentRed,
          animation: 'slideIn 0.3s ease-out',
        }}>
          {feedback.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span style={{ flex: 1 }}>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px' }}>×</button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div style={{
          background: cardBg, border: `1px solid ${borderColor}`, borderRadius: '12px',
          padding: '24px', marginBottom: '20px', backdropFilter: 'blur(12px)',
        }}>
          <h3 style={{ color: textPrimary, fontWeight: 600, marginBottom: '20px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color={accentBlue} />
            New Scheduled Crawl
          </h3>

          {/* Query */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: textSecondary, fontWeight: 500, display: 'block', marginBottom: '6px' }}>
              Search Query
            </label>
            <input
              type="text"
              placeholder='e.g., "protest Gujarat", "riot Mumbai"'
              value={formQuery}
              onChange={(e) => setFormQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                color: textPrimary, outline: 'none', fontSize: '14px', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Platforms */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: textSecondary, fontWeight: 500, display: 'block', marginBottom: '8px' }}>
              Platforms
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {PLATFORM_OPTIONS.map((opt) => {
                const selected = formPlatforms.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => togglePlatform(opt.id)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                      border: `1px solid ${selected ? accentBlue : borderColor}`,
                      background: selected ? isDark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)' : 'transparent',
                      color: selected ? accentBlue : textSecondary,
                      fontWeight: selected ? 600 : 400, fontSize: '13px',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    {opt.emoji} {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interval */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '13px', color: textSecondary, fontWeight: 500, display: 'block', marginBottom: '6px' }}>
              Interval
            </label>
            <select
              value={formInterval}
              onChange={(e) => setFormInterval(Number(e.target.value))}
              style={{
                padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                color: textPrimary, outline: 'none', fontSize: '14px',
              }}
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={createSchedule}
              disabled={creating || !formQuery.trim() || formPlatforms.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                background: creating || !formQuery.trim() || formPlatforms.length === 0
                  ? isDark ? '#374151' : '#d1d5db'
                  : `linear-gradient(135deg, ${accentGreen}, #059669)`,
                color: '#fff', fontWeight: 600, cursor: creating ? 'wait' : 'pointer',
                fontSize: '14px', transition: 'all 0.15s',
              }}
            >
              {creating ? (
                <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</>
              ) : (
                <><CheckCircle size={16} /> Create & Run Now</>
              )}
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: '10px 20px', borderRadius: '8px',
                border: `1px solid ${borderColor}`, background: 'transparent',
                color: textSecondary, cursor: 'pointer', fontSize: '14px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Schedule List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: textSecondary }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p>Loading schedules…</p>
        </div>
      ) : schedules.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: cardBg, borderRadius: '12px', border: `1px dashed ${borderColor}`,
        }}>
          <Clock size={48} color={textSecondary} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ color: textSecondary, fontSize: '15px' }}>
            No crawl schedules yet. Click "Add Schedule" to automate data collection.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {schedules.map((schedule) => {
            const isRunning = schedule.enabled && schedule.last_result === null;
            const hasError = schedule.last_result?.error;
            const isExpanded = expandedId === schedule.id;
            const borderClr = schedule.enabled
              ? hasError ? 'rgba(239,68,68,0.4)' : isRunning ? 'rgba(59,130,246,0.4)' : 'rgba(16,185,129,0.3)'
              : borderColor;

            return (
              <div
                key={schedule.id}
                style={{
                  background: cardBg, borderRadius: '12px',
                  border: `1px solid ${borderClr}`,
                  backdropFilter: 'blur(12px)',
                  transition: 'all 0.2s',
                  overflow: 'hidden',
                }}
              >
                {/* Clickable Header */}
                <div
                  onClick={() => toggleExpand(schedule)}
                  style={{
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? 'rgba(59,130,246,0.04)' : 'rgba(59,130,246,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {/* Status dot */}
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: schedule.enabled
                          ? hasError ? accentRed : isRunning ? accentBlue : accentGreen
                          : textSecondary,
                        boxShadow: schedule.enabled ? `0 0 8px ${hasError ? accentRed : isRunning ? accentBlue : accentGreen}` : 'none',
                        animation: (schedule.enabled && !hasError) ? 'pulse 2s infinite' : 'none',
                      }} />
                      <span style={{ fontSize: '17px', fontWeight: 600, color: textPrimary }}>
                        "{schedule.query}"
                      </span>
                      <span style={{
                        fontSize: '11px', padding: '3px 10px', borderRadius: '6px', fontWeight: 600,
                        background: schedule.enabled
                          ? hasError ? 'rgba(239,68,68,0.12)' : isRunning ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)'
                          : isDark ? 'rgba(107,114,128,0.2)' : 'rgba(107,114,128,0.1)',
                        color: schedule.enabled
                          ? hasError ? accentRed : isRunning ? accentBlue : accentGreen
                          : textSecondary,
                      }}>
                        {!schedule.enabled ? 'PAUSED' : isRunning ? '⏳ PROCESSING…' : hasError ? '⚠️ ERROR' : '✅ ACTIVE'}
                      </span>
                      {/* Expand indicator */}
                      <span style={{ color: textSecondary, marginLeft: '4px' }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>

                    {/* Actions — stop propagation so clicks don't toggle expand */}
                    <div style={{ display: 'flex', gap: '10px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSchedule(schedule.id, !schedule.enabled)}
                        title={schedule.enabled ? 'Pause' : 'Resume'}
                        style={{
                          padding: '8px 16px', borderRadius: '8px', border: 'none',
                          background: schedule.enabled ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                          cursor: 'pointer', color: schedule.enabled ? accentRed : accentGreen,
                          fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.15s',
                        }}
                      >
                        {schedule.enabled ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        title="Delete schedule"
                        style={{
                          padding: '8px 16px', borderRadius: '8px', border: 'none',
                          background: 'rgba(239,68,68,0.08)', cursor: 'pointer', color: accentRed,
                          fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Info row */}
                  <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: textSecondary, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{schedule.platforms.map((p) => {
                      const platform = PLATFORM_OPTIONS.find((x) => x.id === p);
                      return platform ? `${platform.emoji} ${platform.label}` : p;
                    }).join('  ·  ')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <RefreshCw size={13} /> Every {formatInterval(schedule.interval_seconds)}
                    </span>
                    <span>{schedule.run_count} run{schedule.run_count !== 1 ? 's' : ''}</span>
                    <span>Last: {timeAgo(schedule.last_run_at)}</span>
                    {schedule.last_result && !hasError && schedule.last_result.posts_fetched > 0 && (
                      <span style={{ color: accentGreen, fontWeight: 600 }}>
                        ✅ {schedule.last_result.posts_fetched} posts fetched
                      </span>
                    )}
                  </div>

                  {/* Error banner */}
                  {hasError && (
                    <div style={{
                      marginTop: '10px', padding: '10px 14px', borderRadius: '8px',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                      fontSize: '12px', color: accentRed, display: 'flex', alignItems: 'flex-start', gap: '8px',
                    }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <strong>Last run failed:</strong> {schedule.last_result?.error}
                        <br />
                        <span style={{ color: textSecondary, fontSize: '11px' }}>
                          Next run will retry automatically.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ Expanded Posts Panel ═══ */}
                {isExpanded && (
                  <div style={{
                    borderTop: `1px solid ${borderColor}`,
                    padding: '16px 20px',
                    background: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)',
                    animation: 'slideIn 0.2s ease-out',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: textPrimary, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={14} color={accentBlue} />
                        Fetched & Classified Posts ({expandedPosts.length})
                      </h4>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(schedule); setTimeout(() => toggleExpand(schedule), 100); }}
                        style={{ background: 'none', border: 'none', color: accentBlue, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <RefreshCw size={12} /> Refresh
                      </button>
                    </div>

                    {loadingPosts ? (
                      <div style={{ textAlign: 'center', padding: '30px', color: textSecondary }}>
                        <Loader size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                        <p style={{ fontSize: '13px' }}>Loading posts…</p>
                      </div>
                    ) : expandedPosts.length === 0 ? (
                      <div style={{
                        textAlign: 'center', padding: '30px',
                        borderRadius: '8px', border: `1px dashed ${borderColor}`,
                        color: textSecondary, fontSize: '13px',
                      }}>
                        {isRunning
                          ? '⏳ First crawl is still running — posts will appear after NLP classification completes (~30-60s). Click Refresh to check.'
                          : 'No posts found yet for this query. Data appears after the crawl runs and NLP classifies the posts.'
                        }
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' }}>
                        {expandedPosts.map((post, idx) => {
                          const threatCat = post.classification?.threat_category || 'Neutral';
                          const confidence = post.classification?.confidence || 0;
                          const threatColor = THREAT_COLORS[threatCat] || '#6b7280';
                          
                          return (
                            <div
                              key={post.post_id || idx}
                              style={{
                                padding: '14px 16px', borderRadius: '10px',
                                background: isDark ? 'rgba(17,24,39,0.7)' : '#fff',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                                transition: 'border-color 0.15s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = threatColor + '40')}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}
                            >
                              {/* Post header */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  {/* Threat badge */}
                                  <span style={{
                                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: 700,
                                    background: threatColor + '18', color: threatColor,
                                    letterSpacing: '0.3px',
                                  }}>
                                    {threatCat}
                                  </span>
                                  {/* Confidence */}
                                  <span style={{ fontSize: '11px', color: textSecondary }}>
                                    {(confidence * 100).toFixed(0)}% confidence
                                  </span>
                                  {/* Platform */}
                                  <span style={{
                                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                                    background: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.08)',
                                    color: accentBlue, fontWeight: 600,
                                  }}>
                                    {post.platform}
                                  </span>
                                </div>
                                {/* Link */}
                                {post.post_url && (
                                  <a
                                    href={post.post_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: accentBlue, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', textDecoration: 'none' }}
                                  >
                                    <ExternalLink size={12} /> View
                                  </a>
                                )}
                              </div>

                              {/* Post text */}
                              <p style={{ fontSize: '13px', color: textPrimary, margin: '0 0 6px 0', lineHeight: 1.5 }}>
                                {truncateText(post.text)}
                              </p>

                              {/* Footer */}
                              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: textSecondary }}>
                                <span>@{post.author_handle}</span>
                                <span style={{ fontFamily: 'monospace', fontSize: '10px', opacity: 0.7 }}>
                                  {post.post_id}
                                </span>
                              </div>

                              {/* Confidence bar */}
                              <div style={{
                                marginTop: '8px', height: '3px', borderRadius: '2px',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${confidence * 100}%`, height: '100%',
                                  background: threatColor,
                                  borderRadius: '2px',
                                  transition: 'width 0.5s ease',
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
