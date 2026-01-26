// platform/macos/MeetingNotificationPanel.swift
// Floating notification panel that appears when a meeting is detected

import SwiftUI
import AppKit

public class MeetingNotificationPanel {
    public static let shared = MeetingNotificationPanel()
    
    private var window: NSPanel?
    private var hostingView: NSHostingView<MeetingNotificationView>?
    private var autoDismissTimer: Timer?
    
    private init() {}
    
    private func logToFile(_ message: String) {
        let logFile = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Documents/catsup_panel.log")
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        if FileManager.default.fileExists(atPath: logFile.path) {
            if let handle = try? FileHandle(forWritingTo: logFile) {
                handle.seekToEndOfFile()
                handle.write(line.data(using: .utf8)!)
                handle.closeFile()
            }
        } else {
            try? line.write(to: logFile, atomically: true, encoding: .utf8)
        }
    }
    
    public func show(appName: String, meetingTitle: String?, onRecord: @escaping () -> Void, onDismiss: @escaping () -> Void) {
        logToFile("show() called - app=\(appName) title=\(meetingTitle ?? "nil")")
        NSLog("[CatsUp] MeetingNotificationPanel.show() called - app=%@ title=%@", appName, meetingTitle ?? "nil")
        
        // Dismiss any existing
        dismiss()
        
        let view = MeetingNotificationView(
            appName: appName,
            meetingTitle: meetingTitle,
            onRecord: { [weak self] in
                onRecord()
                self?.dismiss()
            },
            onDismiss: { [weak self] in
                onDismiss()
                self?.dismiss()
            }
        )
        
        let hostingView = NSHostingView(rootView: view)
        hostingView.frame = NSRect(x: 0, y: 0, width: 340, height: 120)
        self.hostingView = hostingView
        
        // Create floating panel
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 340, height: 120),
            styleMask: [.nonactivatingPanel, .titled, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.contentView = hostingView
        
        // Position at top center of main screen
        // Use screens.first for primary display (NSScreen.main can return unexpected results)
        let screen = NSScreen.screens.first ?? NSScreen.main
        if let screen = screen {
            let screenFrame = screen.frame
            let panelWidth: CGFloat = 340
            let x = screenFrame.origin.x + (screenFrame.width - panelWidth) / 2
            let y = screenFrame.origin.y + screenFrame.height - 160  // Near top
            panel.setFrameOrigin(NSPoint(x: x, y: y))
            logToFile("Screen frame: \(screenFrame), calculated position: (\(x), \(y))")
        }
        
        self.window = panel
        
        // Show with animation
        panel.alphaValue = 0
        panel.orderFrontRegardless()
        logToFile("Panel orderFrontRegardless at position: (\(panel.frame.origin.x), \(panel.frame.origin.y)) size: \(panel.frame.size)")
        NSLog("[CatsUp] Panel shown at position: (%.0f, %.0f)", panel.frame.origin.x, panel.frame.origin.y)
        
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.3
            panel.animator().alphaValue = 1
        }
        
        // Auto-dismiss after 15 seconds
        autoDismissTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: false) { [weak self] _ in
            self?.dismiss()
        }
    }
    
    public func dismiss() {
        autoDismissTimer?.invalidate()
        autoDismissTimer = nil
        
        guard let window = window else { return }
        
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.2
            window.animator().alphaValue = 0
        }, completionHandler: { [weak self] in
            window.orderOut(nil)
            self?.window = nil
            self?.hostingView = nil
        })
    }
}

struct MeetingNotificationView: View {
    let appName: String
    let meetingTitle: String?
    let onRecord: () -> Void
    let onDismiss: () -> Void
    
    var body: some View {
        HStack(spacing: 16) {
            // App icon
            VStack {
                Image(systemName: appIcon)
                    .font(.system(size: 32))
                    .foregroundStyle(.white)
            }
            .frame(width: 56, height: 56)
            .background(appColor.gradient)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            
            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text("Meeting Detected")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                
                Text(displayTitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                
                // Buttons
                HStack(spacing: 8) {
                    Button(action: onRecord) {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(.red)
                                .frame(width: 8, height: 8)
                            Text("Record")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.red)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    
                    Button(action: onDismiss) {
                        Text("Dismiss")
                            .font(.system(size: 12))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.secondary.opacity(0.2))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 4)
            }
            
            Spacer()
        }
        .padding(16)
        .frame(width: 340, height: 120)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(.white.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
    }
    
    private var appIcon: String {
        switch appName.lowercased() {
        case "teams", "microsoft teams": return "person.3.fill"
        case "zoom": return "video.fill"
        case "slack": return "number"
        default: return "phone.fill"
        }
    }
    
    private var appColor: Color {
        switch appName.lowercased() {
        case "teams", "microsoft teams": return .purple
        case "zoom": return .blue
        case "slack": return .green
        default: return .orange
        }
    }
    
    private var displayTitle: String {
        if let title = meetingTitle, !title.isEmpty {
            // Extract just the meeting name from full title
            let parts = title.components(separatedBy: "|")
            return parts.first?.trimmingCharacters(in: .whitespaces) ?? title
        }
        return "\(appName) Meeting"
    }
}


