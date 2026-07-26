import { useState, useEffect } from 'react';
import { Network, Bot, ShieldAlert, AlertTriangle, Eye, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface ClusterData {
  cluster_id: string;
  label: string;
  accounts: string[];
  coordination_score: number;
  graph_edges: { source: string; target: string; weight: number }[];
}

interface BotScore {
  account_id: string;
  bot_likelihood: number;
  indicators: string[];
}

export default function NetworkView() {
  const { theme } = useTheme();
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const [botScores, setBotScores] = useState<Record<string, BotScore>>({});
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'connections'>('risk');

  useEffect(() => {
    fetchClusters();
  }, []);

  async function fetchClusters() {
    try {
      const res = await fetch('/api/network/clusters');
      const data = await res.json();
      setClusters(data);
      if (data && data.length > 0) {
        setSelectedCluster(data[0].cluster_id);
        await fetchBotScores(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch clusters:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBotScores(cluster: ClusterData) {
    const scores: Record<string, BotScore> = {};
    await Promise.all(
      cluster.accounts.map(async (acc) => {
        try {
          const res = await fetch(`/api/network/bot-score/${acc}`);
          scores[acc] = await res.json();
        } catch {
          scores[acc] = { account_id: acc, bot_likelihood: 0.85, indicators: ['rapid_retweets', 'similar_captions'] };
        }
      })
    );
    setBotScores(scores);
  }

  function handleClusterChange(clusterId: string) {
    setSelectedCluster(clusterId);
    setExpandedAccount(null);
    const cluster = clusters.find((c) => c.cluster_id === clusterId);
    if (cluster) fetchBotScores(cluster);
  }

  const cluster = clusters.find((c) => c.cluster_id === selectedCluster);

  // Get connections count for each account
  function getConnections(accountId: string): string[] {
    if (!cluster) return [];
    const connected = new Set<string>();
    cluster.graph_edges.forEach((e) => {
      if (e.source === accountId) connected.add(e.target);
      if (e.target === accountId) connected.add(e.source);
    });
    return Array.from(connected);
  }

  // Get edge weight between two accounts
  function getEdgeWeight(a: string, b: string): number | null {
    if (!cluster) return null;
    const edge = cluster.graph_edges.find(
      (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
    );
    return edge?.weight || null;
  }

  // Sort accounts
  const sortedAccounts = cluster
    ? [...cluster.accounts].sort((a, b) => {
        if (sortBy === 'risk') {
          return (botScores[b]?.bot_likelihood || 0) - (botScores[a]?.bot_likelihood || 0);
        }
        if (sortBy === 'connections') {
          return getConnections(b).length - getConnections(a).length;
        }
        return a.localeCompare(b);
      })
    : [];

  // Risk color helper
  function riskColor(score: number): string {
    if (score >= 0.9) return '#ef4444';
    if (score >= 0.8) return '#f97316';
    if (score >= 0.7) return '#eab308';
    if (score >= 0.5) return '#3b82f6';
    return '#22c55e';
  }

  function riskLabel(score: number): string {
    if (score >= 0.9) return 'CRITICAL';
    if (score >= 0.8) return 'HIGH';
    if (score >= 0.7) return 'MEDIUM';
    if (score >= 0.5) return 'LOW';
    return 'SAFE';
  }

  function indicatorLabel(ind: string): string {
    const map: Record<string, string> = {
      rapid_retweets: '⚡ Rapid Retweets',
      identical_timestamps: '🕐 Identical Timestamps',
      no_profile_pic: '👤 No Profile Picture',
      copy_paste_text: '📋 Copy-Paste Text',
      high_frequency: '📈 High Post Frequency',
      new_account: '🆕 New Account',
      automated_replies: '🤖 Automated Replies',
      no_bio: '📝 No Bio',
      amplification_pattern: '📢 Amplification Pattern',
      coordinated_timing: '⏱️ Coordinated Timing',
      hate_keywords: '🚫 Hate Keywords',
      impersonation: '🎭 Impersonation',
      fake_news_sharing: '📰 Fake News Sharing',
      similar_captions: '📋 Similar Captions',
      unknown_pattern: '❓ Unknown Pattern',
    };
    return map[ind] || ind.replace(/_/g, ' ');
  }

  if (loading) {
    return (
      <div className="animate-fade" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <div className="animate-pulse" style={{ fontSize: 16 }}>Loading network clusters...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade">
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 className="page-title">
            <Network size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8, color: 'var(--accent-cyan)' }} />
            Bot & Coordination Network Analysis
          </h2>
          <p className="page-subtitle">
            {clusters.length} coordination clusters detected · Select a cluster to inspect accounts & connections
          </p>
        </div>

        <select
          className="filter-select"
          value={selectedCluster}
          onChange={(e) => handleClusterChange(e.target.value)}
          style={{ minWidth: 280 }}
        >
          {clusters.map((c) => (
            <option key={c.cluster_id} value={c.cluster_id}>
              {c.label} — {(c.coordination_score * 100).toFixed(0)}% coordination
            </option>
          ))}
        </select>
      </div>

      {cluster && (
        <>
          {/* Cluster Summary Stats */}
          <div className="stats-row" style={{ marginBottom: 20 }}>
            <div className="glass-card stat-card">
              <div className="stat-card-label">
                <Network size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Cluster Name
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-cyan)' }}>{cluster.label}</div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-card-label">
                <Bot size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Tracked Accounts
              </div>
              <div className="stat-card-value">{cluster.accounts.length}</div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-card-label">
                <ShieldAlert size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Coordination Score
              </div>
              <div className="stat-card-value" style={{ color: cluster.coordination_score >= 0.85 ? '#ef4444' : '#f97316' }}>
                {(cluster.coordination_score * 100).toFixed(0)}%
              </div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-card-label">
                <Link2 size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Network Connections
              </div>
              <div className="stat-card-value">{cluster.graph_edges.length}</div>
            </div>
          </div>

          {/* Legend */}
          <div className="glass-card" style={{ padding: '12px 18px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Risk Levels:</span>
            {[
              { label: 'CRITICAL (90%+)', color: '#ef4444' },
              { label: 'HIGH (80-89%)', color: '#f97316' },
              { label: 'MEDIUM (70-79%)', color: '#eab308' },
              { label: 'LOW (50-69%)', color: '#3b82f6' },
              { label: 'SAFE (<50%)', color: '#22c55e' },
            ].map((l) => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: l.color, display: 'inline-block', boxShadow: `0 0 8px ${l.color}44` }} />
                <span style={{ color: 'var(--text-secondary)' }}>{l.label}</span>
              </span>
            ))}
          </div>

          {/* Sort Controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Sort by:</span>
            {(['risk', 'connections', 'name'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${sortBy === s ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                  background: sortBy === s ? 'var(--accent-cyan-dim, rgba(0,212,255,0.1))' : 'var(--bg-tertiary)',
                  color: sortBy === s ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s === 'risk' ? '🎯 Bot Risk' : s === 'connections' ? '🔗 Connections' : '🔤 Name'}
              </button>
            ))}
          </div>

          {/* Account Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {sortedAccounts.map((acc) => {
              const score = botScores[acc]?.bot_likelihood || 0.5;
              const indicators = botScores[acc]?.indicators || [];
              const connections = getConnections(acc);
              const color = riskColor(score);
              const isExpanded = expandedAccount === acc;

              return (
                <div
                  key={acc}
                  className="glass-card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    border: `1px solid ${isExpanded ? color + '66' : 'var(--border-subtle)'}`,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Account Header */}
                  <div
                    style={{
                      padding: '14px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                    onClick={() => setExpandedAccount(isExpanded ? null : acc)}
                  >
                    {/* Risk Indicator Circle */}
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '50%',
                        background: `${color}18`,
                        border: `2px solid ${color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: `0 0 12px ${color}33`,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800, color }}>{(score * 100).toFixed(0)}</span>
                    </div>

                    {/* Account Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Bot size={14} style={{ color, flexShrink: 0 }} />
                        @{acc}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {connections.length} connections · {indicators.length} signals
                      </div>
                    </div>

                    {/* Risk Badge */}
                    <span
                      style={{
                        padding: '3px 10px',
                        fontSize: 10,
                        fontWeight: 800,
                        borderRadius: 12,
                        background: `${color}18`,
                        color,
                        border: `1px solid ${color}44`,
                        letterSpacing: '0.5px',
                        flexShrink: 0,
                      }}
                    >
                      {riskLabel(score)}
                    </span>

                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                  </div>

                  {/* Risk Bar */}
                  <div style={{ height: 3, background: 'var(--bg-tertiary)' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${score * 100}%`,
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
                      {/* Bot Signals */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                          <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Detection Signals
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {indicators.map((ind) => (
                            <span
                              key={ind}
                              style={{
                                padding: '4px 10px',
                                fontSize: 11,
                                borderRadius: 6,
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {indicatorLabel(ind)}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Connections */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                          <Link2 size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Connected Accounts
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {connections.map((conn) => {
                            const w = getEdgeWeight(acc, conn);
                            const connScore = botScores[conn]?.bot_likelihood || 0.5;
                            return (
                              <span
                                key={conn}
                                onClick={(e) => { e.stopPropagation(); setExpandedAccount(conn); }}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  borderRadius: 6,
                                  background: `${riskColor(connScore)}12`,
                                  border: `1px solid ${riskColor(connScore)}33`,
                                  color: riskColor(connScore),
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                @{conn} {w ? `(${(w * 100).toFixed(0)}%)` : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Connection Matrix */}
          <div style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={18} style={{ color: 'var(--accent-cyan)' }} />
              Connection Matrix
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                — Percentage shows coordination strength between accounts
              </span>
            </h3>
            <div className="glass-card" style={{ overflow: 'auto', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                      Account
                    </th>
                    {cluster.accounts.map((acc) => (
                      <th key={acc} style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 10, minWidth: 70 }}>
                        @{acc.length > 10 ? acc.slice(0, 10) + '…' : acc}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cluster.accounts.map((row) => (
                    <tr key={row}>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, color: riskColor(botScores[row]?.bot_likelihood || 0.5), position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                        @{row}
                      </td>
                      {cluster.accounts.map((col) => {
                        if (row === col) {
                          return (
                            <td key={col} style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
                              <span style={{ color: riskColor(botScores[row]?.bot_likelihood || 0.5), fontWeight: 700 }}>
                                {((botScores[row]?.bot_likelihood || 0.5) * 100).toFixed(0)}%
                              </span>
                            </td>
                          );
                        }
                        const w = getEdgeWeight(row, col);
                        return (
                          <td key={col} style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                            {w ? (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: w >= 0.9 ? '#ef444418' : w >= 0.8 ? '#f9731618' : '#3b82f618',
                                  color: w >= 0.9 ? '#ef4444' : w >= 0.8 ? '#f97316' : '#3b82f6',
                                }}
                              >
                                {(w * 100).toFixed(0)}%
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
