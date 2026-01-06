// platform/macos/TranscriptionStreamService.swift
// Real-time streaming transcription service using Deepgram WebSocket API.
// Receives PCM audio buffers, sends to Deepgram, emits transcript segments.
// Includes trigger word detection for smart responses.

import Foundation
import AVFoundation
import CoreMedia

public final class TranscriptionStreamService: NSObject {
    
    // MARK: - Types
    
    public struct Config {
        public var apiKey: String
        public var provider: TranscriptionProvider = .deepgram
        public var language: String = "en"
        public var triggerWords: [String] = []
        public var punctuate: Bool = true
        public var diarize: Bool = false
        public var interimResults: Bool = true
        public var smartFormat: Bool = true
        public var sampleRate: Int = 48000
        
        public init(apiKey: String) {
            self.apiKey = apiKey
        }
    }
    
    public enum TranscriptionProvider: String {
        case deepgram
        case assemblyai
        case openai
    }
    
    public struct TranscriptSegment {
        public let text: String
        public let start: Double
        public let end: Double
        public let isFinal: Bool
        public let speaker: Int?
        public let confidence: Double
        public let words: [WordTiming]
    }
    
    public struct WordTiming {
        public let word: String
        public let start: Double
        public let end: Double
        public let confidence: Double
    }
    
    public struct TriggerEvent {
        public let word: String
        public let timestamp: Double
        public let context: String // surrounding text
        public let fullTranscript: String
    }
    
    public enum State: Equatable {
        case idle
        case connecting
        case connected
        case transcribing
        case disconnected
        case error(String)
        
