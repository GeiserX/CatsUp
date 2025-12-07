// Canonical app identifiers your detector and providers should use.
export type MeetingApp = 'teams' | 'zoom' | 'slack' | 'meet' | string;

// Coarse-grained meeting phase for UX/automation.
export type MeetingPhase = 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';

// Window/process snapshot passed into providers for scoring/detection.
export interface WindowContext {
  processName: string;           // e.g., "Teams", "zoom.exe", "Slack"
  windowTitle: string;           // current window title text
  appId?: string;                // bundle id / app id (e.g., com.microsoft.teams2)
  className?: string;            // platform-specific window class
  isActive?: boolean;            // is this the foreground window
  url?: string;                  // optional (for PWAs/browser-hosted apps)
  processId?: number;            // OS process id (if known)
  windowHandle?: string | number;// HWND on Windows, CGWindowID/NSWindowNumber on macOS
}

// Result returned by providers for a given WindowContext.
export interface ProviderDetectionResult {
  app: MeetingApp;
  match: boolean;                // provider believes this is a (potential) meeting
  confidence: number;            // 0..1 heuristic score
  reason?: string;               // textual hints for debugging
  phase: MeetingPhase;
  meetingTitle?: string;         // extracted/cleaned title if available
}

// Contract for a detection provider (Teams, Zoom, Slack, Meet).
// Your existing provider classes can implement this shape.
export interface IMeetingProvider {
  getName(): MeetingApp;
  isCandidate(processName: string, windowTitle: string): boolean;
  detect(ctx: WindowContext): ProviderDetectionResult;
}

// Detector configuration knobs.
export interface DetectorConfig {
  pollIntervalMs?: number;       // how often to scan windows/processes (default e.g., 1000 ms)
  debounceMs?: number;           // suppress flapping updates within this window
  inactiveTimeoutMs?: number;    // end meeting if no activity/window for N ms
  minimumConfidence?: number;    // require at least this confidence to consider a match
  includeBackgroundWindows?: boolean; // if false, prefer foreground/active windows
}

// Canonical runtime session representing a detected meeting.
export interface MeetingSession {
  id: string;                    // stable session id assigned by detector
  app: MeetingApp;
  processId?: number;
  windowHandle?: string | number;
  windowTitle: string;
  meetingTitle?: string;
  phase: MeetingPhase;
  confidence: number;
  isActive: boolean;             // currently foreground/receiving input
  startedAt: number;             // epoch ms
  lastSeenAt: number;            // epoch ms
  provider: string;              // provider name that matched (e.g., "teams")
}

// Event payloads emitted by the detector.
export type MeetingDetectedEvent = {
  type: 'detected';
  session: MeetingSession;
};

export type MeetingUpdatedEvent = {
  type: 'updated';
  sessionId: string;
  patch: Partial<MeetingSession>;   // fields that changed (e.g., phase, title)
  session: MeetingSession;          // latest snapshot after patch
};

export type MeetingEndedEvent = {
  type: 'ended';
  sessionId: string;
  reason: 'windowClosed' | 'processExited' | 'inactiveTimeout' | 'manual' | 'unknown';
  final: MeetingSession;            // final snapshot at end
};

export type DetectorErrorEvent = {
  type: 'error';
  error: Error;
  context?: Record<string, unknown>;
};

export type DetectorEvent =
  | MeetingDetectedEvent
  | MeetingUpdatedEvent
  | MeetingEndedEvent
  | DetectorErrorEvent;

// Unified meeting detector interface.
// Platform-specific implementations will:
// - enumerate windows/processes,
// - build WindowContext entries,
// - query registered providers,
// - maintain sessions & emit events.
export interface IMeetingDetector {
  // Lifecycle
  start(config?: DetectorConfig): Promise<void>;
  stop(): Promise<void>;
  forceScan(): Promise<void>;      // trigger an immediate scan regardless of poll schedule

  // Providers management
  registerProvider(provider: IMeetingProvider): void;
  unregisterProvider(name: MeetingApp): void;
  listProviders(): string[];       // provider names

  // State/query
  getConfig(): DetectorConfig;
  setConfig(config: DetectorConfig): void;
  getActiveSessions(): Promise<MeetingSession[]>;
  getSessionById(id: string): Promise<MeetingSession | undefined>;

  // Control
  endSession(sessionId: string, reason?: MeetingEndedEvent['reason']): Promise<void>;

  // Events
  onEvent(cb: (e: DetectorEvent) => void): () => void; // subscribe to all events
  onDetected(cb: (e: MeetingDetectedEvent) => void): () => void;
  onUpdated(cb: (e: MeetingUpdatedEvent) => void): () => void;
  onEnded(cb: (e: MeetingEndedEvent) => void): () => void;
  onError(cb: (e: DetectorErrorEvent) => void): () => void;

  // Snapshot of running state for quick checks.
  readonly running: boolean;
}
