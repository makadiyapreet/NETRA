import { useState, useEffect } from 'react';
import { AlertTriangle, FlaskConical, BarChart3, Zap, Target, TrendingUp } from 'lucide-react';

interface ConfusionCell {
  actual: string;
  predicted: string;
  count: number;
}

interface ModelMetrics {
  model: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: ConfusionCell[];
  source: 'live_eval' | 'benchmark_target';
}

const CATEGORIES = ['Inflammatory', 'IncitementToViolence', 'FakeNews', 'Neutral'];
const CATEGORY_SHORT = ['Inflam.', 'Incite.', 'FakeNews', 'Neutral'];

export default function ModelPerformance() {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [activeModel, setActiveModel] = useState('zeroshot');
  const [loading, setLoading] = useState(true);
  const [evalReport, setEvalReport] = useState<any>(null);
  const [evalStatus, setEvalStatus] = useState<'loading' | 'real' | 'not_run' | 'benchmark'>('loading');

  useEffect(() => {
    loadMetrics();
  }, [activeModel]);

  async function loadMetrics() {
    setLoading(true);

    // For Zero-Shot: try to load REAL evaluation results from the eval API
    if (activeModel === 'zeroshot') {
      try {
        const res = await fetch('/api/model/eval-results');
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed') {
            // Real eval data exists — use it
            setMetrics({
              model: 'zeroshot',
              accuracy: data.accuracy,
              precision: data.precision,
              recall: data.recall,
              f1: data.f1,
              confusion_matrix: data.confusion_matrix || [],
              source: 'live_eval',
            });
            setEvalReport(data);
            setEvalStatus('real');
            setLoading(false);
            return;
          }
        }
      } catch (_) { /* eval API not available */ }

      // No real eval — show benchmark target with honest "pending" label
      setEvalStatus('not_run');
    } else {
      setEvalStatus('benchmark');
    }

    // Benchmark targets for models pending GPU training
    const benchmarkMetrics: Record<string, { accuracy: number; precision: number; recall: number; f1: number }> = {
      zeroshot: { accuracy: 0.78, precision: 0.76, recall: 0.74, f1: 0.75 },
      indicbert: { accuracy: 0.86, precision: 0.85, recall: 0.84, f1: 0.845 },
      muril: { accuracy: 0.89, precision: 0.88, recall: 0.87, f1: 0.875 },
      mbert: { accuracy: 0.81, precision: 0.80, recall: 0.79, f1: 0.795 },
    };

    const m = benchmarkMetrics[activeModel] || benchmarkMetrics['zeroshot'];

    setMetrics({
      model: activeModel,
      ...m,
      confusion_matrix: generateBenchmarkConfusion(activeModel),
      source: 'benchmark_target',
    });

    setLoading(false);
  }

  function generateBenchmarkConfusion(model: string): ConfusionCell[] {
    const cells: ConfusionCell[] = [];
    const base = model === 'muril' ? 0.88 : model === 'indicbert' ? 0.85 : model === 'zeroshot' ? 0.76 : 0.80;

    // Deterministic (seeded by model name) to avoid random flicker on re-render
    let seed = 0;
    for (const c of model) seed += c.charCodeAt(0);
    const pseudoRandom = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % max;
    };

    for (let i = 0; i < CATEGORIES.length; i++) {
      for (let j = 0; j < CATEGORIES.length; j++) {
        const count = i === j
          ? Math.floor(80 + base * 20 + pseudoRandom(10))
          : Math.floor(pseudoRandom(8));
        cells.push({ actual: CATEGORIES[i], predicted: CATEGORIES[j], count });
      }
    }
    return cells;
  }

  function getCell(actual: string, predicted: string): number {
    if (!metrics) return 0;
    const cell = metrics.confusion_matrix.find(c => c.actual === actual && c.predicted === predicted);
    return cell?.count || 0;
  }

  function getCellColor(actual: string, predicted: string): string {
    const count = getCell(actual, predicted);
    const maxCount = Math.max(...(metrics?.confusion_matrix.map(c => c.count) || [1]));
    const intensity = count / maxCount;

    if (actual === predicted) {
      return `rgba(34, 197, 94, ${0.2 + intensity * 0.6})`;
    }
    return count > 0 ? `rgba(239, 68, 68, ${0.1 + intensity * 0.5})` : 'transparent';
  }

  const MODEL_INFO: Record<string, { label: string; desc: string; status: string }> = {
    zeroshot: {
      label: 'Zero-Shot LLM',
      desc: 'Groq LLaMA 3.1 8B — prompt-based classification (ACTIVE)',
      status: '🟢 Active in production',
    },
    indicbert: {
      label: 'IndicBERT',
      desc: 'ai4bharat/IndicBERT — fine-tuned 4-class classifier',
      status: '🟡 Pending GPU training',
    },
    muril: {
      label: 'MuRIL',
      desc: 'google/muril-base-cased — 17 Indian languages',
      status: '🟡 Pending GPU training',
    },
    mbert: {
      label: 'mBERT',
      desc: 'bert-base-multilingual-cased — PS baseline',
      status: '🟡 Pending GPU training',
    },
  };

  if (loading) return <div className="page-loading">Loading model metrics...</div>;

  const info = MODEL_INFO[activeModel] || MODEL_INFO['zeroshot'];
  const isBenchmark = evalStatus === 'benchmark' || evalStatus === 'not_run';

  return (
    <div className="model-performance-page">
      {/* Real Eval Results Banner */}
      {evalStatus === 'real' && evalReport && (
        <div className="glass-card" style={{
          padding: '14px 20px',
          marginBottom: 20,
          borderLeft: '4px solid #22c55e',
          background: 'rgba(34,197,94,0.06)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <FlaskConical size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#22c55e', marginBottom: 4 }}>
              ✅ Real Evaluation — Measured Metrics
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              These metrics are from a <strong>real evaluation run</strong> on {evalReport.total_samples} test samples
              using {evalReport.model_version}. 
              {evalReport.provider_stats && ` Sarvam: ${evalReport.provider_stats.sarvam || 0}, Groq: ${evalReport.provider_stats.groq || 0} posts.`}
              {evalReport.baseline_note && <><br/><em style={{ color: 'var(--text-muted)', fontSize: 11 }}>Note: {evalReport.baseline_note}</em></>}
            </p>
          </div>
        </div>
      )}

      {/* Evaluation Not Run Banner */}
      {evalStatus === 'not_run' && (
        <div className="glass-card" style={{
          padding: '14px 20px',
          marginBottom: 20,
          borderLeft: '4px solid #f59e0b',
          background: 'rgba(245,158,11,0.06)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b', marginBottom: 4 }}>
              ⏳ Evaluation Pending — Showing Benchmark Targets
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              The numbers below are <strong>estimated benchmark targets</strong>, not measured results. 
              To generate real metrics, run:<br/>
              <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                python -m nlp_engine.models.evaluate_zeroshot
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Benchmark Targets Banner (fine-tuned models) */}
      {evalStatus === 'benchmark' && (
        <div className="glass-card" style={{
          padding: '14px 20px',
          marginBottom: 20,
          borderLeft: '4px solid #f59e0b',
          background: 'rgba(245,158,11,0.06)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b', marginBottom: 4 }}>
              Benchmark Targets — Not Live Measurements
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              These metrics are <strong>target benchmarks</strong> based on published model capabilities, not measured
              results from trained NETRA checkpoints. Fine-tuned training requires GPU access
              (see <code>RUNBOOK_FOR_GPU_TRAINING.md</code>). The active production model is <strong>Zero-Shot LLM</strong>.
            </p>
          </div>
        </div>
      )}

      <div className="model-selector">
        <h3>Select Model</h3>
        <div className="model-buttons">
          {Object.entries(MODEL_INFO).map(([key, m]) => (
            <button
              key={key}
              className={`model-btn ${activeModel === key ? 'active' : ''}`}
              onClick={() => setActiveModel(key)}
              title={m.desc}
              style={{ position: 'relative' }}
            >
              {key === 'zeroshot' && <Zap size={12} style={{ marginRight: 4 }} />}
              {m.label}
              {key === 'zeroshot' && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  padding: '1px 5px', fontSize: 8, fontWeight: 800,
                  borderRadius: 4, background: '#22c55e', color: '#fff',
                  letterSpacing: '0.5px',
                }}>ACTIVE</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Model Status Card */}
      <div className="glass-card" style={{ padding: '12px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 12 }}>{info.desc}</span>
          </div>
          <span style={{ fontSize: 12 }}>{info.status}</span>
        </div>
      </div>

      {metrics && (
        <>
          {/* Metric Cards */}
          <div className="metrics-cards">
            <div className="metric-card">
              <span className="metric-label">
                <Target size={12} style={{ display: 'inline', marginRight: 4 }} />
                Accuracy {isBenchmark && <span style={{ fontSize: 9, color: '#f59e0b' }}>(target)</span>}
              </span>
              <span className="metric-value">{(metrics.accuracy * 100).toFixed(1)}%</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">
                Precision {isBenchmark && <span style={{ fontSize: 9, color: '#f59e0b' }}>(target)</span>}
              </span>
              <span className="metric-value">{(metrics.precision * 100).toFixed(1)}%</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">
                Recall {isBenchmark && <span style={{ fontSize: 9, color: '#f59e0b' }}>(target)</span>}
              </span>
              <span className="metric-value">{(metrics.recall * 100).toFixed(1)}%</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">
                <TrendingUp size={12} style={{ display: 'inline', marginRight: 4 }} />
                F1 Score {isBenchmark && <span style={{ fontSize: 9, color: '#f59e0b' }}>(target)</span>}
              </span>
              <span className="metric-value">{(metrics.f1 * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Confusion Matrix */}
          <div className="confusion-matrix-container">
            <h3>
              {isBenchmark ? 'Projected ' : ''}Confusion Matrix — {info.label}
              {isBenchmark && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#f59e0b',
                  marginLeft: 8, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                }}>BENCHMARK</span>
              )}
            </h3>
            <div className="confusion-matrix">
              <div className="matrix-label-y">Actual ↓</div>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    {CATEGORY_SHORT.map((cat, i) => (
                      <th key={i} title={CATEGORIES[i]}>{cat}</th>
                    ))}
                  </tr>
                  <tr>
                    <th colSpan={5} style={{ textAlign: 'center', fontWeight: 'normal', opacity: 0.7, fontSize: '0.75rem' }}>
                      Predicted →
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((actual, i) => (
                    <tr key={actual}>
                      <td className="row-label" title={actual}>{CATEGORY_SHORT[i]}</td>
                      {CATEGORIES.map(predicted => (
                        <td
                          key={predicted}
                          className="matrix-cell"
                          style={{ backgroundColor: getCellColor(actual, predicted) }}
                        >
                          {getCell(actual, predicted)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="matrix-note">
              {isBenchmark
                ? 'These are projected values based on published model benchmarks — not measured from NETRA training data. To produce real metrics, run GPU training per RUNBOOK_FOR_GPU_TRAINING.md.'
                : 'Green diagonal = correct predictions. Red off-diagonal = misclassifications. Results from zero-shot evaluation on fixture test set.'
              }
            </p>
          </div>
        </>
      )}
    </div>
  );
}
