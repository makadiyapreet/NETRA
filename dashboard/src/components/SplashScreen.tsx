import { useState, useEffect } from 'react';

interface SplashScreenProps {
  mode: 'login' | 'logout';
  onComplete: () => void;
  userName?: string;
}

export default function SplashScreen({ mode, onComplete, userName }: SplashScreenProps) {
  const [phase, setPhase] = useState(0); // 0=enter, 1=text, 2=progress, 3=exit
  const [progressWidth, setProgressWidth] = useState(0);

  const duration = mode === 'login' ? 2800 : 2200;

  useEffect(() => {
    // Phase 1: Show text after initial animation
    const t1 = setTimeout(() => setPhase(1), 300);
    // Phase 2: Start progress bar
    const t2 = setTimeout(() => {
      setPhase(2);
      setProgressWidth(100);
    }, 800);
    // Phase 3: Exit animation
    const t3 = setTimeout(() => setPhase(3), duration - 500);
    // Complete
    const t4 = setTimeout(() => onComplete(), duration);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [duration, onComplete]);

  const loginLines = [
    'AUTHENTICATING CREDENTIALS',
    'ESTABLISHING SECURE CHANNEL',
    'INITIALIZING NETRA SURVEILLANCE',
    `WELCOME, ${(userName || 'OPERATOR').toUpperCase()}`,
  ];

  const logoutLines = [
    'TERMINATING ACTIVE SESSIONS',
    'PURGING LOCAL CACHE',
    'SECURING DATA CHANNELS',
    'SESSION ENDED SECURELY',
  ];

  const lines = mode === 'login' ? loginLines : logoutLines;

  return (
    <div className={`splash-overlay ${phase >= 3 ? 'splash-exit' : ''}`}>
      {/* Background Grid */}
      <div className="splash-grid" />

      {/* Radar sweep */}
      <div className="splash-radar">
        <div className="splash-radar-sweep" />
        <div className="splash-radar-ring splash-radar-ring-1" />
        <div className="splash-radar-ring splash-radar-ring-2" />
        <div className="splash-radar-ring splash-radar-ring-3" />
      </div>

      {/* Particle dots */}
      <div className="splash-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="splash-particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Center Content */}
      <div className={`splash-center ${phase >= 1 ? 'splash-center-visible' : ''}`}>
        {/* NETRA Eye Logo */}
        <div className="splash-logo-container">
          <div className="splash-eye">
            <div className="splash-eye-outer">
              <div className="splash-eye-iris">
                <div className="splash-eye-pupil" />
              </div>
            </div>
            <div className="splash-eye-glow" />
          </div>
          <div className="splash-logo-text">
            <span className="splash-logo-n">N</span>
            <span className="splash-logo-e">E</span>
            <span className="splash-logo-t">T</span>
            <span className="splash-logo-r">R</span>
            <span className="splash-logo-a">A</span>
          </div>
          <div className="splash-tagline">
            {mode === 'login'
              ? 'NATIONAL ELECTRONIC THREAT RECOGNITION & ANALYSIS'
              : 'SECURE SESSION TERMINATION'}
          </div>
        </div>

        {/* Typewriter Lines */}
        <div className={`splash-lines ${phase >= 1 ? 'splash-lines-visible' : ''}`}>
          {lines.map((line, i) => (
            <div
              key={i}
              className="splash-line"
              style={{ animationDelay: `${0.4 + i * 0.4}s` }}
            >
              <span className="splash-line-prefix">{'>'}</span>
              <span className="splash-line-text">{line}</span>
              <span className="splash-line-cursor" style={{ animationDelay: `${0.6 + i * 0.4}s` }}>_</span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className={`splash-progress-container ${phase >= 2 ? 'splash-progress-visible' : ''}`}>
          <div className="splash-progress-track">
            <div
              className="splash-progress-bar"
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <div className="splash-progress-label">
            {mode === 'login' ? 'INITIALIZING DASHBOARD' : 'CLEARING SESSION'}
          </div>
        </div>
      </div>

      {/* Corner decorations */}
      <div className="splash-corner splash-corner-tl" />
      <div className="splash-corner splash-corner-tr" />
      <div className="splash-corner splash-corner-bl" />
      <div className="splash-corner splash-corner-br" />

      {/* Classification banner */}
      <div className="splash-classification">
        {mode === 'login' ? 'CLASSIFIED // AUTHORIZED ACCESS ONLY' : 'SESSION SECURE // DATA PURGED'}
      </div>
    </div>
  );
}
