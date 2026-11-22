export type TargetType = 'Personal' | 'Page';
export type ExecutionMode = 'Mode 1' | 'Mode 2' | 'Mode 3' | 'Mode 4';
export type MediaKind = 'none' | 'video' | 'image';
export type QueueStatus = 'queued' | 'running' | 'completed' | 'failed';
export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface PageTarget {
  id: string;
  name: string;
  type: TargetType;
  url: string;
  mediaPath: string;
  mediaName: string;
  mediaType: MediaKind;
  caption: string;
  scheduleDate: string;
  scheduleTime: string;
}

export interface QueuedTarget {
  id: string;
  sourcePageId: string;
  name: string;
  type: TargetType;
  url: string;
  mediaPath: string;
  mediaName: string;
  mediaType: MediaKind;
  caption: string;
  scheduleDate: string;
  scheduleTime: string;
  mode: ExecutionMode;
  status: QueueStatus;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface ExecutionProof {
  id: string;
  targetName: string;
  targetType: TargetType;
  mode: ExecutionMode;
  caption: string;
  mediaName: string;
  screenshotUrl: string;
  status: 'completed' | 'failed';
  executedAt: string;
  note: string;
}

export interface BrowserSessionStatus {
  browserOpen: boolean;
  browserBusy: boolean;
  loggedIn: boolean;
  currentUrl: string;
  activeProfile: string;
  availableProfiles: string[];
  cookieSummary: string;
  githubConnected: boolean;
  githubUserName: string;
}

export interface AppStateResponse {
  pages: PageTarget[];
  queue: QueuedTarget[];
  engineRunning: boolean;
  activeMode: ExecutionMode;
  timezoneOffsetMinutes: number;
  logs: LogEntry[];
  proofs: ExecutionProof[];
  browser: BrowserSessionStatus;
  liveAppUrl: string;
  canUndoPages: boolean;
  canUndoQueue: boolean;
}
