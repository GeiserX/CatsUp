// platform/macos/AppCoordinator.swift
// Connects meeting detection, prompting/auto-start, recording, and UI state.

import Foundation
import AppKit

public final class AppCoordinator {
    public static let shared = AppCoordinator()

    private let detector = MeetingDetectorAX()
    private var recorder: RecorderSK?
    private var currentWindowId: CGWindowID?
    private var autoStart = true
    private var autoStop = true
    private var minConfidence = 0.7
    private var inactivityTimeoutMs = 20_000
    private var lastSeenTs: TimeInterval = 0
    private var timer: Timer?

    private init() {
        DetectionNotification.shared.register()
        DetectionNotification.shared.onAction = { [weak self] action, info in
            guard let self else { return }
            switch action {
            case .start:
                if let wid = info["windowId"] as? UInt32 {
                    self.startRecording(windowId: CGWindowID(wid))
                }
            case .dismiss:
                break
            }
        }
    }

    public func configure(autoStart: Bool, autoStop: Bool, minConfidence: Double, inactivityTimeoutMs: Int) {
        self.autoStart = autoStart
        self.autoStop = autoStop
        self.minConfidence = minConfidence
        self.inactivityTimeoutMs = inactivityTimeoutMs
    }

    public func startDetection() {
        detector.configure(.init(pollIntervalMs: 1000, minConfidence: minConfidence))
        detector.start { [weak self] hits in
            guard let self else { return }
            // Choose the best hit (highest confidence)
            guard let best = hits.sorted(by: { $0.confidence > $1.confidence }).first else { return }
            self.lastSeenTs = Date().timeIntervalSince1970 * 1000
            self.currentWindowId = best.windowId

            if self.recorder != nil {
                // already recording; continue
                return
            }

            if self.autoStart {
                self.startRecording(windowId: best.windowId)
            } else {
                DetectionNotification.shared.present(
                    title: "Meeting detected (\(best.app.rawValue.capitalized))",
                    body: best.meetingTitle ?? best.windowTitle,
                    userInfo: ["windowId": best.windowId]
                )
            }
        }

        // Inactivity end timer
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            guard self.autoStop, let _ = self.recorder else { return }
            let now = Date().timeIntervalSince1970 * 1000
            if now - self.lastSeenTs > Double(self.inactivityTimeoutMs) {
                self.stopRecording()
            }
        }
    }

    public func stopDetection() {
        detector.stop()
        timer?.invalidate()
        timer = nil
    }

    private func recordingsDir() -> URL {
        let appSup = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask).first!
        let dir = appSup.appendingPathComponent("MeetingAssistantRecordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func startRecording(windowId: CGWindowID) {
        let fileName = "meeting-\(Int(Date().timeIntervalSince1970)).mov"
        let url = recordingsDir().appendingPathComponent(fileName)
        let rec = RecorderSK()
        self.recorder = rec
        Task { @MainActor in
            do {
                try await rec.start(windowId: windowId, options: .init(outputURL: url)) { state in
                    // update UI if needed
                    switch state {
                    case .recording:
                        MiniWindowController.shared.show()
                    default: break
                    }
                }
            } catch {
                // handle error (show alert/log)
            }
        }
    }

    public func stopRecording() {
        recorder?.stop { _ in
            // Optionally open Finder or emit event
        }
        recorder = nil
    }

    public var isRecording: Bool {
        if case .recording = recorder?.state { return true }
        return false
    }
}
