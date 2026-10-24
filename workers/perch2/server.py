#!/usr/bin/env python3
"""Local, loopback-only Perch 2.0 worker for AB-WC-023 Slice 03A.

Run from the SAME Python venv that successfully ran the benchmark. This
process loads one model and handles one inference at a time. Never publish this
server through a reverse proxy; Next.js is the sole authenticated client.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import math
import os
import sys
import tempfile
import wave
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MAX_BYTES = 10 * 1024 * 1024
MAX_SECONDS = 30
VALID_RATES = {16000, 44100, 48000}
MODEL = None
SECRET = ""


def validate_and_resample(raw: bytes) -> bytes:
    """Verify PCM16 WAV; resample to the Perch 2.0 32-kHz input."""
    import numpy as np
    from scipy.signal import resample_poly

    if len(raw) < 44 or len(raw) > MAX_BYTES:
        raise ValueError("INVALID_AUDIO_SIZE")
    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE" or int.from_bytes(raw[4:8], "little") + 8 != len(raw):
        raise ValueError("INVALID_WAV_STRUCTURE")
    with wave.open(io.BytesIO(raw), "rb") as source:
        rate, channels, width = source.getframerate(), source.getnchannels(), source.getsampwidth()
        frames = source.getnframes()
        if source.getcomptype() != "NONE" or channels not in (1, 2) or width != 2 or rate not in VALID_RATES:
            raise ValueError("UNSUPPORTED_WAV_ENCODING")
        if not (0 < frames <= rate * MAX_SECONDS):
            raise ValueError("INVALID_AUDIO_DURATION")
        pcm = source.readframes(frames)
    audio = np.frombuffer(pcm, dtype="<i2")
    if len(audio) != frames * channels:
        raise ValueError("INVALID_AUDIO_FRAMES")
    samples = audio.reshape(-1, channels).astype(np.float32).mean(axis=1) / 32768.0
    samples = resample_poly(samples, 32000 // math.gcd(rate, 32000), rate // math.gcd(rate, 32000))
    output = np.rint(np.clip(samples, -1.0, 32767.0 / 32768.0) * 32768.0).astype("<i2").tobytes()
    data = io.BytesIO()
    with wave.open(data, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(32000)
        wav.writeframes(output)
    return data.getvalue()


def predict(wav_bytes: bytes) -> dict:
    if MODEL is None:
        raise RuntimeError("MODEL_UNAVAILABLE")
    with tempfile.TemporaryDirectory(prefix="auvrion-perch-") as folder:
        path = Path(folder) / "input.wav"
        path.write_bytes(wav_bytes)
        prediction = MODEL.predict([str(path)])
        if not hasattr(prediction, "select_dtypes"):
            raise RuntimeError("MODEL_OUTPUT_UNSUPPORTED")
        numeric = prediction.select_dtypes(include="number")
        if numeric.empty:
            raise RuntimeError("MODEL_OUTPUT_EMPTY")
        scores = numeric.max(axis=0)
        ranked = sorted(
            ((str(label), float(score)) for label, score in scores.items() if math.isfinite(float(score))),
            key=lambda pair: pair[1], reverse=True,
        )
    candidates = [
        {"label": label.strip()[:180], "scientificName": None, "modelScore": round(score, 6),
         "startMs": None, "endMs": None}
        for label, score in ranked[:5] if label.strip() and -1000 <= score <= 1000
    ]
    return {
        "status": "succeeded" if candidates else "no_candidates",
        "verification": "unverified", "provider": "Google",
        "modelId": "perch-v2", "modelVersion": "perch_v2_cpu/1",
        "candidates": candidates,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "AuvrionPerch/0.1"
    sys_version = ""

    def send_json(self, status: int, data: dict):
        body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_json(404, {"error": "NOT_FOUND"})

    def do_POST(self):
        if urlsplit(self.path).path != "/infer" or self.path != "/infer":
            return self.send_json(404, {"error": "NOT_FOUND"})
        auth = self.headers.get("Authorization", "")
        if not hmac.compare_digest(auth.encode(), f"Bearer {SECRET}".encode()):
            return self.send_json(401, {"error": "UNAUTHORIZED"})
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "audio/wav":
            return self.send_json(415, {"error": "UNSUPPORTED_MIME"})
        value = self.headers.get("Content-Length", "")
        if not value.isdecimal() or not (44 <= int(value) <= MAX_BYTES):
            return self.send_json(413, {"error": "INVALID_AUDIO_SIZE"})
        body = self.rfile.read(int(value))
        expected = self.headers.get("X-Audio-SHA256", "")
        if len(body) != int(value) or len(expected) != 64 or not hmac.compare_digest(hashlib.sha256(body).hexdigest(), expected):
            return self.send_json(422, {"error": "AUDIO_HASH_MISMATCH"})
        try:
            processed = validate_and_resample(body)
        except (ValueError, EOFError, wave.Error):
            return self.send_json(422, {"error": "INVALID_AUDIO"})
        try:
            result = predict(processed)
            return self.send_json(200, result)
        except Exception as e:
            print(f"Perch inference error (type only): {type(e).__name__}", file=sys.stderr, flush=True)
            return self.send_json(503, {"error": "INFERENCE_FAILED"})


def main():
    global MODEL, SECRET
    SECRET = os.environ.get("PERCH_WORKER_TOKEN", "")
    if len(SECRET) < 32:
        sys.exit("PERCH_WORKER_TOKEN must be a random secret with at least 32 characters")
    raw_port = os.environ.get("PERCH_WORKER_PORT", "8765")
    if not raw_port.isdecimal() or not 1024 <= int(raw_port) <= 65535:
        sys.exit("Invalid PERCH_WORKER_PORT")
    import bioacoustics_model_zoo as bmz
    print("Loading Google Perch 2.0 (CPU) once; this may use Kaggle cache...", flush=True)
    MODEL = bmz.Perch2()
    address = ("127.0.0.1", int(raw_port))
    print(f"Perch worker ready on 127.0.0.1:{raw_port} (loopback only)", flush=True)
    HTTPServer(address, Handler).serve_forever()


if __name__ == "__main__":
    main()
