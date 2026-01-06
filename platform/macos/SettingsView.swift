// platform/macos/SettingsView.swift
// Elegant settings interface for CatsUp meeting assistant.

import SwiftUI

struct CatsUpSettingsView: View {
    @ObservedObject var coordinator = MeetingCoordinator.shared
    @State private var selectedTab = 0
    
    var body: some View {
        VStack(spacing: 0) {
            // Tab bar
            HStack(spacing: 0) {
                TabButton(title: "General", icon: "gearshape.fill", isSelected: selectedTab == 0) {
                    selectedTab = 0
                }
                TabButton(title: "Trigger Words", icon: "sparkles", isSelected: selectedTab == 1) {
                    selectedTab = 1
                }
                TabButton(title: "AI Services", icon: "brain.head.profile", isSelected: selectedTab == 2) {
                    selectedTab = 2
                }
                TabButton(title: "Recording", icon: "record.circle", isSelected: selectedTab == 3) {
                    selectedTab = 3
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            
            Divider()
                .padding(.top, 12)
            
            // Content
            ScrollView {
                VStack(spacing: 0) {
                    switch selectedTab {
                    case 0:
                        GeneralSettingsTab(config: $coordinator.config)
                    case 1:
                        TriggerWordsTab(config: $coordinator.config)
                    case 2:
                        AIServicesTab(config: $coordinator.config)
                    case 3:
                        RecordingSettingsTab(config: $coordinator.config)
                    default:
                        EmptyView()
                    }
                }
                .padding(24)
            }
        }
        .frame(width: 540, height: 480)
        .background(Color(hex: "1A1B26"))
    }
}

// MARK: - Tab Button

struct TabButton: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                Text(title)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
            }
            .foregroundColor(isSelected ? Color(hex: "6366F1") : Color(hex: "71717A"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(isSelected ? Color(hex: "6366F1").opacity(0.1) : Color.clear)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - General Settings

struct GeneralSettingsTab: View {
    @Binding var config: MeetingCoordinator.Config
    
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSection(title: "User Information") {
                SettingsRow(
                    icon: "person.fill",
                    title: "Your Name",
                    description: "Used for trigger word detection"
                ) {
                    TextField("Enter your name", text: $config.userName)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(8)
                        .frame(width: 200)
                }
            }
            
            SettingsSection(title: "Behavior") {
                SettingsToggle(
                    icon: "play.circle.fill",
                    title: "Auto-start Recording",
                    description: "Automatically start recording when a meeting is detected",
                    isOn: $config.autoStartRecording
                )
                
                SettingsToggle(
                    icon: "stop.circle.fill",
                    title: "Auto-stop Recording",
                    description: "Stop recording when the meeting ends",
                    isOn: $config.autoStopOnMeetingEnd
                )
                
                SettingsToggle(
                    icon: "bell.fill",
                    title: "Trigger Notifications",
                    description: "Show notification when trigger word is detected",
                    isOn: $config.notifyOnTrigger
                )
            }
            
            SettingsSection(title: "Transcription") {
                SettingsRow(
                    icon: "globe",
                    title: "Language",
                    description: "Primary language for transcription"
                ) {
                    Picker("", selection: $config.transcriptionLanguage) {
                        Text("English").tag("en")
                        Text("Spanish").tag("es")
                        Text("French").tag("fr")
                        Text("German").tag("de")
                        Text("Portuguese").tag("pt")
                        Text("Italian").tag("it")
                        Text("Japanese").tag("ja")
                        Text("Korean").tag("ko")
                        Text("Chinese").tag("zh")
                    }
                    .pickerStyle(.menu)
                    .frame(width: 140)
                }
                
                SettingsToggle(
                    icon: "text.cursor",
                    title: "Show Interim Results",
                    description: "Display partial transcription while speaking",
                    isOn: $config.showInterimResults
                )
            }
            
            Spacer()
        }
    }
}

// MARK: - Trigger Words

struct TriggerWordsTab: View {
    @Binding var config: MeetingCoordinator.Config
    @State private var newTriggerWord = ""
    
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Trigger Words")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                
                Text("When these words are spoken in a meeting, CatsUp will generate a contextual AI response to help you.")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "71717A"))
            }
            
            // Add new trigger word
            HStack(spacing: 12) {
                TextField("Add a trigger word...", text: $newTriggerWord)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.05))
                    .cornerRadius(8)
                    .onSubmit {
                        addTriggerWord()
                    }
                
                Button {
                    addTriggerWord()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Color(hex: "6366F1"))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(newTriggerWord.isEmpty)
            }
            
            // Current trigger words
            VStack(alignment: .leading, spacing: 8) {
                Text("Current Trigger Words")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "A1A1AA"))
                
                if config.triggerWords.isEmpty {
                    Text("No trigger words configured")
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "52525B"))
                        .italic()
                        .padding(.vertical, 20)
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(config.triggerWords, id: \.self) { word in
                            TriggerWordChip(word: word) {
                                config.triggerWords.removeAll { $0 == word }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.03))
            .cornerRadius(12)
            
            // Tips
            VStack(alignment: .leading, spacing: 8) {
                Label("Tips", systemImage: "lightbulb.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "F59E0B"))
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("• Add your name to get AI assistance when you're addressed")
                    Text("• Add project names for context-aware responses")
                    Text("• Common phrases like 'any questions?' can trigger summaries")
                }
                .font(.system(size: 12))
                .foregroundColor(Color(hex: "71717A"))
            }
            .padding(16)
            .background(Color(hex: "F59E0B").opacity(0.1))
            .cornerRadius(12)
            
            Spacer()
        }
    }
    
    private func addTriggerWord() {
        let word = newTriggerWord.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !word.isEmpty, !config.triggerWords.contains(word) else { return }
        config.triggerWords.append(word)
        newTriggerWord = ""
    }
}

