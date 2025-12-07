import React from 'react';
import { AppConfig } from '../shared/config';

interface Props {
    value: AppConfig;
    onChange: (cfg: AppConfig) => void;
}

export const Settings: React.FC<Props> = ({ value, onChange }) => {
    const handleChange = (section: keyof AppConfig, key: string, val: any) => {
        const next = { ...value } as any;
        if (section === 'notifications' || section === 'recording' || section === 'parakeet' || section === 'smartResponse') {
            next[section] = { ...next[section], [key]: val };
        } else {
            next[key] = val;
        }
        onChange(next);
    };

    return (
        <div style={{ padding: 20, borderTop: '1px solid #ddd' }}>
            <h4>General</h4>
            <label style={{ display: 'block', marginBottom: 8 }}>
                Global Shortcut:
                <input
                    type="text"
                    value={value.shortcut}
                    onChange={e => handleChange('shortcut' as any, 'shortcut', e.target.value)}
                    style={{ marginLeft: 8 }}
                />
            </label>

            <h4>Recording & AI</h4>
            <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                    type="checkbox"
                    checked={value.recording?.autoStart}
                    onChange={e => handleChange('recording', 'autoStart', e.target.checked)}
                /> Auto-start recording on meeting detection
            </label>

            <label style={{ display: 'block', marginBottom: 8 }}>
                AI Backend:
                <select
                    value={value.aiBackend}
                    onChange={e => handleChange('aiBackend' as any, 'aiBackend', e.target.value)}
                    style={{ marginLeft: 8 }}
                >
                    <option value="local">Local</option>
                    <option value="cloud">Cloud</option>
                </select>
            </label>

            <h4>Parakeet (Speech-to-Text)</h4>
            <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                    type="checkbox"
                    checked={value.parakeet?.enabled}
                    onChange={e => handleChange('parakeet', 'enabled', e.target.checked)}
                /> Enable Parakeet
            </label>
            {value.parakeet?.enabled && (
                <label style={{ display: 'block', marginBottom: 8, marginLeft: 20 }}>
                    Device:
                    <select
                        value={value.parakeet?.device}
                        onChange={e => handleChange('parakeet', 'device', e.target.value)}
                        style={{ marginLeft: 8 }}
                    >
                        <option value="cpu">CPU</option>
                        <option value="gpu">GPU</option>
                    </select>
                </label>
            )}

            <h4>Smart Response</h4>
            <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                    type="checkbox"
                    checked={value.smartResponse?.enabled}
                    onChange={e => handleChange('smartResponse', 'enabled', e.target.checked)}
                /> Enable Smart Response
            </label>
            {value.smartResponse?.enabled && (
                <div style={{ marginLeft: 20 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>
                        Trigger Word (Your Name):
                        <input
                            type="text"
                            value={value.smartResponse?.triggerWord}
                            onChange={e => handleChange('smartResponse', 'triggerWord', e.target.value)}
                            style={{ marginLeft: 8 }}
                        />
                    </label>
                    <label style={{ display: 'block', marginBottom: 8 }}>
                        Trigger Hotkey:
                        <input
                            type="text"
                            value={value.smartResponse?.hotkey}
                            onChange={e => handleChange('smartResponse', 'hotkey', e.target.value)}
                            style={{ marginLeft: 8 }}
                        />
                    </label>
                </div>
            )}
        </div>
    );
};
