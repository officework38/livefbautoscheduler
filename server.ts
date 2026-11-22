import 'dotenv/config';
import express, {Request, Response} from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {fileURLToPath} from 'url';
import {createServer as createViteServer} from 'vite';
import {CloudBrowserRpaManager} from './src/server/cloudBrowserRpa.ts';
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
const PROFILES_DIR = path.resolve(__dirname, 'browser_profiles');
const PROOFS_DIR = path.resolve(__dirname, 'execution_proofs');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

fs.mkdirSync(DATA_DIR, {recursive: true});
fs.mkdirSync(UPLOADS_DIR, {recursive: true});
fs.mkdirSync(PROFILES_DIR, {recursive: true});
fs.mkdirSync(PROOFS_DIR, {recursive: true});

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

const sessionTokens = {
  githubToken: (process.env.GITHUB_TOKEN || '').trim(),
  githubUserName: '',
};

const browserRpa = new CloudBrowserRpaManager(PROFILES_DIR, PROOFS_DIR);

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
        name: 'Facebook Profile',
        type: 'Personal',
        url: 'https://www.facebook.com/',
        mediaPath: '',
        mediaName: 'Not Assigned',
        mediaType: 'none',
        caption: 'Check out this amazing update! Follow for more. #viral #reels #trending',
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
        message: 'System B Cloud Browser RPA Engine initialized. Open Tab 01 to sign into Facebook (no API needed).',
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
    // Fallback cleanly
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
    // Non-fatal
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
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
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

function resolveUploadedMediaAbsPath(mediaPath: string): string {
  if (!mediaPath || !mediaPath.startsWith('/uploads/')) return '';
  const safeName = path.basename(mediaPath);
  const resolved = path.resolve(UPLOADS_DIR, safeName);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
    return '';
  }
  return resolved;
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
    pages: state.pages,
    queue: state.queue,
    engineRunning: state.engineRunning,
    activeMode: state.activeMode,
    timezoneOffsetMinutes: state.timezoneOffsetMinutes,
    logs: state.logs,
    proofs: state.proofs,
    browser: {
      ...browserRpa.getStatus(),
      githubConnected: Boolean(sessionTokens.githubToken),
      githubUserName: sessionTokens.githubUserName,
    },
    liveAppUrl: resolveLiveAppUrl(req),
    canUndoPages: deletedStack.some((d) => d.scope === 'pages'),
    canUndoQueue: deletedStack.some((d) => d.scope === 'queue'),
  };
}

// =========================================================================
// --- QUEUE EXECUTION VIA REAL CLOUD CHROMIUM BROWSER (SYSTEM B) ---
// =========================================================================
async function executeQueuedItem(itemId: string) {
  const idx = state.queue.findIndex((q) => q.id === itemId);
  if (idx === -1) return;

  const target = state.queue[idx];
  target.status = 'running';
  saveState();

  const activeMode = target.mode || state.activeMode;
  const mediaAbsPath = resolveUploadedMediaAbsPath(target.mediaPath);

  try {
    const result = await browserRpa.executeModeRpa(
      {
        name: target.name,
        type: target.type,
        url: target.url,
        mediaAbsPath,
        caption: target.caption,
      },
      activeMode,
      appendLog
    );

    state.proofs.unshift({
      id: makeId('proof'),
      targetName: target.name,
      targetType: target.type,
      mode: activeMode,
      caption: target.caption,
      mediaName: target.mediaName,
      screenshotUrl: `/proofs/${result.screenshotFilename}`,
      status: 'completed',
      executedAt: formatLogTimestamp(),
      note: result.note,
    });
    if (state.proofs.length > 100) {
      state.proofs = state.proofs.slice(0, 100);
    }

    // Remove completed target from queue (matches _finalize_target_after_proof)
    state.queue = state.queue.filter((q) => q.id !== itemId);
    saveState();

    // If queue is now empty, close browser to save resources (cookies preserved in profile!)
    if (state.queue.length === 0 && !browserRpa.isBusy()) {
      await browserRpa.closeBrowser(appendLog);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const qItem = state.queue.find((q) => q.id === itemId);
    if (qItem) qItem.status = 'failed';
    appendLog(`${activeMode} RPA Error on [${target.name}]: ${errMsg}`, 'error');
    state.proofs.unshift({
      id: makeId('proof'),
      targetName: target.name,
      targetType: target.type,
      mode: activeMode,
      caption: target.caption,
      mediaName: target.mediaName,
      screenshotUrl: '',
      status: 'failed',
      executedAt: formatLogTimestamp(),
      note: errMsg,
    });
    saveState();
  }
}

async function runSchedulerTick() {
  if (!state.engineRunning || isExecutingQueue || browserRpa.isBusy()) return;

  const nowShifted = new Date(Date.now() - state.timezoneOffsetMinutes * 60_000);
  const currentDateTime = nowShifted.toISOString().slice(0, 16).replace('T', ' ');

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
      appendLog(`Due schedule detected: ${item.name} at ${item.scheduleDate} ${item.scheduleTime}`, 'info');
      await executeQueuedItem(item.id);
    }
  } finally {
    isExecutingQueue = false;
  }
}

