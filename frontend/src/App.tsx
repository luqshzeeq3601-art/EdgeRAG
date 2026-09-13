import React, { useState, useEffect } from 'react';
import { DocumentsPage } from './pages/Documents';
import { AssistantPage } from './pages/Assistant';
import { BenchmarksPage } from './pages/Benchmarks';
import { api } from './api/client';
import type { HealthResponse } from './api/client';
import { FileText, MessageSquare, BarChart2, Cpu, Settings } from 'lucide-react';

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
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white antialiased">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-6 lg:px-8 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand Logo & Subtitle */}
          <div className="flex items-center gap-3">
            {/* 3D Isometric Cube Icon */}
            <div className="w-9 h-9 flex items-center justify-center shrink-0">
              <svg className="w-9 h-9" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 3L32 10.5V25.5L18 33L4 25.5V10.5L18 3Z" fill="#1E40AF" />
                <path d="M18 3L32 10.5L18 18L4 10.5L18 3Z" fill="#3B82F6" />
                <path d="M18 18L32 10.5V25.5L18 33V18Z" fill="#1D4ED8" />
                <path d="M4 10.5L18 18V33L4 25.5V10.5Z" fill="#2563EB" />
                <path d="M18 6L28 11.5L18 17L8 11.5L18 6Z" fill="#60A5FA" opacity="0.9" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-xl text-slate-900 tracking-tight block leading-tight">EdgeRAG</span>
              <p className="text-[11px] text-slate-500 font-medium">Technical Assistant & Hardware Telemetry</p>
            </div>
          </div>

          {/* Navigation Pill Group */}
          <nav className="flex items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/70 gap-1 shadow-inner">
            <button
              onClick={() => setCurrentTab('documents')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                currentTab === 'documents'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Documents</span>
            </button>

            <button
              onClick={() => setCurrentTab('assistant')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                currentTab === 'assistant'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Assistant</span>
            </button>

            <button
              onClick={() => setCurrentTab('benchmarks')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                currentTab === 'benchmarks'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Benchmarks</span>
            </button>
          </nav>

          {/* Telemetry Pill & Settings */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white shadow-2xs text-xs hover:border-slate-300 transition-colors cursor-help"
              title={
                health?.status === 'healthy'
                  ? 'All local systems ready (SQLite WAL + Ollama daemon)'
                  : health?.status === 'degraded'
                  ? 'Ollama connection degraded'
                  : 'Connecting to local backend...'
              }
            >
              <div className="flex items-center gap-1.5 text-slate-700">
                <Cpu className="w-4 h-4 text-slate-700" />
                <span
                  className={`w-2 h-2 rounded-full ${
                    health?.status === 'healthy'
                      ? 'bg-emerald-500 animate-pulse'
                      : health?.status === 'degraded'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                ></span>
                <span className="font-bold text-slate-800">RTX 3070</span>
              </div>
              <span className="text-slate-300">•</span>
              <span className="text-slate-600 font-mono text-[11px] tabular-nums">1.2 / 8.0 GB VRAM</span>
            </div>

            <button
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl border border-slate-200 bg-white shadow-2xs transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
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
      <footer className="border-t border-slate-200/80 py-4 px-6 md:px-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span>EdgeRAG v1.0 • Local Engine (Offline)</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
