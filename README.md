# CatsUp 🐱

**CatsUp** is a stealthy, cross-platform meeting assistant designed to run locally on your machine. It detects when you join a meeting, records the session, transcribes in real-time, and uses AI to generate summaries and answer questions about the discussion.

## ✨ Features

- **Stealth Mode**: Unobtrusive system tray/menu bar application
- **Cross-Platform**: Runs on Windows, macOS, and Linux
- **Meeting Detection**: Automatically detects Teams, Zoom, Slack, Google Meet
- **Smart Recording**: Captures video (window), system audio, and microphone
- **Real-Time Transcription**: Live speech-to-text via Deepgram streaming
- **Trigger Word Detection**: AI assistant activates when your name is spoken
- **AI-Powered Responses**: Contextual answers using OpenAI, Anthropic, or local Ollama
- **Live Mini Window**: Floating overlay with transcript, AI responses, quick actions
- **Private Options**: Use cloud APIs or 100% local processing with Ollama

## 🎯 Quick Start (macOS)

1. **Build**: Open `platform/macos/CatsUp.xcodeproj` in Xcode, build and run
2. **Configure**: Click menu bar icon → Settings → Add API keys:
   - Deepgram key for transcription
   - OpenAI/Anthropic key for AI responses
3. **Set Trigger Word**: Add your name (e.g., "Sergio") in Trigger Words tab
4. **Start**: Click "Start Detection" in menu bar dropdown
5. **Join Meeting**: CatsUp auto-detects and starts recording
6. **Get AI Help**: When someone says your name, AI generates a contextual response!

## 🏗 Architecture

CatsUp is built with a decoupled architecture to ensure cross-platform compatibility:

- **Core UI**: A shared React + TypeScript + Vite application
- **Platform Layer**:
  - **Windows**: .NET 6 (WPF/WinForms) using WASAPI and Media Foundation
  - **macOS**: Swift (SwiftUI) using AVFoundation and ScreenCaptureKit
  - **Linux**: Python using Xlib/EWMH and FFmpeg
- **AI Backend**: Modular backend supports:
  - Cloud: Deepgram (STT), OpenAI, Anthropic
  - Local: Whisper.cpp, Faster-Whisper, Ollama

## 🚀 Getting Started

### Prerequisites

- **Windows**: .NET 6 SDK
- **macOS**: Xcode 15+
- **Linux**: Python 3.10+, FFmpeg, Xlib
- **UI**: Node.js 18+

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/GeiserX/CatsUp.git
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

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.
