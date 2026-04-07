"""CatsUp configuration — JSON persistence matching macOS Config struct."""

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class Config:
    auto_start_recording: bool = True
    auto_stop_on_meeting_end: bool = True
    trigger_words: list[str] = field(default_factory=lambda: ["User"])
    user_name: str = "User"
    deepgram_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    llm_provider: str = "openai"  # openai, anthropic, ollama
    llm_model: str = "gpt-4o"
    transcription_language: str = "en"
    show_interim_results: bool = True
    notify_on_trigger: bool = True
    recordings_directory: str = ""
    poll_interval_ms: int = 1000
    inactivity_timeout: int = 20

    def __post_init__(self):
        if not self.recordings_directory:
            self.recordings_directory = os.path.expanduser("~/Videos/CatsUp")


def config_path() -> Path:
    config_dir = Path(os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config")))
    app_dir = config_dir / "catsup"
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir / "config.json"


def load_config() -> Config:
    path = config_path()
    if path.exists():
        try:
            data = json.loads(path.read_text())
            return Config(**{k: v for k, v in data.items() if k in Config.__dataclass_fields__})
        except Exception as e:
            print(f"[Config] Error loading config: {e}")
    return Config()


def save_config(cfg: Config) -> None:
    path = config_path()
    try:
        path.write_text(json.dumps(asdict(cfg), indent=2))
    except Exception as e:
        print(f"[Config] Error saving config: {e}")