setInterval(() => {
  void runSchedulerTick();
}, 5000);

// =========================================================================
// --- GITHUB REST API REPO CREATOR & CODE PUSHER ---
// =========================================================================
const IGNORED_UPLOAD_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'uploads',
  'data',
  'browser_profiles',
  'execution_proofs',
  '.next',
]);
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
      if (stat.size > 5 * 1024 * 1024) continue;
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
      'User-Agent': 'FB-Insta-Pro-Auto-Scheduler',
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
    limits: {fileSize: 150 * 1024 * 1024},
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        cb(new Error('Only video (.mp4, .mov, .avi, .webm) and image (.jpg, .png, .webp, .gif) files are allowed.'));
        return;
      }
      cb(null, true);
    },
  });

  // Confined static serving for uploaded media and execution proof screenshots
  app.get('/uploads/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename || '');
    const resolved = path.resolve(UPLOADS_DIR, safeName);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({error: 'Media file not found'});
      return;
    }
    res.sendFile(resolved);
  });

  app.get('/proofs/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename || '');
    const resolved = path.resolve(PROOFS_DIR, safeName);
    if (!resolved.startsWith(PROOFS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({error: 'Proof screenshot not found'});
      return;
    }
    res.sendFile(resolved);
  });

  app.get('/api/download-python', (_req: Request, res: Response) => {
    const pyPath = path.resolve(__dirname, 'public/assets/aistudio/v61.51_5c1cc53d.py');
    if (!fs.existsSync(pyPath)) {
      res.status(404).json({error: 'Original Python file not found'});
      return;
    }
    res.download(pyPath, 'fb_insta_pro_v61.5.py');
  });

  // State & Logs
  app.get('/api/state', (req: Request, res: Response) => {
    res.json(buildStateResponse(req));
  });

  app.delete('/api/logs', (req: Request, res: Response) => {
    state.logs = [];
    appendLog('Live RPA Terminal cleared.', 'info');
    res.json(buildStateResponse(req));
  });

  // Cloud Chromium Browser & Profile Control (Direct replacement for local Chrome + Selenium)
  app.post('/api/browser/open', async (req: Request, res: Response) => {
    try {
      await browserRpa.openFacebookLogin(appendLog);
      res.json(buildStateResponse(req));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`Browser open error: ${msg}`, 'error');
      res.status(400).json({error: msg});
    }
  });

  app.post('/api/browser/close', async (req: Request, res: Response) => {
    await browserRpa.closeBrowser(appendLog);
    res.json(buildStateResponse(req));
  });

  app.post('/api/browser/profile', async (req: Request, res: Response) => {
    const profileName = typeof req.body?.profileName === 'string' ? req.body.profileName.trim() : 'SystemB_Default';
    try {
      await browserRpa.setActiveProfile(profileName, appendLog);
      res.json(buildStateResponse(req));
    } catch (err) {
      res.status(400).json({error: err instanceof Error ? err.message : 'Profile switch failed.'});
    }
  });

  app.post('/api/browser/cookies', async (req: Request, res: Response) => {
    const cookies = typeof req.body?.cookies === 'string' ? req.body.cookies : '';
    try {
      await browserRpa.importCookies(cookies, appendLog);
      res.json(buildStateResponse(req));
    } catch (err) {
      res.status(400).json({error: err instanceof Error ? err.message : 'Cookie import failed.'});
    }
  });

  app.post('/api/browser/fetch-pages', async (req: Request, res: Response) => {
    try {
      const result = await browserRpa.fetchPagesSystemB(appendLog);
      const d = todayDateStr(state.timezoneOffsetMinutes);
      const t = nowTimeStr(state.timezoneOffsetMinutes);

      const newRows: PageTarget[] = [
        {
          id: makeId('personal'),
          name: result.profileName || 'Facebook Profile',
          type: 'Personal',
          url: 'https://www.facebook.com/',
          mediaPath: '',
          mediaName: 'Not Assigned',
          mediaType: 'none',
          caption: '#viral #trending',
          scheduleDate: d,
          scheduleTime: t,
        },
      ];

      for (const p of result.pages) {
        newRows.push({
          id: makeId('page'),
          name: p.name,
          type: 'Page',
          url: p.url,
          mediaPath: '',
          mediaName: 'Not Assigned',
          mediaType: 'none',
          caption: '#trending #viral',
          scheduleDate: d,
          scheduleTime: t,
        });
      }

      state.pages = newRows;
      saveState();
      res.json(buildStateResponse(req));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`System B Fetch failed: ${msg}`, 'error');
      res.status(400).json({error: msg});
    }
  });

  // Live Interactive Remote Browser Viewport
  app.get('/api/browser/viewport', async (_req: Request, res: Response) => {
    try {
      const frame = await browserRpa.captureLiveViewport();
      res.json(frame);
    } catch {
      res.json({imageBase64: '', url: 'about:blank', loggedIn: false});
    }
  });

  app.post('/api/browser/click', async (req: Request, res: Response) => {
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1280 || y > 800) {
      res.status(400).json({error: 'Invalid coordinates'});
      return;
    }
    await browserRpa.sendMouseClick(x, y);
    const frame = await browserRpa.captureLiveViewport();
    res.json(frame);
  });

  app.post('/api/browser/type', async (req: Request, res: Response) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    await browserRpa.sendText(text);
    const frame = await browserRpa.captureLiveViewport();
    res.json(frame);
  });

  app.post('/api/browser/key', async (req: Request, res: Response) => {
    const key = typeof req.body?.key === 'string' ? req.body.key : '';
    await browserRpa.sendKey(key);
    const frame = await browserRpa.captureLiveViewport();
    res.json(frame);
  });

  app.post('/api/browser/scroll', async (req: Request, res: Response) => {
    const deltaY = Number(req.body?.deltaY) || 0;
    await browserRpa.scrollViewport(Math.max(-1200, Math.min(1200, deltaY)));
    const frame = await browserRpa.captureLiveViewport();
    res.json(frame);
  });

  // Pages & Media Studio CRUD
  app.post('/api/pages', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const type: TargetType = req.body?.type === 'Personal' ? 'Personal' : 'Page';
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const url = sanitizeSafeExternalUrl(rawUrl) || 'https://www.facebook.com/';

    if (!name) {
      res.status(400).json({error: 'Page or profile name is required.'});
      return;
    }

    state.pages.push({
      id: makeId('page'),
      name,
      type,
      url,
      mediaPath: '',
      mediaName: 'Not Assigned',
      mediaType: 'none',
      caption: '#trending',
      scheduleDate: todayDateStr(state.timezoneOffsetMinutes),
      scheduleTime: nowTimeStr(state.timezoneOffsetMinutes),
    });
    appendLog(`Added real page target: [${name}] to Inline Media Table.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.patch('/api/pages/:id', (req: Request, res: Response) => {
    const page = state.pages.find((p) => p.id === req.params.id);
    if (!page) {
      res.status(404).json({error: 'Row not found.'});
      return;
    }
    if (typeof req.body?.caption === 'string') page.caption = req.body.caption;
    if (typeof req.body?.scheduleDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.scheduleDate.trim())) {
      page.scheduleDate = req.body.scheduleDate.trim();
    }
    if (typeof req.body?.scheduleTime === 'string' && /^\d{2}:\d{2}$/.test(req.body.scheduleTime.trim())) {
      page.scheduleTime = req.body.scheduleTime.trim();
    }
    saveState();
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/bulk-caption', (req: Request, res: Response) => {
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
    const applyAll = Boolean(req.body?.applyAll);
    const selectedIds = Array.isArray(req.body?.selectedIds) ? new Set<string>(req.body.selectedIds) : new Set<string>();
    for (const p of state.pages) {
      if (applyAll || selectedIds.has(p.id)) p.caption = caption;
    }
    appendLog('Applied bulk caption to table rows.', 'info');
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
    appendLog(`Applied schedule ${scheduleDate} ${scheduleTime} to all rows.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/import-txt', (req: Request, res: Response) => {
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const lines = content
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l && !l.startsWith('#'));
    if (lines.length === 0) {
      res.status(400).json({error: 'The selected .txt file is empty.'});
      return;
    }
    if (state.pages.length === 0) {
      res.status(400).json({error: 'Fetch or add pages first.'});
      return;
    }
    let count = 0;
    state.pages.forEach((p, idx) => {
      if (idx < lines.length) {
        const candidate = sanitizeSafeExternalUrl(lines[idx]);
        if (candidate) {
          p.mediaPath = candidate;
          p.mediaName = candidate.split('/').pop() || candidate;
          p.mediaType = detectMediaKind(candidate) || 'video';
          count++;
        }
      }
    });
    appendLog(`Imported ${count} paths from .txt list.`, 'success');
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
    appendLog(`Deleted row from Pages & Media: ${removed.name}`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/clear', (req: Request, res: Response) => {
    for (const p of state.pages) deletedStack.push({scope: 'pages', item: p});
    state.pages = [];
    appendLog('Cleared assignment mapping table.', 'warn');
    res.json(buildStateResponse(req));
  });

  app.post('/api/pages/undo', (req: Request, res: Response) => {
    for (let i = deletedStack.length - 1; i >= 0; i--) {
      if (deletedStack[i].scope === 'pages') {
        const [rec] = deletedStack.splice(i, 1);
        state.pages.push(rec.item as PageTarget);
        appendLog(`Restored item via Undo: ${rec.item.name}`, 'info');
        res.json(buildStateResponse(req));
        return;
      }
    }
    res.status(400).json({error: 'No recently deleted items to restore.'});
  });

  app.post('/api/media/upload', (req: Request, res: Response) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({error: err instanceof Error ? err.message : 'Upload failed'});
        return;
      }
      const uploaded = req.file;
      if (!uploaded) {
        res.status(400).json({error: 'No file uploaded.'});
        return;
      }
      const mediaUrl = `/uploads/${uploaded.filename}`;
      const mediaType = detectMediaKind(uploaded.originalname);
      let targetIds: string[] = [];
      try {
        const parsed = JSON.parse(typeof req.body?.targetIds === 'string' ? req.body.targetIds : '[]');
        if (Array.isArray(parsed)) targetIds = parsed;
      } catch {
        targetIds = [];
      }

      if (targetIds.length > 0) {
        const set = new Set(targetIds);
        for (const p of state.pages) {
          if (set.has(p.id)) {
            p.mediaPath = mediaUrl;
            p.mediaName = uploaded.originalname;
            p.mediaType = mediaType === 'none' ? 'video' : mediaType;
          }
        }
      } else {
        for (const p of state.pages) {
          p.mediaPath = mediaUrl;
          p.mediaName = uploaded.originalname;
          p.mediaType = mediaType === 'none' ? 'video' : mediaType;
        }
      }

      appendLog(`Assigned media [${uploaded.originalname}] to target rows.`, 'success');
      res.json({url: mediaUrl, filename: uploaded.originalname, state: buildStateResponse(req)});
    });
  });

  // Master Scheduler
  app.post('/api/scheduler/transfer', (req: Request, res: Response) => {
    if (state.pages.length === 0) {
      res.status(400).json({error: 'Pages & Media table mein koi page mojood nahi hai!'});
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
      mediaPath: p.mediaPath,
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
    appendLog(`Transferred ${state.queue.length} target page(s) to Master Scheduler queue.`, 'success');
    res.json(buildStateResponse(req));
  });

  app.patch('/api/scheduler/mode', (req: Request, res: Response) => {
    const mode = req.body?.mode as ExecutionMode;
    if (!['Mode 1', 'Mode 2', 'Mode 3', 'Mode 4'].includes(mode)) {
      res.status(400).json({error: 'Invalid mode'});
      return;
    }
    state.activeMode = mode;
    for (const q of state.queue) {
      if (q.status === 'queued') q.mode = mode;
    }
    appendLog(`Active RPA Execution Mode set to ${mode}.`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/start', (req: Request, res: Response) => {
    if (typeof req.body?.timezoneOffsetMinutes === 'number') {
      state.timezoneOffsetMinutes = req.body.timezoneOffsetMinutes;
    }
    state.engineRunning = true;
    appendLog('System B Background Auto-Scheduler Engine STARTED.', 'success');
    void runSchedulerTick();
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/stop', (req: Request, res: Response) => {
    state.engineRunning = false;
    appendLog('System B Background Auto-Scheduler Engine STOPPED.', 'warn');
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/execute-one', async (req: Request, res: Response) => {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const item = state.queue.find((q) => q.id === id);
    if (!item) {
      res.status(404).json({error: 'Target row not found in Scheduler.'});
      return;
    }
    await executeQueuedItem(id);
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/execute-all', async (req: Request, res: Response) => {
    const ids = state.queue.map((q) => q.id);
    if (ids.length === 0) {
      res.status(400).json({error: 'No pages available in Scheduler table!'});
      return;
    }
    appendLog('Starting batch execution for ALL targets on System B...', 'info');
    for (const id of ids) {
      await executeQueuedItem(id);
    }
    appendLog('Batch posting session finished.', 'success');
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
    appendLog(`Removed target from Scheduler: ${removed.name}`, 'info');
    res.json(buildStateResponse(req));
  });

  app.post('/api/scheduler/undo', (req: Request, res: Response) => {
    for (let i = deletedStack.length - 1; i >= 0; i--) {
      if (deletedStack[i].scope === 'queue') {
        const [rec] = deletedStack.splice(i, 1);
        state.queue.push(rec.item as QueuedTarget);
        appendLog(`Restored item via Undo: ${rec.item.name}`, 'info');
        res.json(buildStateResponse(req));
        return;
      }
    }
    res.status(400).json({error: 'Nothing to undo in Scheduler.'});
  });

  // GitHub & Live Link Deploy
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
      res.status(400).json({error: 'Enter a GitHub Personal Access Token (repo scope).'});
      return;
    }
    const userRes = await githubFetch<{login?: string; message?: string}>('https://api.github.com/user', token);
    if (!userRes.ok || !userRes.data.login) {
      res.status(400).json({error: userRes.data.message || 'GitHub verification failed.'});
      return;
    }
    sessionTokens.githubToken = token;
    sessionTokens.githubUserName = userRes.data.login;
    appendLog(`GitHub verified: @${userRes.data.login}`, 'success');
    res.json({login: userRes.data.login, state: buildStateResponse(req)});
  });

  app.post('/api/github/push', async (req: Request, res: Response) => {
    const token = (typeof req.body?.token === 'string' ? req.body.token.trim() : '') || sessionTokens.githubToken;
    const repoName = typeof req.body?.repoName === 'string' ? req.body.repoName.trim() : '';
    const isPrivate = Boolean(req.body?.isPrivate);
    const branch =
      typeof req.body?.branch === 'string' && /^[a-zA-Z0-9._/-]+$/.test(req.body.branch.trim())
        ? req.body.branch.trim()
        : 'main';
    const commitMessage =
      typeof req.body?.commitMessage === 'string' && req.body.commitMessage.trim()
        ? req.body.commitMessage.trim().slice(0, 120)
        : 'Push FB & Insta Pro Auto-Scheduler Cloud';

    if (!token) {
      res.status(400).json({error: 'GitHub Personal Access Token is required.'});
      return;
    }
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(repoName)) {
      res.status(400).json({error: 'Invalid repository name.'});
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
              description: 'FB & Insta Pro Auto-Scheduler — Cloud System B Edition',
              auto_init: true,
            }),
          }
        );
        if (!createRes.ok) throw new Error(createRes.data.message || 'Could not create repository.');
        repoUrl = createRes.data.html_url || repoUrl;
        targetBranch = createRes.data.default_branch || 'main';
        await new Promise((r) => setTimeout(r, 1500));
      } else if (repoCheck.ok) {
        repoUrl = repoCheck.data.html_url || repoUrl;
        targetBranch = repoCheck.data.default_branch || branch;
      } else {
        throw new Error('Failed to check GitHub repository.');
      }

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
              content: Buffer.from(`# ${repoName}\n`).toString('base64'),
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
      if (!parentCommitSha) throw new Error(`Could not resolve branch '${targetBranch}'.`);

      const commitRes = await githubFetch<{tree?: {sha?: string}}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/commits/${parentCommitSha}`,
        token
      );
      const baseTreeSha = commitRes.data.tree?.sha;

      const files = collectWorkspaceFiles(__dirname, __dirname);
      appendLog(`Pushing ${files.length} files to GitHub (${owner}/${repoName})...`, 'info');

      const treeEntries: Array<{path: string; mode: string; type: string; sha: string}> = [];
      for (const f of files) {
        const blobRes = await githubFetch<{sha?: string; message?: string}>(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/blobs`,
          token,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({content: f.contentBase64, encoding: 'base64'}),
          }
        );
        if (!blobRes.ok || !blobRes.data.sha) {
          throw new Error(blobRes.data.message || `Blob upload failed for ${f.relPath}`);
        }
        treeEntries.push({path: f.relPath, mode: '100644', type: 'blob', sha: blobRes.data.sha});
      }

      const newTreeRes = await githubFetch<{sha?: string; message?: string}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/trees`,
        token,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({base_tree: baseTreeSha, tree: treeEntries}),
        }
      );
      if (!newTreeRes.ok || !newTreeRes.data.sha) throw new Error(newTreeRes.data.message || 'Tree creation failed.');

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
      if (!newCommitRes.ok || !newCommitRes.data.sha) throw new Error(newCommitRes.data.message || 'Commit failed.');

      const updateRefRes = await githubFetch<{message?: string}>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
        token,
        {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({sha: newCommitRes.data.sha}),
        }
      );
      if (!updateRefRes.ok) throw new Error(updateRefRes.data.message || 'Branch update failed.');

      appendLog(`Successfully pushed ${files.length} files to ${repoUrl}.`, 'success');
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
    console.log(`FB & Insta Pro Auto-Scheduler Cloud running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