struct TriggerWordChip: View {
    let word: String
    let onRemove: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 6) {
            Text(word)
                .font(.system(size: 13, weight: .medium))
            
            Button(action: onRemove) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
            }
            .buttonStyle(.plain)
            .opacity(isHovered ? 1 : 0.5)
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(hex: "6366F1").opacity(0.3))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color(hex: "6366F1").opacity(0.5), lineWidth: 1)
        )
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

// MARK: - AI Services

struct AIServicesTab: View {
    @Binding var config: MeetingCoordinator.Config
    @State private var showDeepgramKey = false
    @State private var showOpenAIKey = false
    @State private var showAnthropicKey = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSection(title: "Transcription Service") {
                APIKeyRow(
                    icon: "waveform",
                    title: "Deepgram API Key",
                    description: "For real-time speech-to-text transcription",
                    apiKey: $config.deepgramApiKey,
                    showKey: $showDeepgramKey,
                    placeholder: "Enter Deepgram API key"
                )
            }
            
            SettingsSection(title: "AI Response Provider") {
                SettingsRow(
                    icon: "cpu",
                    title: "LLM Provider",
                    description: "Service for generating AI responses"
                ) {
                    Picker("", selection: $config.llmProvider) {
                        Text("OpenAI").tag("openai")
                        Text("Anthropic").tag("anthropic")
                        Text("Ollama (Local)").tag("ollama")
                    }
                    .pickerStyle(.menu)
                    .frame(width: 140)
                }
                
                if config.llmProvider == "openai" {
                    APIKeyRow(
                        icon: "sparkles",
                        title: "OpenAI API Key",
                        description: "For GPT-based responses",
                        apiKey: $config.openaiApiKey,
                        showKey: $showOpenAIKey,
                        placeholder: "sk-..."
                    )
                    
                    SettingsRow(
                        icon: "slider.horizontal.3",
                        title: "Model",
                        description: "GPT model to use"
                    ) {
                        Picker("", selection: $config.llmModel) {
                            Text("GPT-4o").tag("gpt-4o")
                            Text("GPT-4o mini").tag("gpt-4o-mini")
                            Text("GPT-4.1").tag("gpt-4.1")
                        }
                        .pickerStyle(.menu)
                        .frame(width: 140)
                    }
                }
                
                if config.llmProvider == "anthropic" {
                    APIKeyRow(
                        icon: "brain",
                        title: "Anthropic API Key",
                        description: "For Claude-based responses",
                        apiKey: $config.anthropicApiKey,
                        showKey: $showAnthropicKey,
                        placeholder: "sk-ant-..."
                    )
                    
                    SettingsRow(
                        icon: "slider.horizontal.3",
                        title: "Model",
                        description: "Claude model to use"
                    ) {
                        Picker("", selection: $config.llmModel) {
                            Text("Claude 3.5 Sonnet").tag("claude-3-5-sonnet-20240620")
                            Text("Claude 3.5 Haiku").tag("claude-3-5-haiku-20241022")
                        }
                        .pickerStyle(.menu)
                        .frame(width: 160)
                    }
                }
                
                if config.llmProvider == "ollama" {
                    SettingsRow(
                        icon: "slider.horizontal.3",
                        title: "Model",
                        description: "Local Ollama model"
                    ) {
                        TextField("Model name", text: $config.llmModel)
                            .textFieldStyle(.plain)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.05))
                            .cornerRadius(8)
                            .frame(width: 160)
                    }
                    
