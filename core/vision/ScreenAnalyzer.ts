// core/vision/ScreenAnalyzer.ts
// Main orchestrator implementing IScreenAnalyzer.
// Coordinates video capture, keyframe extraction, OCR, vision analysis, and timeline generation.

import { VideoFrame } from '../capture/IVideoCapture';
import { IVisionService, VisionAnalysisResult, VisionModelOptions } from '../ai/IVisionService';
import { Answer, SourceDoc } from '../ai/IQAService';
import {
  IScreenAnalyzer,
  ScreenAnalyzerConfig,
  ScreenAnalyzerState,
  ScreenAnalyzerStats,
  VisualEvent,
  VisualTimeline,
  KeyframeInfo,
} from './IScreenAnalyzer';
import { KeyframeExtractor, KeyframeCandidate } from './KeyframeExtractor';
import { VisualTimelineStore } from './VisualTimeline';

// Default configuration based on latency mode
const LATENCY_PRESETS: Record<string, Partial<ScreenAnalyzerConfig>> = {
  realtime: {
    samplingStrategy: 'change-based',
    minFps: 0.5,
    maxFps: 2,
    changeThreshold: 0.08,
    analyzeEveryNthKeyframe: 1,
  },
  'near-realtime': {
    samplingStrategy: 'change-based',
    minFps: 0.2,
    maxFps: 1,
    changeThreshold: 0.12,
    analyzeEveryNthKeyframe: 3,
  },
  batch: {
    samplingStrategy: 'change-based',
    minFps: 0.1,
    maxFps: 0.5,
    changeThreshold: 0.15,
    analyzeEveryNthKeyframe: 5,
  },
};

const DEFAULT_CONFIG: ScreenAnalyzerConfig = {
  latencyMode: 'near-realtime',
  samplingStrategy: 'change-based',
  fixedFps: 1,
  minFps: 0.2,
  maxFps: 2,
  changeThreshold: 0.1,
  ocrAccuracy: 'standard',
  visionProvider: 'cloud',
  analyzeEveryNthKeyframe: 3,
  storeKeyframes: true,
  maxKeyframesStored: 1000,
  linkToTranscript: true,
};

export class ScreenAnalyzer implements IScreenAnalyzer {
  private _config: ScreenAnalyzerConfig;
  private _state: ScreenAnalyzerState = 'idle';
  
  private keyframeExtractor: KeyframeExtractor;
  private timeline: VisualTimelineStore;
  private visionService: IVisionService | null = null;
  
  // Processing state
  private keyframeCounter: number = 0;
  private pendingAnalysis: Map<number, VideoFrame> = new Map();
  private isProcessing: boolean = false;
  
  // Statistics
  private stats: ScreenAnalyzerStats = {
    framesProcessed: 0,
    keyframesExtracted: 0,
    eventsDetected: 0,
    ocrCalls: 0,
    visionCalls: 0,
    averageProcessingTimeMs: 0,
    tokensUsed: 0,
  };
  private processingTimes: number[] = [];
  
  // Event tracking
  private lastAppContext: string | null = null;
  private lastContentType: string | null = null;
  private currentOpenEvent: VisualEvent | null = null;
  
