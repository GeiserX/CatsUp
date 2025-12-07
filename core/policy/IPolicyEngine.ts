// High-level policy toggles and constraints
export interface PolicyConfig {
  autoStart?: boolean;                     // start recording automatically on detection
  autoStop?: boolean;                      // stop when meeting ends/idle
  promptOnDetect?: boolean;                // ask user before starting
  minConfidence?: number;                  // require >= this confidence
  allowedApps?: Array<'teams' | 'zoom' | 'slack' | 'meet' | string>;
  quietHours?: Array<{ from: string; to: string }>; // "HH:mm" local time
  requireMic?: boolean;                    // only start if mic available
  requireAppAudio?: boolean;               // only start if app audio capturable
  startOnPresenting?: boolean;             // also start when presenting is detected
  idleEndMs?: number;                      // end if no activity for N ms
}

// Minimal session snapshot (keep decoupled from detector impl)
export interface PolicySessionSnapshot {
  id: string;
  app: string;
  title?: string;
  phase?: 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';
  confidence?: number;
  startedAt?: number;
  lastSeenAt?: number;
  isActive?: boolean;
}

export interface DetectContext {
  app: string;
  processId?: number;
  windowHandle?: string | number;
  windowTitle: string;
  meetingTitle?: string;
  phase: 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';
  confidence: number;
  isActive?: boolean;
  env?: Record<string, any>;               // any extra hints (devices available, etc.)
}

export interface UpdateContext {
  session: PolicySessionSnapshot;
  patch: Partial<PolicySessionSnapshot>;
}

export interface EndContext {
  session: PolicySessionSnapshot;
  reason: 'windowClosed' | 'processExited' | 'inactiveTimeout' | 'manual' | 'unknown';
}

// Policy decisions the engine can return
export type PolicyDecision =
  | { type: 'none'; reason?: string }
  | { type: 'start'; mode?: 'auto' | 'prompt'; reason?: string }
  | { type: 'stop'; reason?: string }
  | { type: 'pause'; reason?: string }
  | { type: 'resume'; reason?: string }
  | { type: 'bookmark'; label?: string; reason?: string };

export interface PolicyRule<Evt> {
  id: string;
  description?: string;
  priority?: number;                       // higher wins; default 0
  match: (event: Evt, config: PolicyConfig) => number | boolean; // score or boolean
  decide: (event: Evt, config: PolicyConfig) => PolicyDecision;
}

export type OnDetectRule = PolicyRule<DetectContext>;
export type OnUpdateRule = PolicyRule<UpdateContext>;
export type OnEndRule = PolicyRule<EndContext>;

export interface DecisionEvent {
  when: 'detect' | 'update' | 'end';
  input: DetectContext | UpdateContext | EndContext;
  decision: PolicyDecision;
  appliedRuleId?: string;
  ts: number;
}

export interface IPolicyEngine {
  // Configuration
  configure(config: PolicyConfig): void;
  getConfig(): PolicyConfig;

  // Rule management
  addDetectRule(rule: OnDetectRule): void;
  addUpdateRule(rule: OnUpdateRule): void;
  addEndRule(rule: OnEndRule): void;
  removeRule(ruleId: string): void;
  listRules(): Array<{ id: string; when: 'detect' | 'update' | 'end'; priority: number }>;

  // Evaluation
  evaluateOnDetect(ctx: DetectContext): PolicyDecision;
  evaluateOnUpdate(ctx: UpdateContext): PolicyDecision;
  evaluateOnEnd(ctx: EndContext): PolicyDecision;

  // Events
  onDecision(cb: (e: DecisionEvent) => void): () => void;
}
