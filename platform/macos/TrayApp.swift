// platform/macos/TrayApp.swift
// Minimal SwiftUI menu bar app using MenuBarExtra.
// Set LSUIElement = YES in Info.plist to hide Dock icon if desired.
// References: MenuBarExtra docs and SwiftUI menu bar patterns. 【6】【7】
// platform/macos/TrayApp.swift

import SwiftUI

@main
struct TrayApp: App {
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        MenuBarExtra("Meeting Assistant", systemImage: "waveform") {
            VStack(alignment: .leading, spacing: 8) {
                Toggle("Auto-start recordings", isOn: $appModel.autoStart)
                Toggle("Auto-stop on meeting end", isOn: $appModel.autoStop)
                Divider()
                Button(appModel.isRecording ? "Stop Recording" : "Start Detection") {
                    if appModel.isRecording {
                        appModel.stopRecording()
                    } else {
                        appModel.startDetection()
                    }
                }
                Button("Open Mini Window") { appModel.showMiniWindow() }
                Divider()
                Button("Settings…") { appModel.openSettings() }
                Button("Quit") { NSApplication.shared.terminate(nil) }
            }
            .padding(8)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(appModel: appModel)
                .frame(width: 420, height: 320)
        }
    }
}

final class AppModel: ObservableObject {
    @Published var autoStart = true {
        didSet { AppCoordinator.shared.configure(autoStart: autoStart, autoStop: autoStop, minConfidence: 0.7, inactivityTimeoutMs: 20000) }
    }
    @Published var autoStop = true {
        didSet { AppCoordinator.shared.configure(autoStart: autoStart, autoStop: autoStop, minConfidence: 0.7, inactivityTimeoutMs: 20000) }
    }

    var isRecording: Bool { AppCoordinator.shared.isRecording }

    func startDetection() {
        AppCoordinator.shared.configure(autoStart: autoStart, autoStop: autoStop, minConfidence: 0.7, inactivityTimeoutMs: 20000)
        AppCoordinator.shared.startDetection()
    }

    func stopRecording() {
        AppCoordinator.shared.stopRecording()
    }

    func showMiniWindow() {
        MiniWindowController.shared.show()
    }

    func openSettings() {
        NSApp.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil)
    }
}

struct SettingsView: View {
    @ObservedObject var appModel: AppModel
    var body: some View {
        Form {
            Toggle("Auto-start recordings", isOn: $appModel.autoStart)
            Toggle("Auto-stop on meeting end", isOn: $appModel.autoStop)
            Text("Recordings are saved in Movies/MeetingAssistantRecordings")
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding()
    }
}
