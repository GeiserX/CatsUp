// ai-backends/local/whispercpp/TranscriberWhisperCpp.ts
// File-mode wrapper for whisper.cpp CLI. Stream mode is not supported here.
// Requires a local whisper.cpp build with a CLI binary (e.g., "main" or "whisper-cli") and a model file.
// Configure via TranscriberModelOptions.engine="local-whispercpp" and modelId=model path.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { nanoid } from 'nanoid';
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

type WhisperCppConfig = {
  binaryPath: string; // path to whisper.cpp CLI binary
  modelPath: string;  // path to .bin model (e.g., ggml-base.en.bin)
  extraArgs?: string[];
};

export class TranscriberWhisperCpp implements ITranscriber {
  private cfg?: WhisperCppConfig;
  private _state: TranscriberState = 'idle';
  private _model?: TranscriberModelOptions;
  private partialHandlers: Array<(p: { text: string; start?: number; end?: number }) => void> = [];
  private segmentHandlers: Array<(s: TranscriptionSegment) => void> = [];
  private stateHandlers: Array<(s: TranscriberState) => void> = [];
  private errorHandlers: Array<(e: Error) => void> = [];
  private snapshot: TranscriptSnapshot = { text: '', segments: [] };

  constructor(cfg?: Partial<WhisperCppConfig>) {
    if (cfg?.binaryPath && cfg?.modelPath) {
      this.cfg = { binaryPath: cfg.binaryPath, modelPath: cfg.modelPath, extraArgs: cfg.extraArgs ?? [] };
    }
  }

  get state(): TranscriberState {
    return this._state;
  }
  get model(): Readonly<TranscriberModelOptions> | undefined {
    return this._model;
  }

  async load(model?: TranscriberModelOptions): Promise<void> {
    this._state = 'loading_model'; this.emitState();
    // Only record provided options; whisper.cpp loads model per-run via CLI args.
    this._model = model;
    this._state = 'ready'; this.emitState();
  }

  async start(input: TranscriberInput, options?: TranscriberOptions): Promise<void> {
    if (!this.cfg?.binaryPath || !this.cfg?.modelPath) {
      const err = new Error('TranscriberWhisperCpp: binaryPath and modelPath must be configured.');
      this.emitError(err); throw err;
    }
    if (options?.mode === 'stream') {
      const err = new Error('TranscriberWhisperCpp: stream mode is not supported by this wrapper.');
      this.emitError(err); throw err;
    }
    if (!input.filePath) {
      const err = new Error('TranscriberWhisperCpp: filePath required for file mode.');
      this.emitError(err); throw err;
    }

    this._state = 'starting'; this.emitState();
    const outJson = `${input.filePath}.${nanoid()}.json`;
    const args = [
      '-m', this._model?.modelId || this.cfg.modelPath,
      '-f', input.filePath,
      '--output-json', '--output-file', outJson,
    ];

    if (options?.language && options.language !== 'auto') {
      args.push('-l', options.language);
    }
    if (options?.timestamps === 'words') {
      args.push('--max-len', '1'); // heuristic to force word-like segments
    }
    if (this.cfg.extraArgs?.length) args.push(...this.cfg.extraArgs);

    this._state = 'running'; this.emitState();

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.cfg!.binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.stdout.on('data', (d) => {
        // whisper.cpp prints progress; no standard partials. We ignore.
      });
      proc.on('error', (e) => { this.emitError(e); reject(e); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          const err = new Error(`whisper.cpp exited with code ${code}: ${stderr}`);
          this.emitError(err);
          reject(err);
        }
      });
    });

    // Parse output JSON (whisper.cpp JSON schema varies; attempt a generic parse)
    const jsonRaw = await fs.readFile(outJson, 'utf-8').catch(() => '{}');
    try {
      const parsed = JSON.parse(jsonRaw);
      const segments: TranscriptionSegment[] = [];
      const arr = parsed.segments ?? parsed.result ?? [];
      for (const s of arr) {
        const seg: TranscriptionSegment = {
          id: String(s.id ?? nanoid()),
          start: typeof s.start === 'number' ? s.start : (s.t0 ?? 0) / 100.0,
          end: typeof s.end === 'number' ? s.end : (s.t1 ?? 0) / 100.0,
          text: (s.text ?? '').toString().trim(),
          words: Array.isArray(s.words)
            ? s.words.map((w: any) => ({
                start: typeof w.start === 'number' ? w.start : (w.t0 ?? 0) / 100.0,
                end: typeof w.end === 'number' ? w.end : (w.t1 ?? 0) / 100.0,
                word: (w.word ?? w.text ?? '').toString(),
                prob: typeof w.prob === 'number' ? w.prob : undefined,
              }))
            : undefined,
        };
        segments.push(seg);
        this.segmentHandlers.forEach((h) => h(seg));
      }
      const text = segments.map((s) => s.text).join(' ').trim();
      this.snapshot = {
        text, segments, language: this._model?.language, startedAt: this.snapshot.startedAt ?? Date.now(), updatedAt: Date.now(),
      };
    } catch (e: any) {
      this.emitError(e);
    } finally {
      // Best-effort cleanup
      try { await fs.unlink(outJson); } catch {}
    }
  }

  async pause(): Promise<void> { /* no-op for file mode */ }
  async resume(): Promise<void> { /* no-op for file mode */ }

  async stop(): Promise<TranscriptionResult> {
    this._state = 'stopped'; this.emitState();
    return { ...this.snapshot, srt: this.toSrt(), vtt: this.toVtt() };
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

  async getTranscript(): Promise<TranscriptSnapshot> {
    return this.snapshot;
  }

  async exportSubtitles(format: 'srt' | 'vtt'): Promise<string> {
    return format === 'srt' ? this.toSrt() : this.toVtt();
  }

  private toSrt(): string {
    return this.snapshot.segments.map((s, i) =>
      `${i + 1}\n${fmtTime(s.start)} --> ${fmtTime(s.end)}\n${s.text}\n`
    ).join('\n');

    function fmtTime(sec: number) {
      const ms = Math.round((sec % 1) * 1000);
      const s = Math.floor(sec) % 60;
      const m = Math.floor(sec / 60) % 60;
      const h = Math.floor(sec / 3600);
      return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, '0')}`;
    }
    function pad(n: number) { return n.toString().padStart(2, '0'); }
  }

  private toVtt(): string {
    const body = this.snapshot.segments.map((s) =>
      `${fmtTime(s.start)} --> ${fmtTime(s.end)}\n${s.text}\n`
    ).join('\n');
    return `WEBVTT\n\n${body}`;

    function fmtTime(sec: number) {
      const ms = Math.round((sec % 1) * 1000);
      const s = Math.floor(sec) % 60;
      const m = Math.floor(sec / 60) % 60;
      const h = Math.floor(sec / 3600);
      return `${pad(h)}:${pad(m)}:${pad(s)}.${ms.toString().padStart(3, '0')}`;
    }
    function pad(n: number) { return n.toString().padStart(2, '0'); }
  }

  private emitState() { this.stateHandlers.forEach((h) => h(this._state)); }
  private emitError(e: Error) { this.errorHandlers.forEach((h) => h(e)); }
}
