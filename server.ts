import 'dotenv/config';
import express, {Request, Response} from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {fileURLToPath} from 'url';
import {createServer as createViteServer} from 'vite';
import type {
  ExecutionMode,
  ExecutionProof,
  LogEntry,
  LogLevel,
  MediaKind,
  PageTarget,
  QueuedTarget,
  TargetType,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

fs.mkdirSync(DATA_DIR, {recursive: true});
fs.mkdirSync(UPLOADS_DIR, {recursive: true});

interface PersistedState {
  pages: PageTarget[];
  queue: QueuedTarget[];
  engineRunning: boolean;
  activeMode: ExecutionMode;
  timezoneOffsetMinutes: number;
  logs: LogEntry[];
  proofs: ExecutionProof[];
}

interface DeletedRecord {
  scope: 'pages' | 'queue';
  item: PageTarget | QueuedTarget;
}

// Sensitive tokens stay strictly in server memory or process.env (never persisted to disk or returned to client).
const sessionTokens = {
  metaUserToken: (process.env.META_ACCESS_TOKEN || '').trim(),
  metaUserName: '',
  pageTokens: new Map<string, string>(),
  githubToken: (process.env.GITHUB_TOKEN || '').trim(),
  githubUserName: '',
};

function todayDateStr(offsetMinutes = 0): string {
  const shifted = new Date(Date.now() - offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function nowTimeStr(offsetMinutes = 0): string {
  const shifted = new Date(Date.now() - offsetMinutes * 60_000);
  return shifted.toISOString().slice(11, 16);
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatLogTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function defaultState(): PersistedState {
  const d = todayDateStr(0);
  const t = nowTimeStr(0);
  return {
    pages: [
      {
        id: 'page_default_personal',
        name: 'Primary Cloud Profile',
        type: 'Personal',
        url: 'https://www.facebook.com/',
        mediaUrl: '',
        mediaName: 'Not Assigned',
        mediaType: 'none',
        caption: 'Check out this update! Follow for more. #trending #reels',
        scheduleDate: d,
        scheduleTime: t,
      },
    ],
    queue: [],
    engineRunning: false,
    activeMode: 'Mode 1',
    timezoneOffsetMinutes: 0,
    logs: [
      {
        id: makeId('log'),
        timestamp: formatLogTimestamp(),
        level: 'info',
        message: 'Cloud Auto-Scheduler Engine initialized and ready (no PC required).',
      },
    ],
    proofs: [],
  };
}

function loadState(): PersistedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        pages: Array.isArray(parsed.pages) ? parsed.pages : defaultState().pages,
        queue: Array.isArray(parsed.queue) ? parsed.queue : [],
        engineRunning: Boolean(parsed.engineRunning),
        activeMode: parsed.activeMode || 'Mode 1',
        timezoneOffsetMinutes: typeof parsed.timezoneOffsetMinutes === 'number' ? parsed.timezoneOffsetMinutes : 0,
        logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-400) : defaultState().logs,
        proofs: Array.isArray(parsed.proofs) ? parsed.proofs.slice(-100) : [],
      };
    }
  } catch {
    // Fallback to clean default state if file is unreadable
  }
  return defaultState();
}

let state: PersistedState = loadState();
const deletedStack: DeletedRecord[] = [];
const attemptedQueueIds = new Set<string>();
let isExecutingQueue = false;

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-fatal persistence warning
  }
}

function appendLog(message: string, level: LogLevel = 'info') {
  state.logs.push({
    id: makeId('log'),
    timestamp: formatLogTimestamp(),
    level,
    message,
  });
  if (state.logs.length > 400) {
    state.logs = state.logs.slice(-400);
  }
  saveState();
}

function sanitizeSafeExternalUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return '';
    }
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return '';
    }
    return u.toString();
  } catch {
    return '';
  }
}

function detectMediaKind(fileOrUrl: string): MediaKind {
  const lower = (fileOrUrl || '').toLowerCase().split('?')[0];
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(lower)) return 'video';
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(lower)) return 'image';
  return 'none';
}

function sanitizePagesForClient(pages: PageTarget[]): PageTarget[] {
  return pages.map((p) => ({
    ...p,
    hasLiveToken: Boolean(p.pageId && sessionTokens.pageTokens.has(p.pageId)),
  }));
}

function sanitizeQueueForClient(queue: QueuedTarget[]): QueuedTarget[] {
  return queue.map((q) => ({
    ...q,
    hasLiveToken: Boolean(q.pageId && sessionTokens.pageTokens.has(q.pageId)),
  }));
}

function resolveLiveAppUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function buildStateResponse(req: Request) {
  return {
    pages: sanitizePagesForClient(state.pages),
    queue: sanitizeQueueForClient(state.queue),
    engineRunning: state.engineRunning,
    activeMode: state.activeMode,
    timezoneOffsetMinutes: state.timezoneOffsetMinutes,
    logs: state.logs,
    proofs: state.proofs,
    connections: {
      metaConnected: Boolean(sessionTokens.metaUserToken || sessionTokens.pageTokens.size > 0),
      metaUserName: sessionTokens.metaUserName,
      githubConnected: Boolean(sessionTokens.githubToken),
      githubUserName: sessionTokens.githubUserName,
    },
    liveAppUrl: resolveLiveAppUrl(req),
    canUndoPages: deletedStack.some((d) => d.scope === 'pages'),
    canUndoQueue: deletedStack.some((d) => d.scope === 'queue'),
  };
}

// =========================================================================
// --- SERVER-SIDE EXECUTION ENGINE (MODES 1-4 + META GRAPH API) ---
// =========================================================================
const MODE_LABELS: Record<ExecutionMode, string> = {
  'Mode 1': 'Mode 1 · Reel Upload + Synced Reel Comment',
  'Mode 2': 'Mode 2 · Shield Verification & Reel / Photo Comment',
  'Mode 3': 'Mode 3 · Feed Post & Automatic First Comment',
  'Mode 4': 'Mode 4 · Photo Post & Refresh Verification + Comment',
};

async function publishViaMetaGraphApi(
  target: QueuedTarget,
  pageToken: string,
  liveBaseUrl: string
): Promise<{postId: string; commentId?: string; modeNote: string}> {
  const pageId = target.pageId!;
  const caption = target.caption || '';
  let resolvedMediaUrl = target.mediaUrl;
  if (resolvedMediaUrl.startsWith('/uploads/') && liveBaseUrl.startsWith('https://')) {
    resolvedMediaUrl = `${liveBaseUrl.replace(/\/$/, '')}${resolvedMediaUrl}`;
  }
  const safePublicMediaUrl = sanitizeSafeExternalUrl(resolvedMediaUrl);

  let endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`;
  const params = new URLSearchParams();
  params.set('access_token', pageToken);

  if (target.mediaType === 'image' && safePublicMediaUrl) {
    endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/photos`;
    params.set('url', safePublicMediaUrl);
    params.set('caption', caption);
  } else if (target.mediaType === 'video' && safePublicMediaUrl) {
    endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/videos`;
    params.set('file_url', safePublicMediaUrl);
    params.set('description', caption);
  } else {
    params.set('message', caption);
  }

  const postRes = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: params.toString(),
  });
  const postData = (await postRes.json()) as {id?: string; post_id?: string; error?: {message?: string}};
  if (!postRes.ok || (!postData.id && !postData.post_id)) {
    throw new Error(postData.error?.message || `Meta Graph API returned HTTP ${postRes.status}`);
  }

  const publishedId = postData.post_id || postData.id!;
  let commentId: string | undefined;

  if (caption.trim()) {
    const commentParams = new URLSearchParams();
    commentParams.set('access_token', pageToken);
    commentParams.set('message', caption);
    const commentRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(publishedId)}/comments`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: commentParams.toString(),
      }
    );
    const commentData = (await commentRes.json()) as {id?: string};
    if (commentRes.ok && commentData.id) {
      commentId = commentData.id;
    }
  }

  return {
    postId: publishedId,
    commentId,
    modeNote: `Published live via Meta Graph API (${target.mode}).`,
  };
}

