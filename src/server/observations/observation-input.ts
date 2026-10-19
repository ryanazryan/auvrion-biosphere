/** AB-WC-008 — Strict, server-side manual intake validation. No provider dependencies. */
export type ObservationDomain = "biodiversity" | "environmental_risk";
export type IngestionMode = "live" | "historical" | "simulation";
export type QualityFlag = "unreviewed" | "valid" | "suspect" | "invalid";

export type MeasurementInput = {
  kind: string;
  measuredValue: string;
  unit: string;
  measuredAt: string | null;
};

export type CreateObservationInput = {
  organizationId: string;
  sourceId: string;
  sourceRecordId: string;
  domain: ObservationDomain;
  ingestionMode: IngestionMode;
  observedAt: string | null;
  unknownObservedTimeReason: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUnknownReason: string | null;
  attribution: string | null;
  licenseNote: string | null;
  limitations: string[];
  measurements: MeasurementInput[];
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const recordPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const decimalPattern = /^-?(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function noExtraKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function optionalText(value: unknown, max = 255): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

export function parseTimestamp(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !timestampPattern.test(value))
    return undefined;
  const calendarDate = value.slice(0, 10);
  const calendarProbe = new Date(`${calendarDate}T12:00:00Z`);

  if (
    !Number.isFinite(calendarProbe.getTime()) ||
    calendarProbe.toISOString().slice(0, 10) !== calendarDate
  ) {
    return undefined;
  }

  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));

  if (hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return undefined;
  // Reject invalid calendar date rollover (e.g. February 30) when expressed in UTC.
  if (
    value.endsWith("Z") &&
    instant.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    return undefined;
  return instant.toISOString();
}

export function parseCreateObservationInput(
  value: unknown,
): ParseResult<CreateObservationInput> {
  if (
    !record(value) ||
    !noExtraKeys(value, [
      "organizationId",
      "sourceId",
      "sourceRecordId",
      "domain",
      "ingestionMode",
      "observedAt",
      "unknownObservedTimeReason",
      "latitude",
      "longitude",
      "locationUnknownReason",
      "provenance",
      "measurements",
    ])
  )
    return { ok: false, error: "INVALID_BODY_FIELDS" };

  if (!isUuid(value.organizationId) || !isUuid(value.sourceId)) {
    return { ok: false, error: "INVALID_ORGANIZATION_OR_SOURCE_ID" };
  }
  if (
    typeof value.sourceRecordId !== "string" ||
    !recordPattern.test(value.sourceRecordId)
  ) {
    return { ok: false, error: "SOURCE_RECORD_ID_REQUIRED" };
  }
  if (
    value.domain !== "biodiversity" &&
    value.domain !== "environmental_risk"
  ) {
    return { ok: false, error: "INVALID_DOMAIN" };
  }
  if (
    !["live", "historical", "simulation"].includes(String(value.ingestionMode))
  ) {
    return { ok: false, error: "INVALID_INGESTION_MODE" };
  }
  const observedAt = parseTimestamp(value.observedAt);
  const unknownObservedTimeReason = optionalText(
    value.unknownObservedTimeReason,
  );
  if (
    observedAt === undefined ||
    unknownObservedTimeReason === undefined ||
    (observedAt === null) === (unknownObservedTimeReason === null)
  ) {
    return { ok: false, error: "OBSERVED_TIME_OR_UNKNOWN_REASON_REQUIRED" };
  }

  const latitude =
    value.latitude === undefined || value.latitude === null
      ? null
      : value.latitude;
  const longitude =
    value.longitude === undefined || value.longitude === null
      ? null
      : value.longitude;
  const locationUnknownReason = optionalText(value.locationUnknownReason);
  if (
    locationUnknownReason === undefined ||
    (latitude === null) !== (longitude === null) ||
    (latitude === null) === (locationUnknownReason === null) ||
    (latitude !== null &&
      (typeof latitude !== "number" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90)) ||
    (longitude !== null &&
      (typeof longitude !== "number" ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180))
  ) {
    return { ok: false, error: "LOCATION_PAIR_OR_UNKNOWN_REASON_REQUIRED" };
  }

  const provenance = value.provenance ?? {};
  if (
    !record(provenance) ||
    !noExtraKeys(provenance, ["attribution", "licenseNote", "limitations"])
  ) {
    return { ok: false, error: "INVALID_PROVENANCE" };
  }
  const attribution = optionalText(provenance.attribution, 500);
  const licenseNote = optionalText(provenance.licenseNote, 500);
  if (attribution === undefined || licenseNote === undefined) {
    return { ok: false, error: "INVALID_PROVENANCE_TEXT" };
  }
  const rawLimitations = provenance.limitations ?? [];
  if (
    !Array.isArray(rawLimitations) ||
    rawLimitations.length > 10 ||
    rawLimitations.some(
      (item) => typeof item !== "string" || !item.trim() || item.length > 200,
    )
  ) {
    return { ok: false, error: "INVALID_LIMITATIONS" };
  }
  const limitations = rawLimitations.map((item: string) => item.trim());

  const rawMeasurements = value.measurements ?? [];
  if (
    !Array.isArray(rawMeasurements) ||
    rawMeasurements.length > 10 ||
    (value.domain === "biodiversity" && rawMeasurements.length > 0)
  ) {
    return { ok: false, error: "INVALID_MEASUREMENTS_FOR_DOMAIN" };
  }
  const measurements: MeasurementInput[] = [];
  for (const item of rawMeasurements) {
    if (
      !record(item) ||
      !noExtraKeys(item, ["kind", "measuredValue", "unit", "measuredAt"])
    ) {
      return { ok: false, error: "INVALID_MEASUREMENT" };
    }
    const kind = optionalText(item.kind, 100);
    const unit = optionalText(item.unit, 50);
    const measuredAt = parseTimestamp(item.measuredAt);
    const raw =
      typeof item.measuredValue === "number"
        ? String(item.measuredValue)
        : item.measuredValue;
    if (
      !kind ||
      !unit ||
      measuredAt === undefined ||
      typeof raw !== "string" ||
      !decimalPattern.test(raw) ||
      !Number.isFinite(Number(raw))
    ) {
      return { ok: false, error: "INVALID_MEASUREMENT_VALUE" };
    }
    measurements.push({ kind, unit, measuredAt, measuredValue: raw });
  }
  return {
    ok: true,
    value: {
      organizationId: value.organizationId,
      sourceId: value.sourceId,
      sourceRecordId: value.sourceRecordId,
      domain: value.domain,
      ingestionMode: value.ingestionMode as IngestionMode,
      observedAt,
      unknownObservedTimeReason,
      latitude: latitude as number | null,
      longitude: longitude as number | null,
      locationUnknownReason,
      attribution,
      licenseNote,
      limitations,
      measurements,
    },
  };
}

export type ListObservationsInput = {
  organizationId: string;
  domain?: ObservationDomain;
  sourceId?: string;
  quality?: QualityFlag;
  receivedFrom?: string;
  receivedTo?: string;
  limit: number;
  offset: number;
};

export function parseListObservationsInput(
  params: URLSearchParams,
): ParseResult<ListObservationsInput> {
  const allowed = [
    "organizationId",
    "domain",
    "sourceId",
    "quality",
    "receivedFrom",
    "receivedTo",
    "limit",
    "offset",
  ];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      return { ok: false, error: "INVALID_FILTER" };
  }
  const organizationId = params.get("organizationId");
  if (!isUuid(organizationId))
    return { ok: false, error: "INVALID_ORGANIZATION_ID" };
  const domain = params.get("domain");
  const sourceId = params.get("sourceId");
  const quality = params.get("quality");
  if (
    domain !== null &&
    domain !== "biodiversity" &&
    domain !== "environmental_risk"
  )
    return { ok: false, error: "INVALID_DOMAIN" };
  if (sourceId !== null && !isUuid(sourceId))
    return { ok: false, error: "INVALID_SOURCE_ID" };
  if (
    quality !== null &&
    !["unreviewed", "valid", "suspect", "invalid"].includes(quality)
  )
    return { ok: false, error: "INVALID_QUALITY" };
  const receivedFrom = parseTimestamp(params.get("receivedFrom"));
  const receivedTo = parseTimestamp(params.get("receivedTo"));
  if (
    receivedFrom === undefined ||
    receivedTo === undefined ||
    (receivedFrom && receivedTo && receivedFrom > receivedTo)
  )
    return { ok: false, error: "INVALID_RECEIVED_RANGE" };
  const limitRaw = params.get("limit") ?? "25";
  const offsetRaw = params.get("offset") ?? "0";
  if (!/^(?:0|[1-9]\d*)$/.test(limitRaw) || !/^(?:0|[1-9]\d*)$/.test(offsetRaw))
    return { ok: false, error: "INVALID_PAGINATION" };
  const limit = Number(limitRaw);
  const offset = Number(offsetRaw);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000
  ) {
    return { ok: false, error: "INVALID_PAGINATION" };
  }
  return {
    ok: true,
    value: {
      organizationId,
      domain: (domain ?? undefined) as ObservationDomain | undefined,
      sourceId: sourceId ?? undefined,
      quality: (quality ?? undefined) as QualityFlag | undefined,
      receivedFrom: receivedFrom ?? undefined,
      receivedTo: receivedTo ?? undefined,
      limit,
      offset,
    },
  };
}
