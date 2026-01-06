// platform/macos/RecorderSK.swift
// Orchestrates window-only capture via ScreenCaptureKit and writes .mov with H.264 + AAC.
// - Video: CVPixelBuffer -> AVAssetWriterInputPixelBufferAdaptor
// - App audio: CMSampleBuffer from SCStream .audio output
// - Mic audio: CMSampleBuffer via AVCaptureSession (optional)
// This satisfies: window-only video; app-only audio; optional mic; downloadable recording.

import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreMedia
import CoreVideo

public final class RecorderSK: NSObject {
    public struct Options {
        public var width: Int = 1920
        public var height: Int = 1080
        public var fps: Int = 30
        public var includeCursor: Bool = false
        public var captureAppAudio: Bool = true
        public var captureMic: Bool = true
        public var outputURL: URL
        public init(outputURL: URL) {
            self.outputURL = outputURL
        }
    }

    public enum State { case idle, starting, recording, stopping, stopped, error(Error) }

    private let video = VideoCaptureSK()
    private let audio = AudioCaptureSK()
    private var micCapture: MicCapture?
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var videoAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var appAudioInput: AVAssetWriterInput?
    private var micAudioInput: AVAssetWriterInput?
    private var writerStartTime: CMTime?
    private let queue = DispatchQueue(label: "RecorderSK.writer")
    private(set) public var state: State = .idle

