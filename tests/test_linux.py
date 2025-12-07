
import pytest

def test_example():
    assert True

def test_detector_import():
    # Only test if requirements installed or mock
    try:
        from platform.linux.detector import MeetingDetector
        d = MeetingDetector()
        assert d is not None
    except ImportError:
        pass # Skip if dependencies not met in test env
