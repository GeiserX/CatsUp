// ai-backends/local/vision/VisionServiceLocal.ts
// Local vision service implementation for LLaVA, Qwen-VL, and other local VLMs.
// Uses OpenAI-compatible API endpoints (e.g., llama.cpp server, Ollama, vLLM).

import {
  IVisionService,
  VisionModelOptions,
  VisionAnalysisOptions,
  VisionAnalysisResult,
  VisionServiceState,
  OCRBlock,
} from '../../../core/ai/IVisionService';
import { VideoFrame } from '../../../core/capture/IVideoCapture';

export interface LocalVisionConfig {
  endpoint: string;             // Base URL, e.g., http://127.0.0.1:8080
  model: string;                // Model name, e.g., 'llava-1.6-34b', 'qwen-vl-7b'
  apiKey?: string;              // Optional API key for secured endpoints
  device?: 'auto' | 'cpu' | 'gpu';
  maxRetries?: number;
  timeoutMs?: number;
  
  // Model-specific options
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_CONFIG: Partial<LocalVisionConfig> = {
  endpoint: 'http://127.0.0.1:8080',
  model: 'llava-1.6-7b',
  device: 'auto',
  maxRetries: 2,
  timeoutMs: 120000,
  temperature: 0.1,
  maxTokens: 2000,
};

export class VisionServiceLocal implements IVisionService {
  private config: LocalVisionConfig | null = null;
  private _state: VisionServiceState = 'idle';
  private _modelOptions: VisionModelOptions | undefined;
  
  private stateCallbacks: Array<(state: VisionServiceState) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];
  
  get state(): VisionServiceState {
    return this._state;
  }
  
  get modelOptions(): Readonly<VisionModelOptions> | undefined {
    return this._modelOptions;
  }
  
  async init(options: VisionModelOptions): Promise<void> {
    this.setState('loading');
    
    try {
      this.config = {
        ...DEFAULT_CONFIG,
        endpoint: options.endpoint || DEFAULT_CONFIG.endpoint!,
        model: options.modelId || DEFAULT_CONFIG.model!,
        apiKey: options.apiKey,
        device: options.device || 'auto',
      } as LocalVisionConfig;
      
      this._modelOptions = options;
      
      // Test connection to the local server
      await this.testConnection();
      
      this.setState('ready');
    } catch (err) {
      this.setState('error');
      this.emitError(err as Error);
      throw err;
    }
  }
  
  async analyze(frame: VideoFrame, opts?: VisionAnalysisOptions): Promise<VisionAnalysisResult> {
    if (this._state !== 'ready') {
      throw new Error(`VisionService not ready, state: ${this._state}`);
    }
    
    this.setState('processing');
    const startTime = Date.now();
    
    try {
      const base64Image = this.frameToBase64(frame);
      const prompt = this.buildAnalysisPrompt(opts);
      
      const response = await this.callLocalVisionAPI(base64Image, prompt);
      const parsed = this.parseResponse(response, frame);
      
      parsed.processingTimeMs = Date.now() - startTime;
      parsed.modelUsed = this.config?.model;
      
      this.setState('ready');
      return parsed;
    } catch (err) {
      this.setState('ready');
      this.emitError(err as Error);
      throw err;
    }
  }
  
  async analyzeMultiple(frames: VideoFrame[], opts?: VisionAnalysisOptions): Promise<VisionAnalysisResult[]> {
    // Process sequentially for local models to avoid overloading
    const results: VisionAnalysisResult[] = [];
    
    for (const frame of frames) {
      const result = await this.analyze(frame, opts);
      results.push(result);
    }
    
    return results;
  }
  
