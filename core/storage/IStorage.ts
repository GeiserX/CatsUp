export type AppId = 'teams' | 'zoom' | 'slack' | 'meet' | string;

export interface StorageInitOptions {
  baseDir: string;                 // root folder for all persisted data
  tempDir?: string;                // temp/staging area
  encryptAtRest?: boolean;         // if true, implementations may encrypt files
  encryptionKeyId?: string;        // key reference if using KMS/Keychain
}

export interface StoragePaths {
  baseDir: string;
  sessionsDir: string;
  tempDir: string;
}

export type SessionAssetKind =
  | 'video'
  | 'audio'
  | 'transcript'
  | 'subtitles'
  | 'summary'
  | 'actions'
  | 'decisions'
  | 'risks'
  | 'index'
  | 'metadata'
  | 'other';

export interface NewAsset {
  kind: SessionAssetKind;
  name?: string;                   // preferred file name
  mime?: string;                   // e.g., "audio/mp3", "video/mp4", "text/plain"
  label?: string;                  // friendly label (e.g., "App Audio")
  // Provide one of the following (implementations may accept both):
  bytes?: Uint8Array;              // raw content to write
  fromPath?: string;               // move/copy from an existing path
  // Optional timestamps
  createdAt?: number;              // epoch ms
}

export interface SessionAsset {
  id: string;
  kind: SessionAssetKind;
  path: string;                    // absolute path
  name: string;                    // file name
  mime?: string;
  label?: string;
  sizeBytes: number;
  createdAt: number;               // epoch ms
  updatedAt?: number;              // epoch ms
  hash?: string;                   // optional integrity hash
}

export interface SessionMetadata {
  app: AppId;
  meetingId?: string;
  title?: string;
  participants?: string[];
  custom?: Record<string, string>;
}

export interface StoredSession extends SessionMetadata {
  id: string;
  dir: string;                     // absolute directory path for the session
  createdAt: number;               // epoch ms
  updatedAt: number;               // epoch ms
  startedAt?: number;              // epoch ms
  endedAt?: number;                // epoch ms
  isFinalized?: boolean;           // set true once meeting ends
  sizeBytes?: number;              // computed total size of assets
  assetCount?: number;             // number of assets
}

export interface ListSessionsQuery {
  app?: AppId;
  from?: number;                   // createdAt >= from
  to?: number;                     // createdAt <= to
  titleContains?: string;
  finalized?: boolean;
  limit?: number;                  // page size
  cursor?: string;                 // opaque pagination token
  orderBy?: 'createdAt' | 'updatedAt' | 'endedAt';
  orderDir?: 'asc' | 'desc';
}

export interface ListSessionsResult {
  sessions: StoredSession[];
  nextCursor?: string;             // present if more results available
}

export interface IStorage {
  // Lifecycle
  init(options: StorageInitOptions): Promise<void>;
  paths(): Promise<StoragePaths>;

  // Sessions
  createSession(meta: SessionMetadata & { startedAt?: number }): Promise<StoredSession>;
  getSession(sessionId: string): Promise<StoredSession | undefined>;
  updateSession(sessionId: string, patch: Partial<StoredSession>): Promise<StoredSession>;
  finalizeSession(sessionId: string, endedAt?: number): Promise<StoredSession>;
  listSessions(query?: ListSessionsQuery): Promise<ListSessionsResult>;
  deleteSession(sessionId: string): Promise<void>;

  // Assets
  addAsset(sessionId: string, asset: NewAsset): Promise<SessionAsset>;
  getAsset(sessionId: string, assetId: string): Promise<SessionAsset | undefined>;
  listAssets(sessionId: string, filter?: { kinds?: SessionAssetKind[] }): Promise<SessionAsset[]>;
  deleteAsset(sessionId: string, assetId: string): Promise<void>;

  // IO helpers
  writeText(sessionId: string, name: string, content: string, kind?: SessionAssetKind, mime?: string): Promise<SessionAsset>;
  writeBinary(sessionId: string, name: string, bytes: Uint8Array, kind?: SessionAssetKind, mime?: string): Promise<SessionAsset>;
  readText(sessionId: string, assetId: string): Promise<string>;
  readBinary(sessionId: string, assetId: string): Promise<Uint8Array>;

  // Utilities
  computeSessionSize(sessionId: string): Promise<{ sizeBytes: number; assetCount: number }>;
  moveIntoSession(sessionId: string, srcPath: string, opts?: { name?: string; kind?: SessionAssetKind; mime?: string }): Promise<SessionAsset>;
}
