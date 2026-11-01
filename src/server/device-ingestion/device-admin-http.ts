import "server-only";

import { Pool } from "pg";
import { checkAdminAccess } from "@/server/authorization/admin-access";
import { trustedAdminOrigin } from "./device-admin-origin";
import { DeviceLifecycleError } from "./device-lifecycle";
import {
  createPostgresDeviceLifecycle,
  DevicePersistenceError,
} from "./device-pg-store";

export const HEADERS = { "Cache-Control": "no-store", Vary: "Cookie, Origin" };
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 1024;
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

export function reply(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: HEADERS });
}

/** Browser-only management endpoint, including trusted production proxy path. */
export function trustedOrigin(request: Request): boolean {
  return trustedAdminOrigin(request, process.env);
}

export async function readBounded(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    return null;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
    return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let lengthRead = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      lengthRead += next.value.byteLength;
      if (lengthRead > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      parts.push(next.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  if (!lengthRead) return null;
  try {
    const value: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function permitted(organizationId: string) {
  if (!UUID.test(organizationId))
    return {
      allowed: false as const,
      response: reply({ error: "INVALID_REQUEST" }, 400),
    };
  const access = await checkAdminAccess(organizationId, "manage_devices");
  if (!access.allowed)
    return {
      allowed: false as const,
      response: reply({ error: access.reason }, access.status),
    };
  return {
    allowed: true as const,
    lifecycle: createPostgresDeviceLifecycle({
      pool: databasePool(),
      actorUserId: access.userId,
      actorOrganizationId: access.organizationId,
    }),
    actor: {
      organizationId: access.organizationId,
      manageDevices: true as const,
    },
  };
}

export function manageError(error: unknown): Response {
  if (error instanceof DeviceLifecycleError)
    return reply({ error: error.code }, error.status);
  if (error instanceof DevicePersistenceError) {
    if (error.code === "ACTIVE_LISTEN_SOURCE_REQUIRED")
      return reply({ error: error.code }, 422);
    if (error.code === "SOURCE_ALREADY_PROVISIONED")
      return reply({ error: error.code }, 409);
    if (
      error.code === "DEVICE_ACTOR_REQUIRED" ||
      error.code === "DEVICE_ACTOR_SCOPE_DENIED"
    )
      return reply({ error: "ACCESS_DENIED" }, 403);
  }
  return reply({ error: "DEVICE_OPERATION_UNAVAILABLE" }, 503);
}
