import "server-only";
import type { PerchInference } from "@/server/bioacoustics/perch-worker";
import { remotePool } from "@/server/device-ingestion/listen-remote-store";

export type SavedAnalysis = PerchInference & {
  mediaId: string;
  audioSha256: string;
  analyzedAt: string;
  persistence: "stored_unverified";
};

/** Caller MUST authorize user + organization + exact observation and verify WAV. */
export async function saveUnverifiedAnalysis(input: {
  organizationId: string;
  observationId: string;
  mediaId: string;
  audioSha256: string;
  result: PerchInference;
}): Promise<SavedAnalysis> {
  const { organizationId, observationId, mediaId, audioSha256, result } = input;
  const response = await remotePool().query<{ analyzed_at: Date }>(
    `INSERT INTO bioacoustic_analysis_snapshots
       (organization_id, observation_id, media_id, audio_sha256, model_id, model_version, result)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING analyzed_at`,
    [
      organizationId,
      observationId,
      mediaId,
      audioSha256,
      result.modelId,
      result.modelVersion,
      JSON.stringify(result),
    ],
  );
  if (!response.rows[0]) throw new Error("ANALYSIS_HANDOFF_NOT_PERSISTED");
  return {
    ...result,
    mediaId,
    audioSha256,
    analyzedAt: response.rows[0].analyzed_at.toISOString(),
    persistence: "stored_unverified",
  };
}

/** The caller must already check a currently linked Case and Supervisor scope. */
export async function latestUnverifiedAnalysis(
  organizationId: string,
  observationId: string,
): Promise<SavedAnalysis | null> {
  const response = await remotePool().query<{
    result: PerchInference;
    media_id: string;
    audio_sha256: string;
    analyzed_at: Date;
  }>(
    `SELECT result, media_id, audio_sha256, analyzed_at
       FROM bioacoustic_analysis_snapshots
      WHERE organization_id = $1 AND observation_id = $2
      ORDER BY analyzed_at DESC, id DESC LIMIT 1`,
    [organizationId, observationId],
  );
  const row = response.rows[0];
  if (!row) return null;
  return {
    ...row.result,
    mediaId: row.media_id,
    audioSha256: row.audio_sha256,
    analyzedAt: row.analyzed_at.toISOString(),
    persistence: "stored_unverified",
  };
}
