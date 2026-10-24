import { createHash } from "node:crypto";
import {
  MAX_AUDIO_BYTES,
  validateWavPcm16,
} from "@/server/evidence/wav-validation";
import {
  fingerprintListenRecording,
  isDeviceToken,
  type ListenMetadata,
  parseListenMetadata,
} from "./device-security";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
export const NO_DEVICE_STORE = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export class RecordingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
export type VerifiedWav = {
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
  durationMs: number;
};
export type DeviceHeaders = {
  deviceId: string;
  token: string;
  metadata: ListenMetadata;
};

export function parseDeviceHeaders(request: Request): DeviceHeaders {
  // Require TLS at the application boundary. Loopback HTTP is permitted only during local development.
  const url = new URL(request.url);
  const local =
    process.env.NODE_ENV === "development" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new RecordingError("HTTPS_REQUIRED", 403);
  // Device clients do not need browser cookies or cross-origin access.
  if (request.headers.has("origin") || request.headers.has("cookie"))
    throw new RecordingError("DEVICE_REQUEST_ONLY", 403);
  const auth = request.headers.get("authorization");
  const match = /^Bearer (\S+)$/.exec(auth ?? "");
  const deviceId = request.headers.get("x-device-id");
  if (!match || !isDeviceToken(match[1]) || !deviceId || !UUID.test(deviceId)) {
    throw new RecordingError("INVALID_DEVICE_CREDENTIAL", 401);
  }
  const metadataResult = parseListenMetadata({
    protocolVersion: Number(request.headers.get("x-protocol-version")),
    recordingId: request.headers.get("x-recording-id"),
    observedAt: request.headers.get("x-observed-at") || null,
    clockQuality: request.headers.get("x-clock-quality"),
    ingestionMode: request.headers.get("x-ingestion-mode"),
    audioSha256: request.headers.get("x-audio-sha256"),
    audioBytes: Number(request.headers.get("x-audio-bytes")),
    durationMs: Number(request.headers.get("x-duration-ms")),
  });
  if (!metadataResult.ok) throw new RecordingError(metadataResult.error, 400);
  if (metadataResult.value.audioBytes > MAX_AUDIO_BYTES)
    throw new RecordingError("AUDIO_TOO_LARGE", 413);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "audio/wav"
  ) {
    throw new RecordingError("UNSUPPORTED_AUDIO_MIME", 415);
  }
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) ||
      Number(length) !== metadataResult.value.audioBytes)
  ) {
    throw new RecordingError("INVALID_CONTENT_LENGTH", 400);
  }
  return { deviceId, token: match[1], metadata: metadataResult.value };
}

export async function readDeviceWav(
  request: Request,
  metadata: ListenMetadata,
): Promise<VerifiedWav> {
  if (!request.body) throw new RecordingError("EMPTY_WAV", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUDIO_BYTES || total > metadata.audioBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RecordingError("AUDIO_TOO_LARGE_OR_MISMATCH", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== metadata.audioBytes)
    throw new RecordingError("AUDIO_LENGTH_MISMATCH", 422);
  const bytes = Buffer.concat(
    chunks.map((x) => Buffer.from(x)),
    total,
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!SHA256.test(metadata.audioSha256) || sha256 !== metadata.audioSha256) {
    throw new RecordingError("AUDIO_HASH_MISMATCH", 422);
  }
  const wav = validateWavPcm16(bytes, "audio/wav");
  if (!wav.ok) throw new RecordingError(wav.error, 422);
  const durationMs = Math.round(wav.metadata.durationSeconds * 1000);
  if (Math.abs(durationMs - metadata.durationMs) > 2)
    throw new RecordingError("AUDIO_DURATION_MISMATCH", 422);
  return { bytes, sha256, byteLength: total, durationMs };
}

export function recordingFingerprint(
  organizationId: string,
  sourceId: string,
  metadata: ListenMetadata,
): string {
  const base = fingerprintListenRecording({
    organizationId,
    sourceId,
    metadata,
  });
  return createHash("sha256")
    .update(
      JSON.stringify([
        base,
        metadata.observedAt,
        metadata.clockQuality,
        metadata.ingestionMode,
        metadata.durationMs,
        metadata.protocolVersion,
      ]),
    )
    .digest("hex");
}
