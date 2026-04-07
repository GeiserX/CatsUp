"""Meeting detection via EWMH window scanning.

Checks ALL visible windows for Teams, Zoom, Slack, and Google Meet (in browser).
"""

import re
import subprocess
from dataclasses import dataclass


@dataclass
class Detection:
    app: str  # teams, zoom, slack, meet
    title: str
    window_id: int
    process_name: str
    confidence: float
    phase: str  # prejoin, in_call, presenting, unknown


# Meeting-title keywords (multi-language, matching macOS detector)
_MEETING_KEYWORDS = [
    "meeting", "call", "teams meeting",
    "reunión", "llamada", "réunion", "appel",
    "besprechung", "anruf", "reunião", "chamada",
    "riunione", "chiamata",
]

_MEET_CODE_RE = re.compile(r"[a-z]{3}-[a-z]{4}-[a-z]{3}")
_PARTICIPANT_RE = re.compile(r"[·•(]\s*\d+")
_DURATION_RE = re.compile(r"\d{1,2}:\d{2}")

_BROWSERS = {"google-chrome", "chromium", "firefox", "brave-browser", "microsoft-edge", "epiphany"}

_MEETING_APPS = {
    "teams": {"microsoft teams", "teams"},
    "zoom": {"zoom"},
    "slack": {"slack"},
}


class MeetingDetector:
    def __init__(self):
        self._use_ewmh = True
        self._ewmh = None
        try:
            from ewmh import EWMH
            self._ewmh = EWMH()
        except Exception:
            self._use_ewmh = False

    def _get_windows_ewmh(self) -> list[dict]:
        """Get all visible windows via EWMH (X11)."""
        if not self._ewmh:
            return []
        results = []
        try:
            for win in self._ewmh.getClientList():
                try:
                    name = win.get_wm_name() or ""
                    if isinstance(name, bytes):
                        name = name.decode("utf-8", "ignore")
                    wm_class = win.get_wm_class()
                    app_class = (wm_class[1].lower() if wm_class and len(wm_class) > 1 else "")
                    results.append({
                        "title": name,
                        "app": app_class,
                        "window_id": win.id,
                    })
                except Exception:
                    continue
        except Exception as e:
            print(f"[Detector] EWMH error: {e}")
        return results

    def _get_windows_wmctrl(self) -> list[dict]:
        """Fallback: parse wmctrl -l output."""
        try:
            out = subprocess.check_output(["wmctrl", "-l", "-x"], text=True, timeout=3)
        except Exception:
            return []
        results = []
        for line in out.strip().splitlines():
            parts = line.split(None, 4)
            if len(parts) < 5:
                continue
            wid = int(parts[0], 16)
            wm_class = parts[2].lower()
            title = parts[4]
            app = wm_class.split(".")[-1] if "." in wm_class else wm_class
            results.append({"title": title, "app": app, "window_id": wid})
        return results

    def scan(self) -> list[Detection]:
        windows = self._get_windows_ewmh() if self._use_ewmh else []
        if not windows:
            windows = self._get_windows_wmctrl()

        detections: list[Detection] = []

        for win in windows:
            app_class = win["app"]
            title = win["title"]
            title_lower = title.lower()
            wid = win["window_id"]

            # Identify app type
            detected_app = None
            for app_name, keywords in _MEETING_APPS.items():
                if any(kw in app_class for kw in keywords):
                    detected_app = app_name
                    break

            # Check browsers for Google Meet
            if not detected_app and any(b in app_class for b in _BROWSERS):
                if ("meet.google.com" in title_lower or
                        "google meet" in title_lower or
                        _MEET_CODE_RE.search(title_lower)):
                    detected_app = "meet"

            if not detected_app:
                continue

            # Calculate confidence
            confidence = 0.3  # base: we found the app
            phase = "unknown"

            # Meeting title keywords
            if any(kw in title_lower for kw in _MEETING_KEYWORDS):
                confidence += 0.5
                phase = "prejoin"

            # Participant count → in call
            if _PARTICIPANT_RE.search(title_lower):
                confidence += 0.2
                phase = "in_call"

            # Duration timer → in call
            if _DURATION_RE.search(title_lower):
                confidence += 0.2
                phase = "in_call"

            # Screen sharing
            if any(kw in title_lower for kw in ("presenting", "screen share", "compartiendo", "partage")):
                phase = "presenting"
                confidence += 0.1

            if confidence >= 0.5:
                detections.append(Detection(
                    app=detected_app,
                    title=title,
                    window_id=wid,
                    process_name=app_class,
                    confidence=min(1.0, confidence),
                    phase=phase,
                ))

        return detections

    def detect(self) -> dict | None:
        """Legacy API — returns best detection as dict or None."""
        hits = self.scan()
        if not hits:
            return None
        best = max(hits, key=lambda d: d.confidence)
        return {"title": best.title, "app": best.app, "window_id": best.window_id}
