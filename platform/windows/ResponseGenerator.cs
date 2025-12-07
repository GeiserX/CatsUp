using System;
using System.Threading.Tasks;

namespace MeetingAssistant.Windows.AI
{
    public class ResponseGenerator
    {
        private string _triggerWord = "User";
        private bool _enabled = false;

        public void Configure(bool enabled, string triggerWord)
        {
            _enabled = enabled;
            _triggerWord = triggerWord;
        }

        public bool ShouldTrigger(string transcription)
        {
            if (!_enabled) return false;
            return transcription.Contains(_triggerWord, StringComparison.OrdinalIgnoreCase);
        }

        public async Task<string> GenerateResponseAsync(string conversationContext)
        {
            // Stub: LLM inference to generate response
            await Task.Delay(500);
            return $"Suggested response to '{conversationContext.Substring(0, Math.Min(20, conversationContext.Length))}...'";
        }
    }
}
