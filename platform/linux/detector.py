
import time
from ewmh import EWMH

class MeetingDetector:
    def __init__(self):
        self.ewmh = EWMH()
        self.meeting_apps = [
            "zoom", "teams", "google-chrome", "firefox", "slack"
        ]
    
    def get_active_window(self):
        try:
            win = self.ewmh.getActiveWindow()
            if not win: return None
            
            name = win.get_wm_name()
            if isinstance(name, bytes): name = name.decode('utf-8', 'ignore')
            
            # Get class
            wm_class = win.get_wm_class()
            app_class = wm_class[1].lower() if wm_class and len(wm_class) > 1 else ""
            
            return {
                "title": name,
                "app": app_class,
                "window_id": win.id
            }
        except Exception as e:
            print(f"Error checking window: {e}")
            return None

    def detect(self):
        win = self.get_active_window()
        if not win: return None
        
        # Simple heuristic matching
        is_meeting = False
        if "zoom" in win["app"]: is_meeting = True
        if "teams" in win["app"]: is_meeting = True
        if "meet" in win["title"].lower(): is_meeting = True
        
        if is_meeting:
            return win
        return None
