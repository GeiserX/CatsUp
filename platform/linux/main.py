#!/usr/bin/env python3
"""CatsUp Linux — AI-powered meeting assistant.

Detects meetings (Teams, Zoom, Slack, Google Meet), records screen + audio,
transcribes in real-time via Deepgram, and generates AI responses on trigger words.
"""

import datetime
import os
import time

from config import Config, load_config, save_config
from detector import MeetingDetector
from recorder import Recorder
from response_engine import ResponseEngine
from transcription import TranscriptionService


def main():
    print("CatsUp Linux Service Started")

    cfg = load_config()
    os.makedirs(cfg.recordings_directory, exist_ok=True)

    detector = MeetingDetector()
    recorder = Recorder()

    # Transcription
    transcription = TranscriptionService()
    if cfg.deepgram_api_key:
        transcription.configure(
            api_key=cfg.deepgram_api_key,
            language=cfg.transcription_language,
            trigger_words=cfg.trigger_words,
        )

    # AI response engine
    response_engine = ResponseEngine()
    provider_key = {
        "openai": cfg.openai_api_key,
        "anthropic": cfg.anthropic_api_key,
        "ollama": "ollama",
    }.get(cfg.llm_provider, cfg.openai_api_key)

    if provider_key:
        response_engine.configure(
            provider=cfg.llm_provider,
            api_key=provider_key,
            model=cfg.llm_model,
        )

    # Wire up callbacks
    transcription.on_segment = lambda seg: print(f"[Transcript] {seg.text}")
    transcription.on_interim = lambda text: print(f"[Interim] {text}", end="\r")

    def on_trigger(event):
        print(f"\n[Trigger] '{event.word}' detected!")
        if provider_key:
            resp = response_engine.generate_response(
                context=event.context,
                trigger_phrase=event.context,
                user_name=cfg.user_name,
            )
            print(f"[AI Response] {resp}")

    transcription.on_trigger = on_trigger
    transcription.on_error = lambda e: print(f"[Transcription Error] {e}")

    is_recording = False
    last_seen = 0.0

    print(f"[Config] Provider: {cfg.llm_provider}, Trigger words: {cfg.trigger_words}")
    print(f"[Config] Deepgram: {'configured' if cfg.deepgram_api_key else 'not configured'}")
    print(f"[Config] Recordings: {cfg.recordings_directory}")
    print("Detecting meetings... (Ctrl+C to stop)")

    try:
        while True:
            match = detector.detect()
            now = time.time()

            if match:
                last_seen = now
                if not is_recording:
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    app = match["app"]
                    filename = os.path.join(cfg.recordings_directory, f"{app}_{timestamp}.mp4")
                    recorder.start(filename, window_id=match.get("window_id"))
                    is_recording = True
                    print(f"[Recording] Started: {match['title']} ({app})")

                    # Start transcription if configured
                    if cfg.deepgram_api_key:
                        transcription.start()

            if is_recording and (now - last_seen > cfg.inactivity_timeout):
                print("[Recording] Meeting ended or inactivity timeout. Stopping.")
                output = recorder.stop()
                transcription.stop()
                is_recording = False

                # Save transcript alongside recording
                if output:
                    transcript = transcription.get_transcript()
                    if transcript:
                        txt_path = output.rsplit(".", 1)[0] + ".txt"
                        with open(txt_path, "w") as f:
                            f.write(f"# Meeting Transcript\n")
                            f.write(f"Date: {datetime.datetime.now()}\n\n---\n\n")
                            f.write(transcript)
                        print(f"[Transcript] Saved: {txt_path}")

            time.sleep(cfg.poll_interval_ms / 1000.0)

    except KeyboardInterrupt:
        print("\nStopping...")
        if is_recording:
            recorder.stop()
            transcription.stop()
        save_config(cfg)


if __name__ == "__main__":
    main()
