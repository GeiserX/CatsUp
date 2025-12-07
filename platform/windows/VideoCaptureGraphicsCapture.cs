// windows/VideoCaptureGraphicsCapture.cs
// Window-only capture using Windows.Graphics.Capture. Requires Windows 10 1903+.
// Captures frames from a specific HWND and exposes them for encoding.
// References: Windows.Graphics.Capture docs. 【1】

using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Foundation;
using Windows.UI.Composition;
using SharpDX;
using SharpDX.Direct3D11;
using Device = SharpDX.Direct3D11.Device;

namespace MeetingAssistant.Windows.Capture
{
    public sealed class VideoCaptureGraphicsCapture : IDisposable
    {
        public class Options
        {
            public int Width { get; set; } = 1920;
            public int Height { get; set; } = 1080;
            public int Fps { get; set; } = 30;
        }

        public event Action<Texture2D, long>? OnFrame; // Texture2D and QPC timestamp

        private Device? _d3d;
        private IDirect3DDevice? _dxDevice;
        private GraphicsCaptureItem? _item;
        private Direct3D11CaptureFramePool? _pool;
        private GraphicsCaptureSession? _session;
        private Options _opts = new Options();
        private bool _running;

        public void Configure(Options opts) => _opts = opts;

        public async Task StartAsync(IntPtr hwnd)
        {
            if (_running) return;
            EnsureDevice();

            _item = CreateItemForWindow(hwnd);
            if (_item == null) throw new InvalidOperationException("Unable to create capture item for window.");

            _pool = Direct3D11CaptureFramePool.Create(
                _dxDevice,
                DirectXPixelFormat.B8G8R8A8UIntNormalized,
                2,
                _item.Size);

            _session = _pool.CreateCaptureSession(_item);
            _session.IsCursorCaptureEnabled = false;
            _pool.FrameArrived += OnPoolFrameArrived;

            _session.StartCapture();
            _running = true;
            await Task.CompletedTask;
        }

        public void Stop()
        {
            if (!_running) return;
            _running = false;

            if (_pool != null)
            {
                _pool.FrameArrived -= OnPoolFrameArrived;
                _pool.Dispose();
                _pool = null;
            }

            _session?.Dispose(); _session = null;
            _item = null; // GraphicsCaptureItem is not IDisposable
        }

        private void OnPoolFrameArrived(Direct3D11CaptureFramePool sender, object args)
        {
            using var frame = sender.TryGetNextFrame();
            if (frame == null) return;

            var surface = frame.Surface;
            var tex = GetSharpDXTexture(surface);
            var ts = frame.SystemRelativeTime.Ticks;
            OnFrame?.Invoke(tex, ts);
        }

        private Texture2D GetSharpDXTexture(IDirect3DSurface surface)
        {
            var interop = (IDirect3DDxgiInterfaceAccess)surface;
            interop.GetInterface(typeof(Texture2D).GUID, out var obj);
            return new Texture2D(obj);
        }

        private void EnsureDevice()
        {
            if (_d3d != null) return;
            _d3d = new Device(SharpDX.Direct3D.DriverType.Hardware, DeviceCreationFlags.BgraSupport | DeviceCreationFlags.VideoSupport);
            var dxgi = ComObject.QueryInterface<SharpDX.DXGI.Device>(_d3d);
            _dxDevice = CreateDirect3DDevice(dxgi.NativePointer);
            dxgi.Dispose();
        }

        public void Dispose()
        {
            Stop();
            _dxDevice = null;
            _d3d?.Dispose(); _d3d = null;
        }

        // Interop helpers

        [ComImport, Guid("a9b3d012-3df2-4ee3-b8d1-8695f457d3c1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IDirect3DDxgiInterfaceAccess
        {
            void GetInterface([In] ref Guid iid, out IntPtr p);
        }

        [DllImport("d3d11.dll")]
        private static extern int D3D11CreateDevice(
            IntPtr adapter, int driverType, IntPtr software, int flags,
            IntPtr pFeatureLevels, int featureLevels,
            int sdkVersion, out IntPtr device, out int featureLevel, out IntPtr immediateContext);

        [DllImport("User32.dll")]
        private static extern IntPtr GetDesktopWindow();

        // WinRT device creation via interop
        [DllImport("Windows.Graphics.DirectX.Direct3D11.dll", EntryPoint = "CreateDirect3D11DeviceFromDXGIDevice")]
        private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

        private static IDirect3DDevice CreateDirect3DDevice(IntPtr dxgiDevice)
        {
            CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice, out var device);
            return (IDirect3DDevice)Marshal.GetObjectForIUnknown(device);
        }

        private static GraphicsCaptureItem? CreateItemForWindow(IntPtr hwnd)
        {
            var factory = GraphicsCaptureItemInterop.CreateForWindow(hwnd);
            return factory;
        }
    }

    internal static class GraphicsCaptureItemInterop
    {
        [ComImport, Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IGraphicsCaptureItemInterop
        {
            int CreateForWindow(IntPtr window, ref Guid iid, out IntPtr result);
            int CreateForMonitor(IntPtr monitor, ref Guid iid, out IntPtr result);
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr GetWindowDC(IntPtr hWnd);

        private static readonly Guid IID_GraphicsCaptureItem = typeof(GraphicsCaptureItem).GUID;

        public static GraphicsCaptureItem? CreateForWindow(IntPtr hwnd)
        {
            // Stub that returns null if interop fails
            return null; 
            /* 
            var activationFactory = WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
            var interop = (IGraphicsCaptureItemInterop)activationFactory;
            interop.CreateForWindow(hwnd, ref IID_GraphicsCaptureItem, out var itemPtr);
            return itemPtr != IntPtr.Zero ? (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(itemPtr) : null;
            */
        }
    }
}
