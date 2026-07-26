import { useState, useEffect, useRef } from 'react';
import AlertCard from '../components/AlertCard';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface AlertsPanelProps {
  role: 'Analyst' | 'Admin';
}

export default function AlertsPanel({ role }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [liveCount, setLiveCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'unack' | 'ack'>('unack');
  const [filters, setFilters] = useState({ severity: '', category: '', platform: '' });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetchAlerts();

    // Connect to WebSocket for live alerts
    const socket = io(window.location.origin, { path: '/socket.io' });
    socketRef.current = socket;

    socket.on('new-alert', (alert: any) => {
      setAlerts((prev) => {
        // Avoid duplicates
        if (prev.find(a => a.alert_id === alert.alert_id)) return prev;
        return [alert, ...prev];
      });
      setLiveCount((c) => c + 1);

      // Audio ping for high severity
      if (soundEnabled && alert.severity >= 4) {
        playAlertSound();
      }

      // Auto-scroll
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    });

    socket.on('alert-acknowledged', ({ alert_id, acknowledged_by }: any) => {
      setAlerts((prev) =>
        prev.map((a) =>
          a.alert_id === alert_id
            ? { ...a, acknowledged: true, acknowledged_by, acknowledged_at: new Date().toISOString() }
            : a
        )
      );
    });

    socket.on('alert-unacknowledged', ({ alert_id }: any) => {
      setAlerts((prev) =>
        prev.map((a) =>
          a.alert_id === alert_id
            ? { ...a, acknowledged: false, acknowledged_by: undefined, acknowledged_at: undefined }
            : a
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAlerts(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAlerts(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(data.data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcknowledge(alertId: string) {
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': role,
          'X-User-Name': 'demo_admin',
        },
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.alert_id === alertId
              ? { ...a, acknowledged: true, acknowledged_by: 'demo_admin', acknowledged_at: new Date().toISOString() }
              : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  async function handleUnacknowledge(alertId: string) {
    try {
      const res = await fetch(`/api/alerts/${alertId}/unacknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': role,
          'X-User-Name': 'demo_admin',
        },
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.alert_id === alertId
              ? { ...a, acknowledged: false, acknowledged_by: undefined, acknowledged_at: undefined }
              : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to unacknowledge alert:', err);
    }
  }

  function playAlertSound() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  const filteredAlerts = alerts
    .filter((a) => (activeTab === 'unack' ? !a.acknowledged : a.acknowledged))
    .filter((a) => !filters.severity || a.severity >= parseInt(filters.severity))
    .filter((a) => !filters.category || a.type === filters.category)
    .filter((a) => !filters.platform || (a.platform && a.platform.toLowerCase() === filters.platform.toLowerCase()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unacknowledged = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Bell size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Alert Center
          </h2>
          <p className="page-subtitle">
            {unacknowledged} unacknowledged · {liveCount} received live
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          {soundEnabled ? 'Sound On' : 'Sound Off'}
        </button>
      </div>

      {/* Filter and Tab Bar */}
      <div className="glass-card" style={{ padding: '12px 18px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', padding: 4, borderRadius: 8 }}>
          <button 
            className={`btn btn-sm ${activeTab === 'unack' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('unack')}
          >
            Unacknowledged
          </button>
          <button 
            className={`btn btn-sm ${activeTab === 'ack' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('ack')}
          >
            Acknowledged
          </button>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border-color)' }} />

        <select className="filter-select" style={{ minWidth: 140 }} value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
          <option value="">All Severities</option>
          <option value="5">Severity 5</option>
          <option value="4">Severity 4+</option>
          <option value="3">Severity 3+</option>
        </select>

        <select className="filter-select" style={{ minWidth: 140 }} value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="">All Categories</option>
          <option value="IncitementToViolence">Incitement To Violence</option>
          <option value="Inflammatory">Inflammatory</option>
          <option value="FakeNews">Fake News</option>
        </select>

        <select className="filter-select" style={{ minWidth: 140 }} value={filters.platform} onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}>
          <option value="">All Platforms</option>
          <option value="Twitter">Twitter / X</option>
          <option value="YouTube">YouTube</option>
          <option value="Instagram">Instagram</option>
          <option value="Facebook">Facebook</option>
        </select>
      </div>

      <div ref={scrollRef} style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div className="animate-pulse">Loading alerts...</div>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            No {activeTab === 'unack' ? 'unacknowledged' : 'acknowledged'} alerts match your filters.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.alert_id}
              alert={alert}
              role={role}
              onAcknowledge={handleAcknowledge}
              onUnacknowledge={handleUnacknowledge}
            />
          ))
        )}
      </div>
    </div>
  );
}
