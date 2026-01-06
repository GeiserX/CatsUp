// platform/macos/TrayApp.swift
// CatsUp - Intelligent Meeting Assistant
// Menu bar app with elegant controls and status display.

import SwiftUI
import UserNotifications
import Carbon.HIToolbox

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
    private var hotKeyMonitor: Any?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Request notification permissions
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        
        // Hide dock icon (menu bar only)
        NSApp.setActivationPolicy(.accessory)
        
        // Register global hotkey (Ctrl+Option+A) for quick ask
        registerGlobalHotkey()
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        if let monitor = hotKeyMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }
    
    private func registerGlobalHotkey() {
        // Ctrl+Option+A to open quick ask panel
        hotKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
            // Check for Ctrl+Option+A (keyCode 0 is 'A')
            if event.modifierFlags.contains([.control, .option]) && event.keyCode == 0 {
                DispatchQueue.main.async {
                    QuickAskPanel.shared.show()
                }
            }
        }
    }
}

// MARK: - Menu Bar Label

struct MenuBarLabel: View {
    @EnvironmentObject var coordinator: MeetingCoordinator
    
    var body: some View {
        HStack(spacing: 4) {
            CatIcon(state: coordinator.state)
                .frame(width: 18, height: 18)
            
            if coordinator.isRecording {
                Text(formatTime(coordinator.elapsedTime))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Cat Icon (Menu Bar)

struct CatIcon: View {
    let state: MeetingCoordinator.MeetingState
    
    private var iconColor: Color {
        switch state {
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
    
    private var arrowColor: Color {
        switch state {
        case .recording:
            return Color(red: 0.95, green: 0.3, blue: 0.3)
        case .detecting, .meetingDetected:
            return Color(red: 1.0, green: 0.6, blue: 0.2)
        default:
            return Color(hex: "7C3AED")
        }
    }
    
    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Elegant cat silhouette with arrow tail
                CatWithArrowShape()
                    .fill(iconColor)
                
                // Arrow highlight when active
                if case .recording = state {
                    ArrowTailShape()
                        .fill(arrowColor)
                        .opacity(0.9)
                }
            }
        }
    }
}

// Elegant cat head with arrow tail
struct CatWithArrowShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        
        // Elegant cat head - oval
        let headCenterX = w * 0.38
        let headCenterY = h * 0.55
        let headRadiusX = w * 0.30
        let headRadiusY = w * 0.26
        
        path.addEllipse(in: CGRect(
            x: headCenterX - headRadiusX,
            y: headCenterY - headRadiusY,
            width: headRadiusX * 2,
            height: headRadiusY * 2
        ))
        
        // Left ear - elegant curved
        path.move(to: CGPoint(x: w * 0.14, y: h * 0.48))
        path.addQuadCurve(
            to: CGPoint(x: w * 0.10, y: h * 0.12),
            control: CGPoint(x: w * 0.04, y: h * 0.32)
        )
        path.addQuadCurve(
            to: CGPoint(x: w * 0.30, y: h * 0.40),
            control: CGPoint(x: w * 0.22, y: h * 0.16)
        )
        path.closeSubpath()
        
        // Right ear - elegant curved
        path.move(to: CGPoint(x: w * 0.62, y: h * 0.48))
        path.addQuadCurve(
            to: CGPoint(x: w * 0.66, y: h * 0.12),
            control: CGPoint(x: w * 0.72, y: h * 0.32)
        )
        path.addQuadCurve(
            to: CGPoint(x: w * 0.46, y: h * 0.40),
            control: CGPoint(x: w * 0.54, y: h * 0.16)
        )
        path.closeSubpath()
        
        // Arrow tail - curving from body, ending in arrow UP
        // Tail stem
        path.move(to: CGPoint(x: w * 0.62, y: h * 0.68))
        path.addQuadCurve(
            to: CGPoint(x: w * 0.80, y: h * 0.45),
            control: CGPoint(x: w * 0.76, y: h * 0.60)
        )
        path.addLine(to: CGPoint(x: w * 0.80, y: h * 0.32))
        
        // Arrow head pointing UP
        path.addLine(to: CGPoint(x: w * 0.70, y: h * 0.32))
        path.addLine(to: CGPoint(x: w * 0.84, y: h * 0.10))
        path.addLine(to: CGPoint(x: w * 0.98, y: h * 0.32))
        path.addLine(to: CGPoint(x: w * 0.88, y: h * 0.32))
        
        // Back down the tail
        path.addLine(to: CGPoint(x: w * 0.88, y: h * 0.45))
        path.addQuadCurve(
            to: CGPoint(x: w * 0.70, y: h * 0.70),
            control: CGPoint(x: w * 0.84, y: h * 0.58)
        )
        path.closeSubpath()
        
        return path
    }
}

// Just the arrow portion for highlighting
struct ArrowTailShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        
        // Arrow head
        path.move(to: CGPoint(x: w * 0.70, y: h * 0.32))
        path.addLine(to: CGPoint(x: w * 0.84, y: h * 0.10))
        path.addLine(to: CGPoint(x: w * 0.98, y: h * 0.32))
        path.addLine(to: CGPoint(x: w * 0.88, y: h * 0.32))
        path.addLine(to: CGPoint(x: w * 0.88, y: h * 0.44))
        path.addLine(to: CGPoint(x: w * 0.80, y: h * 0.44))
        path.addLine(to: CGPoint(x: w * 0.80, y: h * 0.32))
        path.closeSubpath()
        
