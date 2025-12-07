// windows/AppCoordinator.cs
// Orchestrates UIA detection, prompting/auto-start, capture, and file writing.

using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MeetingAssistant.Windows.Audio;
using MeetingAssistant.Windows.Capture;
using MeetingAssistant.Windows.Detect;
using MeetingAssistant.Windows.AI;

namespace MeetingAssistant.Windows
{
    public sealed class AppCoordinator : IDisposable
    {
        public static AppCoordinator Instance { get; } = new AppCoordinator();

        private readonly MeetingDetectorUIA _detector = new();
        private readonly NotificationService _notify = new();
        private readonly ParakeetProvider _parakeet = new();
        private readonly ResponseGenerator _responder = new();
        private RecorderMF? _recorder;
        private IntPtr _currentHwnd = IntPtr.Zero;
        private long _lastSeenMs = 0;
        private System.Timers.Timer? _idleTimer;

        public bool AutoStart { get; set; } = true;
        public bool AutoStop { get; set; } = true;
        public int InactivityTimeoutMs { get; set; } = 20000;

        public bool IsRecording => _recorder?.IsRecording ?? false;

        private AppCoordinator() { }

        public void Initialize()
        {
            _notify.EnsureChannel(); // Toast setup for desktop. 【1】
            _notify.OnAction += (action, data) =>
            {
                if (action == NotificationAction.Start && data.TryGetValue("hwnd", out var hwndStr) && long.TryParse(hwndStr, out var hwndVal))
                    _ = StartRecordingAsync(new IntPtr(hwndVal));
            };

            _detector.Configure(new MeetingDetectorUIA.Config { PollIntervalMs = 1000, MinConfidence = 0.7 });
            _detector.OnDetected += detections =>
            {
                var best = detections.OrderByDescending(d => d.Confidence).FirstOrDefault();
                if (best == null) return;

                _currentHwnd = best.Hwnd;
                _lastSeenMs = NowMs();

                if (IsRecording) return;

                if (AutoStart)
                {
                    _ = StartRecordingAsync(best.Hwnd);
                }
                else
                {
                    _notify.ShowDetection($"{best.AppId} meeting detected", best.MeetingTitle ?? best.Title, new() { { "hwnd", best.Hwnd.ToInt64().ToString() } });
                }
            };

            _idleTimer = new System.Timers.Timer(2000);
            _idleTimer.Elapsed += (_, __) =>
            {
                if (AutoStop && IsRecording)
                {
                    var now = NowMs();
                    if (now - _lastSeenMs > InactivityTimeoutMs)
                    {
                        StopRecording();
                    }
                }
            };
            _idleTimer.Start();

            // AI Init
            _parakeet.Initialize("cpu");
            _responder.Configure(true, "Sergio");
        }

        public void StartDetection() => _detector.Start();

        private string RecordingsDir()
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos), "MeetingAssistantRecordings");
            Directory.CreateDirectory(dir);
            return dir;
        }

        private async Task StartRecordingAsync(IntPtr hwnd)
        {
            if (IsRecording) return;

            var file = Path.Combine(RecordingsDir(), $"meeting-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}.mp4");
            var rec = new RecorderMF();
            _recorder = rec;

            rec.OnAudioData += async samples => {
                 // buffer samples? for now just send chunks
                 var text = await _parakeet.TranscribeAsync(samples);
                 if (_responder.ShouldTrigger(text)) {
                     var reply = await _responder.GenerateResponseAsync(text);
                     _notify.ShowDetection("Smart Response", reply, new() { ["type"] = "response" });
                 }
            };

            await rec.StartAsync(hwnd, file);
        }

        public void StopRecording()
        {
            _recorder?.Stop();
            _recorder = null;
        }

        private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public void Dispose()
        {
            _idleTimer?.Dispose();
            _detector.Dispose();
            _recorder?.Stop();
        }
    }
}
