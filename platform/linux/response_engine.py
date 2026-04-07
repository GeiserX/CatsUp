"""AI response engine — OpenAI, Anthropic, and Ollama support.

Mirrors macOS ResponseEngine.swift patterns.
"""

import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError


class ResponseEngine:
    def __init__(self):
        self.provider: str = "openai"  # openai, anthropic, ollama
        self.api_key: str = ""
        self.model: str = "gpt-4o"
        self.system_prompt: str = (
            "You are a helpful meeting assistant. You have access to the live transcript of a meeting. "
            "When the user seems to need help or is asked a question, provide concise, relevant answers "
            "based on the meeting context. Be concise but helpful."
        )

    def configure(self, provider: str, api_key: str, model: str = ""):
        self.provider = provider
        self.api_key = api_key
        if model:
            self.model = model

    def quick_answer(self, question: str, transcript: str) -> str:
        prompt = (
            f"Based on this meeting transcript, briefly answer: {question}\n\n"
            f"Recent transcript:\n{transcript[-2000:]}\n\n"
            f"Answer concisely in 1-2 sentences."
        )
        return self._call(prompt)

    def generate_response(self, context: str, trigger_phrase: str, user_name: str) -> str:
        prompt = (
            f"## Meeting Context\n\n"
            f"The user's name is: {user_name}\n\n"
            f"### Recent Discussion:\n{context}\n\n"
            f"### What just happened:\n"
            f'Someone mentioned "{user_name}" in: "{trigger_phrase}"\n\n'
            f"Provide a helpful, concise response (2-4 sentences max)."
        )
        return self._call(prompt)

    def _call(self, prompt: str) -> str:
        try:
            if self.provider == "anthropic":
                return self._call_anthropic(prompt)
            elif self.provider == "ollama":
                return self._call_ollama(prompt)
            else:
                return self._call_openai(prompt)
        except Exception as e:
            return f"Error: {e}"

    def _call_openai(self, prompt: str) -> str:
        body = json.dumps({
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 500,
        }).encode()

        req = Request(
            "https://api.openai.com/v1/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )

        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"].strip()

    def _call_anthropic(self, prompt: str) -> str:
        model = self.model if "claude" in self.model else "claude-sonnet-4-5-20250514"
        body = json.dumps({
            "model": model,
            "max_tokens": 500,
            "system": self.system_prompt,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()

        req = Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
        )

        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data["content"][0]["text"].strip()

    def _call_ollama(self, prompt: str) -> str:
        model = self.model if self.model else "llama3.2"
        body = json.dumps({
            "model": model,
            "prompt": f"{self.system_prompt}\n\nUser: {prompt}\n\nAssistant:",
            "stream": False,
        }).encode()

        req = Request(
            "http://localhost:11434/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
        )

        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data["response"].strip()
