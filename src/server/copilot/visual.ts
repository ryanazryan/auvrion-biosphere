import type { EnvironmentalContext } from "@/server/environment/context";
import type { Intelligence } from "./intelligence";
import type { SpeciesReference } from "./species";

export type CopilotVisual =
  | {
      kind: "environment";
      region: string;
      retrievedAtUtc: string;
      forecast: { utc: string; tempC: number }[];
      nasaDetections: number | null;
      nasaWindowDays: number | null;
    }
  | {
      kind: "observation";
      id: string;
      domain: string;
      quality: string;
      receivedAt: string;
      source: string;
      audioCount: number | null;
    }
  | {
      kind: "overview";
      total30Days: number;
      unreviewedAllTime: number;
      trend: { date: string; total: number }[];
      partial: boolean;
    }
  | {
      kind: "species";
      query: string;
      matchedName: string | null;
      status: SpeciesReference["lookupStatus"];
    };

export function environmentVisual(value: EnvironmentalContext): CopilotVisual {
  const now = Date.now();
  const forecast =
    value.bmkg.state === "available"
      ? value.bmkg.data.intervals
          .filter(
            (row) => Number.isFinite(row.tempC) && Date.parse(row.utc) >= now,
          )
          .slice(0, 8)
          .map((row) => ({ utc: row.utc, tempC: row.tempC as number }))
      : [];
  return {
    kind: "environment",
    region: value.region,
    retrievedAtUtc: value.retrievedAtUtc,
    forecast,
    nasaDetections:
      value.nasa.state === "available" ? value.nasa.data.count : null,
    nasaWindowDays:
      value.nasa.state === "available" ? value.nasa.data.windowDays : null,
  };
}
export function overviewVisual(value: Intelligence): CopilotVisual {
  return {
    kind: "overview",
    total30Days: value.totalInWindow,
    unreviewedAllTime: value.unreviewedAllTime,
    trend: value.trends
      .slice(-7)
      .map((d) => ({ date: d.date, total: d.total })),
    partial: value.partial,
  };
}
export function observationVisual(value: {
  observation: {
    id: string;
    domain: string;
    quality: string;
    receivedAt: string;
    source: { code: string };
  };
  listen: { registeredAudioCount: number } | null;
}): CopilotVisual {
  return {
    kind: "observation",
    id: value.observation.id,
    domain: value.observation.domain,
    quality: value.observation.quality,
    receivedAt: value.observation.receivedAt,
    source: value.observation.source.code,
    audioCount: value.listen?.registeredAudioCount ?? null,
  };
}
export function speciesVisual(value: SpeciesReference): CopilotVisual {
  return {
    kind: "species",
    query: value.query,
    matchedName:
      value.gbif?.scientificName ?? value.inaturalist?.scientificName ?? null,
    status: value.lookupStatus,
  };
}
