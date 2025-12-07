// platform/macos/AudioCaptureSK.swift
// Attach audio capture to a ScreenCaptureKit stream (app audio) and/or capture mic via AVAudioEngine.
// Notes: SCKit can capture app audio tied to the content filter. Mic capture is handled separately.
// References: ScreenCaptureKit audio capture; AVAudioSession/AVAudioEngine docs. 【4】【10】

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia

public final class AudioCaptureSK: NSObject {
    public struct Options {
        public var captureAppAudio: Bool = true
        public var captureMic: Bool = true
        public var micDeviceUID: String? = nil  // optional: target mic input device UID
        public init() {}
    }

    public enum Samples {
        case app(CMSampleBuffer)
        case mic(AVAudioPCMBuffer, AVAudioTime)
    }

    private final class AudioOutput: NSObject, SCStreamOutput {
        let onSamples: (Samples) -> Void
        init(onSamples: @escaping (Samples) -> Void) {
            self.onSamples = onSamples
        }
        func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
            guard outputType == .audio else { return }
            onSamples(.app(sampleBuffer))
        }
    }

    private var options = Options()
    private var stream: SCStream?
    private var audioOutput: AudioOutput?
    private var engine: AVAudioEngine?
    private var micTapInstalled = false
    private var running = false

    public func configure(_ opts: Options) {
        self.options = opts
    }

    // Attach to an existing SCStream to capture app audio.
    public func attach(to stream: SCStream, onSamples: @escaping (Samples) -> Void) throws {
        self.stream = stream
        let out = AudioOutput(onSamples: onSamples)
        self.audioOutput = out
        try stream.addStreamOutput(out, type: .audio, sampleHandlerQueue: .main)
    }

    // Optionally start microphone capture using AVAudioEngine.
    public func startMic(onSamples: @escaping (Samples) -> Void) throws {
        guard options.captureMic else { return }
        let engine = AVAudioEngine()

        // Configure input device: On macOS, selecting a specific input device is lower-level (HAL).
        // AVAudioEngine uses the default input device. Users can set BlackHole/aggregate device as default if needed.
        // See VirtualDevice manager for advanced routing. 【1】【2】
        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)

        input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, time in
            onSamples(.mic(buffer, time))
        }
        engine.prepare()
        try engine.start()
        self.engine = engine
        self.micTapInstalled = true
        self.running = true
    }

    public func stop() {
        if let s = stream, let out = audioOutput {
            do { try s.removeStreamOutput(out, type: .audio) } catch { /* ignore */ }
        }
        audioOutput = nil
        stream = nil

        if let engine = engine {
            if micTapInstalled {
                engine.inputNode.removeTap(onBus: 0)
                micTapInstalled = false
            }
            engine.stop()
            self.engine = nil
        }
        running = false
    }

    public var isRunning: Bool { running }
}
