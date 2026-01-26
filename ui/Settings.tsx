import React from 'react';
import { AppConfig, VisionLatencyMode, VisionSamplingStrategy } from '../shared/config';

interface Props {
    value: AppConfig;
    onChange: (cfg: AppConfig) => void;
}

export const Settings: React.FC<Props> = ({ value, onChange }) => {
    const handleChange = (section: keyof AppConfig, key: string, val: any) => {
        const next = { ...value } as any;
        if (section === 'notifications' || section === 'recording' || section === 'parakeet' || section === 'smartResponse' || section === 'vision') {
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

            <h4>Screen Vision (Beta)</h4>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                Analyze screen content during meetings using AI vision models.
            </p>
            <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                    type="checkbox"
                    checked={value.vision?.enabled}
                    onChange={e => handleChange('vision', 'enabled', e.target.checked)}
                /> Enable Screen Vision Analysis
            </label>
            {value.vision?.enabled && (
                <div style={{ marginLeft: 20 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>
                        Vision Provider:
                        <select
                            value={value.vision?.provider}
                            onChange={e => handleChange('vision', 'provider', e.target.value)}
                            style={{ marginLeft: 8 }}
                        >
                            <option value="cloud">Cloud (OpenAI/Anthropic/Google)</option>
                            <option value="local">Local (LLaVA/Qwen-VL)</option>
                        </select>
                    </label>

                    {value.vision?.provider === 'cloud' && (
                        <>
                            <label style={{ display: 'block', marginBottom: 8 }}>
                                Cloud Provider:
                                <select
                                    value={value.vision?.cloudProvider || 'openai'}
                                    onChange={e => handleChange('vision', 'cloudProvider', e.target.value)}
                                    style={{ marginLeft: 8 }}
                                >
                                    <option value="openai">OpenAI (GPT-4o)</option>
                                    <option value="anthropic">Anthropic (Claude)</option>
                                    <option value="google">Google (Gemini)</option>
                                </select>
                            </label>
                            <label style={{ display: 'block', marginBottom: 8 }}>
                                Model:
                                <select
                                    value={value.vision?.cloudModel || 'gpt-4o'}
                                    onChange={e => handleChange('vision', 'cloudModel', e.target.value)}
                                    style={{ marginLeft: 8 }}
                                >
                                    {value.vision?.cloudProvider === 'openai' && (
                                        <>
                                            <option value="gpt-4o">GPT-4o</option>
                                            <option value="gpt-4o-mini">GPT-4o Mini</option>
                                        </>
                                    )}
                                    {value.vision?.cloudProvider === 'anthropic' && (
                                        <>
                                            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                                        </>
                                    )}
                                    {value.vision?.cloudProvider === 'google' && (
                                        <>
                                            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                        </>
                                    )}
                                </select>
                            </label>
                        </>
                    )}

                    {value.vision?.provider === 'local' && (
                        <>
                            <label style={{ display: 'block', marginBottom: 8 }}>
                                Local Model:
                                <select
                                    value={value.vision?.localModel || 'llava-1.6-7b'}
                                    onChange={e => handleChange('vision', 'localModel', e.target.value)}
                                    style={{ marginLeft: 8 }}
                                >
                                    <option value="llava-1.6-7b">LLaVA 1.6 7B</option>
                                    <option value="llava-1.6-34b">LLaVA 1.6 34B</option>
                                    <option value="qwen-vl-7b">Qwen-VL 7B</option>
                                    <option value="qwen2-vl-7b">Qwen2-VL 7B</option>
                                    <option value="minicpm-v-2.6">MiniCPM-V 2.6</option>
                                </select>
                            </label>
                            <label style={{ display: 'block', marginBottom: 8 }}>
                                Local Endpoint:
                                <input
                                    type="text"
                                    value={value.vision?.localEndpoint || 'http://127.0.0.1:8080'}
                                    onChange={e => handleChange('vision', 'localEndpoint', e.target.value)}
                                    style={{ marginLeft: 8, width: 200 }}
                                    placeholder="http://127.0.0.1:8080"
                                />
                            </label>
                        </>
                    )}

                    <label style={{ display: 'block', marginBottom: 8 }}>
                        Latency Mode:
                        <select
                            value={value.vision?.latencyMode || 'near-realtime'}
                            onChange={e => handleChange('vision', 'latencyMode', e.target.value as VisionLatencyMode)}
                            style={{ marginLeft: 8 }}
                        >
                            <option value="realtime">Realtime (~5s) - Live assistance</option>
                            <option value="near-realtime">Near-realtime (~30s) - Balanced</option>
                            <option value="batch">Batch (~2min) - Post-meeting</option>
                        </select>
                    </label>

                    <label style={{ display: 'block', marginBottom: 8 }}>
                        OCR Accuracy:
                        <select
                            value={value.vision?.ocrAccuracy || 'standard'}
                            onChange={e => handleChange('vision', 'ocrAccuracy', e.target.value)}
                            style={{ marginLeft: 8 }}
                        >
                            <option value="standard">Standard (faster)</option>
                            <option value="high">High (more thorough)</option>
                        </select>
                    </label>

                    <label style={{ display: 'block', marginBottom: 8 }}>
                        Sampling Strategy:
                        <select
                            value={value.vision?.samplingStrategy || 'change-based'}
                            onChange={e => handleChange('vision', 'samplingStrategy', e.target.value as VisionSamplingStrategy)}
                            style={{ marginLeft: 8 }}
                        >
                            <option value="change-based">Change-based (recommended)</option>
                            <option value="adaptive">Adaptive</option>
                            <option value="fixed">Fixed interval</option>
                        </select>
                    </label>

                    <label style={{ display: 'block', marginBottom: 8 }}>
                        Change Sensitivity:
                        <input
                            type="range"
                            min="0.05"
                            max="0.5"
                            step="0.05"
                            value={value.vision?.changeThreshold || 0.1}
                            onChange={e => handleChange('vision', 'changeThreshold', parseFloat(e.target.value))}
                            style={{ marginLeft: 8, width: 100 }}
                        />
                        <span style={{ marginLeft: 8 }}>
                            {((1 - (value.vision?.changeThreshold || 0.1)) * 100).toFixed(0)}%
                        </span>
                    </label>

                    <label style={{ display: 'block', marginBottom: 8 }}>
                        <input
                            type="checkbox"
                            checked={value.vision?.storeKeyframes !== false}
                            onChange={e => handleChange('vision', 'storeKeyframes', e.target.checked)}
                        /> Store keyframe images
                    </label>
                </div>
            )}
        </div>
    );
};
