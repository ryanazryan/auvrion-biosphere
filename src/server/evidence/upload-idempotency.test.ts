import { describe, expect, it } from "vitest";
import {
  createAudioUploadFingerprint,
  parseIdempotencyKey,
} from "./upload-idempotency";
import { MAX_AUDIO_BYTES } from "./wav-validation";

const organizationId = "00000000-0000-4000-8000-000000000001";
const observationId = "00000000-0000-4000-8000-000000000002";
const anotherObservationId = "00000000-0000-4000-8000-000000000003";
const anotherOrganizationId = "00000000-0000-4000-8000-000000000004";

const input = {
  organizationId,
  observationId,
  bytes: new Uint8Array([1, 2, 3, 4]),
  declaredMimeType: "audio/wav",
};

describe("AB-WC-010 upload idempotency contract", () => {
  it("accepts a valid UUID idempotency key", () => {
    const result = parseIdempotencyKey("4d5a8f20-c471-4f79-a5b2-83d1a29bc630");

    expect(result.ok).toBe(true);
  });

  it("requires an idempotency key", () => {
    expect(parseIdempotencyKey(null)).toEqual({
      ok: false,
      error: "IDEMPOTENCY_KEY_REQUIRED",
    });
  });

  it("rejects malformed and unsafe keys", () => {
    for (const key of [
      "short",
      "has spaces here",
      "../unsafe-key-example",
      "a".repeat(129),
      "unicode-🚀-invalid-key",
    ]) {
      expect(parseIdempotencyKey(key).ok).toBe(false);
    }
  });

  it("produces the same fingerprint for identical requests", () => {
    const first = createAudioUploadFingerprint(input);
    const retry = createAudioUploadFingerprint({
      ...input,
      bytes: new Uint8Array([1, 2, 3, 4]),
    });

    expect(retry).toEqual(first);
    expect(first.requestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes fingerprint when audio bytes change", () => {
    const first = createAudioUploadFingerprint(input);
    const changed = createAudioUploadFingerprint({
      ...input,
      bytes: new Uint8Array([1, 2, 3, 5]),
    });

    expect(changed.requestSha256).not.toBe(first.requestSha256);
  });

  it("changes fingerprint when observation changes", () => {
    const first = createAudioUploadFingerprint(input);
    const changed = createAudioUploadFingerprint({
      ...input,
      observationId: anotherObservationId,
    });

    expect(changed.requestSha256).not.toBe(first.requestSha256);
  });

  it("changes fingerprint when organization changes", () => {
    const first = createAudioUploadFingerprint(input);
    const changed = createAudioUploadFingerprint({
      ...input,
      organizationId: anotherOrganizationId,
    });

    expect(changed.requestSha256).not.toBe(first.requestSha256);
  });

  it("canonicalizes supported WAV MIME aliases", () => {
    const first = createAudioUploadFingerprint(input);

    const retry = createAudioUploadFingerprint({
      ...input,
      declaredMimeType: "audio/x-wav",
    });

    expect(retry.requestSha256).toBe(first.requestSha256);
  });

  it("rejects unsupported audio MIME", () => {
    expect(() =>
      createAudioUploadFingerprint({
        ...input,
        declaredMimeType: "audio/mpeg",
      }),
    ).toThrow("UNSUPPORTED_AUDIO_MIME");
  });

  it("rejects oversized audio before hashing", () => {
    expect(() =>
      createAudioUploadFingerprint({
        ...input,
        bytes: new Uint8Array(MAX_AUDIO_BYTES + 1),
      }),
    ).toThrow("AUDIO_TOO_LARGE");
  });
});