                    Text("Make sure Ollama is running locally on port 11434")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "71717A"))
                        .padding(.leading, 32)
                }
            }
            
            SettingsSection(title: "Response Options") {
                SettingsToggle(
                    icon: "speaker.wave.2.fill",
                    title: "Speak Responses",
                    description: "Read AI responses aloud using text-to-speech",
                    isOn: $config.speakResponses
                )
            }
            
            Spacer()
        }
    }
}

struct APIKeyRow: View {
    let icon: String
    let title: String
    let description: String
    @Binding var apiKey: String
    @Binding var showKey: Bool
    let placeholder: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "6366F1"))
                    .frame(width: 20)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                    Text(description)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "71717A"))
                }
            }
            
            HStack(spacing: 8) {
                Group {
                    if showKey {
                        TextField(placeholder, text: $apiKey)
                    } else {
                        SecureField(placeholder, text: $apiKey)
                    }
                }
                .textFieldStyle(.plain)
                .font(.system(size: 12, design: .monospaced))
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.05))
                .cornerRadius(8)
                
                Button {
                    showKey.toggle()
                } label: {
                    Image(systemName: showKey ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "71717A"))
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 30)
        }
    }
}

// MARK: - Recording Settings

struct RecordingSettingsTab: View {
    @Binding var config: MeetingCoordinator.Config
    
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SettingsSection(title: "Storage") {
                SettingsRow(
                    icon: "folder.fill",
                    title: "Recordings Directory",
                    description: config.recordingsDirectory?.path ?? "Default"
                ) {
                    Button("Choose...") {
                        selectDirectory()
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(6)
                }
            }
            
            SettingsSection(title: "Quality") {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Recording settings are optimized for meeting capture:")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "71717A"))
                    
                    HStack(spacing: 20) {
                        QualityBadge(label: "1080p", value: "Video")
                        QualityBadge(label: "H.264", value: "Codec")
                        QualityBadge(label: "AAC", value: "Audio")
                        QualityBadge(label: "48kHz", value: "Sample Rate")
                    }
                }
                .padding(.leading, 30)
            }
            
            SettingsSection(title: "Captured Streams") {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Window video capture (app only)", systemImage: "checkmark.circle.fill")
                    Label("System audio (meeting audio)", systemImage: "checkmark.circle.fill")
                    Label("Microphone (your voice)", systemImage: "checkmark.circle.fill")
                }
                .font(.system(size: 12))
                .foregroundColor(Color(hex: "22C55E"))
                .padding(.leading, 30)
            }
            
            Spacer()
        }
    }
    
    private func selectDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        
        if panel.runModal() == .OK {
            config.recordingsDirectory = panel.url
        }
    }
}

struct QualityBadge: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
            Text(value)
                .font(.system(size: 10))
                .foregroundColor(Color(hex: "71717A"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.05))
        .cornerRadius(8)
    }
}

// MARK: - Helper Views

struct SettingsSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundColor(Color(hex: "A1A1AA"))
            
            VStack(alignment: .leading, spacing: 16) {
                content
            }
        }
    }
}

struct SettingsRow<Accessory: View>: View {
    let icon: String
    let title: String
    let description: String
    @ViewBuilder let accessory: Accessory
    
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(Color(hex: "6366F1"))
                .frame(width: 20)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                Text(description)
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "71717A"))
            }
            
            Spacer()
            
            accessory
        }
    }
}

struct SettingsToggle: View {
    let icon: String
    let title: String
    let description: String
    @Binding var isOn: Bool
    
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(Color(hex: "6366F1"))
                .frame(width: 20)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                Text(description)
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "71717A"))
            }
            
            Spacer()
            
            Toggle("", isOn: $isOn)
                .toggleStyle(.switch)
                .tint(Color(hex: "6366F1"))
        }
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y), proposal: .unspecified)
        }
    }
    
    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []
        
        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var rowHeight: CGFloat = 0
            
            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                
                if x + size.width > maxWidth, x > 0 {
                    x = 0
                    y += rowHeight + spacing
                    rowHeight = 0
                }
                
                positions.append(CGPoint(x: x, y: y))
                x += size.width + spacing
                rowHeight = max(rowHeight, size.height)
            }
            
            self.size = CGSize(width: maxWidth, height: y + rowHeight)
        }
    }
}

