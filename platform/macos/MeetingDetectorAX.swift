// platform/macos/MeetingDetectorAX.swift
// Lightweight meeting detector using window enumeration (CGWindow API) with heuristics.
// This does not require private APIs; it reads owner name, window title, PID, and window id.
// For richer detection you can add AXUIElement inspection gated by user consent.
// References: Accessibility API overview and screen/window inspection guidance. 【12】【11】

import Foundation
import AppKit
import CoreGraphics

public final class MeetingDetectorAX {
    public struct Detection {
        public enum App: String { case teams, zoom, slack, meet, unknown }
        public var app: App
        public var processName: String
        public var processId: pid_t
        public var windowId: CGWindowID
        public var windowTitle: String
        public var confidence: Double
        public var phase: String    // 'prejoin' | 'in_call' | 'presenting' | 'lobby' | 'unknown'
        public var meetingTitle: String?
    }

    public struct Config {
        public var pollIntervalMs: Int = 1000
        public var minConfidence: Double = 0.6
        public init() {}
    }

    private var timer: DispatchSourceTimer?
    private var config = Config()
    private var lastHits = Set<String>() // key = app:pid:windowId
    private let queue = DispatchQueue(label: "MeetingDetectorAX.timer")
    private var storedCallback: (([Detection]) -> Void)?

    public func configure(_ cfg: Config) {
        self.config = cfg
        if timer != nil, let callback = storedCallback {
            stop()
            start(onDetected: callback)
        }
    }

