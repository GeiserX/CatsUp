export type VisionLatencyMode = 'realtime' | 'near-realtime' | 'batch';
// realtime: ~5s latency, for live assistance
// near-realtime: ~30s latency, for meeting recap
// batch: ~2min latency, for post-meeting analysis

export type VisionSamplingStrategy = 'fixed' | 'adaptive' | 'change-based';

export interface VisionConfig {
    enabled: boolean;
    provider: 'local' | 'cloud' | string;  // 'local', 'cloud', or specific provider id
    latencyMode: VisionLatencyMode;
    ocrAccuracy: 'high' | 'standard';
    samplingStrategy: VisionSamplingStrategy;
    changeThreshold: number;      // 0.1 - 0.9, lower = more sensitive
    localModel?: string;          // e.g., 'qwen-vl-7b', 'llava-1.6-34b'
    localEndpoint?: string;       // e.g., 'http://127.0.0.1:8080'
    cloudProvider?: string;       // e.g., 'openai', 'anthropic', 'google'
    cloudModel?: string;          // e.g., 'gpt-4o', 'claude-sonnet-4-20250514'
    storeKeyframes?: boolean;     // Save keyframe images to disk
    maxKeyframesStored?: number;  // Limit stored keyframes
}

export interface AppConfig {
    aiBackend: 'local' | 'cloud';
    shortcut: string;
    notifications: {
        onDetect: 'prompt' | 'auto';
    };
    recording: {
        autoStart: boolean;
    };
    parakeet?: {
        enabled: boolean;
        device: 'cpu' | 'gpu';
    };
    smartResponse?: {
        enabled: boolean;
        triggerWord: string; // e.g., User Name
        hotkey: string;      // e.g., 'Ctrl+Shift+H'
    };
    vision?: VisionConfig;
}

export const loadConfig = (): AppConfig => {
    return {
        aiBackend: 'local',
        shortcut: 'Ctrl+Shift+R',
        notifications: { onDetect: 'prompt' },
        recording: { autoStart: false },
        parakeet: { enabled: true, device: 'cpu' },
        smartResponse: { enabled: true, triggerWord: 'Sergio', hotkey: 'Ctrl+Shift+H' },
        vision: {
            enabled: false,
            provider: 'cloud',
            latencyMode: 'near-realtime',
            ocrAccuracy: 'standard',
            samplingStrategy: 'change-based',
            changeThreshold: 0.1,
            cloudProvider: 'openai',
            cloudModel: 'gpt-4o',
            storeKeyframes: true,
            maxKeyframesStored: 500,
        }
    } as any;
};

export const saveConfig = (config: AppConfig): void => {
    console.log('Saved config:', config);
};
