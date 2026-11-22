import {useCallback, useEffect, useState} from 'react';
import {
  CalendarClock,
  Film,
  GitBranch,
  Globe,
  Menu,
  Play,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import {
  fetchAppState,
  startSchedulerEngine,
  stopSchedulerEngine,
  undoPagesDelete,
  undoQueueDelete,
} from './api';
import type {AppStateResponse} from './types';
import {AccountsSection} from './components/AccountsSection';
import {MediaStudioSection} from './components/MediaStudioSection';
import {SchedulerSection} from './components/SchedulerSection';
import {TerminalSection} from './components/TerminalSection';
import {DeploySection} from './components/DeploySection';

type TabKey = 'accounts' | 'media' | 'scheduler' | 'terminal' | 'deploy';

const NAV_ITEMS: Array<{
  key: TabKey;
  label: string;
  sub: string;
  icon: typeof Globe;
}> = [
  {key: 'accounts', label: '01. Browser & Profile', sub: 'Setup & Fetch Pages', icon: Globe},
  {key: 'media', label: '02. Pages & Media', sub: 'Bulk Caption & Video', icon: Film},
  {key: 'scheduler', label: '03. Master Scheduler', sub: 'Modes 1–4 & Auto-Run', icon: CalendarClock},
  {key: 'terminal', label: '04. Live RPA Terminal', sub: 'Real-Time Logs', icon: Terminal},
  {key: 'deploy', label: '05. GitHub & Live Link', sub: 'Push Repo & Cloud Host', icon: GitBranch},
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('accounts');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [state, setState] = useState<AppStateResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clockText, setClockText] = useState(() => new Date().toLocaleTimeString([], {hour12: false}));
  const [toast, setToast] = useState<{message: string; tone: 'success' | 'error' | 'info'} | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast({message, tone});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshState = useCallback(async () => {
    try {
      const next = await fetchAppState();
      setState(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach cloud backend.');
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    const shouldPoll =
      state?.engineRunning ||
      state?.browser.browserBusy ||
      activeTab === 'terminal' ||
      activeTab === 'scheduler';
    if (!shouldPoll) return;
    const timer = setInterval(() => {
      void refreshState();
    }, 3000);
    return () => clearInterval(timer);
  }, [state?.engineRunning, state?.browser.browserBusy, activeTab, refreshState]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockText(new Date().toLocaleTimeString([], {hour12: false}));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        if (activeTab === 'scheduler') {
          void undoQueueDelete()
            .then((next) => {
              setState(next);
              notify('Restored queued target.', 'success');
            })
            .catch(() => {});
        } else {
          void undoPagesDelete()
            .then((next) => {
              setState(next);
              notify('Restored page row.', 'success');
            })
            .catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, notify]);

  async function handleToggleEngine() {
    if (!state) return;
    try {
      const next = state.engineRunning
        ? await stopSchedulerEngine()
        : await startSchedulerEngine();
      setState(next);
      notify(
        next.engineRunning ? 'System B Auto-Scheduler started.' : 'Auto-Scheduler stopped.',
        next.engineRunning ? 'success' : 'info'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Engine toggle failed.', 'error');
    }
  }

  const currentNav = NAV_ITEMS.find((n) => n.key === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex">
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-[#0f172a] border-r border-slate-800">
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="text-base font-bold tracking-tight text-slate-100">
            FB & Insta Auto-Scheduler
          </div>
          <div className="text-xs text-slate-400 mt-1">
            System B · Cloud Browser Edition
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-800/90 text-slate-100'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  <div className="text-xs text-slate-500 truncate">{item.sub}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Engine Quick Control</span>
            <span className={state?.engineRunning ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
              {state?.engineRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!state || state.engineRunning}
              onClick={() => void handleToggleEngine()}
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Start
            </button>
            <button
              type="button"
              disabled={!state || !state.engineRunning}
              onClick={() => void handleToggleEngine()}
              className="inline-flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-45 text-white text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 bg-[#0f172a] border-r border-slate-800 flex flex-col">
            <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-100">FB & Insta Auto-Scheduler</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg ${
                      active ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-[#0f172a] border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
              {currentNav.label}
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
            <span>{state ? `${state.pages.length} Pages` : '0 Pages'}</span>
            <span aria-hidden="true">·</span>
            <span>{state ? `${state.queue.length} Queued` : '0 Queued'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-300">{clockText}</span>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('deploy')}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              GitHub & Live Link
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {loadError ? (
            <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-6 text-sm text-rose-200">
              {loadError}
            </div>
          ) : !state ? (
            <div className="space-y-4">
              <div className="h-44 rounded-xl bg-[#0f172a] border border-slate-800 animate-pulse" />
              <div className="h-64 rounded-xl bg-[#0f172a] border border-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'accounts' && (
                <AccountsSection
                  state={state}
                  onStateChange={setState}
                  onNotify={notify}
                  onNavigate={setActiveTab}
                />
              )}
              {activeTab === 'media' && (
                <MediaStudioSection
                  state={state}
                  onStateChange={setState}
                  onNotify={notify}
                  onNavigate={setActiveTab}
                />
              )}
              {activeTab === 'scheduler' && (
                <SchedulerSection
                  state={state}
                  onStateChange={setState}
                  onNotify={notify}
                  onNavigate={setActiveTab}
                />
              )}
              {activeTab === 'terminal' && (
                <TerminalSection
                  state={state}
                  onStateChange={setState}
                  onNotify={notify}
                />
              )}
              {activeTab === 'deploy' && (
                <DeploySection
                  state={state}
                  onStateChange={setState}
                  onNotify={notify}
                />
              )}
            </>
          )}
        </main>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl border text-xs font-medium shadow-xl ${
            toast.tone === 'success'
              ? 'bg-emerald-950 border-emerald-700 text-emerald-200'
              : toast.tone === 'error'
              ? 'bg-rose-950 border-rose-700 text-rose-200'
              : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
