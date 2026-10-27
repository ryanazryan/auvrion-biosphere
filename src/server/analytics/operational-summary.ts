import "server-only";

import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { observationSignalEvents } from "@/server/db/analytics-signal-schema";
import {
  domainCases,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  domainTasks,
  taskFindings,
} from "@/server/db/operations-domain-schema";
import {
  type ReviewStatus,
  SIGNAL_CLASSES,
  type SignalClass,
} from "./signal-taxonomy";

export type MonthlyRisk = {
  month: number;
  observations: number;
  cases: number;
  fire_indicator: number;
  chainsaw_like: number;
  gunshot_like: number;
  biodiversity_signal: number;
};

/** Full, organization-scoped aggregates. No bounded list is used to compute KPI. */
export async function getOperationalSummary(
  organizationId: string,
  year: number,
) {
  if (!Number.isSafeInteger(year) || year < 2020 || year > 2100)
    throw new Error("INVALID_YEAR");
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const db = getDb();
  // Deliberately exclude saved simulation observations from production-style
  // indicators. Synthetic preview figures are separately isolated in the UI.
  const nonDemoObs = ne(observations.ingestionMode, "simulation");
  const nonDemoSignal = and(
    eq(observationSignalEvents.organizationId, organizationId),
    gte(observationSignalEvents.createdAt, start),
    lt(observationSignalEvents.createdAt, end),
    nonDemoObs,
  );
  const monthOfObservation = sql<number>`extract(month from ${observations.receivedAt} at time zone 'UTC')::int`;
  const monthOfCase = sql<number>`extract(month from ${domainCases.createdAt} at time zone 'UTC')::int`;
  const monthOfSignal = sql<number>`extract(month from ${observationSignalEvents.createdAt} at time zone 'UTC')::int`;
  const [
    caseMonths,
    observationMonths,
    taskTotals,
    findings,
    signalMonths,
    signalTotals,
    reviewTotals,
    recentSignals,
    observationDomainTotals,
    sourceTotals,
  ] = await Promise.all([
    db
      .select({ month: monthOfCase, total: sql<number>`count(*)::int` })
      .from(domainCases)
      .where(
        and(
          eq(domainCases.organizationId, organizationId),
          gte(domainCases.createdAt, start),
          lt(domainCases.createdAt, end),
        ),
      )
      .groupBy(monthOfCase),
    db
      .select({ month: monthOfObservation, total: sql<number>`count(*)::int` })
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, organizationId),
          gte(observations.receivedAt, start),
          lt(observations.receivedAt, end),
          nonDemoObs,
        ),
      )
      .groupBy(monthOfObservation),
    db
      .select({ status: domainTasks.status, total: sql<number>`count(*)::int` })
      .from(domainTasks)
      .where(
        and(
          eq(domainTasks.organizationId, organizationId),
          gte(domainTasks.createdAt, start),
          lt(domainTasks.createdAt, end),
        ),
      )
      .groupBy(domainTasks.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(taskFindings)
      .where(
        and(
          eq(taskFindings.organizationId, organizationId),
          gte(taskFindings.createdAt, start),
          lt(taskFindings.createdAt, end),
        ),
      ),
    db
      .select({
        month: monthOfSignal,
        signalClass: observationSignalEvents.signalClass,
        total: sql<number>`count(*)::int`,
      })
      .from(observationSignalEvents)
      .innerJoin(
        observations,
        and(
          eq(observationSignalEvents.observationId, observations.id),
          eq(
            observationSignalEvents.organizationId,
            observations.organizationId,
          ),
        ),
      )
      .where(nonDemoSignal)
      .groupBy(monthOfSignal, observationSignalEvents.signalClass),
    db
      .select({
        signalClass: observationSignalEvents.signalClass,
        total: sql<number>`count(*)::int`,
      })
      .from(observationSignalEvents)
      .innerJoin(
        observations,
        and(
          eq(observationSignalEvents.observationId, observations.id),
          eq(
            observationSignalEvents.organizationId,
            observations.organizationId,
          ),
        ),
      )
      .where(nonDemoSignal)
      .groupBy(observationSignalEvents.signalClass),
    db
      .select({
        status: observationSignalEvents.reviewStatus,
        total: sql<number>`count(*)::int`,
      })
      .from(observationSignalEvents)
      .innerJoin(
        observations,
        and(
          eq(observationSignalEvents.observationId, observations.id),
          eq(
            observationSignalEvents.organizationId,
            observations.organizationId,
          ),
        ),
      )
      .where(nonDemoSignal)
      .groupBy(observationSignalEvents.reviewStatus),
    db
      .select({
        id: observationSignalEvents.id,
        observationId: observationSignalEvents.observationId,
        signalClass: observationSignalEvents.signalClass,
        evidenceOrigin: observationSignalEvents.evidenceOrigin,
        reviewStatus: observationSignalEvents.reviewStatus,
        note: observationSignalEvents.note,
        version: observationSignalEvents.version,
        createdAt: observationSignalEvents.createdAt,
        calibratedProbability: observationSignalEvents.calibratedProbability,
        modelReference: observationSignalEvents.modelReference,
      })
      .from(observationSignalEvents)
      .innerJoin(
        observations,
        and(
          eq(observationSignalEvents.observationId, observations.id),
          eq(
            observationSignalEvents.organizationId,
            observations.organizationId,
          ),
        ),
      )
      .where(nonDemoSignal)
      .orderBy(
        desc(observationSignalEvents.createdAt),
        desc(observationSignalEvents.id),
      )
      .limit(10),
    db
      .select({
        domain: observations.domain,
        total: sql<number>`count(*)::int`,
      })
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, organizationId),
          gte(observations.receivedAt, start),
          lt(observations.receivedAt, end),
          nonDemoObs,
        ),
      )
      .groupBy(observations.domain),
    db
      .select({
        kind: observationSources.kind,
        total: sql<number>`count(*)::int`,
      })
      .from(observations)
      .innerJoin(
        observationSources,
        and(
          eq(observations.sourceId, observationSources.id),
          eq(observations.organizationId, observationSources.organizationId),
        ),
      )
      .where(
        and(
          eq(observations.organizationId, organizationId),
          gte(observations.receivedAt, start),
          lt(observations.receivedAt, end),
          nonDemoObs,
        ),
      )
      .groupBy(observationSources.kind),
  ]);
  const casesByMonth = new Map(caseMonths.map((row) => [row.month, row.total]));
  const obsByMonth = new Map(
    observationMonths.map((row) => [row.month, row.total]),
  );
  const signalsByClass = Object.fromEntries(
    SIGNAL_CLASSES.map((kind) => [
      kind,
      signalTotals.find((row) => row.signalClass === kind)?.total ?? 0,
    ]),
  ) as Record<SignalClass, number>;
  const reviews = Object.fromEntries(
    ["unreviewed", "corroborated", "rejected"].map((kind) => [
      kind,
      reviewTotals.find((row) => row.status === kind)?.total ?? 0,
    ]),
  ) as Record<ReviewStatus, number>;
  const months: MonthlyRisk[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const count = (kind: SignalClass) =>
      signalMonths.find(
        (row) => row.month === month && row.signalClass === kind,
      )?.total ?? 0;
    return {
      month,
      observations: obsByMonth.get(month) ?? 0,
      cases: casesByMonth.get(month) ?? 0,
      fire_indicator: count("fire_indicator"),
      chainsaw_like: count("chainsaw_like"),
      gunshot_like: count("gunshot_like"),
      biodiversity_signal: count("biodiversity_signal"),
    };
  });
  return {
    year,
    months,
    cases: months.reduce((sum, row) => sum + row.cases, 0),
    observations: months.reduce((sum, row) => sum + row.observations, 0),
    fieldFindings: findings[0]?.count ?? 0,
    completedTasks:
      taskTotals.find((row) => row.status === "completed")?.total ?? 0,
    taskStatus: taskTotals,
    signalsByClass,
    reviews,
    totalSignals: signalTotals.reduce((sum, row) => sum + row.total, 0),
    biodiversityObservations:
      observationDomainTotals.find((row) => row.domain === "biodiversity")
        ?.total ?? 0,
    listenRecordings:
      sourceTotals.find((row) => row.kind === "listen_device")?.total ?? 0,
    recentSignals: recentSignals.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    caveat:
      "Jumlah indikasi berasal dari anotasi tersimpan, bukan deteksi yang otomatis dianggap benar. Review sinyal tidak membuktikan tindak pidana atau kebakaran. Case/Task dapat mencakup alur demo; waktu agregasi UTC.",
  };
}

export type OperationalSummary = Awaited<
  ReturnType<typeof getOperationalSummary>
>;
