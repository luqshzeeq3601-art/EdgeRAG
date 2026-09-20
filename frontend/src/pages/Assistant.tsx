import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { ModelSummary, SourceItem, RAGDonePayload } from '../api/client';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Square,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Database,
  Box,
  MessageCircle,
} from 'lucide-react';

export const AssistantPage: React.FC = () => {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [answerStyle, setAnswerStyle] = useState<'fast' | 'accurate'>('accurate');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [topK, setTopK] = useState<number>(5);
  const [query, setQuery] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Streaming response states
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [answerText, setAnswerText] = useState<string>('');
  const [donePayload, setDonePayload] = useState<RAGDonePayload | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const abortControllerRef = useRef<AbortController | null>(null);

  // Pick a model behind the scenes from the plain-language answer style:
  // Fast = smallest model on this computer, Accurate = most careful one.
  const pickModelForStyle = (available: ModelSummary[], style: 'fast' | 'accurate'): string => {
    if (available.length === 0) return '';
    const bySize = [...available].sort((a, b) => a.size - b.size);
    if (style === 'fast') return bySize[0].name;
    const careful = available.find((m) => m.name.toLowerCase().includes('qwen'));
    return (careful ?? bySize[bySize.length - 1]).name;
  };

  useEffect(() => {
    const loadModels = async () => {
      try {
        const available = await api.listModels();
        setModels(available);
        if (available.length > 0 && !selectedModel) {
          setSelectedModel(pickModelForStyle(available, answerStyle));
        }
      } catch (err: any) {
        console.error('Failed to list models:', err);
      }
    };
    loadModels();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-resolve the backing model whenever the user flips Fast/Accurate.
  useEffect(() => {
    if (models.length > 0 && !isStreaming) {
      setSelectedModel(pickModelForStyle(models, answerStyle));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerStyle, models.length]);

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || !selectedModel || isStreaming) return;

    // Reset state
    setSources([]);
    setAnswerText('');
    setDonePayload(null);
    setStreamError(null);
    setExpandedSources({});
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await api.askRAGStream(
        {
          query: query.trim(),
          model: selectedModel,
          top_k: topK,
        },
        {
          onSources: (incomingSources) => {
            setSources(incomingSources);
          },
          onDelta: (delta) => {
            setAnswerText(prev => prev + delta);
          },
          onDone: (payload) => {
            setDonePayload(payload);
            setIsStreaming(false);
          },
          onError: (err) => {
            setStreamError(err.message);
            setIsStreaming(false);
          },
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStreamError(err.message || 'Stream error occurred');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const toggleSource = (sourceId: string) => {
    setExpandedSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId],
    }));
  };

  return (
    <div className="assistant-page w-full space-y-6">
      <header className="max-w-3xl pb-1">
        <h1 className="text-[32px] sm:text-[36px] font-bold leading-[1.15] tracking-[-0.03em] text-slate-900">
          Ask your manuals
        </h1>
        <p className="mt-2 text-base leading-6 text-slate-600">
          Ask a question in plain words. You'll get an answer quoted from your manuals — or an honest "not in there" instead of a guess.
        </p>
      </header>

      <section
        aria-label="Answer configuration"
        className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:px-5"
      >
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2.5">
            <Box className="h-6 w-6 text-emerald-700" strokeWidth={1.8} aria-hidden="true" />
            <label htmlFor="assistant-style" className="text-sm font-semibold text-slate-900">
              Answer style
            </label>
          </div>
          <select
            id="assistant-style"
            value={answerStyle}
            onChange={(e) => setAnswerStyle(e.target.value as 'fast' | 'accurate')}
            disabled={isStreaming || models.length === 0}
            className="h-11 min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            {models.length === 0 ? (
              <option value="accurate">No AI models found on this computer</option>
            ) : (
              <>
                <option value="accurate">Accurate — careful, sticks to the manual</option>
                <option value="fast">Fast — quicker, good for simple lookups</option>
              </>
            )}
          </select>
        </div>
        {selectedModel && (
          <p className="mt-2 text-xs text-slate-500">
            Using {selectedModel} on this computer — your question never leaves it.
          </p>
        )}

        <details className="mt-3 rounded-lg">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded">
            Advanced settings
          </summary>
          <div className="mt-3 flex min-w-0 items-center gap-3 border-t border-slate-100 pt-3">
            <Database className="h-5 w-5 shrink-0 text-slate-500" strokeWidth={1.8} aria-hidden="true" />
            <label htmlFor="assistant-top-k" className="whitespace-nowrap text-sm font-medium text-slate-700">
              Manual excerpts to check
            </label>
            <select
              id="assistant-top-k"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              disabled={isStreaming}
              className="ml-auto h-11 min-h-11 w-24 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">How many manual passages to read before answering. 5 is fine for most questions.</p>
        </details>
      </section>

      <form
        onSubmit={handleAsk}
        className="assistant-query-form flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-600/20 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center">
          <MessageCircle className="ml-3 h-6 w-6 shrink-0 text-slate-500" strokeWidth={1.8} aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about your manuals, e.g. What is the maximum operating pressure?"
            disabled={isStreaming}
            aria-label="Question"
            className="h-12 min-h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
          />
        </div>
        {isStreaming ? (
          <button
            type="button"
            onClick={handleAbort}
            title="Stop generating response"
            className="inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-7 text-sm font-semibold text-white transition-colors hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 sm:w-auto"
          >
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!query.trim() || !selectedModel}
            className="inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-7 text-sm font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-700 sm:w-auto"
          >
            <Send className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            Ask
          </button>
        )}
      </form>

      {/* Error alert */}
      {streamError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{streamError}</span>
        </div>
      )}

      {/* Response Display Box */}
      {(answerText || isStreaming || donePayload) && (
        <article
          aria-label="Assistant answer"
          aria-live="polite"
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-6"
        >
          {/* Header & Badges */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Box className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
              </div>
              <span className="truncate text-base font-bold text-slate-900">
                {answerStyle === 'fast' ? 'Fast answer' : 'Accurate answer'}
              </span>
              {isStreaming && (
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" aria-hidden="true"></span> Generating response…
                </span>
              )}
            </div>

            {donePayload && (
              <div className="flex shrink-0 items-center">
                {donePayload.abstained ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Not in your manuals — won't guess
                  </span>
                ) : donePayload.citations.is_valid ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    <CheckCircle className="h-4 w-4" aria-hidden="true" /> Backed by {donePayload.citations.cited_sources.length} {donePayload.citations.cited_sources.length === 1 ? 'excerpt' : 'excerpts'}
                  </span>
                ) : (
                  <span
                    title={donePayload.citations.warnings.join(' | ')}
                    className="inline-flex cursor-help items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Please check the sources below
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Markdown Content */}
          <div className="max-w-prose text-base leading-relaxed text-slate-700 [&_a]:font-semibold [&_a]:text-emerald-800 hover:[&_a]:underline [&_li]:my-1.5 [&_ol]:my-3 [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-slate-950 [&_ul]:my-3 [&_ul]:pl-5 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-slate-950 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-900 [&_h3]:mt-2.5 [&_h3]:mb-1 [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 [&_code]:text-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-lg [&_pre]:p-3.5 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:text-inherit [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-600 [&_blockquote]:pl-3.5 [&_blockquote]:italic [&_blockquote]:text-slate-600">
            <ReactMarkdown>{answerText || '…'}</ReactMarkdown>
          </div>

          {/* Citation warnings (only when the validator flags something) */}
          {donePayload && donePayload.citations.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              {donePayload.citations.warnings.map((warning, index) => (
                <span key={index} className="block">{warning}</span>
              ))}
            </div>
          )}

          {/* Speed details, tucked away — most people only need the answer */}
          {donePayload && (
            <details className="border-t border-slate-200 pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded">
                Answered in {donePayload.timings.total_ms} ms · speed details
              </summary>
              <div className="pt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-slate-600 text-xs font-medium uppercase tracking-wide">Finding excerpts</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">{donePayload.timings.retrieval_ms} ms</span>
                </div>
                <div className="flex flex-col gap-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="text-slate-600 text-xs font-medium uppercase tracking-wide">First words</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">{donePayload.timings.first_token_ms} ms</span>
                </div>
                <div className="flex flex-col gap-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="text-slate-600 text-xs font-medium uppercase tracking-wide">Total</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">{donePayload.timings.total_ms} ms</span>
                </div>
                <div className="flex flex-col gap-1 sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="text-slate-600 text-xs font-medium uppercase tracking-wide">Writing speed</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                    {donePayload.ollama_metrics.eval_tokens_per_sec != null
                      ? `${donePayload.ollama_metrics.eval_tokens_per_sec} tokens/s`
                      : '—'}
                  </span>
                </div>
              </div>
            </details>
          )}
        </article>
      )}

      {/* Supporting Retrieved Context Passages */}
      {sources.length > 0 && (
        <section className="space-y-4 pb-2" aria-labelledby="supporting-sources-heading">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="supporting-sources-heading" className="text-xl font-bold tracking-[-0.02em] text-slate-900">
              Where this came from <span className="text-slate-600">({sources.length})</span>
            </h2>
            <p className="text-sm text-slate-600">The exact manual passages behind the answer. Open one to verify.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            {sources.map((src) => {
              const isExpanded = !!expandedSources[src.source_id];
              const panelId = `source-panel-${src.source_id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              return (
                <div
                  key={src.source_id}
                  className="border-b border-slate-200 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleSource(src.source_id)}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 min-h-11 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-5"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono font-bold text-emerald-800">
                        [{src.source_id}]
                      </span>
                      <FileText className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={1.8} aria-hidden="true" />
                      <span className="min-w-0 break-all font-semibold text-slate-900 sm:break-normal">{src.filename}</span>
                      <span className="text-slate-400" aria-hidden="true">•</span>
                      <span className="whitespace-nowrap font-mono text-xs text-slate-600" title={`Relevance score: ${src.score.toFixed(3)}`}>Page {src.page_number}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
                    )}
                  </button>

                  {isExpanded && (
                    <div id={panelId} className="px-4 pb-4 sm:px-5">
                      <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 select-text">
                        {src.text}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
