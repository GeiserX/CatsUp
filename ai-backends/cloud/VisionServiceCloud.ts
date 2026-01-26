// ai-backends/cloud/VisionServiceCloud.ts
// Cloud vision service implementation for GPT-4V, Claude Vision, and Gemini Vision.
// Provides screen analysis, OCR, and visual understanding via cloud APIs.

import {
  IVisionService,
  VisionModelOptions,
  VisionAnalysisOptions,
  VisionAnalysisResult,
  VisionServiceState,
  OCRBlock,
  UIElement,
} from '../../core/ai/IVisionService';
import { VideoFrame } from '../../core/capture/IVideoCapture';
import { CloudProviderRegistry } from './CloudProvider';

export interface CloudVisionConfig {
  provider: 'openai' | 'anthropic' | 'google' | string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
};

export class VisionServiceCloud implements IVisionService {
  private config: CloudVisionConfig | null = null;
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
      const providerId = typeof options.provider === 'string' && options.provider !== 'cloud'
        ? options.provider
        : 'openai';
      
      this.config = {
        provider: providerId,
        model: options.modelId || DEFAULT_MODELS[providerId] || 'gpt-4o',
        apiKey: options.apiKey || this.getApiKey(providerId),
        endpoint: options.endpoint,
        maxRetries: 3,
        timeoutMs: 60000,
      };
      
      this._modelOptions = options;
      
      // Validate API key
      if (!this.config.apiKey) {
        throw new Error(`No API key found for provider: ${providerId}`);
      }
      
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
      
      const response = await this.callVisionAPI(base64Image, prompt, opts);
      const parsed = this.parseResponse(response, frame, opts);
      
      parsed.processingTimeMs = Date.now() - startTime;
      
