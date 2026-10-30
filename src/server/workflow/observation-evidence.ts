import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  environmentalMeasurements,
  observationProvenance,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";

/** A minimum-necessary, case-linked, org-scoped evidence projection.
 * NO coordinates, private URLs, audio, sensor credentials or raw payloads.
 * Only call AFTER verifying Supervisor case or Ranger task permission.
 */
export type CaseObservationEvidence = {
  sourceKind: string;
  ingestionMode: string;
  sourceRecordId: string | null;
  acquisitionMethod: string | null;
  attribution: string | null;
  limitations: string[];
  hasCoordinates: boolean;
  audioRecordings: Array<{
    mediaId: string;
    recordingId: string;
    durationMs: number;
    receivedAt: Date;
  }>;
  measurements: Array<{
    id: string;
    kind: string;
    measuredValue: string;
    unit: string;
    measuredAt: Date | null;
    quality: string;
  }>;
};

export async function getCaseObservationEvidence(
  organizationId: string,
  observationIds: string[],
): Promise<Map<string, CaseObservationEvidence>> {
  const ids = [...new Set(observationIds)].slice(0, 50);
  const result = new Map<string, CaseObservationEvidence>();
  if (ids.length === 0) return result;
  const db = getDb();
  const rows = await db
    .select({
      id: observations.id,
      sourceKind: observationSources.kind,
      ingestionMode: observations.ingestionMode,
      sourceRecordId: observations.sourceRecordId,
      hasCoordinates: sql<boolean>`${observations.latitude} IS NOT NULL`,
      acquisitionMethod: observationProvenance.acquisitionMethod,
      attribution: observationProvenance.attribution,
      limitations: observationProvenance.limitations,
    })
    .from(observations)
    .innerJoin(
      observationSources,
      and(
        eq(observationSources.id, observations.sourceId),
        eq(observationSources.organizationId, observations.organizationId),
      ),
    )
    .leftJoin(
      observationProvenance,
      eq(observationProvenance.observationId, observations.id),
    )
    .where(
      and(
        eq(observations.organizationId, organizationId),
        inArray(observations.id, ids),
      ),
    );

  for (const row of rows) {
    result.set(row.id, {
      sourceKind: row.sourceKind,
      ingestionMode: row.ingestionMode,
      sourceRecordId: row.sourceRecordId,
      hasCoordinates: row.hasCoordinates,
      acquisitionMethod: row.acquisitionMethod,
      attribution: row.attribution,
      limitations: Array.isArray(row.limitations) ? row.limitations : [],
      measurements: [],
      audioRecordings: [],
    });
  }
  if (result.size === 0) return result;

  // Only committed receipt metadata; never return storageKey or raw audio.
  const audioRows = await db
    .select({
      observationId: ingestionRecordings.observationId,
      mediaId: ingestionRecordings.id,
      recordingId: ingestionRecordings.recordingId,
      durationMs: ingestionRecordings.durationMs,
      receivedAt: ingestionRecordings.createdAt,
    })
    .from(ingestionRecordings)
    .where(
      and(
        eq(ingestionRecordings.organizationId, organizationId),
        inArray(ingestionRecordings.observationId, [...result.keys()]),
      ),
    )
    .orderBy(asc(ingestionRecordings.createdAt))
    .limit(100);
  for (const audio of audioRows) {
    const item = result.get(audio.observationId);
    if (item && item.audioRecordings.length < 4) {
      item.audioRecordings.push({
        mediaId: audio.mediaId,
        recordingId: audio.recordingId,
        durationMs: audio.durationMs,
        receivedAt: audio.receivedAt,
      });
    }
  }
  const measurementRows = await db
    .select({
      observationId: environmentalMeasurements.observationId,
      id: environmentalMeasurements.id,
      kind: environmentalMeasurements.kind,
      measuredValue: environmentalMeasurements.measuredValue,
      unit: environmentalMeasurements.unit,
      measuredAt: environmentalMeasurements.measuredAt,
      quality: environmentalMeasurements.quality,
    })
    .from(environmentalMeasurements)
    .innerJoin(
      observations,
      and(
        eq(observations.id, environmentalMeasurements.observationId),
        eq(observations.organizationId, organizationId),
      ),
    )
    .where(inArray(environmentalMeasurements.observationId, [...result.keys()]))
    .orderBy(
      asc(environmentalMeasurements.observationId),
      asc(environmentalMeasurements.measuredAt),
    )
    .limit(500);

  for (const measurement of measurementRows) {
    const item = result.get(measurement.observationId);
    if (item && item.measurements.length < 6) {
      item.measurements.push({
        id: measurement.id,
        kind: measurement.kind,
        measuredValue: measurement.measuredValue,
        unit: measurement.unit,
        measuredAt: measurement.measuredAt,
        quality: measurement.quality,
      });
    }
  }
  return result;
}
