// tests/config.test.ts
// Tests for configuration loading and validation

import { loadConfig, AppConfig, VisionConfig } from '../shared/config';

describe('Config', () => {
  describe('loadConfig', () => {
    it('should return default configuration', () => {
      const config = loadConfig();
      
      expect(config).toBeDefined();
      expect(config.aiBackend).toBeDefined();
      expect(config.shortcut).toBeDefined();
    });

    it('should have valid AI backend value', () => {
      const config = loadConfig();
      
      expect(['local', 'cloud']).toContain(config.aiBackend);
    });

    it('should have notification settings', () => {
      const config = loadConfig();
      
      expect(config.notifications).toBeDefined();
      expect(config.notifications.onDetect).toBeDefined();
      expect(['prompt', 'auto']).toContain(config.notifications.onDetect);
    });

    it('should have recording settings', () => {
      const config = loadConfig();
      
      expect(config.recording).toBeDefined();
      expect(typeof config.recording.autoStart).toBe('boolean');
    });

    it('should have parakeet settings', () => {
      const config = loadConfig();
      
      expect(config.parakeet).toBeDefined();
      expect(typeof config.parakeet?.enabled).toBe('boolean');
      expect(['cpu', 'gpu']).toContain(config.parakeet?.device);
    });

    it('should have smartResponse settings', () => {
      const config = loadConfig();
      
      expect(config.smartResponse).toBeDefined();
      expect(typeof config.smartResponse?.enabled).toBe('boolean');
      expect(config.smartResponse?.triggerWord).toBeDefined();
      expect(config.smartResponse?.hotkey).toBeDefined();
    });

    it('should have vision settings', () => {
      const config = loadConfig();
      
      expect(config.vision).toBeDefined();
      expect(typeof config.vision?.enabled).toBe('boolean');
    });
  });

  describe('VisionConfig defaults', () => {
    it('should have valid latency mode', () => {
      const config = loadConfig();
      
      expect(['realtime', 'near-realtime', 'batch']).toContain(config.vision?.latencyMode);
    });

    it('should have valid OCR accuracy', () => {
      const config = loadConfig();
      
      expect(['high', 'standard']).toContain(config.vision?.ocrAccuracy);
    });

    it('should have valid sampling strategy', () => {
      const config = loadConfig();
      
      expect(['fixed', 'adaptive', 'change-based']).toContain(config.vision?.samplingStrategy);
    });

    it('should have change threshold in valid range', () => {
      const config = loadConfig();
      
      expect(config.vision?.changeThreshold).toBeGreaterThanOrEqual(0);
      expect(config.vision?.changeThreshold).toBeLessThanOrEqual(1);
    });

    it('should have valid provider', () => {
      const config = loadConfig();
      
      expect(['local', 'cloud']).toContain(config.vision?.provider);
    });
  });
});
