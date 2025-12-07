// windows/TrayApp.cs
// WPF entry with system tray icon and menu. Launches detection and toggles recording.

using System;
using System.Windows;
using System.Windows.Forms;
using Application = System.Windows.Application;

namespace MeetingAssistant.Windows
{
    public partial class TrayApp : Application
    {
        private NotifyIcon? _tray;
        private AppCoordinator _app = AppCoordinator.Instance;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            _tray = new NotifyIcon
            {
                Icon = System.Drawing.SystemIcons.Information,
                Visible = true,
                Text = "Meeting Assistant"
            };

            var menu = new ContextMenuStrip();
            var autoStart = new ToolStripMenuItem("Auto-start recordings") { Checked = true, CheckOnClick = true };
            autoStart.CheckedChanged += (s, a) => _app.AutoStart = autoStart.Checked;

            var autoStop = new ToolStripMenuItem("Auto-stop on meeting end") { Checked = true, CheckOnClick = true };
            autoStop.CheckedChanged += (s, a) => _app.AutoStop = autoStop.Checked;

            var startDetect = new ToolStripMenuItem("Start Detection");
            startDetect.Click += (s, a) => _app.StartDetection();

            var stopRec = new ToolStripMenuItem("Stop Recording");
            stopRec.Click += (s, a) => _app.StopRecording();

            var openMini = new ToolStripMenuItem("Open Mini Window");
            openMini.Click += (s, a) =>
            {
                var w = new MiniWindow();
                w.Show();
                w.Activate();
            };

            var quit = new ToolStripMenuItem("Quit");
            quit.Click += (s, a) => Shutdown();

            menu.Items.Add(autoStart);
            menu.Items.Add(autoStop);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(startDetect);
            menu.Items.Add(stopRec);
            menu.Items.Add(openMini);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(quit);

            _tray.ContextMenuStrip = menu;

            _app.Initialize(); // toast channel, permissions, etc.
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _tray?.Dispose();
            _app?.Dispose();
            base.OnExit(e);
        }
    }
}
