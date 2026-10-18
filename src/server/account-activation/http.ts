import "server-only";
export const NO_STORE = { "Cache-Control": "no-store" };
export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}
export function isLocalActivationRequest(request: Request): boolean {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ENABLE_LOCAL_ACCESS_REQUESTS !== "YES"
  )
    return false;
  try {
    const configured = new URL(process.env.BETTER_AUTH_URL ?? "");
    const incoming = new URL(request.url);
    return (
      configured.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(configured.hostname) &&
      incoming.origin === configured.origin &&
      request.headers.get("origin") === configured.origin
    );
  } catch {
    return false;
  }
}
export async function readSmallJson(
  request: Request,
  maxBytes = 2048,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new Error("INVALID_CONTENT_TYPE");
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!Number.isSafeInteger(Number(declared)) ||
      Number(declared) > maxBytes ||
      Number(declared) < 0)
  )
    throw new Error("BODY_LIMIT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("EMPTY_BODY");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("BODY_LIMIT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const decoded: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
    throw new Error("INVALID_JSON");
  return decoded as Record<string, unknown>;
}
