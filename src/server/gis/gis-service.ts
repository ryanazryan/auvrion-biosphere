import "server-only";

import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  isNotNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";

import { getDb } from "@/server/db";
import {
  observationProvenance,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  operationalZones,
  zoneGeometryVersions,
} from "@/server/db/operations-domain-schema";
import type { ListObservationsInput } from "@/server/observations/observation-input";

export type GisFilter = ListObservationsInput & {
  zoneId?: string;
};

export async function listScopedGisObservations(filter: GisFilter) {
  const db = getDb();

  const conditions: SQL[] = [
    eq(observations.organizationId, filter.organizationId),
    sql`NOT EXISTS (SELECT 1 FROM observation_sources AS development_source
      WHERE development_source.id = ${observations.sourceId}
      AND development_source.organization_id = ${observations.organizationId}
      AND development_source.code = 'WC009-MANUAL-DEV')`,
  ];

  if (filter.domain) {
    conditions.push(eq(observations.domain, filter.domain));
  }

  if (filter.sourceId) {
    conditions.push(eq(observations.sourceId, filter.sourceId));
  }

  if (filter.quality) {
    conditions.push(eq(observations.quality, filter.quality));
  }

  if (filter.receivedFrom) {
    conditions.push(
      gte(observations.receivedAt, new Date(filter.receivedFrom)),
    );
  }

  if (filter.receivedTo) {
    conditions.push(lte(observations.receivedAt, new Date(filter.receivedTo)));
  }

  if (filter.zoneId) {
    // Missing coordinates are not assigned to a zone.
    conditions.push(isNotNull(observations.latitude));
    conditions.push(isNotNull(observations.longitude));

    const match = db
      .select({ id: zoneGeometryVersions.id })
      .from(zoneGeometryVersions)
      .innerJoin(
        operationalZones,
        and(
          eq(zoneGeometryVersions.zoneId, operationalZones.id),
          eq(
            zoneGeometryVersions.organizationId,
            operationalZones.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(operationalZones.id, filter.zoneId),
          eq(operationalZones.organizationId, filter.organizationId),
          sql`
            ${zoneGeometryVersions.geometryVersion} = (
              SELECT MAX(v.geometry_version)
              FROM zone_geometry_versions AS v
              WHERE v.zone_id = ${zoneGeometryVersions.zoneId}
                AND v.organization_id =
                  ${zoneGeometryVersions.organizationId}
            )
          `,
          sql`
            ST_Covers(
              ${zoneGeometryVersions.boundary},
              ST_SetSRID(
                ST_MakePoint(
                  ${observations.longitude},
                  ${observations.latitude}
                ),
                4326
              )
            )
          `,
        ),
      );

    conditions.push(exists(match));
  }

  const scope = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: observations.id,
        organizationId: observations.organizationId,
        sourceId: observations.sourceId,
        sourceCode: observationSources.code,
        sourceRecordId: observations.sourceRecordId,
        domain: observations.domain,
        ingestionMode: observations.ingestionMode,
        observedAt: observations.observedAt,
        unknownObservedTimeReason: observations.unknownObservedTimeReason,
        receivedAt: observations.receivedAt,
        quality: observations.quality,
        version: observations.version,
        latitude: observations.latitude,
        locationUnknownReason: observations.locationUnknownReason,
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
      .where(scope)
      .orderBy(desc(observations.receivedAt), desc(observations.id))
      .limit(filter.limit)
      .offset(filter.offset),

    db.select({ total: count() }).from(observations).where(scope),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      source: {
        id: row.sourceId,
        code: row.sourceCode,
      },
      sourceRecordId: row.sourceRecordId,
      domain: row.domain,
      ingestionMode: row.ingestionMode,
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
      location: {
        hasCoordinates: row.latitude !== null,
        unknownReason: row.locationUnknownReason,

        // No precise coordinates until location policy
        // and the disclosure guard have been approved.
        point: null,
        disclosure: "withheld_pending_policy" as const,
      },
    })),
    total: totals[0]?.total ?? 0,
    limit: filter.limit,
    offset: filter.offset,
    zoneFilterApplied: filter.zoneId ?? null,
  };
}
