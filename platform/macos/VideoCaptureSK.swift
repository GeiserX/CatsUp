// platform/macos/VideoCaptureSK.swift
// Window-only capture using ScreenCaptureKit.
// Requires Screen Recording permission and ScreenCaptureKit entitlement if using persistent capture.
// References: ScreenCaptureKit overview and sample usage. 【1】【2】

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import CoreVideo

public final class VideoCaptureSK: NSObject {
    public struct Options {
        public var width: Int = 1920
        public var height: Int = 1080
        public var fps: Int = 30
        public var includeCursor: Bool = false
        // Add a read-only accessor so other components (RecorderSK) can attach audio output.
        public var currentStream: SCStream? { stream }
        public init() {}
    }

    private final class VideoOutput: NSObject, SCStreamOutput {
        let onFrame: (CVPixelBuffer, CMTime) -> Void
        init(onFrame: @escaping (CVPixelBuffer, CMTime) -> Void) {
            self.onFrame = onFrame
        }
        func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
            guard outputType == .screen, let pb = sampleBuffer.imageBuffer else { return }
            let ts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            onFrame(pb, ts)
        }
    }

    private var stream: SCStream?
    private var videoOutput: VideoOutput?
    private var contentFilter: SCContentFilter?
    private var options = Options()
    private var isRunning = false

    public func configure(_ opts: Options) {
        self.options = opts
    }

    public func start(windowId: CGWindowID,
                      onFrame: @escaping (CVPixelBuffer, CMTime) -> Void) async throws {
        guard !isRunning else { return }
        // Fetch shareable content
        let content = try await SCShareableContent.current
        guard let scWindow = content.windows.first(where: { $0.windowID == windowId }) else {
            throw NSError(domain: "VideoCaptureSK", code: 1, userInfo: [NSLocalizedDescriptionKey: "Window not found in shareable content"])
        }

        // Build content filter for a single window (desktop-independent)
        let filter = SCContentFilter(desktopIndependentWindow: scWindow)
        self.contentFilter = filter

        // Configure stream
        let cfg = SCStreamConfiguration()
        cfg.width = options.width
        cfg.height = options.height
        cfg.showsCursor = options.includeCursor
        // Target FPS via minimumFrameInterval = 1/fps
        if options.fps > 0 {
            cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        }
        cfg.pixelFormat = kCVPixelFormatType_32BGRA

        let stream = SCStream(filter: filter, configuration: cfg, delegate: self)
        self.stream = stream

        // Attach output
        let videoOut = VideoOutput(onFrame: onFrame)
        self.videoOutput = videoOut
        try stream.addStreamOutput(videoOut, type: .screen, sampleHandlerQueue: .main)

        try stream.startCapture()
        isRunning = true
    }

    public func stop() {
        guard isRunning else { return }
        defer {
            isRunning = false
            videoOutput = nil
            stream = nil
            contentFilter = nil
        }
        do {
            try stream?.stopCapture()
        } catch {
            // Ignore stop errors
        }
    }
}

extension VideoCaptureSK: SCStreamDelegate {
    public func stream(_ stream: SCStream, didStopWithError error: Error) {
        // You can forward this error to your app’s event bus.
        // print("VideoCaptureSK stream stopped with error: \(error.localizedDescription)")
    }
}