  // Callbacks
  private keyframeCallbacks: Array<(keyframe: KeyframeInfo, analysis?: VisionAnalysisResult) => void> = [];
  private eventCallbacks: Array<(event: VisualEvent) => void> = [];
  private stateCallbacks: Array<(state: ScreenAnalyzerState) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];
  
  constructor(visionService?: IVisionService, config?: Partial<ScreenAnalyzerConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this.applyLatencyPreset();
    
    this.visionService = visionService || null;
    
    this.keyframeExtractor = new KeyframeExtractor({
      strategy: this._config.samplingStrategy,
      fixedFps: this._config.fixedFps || 1,
      changeThreshold: this._config.changeThreshold || 0.1,
      minFps: this._config.minFps || 0.2,
      maxFps: this._config.maxFps || 2,
      detectSlideChanges: true,
      slideChangeThreshold: 0.7,
      minIntervalMs: 500,
      maxIntervalMs: 5000,
    });
    
    this.timeline = new VisualTimelineStore({
      maxKeyframes: this._config.maxKeyframesStored || 1000,
      maxEvents: 5000,
      pruneStrategy: 'oldest',
      indexOCRText: true,
    });
    
    // Subscribe to keyframe extraction
    this.keyframeExtractor.onKeyframe(this.handleKeyframeCandidate.bind(this));
  }
  
  get state(): ScreenAnalyzerState {
    return this._state;
  }
  
  get config(): Readonly<ScreenAnalyzerConfig> {
    return this._config;
  }
  
  configure(config: ScreenAnalyzerConfig): void {
    this._config = { ...this._config, ...config };
    this.applyLatencyPreset();
    
    // Reconfigure keyframe extractor
    this.keyframeExtractor.configure({
      strategy: this._config.samplingStrategy,
      fixedFps: this._config.fixedFps || 1,
      changeThreshold: this._config.changeThreshold || 0.1,
      minFps: this._config.minFps || 0.2,
      maxFps: this._config.maxFps || 2,
    });
  }
  
  /**
   * Set the vision service to use.
   */
  setVisionService(service: IVisionService): void {
    this.visionService = service;
  }
  
  async start(): Promise<void> {
    if (this._state === 'running') return;
    
    this.setState('initializing');
    
    // Reset state
    this.keyframeCounter = 0;
    this.pendingAnalysis.clear();
    this.stats = {
      framesProcessed: 0,
      keyframesExtracted: 0,
      eventsDetected: 0,
      ocrCalls: 0,
      visionCalls: 0,
      averageProcessingTimeMs: 0,
      tokensUsed: 0,
    };
    this.processingTimes = [];
    this.lastAppContext = null;
    this.lastContentType = null;
    this.currentOpenEvent = null;
    
    // Initialize timeline
    this.timeline.start(Date.now());
    
    // Start keyframe extractor
    this.keyframeExtractor.start();
    
    this.setState('running');
  }
  
  async pause(): Promise<void> {
    if (this._state !== 'running') return;
    this.keyframeExtractor.pause();
    this.setState('paused');
  }
  
  async resume(): Promise<void> {
    if (this._state !== 'paused') return;
    this.keyframeExtractor.resume();
    this.setState('running');
  }
  
  async stop(): Promise<VisualTimeline> {
    if (this._state === 'idle' || this._state === 'stopped') {
      return this.timeline.toJSON();
    }
    
    this.setState('stopping');
    
    // Stop components
    this.keyframeExtractor.stop();
    
    // Wait for pending analysis to complete (with timeout)
    const timeout = 10000; // 10 seconds
    const startWait = Date.now();
    while (this.pendingAnalysis.size > 0 && Date.now() - startWait < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Close any open events
    if (this.currentOpenEvent) {
      this.timeline.updateEvent(this.currentOpenEvent.id, { endTime: Date.now() });
      this.currentOpenEvent = null;
    }
    
    // End timeline
    this.timeline.end(Date.now());
    
    this.setState('stopped');
    return this.timeline.toJSON();
  }
  
  processFrame(frame: VideoFrame): void {
    if (this._state !== 'running') return;
    
    this.stats.framesProcessed++;
    
    // Feed to keyframe extractor
    this.keyframeExtractor.processFrame(frame);
  }
  
  onKeyframe(cb: (keyframe: KeyframeInfo, analysis?: VisionAnalysisResult) => void): () => void {
    this.keyframeCallbacks.push(cb);
    return () => {
      const idx = this.keyframeCallbacks.indexOf(cb);
      if (idx >= 0) this.keyframeCallbacks.splice(idx, 1);
    };
  }
  
  onEvent(cb: (event: VisualEvent) => void): () => void {
    this.eventCallbacks.push(cb);
    return () => {
      const idx = this.eventCallbacks.indexOf(cb);
      if (idx >= 0) this.eventCallbacks.splice(idx, 1);
    };
  }
  
  onStateChanged(cb: (state: ScreenAnalyzerState) => void): () => void {
    this.stateCallbacks.push(cb);
    return () => {
      const idx = this.stateCallbacks.indexOf(cb);
      if (idx >= 0) this.stateCallbacks.splice(idx, 1);
    };
  }
  
  onError(cb: (err: Error) => void): () => void {
    this.errorCallbacks.push(cb);
    return () => {
      const idx = this.errorCallbacks.indexOf(cb);
      if (idx >= 0) this.errorCallbacks.splice(idx, 1);
    };
  }
  
  getTimeline(): VisualTimeline {
    return this.timeline.toJSON();
  }
  
  getStats(): ScreenAnalyzerStats {
    return { ...this.stats };
  }
  
  async askAboutScreen(
    question: string,
    timeRange?: { start: number; end: number }
  ): Promise<Answer> {
    // Get relevant keyframes and events
    const keyframes = timeRange
      ? this.timeline.getKeyframesInRange(timeRange.start, timeRange.end)
      : this.timeline.keyframes;
    
    const events = timeRange
      ? this.timeline.getEventsInRange(timeRange.start, timeRange.end)
      : this.timeline.events;
    
    // Build context from OCR text and events
    const ocrContext = keyframes
      .filter(kf => kf.ocrText)
      .map(kf => `[${new Date(kf.timestamp).toISOString()}] ${kf.ocrText}`)
      .join('\n\n');
    
    const eventContext = events
      .map(e => `[${e.type}] ${e.summary}`)
      .join('\n');
    
    // Create source documents
    const sources: SourceDoc[] = [
      { id: 'ocr', title: 'Screen Text', text: ocrContext || 'No text extracted' },
      { id: 'events', title: 'Visual Events', text: eventContext || 'No events detected' },
    ];
    
    // If we have a vision service, ask it directly
    if (this.visionService && keyframes.length > 0) {
      try {
        // Get frames for the selected keyframes (would need frame storage)
        // For now, return a text-based answer
      } catch (err) {
        console.error('Vision question error:', err);
      }
    }
    
    // Return a basic answer based on available context
    return {
      text: `Based on the screen analysis:\n\nText observed: ${ocrContext.slice(0, 500)}...\n\nEvents: ${eventContext}`,
      confidence: 0.7,
      citations: sources.map(s => ({ docId: s.id, snippet: s.text.slice(0, 100), score: 0.8 })),
    };
  }
  
  getTextAtTime(timestamp: number): string | null {
    return this.timeline.getTextAt(timestamp);
  }
  
  getTextInRange(start: number, end: number): string[] {
    return this.timeline.getTextInRange(start, end);
  }
  
  searchText(query: string): Array<{
    timestamp: number;
    text: string;
    context: string;
  }> {
    return this.timeline.searchText(query).map(r => ({
      timestamp: r.timestamp,
      text: r.text,
      context: r.context,
    }));
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────
  
  private setState(state: ScreenAnalyzerState): void {
    this._state = state;
    for (const cb of this.stateCallbacks) {
      try { cb(state); } catch (e) { console.error('State callback error:', e); }
    }
  }
  
  private emitError(err: Error): void {
    for (const cb of this.errorCallbacks) {
      try { cb(err); } catch (e) { console.error('Error callback error:', e); }
    }
  }
  
  private applyLatencyPreset(): void {
    const preset = LATENCY_PRESETS[this._config.latencyMode];
    if (preset) {
      this._config = { ...this._config, ...preset, latencyMode: this._config.latencyMode };
    }
  }
  
  private handleKeyframeCandidate(candidate: KeyframeCandidate): void {
    this.stats.keyframesExtracted++;
    this.keyframeCounter++;
    
    const keyframeId = this.keyframeCounter;
    const keyframeInfo: KeyframeInfo = {
      id: keyframeId,
      timestamp: candidate.frame.timestamp,
      changeScore: candidate.changeScore,
    };
    
    // Determine if we should run vision analysis on this keyframe
    const shouldAnalyze = this.keyframeCounter % (this._config.analyzeEveryNthKeyframe || 1) === 0;
    
    // Process asynchronously
    this.processKeyframe(keyframeInfo, candidate.frame, shouldAnalyze, candidate.isSlideChange);
  }
  
  private async processKeyframe(
    keyframeInfo: KeyframeInfo,
    frame: VideoFrame,
    runVision: boolean,
    isSlideChange: boolean
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      let analysisResult: VisionAnalysisResult | undefined;
      
      if (this.visionService && runVision) {
        this.stats.visionCalls++;
        this.stats.ocrCalls++;
        
        analysisResult = await this.visionService.analyze(frame, {
          extractText: true,
          extractUI: this._config.latencyMode === 'realtime',
          ocrAccuracy: this._config.ocrAccuracy,
        });
        
        // Update keyframe info with analysis results
        keyframeInfo.ocrText = analysisResult.ocrText;
        keyframeInfo.description = analysisResult.description;
        keyframeInfo.appContext = analysisResult.appContext;
        
        if (analysisResult.tokensUsed) {
          this.stats.tokensUsed = (this.stats.tokensUsed || 0) + analysisResult.tokensUsed;
        }
      }
      
      // Add to timeline
      this.timeline.addKeyframe(keyframeInfo);
      
      // Detect and emit events
      this.detectEvents(keyframeInfo, analysisResult, isSlideChange);
      
      // Update processing time stats
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) this.processingTimes.shift();
      this.stats.averageProcessingTimeMs = 
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
      
      // Notify callbacks
      for (const cb of this.keyframeCallbacks) {
        try { cb(keyframeInfo, analysisResult); } catch (e) { console.error('Keyframe callback error:', e); }
      }
    } catch (err) {
      this.emitError(err as Error);
    }
  }
  
  private detectEvents(
    keyframeInfo: KeyframeInfo,
    analysis: VisionAnalysisResult | undefined,
    isSlideChange: boolean
  ): void {
    const timestamp = keyframeInfo.timestamp;
    
    // Detect slide change
    if (isSlideChange) {
      this.emitVisualEvent({
        startTime: timestamp,
        type: 'slide-change',
        summary: 'Slide or content changed significantly',
        keyframeId: keyframeInfo.id,
        ocrSnapshot: keyframeInfo.ocrText,
        appContext: keyframeInfo.appContext,
        confidence: 0.9,
      });
      this.stats.eventsDetected++;
    }
    
    // Detect app switch
    if (analysis?.appContext && analysis.appContext !== this.lastAppContext) {
      if (this.lastAppContext) {
        // Close previous app event
        if (this.currentOpenEvent && this.currentOpenEvent.type === 'app-switch') {
          this.timeline.updateEvent(this.currentOpenEvent.id, { endTime: timestamp });
        }
        
        // Create new app switch event
        const event = this.timeline.addEvent({
          startTime: timestamp,
          type: 'app-switch',
          summary: `Switched to ${analysis.appContext}`,
          details: `Previous app: ${this.lastAppContext}`,
          keyframeId: keyframeInfo.id,
          appContext: analysis.appContext,
          confidence: 0.85,
        });
        
        this.currentOpenEvent = event;
        this.emitEventCallback(event);
        this.stats.eventsDetected++;
      }
      this.lastAppContext = analysis.appContext;
    }
    
    // Detect content type change
    if (analysis?.contentType && analysis.contentType !== this.lastContentType) {
      if (this.lastContentType) {
        this.emitVisualEvent({
          startTime: timestamp,
          type: 'navigation',
          subtype: 'content-type-change',
          summary: `Content type changed to ${analysis.contentType}`,
          keyframeId: keyframeInfo.id,
          appContext: keyframeInfo.appContext,
          confidence: 0.8,
        });
        this.stats.eventsDetected++;
      }
      this.lastContentType = analysis.contentType;
    }
  }
  
  private emitVisualEvent(eventData: Omit<VisualEvent, 'id'>): void {
    const event = this.timeline.addEvent(eventData);
    this.emitEventCallback(event);
  }
  
  private emitEventCallback(event: VisualEvent): void {
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch (e) { console.error('Event callback error:', e); }
    }
  }
}
