// ai-backends/local/fasterwhisper/TranscriberFasterWhisper.ts
// File or "quasi-stream" via an HTTP server that exposes Faster-Whisper.
// Expected server endpoints:
//  - POST /transcribe { filePath, language?, options? } -> { segments: [{start,end,text,words?}], language? }
//  - Optional: WS/Server-Sent Events for partials (not required here).

import {
  ITranscriber,
  TranscriberModelOptions,
  TranscriberOptions,
  TranscriberInput,
  TranscriptionResult,
  TranscriptSnapshot,
  TranscriptionSegment,
  TranscriberState,
} from '../../../core/ai/ITranscriber';

type FWConfig = {
  baseUrl: string;      // e.g., http://127.0.0.1:9090
  apiKey?: string;      // if your server requires one
  timeoutMs?: number;
};

export class TranscriberFasterWhisper implements ITranscriber {
  private cfg: FWConfig;
  private _state: TranscriberState = 'idle';
  private _model?: TranscriberModelOptions;
  private partialHandlers: Array<(p: { text: string; start?: number; end?: number }) => void> = [];
  private segmentHandlers: Array<(s: TranscriptionSegment) => void> = [];
  private stateHandlers: Array<(s: TranscriberState) => void> = [];
  private errorHandlers: Array<(e: Error) => void> = [];
  private snapshot: TranscriptSnapshot = { text: '', segments: [] };

  constructor(cfg: FWConfig) {
    this.cfg = cfg;
  }

  get state(): TranscriberState { return this._state; }
  get model(): Readonly<TranscriberModelOptions> | undefined { return this._model; }

  async load(model?: TranscriberModelOptions): Promise<void> {
    this._state = 'loading_model'; this.emitState();
    this._model = model;
    this._state = 'ready'; this.emitState();
  }

  async start(input: TranscriberInput, options?: TranscriberOptions): Promise<void> {
    if (!input.filePath) throw new Error('TranscriberFasterWhisper: filePath required');
    this._state = 'starting'; this.emitState();

    const body = {
      filePath: input.filePath,
      language: options?.language,
      options: {
        diarization: !!options?.diarization,
        timestamps: options?.timestamps ?? 'segments',
        maxSegmentMs: options?.maxSegmentMs,
      },
      model: this._model,
    };

    this._state = 'running'; this.emitState();

    const res = await fetch(`${this.cfg.baseUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: this.controllerWithTimeout()?.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      const err = new Error(`FasterWhisper server error: ${res.status} ${txt}`);
      this.emitError(err); throw err;
    }

    const data = await res.json();
    const segments: TranscriptionSegment[] = (data.segments ?? []).map((s: any) => ({
      id: String(s.id ?? `${s.start}-${s.end}`),
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: String(s.text ?? '').trim(),
      words: Array.isArray(s.words)
        ? s.words.map((w: any) => ({ start: w.start, end: w.end, word: String(w.word ?? w.text ?? ''), prob: w.prob }))
        : undefined,
    }));

    segments.forEach((seg) => this.segmentHandlers.forEach((h) => h(seg)));

    this.snapshot = {
      text: segments.map((s) => s.text).join(' ').trim(),
      segments,
      language: data.language,
      startedAt: this.snapshot.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }

  async pause(): Promise<void> { /* no-op */ }
  async resume(): Promise<void> { /* no-op */ }

  async stop(): Promise<TranscriptionResult> {
    this._state = 'stopped'; this.emitState();
    return { ...this.snapshot };
  }

  onPartial(cb: (p: { text: string; start?: number; end?: number }) => void): () => void {
    this.partialHandlers.push(cb);
    return () => { this.partialHandlers = this.partialHandlers.filter((h) => h !== cb); };
  }
  onSegment(cb: (seg: TranscriptionSegment) => void): () => void {
    this.segmentHandlers.push(cb);
    return () => { this.segmentHandlers = this.segmentHandlers.filter((h) => h !== cb); };
  }
  onStateChanged(cb: (s: TranscriberState) => void): () => void {
    this.stateHandlers.push(cb);
    return () => { this.stateHandlers = this.stateHandlers.filter((h) => h !== cb); };
  }
  onError(cb: (err: Error) => void): () => void {
    this.errorHandlers.push(cb);
    return () => { this.errorHandlers = this.errorHandlers.filter((h) => h !== cb); };
  }

  async getTranscript(): Promise<TranscriptSnapshot> { return this.snapshot; }
  async exportSubtitles(format: 'srt' | 'vtt'): Promise<string> {
    // generate minimal SRT/VTT on demand
    const toTime = (sec: number, srt: boolean) => {
      const ms = Math.round((sec % 1) * 1000);
      const S = Math.floor(sec) % 60, M = Math.floor(sec / 60) % 60, H = Math.floor(sec / 3600);
      return srt ? `${pad(H)}:${pad(M)}:${pad(S)},${ms.toString().padStart(3, '0')}` : `${pad(H)}:${pad(M)}:${pad(S)}.${ms.toString().padStart(3, '0')}`;
    };
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (format === 'srt') {
      return this.snapshot.segments.map((s, i) =>
        `${i + 1}\n${toTime(s.start, true)} --> ${toTime(s.end, true)}\n${s.text}\n`
      ).join('\n');
    }
    const body = this.snapshot.segments.map((s) =>
      `${toTime(s.start, false)} --> ${toTime(s.end, false)}\n${s.text}\n`
    ).join('\n');
    return `WEBVTT\n\n${body}`;
  }

  private controllerWithTimeout(): AbortController | undefined {
    if (!this.cfg.timeoutMs) return undefined;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    return ctrl;
  }

  private emitState() { this.stateHandlers.forEach((h) => h(this._state)); }
  private emitError(e: Error) { this.errorHandlers.forEach((h) => h(e)); }
}
