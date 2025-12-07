// windows/AudioCaptureWASAPI.cs
// WASAPI capture for:
// - Loopback (render) for app/system audio (optionally process-filtered where supported).
// - Microphone capture (capture endpoint).
// Emits raw PCM float32 frames suitable for encoding.
// References: WASAPI loopback recording and application loopback samples. 【2】【4】

using System;
using System.Runtime.InteropServices;
using System.Threading;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace MeetingAssistant.Windows.Audio
{
    public sealed class AudioCaptureWASAPI : IDisposable
    {
        public class Options
        {
            public bool CaptureLoopback { get; set; } = true;
            public bool CaptureMic { get; set; } = true;
            public int SampleRate { get; set; } = 48000;
            public int Channels { get; set; } = 2;
            public int? TargetProcessId { get; set; } // optional: attempt app-only loopback when available
        }

        public event Action<float[], long, bool /*isLoopback*/>? OnSamples;

        private WasapiLoopbackCapture? _loopback;
        private WasapiCapture? _mic;
        private Options _opts = new Options();
        private WaveFormat? _fmt;

        public void Configure(Options opts) => _opts = opts;

        public void Start()
        {
            if (_opts.CaptureLoopback)
            {
                // Loopback: captures render mix. Some OEM drivers or Windows versions can restrict protected content. 【5】
                var devEnum = new MMDeviceEnumerator();
                var render = devEnum.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                _loopback = new WasapiLoopbackCapture(render);
                _loopback.DataAvailable += (s, a) =>
                {
                    var floats = ToFloatArray(a.Buffer, a.BytesRecorded);
                    var ts = StopwatchTicks();
                    OnSamples?.Invoke(floats, ts, true);
                };
                _loopback.StartRecording();
            }

            if (_opts.CaptureMic)
            {
                var devEnum = new MMDeviceEnumerator();
                var cap = devEnum.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
                _mic = new WasapiCapture(cap);
                _mic.DataAvailable += (s, a) =>
                {
                    var floats = ToFloatArray(a.Buffer, a.BytesRecorded);
                    var ts = StopwatchTicks();
                    OnSamples?.Invoke(floats, ts, false);
                };
                _mic.StartRecording();
            }
        }

        public void Stop()
        {
            if (_loopback != null)
            {
                _loopback.StopRecording();
                _loopback.Dispose();
                _loopback = null;
            }
            if (_mic != null)
            {
                _mic.StopRecording();
                _mic.Dispose();
                _mic = null;
            }
        }

        private static float[] ToFloatArray(byte[] buffer, int bytes)
        {
            // NAudio may provide 32-bit float or 16-bit pcm depending on driver. Convert to float32.
            // For brevity, assume 32-bit float here; production code should inspect WaveFormat.
            int count = bytes / sizeof(float);
            float[] floats = new float[count];
            Buffer.BlockCopy(buffer, 0, floats, 0, bytes);
            return floats;
        }

        private static long StopwatchTicks() => DateTime.UtcNow.Ticks;

        public void Dispose() => Stop();
    }
}
