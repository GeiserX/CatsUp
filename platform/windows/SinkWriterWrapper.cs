using System;
using System.Threading.Tasks;

namespace MeetingAssistant.Windows
{
    public class SinkWriterWrapper
    {
        public Task InitializeAsync(string outputPath, int width, int height, int fps, int sampleRate, int channels)
        {
            Console.WriteLine($"[Stub] Initializing Writer: {outputPath} {width}x{height} @ {fps}fps");
            return Task.CompletedTask;
        }

        public void WriteVideoFrame(SharpDX.Direct3D11.Texture2D texture, long qpc)
        {
            // Stub
        }

        public void WriteAudioSamples(float[] samples, long qpc, int streamIndex)
        {
            // Stub
        }

        public void FinalizeFile()
        {
            Console.WriteLine("[Stub] Finalizing File");
        }
    }
}