  async describeSequence(frames: VideoFrame[], question?: string, opts?: VisionAnalysisOptions): Promise<string> {
    if (this._state !== 'ready') {
      throw new Error(`VisionService not ready, state: ${this._state}`);
    }
    
    this.setState('processing');
    
    try {
      // For local models, we may need to process frames individually and combine
      // Some local models support multiple images, others don't
      
      const selectedFrames = this.selectRepresentativeFrames(frames, 3);
      
      // Try multi-image first
      try {
        const images = selectedFrames.map(f => this.frameToBase64(f));
        const prompt = question
          ? `These ${images.length} screenshots show a sequence from a meeting. ${question}`
          : `Describe what happens across these ${images.length} screenshots from a meeting. Note any changes, key information, or events.`;
        
        const response = await this.callLocalVisionAPIMulti(images, prompt);
        this.setState('ready');
        return response;
      } catch (multiErr) {
        // Fall back to single-image analysis
        console.warn('Multi-image not supported, falling back to individual analysis');
      }
      
      // Fallback: analyze each frame and combine
      const descriptions: string[] = [];
      for (let i = 0; i < selectedFrames.length; i++) {
        const frame = selectedFrames[i];
        const result = await this.analyze(frame, { ...opts, extractText: true });
        descriptions.push(`Frame ${i + 1} (${new Date(frame.timestamp).toISOString()}): ${result.description || 'No description'}`);
      }
      
      this.setState('ready');
      return descriptions.join('\n\n');
    } catch (err) {
      this.setState('ready');
      this.emitError(err as Error);
      throw err;
    }
  }
  
  async compareFrames(frame1: VideoFrame, frame2: VideoFrame): Promise<{
    changeScore: number;
    description: string;
    significantChanges: string[];
  }> {
    if (this._state !== 'ready') {
      throw new Error(`VisionService not ready, state: ${this._state}`);
    }
    
    this.setState('processing');
    
    try {
      // Try multi-image comparison first
      try {
        const image1 = this.frameToBase64(frame1);
        const image2 = this.frameToBase64(frame2);
        
        const prompt = `Compare these two screenshots. Rate similarity 0-100 (100=identical). List changes.
Respond in JSON: {"similarityPercent": number, "description": "string", "changes": ["change1", ...]}`;
        
        const response = await this.callLocalVisionAPIMulti([image1, image2], prompt);
        const parsed = this.parseJSON(response);
        
        this.setState('ready');
        return {
          changeScore: 1 - (parsed.similarityPercent || 50) / 100,
          description: parsed.description || 'Unable to compare',
          significantChanges: parsed.changes || [],
        };
      } catch (multiErr) {
        // Fall back to histogram-based comparison
        console.warn('Multi-image comparison not supported, using histogram');
        
        const changeScore = this.computeHistogramDifference(frame1, frame2);
        
        this.setState('ready');
        return {
          changeScore,
          description: changeScore > 0.5 ? 'Significant visual changes detected' : 'Minor or no changes',
          significantChanges: [],
        };
      }
    } catch (err) {
      this.setState('ready');
      this.emitError(err as Error);
      throw err;
    }
  }
  
  async extractText(frame: VideoFrame, accuracy?: 'high' | 'standard'): Promise<{
    text: string;
    blocks: OCRBlock[];
  }> {
    if (this._state !== 'ready') {
      throw new Error(`VisionService not ready, state: ${this._state}`);
    }
    
    this.setState('processing');
    
    try {
      const base64Image = this.frameToBase64(frame);
      const prompt = accuracy === 'high'
        ? 'Extract ALL text from this screenshot. Be thorough and accurate. Return JSON: {"text": "...", "blocks": [{"text": "...", "confidence": 0.9}]}'
        : 'Extract the main text from this screenshot. Return JSON: {"text": "...", "blocks": [{"text": "...", "confidence": 0.9}]}';
      
      const response = await this.callLocalVisionAPI(base64Image, prompt);
      const parsed = this.parseJSON(response);
      
      this.setState('ready');
      
      return {
        text: parsed.text || '',
        blocks: (parsed.blocks || []).map((b: any, i: number) => ({
          text: b.text || '',
          confidence: b.confidence || 0.8,
          boundingBox: { x: 0, y: i * 0.1, width: 1, height: 0.1 },
        })),
      };
    } catch (err) {
      this.setState('ready');
      return { text: '', blocks: [] };
    }
  }
  
  onStateChanged(cb: (state: VisionServiceState) => void): () => void {
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
  
  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────
  
  private setState(state: VisionServiceState): void {
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
  
  private async testConnection(): Promise<void> {
    if (!this.config) throw new Error('Not configured');
    
    const url = this.normalizeEndpoint(this.config.endpoint) + '/models';
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        throw new Error(`Connection test failed: ${response.status}`);
      }
    } catch (err: any) {
      // Try alternative health check endpoint
      const healthUrl = this.config.endpoint.replace(/\/+$/, '') + '/health';
      try {
        const healthResponse = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (healthResponse.ok) return;
      } catch {
        // Ignore health check failure
      }
      
      throw new Error(`Cannot connect to local vision server at ${this.config.endpoint}: ${err.message}`);
    }
  }
  
