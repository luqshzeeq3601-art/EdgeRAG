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
      } catch (err: unknown) {
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
            if (incomingSources.length > 0) {
              setExpandedSources({ [incomingSources[0].source_id]: true });
            }
          },
          onDelta: (delta) => {
            setAnswerText((prev) => prev + delta);
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
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
    setExpandedSources((prev) => ({
      ...prev,
      [sourceId]: !prev[sourceId],
    }));
  };

  const formatModelSize = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <div className="assistant-page">
      {/* Heading */}
      <div className="document-heading">
        <div>
          <p className="document-kicker">Local neural inference</p>
          <h1 className="document-title">Knowledge Assistant</h1>
          <p className="document-subtitle">
            Query indexed technical documentation with strict citation grounding and real-time streaming telemetry.
          </p>
        </div>
      </div>

      {/* Top Configuration Controls */}
      <div className="panel control-strip">
        <div className="control-group">
          <label className="control-label" htmlFor="model-select">
            <Bot size={15} strokeWidth={1.8} />
            <span>Model:</span>
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming || models.length === 0}
            className="select-control"
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

          <label className="control-label" htmlFor="top-k-select">
            <Database size={15} strokeWidth={1.8} />
            <span>Top-K:</span>
          </label>
          <select
            id="top-k-select"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            disabled={isStreaming}
            className="select-control"
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map((k) => (
              <option key={k} value={k}>
                {k} passages
              </option>
            ))}
          </select>
        </div>

        <div className="control-hint">
          Strict grounding / [S#] citations / Local offline execution
        </div>
      </div>

      {/* Query Composer Bar */}
      <form onSubmit={handleAsk} className="panel query-composer">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a technical question against your ingested PDF manuals..."
          disabled={isStreaming}
          className="query-composer__input"
        />
        <div className="query-composer__actions">
          <span className="kbd-hint">↵ Enter</span>
          {isStreaming ? (
            <button
              type="button"
              onClick={handleAbort}
              className="button button--danger"
            >
              <Square size={13} strokeWidth={2} fill="currentColor" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!query.trim() || !selectedModel}
              className="button button--accent"
            >
              <Send size={14} strokeWidth={1.8} />
              <span>Ask</span>
            </button>
          )}
        </div>
      </form>

      {/* Error alert */}
      {streamError && (
        <div className="inline-alert inline-alert--danger">
          <AlertTriangle size={15} strokeWidth={1.8} />
          <span>{streamError}</span>
        </div>
      )}

      {/* Response Display Box */}
      {(answerText || isStreaming || donePayload) && (
        <div className="panel response-card">
          {/* Header & Badges */}
          <div className="response-card__header">
            <div className="model-pill">
              <Bot size={16} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
              <span>{selectedModel}</span>
              {isStreaming && (
                <span className="streaming-label">
                  <span className="state-dot is-ready animate-pulse" />
                  Streaming response...
                </span>
              )}
            </div>

            {donePayload && (
              <div>
                {donePayload.abstained ? (
                  <span className="status status--building">
                    <AlertTriangle size={13} strokeWidth={1.8} />
                    Abstained (No Context)
                  </span>
                ) : donePayload.citations.is_valid ? (
                  <span className="status status--ready">
                    <CheckCircle size={13} strokeWidth={1.8} />
                    Valid Citations ({donePayload.citations.cited_sources.length})
                  </span>
                ) : (
                  <span
                    className="status status--failed"
                    title={donePayload.citations.warnings.join(' | ')}
                  >
                    <AlertTriangle size={13} strokeWidth={1.8} />
                    Citation Warning
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Markdown Content */}
          <div className="prose-body">
            <ReactMarkdown>{answerText || '...'}</ReactMarkdown>
          </div>

          {/* Citations warnings list if any */}
          {donePayload?.citations.warnings && donePayload.citations.warnings.length > 0 && (
            <div className="grounding-alert">
              <strong>Grounding Notice:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                {donePayload.citations.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Performance & Hardware Timings */}
          {donePayload && (
            <div className="telemetry-strip">
              <div className="telemetry-item" title="Retrieval Latency">
                <Database size={13} strokeWidth={1.8} />
                <span>
                  Retrieval: <strong>{donePayload.timings.retrieval_ms} ms</strong>
                </span>
              </div>
              <div className="telemetry-item" title="Time to First Token">
                <Zap size={13} strokeWidth={1.8} />
                <span>
                  TTFT: <strong>{donePayload.timings.first_token_ms} ms</strong>
                </span>
              </div>
              <div className="telemetry-item" title="Total Response Latency">
                <Clock size={13} strokeWidth={1.8} />
                <span>
                  Total: <strong>{donePayload.timings.total_ms} ms</strong>
                </span>
              </div>
              {donePayload.ollama_metrics.eval_tokens_per_sec && (
                <div className="telemetry-item" title="Output Generation Throughput">
                  <Cpu size={13} strokeWidth={1.8} />
                  <span>
                    Throughput: <strong>{donePayload.ollama_metrics.eval_tokens_per_sec} tokens/s</strong>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Supporting Retrieved Context Passages */}
      {sources.length > 0 && (
        <div className="panel sources-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Retrieved Context</p>
              <h2 className="panel-title">Supporting Passages ({sources.length})</h2>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sources.map((src) => {
              const isExpanded = !!expandedSources[src.source_id];
              return (
                <div key={src.source_id} className="source-item">
                  <button
                    type="button"
                    onClick={() => toggleSource(src.source_id)}
                    className="source-trigger"
                  >
                    <div className="source-trigger__meta">
                      <span className="source-tag">[{src.source_id}]</span>
                      <FileText size={14} strokeWidth={1.8} style={{ color: 'var(--text-faint)' }} />
                      <span style={{ fontWeight: 650, color: 'var(--text)' }}>{src.filename}</span>
                      <span style={{ color: 'var(--text-faint)' }}>• Page {src.page_number}</span>
                      <span style={{ color: 'var(--text-faint)' }}>• Score: {src.score.toFixed(3)}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={15} strokeWidth={1.8} style={{ color: 'var(--text-faint)' }} />
                    ) : (
                      <ChevronDown size={15} strokeWidth={1.8} style={{ color: 'var(--text-faint)' }} />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="source-body">
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

export default AssistantPage;
