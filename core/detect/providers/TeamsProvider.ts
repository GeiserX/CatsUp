export type MeetingApp = 'teams';
export type MeetingPhase = 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';

export interface WindowContext {
  processName: string;        // e.g., "Teams", "Microsoft Teams", "Teams.exe"
  windowTitle: string;        // e.g., "Weekly Sync - Microsoft Teams"
  appId?: string;             // e.g., com.microsoft.teams2
  className?: string;         // platform-specific window class
  isActive?: boolean;         // focused/foreground hint
  url?: string;               // optional for PWAs (not required for Teams)
}

export interface DetectionResult {
  app: MeetingApp;
  match: boolean;
  confidence: number;         // 0..1 heuristic
  reason?: string;
  phase: MeetingPhase;
  meetingTitle?: string;
}

const PROC_REGEX = /\b(microsoft\s+teams|teams)\b/i;
const TITLE_HARD_HINTS = /\b(Meeting|Call|Presenting|Stage|Lobby|Join now|In a call|Live event)\b/i;
const PRESENTING_HINTS = /\b(Presenting|Sharing|Share screen|Stage)\b/i;
const LOBBY_HINTS = /\b(Lobby|Waiting|Pre[-\s]?join|Join now)\b/i;
const IN_CALL_HINTS = /\b(Meeting|Call|Live event|In a call)\b/i;

function includesTeamsProcess(name: string): boolean {
  return PROC_REGEX.test(name);
}

function inferPhase(title: string): MeetingPhase {
  if (PRESENTING_HINTS.test(title)) return 'presenting';
  if (LOBBY_HINTS.test(title)) return 'prejoin';
  if (IN_CALL_HINTS.test(title)) return 'in_call';
  return 'unknown';
}

function cleanTitle(title: string): string {
  // Common suffixes/prefixes in Teams window titles
  // Examples:
  //  - "Weekly Sync | Microsoft Teams"
  //  - "Microsoft Teams - Weekly Sync"
  let t = title
    .replace(/\s*\|\s*Microsoft\s+Teams\s*$/i, '')
    .replace(/^\s*Microsoft\s+Teams\s*[-|:]\s*/i, '')
    .trim();

  // Remove generic words that aren't the meeting name
  t = t.replace(/\b(Conference call|Meeting|Call|Presenting|Stage|Lobby)\b/gi, '').replace(/\s{2,}/g, ' ').trim();

  return t || title.trim();
}

export class TeamsProvider {
  getName(): MeetingApp {
    return 'teams';
  }

  isCandidate(processName: string, windowTitle: string): boolean {
    const pn = processName ?? '';
    const wt = windowTitle ?? '';
    if (includesTeamsProcess(pn)) return true;
    // Some desktop shells may yield generic process names; rely on strong title hints
    if (TITLE_HARD_HINTS.test(wt) && /Teams/i.test(wt)) return true;
    return false;
  }

  detect(ctx: WindowContext): DetectionResult {
    const processName = ctx.processName ?? '';
    const windowTitle = ctx.windowTitle ?? '';

    const byProcess = includesTeamsProcess(processName);
    const titleHasTeams = /Teams/i.test(windowTitle);
    const titleHints = TITLE_HARD_HINTS.test(windowTitle);

    let confidence = 0;
    const reasons: string[] = [];

    if (byProcess) {
      confidence += 0.6;
      reasons.push('process matched Teams');
    }
    if (titleHasTeams) {
      confidence += 0.2;
      reasons.push('title contains "Teams"');
    }
    if (titleHints) {
      confidence += 0.2;
      reasons.push('title contains meeting/call hints');
    }
    confidence = Math.min(1, confidence);

    const phase = inferPhase(windowTitle);
    const meetingTitle = this.extractMeetingTitle(windowTitle);

    return {
      app: 'teams',
      match: byProcess || (titleHasTeams && titleHints),
      confidence,
      reason: reasons.join('; '),
      phase,
      meetingTitle,
    };
  }

  extractMeetingTitle(windowTitle: string): string | undefined {
    if (!windowTitle) return undefined;
    const cleaned = cleanTitle(windowTitle);
    // If cleaned is still generic, return undefined
    if (!cleaned || /^(Microsoft\s+Teams)$/i.test(cleaned)) return undefined;
    return cleaned;
  }
}
