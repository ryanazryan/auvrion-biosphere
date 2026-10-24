import "server-only";
import { Pool } from "pg";
import {
  NO_DEVICE_STORE,
  parseDeviceHeaders,
  RecordingError,
  readDeviceWav,
} from "@/server/device-ingestion/device-recording-protocol";
import { createDeviceRecordingService } from "@/server/device-ingestion/device-recording-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let pool: Pool | undefined;
function databasePool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}
function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_DEVICE_STORE });
}

/** POST /api/device/recordings — no Better Auth cookies, only device bearer credentials. */
export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseDeviceHeaders(request);
    const service = createDeviceRecordingService(databasePool());
    // Invalid devices are denied before the WAV body is read into memory.
    await service.authenticate(input.deviceId, input.token);
    const wav = await readDeviceWav(request, input.metadata);
    const ack = await service.ingest({ ...input, wav });
    return reply(ack, 200);
  } catch (error) {
    if (error instanceof RecordingError) {
      return reply({ error: error.code }, error.status);
    }
    // Do not log Authorization header, token, raw body, recording bytes or detailed DB errors.
    return reply({ error: "DEVICE_INGESTION_UNAVAILABLE" }, 503);
  }
}
