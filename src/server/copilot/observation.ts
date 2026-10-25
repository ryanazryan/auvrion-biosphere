import "server-only";

import { listAuthorizedBioacousticSources } from "@/server/bioacoustics/source-discovery";
import { getScopedObservation } from "@/server/observations/observation-service";

export async function readCopilotObservation(
  organizationId: string,
  id: string,
) {
  const item = await getScopedObservation(organizationId, id);
  if (!item) return null;
  // Only the existing public observation shape is forwarded to OpenAI.
  // No raw file, precise location, credentials, evidence URL or binary contents.
  const safe = {
    id: item.id,
    domain: item.domain,
    ingestionMode: item.ingestionMode,
    source: item.source,
    sourceRecordId: item.sourceRecordId,
    observedAt: item.observedAt,
    receivedAt: item.receivedAt,
    unknownObservedTimeReason: item.unknownObservedTimeReason,
    quality: item.quality,
    provenance: item.provenance,
    hasCoordinates: item.location.hasCoordinates,
    measurements: item.measurements.slice(0, 30),
  };
  if (item.domain !== "biodiversity")
    return { observation: safe, listen: null };
  const discovery = await listAuthorizedBioacousticSources({
    organizationId,
    observationId: id,
  });
  return {
    observation: safe,
    listen: {
      registeredAudioCount: discovery.sources.length,
      mediaKinds: [...new Set(discovery.sources.map((source) => source.kind))],
      latestAudioRegistrationAt:
        discovery.sources
          .map((source) => source.recordedAt)
          .sort()
          .at(-1) ?? null,
      modelResultPersisted: false,
      verification: "no_persisted_prediction_available",
      note: "Perch 2.0 inference is currently ephemeral in this workflow. Do not invent predictions or species.",
    },
  };
}
