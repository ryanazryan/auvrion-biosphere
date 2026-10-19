import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  parseCreateObservationInput,
  parseListObservationsInput,
} from "@/server/observations/observation-input";
import {
  createManualObservation,
  listScopedObservations,
  ObservationServiceError,
} from "@/server/observations/observation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
const MAX_BYTES = 32 * 1024;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

async function readJsonBounded(
  request: Request,
): Promise<{ value?: unknown; error?: string; status?: number }> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return { error: "JSON_CONTENT_TYPE_REQUIRED", status: 415 };
  }
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BYTES)
    return { error: "BODY_TOO_LARGE", status: 413 };
  if (!request.body) return { error: "EMPTY_BODY", status: 400 };
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return { error: "BODY_TOO_LARGE", status: 413 };
      }
      chunks.push(part.value);
    }
    const data = Buffer.concat(chunks);
    if (!data.length) return { error: "EMPTY_BODY", status: 400 };
    try {
      return { value: JSON.parse(data.toString("utf8")) };
    } catch {
      return { error: "INVALID_JSON", status: 400 };
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const inputJson = await readJsonBounded(request);
  if (inputJson.error)
    return json({ error: inputJson.error }, inputJson.status);
  const input = parseCreateObservationInput(inputJson.value);
  if (!input.ok) return json({ error: input.error }, 400);

  // organizationId is a selector only: checkOperationalAccess verifies an active
  // server-side role grant in that organization and current session MFA assurance.
  const access = await checkOperationalAccess(
    input.value.organizationId,
    "operator",
  );
  if (!access.allowed) return json({ error: access.reason }, access.status);

  try {
    const result = await createManualObservation(input.value);
    return json(
      { id: result.id, replayed: result.replayed },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof ObservationServiceError)
      return json({ error: error.reason }, error.status);
    return json({ error: "OBSERVATION_WRITE_FAILED" }, 500);
  }
}

export async function GET(request: Request) {
  const parsed = parseListObservationsInput(new URL(request.url).searchParams);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  // Operator or Supervisor only for this slice. Ranger assigned-only reads
  // require WC-013 authorization and must not be implemented as broad access.
  const operator = await checkOperationalAccess(
    parsed.value.organizationId,
    "operator",
  );
  if (!operator.allowed) {
    if (operator.reason !== "ROLE_OR_SCOPE_DENIED")
      return json({ error: operator.reason }, operator.status);
    const supervisor = await checkOperationalAccess(
      parsed.value.organizationId,
      "supervisor",
    );
    if (!supervisor.allowed)
      return json({ error: supervisor.reason }, supervisor.status);
  }

  try {
    return json(await listScopedObservations(parsed.value));
  } catch {
    return json({ error: "OBSERVATION_READ_FAILED" }, 500);
  }
}
