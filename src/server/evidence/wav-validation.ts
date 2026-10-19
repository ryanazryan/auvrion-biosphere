export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 30;

const ALLOWED_MIME_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav"]);

const ALLOWED_SAMPLE_RATES = new Set([16000, 44100, 48000]);

export type WavValidationResult =
  | {
      ok: true;
      metadata: {
        mimeType: "audio/wav";
        byteLength: number;
        durationSeconds: number;
        sampleRate: number;
        channels: number;
        bitsPerSample: 16;
      };
    }
  | {
      ok: false;
      error: string;
    };

export function validateWavPcm16(
  bytes: Uint8Array,
  declaredMimeType: string,
): WavValidationResult {
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: "AUDIO_TOO_LARGE" };
  }

  const mime = declaredMimeType.split(";")[0]?.trim().toLowerCase();

  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    return { ok: false, error: "UNSUPPORTED_AUDIO_MIME" };
  }

  const buffer = Buffer.from(bytes);

  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return { ok: false, error: "INVALID_WAV_STRUCTURE" };
  }

  if (buffer.readUInt32LE(4) + 8 !== buffer.length) {
    return { ok: false, error: "INVALID_RIFF_LENGTH" };
  }

  let format:
    | {
        encoding: number;
        channels: number;
        sampleRate: number;
        byteRate: number;
        blockAlign: number;
        bitsPerSample: number;
      }
    | undefined;

  let dataLength: number | undefined;
  let offset = 12;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      return { ok: false, error: "INVALID_WAV_CHUNK" };
    }

    const chunkName = buffer.toString("ascii", offset, offset + 4);
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;

    if (end > buffer.length) {
      return { ok: false, error: "INVALID_WAV_CHUNK" };
    }

    if (chunkName === "fmt ") {
      if (format || chunkLength < 16) {
        return { ok: false, error: "INVALID_WAV_FORMAT" };
      }

      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    }

    if (chunkName === "data") {
      if (dataLength !== undefined) {
        return { ok: false, error: "DUPLICATE_AUDIO_DATA" };
      }

      dataLength = chunkLength;
    }

    offset = end + (chunkLength % 2);

    if (offset > buffer.length) {
      return { ok: false, error: "INVALID_WAV_PADDING" };
    }
  }

  if (!format || !dataLength) {
    return { ok: false, error: "MISSING_AUDIO_DATA" };
  }

  if (
    format.encoding !== 1 ||
    format.bitsPerSample !== 16 ||
    ![1, 2].includes(format.channels) ||
    !ALLOWED_SAMPLE_RATES.has(format.sampleRate)
  ) {
    return { ok: false, error: "UNSUPPORTED_WAV_ENCODING" };
  }

  const expectedBlockAlign = format.channels * 2;
  const expectedByteRate = format.sampleRate * expectedBlockAlign;

  if (
    format.blockAlign !== expectedBlockAlign ||
    format.byteRate !== expectedByteRate ||
    dataLength % expectedBlockAlign !== 0
  ) {
    return { ok: false, error: "INVALID_PCM_METADATA" };
  }

  const durationSeconds = dataLength / format.byteRate;

  if (durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    return { ok: false, error: "AUDIO_DURATION_EXCEEDED" };
  }

  return {
    ok: true,
    metadata: {
      mimeType: "audio/wav",
      byteLength: buffer.length,
      durationSeconds,
      sampleRate: format.sampleRate,
      channels: format.channels,
      bitsPerSample: 16,
    },
  };
}
