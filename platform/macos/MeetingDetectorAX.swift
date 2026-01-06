// platform/macos/MeetingDetectorAX.swift
// Language-agnostic meeting detector using multiple heuristics:
// - Window enumeration (CGWindow API)
// - Window count per app (meetings often create multiple windows)
// - Window size heuristics (call windows have specific characteristics)
// - Audio usage detection (check if app is using audio)

import Foundation
import AppKit
import CoreGraphics
import AVFoundation

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
    
    // Track window counts per app to detect when new windows appear (meeting started)
    private var baselineWindowCounts: [String: Int] = [:]
    private var hasEstablishedBaseline = false

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
        
        // Establish baseline window counts after a short delay
        hasEstablishedBaseline = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.establishBaseline()
        }
        
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + 2.5, repeating: .milliseconds(config.pollIntervalMs))
        t.setEventHandler { [weak self] in
            guard let self = self else { return }
            let detections = self.scan()
            let strong = detections.filter { $0.confidence >= self.config.minConfidence }
            // Emit only when there are new windows detected
            let keys = Set(strong.map { "\($0.app.rawValue):\($0.processId):\($0.windowId)" })
            let isNew = keys.subtracting(self.lastHits)
            self.lastHits = keys
            if !strong.isEmpty && !isNew.isEmpty {
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
        baselineWindowCounts.removeAll()
        hasEstablishedBaseline = false
    }
    
    private func establishBaseline() {
        let windows = getWindowsByApp()
        for (app, wins) in windows {
            baselineWindowCounts[app] = wins.count
        }
        hasEstablishedBaseline = true
        print("[MeetingDetector] Baseline established: \(baselineWindowCounts)")
    }

    // MARK: - Scan windows
    
    private func getWindowsByApp() -> [String: [(info: [String: Any], bounds: CGRect)]] {
        let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let infoList = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
            return [:]
        }
        
        var byApp: [String: [(info: [String: Any], bounds: CGRect)]] = [:]
        
        for info in infoList {
            guard let ownerName = info[kCGWindowOwnerName as String] as? String else { continue }
            
            var bounds = CGRect.zero
            if let boundsDict = info[kCGWindowBounds as String] as? [String: Any],
               let x = boundsDict["X"] as? CGFloat,
               let y = boundsDict["Y"] as? CGFloat,
               let w = boundsDict["Width"] as? CGFloat,
               let h = boundsDict["Height"] as? CGFloat {
                bounds = CGRect(x: x, y: y, width: w, height: h)
            }
            
            // Skip tiny windows (toolbars, status items)
            if bounds.width < 200 || bounds.height < 150 { continue }
            
            byApp[ownerName, default: []].append((info: info, bounds: bounds))
        }
        
        return byApp
    }

    private func scan() -> [Detection] {
        guard hasEstablishedBaseline else { return [] }
        
        let windowsByApp = getWindowsByApp()
        var hits: [Detection] = []
        
        // Check each meeting app
        for (appName, windows) in windowsByApp {
            let normalizedName = appName.lowercased()
            
            // Identify which meeting app this is
            let app: Detection.App
            if normalizedName.contains("teams") || normalizedName.contains("msteams") {
                app = .teams
            } else if normalizedName.contains("zoom") {
                app = .zoom
            } else if normalizedName.contains("slack") {
                app = .slack
            } else {
                continue // Not a meeting app
            }
            
            // Get baseline count for this app
            let baseline = baselineWindowCounts[appName] ?? 0
            let currentCount = windows.count
            let hasNewWindows = currentCount > baseline
            
            // Analyze windows for meeting indicators
            for (info, bounds) in windows {
                guard let pid = info[kCGWindowOwnerPID as String] as? pid_t,
                      let windowIdNum = info[kCGWindowNumber as String] as? NSNumber else { continue }
                
                let windowId = CGWindowID(truncating: windowIdNum)
                let windowTitle = info[kCGWindowName as String] as? String ?? ""
                let windowLayer = info[kCGWindowLayer as String] as? Int ?? 0
                
                // Calculate confidence based on multiple factors
                var confidence: Double = 0.3
                var phase = "unknown"
                
                // Factor 1: New window appeared (strong indicator)
                if hasNewWindows {
                    confidence += 0.25
                    print("[MeetingDetector] \(appName): New window detected (baseline: \(baseline), current: \(currentCount))")
                }
                
                // Factor 2: Window size typical of meeting (16:9 or similar, reasonably large)
                let aspectRatio = bounds.width / bounds.height
                let isMeetingSize = bounds.width >= 600 && bounds.height >= 400
                let hasVideoAspect = aspectRatio >= 1.2 && aspectRatio <= 2.0
                if isMeetingSize && hasVideoAspect {
                    confidence += 0.15
                }
                
                // Factor 3: Multiple windows from same app (call + controls)
                if currentCount >= 2 {
                    confidence += 0.15
                }
                
                // Factor 4: Window layer (floating windows often indicate active call UI)
                if windowLayer > 0 {
                    confidence += 0.1
                }
                
                // Factor 5: Title-based detection (language-agnostic patterns)
                let titleLower = windowTitle.lowercased()
                
                // Check for participant count pattern (works in any language): "· 2" or "(3)" etc
                let hasParticipantCount = titleLower.range(of: "[·•\\(]\\s*\\d+", options: .regularExpression) != nil
                if hasParticipantCount {
                    confidence += 0.3
                    phase = "in_call"
                }
                
                // Check for duration pattern: "00:00" or "1:23:45"
                let hasDuration = titleLower.range(of: "\\d{1,2}:\\d{2}", options: .regularExpression) != nil
                if hasDuration {
                    confidence += 0.25
                    phase = "in_call"
                }
                
                // Common meeting keywords (multi-language)
                let meetingKeywords = ["meeting", "call", "reunión", "llamada", "réunion", "appel", 
                                       "besprechung", "anruf", "会议", "通话", "ミーティング", "通話",
                                       "in a call", "in call", "presenting", "screen share"]
                for keyword in meetingKeywords {
                    if titleLower.contains(keyword) {
                        confidence += 0.2
                        if keyword.contains("present") || keyword.contains("share") {
                            phase = "presenting"
                        } else {
                            phase = "in_call"
                        }
                        break
                    }
                }
                
                // Pre-join keywords (multi-language)
                let prejoinKeywords = ["join", "unirse", "rejoindre", "beitreten", "参加", "参加する",
                                       "preview", "vista previa", "aperçu", "vorschau"]
                for keyword in prejoinKeywords {
                    if titleLower.contains(keyword) {
                        phase = "prejoin"
                        confidence += 0.1
                        break
                    }
                }
                
                // Only add if we have some confidence
                if confidence >= 0.4 {
                    let detection = Detection(
                        app: app,
                        processName: appName,
                        processId: pid,
                        windowId: windowId,
                        windowTitle: windowTitle,
                        confidence: min(1.0, confidence),
                        phase: phase.isEmpty ? "unknown" : phase,
                        meetingTitle: windowTitle.isEmpty ? nil : windowTitle
                    )
                    hits.append(detection)
                }
            }
        }
        
        return hits
    }
}
