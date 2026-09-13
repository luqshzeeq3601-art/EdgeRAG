import React, { useState, useEffect } from 'react';
import { DocumentsPage } from './pages/Documents';
import { AssistantPage } from './pages/Assistant';
import { BenchmarksPage } from './pages/Benchmarks';
import { api } from './api/client';
import type { HealthResponse } from './api/client';
import { Layers, MessageSquare, BarChart3, ShieldCheck, Activity } from 'lucide-react';

type Tab = 'documents' | 'assistant' | 'benchmarks';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<Tab>('assistant');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const checkHealth = async () => {
    try {
      const h = await api.getHealth();
      setHealth(h);
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-sky-500/20">
              E
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base tracking-tight">EdgeRAG</span>
                <span className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Local Monolith
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Technical Assistant & Hardware Telemetry</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setCurrentTab('documents')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentTab === 'documents'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Documents
            </button>

            <button
              onClick={() => setCurrentTab('assistant')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentTab === 'assistant'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Assistant
            </button>

            <button
              onClick={() => setCurrentTab('benchmarks')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentTab === 'benchmarks'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Benchmarks
            </button>
          </nav>

          {/* System Health Indicator */}
          <div className="flex items-center gap-2.5">
            {health?.status === 'healthy' && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium cursor-help"
                title="SQLite WAL and local Ollama daemon are fully ready"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Ready (RTX 3070)</span>
              </div>
            )}
            {health?.status === 'degraded' && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium cursor-help"
                title="Ollama daemon is unreachable or starting up"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Ollama Degraded</span>
              </div>
            )}
            {!health && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                <span>Connecting...</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {currentTab === 'documents' && <DocumentsPage />}
        {currentTab === 'assistant' && <AssistantPage />}
        {currentTab === 'benchmarks' && <BenchmarksPage />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500">
        EdgeRAG • Local Monolith • SentenceTransformers + FAISS + SQLite + Ollama • Zero Cloud Dependency
      </footer>
    </div>
  );
};

export default App;
