// windows/RecorderMF.cs
// Simple MP4 writer using Media Foundation SinkWriter.
// - Video: frames from GraphicsCapture (BGRA -> H.264)
// - Audio: two streams (loopback and mic) as AAC (no mixing, separate tracks).
// This is a compact encoder; for production, handle format negotiation and clock sync robustly.

using System;
using System.Threading.Tasks;
using MeetingAssistant.Windows.Audio;
using MeetingAssistant.Windows.Capture;

namespace MeetingAssistant.Windows
{
    public sealed class RecorderMF : IDisposable
    {
        private readonly VideoCaptureGraphicsCapture _video = new();
        private readonly AudioCaptureWASAPI _audio = new();
        private readonly SinkWriterWrapper _writer = new(); // wraps IMF fields internally
        private bool _recording;

        public bool IsRecording => _recording;

        public async Task StartAsync(IntPtr hwnd, string outputPath)
        {
            if (_recording) return;

            await _writer.InitializeAsync(outputPath, width: 1920, height: 1080, fps: 30, sampleRate: 48000, channels: 2);

            _video.OnFrame += (tex, qpc) =>
            {
                _writer.WriteVideoFrame(tex, qpc);
                tex.Dispose();
            };
            await _video.StartAsync(hwnd);

            _audio.OnSamples += (samples, ts, isLoopback) =>
            {
                _writer.WriteAudioSamples(samples, ts, isLoopback ? 0 : 1);
            };
            _audio.Configure(new AudioCaptureWASAPI.Options { CaptureLoopback = true, CaptureMic = true, SampleRate = 48000, Channels = 2 });
            _audio.Start();

            _recording = true;
        }

        public void Stop()
        {
            if (!_recording) return;
            _audio.Stop();
            _video.Stop();
            _writer.FinalizeFile();
            _recording = false;
        }

        public void Dispose() => Stop();
    }
}