    public func start(onDetected: @escaping ([Detection]) -> Void) {
        storedCallback = onDetected
        stop()
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now(), repeating: .milliseconds(config.pollIntervalMs))
        t.setEventHandler { [weak self] in
            guard let self = self else { return }
            let detections = self.scan()
            let strong = detections.filter { $0.confidence >= self.config.minConfidence }
            // Emit only when there are new windows detected (or always, if you prefer)
            let keys = Set(strong.map { "\($0.app.rawValue):\($0.processId):\($0.windowId)" })
            let isNew = keys.subtracting(self.lastHits)
            self.lastHits = keys
            if !strong.isEmpty && (!isNew.isEmpty) {
                onDetected(strong)
            }
        }
        t.resume()
        self.timer = t
    }

    public func stop() {
        timer?.cancel()
        timer = nil
        lastHits.removeAll()
    }

    // MARK: - Scan windows

    private func scan() -> [Detection] {
        let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let infoList = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
            return []
        }

        var hits: [Detection] = []

        for info in infoList {
            guard
                let ownerName = info[kCGWindowOwnerName as String] as? String,
                let pid = info[kCGWindowOwnerPID as String] as? pid_t,
                let windowIdNum = info[kCGWindowNumber as String] as? NSNumber
            else { continue }
            
            // Window title may be nil for some windows
            let windowTitle = info[kCGWindowName as String] as? String ?? ""

            let windowId = CGWindowID(truncating: windowIdNum)

            let (app, conf, phase, meetingTitle) = classify(ownerName: ownerName, title: windowTitle)

            if app != .unknown {
                let d = Detection(app: app,
                                  processName: ownerName,
                                  processId: pid,
                                  windowId: windowId,
                                  windowTitle: windowTitle,
                                  confidence: conf,
                                  phase: phase,
                                  meetingTitle: meetingTitle)
                hits.append(d)
            }
        }

        return hits
    }

    // MARK: - Heuristics (aligned with your TS providers)

    private func classify(ownerName: String, title: String) -> (Detection.App, Double, String, String?) {
        // Teams (process name can be "Microsoft Teams", "Teams", or "MSTeams")
        // ONLY detect if there's a meeting-related window title - not just any Teams window
        let isTeamsProcess = ownerName.range(of: "Teams", options: .caseInsensitive) != nil ||
                             ownerName.range(of: "MSTeams", options: .caseInsensitive) != nil
        
        // Meeting indicators in window title
        let meetingKeywords = "(Meeting|Call|Presenting|Stage|Lobby|Join now|Live event|Join|Reunión|Llamada|in a call|In call)"
        let hasMeetingTitle = title.range(of: meetingKeywords, options: [.regularExpression, .caseInsensitive]) != nil
        
        // Pre-join indicators (the window that shows before joining)
        let prejoinKeywords = "(Join now|Ready to join|Joining|Preview|Choose your|audio and video)"
        let isPrejoin = title.range(of: prejoinKeywords, options: [.regularExpression, .caseInsensitive]) != nil
        
        // Only trigger if it's Teams AND has meeting-related title
        if isTeamsProcess && (hasMeetingTitle || isPrejoin) {
            var conf = 0.6
            if hasMeetingTitle { conf += 0.25 }
            if isPrejoin { conf += 0.15 }
            
            let phase = inferPhaseTeams(title: title)
            let mt = extractTitle(base: title, appMarker: "Microsoft Teams", generic: ["Conference call","Meeting","Call","Presenting","Stage","Lobby"])
            return (.teams, min(1.0, conf), phase, mt)
        }

        // Zoom
        if ownerName.range(of: "Zoom", options: .caseInsensitive) != nil ||
            title.range(of: "(Zoom|zoom\\.us)", options: [.regularExpression, .caseInsensitive]) != nil {
            let conf = 0.65
                + (title.range(of: "(Zoom|zoom\\.us)", options: [.regularExpression, .caseInsensitive]) != nil ? 0.2 : 0.0)
                + (title.range(of: "(Meeting|Webinar|Sharing|Waiting Room|Breakout)", options: [.regularExpression, .caseInsensitive]) != nil ? 0.15 : 0.0)
            let phase = inferPhaseZoom(title: title)
            let mt = extractTitle(base: title, appMarker: "Zoom", generic: ["Meeting","Webinar","Sharing","Share screen","Waiting Room","In meeting"])
            return (.zoom, min(1.0, conf), phase, mt)
        }

        // Slack Huddles
        if ownerName.range(of: "Slack", options: .caseInsensitive) != nil ||
            (title.range(of: "Slack", options: .caseInsensitive) != nil &&
             title.range(of: "(Huddle|Huddles|Call)", options: [.regularExpression, .caseInsensitive]) != nil) {
            let conf = 0.6
                + (title.range(of: "Slack", options: .caseInsensitive) != nil ? 0.2 : 0.0)
                + (title.range(of: "(Huddle|Huddles|Call)", options: [.regularExpression, .caseInsensitive]) != nil ? 0.2 : 0.0)
            let phase = title.range(of: "(Share screen|Presenting|Sharing)", options: [.regularExpression, .caseInsensitive]) != nil ? "presenting" : "in_call"
            let mt = extractTitle(base: title, appMarker: "Slack", generic: ["Huddle","Huddles","Call","Presenting","Share screen"])
            return (.slack, min(1.0, conf), phase, mt)
        }

        // Google Meet (PWA or Browser app; title carries "Google Meet" or meeting code)
        if title.range(of: "(Google\\s+Meet|meet\\.google\\.com)", options: [.regularExpression, .caseInsensitive]) != nil ||
            title.range(of: "\\b[a-z]{3}-[a-z]{4}-[a-z]{3}\\b", options: [.regularExpression, .caseInsensitive]) != nil {
            var conf = 0.5
            if title.range(of: "(Meet|Presenting|Share screen|Meeting)", options: [.regularExpression, .caseInsensitive]) != nil { conf += 0.2 }
            if title.range(of: "\\b[a-z]{3}-[a-z]{4}-[a-z]{3}\\b", options: [.regularExpression, .caseInsensitive]) != nil { conf += 0.25 }
            let phase = inferPhaseMeet(title: title)
            let mt = extractTitle(base: title, appMarker: "Google Meet", generic: ["Meet","Meeting","Presenting","Presentation","Share screen"])
            return (.meet, min(1.0, conf), phase, mt)
        }

        return (.unknown, 0.0, "unknown", nil)
    }

    private func inferPhaseTeams(title: String) -> String {
        // Check for presenting first (highest priority)
        if title.range(of: "(Presenting|Sharing|Share screen|Stage)", options: [.regularExpression, .caseInsensitive]) != nil { 
            return "presenting" 
        }
        // Pre-join indicators (join dialog, preview screen)
        if title.range(of: "(Lobby|Waiting|Pre-?join|Join now|Ready to join|Joining|Choose your|audio and video|Preview)", options: [.regularExpression, .caseInsensitive]) != nil { 
            return "prejoin" 
        }
        // Actually in call - these titles appear when you're connected
        if title.range(of: "(In a call|In call|with \\d+ participant|Live event|Currently in)", options: [.regularExpression, .caseInsensitive]) != nil { 
            return "in_call" 
        }
        // Generic meeting/call title - check this last as it's less specific
        if title.range(of: "(Meeting|Call|Reunión|Llamada)", options: [.regularExpression, .caseInsensitive]) != nil { 
            return "in_call" 
        }
        return "unknown"
    }

    private func inferPhaseZoom(title: String) -> String {
        if title.range(of: "(Sharing|Share screen|Presenting)", options: [.regularExpression, .caseInsensitive]) != nil { return "presenting" }
        if title.range(of: "(Waiting Room|Join|Connecting)", options: [.regularExpression, .caseInsensitive]) != nil { return "prejoin" }
        if title.range(of: "(Meeting|Webinar|In meeting|Breakout)", options: [.regularExpression, .caseInsensitive]) != nil { return "in_call" }
        return "unknown"
    }

    private func inferPhaseMeet(title: String) -> String {
        if title.range(of: "(Presenting|Present|Sharing|Share screen)", options: [.regularExpression, .caseInsensitive]) != nil { return "presenting" }
        if title.range(of: "(Join|Ready to join|Preview|Waiting)", options: [.regularExpression, .caseInsensitive]) != nil { return "prejoin" }
        if title.range(of: "(Meet|Meeting|In call|Live captions|Recording)", options: [.regularExpression, .caseInsensitive]) != nil { return "in_call" }
        if title.range(of: "\\b[a-z]{3}-[a-z]{4}-[a-z]{3}\\b", options: [.regularExpression, .caseInsensitive]) != nil { return "in_call" }
        return "unknown"
    }

    private func extractTitle(base: String, appMarker: String, generic: [String]) -> String? {
        var t = base
        // Remove suffix/prefix markers " — App" or " - App"
        t = t.replacingOccurrences(of: "\\s*[—|-]\\s*\(NSRegularExpression.escapedPattern(for: appMarker))\\s*$",
                                   with: "",
                                   options: [.regularExpression, .caseInsensitive])
        t = t.replacingOccurrences(of: "^\\s*\(NSRegularExpression.escapedPattern(for: appMarker))\\s*[—|-|:]+\\s*",
                                   with: "",
                                   options: [.regularExpression, .caseInsensitive])
        for g in generic {
            t = t.replacingOccurrences(of: "\\b\(NSRegularExpression.escapedPattern(for: g))\\b",
                                       with: "",
                                       options: [.regularExpression, .caseInsensitive])
        }
        t = t.replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || t.caseInsensitiveCompare(appMarker) == .orderedSame {
            return nil
        }
        return t
    }
}
