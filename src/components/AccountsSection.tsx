import React, {useState} from 'react';
import {CheckCircle2, Globe, KeyRound, Plus, RefreshCw, Unplug} from 'lucide-react';
import type {AppStateResponse, TargetType} from '../types';
import {addManualPage, connectMetaAccount, disconnectMetaAccount} from '../api';

interface AccountsSectionProps {
  state: AppStateResponse;
  onStateChange: (next: AppStateResponse) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (tab: 'accounts' | 'media' | 'scheduler' | 'terminal' | 'deploy') => void;
}

export const AccountsSection: React.FC<AccountsSectionProps> = ({
  state,
  onStateChange,
  onNotify,
  onNavigate,
}) => {
  const [metaToken, setMetaToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<TargetType>('Page');
  const [manualUrl, setManualUrl] = useState('https://www.facebook.com/');
  const [addingManual, setAddingManual] = useState(false);

  async function handleConnectMeta(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      const next = await connectMetaAccount(metaToken);
      onStateChange(next);
      setMetaToken('');
      onNotify(`Fetched ${next.pages.length} Facebook & Instagram target(s) into Pages & Media Studio.`, 'success');
      onNavigate('media');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Meta connection failed.', 'error');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnectMeta() {
    try {
      const next = await disconnectMetaAccount();
      onStateChange(next);
      onNotify('Meta Graph API session cleared from server memory.', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not disconnect session.', 'error');
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim()) {
      onNotify('Enter a Page or Profile name.', 'error');
      return;
    }
    setAddingManual(true);
    try {
      const next = await addManualPage({
        name: manualName.trim(),
        type: manualType,
        url: manualUrl.trim(),
      });
      onStateChange(next);
      setManualName('');
      onNotify(`Added "${manualName.trim()}" to Pages & Media Studio.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to add manual target.', 'error');
    } finally {
      setAddingManual(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  01. Cloud Meta Account & Page Fetch
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Fetch your managed Facebook Pages and linked Instagram Business accounts directly in the cloud — no local Chrome or PC required.
                </p>
              </div>
              <span className="text-xs font-medium whitespace-nowrap shrink-0 text-slate-400">
                {state.connections.metaConnected ? (
                  <span className="text-emerald-400">Connected · {state.connections.metaUserName}</span>
                ) : (
                  'Disconnected'
                )}
              </span>
            </div>

            <form onSubmit={handleConnectMeta} className="space-y-4 mt-5">
              <div>
                <label htmlFor="meta-token-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Meta Graph API Access Token (User or System User Token)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="meta-token-input"
                    type="password"
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder={
                      state.connections.metaConnected
                        ? 'Token active in server memory (paste new token to refresh)'
                        : 'EAAG... paste token from Meta Graph Explorer'
                    }
                    className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 font-mono"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Tokens remain strictly in server memory during your cloud session and are never saved to disk or pushed to GitHub.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={connecting}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${connecting ? 'animate-spin' : ''}`} />
                  {connecting ? 'Fetching Pages...' : 'Fetch Facebook & Insta Pages'}
                </button>

                {state.connections.metaConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectMeta}
                    className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Unplug className="w-4 h-4" />
                    Disconnect Session
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onNavigate('media')}
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 px-2 py-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Pages & Media Studio →
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-slate-500">Runtime Mode</div>
              <div className="text-slate-200 font-medium mt-0.5">24/7 Cloud Server</div>
            </div>
            <div>
              <div className="text-slate-500">Loaded Targets</div>
              <div className="text-slate-200 font-mono tabular-nums font-medium mt-0.5">
                {state.pages.length} Page(s)
              </div>
            </div>
            <div>
              <div className="text-slate-500">Live Token Pages</div>
              <div className="text-slate-200 font-mono tabular-nums font-medium mt-0.5">
                {state.pages.filter((p) => p.hasLiveToken).length} Verified
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Add Manual Page or Profile</h2>
            <p className="text-sm text-slate-400 mt-1">
              Add any Facebook Page, Personal Profile, or Instagram handle directly to your cloud scheduling matrix.
            </p>

            <form onSubmit={handleAddManual} className="space-y-3.5 mt-5">
              <div>
                <label htmlFor="manual-page-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Page / Profile Name
                </label>
                <input
                  id="manual-page-name"
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Tech Reels Daily"
                  className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="manual-page-type" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Account Type
                  </label>
                  <select
                    id="manual-page-type"
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as TargetType)}
                    className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="Page">Facebook Page</option>
                    <option value="Personal">Personal Profile</option>
                    <option value="Instagram">Instagram Business</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="manual-page-url" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Target URL
                  </label>
                  <input
                    id="manual-page-url"
                    type="url"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="https://www.facebook.com/..."
                    className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={addingManual}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {addingManual ? 'Adding Target...' : 'Add Target to Media Table'}
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              Shareable link active without PC
            </span>
            <button
              type="button"
              onClick={() => onNavigate('deploy')}
              className="text-indigo-400 hover:text-indigo-300 font-medium whitespace-nowrap cursor-pointer"
            >
              GitHub & Live Link →
            </button>
          </div>
        </section>
      </div>

      <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Active Cloud Session & Target Snapshot</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified targets currently loaded in your cloud workspace
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {state.pages.length} Target(s) · {state.queue.length} Armed in Queue
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                <th className="py-2.5 pr-4">Target Name</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Destination URL</th>
                <th className="py-2.5 pl-4 text-right">Publishing Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm">
              {state.pages.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No pages loaded yet. Connect a Meta Access Token or add a manual page above.
                  </td>
                </tr>
              ) : (
                state.pages.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pr-4 font-medium text-slate-100">{p.name}</td>
                    <td className="py-3 px-4 text-slate-300">{p.type}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-xs truncate max-w-xs">{p.url}</td>
                    <td className="py-3 pl-4 text-right text-xs">
                      {p.hasLiveToken ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Live Graph API
                        </span>
                      ) : (
                        <span className="text-slate-400">Cloud Queue Mode</span>
                      )}
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
