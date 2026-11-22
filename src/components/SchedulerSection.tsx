import React, {useState} from 'react';
import {CheckCircle2, Play, Square, Trash2, Undo2, Zap} from 'lucide-react';
import type {AppStateResponse, ExecutionMode, QueuedTarget} from '../types';
import {
  deleteQueueRow,
  executeQueueAll,
  executeQueueOne,
  setExecutionMode,
  startSchedulerEngine,
  stopSchedulerEngine,
  undoQueueDelete,
} from '../api';

interface SchedulerSectionProps {
  state: AppStateResponse;
  onStateChange: (next: AppStateResponse) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (tab: 'accounts' | 'media' | 'scheduler' | 'terminal' | 'deploy') => void;
}

const MODES: Array<{id: ExecutionMode; title: string; detail: string}> = [
  {id: 'Mode 1', title: 'Mode 1 · Reel + Synced Comment', detail: 'Uploads video reel and auto-posts caption as first comment.'},
  {id: 'Mode 2', title: 'Mode 2 · Shield & Reel Comment', detail: 'Runs session shield verification before reel publish & comment.'},
  {id: 'Mode 3', title: 'Mode 3 · Feed Post & Comment', detail: 'Publishes feed post and attaches synced first comment.'},
  {id: 'Mode 4', title: 'Mode 4 · Photo Post & Refresh', detail: 'Publishes photo post, refreshes feed, and adds photo comment.'},
];

