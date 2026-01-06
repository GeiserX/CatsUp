// platform/macos/MiniWindowView.swift
// Modern, elegant floating window for CatsUp meeting assistant.
// Features live transcript, AI responses, and quick controls.

import SwiftUI

// MARK: - Main Mini Window View

struct MiniWindowView: View {
    @ObservedObject var coordinator = MeetingCoordinator.shared
    @State private var questionText = ""
    @State private var showTranscript = true
    @State private var isHovered = false
    
    private let accentGradient = LinearGradient(
        colors: [Color(hex: "6366F1"), Color(hex: "8B5CF6")],
        startPoint: .leading,
        endPoint: .trailing
    )
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView
            
            Divider()
                .background(Color.white.opacity(0.1))
            
            // Content
            ScrollView {
                VStack(spacing: 16) {
                    if coordinator.isRecording {
                        if showTranscript {
                            transcriptSection
                        }
                        
                        if !coordinator.lastAIResponse.isEmpty || coordinator.isAIResponding {
                            aiResponseSection
                        }
                        
                        quickActionsSection
                    } else {
                        idleStateView
                    }
                }
                .padding(16)
            }
            
            // Footer with controls
            if coordinator.isRecording {
                footerControls
            }
        }
        .frame(minWidth: 380, idealWidth: 420, maxWidth: 500)
        .frame(minHeight: 280, idealHeight: 400, maxHeight: 600)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(hex: "1A1B26"))
                .shadow(color: .black.opacity(0.4), radius: 20, y: 10)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
    }
    
    // MARK: - Header
    
    private var headerView: some View {
        HStack(spacing: 12) {
            // Status indicator
            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
                    .shadow(color: statusColor.opacity(0.6), radius: 4)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusText)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                    
                    if coordinator.isRecording {
                        Text(formatElapsed(coordinator.elapsedTime))
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(Color(hex: "A1A1AA"))
                    }
                }
            }
            
            Spacer()
            
            // Trigger count badge
            if coordinator.triggerEventCount > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 10))
                    Text("\(coordinator.triggerEventCount)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(accentGradient)
                .foregroundColor(.white)
                .clipShape(Capsule())
            }
            
            // Toggle transcript button
            Button {
                withAnimation(.spring(response: 0.3)) {
                    showTranscript.toggle()
                }
            } label: {
                Image(systemName: showTranscript ? "text.alignleft" : "text.alignleft")
                    .font(.system(size: 14))
                    .foregroundColor(showTranscript ? Color(hex: "6366F1") : Color(hex: "71717A"))
            }
            .buttonStyle(.plain)
            
            // Close button
            Button {
                NSApp.keyWindow?.close()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "71717A"))
                    .frame(width: 24, height: 24)
                    .background(Color.white.opacity(0.05))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(hex: "16171F"))
    }
    
    // MARK: - Transcript Section
    
    private var transcriptSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "waveform")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "6366F1"))
                Text("Live Transcript")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(Color(hex: "A1A1AA"))
                
                Spacer()
                
                if coordinator.isTranscribing {
                    PulsingDot()
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                // Main transcript
                Text(coordinator.liveTranscript.isEmpty ? "Listening..." : coordinator.liveTranscript)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(coordinator.liveTranscript.isEmpty ? Color(hex: "52525B") : .white)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                // Interim text
                if !coordinator.interimText.isEmpty {
                    Text(coordinator.interimText)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(Color(hex: "6366F1").opacity(0.7))
                        .italic()
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.03))
            .cornerRadius(10)
        }
    }
    
    // MARK: - AI Response Section
    
    private var aiResponseSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "sparkles")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "8B5CF6"))
                Text("AI Response")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(Color(hex: "A1A1AA"))
                
                Spacer()
                
                if coordinator.isAIResponding {
                    ProgressView()
                        .scaleEffect(0.6)
                        .tint(Color(hex: "8B5CF6"))
                }
            }
            
            Text(coordinator.lastAIResponse.isEmpty ? "Generating..." : coordinator.lastAIResponse)
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(coordinator.lastAIResponse.isEmpty ? Color(hex: "52525B") : .white)
                .lineSpacing(4)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: "8B5CF6").opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color(hex: "8B5CF6").opacity(0.2), lineWidth: 1)
                        )
                )
        }
    }
    
    // MARK: - Quick Actions
    
    private var quickActionsSection: some View {
        VStack(spacing: 12) {
            // Question input
            HStack(spacing: 8) {
                TextField("Ask about the meeting...", text: $questionText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.05))
                    .cornerRadius(8)
                    .onSubmit {
                        if !questionText.isEmpty {
                            coordinator.askQuestion(questionText)
                            questionText = ""
                        }
                    }
                
                Button {
                    if !questionText.isEmpty {
                        coordinator.askQuestion(questionText)
                        questionText = ""
                    }
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(accentGradient)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(questionText.isEmpty)
            }
            
            // Quick action buttons
            HStack(spacing: 8) {
                QuickActionButton(
                    icon: "text.alignleft",
                    text: "Summarize",
                    action: { coordinator.summarize() }
                )
                
                QuickActionButton(
                    icon: "bookmark",
                    text: "Bookmark",
                    action: { /* TODO: Add bookmark */ }
                )
                
                QuickActionButton(
                    icon: "list.bullet",
                    text: "Action Items",
                    action: { coordinator.askQuestion("What action items have been mentioned?") }
                )
            }
        }
    }
    
    // MARK: - Idle State
    
    private var idleStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(accentGradient)
            
            VStack(spacing: 8) {
                Text("Ready to Assist")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                
                Text("Start detection to automatically record\nand transcribe your meetings")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "71717A"))
                    .multilineTextAlignment(.center)
            }
            
            Button {
                coordinator.startDetection()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12))
                    Text("Start Detection")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(accentGradient)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 40)
    }
    
    // MARK: - Footer Controls
    
    private var footerControls: some View {
        HStack(spacing: 12) {
            // Stop button
            Button {
                coordinator.stopRecording()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 10))
                    Text("Stop")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color(hex: "EF4444"))
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            
            Spacer()
            
            // Meeting info
            if let meeting = coordinator.currentMeeting {
                HStack(spacing: 6) {
                    appIcon(for: meeting.app)
                        .font(.system(size: 12))
                    Text(meeting.title ?? meeting.app.capitalized)
                        .font(.system(size: 11, weight: .medium))
                        .lineLimit(1)
                }
                .foregroundColor(Color(hex: "A1A1AA"))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(hex: "16171F"))
    }
    
    // MARK: - Helpers
    
    private var statusColor: Color {
        switch coordinator.state {
        case .recording:
            return Color(hex: "EF4444")
        case .detecting, .meetingDetected:
            return Color(hex: "F59E0B")
        case .error:
            return Color(hex: "DC2626")
        default:
            return Color(hex: "71717A")
        }
    }
    
    private var statusText: String {
        switch coordinator.state {
        case .idle:
            return "Idle"
        case .detecting:
            return "Detecting..."
        case .meetingDetected(let app):
            return "\(app.capitalized) detected"
        case .recording:
            return "Recording"
        case .paused:
            return "Paused"
        case .stopping:
            return "Stopping..."
        case .error(let msg):
            return "Error: \(msg)"
        }
    }
    
    private func formatElapsed(_ time: TimeInterval) -> String {
        let hours = Int(time) / 3600
        let minutes = (Int(time) % 3600) / 60
        let seconds = Int(time) % 60
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
    
    private func appIcon(for app: String) -> some View {
        Group {
            switch app.lowercased() {
            case "teams":
                Image(systemName: "person.3.fill")
            case "zoom":
                Image(systemName: "video.fill")
            case "meet":
                Image(systemName: "video.circle.fill")
            case "slack":
                Image(systemName: "number.square.fill")
            default:
                Image(systemName: "circle.fill")
            }
        }
    }
}

// MARK: - Supporting Views

struct QuickActionButton: View {
    let icon: String
    let text: String
    let action: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                Text(text)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
            }
            .foregroundColor(isHovered ? .white : Color(hex: "A1A1AA"))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isHovered ? Color.white.opacity(0.1) : Color.white.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHovered = hovering
            }
        }
    }
}

struct PulsingDot: View {
    @State private var isAnimating = false
    
    var body: some View {
        Circle()
            .fill(Color(hex: "22C55E"))
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

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Window Controller

final class MiniWindowController {
    static let shared = MiniWindowController()
    
    private var window: NSWindow?
    
    func show() {
        if let window = window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        
        let hostingView = NSHostingView(rootView: MiniWindowView())
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 400),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        
        window.contentView = hostingView
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = .clear
        window.isMovableByWindowBackground = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        
        // Position in top-right corner
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let windowFrame = window.frame
            let x = screenFrame.maxX - windowFrame.width - 20
            let y = screenFrame.maxY - windowFrame.height - 20
            window.setFrameOrigin(NSPoint(x: x, y: y))
        }
        
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        self.window = window
    }
    
    func hide() {
        window?.close()
    }
}


