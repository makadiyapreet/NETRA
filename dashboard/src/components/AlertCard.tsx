import { CheckCircle, AlertTriangle } from 'lucide-react';

interface AlertCardProps {
  alert: any;
  role: 'Analyst' | 'Admin';
  onAcknowledge?: (id: string) => void;
}

export default function AlertCard({ alert, role, onAcknowledge }: AlertCardProps) {
  return (
    <div className={`glass-card alert-card sev-${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}`}>
      <div className="alert-header">
        <div className="alert-title">
          <AlertTriangle size={16} />
          {alert.title}
          <span className={`badge severity-${alert.severity}`} style={{ marginLeft: 8 }}>
            SEV-{alert.severity}
          </span>
        </div>
        <span className={`badge severity-${alert.severity}`} style={{ fontSize: 10 }}>
          {alert.type.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="alert-description">{alert.description}</p>
      <div className="alert-footer">
        <span>{new Date(alert.timestamp).toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {alert.acknowledged ? (
            <span className="flex items-center gap-2" style={{ color: 'var(--accent-green)' }}>
              <CheckCircle size={14} />
              Acknowledged by {alert.acknowledged_by}
            </span>
          ) : role === 'Admin' ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onAcknowledge?.(alert.alert_id)}
            >
              <CheckCircle size={14} />
              Acknowledge
            </button>
          ) : (
            <span style={{ color: 'var(--accent-amber)', fontSize: 12 }}>Pending review</span>
          )}
        </div>
      </div>
    </div>
  );
}
