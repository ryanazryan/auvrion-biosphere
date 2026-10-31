import "server-only";
import { isAllowedOnboardingOrigin } from "./onboarding-environment";

export const NO_STORE = { "Cache-Control": "no-store" };
export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export function isLocalActivationRequest(request: Request): boolean {
  return isAllowedOnboardingOrigin(request, process.env);
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
