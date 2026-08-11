import { useState } from 'react';
import { CheckCircle, AlertTriangle, ExternalLink, Sparkles, Loader } from 'lucide-react';

interface AlertCardProps {
  alert: any;
  role: 'Analyst' | 'Admin';
  onAcknowledge?: (id: string) => void;
  onUnacknowledge?: (id: string) => void;
}

export default function AlertCard({ alert, role, onAcknowledge, onUnacknowledge }: AlertCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function generateSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/ai/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_ids: [alert.post_id || alert.alert_id] }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      } else {
        setSummary('Failed to generate summary — check API connection');
      }
    } catch {
      setSummary('Summary service unavailable');
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className={`glass-card alert-card sev-${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}`} style={{ padding: '20px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div className="alert-header" style={{ marginBottom: '12px', alignItems: 'flex-start', display: 'flex', justifyContent: 'space-between' }}>
        <div className="alert-title" style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} style={{ color: `var(--sev-${alert.severity})` }} />
          {alert.post_url ? (
            <a href={alert.post_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} title="View Original Post">
              {alert.title} <ExternalLink size={12} style={{ display: 'inline', opacity: 0.7 }} />
            </a>
          ) : (
            alert.title
          )}
          <span className={`badge severity-${alert.severity}`} style={{ marginLeft: 12, padding: '4px 10px', fontSize: '11px', letterSpacing: '0.5px' }}>
            SEV-{alert.severity}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {alert.platform && (
            <span style={{ fontSize: 10, padding: '4px 10px', opacity: 0.9, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-xl)', fontWeight: 600, color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              {alert.platform}
            </span>
          )}
          <span className={`badge severity-${alert.severity}`} style={{ fontSize: 10, padding: '4px 10px', opacity: 0.8 }}>
            {alert.type.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      
      {/* Post ID display */}
      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>POST ID:</span>
        <span style={{ fontSize: '12px', fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent-blue)', userSelect: 'all' }}>{alert.post_id}</span>
      </div>

      <p className="alert-description" style={{ fontSize: '14px', marginBottom: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{alert.description}</p>

      {/* AI Summary Section */}
      {summary && (
        <div style={{
          padding: '10px 14px', marginBottom: '12px', borderRadius: '8px',
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
          fontSize: '13px', lineHeight: 1.6, fontStyle: 'italic', color: 'var(--text-primary)',
        }}>
          <span style={{ fontWeight: 600, color: '#10b981', fontSize: 11 }}>
            <Sparkles size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> AI SUMMARY:
          </span>{' '}
          {summary}
        </div>
      )}

      <div className="alert-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', marginTop: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ color: 'var(--text-muted)' }}>{new Date(alert.timestamp).toLocaleString()}</span>
        <div className="flex items-center gap-3">
          {/* Generate Summary button */}
          {!summary && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={generateSummary}
              disabled={summaryLoading}
              style={{ fontSize: '11px', padding: '4px 10px', height: '28px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {summaryLoading ? (
                <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
              ) : (
                <><Sparkles size={12} /> Summary</>
              )}
            </button>
          )}
          {alert.acknowledged ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                <CheckCircle size={15} />
                Acknowledged by {alert.acknowledged_by}
              </span>
              {role === 'Admin' && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--accent-red)', padding: '4px 10px', fontSize: '12px', height: '28px' }}
                  onClick={() => onUnacknowledge?.(alert.alert_id)}
                >
                  Un-Acknowledge
                </button>
              )}
            </div>
          ) : role === 'Admin' ? (
            <button
              className="btn btn-primary btn-sm"
              style={{ padding: '6px 16px', height: '32px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => onAcknowledge?.(alert.alert_id)}
            >
              <CheckCircle size={15} />
              Acknowledge
            </button>
          ) : (
            <span style={{ color: 'var(--accent-amber)', fontSize: 13, fontWeight: 500 }}>Pending review</span>
          )}
        </div>
      </div>
    </div>
  );
}
