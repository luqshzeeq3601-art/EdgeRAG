import React, { useEffect, useState } from 'react';
import { BarChart2, Boxes, Cpu, FileText, MessageSquare, Settings } from 'lucide-react';
import { AssistantPage } from './pages/Assistant';
import { BenchmarksPage } from './pages/Benchmarks';
import { DocumentsPage } from './pages/Documents';
import { api } from './api/client';
import type { HealthResponse } from './api/client';

type Tab = 'documents' | 'assistant' | 'benchmarks';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<Tab>('assistant');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const checkHealth = async () => {
    try {
      const response = await api.getHealth();
      setHealth(response);
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const navigationItems: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'documents', label: 'Documents', icon: <FileText size={16} strokeWidth={1.8} /> },
    { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={16} strokeWidth={1.8} /> },
    { id: 'benchmarks', label: 'Benchmarks', icon: <BarChart2 size={16} strokeWidth={1.8} /> },
  ];

  const healthLabel = health?.status === 'healthy'
    ? 'Local services ready'
    : health?.status === 'degraded'
      ? 'Ollama connection degraded'
      : 'Connecting to local backend';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand-lockup">
            <div className="brand-lockup__mark" aria-hidden="true">
              <Boxes size={22} strokeWidth={1.7} />
            </div>
            <div>
              <span className="brand-lockup__name">EdgeRAG</span>
              <span className="brand-lockup__sub">Technical assistant / hardware telemetry</span>
            </div>
          </div>

          <nav className="app-nav" aria-label="Primary navigation">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentTab(item.id)}
                className={`app-nav__item ${currentTab === item.id ? 'is-active' : ''}`}
                aria-current={currentTab === item.id ? 'page' : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="runtime-cluster">
            <div className="runtime-readout" title={healthLabel}>
              <Cpu size={16} strokeWidth={1.8} aria-hidden="true" />
              <span
                className={`state-dot ${
                  health?.status === 'healthy'
                    ? 'is-ready'
                    : health?.status === 'degraded'
                      ? 'is-warning'
                      : ''
                }`}
                aria-hidden="true"
              />
              <span className="runtime-readout__device">RTX 3070</span>
              <span className="runtime-readout__divider">/</span>
              <span className="runtime-readout__memory">1.2 / 8.0 GB VRAM</span>
            </div>

            <button
              type="button"
              className="header-icon-button"
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={17} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {currentTab === 'documents' && <DocumentsPage />}
        {currentTab === 'assistant' && <AssistantPage />}
        {currentTab === 'benchmarks' && <BenchmarksPage />}
      </main>

      <footer className="app-footer">
        <div className="app-footer__inner">
          <span>EdgeRAG v1.0 / Local engine (offline)</span>
          <span className="app-footer__engine">Engine: local / retrieval ready</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
