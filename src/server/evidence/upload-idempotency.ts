import { createHash } from "node:crypto";

import { isUuid } from "@/server/observations/observation-input";

import { MAX_AUDIO_BYTES } from "./wav-validation";

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;

const ALLOWED_MIME_TYPES = new Set(["audio/wav", "audio/wave", "audio/x-wav"]);

export type IdempotencyKeyResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function parseIdempotencyKey(
  value: string | null,
): IdempotencyKeyResult {
  if (value === null || value.length === 0) {
    return {
      ok: false,
      error: "IDEMPOTENCY_KEY_REQUIRED",
    };
  }

  if (!KEY_PATTERN.test(value)) {
    return {
      ok: false,
      error: "INVALID_IDEMPOTENCY_KEY",
    };
  }

  return {
    ok: true,
    value,
  };
}

export type AudioUploadFingerprintInput = {
  organizationId: string;
  observationId: string;
  bytes: Uint8Array;
  declaredMimeType: string;
};

export function createAudioUploadFingerprint(
  input: AudioUploadFingerprintInput,
) {
  if (!isUuid(input.organizationId) || !isUuid(input.observationId)) {
    throw new Error("INVALID_EVIDENCE_TARGET");
  }

  if (input.bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("AUDIO_TOO_LARGE");
  }

  const mime = input.declaredMimeType.split(";")[0]?.trim().toLowerCase();

  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error("UNSUPPORTED_AUDIO_MIME");
  }

  const fileSha256 = createHash("sha256").update(input.bytes).digest("hex");

  // Stable canonical representation of one logical upload.
  // User identity is scoped separately by the database key.
  const identity = JSON.stringify([
    "auvrion-audio-upload-v1",
    input.organizationId.toLowerCase(),
    input.observationId.toLowerCase(),
    "audio/wav",
    fileSha256,
  ]);

  const requestSha256 = createHash("sha256")
    .update(identity, "utf8")
    .digest("hex");

  return {
    requestSha256,
    fileSha256,
    byteLength: input.bytes.byteLength,
    mimeType: "audio/wav" as const,
  };
}
