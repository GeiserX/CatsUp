# CatsUp macOS Build Guide

## Prerequisites

1. **Xcode 15+** - Required for building SwiftUI menu bar apps
2. **macOS 13+** (Ventura or later)
3. **API Keys** (for full functionality):
   - Deepgram API Key (for real-time transcription)
   - OpenAI or Anthropic API Key (for AI responses)

## Building

### Option 1: Xcode (Recommended)

```bash
open CatsUp.xcodeproj
```

Then:
1. Select your development team in Signing & Capabilities
2. Build and run (⌘R)

### Option 2: Command Line

```bash
xcodebuild -project CatsUp.xcodeproj -scheme CatsUp -configuration Release build
```

## Required Permissions

On first launch, CatsUp will request:
- **Microphone Access** - For recording your voice and real-time transcription
- **Screen Recording** - For capturing meeting windows
- **Notifications** - For trigger word alerts

Grant all permissions in System Settings > Privacy & Security.

## Configuration

1. Click the CatsUp icon in the menu bar
2. Open Settings (gear icon)
3. Configure:
   - **General**: Your name (for trigger word detection), auto-start preferences
   - **Trigger Words**: Words that activate AI assistance (e.g., your name "Sergio")
   - **AI Services**: API keys for Deepgram (transcription) and OpenAI/Anthropic (responses)
   - **Recording**: Output directory and quality settings

## Usage

1. **Start Detection** - Automatically monitors for Teams, Zoom, Meet, Slack meetings
2. **Auto-Record** - Recording starts when a meeting is detected (configurable)
3. **Live Transcription** - Real-time speech-to-text via Deepgram
4. **Trigger Word** - When your name is spoken, AI generates a contextual response
5. **Ask Questions** - Use the mini window to ask about the meeting

## Files Structure

```
platform/macos/
├── TrayApp.swift              # Main menu bar app entry point
├── MeetingCoordinator.swift   # Central coordinator for all functionality
├── TranscriptionStreamService.swift  # Real-time Deepgram transcription
├── ResponseEngine.swift       # AI response generation (OpenAI/Anthropic/Ollama)
├── MiniWindowView.swift       # Floating overlay with transcript & controls
├── SettingsView.swift         # Configuration UI
├── MeetingDetectorAX.swift    # Meeting detection via window heuristics
├── RecorderSK.swift           # ScreenCaptureKit video/audio recording
├── AudioCaptureSK.swift       # Audio capture for transcription
├── VideoCaptureSK.swift       # Video capture
├── DetectionNotification.swift # User notifications
└── CatsUp.xcodeproj/          # Xcode project
```

## Troubleshooting

### "No meetings detected"
- Ensure Teams/Zoom/Slack/Meet is running with an active meeting
- Check that the meeting window title contains expected keywords

### "Transcription not working"
- Verify Deepgram API key is set in Settings
- Check microphone permissions in System Settings

### "AI not responding"
- Verify OpenAI/Anthropic API key is set
- Check network connectivity
- For Ollama, ensure it's running locally on port 11434


