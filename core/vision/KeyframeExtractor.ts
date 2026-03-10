// core/vision/KeyframeExtractor.ts
// Adaptive frame sampling with change detection.
// Selects keyframes based on visual changes to reduce processing load.

import { VideoFrame } from '../capture/IVideoCapture';
import { SamplingStrategy } from './IScreenAnalyzer';

export interface KeyframeExtractorConfig {
  strategy: SamplingStrategy;
  
  // For 'fixed' strategy
  fixedFps: number;               // Frames per second to extract
  
  // For 'adaptive' and 'change-based' strategies
  changeThreshold: number;        // 0-1, below this = no significant change
  minFps: number;                 // Minimum extraction rate
  maxFps: number;                 // Maximum extraction rate
  
  // Slide/presentation detection
  detectSlideChanges: boolean;    // Use histogram comparison for slide detection
  slideChangeThreshold: number;   // Higher threshold for slide detection
  
  // Debouncing
  minIntervalMs: number;          // Minimum time between keyframes
  maxIntervalMs: number;          // Force keyframe after this time
}

export interface KeyframeCandidate {
  frame: VideoFrame;
  changeScore: number;            // 0-1, how different from previous keyframe
  isSlideChange: boolean;         // Detected as potential slide change
  reason: 'interval' | 'change' | 'slide' | 'forced';
}

export type KeyframeExtractorState = 'idle' | 'running' | 'paused';

const DEFAULT_CONFIG: KeyframeExtractorConfig = {
  strategy: 'change-based',
  fixedFps: 1,
  changeThreshold: 0.1,
  minFps: 0.2,
  maxFps: 2,
  detectSlideChanges: true,
  slideChangeThreshold: 0.7,
  minIntervalMs: 500,
  maxIntervalMs: 5000,
};

export class KeyframeExtractor {
  private config: KeyframeExtractorConfig;
  private state: KeyframeExtractorState = 'idle';
  
  private lastKeyframe: VideoFrame | null = null;
  private lastKeyframeTime: number = 0;
  private lastFrameTime: number = 0;
  
  // For histogram-based comparison
  private lastHistogram: number[] | null = null;
  
  // Callbacks
  private keyframeCallbacks: Array<(candidate: KeyframeCandidate) => void> = [];
  
