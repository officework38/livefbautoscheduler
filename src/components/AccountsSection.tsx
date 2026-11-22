import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cookie,
  Download,
  Globe,
  Plus,
  Power,
  RefreshCw,
  Send,
  UserCheck,
} from 'lucide-react';
import type {AppStateResponse, TargetType} from '../types';
import {
  addManualPage,
  closeCloudBrowser,
  fetchBrowserViewport,
  fetchPagesSystemB,
  importBrowserCookies,
  openCloudBrowser,
  sendBrowserClick,
  sendBrowserKey,
  sendBrowserScroll,
  sendBrowserText,
  switchBrowserProfile,
} from '../api';

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
  const [opening, setOpening] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [frame, setFrame] = useState<{imageBase64: string; url: string; loggedIn: boolean}>({
    imageBase64: '',
    url: 'about:blank',
    loggedIn: false,
  });

  const [typeInput, setTypeInput] = useState('');
  const [cookieInput, setCookieInput] = useState('');
  const [showCookieBox, setShowCookieBox] = useState(false);

  const [newProfileName, setNewProfileName] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<TargetType>('Page');
  const [manualUrl, setManualUrl] = useState('https://www.facebook.com/');

  const imgRef = useRef<HTMLImageElement | null>(null);

  const pollViewport = useCallback(async () => {
    if (!state.browser.browserOpen) return;
    try {
      const next = await fetchBrowserViewport();
      setFrame(next);
    } catch {
      // Ignore transient frame poll failure
    }
  }, [state.browser.browserOpen]);

  useEffect(() => {
    if (!state.browser.browserOpen) return;
    void pollViewport();
    const timer = setInterval(() => {
      void pollViewport();
    }, 1000);
    return () => clearInterval(timer);
  }, [state.browser.browserOpen, pollViewport]);

  async function handleOpenBrowser() {
    setOpening(true);
    try {
      const next = await openCloudBrowser();
      onStateChange(next);
      const snap = await fetchBrowserViewport();
      setFrame(snap);
      onNotify(
        snap.loggedIn
          ? 'Facebook already logged in! Click "2. Fetch Pages (System B)".'
          : 'Cloud Browser opened Facebook. Click inside the screen below to sign in.',
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to launch Cloud Browser.', 'error');
    } finally {
      setOpening(false);
    }
  }

  async function handleCloseBrowser() {
    try {
      const next = await closeCloudBrowser();
      onStateChange(next);
      setFrame({imageBase64: '', url: 'about:blank', loggedIn: false});
      onNotify('Cloud Browser closed (login cookies saved in profile).', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Close failed.', 'error');
    }
  }

  async function handleFetchPages() {
    setFetching(true);
    try {
      const next = await fetchPagesSystemB();
      onStateChange(next);
      onNotify(`Fetched ${next.pages.length} Facebook target(s) into Pages & Media!`, 'success');
      onNavigate('media');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Page fetch failed.', 'error');
    } finally {
      setFetching(false);
    }
  }

  async function handleSwitchProfile(name: string) {
    try {
      const next = await switchBrowserProfile(name);
      onStateChange(next);
      setNewProfileName('');
      onNotify(`Active browser profile set to "${name}".`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Profile switch failed.', 'error');
    }
  }

  async function handleImportCookies(e: React.FormEvent) {
    e.preventDefault();
    if (!cookieInput.trim()) return;
    try {
      const next = await importBrowserCookies(cookieInput);
      onStateChange(next);
      setCookieInput('');
      setShowCookieBox(false);
      const snap = await fetchBrowserViewport();
      setFrame(snap);
      onNotify('Cookies imported into Cloud Browser profile.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Cookie import failed.', 'error');
    }
  }

  async function handleViewportClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    try {
      const snap = await sendBrowserClick(x, y);
      setFrame(snap);
    } catch {
      // Ignore click error
    }
  }

  async function handleSendText(e: React.FormEvent) {
    e.preventDefault();
    if (!typeInput) return;
    try {
      const snap = await sendBrowserText(typeInput);
      setFrame(snap);
      setTypeInput('');
    } catch {
      // Ignore type error
    }
  }

  async function handleSendKey(key: string) {
    try {
      const snap = await sendBrowserKey(key);
      setFrame(snap);
    } catch {
      // Ignore key error
    }
  }

  async function handleScroll(deltaY: number) {
    try {
      const snap = await sendBrowserScroll(deltaY);
      setFrame(snap);
    } catch {
      // Ignore scroll error
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim()) {
      onNotify('Enter a real Facebook Page name.', 'error');
      return;
    }
    try {
      const next = await addManualPage({
        name: manualName.trim(),
        type: manualType,
        url: manualUrl.trim(),
      });
      onStateChange(next);
      setManualName('');
      onNotify(`Added "${manualName.trim()}" to Pages & Media table.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to add manual page.', 'error');
    }
  }

  const isLoggedIn = frame.loggedIn || state.browser.loggedIn;

  return (
    <div className="space-y-6">
      <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Cloud Browser & Session Engine (System B)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Runs real Chromium directly on this server — sign into Facebook right here without any API token or PC.
            </p>
          </div>
          <div className="text-xs font-medium text-slate-400">
            {isLoggedIn ? (
              <span className="text-emerald-400 inline-flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                Facebook Logged In
              </span>
            ) : state.browser.browserOpen ? (
              <span className="text-amber-400">Browser Open · Login Needed</span>
            ) : (
              <span>Browser Idle</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button
            type="button"
            disabled={opening || state.browser.browserBusy}
            onClick={handleOpenBrowser}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Globe className="w-4 h-4" />
            {opening ? 'Opening Cloud Browser...' : '1. Open Cloud Browser (Facebook)'}
          </button>

          <button
            type="button"
            disabled={fetching || state.browser.browserBusy}
            onClick={handleFetchPages}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching Pages...' : '2. Fetch Pages + Automation (System B)'}
          </button>

          <button
            type="button"
            onClick={() => setShowCookieBox((v) => !v)}
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3.5 py-2.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Cookie className="w-3.5 h-3.5" />
            Import FB Cookies
          </button>

          {state.browser.browserOpen && (
            <button
              type="button"
              onClick={handleCloseBrowser}
              className="inline-flex items-center gap-2 bg-rose-950/70 hover:bg-rose-900 text-rose-200 text-xs font-medium px-3.5 py-2.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" />
              Close Browser
            </button>
          )}

          <a
            href="/api/download-python"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white ml-auto whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download Original .py
          </a>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-400">Active Profile Folder:</span>
          <select
            aria-label="Select Cloud Browser Profile"
            value={state.browser.activeProfile}
            onChange={(e) => void handleSwitchProfile(e.target.value)}
            className="bg-[#0b1120] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
          >
            {state.browser.availableProfiles.map((prof) => (
              <option key={prof} value={prof}>
                {prof}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="New profile name (e.g. Account_2)"
            className="bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={() => newProfileName.trim() && void handleSwitchProfile(newProfileName.trim())}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer"
          >
            Create / Switch Profile
          </button>
        </div>

        {showCookieBox && (
          <form onSubmit={handleImportCookies} className="mt-4 p-4 bg-[#0b1120] border border-slate-800 rounded-lg space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Optional Quick Login: Paste Facebook Cookie Header (`c_user=...; xs=...;`) or Cookie JSON
            </label>
            <textarea
              rows={2}
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              placeholder="c_user=1000...; xs=...; datr=...;"
              className="w-full bg-[#060913] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCookieBox(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer"
              >
                Apply Cookies & Open Facebook
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-8 bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Live Cloud Browser Screen (Click & Type to Sign In)
              </h3>
              <p className="text-xs text-slate-400 font-mono truncate max-w-lg mt-0.5">
                {frame.url !== 'about:blank' ? frame.url : 'Click "1. Open Cloud Browser" above to load Facebook here'}
              </p>
            </div>

            {state.browser.browserOpen && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleScroll(-350)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                  title="Scroll Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleScroll(350)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                  title="Scroll Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendKey('Enter')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                >
                  Enter
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendKey('Backspace')}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded text-slate-200 cursor-pointer"
                >
                  Backspace
                </button>
              </div>
            )}
          </div>

          {frame.imageBase64 ? (
            <div className="mt-3 space-y-3">
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-black">
                <img
                  ref={imgRef}
                  src={`data:image/jpeg;base64,${frame.imageBase64}`}
                  alt="Live Cloud Browser Viewport"
                  onClick={(e) => void handleViewportClick(e)}
                  className="w-full h-auto cursor-crosshair block"
                />
              </div>
              <form onSubmit={handleSendText} className="flex gap-2">
                <input
                  type="text"
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value)}
                  placeholder="Click an input on the screen above, then type text here and press Send..."
                  className="flex-1 bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Type Text
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-4 flex-1 min-h-[260px] bg-[#060913] border border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-6">
              <Globe className="w-8 h-8 text-slate-600 mb-3" />
              <div className="text-sm font-medium text-slate-300">Cloud Browser Ready</div>
              <p className="text-xs text-slate-500 max-w-md mt-1">
                Click "1. Open Cloud Browser (Facebook)" to open a real Chrome session on the server. Log into Facebook once, then click "2. Fetch Pages + Automation (System B)".
              </p>
            </div>
          )}
        </section>

        <section className="lg:col-span-4 bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Add Manual Page / URL</h3>
            <p className="text-xs text-slate-400 mt-1">
              Add a target directly if you already know its Facebook Page URL.
            </p>
            <form onSubmit={handleAddManual} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Page / Profile Name</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Asif Ahmad"
                  className="w-full bg-[#0b1120] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as TargetType)}
                  className="w-full bg-[#0b1120] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                >
                  <option value="Page">Page</option>
                  <option value="Personal">Personal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Facebook URL</label>
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  className="w-full bg-[#0b1120] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold py-2.5 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Real Page Target
              </button>
            </form>
          </div>

          <div className="pt-4 border-t border-slate-800 text-xs space-y-1.5">
            <div className="font-semibold text-slate-200">Session Diagnostics</div>
            <div className="text-slate-400">
              Profile: <span className="font-mono text-slate-200">{state.browser.activeProfile}</span>
            </div>
            <div className="text-slate-400">
              Cookies: <span className="font-mono text-slate-300">{state.browser.cookieSummary || 'None yet'}</span>
            </div>
            <div className="text-slate-400">
              Loaded Targets: <span className="font-mono tabular-nums text-slate-200">{state.pages.length}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
