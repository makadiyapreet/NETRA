import { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      {/* Animated Grid Background */}
      <div className="auth-grid-bg" />
      <div className="auth-scan-line" />

      {/* Top-left secure badge */}
      <div className="auth-secure-badge">
        <span className="auth-badge-dot" />
        NETRA // SECURE ACCESS
      </div>

      {/* Terminal Card with HUD corners */}
      <div className="auth-terminal-card">
        <div className="hud-corner hud-tl" />
        <div className="hud-corner hud-tr" />
        <div className="hud-corner hud-bl" />
        <div className="hud-corner hud-br" />

        {/* Card Header */}
        <div className="auth-card-header">
          <div className="auth-logo-mark">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L4 8v8c0 7.18 5.12 13.9 12 15.4C22.88 29.9 28 23.18 28 16V8L16 2z" 
                    stroke="#00d9ff" strokeWidth="2" fill="rgba(0,217,255,0.08)" />
              <path d="M16 8L10 11v5c0 3.59 2.56 6.95 6 7.7 3.44-.75 6-4.11 6-7.7v-5L16 8z" 
                    fill="#00d9ff" opacity="0.6" />
            </svg>
          </div>
          <div>
            <h1 className="auth-title">NETRA</h1>
            <p className="auth-subtitle">THREAT RECOGNITION ANALYZER</p>
          </div>
        </div>

        <div className="auth-divider" />

        {/* Form content injected here */}
        {children}

        {/* Encrypted connection indicator */}
        <div className="auth-tls-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          CONNECTION ENCRYPTED · TLS 1.3
        </div>
      </div>

      {/* Footer disclaimer */}
      <div className="auth-footer-disclaimer">
        AUTHORIZED PERSONNEL ONLY · ALL ACCESS IS LOGGED AND AUDITED
        <br />
        <span className="auth-footer-sub">
          NATIONAL CYBER THREAT INTELLIGENCE · GOVERNMENT OF INDIA
        </span>
      </div>
    </div>
  );
}
