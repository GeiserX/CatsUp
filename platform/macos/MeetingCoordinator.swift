// platform/macos/MeetingCoordinator.swift
// Central coordinator connecting meeting detection, recording, transcription,
// trigger word detection, and AI response generation.

import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreMedia

@MainActor
public final class MeetingCoordinator: ObservableObject {
    public static let shared = MeetingCoordinator()
    
    // MARK: - Published State
    
    @Published public var state: MeetingState = .idle
    @Published public var currentMeeting: MeetingInfo?
    @Published public var isRecording = false
    @Published public var isTranscribing = false
    @Published public var elapsedTime: TimeInterval = 0
    @Published public var liveTranscript: String = ""
    @Published public var interimText: String = ""
    @Published public var lastAIResponse: String = ""
    @Published public var isAIResponding = false
    @Published public var triggerEventCount = 0
    
    // MARK: - Configuration
    
    public struct Config: Codable {
        public var autoStartRecording: Bool = true
        public var autoStopOnMeetingEnd: Bool = true
        public var triggerWords: [String] = ["Sergio"]
        public var userName: String = "Sergio"
        public var deepgramApiKey: String = ""
        public var openaiApiKey: String = ""
        public var anthropicApiKey: String = ""
        public var llmProvider: String = "openai" // openai, anthropic, ollama
        public var llmModel: String = "gpt-4o"
        public var transcriptionLanguage: String = "en"
        public var showInterimResults: Bool = true
        public var notifyOnTrigger: Bool = true
        public var speakResponses: Bool = false
        public var askHotkey: String = "⌃⌥A" // Ctrl+Option+A to ask a question
        public var recordingsDirectory: URL?
        
