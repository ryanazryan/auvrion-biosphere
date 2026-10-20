"use client";

import type { Domain, Quality } from "@/figma-operator/observations";

export type GisPoint = { type: "Point"; coordinates: [number, number] };
export type GisRecord = {
  id: string;
  organizationId: string;
  source: { id: string; code: string };
  domain: Domain;
  quality: Quality;
  ingestionMode: "live" | "historical" | "simulation";
  observedAt: string | null;
  receivedAt: string;
  location: {
    hasCoordinates: boolean;
    unknownReason: string | null;
    disclosure?: string;
    point?: GisPoint | null;
  };
};
export type GisResult = {
  items: GisRecord[];
  total: number;
  limit: number;
  offset: number;
};
export type GisZone = {
  id: string;
  code: string;
  name: string;
  geometry: null;
};
export type GisFilter = {
  organizationId: string;
  domain?: Domain;
  sourceId?: string;
  quality?: Quality;
  zoneId?: string;
  receivedFrom?: string;
  receivedTo?: string;
  limit: number;
  offset: number;
};

export class GisApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GisApiError(503, "NETWORK_UNAVAILABLE");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new GisApiError(response.status || 502, "INVALID_RESPONSE");
  }
  if (!response.ok) {
    const obj =
      data && typeof data === "object" ? (data as { error?: unknown }) : {};
    throw new GisApiError(
      response.status,
      typeof obj.error === "string" ? obj.error : "REQUEST_FAILED",
    );
  }
  return data as T;
}

export function listGisObservations(params: GisFilter, signal?: AbortSignal) {
  const qs = new URLSearchParams({
    organizationId: params.organizationId,
    limit: String(params.limit),
    offset: String(params.offset),
  });
  for (const key of [
    "domain",
    "sourceId",
    "quality",
    "zoneId",
    "receivedFrom",
    "receivedTo",
  ] as const) {
    const value = params[key];
    if (value) qs.set(key, value);
  }
  return get<GisResult>(`/api/gis/observations?${qs.toString()}`, signal);
}

export async function listGisZones(
  organizationId: string,
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({ organizationId });
  const result = await get<{ items: GisZone[] }>(
    `/api/gis/zones?${qs.toString()}`,
    signal,
  );
  return result.items;
}

/** Never infer coordinates from an ID, zone label, or source. */
export function approvedPoint(row: GisRecord): [number, number] | null {
  if (!row.location.hasCoordinates) return null;
  const p = row.location.point;
  if (
    p?.type !== "Point" ||
    !Array.isArray(p.coordinates) ||
    p.coordinates.length !== 2
  )
    return null;
  const [lon, lat] = p.coordinates;
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lon < -180 ||
    lon > 180 ||
    lat < -90 ||
    lat > 90
  )
    return null;
  return [lon, lat];
}
