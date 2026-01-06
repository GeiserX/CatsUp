// platform/macos/TrayApp.swift
// CatsUp - Intelligent Meeting Assistant
// Menu bar app with elegant controls and status display.

import SwiftUI
import UserNotifications

@main
struct CatsUpApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var coordinator = MeetingCoordinator.shared
    
    var body: some Scene {
        MenuBarExtra {
            MenuContent()
                .environmentObject(coordinator)
        } label: {
            MenuBarLabel()
                .environmentObject(coordinator)
        }
        .menuBarExtraStyle(.window)
        
        Settings {
            CatsUpSettingsView()
                .environmentObject(coordinator)
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Request notification permissions
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        
        // Hide dock icon (menu bar only)
        NSApp.setActivationPolicy(.accessory)
    }
}

// MARK: - Menu Bar Label

struct MenuBarLabel: View {
    @EnvironmentObject var coordinator: MeetingCoordinator
    
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: iconName)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(iconColor)
            
            if coordinator.isRecording {
                Text(formatTime(coordinator.elapsedTime))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }
    
    private var iconName: String {
        switch coordinator.state {
        case .recording:
            return "waveform.circle.fill"
        case .detecting, .meetingDetected:
            return "waveform.badge.magnifyingglass"
        case .error:
            return "exclamationmark.triangle.fill"
        default:
            return "waveform.circle"
        }
    }
    
    private var iconColor: Color {
        switch coordinator.state {
        case .recording:
            return .red
        case .detecting, .meetingDetected:
            return .orange
        case .error:
            return .yellow
        default:
            return .primary
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Menu Content

struct MenuContent: View {
    @EnvironmentObject var coordinator: MeetingCoordinator
    @State private var showQuickAsk = false
    @State private var quickQuestion = ""
    
    private let accentGradient = LinearGradient(
        colors: [Color(hex: "6366F1"), Color(hex: "8B5CF6")],
        startPoint: .leading,
        endPoint: .trailing
    )
    
    var body: some View {
        VStack(spacing: 0) {
            // Header with status
            headerSection
            
            Divider()
                .padding(.vertical, 8)
            
            // Main content
            if coordinator.isRecording {
                recordingContent
            } else {
                idleContent
            }
            
            Divider()
                .padding(.vertical, 8)
            
            // Footer actions
            footerActions
        }
        .padding(16)
        .frame(width: 320)
    }
    
    // MARK: - Header
    
    private var headerSection: some View {
        HStack(spacing: 12) {
            // Status indicator
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.2))
                    .frame(width: 36, height: 36)
                
                Circle()
                    .fill(statusColor)
                    .frame(width: 12, height: 12)
                    .shadow(color: statusColor.opacity(0.5), radius: 4)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(statusTitle)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                
                Text(statusSubtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            if coordinator.isRecording {
                Text(formatTime(coordinator.elapsedTime))
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(statusColor.opacity(0.15))
                    .foregroundColor(statusColor)
                    .clipShape(Capsule())
            }
        }
    }
    
    // MARK: - Recording Content
    
    private var recordingContent: some View {
        VStack(spacing: 12) {
            // Live transcript preview
            if !coordinator.liveTranscript.isEmpty || !coordinator.interimText.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: "waveform")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                        Text("Live Transcript")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                        Spacer()
                        if coordinator.isTranscribing {
                            PulsingDot()
                        }
                    }
                    
                    Text(previewTranscript)
                        .font(.system(size: 12))
                        .lineLimit(3)
                        .foregroundStyle(.primary)
                }
                .padding(12)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            
            // AI Response preview
            if !coordinator.lastAIResponse.isEmpty || coordinator.isAIResponding {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: "sparkles")
                            .font(.system(size: 10))
                            .foregroundColor(Color(hex: "8B5CF6"))
                        Text("AI Response")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                        Spacer()
                        if coordinator.isAIResponding {
                            ProgressView()
                                .scaleEffect(0.5)
                        }
                    }
                    
                    Text(coordinator.lastAIResponse.isEmpty ? "Generating..." : coordinator.lastAIResponse)
                        .font(.system(size: 12))
                        .lineLimit(4)
                        .foregroundStyle(coordinator.lastAIResponse.isEmpty ? .secondary : .primary)
                }
                .padding(12)
                .background(Color(hex: "8B5CF6").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            
            // Quick actions
            HStack(spacing: 8) {
                QuickMenuButton(icon: "text.alignleft", label: "Summary") {
                    coordinator.summarize()
                }
                
                QuickMenuButton(icon: "questionmark.circle", label: "Ask") {
                    showQuickAsk = true
                }
                
                QuickMenuButton(icon: "rectangle.on.rectangle", label: "Window") {
                    MiniWindowController.shared.show()
                }
            }
            
            // Quick ask input
            if showQuickAsk {
                HStack(spacing: 8) {
                    TextField("Ask about the meeting...", text: $quickQuestion)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                        .padding(10)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onSubmit {
                            if !quickQuestion.isEmpty {
                                coordinator.askQuestion(quickQuestion)
                                quickQuestion = ""
                                showQuickAsk = false
                            }
                        }
                    
                    Button {
                        if !quickQuestion.isEmpty {
                            coordinator.askQuestion(quickQuestion)
                            quickQuestion = ""
                            showQuickAsk = false
                        }
                    } label: {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(accentGradient)
                    }
                    .buttonStyle(.plain)
                }
            }
            
            // Stop button
            Button {
                coordinator.stopRecording()
            } label: {
                HStack {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 10))
                    Text("Stop Recording")
                        .font(.system(size: 13, weight: .medium))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.red.opacity(0.15))
                .foregroundColor(.red)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
    }
    
    // MARK: - Idle Content
    
    private var idleContent: some View {
        VStack(spacing: 12) {
            // Start detection button
            Button {
                coordinator.startDetection()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12))
                    Text("Start Detection")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(accentGradient)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
            
            // Config summary
            VStack(alignment: .leading, spacing: 8) {
                ConfigRow(icon: "person.fill", label: "Trigger Word", value: coordinator.config.triggerWords.first ?? "Not set")
                ConfigRow(icon: "play.circle.fill", label: "Auto-record", value: coordinator.config.autoStartRecording ? "On" : "Off")
                ConfigRow(icon: "waveform", label: "Transcription", value: coordinator.config.deepgramApiKey.isEmpty ? "Not configured" : "Ready")
            }
            .padding(12)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
    
    // MARK: - Footer
    
    private var footerActions: some View {
        HStack {
            Button {
                MiniWindowController.shared.show()
            } label: {
                Label("Open Window", systemImage: "rectangle.on.rectangle")
                    .font(.system(size: 12))
            }
            .buttonStyle(.plain)
            
            Spacer()
            
            Button {
                NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            
            Button {
                NSApplication.shared.terminate(nil)
            } label: {
                Image(systemName: "power")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
    }
    
    // MARK: - Helpers
    
    private var statusColor: Color {
        switch coordinator.state {
        case .recording:
            return .red
        case .detecting, .meetingDetected:
            return .orange
        case .error:
            return .yellow
        default:
            return .gray
        }
    }
    
    private var statusTitle: String {
        switch coordinator.state {
        case .idle:
            return "Ready"
        case .detecting:
            return "Detecting..."
        case .meetingDetected(let app):
            return "\(app.capitalized) Detected"
        case .recording:
            return "Recording"
        case .paused:
            return "Paused"
        case .stopping:
            return "Stopping..."
        case .error:
            return "Error"
        }
    }
    
    private var statusSubtitle: String {
        switch coordinator.state {
        case .idle:
            return "Waiting for meetings"
        case .detecting:
            return "Looking for active meetings..."
        case .meetingDetected:
            return coordinator.config.autoStartRecording ? "Starting soon..." : "Click to record"
        case .recording:
            return coordinator.currentMeeting?.title ?? "In meeting"
        case .error(let msg):
            return msg
        default:
            return ""
        }
    }
    
    private var previewTranscript: String {
        let text = coordinator.interimText.isEmpty ? coordinator.liveTranscript : coordinator.liveTranscript + " " + coordinator.interimText
        return String(text.suffix(200))
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let hours = Int(time) / 3600
        let minutes = (Int(time) % 3600) / 60
        let seconds = Int(time) % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Supporting Views

struct QuickMenuButton: View {
    let icon: String
    let label: String
    let action: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                Text(label)
                    .font(.system(size: 10, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(isHovered ? Color.primary.opacity(0.1) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

struct ConfigRow: View {
    let icon: String
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .frame(width: 14)
            
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            
            Spacer()
            
            Text(value)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.primary)
        }
    }
}

// MARK: - Pulsing Dot (re-export for menu)

struct MenuPulsingDot: View {
    @State private var isAnimating = false
    
    var body: some View {
        Circle()
            .fill(Color.green)
            .frame(width: 6, height: 6)
            .scaleEffect(isAnimating ? 1.2 : 0.8)
            .opacity(isAnimating ? 0.8 : 1.0)
            .animation(
                Animation.easeInOut(duration: 0.8)
                    .repeatForever(autoreverses: true),
                value: isAnimating
            )
            .onAppear { isAnimating = true }
    }
}
