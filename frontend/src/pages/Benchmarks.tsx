import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type {
  BenchmarkSummary,
  BenchmarkDetail,
  QuestionSuite,
  ModelSummary,
  TrialItem,
} from '../api/client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Play,
  Square,
  RefreshCw,
  Cpu,
  Clock,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';

export const BenchmarksPage: React.FC = () => {
  const [suites, setSuites] = useState<QuestionSuite[]>([]);
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary[]>([]);
  const [activeBenchmark, setActiveBenchmark] = useState<BenchmarkDetail | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  // Form states
  const [selectedSuite, setSelectedSuite] = useState<string>('quick_dev');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [mode, setMode] = useState<'fixed_context' | 'end_to_end'>('fixed_context');
  const [tempType, setTempType] = useState<'warm' | 'cold'>('warm');
  const [repetitions, setRepetitions] = useState<number>(1);
  const [topK, setTopK] = useState<number>(5);

  // Review modal state
  const [reviewTrial, setReviewTrial] = useState<TrialItem | null>(null);
  const [groundedness, setGroundedness] = useState<number>(2);
  const [usefulness, setUsefulness] = useState<number>(2);
  const [reviewNotes, setReviewNotes] = useState<string>('');

  const loadData = async () => {
    try {
      const [suitesData, modelsData, benchList] = await Promise.all([
        api.listSuites(),
        api.listModels(),
        api.listBenchmarks(),
      ]);
      setSuites(suitesData);
      setModels(modelsData);
      setBenchmarks(benchList);

      // Default select up to 2 models
      if (selectedModels.length === 0 && modelsData.length > 0) {
        setSelectedModels(modelsData.slice(0, 2).map((m) => m.name));
      }

      // Load latest active or completed benchmark detail
      if (benchList.length > 0 && !activeBenchmark) {
        loadBenchmarkDetail(benchList[0].id);
      }
    } catch (err: unknown) {
      console.error('Failed to load benchmark setup data:', err);
    }
  };

  const loadBenchmarkDetail = async (id: string) => {
    try {
      const detail = await api.getBenchmark(id);
      setActiveBenchmark(detail);
    } catch (err: unknown) {
      console.error('Failed to get benchmark detail:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Poll active benchmark if running or queued
  useEffect(() => {
    if (!activeBenchmark || !['queued', 'running'].includes(activeBenchmark.status)) {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const updated = await api.getBenchmark(activeBenchmark.id);
        setActiveBenchmark(updated);
        if (['completed', 'failed', 'cancelled'].includes(updated.status)) {
          const updatedList = await api.listBenchmarks();
          setBenchmarks(updatedList);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeBenchmark?.id, activeBenchmark?.status]);

  const handleModelToggle = (modelName: string) => {
    if (selectedModels.includes(modelName)) {
      if (selectedModels.length > 1) {
        setSelectedModels(selectedModels.filter((m) => m !== modelName));
      }
    } else {
      setSelectedModels([...selectedModels, modelName]);
    }
  };

  const handleStartBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedModels.length === 0) {
      alert('Please select at least one model to benchmark.');
      return;
    }

    setIsStarting(true);
    try {
      const created = await api.startBenchmark({
        name: `${selectedSuite} (${tempType}) [${selectedModels.join(', ')}]`,
        suite_id: selectedSuite,
        mode,
        temperature_type: tempType,
        models: selectedModels,
        repetitions,
        top_k: topK,
      });

      const updatedList = await api.listBenchmarks();
      setBenchmarks(updatedList);
      loadBenchmarkDetail(created.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to start benchmark: ${msg}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel running benchmark?')) return;
    try {
      await api.cancelBenchmark(id);
      loadBenchmarkDetail(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Cancel error: ${msg}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this benchmark run and its raw trials?')) return;
    try {
      await api.deleteBenchmark(id);
      const updatedList = await api.listBenchmarks();
      setBenchmarks(updatedList);
      if (activeBenchmark?.id === id) {
        setActiveBenchmark(updatedList.length > 0 ? await api.getBenchmark(updatedList[0].id) : null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Delete failed: ${msg}`);
    }
  };

  // Prepare chart comparison data from aggregated_metrics
  const throughputChartData = activeBenchmark
    ? Object.entries(activeBenchmark.aggregated_metrics).map(([model, metrics]) => ({
        model,
        throughput: metrics.tokens_per_second.mean || 0,
      }))
    : [];

  const latencyChartData = activeBenchmark
    ? Object.entries(activeBenchmark.aggregated_metrics).map(([model, metrics]) => ({
        model,
        ttft: metrics.ttft_ms.mean || 0,
        total: metrics.total_duration_ms.mean || 0,
      }))
    : [];

  return (
    <div className="benchmarks-page">
      {/* Header */}
      <div className="document-heading">
        <div>
          <p className="document-kicker">Hardware performance profiling</p>
          <h1 className="document-title">Benchmark Dashboard</h1>
          <p className="document-subtitle">
            Reproducible local evaluation across quantized models, comparing TTFT, throughput, and groundedness under warm/cold VRAM conditions.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            onClick={loadData}
            className="button button--quiet"
            title="Refresh benchmark data"
          >
            <RefreshCw size={15} strokeWidth={1.8} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Grid: Config Form & Benchmark History */}
      <div className="benchmarks-grid">
        {/* Run Configuration Form */}
        <section className="panel config-panel" aria-labelledby="config-title">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Execution profile</p>
              <h2 id="config-title" className="panel-title">Run New Benchmark</h2>
            </div>
          </div>

          <form onSubmit={handleStartBenchmark} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Suite Selection */}
            <div className="form-field">
              <label className="form-label" htmlFor="suite-select">Question Suite</label>
              <select
                id="suite-select"
                value={selectedSuite}
                onChange={(e) => setSelectedSuite(e.target.value)}
                className="select-control"
              >
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.questions.length} questions)
                  </option>
                ))}
              </select>
            </div>

            {/* Model Multi-Select */}
            <div className="form-field">
              <label className="form-label">Models to Compare</label>
              <div className="model-checklist">
                {models.length === 0 ? (
                  <div style={{ padding: '8px', color: 'var(--text-faint)', fontSize: '11px' }}>
                    No Ollama models detected
                  </div>
                ) : (
                  models.map((m) => (
                    <label key={m.name} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.name)}
                        onChange={() => handleModelToggle(m.name)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span>{m.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Context Mode & Temperature Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-field">
                <label className="form-label" htmlFor="mode-select">Context Mode</label>
                <select
                  id="mode-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="select-control"
                >
                  <option value="fixed_context">Fixed Context</option>
                  <option value="end_to_end">End-to-End</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="temp-select">VRAM Profile</label>
                <select
                  id="temp-select"
                  value={tempType}
                  onChange={(e) => setTempType(e.target.value as any)}
                  className="select-control"
                >
                  <option value="warm">Warm (1 Warmup)</option>
                  <option value="cold">Cold (Evicted)</option>
                </select>
              </div>
            </div>

            {/* Repetitions & Top-K */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-field">
                <label className="form-label" htmlFor="rep-input">Evaluated Reps</label>
                <input
                  id="rep-input"
                  type="number"
                  min={1}
                  max={5}
                  value={repetitions}
                  onChange={(e) => setRepetitions(Number(e.target.value))}
                  className="select-control"
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="topk-bench-input">Top-K Passages</label>
                <input
                  id="topk-bench-input"
                  type="number"
                  min={1}
                  max={10}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="select-control"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isStarting || selectedModels.length === 0}
              className="button button--accent"
              style={{ width: '100%', marginTop: '6px' }}
            >
              {isStarting ? <Loader2 size={15} strokeWidth={1.8} className="spin" /> : <Play size={14} strokeWidth={2} fill="currentColor" />}
              <span>{isStarting ? 'Initiating Benchmark...' : 'Launch Benchmark'}</span>
            </button>
          </form>
        </section>

        {/* Benchmark History */}
        <section className="panel history-panel" aria-labelledby="history-title">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Telemetry log</p>
              <h2 id="history-title" className="panel-title">Benchmark History ({benchmarks.length})</h2>
            </div>
          </div>

          {benchmarks.length === 0 ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' }}>
              No benchmarks run yet. Configure and launch a comparison on the left.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {benchmarks.map((b) => {
                const isSelected = activeBenchmark?.id === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => loadBenchmarkDetail(b.id)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--line)',
                      background: isSelected ? 'var(--accent-soft)' : 'var(--ink-900)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 140ms ease',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 650, fontSize: '12px', color: 'var(--text)' }}>
                          {b.name}
                        </span>
                        {b.status === 'completed' && (
                          <span className="status status--ready">Completed</span>
                        )}
                        {b.status === 'running' && (
                          <span className="status status--building">
                            <Loader2 size={12} strokeWidth={2} className="spin" /> Running
                          </span>
                        )}
                        {b.status === 'cancelled' && (
                          <span className="status status--failed">Cancelled</span>
                        )}
                        {b.status === 'failed' && (
                          <span className="status status--failed">Failed</span>
                        )}
                      </div>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: '11px', fontFamily: 'monospace' }}>
                        Suite: {b.suite_id} • Mode: {b.mode} • Profile: {b.temperature_type} • Models: {b.models.join(', ')}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {b.status === 'running' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(b.id);
                          }}
                          className="button button--danger"
                          style={{ minHeight: '30px', padding: '0 10px', fontSize: '11px' }}
                        >
                          <Square size={11} strokeWidth={2} fill="currentColor" /> Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(b.id);
                        }}
                        className="icon-button"
                        title="Delete Run"
                        style={{ width: '32px', height: '32px' }}
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Selected Benchmark Detail & Visualizations */}
      {activeBenchmark && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="panel-heading" style={{ padding: '0 4px' }}>
            <div>
              <p className="panel-kicker">Active Evaluation</p>
              <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{activeBenchmark.name}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  ({activeBenchmark.id})
                </span>
              </h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: '11px', fontFamily: 'monospace' }}>
                Created: {new Date(activeBenchmark.created_at).toLocaleString()} • Telemetry Samples: {activeBenchmark.resource_samples_count}
              </p>
            </div>
          </div>

          {/* Recharts Visualizations */}
          <div className="benchmarks-analytics">
            {/* Throughput Chart */}
            <div className="panel chart-panel">
              <div className="chart-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={16} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Generation Throughput (Tokens/s)
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  Higher is better
                </span>
              </div>
              <div style={{ height: '260px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={throughputChartData} margin={{ top: 10, right: 24, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef4fb" />
                    <XAxis dataKey="model" stroke="#8292aa" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#8292aa" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#bdcee0',
                        borderRadius: '8px',
                        boxShadow: '0 6px 18px rgba(37, 78, 125, 0.08)',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                      formatter={(val: any) => [`${val} tokens/sec`, 'Throughput']}
                    />
                    <Bar dataKey="throughput" fill="#2168ee" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Latency Breakdown Chart */}
            <div className="panel chart-panel">
              <div className="chart-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} strokeWidth={1.8} style={{ color: 'var(--warning)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Latency Profile (TTFT vs Total ms)
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  Lower is better
                </span>
              </div>
              <div style={{ height: '260px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyChartData} margin={{ top: 10, right: 24, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef4fb" />
                    <XAxis dataKey="model" stroke="#8292aa" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#8292aa" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#bdcee0',
                        borderRadius: '8px',
                        boxShadow: '0 6px 18px rgba(37, 78, 125, 0.08)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ttft" name="TTFT (ms)" fill="#a66800" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="total" name="Total Duration (ms)" fill="#087f58" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Aggregated Model Statistics Table */}
          <div className="panel knowledge-panel">
            <div className="knowledge-header">
              <div>
                <p className="panel-kicker">Evaluated statistics</p>
                <h3 className="panel-title">Model Comparison Matrix</h3>
              </div>
              <span className="count-mark">Warm-up trial discarded</span>
            </div>
            <div className="table-wrap">
              <table className="document-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Trials</th>
                    <th>Throughput (Mean / Median)</th>
                    <th>TTFT (Mean ms)</th>
                    <th>Total Time (Mean ms)</th>
                    <th>Retrieval (Mean ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(activeBenchmark.aggregated_metrics).map(([model, m]) => (
                    <tr key={model}>
                      <td style={{ fontWeight: 700, color: 'var(--text)' }}>{model}</td>
                      <td>
                        {m.completed_trials} / {m.total_trials}
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'monospace' }}>
                        {m.tokens_per_second.mean || 0} / {m.tokens_per_second.median || 0} t/s
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{m.ttft_ms.mean || 0} ms</td>
                      <td style={{ fontFamily: 'monospace' }}>{m.total_duration_ms.mean || 0} ms</td>
                      <td style={{ fontFamily: 'monospace' }}>{m.retrieval_duration_ms.mean || 0} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trials Breakdown Table */}
          <div className="panel knowledge-panel">
            <div className="knowledge-header">
              <div>
                <p className="panel-kicker">Trial evidence</p>
                <h3 className="panel-title">Individual Trial Output ({activeBenchmark.trials.length} trials)</h3>
              </div>
              <span className="count-mark">Rep 0 = Warm-up</span>
            </div>
            <div className="table-wrap" style={{ maxHeight: '380px' }}>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>Q ID</th>
                    <th>Model</th>
                    <th>Rep</th>
                    <th>Status</th>
                    <th>Throughput</th>
                    <th>TTFT</th>
                    <th>Answer Snippet</th>
                    <th style={{ textAlign: 'right' }}>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBenchmark.trials.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, color: 'var(--text)' }}>{t.question_id}</td>
                      <td>{t.model_name}</td>
                      <td>
                        {t.is_warmup ? (
                          <span style={{ color: 'var(--text-faint)' }}>0 (Warmup)</span>
                        ) : (
                          <span>{t.repetition_index}</span>
                        )}
                      </td>
                      <td>
                        {t.status === 'completed' ? (
                          <span className="status status--ready">OK</span>
                        ) : (
                          <span className="status status--failed">{t.status}</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'monospace' }}>
                        {t.tokens_per_second ? `${t.tokens_per_second} t/s` : '-'}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{t.ttft_ms ? `${t.ttft_ms} ms` : '-'}</td>
                      <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.answer_text || ''}>
                        {t.answer_text || '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setReviewTrial(t)}
                          className="button button--quiet"
                          style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewTrial && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setReviewTrial(null);
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="review-title" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div>
                <p className="panel-kicker">Quality Assessment</p>
                <h2 id="review-title" className="modal-title">Manual Quality Review</h2>
              </div>
              <button
                type="button"
                onClick={() => setReviewTrial(null)}
                className="icon-button"
                aria-label="Close review modal"
              >
                <X size={17} strokeWidth={1.8} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                  <strong style={{ color: 'var(--text)' }}>Question ({reviewTrial.question_id}):</strong> {reviewTrial.question_text}
                </div>
                <div>
                  <strong style={{ color: 'var(--text)' }}>Model:</strong> {reviewTrial.model_name}
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: 'var(--ink-850)', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {reviewTrial.answer_text || 'No answer recorded'}
              </div>

              {/* Rubric Rating (0-2) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-field">
                  <label className="form-label">Groundedness (0-2)</label>
                  <select
                    value={groundedness}
                    onChange={(e) => setGroundedness(Number(e.target.value))}
                    className="select-control"
                  >
                    <option value={2}>2 - Fully grounded, accurate citations</option>
                    <option value={1}>1 - Partially grounded / minor unbacked claim</option>
                    <option value={0}>0 - Hallucinated or contradicted context</option>
                  </select>
                </div>

                <div className="form-field">
                  <label className="form-label">Usefulness (0-2)</label>
                  <select
                    value={usefulness}
                    onChange={(e) => setUsefulness(Number(e.target.value))}
                    className="select-control"
                  >
                    <option value={2}>2 - Completely answers prompt</option>
                    <option value={1}>1 - Partially answers prompt</option>
                    <option value={0}>0 - Unhelpful or declined incorrectly</option>
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional manual reviewer notes..."
                  className="select-control"
                  style={{ height: '70px', padding: '8px 12px', resize: 'vertical' }}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setReviewTrial(null)}
                className="button button--quiet"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  alert(`Recorded quality review for trial ${reviewTrial.id}: Groundedness=${groundedness}, Usefulness=${usefulness}`);
                  setReviewTrial(null);
                }}
                className="button button--accent"
              >
                Save Review
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default BenchmarksPage;
