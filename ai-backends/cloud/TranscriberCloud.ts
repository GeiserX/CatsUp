// ai-backends/cloud/TranscriberCloud.ts
// File-mode cloud transcription using provider registry (e.g., OpenAI Whisper API).
// Stream mode not implemented in this adapter.

import {
  ITranscriber,
  TranscriberModelOptions,
  TranscriberOptions,
  TranscriberInput,
  TranscriptionResult,
  TranscriptSnapshot,
  TranscriptionSegment,
  TranscriberState,
} from '../../ai/ITranscriber';
import { CloudProviderRegistry } from './CloudProvider';
import { readFile } from 'node:fs/promises';
import { Blob } from 'node:buffer';

export type CloudTranscriberConfig = {
  providerId: string;        // e.g., "openai"
  model: string;             // e.g., "whisper-1" or "gpt-4o-transcribe"
};

export class TranscriberCloud implements ITranscriber {
  private cfg: CloudTranscriberConfig;
  private _state: TranscriberState = 'idle';
  private _model?: TranscriberModelOptions;
  private segmentHandlers: Array<(s: TranscriptionSegment) => void> = [];
  private stateHandlers: Array<(s: TranscriberState) => void> = [];
  private errorHandlers: Array<(e: Error) => void> = [];
  private snapshot: TranscriptSnapshot = { text: '', segments: [] };

  constructor(cfg: CloudTranscriberConfig) {
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
    if (!input.filePath) throw new Error('TranscriberCloud: filePath required');
    this._state = 'starting'; this.emitState();

    const reg = CloudProviderRegistry.instance;
    const p = reg.get(this.cfg.providerId);
    if (!p) throw new Error(`provider not found: ${this.cfg.providerId}`);
    const key = reg.apiKey(p);
    if (!key) throw new Error(`missing API key env for provider ${p.id} (${p.apiKeyEnv || 'N/A'})`);

    this._state = 'running'; this.emitState();

    // Example: OpenAI audio transcriptions
    if (p.id === 'openai') {
      const endpoint = p.endpoint || 'https://api.openai.com/v1/audio/transcriptions';
      const fileBytes = await readFile(input.filePath);
      const form = new FormData();
      form.set('file', new Blob([fileBytes]), 'audio.wav');
      form.set('model', this.cfg.model);
      if (options?.language && options.language !== 'auto') form.set('language', options.language);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form as any,
      });

      if (!res.ok) {
        const txt = await res.text();
        const err = new Error(`Cloud STT error: ${res.status} ${txt}`);
        this.emitError(err); throw err;
      }
      const data = await res.json();
      // Minimal: assume "text" response
      const text: string = data.text ?? '';
      const seg: TranscriptionSegment = { id: '0', start: 0, end: Math.max(0, (text.length / 12)), text };
      this.segmentHandlers.forEach((h) => h(seg));
      this.snapshot = { text, segments: [seg], language: options?.language, startedAt: Date.now(), updatedAt: Date.now() };
      return;
    }

    throw new Error(`TranscriberCloud: provider ${p.id} not implemented in this adapter`);
  }

  async pause(): Promise<void> { /* no-op */ }
  async resume(): Promise<void> { /* no-op */ }

  async stop(): Promise<TranscriptionResult> {
    this._state = 'stopped'; this.emitState();
    return { ...this.snapshot };
  }

  onPartial(): () => void { return () => {}; }
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
  async exportSubtitles(): Promise<string> { return ''; }

  private emitState() { this.stateHandlers.forEach((h) => h(this._state)); }
  private emitError(e: Error) { this.errorHandlers.forEach((h) => h(e)); }
}
