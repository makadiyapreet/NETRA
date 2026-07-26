import { useState, FormEvent, useRef } from 'react';
import AuthLayout from '../components/AuthLayout';

interface LoginProps {
  onLogin: (token: string, user: { id: number; email: string; role: 'Admin' | 'Analyst'; displayName: string }) => void;
  onSwitchToSignup: () => void;
}

import { useTheme } from '../ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function Login({ onLogin, onSwitchToSignup }: LoginProps) {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'clearance'>('idle');
  const errorRef = useRef<HTMLDivElement>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (attempts >= 5) {
      setError('[LOCKOUT] Maximum attempts exceeded — contact your administrator');
      return;
    }

    setError('');
    setLoading(true);
    setPhase('verifying');

    // Simulated verification delay for SOC feel
    await new Promise((r) => setTimeout(r, 800));
    setPhase('clearance');

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setError(`[ERR] ${data.error || 'Invalid credentials'} — attempt ${newAttempts}/5`);
        setPhase('idle');
        return;
      }

      // Success — brief "CLEARANCE GRANTED" flash
      await new Promise((r) => setTimeout(r, 400));

      localStorage.setItem('netra-token', data.token);
      localStorage.setItem('netra-user', JSON.stringify(data.user));
      onLogin(data.token, data.user);
    } catch {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setError(`[ERR] Network failure — API Gateway unreachable — attempt ${newAttempts}/5`);
      setPhase('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
        <button 
          type="button"
          onClick={toggleTheme} 
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--text-secondary)', 
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      <form onSubmit={handleSubmit} className="auth-form" autoComplete="off">
        {/* Phase indicator */}
        {loading && (
          <div className="auth-phase-indicator">
            <div className="auth-phase-spinner" />
            <span>
              {phase === 'verifying' && 'AUTHENTICATING CREDENTIALS...'}
              {phase === 'clearance' && 'VERIFYING CLEARANCE LEVEL...'}
            </span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">
            EMAIL / USERNAME
          </label>
          <input
            id="login-email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operator@netra.gov.in"
            required
            autoFocus
            disabled={loading}
            autoComplete="username"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password" className="auth-label">
            PASSWORD
          </label>
          <div className="auth-input-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-eye-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="auth-error" role="alert" aria-live="assertive" ref={errorRef}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="auth-submit-btn"
          disabled={loading || attempts >= 5}
        >
          {loading ? (
            <span className="auth-btn-loading">
              <span className="auth-btn-spinner" />
              PROCESSING
            </span>
          ) : (
            'INITIATE LOGIN'
          )}
        </button>

        <div className="auth-links">
          <button type="button" className="auth-link-btn" onClick={() => {}}>
            Forgot password?
          </button>
          <button type="button" className="auth-link-btn auth-link-signup" onClick={onSwitchToSignup}>
            Request Access →
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
