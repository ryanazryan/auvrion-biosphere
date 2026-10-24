import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const DEVICE_TOKEN_BYTES = 32;
export const DEVICE_TOKEN_PREFIX = "abdev_v1_";
export const DEVICE_RECORD_ID_MAX = 128;
export const DEVICE_METADATA_MAX_BYTES = 4096;
export const DEVICE_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

const SHA256_HEX = /^[a-f0-9]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const BASE64URL = /^[a-zA-Z0-9_-]{43}$/;

export function createDeviceToken(): string {
  return `${DEVICE_TOKEN_PREFIX}${randomBytes(DEVICE_TOKEN_BYTES).toString("base64url")}`;
}

export function hashDeviceToken(
  token: string,
  salt = randomBytes(16).toString("hex"),
): string {
  if (!isDeviceToken(token) || !/^[a-f0-9]{32}$/.test(salt)) {
    throw new Error("INVALID_DEVICE_CREDENTIAL");
  }
  const digest = scryptSync(token, Buffer.from(salt, "hex"), 32).toString(
    "hex",
  );
  return `scrypt-v1:${salt}:${digest}`;
}

export function isDeviceToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(DEVICE_TOKEN_PREFIX) &&
    value.length === DEVICE_TOKEN_PREFIX.length + 43 &&
    BASE64URL.test(value.slice(DEVICE_TOKEN_PREFIX.length))
  );
}

export function verifyDeviceToken(
  token: unknown,
  encodedHash: string,
): boolean {
  if (!isDeviceToken(token)) return false;
  const fields = encodedHash.split(":");
  if (
    fields.length !== 3 ||
    fields[0] !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(fields[1] ?? "") ||
    !SHA256_HEX.test(fields[2] ?? "")
  )
    return false;
  const saltHex = fields[1];
  const expectedHex = fields[2];

  if (saltHex === undefined || expectedHex === undefined) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(token, Buffer.from(saltHex, "hex"), 32);

  return timingSafeEqual(actual, expected);
}

export type ListenMetadata = {
  protocolVersion: 1;
  recordingId: string;
  observedAt: string | null;
  clockQuality: "rtc_verified" | "unverified";
  ingestionMode: "live" | "historical" | "simulation";
  audioSha256: string;
  audioBytes: number;
  durationMs: number;
};

type ParseResult =
  | { ok: true; value: ListenMetadata }
  | { ok: false; error: string };
export function parseListenMetadata(input: unknown): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "INVALID_METADATA" };
  const v = input as Record<string, unknown>;
  const keys = Object.keys(v);
  const allowed = new Set([
    "protocolVersion",
    "recordingId",
    "observedAt",
    "clockQuality",
    "ingestionMode",
    "audioSha256",
    "audioBytes",
    "durationMs",
  ]);
  if (keys.some((key) => !allowed.has(key)))
    return { ok: false, error: "UNKNOWN_METADATA_FIELD" };
  if (v.protocolVersion !== 1)
    return { ok: false, error: "UNSUPPORTED_PROTOCOL_VERSION" };
  if (
    typeof v.recordingId !== "string" ||
    v.recordingId.length > DEVICE_RECORD_ID_MAX ||
    !RECORD_ID.test(v.recordingId)
  )
    return { ok: false, error: "INVALID_RECORDING_ID" };
  if (v.clockQuality !== "rtc_verified" && v.clockQuality !== "unverified")
    return { ok: false, error: "INVALID_CLOCK_QUALITY" };
  if (
    v.observedAt !== null &&
    (typeof v.observedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v.observedAt) ||
      Number.isNaN(Date.parse(v.observedAt)))
  )
    return { ok: false, error: "INVALID_OBSERVED_AT" };
  if (v.clockQuality === "rtc_verified" && v.observedAt === null)
    return { ok: false, error: "VERIFIED_CLOCK_REQUIRES_TIMESTAMP" };
  if (
    v.ingestionMode !== "live" &&
    v.ingestionMode !== "historical" &&
    v.ingestionMode !== "simulation"
  )
    return { ok: false, error: "INVALID_INGESTION_MODE" };
  if (typeof v.audioSha256 !== "string" || !SHA256_HEX.test(v.audioSha256))
    return { ok: false, error: "INVALID_AUDIO_HASH" };
  if (
    typeof v.audioBytes !== "number" ||
    !Number.isSafeInteger(v.audioBytes) ||
    v.audioBytes < 44 ||
    v.audioBytes > DEVICE_AUDIO_MAX_BYTES
  )
    return { ok: false, error: "INVALID_AUDIO_SIZE" };
  if (
    typeof v.durationMs !== "number" ||
    !Number.isSafeInteger(v.durationMs) ||
    v.durationMs < 1 ||
    v.durationMs > 60 * 60 * 1000
  )
    return { ok: false, error: "INVALID_DURATION" };
  return { ok: true, value: v as ListenMetadata };
}

export function fingerprintListenRecording(input: {
  organizationId: string;
  sourceId: string;
  metadata: ListenMetadata;
}): string {
  if (!UUID.test(input.organizationId) || !UUID.test(input.sourceId))
    throw new Error("INVALID_DEVICE_SCOPE");
  return createHash("sha256")
    .update(
      JSON.stringify([
        "auvrion-listen-recording-v1",
        input.organizationId.toLowerCase(),
        input.sourceId.toLowerCase(),
        input.metadata.recordingId,
        input.metadata.audioSha256,
        input.metadata.audioBytes,
      ]),
    )
    .digest("hex");
}
