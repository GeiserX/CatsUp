export type AudioCaptureState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export type AudioTrackKind = 'app' | 'mic';

export type SampleFormat = 'f32' | 's16' | 's24' | 's32';

export interface AudioFormat {
  sampleRate: number;        // Hz
  channels: number;          // 1=mono, 2=stereo, etc.
  sampleFormat: SampleFormat;
  interleaved?: boolean;     // true if channels are interleaved
}

export interface AudioSamples {
  /**
   * PCM buffer containing samples for a single time slice.
   * The concrete typed array must align with format.sampleFormat.
   * - f32 -> Float32Array
   * - s16 -> Int16Array
   * - s24/s32 (packed) -> Int32Array (implementation-defined packing)
   */
  pcm:
    | Float32Array
    | Int16Array
    | Int32Array;
  timestamp: number;         // epoch ms or monotonic ms (implementation-defined but consistent)
  format: AudioFormat;
  track: AudioTrackKind;     // which track produced these samples
  frameId: number;           // monotonically increasing id per track
}

export interface AudioCaptureStats {
  startedAt?: number;        // epoch ms
  framesCaptured: number;    // number of sample callbacks issued
  bytesProduced: number;
  xruns?: number;            // buffer under/overruns if measurable
  clippedSamples?: number;   // count of clipped samples if measurable
  rms?: {
    app?: number;            // recent RMS level [0..1] for app track
    mic?: number;            // recent RMS level [0..1] for mic track
  };
}

export interface AudioCaptureOptions {
  // What to capture
  captureAppAudio?: boolean; // default: true
  captureMic?: boolean;      // default: true

  // Target app selection (platform-specific)
  appProcessId?: number;     // per-app session capture (preferred)
  appSessionId?: string;     // optional platform/session identifier

  // Mic device selection
  micDeviceId?: string;      // device id as known to the platform; default system mic

  // DSP options (if supported)
  echoCancel?: boolean;      // enable AEC for mic path
  noiseSuppress?: boolean;   // enable NS
  gain?: number;             // linear gain for mic path (e.g., 1.0 = unity)

  // Output format preferences (implementation may choose closest match)
  desiredFormat?: Partial<AudioFormat>;

  // Callback pacing (approximate duration per callback)
  frameSizeMs?: number;      // e.g., 10, 20, 40
}

export interface IAudioCapture {
  /**
   * Start audio capture according to the provided options.
   */
  start(options: AudioCaptureOptions): Promise<void>;

  /**
   * Stop audio capture. Resolves once streams are fully torn down.
   */
  stop(): Promise<void>;

  /**
   * Subscribe to audio sample frames.
   * Returns an unsubscribe function.
   */
  onSamples(cb: (samples: AudioSamples) => void): () => void;

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  onStateChanged(cb: (state: AudioCaptureState) => void): () => void;

  /**
   * Subscribe to errors occurring within the capture pipeline.
   * Returns an unsubscribe function.
   */
  onError(cb: (err: Error) => void): () => void;

  /**
   * Retrieve rolling statistics for diagnostics/telemetry.
   */
  getStats(): Promise<AudioCaptureStats>;

  /**
   * Get quick level meters (RMS) without waiting for next onSamples.
   * Implementations may compute this over a short recent window.
   */
  getLevels(): Promise<{ appRms?: number; micRms?: number }>;

  /**
   * Current state snapshot.
   */
  readonly state: AudioCaptureState;
}
