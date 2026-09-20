import React from 'react';
import {
  FileText,
  MessageSquare,
  BarChart2,
  ChevronRight,
  Power,
  ShieldCheck,
  Server,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react';
import type { HealthResponse } from '../api/client';

export type Tab = 'documents' | 'assistant' | 'benchmarks';

export interface NavItemConfig {
  id: Tab;
  label: string;
  sublabel: string;
  icon: React.ElementType;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'documents',
    label: 'Manuals',
    sublabel: 'Your PDF manuals',
    icon: FileText,
  },
  {
    id: 'assistant',
    label: 'Ask',
    sublabel: 'Answers with sources',
    icon: MessageSquare,
  },
  {
    id: 'benchmarks',
    label: 'Compare',
    sublabel: 'Which model is best (advanced)',
    icon: BarChart2,
  },
];

export const IsometricCubeLogo: React.FC<{ className?: string }> = ({
  className = 'w-8 h-8',
}) => (
  <svg
    className={className}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="30" height="30" rx="8" fill="#065f46" />
    <path
      d="M11 12h14M11 18h9M11 24h14"
      stroke="#ffffff"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <circle cx="24.5" cy="18" r="2.5" fill="#34d399" />
  </svg>
);

interface SidebarProps {
  currentTab: Tab;
  onNavigate: (tab: Tab) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  health?: HealthResponse | null;
  isMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
  health,
  isMobile = false,
  onCloseMobile,
}) => {
  const healthLabel =
    health?.status === 'healthy' ? 'ONLINE' : health?.status === 'degraded' ? 'DEGRADED' : 'OFFLINE';
  const healthDot =
    health?.status === 'healthy' ? 'bg-emerald-500' : health?.status === 'degraded' ? 'bg-amber-500' : 'bg-slate-400';
  const healthText =
    health?.status === 'healthy' ? 'text-emerald-700' : health?.status === 'degraded' ? 'text-amber-700' : 'text-slate-600';
  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* 1. Brand Header */}
      <div
        className={`border-b border-slate-100 flex items-center transition-all ${
          isCollapsed ? 'p-3.5 justify-center' : 'px-4 py-4 justify-between'
        }`}
      >
        <div
          className={`flex items-center gap-3 min-w-0 ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-lg p-0.5"
            title={isCollapsed ? 'Expand sidebar' : 'EdgeRAG'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'EdgeRAG Logo'}
          >
            <IsometricCubeLogo className="w-8 h-8 drop-shadow-sm" />
          </button>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[17px] text-slate-900 tracking-tight leading-tight truncate">
                EdgeRAG
              </span>
              <span className="text-xs text-slate-500 font-medium leading-tight mt-0.5 truncate">
                Local Assistant &amp; Telemetry
              </span>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Engine status badge — wired to backend health */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-xs font-mono font-medium shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
              title={
                health?.status === 'healthy'
                  ? 'Local backend healthy'
                  : health?.status === 'degraded'
                    ? `Degraded: ${health?.ollama?.error ?? 'connection issue'}`
                    : 'Offline / Air-Gapped Local Mode'
              }
            >
              <span className={`w-2 h-2 rounded-full ${healthDot}`} aria-hidden="true" />
              <Power className={`w-3 h-3 ${healthText}`} strokeWidth={2} aria-hidden="true" />
              <span className={healthText}>{healthLabel}</span>
            </div>

            {/* Close button for Mobile Drawer */}
            {isMobile && onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                aria-label="Close navigation"
                title="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Desktop Collapse Toggle */}
            {!isMobile && onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Scrollable Body Content */}
      <div className="flex-1 overflow-y-auto flex flex-col justify-between py-2">
        <div>
          {/* WORKSPACE Navigation Section */}
          <div className={isCollapsed ? 'px-2 py-2' : 'px-3 pt-2 pb-3'}>
            {!isCollapsed && (
              <div className="px-3 pb-2 text-xs font-semibold text-slate-600">
                Workspace
              </div>
            )}

            <nav className="space-y-2" aria-label="Primary navigation">
              {NAV_ITEMS.map(({ id, label, sublabel, icon: Icon }) => {
                const active = currentTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => onNavigate(id)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={label}
                    title={label}
                    className={`w-full group relative flex items-center transition-colors duration-150 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      isCollapsed
                        ? 'justify-center min-w-12 min-h-12 p-3 rounded-xl'
                        : 'px-3.5 py-3 rounded-xl gap-3 min-h-11'
                    } ${
                      active
                        ? 'bg-emerald-50 text-slate-900 font-medium'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >

                    <div className="shrink-0 flex items-center justify-center">
                      <Icon
                        className={`w-5 h-5 transition-colors ${
                          active
                            ? 'text-emerald-700'
                            : 'text-slate-500 group-hover:text-slate-700'
                        }`}
                        strokeWidth={1.8}
                      />
                    </div>

                    {!isCollapsed && (
                      <>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm leading-tight truncate ${
                              active
                                ? 'font-bold text-slate-900'
                                : 'font-semibold text-slate-700'
                            }`}
                          >
                            {label}
                          </div>
                          <div className="text-xs text-slate-500 font-normal leading-tight mt-0.5 truncate">
                            {sublabel}
                          </div>
                        </div>

                        <ChevronRight
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? 'text-emerald-700'
                              : 'text-slate-400 group-hover:text-slate-500'
                          }`}
                        />
                      </>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* ARCHITECTURE Section */}
          <div className="mt-2 pt-2 border-t border-slate-100">
            {isCollapsed ? (
              <div className="flex flex-col items-center py-3 gap-3">
                <span
                  className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                  title="Architecture: 100% Local (FAISS, MiniLM, Ollama)"
                >
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </div>
            ) : (
              <div className="px-3">
                <div className="px-3 pb-2 text-xs font-semibold text-slate-600">
                  Architecture
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] space-y-3">
                  {/* Top: 100% Local Badge */}
                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      100% Local
                    </span>
                  </div>

                  {/* Component Table / Stack */}
                  <div className="space-y-2.5 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-normal">Retriever</span>
                      <span className="font-mono font-semibold text-slate-800 tracking-tight">
                        FAISS CPU
                      </span>
                    </div>
                    <div className="border-t border-slate-100/90" />
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-normal">Embedder</span>
                      <span className="font-mono font-semibold text-slate-800 tracking-tight">
                        MiniLM-L6
                      </span>
                    </div>
                    <div className="border-t border-slate-100/90" />
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-normal">Inference</span>
                      <span className="font-mono font-semibold text-slate-800 tracking-tight">
                        Ollama API
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Air-gapped note */}
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-slate-600 text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="truncate">Zero cloud egress / air-gapped</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapsed expand shortcut at bottom */}
        {isCollapsed && onToggleCollapse && (
          <div className="p-2 flex justify-center border-t border-slate-100">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex items-center justify-center min-w-11 min-h-11 p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Footer Section */}
      {isCollapsed ? (
        <div className="p-3 border-t border-slate-100 flex flex-col items-center gap-2">
          <div
            className="p-2.5 rounded-lg text-slate-600 bg-slate-50 border border-slate-200"
            title="EdgeRAG Engine v1.0"
          >
            <Server className="w-4 h-4 text-slate-600" />
          </div>
        </div>
      ) : (
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg text-slate-600 bg-slate-50 border border-slate-200 shrink-0">
              <Server className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-900 leading-tight truncate">
                EdgeRAG Engine
              </span>
              <span className="text-xs text-slate-500 font-medium leading-tight mt-0.5 truncate">
                Industrial Edge Workstation
              </span>
            </div>
          </div>
          <span className="shrink-0 text-xs font-mono text-slate-500 border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">
            v1.0
          </span>
        </div>
      )}
    </div>
  );
};

