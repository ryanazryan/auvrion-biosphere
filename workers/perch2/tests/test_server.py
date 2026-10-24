import io
import unittest
import wave
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import validate_and_resample


def wav_bytes(rate=16000, duration=0.1):
    pcm = b"\x00\x00" * int(rate * duration)
    handle = io.BytesIO()
    with wave.open(handle, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(pcm)
    return handle.getvalue()

class WorkerValidationTests(unittest.TestCase):
    def test_resamples_to_32khz(self):
        actual = validate_and_resample(wav_bytes())
        with wave.open(io.BytesIO(actual), "rb") as wav:
            self.assertEqual(wav.getframerate(), 32000)
            self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(wav.getsampwidth(), 2)
            self.assertEqual(wav.getnframes(), 3200)

    def test_rejects_invalid_wave(self):
        with self.assertRaises(ValueError):
            validate_and_resample(b"hello-world")

    def test_rejects_audio_over_30_seconds(self):
        with self.assertRaises(ValueError):
            validate_and_resample(wav_bytes(duration=31))

if __name__ == "__main__": unittest.main()
