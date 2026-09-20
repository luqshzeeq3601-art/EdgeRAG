import React, { useState, useEffect } from 'react';
import { DocumentsPage } from './pages/Documents';
import { AssistantPage } from './pages/Assistant';
import { BenchmarksPage } from './pages/Benchmarks';
import { Sidebar } from './components/Sidebar';
import type { Tab } from './components/Sidebar';
import { api } from './api/client';
import type { HealthResponse } from './api/client';
import { Cpu, Menu, PanelLeftClose, PanelLeft } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<Tab>('assistant');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('edgerag_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('edgerag_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

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

  const handleNavigate = (tab: Tab) => {
    setCurrentTab(tab);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans antialiased">
      {/* Fixed Left Sidebar (desktop) */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200/90 flex-col transition-all duration-200 ease-in-out shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${
          isCollapsed ? 'w-[68px]' : 'w-[280px]'
        }`}
      >
        <Sidebar
          currentTab={currentTab}
          onNavigate={handleNavigate}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleSidebar}
          health={health}
        />
      </aside>

      {/* Mobile drawer sidebar */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-[min(300px,86vw)] bg-white border-r border-slate-200 flex flex-col shadow-2xl pb-[env(safe-area-inset-bottom)]">
            <Sidebar
              currentTab={currentTab}
              onNavigate={handleNavigate}
              isCollapsed={false}
              isMobile={true}
              onCloseMobile={() => setMobileNavOpen(false)}
              health={health}
            />
          </aside>
        </div>
      )}

      {/* Right Content Area: Topbar + Main View */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out ${
          isCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[280px]'
        }`}
      >
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8">
          <div className="h-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                aria-label="Open navigation"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Desktop toggle button */}
              <button
                type="button"
                onClick={toggleSidebar}
                className="hidden lg:flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? (
                  <PanelLeft className="w-4 h-4 text-slate-700" />
                ) : (
                  <PanelLeftClose className="w-4 h-4 text-slate-500" />
                )}
              </button>
            </div>

            {/* Hardware / Engine Telemetry Chip */}
            <div className="flex items-center ml-auto">
              <div
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.06)] cursor-default"
                title={
                  health?.status === 'healthy'
                    ? 'Your manuals and AI models are ready on this computer — no internet needed'
                    : health?.status === 'degraded'
                    ? `AI models having trouble: ${health?.ollama?.error ?? 'connection issue'}`
                    : 'Starting up…'
                }
              >
                <Cpu className="w-4 h-4 text-slate-600" strokeWidth={1.8} />
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    health?.status === 'healthy'
                      ? 'bg-emerald-500 animate-pulse'
                      : health?.status === 'degraded'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="font-semibold text-slate-800">On-device</span>
                <span className="text-slate-400" aria-hidden="true">•</span>
                <span className="font-mono text-xs font-medium tabular-nums whitespace-nowrap text-slate-600">
                  {health?.status === 'healthy'
                    ? 'Ready'
                    : health?.status === 'degraded'
                    ? 'Needs attention'
                    : 'Starting…'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8 max-w-7xl w-full mx-auto">
          {currentTab === 'documents' && <DocumentsPage />}
          {currentTab === 'assistant' && <AssistantPage />}
          {currentTab === 'benchmarks' && <BenchmarksPage />}
        </main>
      </div>
    </div>
  );
};

export default App;