    public func start(windowId: CGWindowID, options: Options, onState: ((State) -> Void)? = nil) async throws {
        guard case .idle = state else { return }
        state = .starting; onState?(state)

        // Prepare writer
        if FileManager.default.fileExists(atPath: options.outputURL.path) {
            try? FileManager.default.removeItem(at: options.outputURL)
        }
        let writer = try AVAssetWriter(outputURL: options.outputURL, fileType: .mov)
        self.writer = writer

        // Video input
        let vSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: options.width,
            AVVideoHeightKey: options.height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 6_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            ]
        ]
        let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: vSettings)
        vIn.expectsMediaDataInRealTime = true
        guard writer.canAdd(vIn) else { throw NSError(domain: "RecorderSK", code: -1, userInfo: [NSLocalizedDescriptionKey: "Cannot add video input"]) }
        writer.add(vIn)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: options.width,
            kCVPixelBufferHeightKey as String: options.height,
        ])
        self.videoInput = vIn
        self.videoAdaptor = adaptor

        // App audio input (AAC)
        if options.captureAppAudio {
            let aIn = makeAACInput()
            guard writer.canAdd(aIn) else { throw NSError(domain: "RecorderSK", code: -2, userInfo: [NSLocalizedDescriptionKey: "Cannot add app audio input"]) }
            writer.add(aIn)
            self.appAudioInput = aIn
        }

        // Mic audio input (AAC)
        if options.captureMic {
            let mIn = makeAACInput()
            guard writer.canAdd(mIn) else { throw NSError(domain: "RecorderSK", code: -3, userInfo: [NSLocalizedDescriptionKey: "Cannot add mic audio input"]) }
            writer.add(mIn)
            self.micAudioInput = mIn
        }

        // Configure capture
        var videoOpts = VideoCaptureSK.Options()
        videoOpts.width = options.width
        videoOpts.height = options.height
        videoOpts.fps = options.fps
        videoOpts.includeCursor = options.includeCursor
        video.configure(videoOpts)
        try await video.start(windowId: windowId) { [weak self] pb, ts in
            guard let self else { return }
            self.handleVideo(pb: pb, ts: ts)
        }

        if let stream = video.currentStream, options.captureAppAudio {
            try audio.attach(to: stream) { [weak self] s in
                guard let self else { return }
                if case let .app(sb) = s { self.handleAppAudio(sampleBuffer: sb) }
            }
        }

        if options.captureMic {
            let mic = MicCapture()
            self.micCapture = mic
            try mic.start { [weak self] sb in
                self?.handleMicAudio(sampleBuffer: sb)
            }
        }

        state = .recording; onState?(state)
    }

    public func stop(onState: ((State) -> Void)? = nil, completion: ((URL?) -> Void)? = nil) {
        guard case .recording = state else { completion?(writer?.outputURL); return }
        state = .stopping; onState?(state)

        audio.stop()
        micCapture?.stop(); micCapture = nil
        video.stop()

        queue.async { [weak self] in
            guard let self, let writer = self.writer else { completion?(nil); return }
            self.videoInput?.markAsFinished()
            self.appAudioInput?.markAsFinished()
            self.micAudioInput?.markAsFinished()
            writer.finishWriting { [weak self] in
                guard let self else { return }
                if writer.status == .completed {
                    self.state = .stopped; onState?(self.state)
                    completion?(writer.outputURL)
                } else {
                    self.state = .error(writer.error ?? NSError(domain: "RecorderSK", code: -4, userInfo: [NSLocalizedDescriptionKey: "Writer failed"]))
                    onState?(self.state)
                    completion?(nil)
                }
                self.cleanup()
            }
        }
    }

    private func cleanup() {
        writer = nil
        videoInput = nil
        videoAdaptor = nil
        appAudioInput = nil
        micAudioInput = nil
        writerStartTime = nil
    }

    private func startWriterIfNeeded(at time: CMTime) {
        guard let writer = writer, writer.status == .unknown else { return }
        writerStartTime = time
        writer.startWriting()
        writer.startSession(atSourceTime: time)
    }

    private func handleVideo(pb: CVPixelBuffer, ts: CMTime) {
        queue.async {
            guard let writer = self.writer, let vIn = self.videoInput, let adaptor = self.videoAdaptor else { return }
            self.startWriterIfNeeded(at: ts)
            guard writer.status == .writing else { return }
            if vIn.isReadyForMoreMediaData {
                _ = adaptor.append(pb, withPresentationTime: ts)
            }
        }
    }

    private func handleAppAudio(sampleBuffer: CMSampleBuffer) {
        queue.async {
            guard let writer = self.writer, let aIn = self.appAudioInput else { return }
            let ts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            self.startWriterIfNeeded(at: ts)
            guard writer.status == .writing else { return }
            if aIn.isReadyForMoreMediaData {
                _ = aIn.append(sampleBuffer)
            }
        }
    }

    private func handleMicAudio(sampleBuffer: CMSampleBuffer) {
        queue.async {
            guard let writer = self.writer, let mIn = self.micAudioInput else { return }
            // Start session at first arriving track (video or audio)
            let ts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            self.startWriterIfNeeded(at: ts)
            guard writer.status == .writing else { return }
            if mIn.isReadyForMoreMediaData {
                _ = mIn.append(sampleBuffer)
            }
        }
    }

    private func makeAACInput() -> AVAssetWriterInput {
        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVNumberOfChannelsKey: 2,
            AVSampleRateKey: 48_000,
            AVEncoderBitRateKey: 128_000
        ]
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
        input.expectsMediaDataInRealTime = true
        return input
    }
}

// MARK: - Mic capture via AVCaptureSession -> CMSampleBuffer

private final class MicCapture: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "RecorderSK.mic")
    private var handler: ((CMSampleBuffer) -> Void)?

    func start(_ onBuffer: @escaping (CMSampleBuffer) -> Void) throws {
        handler = onBuffer
        guard let device = AVCaptureDevice.default(for: .audio) else {
            throw NSError(domain: "MicCapture", code: -10, userInfo: [NSLocalizedDescriptionKey: "No audio input device"])
        }
        let input = try AVCaptureDeviceInput(device: device)
        let output = AVCaptureAudioDataOutput()
        session.beginConfiguration()
        if session.canAddInput(input) { session.addInput(input) }
        if session.canAddOutput(output) { session.addOutput(output) }
        session.commitConfiguration()
        output.setSampleBufferDelegate(self, queue: queue)
        session.startRunning()
    }

    func stop() {
        session.stopRunning()
        handler = nil
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        handler?(sampleBuffer)
    }
}
