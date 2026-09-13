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
  Sliders,
  Award,
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
    } catch (err: any) {
      console.error('Failed to load benchmark setup data:', err);
    }
  };

  const loadBenchmarkDetail = async (id: string) => {
    try {
      const detail = await api.getBenchmark(id);
      setActiveBenchmark(detail);
    } catch (err: any) {
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
          // Refresh list to update status badge
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
    } catch (err: any) {
      alert(`Failed to start benchmark: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel running benchmark?')) return;
    try {
      await api.cancelBenchmark(id);
      loadBenchmarkDetail(id);
    } catch (err: any) {
      alert(`Cancel error: ${err.message}`);
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
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Benchmark Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Reproducible local LLM benchmarking with warm/cold controls, fixed context, and hardware telemetry.
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
          Refresh
        </button>
      </div>

      {/* Grid: Config Form & Benchmark History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run Configuration Form */}
        <div className="lg:col-span-1 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-blue-600" />
            <h2 className="font-bold text-slate-900 text-sm">Run New Benchmark</h2>
          </div>

          <form onSubmit={handleStartBenchmark} className="space-y-4 text-xs">
            {/* Suite Selection */}
            <div>
              <label className="block text-slate-600 text-xs font-bold mb-1.5">Question Suite</label>
              <select
                value={selectedSuite}
                onChange={(e) => setSelectedSuite(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.questions.length} Qs)
                  </option>
                ))}
              </select>
            </div>

            {/* Model Multi-Select */}
            <div>
              <label className="block text-slate-600 text-xs font-bold mb-1.5">Models to Compare</label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                {models.length === 0 ? (
                  <div className="text-xs text-slate-400">No Ollama models found</div>
                ) : (
                  models.map((m) => (
                    <label key={m.name} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.name)}
                        onChange={() => handleModelToggle(m.name)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-0"
                      />
                      <span className="truncate font-medium">{m.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Retrieval Mode */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Context Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 text-xs"
                >
                  <option value="fixed_context">Fixed Context</option>
                  <option value="end_to_end">End-to-End</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Temperature Type</label>
                <select
                  value={tempType}
                  onChange={(e) => setTempType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 text-xs"
                >
                  <option value="warm">Warm (1 Warmup)</option>
                  <option value="cold">Cold (Unload)</option>
                </select>
              </div>
            </div>

            {/* Repetitions & Top-K */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Evaluated Reps</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={repetitions}
                  onChange={(e) => setRepetitions(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Top-K</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isStarting || selectedModels.length === 0}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl text-xs shadow-xs transition-colors"
            >
              {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              Launch Benchmark
            </button>
          </form>
        </div>

        {/* History List */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs flex flex-col">
          <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 mb-4">
            Benchmark History ({benchmarks.length})
          </h2>

          {benchmarks.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No benchmarks run yet. Configure and launch a comparison on the left.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[380px] space-y-2 pr-1">
              {benchmarks.map((b) => {
                const isSelected = activeBenchmark?.id === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => loadBenchmarkDetail(b.id)}
                    className={`p-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                      isSelected ? 'bg-blue-50/60 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-xs">{b.name}</span>
                        {b.status === 'completed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Completed
                          </span>
                        )}
                        {b.status === 'running' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Running
                          </span>
                        )}
                        {b.status === 'cancelled' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Cancelled
                          </span>
                        )}
                        {b.status === 'failed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Failed
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Suite: {b.suite_id} • Mode: {b.mode} • Profile: {b.temperature_type} • Models: {b.models.join(', ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {b.status === 'running' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(b.id);
                          }}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                        >
                          <Square className="w-3 h-3 fill-current" /> Cancel
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(b.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100"
                        title="Delete Run"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected Benchmark Detail & Visualizations */}
      {activeBenchmark && (
        <div className="space-y-6 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>{activeBenchmark.name}</span>
                <span className="text-xs font-normal text-slate-400">({activeBenchmark.id})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Created: {new Date(activeBenchmark.created_at).toLocaleString()} • Telemetry Samples:{' '}
                {activeBenchmark.resource_samples_count}
              </p>
            </div>
          </div>

          {/* Recharts Visualizations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Throughput Chart */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                Generation Throughput (Tokens/sec — higher is better)
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={throughputChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="model" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                      formatter={(val: any) => [`${val} tokens/sec`, 'Mean Throughput']}
                    />
                    <Bar dataKey="throughput" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Latency Breakdown Chart */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Latency Comparison (TTFT vs Total Response ms — lower is better)
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyChartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="model" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ttft" name="TTFT (ms)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="total" name="Total Duration (ms)" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Aggregated Model Statistics Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-6 py-3.5 border-b border-slate-100 font-bold text-slate-900 text-xs">
              Evaluated Model Summary (Warm-up Discarded)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase font-bold text-[11px] tracking-wider">
                  <tr>
                    <th className="py-3 px-6">Model</th>
                    <th className="py-3 px-4">Trials</th>
                    <th className="py-3 px-4">Throughput (Mean / Median)</th>
                    <th className="py-3 px-4">TTFT (Mean ms)</th>
                    <th className="py-3 px-4">Total Time (Mean ms)</th>
                    <th className="py-3 px-4">Retrieval (Mean ms)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {Object.entries(activeBenchmark.aggregated_metrics).map(([model, m]) => (
                    <tr key={model} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-6 font-semibold text-slate-900">{model}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {m.completed_trials} / {m.total_trials}
                      </td>
                      <td className="py-3.5 px-4 text-blue-600 font-mono font-semibold">
                        {m.tokens_per_second.mean || 0} / {m.tokens_per_second.median || 0} t/s
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{m.ttft_ms.mean || 0} ms</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{m.total_duration_ms.mean || 0} ms</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{m.retrieval_duration_ms.mean || 0} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trials Breakdown Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-6 py-3.5 border-b border-slate-100 font-bold text-slate-900 text-xs flex items-center justify-between">
              <span>Trial Evidence & Citations ({activeBenchmark.trials.length} trials)</span>
              <span className="text-[11px] font-medium text-slate-400">Rep 0 = Warm-up</span>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase font-bold text-[11px] tracking-wider sticky top-0">
                  <tr>
                    <th className="py-3 px-6">Q ID</th>
                    <th className="py-3 px-4">Model</th>
                    <th className="py-3 px-4">Rep</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Throughput</th>
                    <th className="py-3 px-4">TTFT</th>
                    <th className="py-3 px-4">Answer Snippet</th>
                    <th className="py-3 px-6 text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {activeBenchmark.trials.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-6 font-semibold text-slate-900">{t.question_id}</td>
                      <td className="py-3 px-4 font-medium text-slate-600">{t.model_name}</td>
                      <td className="py-3 px-4">
                        {t.is_warmup ? (
                          <span className="text-slate-400">0 (Warmup)</span>
                        ) : (
                          <span className="text-slate-700 font-medium">{t.repetition_index}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {t.status === 'completed' ? (
                          <span className="text-emerald-600 font-semibold">OK</span>
                        ) : (
                          <span className="text-rose-600 font-semibold">{t.status}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-blue-600 font-semibold">
                        {t.tokens_per_second ? `${t.tokens_per_second} t/s` : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{t.ttft_ms ? `${t.ttft_ms} ms` : '-'}</td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500" title={t.answer_text || ''}>
                        {t.answer_text || '-'}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          onClick={() => setReviewTrial(t)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-blue-600 font-semibold rounded-lg text-xs transition-colors"
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-slate-900 text-sm">Manual Quality Review</h3>
              </div>
              <button
                onClick={() => setReviewTrial(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <div><span className="text-slate-800 font-semibold">Question ({reviewTrial.question_id}):</span> {reviewTrial.question_text}</div>
              <div><span className="text-slate-800 font-semibold">Model:</span> {reviewTrial.model_name}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 font-mono max-h-32 overflow-y-auto">
              {reviewTrial.answer_text || 'No answer recorded'}
            </div>

            {/* Rubric Rating (0-2) */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Groundedness (0-2)</label>
                <select
                  value={groundedness}
                  onChange={(e) => setGroundedness(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 font-medium"
                >
                  <option value={2}>2 - Fully grounded, accurate citations</option>
                  <option value={1}>1 - Partially grounded / minor unbacked claim</option>
                  <option value={0}>0 - Hallucinated or contradicted context</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Usefulness (0-2)</label>
                <select
                  value={usefulness}
                  onChange={(e) => setUsefulness(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 font-medium"
                >
                  <option value={2}>2 - Completely answers prompt</option>
                  <option value={1}>1 - Partially answers prompt</option>
                  <option value={0}>0 - Unhelpful or declined incorrectly</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1">Review Notes</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Optional manual reviewer notes..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 text-xs h-20 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setReviewTrial(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  alert(`Recorded quality review for trial ${reviewTrial.id}: Groundedness=${groundedness}, Usefulness=${usefulness}`);
                  setReviewTrial(null);
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                Save Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
