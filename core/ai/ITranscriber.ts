// ai/ITranscriber.ts

export type TranscriberState =
  | 'idle'
  | 'loading_model'
  | 'ready'
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

export type TranscriptionMode = 'file' | 'stream'; // file: offline batch; stream: low-latency

export interface TranscriberModelOptions {
  // Model selection/configuration for local or cloud engines.
  // Implementations can ignore options they don't support.
  engine?: 'local-fasterwhisper' | 'local-whispercpp' | 'cloud-provider-x' | string;
  modelId?: string;           // e.g., "large-v3", "medium", or provider-specific
  device?: 'auto' | 'cpu' | 'gpu'; // hint
  language?: string;          // BCP-47 code or ISO-639-1; "auto" supported via options.language = 'auto'
}

export interface TranscriberOptions {
  mode?: TranscriptionMode;
  language?: string | 'auto';
  diarization?: boolean;      // attempt speaker separation
  punctuation?: boolean;      // add punctuation if engine supports it
  profanityFilter?: boolean;
  timestamps?: 'segments' | 'words' | 'none';
  maxSegmentMs?: number;      // preferred segmentation granularity in ms
  // Streaming options
  partials?: boolean;         // emit interim hypotheses
  vad?: boolean;              // voice activity detection for stream mode
  latencyTargetMs?: number;   // tuning for stream mode
}

export interface TranscriberInput {
  // For file mode
  filePath?: string;
  // For stream mode: track identifiers from your recorder/mixer
  appTrackId?: string;        // app/session audio
  micTrackId?: string;        // microphone audio
  // Optional: raw PCM routing keys if you wire your own buffers
  busKeys?: { app?: string; mic?: string };
}

export interface WordTiming {
  start: number;              // seconds
  end: number;                // seconds
  word: string;
  prob?: number;              // 0..1
}

export interface TranscriptionSegment {
  id: string;                 // unique per segment
  start: number;              // seconds
  end: number;                // seconds
  text: string;
  speaker?: string | number;  // diarization label
  channel?: 'app' | 'mic';    // source channel if distinguishable
  words?: WordTiming[];       // when timestamps === 'words'
  avgLogProb?: number;
  noSpeechProb?: number;
}

export interface TranscriptSnapshot {
  text: string;
  segments: TranscriptionSegment[];
  language?: string;
  startedAt?: number;         // epoch ms
  updatedAt?: number;         // epoch ms
}

export interface TranscriptionResult extends TranscriptSnapshot {
  // Convenience subtitle exports (content, not file paths).
  srt?: string;
  vtt?: string;
}

export interface ITranscriber {
  /**
   * Optionally preload/initialize the model/runtime.
   */
  load(model?: TranscriberModelOptions): Promise<void>;

  /**
   * Start transcribing from a file or active streams.
   */
  start(input: TranscriberInput, options?: TranscriberOptions): Promise<void>;

  /**
   * Pause and resume for stream mode; no-op for file mode unless supported.
   */
  pause(): Promise<void>;
  resume(): Promise<void>;

  /**
   * Stop and finalize. Returns the full transcript and optional subtitles.
   */
  stop(): Promise<TranscriptionResult>;

  /**
   * Subscribe to partial (interim) hypotheses.
   * Only emitted if options.partials = true.
   */
  onPartial(cb: (partial: { text: string; start?: number; end?: number }) => void): () => void;

  /**
   * Subscribe to finalized segments as they are produced.
   */
  onSegment(cb: (seg: TranscriptionSegment) => void): () => void;

  /**
   * Subscribe to state changes.
   */
  onStateChanged(cb: (state: TranscriberState) => void): () => void;

  /**
   * Subscribe to errors.
   */
  onError(cb: (err: Error) => void): () => void;

  /**
   * Retrieve the current transcript snapshot (non-destructive).
   */
  getTranscript(): Promise<TranscriptSnapshot>;

  /**
   * Export subtitles for the current transcript as text content.
   */
  exportSubtitles(format: 'srt' | 'vtt'): Promise<string>;

  /**
   * Current state snapshot.
   */
  readonly state: TranscriberState;

  /**
   * Currently loaded model options (if any).
   */
  readonly model?: Readonly<TranscriberModelOptions>;
}