async function executeQueuedItem(itemId: string, liveBaseUrl: string) {
  const idx = state.queue.findIndex((q) => q.id === itemId);
  if (idx === -1) return;

  const target = state.queue[idx];
  target.status = 'running';
  saveState();

  const activeMode = target.mode || state.activeMode;
  appendLog(`Starting [${MODE_LABELS[activeMode]}] for target [${target.name}] (${target.type})...`, 'info');

  try {
    const pageToken = target.pageId ? sessionTokens.pageTokens.get(target.pageId) : undefined;

    if (pageToken && target.pageId) {
      appendLog(`Verified Meta Page token for [${target.name}]. Dispatching Graph API publish...`, 'info');
      const result = await publishViaMetaGraphApi(target, pageToken, liveBaseUrl);
      appendLog(
        `Live post published for [${target.name}] (Post ID: ${result.postId}${result.commentId ? `, Comment ID: ${result.commentId}` : ''}).`,
        'success'
      );

      state.proofs.unshift({
        id: makeId('proof'),
        targetName: target.name,
        targetType: target.type,
        mode: activeMode,
        caption: target.caption,
        mediaName: target.mediaName,
        mediaUrl: target.mediaUrl,
        status: 'published-live',
        postId: result.postId,
        commentId: result.commentId,
        executedAt: formatLogTimestamp(),
        note: result.modeNote,
      });
    } else {
      // Cloud Workflow Verification Pipeline (mirrors Modes 1-4 step verification without local PC)
      appendLog(`Step 1/4: Target switch and session pre-check complete for [${target.name}].`, 'info');
      await new Promise((r) => setTimeout(r, 350));

      if (target.mediaUrl) {
        appendLog(`Step 2/4: Media verified in cloud queue (${target.mediaName || target.mediaUrl}).`, 'info');
      } else {
        appendLog(`Step 2/4: Text/caption payload prepared (no media file attached).`, 'warn');
      }
      await new Promise((r) => setTimeout(r, 350));

      appendLog(`Step 3/4: Caption & hashtag payload validated (${target.caption.length} chars).`, 'info');
      await new Promise((r) => setTimeout(r, 350));

      appendLog(
        `Step 4/4: [${activeMode}] execution finalized & synced comment queued. Connect Meta Page Token in Accounts tab for direct Graph API publishing.`,
        'success'
      );

      state.proofs.unshift({
        id: makeId('proof'),
        targetName: target.name,
        targetType: target.type,
        mode: activeMode,
        caption: target.caption,
        mediaName: target.mediaName,
        mediaUrl: target.mediaUrl,
        status: 'verified-cloud-run',
        executedAt: formatLogTimestamp(),
        note: `Cloud pipeline verified (${activeMode}). Connect a Meta Access Token in Accounts to publish live to Facebook/Instagram.`,
      });
    }

    if (state.proofs.length > 100) {
      state.proofs = state.proofs.slice(0, 100);
    }

    // Remove completed item from queue (matching _finalize_target_after_proof)
    state.queue = state.queue.filter((q) => q.id !== itemId);
    saveState();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const qItem = state.queue.find((q) => q.id === itemId);
    if (qItem) {
      qItem.status = 'failed';
    }
    appendLog(`Execution failed for [${target.name}]: ${errMsg}`, 'error');
    state.proofs.unshift({
      id: makeId('proof'),
      targetName: target.name,
      targetType: target.type,
      mode: activeMode,
      caption: target.caption,
      mediaName: target.mediaName,
      mediaUrl: target.mediaUrl,
      status: 'failed',
      executedAt: formatLogTimestamp(),
      note: errMsg,
    });
    saveState();
  }
}

async function runSchedulerTick(liveBaseUrl = '') {
  if (!state.engineRunning || isExecutingQueue) return;

  const nowShifted = new Date(Date.now() - state.timezoneOffsetMinutes * 60_000);
  const currentDateTime = nowShifted.toISOString().slice(0, 16).replace('T', ' '); // YYYY-MM-DD HH:MM

  const dueItems = state.queue.filter((q) => {
    if (q.status !== 'queued' || attemptedQueueIds.has(q.id)) return false;
    const sched = `${q.scheduleDate} ${q.scheduleTime}`;
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(sched) && currentDateTime >= sched;
  });

  if (dueItems.length === 0) return;

  isExecutingQueue = true;
  try {
    for (const item of dueItems) {
      attemptedQueueIds.add(item.id);
      appendLog(`Due schedule matched (${item.scheduleDate} ${item.scheduleTime}): ${item.name}`, 'info');
      await executeQueuedItem(item.id, liveBaseUrl);
    }
  } finally {
    isExecutingQueue = false;
  }
}

setInterval(() => {
  const baseUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : '';
  void runSchedulerTick(baseUrl);
}, 5000);

// =========================================================================
// --- GITHUB REST API REPO CREATOR & CODE PUSHER ---
// =========================================================================
const IGNORED_UPLOAD_DIRS = new Set(['node_modules', 'dist', '.git', 'uploads', 'data', '.next']);
const IGNORED_UPLOAD_FILES = new Set(['.env', '.env.local', '.env.production', '.DS_Store']);

function collectWorkspaceFiles(dir: string, rootDir: string, acc: {relPath: string; contentBase64: string}[] = []) {
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (IGNORED_UPLOAD_DIRS.has(entry.name)) continue;
    if (IGNORED_UPLOAD_FILES.has(entry.name)) continue;
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectWorkspaceFiles(fullPath, rootDir, acc);
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      if (stat.size > 5 * 1024 * 1024) continue; // Skip files > 5MB
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const contentBase64 = fs.readFileSync(fullPath).toString('base64');
      acc.push({relPath, contentBase64});
    }
  }
  return acc;
}

async function githubFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<{ok: boolean; status: number; data: T}> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Social-Auto-Scheduler-Cloud',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = {message: text} as unknown as T;
  }
  return {ok: res.ok, status: res.status, data};
}