        return path
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
                openSettings()
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
    
    private func openSettings() {
        SettingsWindowController.shared.show()
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

// MARK: - Quick Ask Panel (Spotlight-style input)

@MainActor
final class QuickAskPanel {
    static let shared = QuickAskPanel()
    
    private var window: NSWindow?
    private var hostingView: NSHostingView<QuickAskView>?
    
    func show() {
        // Don't show if not recording
        guard MeetingCoordinator.shared.isRecording else {
            // Show notification that no meeting is active
            let content = UNMutableNotificationContent()
            content.title = "No Active Meeting"
            content.body = "Start recording a meeting first to ask questions."
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request)
            return
        }
        
        if let window = window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        
        let view = QuickAskView { [weak self] in
            self?.hide()
        }
        let hosting = NSHostingView(rootView: view)
        hostingView = hosting
        
        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 600, height: 80),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        window.contentView = hosting
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isMovableByWindowBackground = true
        
        // Center on screen
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let x = screenFrame.midX - 300
            let y = screenFrame.midY + 100
            window.setFrameOrigin(NSPoint(x: x, y: y))
        }
        
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        self.window = window
    }
    
    func hide() {
        window?.close()
        window = nil
        hostingView = nil
    }
}

struct QuickAskView: View {
    @ObservedObject var coordinator = MeetingCoordinator.shared
    @State private var question = ""
    @FocusState private var isFocused: Bool
    let onDismiss: () -> Void
    
    private let accentGradient = LinearGradient(
        colors: [Color(hex: "6366F1"), Color(hex: "8B5CF6")],
        startPoint: .leading,
        endPoint: .trailing
    )
    
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 20))
                    .foregroundStyle(accentGradient)
                
                TextField("Ask anything about the meeting...", text: $question)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .focused($isFocused)
                    .onSubmit {
                        submitQuestion()
                    }
                    .onExitCommand {
                        onDismiss()
                    }
                
                if coordinator.isAIResponding {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(Color(hex: "8B5CF6"))
                } else {
                    Button {
                        submitQuestion()
                    } label: {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(accentGradient)
                    }
                    .buttonStyle(.plain)
                    .disabled(question.isEmpty)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            
            // Show response if available
            if !coordinator.lastAIResponse.isEmpty {
                Divider()
                    .background(Color.white.opacity(0.1))
                
                ScrollView {
                    Text(coordinator.lastAIResponse)
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                .frame(maxHeight: 200)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(hex: "1A1B26").opacity(0.98))
                .shadow(color: .black.opacity(0.5), radius: 30, y: 10)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .onAppear {
            isFocused = true
        }
    }
    
    private func submitQuestion() {
        guard !question.isEmpty else { return }
        coordinator.askQuestion(question)
        question = ""
    }
}

// MARK: - Settings Window Controller

@MainActor
final class SettingsWindowController {
    static let shared = SettingsWindowController()
    
    private var window: NSWindow?
    
    func show() {
        if let window = window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        
        let settingsView = CatsUpSettingsView()
        let hostingView = NSHostingView(rootView: settingsView)
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 540, height: 480),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        
        window.contentView = hostingView
        window.title = "CatsUp Settings"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(Color(hex: "1A1B26"))
        window.isReleasedWhenClosed = false
        window.center()
        
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        self.window = window
    }
}
