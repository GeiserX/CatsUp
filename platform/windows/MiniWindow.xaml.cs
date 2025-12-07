// windows/MiniWindow.xaml.cs
using System.Windows;

namespace MeetingAssistant.Windows
{
    public partial class MiniWindow : Window
    {
        private readonly AppCoordinator _app = AppCoordinator.Instance;

        public MiniWindow()
        {
            InitializeComponent();
            DataContext = new MiniVM(_app);
        }

        private void Close_Click(object sender, RoutedEventArgs e) => Close();
        private void Record_Click(object sender, RoutedEventArgs e)
        {
            if (_app.IsRecording) _app.StopRecording();
            else _app.StartDetection();
        }
        private void Bookmark_Click(object sender, RoutedEventArgs e) { /* TODO: emit bookmark */ }
        private void Summarize_Click(object sender, RoutedEventArgs e) { ((MiniVM)DataContext!).LastSummary = "Since start: discussed timelines, blockers, and action items."; }
    }

    public sealed class MiniVM : System.ComponentModel.INotifyPropertyChanged
    {
        private readonly AppCoordinator _app;
        private string _elapsed = "00:00:00";
        private string _lastSummary = "No summary yet.";
        public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;

        public MiniVM(AppCoordinator app)
        {
            _app = app;
            var timer = new System.Windows.Threading.DispatcherTimer { Interval = System.TimeSpan.FromSeconds(1) };
            timer.Tick += (_, __) =>
            {
                var t = (int)(System.DateTime.UtcNow - System.DateTime.UnixEpoch).TotalSeconds % 36000;
                var h = t / 3600; var m = (t % 3600) / 60; var s = t % 60;
                Elapsed = $"{h:00}:{m:00}:{s:00}";
                OnChanged(nameof(StatusText));
                OnChanged(nameof(IsRecording));
                OnChanged(nameof(RecordButtonText));
            };
            timer.Start();
        }

        public bool IsRecording => _app.IsRecording;
        public string Elapsed { get => _elapsed; set { _elapsed = value; OnChanged(nameof(Elapsed)); OnChanged(nameof(StatusText)); } }
        public string StatusText => IsRecording ? $"Recording • {Elapsed}" : "Idle";
        public string RecordButtonText => IsRecording ? "Stop" : "Start detection";

        public string LastSummary { get => _lastSummary; set { _lastSummary = value; OnChanged(nameof(LastSummary)); } }

        private void OnChanged(string n) => PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(n));
    }
}
