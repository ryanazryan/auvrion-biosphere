import "server-only";

import { checkOperationalAccess } from "@/server/authorization/operational-access";
import {
  CopilotUnavailable,
  generateCopilotAnswer,
  PRODUCT_KNOWLEDGE,
} from "@/server/copilot/answer";
import {
  type CopilotMode,
  classifyCopilotQuestion,
  EXACT_UUID,
} from "@/server/copilot/decision";
import { readScopedIntelligence } from "@/server/copilot/intelligence";
import { readCopilotObservation } from "@/server/copilot/observation";
import {
  CopilotRegionError,
  getCopilotEnvironment,
  resolveRegion,
} from "@/server/copilot/regions";
import { getSpeciesReference } from "@/server/copilot/species";
import {
  type CopilotVisual,
  environmentVisual,
  observationVisual,
  overviewVisual,
  speciesVisual,
} from "@/server/copilot/visual";
import { getObservationEnvironmentalContext } from "@/server/environment/observation-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: HEADERS });
}
const allowedModes: CopilotMode[] = [
  "overview",
  "observation",
  "listen",
  "environment",
];
const recent = new Map<string, { minute: number[]; day: number[] }>();

/** Prototype-only, per-process quota. Add Redis/database quota before deployment. */
function reserve(key: string): boolean {
  const now = Date.now();
  const value = recent.get(key) ?? { minute: [], day: [] };
  value.minute = value.minute.filter((time) => now - time < 60_000);
  value.day = value.day.filter((time) => now - time < 86_400_000);
  if (value.minute.length >= 6 || value.day.length >= 30) return false;
  value.minute.push(now);
  value.day.push(now);
  if (recent.size > 1000) recent.clear();
  recent.set(key, value);
  return true;
}
async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
      "application/json" ||
    request.headers.has("content-encoding")
  )
    throw Error("BAD_CONTENT_TYPE");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 4096))
    throw Error("TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw Error("NO_BODY");
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw Error("TOO_LARGE");
      }
      parts.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const organizationId = q.get("organizationId");
  if (
    !organizationId ||
    !EXACT_UUID.test(organizationId) ||
    q.size !== 1 ||
    q.getAll("organizationId").length !== 1
  ) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  if (request.headers.get("origin") !== url.origin)
    return reply({ error: "CROSS_ORIGIN_DENIED" }, 403);
  const auth = await checkOperationalAccess(organizationId, "operator");
  if (!auth.allowed) return reply({ error: auth.reason }, auth.status);
  let raw: unknown;
  try {
    raw = await readJson(request);
  } catch {
    return reply({ error: "INVALID_JSON_REQUEST" }, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return reply({ error: "INVALID_REQUEST" }, 400);
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        !["question", "context", "observationId", "regionId"].includes(key),
    ) ||
    typeof body.question !== "string" ||
    body.question.trim().length < 3 ||
    body.question.length > 500 ||
    typeof body.context !== "string" ||
    !allowedModes.includes(body.context as CopilotMode) ||
    (body.observationId !== undefined &&
      (typeof body.observationId !== "string" ||
        !EXACT_UUID.test(body.observationId))) ||
    (body.regionId !== undefined &&
      (typeof body.regionId !== "string" ||
        !/^[a-z][a-z0-9-]{1,35}$/.test(body.regionId)))
  ) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  if (!reserve(`${auth.organizationId}:${auth.userId}`))
    return reply({ error: "RATE_LIMITED" }, 429);
  const question = body.question.trim();
  const resolution = classifyCopilotQuestion(
    question,
    body.context as CopilotMode,
    body.observationId as string | undefined,
  );
  // Answer missing-selection questions without calling OpenAI or looking up the wrong observation.
  if (
    (resolution.mode === "observation" || resolution.mode === "listen") &&
    !resolution.observationId
  ) {
    return reply({
      answer:
        "Pilih satu observasi pada halaman Detail, atau tuliskan UUID observasi yang ingin dijelaskan. Saya hanya dapat membaca observasi yang diizinkan untuk organisasi ini.",
      sources: [],
      advisoryOnly: true,
      model: null,
    });
  }
  try {
    let facts: unknown = PRODUCT_KNOWLEDGE;
    let visual: CopilotVisual | null = null;
    const sources: { name: string; url: string }[] = [];
    let mode = resolution.mode;
    if (
      resolution.observationId &&
      resolution.mode !== "environment" &&
      body.context !== "environment"
    ) {
      const observation = await readCopilotObservation(
        auth.organizationId,
        resolution.observationId,
      );
      if (!observation) return reply({ error: "OBSERVATION_NOT_FOUND" }, 404);
      // Strip any unrestricted provenance fields before sending to an external LLM.
      const { observation: data, listen } = observation;
      facts = {
        observation: {
          id: data.id,
          domain: data.domain,
          ingestionMode: data.ingestionMode,
          source: data.source,
          observedAt: data.observedAt,
          receivedAt: data.receivedAt,
          unknownObservedTimeReason: data.unknownObservedTimeReason,
          quality: data.quality,
          hasCoordinates: data.hasCoordinates,
          measurements: data.measurements,
          provenanceLimitations: data.provenance.limitations,
        },
        listen,
      };
      visual = observationVisual(observation);
      mode = resolution.mode;
    } else if (resolution.speciesName) {
      const ref = await getSpeciesReference(resolution.speciesName);
      facts = { speciesReference: ref };
      visual = speciesVisual(ref);
      sources.push(
        { name: "GBIF", url: "https://www.gbif.org/" },
        { name: "iNaturalist", url: "https://www.inaturalist.org/" },
      );
    } else if (
      resolution.mode === "environment" ||
      (body.context === "environment" && body.observationId)
    ) {
      const selectedObservationId =
        typeof body.observationId === "string" ? body.observationId : null;
      const region = selectedObservationId
        ? null
        : resolveRegion(question, body.regionId as string | undefined);
      const env = selectedObservationId
        ? await getObservationEnvironmentalContext(
            auth.organizationId,
            selectedObservationId,
          )
        : await getCopilotEnvironment(auth.organizationId, region);
      if (!env) return reply({ error: "OBSERVATION_NOT_FOUND" }, 404);
      if (
        !selectedObservationId &&
        env.bmkg.state !== "available" &&
        env.nasa.state !== "available"
      ) {
        return reply({ error: "NO_VERIFIABLE_EXTERNAL_DATA" }, 503);
      }
      const scopedObservation = selectedObservationId
        ? await readCopilotObservation(
            auth.organizationId,
            selectedObservationId,
          )
        : null;
      facts = scopedObservation
        ? {
            observation: scopedObservation.observation,
            referenceEnvironment: env,
          }
        : env;
      mode = "environment";
      visual = environmentVisual(env);
      if (env.bmkg.state === "available")
        sources.push({ name: "BMKG", url: env.sources.bmkg });
      if (env.nasa.state === "available")
        sources.push({ name: "NASA FIRMS", url: env.sources.nasa });
    } else {
      const data = await readScopedIntelligence(auth.organizationId);
      // Never send raw organization identifiers or full record inventories to OpenAI.
      const { organizationId: _scopedOrganizationId, ...summary } = data;
      void _scopedOrganizationId;
      facts = { product: PRODUCT_KNOWLEDGE, scopedOverview: summary };
      visual = overviewVisual(data);
    }
    const result = await generateCopilotAnswer({
      question,
      mode,
      facts,
      sourceNames: sources.map((s) => s.name),
    });
    return reply({ ...result, sources, visual });
  } catch (error) {
    if (error instanceof CopilotRegionError)
      return reply(
        {
          error: "REGION_NOT_CONFIGURED",
          message:
            "Wilayah yang diminta belum didaftarkan dengan kode ADM4 dan area FIRMS yang terverifikasi.",
        },
        422,
      );
    if (error instanceof CopilotUnavailable)
      return reply({ error: error.message }, 503);
    return reply({ error: "COPILOT_CONTEXT_UNAVAILABLE" }, 503);
  }
}
