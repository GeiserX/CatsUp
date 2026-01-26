// core/vision/IScreenAnalyzer.ts
// Screen understanding pipeline that orchestrates video capture, keyframe extraction,
// OCR, vision analysis, and timeline generation.

import { VideoFrame } from '../capture/IVideoCapture';
import { VisionAnalysisResult, VisionLatencyMode } from '../ai/IVisionService';
import { Answer } from '../ai/IQAService';

export type SamplingStrategy = 'fixed' | 'adaptive' | 'change-based';
// fixed: Constant FPS sampling
// adaptive: Adjust FPS based on content activity
// change-based: Only capture when screen changes significantly

export interface ScreenAnalyzerConfig {
  // Latency mode determines the overall processing strategy
  latencyMode: VisionLatencyMode;
  
  // Frame sampling configuration
  samplingStrategy: SamplingStrategy;
  fixedFps?: number;              // For 'fixed' strategy (default: 1)
  minFps?: number;                // Minimum FPS for adaptive (default: 0.2)
  maxFps?: number;                // Maximum FPS for adaptive (default: 2)
  changeThreshold?: number;       // 0-1, for adaptive/change-based (default: 0.1)
  
  // OCR configuration
  ocrAccuracy: 'high' | 'standard';
  ocrLanguages?: string[];        // Expected languages
  
  // Vision analysis configuration
  visionProvider: 'local' | 'cloud' | string;
  visionModel?: string;           // Specific model ID
  analyzeEveryNthKeyframe?: number; // Run full vision on every Nth keyframe (default: 1 for realtime, 3 for near-realtime)
  
  // Storage configuration
  storeKeyframes?: boolean;       // Keep keyframe images (default: true)
  maxKeyframesStored?: number;    // Limit stored keyframes (default: 1000)
  
  // Integration with transcript
  linkToTranscript?: boolean;     // Attempt to link visual events to transcript segments
}

export interface VisualEvent {
  id: string;
  startTime: number;              // epoch ms
  endTime?: number;               // epoch ms, undefined if ongoing
  
  // Event classification
  type: 'slide-change' | 'app-switch' | 'text-update' | 'scroll' | 'navigation' | 'popup' | 'custom';
  subtype?: string;               // More specific classification
  
  // Event content
  summary: string;                // Human-readable description
  details?: string;               // More detailed description
  
  // Visual evidence
  keyframeId?: number;            // Reference to the keyframe that triggered this event
  keyframePath?: string;          // Path to stored keyframe image
  ocrSnapshot?: string;           // OCR text at this moment
  
  // Context
  appContext?: string;            // Application where event occurred
  contentType?: string;           // Type of content
  
  // Linkage to audio transcript
  linkedTranscriptSegments?: string[];  // IDs of transcript segments during this event
  
  // Confidence
  confidence?: number;            // 0-1
}

export interface VisualTimeline {
  startTime: number;              // epoch ms
  endTime?: number;               // epoch ms
  
  events: VisualEvent[];
  keyframes: KeyframeInfo[];
  
  // Summary statistics
  totalKeyframes: number;
  totalEvents: number;
  appsDetected: string[];
  
  // Full OCR timeline (text at each keyframe)
  ocrSnapshots: Array<{
    timestamp: number;
    text: string;
  }>;
}

export interface KeyframeInfo {
  id: number;
  timestamp: number;
  changeScore: number;            // How different from previous (0-1, 0 = identical)
  ocrText?: string;
  description?: string;
  appContext?: string;
  storagePath?: string;           // Path to stored image
}

export type ScreenAnalyzerState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface ScreenAnalyzerStats {
  framesProcessed: number;
  keyframesExtracted: number;
  eventsDetected: number;
  ocrCalls: number;
  visionCalls: number;
  averageProcessingTimeMs: number;
  tokensUsed?: number;
}

export interface IScreenAnalyzer {
  /**
   * Configure the screen analyzer. Can be called before start() or to update config.
   */
  configure(config: ScreenAnalyzerConfig): void;

  /**
   * Start analyzing the video stream.
   * Requires video capture to be running and providing frames.
   */
  start(): Promise<void>;

  /**
   * Pause analysis (frames may still be buffered).
   */
  pause(): Promise<void>;

  /**
   * Resume analysis after pause.
   */
  resume(): Promise<void>;

  /**
   * Stop analysis and return the complete timeline.
   */
  stop(): Promise<VisualTimeline>;

  /**
   * Feed a video frame to the analyzer.
   * Called by the video capture system.
   */
  processFrame(frame: VideoFrame): void;

  /**
   * Subscribe to keyframe extraction events.
   * Called when a frame is selected as a keyframe.
   */
  onKeyframe(cb: (keyframe: KeyframeInfo, analysis?: VisionAnalysisResult) => void): () => void;

  /**
   * Subscribe to visual events.
   * Called when a significant visual event is detected.
   */
  onEvent(cb: (event: VisualEvent) => void): () => void;

  /**
   * Subscribe to state changes.
   */
  onStateChanged(cb: (state: ScreenAnalyzerState) => void): () => void;

  /**
   * Subscribe to errors.
   */
  onError(cb: (err: Error) => void): () => void;

  /**
   * Get the current timeline (may be incomplete if still running).
   */
  getTimeline(): VisualTimeline;

  /**
   * Get processing statistics.
   */
  getStats(): ScreenAnalyzerStats;

  /**
   * Ask a question about what was on screen.
   * Uses the timeline, keyframes, and optionally the transcript for context.
   */
  askAboutScreen(
    question: string,
    timeRange?: { start: number; end: number }
  ): Promise<Answer>;

  /**
   * Get OCR text for a specific time range.
   */
  getTextAtTime(timestamp: number): string | null;
  getTextInRange(start: number, end: number): string[];

  /**
   * Search for text across the timeline.
   */
  searchText(query: string): Array<{
    timestamp: number;
    text: string;
    context: string;
  }>;

  /**
   * Current state.
   */
  readonly state: ScreenAnalyzerState;

  /**
   * Current configuration.
   */
  readonly config: Readonly<ScreenAnalyzerConfig>;
}
