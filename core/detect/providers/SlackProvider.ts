export type MeetingApp = 'slack';
export type MeetingPhase = 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';

export interface WindowContext {
  processName: string;        // e.g., "Slack"
  windowTitle: string;        // e.g., "Huddle with #design — Slack"
  appId?: string;
  className?: string;
  isActive?: boolean;
  url?: string;
}

export interface DetectionResult {
  app: MeetingApp;
  match: boolean;
  confidence: number;         // 0..1 heuristic
  reason?: string;
  phase: MeetingPhase;
  meetingTitle?: string;
}

const PROC_REGEX = /\b(slack)\b/i;
const TITLE_SLACK = /\bSlack\b/;
const HUDDLE_HINTS = /\b(Huddle|Huddles|Call)\b/i;
const PRESENTING_HINTS = /\b(Share screen|Presenting|Sharing)\b/i;

function includesSlackProcess(name: string): boolean {
  return PROC_REGEX.test(name);
}

function inferPhase(title: string): MeetingPhase {
  if (PRESENTING_HINTS.test(title)) return 'presenting';
  if (HUDDLE_HINTS.test(title)) return 'in_call';
  return 'unknown';
}

function cleanTitle(title: string): string {
  // Examples:
  // - "Huddle with #design — Slack"
  // - "Call with @alex - Slack"
  let t = title
    .replace(/\s*[—|-]\s*Slack\s*$/i, '')
    .replace(/^\s*Slack\s*[—|-]\s*/i, '')
    .trim();

  // Remove generic markers
  t = t.replace(/\b(Huddle|Huddles|Call|Presenting|Share screen)\b/gi, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

  return t || title.trim();
}

export class SlackProvider {
  getName(): MeetingApp {
    return 'slack';
  }

  isCandidate(processName: string, windowTitle: string): boolean {
    const pn = processName ?? '';
    const wt = windowTitle ?? '';
    if (includesSlackProcess(pn)) return true;
    if (TITLE_SLACK.test(wt) && HUDDLE_HINTS.test(wt)) return true;
    return false;
  }

  detect(ctx: WindowContext): DetectionResult {
    const processName = ctx.processName ?? '';
    const windowTitle = ctx.windowTitle ?? '';

    const byProcess = includesSlackProcess(processName);
    const titleHasSlack = TITLE_SLACK.test(windowTitle);
    const huddle = HUDDLE_HINTS.test(windowTitle);

    let confidence = 0;
    const reasons: string[] = [];

    if (byProcess) {
      confidence += 0.6;
      reasons.push('process matched Slack');
    }
    if (titleHasSlack) {
      confidence += 0.2;
      reasons.push('title contains "Slack"');
    }
    if (huddle) {
      confidence += 0.2;
      reasons.push('title indicates Huddle/Call');
    }
    confidence = Math.min(1, confidence);

    const phase = inferPhase(windowTitle);
    const meetingTitle = this.extractMeetingTitle(windowTitle);

    return {
      app: 'slack',
      match: byProcess || (titleHasSlack && huddle),
      confidence,
      reason: reasons.join('; '),
      phase,
      meetingTitle,
    };
  }

  extractMeetingTitle(windowTitle: string): string | undefined {
    if (!windowTitle) return undefined;
    const cleaned = cleanTitle(windowTitle);
    if (!cleaned || /^Slack$/i.test(cleaned)) return undefined;
    return cleaned;
  }
}
