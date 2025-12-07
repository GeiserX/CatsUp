
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
}

export const loadConfig = (): AppConfig => {
    return {
        aiBackend: 'local',
        shortcut: 'Ctrl+Shift+R',
        notifications: { onDetect: 'prompt' },
        recording: { autoStart: false },
        parakeet: { enabled: true, device: 'cpu' },
        smartResponse: { enabled: true, triggerWord: 'Sergio', hotkey: 'Ctrl+Shift+H' }
    } as any;
};

export const saveConfig = (config: AppConfig): void => {
    console.log('Saved config:', config);
};
