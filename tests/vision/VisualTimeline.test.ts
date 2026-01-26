// tests/vision/VisualTimeline.test.ts
// Tests for the VisualTimeline component

import { VisualTimelineStore } from '../../core/vision/VisualTimeline';
import { KeyframeInfo, VisualEvent } from '../../core/vision/IScreenAnalyzer';

describe('VisualTimelineStore', () => {
  let timeline: VisualTimelineStore;

  beforeEach(() => {
    timeline = new VisualTimelineStore({
      maxKeyframes: 100,
      maxEvents: 100,
      pruneStrategy: 'oldest',
      indexOCRText: true,
    });
  });

  describe('initialization', () => {
    it('should start with empty timeline', () => {
      timeline.start(Date.now());
      const data = timeline.toJSON();
      
      expect(data.keyframes).toHaveLength(0);
      expect(data.events).toHaveLength(0);
      expect(data.totalKeyframes).toBe(0);
      expect(data.totalEvents).toBe(0);
    });

    it('should set start time', () => {
      const startTime = Date.now();
      timeline.start(startTime);
      
      expect(timeline.startTime).toBe(startTime);
      expect(timeline.endTime).toBeUndefined();
    });
  });

  describe('keyframe management', () => {
    beforeEach(() => {
      timeline.start(Date.now());
    });

    it('should add keyframes', () => {
      const keyframe: KeyframeInfo = {
        id: 1,
        timestamp: Date.now(),
        changeScore: 0.5,
        ocrText: 'Hello World',
        appContext: 'PowerPoint',
      };
      
      timeline.addKeyframe(keyframe);
      
      expect(timeline.keyframes).toHaveLength(1);
      expect(timeline.totalKeyframes).toBe(1);
    });

    it('should track detected apps', () => {
      timeline.addKeyframe({
        id: 1,
        timestamp: Date.now(),
        changeScore: 0.5,
        appContext: 'PowerPoint',
      });
      
      timeline.addKeyframe({
        id: 2,
        timestamp: Date.now() + 1000,
        changeScore: 0.3,
        appContext: 'VSCode',
      });
      
      expect(timeline.appsDetected).toContain('PowerPoint');
      expect(timeline.appsDetected).toContain('VSCode');
    });

    it('should index OCR text', () => {
      timeline.addKeyframe({
        id: 1,
        timestamp: Date.now(),
        changeScore: 0.5,
        ocrText: 'Meeting agenda for Q4 planning',
      });
      
      expect(timeline.ocrSnapshots).toHaveLength(1);
      expect(timeline.ocrSnapshots[0].text).toBe('Meeting agenda for Q4 planning');
    });

    it('should get keyframe at timestamp', () => {
      const now = Date.now();
      
      timeline.addKeyframe({ id: 1, timestamp: now, changeScore: 0.5 });
      timeline.addKeyframe({ id: 2, timestamp: now + 1000, changeScore: 0.3 });
      timeline.addKeyframe({ id: 3, timestamp: now + 2000, changeScore: 0.4 });
      
      const closest = timeline.getKeyframeAt(now + 1100);
      expect(closest?.id).toBe(2);
    });

    it('should get keyframes in range', () => {
      const now = Date.now();
      
      timeline.addKeyframe({ id: 1, timestamp: now, changeScore: 0.5 });
      timeline.addKeyframe({ id: 2, timestamp: now + 1000, changeScore: 0.3 });
      timeline.addKeyframe({ id: 3, timestamp: now + 2000, changeScore: 0.4 });
      
      const inRange = timeline.getKeyframesInRange(now + 500, now + 1500);
      expect(inRange).toHaveLength(1);
      expect(inRange[0].id).toBe(2);
    });

    it('should prune oldest keyframes when limit reached', () => {
      timeline = new VisualTimelineStore({
        maxKeyframes: 5,
        maxEvents: 100,
        pruneStrategy: 'oldest',
        indexOCRText: false,
      });
      timeline.start(Date.now());
      
      for (let i = 0; i < 10; i++) {
        timeline.addKeyframe({
          id: i,
          timestamp: Date.now() + i * 100,
          changeScore: 0.5,
        });
      }
      
      expect(timeline.keyframes.length).toBeLessThanOrEqual(5);
      expect(timeline.totalKeyframes).toBe(10);
    });
  });

  describe('event management', () => {
    beforeEach(() => {
      timeline.start(Date.now());
    });

    it('should add events with generated ID', () => {
      const event = timeline.addEvent({
        startTime: Date.now(),
        type: 'slide-change',
        summary: 'Slide changed',
      });
      
      expect(event.id).toBeDefined();
      expect(event.id).toMatch(/^ve_/);
      expect(timeline.events).toHaveLength(1);
    });

    it('should update existing events', () => {
      const event = timeline.addEvent({
        startTime: Date.now(),
        type: 'app-switch',
        summary: 'Switched to VSCode',
      });
      
      timeline.updateEvent(event.id, { endTime: Date.now() + 5000 });
      
      expect(timeline.events[0].endTime).toBeDefined();
    });

    it('should get events in range', () => {
      const now = Date.now();
      
      timeline.addEvent({ startTime: now, type: 'slide-change', summary: 'Slide 1' });
      timeline.addEvent({ startTime: now + 1000, type: 'slide-change', summary: 'Slide 2' });
      timeline.addEvent({ startTime: now + 2000, type: 'slide-change', summary: 'Slide 3' });
      
      const inRange = timeline.getEventsInRange(now + 500, now + 1500);
      expect(inRange).toHaveLength(1);
    });

    it('should get events by type', () => {
      timeline.addEvent({ startTime: Date.now(), type: 'slide-change', summary: 'Slide 1' });
      timeline.addEvent({ startTime: Date.now(), type: 'app-switch', summary: 'Switch' });
      timeline.addEvent({ startTime: Date.now(), type: 'slide-change', summary: 'Slide 2' });
      
      const slideChanges = timeline.getEventsByType('slide-change');
      expect(slideChanges).toHaveLength(2);
    });
  });

  describe('text search', () => {
    beforeEach(() => {
      timeline.start(Date.now());
    });

    it('should search OCR text', () => {
      timeline.addKeyframe({
        id: 1,
        timestamp: Date.now(),
        changeScore: 0.5,
        ocrText: 'Meeting agenda for Q4 planning',
      });
      
      timeline.addKeyframe({
        id: 2,
        timestamp: Date.now() + 1000,
        changeScore: 0.3,
        ocrText: 'Revenue projections and goals',
      });
      
      const results = timeline.searchText('planning');
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('planning');
    });

    it('should return empty array for no matches', () => {
      timeline.addKeyframe({
        id: 1,
        timestamp: Date.now(),
        changeScore: 0.5,
        ocrText: 'Hello world',
      });
      
      const results = timeline.searchText('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should get text at timestamp', () => {
      const now = Date.now();
      
      timeline.addKeyframe({
        id: 1,
        timestamp: now,
        changeScore: 0.5,
        ocrText: 'First slide',
      });
      
      timeline.addKeyframe({
        id: 2,
        timestamp: now + 1000,
        changeScore: 0.3,
        ocrText: 'Second slide',
      });
      
      const text = timeline.getTextAt(now + 100);
      expect(text).toBe('First slide');
    });

    it('should get text in range', () => {
      const now = Date.now();
      
      timeline.addKeyframe({ id: 1, timestamp: now, changeScore: 0.5, ocrText: 'Text 1' });
      timeline.addKeyframe({ id: 2, timestamp: now + 1000, changeScore: 0.3, ocrText: 'Text 2' });
      timeline.addKeyframe({ id: 3, timestamp: now + 2000, changeScore: 0.4, ocrText: 'Text 3' });
      
      const texts = timeline.getTextInRange(now + 500, now + 1500);
      expect(texts).toHaveLength(1);
      expect(texts[0]).toBe('Text 2');
    });
  });

  describe('callbacks', () => {
    beforeEach(() => {
      timeline.start(Date.now());
    });

    it('should call onKeyframe callback', () => {
      const callback = jest.fn();
      timeline.onKeyframe(callback);
      
      const keyframe: KeyframeInfo = {
        id: 1,
        timestamp: Date.now(),
        changeScore: 0.5,
      };
      
      timeline.addKeyframe(keyframe);
      
      expect(callback).toHaveBeenCalledWith(keyframe);
    });

    it('should call onEvent callback', () => {
      const callback = jest.fn();
      timeline.onEvent(callback);
      
      timeline.addEvent({
        startTime: Date.now(),
        type: 'slide-change',
        summary: 'Test',
      });
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const callback = jest.fn();
      const unsubscribe = timeline.onKeyframe(callback);
      
      unsubscribe();
      
      timeline.addKeyframe({ id: 1, timestamp: Date.now(), changeScore: 0.5 });
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('end and summary', () => {
    it('should close open events on end', () => {
      timeline.start(Date.now());
      
      timeline.addEvent({
        startTime: Date.now(),
        type: 'app-switch',
        summary: 'Switched',
      });
      
      const endTime = Date.now() + 5000;
      timeline.end(endTime);
      
      expect(timeline.endTime).toBe(endTime);
      expect(timeline.events[0].endTime).toBe(endTime);
    });

    it('should generate summary', () => {
      timeline.start(Date.now());
      
      timeline.addKeyframe({ id: 1, timestamp: Date.now(), changeScore: 0.5, appContext: 'PowerPoint' });
      timeline.addEvent({ startTime: Date.now(), type: 'slide-change', summary: 'Slide 1' });
      timeline.addEvent({ startTime: Date.now(), type: 'slide-change', summary: 'Slide 2' });
      
      const summary = timeline.getSummary();
      
      expect(summary.keyframeCount).toBe(1);
      expect(summary.eventCount).toBe(2);
      expect(summary.apps).toContain('PowerPoint');
      expect(summary.eventTypes['slide-change']).toBe(2);
    });
  });
});