        public static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle), (.connecting, .connecting), (.connected, .connected),
                 (.transcribing, .transcribing), (.disconnected, .disconnected):
                return true
            case (.error(let a), .error(let b)):
                return a == b
            default:
                return false
            }
        }
    }
    
    // MARK: - Properties
    
    private var config: Config?
    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var state: State = .idle
    private var fullTranscript: String = ""
    private var segments: [TranscriptSegment] = []
    private var lastInterimText: String = ""
    
    // Handlers
    public var onSegment: ((TranscriptSegment) -> Void)?
    public var onTrigger: ((TriggerEvent) -> Void)?
    public var onStateChanged: ((State) -> Void)?
    public var onError: ((Error) -> Void)?
    public var onInterim: ((String) -> Void)?
    
    // Audio buffer conversion
    private let audioQueue = DispatchQueue(label: "TranscriptionStreamService.audio")
    private var isRunning = false
    
    // MARK: - Public API
    
    public func configure(_ config: Config) {
        self.config = config
    }
    
    public func start() async throws {
        guard let config = config else {
            throw TranscriptionError.notConfigured
        }
        
        guard state != .connected && state != .connecting else { return }
        
        setState(.connecting)
        
        switch config.provider {
        case .deepgram:
            try await connectDeepgram(config)
        case .assemblyai:
            try await connectAssemblyAI(config)
        case .openai:
            throw TranscriptionError.providerNotSupported
        }
        
        isRunning = true
        setState(.connected)
    }
    
    public func stop() {
        isRunning = false
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        setState(.disconnected)
    }
    
    public func sendAudio(_ buffer: AVAudioPCMBuffer) {
        guard isRunning, let ws = webSocket else { return }
        
        audioQueue.async { [weak self] in
            guard let self = self, let data = self.pcmToData(buffer) else { return }
            ws.send(.data(data)) { error in
                if let error = error {
                    self.handleError(error)
                }
            }
        }
    }
    
    public func sendAudio(_ sampleBuffer: CMSampleBuffer) {
        guard isRunning, let ws = webSocket else { return }
        
        audioQueue.async { [weak self] in
            guard let self = self, let data = self.cmSampleBufferToData(sampleBuffer) else { return }
            ws.send(.data(data)) { error in
                if let error = error {
                    self.handleError(error)
                }
            }
        }
    }
    
    public func getFullTranscript() -> String {
        return fullTranscript
    }
    
    public func getSegments() -> [TranscriptSegment] {
        return segments
    }
    
    // MARK: - Deepgram Connection
    
    private func connectDeepgram(_ config: Config) async throws {
        var components = URLComponents(string: "wss://api.deepgram.com/v1/listen")!
        
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "encoding", value: "linear16"),
            URLQueryItem(name: "sample_rate", value: "\(config.sampleRate)"),
            URLQueryItem(name: "channels", value: "1"),
            URLQueryItem(name: "language", value: config.language),
            URLQueryItem(name: "punctuate", value: config.punctuate ? "true" : "false"),
            URLQueryItem(name: "interim_results", value: config.interimResults ? "true" : "false"),
            URLQueryItem(name: "smart_format", value: config.smartFormat ? "true" : "false"),
        ]
        
        if config.diarize {
            queryItems.append(URLQueryItem(name: "diarize", value: "true"))
        }
        
        // Add keywords for trigger word boosting
        if !config.triggerWords.isEmpty {
            let keywords = config.triggerWords.joined(separator: ",")
            queryItems.append(URLQueryItem(name: "keywords", value: keywords))
        }
        
        components.queryItems = queryItems
        
        guard let url = components.url else {
            throw TranscriptionError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.setValue("Token \(config.apiKey)", forHTTPHeaderField: "Authorization")
        
        session = URLSession(configuration: .default)
        webSocket = session?.webSocketTask(with: request)
        webSocket?.resume()
        
        // Start receiving messages
        receiveMessage()
    }
    
    private func connectAssemblyAI(_ config: Config) async throws {
        // AssemblyAI real-time transcription
        let url = URL(string: "wss://api.assemblyai.com/v2/realtime/ws?sample_rate=\(config.sampleRate)")!
        
        var request = URLRequest(url: url)
        request.setValue(config.apiKey, forHTTPHeaderField: "Authorization")
        
        session = URLSession(configuration: .default)
        webSocket = session?.webSocketTask(with: request)
        webSocket?.resume()
        
        receiveMessage()
    }
    
    // MARK: - Message Handling
    
    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleTextMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleTextMessage(text)
                    }
                @unknown default:
                    break
                }
                
                // Continue receiving
                if self.isRunning {
                    self.receiveMessage()
                }
                
            case .failure(let error):
                self.handleError(error)
            }
        }
    }
    
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        
        // Parse Deepgram response
        if let channel = json["channel"] as? [String: Any],
           let alternatives = channel["alternatives"] as? [[String: Any]],
           let first = alternatives.first {
            
            let transcript = first["transcript"] as? String ?? ""
            let confidence = first["confidence"] as? Double ?? 0.0
            let isFinal = json["is_final"] as? Bool ?? false
            
            // Parse word timings
            var words: [WordTiming] = []
            if let wordData = first["words"] as? [[String: Any]] {
                for w in wordData {
                    let word = WordTiming(
                        word: w["word"] as? String ?? "",
                        start: w["start"] as? Double ?? 0,
                        end: w["end"] as? Double ?? 0,
                        confidence: w["confidence"] as? Double ?? 0
                    )
                    words.append(word)
                }
            }
            
            let start = json["start"] as? Double ?? 0
            let duration = json["duration"] as? Double ?? 0
            
            let segment = TranscriptSegment(
                text: transcript,
                start: start,
                end: start + duration,
                isFinal: isFinal,
                speaker: nil,
                confidence: confidence,
                words: words
            )
            
            if isFinal {
                segments.append(segment)
                fullTranscript += (fullTranscript.isEmpty ? "" : " ") + transcript
                
                DispatchQueue.main.async {
                    self.onSegment?(segment)
                }
                
                // Check for trigger words
                checkTriggerWords(in: transcript, at: start)
                
                setState(.transcribing)
            } else {
                lastInterimText = transcript
                DispatchQueue.main.async {
                    self.onInterim?(transcript)
                }
            }
        }
    }
    
    private func checkTriggerWords(in text: String, at timestamp: Double) {
        guard let config = config else { return }
        
        let lowercaseText = text.lowercased()
        
        for trigger in config.triggerWords {
            if lowercaseText.contains(trigger.lowercased()) {
                // Extract context (last ~100 characters of full transcript)
                let contextStart = max(0, fullTranscript.count - 100)
                let context = String(fullTranscript.suffix(from: fullTranscript.index(fullTranscript.startIndex, offsetBy: contextStart)))
                
                let event = TriggerEvent(
                    word: trigger,
                    timestamp: timestamp,
                    context: context,
                    fullTranscript: fullTranscript
                )
                
                DispatchQueue.main.async {
                    self.onTrigger?(event)
                }
            }
        }
    }
    
    // MARK: - Audio Conversion
    
    private func pcmToData(_ buffer: AVAudioPCMBuffer) -> Data? {
        guard let channelData = buffer.int16ChannelData else {
            // Try to convert from float32 to int16
            guard let floatData = buffer.floatChannelData else { return nil }
            
            let frameCount = Int(buffer.frameLength)
            var int16Data = [Int16](repeating: 0, count: frameCount)
            
            for i in 0..<frameCount {
                let sample = floatData[0][i]
                let clipped = max(-1.0, min(1.0, sample))
                int16Data[i] = Int16(clipped * Float(Int16.max))
            }
            
            return Data(bytes: int16Data, count: frameCount * 2)
        }
        
        let frameCount = Int(buffer.frameLength)
        return Data(bytes: channelData[0], count: frameCount * 2)
    }
    
    private func cmSampleBufferToData(_ sampleBuffer: CMSampleBuffer) -> Data? {
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return nil }
        
        var lengthAtOffset: Int = 0
        var totalLength: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        
        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: &lengthAtOffset,
            totalLengthOut: &totalLength,
            dataPointerOut: &dataPointer
        )
        
        guard status == kCMBlockBufferNoErr, let pointer = dataPointer else { return nil }
        
        return Data(bytes: pointer, count: totalLength)
    }
    
    // MARK: - State & Error Handling
    
    private func setState(_ newState: State) {
        state = newState
        DispatchQueue.main.async {
            self.onStateChanged?(newState)
        }
    }
    
    private func handleError(_ error: Error) {
        setState(.error(error.localizedDescription))
        DispatchQueue.main.async {
            self.onError?(error)
        }
    }
    
    enum TranscriptionError: LocalizedError {
        case notConfigured
        case invalidURL
        case providerNotSupported
        case connectionFailed(String)
        
        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Transcription service not configured"
            case .invalidURL: return "Invalid WebSocket URL"
            case .providerNotSupported: return "Provider not supported"
            case .connectionFailed(let msg): return "Connection failed: \(msg)"
            }
        }
    }
}

