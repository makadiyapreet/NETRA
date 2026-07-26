import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart, BarChart, Bar, ReferenceLine,
} from 'recharts';
import { TrendingUp, Activity, AlertTriangle, Zap } from 'lucide-react';

interface TrendSpike {
  spike_id: string;
  keyword: string;
  frequency_timeseries: { timestamp: string; count: number }[];
  z_score: number;
  detected_at: string;
}

const ACCENT_COLORS = ['#00d4ff', '#a855f7', '#f59e0b', '#ef4444', '#22c55e'];

export default function TrendView() {
  const [trends, setTrends] = useState<TrendSpike[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrend, setSelectedTrend] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTrends();
    const interval = setInterval(() => {
      fetchTrends(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchTrends(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/trends');
      const data = await res.json();
      setTrends(data.data);
      if (data.data.length > 0) setSelectedTrend(data.data[0].spike_id);
    } catch (err) {
      console.error('Failed to fetch trends:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const filteredTrends = trends.filter(t => t.keyword.toLowerCase().includes(searchQuery.toLowerCase()));

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getSeverityLabel(z: number) {
    if (z >= 6) return { label: 'CRITICAL', color: '#ef4444' };
    if (z >= 4) return { label: 'HIGH', color: '#f97316' };
    if (z >= 3) return { label: 'MEDIUM', color: '#f59e0b' };
    return { label: 'LOW', color: '#22c55e' };
  }

  const selected = filteredTrends.find((t) => t.spike_id === selectedTrend) || (filteredTrends.length > 0 ? filteredTrends[0] : undefined);

  // Multi-line overview chart data
  const allTimestamps = [...new Set(filteredTrends.flatMap((t) => t.frequency_timeseries.map((p) => p.timestamp)))].sort();
  const overviewData = allTimestamps.map((ts) => {
    const point: any = { time: formatTime(ts) };
    filteredTrends.forEach((t) => {
      const match = t.frequency_timeseries.find((p) => p.timestamp === ts);
      point[t.keyword] = match?.count || 0;
    });
    return point;
  });

  const selectedData = selected
    ? selected.frequency_timeseries.map((p) => ({
        time: formatTime(p.timestamp),
        count: p.count,
        fullTime: p.timestamp,
      }))
    : [];

  const maxCount = selected ? Math.max(...selected.frequency_timeseries.map((p) => p.count)) : 0;
  const detectedIndex = selected
    ? selectedData.findIndex((d) => d.fullTime === selected.detected_at)
    : -1;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <TrendingUp size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Trend Monitor
          </h2>
          <p className="page-subtitle">
            {filteredTrends.length} active spikes detected · Real-time keyword tracking
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Search trend keywords..." 
            className="filter-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 250 }}
          />
        </div>
      </div>

      {/* Spike summary cards */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        {filteredTrends.map((t, i) => {
          const sev = getSeverityLabel(t.z_score);
          const peak = Math.max(...t.frequency_timeseries.map((p) => p.count));
          return (
            <div
              key={t.spike_id}
              className={`glass-card stat-card ${selectedTrend === t.spike_id ? '' : ''}`}
              style={{
                cursor: 'pointer',
                borderColor: selectedTrend === t.spike_id ? ACCENT_COLORS[i % ACCENT_COLORS.length] : undefined,
                borderWidth: selectedTrend === t.spike_id ? 2 : undefined,
              }}
              onClick={() => setSelectedTrend(t.spike_id)}
            >
              <div className="stat-card-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t.keyword}</span>
                <span className="badge" style={{ background: sev.color + '22', color: sev.color, fontSize: 9 }}>
                  {sev.label}
                </span>
              </div>
              <div className="stat-card-value" style={{ color: ACCENT_COLORS[i % ACCENT_COLORS.length], fontSize: 22 }}>
                {peak.toLocaleString()}
              </div>
              <div className="stat-card-sub">
                <Zap size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> z-score: {t.z_score.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div className="animate-pulse">Loading trend data...</div>
        </div>
      ) : (
        <>
          {/* Overview: All trends */}
          <div className="glass-card chart-wrapper">
            <div className="chart-title">
              <Activity size={16} /> All Keyword Trends — Overview
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={overviewData}>
                <defs>
                  {filteredTrends.map((t, i) => (
                    <linearGradient key={t.spike_id} id={`grad-${t.spike_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ACCENT_COLORS[i % ACCENT_COLORS.length]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ACCENT_COLORS[i % ACCENT_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fill: '#8b8fa3', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                <YAxis tick={{ fill: '#8b8fa3', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e8eaf0', fontSize: 12 }}
                  itemStyle={{ color: '#e8eaf0' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8b8fa3' }} />
                {filteredTrends.map((t, i) => (
                  <Area
                    key={t.spike_id}
                    type="monotone"
                    dataKey={t.keyword}
                    stroke={ACCENT_COLORS[i % ACCENT_COLORS.length]}
                    fill={`url(#grad-${t.spike_id})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed: Selected trend */}
          {selected && (
            <div className="glass-card chart-wrapper">
              <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                  Spike Detail — "{selected.keyword}"
                </span>
                <span style={{ fontSize: 12, color: getSeverityLabel(selected.z_score).color, fontWeight: 600 }}>
                  Z-Score: {selected.z_score.toFixed(1)} · Peak: {maxCount.toLocaleString()}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={selectedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fill: '#8b8fa3', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#8b8fa3', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e8eaf0', fontSize: 12 }}
                    formatter={(val: any) => [val.toLocaleString(), 'Mentions']}
                  />
                  {detectedIndex >= 0 && (
                    <ReferenceLine
                      x={selectedData[detectedIndex]?.time}
                      stroke="#ef4444"
                      strokeDasharray="5 5"
                      label={{ value: 'Spike Detected', position: 'top', fill: '#ef4444', fontSize: 11 }}
                    />
                  )}
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    fill="url(#barGrad)"
                  />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#0066aa" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ padding: '12px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Detected at: {new Date(selected.detected_at).toLocaleString()} · 
                Data points: {selected.frequency_timeseries.length}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