      this.setState('ready');
      return parsed;
    } catch (err) {
      this.setState('ready');
      this.emitError(err as Error);
      throw err;
    }
  }
  
  async analyzeMultiple(frames: VideoFrame[], opts?: VisionAnalysisOptions): Promise<VisionAnalysisResult[]> {
    // Process in parallel with concurrency limit
    const concurrency = 3;
    const results: VisionAnalysisResult[] = [];
    
    for (let i = 0; i < frames.length; i += concurrency) {
      const batch = frames.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(frame => this.analyze(frame, opts))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
  
  async describeSequence(frames: VideoFrame[], question?: string, opts?: VisionAnalysisOptions): Promise<string> {
    if (this._state !== 'ready') {
      throw new Error(`VisionService not ready, state: ${this._state}`);
    }
    
    this.setState('processing');
    
    try {
      // Select representative frames (first, middle, last, plus high-change frames)
      const selectedFrames = this.selectRepresentativeFrames(frames, 5);
      const images = selectedFrames.map(f => this.frameToBase64(f));
      
      const prompt = question
        ? `Look at these ${images.length} screenshots taken over time during a meeting/presentation. ${question}`
        : `Look at these ${images.length} screenshots taken over time during a meeting/presentation. Describe what happened, what was shown, and any key information or changes you observe.`;
      
      const response = await this.callMultiImageAPI(images, prompt);
      
      this.setState('ready');
      return response;
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
      const image1 = this.frameToBase64(frame1);
      const image2 = this.frameToBase64(frame2);
      
      const prompt = `Compare these two screenshots and describe:
1. How similar are they (0-100% where 100% is identical)?
2. What are the main differences?
3. List specific changes you observe.

Respond in JSON format:
{
  "similarityPercent": number,
  "description": "string",
  "changes": ["change1", "change2", ...]
}`;
      
      const response = await this.callMultiImageAPI([image1, image2], prompt);
      const parsed = this.parseJSON(response);
      
      this.setState('ready');
      
      return {
        changeScore: 1 - (parsed.similarityPercent || 50) / 100,
        description: parsed.description || 'Unable to describe changes',
        significantChanges: parsed.changes || [],
      };
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
        ? `Extract ALL text visible in this screenshot with high accuracy. Include every piece of text you can see, preserving the layout. Return as JSON: { "text": "all text here", "blocks": [{ "text": "block text", "confidence": 0.95 }] }`
        : `Extract the main text content from this screenshot. Return as JSON: { "text": "all text here", "blocks": [{ "text": "block text", "confidence": 0.9 }] }`;
      
      const response = await this.callVisionAPI(base64Image, prompt);
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
      // Return empty on error rather than throwing
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
  
  private getApiKey(providerId: string): string | undefined {
    const registry = CloudProviderRegistry.instance;
    const provider = registry.get(providerId);
    return provider ? registry.apiKey(provider) : undefined;
  }
  
  private frameToBase64(frame: VideoFrame): string {
    // Convert raw frame data to base64-encoded PNG/JPEG
    // In a real implementation, this would use a proper image encoder
    const data = new Uint8Array(frame.data);
    
    // Simple base64 encoding of raw data (actual implementation needs image encoding)
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }
  
  private buildAnalysisPrompt(opts?: VisionAnalysisOptions): string {
    const parts: string[] = ['Analyze this screenshot from a meeting/screen share.'];
    
    if (opts?.extractText !== false) {
      parts.push('Extract all visible text.');
    }
    if (opts?.extractUI) {
      parts.push('Identify UI elements (buttons, menus, inputs).');
    }
    if (opts?.extractCharts) {
      parts.push('Describe any charts, graphs, or data visualizations.');
    }
    
    parts.push(`Respond in JSON format:
{
  "description": "what is shown on screen",
  "appContext": "detected application name or null",
  "contentType": "presentation|document|code|terminal|browser|dashboard|video|other",
  "ocrText": "all extracted text",
  "ocrBlocks": [{ "text": "block", "confidence": 0.9 }],
  "uiElements": [{ "type": "button|input|menu|etc", "label": "text" }]
}`);
    
    return parts.join(' ');
  }
  
  private async callVisionAPI(base64Image: string, prompt: string, opts?: VisionAnalysisOptions): Promise<string> {
    if (!this.config) throw new Error('Vision service not initialized');
    
    const { provider, model, apiKey, endpoint } = this.config;
    
    if (provider === 'openai') {
      return this.callOpenAI(base64Image, prompt, model!, apiKey!, endpoint);
    } else if (provider === 'anthropic') {
      return this.callAnthropic(base64Image, prompt, model!, apiKey!, endpoint);
    } else if (provider === 'google') {
      return this.callGoogle(base64Image, prompt, model!, apiKey!, endpoint);
    }
    
    throw new Error(`Unsupported provider: ${provider}`);
  }
  
  private async callMultiImageAPI(images: string[], prompt: string): Promise<string> {
    if (!this.config) throw new Error('Vision service not initialized');
    
    const { provider, model, apiKey, endpoint } = this.config;
    
    if (provider === 'openai') {
      return this.callOpenAIMulti(images, prompt, model!, apiKey!, endpoint);
    } else if (provider === 'anthropic') {
      return this.callAnthropicMulti(images, prompt, model!, apiKey!, endpoint);
    } else if (provider === 'google') {
      return this.callGoogleMulti(images, prompt, model!, apiKey!, endpoint);
    }
    
    throw new Error(`Unsupported provider: ${provider}`);
  }
  
  private async callOpenAI(image: string, prompt: string, model: string, apiKey: string, endpoint?: string): Promise<string> {
    const url = endpoint || 'https://api.openai.com/v1/chat/completions';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } },
          ],
        }],
        max_tokens: 2000,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  
  private async callOpenAIMulti(images: string[], prompt: string, model: string, apiKey: string, endpoint?: string): Promise<string> {
    const url = endpoint || 'https://api.openai.com/v1/chat/completions';
    
    const content: any[] = [{ type: 'text', text: prompt }];
    for (const img of images) {
      content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } });
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        max_tokens: 4000,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  
  private async callAnthropic(image: string, prompt: string, model: string, apiKey: string, endpoint?: string): Promise<string> {
    const url = endpoint || 'https://api.anthropic.com/v1/messages';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }
  
  private async callAnthropicMulti(images: string[], prompt: string, model: string, apiKey: string, endpoint?: string): Promise<string> {
    const url = endpoint || 'https://api.anthropic.com/v1/messages';
    
    const content: any[] = [];
    for (const img of images) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: img } });
    }
    content.push({ type: 'text', text: prompt });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{ role: 'user', content }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }
  
  private async callGoogle(image: string, prompt: string, model: string, apiKey: string, endpoint?: string): Promise<string> {
    const url = endpoint || `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/png', data: image } },
          ],
        }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  
  private async callGoogleMulti(images: string[], prompt: string, model: string, apiKey: string, endpoint?: string): Promise<string> {
    const url = endpoint || `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
    const parts: any[] = [{ text: prompt }];
    for (const img of images) {
      parts.push({ inline_data: { mime_type: 'image/png', data: img } });
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  
  private parseResponse(response: string, frame: VideoFrame, opts?: VisionAnalysisOptions): VisionAnalysisResult {
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
      uiElements: (parsed.uiElements || []).map((u: any) => ({
        type: u.type || 'other',
        label: u.label,
      })),
      appContext: parsed.appContext || undefined,
      contentType: parsed.contentType || 'other',
      modelUsed: this.config?.model,
    };
  }
  
  private parseJSON(text: string): any {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Fall through
      }
    }
    
    // Return empty object if parsing fails
    return {};
  }
  
  private selectRepresentativeFrames(frames: VideoFrame[], maxCount: number): VideoFrame[] {
    if (frames.length <= maxCount) return frames;
    
    const result: VideoFrame[] = [];
    const step = Math.floor(frames.length / maxCount);
    
    // Always include first and last
    result.push(frames[0]);
    
    for (let i = step; i < frames.length - 1; i += step) {
      if (result.length < maxCount - 1) {
        result.push(frames[i]);
      }
    }
    
    result.push(frames[frames.length - 1]);
    
    return result;
  }
}
