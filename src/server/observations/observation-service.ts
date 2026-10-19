import "server-only";

import { createHash } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lte,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/server/db";
import {
  environmentalMeasurements,
  observationProvenance,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import type {
  CreateObservationInput,
  ListObservationsInput,
} from "./observation-input";

export class ObservationServiceError extends Error {
  constructor(
    public readonly status: 409 | 422,
    public readonly reason: string,
  ) {
    super(reason);
  }
}

// Fingerprint of canonical validated JSON, not proof that a recording/file is authentic.
function fingerprint(input: CreateObservationInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function createManualObservation(input: CreateObservationInput) {
  const db = getDb();
  const payloadSha256 = fingerprint(input);
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        kind: observationSources.kind,
        isActive: observationSources.isActive,
      })
      .from(observationSources)
      .where(
        and(
          eq(observationSources.id, input.sourceId),
          eq(observationSources.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (source?.kind !== "manual" || source?.isActive !== true) {
      throw new ObservationServiceError(422, "ACTIVE_MANUAL_SOURCE_REQUIRED");
    }

    const [created] = await tx
      .insert(observations)
      .values({
        organizationId: input.organizationId,
        sourceId: input.sourceId,
        sourceRecordId: input.sourceRecordId,
        domain: input.domain,
        ingestionMode: input.ingestionMode,
        observedAt: input.observedAt ? new Date(input.observedAt) : null,
        unknownObservedTimeReason: input.unknownObservedTimeReason,
        latitude: input.latitude,
        longitude: input.longitude,
        locationUnknownReason: input.locationUnknownReason,
        // Quality is server-controlled. Clients cannot mark their own observation valid.
        quality: "unreviewed",
      })
      .onConflictDoNothing({
        target: [observations.sourceId, observations.sourceRecordId],
        where: isNotNull(observations.sourceRecordId),
      })
      .returning({ id: observations.id });

    if (!created) {
      const [existing] = await tx
        .select({
          id: observations.id,
          payloadSha256: observationProvenance.payloadSha256,
        })
        .from(observations)
        .innerJoin(
          observationProvenance,
          eq(observationProvenance.observationId, observations.id),
        )
        .where(
          and(
            eq(observations.organizationId, input.organizationId),
            eq(observations.sourceId, input.sourceId),
            eq(observations.sourceRecordId, input.sourceRecordId),
          ),
        )
        .limit(1);
      if (existing?.payloadSha256 === payloadSha256) {
        return { id: existing.id, replayed: true };
      }
      throw new ObservationServiceError(409, "SOURCE_RECORD_ID_CONFLICT");
    }

    await tx.insert(observationProvenance).values({
      observationId: created.id,
      originalIdentifier: input.sourceRecordId,
      acquisitionMethod: "manual_entry",
      attribution: input.attribution,
      licenseNote: input.licenseNote,
      limitations: input.limitations,
      payloadSha256,
    });

    if (input.measurements.length > 0) {
      await tx.insert(environmentalMeasurements).values(
        input.measurements.map((measurement) => ({
          observationId: created.id,
          kind: measurement.kind,
          measuredValue: measurement.measuredValue,
          unit: measurement.unit,
          measuredAt: measurement.measuredAt
            ? new Date(measurement.measuredAt)
            : null,
        })),
      );
    }
    return { id: created.id, replayed: false };
  });
}

function publicObservation(row: {
  id: string;
  organizationId: string;
  sourceId: string;
  sourceCode: string;
  domain: string;
  ingestionMode: string;
  sourceRecordId: string | null;
  observedAt: Date | null;
  unknownObservedTimeReason: string | null;
  receivedAt: Date;
  latitude: number | null;
  locationUnknownReason: string | null;
  quality: string;
  version: number;
  acquisitionMethod: string | null;
  attribution: string | null;
  limitations: string[] | null;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    source: { id: row.sourceId, code: row.sourceCode },
    domain: row.domain,
    ingestionMode: row.ingestionMode,
    sourceRecordId: row.sourceRecordId,
    observedAt: row.observedAt?.toISOString() ?? null,
    unknownObservedTimeReason: row.unknownObservedTimeReason,
    receivedAt: row.receivedAt.toISOString(),
    quality: row.quality,
    version: row.version,
    provenance: {
      acquisitionMethod: row.acquisitionMethod ?? "unknown",
      attribution: row.attribution,
      limitations: row.limitations ?? [],
    },
    // GAP-11: withholding precise coordinates until classification/precision policy is approved.
    location: {
      hasCoordinates: row.latitude !== null,
      unknownReason: row.locationUnknownReason,
    },
  };
}

const publicSelection = {
  id: observations.id,
  organizationId: observations.organizationId,
  sourceId: observations.sourceId,
  sourceCode: observationSources.code,
  domain: observations.domain,
  ingestionMode: observations.ingestionMode,
  sourceRecordId: observations.sourceRecordId,
  observedAt: observations.observedAt,
  unknownObservedTimeReason: observations.unknownObservedTimeReason,
  receivedAt: observations.receivedAt,
  latitude: observations.latitude,
  locationUnknownReason: observations.locationUnknownReason,
  quality: observations.quality,
  version: observations.version,
  acquisitionMethod: observationProvenance.acquisitionMethod,
  attribution: observationProvenance.attribution,
  limitations: observationProvenance.limitations,
};

export async function listScopedObservations(filter: ListObservationsInput) {
  const conditions: SQL[] = [
    eq(observations.organizationId, filter.organizationId),
  ];
  if (filter.domain) conditions.push(eq(observations.domain, filter.domain));
  if (filter.sourceId)
    conditions.push(eq(observations.sourceId, filter.sourceId));
  if (filter.quality) conditions.push(eq(observations.quality, filter.quality));
  if (filter.receivedFrom)
    conditions.push(
      gte(observations.receivedAt, new Date(filter.receivedFrom)),
    );
  if (filter.receivedTo)
    conditions.push(lte(observations.receivedAt, new Date(filter.receivedTo)));
  const scope = and(...conditions);
  const db = getDb();

  const [items, countRows] = await Promise.all([
    db
      .select(publicSelection)
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
      .where(scope)
      .orderBy(desc(observations.receivedAt), desc(observations.id))
      .limit(filter.limit)
      .offset(filter.offset),
    db.select({ total: count() }).from(observations).where(scope),
  ]);
  return {
    items: items.map(publicObservation),
    total: countRows[0]?.total ?? 0,
    limit: filter.limit,
    offset: filter.offset,
  };
}

export async function getScopedObservation(organizationId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select(publicSelection)
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
        eq(observations.id, id),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [measurements] = await Promise.all([
    db
      .select({
        kind: environmentalMeasurements.kind,
        measuredValue: environmentalMeasurements.measuredValue,
        unit: environmentalMeasurements.unit,
        quality: environmentalMeasurements.quality,
        measuredAt: environmentalMeasurements.measuredAt,
      })
      .from(environmentalMeasurements)
      .where(eq(environmentalMeasurements.observationId, row.id)),
  ]);
  return {
    ...publicObservation(row),
    measurements: measurements.map((item) => ({
      ...item,
      measuredAt: item.measuredAt?.toISOString() ?? null,
    })),
  };
}
