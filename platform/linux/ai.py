
import time

class ParakeetProvider:
    def __init__(self, device="cpu"):
        self.device = device
        print(f"[Parakeet] Initialized on {device}")
        
    def transcribe(self, audio_chunk):
        # Stub
        time.sleep(0.1)
        return " [Parakeet Transcription Placeholder] "

class ResponseGenerator:
    def __init__(self, enabled=False, trigger_word="User"):
        self.enabled = enabled
        self.trigger_word = trigger_word
        
    def should_trigger(self, text):
        if not self.enabled: return False
        return self.trigger_word.lower() in text.lower()
        
    def generate_response(self, context):
        # Stub
        return f"Suggested response to: {context[:20]}..."
