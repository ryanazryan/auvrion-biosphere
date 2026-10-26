"use client";

/**
 * Real, browser-side adapter for AB-WC-008. No local fake sessions, example
 * UUIDs, simulation fixtures, or mutable global organization state.
 * All observation requests are re-authorized independently on the server.
 */
export type Domain = "biodiversity" | "environmental_risk";
export type Quality = "unreviewed" | "valid" | "suspect" | "invalid";
export type IngestionMode = "live" | "historical" | "simulation";
export type MeasurementKind =
  | "air_temperature"
  | "relative_humidity"
  | "pm2_5"
  | "wind_speed"
  | "soil_moisture";
export type Measurement = {
  kind: string;
  measuredValue: string;
  unit: string;
  measuredAt: string | null;
  quality?: Quality;
};
export type Provenance = {
  attribution: string | null;
  licenseNote: string | null;
  limitations: string[];
  acquisitionMethod: string | null;
};
export type LocationInfo = {
  hasCoordinates: boolean;
  unknownReason: string | null;
};
export type Observation = {
  id: string;
  organizationId: string;
  sourceId: string;
  sourceCode: string;
  sourceRecordId: string | null;
  domain: Domain;
  ingestionMode: IngestionMode;
  observedAt: string | null;
  unknownObservedTimeReason: string | null;
  receivedAt: string;
  quality: Quality;
  location: LocationInfo;
  provenance: Provenance;
  measurements: Measurement[];
};
export type Source = {
  id: string;
  code: string;
  name: string;
  acquisitionMethod: string;
  active: boolean;
};
export const sourceById = (id: string, sources: Source[]) =>
  sources.find((s) => s.id === id);
export const DOMAIN: Record<Domain, { label: string; short: string }> = {
  biodiversity: { label: "Keanekaragaman hayati", short: "Hayati" },
  environmental_risk: { label: "Risiko lingkungan", short: "Risiko lingk." },
};
export const QUALITY: Record<Quality, { label: string; desc: string }> = {
  unreviewed: {
    label: "Belum ditinjau",
    desc: "Belum melalui peninjauan kualitas. Bukan berarti salah atau benar.",
  },
  valid: {
    label: "Valid",
    desc: "Lolos peninjauan kualitas data. Bukan temuan ilmiah final.",
  },
  suspect: {
    label: "Meragukan",
    desc: "Ditandai perlu dicek ulang; jangan dipakai tanpa konteks.",
  },
  invalid: {
    label: "Tidak valid",
    desc: "Dinyatakan tidak layak pakai pada peninjauan kualitas.",
  },
};
export const MODE: Record<IngestionMode, string> = {
  live: "Terkini",
  historical: "Historis",
  simulation: "Simulasi",
};
export const KINDS: Record<
  MeasurementKind,
  { label: string; units: string[] }
> = {
  air_temperature: {
    label: "Suhu udara",
    units: ["°C", "°F", "K"],
  },
  relative_humidity: { label: "Kelembapan relatif", units: ["%"] },
  pm2_5: { label: "Partikulat PM2.5", units: ["µg/m³"] },
  wind_speed: { label: "Kecepatan angin", units: ["m/s", "km/j"] },
  soil_moisture: { label: "Kelembapan tanah", units: ["%"] },
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields: Record<string, string> = {},
  ) {
    super(code);
  }
}

type ApiObservation = {
  id: string;
  organizationId: string;
  source: { id: string; code: string };
  sourceRecordId: string | null;
  domain: Domain;
  ingestionMode: IngestionMode;
  observedAt: string | null;
  unknownObservedTimeReason: string | null;
  receivedAt: string;
  quality: Quality;
  location: LocationInfo;
  provenance: {
    acquisitionMethod: string | null;
    attribution: string | null;
    limitations: string[];
  };
  measurements?: Measurement[];
};
const transform = (o: ApiObservation): Observation => ({
  id: o.id,
  organizationId: o.organizationId,
  sourceId: o.source.id,
  sourceCode: o.source.code,
  sourceRecordId: o.sourceRecordId,
  domain: o.domain,
  ingestionMode: o.ingestionMode,
  observedAt: o.observedAt,
  unknownObservedTimeReason: o.unknownObservedTimeReason,
  receivedAt: o.receivedAt,
  quality: o.quality,
  location: o.location,
  provenance: {
    acquisitionMethod: o.provenance.acquisitionMethod,
    attribution: o.provenance.attribution,
    // WC-008 GET deliberately does not expose licenseNote.
    licenseNote: null,
    limitations: o.provenance.limitations,
  },
  measurements: o.measurements ?? [],
});
async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
    });
  } catch {
    throw new ApiError(503, "NETWORK_UNAVAILABLE");
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status || 502, "INVALID_SERVER_RESPONSE");
  }
  if (!response.ok) {
    const data =
      json && typeof json === "object" ? (json as { error?: unknown }) : {};
    throw new ApiError(
      response.status,
      typeof data.error === "string" ? data.error : "HTTP_ERROR",
    );
  }
  return json as T;
}
export type ListParams = {
  organizationId: string;
  domain?: Domain;
  sourceId?: string;
  quality?: Quality;
  receivedFrom?: string;
  receivedTo?: string;
  limit: number;
  offset: number;
};
export async function listObservations(p: ListParams) {
  const qs = new URLSearchParams({
    organizationId: p.organizationId,
    limit: String(p.limit),
    offset: String(p.offset),
  });
  if (p.domain) qs.set("domain", p.domain);
  if (p.sourceId) qs.set("sourceId", p.sourceId);
  if (p.quality) qs.set("quality", p.quality);
  if (p.receivedFrom) qs.set("receivedFrom", p.receivedFrom);
  if (p.receivedTo) qs.set("receivedTo", p.receivedTo);
  const data = await callApi<{
    items: ApiObservation[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/observations?${qs}`);
  return { ...data, items: data.items.map(transform) };
}
export async function summarize(organizationId: string) {
  const base: ListParams = { organizationId, limit: 5, offset: 0 };
  const [all, bio, risk, unreviewed] = await Promise.all([
    listObservations(base),
    listObservations({ ...base, limit: 1, domain: "biodiversity" }),
    listObservations({ ...base, limit: 1, domain: "environmental_risk" }),
    listObservations({ ...base, limit: 1, quality: "unreviewed" }),
  ]);
  return {
    total: all.total,
    biodiversity: bio.total,
    environmental_risk: risk.total,
    unreviewed: unreviewed.total,
    recent: all.items,
  };
}
export async function getObservation(id: string, organizationId: string) {
  const q = new URLSearchParams({ organizationId });
  const result = await callApi<{ observation: ApiObservation }>(
    `/api/observations/${encodeURIComponent(id)}?${q}`,
  );
  return transform(result.observation);
}
export type CreateInput = {
  organizationId: string;
  sourceId: string;
  sourceRecordId: string;
  domain: Domain;
  ingestionMode: IngestionMode;
  observedAt: string | null;
  unknownObservedTimeReason: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUnknownReason: string | null;
  provenance: {
    attribution: string;
    licenseNote: string | null;
    limitations: string[];
  };
  measurements: {
    kind: MeasurementKind;
    measuredValue: string;
    unit: string;
    measuredAt: string | null;
  }[];
};
export function createObservation(
  input: CreateInput,
): Promise<{ id: string; replayed: boolean }> {
  return callApi<{ id: string; replayed: boolean }>("/api/observations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
/** Re-export shared time formatting; all call sites provide explicit zone. */
export { fmtTs } from "./time";
