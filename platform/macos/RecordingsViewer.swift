// platform/macos/RecordingsViewer.swift
// Recordings viewer with video playback and transcription display

import SwiftUI
import AVKit
import UniformTypeIdentifiers

// MARK: - Recordings Window Controller

@MainActor
final class RecordingsWindowController {
    static let shared = RecordingsWindowController()
    
    private var window: NSWindow?
    
    func show() {
        if let window = window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        
        let recordingsView = RecordingsViewerView()
        let hostingView = NSHostingView(rootView: recordingsView)
        
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 650),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        
        window.contentView = hostingView
        window.title = "CatsUp Recordings"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(Color(hex: "1A1B26"))
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 700, height: 500)
        window.center()
        
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        self.window = window
    }
}

// MARK: - Recordings Viewer View

struct RecordingsViewerView: View {
    @State private var recordings: [Recording] = []
    @State private var selectedRecording: Recording?
    @State private var searchText = ""
    
    struct Recording: Identifiable, Hashable {
        let id = UUID()
        let url: URL
        let name: String
        let date: Date
        let size: Int64
        let duration: TimeInterval?
        let hasTranscription: Bool
        
        func hash(into hasher: inout Hasher) {
            hasher.combine(url)
        }
        
        static func == (lhs: Recording, rhs: Recording) -> Bool {
            lhs.url == rhs.url
        }
    }
    
    private var filteredRecordings: [Recording] {
        if searchText.isEmpty {
            return recordings
        }
        return recordings.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }
    
