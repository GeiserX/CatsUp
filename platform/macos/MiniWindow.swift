// platform/macos/MiniWindow.swift
// A compact floating window for in-meeting controls.
// Uses NSWindow with .floating level to stay on top, hosting a SwiftUI view.
// References: Floating window level guidance and SwiftUI floating panels. 【13】【14】

import SwiftUI
import AppKit

struct MiniWindow: View {
    @State private var elapsed = "00:00:00"
    @State private var lastSummary: String = "No summary yet."
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Circle()
                    .fill(AppCoordinator.shared.isRecording ? Color.red : Color.gray)
                    .frame(width: 10, height: 10)
                Text(AppCoordinator.shared.isRecording ? "Recording • \(elapsed)" : "Idle")
                    .font(.headline)
                Spacer()
                Button {
                    NSApp.keyWindow?.close()
                } label: { Image(systemName: "xmark") }
                .buttonStyle(.borderless)
            }

            HStack(spacing: 8) {
                if AppCoordinator.shared.isRecording {
                    Button("Stop") { AppCoordinator.shared.stopRecording() }
                } else {
                    Button("Start detection") { AppCoordinator.shared.startDetection() }
                }
                Button("Bookmark") {
                    // TODO: emit bookmark event for AI pipeline
                }
                Button("What’s been going on?") {
                    // TODO: call QA service; placeholder for now
                    lastSummary = "Since start: discussed timelines, blockers, and action items."
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Summary").font(.subheadline).foregroundColor(.secondary)
                ScrollView { Text(lastSummary).frame(maxWidth: .infinity, alignment: .leading) }
                    .frame(height: 80)
            }

            Spacer()
        }
        .onAppear {
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                // TODO: replace with real elapsed tracking
                let t = Int(Date().timeIntervalSince1970) % 36000
                let h = t / 3600, m = (t % 3600) / 60, s = t % 60
                elapsed = String(format: "%02d:%02d:%02d", h, m, s)
            }
        }
        .onDisappear { timer?.invalidate(); timer = nil }
        .padding(12)
        .frame(minWidth: 320, minHeight: 180)
    }
}
