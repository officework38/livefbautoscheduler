export type TargetType = 'Personal' | 'Page' | 'Instagram';
export type ExecutionMode = 'Mode 1' | 'Mode 2' | 'Mode 3' | 'Mode 4';
export type MediaKind = 'none' | 'video' | 'image';
export type QueueStatus = 'queued' | 'running' | 'completed' | 'failed';
export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface PageTarget {
  id: string;
  name: string;
  type: TargetType;
  url: string;
  pageId?: string;
  igAccountId?: string;
  hasLiveToken?: boolean;
  mediaUrl: string;
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
  pageId?: string;
  igAccountId?: string;
  hasLiveToken?: boolean;
  mediaUrl: string;
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
  mediaUrl: string;
  status: 'published-live' | 'verified-cloud-run' | 'failed';
  postId?: string;
  commentId?: string;
  executedAt: string;
  note: string;
}

export interface ConnectionStatus {
  metaConnected: boolean;
  metaUserName: string;
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
  connections: ConnectionStatus;
  liveAppUrl: string;
  canUndoPages: boolean;
  canUndoQueue: boolean;
}