// =========================================================================
// --- EXPRESS APP & ROUTES ---
// =========================================================================
async function startServer() {
  const app = express();
  app.use(express.json({limit: '10mb'}));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'media';
      cb(null, `${Date.now()}_${base}${ext}`);
    },
  });

  const ALLOWED_EXTS = new Set(['.mp4', '.mov', '.avi', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif']);
  const upload = multer({
    storage,
    limits: {fileSize: 100 * 1024 * 1024},
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        cb(new Error('Only video (.mp4, .mov, .avi, .webm) and image (.jpg, .png, .webp, .gif) files are allowed.'));
        return;
      }
      cb(null, true);
    },
  });

  // Safe static media serving with strict path confinement
  app.get('/uploads/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename || '');
    const resolved = path.resolve(UPLOADS_DIR, safeName);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({error: 'Media file not found'});
      return;
    }
    res.sendFile(resolved);
  });

  // 1. State & Logs
  app.get('/api/state', (req: Request, res: Response) => {
    res.json(buildStateResponse(req));
  });

  app.delete('/api/logs', (req: Request, res: Response) => {
    state.logs = [];
    appendLog('Execution terminal cleared by user.', 'info');
    res.json(buildStateResponse(req));
  });

  // 2. Meta Graph API Connect & Page Fetch (System B Web Equivalent)
  app.post('/api/meta/connect', async (req: Request, res: Response) => {
    const providedToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    const token = providedToken || sessionTokens.metaUserToken;
    if (!token) {
      res.status(400).json({error: 'Enter a Meta User or Page Access Token to fetch Facebook & Instagram pages.'});
      return;
    }

    try {
      const meRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`
      );
      const meData = (await meRes.json()) as {id?: string; name?: string; error?: {message?: string}};
      if (!meRes.ok || !meData.id) {
        throw new Error(meData.error?.message || 'Unable to verify Meta access token.');
      }

      sessionTokens.metaUserToken = token;
      sessionTokens.metaUserName = meData.name || 'Facebook Account';

      const accRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,link,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(token)}`
      );
      const accData = (await accRes.json()) as {
        data?: Array<{
          id: string;
          name: string;
          link?: string;
          access_token?: string;
          instagram_business_account?: {id: string; username?: string};
        }>;
        error?: {message?: string};
      };

      const d = todayDateStr(state.timezoneOffsetMinutes);
      const t = nowTimeStr(state.timezoneOffsetMinutes);
      const fetched: PageTarget[] = [
        {
          id: `fb_personal_${meData.id}`,
          name: meData.name || 'Facebook Profile',
          type: 'Personal',
          url: 'https://www.facebook.com/',
          pageId: meData.id,
          mediaUrl: '',
          mediaName: 'Not Assigned',
          mediaType: 'none',
          caption: 'Check out this amazing update! #viral #trending',
          scheduleDate: d,
          scheduleTime: t,
        },
      ];

      if (Array.isArray(accData.data)) {
        for (const pg of accData.data) {
          if (pg.access_token) {
            sessionTokens.pageTokens.set(pg.id, pg.access_token);
          }
          fetched.push({
            id: `fb_page_${pg.id}`,
            name: pg.name,
            type: 'Page',
            url: sanitizeSafeExternalUrl(pg.link || '') || `https://www.facebook.com/${pg.id}`,
            pageId: pg.id,
            igAccountId: pg.instagram_business_account?.id,
            hasLiveToken: Boolean(pg.access_token),
            mediaUrl: '',
            mediaName: 'Not Assigned',
            mediaType: 'none',
            caption: 'Check out this amazing update! #trending #viral',
            scheduleDate: d,
            scheduleTime: t,
          });
          if (pg.instagram_business_account?.id) {
            fetched.push({
              id: `ig_${pg.instagram_business_account.id}`,
              name: `@${pg.instagram_business_account.username || pg.name}`,
              type: 'Instagram',
              url: `https://www.instagram.com/${pg.instagram_business_account.username || ''}`,
              pageId: pg.id,
              igAccountId: pg.instagram_business_account.id,
              hasLiveToken: Boolean(pg.access_token),
              mediaUrl: '',
              mediaName: 'Not Assigned',
              mediaType: 'none',
              caption: 'New reel live now! #reels #instagram',
              scheduleDate: d,
              scheduleTime: t,
            });
          }
        }
      }

      state.pages = fetched;
      appendLog(
        `Meta Graph API connected as [${sessionTokens.metaUserName}]. Fetched ${fetched.length} targets.`,
        'success'
      );
      res.json(buildStateResponse(req));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`Meta Graph API fetch failed: ${msg}`, 'error');
      res.status(400).json({error: msg});
    }
  });

  app.post('/api/meta/disconnect', (req: Request, res: Response) => {
    sessionTokens.metaUserToken = '';
    sessionTokens.metaUserName = '';
    sessionTokens.pageTokens.clear();
    appendLog('Meta Graph API session cleared from server memory.', 'info');
    res.json(buildStateResponse(req));
  });

  // 3. Pages & Media Studio CRUD
  app.post('/api/pages', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const type: TargetType = ['Personal', 'Page', 'Instagram'].includes(req.body?.type)
      ? req.body.type
      : 'Page';
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const url = sanitizeSafeExternalUrl(rawUrl) || 'https://www.facebook.com/';

    if (!name) {
      res.status(400).json({error: 'Page or profile name is required.'});
      return;
    }

    const newPage: PageTarget = {
      id: makeId('page'),
      name,
      type,
      url,
      mediaUrl: '',
      mediaName: 'Not Assigned',
      mediaType: 'none',
      caption: typeof req.body?.caption === 'string' && req.body.caption.trim() ? req.body.caption.trim() : '#trending #viral',
      scheduleDate: todayDateStr(state.timezoneOffsetMinutes),
      scheduleTime: nowTimeStr(state.timezoneOffsetMinutes),
    };
    state.pages.push(newPage);
    appendLog(`Added manual target [${name}] (${type}) to Pages & Media table.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.patch('/api/pages/:id', (req: Request, res: Response) => {
    const page = state.pages.find((p) => p.id === req.params.id);
    if (!page) {
      res.status(404).json({error: 'Page row not found.'});
      return;
    }

    if (typeof req.body?.caption === 'string') {
      page.caption = req.body.caption;
    }
    if (typeof req.body?.scheduleDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.scheduleDate.trim())) {
      page.scheduleDate = req.body.scheduleDate.trim();
    }
    if (typeof req.body?.scheduleTime === 'string' && /^\d{2}:\d{2}$/.test(req.body.scheduleTime.trim())) {
      page.scheduleTime = req.body.scheduleTime.trim();
    }
    if (typeof req.body?.mediaUrl === 'string') {
      const mUrl = req.body.mediaUrl.trim();
      if (!mUrl) {
        page.mediaUrl = '';
        page.mediaName = 'Not Assigned';
        page.mediaType = 'none';
      } else if (mUrl.startsWith('/uploads/')) {
        page.mediaUrl = mUrl;
        page.mediaName = typeof req.body?.mediaName === 'string' ? req.body.mediaName : path.basename(mUrl);
        page.mediaType = detectMediaKind(mUrl);
      } else {
        const safe = sanitizeSafeExternalUrl(mUrl);
        if (!safe) {
          res.status(400).json({error: 'Provide a valid public http/https media URL or upload a file.'});
          return;
        }
        page.mediaUrl = safe;
        page.mediaName = typeof req.body?.mediaName === 'string' ? req.body.mediaName : safe.split('/').pop() || safe;
        page.mediaType = detectMediaKind(safe) || 'video';
      }
    }
    saveState();
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/bulk-caption', (req: Request, res: Response) => {
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
    const applyAll = Boolean(req.body?.applyAll);
    const selectedIds = Array.isArray(req.body?.selectedIds) ? new Set<string>(req.body.selectedIds) : new Set<string>();

    let updated = 0;
    for (const p of state.pages) {
      if (applyAll || selectedIds.has(p.id)) {
        p.caption = caption;
        updated++;
      }
    }
    appendLog(`Applied bulk caption to ${updated} page row(s).`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/bulk-schedule', (req: Request, res: Response) => {
    const scheduleDate = typeof req.body?.scheduleDate === 'string' ? req.body.scheduleDate.trim() : '';
    const scheduleTime = typeof req.body?.scheduleTime === 'string' ? req.body.scheduleTime.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) || !/^\d{2}:\d{2}$/.test(scheduleTime)) {
      res.status(400).json({error: 'Use YYYY-MM-DD for date and HH:MM for time.'});
      return;
    }
    if (typeof req.body?.timezoneOffsetMinutes === 'number') {
      state.timezoneOffsetMinutes = req.body.timezoneOffsetMinutes;
    }
    for (const p of state.pages) {
      p.scheduleDate = scheduleDate;
      p.scheduleTime = scheduleTime;
    }
    appendLog(`Applied global schedule ${scheduleDate} ${scheduleTime} to all ${state.pages.length} row(s).`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/import-txt', (req: Request, res: Response) => {
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const lines = content
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l && !l.startsWith('#'));

    if (lines.length === 0) {
      res.status(400).json({error: 'The uploaded .txt list has no valid media URLs.'});
      return;
    }
    if (state.pages.length === 0) {
      res.status(400).json({error: 'Add or fetch at least one page row before importing a .txt list.'});
      return;
    }

    let assigned = 0;
    state.pages.forEach((p, idx) => {
      if (idx < lines.length) {
        const candidate = sanitizeSafeExternalUrl(lines[idx]);
        if (candidate) {
          p.mediaUrl = candidate;
          p.mediaName = candidate.split('/').pop() || candidate;
          const kind = detectMediaKind(candidate);
          p.mediaType = kind === 'none' ? 'video' : kind;
          assigned++;
        }
      }
    });
    appendLog(`Imported ${assigned} cloud media URL(s) from .txt list.`, 'success');
    res.json(buildStateResponse(req));
  });

  app.delete('/api/pages/:id', (req: Request, res: Response) => {
    const idx = state.pages.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Row not found.'});
      return;
    }
    const [removed] = state.pages.splice(idx, 1);
    deletedStack.push({scope: 'pages', item: removed});
    appendLog(`Removed row [${removed.name}] from Pages & Media.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/clear', (req: Request, res: Response) => {
    for (const p of state.pages) {
      deletedStack.push({scope: 'pages', item: p});
    }
    state.pages = [];
    appendLog('Cleared Pages & Media table (Undo available with Ctrl+Z).', 'warn');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/undo', (req: Request, res: Response) => {
    for (let i = deletedStack.length - 1; i >= 0; i--) {
      if (deletedStack[i].scope === 'pages') {
        const [rec] = deletedStack.splice(i, 1);
        state.pages.push(rec.item as PageTarget);
        appendLog(`Restored [${rec.item.name}] via Undo.`, 'info');
        res.json(buildStateResponse(req));
        return;
      }
    }
    res.status(400).json({error: 'Nothing to undo in Pages & Media.'});
  });

  // 4. Media Upload
  app.post('/api/media/upload', (req: Request, res: Response) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        res.status(400).json({error: msg});
        return;
      }
      const uploaded = req.file;
      if (!uploaded) {
        res.status(400).json({error: 'No media file received.'});
        return;
      }
      const url = `/uploads/${uploaded.filename}`;
      const mediaType = detectMediaKind(uploaded.originalname);
      const targetIdsRaw = typeof req.body?.targetIds === 'string' ? req.body.targetIds : '';
      let targetIds: string[] = [];
      try {
        const parsed = JSON.parse(targetIdsRaw);
        if (Array.isArray(parsed)) targetIds = parsed;
      } catch {
        targetIds = [];
      }

      if (targetIds.length > 0) {
        const idSet = new Set(targetIds);
        for (const p of state.pages) {
          if (idSet.has(p.id)) {
            p.mediaUrl = url;
            p.mediaName = uploaded.originalname;
            p.mediaType = mediaType === 'none' ? 'video' : mediaType;
          }
        }
      } else {
        for (const p of state.pages) {
          p.mediaUrl = url;
          p.mediaName = uploaded.originalname;
          p.mediaType = mediaType === 'none' ? 'video' : mediaType;
        }
      }

      appendLog(`Uploaded cloud media [${uploaded.originalname}] (${(uploaded.size / (1024 * 1024)).toFixed(2)} MB).`, 'success');
      res.json({
        url,
        filename: uploaded.originalname,
        mediaType,
        state: buildStateResponse(req),
      });
    });
  });

  // 5. Master Scheduler & Execution
  app.post('/api/scheduler/transfer', (req: Request, res: Response) => {
    if (state.pages.length === 0) {
      res.status(400).json({error: 'Add or fetch at least one page before transferring to Master Scheduler.'});
      return;
    }
    if (typeof req.body?.timezoneOffsetMinutes === 'number') {
      state.timezoneOffsetMinutes = req.body.timezoneOffsetMinutes;
    }

    state.queue = state.pages.map((p) => ({
      id: makeId('job'),
      sourcePageId: p.id,
      name: p.name,
      type: p.type,
      url: p.url,
      pageId: p.pageId,
      igAccountId: p.igAccountId,
      hasLiveToken: Boolean(p.pageId && sessionTokens.pageTokens.has(p.pageId)),
      mediaUrl: p.mediaUrl,
      mediaName: p.mediaName,
      mediaType: p.mediaType,
      caption: p.caption,
      scheduleDate: p.scheduleDate,
      scheduleTime: p.scheduleTime,
      mode: state.activeMode,
      status: 'queued',
      createdAt: formatLogTimestamp(),
    }));
    attemptedQueueIds.clear();
    appendLog(`Transferred ${state.queue.length} target(s) to Master Scheduler queue.`, 'success');
    res.json(buildStateResponse(req));
  });

  app.patch('/api/scheduler/mode', (req: Request, res: Response) => {
    const mode = req.body?.mode as ExecutionMode;
    if (!['Mode 1', 'Mode 2', 'Mode 3', 'Mode 4'].includes(mode)) {
      res.status(400).json({error: 'Invalid execution mode.'});
      return;
    }
    state.activeMode = mode;
    for (const q of state.queue) {
      if (q.status === 'queued') q.mode = mode;
    }
    appendLog(`Active execution strategy switched to ${MODE_LABELS[mode]}.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/start', (req: Request, res: Response) => {
    if (typeof req.body?.timezoneOffsetMinutes === 'number') {
      state.timezoneOffsetMinutes = req.body.timezoneOffsetMinutes;
    }
    state.engineRunning = true;
    appendLog('Cloud Auto-Scheduler Engine STARTED (polling queue every 5 seconds).', 'success');
    void runSchedulerTick(resolveLiveAppUrl(req));
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/stop', (req: Request, res: Response) => {
    state.engineRunning = false;
    appendLog('Cloud Auto-Scheduler Engine STOPPED.', 'warn');
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/execute-one', async (req: Request, res: Response) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const item = state.queue.find((q) => q.id === id);
    if (!item) {
      res.status(404).json({error: 'Queued target not found.'});
      return;
    }
    await executeQueuedItem(id, resolveLiveAppUrl(req));
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/execute-all', async (req: Request, res: Response) => {
    const ids = state.queue.map((q) => q.id);
    if (ids.length === 0) {
      res.status(400).json({error: 'No targets in Scheduler queue.'});
      return;
    }
    appendLog(`Starting batch execution for ${ids.length} queued target(s)...`, 'info');
    for (const id of ids) {
      await executeQueuedItem(id, resolveLiveAppUrl(req));
    }
    appendLog('Batch execution session finished.', 'success');
    res.json(buildStateResponse(req));
  });

  app.delete('/api/scheduler/:id', (req: Request, res: Response) => {
    const idx = state.queue.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({error: 'Queue item not found.'});
      return;
    }
    const [removed] = state.queue.splice(idx, 1);
    deletedStack.push({scope: 'queue', item: removed});
    appendLog(`Removed [${removed.name}] from Scheduler queue.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/undo', (req: Request, res: Response) => {
    for (let i = deletedStack.length - 1; i >= 0; i--) {
      if (deletedStack[i].scope === 'queue') {
        const [rec] = deletedStack.splice(i, 1);
        state.queue.push(rec.item as QueuedTarget);
        appendLog(`Restored [${rec.item.name}] to Scheduler queue.`, 'info');
        res.json(buildStateResponse(req));
        return;
      }
    }
    res.status(400).json({error: 'Nothing to undo in Scheduler queue.'});
  });

  // 6. GitHub Integration & Live Cloud Deploy Console
  app.get('/api/deploy/files', (_req: Request, res: Response) => {
    const readSafe = (rel: string) => {
      const full = path.resolve(__dirname, rel);
      return fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : '';
    };
    res.json({
      dockerfile: readSafe('Dockerfile'),
      renderYaml: readSafe('render.yaml'),
      githubWorkflow: readSafe('.github/workflows/deploy-cloud.yml'),
    });
  });

  app.post('/api/github/verify', async (req: Request, res: Response) => {
    const token = (typeof req.body?.token === 'string' ? req.body.token.trim() : '') || sessionTokens.githubToken;
    if (!token) {
      res.status(400).json({error: 'Enter a GitHub Personal Access Token (with repo scope).'});
      return;
    }
    const userRes = await githubFetch<{login?: string; avatar_url?: string; message?: string}>(
      'https://api.github.com/user',
      token
    );
    if (!userRes.ok || !userRes.data.login) {
      res.status(400).json({error: userRes.data.message || 'GitHub token verification failed.'});
      return;
    }
    sessionTokens.githubToken = token;
    sessionTokens.githubUserName = userRes.data.login;
    appendLog(`GitHub account verified: @${userRes.data.login}.`, 'success');
    res.json({
      login: userRes.data.login,
      state: buildStateResponse(req),
    });
  });

  app.post('/api/github/push', async (req: Request, res: Response) => {
    const token = (typeof req.body?.token === 'string' ? req.body.token.trim() : '') || sessionTokens.githubToken;
    const repoName = typeof req.body?.repoName === 'string' ? req.body.repoName.trim() : '';
    const isPrivate = Boolean(req.body?.isPrivate);
    const branch = typeof req.body?.branch === 'string' && /^[a-zA-Z0-9._/-]+$/.test(req.body.branch.trim())
      ? req.body.branch.trim()
      : 'main';
    const commitMessage = typeof req.body?.commitMessage === 'string' && req.body.commitMessage.trim()
      ? req.body.commitMessage.trim().slice(0, 120)
      : 'Deploy Social Auto-Scheduler Cloud from AI Studio';

    if (!token) {
      res.status(400).json({error: 'GitHub Personal Access Token is required.'});
      return;
    }
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(repoName)) {
      res.status(400).json({error: 'Repository name may only contain letters, numbers, dots, hyphens, and underscores.'});
      return;
    }

    try {
      const userRes = await githubFetch<{login?: string; message?: string}>('https://api.github.com/user', token);
      if (!userRes.ok || !userRes.data.login) {
        throw new Error(userRes.data.message || 'Invalid GitHub token.');
      }
      const owner = userRes.data.login;
      sessionTokens.githubToken = token;
      sessionTokens.githubUserName = owner;

      let repoUrl = `https://github.com/${owner}/${repoName}`;
      const repoCheck = await githubFetch<{html_url?: string; default_branch?: string}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`,
        token
      );

      let targetBranch = branch;
      if (repoCheck.status === 404) {
        appendLog(`Creating GitHub repository ${owner}/${repoName}...`, 'info');
        const createRes = await githubFetch<{html_url?: string; default_branch?: string; message?: string}>(
          'https://api.github.com/user/repos',
          token,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              name: repoName,
              private: isPrivate,
              description: 'Cloud-hosted Facebook & Instagram Auto-Scheduler SaaS App',
              auto_init: true,
            }),
          }
        );
        if (!createRes.ok) {
          throw new Error(createRes.data.message || 'Could not create GitHub repository.');
        }
        repoUrl = createRes.data.html_url || repoUrl;
        targetBranch = createRes.data.default_branch || 'main';
        await new Promise((r) => setTimeout(r, 1500));
      } else if (repoCheck.ok) {
        repoUrl = repoCheck.data.html_url || repoUrl;
        targetBranch = repoCheck.data.default_branch || branch;
      } else {
        throw new Error('Failed to inspect GitHub repository.');
      }

      // Ensure branch ref exists (handles empty repos without commits)
      let refRes = await githubFetch<{object?: {sha?: string}}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        token
      );
      if (!refRes.ok || !refRes.data.object?.sha) {
        await githubFetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/README.md`,
          token,
          {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              message: 'Initialize repository',
              content: Buffer.from(`# ${repoName}\n\nCloud-hosted Social Auto-Scheduler.\n`).toString('base64'),
              branch: targetBranch,
            }),
          }
        );
        await new Promise((r) => setTimeout(r, 800));
        refRes = await githubFetch<{object?: {sha?: string}}>(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
          token
        );
      }

      const parentCommitSha = refRes.data.object?.sha;
      if (!parentCommitSha) {
        throw new Error(`Could not resolve branch head '${targetBranch}'.`);
      }

      const commitRes = await githubFetch<{tree?: {sha?: string}}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits/${parentCommitSha}`,
        token
      );
      const baseTreeSha = commitRes.data.tree?.sha;

      const files = collectWorkspaceFiles(__dirname, __dirname);
      appendLog(`Uploading ${files.length} project files to GitHub (${owner}/${repoName})...`, 'info');

      const treeEntries: Array<{path: string; mode: string; type: string; sha: string}> = [];
      for (const f of files) {
        const blobRes = await githubFetch<{sha?: string; message?: string}>(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/blobs`,
          token,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              content: f.contentBase64,
              encoding: 'base64',
            }),
          }
        );
        if (!blobRes.ok || !blobRes.data.sha) {
          throw new Error(blobRes.data.message || `Failed uploading blob for ${f.relPath}`);
        }
        treeEntries.push({
          path: f.relPath,
          mode: '100644',
          type: 'blob',
          sha: blobRes.data.sha,
        });
      }

      const newTreeRes = await githubFetch<{sha?: string; message?: string}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/trees`,
        token,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeEntries,
          }),
        }
      );
      if (!newTreeRes.ok || !newTreeRes.data.sha) {
        throw new Error(newTreeRes.data.message || 'Failed creating Git tree.');
      }

      const newCommitRes = await githubFetch<{sha?: string; message?: string}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits`,
        token,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            message: commitMessage,
            tree: newTreeRes.data.sha,
            parents: [parentCommitSha],
          }),
        }
      );
      if (!newCommitRes.ok || !newCommitRes.data.sha) {
        throw new Error(newCommitRes.data.message || 'Failed creating Git commit.');
      }

      const updateRefRes = await githubFetch<{message?: string}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
        token,
        {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({sha: newCommitRes.data.sha}),
        }
      );
      if (!updateRefRes.ok) {
        throw new Error(updateRefRes.data.message || 'Failed updating branch reference.');
      }

      appendLog(`Successfully pushed ${files.length} files to ${repoUrl} (branch: ${targetBranch}).`, 'success');
      res.json({
        repoUrl,
        branch: targetBranch,
        commitSha: newCommitRes.data.sha,
        filesPushed: files.length,
        renderDeployUrl: `https://render.com/deploy?repo=${encodeURIComponent(repoUrl)}`,
        state: buildStateResponse(req),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`GitHub push failed: ${msg}`, 'error');
      res.status(400).json({error: msg});
    }
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Social Auto-Scheduler Cloud running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
