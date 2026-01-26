// core/ai/IOCRService.ts
// OCR service abstraction for extracting text from video frames.
// Supports local (Tesseract, PaddleOCR) and cloud (Azure Vision, Google Vision) providers.

import { VideoFrame } from '../capture/IVideoCapture';
import { OCRBlock } from './IVisionService';

export type OCRProviderType = 'local' | 'cloud';

export type OCRAccuracy = 'high' | 'standard';
// high: More thorough, better for small text, slower
// standard: Faster, good for normal-sized text

export interface OCROptions {
  accuracy?: OCRAccuracy;
  language?: string | string[];   // BCP-47 codes, e.g., ['en', 'es']
  detectOrientation?: boolean;    // Auto-rotate if needed
  detectLayout?: boolean;         // Preserve document structure
  region?: {                      // Only process a region of the frame
    x: number;                    // normalized 0-1
    y: number;
    width: number;
    height: number;
  };
  minConfidence?: number;         // Filter out low-confidence results (0-1)
  preserveFormatting?: boolean;   // Attempt to preserve line breaks and spacing
}

export interface OCRLine {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  words: OCRWord[];
}

export interface OCRWord {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  frameId: number;
  timestamp: number;
  
  // Full text output
  text: string;                   // All text concatenated
  formattedText?: string;         // Text with line breaks preserved
  
  // Structured output
  blocks: OCRBlock[];             // Paragraph-level blocks
  lines?: OCRLine[];              // Line-level detail
  
  // Metadata
  language?: string;              // Detected language
  orientation?: number;           // Detected rotation in degrees
  confidence: number;             // Overall confidence 0-1
  
  // Performance
  processingTimeMs: number;
}

export interface OCRProviderOptions {
  provider: OCRProviderType | string;
  endpoint?: string;              // For cloud or custom local server
  apiKey?: string;                // For cloud providers
  modelPath?: string;             // For local models (Tesseract data path)
  useGPU?: boolean;               // For local providers that support GPU
}

export type OCRServiceState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'processing'
  | 'error';

export interface IOCRService {
  /**
   * Initialize the OCR service with provider options.
   */
  init(options: OCRProviderOptions): Promise<void>;

  /**
   * Extract text from a single frame.
   */
  extract(frame: VideoFrame, opts?: OCROptions): Promise<OCRResult>;

  /**
   * Extract text from multiple frames in batch.
   */
  extractBatch(frames: VideoFrame[], opts?: OCROptions): Promise<OCRResult[]>;

  /**
   * Quick check if a frame contains any text (faster than full extraction).
   * Useful for change detection to skip frames without text.
   */
  hasText(frame: VideoFrame): Promise<boolean>;

  /**
   * Detect the primary language of text in a frame.
   */
  detectLanguage(frame: VideoFrame): Promise<string | null>;

  /**
   * Subscribe to state changes.
   */
  onStateChanged(cb: (state: OCRServiceState) => void): () => void;

  /**
   * Subscribe to errors.
   */
  onError(cb: (err: Error) => void): () => void;

  /**
   * Current service state.
   */
  readonly state: OCRServiceState;

  /**
   * Current provider options.
   */
  readonly providerOptions?: Readonly<OCRProviderOptions>;
}
