"""Real-time transcription via Deepgram WebSocket.

Captures audio from default mic, streams to Deepgram, emits transcript segments.
"""

import asyncio
import json
import subprocess
import threading
from dataclasses import dataclass

try:
    import websockets
except ImportError:
    websockets = None


@dataclass
class TranscriptSegment:
    text: str
    start: float
    end: float
    is_final: bool
    confidence: float


@dataclass
class TriggerEvent:
    word: str
    timestamp: float
    context: str
    full_transcript: str


class TranscriptionService:
    def __init__(self):
        self.api_key: str = ""
        self.language: str = "en"
        self.trigger_words: list[str] = []
        self.sample_rate: int = 16000

        # Callbacks
        self.on_segment: callable = None
        self.on_interim: callable = None
        self.on_trigger: callable = None
        self.on_error: callable = None

        self._ws = None
        self._running = False
        self._thread: threading.Thread | None = None
        self._ffmpeg: subprocess.Popen | None = None
        self._full_transcript = ""

    def configure(self, api_key: str, language: str = "en", trigger_words: list[str] | None = None):
        self.api_key = api_key
        self.language = language
        self.trigger_words = trigger_words or []

    def start(self) -> None:
        if self._running or not self.api_key:
            return
        if websockets is None:
            print("[Transcription] websockets package not installed")
            return
        self._running = True
        self._full_transcript = ""
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._ffmpeg:
            try:
                self._ffmpeg.terminate()
                self._ffmpeg.wait(timeout=3)
            except Exception:
                pass
            self._ffmpeg = None

    def get_transcript(self) -> str:
        return self._full_transcript

    def _run_loop(self):
        asyncio.run(self._stream())

    async def _stream(self):
        url = (
            f"wss://api.deepgram.com/v1/listen?"
            f"encoding=linear16&sample_rate={self.sample_rate}&channels=1"
            f"&language={self.language}&punctuate=true&interim_results=true"
            f"&smart_format=true"
        )
        if self.trigger_words:
            url += f"&keywords={','.join(self.trigger_words)}"

        headers = {"Authorization": f"Token {self.api_key}"}

        try:
            async with websockets.connect(url, additional_headers=headers) as ws:
                self._ws = ws

                # Start mic capture via ffmpeg → raw PCM
                self._ffmpeg = subprocess.Popen(
                    [
                        "ffmpeg", "-y",
                        "-f", "pulse", "-i", "default",
                        "-ac", "1",
                        "-ar", str(self.sample_rate),
                        "-f", "s16le",
                        "pipe:1",
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                )

                send_task = asyncio.create_task(self._send_audio(ws))
                recv_task = asyncio.create_task(self._recv_messages(ws))

                await asyncio.gather(send_task, recv_task)

        except Exception as e:
            if self.on_error and self._running:
                self.on_error(e)
        finally:
            self._ws = None

    async def _send_audio(self, ws):
        loop = asyncio.get_event_loop()
        chunk_size = self.sample_rate * 2  # 1 second of 16-bit mono

        while self._running and self._ffmpeg and self._ffmpeg.poll() is None:
            try:
                data = await loop.run_in_executor(
                    None, self._ffmpeg.stdout.read, chunk_size
                )
                if not data:
                    break
                await ws.send(data)
            except Exception:
                break

    async def _recv_messages(self, ws):
        try:
            async for message in ws:
                if not self._running:
                    break
                self._handle_message(message)
        except Exception as e:
            if self.on_error and self._running:
                self.on_error(e)

    def _handle_message(self, raw: str):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return

        channel = data.get("channel", {})
        alternatives = channel.get("alternatives", [])
        if not alternatives:
            return

        first = alternatives[0]
        text = first.get("transcript", "")
        if not text:
            return

        confidence = first.get("confidence", 0.0)
        is_final = data.get("is_final", False)
        start = data.get("start", 0.0)
        duration = data.get("duration", 0.0)

        segment = TranscriptSegment(
            text=text,
            start=start,
            end=start + duration,
            is_final=is_final,
            confidence=confidence,
        )

        if is_final:
            self._full_transcript += (" " if self._full_transcript else "") + text
            if self.on_segment:
                self.on_segment(segment)
            self._check_triggers(text, start)
        else:
            if self.on_interim:
                self.on_interim(text)

    def _check_triggers(self, text: str, timestamp: float):
        text_lower = text.lower()
        for word in self.trigger_words:
            if word.lower() in text_lower:
                context = self._full_transcript[-200:] if len(self._full_transcript) > 200 else self._full_transcript
                event = TriggerEvent(
                    word=word,
                    timestamp=timestamp,
                    context=context,
                    full_transcript=self._full_transcript,
                )
                if self.on_trigger:
                    self.on_trigger(event)
