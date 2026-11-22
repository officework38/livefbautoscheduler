import React, {useRef, useState} from 'react';
import {
  ArrowRight,
  CalendarClock,
  FileText,
  Pencil,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import type {AppStateResponse, PageTarget} from '../types';
import {
  applyBulkCaption,
  applyBulkSchedule,
  clearPagesTable,
  deletePageRow,
  importTxtMediaList,
  transferToScheduler,
  undoPagesDelete,
  updatePageRow,
  uploadCloudMedia,
} from '../api';

interface MediaStudioSectionProps {
  state: AppStateResponse;
  onStateChange: (next: AppStateResponse) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (tab: 'accounts' | 'media' | 'scheduler' | 'terminal' | 'deploy') => void;
}

export const MediaStudioSection: React.FC<MediaStudioSectionProps> = ({
  state,
  onStateChange,
  onNotify,
  onNavigate,
}) => {
  const [bulkCaption, setBulkCaption] = useState(
    'Check out this amazing update! Follow for more. #viral #reels #trending'
  );
  const [applyAllCap, setApplyAllCap] = useState(true);
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkTime, setBulkTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [editingRow, setEditingRow] = useState<PageTarget | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const singleRowUploadTarget = useRef<string | null>(null);

  function toggleRow(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    if (selectedIds.length === state.pages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(state.pages.map((p) => p.id));
    }
  }

  async function handleApplyCaption() {
    try {
      const next = await applyBulkCaption(bulkCaption, applyAllCap, selectedIds);
      onStateChange(next);
      onNotify(
        applyAllCap
          ? 'Applied bulk caption to all pages.'
          : `Applied bulk caption to ${selectedIds.length} selected row(s).`,
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to apply caption.', 'error');
    }
  }

  async function handleApplySchedule() {
    try {
      const next = await applyBulkSchedule(bulkDate, bulkTime);
      onStateChange(next);
      onNotify(`Applied schedule ${bulkDate} ${bulkTime} to all rows.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Invalid date or time format.', 'error');
    }
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const targetIds = singleRowUploadTarget.current
      ? [singleRowUploadTarget.current]
      : selectedIds;
    singleRowUploadTarget.current = null;

    setUploading(true);
    try {
      const res = await uploadCloudMedia(file, targetIds);
      onStateChange(res.state);
      onNotify(`Uploaded "${res.filename}" and assigned to target(s).`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Media upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleTxtImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const next = await importTxtMediaList(text);
      onStateChange(next);
      onNotify(`Imported media list from "${file.name}".`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not import .txt file.', 'error');
    }
  }

  async function handleDeleteRow(id: string) {
    try {
      const next = await deletePageRow(id);
      onStateChange(next);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      onNotify('Row removed (Ctrl+Z or Undo to restore).', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  async function handleUndo() {
    try {
      const next = await undoPagesDelete();
      onStateChange(next);
      onNotify('Restored deleted row.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Nothing to undo.', 'info');
    }
  }

  async function handleClearTable() {
    try {
      const next = await clearPagesTable();
      onStateChange(next);
      setSelectedIds([]);
      onNotify('Cleared table (Undo available).', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not clear table.', 'error');
    }
  }

  async function handleProceedToScheduler() {
    try {
      const next = await transferToScheduler();
      onStateChange(next);
      onNotify(`Transferred ${next.queue.length} target(s) to Master Scheduler.`, 'success');
      onNavigate('scheduler');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Add at least one page first.', 'error');
    }
  }

  function openEditModal(row: PageTarget) {
    setEditingRow(row);
    setEditCaption(row.caption);
    setEditDate(row.scheduleDate);
    setEditTime(row.scheduleTime);
  }

  async function saveRowEdits(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;
    try {
      const next = await updatePageRow(editingRow.id, {
        caption: editCaption,
        scheduleDate: editDate,
        scheduleTime: editTime,
      });
      onStateChange(next);
      setEditingRow(null);
      onNotify(`Updated "${editingRow.name}".`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={mediaInputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={handleMediaUpload}
      />
      <input
        ref={txtInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleTxtImport}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-slate-100">Bulk Caption Injector</h2>
              <span className="text-xs text-slate-500">One-Click Apply</span>
            </div>
            <textarea
              rows={2}
              value={bulkCaption}
              onChange={(e) => setBulkCaption(e.target.value)}
              placeholder="Write post caption and hashtags..."
              className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyAllCap}
                onChange={(e) => setApplyAllCap(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
              />
              Apply to ALL Pages ({selectedIds.length} selected)
            </label>
            <button
              type="button"
              onClick={handleApplyCaption}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Apply Caption
            </button>
          </div>
        </section>

        <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-slate-100">Global Schedule Setter</h2>
              <span className="text-xs text-slate-500 font-mono">YYYY-MM-DD · HH:MM</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bulk-date-input" className="block text-xs text-slate-400 mb-1">
                  Schedule Date
                </label>
                <input
                  id="bulk-date-input"
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="bulk-time-input" className="block text-xs text-slate-400 mb-1">
                  Schedule Time
                </label>
                <input
                  id="bulk-time-input"
                  type="time"
                  value={bulkTime}
                  onChange={(e) => setBulkTime(e.target.value)}
                  className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4">
            <span className="text-xs text-slate-500">Syncs with your local timezone automatically</span>
            <button
              type="button"
              onClick={handleApplySchedule}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Apply to All
            </button>
          </div>
        </section>
      </div>

      <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Fetched Real Pages & Media Assignment Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload your videos/photos here so the Cloud Browser can upload them directly into Facebook.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                singleRowUploadTarget.current = null;
                mediaInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading...' : 'Upload Video / Photo'}
            </button>

            <button
              type="button"
              onClick={() => txtInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Import .txt List
            </button>

            <button
              type="button"
              disabled={!state.canUndoPages}
              onClick={handleUndo}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo (Ctrl+Z)
            </button>

            <button
              type="button"
              onClick={handleClearTable}
              className="inline-flex items-center gap-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Table
            </button>

            <button
              type="button"
              onClick={handleProceedToScheduler}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Proceed to Master Scheduler
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                <th className="py-2.5 pr-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={state.pages.length > 0 && selectedIds.length === state.pages.length}
                    onChange={toggleAll}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                  />
                </th>
                <th className="py-2.5 pr-4">Profile / Real Page Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Assigned Media File</th>
                <th className="py-2.5 px-3">Post Text / Caption</th>
                <th className="py-2.5 px-3">Schedule</th>
                <th className="py-2.5 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm">
              {state.pages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No pages in matrix. Go to Browser & Profile to fetch or add pages.
                  </td>
                </tr>
              ) : (
                state.pages.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                      />
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-100 whitespace-nowrap">{row.name}</td>
                    <td className="py-3 px-3 text-xs text-slate-400 whitespace-nowrap">{row.type}</td>
                    <td className="py-3 px-3 text-xs font-mono text-slate-300 max-w-[200px] truncate">
                      {row.mediaPath ? (
                        <span className="text-emerald-400">{row.mediaName || row.mediaPath}</span>
                      ) : (
                        <span className="text-slate-500">Not Assigned</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-300 max-w-[240px] truncate">{row.caption}</td>
                    <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {row.scheduleDate} · {row.scheduleTime}
                    </td>
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Upload media for this row"
                          onClick={() => {
                            singleRowUploadTarget.current = row.id;
                            mediaInputRef.current?.click();
                          }}
                          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit caption or schedule"
                          onClick={() => openEditModal(row)}
                          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Remove row"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1.5 rounded-md bg-rose-950/60 hover:bg-rose-900 text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingRow && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl w-full max-w-lg p-6">
            <h3 className="text-base font-semibold text-slate-100">
              Edit Target · {editingRow.name}
            </h3>
            <form onSubmit={saveRowEdits} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Post Text / Caption</label>
                <textarea
                  rows={3}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
