import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, Wifi, WifiOff, AlertTriangle, Database, Server, Key, Shield } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'warning' | 'down' | 'checking';
  port: number;
  description: string;
  latencyMs?: number;
  detail?: string;
}

interface DataModeInfo {
  mode: string;
  total_posts: number;
  real_posts: number;
  synthetic_posts: number;
  has_synthetic: boolean;
  data_label: string;
}

interface KeyInfo {
  key_suffix: string;
  status: 'active' | 'exhausted' | 'invalid';
  exhausted_at: number | null;
}

interface PlatformKeyPool {
  active: number;
  total: number;
  keys: KeyInfo[];
}

interface KeyPoolStatus {
  youtube: PlatformKeyPool;
  twitter: PlatformKeyPool;
  telegram: PlatformKeyPool;
  meta: PlatformKeyPool;
}

// Service definitions (display only — health is fetched from API Gateway)
const SERVICE_DEFS = [
  { name: 'API Gateway', port: 4000, description: 'Node.js Express + Socket.IO REST/WS API', key: 'api_gateway' },
  { name: 'NLP Engine', port: 8000, description: 'FastAPI Zero-Shot LLM Threat Classifier', key: 'nlp_engine' },
  { name: 'Network Service', port: 8001, description: 'FastAPI Bot Detection & Cluster Engine', key: 'network_service' },
  { name: 'Watchlist REST API', port: 8002, description: 'FastAPI PostgreSQL Watchlist Management', key: 'watchlist_api' },
];

// Infrastructure services — only available in Docker/kafka mode
const INFRA_SERVICES = [
  { name: 'Apache Kafka', port: 9092, description: 'Confluent Kafka Streaming Broker' },
  { name: 'Elasticsearch', port: 9200, description: 'Search & Post Indexing Cluster' },
  { name: 'Neo4j Graph DB', port: 7474, description: 'Community Graph & Louvain Detection' },
  { name: 'Redis Cache', port: 6379, description: 'Deduplication & Rate Limit Store' },
  { name: 'PostgreSQL DB', port: 5432, description: 'Watchlist & User Account Store' },
];

const PLATFORM_LABELS: Record<string, { name: string; icon: string }> = {
  youtube: { name: 'YouTube', icon: '📺' },
  twitter: { name: 'Twitter/X', icon: '🐦' },
  telegram: { name: 'Telegram', icon: '✈️' },
  meta: { name: 'Meta (FB/IG)', icon: '📘' },
};

const KEY_STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  exhausted: '#f59e0b',
  invalid: '#ef4444',
};

