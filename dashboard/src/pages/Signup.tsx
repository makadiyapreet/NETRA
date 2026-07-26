import { useState, FormEvent } from 'react';
import AuthLayout from '../components/AuthLayout';

interface SignupProps {
  onSignupSuccess: () => void;
  onSwitchToLogin: () => void;
}

const AGENCIES = [
  'Ahmedabad Crime Branch',
  'Surat Cyber Cell',
  'Anti-Terrorism Squad (ATS)',
  'State Intelligence Bureau (SIB)',
  'National Investigation Agency (NIA)',
  'Central Bureau of Investigation (CBI)',
  'Other',
];

function getPasswordStrength(pw: string): { label: string; level: number; color: string } {
  if (!pw) return { label: '', level: 0, color: 'transparent' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { label: 'WEAK', level: 1, color: '#ff3b5c' };
  if (score <= 3) return { label: 'MODERATE', level: 2, color: '#f59e0b' };
  return { label: 'STRONG', level: 3, color: '#00ff88' };
}

import { useTheme } from '../ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function Signup({ onSignupSuccess, onSwitchToLogin }: SignupProps) {
  const { theme, toggleTheme } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [agency, setAgency] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'creating' | 'provisioning'>('idle');

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('[ERR] Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('[ERR] Password must be at least 8 characters');
      return;
    }
    if (!termsAccepted) {
      setError('[ERR] You must acknowledge the terms of use');
      return;
    }

    setLoading(true);
    setPhase('creating');
    await new Promise((r) => setTimeout(r, 600));
    setPhase('provisioning');

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: fullName,
          agency,
          role: 'Analyst', // Default role for self-registration
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`[ERR] ${data.error || 'Registration failed'}`);
        setPhase('idle');
        return;
      }

      // Success
      await new Promise((r) => setTimeout(r, 400));
      onSignupSuccess();
    } catch {
      setError('[ERR] Network failure — API Gateway unreachable');
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
        {loading && (
          <div className="auth-phase-indicator">
            <div className="auth-phase-spinner" />
            <span>
              {phase === 'creating' && 'CREATING SECURE ACCOUNT...'}
              {phase === 'provisioning' && 'PROVISIONING CLEARANCE...'}
            </span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="signup-name" className="auth-label">FULL NAME</label>
          <input
            id="signup-name"
            type="text"
            className="auth-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Inspector R. K. Sharma"
            required
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="signup-email" className="auth-label">OFFICIAL EMAIL</label>
          <input
            id="signup-email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="r.sharma@police.gov.in"
            required
            disabled={loading}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="signup-agency" className="auth-label">AGENCY / JURISDICTION</label>
          <select
            id="signup-agency"
            className="auth-input auth-select"
            value={agency}
            onChange={(e) => setAgency(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Select jurisdiction...</option>
            {AGENCIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="auth-field">
          <label htmlFor="signup-password" className="auth-label">PASSWORD</label>
          <div className="auth-input-wrapper">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              disabled={loading}
              autoComplete="new-password"
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
          {/* Strength Meter */}
          {password && (
            <div className="auth-strength">
              <div className="auth-strength-bar">
                <div
                  className="auth-strength-fill"
                  style={{
                    width: `${(strength.level / 3) * 100}%`,
                    background: strength.color,
                  }}
                />
              </div>
              <span className="auth-strength-label" style={{ color: strength.color }}>
                {strength.label}
              </span>
            </div>
          )}
        </div>

        <div className="auth-field">
          <label htmlFor="signup-confirm" className="auth-label">CONFIRM PASSWORD</label>
          <input
            id="signup-confirm"
            type={showPassword ? 'text' : 'password'}
            className="auth-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            required
            disabled={loading}
            autoComplete="new-password"
          />
          {confirmPassword && password !== confirmPassword && (
            <span className="auth-field-error">[MISMATCH]</span>
          )}
        </div>

        {/* Terms */}
        <label className="auth-terms">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            disabled={loading}
          />
          <span>
            I acknowledge this system is for <strong>official investigative use only</strong> and that all activity is subject to audit.
          </span>
        </label>

        {error && (
          <div className="auth-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="auth-submit-btn"
          disabled={loading || !termsAccepted}
        >
          {loading ? (
            <span className="auth-btn-loading">
              <span className="auth-btn-spinner" />
              PROCESSING
            </span>
          ) : (
            'REQUEST ACCESS'
          )}
        </button>

        <div className="auth-links">
          <button type="button" className="auth-link-btn" onClick={onSwitchToLogin}>
            ← Back to Login
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
