import { useState, useEffect, useCallback, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Network } from 'lucide-react';

interface ClusterData {
  cluster_id: string;
  label: string;
  accounts: string[];
  coordination_score: number;
  graph_edges: { source: string; target: string; weight: number }[];
}

export default function NetworkView() {
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  const [botScores, setBotScores] = useState<Record<string, any>>({});
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchClusters();
  }, []);

  async function fetchClusters() {
    try {
      const res = await fetch('/api/network/clusters');
      const data = await res.json();
      setClusters(data);
      if (data.length > 0) {
        setSelectedCluster(data[0].cluster_id);
        buildGraph(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch clusters:', err);
    } finally {
      setLoading(false);
    }
  }

  async function buildGraph(cluster: ClusterData) {
    // Fetch bot scores for all accounts in cluster
    const scores: Record<string, any> = {};
    await Promise.all(
      cluster.accounts.map(async (acc) => {
        try {
          const res = await fetch(`/api/network/bot-score/${acc}`);
          scores[acc] = await res.json();
        } catch {}
      })
    );
    setBotScores(scores);

    const nodes = cluster.accounts.map((acc) => ({
      id: acc,
      name: `@${acc}`,
      bot_likelihood: scores[acc]?.bot_likelihood || 0,
      val: 8 + (scores[acc]?.bot_likelihood || 0) * 12,
    }));

    const links = cluster.graph_edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

    setGraphData({ nodes, links });
  }

  function handleClusterChange(clusterId: string) {
    setSelectedCluster(clusterId);
    const cluster = clusters.find((c) => c.cluster_id === clusterId);
    if (cluster) buildGraph(cluster);
  }

  const nodeColor = useCallback((node: any) => {
    const bot = node.bot_likelihood || 0;
    if (bot >= 0.9) return '#ef4444';
    if (bot >= 0.7) return '#f97316';
    if (bot >= 0.5) return '#f59e0b';
    return '#22c55e';
  }, []);

  const cluster = clusters.find((c) => c.cluster_id === selectedCluster);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Network size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Bot Network Analysis
          </h2>
          <p className="page-subtitle">
            {clusters.length} clusters detected · Node color = bot likelihood
          </p>
        </div>
        <select
          className="filter-select"
          value={selectedCluster}
          onChange={(e) => handleClusterChange(e.target.value)}
          style={{ minWidth: 240 }}
        >
          {clusters.map((c) => (
            <option key={c.cluster_id} value={c.cluster_id}>
              {c.label} (Score: {c.coordination_score})
            </option>
          ))}
        </select>
      </div>

      {cluster && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          <div className="glass-card stat-card">
            <div className="stat-card-label">Cluster</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{cluster.label}</div>
          </div>
          <div className="glass-card stat-card">
            <div className="stat-card-label">Accounts</div>
            <div className="stat-card-value">{cluster.accounts.length}</div>
          </div>
          <div className="glass-card stat-card">
            <div className="stat-card-label">Coordination</div>
            <div className="stat-card-value" style={{ color: 'var(--accent-red)' }}>
              {(cluster.coordination_score * 100).toFixed(0)}%
            </div>
          </div>
          <div className="glass-card stat-card">
            <div className="stat-card-label">Edges</div>
            <div className="stat-card-value">{cluster.graph_edges.length}</div>
          </div>
        </div>
      )}

      <div className="graph-container" ref={containerRef}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <div className="animate-pulse">Loading network graph...</div>
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            nodeColor={nodeColor}
            nodeLabel={(node: any) => `${node.name}\nBot: ${(node.bot_likelihood * 100).toFixed(0)}%`}
            linkColor={() => 'rgba(0, 212, 255, 0.2)'}
            linkWidth={(link: any) => link.weight * 3}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const r = node.val || 8;
              const color = nodeColor(node);

              // Glow
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
              ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
              ctx.fill();

              // Node
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = 'rgba(255,255,255,0.2)';
              ctx.lineWidth = 1;
              ctx.stroke();

              // Label
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `${fontSize}px Inter, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = '#e8eaf0';
              ctx.fillText(node.name, node.x, node.y + r + 4);
            }}
            width={containerRef.current?.clientWidth || 800}
            height={550}
            backgroundColor="#0f0f23"
          />
        )}
      </div>

      {/* Bot score details */}
      {Object.keys(botScores).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Account Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {Object.entries(botScores).map(([acc, data]: [string, any]) => (
              <div key={acc} className="glass-card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>@{acc}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Bot Likelihood: <span style={{ color: data.bot_likelihood >= 0.8 ? 'var(--accent-red)' : 'var(--accent-amber)', fontWeight: 600 }}>
                    {(data.bot_likelihood * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.indicators?.map((ind: string) => (
                    <span key={ind} className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontSize: 10 }}>
                      {ind.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
