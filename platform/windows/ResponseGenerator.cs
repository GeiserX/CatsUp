using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace MeetingAssistant.Windows.AI
{
    public class ResponseGenerator
    {
        private string _triggerWord = "User";
        private bool _enabled = false;
        private string _provider = "openai"; // openai, anthropic, ollama
        private string _apiKey = "";
        private string _model = "gpt-4o";
        private string _systemPrompt = "You are a helpful meeting assistant. You have access to the live transcript of a meeting. When the user seems to need help or is asked a question, provide concise, relevant answers. Be concise but helpful.";

        private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(30) };

        public void Configure(bool enabled, string triggerWord)
        {
            _enabled = enabled;
            _triggerWord = triggerWord;
        }

        public void ConfigureAI(string provider, string apiKey, string model = "")
        {
            _provider = provider;
            _apiKey = apiKey;
            if (!string.IsNullOrEmpty(model)) _model = model;
        }

        public bool ShouldTrigger(string transcription)
        {
            if (!_enabled) return false;
            return transcription.Contains(_triggerWord, StringComparison.OrdinalIgnoreCase);
        }

        public async Task<string> GenerateResponseAsync(string conversationContext)
        {
            if (string.IsNullOrEmpty(_apiKey) && _provider != "ollama")
                return $"No API key configured for {_provider}";

            try
            {
                return _provider switch
                {
                    "anthropic" => await CallAnthropicAsync(conversationContext),
                    "ollama" => await CallOllamaAsync(conversationContext),
                    _ => await CallOpenAIAsync(conversationContext),
                };
            }
            catch (Exception ex)
            {
                return $"Error: {ex.Message}";
            }
        }

        public async Task<string> QuickAnswerAsync(string question, string transcript)
        {
            var prompt = $"Based on this meeting transcript, briefly answer: {question}\n\n" +
                         $"Recent transcript:\n{transcript[Math.Max(0, transcript.Length - 2000)..]}\n\n" +
                         "Answer concisely in 1-2 sentences.";
            return await GenerateResponseAsync(prompt);
        }

        private async Task<string> CallOpenAIAsync(string prompt)
        {
            var body = JsonSerializer.Serialize(new
            {
                model = _model,
                messages = new[]
                {
                    new { role = "system", content = _systemPrompt },
                    new { role = "user", content = prompt }
                },
                temperature = 0.7,
                max_tokens = 500
            });

            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
            request.Headers.Add("Authorization", $"Bearer {_apiKey}");

            var response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString()?.Trim() ?? "";
        }

        private async Task<string> CallAnthropicAsync(string prompt)
        {
            var model = _model.Contains("claude") ? _model : "claude-sonnet-4-5-20250514";
            var body = JsonSerializer.Serialize(new
            {
                model,
                max_tokens = 500,
                system = _systemPrompt,
                messages = new[] { new { role = "user", content = prompt } }
            });

            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
            request.Headers.Add("x-api-key", _apiKey);
            request.Headers.Add("anthropic-version", "2023-06-01");

            var response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement
                .GetProperty("content")[0]
                .GetProperty("text")
                .GetString()?.Trim() ?? "";
        }

        private async Task<string> CallOllamaAsync(string prompt)
        {
            var model = string.IsNullOrEmpty(_model) ? "llama3.2" : _model;
            var body = JsonSerializer.Serialize(new
            {
                model,
                prompt = $"{_systemPrompt}\n\nUser: {prompt}\n\nAssistant:",
                stream = false
            });

            var request = new HttpRequestMessage(HttpMethod.Post, "http://localhost:11434/api/generate")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };

            var response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement
                .GetProperty("response")
                .GetString()?.Trim() ?? "";
        }
    }
}
