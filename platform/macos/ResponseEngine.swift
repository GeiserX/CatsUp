// platform/macos/ResponseEngine.swift
// AI-powered response generation connecting transcript context + documents.
// Uses OpenAI/Anthropic/local LLM to generate contextual answers.

import Foundation

public final class ResponseEngine {
    
    // MARK: - Types
    
    public struct Config {
        public var provider: LLMProvider = .openai
        public var apiKey: String
        public var model: String = "gpt-4o"
        public var maxContextTokens: Int = 4000
        public var temperature: Double = 0.7
        public var systemPrompt: String = """
            You are a helpful meeting assistant. You have access to the live transcript of a meeting.
            When the user (identified by their name being spoken) seems to need help or is asked a question,
            you provide concise, relevant answers based on the meeting context and any connected documents.
            
            Be concise but helpful. If you're unsure, say so. Focus on what's most relevant to the current discussion.
            """
        
        public init(apiKey: String) {
            self.apiKey = apiKey
        }
    }
    
    public enum LLMProvider: String {
        case openai
        case anthropic
        case ollama
    }
    
    public struct Document {
        public let id: String
        public let title: String
        public let content: String
        public let url: String?
        public let relevanceScore: Double?
        
        public init(id: String, title: String, content: String, url: String? = nil, relevanceScore: Double? = nil) {
            self.id = id
            self.title = title
            self.content = content
            self.url = url
            self.relevanceScore = relevanceScore
        }
    }
    
    public struct ResponseContext {
        public let transcript: String
        public let recentContext: String // last ~2 minutes
        public let triggerPhrase: String
        public let documents: [Document]
        public let userName: String
        
        public init(transcript: String, recentContext: String, triggerPhrase: String, documents: [Document] = [], userName: String) {
            self.transcript = transcript
            self.recentContext = recentContext
            self.triggerPhrase = triggerPhrase
            self.documents = documents
            self.userName = userName
        }
    }
    
    public struct Response {
        public let text: String
        public let confidence: Double
        public let suggestedActions: [String]
        public let citations: [Citation]
        
        public struct Citation {
            public let documentId: String
            public let snippet: String
        }
    }
    
    // MARK: - Properties
    
    private var config: Config?
    
    // MARK: - Public API
    
    public init() {}
    
    public func configure(_ config: Config) {
        self.config = config
    }
    
    /// Generate a response based on meeting context
    public func generateResponse(context: ResponseContext) async throws -> Response {
        guard let config = config else {
            throw ResponseError.notConfigured
        }
        
        let prompt = buildPrompt(context: context)
        
        switch config.provider {
        case .openai:
            return try await callOpenAI(prompt: prompt, config: config)
        case .anthropic:
            return try await callAnthropic(prompt: prompt, config: config)
        case .ollama:
            return try await callOllama(prompt: prompt, config: config)
        }
    }
    