    var body: some View {
        HSplitView {
            // Sidebar - Recordings List
            VStack(spacing: 0) {
                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search recordings...", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(10)
                .background(Color.primary.opacity(0.05))
                
                Divider()
                
                // Recordings list
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(filteredRecordings) { recording in
                            RecordingListItem(
                                recording: recording,
                                isSelected: selectedRecording?.id == recording.id
                            )
                            .onTapGesture {
                                selectedRecording = recording
                            }
                        }
                    }
                    .padding(8)
                }
                
                Divider()
                
                // Bottom actions
                HStack {
                    Button {
                        openRecordingsFolder()
                    } label: {
                        Label("Open Folder", systemImage: "folder")
                            .font(.system(size: 11))
                    }
                    .buttonStyle(.plain)
                    
                    Spacer()
                    
                    Text("\(recordings.count) recordings")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                .padding(10)
            }
            .frame(minWidth: 250, maxWidth: 350)
            .background(Color(hex: "1A1B26"))
            
            // Main content - Player & Transcription
            if let recording = selectedRecording {
                RecordingDetailView(recording: recording)
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "video.slash")
                        .font(.system(size: 48))
                        .foregroundStyle(.tertiary)
                    Text("Select a recording")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(hex: "16161E"))
            }
        }
        .onAppear {
            loadRecordings()
        }
    }
    
    private func loadRecordings() {
        let coordinator = MeetingCoordinator.shared
        guard let recordingsDir = coordinator.config.recordingsDirectory else { return }
        
        let fm = FileManager.default
        guard fm.fileExists(atPath: recordingsDir.path) else { return }
        
        do {
            let files = try fm.contentsOfDirectory(at: recordingsDir, includingPropertiesForKeys: [.creationDateKey, .fileSizeKey])
                .filter { ["mp4", "mov", "m4a", "m4v"].contains($0.pathExtension.lowercased()) }
                .sorted { url1, url2 in
                    let date1 = (try? url1.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? Date.distantPast
                    let date2 = (try? url2.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? Date.distantPast
                    return date1 > date2
                }
            
            recordings = files.compactMap { url -> Recording? in
                let attrs = try? url.resourceValues(forKeys: [.creationDateKey, .fileSizeKey])
                let size = Int64(attrs?.fileSize ?? 0)
                
                // Check for transcription file
                let transcriptionURL = url.deletingPathExtension().appendingPathExtension("txt")
                let hasTranscription = fm.fileExists(atPath: transcriptionURL.path)
                
                // Get duration
                let asset = AVAsset(url: url)
                let duration = CMTimeGetSeconds(asset.duration)
                
                return Recording(
                    url: url,
                    name: url.deletingPathExtension().lastPathComponent,
                    date: attrs?.creationDate ?? Date(),
                    size: size,
                    duration: duration.isNaN ? nil : duration,
                    hasTranscription: hasTranscription
                )
            }
        } catch {
            print("Error loading recordings: \(error)")
        }
    }
    
    private func openRecordingsFolder() {
        let coordinator = MeetingCoordinator.shared
        if let recordingsDir = coordinator.config.recordingsDirectory {
            try? FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
            NSWorkspace.shared.open(recordingsDir)
        }
    }
}

// MARK: - Recording List Item

struct RecordingListItem: View {
    let recording: RecordingsViewerView.Recording
    let isSelected: Bool
    
    private var dateFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }
    
    var body: some View {
        HStack(spacing: 10) {
            // Thumbnail/icon
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(hex: "7C3AED").opacity(0.2))
                    .frame(width: 40, height: 40)
                
                Image(systemName: recording.url.pathExtension == "m4a" ? "waveform" : "video.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(Color(hex: "7C3AED"))
            }
            
            VStack(alignment: .leading, spacing: 3) {
                Text(recording.name)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                
                HStack(spacing: 6) {
                    Text(dateFormatter.string(from: recording.date))
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    
                    if let duration = recording.duration {
                        Text("•")
                            .foregroundStyle(.tertiary)
                        Text(formatDuration(duration))
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                    
                    if recording.hasTranscription {
                        Image(systemName: "text.bubble.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(Color(hex: "7C3AED"))
                    }
                }
            }
            
            Spacer()
        }
        .padding(8)
        .background(isSelected ? Color(hex: "7C3AED").opacity(0.2) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    
    private func formatDuration(_ seconds: TimeInterval) -> String {
        let hours = Int(seconds) / 3600
        let minutes = (Int(seconds) % 3600) / 60
        let secs = Int(seconds) % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Recording Detail View

struct RecordingDetailView: View {
    let recording: RecordingsViewerView.Recording
    
    @State private var player: AVPlayer?
    @State private var transcription: String = ""
    @State private var showSubtitles = true
    @State private var currentTime: TimeInterval = 0
    
    var body: some View {
        VStack(spacing: 0) {
            // Video player area
            ZStack {
                if let player = player {
                    VideoPlayer(player: player)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    
                    // Subtitles overlay
                    if showSubtitles && !transcription.isEmpty {
                        VStack {
                            Spacer()
                            Text(getCurrentSubtitle())
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(Color.black.opacity(0.7))
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .padding(.bottom, 60)
                        }
                    }
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.black)
                    
                    ProgressView()
                        .scaleEffect(1.5)
                }
            }
            .aspectRatio(16/9, contentMode: .fit)
            .padding()
            
            Divider()
            
            // Transcription panel
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Transcription", systemImage: "text.bubble")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                    
                    Spacer()
                    
                    Toggle("Subtitles", isOn: $showSubtitles)
                        .toggleStyle(.switch)
                        .scaleEffect(0.7)
                    
                    Button {
                        exportTranscription()
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12))
                    }
                    .buttonStyle(.plain)
                    .disabled(transcription.isEmpty)
                }
                .padding(.horizontal)
                .padding(.top, 8)
                
                if transcription.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "text.badge.xmark")
                            .font(.system(size: 24))
                            .foregroundStyle(.tertiary)
                        Text("No transcription available")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        
                        Button {
                            transcribeRecording()
                        } label: {
                            Label("Transcribe Now", systemImage: "waveform.badge.plus")
                                .font(.system(size: 12))
                        }
                        .buttonStyle(.bordered)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        Text(transcription)
                            .font(.system(size: 12))
                            .foregroundStyle(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                            .textSelection(.enabled)
                    }
                }
            }
            .frame(height: 180)
            .background(Color(hex: "16161E"))
        }
        .background(Color(hex: "1A1B26"))
        .onAppear {
            loadRecording()
        }
        .onChange(of: recording) { newRecording in
            loadRecording()
        }
    }
    
    private func loadRecording() {
        player = AVPlayer(url: recording.url)
        loadTranscription()
    }
    
    private func loadTranscription() {
        let transcriptionURL = recording.url.deletingPathExtension().appendingPathExtension("txt")
        if let text = try? String(contentsOf: transcriptionURL, encoding: .utf8) {
            transcription = text
        } else {
            transcription = ""
        }
    }
    
    private func getCurrentSubtitle() -> String {
        // Simple: show last ~50 chars of transcription
        // In a real app, this would be time-synced with the video
        let suffix = transcription.suffix(100)
        if let lastSentence = suffix.split(separator: ".").last {
            return String(lastSentence).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return String(suffix)
    }
    
    private func transcribeRecording() {
        // TODO: Implement local transcription with Whisper
        print("Transcription requested for: \(recording.url)")
    }
    
    private func exportTranscription() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = "\(recording.name)_transcript.txt"
        
        panel.begin { response in
            if response == .OK, let url = panel.url {
                try? transcription.write(to: url, atomically: true, encoding: .utf8)
            }
        }
    }
}

