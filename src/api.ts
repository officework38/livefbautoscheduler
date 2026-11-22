import type {AppStateResponse, ExecutionMode, TargetType} from './types';

async function handleJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & {error?: string};
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export async function fetchAppState(): Promise<AppStateResponse> {
  const res = await fetch('/api/state');
  return handleJson<AppStateResponse>(res);
}

export async function connectMetaAccount(accessToken: string): Promise<AppStateResponse> {
  const res = await fetch('/api/meta/connect', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({accessToken}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function disconnectMetaAccount(): Promise<AppStateResponse> {
  const res = await fetch('/api/meta/disconnect', {method: 'POST'});
  return handleJson<AppStateResponse>(res);
}

export async function addManualPage(payload: {
  name: string;
  type: TargetType;
  url: string;
  caption?: string;
}): Promise<AppStateResponse> {
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  return handleJson<AppStateResponse>(res);
}

export async function updatePageRow(
  id: string,
  payload: {
    caption?: string;
    scheduleDate?: string;
    scheduleTime?: string;
    mediaUrl?: string;
    mediaName?: string;
  }
): Promise<AppStateResponse> {
  const res = await fetch(`/api/pages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  return handleJson<AppStateResponse>(res);
}

export async function applyBulkCaption(caption: string, applyAll: boolean, selectedIds: string[]): Promise<AppStateResponse> {
  const res = await fetch('/api/pages/bulk-caption', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({caption, applyAll, selectedIds}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function applyBulkSchedule(scheduleDate: string, scheduleTime: string): Promise<AppStateResponse> {
  const res = await fetch('/api/pages/bulk-schedule', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      scheduleDate,
      scheduleTime,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    }),
  });
  return handleJson<AppStateResponse>(res);
}

export async function importTxtMediaList(content: string): Promise<AppStateResponse> {
  const res = await fetch('/api/pages/import-txt', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({content}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function uploadCloudMedia(file: File, targetIds: string[]): Promise<{
  url: string;
  filename: string;
  state: AppStateResponse;
}> {
  const form = new FormData();
  form.append('file', file);
  form.append('targetIds', JSON.stringify(targetIds));
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    body: form,
  });
  return handleJson(res);
}

export async function deletePageRow(id: string): Promise<AppStateResponse> {
  const res = await fetch(`/api/pages/${encodeURIComponent(id)}`, {method: 'DELETE'});
  return handleJson<AppStateResponse>(res);
}

export async function clearPagesTable(): Promise<AppStateResponse> {
  const res = await fetch('/api/pages/clear', {method: 'POST'});
  return handleJson<AppStateResponse>(res);
}

export async function undoPagesDelete(): Promise<AppStateResponse> {
  const res = await fetch('/api/pages/undo', {method: 'POST'});
  return handleJson<AppStateResponse>(res);
}

export async function transferToScheduler(): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/transfer', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({timezoneOffsetMinutes: new Date().getTimezoneOffset()}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function setExecutionMode(mode: ExecutionMode): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/mode', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({mode}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function startSchedulerEngine(): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/start', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({timezoneOffsetMinutes: new Date().getTimezoneOffset()}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function stopSchedulerEngine(): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/stop', {method: 'POST'});
  return handleJson<AppStateResponse>(res);
}

export async function executeQueueOne(id: string): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/execute-one', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id}),
  });
  return handleJson<AppStateResponse>(res);
}

export async function executeQueueAll(): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/execute-all', {method: 'POST'});
  return handleJson<AppStateResponse>(res);
}

export async function deleteQueueRow(id: string): Promise<AppStateResponse> {
  const res = await fetch(`/api/scheduler/${encodeURIComponent(id)}`, {method: 'DELETE'});
  return handleJson<AppStateResponse>(res);
}

export async function undoQueueDelete(): Promise<AppStateResponse> {
  const res = await fetch('/api/scheduler/undo', {method: 'POST'});
  return handleJson<AppStateResponse>(res);
}

export async function clearServerLogs(): Promise<AppStateResponse> {
  const res = await fetch('/api/logs', {method: 'DELETE'});
  return handleJson<AppStateResponse>(res);
}

export async function fetchDeployFiles(): Promise<{
  dockerfile: string;
  renderYaml: string;
  githubWorkflow: string;
}> {
  const res = await fetch('/api/deploy/files');
  return handleJson(res);
}

export async function verifyGithubToken(token: string): Promise<{login: string; state: AppStateResponse}> {
  const res = await fetch('/api/github/verify', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({token}),
  });
  return handleJson(res);
}

export async function pushProjectToGithub(payload: {
  token: string;
  repoName: string;
  isPrivate: boolean;
  branch: string;
  commitMessage: string;
}): Promise<{
  repoUrl: string;
  branch: string;
  commitSha: string;
  filesPushed: number;
  renderDeployUrl: string;
  state: AppStateResponse;
}> {
  const res = await fetch('/api/github/push', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}