export const SchedulerSection: React.FC<SchedulerSectionProps> = ({
  state,
  onStateChange,
  onNotify,
  onNavigate,
}) => {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedJob: QueuedTarget | undefined =
    state.queue.find((q) => q.id === selectedJobId) || state.queue[0];

  async function handleSelectMode(mode: ExecutionMode) {
    try {
      const next = await setExecutionMode(mode);
      onStateChange(next);
      onNotify(`Switched execution strategy to ${mode}.`, 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Mode update failed.', 'error');
    }
  }

  async function handleToggleEngine(start: boolean) {
    try {
      const next = start ? await startSchedulerEngine() : await stopSchedulerEngine();
      onStateChange(next);
      onNotify(start ? '24/7 Cloud Auto-Scheduler started.' : 'Auto-Scheduler stopped.', start ? 'success' : 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Engine toggle failed.', 'error');
    }
  }

  async function handleExecuteSelected() {
    if (!selectedJob) {
      onNotify('Select a target row from the queue first.', 'error');
      return;
    }
    setBusy(true);
    try {
      const next = await executeQueueOne(selectedJob.id);
      onStateChange(next);
      onNotify(`Executed "${selectedJob.name}" — see Live Terminal or Proofs below.`, 'success');
      onNavigate('terminal');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Execution failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteAll() {
    if (state.queue.length === 0) {
      onNotify('No targets in Scheduler queue.', 'error');
      return;
    }
    setBusy(true);
    try {
      const next = await executeQueueAll();
      onStateChange(next);
      onNotify('Batch execution finished for all queued targets.', 'success');
      onNavigate('terminal');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Batch execution failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteJob(id: string) {
    try {
      const next = await deleteQueueRow(id);
      onStateChange(next);
      onNotify('Target removed from queue.', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  async function handleUndo() {
    try {
      const next = await undoQueueDelete();
      onStateChange(next);
      onNotify('Restored target to queue.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Nothing to undo.', 'info');
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Execution Strategy & 24/7 Cloud Engine
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Polls queued schedules every 5 seconds on the server — keeps running even when your phone or PC is off.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleEngine(true)}
              disabled={state.engineRunning}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Start Auto-Scheduler
            </button>
            <button
              type="button"
              onClick={() => handleToggleEngine(false)}
              disabled={!state.engineRunning}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Engine
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {MODES.map((m) => {
            const active = state.activeMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelectMode(m.id)}
                className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-indigo-950/50 border-indigo-500 text-slate-100'
                    : 'bg-[#0b1120] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">{m.title}</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">{m.detail}</div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-8 bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Armed Target Queue</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click any row to inspect attached media and schedule details.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !selectedJob}
                  onClick={handleExecuteSelected}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Execute Selected Now
                </button>
                <button
                  type="button"
                  disabled={busy || state.queue.length === 0}
                  onClick={handleExecuteAll}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Execute All Now
                </button>
                <button
                  type="button"
                  disabled={!state.canUndoQueue}
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              </div>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                    <th className="py-2.5 pr-3">Target</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3">Media</th>
                    <th className="py-2.5 px-3">Scheduled</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 pl-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {state.queue.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        Queue is empty. Configure pages in Pages & Media Studio and click "Proceed to Master Scheduler".
                      </td>
                    </tr>
                  ) : (
                    state.queue.map((q) => {
                      const isSel = selectedJob?.id === q.id;
                      return (
                        <tr
                          key={q.id}
                          onClick={() => setSelectedJobId(q.id)}
                          className={`cursor-pointer transition-colors ${
                            isSel ? 'bg-indigo-950/35' : 'hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="py-3 pr-3 font-medium text-slate-100 whitespace-nowrap">
                            {q.name}
                            <span className="block text-xs font-normal text-slate-500">{q.type}</span>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-300 whitespace-nowrap">{q.mode}</td>
                          <td className="py-3 px-3 text-xs font-mono text-slate-300 max-w-[160px] truncate">
                            {q.mediaUrl ? q.mediaName || q.mediaUrl : 'Text Only'}
                          </td>
                          <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {q.scheduleDate} · {q.scheduleTime}
                          </td>
                          <td className="py-3 px-3 text-xs whitespace-nowrap">
                            {q.status === 'failed' ? (
                              <span className="text-rose-400 font-medium">Failed</span>
                            ) : q.status === 'running' ? (
                              <span className="text-amber-400 font-medium">Running</span>
                            ) : (
                              <span className="text-emerald-400 font-medium">Armed</span>
                            )}
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${q.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteJob(q.id);
                              }}
                              className="p-1.5 rounded-md bg-rose-950/60 hover:bg-rose-900 text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Live Target Inspector</h3>
            {selectedJob ? (
              <div className="space-y-4 mt-4 text-xs">
                <div className="space-y-1">
                  <div className="text-slate-500">Target · Type</div>
                  <div className="text-sm font-medium text-slate-100">
                    {selectedJob.name} · {selectedJob.type}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-500">Scheduled Trigger</div>
                  <div className="font-mono tabular-nums text-slate-200">
                    {selectedJob.scheduleDate} at {selectedJob.scheduleTime}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-500">Caption / Synced Comment</div>
                  <div className="bg-[#0b1120] border border-slate-800 rounded-lg p-3 text-slate-300 leading-relaxed">
                    {selectedJob.caption || 'No caption set'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-slate-500">Cloud Media Preview</div>
                  {selectedJob.mediaUrl && selectedJob.mediaType === 'image' ? (
                    <img
                      src={selectedJob.mediaUrl}
                      alt={selectedJob.mediaName}
                      referrerPolicy="no-referrer"
                      className="w-full h-40 object-cover rounded-lg border border-slate-800"
                    />
                  ) : selectedJob.mediaUrl && selectedJob.mediaType === 'video' ? (
                    <video
                      src={selectedJob.mediaUrl}
                      controls
                      className="w-full h-40 object-cover rounded-lg border border-slate-800 bg-black"
                    />
                  ) : (
                    <div className="h-24 rounded-lg border border-slate-800 bg-[#0b1120] flex items-center justify-center text-slate-500">
                      No media file attached
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-4">
                Select a target row from the queue to inspect its media and payload.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Execution Proofs History</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Completed cloud runs and verified Meta Graph API post receipts
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {state.proofs.length} Record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                <th className="py-2 pr-4">Executed At</th>
                <th className="py-2 px-3">Target</th>
                <th className="py-2 px-3">Mode</th>
                <th className="py-2 px-3">Result</th>
                <th className="py-2 pl-3">Details / Post ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {state.proofs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No executions recorded yet. Run a target above to capture an execution proof.
                  </td>
                </tr>
              ) : (
                state.proofs.slice(0, 12).map((pr) => (
                  <tr key={pr.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {pr.executedAt}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-200 whitespace-nowrap">
                      {pr.targetName} · {pr.targetType}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">{pr.mode}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {pr.status === 'published-live' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Published Live
                        </span>
                      ) : pr.status === 'verified-cloud-run' ? (
                        <span className="text-indigo-400 font-medium">Verified Cloud Run</span>
                      ) : (
                        <span className="text-rose-400 font-medium">Failed</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-400">
                      {pr.postId ? `Post ID: ${pr.postId} — ` : ''}
                      {pr.note}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
