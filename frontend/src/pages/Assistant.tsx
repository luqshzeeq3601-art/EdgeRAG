import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { ModelSummary, SourceItem, RAGDonePayload } from '../api/client';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Square,
  Bot,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Zap,
  Clock,
  Database,
  Cpu,
} from 'lucide-react';

export const AssistantPage: React.FC = () => {
  const [models, setModels] = useState<ModelSummary[]>([]);
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

  useEffect(() => {
    const loadModels = async () => {
      try {
        const available = await api.listModels();
        setModels(available);
        if (available.length > 0 && !selectedModel) {
          setSelectedModel(available[0].name);
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
  }, []);

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
            // Default first source expanded
            if (incomingSources.length > 0) {
              setExpandedSources({ [incomingSources[0].source_id]: true });
            }
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

  const formatModelSize = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Configuration Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-sky-400" />
            <span className="text-sm font-semibold text-slate-300">Model:</span>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming || models.length === 0}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500"
          >
            {models.length === 0 ? (
              <option value="">No Ollama models detected</option>
            ) : (
              models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({formatModelSize(m.size)})
                </option>
              ))
            )}
          </select>

          <div className="flex items-center gap-2 ml-4">
            <Database className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Top-K Passages:</span>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              disabled={isStreaming}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Strict grounding • Factual citations `[S#]` • Fast local inference
        </div>
      </div>

      {/* Query Bar */}
      <form onSubmit={handleAsk} className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a technical question against your ingested PDF manuals..."
          disabled={isStreaming}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 pr-28 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 shadow-lg text-sm"
        />
        <div className="absolute right-2 flex items-center gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={handleAbort}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!query.trim() || !selectedModel}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Ask
            </button>
          )}
        </div>
      </form>

      {/* Error alert */}
      {streamError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{streamError}</span>
        </div>
      )}

      {/* Response Display Box */}
      {(answerText || isStreaming || donePayload) && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 shadow-xl">
          {/* Header & Badges */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-sky-400" />
              <span className="font-semibold text-white text-sm">{selectedModel}</span>
              {isStreaming && (
                <span className="flex items-center gap-1.5 text-xs text-sky-400 animate-pulse font-medium">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span> Generating response...
                </span>
              )}
            </div>

            {donePayload && (
              <div className="flex items-center gap-2">
                {donePayload.abstained ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3" /> Abstained (No Context)
                  </span>
                ) : donePayload.citations.is_valid ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle className="w-3 h-3" /> Valid Citations ({donePayload.citations.cited_sources.length})
                  </span>
                ) : (
                  <span
                    title={donePayload.citations.warnings.join(' | ')}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 cursor-help"
                  >
                    <AlertTriangle className="w-3 h-3" /> Citation Warning
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Markdown Content */}
          <div className="prose prose-invert max-w-none text-slate-200 text-sm leading-relaxed font-sans">
            <ReactMarkdown>{answerText || '...'}</ReactMarkdown>
          </div>

          {/* Citations warnings list if any */}
          {donePayload?.citations.warnings && donePayload.citations.warnings.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 space-y-1">
              <span className="font-semibold block">Grounding / Citation Notice:</span>
              {donePayload.citations.warnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          {/* Performance & Hardware Timings */}
          {donePayload && (
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-5 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-1.5" title="Retrieval Latency">
                <Database className="w-3.5 h-3.5 text-sky-400" />
                <span>Retrieval: {donePayload.timings.retrieval_ms} ms</span>
              </div>
              <div className="flex items-center gap-1.5" title="Time to First Token">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>TTFT: {donePayload.timings.first_token_ms} ms</span>
              </div>
              <div className="flex items-center gap-1.5" title="Total Response Latency">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Total: {donePayload.timings.total_ms} ms</span>
              </div>
              {donePayload.ollama_metrics.eval_tokens_per_sec && (
                <div className="flex items-center gap-1.5 text-sky-400 font-semibold" title="Output Generation Throughput">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{donePayload.ollama_metrics.eval_tokens_per_sec} tokens/s</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Supporting Retrieved Context Passages */}
      {sources.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Supporting Source Passages ({sources.length})
          </h3>
          <div className="space-y-2.5">
            {sources.map((src) => {
              const isExpanded = !!expandedSources[src.source_id];
              return (
                <div
                  key={src.source_id}
                  className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleSource(src.source_id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono">
                        [{src.source_id}]
                      </span>
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-white font-medium">{src.filename}</span>
                      <span className="text-slate-500">• Page {src.page_number}</span>
                      <span className="text-slate-500">• Score: {src.score.toFixed(3)}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 text-xs text-slate-300 font-mono bg-slate-950/50 border-t border-slate-800 whitespace-pre-wrap leading-relaxed">
                      {src.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
