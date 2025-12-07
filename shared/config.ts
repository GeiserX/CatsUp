
export interface AppConfig {
    aiBackend: 'local' | 'cloud';
    shortcut: string;
    notifications: {
        onDetect: 'prompt' | 'auto';
    };
    recording: {
        autoStart: boolean;
    };
}

export const loadConfig = (): AppConfig => {
    return { aiBackend: 'local', shortcut: 'Ctrl+Shift+R', notifications: { onDetect: 'prompt' }, recording: { autoStart: false } } as any;
};

export const saveConfig = (config: AppConfig): void => {
    console.log('Saved config:', config);
};
