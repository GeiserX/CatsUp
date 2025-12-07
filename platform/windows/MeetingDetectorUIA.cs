// windows/MeetingDetectorUIA.cs
// UI Automation-based window scanner with heuristics for Teams/Zoom/Slack/Meet.
// Polls top-level windows, extracts Name and ProcessId, classifies, and emits detections.
// References: UIA event model and control support. 【6】【7】

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;

namespace MeetingAssistant.Windows.Detect
{
    public sealed class MeetingDetectorUIA : IDisposable
    {
        public enum App { Teams, Zoom, Slack, Meet, Unknown }
        public enum Phase { Prejoin, InCall, Presenting, Lobby, Unknown }

        public sealed class Detection
        {
            public App AppId { get; init; } = App.Unknown;
            public int ProcessId { get; init; }
            public IntPtr Hwnd { get; init; }
            public string Title { get; init; } = "";
            public double Confidence { get; init; }
            public Phase MeetingPhase { get; init; } = Phase.Unknown;
            public string? MeetingTitle { get; init; }
        }

        public sealed class Config
        {
            public int PollIntervalMs { get; set; } = 1000;
            public double MinConfidence { get; set; } = 0.6;
        }

        public event Action<IReadOnlyList<Detection>>? OnDetected;

        private Timer? _timer;
        private Config _cfg = new();
        private HashSet<string> _lastKeys = new();

        public void Configure(Config cfg)
        {
            _cfg = cfg;
            if (_timer != null) { Stop(); Start(); }
        }

        public void Start()
        {
            Stop();
            _timer = new Timer(_ => Tick(), null, 0, _cfg.PollIntervalMs);
        }

        public void Stop()
        {
            _timer?.Dispose(); _timer = null;
            _lastKeys.Clear();
        }

        private void Tick()
        {
            try
            {
                var hits = Scan();
                var strong = hits.Where(h => h.Confidence >= _cfg.MinConfidence).ToList();
                var keys = new HashSet<string>(strong.Select(h => $"{h.AppId}:{h.ProcessId}:{h.Hwnd}"));
                var isNew = keys.Except(_lastKeys).Any();
                _lastKeys = keys;
                if (strong.Count > 0 && isNew)
                {
                    OnDetected?.Invoke(strong);
                }
            }
            catch
            {
                // swallow; optionally log
            }
        }

        private static IEnumerable<Detection> Scan()
        {
            var desktop = AutomationElement.RootElement;
            if (desktop == null) yield break;

            var cond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window);
            var windows = desktop.FindAll(TreeScope.Children, cond);

            foreach (AutomationElement win in windows)
            {
                string title = (win.Current.Name ?? "").Trim();
                int pid = win.Current.ProcessId;
                IntPtr hwnd = new IntPtr(win.Current.NativeWindowHandle);
                if (string.IsNullOrEmpty(title) || hwnd == IntPtr.Zero) continue;

                var (app, conf, phase, mt) = Classify(title);
                if (app == App.Unknown) continue;

                yield return new Detection
                {
                    AppId = app,
                    ProcessId = pid,
                    Hwnd = hwnd,
                    Title = title,
                    Confidence = conf,
                    MeetingPhase = phase,
                    MeetingTitle = mt
                };
            }
        }

        private static (App, double, Phase, string?) Classify(string title)
        {
            // Teams
            if (Regex.IsMatch(title, @"Teams", RegexOptions.IgnoreCase))
            {
                double c = 0.6;
                if (Regex.IsMatch(title, @"Meeting|Call|Presenting|Lobby|Join now", RegexOptions.IgnoreCase)) c += 0.2;
                var phase = InferPhase(title, "teams");
                var mt = ExtractTitle(title, "Microsoft Teams", new[] { "Meeting", "Call", "Presenting", "Lobby" });
                return (App.Teams, Math.Min(1.0, c), phase, mt);
            }

            // Zoom
            if (Regex.IsMatch(title, @"Zoom|zoom\.us", RegexOptions.IgnoreCase))
            {
                double c = 0.65;
                if (Regex.IsMatch(title, @"Meeting|Webinar|Sharing|Waiting Room|Breakout", RegexOptions.IgnoreCase)) c += 0.15;
                var phase = InferPhase(title, "zoom");
                var mt = ExtractTitle(title, "Zoom", new[] { "Meeting", "Webinar", "Sharing", "Waiting Room", "Breakout" });
                return (App.Zoom, Math.Min(1.0, c), phase, mt);
            }

            // Slack Huddles
            if (Regex.IsMatch(title, @"Slack", RegexOptions.IgnoreCase) && Regex.IsMatch(title, @"Huddle|Call|Huddles|Presenting", RegexOptions.IgnoreCase))
            {
                double c = 0.8;
                var phase = Regex.IsMatch(title, @"Share screen|Presenting|Sharing", RegexOptions.IgnoreCase) ? Phase.Presenting : Phase.InCall;
                var mt = ExtractTitle(title, "Slack", new[] { "Huddle", "Huddles", "Call", "Presenting", "Share screen" });
                return (App.Slack, Math.Min(1.0, c), phase, mt);
            }

            // Google Meet (PWA/browser)
            if (Regex.IsMatch(title, @"Google\s+Meet|meet\.google\.com", RegexOptions.IgnoreCase) ||
                Regex.IsMatch(title, @"\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b", RegexOptions.IgnoreCase))
            {
                double c = 0.5;
                if (Regex.IsMatch(title, @"Meet|Presenting|Share screen|Meeting", RegexOptions.IgnoreCase)) c += 0.2;
                if (Regex.IsMatch(title, @"\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b", RegexOptions.IgnoreCase)) c += 0.25;
                var phase = InferPhase(title, "meet");
                var mt = ExtractTitle(title, "Google Meet", new[] { "Meet", "Meeting", "Presenting", "Share screen" });
                return (App.Meet, Math.Min(1.0, c), phase, mt);
            }

            return (App.Unknown, 0, Phase.Unknown, null);
        }

        private static Phase InferPhase(string title, string app)
        {
            if (Regex.IsMatch(title, @"Presenting|Share screen|Sharing", RegexOptions.IgnoreCase)) return Phase.Presenting;
            if (Regex.IsMatch(title, @"Waiting Room|Lobby|Join|Preview|Ready to join", RegexOptions.IgnoreCase)) return Phase.Prejoin;
            if (Regex.IsMatch(title, @"Meeting|In meeting|Call|Webinar|Breakout|Live captions", RegexOptions.IgnoreCase)) return Phase.InCall;
            return Phase.Unknown;
        }

        private static string? ExtractTitle(string baseTitle, string appMarker, string[] generic)
        {
            string t = baseTitle;
            t = Regex.Replace(t, $@"\s*[—\-]\s*{Regex.Escape(appMarker)}\s*$", "", RegexOptions.IgnoreCase);
            t = Regex.Replace(t, $"^\\s*{Regex.Escape(appMarker)}\\s*[—\\-:]+\\s*", "", RegexOptions.IgnoreCase);
            foreach (var g in generic)
                t = Regex.Replace(t, $@"\b{Regex.Escape(g)}\b", "", RegexOptions.IgnoreCase);
            t = Regex.Replace(t, "\\s{2,}", " ").Trim();
            if (string.Equals(t, appMarker, StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(t)) return null;
            return t;
        }

        public void Dispose() => Stop();
    }
}