export default function SystemHealth() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICE_DEFS.map(s => ({ name: s.name, port: s.port, description: s.description, status: 'checking' as const }))
  );
  const [dataMode, setDataMode] = useState<DataModeInfo | null>(null);
  const [keyPoolStatus, setKeyPoolStatus] = useState<KeyPoolStatus | null>(null);
  const [lastCheck, setLastCheck] = useState<string>('');
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);

    try {
      // Fetch health status from the API Gateway's health-metrics endpoint
      // This runs SERVER-SIDE (Node.js → Python services), avoiding CORS issues
      // that occur when the browser tries to directly fetch localhost:8000/8001/8002
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('/api/health-metrics', { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const svcStatuses = data.services || {};

        const results: ServiceStatus[] = SERVICE_DEFS.map(def => {
          const upstream = svcStatuses[def.key];
          if (!upstream) {
            return { name: def.name, port: def.port, description: def.description, status: 'down' as const, detail: 'Not reported by gateway' };
          }

          const isHealthy = upstream.status === 'healthy' || upstream.status === 'ok';
          const isNA = upstream.status === 'not_applicable';

          return {
            name: def.name,
            port: def.port,
            description: def.description,
            status: isNA ? 'healthy' as const : isHealthy ? 'healthy' as const : 'down' as const,
            latencyMs: upstream.latency_ms ?? undefined,
            detail: isHealthy
              ? `${upstream.status}${upstream.latency_ms ? ` (${upstream.latency_ms}ms)` : ''}`
              : upstream.detail || upstream.note || 'Service unreachable',
          };
        });

        setServices(results);

        // Extract performance data for data mode display
        if (data.performance) {
          setDataMode({
            mode: data.mode || 'offline',
            total_posts: data.performance.total_posts_ingested || 0,
            real_posts: data.performance.total_posts_ingested || 0,
            synthetic_posts: 0,
            has_synthetic: false,
            data_label: data.mode === 'kafka' ? 'Live Streaming (Kafka)' : data.mode === 'fixture' ? 'Fixture Data' : 'Live APIs (No Docker)',
          });
        }
      } else {
        // API Gateway itself is down or errored
        setServices(SERVICE_DEFS.map(def => ({
          name: def.name, port: def.port, description: def.description,
          status: def.port === 4000 ? 'down' as const : 'down' as const,
          detail: 'API Gateway returned error',
        })));
      }
    } catch (err) {
      // Can't reach the API Gateway at all
      setServices(SERVICE_DEFS.map(def => ({
        name: def.name, port: def.port, description: def.description,
        status: 'down' as const,
        detail: def.port === 4000 ? 'Connection refused' : 'Cannot check (API Gateway down)',
      })));
    }

    // Also fetch data mode from dedicated endpoint
    try {
      const res = await fetch('/api/health/data-mode');
      if (res.ok) {
        setDataMode(await res.json());
      }
    } catch (_) {}

    // Fetch key pool status
    try {
      const res = await fetch('/api/live/key-status');
      if (res.ok) {
        setKeyPoolStatus(await res.json());
      }
    } catch (_) {}

    setLastCheck(new Date().toLocaleTimeString());
    setChecking(false);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const totalServices = services.length;

  return (
    <div className="system-health-page">
      {/* Summary Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={20} style={{ color: healthyCount === totalServices ? '#22c55e' : '#f59e0b' }} />
            System Health
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {healthyCount}/{totalServices} application services healthy
            {lastCheck && ` · Last checked: ${lastCheck}`}
          </p>
        </div>
        <button
          onClick={checkHealth}
          disabled={checking}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            borderRadius: 6, border: '1px solid var(--border-subtle)',
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
            cursor: checking ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking...' : 'Re-check'}
        </button>
      </div>

      {/* Data Mode Card */}
      {dataMode && (
        <div className="glass-card" style={{
          padding: '14px 20px', marginBottom: 20,
          borderLeft: `4px solid ${dataMode.has_synthetic ? '#f59e0b' : '#22c55e'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Database size={14} style={{ color: dataMode.has_synthetic ? '#f59e0b' : '#22c55e' }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Data Mode: {dataMode.data_label}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 20 }}>
            <span>Mode: <strong>{dataMode.mode}</strong></span>
            <span>Total posts: <strong>{dataMode.total_posts}</strong></span>
            <span>Real: <strong>{dataMode.real_posts}</strong></span>
            {dataMode.synthetic_posts > 0 && (
              <span style={{ color: '#f59e0b' }}>Synthetic: <strong>{dataMode.synthetic_posts}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* API Key Pool Status */}
      {keyPoolStatus && (
        <div className="services-grid" style={{ marginBottom: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={16} />
            API Key Pool Status
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px',
              borderRadius: 4, background: 'rgba(34,197,94,0.1)',
              color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)',
            }}>
              MULTI-KEY ROTATION
            </span>
          </h3>
          <div className="services-list">
            {Object.entries(keyPoolStatus).map(([platform, pool]) => {
              const info = PLATFORM_LABELS[platform] || { name: platform, icon: '🔑' };
              const allExhausted = pool.total > 0 && pool.active === 0;
              const hasIssues = pool.active < pool.total;
              const borderColor = pool.total === 0 ? 'var(--border-subtle)' : allExhausted ? '#ef4444' : hasIssues ? '#f59e0b' : '#22c55e';

              return (
                <div key={platform} className="service-status-card" style={{
                  borderLeft: `3px solid ${borderColor}`,
                }}>
                  <div className="service-status-header" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14, marginRight: 4 }}>{info.icon}</span>
                    <span className="service-name">{info.name}</span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '1px 8px',
                      borderRadius: 10,
                      background: pool.total === 0 ? 'rgba(100,100,100,0.15)' : allExhausted ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                      color: pool.total === 0 ? '#888' : allExhausted ? '#ef4444' : '#22c55e',
                    }}>
                      {pool.total === 0 ? 'No Keys' : `${pool.active}/${pool.total} active`}
                    </span>
                  </div>

                  {pool.keys.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {pool.keys.map((k, idx) => (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 4,
                          background: 'var(--bg-tertiary)',
                          fontSize: 11, fontFamily: 'monospace',
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: KEY_STATUS_COLORS[k.status] || '#888',
                            display: 'inline-block',
                            boxShadow: k.status === 'active' ? '0 0 4px rgba(34,197,94,0.5)' : 'none',
                          }} />
                          <span style={{ color: 'var(--text-secondary)' }}>...{k.key_suffix}</span>
                          <span style={{ color: KEY_STATUS_COLORS[k.status] || '#888', fontSize: 10, fontWeight: 600 }}>
                            {k.status}
                          </span>
                          {k.status === 'exhausted' && k.exhausted_at && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                              ({new Date(k.exhausted_at).toLocaleTimeString()})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {pool.total === 0 && (
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>
                      No API keys configured for this platform
                    </p>
                  )}

                  {allExhausted && pool.total > 0 && (
                    <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0', fontWeight: 600 }}>
                      <AlertTriangle size={10} style={{ display: 'inline', marginRight: 4 }} />
                      All keys exhausted — platform temporarily unavailable
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Application Services — Real Health Checks */}
      <div className="services-grid">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={16} />
          Application Services (Live Health Checks)
        </h3>
        <div className="services-list">
          {services.map((svc) => (
            <div key={svc.name} className="service-status-card" style={{
              borderLeft: `3px solid ${svc.status === 'healthy' ? '#22c55e' : svc.status === 'down' ? '#ef4444' : svc.status === 'warning' ? '#f59e0b' : 'var(--border-subtle)'}`,
            }}>
              <div className="service-status-header">
                <span className={`service-dot ${svc.status === 'checking' ? '' : svc.status}`}></span>
                <span className="service-name">{svc.name}</span>
                <span className="service-port">:{svc.port}</span>
                {svc.latencyMs !== undefined && svc.status === 'healthy' && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {svc.latencyMs}ms
                  </span>
                )}
              </div>
              <p className="service-desc">{svc.description}</p>
              {svc.status === 'down' && (
                <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0', fontWeight: 600 }}>
                  <WifiOff size={10} style={{ display: 'inline', marginRight: 4 }} />
                  {svc.detail || 'Unreachable'}
                </p>
              )}
              {svc.detail && svc.status === 'healthy' && (
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {svc.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure Services — Status depends on MODE */}
      <div className="services-grid" style={{ marginTop: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={16} />
          Infrastructure Services
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px',
            borderRadius: 4, background: 'rgba(245,158,11,0.1)',
            color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)',
          }}>
            {dataMode?.mode === 'kafka' ? 'DOCKER REQUIRED' : 'NOT NEEDED IN OFFLINE MODE'}
          </span>
        </h3>
        <div className="services-list">
          {INFRA_SERVICES.map((svc) => (
            <div key={svc.name} className="service-status-card" style={{
              opacity: dataMode?.mode === 'kafka' ? 1 : 0.5,
              borderLeft: '3px solid var(--border-subtle)',
            }}>
              <div className="service-status-header">
                <span className="service-dot" style={{
                  background: dataMode?.mode === 'kafka' ? '#22c55e' : '#666',
                }}></span>
                <span className="service-name">{svc.name}</span>
                <span className="service-port">:{svc.port}</span>
              </div>
              <p className="service-desc">{svc.description}</p>
              {dataMode?.mode !== 'kafka' && (
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>
                  Not used in {dataMode?.mode || 'offline'} mode — data stored in-memory
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
