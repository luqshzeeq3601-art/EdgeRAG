/**
 * Typed API client for EdgeRAG backend REST and SSE streaming endpoints.
 */

export interface DocumentSummary {
  id: string;
  filename: string;
  sha256: string;
  size_bytes: number;
  page_count: number;
  chunk_count: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
}

export interface DocumentChunk {
  id: number;
  chunk_id: string;
  page_number: number;
  ordinal: number;
  text: string;
  token_count: number;
  vector_id: number;
}

export interface DocumentDetail extends DocumentSummary {
  chunks: DocumentChunk[];
}

export interface ModelSummary {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
    [key: string]: any;
  };
}

export interface SourceItem {
  source_id: string;
  document_id: string;
  filename: string;
  page_number: number;
  chunk_id: string;
  text: string;
  score: number;
}

export interface CitationValidation {
  is_valid: boolean;
  cited_sources: string[];
  invalid_citations: string[];
  uncited_sources: string[];
  warnings: string[];
}

export interface Timings {
  retrieval_ms: number;
  first_token_ms: number;
  total_ms: number;
}

export interface OllamaMetrics {
  total_duration_ns?: number;
  load_duration_ns?: number;
  prompt_eval_count?: number;
  prompt_eval_duration_ns?: number;
  eval_count?: number;
  eval_duration_ns?: number;
  eval_tokens_per_sec?: number;
}

export interface RAGDonePayload {
  model: string;
  answer: string;
  sources_count: number;
  abstained: boolean;
  citations: CitationValidation;
  timings: Timings;
  ollama_metrics: OllamaMetrics;
}

export interface SuiteQuestion {
  id: string;
  question: string;
  type: 'answerable' | 'unsupported';
  expected_terms?: string[];
}

export interface QuestionSuite {
  id: string;
  name: string;
  description: string;
  questions: SuiteQuestion[];
}

export interface BenchmarkSummary {
  id: string;
  name: string;
  suite_id: string;
  mode: 'fixed_context' | 'end_to_end';
  temperature_type: 'warm' | 'cold';
  models: string[];
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TrialItem {
  id: string;
  model_name: string;
  question_id: string;
  question_text: string;
  repetition_index: number;
  is_warmup: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
  retrieval_duration_ms: number | null;
  ttft_ms: number | null;
  eval_duration_ms: number | null;
  eval_count: number | null;
  tokens_per_second: number | null;
  load_duration_ms: number | null;
  total_duration_ms: number | null;
  answer_text: string | null;
  sources: SourceItem[];
  citations: CitationValidation;
  created_at: string;
}

export interface MetricStats {
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
}

export interface ModelAggregatedStats {
  total_trials: number;
  completed_trials: number;
  failed_trials: number;
  cancelled_trials: number;
  tokens_per_second: MetricStats;
  ttft_ms: MetricStats;
  eval_duration_ms: MetricStats;
  total_duration_ms: MetricStats;
  retrieval_duration_ms: MetricStats;
  load_duration_ms: MetricStats;
}

export interface BenchmarkDetail extends BenchmarkSummary {
  config: {
    repetitions: number;
    top_k: number;
    [key: string]: any;
  };
  trials: TrialItem[];
  aggregated_metrics: Record<string, ModelAggregatedStats>;
  resource_samples_count: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unavailable';
  sqlite: {
    status: string;
    ready: boolean;
    details: Record<string, any>;
    error: string | null;
  };
  ollama: {
    status: string;
    ready: boolean;
    details: Record<string, any>;
    error: string | null;
  };
}

const API_BASE = '/api/v1';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) {
        errorDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // Ignore JSON parse errors on non-OK responses
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Health
  getHealth: async (): Promise<HealthResponse> => {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse<HealthResponse>(res);
  },

  // Documents
  listDocuments: async (): Promise<DocumentSummary[]> => {
    const res = await fetch(`${API_BASE}/documents`);
    return handleResponse<DocumentSummary[]>(res);
  },

  uploadDocument: async (file: File): Promise<DocumentSummary> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<DocumentSummary>(res);
  },

  getDocument: async (id: string): Promise<DocumentDetail> => {
    const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`);
    return handleResponse<DocumentDetail>(res);
  },

  deleteDocument: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete document: HTTP ${res.status}`);
    }
  },

  // Models
  listModels: async (): Promise<ModelSummary[]> => {
    const res = await fetch(`${API_BASE}/models`);
    return handleResponse<ModelSummary[]>(res);
  },

  // RAG Ask with SSE streaming
  askRAGStream: async (
    request: { query: string; model: string; top_k?: number },
    callbacks: {
      onSources?: (sources: SourceItem[]) => void;
      onDelta?: (delta: string) => void;
      onDone?: (payload: RAGDonePayload) => void;
      onError?: (err: Error) => void;
    },
    signal?: AbortSignal
  ): Promise<void> => {
    const res = await fetch(`${API_BASE}/rag/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: request.query,
        model: request.model,
        top_k: request.top_k ?? 5,
      }),
      signal,
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const json = await res.json();
        if (json.detail) errText = json.detail;
      } catch {}
      throw new Error(errText);
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let dataStr = '';

          const lines = block.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr += line.substring(6).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === 'sources' && callbacks.onSources) {
              callbacks.onSources(parsed.sources || []);
            } else if (eventType === 'delta' && callbacks.onDelta) {
              callbacks.onDelta(parsed.text || '');
            } else if (eventType === 'done' && callbacks.onDone) {
              callbacks.onDone(parsed as RAGDonePayload);
            } else if (eventType === 'error') {
              const err = new Error(parsed.detail || 'Streaming generation error');
              if (callbacks.onError) callbacks.onError(err);
              return;
            }
          } catch (e) {
            console.error('SSE parse error:', e, dataStr);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  // Benchmarks
  listSuites: async (): Promise<QuestionSuite[]> => {
    const res = await fetch(`${API_BASE}/benchmarks/suites`);
    return handleResponse<QuestionSuite[]>(res);
  },

  startBenchmark: async (params: {
    name: string;
    suite_id: string;
    mode: 'fixed_context' | 'end_to_end';
    temperature_type: 'warm' | 'cold';
    models: string[];
    repetitions: number;
    top_k: number;
  }): Promise<BenchmarkSummary> => {
    const res = await fetch(`${API_BASE}/benchmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<BenchmarkSummary>(res);
  },

  listBenchmarks: async (): Promise<BenchmarkSummary[]> => {
    const res = await fetch(`${API_BASE}/benchmarks`);
    return handleResponse<BenchmarkSummary[]>(res);
  },

  getBenchmark: async (id: string): Promise<BenchmarkDetail> => {
    const res = await fetch(`${API_BASE}/benchmarks/${encodeURIComponent(id)}`);
    return handleResponse<BenchmarkDetail>(res);
  },

  cancelBenchmark: async (id: string): Promise<{ status: string; message: string }> => {
    const res = await fetch(`${API_BASE}/benchmarks/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
    return handleResponse<{ status: string; message: string }>(res);
  },

  deleteBenchmark: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/benchmarks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete benchmark: HTTP ${res.status}`);
    }
  },
};