  private async callLocalVisionAPI(image: string, prompt: string): Promise<string> {
    if (!this.config) throw new Error('Not configured');
    
    const url = this.normalizeEndpoint(this.config.endpoint) + '/chat/completions';
    
    const body = {
      model: this.config.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } },
        ],
      }],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs || 120000),
    });
    
    if (!response.ok) {
      throw new Error(`Local vision API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  
  private async callLocalVisionAPIMulti(images: string[], prompt: string): Promise<string> {
    if (!this.config) throw new Error('Not configured');
    
    const url = this.normalizeEndpoint(this.config.endpoint) + '/chat/completions';
    
    const content: any[] = [{ type: 'text', text: prompt }];
    for (const img of images) {
      content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } });
    }
    
    const body = {
      model: this.config.model,
      messages: [{ role: 'user', content }],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs || 120000),
    });
    
    if (!response.ok) {
      throw new Error(`Local vision API error (multi): ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  
  private normalizeEndpoint(endpoint: string): string {
    let base = endpoint.replace(/\/+$/, '');
    if (!base.includes('/v1')) {
      base += '/v1';
    }
    return base;
  }
  
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config?.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
  
  private frameToBase64(frame: VideoFrame): string {
    const data = new Uint8Array(frame.data);
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }
  
  private buildAnalysisPrompt(opts?: VisionAnalysisOptions): string {
    const parts: string[] = ['Analyze this screenshot.'];
    
    if (opts?.extractText !== false) {
      parts.push('Extract all visible text.');
    }
    if (opts?.extractUI) {
      parts.push('Identify UI elements.');
    }
    
    parts.push(`Respond in JSON:
{
  "description": "what is shown",
  "appContext": "app name or null",
  "contentType": "presentation|document|code|terminal|browser|dashboard|other",
  "ocrText": "extracted text",
  "ocrBlocks": [{"text": "block", "confidence": 0.9}]
}`);
    
    return parts.join(' ');
  }
  
  private parseResponse(response: string, frame: VideoFrame): VisionAnalysisResult {
    const parsed = this.parseJSON(response);
    
    return {
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      ocrText: parsed.ocrText || '',
      ocrBlocks: (parsed.ocrBlocks || []).map((b: any) => ({
        text: b.text || '',
        confidence: b.confidence || 0.8,
        boundingBox: b.boundingBox || { x: 0, y: 0, width: 1, height: 0.1 },
      })),
      description: parsed.description || '',
      appContext: parsed.appContext || undefined,
      contentType: parsed.contentType || 'other',
    };
  }
  
  private parseJSON(text: string): any {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Fall through
      }
    }
    return {};
  }
  
  private selectRepresentativeFrames(frames: VideoFrame[], maxCount: number): VideoFrame[] {
    if (frames.length <= maxCount) return frames;
    
    const result: VideoFrame[] = [];
    const step = Math.floor(frames.length / maxCount);
    
    result.push(frames[0]);
    for (let i = step; i < frames.length - 1; i += step) {
      if (result.length < maxCount - 1) {
        result.push(frames[i]);
      }
    }
    result.push(frames[frames.length - 1]);
    
    return result;
  }
  
  private computeHistogramDifference(frame1: VideoFrame, frame2: VideoFrame): number {
    const hist1 = this.computeHistogram(frame1);
    const hist2 = this.computeHistogram(frame2);
    
    let intersection = 0;
    let total1 = 0;
    let total2 = 0;
    
    for (let i = 0; i < hist1.length; i++) {
      intersection += Math.min(hist1[i], hist2[i]);
      total1 += hist1[i];
      total2 += hist2[i];
    }
    
    const similarity = (2 * intersection) / (total1 + total2 + 1e-10);
    return 1 - similarity;
  }
  
  private computeHistogram(frame: VideoFrame): number[] {
    const bins = 64;
    const histogram = new Array(bins).fill(0);
    const data = new Uint8Array(frame.data);
    const step = 16;
    
    for (let i = 0; i < data.length; i += step) {
      let gray: number;
      if (frame.format === 'bgra') {
        gray = 0.114 * data[i] + 0.587 * data[i + 1] + 0.299 * data[i + 2];
      } else {
        gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      
      const bin = Math.min(bins - 1, Math.floor(gray / 256 * bins));
      histogram[bin]++;
    }
    
    return histogram;
  }
}
