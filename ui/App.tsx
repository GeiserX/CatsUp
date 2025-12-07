// ui/App.tsx
import React, { useEffect, useState } from 'react';
import { Controls } from './Controls';
import { Settings } from './Settings';
import { showNotification } from './Notifications';
import { bus } from '../shared/eventBus';
import { loadConfig, saveConfig, AppConfig } from '../shared/config';

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(loadConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [status, setStatus] = useState<string>('Idle');

  useEffect(() => {
    const offDetected = bus.on('meeting:detected', (payload: any) => {
      setStatus(`Detected meeting in ${payload?.appName || 'unknown app'}`);
      if (config.notifications.onDetect === 'prompt') {
        showNotification('Meeting detected', 'Start recording?', { requireInteraction: true });
      }
      if (config.notifications.onDetect === 'auto' || config.recording.autoStart) {
        bus.emit('recording:start', { source: payload?.source });
      }
    });
    const offStart = bus.on('recording:started', () => {
      setIsRecording(true);
      setStatus('Recording');
    });
    const offStop = bus.on('recording:stopped', () => {
      setIsRecording(false);
      setStatus('Stopped');
    });
    const offSummary = bus.on('ai:summary_ready', (p: { text: string }) => {
      setSummary(p.text);
      setStatus('Summary ready');
    });
    return () => {
      offDetected(); offStart(); offStop(); offSummary();
    };
  }, [config]);

  const handleStart = () => bus.emit('recording:start', {});
  const handleStop = () => bus.emit('recording:stop', {});
  const handleSummarize = () => bus.emit('ai:summarize', { mode: 'since_start' });
  const handleAsk = (q: string) => bus.emit('ai:ask', { question: q });

  const onSaveConfig = (next: AppConfig) => {
    setConfig(next);
    saveConfig(next);
    bus.emit('config:updated', next);
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 12, lineHeight: 1.4 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Meeting Assistant</h3>
        <div>
          <button onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? 'Close Settings' : 'Settings'}
          </button>
        </div>
      </header>

      {!showSettings && (
        <>
          <p style={{ color: '#555' }}>Status: {status}</p>
          <Controls
            isRecording={isRecording}
            onStart={handleStart}
            onStop={handleStop}
            onSummarize={handleSummarize}
            onAsk={handleAsk}
            config={config}
          />
          {summary && (
            <section style={{ marginTop: 12 }}>
              <h4>Summary</h4>
              <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
                {summary}
              </div>
            </section>
          )}
        </>
      )}

      {showSettings && (
        <Settings value={config} onChange={onSaveConfig} />
      )}
    </div>
  );
};
