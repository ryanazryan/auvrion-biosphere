/** Strict same-origin + bounded JSON helper for state-changing Task API requests. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site !== null && site !== "same-origin" && site !== "none"))
    return false;
  try {
    const base = process.env.BETTER_AUTH_URL;
    return (
      Boolean(base) &&
      origin === new URL(base as string).origin &&
      new URL(request.url).origin === origin
    );
  } catch {
    return false;
  }
}

type BodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string; status: number };
export async function readTaskJson(request: Request): Promise<BodyResult> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return { ok: false, error: "JSON_REQUIRED", status: 415 };
  }
  const contentEncoding = request.headers
    .get("content-encoding")
    ?.toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    return { ok: false, error: "ENCODING_NOT_ALLOWED", status: 415 };
  }
  const len = request.headers.get("content-length");
  if (len && (!/^\d+$/.test(len) || Number(len) > 8192)) {
    return { ok: false, error: "INVALID_BODY_LENGTH", status: 413 };
  }
  if (!request.body) return { ok: false, error: "EMPTY_BODY", status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 8192) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "BODY_TOO_LARGE", status: 413 };
      }
      chunks.push(next.value);
    }
  } catch {
    return { ok: false, error: "BODY_READ_FAILED", status: 400 };
  } finally {
    reader.releaseLock();
  }
  if (!length || (len !== null && Number(len) !== length)) {
    return { ok: false, error: "BODY_LENGTH_MISMATCH", status: 400 };
  }
  try {
    const result: unknown = JSON.parse(
      Buffer.concat(chunks, length).toString("utf8"),
    );
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return { ok: false, error: "INVALID_JSON_OBJECT", status: 400 };
    }
    return { ok: true, body: result as Record<string, unknown> };
  } catch {
    return { ok: false, error: "INVALID_JSON", status: 400 };
  }
}

export const taskResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Origin",
  "X-Content-Type-Options": "nosniff",
};
