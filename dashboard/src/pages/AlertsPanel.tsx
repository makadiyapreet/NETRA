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

    return () => {
      socket.disconnect();
    };
  }, []);

  async function fetchAlerts() {
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

      <div ref={scrollRef} style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div className="animate-pulse">Loading alerts...</div>
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            No alerts yet.
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertCard
              key={alert.alert_id}
              alert={alert}
              role={role}
              onAcknowledge={handleAcknowledge}
            />
          ))
        )}
      </div>
    </div>
  );
}
