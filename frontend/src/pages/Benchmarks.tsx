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
  LabelList,
} from 'recharts';
import { Loader2 } from 'lucide-react';

const CHART_THEME = {
  throughputBar: '#047857',
  ttftBar: '#b45309',
  totalBar: '#475569',
  grid: '#f1f5f9',
  axisStroke: '#cbd5e1',
  axisTick: '#475569',
  axisTickSecondary: '#475569',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
  labelDark: '#0f172a',
  labelMuted: '#475569',
};

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

  const [formError, setFormError] = useState<string | null>(null);

  // Review modal state — one plain rating mapped to the 0–2 rubric behind the scenes
  const [reviewTrial, setReviewTrial] = useState<TrialItem | null>(null);
  const [rating, setRating] = useState<'good' | 'partly' | 'wrong'>('good');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isSavingReview, setIsSavingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const ratingLabel: Record<'good' | 'partly' | 'wrong', string> = {
    good: 'Good',
    partly: 'Partly',
    wrong: 'Wrong',
  };

  const reviewsByTrial = React.useMemo(() => {
    const map = new Map<string, 'good' | 'partly' | 'wrong'>();
    for (const r of activeBenchmark?.reviews ?? []) {
      if (!map.has(r.trial_id)) {
        map.set(
          r.trial_id,
          r.groundedness >= 2 && r.usefulness >= 2
            ? 'good'
            : r.groundedness <= 0 && r.usefulness <= 0
              ? 'wrong'
              : 'partly'
        );
      }
    }
    return map;
  }, [activeBenchmark]);

  const openReview = (trial: TrialItem) => {
    const existing = (activeBenchmark?.reviews ?? []).find((r) => r.trial_id === trial.id);
    setRating(
      !existing
        ? 'good'
        : existing.groundedness >= 2 && existing.usefulness >= 2
          ? 'good'
          : existing.groundedness <= 0 && existing.usefulness <= 0
            ? 'wrong'
            : 'partly'
    );
    setReviewNotes(existing?.notes ?? '');
    setReviewError(null);
    setReviewTrial(trial);
  };

  const handleSaveReview = async () => {
    if (!reviewTrial) return;
    setIsSavingReview(true);
    setReviewError(null);
    // Map the plain rating onto the 0–2 groundedness/usefulness rubric.
    const score = rating === 'good' ? 2 : rating === 'partly' ? 1 : 0;
    try {
      const saved = await api.saveTrialReview(reviewTrial.id, {
        groundedness: score,
        usefulness: score,
        notes: reviewNotes.trim() ? reviewNotes.trim() : undefined,
      });
      setActiveBenchmark((prev) =>
        prev
          ? {
              ...prev,
              reviews: [
                saved,
                ...(prev.reviews ?? []).filter((r) => r.trial_id !== saved.trial_id),
              ],
            }
          : prev
      );
      setReviewTrial(null);
    } catch (err: any) {
      setReviewError(err.message || 'Failed to save review');
    } finally {
      setIsSavingReview(false);
    }
  };

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

  const launchBenchmark = async (params: {
    suiteId: string;
    modelNames: string[];
    mode: 'fixed_context' | 'end_to_end';
    tempType: 'warm' | 'cold';
    reps: number;
    topKValue: number;
  }) => {
    const created = await api.startBenchmark({
      name: `${params.suiteId} (${params.tempType}) [${params.modelNames.join(', ')}]`,
      suite_id: params.suiteId,
      mode: params.mode,
      temperature_type: params.tempType,
      models: params.modelNames,
      repetitions: params.reps,
      top_k: params.topKValue,
    });

    const updatedList = await api.listBenchmarks();
    setBenchmarks(updatedList);
    loadBenchmarkDetail(created.id);
  };

  const handleStartBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (selectedModels.length === 0) {
      setFormError('Please select at least one model to benchmark.');
      return;
    }

    setIsStarting(true);
    try {
      await launchBenchmark({
        suiteId: selectedSuite,
        modelNames: selectedModels,
        mode,
        tempType,
        reps: repetitions,
        topKValue: topK,
      });
    } catch (err: any) {
      setFormError(err.message || 'Failed to start benchmark');
    } finally {
      setIsStarting(false);
    }
  };

  // One click, sensible defaults: standard question set, every model, warmed up.
  const handleQuickCompare = async () => {
    setFormError(null);
    if (models.length === 0) {
      setFormError('No AI models found on this computer yet.');
      return;
    }
    const suiteId =
      suites.find((s) => s.id === 'acceptance_20')?.id ?? suites[0]?.id ?? selectedSuite;
    const modelNames = models.slice(0, 2).map((m) => m.name);
    setIsStarting(true);
    try {
      setSelectedSuite(suiteId);
      setSelectedModels(modelNames);
      await launchBenchmark({
        suiteId,
        modelNames,
        mode: 'fixed_context',
        tempType: 'warm',
        reps: 1,
        topKValue: 5,
      });
    } catch (err: any) {
      setFormError(err.message || 'Failed to start benchmark');
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel running benchmark?')) return;
    setFormError(null);
    try {
      await api.cancelBenchmark(id);
      loadBenchmarkDetail(id);
    } catch (err: any) {
      setFormError(err.message || 'Cancel failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this benchmark run and its raw trials?')) return;
    setFormError(null);
    try {
      await api.deleteBenchmark(id);
      const updatedList = await api.listBenchmarks();
      setBenchmarks(updatedList);
      if (activeBenchmark?.id === id) {
        setActiveBenchmark(updatedList.length > 0 ? await api.getBenchmark(updatedList[0].id) : null);
      }
    } catch (err: any) {
      setFormError(err.message || 'Delete failed');
    }
  };

  // Present the existing aggregate data in one comparison view.
  const comparisonChartData = activeBenchmark
    ? Object.entries(activeBenchmark.aggregated_metrics).map(([model, metrics]) => ({
        model,
        throughput: metrics.tokens_per_second.mean || 0,
        ttft: metrics.ttft_ms.mean || 0,
        total: metrics.total_duration_ms.mean || 0,
      }))
    : [];

  // Round to 2 decimals for KPI display
  const r2 = (n: number | null | undefined) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

  // Derive KPI highlights from the aggregated metrics of the active benchmark
  const metricRows = activeBenchmark ? Object.entries(activeBenchmark.aggregated_metrics) : [];

  const bestThroughput = metricRows.reduce<{ model: string; value: number } | null>(
    (best, [model, m]) => {
      const value = m.tokens_per_second.mean || 0;
      return !best || value > best.value ? { model, value } : best;
    },
    null
  );

  const fastestTtft = metricRows.reduce<{ model: string; value: number } | null>(
    (best, [model, m]) => {
      const value = m.ttft_ms.mean || 0;
      return !best || value < best.value ? { model, value } : best;
    },
    null
  );

  const fastestTotalDuration = metricRows.reduce<{ model: string; value: number } | null>(
    (best, [model, m]) => {
      const value = m.total_duration_ms.mean || 0;
      return !best || value < best.value ? { model, value } : best;
    },
    null
  );


  const latestBenchmark = benchmarks[0] ?? null;

  // Shared, intentionally quiet visual primitives for the benchmark workspace.
  const SURFACE = 'bg-white border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(15,23,42,0.06)]';
  const FIELD =
    'h-11 min-h-11 w-full bg-white border border-slate-300 rounded-xl px-3 text-slate-900 text-sm focus:outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50';

  return (
    <div className="benchmarks-page w-full text-slate-900 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[32px] sm:text-[36px] font-bold leading-[1.15] tracking-[-0.03em] text-slate-900">
            Benchmark
          </h1>
          <p className="mt-2 max-w-3xl text-base leading-6 text-slate-600">
            Find out which AI model answers best on this computer.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="self-start inline-flex items-center justify-center h-11 min-h-11 px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Refresh data
        </button>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <section className={`${SURFACE} p-5 sm:p-6 xl:col-span-5`} aria-labelledby="run-benchmark-heading">
          <div>
            <h2 id="run-benchmark-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">
              Run Benchmark
            </h2>
            <p className="mt-1 text-sm text-slate-600">Configure and start a new evaluation.</p>
          </div>

          <form onSubmit={handleStartBenchmark} className="mt-5 space-y-5">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-semibold text-emerald-900">Not sure what to pick? Start here.</p>
              <p className="mt-0.5 text-sm text-emerald-800">Runs the standard question set on your models, warmed up — about a minute.</p>
              <button
                type="button"
                onClick={handleQuickCompare}
                disabled={isStarting || models.length === 0}
                className="mt-3 flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                {isStarting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isStarting ? 'Launching…' : 'Quick compare'}
              </button>
            </div>

            <div>
              <label htmlFor="benchmark-question-suite" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Question set
              </label>
              <select
                id="benchmark-question-suite"
                value={selectedSuite}
                onChange={(e) => setSelectedSuite(e.target.value)}
                className={`${FIELD} cursor-pointer`}
              >
                {suites.map((suite) => (
                  <option key={suite.id} value={suite.id}>
                    {suite.name} ({suite.questions.length} questions)
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-slate-700">Models to compare</legend>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-300 p-2">
                {models.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-slate-600">No AI models found on this computer</p>
                ) : (
                  models.map((model) => {
                    const checked = selectedModels.includes(model.name);
                    return (
                      <label
                        key={model.name}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 min-h-11 text-sm transition-colors focus-within:ring-2 focus-within:ring-emerald-600 ${
                          checked ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleModelToggle(model.name)}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-emerald-700"
                        />
                        <span className="truncate font-medium">{model.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </fieldset>

            <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded">
                Advanced settings
              </summary>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4">
              <div>
                <label htmlFor="benchmark-context-mode" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  How answers are built
                </label>
                <select
                  id="benchmark-context-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'fixed_context' | 'end_to_end')}
                  className={`${FIELD} cursor-pointer`}
                >
                  <option value="fixed_context">Same cheat sheet (fairer)</option>
                  <option value="end_to_end">Each finds its own (realistic)</option>
                </select>
              </div>
              <div>
                <label htmlFor="benchmark-temperature-type" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Starting state
                </label>
                <select
                  id="benchmark-temperature-type"
                  value={tempType}
                  onChange={(e) => setTempType(e.target.value as 'warm' | 'cold')}
                  className={`${FIELD} cursor-pointer`}
                >
                  <option value="warm">Warmed up (normal use)</option>
                  <option value="cold">From cold start (first question of the day)</option>
                </select>
              </div>
              <div>
                <label htmlFor="benchmark-repetitions" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Repeat each question
                </label>
                <input
                  id="benchmark-repetitions"
                  type="number"
                  min={1}
                  max={5}
                  value={repetitions}
                  onChange={(e) => setRepetitions(Number(e.target.value))}
                  aria-describedby="reps-hint"
                  className={FIELD}
                />
                <p id="reps-hint" className="mt-1 text-xs text-slate-600">1–5 scored tries per question (warm-up not counted).</p>
              </div>
              <div>
                <label htmlFor="benchmark-top-k" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Manual excerpts per question
                </label>
                <input
                  id="benchmark-top-k"
                  type="number"
                  min={1}
                  max={10}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  aria-describedby="topk-hint"
                  className={FIELD}
                />
                <p id="topk-hint" className="mt-1 text-xs text-slate-600">How many manual passages each answer may use.</p>
              </div>
              </div>
            </details>

            {formError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={isStarting || selectedModels.length === 0}
              className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              {isStarting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isStarting ? 'Launching…' : 'Launch custom run'}
            </button>
          </form>
        </section>

        <section className={`${SURFACE} min-w-0 overflow-hidden xl:col-span-7`} aria-labelledby="latest-run-heading">
          <div className="flex items-start justify-between gap-4 px-5 py-5">
            <div>
              <h2 id="latest-run-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">Latest Run</h2>
              <p className="mt-1 text-sm text-slate-600">Most recent benchmark and result status.</p>
            </div>
            <span className="pt-1 text-sm text-slate-600 tabular-nums">
              {benchmarks.length} {benchmarks.length === 1 ? 'run' : 'runs'}
            </span>
          </div>

          {latestBenchmark ? (
            <div className="border-t border-slate-200 px-5 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => loadBenchmarkDetail(latestBenchmark.id)}
                    className="max-w-full truncate text-left text-[15px] font-semibold text-slate-900 hover:text-emerald-800 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
                    title={`Open run ${latestBenchmark.name}`}
                  >
                    {latestBenchmark.name}
                  </button>
                  <p className="mt-2 text-sm text-slate-600">{latestBenchmark.models.join(' vs ')}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {latestBenchmark.suite_id} · {latestBenchmark.mode.replaceAll('_', ' ')} · {latestBenchmark.temperature_type}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className={`text-sm font-semibold capitalize ${latestBenchmark.status === 'completed' ? 'text-emerald-800' : latestBenchmark.status === 'failed' ? 'text-rose-700' : 'text-slate-700'}`}>
                    {latestBenchmark.status === 'running' && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {latestBenchmark.status}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-slate-600">{new Date(latestBenchmark.created_at).toLocaleString()}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {activeBenchmark?.id === latestBenchmark.id
                      ? `${activeBenchmark.resource_samples_count} speed readings`
                      : `${latestBenchmark.models.length} ${latestBenchmark.models.length === 1 ? 'model' : 'models'}`}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                {latestBenchmark.status === 'running' && (
                  <button type="button" onClick={() => handleCancel(latestBenchmark.id)} className="inline-flex items-center justify-center h-11 min-h-11 px-4 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    Cancel run
                  </button>
                )}
                <button type="button" onClick={() => handleDelete(latestBenchmark.id)} className="inline-flex items-center justify-center h-11 min-h-11 px-4 rounded-xl text-sm font-semibold text-rose-700 hover:bg-rose-50 hover:text-rose-800 border border-transparent hover:border-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">
                  Delete run
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-200 px-5 py-10">
              <p className="text-sm font-semibold text-slate-900">No benchmark runs yet</p>
              <p className="mt-1 text-sm text-slate-600">Configure a suite and models, then launch your first run.</p>
            </div>
          )}

          {benchmarks.length > 0 && (
            <details className="border-t border-slate-200">
              <summary className="flex cursor-pointer list-none items-center justify-between min-h-11 px-5 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
                <span>View all runs</span>
                <span className="font-normal text-xs text-slate-600 tabular-nums">{benchmarks.length} total</span>
              </summary>
            <div className="max-h-72 overflow-y-auto border-t border-slate-200 px-5">
              {benchmarks.map((b) => {
                const isSelected = activeBenchmark?.id === b.id;
                return (
                  <div
                    key={b.id}
                    aria-current={isSelected ? 'true' : undefined}
                    className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => loadBenchmarkDetail(b.id)}
                        className={`block max-w-full truncate text-left text-sm font-semibold hover:text-emerald-800 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded ${isSelected ? 'text-emerald-800' : 'text-slate-900'}`}
                        title={`Open run ${b.name}`}
                      >
                        {b.name}
                      </button>
                      <p className="text-xs text-slate-600 mt-1 truncate">
                        Suite: {b.suite_id} • Mode: {b.mode} • Profile: {b.temperature_type}
                      </p>
                      <p className="text-xs text-slate-600 truncate">Models: {b.models.join(', ')}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3 sm:ml-auto">
                      {b.status === 'completed' && (
                        <span className="text-xs font-semibold text-emerald-800">Completed</span>
                      )}
                      {b.status === 'running' && (
                        <span className="text-xs font-semibold text-slate-700">
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" /> Running
                        </span>
                      )}
                      {b.status === 'queued' && (
                        <span className="text-xs font-medium text-slate-600">Queued</span>
                      )}
                      {b.status === 'cancelled' && (
                        <span className="text-xs font-medium text-slate-600">Cancelled</span>
                      )}
                      {b.status === 'failed' && (
                        <span className="text-xs font-semibold text-rose-700">Failed</span>
                      )}

                      <div className="hidden md:block text-right">
                        <p className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                          {new Date(b.created_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-600 whitespace-nowrap">
                          {isSelected && activeBenchmark
                            ? `${activeBenchmark.resource_samples_count} speed readings`
                            : `${b.models.length} ${b.models.length === 1 ? 'model' : 'models'}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {b.status === 'running' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(b.id);
                            }}
                            className="inline-flex items-center justify-center min-h-10 px-3 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(b.id);
                          }}
                          className="inline-flex items-center justify-center min-h-10 px-3 py-2 text-sm font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                          title="Delete run"
                          aria-label={`Delete run ${b.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </details>
          )}
        </section>
      </div>

      {activeBenchmark && (
        <section className="mt-8" aria-labelledby="key-results-heading">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="key-results-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">Key Results</h2>
              <p className="mt-1 text-sm text-slate-600">
                {bestThroughput && fastestTtft && bestThroughput.model === fastestTtft.model
                  ? `${bestThroughput.model} wins on both writing speed and responsiveness.`
                  : bestThroughput && fastestTtft
                    ? `Fastest writer: ${bestThroughput.model}. Quickest to start answering: ${fastestTtft.model}.`
                    : `Best result across ${activeBenchmark.models.length} ${activeBenchmark.models.length === 1 ? 'model' : 'models'}.`}
              </p>
            </div>
            <p className="text-xs text-slate-600 tabular-nums">
              {activeBenchmark.name} · {activeBenchmark.resource_samples_count} speed readings
            </p>
          </div>

          <div className={`${SURFACE} mt-4 grid grid-cols-1 overflow-hidden sm:grid-cols-12`}>
            {/* Primary Hero Metric: Generation Throughput */}
            <div className="border-b border-slate-200 p-5 sm:p-6 sm:border-b-0 sm:border-r sm:col-span-6 bg-slate-50 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Primary Benchmark KPI</span>
                <h3 className="text-sm font-semibold text-slate-900 mt-1">Generation Throughput</h3>
              </div>
              <div className="my-4">
                <p className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                  {bestThroughput ? `${r2(bestThroughput.value)} t/s` : '—'}
                </p>
              </div>
              <p className="text-sm text-slate-600 font-medium truncate" title={bestThroughput ? `Best · ${bestThroughput.model}` : ''}>
                {bestThroughput ? `Top Performer: ${bestThroughput.model}` : 'No throughput data'}
              </p>
            </div>

            {/* Secondary Metrics: TTFT and Total Duration */}
            <div className="sm:col-span-6 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
              <div className="p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Latency</span>
                  <h4 className="text-sm font-semibold text-slate-900 mt-1">Time to First Token</h4>
                </div>
                <div className="my-3">
                  <p className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {fastestTtft ? `${r2(fastestTtft.value)} ms` : '—'}
                  </p>
                </div>
                <p className="text-sm text-slate-600 truncate">
                  {fastestTtft ? `Fastest · ${fastestTtft.model}` : '—'}
                </p>
              </div>

              <div className="p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Time</span>
                  <h4 className="text-sm font-semibold text-slate-900 mt-1">Total Duration</h4>
                </div>
                <div className="my-3">
                  <p className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {fastestTotalDuration ? `${r2(fastestTotalDuration.value)} ms` : '—'}
                  </p>
                </div>
                <p className="text-sm text-slate-600 truncate">
                  {fastestTotalDuration ? `Fastest · ${fastestTotalDuration.model}` : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-900">
              Speed comparison
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Taller green bar = writes faster. Shorter amber/gray bars = answers sooner. Full numbers are in the table below.
            </p>
            <p className="sr-only">
              Bar chart comparing {comparisonChartData.length} models. {bestThroughput ? `Highest throughput ${bestThroughput.model} at ${r2(bestThroughput.value)} tokens per second.` : ''} {fastestTtft ? `Fastest time to first token ${fastestTtft.model} at ${r2(fastestTtft.value)} milliseconds.` : ''} Full values are in the results table below.
            </p>
            <div className={`${SURFACE} mt-4 overflow-x-auto p-4 sm:p-5`}>
              <div className="h-[320px] min-w-[640px] w-full" role="img" aria-label={`Throughput in tokens per second on left axis, latency in milliseconds on right axis, for ${comparisonChartData.length} models`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonChartData} margin={{ top: 34, right: 12, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
                    <XAxis
                      dataKey="model"
                      tick={{ fontSize: 12, fill: CHART_THEME.axisTick }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_THEME.axisStroke }}
                    />
                    <YAxis
                      yAxisId="throughput"
                      tick={{ fontSize: 12, fill: CHART_THEME.axisTickSecondary }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      label={{ value: 't/s', position: 'top', offset: 12, fontSize: 11, fill: CHART_THEME.axisTickSecondary }}
                    />
                    <YAxis
                      yAxisId="latency"
                      orientation="right"
                      tick={{ fontSize: 12, fill: CHART_THEME.axisTickSecondary }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      label={{ value: 'ms', position: 'top', offset: 12, fontSize: 11, fill: CHART_THEME.axisTickSecondary }}
                    />
                    <Tooltip
                      cursor={{ fill: CHART_THEME.grid }}
                      contentStyle={{
                        backgroundColor: CHART_THEME.tooltipBg,
                        borderColor: CHART_THEME.tooltipBorder,
                        borderRadius: 12,
                        boxShadow: '0 6px 20px rgba(15, 23, 42, 0.08)',
                        fontSize: 13,
                      }}
                    />
                    <Legend verticalAlign="top" align="right" height={36} iconType="square" iconSize={10} wrapperStyle={{ fontSize: 13, color: CHART_THEME.axisTick }} />
                    <Bar yAxisId="throughput" dataKey="throughput" name="Throughput (t/s, higher is better)" fill={CHART_THEME.throughputBar} radius={[4, 4, 0, 0]} maxBarSize={56}>
                      <LabelList dataKey="throughput" position="top" offset={6} style={{ fontSize: 11, fill: CHART_THEME.labelDark, fontWeight: 700 }} />
                    </Bar>
                    <Bar yAxisId="latency" dataKey="ttft" name="TTFT ms (lower is better)" fill={CHART_THEME.ttftBar} radius={[4, 4, 0, 0]} maxBarSize={56}>
                      <LabelList dataKey="ttft" position="top" offset={6} style={{ fontSize: 11, fill: CHART_THEME.labelMuted, fontWeight: 700 }} />
                    </Bar>
                    <Bar yAxisId="latency" dataKey="total" name="Total ms (lower is better)" fill={CHART_THEME.totalBar} radius={[4, 4, 0, 0]} maxBarSize={56}>
                      <LabelList dataKey="total" position="top" offset={6} style={{ fontSize: 11, fill: CHART_THEME.labelDark, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </section>
      )}

      {activeBenchmark && (
        <div>
          <section className="mt-8" aria-labelledby="model-summary-heading">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <h2 id="model-summary-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">Results table</h2>
              <span className="text-xs text-slate-600">Practice runs not counted</span>
            </div>
            <div className={`${SURFACE} mt-4 overflow-x-auto`}>
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap sm:px-5">Model</th>
                    <th className="px-4 py-3 whitespace-nowrap">Answers</th>
                    <th className="px-4 py-3 whitespace-nowrap">Speed (avg / middle)</th>
                    <th className="px-4 py-3 whitespace-nowrap">First words (avg)</th>
                    <th className="px-4 py-3 whitespace-nowrap">Total time (avg)</th>
                    <th className="px-4 py-3 whitespace-nowrap">Finding excerpts (avg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {Object.entries(activeBenchmark.aggregated_metrics).map(([model, m]) => (
                    <tr key={model} className="hover:bg-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap sm:px-5">{model}</td>
                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                        {m.completed_trials} / {m.total_trials}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {m.completed_trials > 0
                          ? `${m.tokens_per_second.mean ?? '—'} / ${m.tokens_per_second.median ?? '—'} t/s`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                        {m.ttft_ms.mean != null ? `${m.ttft_ms.mean} ms` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                        {m.total_duration_ms.mean != null ? `${m.total_duration_ms.mean} ms` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                        {m.retrieval_duration_ms.mean != null ? `${m.retrieval_duration_ms.mean} ms` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <details className={`${SURFACE} mt-8 overflow-hidden`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 min-h-11 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-[15px] font-semibold text-slate-900">View trial details</span>
                <span className="mt-0.5 block text-sm text-slate-600">Every answer, and your ratings</span>
              </span>
              <span className="shrink-0 text-xs text-slate-600 tabular-nums">{activeBenchmark.trials.length} trials</span>
            </summary>
            <section className="border-t border-slate-200" aria-labelledby="trial-evidence-heading">
            <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="trial-evidence-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">Every answer</h2>
              <span className="text-xs text-slate-600" title="Practice runs are labeled W; scored tries are numbered from 1">W = practice run</span>
            </div>
            <div className="max-h-96 overflow-auto border-t border-slate-200">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="py-3 px-4 sm:px-5 whitespace-nowrap">Question</th>
                    <th className="py-3 px-4 whitespace-nowrap">Model</th>
                    <th className="py-3 px-4 whitespace-nowrap">Try</th>
                    <th className="py-3 px-4 whitespace-nowrap">Status</th>
                    <th className="py-3 px-4 whitespace-nowrap">Speed</th>
                    <th className="py-3 px-4 whitespace-nowrap">First words</th>
                    <th className="py-3 px-4 whitespace-nowrap">Answer</th>
                    <th className="py-3 px-4 sm:px-5 text-right whitespace-nowrap">Your rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {activeBenchmark.trials.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-100 transition-colors">
                      <td className="py-3 px-4 sm:px-5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {t.question_id}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{t.model_name}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                        {t.is_warmup ? (
                          <span className="text-slate-500 font-semibold" title="Warm-up trial (discarded from metrics)">W</span>
                        ) : (
                          <span className="text-slate-700 tabular-nums">
                            {t.repetition_index + (activeBenchmark.temperature_type === 'cold' ? 1 : 0)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-sm font-semibold ${t.status === 'completed' ? 'text-emerald-800' : t.status === 'failed' ? 'text-rose-700' : 'text-slate-700'}`}>
                          {t.status === 'completed' ? 'OK' : t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {t.tokens_per_second ? `${t.tokens_per_second} t/s` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {t.ttft_ms ? `${t.ttft_ms} ms` : '—'}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-sm text-slate-600" title={t.answer_text || ''}>
                        {t.answer_text || '—'}
                      </td>
                      <td className="py-3 px-4 sm:px-5 text-right">
                        <button
                          type="button"
                          onClick={() => openReview(t)}
                          className={`inline-flex items-center justify-center min-h-10 px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                            reviewsByTrial.has(t.id)
                              ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                          }`}
                        >
                          {reviewsByTrial.has(t.id)
                            ? ratingLabel[reviewsByTrial.get(t.id)!]
                            : 'Rate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </details>
        </div>
      )}

      {/* Review Modal */}
      {reviewTrial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="manual-review-heading">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <h2 id="manual-review-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">Rate this answer</h2>
              <button
                type="button"
                onClick={() => setReviewTrial(null)}
                aria-label="Close review"
                className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <span aria-hidden="true" className="text-xl leading-none font-bold">×</span>
              </button>
            </div>

            <div className="text-sm text-slate-600 space-y-1.5">
              <div>
                <span className="text-slate-900 font-semibold">Question (<span className="font-mono text-xs font-bold">{reviewTrial.question_id}</span>):</span>{' '}
                {reviewTrial.question_text}
              </div>
              <div>
                <span className="text-slate-900 font-semibold">Model:</span> <span className="font-medium text-slate-700">{reviewTrial.model_name}</span>
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm leading-relaxed text-slate-700 select-text">
              {reviewTrial.answer_text || 'No answer recorded'}
            </div>

            {/* Plain rating: Good / Partly / Wrong (stored as 2/1/0 behind the scenes) */}
            <div>
              <span id="review-rating-label" className="block text-slate-700 text-sm font-semibold mb-1.5">How was this answer?</span>
              <div role="group" aria-labelledby="review-rating-label" className="grid grid-cols-3 gap-2">
                {(['good', 'partly', 'wrong'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRating(option)}
                    aria-pressed={rating === option}
                    title={
                      option === 'good'
                        ? 'Correct and backed by the manual'
                        : option === 'partly'
                          ? 'Partly right, or missing proof'
                          : 'Wrong, made up, or refused a fair question'
                    }
                    className={`inline-flex h-11 min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      rating === option
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {ratingLabel[option]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Good = correct and backed by the manual. Partly = partly right or missing proof. Wrong = made up or dodged a fair question.
              </p>
            </div>

            <div>
              <label htmlFor="review-notes" className="block text-slate-700 text-sm font-semibold mb-1.5">
                Note <span className="font-normal font-mono text-xs text-slate-600 tabular-nums">({reviewNotes.length}/2000, optional)</span>
              </label>
              <textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                maxLength={2000}
                placeholder="Anything worth remembering about this answer…"
                className={`${FIELD} h-20 resize-none placeholder:text-slate-500`}
              />
            </div>

            {reviewError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {reviewError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setReviewTrial(null)}
                disabled={isSavingReview}
                className="inline-flex items-center justify-center h-11 min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={isSavingReview}
                className="inline-flex items-center justify-center h-11 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50 disabled:hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                {isSavingReview ? 'Saving…' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
