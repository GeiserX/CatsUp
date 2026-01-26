// tests/vision/KeyframeExtractor.test.ts
// Tests for the KeyframeExtractor component

import { KeyframeExtractor, KeyframeCandidate } from '../../core/vision/KeyframeExtractor';
import { VideoFrame } from '../../core/capture/IVideoCapture';

function createMockFrame(frameId: number, timestamp: number, color: number = 128): VideoFrame {
  // Create a simple 10x10 grayscale frame
  const width = 10;
  const height = 10;
  const data = new ArrayBuffer(width * height * 4);
  const view = new Uint8Array(data);
  
  // Fill with color (BGRA format)
  for (let i = 0; i < view.length; i += 4) {
    view[i] = color;     // B
    view[i + 1] = color; // G
    view[i + 2] = color; // R
    view[i + 3] = 255;   // A
  }
  
  return {
    data,
    timestamp,
    width,
    height,
    format: 'bgra',
    frameId,
  };
}

describe('KeyframeExtractor', () => {
  let extractor: KeyframeExtractor;

  beforeEach(() => {
    extractor = new KeyframeExtractor({
      strategy: 'change-based',
      changeThreshold: 0.1,
      minIntervalMs: 100,
      maxIntervalMs: 5000,
    });
  });

  afterEach(() => {
    extractor.stop();
  });

  describe('initialization', () => {
    it('should start in idle state', () => {
      expect(extractor.getState()).toBe('idle');
    });

    it('should transition to running on start', () => {
      extractor.start();
      expect(extractor.getState()).toBe('running');
    });

    it('should return to idle on stop', () => {
      extractor.start();
      extractor.stop();
      expect(extractor.getState()).toBe('idle');
    });
  });

  describe('frame processing', () => {
    it('should select first frame as keyframe', () => {
      extractor.start();
      const frame = createMockFrame(1, Date.now());
      const result = extractor.processFrame(frame);
      
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('forced');
      expect(result?.changeScore).toBe(1.0);
    });

    it('should not process frames when not running', () => {
      const frame = createMockFrame(1, Date.now());
      const result = extractor.processFrame(frame);
      
      expect(result).toBeNull();
    });

    it('should detect significant change between frames', () => {
      extractor.start();
      
      // First frame (dark)
      const frame1 = createMockFrame(1, Date.now(), 50);
      extractor.processFrame(frame1);
      
      // Second frame (much brighter) - should be detected as change
      const frame2 = createMockFrame(2, Date.now() + 200, 200);
      const result = extractor.processFrame(frame2);
      
      expect(result).not.toBeNull();
      expect(result?.changeScore).toBeGreaterThan(0.1);
    });

    it('should not select similar frames as keyframes', () => {
      extractor.start();
      
      // First frame
      const frame1 = createMockFrame(1, Date.now(), 128);
      extractor.processFrame(frame1);
      
      // Second frame (very similar)
      const frame2 = createMockFrame(2, Date.now() + 200, 130);
      const result = extractor.processFrame(frame2);
      
      // Should be null because change is below threshold
      expect(result).toBeNull();
    });

    it('should respect minimum interval', () => {
      extractor.start();
      
      const now = Date.now();
      const frame1 = createMockFrame(1, now, 50);
      extractor.processFrame(frame1);
      
      // Second frame within min interval - should be skipped
      const frame2 = createMockFrame(2, now + 50, 200);
      const result = extractor.processFrame(frame2);
      
      expect(result).toBeNull();
    });

    it('should force keyframe after max interval', () => {
      extractor = new KeyframeExtractor({
        strategy: 'change-based',
        changeThreshold: 0.1,
        minIntervalMs: 100,
        maxIntervalMs: 500,
      });
      extractor.start();
      
      const now = Date.now();
      const frame1 = createMockFrame(1, now, 128);
      extractor.processFrame(frame1);
      
      // Frame after max interval - should be forced even without change
      const frame2 = createMockFrame(2, now + 600, 129);
      const result = extractor.processFrame(frame2);
      
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('forced');
    });
  });

  describe('fixed strategy', () => {
    it('should select frames at fixed intervals', () => {
      extractor = new KeyframeExtractor({
        strategy: 'fixed',
        fixedFps: 2, // 500ms interval
        minIntervalMs: 100,
        maxIntervalMs: 5000,
      });
      extractor.start();
      
      const now = Date.now();
      extractor.processFrame(createMockFrame(1, now));
      
      // Frame before interval - should not be selected
      expect(extractor.processFrame(createMockFrame(2, now + 400))).toBeNull();
      
      // Frame after interval - should be selected
      const result = extractor.processFrame(createMockFrame(3, now + 600));
      expect(result).not.toBeNull();
      expect(result?.reason).toBe('interval');
    });
  });

  describe('callbacks', () => {
    it('should call onKeyframe callback when keyframe is selected', () => {
      const callback = jest.fn();
      extractor.onKeyframe(callback);
      extractor.start();
      
      const frame = createMockFrame(1, Date.now());
      extractor.processFrame(frame);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        frame,
        reason: 'forced',
      }));
    });

    it('should allow unsubscribing from callback', () => {
      const callback = jest.fn();
      const unsubscribe = extractor.onKeyframe(callback);
      extractor.start();
      
      unsubscribe();
      
      const frame = createMockFrame(1, Date.now());
      extractor.processFrame(frame);
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('should not process frames when paused', () => {
      extractor.start();
      extractor.pause();
      
      expect(extractor.getState()).toBe('paused');
      
      const frame = createMockFrame(1, Date.now());
      const result = extractor.processFrame(frame);
      
      expect(result).toBeNull();
    });

    it('should resume processing after resume', () => {
      extractor.start();
      extractor.pause();
      extractor.resume();
      
      expect(extractor.getState()).toBe('running');
      
      const frame = createMockFrame(1, Date.now());
      const result = extractor.processFrame(frame);
      
      expect(result).not.toBeNull();
    });
  });
});
