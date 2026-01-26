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
import ScreenCaptureKit

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
    
    // Cache of window titles from ScreenCaptureKit (which has better permission handling)
    private var windowTitles: [CGWindowID: String] = [:]

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
            // Emit detections - let coordinator handle deduplication
            if !strong.isEmpty {
                self.log("Callback: emitting \(strong.count) detection(s)")
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
        windowTitles.removeAll()
    }
    
    // Track if we have permission to avoid repeated prompts
    private var hasScreenCapturePermission: Bool?
    private var lastTitleRefresh: Date = .distantPast
    
    /// Refresh window titles using ScreenCaptureKit (better permission handling)
    private func refreshWindowTitles() async {
        // Don't refresh more than once per second
        guard Date().timeIntervalSince(lastTitleRefresh) > 1.0 else { return }
        
        // If we already know we don't have permission, don't keep trying
        if hasScreenCapturePermission == false { return }
        
        lastTitleRefresh = Date()
        
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            hasScreenCapturePermission = true
            var newTitles: [CGWindowID: String] = [:]
            for window in content.windows {
                if let title = window.title, !title.isEmpty {
                    newTitles[window.windowID] = title
                }
            }
            windowTitles = newTitles
        } catch {
            hasScreenCapturePermission = false
            log("SCShareableContent error: \(error.localizedDescription)")
        }
    }
    
    private static let logFile: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("catsup_detector.log")
    }()
    
    private func log(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        NSLog("%@", message) // Also log to system log
        if let data = line.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: Self.logFile.path) {
                if let handle = try? FileHandle(forWritingTo: Self.logFile) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    handle.closeFile()
                }
            } else {
                try? data.write(to: Self.logFile)
            }
        }
    }
    
    private func establishBaseline() {
        // First, refresh window titles via ScreenCaptureKit
        Task {
            await refreshWindowTitles()
        }
        
        let windows = getWindowsByApp()
        for (app, wins) in windows {
            baselineWindowCounts[app] = wins.count
            log("Baseline: \(app) = \(wins.count) windows")
            for (info, bounds) in wins {
                let wid = (info[kCGWindowNumber as String] as? NSNumber).map { CGWindowID(truncating: $0) } ?? 0
                let title = windowTitles[wid] ?? (info[kCGWindowName as String] as? String ?? "")
                log("  - \(Int(bounds.width))x\(Int(bounds.height)) title=\"\(title.prefix(40))\"")
            }
        }
        hasEstablishedBaseline = true
        log("Baseline established. Log file: \(Self.logFile.path)")
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
        
        // Refresh window titles using ScreenCaptureKit (async but we fire and forget)
        Task {
            await refreshWindowTitles()
        }
        
        let windowsByApp = getWindowsByApp()
        var hits: [Detection] = []
        
        // Check each meeting app
        for (appName, windows) in windowsByApp {
            let normalizedName = appName.lowercased()
            
            // Identify which meeting app this is
            let app: Detection.App
            if normalizedName.contains("microsoft teams") || normalizedName.contains("teams") || normalizedName.contains("msteams") {
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
            
            log("Checking \(appName): \(currentCount) windows")
            
            // Find the largest window (main app window) to compare against
            let largestWindow = windows.max { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }
            let largestArea = (largestWindow?.bounds.width ?? 0) * (largestWindow?.bounds.height ?? 0)
            
            // Analyze windows for meeting indicators
            for (info, bounds) in windows {
                guard let pid = info[kCGWindowOwnerPID as String] as? pid_t,
                      let windowIdNum = info[kCGWindowNumber as String] as? NSNumber else { continue }
                
                let windowId = CGWindowID(truncating: windowIdNum)
                // Try ScreenCaptureKit title first (more reliable), fall back to CGWindow title
                let windowTitle = windowTitles[windowId] ?? (info[kCGWindowName as String] as? String ?? "")
                let windowLayer = info[kCGWindowLayer as String] as? Int ?? 0
                
                // Calculate confidence based on multiple factors
                var confidence: Double = 0.1
                var phase = "unknown"
                
                let titleLower = windowTitle.lowercased()
                
                // GEOMETRY-BASED DETECTION (works without Screen Recording permission)
                // Teams pre-join/call windows are typically a secondary smaller window
                let windowArea = bounds.width * bounds.height
                let isSecondaryWindow = largestArea > 0 && windowArea < largestArea * 0.9 && windowArea > 200000
                let isTypicalMeetingSize = bounds.width >= 800 && bounds.width <= 1600 && bounds.height >= 500 && bounds.height <= 1200
                
                if app == .teams && isSecondaryWindow && isTypicalMeetingSize && windows.count >= 2 {
                    // Teams has a secondary window in typical meeting size range - likely pre-join or call
                    confidence += 0.5
                    phase = "prejoin"
                    log("\(appName): SECONDARY WINDOW detected (geometry-based) - likely meeting/prejoin")
                }
                
                // MOST IMPORTANT: Window has a meeting-related title
                // Normal Teams windows have EMPTY titles, meeting windows have descriptive titles
                let meetingTitleKeywords = [
                    // English
                    "meeting", "call", "teams meeting",
                    // Spanish  
                    "reunión", "llamada", "reunión de teams",
                    // French
                    "réunion", "appel",
                    // German
                    "besprechung", "anruf",
                    // Portuguese
                    "reunião", "chamada",
                    // Italian
                    "riunione", "chiamata",
                    // Generic patterns
                    "microsoft teams"
                ]
                
                let hasMeetingTitle = !titleLower.isEmpty && meetingTitleKeywords.contains { titleLower.contains($0) }
                
                if hasMeetingTitle {
                    confidence += 0.7  // Strong signal - this IS a meeting window
                    phase = "prejoin"
                    log("\(appName): MEETING WINDOW detected! Title: \(windowTitle)")
                }
                
                // Factor 2: Window size typical of meeting (reasonably large)
                let aspectRatio = bounds.width / bounds.height
                let isMeetingSize = bounds.width >= 600 && bounds.height >= 400
                let hasVideoAspect = aspectRatio >= 1.0 && aspectRatio <= 2.5
                if isMeetingSize && hasVideoAspect {
                    confidence += 0.15
                }
                
                // Factor 3: Window layer (floating windows often indicate active call UI)
                if windowLayer > 0 {
                    confidence += 0.1
                }
                
                // Additional title-based signals
                if !titleLower.isEmpty {
                    // Check for participant count pattern: "· 2" or "(3)" etc - indicates active call
                    let hasParticipantCount = titleLower.range(of: "[·•\\(]\\s*\\d+", options: .regularExpression) != nil
                    if hasParticipantCount {
                        confidence += 0.2
                        phase = "in_call"
                        log("\(appName): Participant count detected in title")
                    }
                    
                    // Check for duration pattern: "00:00" or "1:23:45" - indicates active call
                    let hasDuration = titleLower.range(of: "\\d{1,2}:\\d{2}", options: .regularExpression) != nil
                    if hasDuration {
                        confidence += 0.2
                        phase = "in_call"
                        log("\(appName): Duration timer detected in title")
                    }
                    
                    // Screen sharing indicators
                    if titleLower.contains("presenting") || titleLower.contains("screen share") || 
                       titleLower.contains("compartiendo") || titleLower.contains("partage") {
                        phase = "presenting"
                        confidence += 0.1
                    }
                }
                
                log("\(appName) window: \(Int(bounds.width))x\(Int(bounds.height)), title=\"\(windowTitle.prefix(50))\", conf=\(String(format: "%.2f", confidence)), phase=\(phase)")
                
                // Only add if we have some confidence
                if confidence >= 0.5 {
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
                    log("✓ DETECTION: \(app.rawValue) conf=\(String(format: "%.2f", confidence)) phase=\(phase)")
                    log("  → Calling callback with \(hits.count) detection(s)")
                }
            }
        }
        
        return hits
    }
}