    /// Stream response for real-time display
    public func generateResponseStream(context: ResponseContext) -> AsyncThrowingStream<String, Error> {
        return AsyncThrowingStream { continuation in
            Task {
                guard let config = self.config else {
                    continuation.finish(throwing: ResponseError.notConfigured)
                    return
                }
                
                let prompt = self.buildPrompt(context: context)
                
                do {
                    switch config.provider {
                    case .openai:
                        try await self.streamOpenAI(prompt: prompt, config: config, continuation: continuation)
                    case .anthropic:
                        try await self.streamAnthropic(prompt: prompt, config: config, continuation: continuation)
                    case .ollama:
                        try await self.streamOllama(prompt: prompt, config: config, continuation: continuation)
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
    
    /// Quick answer mode - shorter, faster responses
    public func quickAnswer(question: String, transcript: String) async throws -> String {
        guard let config = config else {
            throw ResponseError.notConfigured
        }
        
        let prompt = """
        Based on this meeting transcript, briefly answer: \(question)
        
        Recent transcript:
        \(String(transcript.suffix(2000)))
        
        Answer concisely in 1-2 sentences.
        """
        
        let response = try await callOpenAI(prompt: prompt, config: config)
        return response.text
    }
    
    // MARK: - Prompt Building
    
    private func buildPrompt(context: ResponseContext) -> String {
        var prompt = """
        ## Meeting Context
        
        The user's name is: \(context.userName)
        
        ### Recent Discussion (last ~2 minutes):
        \(context.recentContext)
        
        ### What just happened:
        Someone mentioned "\(context.userName)" in the following context:
        "\(context.triggerPhrase)"
        
        """
        
        if !context.documents.isEmpty {
            prompt += "\n### Relevant Documents:\n"
            for doc in context.documents.prefix(3) {
                prompt += """
                
                **\(doc.title)**
                \(String(doc.content.prefix(500)))...
                
                """
            }
        }
        
        prompt += """
        
        ### Your Task:
        Based on the meeting context and any relevant documents, provide a helpful response that \(context.userName) might need.
        Consider:
        1. Were they asked a question? Answer it.
        2. Are they expected to provide input? Suggest relevant points.
        3. Is there context from documents that would help? Summarize it.
        
        Keep your response concise (2-4 sentences max) and directly useful.
        """
        
        return prompt
    }
    
    // MARK: - OpenAI API
    
    private func callOpenAI(prompt: String, config: Config) async throws -> Response {
        let url = URL(string: "https://api.openai.com/v1/chat/completions")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": config.model,
            "messages": [
                ["role": "system", "content": config.systemPrompt],
                ["role": "user", "content": prompt]
            ],
            "temperature": config.temperature,
            "max_tokens": 500
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw ResponseError.apiError("OpenAI API error")
        }
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw ResponseError.parseError
        }
        
        return Response(
            text: content.trimmingCharacters(in: .whitespacesAndNewlines),
            confidence: 0.9,
            suggestedActions: [],
            citations: []
        )
    }
    
    private func streamOpenAI(prompt: String, config: Config, continuation: AsyncThrowingStream<String, Error>.Continuation) async throws {
        let url = URL(string: "https://api.openai.com/v1/chat/completions")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": config.model,
            "messages": [
                ["role": "system", "content": config.systemPrompt],
                ["role": "user", "content": prompt]
            ],
            "temperature": config.temperature,
            "max_tokens": 500,
            "stream": true
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            continuation.finish(throwing: ResponseError.apiError("OpenAI streaming error"))
            return
        }
        
        for try await line in bytes.lines {
            if line.hasPrefix("data: ") {
                let jsonString = String(line.dropFirst(6))
                if jsonString == "[DONE]" {
                    continuation.finish()
                    return
                }
                
                if let data = jsonString.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let choices = json["choices"] as? [[String: Any]],
                   let first = choices.first,
                   let delta = first["delta"] as? [String: Any],
                   let content = delta["content"] as? String {
                    continuation.yield(content)
                }
            }
        }
        
        continuation.finish()
    }
    
    // MARK: - Anthropic API
    
    private func callAnthropic(prompt: String, config: Config) async throws -> Response {
        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(config.apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": config.model.contains("claude") ? config.model : "claude-3-5-sonnet-20240620",
            "max_tokens": 500,
            "system": config.systemPrompt,
            "messages": [
                ["role": "user", "content": prompt]
            ]
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw ResponseError.apiError("Anthropic API error")
        }
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let first = content.first,
              let text = first["text"] as? String else {
            throw ResponseError.parseError
        }
        
        return Response(
            text: text.trimmingCharacters(in: .whitespacesAndNewlines),
            confidence: 0.9,
            suggestedActions: [],
            citations: []
        )
    }
    
    private func streamAnthropic(prompt: String, config: Config, continuation: AsyncThrowingStream<String, Error>.Continuation) async throws {
        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(config.apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": config.model.contains("claude") ? config.model : "claude-3-5-sonnet-20240620",
            "max_tokens": 500,
            "system": config.systemPrompt,
            "messages": [
                ["role": "user", "content": prompt]
            ],
            "stream": true
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (bytes, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            continuation.finish(throwing: ResponseError.apiError("Anthropic streaming error"))
            return
        }
        
        // Parse SSE response
        if let text = String(data: bytes, encoding: .utf8) {
            for line in text.split(separator: "\n") {
                if line.hasPrefix("data: ") {
                    let jsonString = String(line.dropFirst(6))
                    if let data = jsonString.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let delta = json["delta"] as? [String: Any],
                       let content = delta["text"] as? String {
                        continuation.yield(content)
                    }
                }
            }
        }
        
        continuation.finish()
    }
    
    // MARK: - Ollama (Local LLM)
    
    private func callOllama(prompt: String, config: Config) async throws -> Response {
        let url = URL(string: "http://localhost:11434/api/generate")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": config.model.isEmpty ? "llama3.2" : config.model,
            "prompt": "\(config.systemPrompt)\n\nUser: \(prompt)\n\nAssistant:",
            "stream": false
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let response = json["response"] as? String else {
            throw ResponseError.parseError
        }
        
        return Response(
            text: response.trimmingCharacters(in: .whitespacesAndNewlines),
            confidence: 0.8,
            suggestedActions: [],
            citations: []
        )
    }
    
    private func streamOllama(prompt: String, config: Config, continuation: AsyncThrowingStream<String, Error>.Continuation) async throws {
        let url = URL(string: "http://localhost:11434/api/generate")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": config.model.isEmpty ? "llama3.2" : config.model,
            "prompt": "\(config.systemPrompt)\n\nUser: \(prompt)\n\nAssistant:",
            "stream": true
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (bytes, _) = try await URLSession.shared.bytes(for: request)
        
        for try await line in bytes.lines {
            if let data = line.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let response = json["response"] as? String {
                continuation.yield(response)
                
                if json["done"] as? Bool == true {
                    continuation.finish()
                    return
                }
            }
        }
        
        continuation.finish()
    }
    
    // MARK: - Errors
    
    enum ResponseError: LocalizedError {
        case notConfigured
        case apiError(String)
        case parseError
        
        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Response engine not configured"
            case .apiError(let msg): return msg
            case .parseError: return "Failed to parse API response"
            }
        }
    }
}






