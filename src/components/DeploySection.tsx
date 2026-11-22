import React, {useEffect, useState} from 'react';
import {Check, Copy, ExternalLink, GitBranch, Rocket, ShieldCheck} from 'lucide-react';
import type {AppStateResponse} from '../types';
import {fetchDeployFiles, pushProjectToGithub, verifyGithubToken} from '../api';

interface DeploySectionProps {
  state: AppStateResponse;
  onStateChange: (next: AppStateResponse) => void;
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const DeploySection: React.FC<DeploySectionProps> = ({
  state,
  onStateChange,
  onNotify,
}) => {
  const [githubToken, setGithubToken] = useState('');
  const [repoName, setRepoName] = useState('fb-insta-pro-auto-scheduler');
  const [branch, setBranch] = useState('main');
  const [isPrivate, setIsPrivate] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Deploy FB & Insta Pro Auto-Scheduler Cloud');

  const [verifying, setVerifying] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [pushResult, setPushResult] = useState<{
    repoUrl: string;
    branch: string;
    commitSha: string;
    filesPushed: number;
    renderDeployUrl: string;
  } | null>(null);

  const [activeFileTab, setActiveFileTab] = useState<'render' | 'workflow' | 'docker'>('render');
  const [deployFiles, setDeployFiles] = useState<{
    dockerfile: string;
    renderYaml: string;
    githubWorkflow: string;
  }>({dockerfile: '', renderYaml: '', githubWorkflow: ''});

  useEffect(() => {
    void fetchDeployFiles()
      .then(setDeployFiles)
      .catch(() => {});
  }, []);

  const currentWebLink =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : state.liveAppUrl;

  async function handleCopyLiveLink() {
    try {
      await navigator.clipboard.writeText(currentWebLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      onNotify('Live software link copied to clipboard.', 'success');
    } catch {
      onNotify('Copy the URL directly from the box.', 'info');
    }
  }

  async function handleVerifyToken() {
    setVerifying(true);
    try {
      const res = await verifyGithubToken(githubToken);
      onStateChange(res.state);
      onNotify(`GitHub verified as @${res.login}.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'GitHub verification failed.', 'error');
    } finally {
      setVerifying(false);
    }
  }

  async function handlePushToGithub(e: React.FormEvent) {
    e.preventDefault();
    setPushing(true);
    try {
      const res = await pushProjectToGithub({
        token: githubToken,
        repoName,
        isPrivate,
        branch,
        commitMessage,
      });
      onStateChange(res.state);
      setPushResult({
        repoUrl: res.repoUrl,
        branch: res.branch,
        commitSha: res.commitSha,
        filesPushed: res.filesPushed,
        renderDeployUrl: res.renderDeployUrl,
      });
      onNotify(`Pushed ${res.filesPushed} files to ${res.repoUrl}.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'GitHub push failed.', 'error');
    } finally {
      setPushing(false);
    }
  }

  const activeConfigText =
    activeFileTab === 'render'
      ? deployFiles.renderYaml
      : activeFileTab === 'workflow'
      ? deployFiles.githubWorkflow
      : deployFiles.dockerfile;

  return (
    <div className="space-y-6">
      <section className="bg-[#0f172a] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Live Cloud Access Link (No PC Needed)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Open this link from any phone, tablet, or browser to sign into Facebook inside Cloud Browser and run scheduled posts 24/7.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={currentWebLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3.5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in New Tab
            </a>
            <button
              type="button"
              onClick={handleCopyLiveLink}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Copied' : 'Copy Live Link'}
            </button>
          </div>
        </div>

        <div className="mt-4 bg-[#0b1120] border border-slate-800 rounded-lg px-4 py-3 font-mono text-xs text-emerald-400 break-all">
          {currentWebLink}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-6 bg-[#0f172a] border border-slate-800 rounded-xl p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Push Code to GitHub & Go Live
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Creates or updates your GitHub repository directly with Cloud Chromium Dockerfile, Render blueprint, and your original Python script included.
              </p>
            </div>
            {state.browser.githubConnected && (
              <span className="text-xs text-emerald-400 font-medium whitespace-nowrap">
                @{state.browser.githubUserName}
              </span>
            )}
          </div>

          <form onSubmit={handlePushToGithub} className="space-y-4">
            <div>
              <label htmlFor="gh-token-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                GitHub Personal Access Token (repo scope)
              </label>
              <div className="flex gap-2">
                <input
                  id="gh-token-input"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder={
                    state.browser.githubConnected
                      ? 'Token active in server memory (paste new to switch)'
                      : 'ghp_... or github_pat_...'
                  }
                  className="flex-1 bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600"
                />
                <button
                  type="button"
                  disabled={verifying}
                  onClick={handleVerifyToken}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium px-3.5 py-2 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  {verifying ? 'Checking...' : 'Verify'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="gh-repo-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Repository Name
                </label>
                <input
                  id="gh-repo-input"
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>
              <div>
                <label htmlFor="gh-branch-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Target Branch
                </label>
                <input
                  id="gh-branch-input"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="gh-commit-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                Commit Message
              </label>
              <input
                id="gh-commit-input"
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="w-full bg-[#0b1120] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                />
                Create as Private Repository
              </label>

              <button
                type="submit"
                disabled={pushing}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <GitBranch className="w-4 h-4" />
                {pushing ? 'Pushing to GitHub...' : 'Create Repo & Push to GitHub'}
              </button>
            </div>
          </form>

          {pushResult && (
            <div className="mt-5 pt-4 border-t border-slate-800 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <ShieldCheck className="w-4 h-4" />
                Pushed {pushResult.filesPushed} files · Commit {pushResult.commitSha.slice(0, 7)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={pushResult.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-2 rounded-lg font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open GitHub Repository
                </a>
                <a
                  href={pushResult.renderDeployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg font-semibold"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  Deploy Live on Render
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-6 bg-[#0f172a] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Cloud Chromium Deployment Blueprints
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automatically pushed with your repository so Cloud Browser runs 24/7
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveFileTab('render')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    activeFileTab === 'render' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
                  }`}
                >
                  render.yaml
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFileTab('workflow')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    activeFileTab === 'workflow' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
                  }`}
                >
                  Actions CI
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFileTab('docker')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    activeFileTab === 'docker' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
                  }`}
                >
                  Dockerfile
                </button>
              </div>
            </div>

            <pre className="bg-[#060913] border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed">
              {activeConfigText || 'Loading deployment configuration...'}
            </pre>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
            <div className="font-medium text-slate-200">Quick Cloud Go-Live Steps:</div>
            <p>1. Enter your GitHub Personal Access Token above and click Create Repo & Push to GitHub.</p>
            <p>2. Click Deploy Live on Render (or connect the GitHub repo in Railway / Cloud Run).</p>
            <p>3. Open the live link from any phone or browser and log into Facebook inside Tab 01.</p>
          </div>
        </section>
      </div>
    </div>
  );
};
