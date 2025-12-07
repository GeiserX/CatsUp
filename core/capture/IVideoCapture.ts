export type VideoCaptureState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export type VideoPixelFormat = 'rgba' | 'bgra' | 'nv12';

export interface VideoCaptureOptions {
  width?: number;            // target width; implementation may preserve aspect ratio
  height?: number;           // target height
  fps?: number;              // target frames per second
  includeCursor?: boolean;   // whether to capture cursor
  pixelFormat?: VideoPixelFormat; // desired pixel format
}

export interface VideoFrame {
  data: ArrayBuffer;         // raw frame bytes in the chosen pixelFormat
  timestamp: number;         // epoch ms or monotonic ms (implementation-defined but consistent)
  width: number;
  height: number;
  format: VideoPixelFormat;
  frameId: number;           // monotonically increasing id
}

export interface VideoCaptureStats {
  startedAt?: number;        // epoch ms
  framesCaptured: number;
  framesDropped: number;
  averageFps?: number;
  bytesProduced: number;
}

export interface IVideoCapture {
  /**
   * Configure capture parameters. May be called before start(), or no-op after start() depending on implementation.
   */
  configure(options: VideoCaptureOptions): void;

  /**
   * Start capturing a specific window or app scope.
   * windowHandle: OS-specific window identifier (HWND on Windows, CGWindowID/NSWindowNumber on macOS) or an implementation-defined handle.
   * appId: optional application identifier (bundle id/process name) to assist platform adapters.
   */
  start(windowHandle: string | number, appId?: string): Promise<void>;

  /**
   * Stop capturing. Resolves once the capture pipeline is fully torn down.
   */
  stop(): Promise<void>;

  /**
   * Subscribe to decoded frames.
   * Returns an unsubscribe function.
   */
  onFrame(cb: (frame: VideoFrame) => void): () => void;

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  onStateChanged(cb: (state: VideoCaptureState) => void): () => void;

  /**
   * Subscribe to errors occurring within the capture pipeline.
   * Returns an unsubscribe function.
   */
  onError(cb: (err: Error) => void): () => void;

  /**
   * Retrieve rolling statistics for diagnostics/telemetry.
   */
  getStats(): Promise<VideoCaptureStats>;

  /**
   * Current state snapshot.
   */
  readonly state: VideoCaptureState;

  /**
   * Latest applied options (post-configuration).
   */
  readonly options: Readonly<VideoCaptureOptions>;
}
