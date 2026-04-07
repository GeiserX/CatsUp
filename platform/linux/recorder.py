"""Screen + audio recording via FFmpeg.

Supports PipeWire and PulseAudio, auto-detects screen resolution.
"""

import os
import re
import shutil
import signal
import subprocess


def _detect_resolution() -> str:
    """Auto-detect primary display resolution."""
    try:
        out = subprocess.check_output(["xrandr", "--current"], text=True, timeout=3)
        match = re.search(r"(\d+x\d+)\+\d+\+\d+", out)
        if match:
            return match.group(1)
    except Exception:
        pass

    # Wayland fallback via swaymsg
    try:
        out = subprocess.check_output(["swaymsg", "-t", "get_outputs", "-r"], text=True, timeout=3)
        import json
        outputs = json.loads(out)
        for o in outputs:
            if o.get("focused"):
                mode = o.get("current_mode", {})
                return f"{mode.get('width', 1920)}x{mode.get('height', 1080)}"
    except Exception:
        pass

    return "1920x1080"


def _find_audio_source() -> tuple[str, str]:
    """Find the best audio source (monitor of output for system audio).

    Returns (audio_format, audio_device).
    """
    # Try PipeWire first
    if shutil.which("pw-cli"):
        return "pulse", "default"

    # PulseAudio: find monitor source for system audio capture
    try:
        out = subprocess.check_output(
            ["pactl", "list", "short", "sources"], text=True, timeout=3
        )
        for line in out.strip().splitlines():
            if ".monitor" in line:
                source = line.split("\t")[1]
                return "pulse", source
    except Exception:
        pass

    return "pulse", "default"


class Recorder:
    def __init__(self):
        self.process: subprocess.Popen | None = None
        self.output_file: str | None = None

    @property
    def is_recording(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start(self, filename: str, window_id: int | None = None) -> None:
        if self.is_recording:
            return

        os.makedirs(os.path.dirname(filename) or ".", exist_ok=True)

        resolution = _detect_resolution()
        audio_fmt, audio_src = _find_audio_source()

        cmd = [
            "ffmpeg", "-y",
            "-f", "x11grab",
            "-video_size", resolution,
            "-framerate", "30",
            "-i", os.environ.get("DISPLAY", ":0.0"),
            "-f", audio_fmt, "-i", audio_src,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            filename,
        ]

        print(f"[Recorder] Starting: {' '.join(cmd)}")
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.output_file = filename

    def stop(self) -> str | None:
        if not self.process:
            return None

        # Send 'q' to ffmpeg for graceful stop (finalizes MP4 container)
        try:
            self.process.stdin.write(b"q")
            self.process.stdin.flush()
        except Exception:
            pass

        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()

        self.process = None
        result = self.output_file
        self.output_file = None
        return result
