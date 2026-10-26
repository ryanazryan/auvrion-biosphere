import "server-only";

import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";

const WINDOW_DAYS = 30;
const MAX_ROWS = 5000;

type Zone = "WIB" | "WITA" | "WIT";
const ZONE_OFFSETS: Record<Zone, number> = { WIB: 7, WITA: 8, WIT: 9 };
const ZONE_IDS: Record<
  Zone,
  "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura"
> = {
  WIB: "Asia/Jakarta",
  WITA: "Asia/Makassar",
  WIT: "Asia/Jayapura",
};
function dayInZone(date: Date, zone: Zone): string {
  return new Date(date.getTime() + ZONE_OFFSETS[zone] * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

export type Intelligence = Awaited<ReturnType<typeof readScopedIntelligence>>;

/** Source of truth: scoped stored observations. Not live device health or species detection. */
export async function readScopedIntelligence(
  organizationId: string,
  timeZone: Zone = "WITA",
) {
  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * 86_400_000);
  const db = getDb();
  const [sample, inWindow, unreviewed] = await Promise.all([
    db
      .select({
        id: observations.id,
        receivedAt: observations.receivedAt,
        domain: observations.domain,
        quality: observations.quality,
        ingestionMode: observations.ingestionMode,
        sourceCode: observationSources.code,
      })
      .from(observations)
      .innerJoin(
        observationSources,
        and(
          eq(observationSources.id, observations.sourceId),
          eq(observationSources.organizationId, observations.organizationId),
        ),
      )
      .where(
        and(
          eq(observations.organizationId, organizationId),
          gte(observations.receivedAt, since),
        ),
      )
      .orderBy(desc(observations.receivedAt))
      .limit(MAX_ROWS + 1),
    db
      .select({ total: count() })
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, organizationId),
          gte(observations.receivedAt, since),
        ),
      ),
    db
      .select({ total: count() })
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, organizationId),
          eq(observations.quality, "unreviewed"),
        ),
      ),
  ]);

  const partial = sample.length > MAX_ROWS;
  const rows = sample.slice(0, MAX_ROWS);
  const domainCounts: Record<string, number> = {};
  const qualityCounts: Record<string, number> = {};
  const modeCounts: Record<string, number> = {};
  const sourceCounts: Record<
    string,
    { count: number; lastReceivedAt: string }
  > = {};
  const daily = new Map<
    string,
    { biodiversity: number; environmental_risk: number; other: number }
  >();
  for (let dayAgo = 29; dayAgo >= 0; dayAgo--) {
    const date = dayInZone(new Date(now - dayAgo * 86_400_000), timeZone);
    daily.set(date, { biodiversity: 0, environmental_risk: 0, other: 0 });
  }
  for (const item of rows) {
    domainCounts[item.domain] = (domainCounts[item.domain] ?? 0) + 1;
    qualityCounts[item.quality] = (qualityCounts[item.quality] ?? 0) + 1;
    modeCounts[item.ingestionMode] = (modeCounts[item.ingestionMode] ?? 0) + 1;
    const source = sourceCounts[item.sourceCode] ?? {
      count: 0,
      lastReceivedAt: item.receivedAt.toISOString(),
    };
    source.count += 1;
    sourceCounts[item.sourceCode] = source;
    const date = dayInZone(item.receivedAt, timeZone);
    const bucket = daily.get(date);
    if (bucket) {
      const key =
        item.domain === "biodiversity"
          ? "biodiversity"
          : item.domain === "environmental_risk"
            ? "environmental_risk"
            : "other";
      bucket[key] += 1;
    }
  }
  return {
    source: "stored_observations" as const,
    organizationId,
    generatedAt: new Date(now).toISOString(),
    windowDays: WINDOW_DAYS,
    dayTimeZone: ZONE_IDS[timeZone],
    totalInWindow: inWindow[0]?.total ?? 0,
    unreviewedAllTime: unreviewed[0]?.total ?? 0,
    partial,
    representedRows: rows.length,
    trends: [...daily.entries()].map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.biodiversity + counts.environmental_risk + counts.other,
    })),
    domains: domainCounts,
    quality: qualityCounts,
    ingestionModes: modeCounts,
    sources: Object.entries(sourceCounts)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    limitations: [
      "Angka hanya berasal dari observasi tersimpan yang dapat diakses organisasi ini.",
      "Jumlah rekaman bukan indikator perangkat sedang online.",
      `Grafik waktu menggunakan tanggal penerimaan dalam ${timeZone}; bukan tanggal kejadian.`,
      ...(partial
        ? [
            "Tren dan distribusi hanya menggambarkan 5.000 rekaman terbaru pada jendela ini.",
          ]
        : []),
    ],
  };
}
