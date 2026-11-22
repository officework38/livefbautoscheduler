import React, {useMemo, useState} from 'react';
import {Download, Trash2} from 'lucide-react';
import type {AppStateResponse, LogLevel} from '../types';
import {clearServerLogs} from '../api';

interface TerminalSectionProps {
  state: AppStateResponse;
  onStateChange: (next: AppStateResponse) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const TerminalSection: React.FC<TerminalSectionProps> = ({
  state,
  onStateChange,
  onNotify,
}) => {
  const [filter, setFilter] = useState<'all' | LogLevel>('all');

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return state.logs;
    return state.logs.filter((l) => l.level === filter);
  }, [state.logs, filter]);

  async function handleClear() {
    try {
      const next = await clearServerLogs();
      onStateChange(next);
      onNotify('Server terminal logs cleared.', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not clear logs.', 'error');
    }
  }

  function handleDownload() {
    const content = state.logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scheduler-cloud-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col h-[calc(100vh-11rem)] min-h-[480px]">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Live Execution Terminal</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time server scheduler, Meta Graph API, and GitHub deployment logs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
            {(['all', 'success', 'warn', 'error'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setFilter(lvl)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                  filter === lvl
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export .log
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Logs
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 bg-[#060913] border border-slate-800/80 rounded-lg p-4 overflow-y-auto font-mono text-xs space-y-1.5">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500">No log entries matching the selected filter.</div>
        ) : (
          filteredLogs.map((log) => {
            const color =
              log.level === 'success'
                ? 'text-emerald-400'
                : log.level === 'warn'
                ? 'text-amber-400'
                : log.level === 'error'
                ? 'text-rose-400'
                : 'text-slate-300';
            return (
              <div key={log.id} className="leading-relaxed">
                <span className="text-slate-500 tabular-nums">[{log.timestamp}]</span>{' '}
                <span className={color}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
