import "server-only";

import { latestUnverifiedAnalysis } from "@/server/bioacoustics/analysis-handoff";
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
  // Scoped observation + authorized source discovery precede this read.
  // A snapshot is usable only for the exact registered WAV id + hash.
  const snapshot = await latestUnverifiedAnalysis(organizationId, id);
  const matched =
    snapshot &&
    discovery.sources.some(
      (source) =>
        source.id === snapshot.mediaId &&
        source.sha256 === snapshot.audioSha256,
    );
  const validSnapshot = matched ? snapshot : null;
  const candidates = validSnapshot
    ? validSnapshot.candidates
        .filter(
          (candidate) =>
            Number.isFinite(candidate.modelScore) &&
            candidate.label.trim().length > 0,
        )
        .slice(0, 8)
        .map((candidate) => ({
          label: candidate.label.slice(0, 120),
          scientificName: candidate.scientificName?.slice(0, 120) ?? null,
          modelScore: candidate.modelScore,
          startMs: candidate.startMs,
          endMs: candidate.endMs,
        }))
    : [];
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
      modelResultPersisted: Boolean(validSnapshot),
      verification: validSnapshot
        ? "unverified"
        : "no_persisted_prediction_available",
      prediction: validSnapshot
        ? {
            provider: validSnapshot.provider,
            modelId: validSnapshot.modelId,
            modelVersion: validSnapshot.modelVersion,
            analyzedAt: validSnapshot.analyzedAt,
            candidateCount: validSnapshot.candidates.length,
            candidates,
            scoreMeaning: "uncalibrated_model_score_not_probability",
            evidenceMatch: "registered_media_id_and_sha256",
          }
        : null,
      note: validSnapshot
        ? "Kandidat Perch tersimpan; bukan konfirmasi keberadaan spesies dan bukan probabilitas."
        : "Tidak ada snapshot Perch yang cocok dengan WAV terdaftar untuk observasi ini.",
    },
  };
}
