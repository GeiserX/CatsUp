// core/vision/VisualTimeline.ts
// Event tracking and timeline storage for visual analysis.
// Maintains a timeline of keyframes and visual events with search capabilities.

import { VisualEvent, VisualTimeline as IVisualTimeline, KeyframeInfo } from './IScreenAnalyzer';

export interface VisualTimelineConfig {
  maxKeyframes: number;           // Maximum keyframes to store
  maxEvents: number;              // Maximum events to store
  pruneStrategy: 'oldest' | 'lowest-change';  // How to remove old entries
  indexOCRText: boolean;          // Build searchable index of OCR text
}

const DEFAULT_CONFIG: VisualTimelineConfig = {
  maxKeyframes: 1000,
  maxEvents: 5000,
  pruneStrategy: 'oldest',
  indexOCRText: true,
};

interface OCRIndexEntry {
  timestamp: number;
  keyframeId: number;
  text: string;
  words: string[];              // Lowercased words for search
}

export class VisualTimelineStore implements IVisualTimeline {
  startTime: number = 0;
  endTime: number | undefined;
  events: VisualEvent[] = [];
  keyframes: KeyframeInfo[] = [];
  totalKeyframes: number = 0;
  totalEvents: number = 0;
  appsDetected: string[] = [];
  ocrSnapshots: Array<{ timestamp: number; text: string }> = [];
  
  private config: VisualTimelineConfig;
  private ocrIndex: OCRIndexEntry[] = [];
  private appSet: Set<string> = new Set();
  private eventIdCounter: number = 0;
  
  // Callbacks
  private eventCallbacks: Array<(event: VisualEvent) => void> = [];
  private keyframeCallbacks: Array<(keyframe: KeyframeInfo) => void> = [];
  