        public init() {
            recordingsDirectory = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask).first?
                .appendingPathComponent("CatsUp", isDirectory: true)
        }
    }
    
    @Published public var config = Config() {
        didSet { saveConfig() }
    }
    
    // MARK: - Types
    
    public enum MeetingState: Equatable {
        case idle
        case detecting
        case meetingDetected(app: String)
        case recording
        case paused
        case stopping
        case error(String)
        
        public static func == (lhs: MeetingState, rhs: MeetingState) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle), (.detecting, .detecting), (.recording, .recording),
                 (.paused, .paused), (.stopping, .stopping):
                return true
            case (.meetingDetected(let a), .meetingDetected(let b)):
                return a == b
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }
    
    public struct MeetingInfo {
        public let app: String
        public let title: String?
        public let startTime: Date
        public var recordingURL: URL?
        public var transcriptSegments: [TranscriptionStreamService.TranscriptSegment] = []
    }
    
    // MARK: - Private Properties
    
    private let detector = MeetingDetectorAX()
    private var recorder: RecorderSK?
    private let transcriptionService = TranscriptionStreamService()
    private let responseEngine = ResponseEngine()
    
    private var currentWindowId: CGWindowID?
    private var detectionTimer: Timer?
    private var elapsedTimer: Timer?
    private var meetingStartTime: Date?
    
    // Audio routing
    private var audioTapInstalled = false
    private var audioEngine: AVAudioEngine?
    
    // MARK: - Initialization
    
    private init() {
        loadConfig()
        setupTranscriptionHandlers()
        setupNotifications()
    }
    
    // MARK: - Public API
    
    public func startDetection() {
        guard state == .idle else { return }
        
        state = .detecting
        
        var detectorConfig = MeetingDetectorAX.Config()
        detectorConfig.pollIntervalMs = 1000
        detectorConfig.minConfidence = 0.5  // Lower threshold - MSTeams gives 0.85
        detector.configure(detectorConfig)
        detector.start { [weak self] detections in
            guard let self, let best = detections.max(by: { $0.confidence < $1.confidence }) else { return }
            
            print("[CatsUp] Meeting detected: \(best.app.rawValue) - \(best.processName) - conf: \(best.confidence) - phase: \(best.phase) - title: \(best.windowTitle)")
            
            Task { @MainActor in
                self.handleMeetingDetected(best)
            }
        }
    }
    
    public func stopDetection() {
        detector.stop()
        detectionTimer?.invalidate()
        detectionTimer = nil
        
        if isRecording {
            stopRecording()
        }
        
        state = .idle
    }
    
    public func startRecording() {
        guard let windowId = currentWindowId, !isRecording else { return }
        
        Task {
            await startRecordingAsync(windowId: windowId)
        }
    }
    
    public func stopRecording() {
        guard isRecording else { return }
        
        state = .stopping
        isRecording = false
        isTranscribing = false
        
        // Stop transcription
        transcriptionService.stop()
        
        // Stop audio engine
        stopAudioCapture()
        
        // Stop recorder
        recorder?.stop(completion: { [weak self] url in
            Task { @MainActor in
                self?.finishRecording(url: url)
            }
        })
        
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }
    
    public func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }
    
    public func askQuestion(_ question: String) {
        guard !liveTranscript.isEmpty else { return }
        
        Task {
            isAIResponding = true
            lastAIResponse = ""
            
            do {
                let answer = try await responseEngine.quickAnswer(
                    question: question,
                    transcript: liveTranscript
                )
                lastAIResponse = answer
            } catch {
                lastAIResponse = "Error: \(error.localizedDescription)"
            }
            
            isAIResponding = false
        }
    }
    
    public func summarize() {
        askQuestion("Summarize what's been discussed in this meeting so far.")
    }
    
    // MARK: - Private Methods
    
    private func handleMeetingDetected(_ detection: MeetingDetectorAX.Detection) {
        // Allow updates when detecting OR when waiting for call to start
        guard state == .detecting || 
              (state == .meetingDetected(app: detection.app.rawValue) && detection.phase == "in_call") else { 
            return 
        }
        
        currentWindowId = detection.windowId
        currentMeeting = MeetingInfo(
            app: detection.app.rawValue,
            title: detection.meetingTitle ?? detection.windowTitle,
            startTime: Date()
        )
        
        // If pre-join, just show detected state but don't record yet
        if detection.phase == "prejoin" || detection.phase == "lobby" {
            print("[CatsUp] Pre-join detected, waiting for call to start...")
            state = .meetingDetected(app: detection.app.rawValue)
            // Keep detecting until in_call
            return
        }
        
        // Only record when actually in call
        if detection.phase == "in_call" || detection.phase == "presenting" {
            print("[CatsUp] In-call detected, starting recording...")
            state = .meetingDetected(app: detection.app.rawValue)
            
            if config.autoStartRecording && !isRecording {
                startRecording()
            } else if !config.autoStartRecording {
                showMeetingDetectedNotification(detection)
            }
        }
    }
    
    private func startRecordingAsync(windowId: CGWindowID) async {
        do {
            // Ensure recordings directory exists
            if let dir = config.recordingsDirectory {
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            }
            
            // Generate recording filename
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
            let timestamp = dateFormatter.string(from: Date())
            let appName = currentMeeting?.app ?? "meeting"
            let fileName = "\(appName)_\(timestamp).mov"
            
            let outputURL = config.recordingsDirectory?.appendingPathComponent(fileName)
                ?? FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            
            currentMeeting?.recordingURL = outputURL
            
            // Start recorder
            let rec = RecorderSK()
            recorder = rec
            
            var options = RecorderSK.Options(outputURL: outputURL)
            options.captureAppAudio = true
            options.captureMic = true
            
            try await rec.start(windowId: windowId, options: options) { [weak self] recState in
                Task { @MainActor in
                    if case .recording = recState {
                        self?.isRecording = true
                        self?.state = .recording
                        self?.startElapsedTimer()
                    }
                }
            }
            
            // Start transcription
            await startTranscription()
            
            meetingStartTime = Date()
            
        } catch {
            state = .error("Failed to start recording: \(error.localizedDescription)")
        }
    }
    
    private func startTranscription() async {
        guard !config.deepgramApiKey.isEmpty else {
            print("[MeetingCoordinator] No Deepgram API key configured")
            return
        }
        
        var transcriptionConfig = TranscriptionStreamService.Config(apiKey: config.deepgramApiKey)
        transcriptionConfig.language = config.transcriptionLanguage
        transcriptionConfig.triggerWords = config.triggerWords
        transcriptionConfig.interimResults = config.showInterimResults
        
        transcriptionService.configure(transcriptionConfig)
        
        do {
            try await transcriptionService.start()
            isTranscribing = true
            
            // Start audio capture for transcription
            startAudioCapture()
            
        } catch {
            print("[MeetingCoordinator] Transcription start failed: \(error)")
        }
    }
    
    private func setupTranscriptionHandlers() {
        transcriptionService.onSegment = { [weak self] segment in
            Task { @MainActor in
                guard let self else { return }
                self.liveTranscript += (self.liveTranscript.isEmpty ? "" : " ") + segment.text
                self.currentMeeting?.transcriptSegments.append(segment)
                self.interimText = ""
            }
        }
        
        transcriptionService.onInterim = { [weak self] text in
            Task { @MainActor in
                self?.interimText = text
            }
        }
        
        transcriptionService.onTrigger = { [weak self] event in
            Task { @MainActor in
                guard let self else { return }
                self.triggerEventCount += 1
                await self.handleTriggerWord(event)
            }
        }
        
        transcriptionService.onError = { [weak self] error in
            Task { @MainActor in
                print("[MeetingCoordinator] Transcription error: \(error)")
                self?.isTranscribing = false
            }
        }
    }
    
    private func handleTriggerWord(_ event: TranscriptionStreamService.TriggerEvent) async {
        guard config.notifyOnTrigger else { return }
        
        // Show notification
        showTriggerNotification(word: event.word)
        
        // Generate AI response
        isAIResponding = true
        lastAIResponse = ""
        
        // Configure response engine if needed
        if !config.openaiApiKey.isEmpty {
            var responseConfig = ResponseEngine.Config(apiKey: config.openaiApiKey)
            responseConfig.model = config.llmModel
            
            switch config.llmProvider {
            case "anthropic":
                responseConfig.provider = .anthropic
                responseConfig.apiKey = config.anthropicApiKey
            case "ollama":
                responseConfig.provider = .ollama
            default:
                responseConfig.provider = .openai
            }
            
            responseEngine.configure(responseConfig)
        }
        
        do {
            let context = ResponseEngine.ResponseContext(
                transcript: liveTranscript,
                recentContext: event.context,
                triggerPhrase: event.context,
                documents: [],
                userName: config.userName
            )
            
            // Stream the response
            for try await chunk in responseEngine.generateResponseStream(context: context) {
                lastAIResponse += chunk
            }
            
            // Optionally speak the response
            if config.speakResponses {
                speakResponse(lastAIResponse)
            }
            
        } catch {
            lastAIResponse = "Sorry, I couldn't generate a response: \(error.localizedDescription)"
        }
        
        isAIResponding = false
    }
    
    private func startAudioCapture() {
        guard !audioTapInstalled else { return }
        
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let format = inputNode.inputFormat(forBus: 0)
        
        // Convert to mono 16kHz for transcription
        let recordingFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 48000, channels: 1, interleaved: true)!
        
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
            // Convert and send to transcription service
            if let converted = self?.convertBuffer(buffer, to: recordingFormat) {
                self?.transcriptionService.sendAudio(converted)
            }
        }
        
        do {
            try engine.start()
            self.audioEngine = engine
            audioTapInstalled = true
        } catch {
            print("[MeetingCoordinator] Audio capture failed: \(error)")
        }
    }
    
    private func stopAudioCapture() {
        if audioTapInstalled, let engine = audioEngine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
            audioTapInstalled = false
        }
        audioEngine = nil
    }
    
    private func convertBuffer(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let converter = AVAudioConverter(from: buffer.format, to: format) else { return nil }
        
        let ratio = format.sampleRate / buffer.format.sampleRate
        let outputFrameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio)
        
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: outputFrameCapacity) else { return nil }
        
        var error: NSError?
        let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
            outStatus.pointee = .haveData
            return buffer
        }
        
        converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
        
        return error == nil ? outputBuffer : nil
    }
    
    private func finishRecording(url: URL?) {
        state = .idle
        
        if let url = url {
            print("[MeetingCoordinator] Recording saved to: \(url.path)")
            
            // Save transcript alongside recording
            saveTranscript(for: url)
        }
        
        // Reset state
        currentMeeting = nil
        currentWindowId = nil
        liveTranscript = ""
        interimText = ""
        elapsedTime = 0
        meetingStartTime = nil
    }
    
    private func saveTranscript(for recordingURL: URL) {
        guard !liveTranscript.isEmpty else { return }
        
        let transcriptURL = recordingURL.deletingPathExtension().appendingPathExtension("txt")
        
        var content = "# Meeting Transcript\n"
        content += "Date: \(Date())\n"
        content += "App: \(currentMeeting?.app ?? "Unknown")\n"
        content += "Title: \(currentMeeting?.title ?? "Unknown")\n"
        content += "Duration: \(formatTime(elapsedTime))\n\n"
        content += "---\n\n"
        content += liveTranscript
        
        try? content.write(to: transcriptURL, atomically: true, encoding: .utf8)
    }
    
    private func startElapsedTimer() {
        elapsedTimer?.invalidate()
        let startTime = meetingStartTime
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let start = startTime else { return }
            Task { @MainActor [weak self] in
                self?.elapsedTime = Date().timeIntervalSince(start)
            }
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let hours = Int(time) / 3600
        let minutes = (Int(time) % 3600) / 60
        let seconds = Int(time) % 60
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
    
    // MARK: - Config Persistence
    
    private func loadConfig() {
        let configURL = configFileURL()
        
        if let data = try? Data(contentsOf: configURL),
           let decoded = try? JSONDecoder().decode(Config.self, from: data) {
            config = decoded
        }
    }
    
    private func saveConfig() {
        let configURL = configFileURL()
        
        if let data = try? JSONEncoder().encode(config) {
            try? data.write(to: configURL)
        }
    }
    
    private func configFileURL() -> URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let appDir = appSupport.appendingPathComponent("CatsUp", isDirectory: true)
        try? FileManager.default.createDirectory(at: appDir, withIntermediateDirectories: true)
        return appDir.appendingPathComponent("config.json")
    }
    
    // MARK: - Notifications & Speech
    
    private func setupNotifications() {
        DetectionNotification.shared.register()
        DetectionNotification.shared.onAction = { [weak self] action, info in
            Task { @MainActor in
                guard let self else { return }
                switch action {
                case .start:
                    self.startRecording()
                case .dismiss:
                    break
                }
            }
        }
    }
    
    private func showMeetingDetectedNotification(_ detection: MeetingDetectorAX.Detection) {
        DetectionNotification.shared.present(
            title: "Meeting Detected (\(detection.app.rawValue.capitalized))",
            body: detection.meetingTitle ?? detection.windowTitle,
            userInfo: ["windowId": detection.windowId]
        )
    }
    
    private func showTriggerNotification(word: String) {
        let content = UNMutableNotificationContent()
        content.title = "🎯 \(word) mentioned!"
        content.body = "Generating response..."
        content.sound = .default
        
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
    
    private func speakResponse(_ text: String) {
        let utterance = NSSpeechSynthesizer()
        utterance.startSpeaking(text)
    }
}

import UserNotifications

