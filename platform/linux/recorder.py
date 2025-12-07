
import subprocess
import os
import signal
import time

class Recorder:
    def __init__(self):
        self.process = None

    def start(self, filename, window_id=None):
        if self.process: return
        
        # Determine display size or window geometry
        # For simplicity, recording full screen :0.0. 
        # In a real app we'd fit to window or use specific x11grab region.
        
        # Audio: assuming default pulse source. 
        # User might need to configure this to be the monitor of the output to capture system audio.
        
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "x11grab",
            "-video_size", "1920x1080", # TODO: Detect screen size
            "-framerate", "30",
            "-i", ":0.0",
            "-f", "pulse", "-i", "default", # Audio
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            filename
        ]
        
        print(f"Starting recording: {' '.join(cmd)}")
        self.process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def stop(self):
        if not self.process: return
        
        # Graceful stop to finalize MP4
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
        
        self.process = None
