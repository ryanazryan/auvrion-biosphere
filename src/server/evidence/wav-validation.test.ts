import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, validateWavPcm16 } from "./wav-validation";

function makeWav(seconds = 1, sampleRate = 48000, channels = 1): Buffer {
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = seconds * byteRate;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8, "ascii");

  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

describe("AB-WC-010 WAV PCM validation", () => {
  it("accepts valid 16-bit mono WAV", () => {
    const result = validateWavPcm16(makeWav(), "audio/wav");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.metadata.durationSeconds).toBe(1);
      expect(result.metadata.channels).toBe(1);
      expect(result.metadata.sampleRate).toBe(48000);
    }
  });

  it("accepts valid stereo WAV at 44.1 kHz", () => {
    const result = validateWavPcm16(makeWav(1, 44100, 2), "audio/x-wav");

    expect(result.ok).toBe(true);
  });

  it("accepts exactly 30 seconds", () => {
    expect(validateWavPcm16(makeWav(30), "audio/wav").ok).toBe(true);
  });

  it("rejects audio longer than 30 seconds", () => {
    expect(validateWavPcm16(makeWav(31), "audio/wav")).toEqual({
      ok: false,
      error: "AUDIO_DURATION_EXCEEDED",
    });
  });

  it("rejects files larger than 10 MiB", () => {
    expect(
      validateWavPcm16(Buffer.alloc(MAX_AUDIO_BYTES + 1), "audio/wav"),
    ).toEqual({
      ok: false,
      error: "AUDIO_TOO_LARGE",
    });
  });

  it("rejects incorrect MIME types", () => {
    expect(validateWavPcm16(makeWav(), "application/pdf")).toEqual({
      ok: false,
      error: "UNSUPPORTED_AUDIO_MIME",
    });
  });

  it("rejects fake WAV file signatures", () => {
    const fake = makeWav();
    fake.write("FAKE", 0, "ascii");

    expect(validateWavPcm16(fake, "audio/wav")).toEqual({
      ok: false,
      error: "INVALID_WAV_STRUCTURE",
    });
  });

  it("rejects incorrect RIFF length", () => {
    const wav = makeWav();
    wav.writeUInt32LE(20, 4);

    expect(validateWavPcm16(wav, "audio/wav")).toEqual({
      ok: false,
      error: "INVALID_RIFF_LENGTH",
    });
  });

  it("rejects unsupported audio encoding", () => {
    const wav = makeWav();
    wav.writeUInt16LE(3, 20);

    expect(validateWavPcm16(wav, "audio/wav")).toEqual({
      ok: false,
      error: "UNSUPPORTED_WAV_ENCODING",
    });
  });

  it("rejects inconsistent PCM metadata", () => {
    const wav = makeWav();
    wav.writeUInt32LE(123, 28);

    expect(validateWavPcm16(wav, "audio/wav")).toEqual({
      ok: false,
      error: "INVALID_PCM_METADATA",
    });
  });

  it("rejects truncated WAV data", () => {
    const wav = makeWav();
    wav.writeUInt32LE(999999, 40);

    expect(validateWavPcm16(wav, "audio/wav")).toEqual({
      ok: false,
      error: "INVALID_WAV_CHUNK",
    });
  });

  it("rejects empty audio data", () => {
    const wav = makeWav(0);

    expect(validateWavPcm16(wav, "audio/wav")).toEqual({
      ok: false,
      error: "MISSING_AUDIO_DATA",
    });
  });
});
