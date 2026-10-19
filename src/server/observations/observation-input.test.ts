import { describe, expect, it } from "vitest";
import {
  parseCreateObservationInput,
  parseListObservationsInput,
} from "./observation-input";

const org = "00000000-0000-4000-8000-000000000001";
const source = "00000000-0000-4000-8000-000000000002";

function valid() {
  return {
    organizationId: org,
    sourceId: source,
    sourceRecordId: "manual-unique-001",
    domain: "biodiversity",
    ingestionMode: "historical",
    observedAt: "2026-10-18T08:00:00+08:00",
    locationUnknownReason: "not-recorded",
  };
}

describe("AB-WC-008 manual observation contract", () => {
  it("accepts biodiversity intake with explicitly unknown location", () => {
    const parsed = parseCreateObservationInput(valid());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.observedAt).toBe("2026-10-18T00:00:00.000Z");
    expect(parsed.value.locationUnknownReason).toBe("not-recorded");
    expect(parsed.value.measurements).toEqual([]);
  });

  it("rejects invalid calendar rollover with timezone offset", () => {
    expect(
      parseCreateObservationInput({
        ...valid(),
        observedAt: "2026-02-30T08:00:00+08:00",
      }).ok,
    ).toBe(false);
  });

  it("accepts risk measurements with decimal precision", () => {
    const parsed = parseCreateObservationInput({
      ...valid(),
      domain: "environmental_risk",
      measurements: [
        { kind: "temperature", measuredValue: "30.500000", unit: "celsius" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(parsed.value.measurements[0]?.measuredValue).toBe("30.500000");
  });

  it("rejects client controlled review status", () => {
    expect(
      parseCreateObservationInput({ ...valid(), quality: "valid" }),
    ).toEqual({ ok: false, error: "INVALID_BODY_FIELDS" });
  });

  it("requires the stable idempotency identifier", () => {
    const missing: Record<string, unknown> = { ...valid() };
    delete missing.sourceRecordId;
    expect(parseCreateObservationInput(missing)).toEqual({
      ok: false,
      error: "SOURCE_RECORD_ID_REQUIRED",
    });
  });

  it("rejects missing both timestamp and unknown-time explanation", () => {
    const missing: Record<string, unknown> = { ...valid() };
    delete missing.observedAt;
    expect(parseCreateObservationInput(missing)).toEqual({
      ok: false,
      error: "OBSERVED_TIME_OR_UNKNOWN_REASON_REQUIRED",
    });
  });

  it("rejects timezone-free timestamps", () => {
    expect(
      parseCreateObservationInput({
        ...valid(),
        observedAt: "2026-10-18T08:00:00",
      }).ok,
    ).toBe(false);
  });

  it("rejects forged coordinate pairs", () => {
    expect(
      parseCreateObservationInput({
        ...valid(),
        latitude: -2.5,
        longitude: 114.4,
      }).ok,
    ).toBe(false);
    expect(
      parseCreateObservationInput({
        ...valid(),
        latitude: -2.5,
        locationUnknownReason: null,
      }).ok,
    ).toBe(false);
    expect(
      parseCreateObservationInput({
        ...valid(),
        latitude: -99,
        longitude: 114,
        locationUnknownReason: null,
      }).ok,
    ).toBe(false);
  });

  it("accepts valid coordinate pair while location reason is absent", () => {
    const parsed = parseCreateObservationInput({
      ...valid(),
      latitude: -2.5,
      longitude: 114.4,
      locationUnknownReason: null,
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects measurements on the biodiversity domain", () => {
    expect(
      parseCreateObservationInput({
        ...valid(),
        measurements: [{ kind: "temp", measuredValue: 30, unit: "C" }],
      }).ok,
    ).toBe(false);
  });

  it("rejects invalid decimal precision and fields", () => {
    expect(
      parseCreateObservationInput({
        ...valid(),
        domain: "environmental_risk",
        measurements: [{ kind: "pH", measuredValue: "7.1234567", unit: "pH" }],
      }).ok,
    ).toBe(false);
    expect(
      parseCreateObservationInput({
        ...valid(),
        domain: "environmental_risk",
        measurements: [
          { kind: "pH", measuredValue: 7, unit: "pH", extra: true },
        ],
      }).ok,
    ).toBe(false);
  });

  it("limits pagination and rejects duplicate or unexpected filter keys", () => {
    expect(
      parseListObservationsInput(
        new URLSearchParams({ organizationId: org, limit: "51" }),
      ).ok,
    ).toBe(false);
    expect(
      parseListObservationsInput(
        new URLSearchParams(`organizationId=${org}&organizationId=${org}`),
      ).ok,
    ).toBe(false);
    expect(
      parseListObservationsInput(
        new URLSearchParams({ organizationId: org, any: "oops" }),
      ).ok,
    ).toBe(false);
  });

  it("accepts scoped list filters", () => {
    const result = parseListObservationsInput(
      new URLSearchParams({
        organizationId: org,
        domain: "biodiversity",
        quality: "unreviewed",
        limit: "10",
        offset: "0",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value).toMatchObject({
        organizationId: org,
        domain: "biodiversity",
        limit: 10,
      });
  });
});