  constructor(config?: Partial<VisualTimelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Start a new timeline.
   */
  start(timestamp: number): void {
    this.startTime = timestamp;
    this.endTime = undefined;
    this.events = [];
    this.keyframes = [];
    this.totalKeyframes = 0;
    this.totalEvents = 0;
    this.appsDetected = [];
    this.ocrSnapshots = [];
    this.ocrIndex = [];
    this.appSet.clear();
    this.eventIdCounter = 0;
  }
  
  /**
   * End the timeline.
   */
  end(timestamp: number): void {
    this.endTime = timestamp;
    
    // Close any open events
    for (const event of this.events) {
      if (!event.endTime) {
        event.endTime = timestamp;
      }
    }
  }
  
  /**
   * Add a keyframe to the timeline.
   */
  addKeyframe(keyframe: KeyframeInfo): void {
    this.totalKeyframes++;
    
    // Prune if needed
    if (this.keyframes.length >= this.config.maxKeyframes) {
      this.pruneKeyframes();
    }
    
    this.keyframes.push(keyframe);
    
    // Track apps
    if (keyframe.appContext && !this.appSet.has(keyframe.appContext)) {
      this.appSet.add(keyframe.appContext);
      this.appsDetected = Array.from(this.appSet);
    }
    
    // Index OCR text
    if (keyframe.ocrText && this.config.indexOCRText) {
      this.ocrSnapshots.push({
        timestamp: keyframe.timestamp,
        text: keyframe.ocrText,
      });
      
      this.ocrIndex.push({
        timestamp: keyframe.timestamp,
        keyframeId: keyframe.id,
        text: keyframe.ocrText,
        words: this.tokenize(keyframe.ocrText),
      });
    }
    
    // Notify callbacks
    for (const cb of this.keyframeCallbacks) {
      try {
        cb(keyframe);
      } catch (e) {
        console.error('Keyframe callback error:', e);
      }
    }
  }
  
  /**
   * Add an event to the timeline.
   */
  addEvent(event: Omit<VisualEvent, 'id'>): VisualEvent {
    const fullEvent: VisualEvent = {
      ...event,
      id: `ve_${++this.eventIdCounter}_${event.startTime}`,
    };
    
    this.totalEvents++;
    
    // Prune if needed
    if (this.events.length >= this.config.maxEvents) {
      this.pruneEvents();
    }
    
    this.events.push(fullEvent);
    
    // Notify callbacks
    for (const cb of this.eventCallbacks) {
      try {
        cb(fullEvent);
      } catch (e) {
        console.error('Event callback error:', e);
      }
    }
    
    return fullEvent;
  }
  
  /**
   * Update an existing event (e.g., to set endTime).
   */
  updateEvent(eventId: string, updates: Partial<VisualEvent>): void {
    const event = this.events.find(e => e.id === eventId);
    if (event) {
      Object.assign(event, updates);
    }
  }
  
  /**
   * Get the keyframe closest to a timestamp.
   */
  getKeyframeAt(timestamp: number): KeyframeInfo | null {
    if (this.keyframes.length === 0) return null;
    
    let closest = this.keyframes[0];
    let minDiff = Math.abs(timestamp - closest.timestamp);
    
    for (const kf of this.keyframes) {
      const diff = Math.abs(timestamp - kf.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = kf;
      }
    }
    
    return closest;
  }
  
  /**
   * Get keyframes in a time range.
   */
  getKeyframesInRange(start: number, end: number): KeyframeInfo[] {
    return this.keyframes.filter(kf => kf.timestamp >= start && kf.timestamp <= end);
  }
  
  /**
   * Get events in a time range.
   */
  getEventsInRange(start: number, end: number): VisualEvent[] {
    return this.events.filter(e => {
      const eventEnd = e.endTime || e.startTime;
      return e.startTime <= end && eventEnd >= start;
    });
  }
  
  /**
   * Get OCR text at a specific timestamp.
   */
  getTextAt(timestamp: number): string | null {
    const keyframe = this.getKeyframeAt(timestamp);
    return keyframe?.ocrText || null;
  }
  
  /**
   * Get all OCR text in a time range.
   */
  getTextInRange(start: number, end: number): string[] {
    return this.ocrSnapshots
      .filter(s => s.timestamp >= start && s.timestamp <= end)
      .map(s => s.text);
  }
  
  /**
   * Search OCR text for a query.
   */
  searchText(query: string): Array<{
    timestamp: number;
    keyframeId: number;
    text: string;
    context: string;
  }> {
    const queryWords = this.tokenize(query);
    const results: Array<{
      timestamp: number;
      keyframeId: number;
      text: string;
      context: string;
      score: number;
    }> = [];
    
    for (const entry of this.ocrIndex) {
      let matchCount = 0;
      for (const qw of queryWords) {
        if (entry.words.some(w => w.includes(qw))) {
          matchCount++;
        }
      }
      
      if (matchCount > 0) {
        const score = matchCount / queryWords.length;
        const context = this.extractContext(entry.text, query);
        results.push({
          timestamp: entry.timestamp,
          keyframeId: entry.keyframeId,
          text: entry.text,
          context,
          score,
        });
      }
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results.map(({ timestamp, keyframeId, text, context }) => ({
      timestamp,
      keyframeId,
      text,
      context,
    }));
  }
  
  /**
   * Get events by type.
   */
  getEventsByType(type: VisualEvent['type']): VisualEvent[] {
    return this.events.filter(e => e.type === type);
  }
  
  /**
   * Get a summary of the timeline.
   */
  getSummary(): {
    duration: number;
    keyframeCount: number;
    eventCount: number;
    apps: string[];
    eventTypes: Record<string, number>;
  } {
    const eventTypes: Record<string, number> = {};
    for (const e of this.events) {
      eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
    }
    
    return {
      duration: (this.endTime || Date.now()) - this.startTime,
      keyframeCount: this.keyframes.length,
      eventCount: this.events.length,
      apps: this.appsDetected,
      eventTypes,
    };
  }
  
  /**
   * Export the timeline to JSON.
   */
  toJSON(): IVisualTimeline {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      events: this.events,
      keyframes: this.keyframes,
      totalKeyframes: this.totalKeyframes,
      totalEvents: this.totalEvents,
      appsDetected: this.appsDetected,
      ocrSnapshots: this.ocrSnapshots,
    };
  }
  
  /**
   * Subscribe to new events.
   */
  onEvent(cb: (event: VisualEvent) => void): () => void {
    this.eventCallbacks.push(cb);
    return () => {
      const idx = this.eventCallbacks.indexOf(cb);
      if (idx >= 0) this.eventCallbacks.splice(idx, 1);
    };
  }
  
  /**
   * Subscribe to new keyframes.
   */
  onKeyframe(cb: (keyframe: KeyframeInfo) => void): () => void {
    this.keyframeCallbacks.push(cb);
    return () => {
      const idx = this.keyframeCallbacks.indexOf(cb);
      if (idx >= 0) this.keyframeCallbacks.splice(idx, 1);
    };
  }
  
  private pruneKeyframes(): void {
    if (this.config.pruneStrategy === 'oldest') {
      // Remove oldest 10%
      const removeCount = Math.ceil(this.keyframes.length * 0.1);
      this.keyframes = this.keyframes.slice(removeCount);
    } else {
      // Remove lowest change score keyframes
      this.keyframes.sort((a, b) => b.changeScore - a.changeScore);
      const removeCount = Math.ceil(this.keyframes.length * 0.1);
      this.keyframes = this.keyframes.slice(0, -removeCount);
      // Re-sort by timestamp
      this.keyframes.sort((a, b) => a.timestamp - b.timestamp);
    }
  }
  
  private pruneEvents(): void {
    // Always remove oldest for events
    const removeCount = Math.ceil(this.events.length * 0.1);
    this.events = this.events.slice(removeCount);
  }
  
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }
  
  private extractContext(text: string, query: string): string {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    
    if (idx === -1) {
      // Return first 200 chars if exact match not found
      return text.slice(0, 200) + (text.length > 200 ? '...' : '');
    }
    
    // Extract context around the match
    const start = Math.max(0, idx - 50);
    const end = Math.min(text.length, idx + query.length + 50);
    let context = text.slice(start, end);
    
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';
    
    return context;
  }
}
