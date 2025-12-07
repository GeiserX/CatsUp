// windows/NotificationService.cs
// Desktop toast notifications with action buttons ("Start Recording", "Dismiss").
// References: App notifications quickstart for desktop. 【1】

using Microsoft.Toolkit.Uwp.Notifications;
using System;
using System.Collections.Generic;
using Windows.UI.Notifications;

namespace MeetingAssistant.Windows
{
    public enum NotificationAction { Start, Dismiss }

    public sealed class NotificationService
    {
        public event Action<NotificationAction, Dictionary<string, string>>? OnAction;

        public void EnsureChannel()
        {
            // For WPF/WinForms, ensure AUMID/Shortcut registered once per app.
            // See Windows App SDK/Win32 toast docs for setup steps. 【1】
        }

        public void ShowDetection(string title, string body, Dictionary<string, string> data)
        {
            var toast = new ToastContentBuilder()
                .AddText(title)
                .AddText(body)
                .AddArgument("type", "meeting")
                .AddArgument("hwnd", data.TryGetValue("hwnd", out var v) ? v : "")
                .AddButton(new ToastButton().SetContent("Start Recording").AddArgument("action", "start").SetBackgroundActivation())
                .AddButton(new ToastButtonDismiss("Dismiss"))
                .GetToastContent();

            var notif = new ToastNotification(toast.GetXml());
            ToastNotificationManagerCompat.OnActivated += args =>
            {
                var query = args.Argument; // e.g., action=start&hwnd=...
                var parsed = System.Web.HttpUtility.ParseQueryString(query);
                var action = parsed.Get("action") == "start" ? NotificationAction.Start : NotificationAction.Dismiss;
                var payload = new Dictionary<string, string>();
                foreach (var k in new[] { "hwnd", "type" })
                    if (parsed.Get(k) != null) payload[k] = parsed.Get(k)!;
                OnAction?.Invoke(action, payload);
            };

            ToastNotificationManagerCompat.CreateToastNotifier().Show(notif);
        }
    }
}
