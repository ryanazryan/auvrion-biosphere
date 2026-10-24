import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  ingest: vi.fn(),
  service: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Pool: class MockPool {} }));
vi.mock("@/server/device-ingestion/device-recording-service", () => ({
  createDeviceRecordingService: mocks.service,
}));

import { RecordingError } from "@/server/device-ingestion/device-recording-protocol";
import { POST } from "./route";

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const SECRET = `abdev_v1_${"A".repeat(43)}`;
const SHA = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function makeWav(): Buffer {
  const pcm = Buffer.alloc(3200, 0);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}
const wav = makeWav();
const ack = {
  protocolVersion: 1,
  status: "committed",
  receiptId: "receipt-1",
  deviceId: DEVICE_ID,
  recordingId: "esp32-record-1",
  observationId: "observation-1",
  audioSha256: SHA(wav),
  audioBytes: wav.length,
  replayed: false,
};

function request(
  opts: {
    body?: Uint8Array;
    headers?: Record<string, string>;
    url?: string;
  } = {},
) {
  const body = opts.body ?? wav;
  return new Request(
    opts.url ?? "http://localhost:3000/api/device/recordings",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "x-device-id": DEVICE_ID,
        "content-type": "audio/wav",
        "x-protocol-version": "1",
        "x-recording-id": "esp32-record-1",
        "x-observed-at": "2026-10-24T03:00:00Z",
        "x-clock-quality": "rtc_verified",
        "x-ingestion-mode": "historical",
        "x-audio-sha256": SHA(body),
        "x-audio-bytes": String(body.length),
        "x-duration-ms": "100",
        ...opts.headers,
      },
      body: Uint8Array.from(body),
    },
  );
}
async function error(response: Response) {
  return ((await response.json()) as { error: string }).error;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://unused@127.0.0.1:1/unused");
  mocks.service.mockReturnValue({
    authenticate: mocks.authenticate,
    ingest: mocks.ingest,
  });
  mocks.authenticate.mockResolvedValue(undefined);
  mocks.ingest.mockResolvedValue(ack);
});
afterEach(() => vi.unstubAllEnvs());

describe("AB-WC-017 LISTEN HTTP WAV ingestion", () => {
  it("authenticates before consuming WAV and returns committed no-store ACK", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(ack);
    expect(mocks.authenticate).toHaveBeenCalledWith(DEVICE_ID, SECRET);
    expect(mocks.ingest).toHaveBeenCalledOnce();
    const args = mocks.ingest.mock.calls[0]?.[0];
    expect(args.wav).toMatchObject({
      sha256: SHA(wav),
      byteLength: wav.length,
      durationMs: 100,
    });
    expect(args.metadata.recordingId).toBe("esp32-record-1");
  });
  it("supports identical retry ACK without changing server-issued IDs", async () => {
    mocks.ingest.mockResolvedValue({ ...ack, replayed: true });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...ack, replayed: true });
  });
  it("denies missing or invalid token before reading storage", async () => {
    for (const value of ["", "Bearer bad"]) {
      const response = await POST(
        request({ headers: { authorization: value } }),
      );
      expect(response.status).toBe(401);
      expect(await error(response)).toBe("INVALID_DEVICE_CREDENTIAL");
    }
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("denies unknown device credential without touching ingestion", async () => {
    mocks.authenticate.mockRejectedValue(new Error("bad hash"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("rejects plain HTTP outside loopback development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await error(response)).toBe("HTTPS_REQUIRED");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it("accepts HTTPS in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(
      request({ url: "https://demo.example/api/device/recordings" }),
    );
    expect(response.status).toBe(200);
  });
  it.each(["origin", "cookie"])("denies browser %s headers", async (key) => {
    const response = await POST(
      request({ headers: { [key]: "https://site.test" } }),
    );
    expect(response.status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it("rejects incorrect recording ID", async () => {
    const response = await POST(
      request({ headers: { "x-recording-id": "../../bad" } }),
    );
    expect(response.status).toBe(400);
  });
  it("rejects malformed clock metadata", async () => {
    const response = await POST(
      request({ headers: { "x-clock-quality": "unknown" } }),
    );
    expect(response.status).toBe(400);
  });
  it("rejects unexpected MIME type", async () => {
    const response = await POST(
      request({ headers: { "content-type": "application/octet-stream" } }),
    );
    expect(response.status).toBe(415);
  });
  it("rejects false Content-Length without reading the body", async () => {
    const response = await POST(
      request({ headers: { "content-length": "1" } }),
    );
    expect(response.status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it("rejects SHA-256 mismatch with no ingestion", async () => {
    const response = await POST(
      request({ headers: { "x-audio-sha256": "a".repeat(64) } }),
    );
    expect(response.status).toBe(422);
    expect(await error(response)).toBe("AUDIO_HASH_MISMATCH");
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("rejects invalid WAV structure", async () => {
    const response = await POST(request({ body: Buffer.alloc(50) }));
    expect(response.status).toBe(422);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("rejects wrong duration", async () => {
    const response = await POST(
      request({ headers: { "x-duration-ms": "123" } }),
    );
    expect(response.status).toBe(422);
    expect(await error(response)).toBe("AUDIO_DURATION_MISMATCH");
  });
  it("propagates auth 401 and never commits unauthorized recording", async () => {
    mocks.authenticate.mockRejectedValue(
      new RecordingError("INVALID_DEVICE_CREDENTIAL", 401),
    );
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("reports idempotent conflict without exposing any credential", async () => {
    mocks.ingest.mockRejectedValue(
      new RecordingError("RECORDING_ID_CONFLICT", 409),
    );
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(SECRET);
  });
  it("rejects metadata that claims more bytes than the supported WAV limit", async () => {
    const response = await POST(
      request({ headers: { "x-audio-bytes": String(10 * 1024 * 1024 + 1) } }),
    );
    expect(response.status).toBe(413);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
  it("does not send ACK on an ingestion error", async () => {
    mocks.ingest.mockRejectedValue(new Error("DB_COMMIT_UNKNOWN"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(SECRET);
  });
});
