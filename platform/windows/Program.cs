
using System;
using MeetingAssistant.Windows;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        var app = new TrayApp();
        app.Run();
    }
}
