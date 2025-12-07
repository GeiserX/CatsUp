# CatsUp 🐱

**CatsUp** is a stealthy, cross-platform meeting assistant designed to run locally on your machine. It detects when you join a meeting, records the session, and uses AI to generate summaries and answer questions about the discussion.

## ✨ Features

- **Stealth Mode**: unobtrusive system tray application.
- **Cross-Platform**: Runs on Windows, macOS, and Linux.
- **Meeting Detection**: Automatically detects when you are in a meeting (Zoom, Teams, etc.).
- **Smart Recording**: Captures audio (system + mic) and screen context.
- **AI-Powered**: Local AI (Whisper, LLMs) for transcription and summarization.
- **Private**: 100% local processing data never leaves your device unless you configure cloud backends.

## 🏗 Architecture

CatsUp is built with a decoupled architecture to ensure cross-platform compatibility:

- **Core UI**: A shared React + TypeScript + Vite application.
- **Platform Layer**:
  - **Windows**: .NET 6 (WPF/WinForms) using WASAPI and Media Foundation.
  - **macOS**: Swift (SwiftUI) using AVFoundation and ScreenCaptureKit.
  - **Linux**: Python using Xlib/EWMH and FFmpeg.
- **AI Backend**: Modular backend supports local inference (Faster-Whisper, Llama.cpp) or cloud APIs.

## 🚀 Getting Started

### Prerequisites

- **Windows**: .NET 6 SDK
- **macOS**: Xcode 15+
- **Linux**: Python 3.10+, FFmpeg, Xlib
- **UI**: Node.js 18+

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/CatsUp.git
   cd CatsUp
   ```

2. **Build the UI**:
   ```bash
   cd ui
   npm install
   npm run build
   ```

3. **Run Platform Client**:

   **Windows**:
   ```bash
   cd platform/windows
   dotnet run
   ```

   **macOS**:
   ```bash
   cd platform/macos
   swift run
   ```

   **Linux**:
   ```bash
   cd platform/linux
   python main.py
   ```

## 🛠 Building for Release

The project includes GitHub Actions workflows for automated cross-platform builds.

- **Windows**: `dotnet publish -c Release`
- **macOS**: `swift build -c release`
- **Linux**: Packaged via PyInstaller (coming soon).

## 🤝 Contributing

Contributions are welcome! Please check out the `development` branch and read our contributing guidelines.

## 📄 License

MIT License
