import { useState } from 'react';
import { Network, ScanLine, Loader, AlertTriangle, ShieldAlert, Languages, CheckCircle } from 'lucide-react';
import { useTheme } from '../ThemeContext';

const BHASHINI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'mr', name: 'Marathi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'or', name: 'Odia' },
  { code: 'ur', name: 'Urdu' },
];

export default function AdvancedTools() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  const cardBg = isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)';
  const borderColor = isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)';
  const textPrimary = isDark ? '#e5e7eb' : '#111827';
  const textSecondary = isDark ? '#9ca3af' : '#6b7280';

  // Spread Graph State
  const [postId, setPostId] = useState('');
  const [loadingSpread, setLoadingSpread] = useState(false);
  const [spreadData, setSpreadData] = useState<any>(null);
  const [spreadError, setSpreadError] = useState('');

  // Deepfake State
  const [imageUrl, setImageUrl] = useState('');
  const [loadingDeepfake, setLoadingDeepfake] = useState(false);
  const [deepfakeData, setDeepfakeData] = useState<any>(null);
  const [deepfakeError, setDeepfakeError] = useState('');

  // Bhashini State
  const [bhashiniText, setBhashiniText] = useState('');
  const [bhashiniSrcLang, setBhashiniSrcLang] = useState('en');
  const [bhashiniTgtLang, setBhashiniTgtLang] = useState('hi');
  const [bhashiniMode, setBhashiniMode] = useState<'translate' | 'transliterate'>('translate');
  const [loadingBhashini, setLoadingBhashini] = useState(false);
  const [bhashiniResult, setBhashiniResult] = useState<any>(null);
  const [bhashiniError, setBhashiniError] = useState('');

  async function checkSpread() {
    if (!postId.trim()) return;
    setLoadingSpread(true);
    setSpreadError('');
    setSpreadData(null);
    try {
      const res = await fetch(`/api/network/spread-graph/${postId.trim()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch spread graph');
      }
      setSpreadData(await res.json());
    } catch (err: any) {
      setSpreadError(err.message);
    } finally {
      setLoadingSpread(false);
    }
  }

  async function checkDeepfake() {
    if (!imageUrl.trim()) return;
    setLoadingDeepfake(true);
    setDeepfakeError('');
    setDeepfakeData(null);
    try {
      const res = await fetch('/api/ai/deepfake-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Deepfake service unavailable');
      }
      setDeepfakeData(await res.json());
    } catch (err: any) {
      setDeepfakeError(err.message);
    } finally {
      setLoadingDeepfake(false);
    }
  }

  async function runBhashini() {
    if (!bhashiniText.trim()) return;
    setLoadingBhashini(true);
    setBhashiniError('');
    setBhashiniResult(null);
    try {
      const res = await fetch(`/api/bhashini/${bhashiniMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: bhashiniText.trim(),
          source_language: bhashiniSrcLang,
          target_language: bhashiniTgtLang,
        }),
      });
      const data = await res.json();
      setBhashiniResult(data);
      if (data.error && !data.success) {
        setBhashiniError(data.error);
      }
    } catch (err: any) {
      setBhashiniError(err.message || 'Bhashini service unavailable');
    } finally {
      setLoadingBhashini(false);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: textPrimary, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ScanLine size={28} color="#3b82f6" />
          Advanced Tools
        </h1>
        <p style={{ fontSize: '14px', color: textSecondary, marginTop: '4px' }}>
          Direct access to Bhashini Translation, Viral Spread Graph, and AI Deepfake Detection capabilities.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        
        {/* ═══ Bhashini Translation Tool ═══ */}
        <div style={{
          background: cardBg, border: `1px solid ${borderColor}`, borderRadius: '12px',
          padding: '24px', backdropFilter: 'blur(12px)',
          gridColumn: '1 / -1', // Full width
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: textPrimary, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Languages size={20} color="#f59e0b" />
            Bhashini Government Translator
            <span style={{
              fontSize: '10px', padding: '3px 8px', borderRadius: '4px',
              background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700,
              letterSpacing: '0.5px',
            }}>
              GOV OF INDIA · FREE API
            </span>
          </h3>
          <p style={{ fontSize: '13px', color: textSecondary, marginBottom: '16px', lineHeight: 1.5 }}>
            Translate or transliterate text using India's <strong>National Language Translation Mission</strong> (Bhashini/ULCA) — 
            a free, government-built API by MeitY. Supports 12 Indian languages. This is an independent translation path 
            alongside NETRA's LLM-based classification.
            <br/>
          </p>

          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {(['translate', 'transliterate'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBhashiniMode(mode)}
                style={{
                  padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: `1px solid ${bhashiniMode === mode ? '#f59e0b' : borderColor}`,
                  background: bhashiniMode === mode ? 'rgba(245,158,11,0.12)' : 'transparent',
                  color: bhashiniMode === mode ? '#f59e0b' : textSecondary,
                  transition: 'all 0.15s',
                }}
              >
                {mode === 'translate' ? '🔤 Translate' : '✍️ Transliterate'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'end', marginBottom: '16px' }}>
            {/* Source Language */}
            <div>
              <label style={{ fontSize: '11px', color: textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Source Language
              </label>
              <select
                value={bhashiniSrcLang}
                onChange={(e) => setBhashiniSrcLang(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                  color: textPrimary, outline: 'none', fontSize: '13px',
                }}
              >
                {BHASHINI_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>

            <span style={{ fontSize: '20px', color: textSecondary, paddingBottom: '6px' }}>→</span>

            {/* Target Language */}
            <div>
              <label style={{ fontSize: '11px', color: textSecondary, fontWeight: 600, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Target Language
              </label>
              <select
                value={bhashiniTgtLang}
                onChange={(e) => setBhashiniTgtLang(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                  color: textPrimary, outline: 'none', fontSize: '13px',
                }}
              >
                {BHASHINI_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Input Text */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <textarea
              placeholder={bhashiniMode === 'translate'
                ? 'Enter text to translate (e.g., "The protest was reported in Gujarat")'
                : 'Enter text to transliterate (e.g., "namaste kaise ho")'
              }
              value={bhashiniText}
              onChange={(e) => setBhashiniText(e.target.value)}
              rows={3}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                color: textPrimary, outline: 'none', fontSize: '14px', resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={runBhashini}
              disabled={loadingBhashini || !bhashiniText.trim()}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: loadingBhashini ? 'wait' : 'pointer',
                background: loadingBhashini || !bhashiniText.trim()
                  ? isDark ? '#374151' : '#d1d5db'
                  : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff', fontWeight: 600, fontSize: '14px',
                display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-end',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {loadingBhashini ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Languages size={16} />}
              {bhashiniMode === 'translate' ? 'Translate' : 'Transliterate'}
            </button>
          </div>

          {/* Error */}
          {bhashiniError && (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                {bhashiniError}
                {bhashiniError.includes('credentials') && (
                  <div style={{ marginTop: '4px', fontSize: '11px', color: textSecondary }}>
                    Register at <a href="https://bhashini.gov.in/" target="_blank" rel="noopener noreferrer" style={{ color: '#f59e0b' }}>bhashini.gov.in</a> and
                    add BHASHINI_USER_ID + BHASHINI_API_KEY to your .env file.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {bhashiniResult && (
            <div style={{
              padding: '16px', borderRadius: '8px', marginTop: '8px',
              background: bhashiniResult.success
                ? isDark ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.04)'
                : isDark ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.04)',
              border: `1px solid ${bhashiniResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                {bhashiniResult.success ? (
                  <CheckCircle size={16} color="#10b981" />
                ) : (
                  <AlertTriangle size={16} color="#f59e0b" />
                )}
                <span style={{ fontSize: '13px', fontWeight: 600, color: bhashiniResult.success ? '#10b981' : '#f59e0b' }}>
                  {bhashiniResult.success ? 'Translation Complete' : 'Credentials Required'}
                </span>
                {bhashiniResult.latency_ms > 0 && (
                  <span style={{ fontSize: '11px', color: textSecondary }}>({bhashiniResult.latency_ms}ms)</span>
                )}
                <span style={{ fontSize: '10px', color: textSecondary, marginLeft: 'auto', fontStyle: 'italic' }}>
                  via {bhashiniResult.provider || 'Bhashini'}
                </span>
              </div>

              {bhashiniResult.translated && bhashiniResult.translated !== bhashiniResult.original && (
                <div style={{
                  padding: '12px', borderRadius: '8px', fontSize: '16px', lineHeight: 1.6,
                  background: isDark ? 'rgba(0,0,0,0.2)' : '#fff',
                  color: textPrimary, border: `1px solid ${borderColor}`,
                  fontFamily: 'inherit',
                }}>
                  {bhashiniResult.translated || bhashiniResult.transliterated}
                </div>
              )}

              {bhashiniResult.service_id && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: textSecondary }}>
                  Service: <code style={{ background: isDark ? 'rgba(0,0,0,0.3)' : '#f3f4f6', padding: '1px 6px', borderRadius: '3px' }}>
                    {bhashiniResult.service_id}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ Spread Graph Tool ═══ */}
        <div style={{
          background: cardBg, border: `1px solid ${borderColor}`, borderRadius: '12px',
          padding: '24px', backdropFilter: 'blur(12px)',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: textPrimary, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={20} color="#8b5cf6" />
            Viral Spread Graph Analyzer
          </h3>
          <p style={{ fontSize: '13px', color: textSecondary, marginBottom: '16px', lineHeight: 1.5 }}>
            Visualize the dissemination path of a specific post ID across the network. Highlights super-spreaders and amplification nodes.
            <br/><span style={{ color: '#8b5cf6', fontSize: '12px' }}>Tip: Find Post IDs in the Alert Center cards or Incident Report table.</span>
          </p>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Enter Post ID (e.g. post_1)"
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                color: textPrimary, outline: 'none'
              }}
            />
            <button
              onClick={checkSpread}
              disabled={loadingSpread || !postId.trim()}
              className="btn btn-secondary"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', border: 'none', color: '#fff' }}
            >
              {loadingSpread ? <Loader size={16} className="animate-spin" /> : 'Analyze'}
            </button>
          </div>

          {spreadError && (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} /> {spreadError}
            </div>
          )}

          {spreadData && (
            <div style={{ padding: '16px', background: isDark ? 'rgba(0,0,0,0.2)' : '#f3f4f6', borderRadius: '8px', marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: textPrimary, marginBottom: '12px' }}>Spread Analysis Result</h4>
              <pre style={{ fontSize: '12px', color: textSecondary, overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(spreadData, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* ═══ Deepfake Tool ═══ */}
        <div style={{
          background: cardBg, border: `1px solid ${borderColor}`, borderRadius: '12px',
          padding: '24px', backdropFilter: 'blur(12px)',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: textPrimary, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} color="#10b981" />
            AI Deepfake Detector
          </h3>
          <p style={{ fontSize: '13px', color: textSecondary, marginBottom: '16px', lineHeight: 1.5 }}>
            Scan media URLs using the HuggingFace AI-image-detector pipeline to identify synthetic/manipulated imagery.
          </p>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Enter Image URL"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '8px',
                border: `1px solid ${borderColor}`, background: isDark ? 'rgba(0,0,0,0.3)' : '#f9fafb',
                color: textPrimary, outline: 'none'
              }}
            />
            <button
              onClick={checkDeepfake}
              disabled={loadingDeepfake || !imageUrl.trim()}
              className="btn btn-secondary"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff' }}
            >
              {loadingDeepfake ? <Loader size={16} className="animate-spin" /> : 'Scan Media'}
            </button>
          </div>

          {deepfakeError && (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} /> {deepfakeError}
            </div>
          )}

          {deepfakeData && (
            <div style={{ padding: '16px', background: isDark ? 'rgba(0,0,0,0.2)' : '#f3f4f6', borderRadius: '8px', marginTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: textPrimary, marginBottom: '12px' }}>Detection Result</h4>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                {deepfakeData.confidence === null ? (
                  <span style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239,165,68,0.15)', color: '#f59e0b', fontWeight: 600, fontSize: '13px' }}>
                    Model Offline (Fallback Mode)
                  </span>
                ) : (
                  <>
                    <span style={{ padding: '6px 12px', borderRadius: '6px', background: deepfakeData.is_ai_generated ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: deepfakeData.is_ai_generated ? '#ef4444' : '#10b981', fontWeight: 600, fontSize: '13px' }}>
                      {deepfakeData.is_ai_generated ? 'AI Generated' : 'Authentic'}
                    </span>
                    <span style={{ fontSize: '13px', color: textSecondary }}>
                      Confidence: {(deepfakeData.confidence * 100).toFixed(1)}%
                    </span>
                  </>
                )}
              </div>
              <pre style={{ fontSize: '12px', color: textSecondary, overflowX: 'auto', margin: 0, opacity: 0.7 }}>
                {JSON.stringify(deepfakeData, null, 2)}
              </pre>
            </div>
          )}
        </div>

      </div>

      {/* Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
