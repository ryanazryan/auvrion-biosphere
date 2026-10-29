import "server-only";
import { Pool } from "pg";
import { verifyDeviceToken } from "@/server/device-ingestion/device-security";

let pool: Pool | undefined;
export function remotePool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

export const REMOTE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
export const DEVICE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function remoteReply(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: REMOTE_HEADERS });
}

export function allowedDeviceTransport(request: Request): boolean {
  const url = new URL(request.url);
  const local =
    process.env.NODE_ENV === "development" &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  return (
    (url.protocol === "https:" || local) &&
    !request.headers.has("cookie") &&
    !request.headers.has("origin")
  );
}

export function parseDeviceIdentity(
  request: Request,
): { deviceId: string; token: string } | null {
  if (!allowedDeviceTransport(request)) return null;
  const auth = /^Bearer (abdev_v1_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  const deviceId = request.headers.get("x-device-id");
  if (!auth?.[1] || !deviceId || !DEVICE_UUID.test(deviceId)) return null;
  return { deviceId, token: auth[1] };
}

/** Authenticate current active provisioning and source, not browser session. */
export async function authenticateDevice(
  deviceId: string,
  token: string,
): Promise<boolean> {
  const result = await remotePool().query<{ credential_hash: string }>(
    `SELECT d.credential_hash FROM ingestion_devices d
       JOIN observation_sources s ON s.id = d.source_id AND s.organization_id = d.organization_id
      WHERE d.id = $1 AND d.status = 'active' AND
            s.kind = 'listen_device' AND s.is_active = true LIMIT 1`,
    [deviceId],
  );
  const row = result.rows[0];
  return Boolean(row && verifyDeviceToken(token, row.credential_hash));
}

export async function readBoundedJson(
  request: Request,
  max = 512,
): Promise<unknown | null> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return null;
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max))
    return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) return null;
      chunks.push(next.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  if (!size) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export function trustedBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return (
      new URL(origin).origin === new URL(request.url).origin &&
      (request.headers.get("sec-fetch-site") ?? "same-origin") === "same-origin"
    );
  } catch {
    return false;
  }
}
