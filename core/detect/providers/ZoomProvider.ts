export type MeetingApp = 'zoom';
export type MeetingPhase = 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown';

export interface WindowContext {
  processName: string;        // e.g., "zoom", "zoom.us", "Zoom"
  windowTitle: string;        // e.g., "Zoom Meeting", "Project Review - Zoom"
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

const PROC_REGEX = /\b(zoom(\.us)?|zoom\s+workplace|zoom\s+meeting)\b/i;
const TITLE_ZOOM = /\b(Zoom|zoom\.us)\b/;
const TITLE_HINTS = /\b(Meeting|Webinar|Sharing|Share screen|Waiting Room|Breakout)\b/i;
const PRESENTING_HINTS = /\b(Sharing|Share screen|Presenting)\b/i;
const PREJOIN_HINTS = /\b(Waiting Room|Join|Connecting)\b/i;
const IN_CALL_HINTS = /\b(Meeting|Webinar|In meeting|Breakout)\b/i;

function includesZoomProcess(name: string): boolean {
  return PROC_REGEX.test(name);
}

function inferPhase(title: string): MeetingPhase {
  if (PRESENTING_HINTS.test(title)) return 'presenting';
  if (PREJOIN_HINTS.test(title)) return 'prejoin';
  if (IN_CALL_HINTS.test(title)) return 'in_call';
  return 'unknown';
}

function cleanTitle(title: string): string {
  // Remove app name and generic hints from title
  let t = title
    .replace(/\s*[-|•]\s*Zoom(\s+Meeting|\s+Workplace)?\s*$/i, '')
    .replace(/^\s*Zoom(\s+Meeting|\s+Workplace)?\s*[-|•:]\s*/i, '')
    .trim();

  t = t.replace(/\b(Meeting|Webinar|Sharing|Share screen|Waiting Room|In meeting)\b/gi, '')
       .replace(/\s{2,}/g, ' ')
       .trim();

  return t || title.trim();
}

export class ZoomProvider {
  getName(): MeetingApp {
    return 'zoom';
  }

  isCandidate(processName: string, windowTitle: string): boolean {
    const pn = processName ?? '';
    const wt = windowTitle ?? '';
    if (includesZoomProcess(pn)) return true;
    if (TITLE_ZOOM.test(wt)) return true;
    return false;
  }

  detect(ctx: WindowContext): DetectionResult {
    const processName = ctx.processName ?? '';
    const windowTitle = ctx.windowTitle ?? '';

    const byProcess = includesZoomProcess(processName);
    const titleHasZoom = TITLE_ZOOM.test(windowTitle);
    const titleHints = TITLE_HINTS.test(windowTitle);

    let confidence = 0;
    const reasons: string[] = [];

    if (byProcess) {
      confidence += 0.65;
      reasons.push('process matched Zoom');
    }
    if (titleHasZoom) {
      confidence += 0.2;
      reasons.push('title contains "Zoom"');
    }
    if (titleHints) {
      confidence += 0.15;
      reasons.push('title contains meeting/webinar hints');
    }
    confidence = Math.min(1, confidence);

    const phase = inferPhase(windowTitle);
    const meetingTitle = this.extractMeetingTitle(windowTitle);

    return {
      app: 'zoom',
      match: byProcess || titleHasZoom || (titleHints && windowTitle.length > 0),
      confidence,
      reason: reasons.join('; '),
      phase,
      meetingTitle,
    };
  }

  extractMeetingTitle(windowTitle: string): string | undefined {
    if (!windowTitle) return undefined;
    const cleaned = cleanTitle(windowTitle);
    if (!cleaned || /^(Zoom(\s+Meeting|\s+Workplace)?)$/i.test(cleaned)) return undefined;
    return cleaned;
  }
}
