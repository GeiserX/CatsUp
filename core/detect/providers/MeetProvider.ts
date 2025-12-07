export type MeetingApp = 'meet';
export type MeetingPhase = 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';

export interface WindowContext {
  processName: string;        // e.g., "Google Meet" (PWA), "Google Chrome", "Microsoft Edge"
  windowTitle: string;        // e.g., "Standup — Google Meet" or "abc-defg-hij — Google Meet"
  appId?: string;
  className?: string;
  isActive?: boolean;
  url?: string;               // if available (may include meet.google.com/<code>)
}

export interface DetectionResult {
  app: MeetingApp;
  match: boolean;
  confidence: number;         // 0..1 heuristic
  reason?: string;
  phase: MeetingPhase;
  meetingTitle?: string;
}

const PROC_HINTS = /\b(Google\s+Meet|Google\s+Chrome|Microsoft\s+Edge)\b/i; // PWA often runs under Chrome/Edge
const TITLE_MEET = /\b(Google\s+Meet|meet\.google\.com)\b/i;
const TITLE_HINTS = /\b(Meet|Presenting|Presentation|Share screen|Meeting)\b/i;
const PRESENTING_HINTS = /\b(Presenting|Present|Sharing|Share screen)\b/i;
const PREJOIN_HINTS = /\b(Join|Ready to join|Preview|Waiting)\b/i;
const IN_CALL_HINTS = /\b(Meet|Meeting|In call|Live captions|Recording)\b/i;
// Meet code pattern: abc-defg-hij
const MEET_CODE = /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/;

function inferPhase(title: string): MeetingPhase {
  if (PRESENTING_HINTS.test(title)) return 'presenting';
  if (PREJOIN_HINTS.test(title)) return 'prejoin';
  if (IN_CALL_HINTS.test(title) || MEET_CODE.test(title)) return 'in_call';
  return 'unknown';
}

function cleanTitle(title: string): string {
  // Examples:
  // - "Standup — Google Meet"
  // - "abc-defg-hij — Google Meet"
  // - "Google Meet — Standup"
  let t = title
    .replace(/\s*[—|-]\s*Google\s+Meet\s*$/i, '')
    .replace(/^\s*Google\s+Meet\s*[—|-]\s*/i, '')
    .trim();

  // Remove generic words
  t = t.replace(/\b(Meet|Meeting|Presenting|Presentation|Share screen)\b/gi, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

  return t || title.trim();
}

export class MeetProvider {
  getName(): MeetingApp {
    return 'meet';
  }

  isCandidate(processName: string, windowTitle: string): boolean {
    const pn = processName ?? '';
    const wt = windowTitle ?? '';
    // Prefer explicit Google Meet indicator in the title
    if (TITLE_MEET.test(wt)) return true;
    // Fall back to process hints (for PWA or browser app shortcuts)
    if (PROC_HINTS.test(pn) && (TITLE_MEET.test(wt) || MEET_CODE.test(wt))) return true;
    return false;
  }

  detect(ctx: WindowContext): DetectionResult {
    const processName = ctx.processName ?? '';
    const windowTitle = ctx.windowTitle ?? '';
    const url = ctx.url ?? '';

    const titleHasMeet = TITLE_MEET.test(windowTitle);
    const titleHints = TITLE_HINTS.test(windowTitle);
    const codeInTitle = MEET_CODE.test(windowTitle);
    const urlIsMeet = /https?:\/\/meet\.google\.com\//i.test(url);

    let confidence = 0;
    const reasons: string[] = [];

    if (titleHasMeet) {
      confidence += 0.5;
      reasons.push('title contains "Google Meet"');
    }
    if (titleHints) {
      confidence += 0.2;
      reasons.push('title contains meeting/presenting hints');
    }
    if (codeInTitle || urlIsMeet) {
      confidence += 0.25;
      reasons.push('meeting code/url detected');
    }
    // If process suggests Chrome/Edge and title hints align, boost slightly
    if (PROC_HINTS.test(processName) && (titleHasMeet || codeInTitle)) {
      confidence += 0.05;
      reasons.push('process suggests Meet PWA/browser app');
    }
    confidence = Math.min(1, confidence);

    const phase = inferPhase(windowTitle);
    const meetingTitle = this.extractMeetingTitle(windowTitle);

    return {
      app: 'meet',
      match: titleHasMeet || codeInTitle || urlIsMeet,
      confidence,
      reason: reasons.join('; '),
      phase,
      meetingTitle,
    };
  }

  extractMeetingTitle(windowTitle: string): string | undefined {
    if (!windowTitle) return undefined;
    const cleaned = cleanTitle(windowTitle);
    if (!cleaned || /^(Google\s+Meet)$/i.test(cleaned)) return undefined;
    return cleaned;
  }
}
