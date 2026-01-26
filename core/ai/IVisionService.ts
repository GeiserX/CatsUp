// core/ai/IVisionService.ts
// Vision model abstraction for analyzing video frames and screen content.
// Supports both local (LLaVA, Qwen-VL) and cloud (GPT-4V, Claude, Gemini) providers.

import { VideoFrame } from '../capture/IVideoCapture';

export type VisionLatencyMode = 'realtime' | 'near-realtime' | 'batch';
// realtime: ~5s latency, for live assistance
// near-realtime: ~30s latency, for meeting recap
// batch: ~2min latency, for post-meeting analysis

export type VisionProviderType = 'local' | 'cloud';

export interface OCRBlock {
  text: string;
  confidence: number;       // 0-1
  boundingBox: {
    x: number;              // normalized 0-1
    y: number;
    width: number;
    height: number;
  };
  language?: string;
}

export interface UIElement {
  type: 'button' | 'input' | 'text' | 'image' | 'chart' | 'table' | 'menu' | 'window' | 'other';
  label?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
}

export interface VisionAnalysisOptions {
  latencyMode?: VisionLatencyMode;
  ocrAccuracy?: 'high' | 'standard';
  extractText?: boolean;          // Enable OCR text extraction
  extractUI?: boolean;            // Enable UI element detection
  extractCharts?: boolean;        // Enable chart/graph understanding
  language?: string;              // Expected content language
  maxTokens?: number;             // For description generation
  temperature?: number;           // For description generation
  customPrompt?: string;          // Custom analysis prompt
}

export interface VisionAnalysisResult {
  frameId: number;
  timestamp: number;              // epoch ms
  
  // OCR results
  ocrText?: string;               // Full extracted text
  ocrBlocks?: OCRBlock[];         // Text blocks with positions
  
  // Scene understanding
  description?: string;           // Natural language description of what's on screen
  uiElements?: UIElement[];       // Detected UI components
  
  // Change detection
  changeScore?: number;           // 0-1, similarity to previous frame (0 = completely different)
  
  // Context detection
  appContext?: string;            // Detected application (e.g., 'PowerPoint', 'VSCode', 'Browser')
  contentType?: 'presentation' | 'document' | 'code' | 'terminal' | 'browser' | 'dashboard' | 'video' | 'other';
  
  // Metadata
  processingTimeMs?: number;
  modelUsed?: string;
  tokensUsed?: number;
}

export interface VisionModelOptions {
  provider: VisionProviderType | string;  // 'local', 'cloud', or specific provider id
  modelId?: string;                       // e.g., 'gpt-4o', 'claude-sonnet-4-20250514', 'qwen-vl-7b'
  endpoint?: string;                      // For local models or custom endpoints
  apiKey?: string;                        // For cloud providers
  device?: 'auto' | 'cpu' | 'gpu';        // For local models
}

export type VisionServiceState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'processing'
  | 'error';

export interface IVisionService {
  /**
   * Initialize the vision service with model options.
   * For local models, this may download/load the model.
   */
  init(options: VisionModelOptions): Promise<void>;

  /**
   * Analyze a single video frame.
   */
  analyze(frame: VideoFrame, opts?: VisionAnalysisOptions): Promise<VisionAnalysisResult>;

  /**
   * Analyze multiple frames in batch (more efficient for batch mode).
   */
  analyzeMultiple(frames: VideoFrame[], opts?: VisionAnalysisOptions): Promise<VisionAnalysisResult[]>;

  /**
   * Describe a sequence of frames, optionally answering a specific question.
   * Useful for understanding "what happened" over a time period.
   */
  describeSequence(frames: VideoFrame[], question?: string, opts?: VisionAnalysisOptions): Promise<string>;

  /**
   * Compare two frames and describe the differences.
   */
  compareFrames(frame1: VideoFrame, frame2: VideoFrame): Promise<{
    changeScore: number;
    description: string;
    significantChanges: string[];
  }>;

  /**
   * Extract text from a frame using OCR.
   * Can be called independently of full analysis for efficiency.
   */
  extractText(frame: VideoFrame, accuracy?: 'high' | 'standard'): Promise<{
    text: string;
    blocks: OCRBlock[];
  }>;

  /**
   * Subscribe to state changes.
   */
  onStateChanged(cb: (state: VisionServiceState) => void): () => void;

  /**
   * Subscribe to errors.
   */
  onError(cb: (err: Error) => void): () => void;

  /**
   * Current service state.
   */
  readonly state: VisionServiceState;

  /**
   * Current model options.
   */
  readonly modelOptions?: Readonly<VisionModelOptions>;
}
