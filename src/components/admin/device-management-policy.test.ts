import { describe, expect, it } from "vitest";
import {
  filterDeviceRows,
  provisionableSources,
} from "./device-management-policy";

describe("Admin IoT device management projections", () => {
  it("excludes inactive sources and sources bound to both active and revoked devices", () => {
    const sources = [
      { id: "available", isActive: true },
      { id: "inactive", isActive: false },
      { id: "already-active", isActive: true },
      { id: "already-revoked", isActive: true },
    ];
    const devices = [
      { sourceId: "already-active" },
      { sourceId: "already-revoked" },
    ];
    expect(provisionableSources(sources, devices)).toEqual([
      { id: "available", isActive: true },
    ]);
  });

  it("filters by registration status, name, source code and device ID", () => {
    const devices = [
      {
        id: "alpha",
        status: "active" as const,
        sourceCode: "listen-01",
        sourceLabel: "Hutan A",
      },
      {
        id: "beta",
        status: "revoked" as const,
        sourceCode: "listen-02",
        sourceLabel: "Hutan B",
      },
    ];
    expect(filterDeviceRows(devices, "  LiStEn-01  ", "all")).toEqual([
      devices[0],
    ]);
    expect(filterDeviceRows(devices, "beta", "revoked")).toEqual([devices[1]]);
    expect(filterDeviceRows(devices, "hutan", "active")).toEqual([devices[0]]);
    expect(filterDeviceRows(devices, "", "all")).toHaveLength(2);
  });
});
