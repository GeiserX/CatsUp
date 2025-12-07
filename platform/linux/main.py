
import time
import os
import datetime
from detector import MeetingDetector
from ai import ParakeetProvider, ResponseGenerator

def main():
    print("CatsUp Linux Service Started")
    detector = MeetingDetector()
    recorder = Recorder()
    
    # AI Setup
    parakeet = ParakeetProvider(device="cpu") # TODO: Load from config
    responder = ResponseGenerator(enabled=True, trigger_word="Sergio")
    
    is_recording = False
    last_seen = 0
    inactivity_timeout = 20
    
    recordings_dir = os.path.expanduser("~/Videos/CatsUp")
    os.makedirs(recordings_dir, exist_ok=True)
    
    try:
        while True:
            match = detector.detect()
            now = time.time()
            
            if match:
                last_seen = now
                print(f"Meeting detected: {match['title']} ({match['app']})")
                
                if not is_recording:
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    filename = os.path.join(recordings_dir, f"meeting_{timestamp}.mp4")
                    recorder.start(filename)
                    is_recording = True
                    print("Recording started")
            
            if is_recording:
                # Stub: Get audio chunk from recorder or separate stream
                # audio_chunk = recorder.get_last_audio_chunk()
                text = parakeet.transcribe(None)
                if responder.should_trigger(text):
                    resp = responder.generate_response(text)
                    print(f"Smart Response: {resp}")
            
            if is_recording and (now - last_seen > inactivity_timeout):
                print("Meeting ended or inactivity timeout. Stopping recording.")
                recorder.stop()
                is_recording = False
            
            time.sleep(2)
            
    except KeyboardInterrupt:
        print("Stopping...")
        if is_recording:
            recorder.stop()

if __name__ == "__main__":
    main()