  constructor(config?: Partial<KeyframeExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  configure(config: Partial<KeyframeExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  start(): void {
    this.state = 'running';
    this.lastKeyframe = null;
    this.lastKeyframeTime = 0;
    this.lastFrameTime = 0;
    this.lastHistogram = null;
  }
  
  pause(): void {
    this.state = 'paused';
  }
  
  resume(): void {
    this.state = 'running';
  }
  
  stop(): void {
    this.state = 'idle';
    this.lastKeyframe = null;
    this.lastHistogram = null;
  }
  
  /**
   * Process a frame and determine if it should be a keyframe.
   * Returns the keyframe candidate if selected, null otherwise.
   */
  processFrame(frame: VideoFrame): KeyframeCandidate | null {
    if (this.state !== 'running') {
      return null;
    }
    
    const now = frame.timestamp;
    const timeSinceLastKeyframe = now - this.lastKeyframeTime;
    const timeSinceLastFrame = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // First frame is always a keyframe
    if (!this.lastKeyframe) {
      return this.selectKeyframe(frame, 1.0, false, 'forced');
    }
    
    // Strategy-specific logic
    switch (this.config.strategy) {
      case 'fixed':
        return this.processFixed(frame, timeSinceLastKeyframe);
      case 'adaptive':
        return this.processAdaptive(frame, timeSinceLastKeyframe);
      case 'change-based':
        return this.processChangeBased(frame, timeSinceLastKeyframe);
      default:
        return null;
    }
  }
  
  private processFixed(frame: VideoFrame, timeSinceLastKeyframe: number): KeyframeCandidate | null {
    const intervalMs = 1000 / this.config.fixedFps;
    if (timeSinceLastKeyframe >= intervalMs) {
      const changeScore = this.lastKeyframe ? this.computeChangeScore(frame, this.lastKeyframe) : 1.0;
      return this.selectKeyframe(frame, changeScore, false, 'interval');
    }
    return null;
  }
  
  private processAdaptive(frame: VideoFrame, timeSinceLastKeyframe: number): KeyframeCandidate | null {
    // Respect minimum interval
    if (timeSinceLastKeyframe < this.config.minIntervalMs) {
      return null;
    }
    
    // Force keyframe after max interval
    if (timeSinceLastKeyframe >= this.config.maxIntervalMs) {
      const changeScore = this.lastKeyframe ? this.computeChangeScore(frame, this.lastKeyframe) : 1.0;
      return this.selectKeyframe(frame, changeScore, false, 'forced');
    }
    
    // Check for change
    const changeScore = this.lastKeyframe ? this.computeChangeScore(frame, this.lastKeyframe) : 1.0;
    
    // Adaptive threshold based on time elapsed
    const timeRatio = timeSinceLastKeyframe / this.config.maxIntervalMs;
    const adaptiveThreshold = this.config.changeThreshold * (1 - timeRatio * 0.5);
    
    if (changeScore >= adaptiveThreshold) {
      const isSlide = this.config.detectSlideChanges && changeScore >= this.config.slideChangeThreshold;
      return this.selectKeyframe(frame, changeScore, isSlide, isSlide ? 'slide' : 'change');
    }
    
    return null;
  }
  
  private processChangeBased(frame: VideoFrame, timeSinceLastKeyframe: number): KeyframeCandidate | null {
    // Respect minimum interval
    if (timeSinceLastKeyframe < this.config.minIntervalMs) {
      return null;
    }
    
    // Force keyframe after max interval
    if (timeSinceLastKeyframe >= this.config.maxIntervalMs) {
      const changeScore = this.lastKeyframe ? this.computeChangeScore(frame, this.lastKeyframe) : 1.0;
      return this.selectKeyframe(frame, changeScore, false, 'forced');
    }
    
    // Check for significant change
    const changeScore = this.lastKeyframe ? this.computeChangeScore(frame, this.lastKeyframe) : 1.0;
    
    if (changeScore >= this.config.changeThreshold) {
      const isSlide = this.config.detectSlideChanges && changeScore >= this.config.slideChangeThreshold;
      return this.selectKeyframe(frame, changeScore, isSlide, isSlide ? 'slide' : 'change');
    }
    
    return null;
  }
  
  private selectKeyframe(
    frame: VideoFrame,
    changeScore: number,
    isSlideChange: boolean,
    reason: KeyframeCandidate['reason']
  ): KeyframeCandidate {
    this.lastKeyframe = frame;
    this.lastKeyframeTime = frame.timestamp;
    this.lastHistogram = this.computeHistogram(frame);
    
    const candidate: KeyframeCandidate = {
      frame,
      changeScore,
      isSlideChange,
      reason,
    };
    
    // Notify callbacks
    for (const cb of this.keyframeCallbacks) {
      try {
        cb(candidate);
      } catch (e) {
        console.error('Keyframe callback error:', e);
      }
    }
    
    return candidate;
  }
  
  /**
   * Compute a change score between two frames (0 = identical, 1 = completely different).
   * Uses histogram comparison for efficiency.
   */
  private computeChangeScore(newFrame: VideoFrame, oldFrame: VideoFrame): number {
    const hist1 = this.lastHistogram || this.computeHistogram(oldFrame);
    const hist2 = this.computeHistogram(newFrame);
    
    // Histogram intersection (normalized)
    let intersection = 0;
    let total1 = 0;
    let total2 = 0;
    
    for (let i = 0; i < hist1.length; i++) {
      intersection += Math.min(hist1[i], hist2[i]);
      total1 += hist1[i];
      total2 += hist2[i];
    }
    
    const similarity = (2 * intersection) / (total1 + total2 + 1e-10);
    return 1 - similarity; // Convert similarity to change score
  }
  
  /**
   * Compute a grayscale histogram from a frame.
   * Uses 64 bins for balance between precision and efficiency.
   */
  private computeHistogram(frame: VideoFrame): number[] {
    const bins = 64;
    const histogram = new Array(bins).fill(0);
    const data = new Uint8Array(frame.data);
    
    // Sample every 4th pixel for efficiency (assumes BGRA/RGBA format)
    const bytesPerPixel = 4;
    const step = bytesPerPixel * 4; // Sample every 4th pixel
    
    for (let i = 0; i < data.length; i += step) {
      // Convert to grayscale: Y = 0.299R + 0.587G + 0.114B
      let gray: number;
      if (frame.format === 'bgra') {
        gray = 0.114 * data[i] + 0.587 * data[i + 1] + 0.299 * data[i + 2];
      } else {
        // rgba
        gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      
      const bin = Math.min(bins - 1, Math.floor(gray / 256 * bins));
      histogram[bin]++;
    }
    
    return histogram;
  }
  
  /**
   * Subscribe to keyframe selection events.
   */
  onKeyframe(cb: (candidate: KeyframeCandidate) => void): () => void {
    this.keyframeCallbacks.push(cb);
    return () => {
      const idx = this.keyframeCallbacks.indexOf(cb);
      if (idx >= 0) this.keyframeCallbacks.splice(idx, 1);
    };
  }
  
  getState(): KeyframeExtractorState {
    return this.state;
  }
  
  getConfig(): Readonly<KeyframeExtractorConfig> {
    return this.config;
  }
  
  /**
   * Get statistics about extraction.
   */
  getLastKeyframeTime(): number {
    return this.lastKeyframeTime;
  }
}
