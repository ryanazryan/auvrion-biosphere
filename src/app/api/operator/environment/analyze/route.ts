import "server-only";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  getEnvironmentalContext,
  RegionConfigError,
} from "@/server/environment/context";
import { analyzeWithLuna, LunaError } from "@/server/environment/luna";
import { trustedBrowserOrigin } from "@/server/security/trusted-browser-origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
const recent = new Map<string, number[]>();
async function readLimited(r: Request): Promise<unknown> {
  if (
    r.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json" ||
    r.headers.has("content-encoding")
  )
    throw Error("INVALID_TYPE");
  if (Number(r.headers.get("content-length")) > 2048 || !r.body)
    throw Error("INVALID_SIZE");
  const reader = r.body.getReader(),
    parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const p = await reader.read();
      if (p.done) break;
      bytes += p.value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        throw Error("INVALID_SIZE");
      }
      parts.push(p.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}
export async function POST(request: Request) {
  const url = new URL(request.url),
    q = url.searchParams,
    org = q.get("organizationId");
  if (
    !org ||
    !UUID.test(org) ||
    q.size !== 1 ||
    q.getAll("organizationId").length !== 1
  )
    return respond({ error: "INVALID_REQUEST" }, 400);
  if (!trustedBrowserOrigin(request, process.env))
    return respond({ error: "CROSS_ORIGIN_DENIED" }, 403);
  const auth = await checkOperationalAccess(org, "operator");
  if (!auth.allowed) return respond({ error: auth.reason }, auth.status);
  let body: unknown;
  try {
    body = await readLimited(request);
  } catch {
    return respond({ error: "INVALID_JSON_REQUEST" }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("question" in body) ||
    typeof body.question !== "string" ||
    body.question.trim().length < 3 ||
    body.question.length > 500
  )
    return respond({ error: "INVALID_QUESTION" }, 400);
  const key = `${auth.organizationId}:${auth.userId}`,
    now = Date.now();
  const current = (recent.get(key) || []).filter((t) => now - t < 60_000);
  if (current.length >= 6) return respond({ error: "RATE_LIMITED" }, 429);
  current.push(now);
  recent.set(key, current);
  if (recent.size > 2000) recent.clear();
  try {
    const context = await getEnvironmentalContext(auth.organizationId);
    if (
      context.bmkg.state !== "available" &&
      context.nasa.state !== "available"
    )
      return respond({ error: "NO_VERIFIABLE_EXTERNAL_DATA" }, 503);
    return respond(await analyzeWithLuna(body.question.trim(), context));
  } catch (e) {
    if (e instanceof RegionConfigError || e instanceof LunaError)
      return respond({ error: e.message }, 503);
    return respond({ error: "ANALYSIS_UNAVAILABLE" }, 503);
  }
}
